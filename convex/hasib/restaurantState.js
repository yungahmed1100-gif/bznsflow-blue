// Restaurant controls: recipes, ingredient movements, waste, counts, receiving
// and prep batches. These sit on the existing stock ledger so food cost remains
// traceable to the same baisa-level movements as ordinary Hasib stock.
import { orderProfit } from './profit.js';
import { convertQuantity } from './units.js';
import { businessDate } from './period.js';
import { owned } from '../blueTenant.js';
import { periodRange, validDate } from './period.js';
import { businessTimezone, expensesIn } from './expensesState.js';
import { ok, fail, bounded, REQUEST_ID, byRequest, clampLimit, precheckStock, writeMove, settingsFor } from './shared.js';
import { isMinor } from './money.js';

const MAX_INGREDIENTS = 50, MAX_QTY = 1_000_000, REASONS = ['spoilage', 'prep_trim', 'overproduction', 'unsold', 'expired', 'failed_batch', 'damaged', 'remake', 'other'];
const qty = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_QTY ? value : null;
const wholeQty = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_QTY ? value : null;

async function activeVariant(ctx, accountId, variantId) {
  const variant = await owned(ctx, variantId, accountId, 'hasibVariants');
  if (!variant || variant.archived) return null;
  const item = await ctx.db.get(variant.itemId);
  return item && item.accountId === accountId && !item.archived ? { variant, item } : null;
}

async function recipeFor(ctx, menuVariantId) {
  return ctx.db.query('hasibRecipes').withIndex('by_menu_variant', q => q.eq('menuVariantId', menuVariantId)).first();
}

async function costRecipe(ctx, accountId, ingredients, yieldQty) {
  let total = 0;
  for (const ingredient of ingredients) {
    const found = await activeVariant(ctx, accountId, ingredient.variantId);
    if (!found || !found.item.trackStock || found.item.serialized || convertQuantity(ingredient.qty, ingredient.unit, found.item.unit) === null) return null;
    if (found.variant.costKnown === false) return null;
    total += convertQuantity(ingredient.qty, ingredient.unit, found.item.unit) * found.variant.costMinor;
  }
  return Math.round(total / yieldQty);
}

async function refreshRecipeCosts(ctx, accountId, variantIds, now) {
  const wanted = new Set(variantIds);
  const recipes = await ctx.db.query('hasibRecipes').withIndex('by_account_updated', q => q.eq('accountId', accountId)).take(2000);
  for (const recipe of recipes) {
    if (!recipe.ingredients.some(i => wanted.has(i.variantId))) continue;
    const costMinor = await costRecipe(ctx, accountId, recipe.ingredients, recipe.yieldQty);
    if (Number.isSafeInteger(costMinor)) await ctx.db.patch(recipe._id, { costMinor, updatedAt: now });
  }
}

export async function recipeStockChanges(ctx, accountId, lines, sign) {
  const changes = [];
  for (const line of lines) {
    for (const ingredient of line.recipeSnapshot || []) {
      const variant = await owned(ctx, ingredient.variantId, accountId, 'hasibVariants');
      if (!variant) throw new Error('recipe_ingredient_missing');
      changes.push({ variant, delta: sign * ingredient.qty * line.qty, unitCostMinor: ingredient.unitCostMinor, recipe: true });
    }
  }
  return changes;
}

