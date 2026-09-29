import React from 'react';
import { Icon } from '../ui/Icon';

export function PageHeader({ title, description, icon = 'bar-chart', primary, children }) {
  return <header className="hb-page-header">
    <div className="hb-page-heading"><span className="hb-page-icon" aria-hidden="true"><Icon name={icon} size={24} /></span><div><h1>{title}</h1>{description && <p>{description}</p>}</div></div>
    <div className="hb-page-actions">{children}{primary && <button type="button" className="ld-button ld-primary" onClick={primary.onClick}><Icon name={primary.icon || 'plus'} size={17} />{primary.label}</button>}</div>
  </header>;
}

export function ActionCards({ actions, label }) {
  if (!actions?.length) return null;
  return <section className="hb-action-strip" aria-label={label}>{actions.map((action, index) => <button type="button" className={`hb-action-card ${index === 0 ? 'is-primary' : ''}`} key={action.id} onClick={action.onClick} disabled={action.disabled}>
    <span className="hb-action-icon" aria-hidden="true"><Icon name={action.icon || 'arrow-right'} size={21} /></span><span><strong>{action.label}</strong>{action.help && <small>{action.help}</small>}</span><Icon name="arrow-right" size={17} className="hb-action-arrow" />
  </button>)}</section>;
}

export function MetricCards({ items, label }) {
  return <section className="hb-visual-metrics" aria-label={label}>{items.map(item => {
    const body = <><span className={`hb-metric-icon is-${item.tone || 'blue'}`} aria-hidden="true"><Icon name={item.icon || 'bar-chart'} size={19} /></span><strong>{item.value}</strong><span>{item.label}</span>{item.help && <small>{item.help}</small>}</>;
    return item.onClick ? <button type="button" className="hb-visual-metric" key={item.id} onClick={item.onClick}>{body}</button> : <article className="hb-visual-metric" key={item.id}>{body}</article>;
  })}</section>;
}

export function EmptyState({ icon = 'box', title, description, action, secondary }) {
  return <section className="hb-empty-state">
    <span className="hb-empty-illustration" aria-hidden="true"><Icon name={icon} size={34} /><i /><i /></span>
    <h2>{title}</h2>{description && <p>{description}</p>}
    <div className="ld-actions">{action && <button type="button" className="ld-button ld-primary" onClick={action.onClick}><Icon name={action.icon || 'plus'} size={17} />{action.label}</button>}{secondary && <button type="button" className="ld-button" onClick={secondary.onClick}>{secondary.label}</button>}</div>
  </section>;
}

export function HorizontalBars({ title, rows, label = title, format = value => value }) {
  if (!rows?.length) return null;
  const max = Math.max(1, ...rows.map(row => Number(row.value) || 0));
  return <section className="hb-chart" aria-label={label}><h2>{title}</h2><ul>{rows.map(row => <li key={row.id || row.label}><div><span>{row.label}</span><strong>{format(row.value, row)}</strong></div><span className="hb-chart-track" aria-hidden="true"><span style={{ inlineSize: `${Number(row.value) > 0 ? Math.max(3, Math.round(Number(row.value) / max * 100)) : 0}%` }} /></span></li>)}</ul></section>;
}
