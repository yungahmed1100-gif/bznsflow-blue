import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { normalizePhone, formatPhone, mayBeUsNumber, countryForWaId } from '../src/lib/dashboard/phone.js';
import { parseDelimited, toCsv, csvCell } from '../src/lib/dashboard/csv.js';
import { buildImportPreview, guessMapping, countryFromCell, sampleCsv, IMPORT_MAX_ROWS } from '../src/lib/dashboard/import.js';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';

test('country-code selection plus national number normalizes to a WhatsApp wa_id', () => {
  assert.deepEqual(normalizePhone('+968 9123 4567'), { waId: '96891234567', countryIso: 'OM' });
  assert.deepEqual(normalizePhone('00968-9123-4567'), { waId: '96891234567', countryIso: 'OM' });
  assert.deepEqual(normalizePhone('91234567', 'OM'), { waId: '96891234567', countryIso: 'OM' });
  assert.deepEqual(normalizePhone('050 123 4567', 'AE'), { waId: '971501234567', countryIso: 'AE' });
  assert.deepEqual(normalizePhone('968 9123 4567', 'OM'), { waId: '96891234567', countryIso: 'OM' });
  assert.deepEqual(normalizePhone('٩١٢٣٤٥٦٧', 'OM'), { waId: '96891234567', countryIso: 'OM' });
  assert.equal(normalizePhone('91234567').error, 'missing_country');
  assert.equal(normalizePhone('12', 'OM').error, 'invalid_phone');
  assert.equal(normalizePhone('+968 abc').error, 'invalid_phone');
  assert.equal(normalizePhone('+1234567890123456').error, 'invalid_phone');
  assert.equal(countryForWaId('12685551234'), 'AG');
  assert.equal(mayBeUsNumber('12025550123'), true);
  assert.equal(mayBeUsNumber('96891234567'), false);
  assert.equal(formatPhone('96891234567'), '+968 9123 4567');
});

test('CSV parsing handles quotes, BOM, CRLF and semicolons; exports defuse spreadsheet formulas', () => {
  const rows = parseDelimited('﻿phone;name;note\r\n"+968 9123 4567";"Al ""Noor"" Trading";"a;b"\r\n\r\n91234568;Omar;\n');
  assert.deepEqual(rows, [['phone', 'name', 'note'], ['+968 9123 4567', 'Al "Noor" Trading', 'a;b'], ['91234568', 'Omar', '']]);
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+968 9123'), "'+968 9123");
  assert.ok(toCsv([['اسم', 'رقم']]).startsWith('﻿'));
  assert.ok(sampleCsv([{ key: 'area' }]).includes('phone,name,country,area'));
});

test('import preview maps columns, merges duplicates, reports malformed rows and caps size', () => {
  const fields = [{ key: 'area', en: 'Area', ar: 'المنطقة' }, { key: 'budget', en: 'Budget', ar: 'الميزانية' }];
  const rows = [['Mobile', 'Full name', 'Country', 'Area'], ['91234567', 'Aisha', 'Oman', 'Seeb'], ['+968 9123 4567', '', '', 'Qurum'], ['0501234567', 'Omar', '+971', ''], ['abc', 'Bad', 'OM', ''], ['', 'Empty', 'OM', ''], ['123', 'Short', 'OM', '']];
  const mapping = guessMapping(rows[0], fields);
  assert.deepEqual(mapping, { phone: 0, name: 1, country: 2, fields: { area: 3 } });
  const preview = buildImportPreview(rows, mapping, 'OM', fields);
  assert.deepEqual(preview.valid.map(v => [v.waId, v.name, v.fields]), [['96891234567', 'Aisha', [{ key: 'area', value: 'Seeb' }]], ['971501234567', 'Omar', []]]);
  assert.equal(preview.duplicates, 1);
  assert.deepEqual(preview.invalid.map(i => [i.line, i.reason]), [[5, 'invalid_phone'], [6, 'missing_phone'], [7, 'invalid_phone']]);
  assert.equal(countryFromCell('om'), 'OM');
  const big = [['phone'], ...Array.from({ length: IMPORT_MAX_ROWS + 5 }, (_, i) => [String(91000000 + i)])];
  const capped = buildImportPreview(big, { phone: 0, name: -1, country: -1, fields: {} }, 'OM');
  assert.equal(capped.valid.length, IMPORT_MAX_ROWS);
  assert.equal(capped.truncated, true);
});

