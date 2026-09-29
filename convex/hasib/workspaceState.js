import { ok, fail } from './shared.js';

const norm = value => String(value || '').trim().toLowerCase();
const publicMember = row => ({ id: row._id, accountId: row.accountId || null, email: row.email, status: row.status, operationalRole: row.operationalRole || 'service_advisor', invitedAt: row.invitedAt, resentAt: row.resentAt || null,
  activatedAt: row.activatedAt || null, revokedAt: row.revokedAt || null });

export async function workspaceForManager(ctx, managerAccountId, now) {
  let row = await ctx.db.query('ascendWorkspaces').withIndex('by_manager', q => q.eq('managerAccountId', managerAccountId)).unique();
  if (!row) row = await ctx.db.get(await ctx.db.insert('ascendWorkspaces', { managerAccountId, employeeLimit: 5, createdAt: now, updatedAt: now }));
  return row;
}

export async function actorWorkspace(ctx, managerAccountId, actorAccountId, now) {
  if (!actorAccountId || String(actorAccountId) === String(managerAccountId)) {
    return { workspace: await workspaceForManager(ctx, managerAccountId, now), role: 'manager', actorAccountId: managerAccountId };
  }
  const member = await ctx.db.query('ascendWorkspaceMembers').withIndex('by_account', q => q.eq('accountId', actorAccountId)).unique();
  if (!member || member.status !== 'active') return null;
  const workspace = await ctx.db.get(member.workspaceId);
  if (!workspace || String(workspace.managerAccountId) !== String(managerAccountId)) return null;
  return { workspace, member, role: 'employee', operationalRole: member.operationalRole || 'service_advisor', actorAccountId };
}

export async function workspaceContainsAccount(ctx, workspace, accountId) {
  if (!accountId) return false;
  if (String(workspace.managerAccountId) === String(accountId)) return true;
  const member = await ctx.db.query('ascendWorkspaceMembers').withIndex('by_account', q => q.eq('accountId', accountId)).unique();
  return String(member?.workspaceId) === String(workspace._id) && member.status === 'active';
}

export async function activatePendingInvitation(ctx, account, now) {
  const invite = await ctx.db.query('ascendWorkspaceMembers').withIndex('by_email', q => q.eq('email', norm(account.email))).unique();
  if (invite?.status !== 'pending') return null;
  const existing = await ctx.db.query('ascendWorkspaceMembers').withIndex('by_account', q => q.eq('accountId', account._id)).unique();
  // A configured owner workspace is never silently converted into an employee.
  if (account.draftHash || (existing && existing._id !== invite._id && existing.status === 'active')) return null;
  await ctx.db.patch(invite._id, { accountId: account._id, status: 'active', activatedAt: now, updatedAt: now });
  return invite.workspaceId;
}

export async function executeTeam(ctx, tenant, actor, a, now) {
  if (!['team_list', 'team_invite', 'team_resend', 'team_revoke'].includes(a.operation)) return null;
  if (actor.role !== 'manager') return fail('manager_required');
  const workspace = actor.workspace;
  const rows = await ctx.db.query('ascendWorkspaceMembers').withIndex('by_workspace', q => q.eq('workspaceId', workspace._id)).take(20);
  if (a.operation === 'team_list') return ok({ limit: workspace.employeeLimit, members: rows.map(publicMember) });
  if (a.operation === 'team_invite') {
    const email = norm(a.email);
    const operationalRole = ['service_advisor', 'technician'].includes(a.operationalRole) ? a.operationalRole : 'service_advisor';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail('invalid_email');
    if (rows.filter(row => row.status !== 'revoked').length >= workspace.employeeLimit) return fail('team_limit');
    const account = await ctx.db.query('accounts').withIndex('by_email', q => q.eq('email', email)).unique();
    if (account?.draftHash) return fail('employee_owns_workspace');
    const other = await ctx.db.query('ascendWorkspaceMembers').withIndex('by_email', q => q.eq('email', email)).unique();
    if (other && other.status !== 'revoked') return fail('employee_already_member');
    let id;
    if (other) { await ctx.db.replace(other._id, { workspaceId: workspace._id, email, status: 'pending', operationalRole, invitedAt: now, updatedAt: now }); id = other._id; }
    else id = await ctx.db.insert('ascendWorkspaceMembers', { workspaceId: workspace._id, email, status: 'pending', operationalRole, invitedAt: now, updatedAt: now });
    await audit(ctx, tenant, actor, 'team_invited', 'member', id, now);
    return ok(publicMember(await ctx.db.get(id)));
  }
  const member = rows.find(row => String(row._id) === String(a.memberId));
  if (!member) return fail('member_not_found');
  if (a.operation === 'team_resend') {
    if (member.status !== 'pending') return fail('member_not_pending');
    await ctx.db.patch(member._id, { resentAt: now, updatedAt: now });
    await audit(ctx, tenant, actor, 'team_invitation_resent', 'member', member._id, now);
    return ok(publicMember(await ctx.db.get(member._id)));
  }
  if (member.status === 'revoked') return ok(publicMember(member));
  await ctx.db.patch(member._id, { status: 'revoked', revokedAt: now, updatedAt: now });
  if (member.accountId) {
    const sessions = await ctx.db.query('sessions').withIndex('by_account', q => q.eq('accountId', member.accountId)).take(50);
    for (const session of sessions) await ctx.db.delete(session._id);
  }
  await audit(ctx, tenant, actor, 'team_member_revoked', 'member', member._id, now);
  return ok(publicMember(await ctx.db.get(member._id)));
}

export async function audit(ctx, tenant, actor, action, entityType, entityId, now, details) {
  await ctx.db.insert('ascendActivity', { accountId: tenant.accountId, workspaceId: actor.workspace._id, actorAccountId: actor.actorAccountId,
    actorRole: actor.role, action, entityType, entityId: String(entityId), ...(details ? { details } : {}), at: now });
}