export async function costLinesForRecipes(ctx, accountId, lines) {
  return Promise.all(lines.map(async line => {
    if (!line.variantId) return line;
    const recipe = await recipeFor(ctx, line.variantId);
    if (!recipe || recipe.accountId !== accountId) return line;
    const selected = line.modifierKeys || [];
    if (!Array.isArray(selected) || new Set(selected).size !== selected.length || selected.some(key => !(recipe.modifiers || []).some(m => m.key === key))) throw new Error('invalid_modifier');
    const ingredients = recipe.ingredients.map(i => ({ ...i }));
    let extraPrice = 0;
    for (const modifier of (recipe.modifiers || []).filter(m => selected.includes(m.key))) {
      extraPrice += modifier.priceMinor;
      for (const delta of modifier.ingredients) {
        const base = ingredients.find(i => i.variantId === delta.variantId);
        if (base) {
          const converted = convertQuantity(Math.abs(delta.qty), delta.unit, base.unit);
          if (converted === null) throw new Error('invalid_modifier');
          base.qty += Math.sign(delta.qty) * converted * recipe.yieldQty;
        } else ingredients.push({ ...delta, qty: delta.qty * recipe.yieldQty });
      }
    }
    if (ingredients.some(i => i.qty < 0)) throw new Error('invalid_modifier');
    const recipeSnapshot = [];
    for (const ingredient of ingredients.filter(i => i.qty > 0)) {
      const found = await activeVariant(ctx, accountId, ingredient.variantId);
      if (!found) throw new Error('recipe_ingredient_missing');
      const quantity = convertQuantity(ingredient.qty, ingredient.unit, found.item.unit);
      if (quantity === null) throw new Error('invalid_recipe_unit');
      recipeSnapshot.push({ variantId: ingredient.variantId, qty: quantity / recipe.yieldQty, unit: found.item.unit, unitCostMinor: found.variant.costMinor });
    }
    const costMinor = await costRecipe(ctx, accountId, ingredients.filter(i => i.qty > 0), recipe.yieldQty);
    return { ...line, unitPriceMinor: line.unitPriceMinor + (line.modifierPriceMinor === undefined ? extraPrice : 0), modifierPriceMinor: extraPrice, unitCostMinor: costMinor ?? 0, costKnown: costMinor !== null, recipeSnapshot };
  }));
}

const ingredientPublic = async (ctx, accountId, row) => {
  const found = await activeVariant(ctx, accountId, row.variantId);
  return { variantId: row.variantId, qty: row.qty, unit: row.unit, nameAr: found?.item.nameAr || '', nameEn: found?.item.nameEn || '', costMinor: found?.variant.costMinor || 0 };
};
const publicRecipe = async (ctx, accountId, row) => {
  const menu = await activeVariant(ctx, accountId, row.menuVariantId);
  const liveCost = await costRecipe(ctx, accountId, row.ingredients, row.yieldQty);
  return { id: row._id, version: row.version || 1, menuVariantId: row.menuVariantId, menuNameAr: menu?.item.nameAr || '', menuNameEn: menu?.item.nameEn || '', yieldQty: row.yieldQty,
    modifiers: row.modifiers || [], costMinor: Number.isSafeInteger(liveCost) ? liveCost : row.costMinor, ingredients: await Promise.all(row.ingredients.map(i => ingredientPublic(ctx, accountId, i))), updatedAt: row.updatedAt };
};

async function saveRecipe(ctx, tenant, a, now) {
  const { accountId } = tenant;
  const menu = await activeVariant(ctx, accountId, a.menuVariantId);
  const yieldQty = wholeQty(a.yieldQty);
  if (!menu || menu.item.trackStock || !yieldQty || !Array.isArray(a.ingredients) || !a.ingredients.length || a.ingredients.length > MAX_INGREDIENTS) return fail('invalid_recipe');
  const ingredients = a.ingredients.map(i => ({ variantId: i?.variantId, qty: qty(i?.qty), unit: bounded(i?.unit ?? '', 20) }));
  if (ingredients.some(i => !i.variantId || !i.qty || !i.unit) || new Set(ingredients.map(i => i.variantId)).size !== ingredients.length) return fail('invalid_recipe');
  if (ingredients.some(i => i.variantId === a.menuVariantId)) return fail('invalid_recipe');
  const costMinor = await costRecipe(ctx, accountId, ingredients, yieldQty);
  if (!Number.isSafeInteger(costMinor)) return fail('invalid_recipe');
  const current = await recipeFor(ctx, a.menuVariantId);
  if (current && a.version !== (current.version || 1)) return fail('recipe_conflict');
  const modifiers = [];
  if (a.modifiers !== undefined && (!Array.isArray(a.modifiers) || a.modifiers.length > 20)) return fail('invalid_modifier');
  for (const raw of a.modifiers || []) {
    const key = bounded(raw.key, 40), label = bounded(raw.label, 80);
    if (!key || !label || !isMinor(raw.priceMinor) || !Array.isArray(raw.ingredients) || raw.ingredients.length > 20 || modifiers.some(m => m.key === key)) return fail('invalid_modifier');
    const changes = [];
    for (const change of raw.ingredients) {
      const found = await activeVariant(ctx, accountId, change.variantId);
      if (!found || !found.item.trackStock || found.item.serialized || convertQuantity(Math.abs(change.qty), change.unit, found.item.unit) === null) return fail('invalid_modifier');
      changes.push({ variantId: change.variantId, qty: change.qty, unit: change.unit });
    }
    modifiers.push({ key, label, priceMinor: raw.priceMinor, ingredients: changes });
  }
  const row = { accountId, menuVariantId: a.menuVariantId, ingredients, modifiers, yieldQty, costMinor, version: (current?.version || 0) + 1, updatedAt: now };
  if (current) await ctx.db.replace(current._id, row); else await ctx.db.insert('hasibRecipes', row);
  return ok(await publicRecipe(ctx, accountId, await recipeFor(ctx, a.menuVariantId)));
}

