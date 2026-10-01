// Three configured measures, calculated from owner records. No inferred clinical dates.
import { settingsFor } from './shared.js';
import { orderProfit } from './profit.js';
import { publicJob } from './jobsState.js';
import { businessDate, addDays } from './period.js';
const DAY = 86400000, SCAN = 3000;
const sum = (rows, fn) => rows.reduce((n, r) => n + fn(r), 0);
const active = r => !['cancelled', 'returned'].includes(r.status);
const completed = r => ['completed', 'delivered'].includes(r.status);
/** Phones age per IMEI (lots are consumed oldest-first whichever unit sold); other stock ages by lot. */
async function agedTechUnits(ctx, accountId, agingLots, cutoff) {
  const items = await ctx.db.query('hasibItems').withIndex('by_account_archived_updated', q => q.eq('accountId', accountId).eq('archived', false)).take(SCAN);
  const liveItems = new Set(items.map(i => String(i._id))), serializedItems = new Set(items.filter(i => i.serialized).map(i => String(i._id)));
  let aged = 0;
  const variantItem = new Map();
  for (const lot of agingLots) {
    if (!variantItem.has(lot.variantId)) variantItem.set(lot.variantId, String((await ctx.db.get(lot.variantId))?.itemId));
    const itemId = variantItem.get(lot.variantId);
    if (liveItems.has(itemId) && !serializedItems.has(itemId)) aged += lot.remainingQty;
  }
  for (const item of items.filter(i => i.serialized)) {
    for (const variant of await ctx.db.query('hasibVariants').withIndex('by_item', q => q.eq('itemId', item._id)).take(250)) {
      if (variant.archived) continue;
      const units = await ctx.db.query('hasibSerials').withIndex('by_variant_status', q => q.eq('variantId', variant._id).eq('status', 'in_stock')).take(500);
      aged += units.filter(u => u.accountId === accountId && u.receivedAt <= cutoff).length;
    }
  }
  return aged;
}
export async function industryMetrics(ctx, tenant, now, range, food) {
  const { accountId, pack } = tenant, settings = await settingsFor(ctx, accountId);
  const values = {}, actions = [];
  // Newest first: a busy shop's oldest rows must never crowd out this period's.
  const scan = (table, index = 'by_account_created') => ctx.db.query(table).withIndex(index, q => q.eq('accountId', accountId)).order('desc').take(SCAN);
  const put = (id, value, format = 'number', detail) => { values[id] = { id, value, format, ...(detail ? { detail } : {}) }; };
  const orders = await scan('hasibOrders');
  const sold = orders.filter(o => completed(o) && o.createdAt >= range.from && o.createdAt < range.to);
  if (['retail','retail-tech'].includes(pack.id)) {
    const cutoff = now - (settings.unsoldDays ?? 60) * DAY;
    const lots = await scan('hasibStockLots'), aging = lots.filter(l => l.remainingQty > 0 && l.createdAt <= cutoff);
    // A sale counts once stock has left, as in Insights: confirmed onwards, never pending or reversed.
    const inPeriod = await ctx.db.query('hasibOrders').withIndex('by_account_created', q => q.eq('accountId', accountId).gte('createdAt', range.from).lt('createdAt', range.to)).take(SCAN);
    const sales = inPeriod.filter(o => active(o) && o.status !== 'pending');
    if (pack.id === 'retail') put('unsold_stock', sum(aging, l => l.remainingQty));
    else put('unsold_stock', await agedTechUnits(ctx, accountId, aging, cutoff));
    if (pack.id === 'retail') {
      const variants = new Map();
      for (const o of sales) for (const l of o.lines) if (l.variantId) {
        const old = variants.get(l.variantId) || { qty: 0, name: l.name };
        variants.set(l.variantId, { ...old, qty: old.qty + l.qty });
      }
      const best = [...variants.values()].sort((a,b) => b.qty-a.qty)[0];
      put('best_variant', best?.qty ?? null, 'number', best?.name);
      const requests = await scan('hasibProductRequests');
      put('product_requests', requests.filter(r => r.status === 'waiting').length);
      const late = orders.filter(o => active(o) && !completed(o) && o.fulfilment?.dueAt < now);
      if (late.length) actions.push({ id:'late_alterations',textEn:`${late.length} orders are past their promised time`,textAr:`${late.length} طلبات تجاوزت الموعد المحدد`,actionEn:'Open late order',actionAr:'افتح الطلب المتأخر',go:['orders',{order:late[0]._id}] });
    } else {
      const deviceLines = sales.flatMap(o => orderProfit(o).lines).filter(x => x.l.serialized);
      put('device_profit', deviceLines.length && deviceLines.every(x => x.costKnown) ? Math.round(sum(deviceLines,x=>x.revenue-x.cost)/sum(deviceLines,x=>x.l.qty)) : null, 'money');
      const repairs = await scan('hasibRepairs');
      // Ready repairs are finished work, listed once under Needs you; overdue means still being worked on.
      put('overdue_repairs', repairs.filter(r => !['ready','collected','cancelled'].includes(r.status) && r.dueAt < now).length);
    }
  }
  if (['restaurant','cafe','cakes'].includes(pack.id)) {
    put('waste_cost', food?.wasteMinor ?? null,'money');
    const dish = food?.menu?.[0];
    put('dish_profit', dish?.contributionMinor ?? null,'money',dish?.name);
    put('drink_profit', dish?.contributionMinor ?? null,'money',dish?.name);
    const channel = food?.channels?.[0];
    put('channel_profit',channel?.contributionMinor ?? null,'money',channel?.channel);
    const waste = (await scan('hasibWaste','by_account_at')).filter(w=>w.at>=range.from && w.at<range.to);
    put('remake_waste',sum(waste.filter(w=>w.reason==='remake' || w.reason==='spoilage'),w=>w.costMinor),'money');
    const low = await ctx.db.query('hasibVariants').withIndex('by_account_low',q=>q.eq('accountId',accountId).eq('low',true)).take(3000);
    const ingredientRows = [];
    for (const variant of low.filter(v=>!v.archived)) { const item = await ctx.db.get(variant.itemId); if (item?.trackStock) ingredientRows.push(variant); }
    put('low_ingredients',ingredientRows.length);
    const batches = (await scan('hasibPrepBatches','by_account_at')).filter(b=>b.at>=range.from && b.at<range.to);
    const baked = sum(batches,b=>b.outputQty), bakedIds = new Set(batches.map(b=>b.outputVariantId));
    const soldQty = sum(sold.flatMap(o=>o.lines).filter(l=>bakedIds.has(l.variantId)),l=>l.qty);
    put('sold_baked',baked ? Math.round(soldQty/baked*100) : null,'percent');
    put('unsold_cost',sum(waste.filter(w=>['unsold','overproduction'].includes(w.reason)),w=>w.costMinor),'money');
    put('cakes_due',orders.filter(o=>active(o) && !completed(o) && o.fulfilment?.dueAt>=range.from && o.fulfilment.dueAt<range.to).length);
  }
  if (['beauty','dental','clinic','fitness','education'].includes(pack.id)) {
    const bookings = await scan('hasibBookings','by_account_start');
    const past = bookings.filter(b=>b.confirmedAt && b.endsAt<now && b.status!=='cancelled');
    put('missed_visits',past.filter(b=>b.status==='missed').length);
    put('missed_lessons',past.filter(b=>b.status==='missed').length);
    put('unconfirmed_visits',bookings.filter(b=>b.status==='scheduled' && b.startsAt>=range.from).length);
    const slots = new Map();
    for (const booking of bookings.filter(b=>b.startsAt>=range.from && b.startsAt<range.to && ['confirmed','arrived','completed'].includes(b.status))) {
      const key = `${booking.serviceId}:${[...booking.resourceIds].sort().join(',')}:${booking.startsAt}:${booking.endsAt}`; slots.set(key,booking);
    }
    put('booked_hours',sum([...slots.values()],b=>(b.endsAt-b.startsAt)/3600000));
    const visits = bookings.filter(b=>b.status==='completed'), counts = new Map();
    for (const b of visits) counts.set(b.contactId,(counts.get(b.contactId)||0)+1);
    put('return_visits',sum([...counts.values()],n=>Math.max(0,n-1)));
    const linked = new Set(bookings.filter(active).map(b=>b.orderId).filter(Boolean));
    put('unpaid_visits',sum(orders.filter(o=>linked.has(o._id)&&active(o)),o=>Math.max(0,o.totalMinor-o.paidMinor)),'money');
    const followups = await scan('hasibFollowups','by_account_due');
    put('followups_due',followups.filter(f=>f.status==='open'&&f.dueAt<=now).length);
    if (['fitness','education'].includes(pack.id)) {
      const members = await scan('hasibMemberships'), live = members.filter(m=>m.status==='active'&&m.startsAt<=now&&m.endsAt>now);
      put('active_members',live.length);
      put('absent_members',live.filter(m=>now-(m.lastAttendanceAt??m.startsAt)>=(settings.absenceDays??14)*DAY).length);
      put('renewals_due',members.filter(m=>m.status==='active'&&m.endsAt>=now&&m.endsAt<=now+7*DAY).length);
      put('lessons_remaining',sum(live.filter(m=>m.kind==='lessons'),m=>m.remainingCredits));
      const charges = new Set(members.map(m=>m.orderId).filter(Boolean));
      put('unpaid_fees',sum(orders.filter(o=>charges.has(o._id)&&active(o)),o=>Math.max(0,o.totalMinor-o.paidMinor)),'money');
    }
  }
  if (['automotive','cleaning','hvac','construction'].includes(pack.id)) {
    const jobs = await Promise.all((await scan('hasibJobs')).map(j=>publicJob(ctx,j,now))), live = jobs.filter(j=>active(j)&&j.status!=='completed');
    put('approval_jobs',jobs.filter(j=>j.status==='awaiting_approval').length);
    put('overdue_jobs',live.filter(j=>j.dueAt<now).length);
    const done = jobs.filter(j=>j.status==='completed');
    const profit = done.length && done.every(j=>j.recordedProfitMinor!==null) ? Math.round(sum(done,j=>j.recordedProfitMinor)/done.length) : null;
    put('job_profit',profit,'money');put('visit_profit',profit,'money');
    put('visits_due',live.filter(j=>j.dueAt<range.to).length);
    put('unfinished_checklists',sum(live,j=>j.unfinishedChecklist));
    const equipment = await scan('hasibEquipment');
    put('services_due',equipment.filter(e=>e.nextServiceAt!==undefined&&e.nextServiceAt<=now).length);
    put('repeat_faults',jobs.filter(j=>j.repeatOfId).length);
    put('budget_remaining',jobs.length && jobs.every(j=>j.budgetRemainingMinor!==null) ? sum(jobs,j=>j.budgetRemainingMinor) : null,'money');
    put('extra_approval',sum(live,j=>j.extras.filter(x=>!x.approved).length));
    put('payments_due',sum(jobs.flatMap(j=>j.milestones).filter(m=>!m.withheld&&m.dueAt<=now),m=>m.unpaidMinor),'money');
  }
  if (pack.id==='real-estate') {
    // Read from the deal pipeline (realEstateState.js); the old enquiry model is retired.
    const deals = await scan('realEstateOpportunities'), viewings = await scan('realEstateViewings','by_account_date'), commissions = await scan('realEstateCommissions');
    put('enquiries_waiting',deals.filter(d=>d.stage==='new').length);
    put('viewings_due',viewings.filter(v=>v.scheduledAt>=range.from&&v.scheduledAt<range.to&&['requested','confirmed'].includes(v.status)).length);
    const owed = new Set(commissions.filter(c=>c.status==='due').map(c=>String(c.orderId)));
    put('commission_owed',sum(orders.filter(o=>owed.has(String(o._id))&&active(o)),o=>Math.max(0,o.totalMinor-o.paidMinor)),'money');
  }
  return { industryMetrics: pack.todayMetrics.map(m=>({...m,...(values[m.id]||{value:null,format:'number'})})), industryActions: actions };
}

