import React, { useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { Money } from './Badges';
import { ActionCards, PageHeader } from './DashboardVisuals';

const PERIODS = ['today', '7d', '30d', 'month', 'prev_month'];

/** A stat tile: sentence-case label, proportional-figure value, optional note. */
function Tile({ label, children, note }) {
  return <div className="hb-tile"><dt>{label}</dt><dd><span className="hb-tile-value">{children}</span>{note && <span className="ld-help hb-tile-note">{note}</span>}</dd></div>;
}

/**
 * Ranked magnitudes as a table with an inline bar: one hue, the value always
 * printed as text, so the table is its own accessible view.
 */
function BarTable({ caption, rows, columns, valueOf }) {
  const max = Math.max(1, ...rows.map(valueOf));
  return (
    <table className="ld-table hb-bars">
      <caption>{caption}</caption>
      <thead><tr>{columns.map(c => <th key={c.key} scope="col" className={c.numeric ? 'hb-num-col' : ''}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}>
          {columns.map((c, j) => j === 0
            ? <th key={c.key} scope="row"><span className="hb-bar-label">{c.render(r)}</span><span className="hb-bar" aria-hidden="true"><span style={{ inlineSize: `${Math.max(2, (valueOf(r) / max) * 100)}%` }} /></span></th>
            : <td key={c.key} className={c.numeric ? 'hb-num-col' : ''}>{c.render(r)}</td>)}
        </tr>
      ))}</tbody>
    </table>
  );
}

function DemandList({ title, rows, columns }) {
  if (!rows.length) return null;
  return <BarTable caption={title} rows={rows} valueOf={r => r.people} columns={columns} />;
}