async function listRecipes(ctx, accountId, a) {
  const rows = await ctx.db.query('hasibRecipes').withIndex('by_account_updated', q => q.eq('accountId', accountId)).order('desc').take(clampLimit(a.limit, 100));
  return ok({ items: await Promise.all(rows.map(r => publicRecipe(ctx, accountId, r))) });
}

async function createWaste(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  const replay = await byRequest(ctx, 'hasibWaste', accountId, a.requestId);
  if (replay) return ok({ id: replay._id, costMinor: replay.costMinor });
  const found = await activeVariant(ctx, accountId, a.variantId), quantity = qty(a.qty), note = bounded(a.note ?? '', 200);
  if (!found || !quantity || !REASONS.includes(a.reason) || note === null) return fail('invalid_waste');
  const settings = await settingsFor(ctx, accountId);
  if (!precheckStock([{ variant: found.variant, delta: -quantity }], settings.stockPolicy).ok) return fail('insufficient_stock');
  const costMinor = Math.round(quantity * found.variant.costMinor);
  const id = await ctx.db.insert('hasibWaste', { accountId, requestId: a.requestId, variantId: found.variant._id, qty: quantity, reason: a.reason, costMinor, ...(note ? { note } : {}), at: now });
  await writeMove(ctx, { accountId, variantId: found.variant._id, delta: -quantity, reason: 'waste', refType: 'waste', refId: id, unitCostMinor: found.variant.costMinor, note, requestId: a.requestId, now, lotAware: tenant.pack.modules.shelfLife === 'available' });
  return ok({ id, costMinor });
}

async function countStock(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  const replay = await byRequest(ctx, 'hasibInventoryCounts', accountId, a.requestId);
  if (replay) return ok({ id: replay._id, varianceQty: replay.varianceQty, costMinor: replay.costMinor });
  const found = await activeVariant(ctx, accountId, a.variantId), countedQty = a.countedQty, note = bounded(a.note ?? '', 200);
  if (!found || !Number.isFinite(countedQty) || countedQty < 0 || countedQty > MAX_QTY || note === null) return fail('invalid_count');
  const varianceQty = countedQty - found.variant.onHand, costMinor = Math.round(Math.abs(varianceQty) * found.variant.costMinor);
  const id = await ctx.db.insert('hasibInventoryCounts', { accountId, requestId: a.requestId, variantId: found.variant._id, expectedQty: found.variant.onHand, countedQty, varianceQty, costMinor, ...(note ? { note } : {}), at: now });
  await writeMove(ctx, { accountId, variantId: found.variant._id, delta: varianceQty, reason: 'count', refType: 'count', refId: id, unitCostMinor: found.variant.costMinor, note, requestId: a.requestId, now, lotAware: tenant.pack.modules.shelfLife === 'available' });
  return ok({ id, varianceQty, costMinor });
}

