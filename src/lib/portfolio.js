// Groups Meta's Business verification_status (read with business_management)
// into the three states an owner acts on. Unknown statuses show no badge.
export function portfolioStatus(status) {
  if (status === 'verified') return 'verified';
  if (typeof status === 'string' && status.startsWith('pending')) return 'pending';
  if (['not_verified', 'failed', 'rejected', 'expired', 'revoked', 'ineligible'].includes(status)) return 'not_verified';
  return null;
}
