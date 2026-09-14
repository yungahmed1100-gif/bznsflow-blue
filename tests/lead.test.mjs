// Unit checks for api/lead.js — the gates, and the two fields the playbook form
// gained when it moved onto its own page.
//
// api/lead.js has named this file in a comment since it was written. It did not
// exist. The check it claimed to be covered by lives in contracts.test.mjs; what
// was never covered is the behaviour below, and that matters more now: the form
// asks for a phone and a sector, and getting either wrong must not cost a lead.
//
// Only the paths that return before any network call are exercised here.
// Anything past them needs Supabase and Apps Script, which belong in the e2e
// stack — the same boundary tests/auth.test.mjs draws.

import assert from 'node:assert/strict';
import { INDUSTRIES } from '../src/lib/industries.js';

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; }
};

const mockRes = () => ({
  code: 0, headers: {}, body: undefined,
  status(n) { this.code = n; return this; },
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
  getHeader(k) { return this.headers[k.toLowerCase()]; },
  end(payload) { this.body = payload ? JSON.parse(payload) : undefined; return this; },
});

const headers = { host: 'www.bznsflowai.com', origin: 'https://www.bznsflowai.com' };
const lead = (await import('../api/lead.js')).default;

const { cleanPhone, cleanIndustry } = await import('../api/lead.js');

console.log('\nPOST /api/lead — gates');

await t('rejects a non-POST method with Allow', async () => {
  const res = mockRes();
  await lead({ method: 'GET', headers }, res);
  assert.equal(res.code, 405);
  assert.equal(res.getHeader('allow'), 'POST');
  assert.equal(res.body.reason, 'method');
});

await t('rejects a foreign origin', async () => {
  const res = mockRes();
  await lead({ method: 'POST', headers: { ...headers, origin: 'https://evil.example' } }, res);
  assert.equal(res.code, 403);
  assert.equal(res.body.reason, 'origin');
});

await t('rejects a malformed email before anything else', async () => {
  for (const email of ['', 'nope', 'a@b', undefined]) {
    const res = mockRes();
    await lead({ method: 'POST', headers, body: { email } }, res);
    assert.equal(res.code, 400, `"${email}" should be refused`);
    assert.equal(res.body.reason, 'email');
  }
});

await t('never caches a response', async () => {
  const res = mockRes();
  await lead({ method: 'GET', headers }, res);
  assert.equal(res.getHeader('cache-control'), 'no-store');
});

console.log('\nPOST /api/lead — the phone and sector fields');

// The rest needs pushLead not to reach the network. Swapping the export is the
// smallest way in: api/lead.js calls it through the module object.
const capture = async (body) => {
  sent = null;
  Object.defineProperty(mailer, 'pushLead', {
    value: async (payload) => { sent = payload; return { ok: true, emailed: true }; },
    configurable: true,
    writable: true,
  });
  const res = mockRes();
  await lead({ method: 'POST', headers, body }, res);
  Object.defineProperty(mailer, 'pushLead', { value: realPushLead, configurable: true, writable: true });
  return res;
};

const base = { email: 'a@b.com', playbook: true, name: 'Ahmed' };

await t('a valid sector is kept, an unknown one is dropped rather than fatal', async () => {
  const known = INDUSTRIES[0].id;
  let res = await capture({ ...base, industry: known });
  assert.equal(res.code, 200, 'a valid sector should not fail the request');
  if (sent) assert.equal(sent.industry, known);

  res = await capture({ ...base, industry: 'not-a-real-sector' });
  assert.equal(res.code, 200, 'an unknown sector must never cost the lead');
  if (sent) assert.equal(sent.industry, undefined, 'an unknown sector should not be forwarded');
});

await t('a usable phone is kept, a too-short one is dropped rather than fatal', async () => {
  let res = await capture({ ...base, phone: '+968 9123 4567' });
  assert.equal(res.code, 200);
  if (sent) assert.equal(sent.phone, '+96891234567', 'digits should survive, punctuation should not');

  res = await capture({ ...base, phone: '12' });
  assert.equal(res.code, 200, 'a short phone must never cost the lead');
  if (sent) assert.equal(sent.phone, undefined);
});

await t('a submission with neither field still succeeds', async () => {
  const res = await capture({ email: 'a@b.com', playbook: true });
  assert.equal(res.code, 200, 'email is the only field that was ever required');
});

console.log(`\n${fail ? '✗' : '✓'} lead: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