async function receiveStock(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  const replay = await byRequest(ctx, 'hasibSupplierInvoices', accountId, a.requestId);
  if (replay) return ok({ id: replay._id, totalMinor: replay.totalMinor });
  const vendor = bounded(a.vendor ?? '', 100), invoiceNumber = bounded(a.invoiceNumber ?? '', 60), receivedOn = bounded(a.receivedOn ?? '', 10);
  if (!vendor || !invoiceNumber && invoiceNumber === null || !receivedOn || !validDate(receivedOn) || !Array.isArray(a.lines) || !a.lines.length || a.lines.length > MAX_INGREDIENTS) return fail('invalid_receipt');
  const lines = [];
  for (const raw of a.lines) {
    const found = await activeVariant(ctx, accountId, raw?.variantId), quantity = qty(raw?.qty), unitCostMinor = raw?.unitCostMinor;
    if (!found || !found.item.trackStock || found.item.serialized || !quantity || !isMinor(unitCostMinor)) return fail('invalid_receipt');
    const useBy = raw?.useBy === undefined || raw.useBy === '' ? undefined : bounded(raw.useBy, 10);
    if (useBy !== undefined && (!useBy || !validDate(useBy))) return fail('invalid_receipt');
    lines.push({ variantId: found.variant._id, qty: quantity, unitCostMinor, totalMinor: Math.round(quantity * unitCostMinor), previousCostMinor: found.variant.costMinor, ...(useBy ? { useBy } : {}) });
  }
  const totalMinor = lines.reduce((n, l) => n + l.totalMinor, 0);
  const id = await ctx.db.insert('hasibSupplierInvoices', { accountId, requestId: a.requestId, vendor, ...(invoiceNumber ? { invoiceNumber } : {}), receivedOn, lines, totalMinor, createdAt: now });
  for (const line of lines) await writeMove(ctx, { accountId, variantId: line.variantId, delta: line.qty, reason: 'stock_in', refType: 'supplier_invoice', refId: id, unitCostMinor: line.unitCostMinor, requestId: a.requestId, now,
    lotAware: tenant.pack.modules.shelfLife === 'available', lot: { sourceType: 'supplier_invoice', sourceId: id, receivedOn, useBy: line.useBy } });
  await refreshRecipeCosts(ctx, accountId, lines.map(line => line.variantId), now);
  return ok({ id, totalMinor });
}

async function createBatch(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  const replay = await byRequest(ctx, 'hasibPrepBatches', accountId, a.requestId);
  if (replay) return ok({ id: replay._id, costMinor: replay.costMinor });
  const output = await activeVariant(ctx, accountId, a.outputVariantId), outputQty = qty(a.outputQty), note = bounded(a.note ?? '', 200);
  const producedOn = a.producedOn === undefined || a.producedOn === '' ? undefined : bounded(a.producedOn, 10);
  const useBy = a.useBy === undefined || a.useBy === '' ? undefined : bounded(a.useBy, 10);
  if ((producedOn && !validDate(producedOn)) || (useBy && !validDate(useBy)) || (producedOn && useBy && useBy < producedOn)) return fail('invalid_batch');
  if (!output || !output.item.trackStock || output.item.serialized || !outputQty || note === null || !Array.isArray(a.inputs) || !a.inputs.length || a.inputs.length > MAX_INGREDIENTS) return fail('invalid_batch');
  const inputs = [];
  for (const raw of a.inputs) {
    const found = await activeVariant(ctx, accountId, raw?.variantId);
    const quantity = found ? convertQuantity(raw?.qty, raw?.unit || found.item.unit, found.item.unit) : null;
    if (!found || !found.item.trackStock || found.item.serialized || !quantity) return fail('invalid_batch');
    if (found.variant._id === output.variant._id || inputs.some(i => i.variantId === found.variant._id)) return fail('invalid_batch');
    if (found.variant.costKnown === false) return fail('missing_input_cost');
    inputs.push({ variantId: found.variant._id, qty: quantity });
  }
  const changes = inputs.map(i => ({ variant: null, delta: -i.qty }));
  for (let i = 0; i < inputs.length; i++) changes[i].variant = (await activeVariant(ctx, accountId, inputs[i].variantId)).variant;
  const settings = await settingsFor(ctx, accountId), check = precheckStock(changes, settings.stockPolicy);
  if (!check.ok) return fail(check.reason);
  const costMinor = Math.round(inputs.reduce((n, i, index) => n + i.qty * changes[index].variant.costMinor, 0) / outputQty);
  const id = await ctx.db.insert('hasibPrepBatches', { accountId, requestId: a.requestId, outputVariantId: output.variant._id, outputQty, inputs, costMinor, ...(note ? { note } : {}), ...(producedOn ? { producedOn } : {}), ...(useBy ? { useBy } : {}), at: now });
  for (const input of inputs) await writeMove(ctx, { accountId, variantId: input.variantId, delta: -input.qty, reason: 'prep', refType: 'prep_batch', refId: id, now, lotAware: tenant.pack.modules.shelfLife === 'available' });
  await writeMove(ctx, { accountId, variantId: output.variant._id, delta: outputQty, reason: 'prep_output', refType: 'prep_batch', refId: id, unitCostMinor: costMinor, note, now,
    lotAware: tenant.pack.modules.shelfLife === 'available', lot: { sourceType: 'prep_batch', sourceId: id, receivedOn: producedOn, useBy } });
  return ok({ id, costMinor });
}

