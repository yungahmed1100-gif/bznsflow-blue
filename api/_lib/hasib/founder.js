const FOUNDER_EMAILS = new Set(['ahmed@bznsflowai.com']);

export const normalizeAccountEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const isHasibFounder = account => FOUNDER_EMAILS.has(normalizeAccountEmail(account?.email));