/** Suggestions need four complete prior matching weekdays; never create production. */
export async function bakingSuggestions(ctx, accountId, now, timezone) {
  const today=businessDate(now,timezone), dates=[7,14,21,28].map(n=>addDays(today,-n));
  const orders=await ctx.db.query('hasibOrders').withIndex('by_account_created',q=>q.eq('accountId',accountId).gte('createdAt',now-29*DAY)).take(3000);
  const batches=await ctx.db.query('hasibPrepBatches').withIndex('by_account_at',q=>q.eq('accountId',accountId).gte('at',now-29*DAY)).take(3000);
  const variants=[...new Set(batches.map(b=>b.outputVariantId))], items=[];
  for(const variantId of variants) {
    const days=dates.map(date=>({date, recorded:batches.some(b=>b.outputVariantId===variantId&&(b.producedOn||businessDate(b.at,timezone))===date),sold:sum(orders.filter(o=>completed(o)&&businessDate(o.createdAt,timezone)===date).flatMap(o=>o.lines).filter(l=>l.variantId===variantId),l=>l.qty)}));
    const variant=await ctx.db.get(variantId);
    const preorders=sum(orders.filter(o=>active(o)&&!completed(o)&&o.fulfilment?.dueAt&&businessDate(o.fulfilment.dueAt,timezone)===today).flatMap(o=>o.lines).filter(l=>l.variantId===variantId),l=>l.qty);
    const lots=await ctx.db.query('hasibStockLots').withIndex('by_variant_created',q=>q.eq('variantId',variantId)).take(2000);
    const sellable=sum(lots.filter(l=>l.accountId===accountId&&(!l.useBy||l.useBy>=today)),l=>l.remainingQty);
    items.push({variantId,suggestedQty:days.every(d=>d.recorded)?Math.max(0,Math.ceil(sum(days,d=>d.sold)/4)+preorders-Math.max(0,Math.min(variant.onHand,sellable))):null,preorders,sellable,days,suggestion:true});
  }
  return {items};
}