async function summaryRows(ctx, accountId, range, table, index = 'by_account_at') {
  return (await ctx.db.query(table).withIndex(index, q => q.eq('accountId', accountId).gte(index === 'by_account_at' ? 'at' : 'createdAt', range.from).lt(index === 'by_account_at' ? 'at' : 'createdAt', range.to)).take(3000));
}

export async function restaurantSummary(ctx, accountId, range, { sales = [], figures = {}, expenses = [] } = {}) {
  const recipes = await ctx.db.query('hasibRecipes').withIndex('by_account_updated', q => q.eq('accountId', accountId)).take(2000);
  const waste = await summaryRows(ctx, accountId, range, 'hasibWaste'), counts = await summaryRows(ctx, accountId, range, 'hasibInventoryCounts');
  if (!recipes.length && !sales.some(o => o.lines.some(l => l.variantId)) && !waste.length && !counts.length) return { foodCogsMinor: figures.cogsMinor ?? null, foodRevenueMinor: 0, foodCostBps: null, laborMinor: 0, laborCostBps: null, primeCostMinor: 0, primeCostBps: null, wasteMinor: 0, wasteQty: 0, wasteCount: 0, stockVarianceMinor: 0, theoreticalUsageMinor: 0, actualUsageMinor: null, usageVarianceMinor: null, usage: [], menu: [], channels: [] };
  const recipeIds = new Set(recipes.map(r => r.menuVariantId));
  const menu = new Map(), channels = new Map();
  let foodRevenueMinor = 0, foodCogsMinor = 0;
  for (const order of sales) {
    const channel = channels.get(order.channel) || { channel: order.channel, orders: 0, revenueMinor: 0, cogsMinor: 0, costKnown:true };
    channel.revenueMinor += orderProfit(order).delivery;
    channel.orders++; channel.feesMinor = (channel.feesMinor || 0) + (order.channelCostMinor || 0);
    for (const { l: line, revenue, cost, costKnown } of orderProfit(order).lines) {
      if (!recipeIds.has(line.variantId) && !line.recipeSnapshot && !line.tracked) continue;
      foodRevenueMinor += revenue; foodCogsMinor += cost; channel.revenueMinor += revenue; channel.cogsMinor += cost; channel.costKnown &&= costKnown;
      const row = menu.get(line.itemId) || { itemId: line.itemId, name: line.name, qty: 0, revenueMinor: 0, costMinor: 0, costKnown: true };
      menu.set(line.itemId, { ...row, qty: row.qty + line.qty, revenueMinor: row.revenueMinor + revenue, costMinor: row.costMinor + cost, costKnown: row.costKnown && costKnown });
    }
    channels.set(order.channel, channel);
  }
  const receipts = await summaryRows(ctx,accountId,range,'hasibSupplierInvoices','by_account_created');
  const priceIncreases = receipts.flatMap(r=>r.lines.filter(l=>l.previousCostMinor !== undefined && l.unitCostMinor > l.previousCostMinor).map(l=>({...l,vendor:r.vendor,receivedOn:r.receivedOn})));
  const wasteMinor = waste.reduce((n, r) => n + r.costMinor, 0), wasteQty = waste.reduce((n, r) => n + r.qty, 0);
  const stockVarianceMinor = counts.reduce((n, r) => n + r.costMinor, 0);
  const moves = await summaryRows(ctx, accountId, range, 'hasibStockMoves');
  const theoreticalUsageMinor = moves.filter(m => m.reason === 'sale' && m.refType === 'recipe_order' && m.delta < 0).reduce((n, m) => n + Math.round(Math.abs(m.delta) * (m.unitCostMinor || 0)), 0);
  // Physical consumption needs two owner counts. Receipts and transfers between
  // those counts change availability; a waste record is already part of consumption.
  const countHistory = await ctx.db.query('hasibInventoryCounts').withIndex('by_account_at', q => q.eq('accountId', accountId).lt('at', range.to)).take(3000);
  const ingredientIds = new Set(recipes.flatMap(r => r.ingredients.map(i => i.variantId)));
  const usage = [];
  for (const variantId of ingredientIds) {
    const pairs = countHistory.filter(c => c.variantId === variantId).sort((a, b) => a.at - b.at);
    const end = pairs.filter(c => c.at >= range.from).at(-1);
    const start = end && pairs.filter(c => c.at < end.at).at(-1);
    if (!start || !end) { usage.push({ variantId, actualQty: null, guidance: 'Record two physical counts' }); continue; }
    const between = await ctx.db.query('hasibStockMoves').withIndex('by_variant_at', q => q.eq('variantId', variantId).gt('at', start.at).lte('at', end.at)).take(3000);
    const supply = between.filter(m => m.accountId === accountId && ['stock_in', 'opening', 'prep_output', 'transfer', 'sale_reversal'].includes(m.reason)).reduce((n, m) => n + m.delta, 0);
    const variant = await ctx.db.get(variantId);
    const actualQty = start.countedQty + supply - end.countedQty;
    const expectedQty = -between.filter(m => m.accountId === accountId && ['sale', 'prep'].includes(m.reason)).reduce((n, m) => n + m.delta, 0);
    usage.push({ variantId, actualQty, expectedQty, costMinor: Math.round(actualQty * variant.costMinor), unitCostMinor: variant.costMinor, from: start.at, to: end.at });
  }
  const actualUsageMinor = usage.length && usage.every(r => r.actualQty !== null) ? usage.reduce((n, r) => n + r.costMinor, 0) : null;
  const revenueBase = Math.max(1, foodRevenueMinor), laborMinor = expenses.filter(e => !e.voided && ['salaries', 'labor'].includes(e.category)).reduce((n, e) => n + e.amountMinor - (e.vatMinor || 0), 0);
  const foodCostKnown=sales.every(o=>orderProfit(o).lines.every(l=>l.costKnown));
  const primeCostMinor = foodCostKnown?foodCogsMinor+laborMinor:null;
  const menuRows = [...menu.values()].map(r => ({ ...r, contributionMinor: r.costKnown ? r.revenueMinor - r.costMinor : null, foodCostBps: r.costKnown && r.revenueMinor > 0 ? Math.round((r.costMinor / r.revenueMinor) * 10000) : null })).sort((a, b) => b.revenueMinor - a.revenueMinor);
  return { priceIncreases, foodCogsMinor:foodCostKnown?foodCogsMinor:null, foodRevenueMinor, foodCostBps:foodCostKnown&&foodRevenueMinor>0?Math.round((foodCogsMinor/revenueBase)*10000):null, laborMinor, laborCostBps: foodRevenueMinor > 0 ? Math.round((laborMinor / revenueBase) * 10000) : null, primeCostMinor,
    primeCostBps:primeCostMinor!==null&&foodRevenueMinor>0?Math.round((primeCostMinor/revenueBase)*10000):null, wasteMinor, wasteQty, wasteCount: waste.length, stockVarianceMinor, theoreticalUsageMinor, actualUsageMinor, usage, usageVarianceMinor: actualUsageMinor === null ? null : usage.reduce((n, r) => n + Math.round((r.actualQty - r.expectedQty) * r.unitCostMinor), 0),
    menu: menuRows.slice(0, 20), channels: [...channels.values()].map(r => ({ ...r, contributionMinor: r.costKnown ? r.revenueMinor - r.cogsMinor - (r.feesMinor || 0) : null })) };
}

