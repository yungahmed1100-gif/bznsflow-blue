// Expenses: what left the business, dated by the owner in business time.
// Voided, never deleted, so a mistaken entry stays visible in the history.
import { owned } from '../blueTenant.js';
import { isMinor } from './money.js';
import { ok, fail, bounded, REQUEST_ID, byRequest, nextNumber } from './shared.js';
import { periodRange, validDate, dayNoon, timezoneOr } from './period.js';

export const EXPENSE_METHODS = ['cash', 'card', 'bank_transfer', 'other'];
const LIST_LIMIT = 200;

export async function businessTimezone(ctx, accountId) {
  const row = await ctx.db.query('blueBusinessSettings').withIndex('by_account', q => q.eq('accountId', accountId)).unique();
  return timezoneOr(row?.timezone);
}
export const publicExpense = e => ({ id: e._id, number: e.number, category: e.category, amountMinor: e.amountMinor, vatMinor: e.vatMinor, vendor: e.vendor || '', method: e.method,
  paidOn: e.paidOn, note: e.note || '', voided: e.voided, createdAt: e.createdAt });

async function createExpense(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  const replay = await byRequest(ctx, 'hasibExpenses', accountId, a.requestId);
  if (replay) return ok(publicExpense(replay));
  if (a.category === 'waste' && tenant.pack.modules.recipes === 'available') return fail('record_waste_in_stock');
  const categories = tenant.pack.expenseCategories.map(c => c.key);
  const vatMinor = a.vatMinor ?? 0, vendor = bounded(a.vendor ?? '', 80), note = bounded(a.note ?? '', 200);
  if (!categories.includes(a.category) || !isMinor(a.amountMinor) || !a.amountMinor || !isMinor(vatMinor) || vatMinor > a.amountMinor
    || !EXPENSE_METHODS.includes(a.method) || !validDate(a.paidOn) || vendor === null || note === null) return fail('invalid_expense');
  const tz = await businessTimezone(ctx, accountId);
  const number = await nextNumber(ctx, accountId, 'expense');
  const id = await ctx.db.insert('hasibExpenses', { accountId, requestId: a.requestId, number, category: a.category, amountMinor: a.amountMinor, vatMinor,
    ...(vendor ? { vendor } : {}), method: a.method, paidOn: a.paidOn, paidAt: dayNoon(a.paidOn, tz), ...(note ? { note } : {}), voided: false, createdAt: now });
  return ok(publicExpense(await ctx.db.get(id)));
}

export async function expensesIn(ctx, accountId, range, limit = LIST_LIMIT) {
  const rows = await ctx.db.query('hasibExpenses').withIndex('by_account_paid', q => q.eq('accountId', accountId).gte('paidAt', range.from).lt('paidAt', range.to)).order('desc').take(limit + 1);
  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

export async function executeExpenses(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (a.operation === 'expense_create') return createExpense(ctx, tenant, a, now);
  if (a.operation === 'expenses') {
    let range;
    try { range = periodRange(a.period || 'month', now, await businessTimezone(ctx, accountId)); } catch (e) { return fail(e.reason || 'invalid_period'); }
    const { rows, truncated } = await expensesIn(ctx, accountId, range);
    return ok({ items: rows.map(publicExpense), truncated, range: { fromDate: range.fromDate, toDate: range.toDate } });
  }
  if (a.operation === 'expense_void') {
    const row = await owned(ctx, a.expenseId, accountId, 'hasibExpenses');
    if (!row) return fail('expense_not_found');
    if (!row.voided) await ctx.db.patch(row._id, { voided: true, voidedAt: now });
    return ok(publicExpense({ ...row, voided: true }));
  }
  return null;
}
