import React, { useEffect, useRef } from 'react';
// layla-dashboard.css is imported by the page this only ever renders inside.

/** Native modal <dialog>: focus trapping, Escape and inert background come from the browser. */
export function Dialog({ s, title, children, onClose, wide = false, role = 'dialog' }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    if (dialog && !dialog.open) dialog.showModal?.();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  return (
    <dialog ref={ref} className={`ld-dialog ${wide ? 'is-wide' : ''}`} role={role} aria-labelledby="ld-dialog-title"
      onCancel={e => { e.preventDefault(); onClose?.(); }} onClick={e => { if (e.target === ref.current) onClose?.(); }}>
      <div className="ld-dialog-body">
        <header className="ld-dialog-head">
          <h2 id="ld-dialog-title">{title}</h2>
          {onClose && <button type="button" className="ld-icon-button" onClick={onClose} aria-label={s.t('close')}><span aria-hidden="true">×</span></button>}
        </header>
        {children}
      </div>
    </dialog>
  );
}
