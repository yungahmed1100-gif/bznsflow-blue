// IMEI / serial format, shared by the server and the dashboard (no dependencies).
/** IMEIs are written with spaces and dashes; stored as uppercase letters and digits only. */
export function normSerial(value) {
  const s = String(value ?? '').toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{4,30}$/.test(s) ? s : null;
}
