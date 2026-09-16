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

console.log('\nthe phone and sector fields');

await t('a usable phone keeps its digits and loses everything else', () => {
  assert.equal(cleanPhone('+968 9123 4567'), '+96891234567');
  assert.equal(cleanPhone('(968) 9123-4567'), '+96891234567');
  // A leading zero is a national trunk prefix, not part of the number.
  assert.equal(cleanPhone('0096891234567'), '+96891234567');
});

await t('an unusable phone is dropped, never thrown', () => {
  for (const bad of ['', '12', 'abc', null, undefined, {}, '1'.repeat(16)]) {
    assert.equal(cleanPhone(bad), undefined, `"${String(bad)}" should be dropped`);
  }
});

await t('a known sector survives and an unknown one is dropped', () => {
  for (const s of INDUSTRIES) assert.equal(cleanIndustry(s.id), s.id);
  for (const bad of ['not-a-real-sector', '', 'Dental', null, undefined, 42]) {
    assert.equal(cleanIndustry(bad), undefined, `"${String(bad)}" should be dropped`);
  }
});

await t('a garbage phone or sector is never answered with a 400', async () => {
  // The point of the two helpers above. This file already lets a lead through
  // when the rate-limit check itself fails, because a lead is revenue; a
  // mistyped digit must not be the one thing that does refuse it.
  //
  // LEAD_ENDPOINT is unset here, so the call dies at the network with a 502.
  // That is the assertion: it got past validation to reach the network at all.
  const res = mockRes();
  await lead({
    method: 'POST',
    headers,
    body: { email: 'a@b.com', playbook: true, phone: 'nonsense', industry: 'nope' },
  }, res);
  assert.notEqual(res.code, 400, 'a bad phone or sector must not refuse the lead');
  assert.equal(res.code, 502, 'expected it to fail at the unconfigured endpoint instead');
});

console.log(`\n${fail ? '✗' : '✓'} lead: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