/** Small dated-stock view for Today and Stock. Lots are account-scoped and sorted FEFO. */
export async function expirySummary(ctx, accountId, now, days = 7) {
  const timezone = await businessTimezone(ctx, accountId);
  const today = businessDate(now, timezone);
  const until = businessDate(now + days * 86400000, timezone);
  const lots = (await ctx.db.query('hasibStockLots').withIndex('by_account_created', q => q.eq('accountId', accountId)).take(2000))
    .filter(row => row.remainingQty > 0 && row.useBy && row.useBy <= until)
    .sort((a, b) => a.useBy.localeCompare(b.useBy));
  const items = [];
  for (const lot of lots.slice(0, 50)) {
    const variant = await ctx.db.get(lot.variantId), item = variant ? await ctx.db.get(variant.itemId) : null;
    if (!variant || !item || item.accountId !== accountId) continue;
    items.push({ lotId: lot._id, variantId: lot.variantId, nameAr: item.nameAr, nameEn: item.nameEn, remainingQty: lot.remainingQty,
      useBy: lot.useBy, receivedOn: lot.receivedOn || null, status: lot.useBy < today ? 'expired' : 'expiring' });
  }
  return { expired: items.filter(row => row.status === 'expired').length, expiring: items.filter(row => row.status === 'expiring').length, items };
}

