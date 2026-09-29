// One saved-cost definition for Money, Today and exports. Costs exclude VAT.
export function orderProfit(order) {
  const lines = order.lines.map(l => ({ l, revenue: order.pricesIncludeVat ? l.netMinor - l.vatMinor : l.netMinor,
    cost: Math.round(l.qty * (l.unitCostMinor ?? 0)), costKnown: l.costKnown !== false && Number.isSafeInteger(l.unitCostMinor) }));
  const deliveryVat = order.vatMinor - order.lines.reduce((n, l) => n + l.vatMinor, 0);
  const delivery = order.pricesIncludeVat ? order.deliveryMinor - deliveryVat : order.deliveryMinor;
  const revenue = lines.reduce((n, x) => n + x.revenue, 0) + delivery;
  const cost = lines.reduce((n, x) => n + x.cost, 0) + (order.channelCostMinor || 0) + (order.operationalCostMinor || 0);
  return { lines, delivery, revenue, cost, profitMinor: order.operationalCostKnown !== false && lines.every(x => x.costKnown) ? revenue - cost : null };
}