/** Insights: one period selector scopes every figure below it. */
export function InsightsView({ s, h, overview, onGo }) {
  const [period, setPeriod] = useState('month');
  const data = usePolling(() => hasib('insights', { period }), [period], { interval: 60000 });
  const i = data.data;
  const categoryLabel = key => { const c = overview.pack.expenseCategories.find(x => x.key === key); return c ? (s.ar ? c.ar : c.en) : key; };
  const name = r => <bdi>{h.name(r)}</bdi>;
  const percentage = bps => Number.isFinite(bps) ? `${(bps / 100).toFixed(1)}%` : h.t('notEnoughRecords');
  // A clinic sells treatments, not stock: revenue leads, profit per service and stock tiles don't apply.
  const clinic = !!overview.pack.serviceItems;

  return (
    <div className="hb-insights">
      <PageHeader title={<>{h.t('insights')} {overview.industry && <span className="ld-chip hb-industry">{h.t('industry', { name: s.ar ? overview.industry.ar : overview.industry.en })}</span>}</>} description={s.ar ? 'افهم المبيعات والأرباح والطلب من السجلات الفعلية.' : 'Understand sales, profit and demand from recorded activity.'} icon="bar-chart">
        <div className="ld-segmented hb-periods" role="radiogroup" aria-label={h.t('insights')}>
          {PERIODS.map(p => <label key={p}><input type="radio" name="hb-period" checked={period === p} onChange={() => setPeriod(p)} /><span>{h.t(`period_${p}`)}</span></label>)}
        </div>
      </PageHeader>
      <ActionCards label={s.ar ? 'إجراءات مالية' : 'Money actions'} actions={[{ id: 'charge', label: s.ar ? 'تسجيل بيع أو رسوم' : 'Record sale or charge', icon: 'receipt', onClick: () => onGo?.('orders', { action: 'charge' }) }, { id: 'expense', label: h.t('addExpense'), icon: 'plus', onClick: () => onGo?.('money', { view: 'expenses', action: 'expense' }) }]} />
      {data.loading && !i ? <p className="ld-state" role="status">{h.t('loading')}</p>
        : data.error && !i ? <div className="ld-state" role="alert"><p>{h.reason(data.error.reason) || s.reason(data.error.reason)}</p><button className="ld-button" onClick={() => data.refresh()}>{h.t('retry')}</button></div>
        : (
          <div className={`hb-insights-body ${data.loading ? 'is-refreshing' : ''}`} aria-busy={data.loading}>
            <dl className="hb-tiles hb-money-summary">
              <Tile label={h.t('cashIn')}><Money h={h} minor={i.cash.reduce((n, c) => n + c.amountMinor, 0)} /></Tile>
              <Tile label={h.t('owed')} note={h.t('owedHelp')}><Money h={h} minor={i.receivablesMinor} /></Tile>
              <Tile label={h.t('netProfit')} note={h.t('netProfitHelp')}>{i.recordedProfitMinor == null ? h.t('notEnoughRecords') : <Money h={h} minor={i.recordedProfitMinor} />}</Tile>
            </dl>
            <details className="hb-report-details"><summary>{h.t('details')}</summary>
            <dl className="hb-tiles"><Tile label={h.t('expectedProfit')}>{i.expectedProfitMinor == null ? h.t('notEnoughRecords') : <Money h={h} minor={i.expectedProfitMinor} />}</Tile></dl>
            {overview.counts?.laylaWaiting > 0 && <p className={`hb-layla-waiting ${overview.counts.laylaOverdue ? 'is-overdue' : ''}`} role="status">
              <strong>{h.t('laylaWaitingTile')}: {overview.counts.laylaWaiting}</strong>{overview.counts.laylaOverdue ? ` · ${h.t('laylaOverdue', { count: overview.counts.laylaOverdue })}` : ''}</p>}
            <dl className="hb-tiles">
              <Tile label={h.t('sales')} note={h.orders(i.sales.orders)}><Money h={h} minor={i.sales.totalMinor} /></Tile>
              {clinic ? <Tile label={h.t('revenue')}><Money h={h} minor={i.sales.revenueMinor} /></Tile> : <Tile label={h.t('grossProfit')}><Money h={h} minor={i.sales.grossProfitMinor} /></Tile>}
              <Tile label={h.t('operatingCosts')} note={i.expenses.stockPurchasesMinor ? h.t('stockBought', { amount: h.money(i.expenses.stockPurchasesMinor) }) : null}><Money h={h} minor={i.expenses.operatingMinor} /></Tile>
              <Tile label={h.t('cashIn')}><Money h={h} minor={i.cash.reduce((n, c) => n + c.amountMinor, 0)} /></Tile>
              <Tile label={h.t('owed')} note={h.t('owedHelp')}><Money h={h} minor={i.receivablesMinor} /></Tile>
              <Tile label={h.t('pendingOrders')} note={h.orders(i.pending.orders)}><Money h={h} minor={i.pending.totalMinor} /></Tile>
            </dl>
            {i.restaurant && <>
              <dl className="hb-tiles">
                <Tile label={h.t(overview.pack.id === 'cafe' ? 'productCost' : 'foodCost')}><span>{percentage(i.restaurant.foodCostBps)}</span></Tile>
                <Tile label={h.t('laborCost')}><span>{percentage(i.restaurant.laborCostBps)}</span></Tile>
                <Tile label={h.t('primeCost')}><span>{percentage(i.restaurant.primeCostBps)}</span></Tile>
                <Tile label={h.t('wasteCost')}><Money h={h} minor={i.restaurant.wasteMinor} /></Tile>
                <Tile label={h.t('stockVariance')}><Money h={h} minor={i.restaurant.stockVarianceMinor} /></Tile>
                <Tile label={h.t('actualUsage')}>{i.restaurant.usageVarianceMinor == null ? h.t('notEnoughRecords') : <Money h={h} minor={i.restaurant.usageVarianceMinor} />}</Tile>
              </dl>
              {!!i.restaurant.priceIncreases?.length && <section className="hb-panel"><h2>{h.ar ? 'ارتفاع أسعار الموردين' : 'Supplier price increases'}</h2>{i.restaurant.priceIncreases.map((row, index) => <p key={index}>{row.vendor} · {row.receivedOn} · <Money h={h} minor={row.previousCostMinor} /> → <Money h={h} minor={row.unitCostMinor} /></p>)}</section>}
              <div className="hb-panels">
                <section className="hb-panel"><BarTable caption={h.t('menuPerformance')} rows={i.restaurant.menu} valueOf={r => Math.max(0, r.revenueMinor)} columns={[
                  { key: 'name', label: h.t('products'), render: r => <bdi>{r.name}</bdi> },
                  { key: 'qty', label: h.t('qty'), numeric: true, render: r => <span className="ld-num">{r.qty}</span> },
                  { key: 'contribution', label: h.t('contribution'), numeric: true, render: r => <Money h={h} minor={r.contributionMinor} /> },
                  { key: 'foodCost', label: h.t(overview.pack.id === 'cafe' ? 'productCost' : 'foodCost'), numeric: true, render: r => <span className="ld-num">{percentage(r.foodCostBps)}</span> },
                ]} /></section>
                <section className="hb-panel"><BarTable caption={h.t('channelPerformance')} rows={i.restaurant.channels} valueOf={r => Math.max(0, r.revenueMinor)} columns={[
                  { key: 'channel', label: h.t('channel'), render: r => h.t(`ch_${r.channel}`) },
                  { key: 'orders', label: h.t('orders'), numeric: true, render: r => <span className="ld-num">{r.orders}</span> },
                  { key: 'contribution', label: h.t('contribution'), numeric: true, render: r => <Money h={h} minor={r.contributionMinor} /> },
                ]} /></section>
              </div>
            </>}

            <div className="hb-panels">
              <section className="hb-panel">
                {i.topProducts.length ? <BarTable caption={h.t('topProducts')} rows={i.topProducts} valueOf={r => r.revenueMinor} columns={[
                  { key: 'name', label: clinic ? h.t('service') : h.t('products'), render: name },
                  { key: 'qty', label: h.t('qty'), numeric: true, render: r => <span className="ld-num">{r.qty}</span> },
                  { key: 'revenue', label: h.t('revenue'), numeric: true, render: r => <Money h={h} minor={r.revenueMinor} /> },
                  ...(clinic ? [] : [{ key: 'profit', label: h.t('profit'), numeric: true, render: r => <Money h={h} minor={r.profitMinor} /> }]),
                ]} /> : <><h2 className="hb-panel-title">{h.t('topProducts')}</h2><p className="ld-help">{h.t('noSales')}</p></>}
              </section>

              {i.demand && (
                <section className="hb-panel hb-demand" aria-labelledby="hb-demand-title">
                  <h2 id="hb-demand-title" className="hb-panel-title">{h.t('demandTitle')}</h2>
                  {!i.demand.signals ? <p className="ld-help">{h.t('noDemand')}</p> : <>
                    <DemandList title={h.t('mostWanted')} rows={i.demand.mostWanted} columns={[
                      { key: 'name', label: h.t('products'), render: name },
                      { key: 'people', label: h.t('people'), numeric: true, render: r => <span className="ld-num">{r.people}</span> },
                      { key: 'oos', label: h.t('lostSales'), numeric: true, render: r => <span className="ld-num">{r.outOfStockAsks}</span> },
                      { key: 'bought', label: h.t('bought'), numeric: true, render: r => <span className="ld-num">{r.bought}</span> },
                    ]} />
                    <DemandList title={h.t('lostSales')} rows={i.demand.lostSales} columns={[
                      { key: 'name', label: h.t('products'), render: name },
                      { key: 'people', label: h.t('people'), numeric: true, render: r => <span className="ld-num">{r.people}</span> },
                    ]} />
                    <DemandList title={h.t('askedNotBought')} rows={i.demand.askedNotBought} columns={[
                      { key: 'name', label: h.t('products'), render: name },
                      { key: 'people', label: h.t('people'), numeric: true, render: r => <span className="ld-num">{r.people}</span> },
                    ]} />
                    <DemandList title={h.t('notInCatalog')} rows={i.demand.notInCatalog} columns={[
                      { key: 'text', label: h.t('products'), render: r => <bdi>{r.text}</bdi> },
                      { key: 'people', label: h.t('people'), numeric: true, render: r => <span className="ld-num">{r.people}</span> },
                    ]} />
                  </>}
                </section>
              )}

              {i.cash.length > 0 && <section className="hb-panel"><BarTable caption={h.t('cashByMethod')} rows={i.cash} valueOf={r => Math.max(r.amountMinor, 0)} columns={[
                { key: 'method', label: h.t('method'), render: r => h.t(`pm_${r.method}`) },
                { key: 'amount', label: h.t('amountCol'), numeric: true, render: r => <Money h={h} minor={r.amountMinor} /> },
              ]} /></section>}

              {i.expenses.byCategory.length > 0 && <section className="hb-panel"><BarTable caption={h.t('costsByCategory')} rows={i.expenses.byCategory} valueOf={r => r.amountMinor} columns={[
                { key: 'category', label: h.t('category'), render: r => categoryLabel(r.category) },
                { key: 'amount', label: h.t('amountCol'), numeric: true, render: r => <Money h={h} minor={r.amountMinor} /> },
              ]} /></section>}
            </div>

            {(i.tradeIns || i.repairs) && <dl className="hb-tiles hb-tiles-small">
              {i.repairs && <Tile label={h.t('openRepairs')}><span>{i.repairs.open}</span></Tile>}
              {i.repairs && <Tile label={h.t('readyRepairs')}><span>{i.repairs.ready}</span></Tile>}
              {i.tradeIns && <Tile label={h.t('tradeInsTile')} note={h.t('countLabel', { count: i.tradeIns.count })}><Money h={h} minor={i.tradeIns.totalMinor} /></Tile>}
            </dl>}
            <dl className="hb-tiles hb-tiles-small">
              {!clinic && <>
                <Tile label={h.t('stockValueTile')}><Money h={h} minor={i.stock.valueMinor} /></Tile>
                <Tile label={h.t('lowTile')}><span>{i.stock.low}</span></Tile>
                <Tile label={h.t('outTile')}><span>{i.stock.out}</span></Tile>
              </>}
              <Tile label={h.t('buyers')}><span>{i.customers.buyers}</span></Tile>
              <Tile label={h.t('returning')}><span>{i.customers.returning}</span></Tile>
              <Tile label={h.t('walkInSales')}><span>{i.customers.walkIn}</span></Tile>
            </dl>
            {i.truncated && <p className="ld-help" role="note">{h.t('truncated')}</p>}
            <p className="ld-help hb-definitions">{h.t('definitions')}</p>
            </details>
          </div>
        )}
    </div>
  );
}
