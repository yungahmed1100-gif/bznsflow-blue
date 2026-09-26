import React from 'react';
import { statusKey } from '../../lib/dashboard/strings.js';

const TICKS = { sent: 1, submitted: 1, delivered: 2, read: 2 };
/** WhatsApp-style ticks with a text label; read uses green, never blue (blue means interactive). */
export function StatusTicks({ s, status, channel }) {
  const label = s.t(statusKey(status, channel));
  if (!TICKS[status]) {
    const tone = ['failed'].includes(status) ? 'is-coral' : ['ambiguous', 'queued', 'attempting', 'pending'].includes(status) ? 'is-yellow' : 'is-muted';
    return <span className={`ld-ticks ${tone}`} title={label}><span aria-hidden="true">{status === 'failed' ? '!' : status === 'ambiguous' ? '?' : '◷'}</span><span className="ld-visually-hidden">{label}</span></span>;
  }
  return (
    <span className={`ld-ticks ${status === 'read' ? 'is-read' : ''}`} title={label}>
      <svg viewBox="0 0 18 12" width="16" height="11" aria-hidden="true" focusable="false">
        <path d="M1 6.5 4.5 10 11 2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        {TICKS[status] === 2 && <path d="M7 9.2 7.8 10 14.3 2" fill="none" stroke="currentColor" strokeWidth="1.8" />}
      </svg>
      <span className="ld-visually-hidden">{label}</span>
    </span>
  );
}
export function QualificationChip({ s, status }) {
  const tone = status === 'qualified' ? 'is-green' : status === 'in_progress' ? 'is-yellow' : status === 'not_qualified' ? 'is-muted' : '';
  return <span className={`ld-chip ${tone}`}>{s.t(`q_${status}`)}</span>;
}
