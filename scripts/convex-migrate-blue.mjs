/**
 * Import an explicit, redacted Green export into Blue Convex.
 *
 * Usage: CONVEX_URL=... node scripts/convex-migrate-blue.mjs export.json
 * The script intentionally refuses a live database URL or secret-bearing
 * fields. Generate the JSON export manually after reviewing the rows.
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('usage: node scripts/convex-migrate-blue.mjs <reviewed-export.json>');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!data || data.source !== 'green-reviewed-export-v1') throw new Error('wrong export marker');
if (data.accounts && !Array.isArray(data.accounts)) throw new Error('accounts must be an array');
if (data.businesses && !Array.isArray(data.businesses)) throw new Error('businesses must be an array');
if (data.integrations && !Array.isArray(data.integrations)) throw new Error('integrations must be an array');
const forbidden = /token|secret|pin|password|cookie|auth.?code|message.?body/i;
const serialized = JSON.stringify(data);
if (forbidden.test(serialized)) throw new Error('export contains a forbidden secret or message field');
console.log(JSON.stringify({ ok: true, reviewOnly: true, accounts: data.accounts?.length ?? 0, businesses: data.businesses?.length ?? 0, integrations: data.integrations?.length ?? 0 }));
console.log('Validated export only. Run the reviewed Convex import mutation after provisioning Blue; no Green connection was attempted.');