export async function executeRestaurant(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (a.operation === 'recipe_save') return saveRecipe(ctx, tenant, a, now);
  if (a.operation === 'recipes') return listRecipes(ctx, accountId, a);
  if (a.operation === 'waste_create') return createWaste(ctx, tenant, a, now);
  if (a.operation === 'stock_count') return countStock(ctx, tenant, a, now);
  if (a.operation === 'stock_receive') return receiveStock(ctx, tenant, a, now);
  if (a.operation === 'batch_create') return createBatch(ctx, tenant, a, now);
  if (a.operation === 'stock_expiry') {
    const days = Number.isSafeInteger(a.days) ? Math.min(30, Math.max(1, a.days)) : 7;
    return ok(await expirySummary(ctx, accountId, now, days));
  }
  if (a.operation === 'restaurant_summary') {
    let range;
    try { range = periodRange(a.period || 'month', now, await businessTimezone(ctx, accountId)); } catch (e) { return fail(e.reason || 'invalid_period'); }
    const orders = await ctx.db.query('hasibOrders').withIndex('by_account_created', q => q.eq('accountId', accountId).gte('createdAt', range.from).lt('createdAt', range.to)).take(3001);
    const sales = orders.filter(o => !['pending', 'cancelled', 'returned'].includes(o.status));
    const figures = sales.reduce((out, order) => {
      const profit = orderProfit(order);
      out.revenueMinor += profit.revenue;
      out.cogsMinor = out.cogsMinor === null || profit.profitMinor === null ? null : out.cogsMinor + profit.cost;
      return out;
    }, { revenueMinor: 0, cogsMinor: 0 });
    const { rows: expenses } = await expensesIn(ctx, accountId, range, 2000);
    return ok(await restaurantSummary(ctx, accountId, range, { sales, figures, expenses }));
  }
  return null;
}

export const RESTAURANT_REASONS = REASONS;