test('imports copy one consent attestation, merge with existing contacts, preserve opt-outs and never send', async () => {
  const h = blueHarness();
  await h.enable();
  const t = await seedTenant(h.m, { name: 'i' });
  await h.messaging('activate', { sessionHash: t.sessionHash });
  await h.inbound(t, { from: '96891110000', text: 'stop', intent: 'optout', reply: null });
  await h.inbound(t, { from: '96892220000', text: 'Hello', profileName: 'WA Name' });
  const edited = h.m.table('blueContacts').find(c => c.waId === '96892220000');
  await h.dashboard('contact_update', { sessionHash: t.sessionHash, contactId: edited._id, patch: { ownerName: 'Owner Name' } });
  const outBefore = h.m.table('blueMessages').filter(r => r.direction === 'out').length;
  const requestId = randomUUID();
  const consent = { source: 'Website form', date: '2026-09-01', purpose: 'Monthly offers', attested: true };
  assert.equal((await h.audience('import_contacts', { sessionHash: t.sessionHash, requestId, origin: 'import', requireConsent: true, rows: [{ waId: '96893330000' }] })).reason, 'consent_required');
  assert.equal((await h.audience('import_contacts', { sessionHash: t.sessionHash, requestId, origin: 'import', consent: { ...consent, date: '2999-01-01' }, rows: [{ waId: '96893330000' }] })).reason, 'invalid_consent');
  const result = await h.audience('import_contacts', { sessionHash: t.sessionHash, requestId, origin: 'import', requireConsent: true, consent,
    rows: [{ waId: '96891110000', name: 'Opted Out' }, { waId: '96892220000', name: 'Imported Name', fields: [{ key: 'area', value: 'Seeb' }] }, { waId: '96893330000', name: 'New Lead' }, { waId: '96893330000', name: 'Duplicate' }, { waId: 'nope' }] });
  assert.equal(result.ok, true);
  assert.deepEqual({ created: result.value.created, updated: result.value.updated, consentRecorded: result.value.consentRecorded, optedOutKept: result.value.optedOutKept, invalid: result.value.invalid },
    { created: 1, updated: 2, consentRecorded: 2, optedOutKept: 1, invalid: 1 });
  const byWa = waId => h.m.table('blueContacts').find(c => c.waId === waId);
  assert.equal(byWa('96891110000').consent.status, 'revoked');
  assert.equal(byWa('96892220000').ownerName, 'Owner Name');
  assert.deepEqual(byWa('96892220000').fields, [{ key: 'area', value: 'Seeb', source: 'owner', confidence: 1, at: h.m.now() }]);
  assert.deepEqual({ ...byWa('96893330000').consent, batchId: undefined }, { status: 'granted', source: 'Website form', date: '2026-09-01', purpose: 'Monthly offers', attestedAt: h.m.now(), batchId: undefined });
  assert.equal(byWa('96893330000').source, 'import');
  assert.equal(h.m.table('blueConsentBatches').length, 1);
  assert.equal(h.m.table('blueMessages').filter(r => r.direction === 'out').length, outBefore);
  assert.equal(h.m.table('blueCampaignRecipients').length, 0);
  // A second page of the same import reuses the attestation; changed evidence is refused.
  assert.equal((await h.audience('import_contacts', { sessionHash: t.sessionHash, requestId, origin: 'import', consent, rows: [{ waId: '96894440000' }] })).ok, true);
  assert.equal((await h.audience('import_contacts', { sessionHash: t.sessionHash, requestId, origin: 'import', consent: { ...consent, purpose: 'Other' }, rows: [{ waId: '96895550000' }] })).reason, 'invalid_consent');
  assert.equal(h.m.table('blueConsentBatches')[0].count, 3);
  const tooMany = Array.from({ length: 101 }, (_, i) => ({ waId: String(96890000000 + i) }));
  assert.equal((await h.audience('import_contacts', { sessionHash: t.sessionHash, requestId: randomUUID(), origin: 'import', rows: tooMany })).reason, 'invalid_import');
});

test('XLSX files are read through the same column mapping and normalization', async () => {
  const { default: ExcelJS } = await import('exceljs');
  const { readContactsFile } = await import('../src/lib/dashboard/import.js');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Leads');
  sheet.addRow(['Phone', 'Name', 'Country', 'Budget']);
  sheet.addRow(['+968 9123 4567', 'Aisha', 'OM', '500 OMR']);
  sheet.addRow([91234568, 'رقم بدون رمز', '', '']);
  const buffer = await workbook.xlsx.writeBuffer();
  const file = { name: 'leads.xlsx', size: buffer.byteLength, type: '', arrayBuffer: async () => buffer };
  const rows = await readContactsFile(file);
  const fields = [{ key: 'budget', en: 'Budget', ar: 'الميزانية' }];
  const preview = buildImportPreview(rows, guessMapping(rows[0], fields), 'OM', fields);
  assert.deepEqual(preview.valid.map(v => [v.waId, v.name, v.fields]), [['96891234567', 'Aisha', [{ key: 'budget', value: '500 OMR' }]], ['96891234568', 'رقم بدون رمز', []]]);
  await assert.rejects(readContactsFile({ name: 'notes.pdf', size: 10, arrayBuffer: async () => new ArrayBuffer(10) }), /import_file_type/);
  await assert.rejects(readContactsFile({ name: 'big.csv', size: 6 * 1024 * 1024 }), /import_file_too_large/);
});
