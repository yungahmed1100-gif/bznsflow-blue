import test from 'node:test';
import assert from 'node:assert/strict';
import { INDUSTRIES } from '../src/lib/industries.js';
import { SECTOR_PACKS } from '../config/layla-sector-packs.js';
import { QUALIFICATION_SECTOR_IDS, qualificationPack, extractQualification, mergeFields, qualificationStatus, nextQuestions, planQuestions,
  questionText, isSensitiveSector, sectorIdFor, MAX_QUESTIONS, ASK_COOLDOWN_MS } from '../config/layla-qualification.js';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';

const run = (sectorId, text, extra = {}) => mergeFields([], extractQualification({ text, sectorId, ...extra }).updates, 1).fields;
const values = fields => Object.fromEntries(fields.map(f => [f.key, f.value]));

test('all 22 sector packs define bilingual required fields and grouped prompts of at most three questions', () => {
  assert.deepEqual(new Set(QUALIFICATION_SECTOR_IDS), new Set(INDUSTRIES.filter(i => i.id !== 'other').map(i => i.id)));
  for (const id of [...QUALIFICATION_SECTOR_IDS, 'other']) {
    const pack = qualificationPack(id);
    const required = pack.fields.filter(f => f.required);
    assert.ok(required.length >= 3, `${id} has required fields`);
    for (const f of pack.fields) {
      assert.ok(f.en && f.ar && f.ask.en.length > 5 && /[؀-ۿ]/.test(f.ask.ar), `${id}.${f.key} bilingual`);
      for (const o of f.options || []) assert.ok(o.en && /[؀-ۿ]/.test(o.ar), `${id}.${f.key}.${o.id}`);
    }
    for (const group of pack.groups) {
      assert.ok(group.length <= MAX_QUESTIONS);
      for (const key of group) assert.ok(pack.fields.some(f => f.key === key), `${id} group key ${key}`);
    }
    assert.ok(required.every(f => pack.groups.flat().includes(f.key)), `${id} asks for every required field`);
    if (id !== 'other') {
      const prompts = SECTOR_PACKS[id].qualification.prompts;
      assert.ok(prompts.length && prompts.every(p => p.fields.length <= 3 && p.en.endsWith('?') && p.ar.endsWith('؟')), `${id} prompts`);
    }
  }
});

test('archetype defaults: booking captures service, time and location; catalog item, quantity and fulfilment; project need, area, budget and timeline', () => {
  assert.deepEqual(values(run('beauty', 'Can I book a haircut tomorrow at 4pm at the salon?', { catalog: [{ nameEn: 'Haircut', nameAr: 'قص شعر' }] })),
    { service: 'Haircut', preferred_time: 'tomorrow at 4pm', location: 'salon' });
  assert.deepEqual(values(run('restaurant', 'I want 3 Chicken Machboos for delivery', { catalog: [{ nameEn: 'Chicken Machboos', nameAr: 'مكبوس دجاج' }] })),
    { item: 'Chicken Machboos', quantity: '3', fulfilment: 'delivery' });
  assert.deepEqual(values(run('construction', 'Renovation of my house in Bawshar, budget 15,000 OMR, within 2 months')),
    { need: 'renovation', area: 'Bawshar', budget: '15,000 omr', timeline: 'within 2 months' });
  assert.equal(qualificationStatus('construction', run('construction', 'Renovation of my house in Bawshar, budget 15,000 OMR, within 2 months')), 'qualified');
});

test('Arabic, English and mixed messages extract the same sector fields', () => {
  const ar = values(run('real-estate', 'ابغى استئجار فيلا في منطقة الموالح ميزانيتي 700 ريال الشهر الجاي'));
  assert.equal(ar.need, 'rent'); assert.equal(ar.property_type, 'villa'); assert.equal(ar.area, 'الموالح'); assert.ok(ar.budget.includes('700')); assert.equal(ar.timeline, 'الشهر الجاي');
  const mixed = values(run('hvac', 'AC unit مو يبرد، need repair in Al Khuwair هالاسبوع'));
  assert.equal(mixed.need, 'repair'); assert.equal(mixed.area, 'Al Khuwair'); assert.equal(mixed.timeline, 'هالاسبوع');
  const arabicDigits = values(run('events', 'عرس يوم ١٢/١٠ لـ ٢٠٠ ضيف في مسقط'));
  assert.deepEqual(arabicDigits, { event_type: 'wedding', event_date: '12/10', guests: '200', area: 'مسقط' });
});

test('partial answers accumulate, later questions ask only for missing fields, and completion is deterministic', () => {
  let fields = run('real-estate', 'I want to buy an apartment');
  assert.equal(qualificationStatus('real-estate', fields), 'in_progress');
  assert.deepEqual(nextQuestions('real-estate', fields).map(f => f.key), ['area']);
  fields = mergeFields(fields, extractQualification({ text: 'Qurum', sectorId: 'real-estate', asked: ['area'], existing: fields }).updates, 2).fields;
  assert.deepEqual(nextQuestions('real-estate', fields).map(f => f.key), ['budget', 'finance_readiness', 'decision_maker']);
  assert.ok(questionText(nextQuestions('real-estate', fields), 'en').includes('finance'));
  assert.ok(questionText(nextQuestions('real-estate', fields), 'ar').includes('التمويل'));
  fields = mergeFields(fields, extractQualification({ text: 'around 90k OMR, cash buyer, I decide, asap', sectorId: 'real-estate', existing: fields }).updates, 3).fields;
  assert.equal(qualificationStatus('real-estate', fields), 'qualified');
  assert.deepEqual(nextQuestions('real-estate', fields), []);
  // The same input always yields the same result.
  assert.deepEqual(run('real-estate', 'rent a villa in Seeb budget 800 OMR next month'), run('real-estate', 'rent a villa in Seeb budget 800 OMR next month'));
});

test('medical, legal and finance packs keep only operational booking details and never free text', () => {
  for (const id of ['clinic', 'dental', 'legal', 'finance']) {
    assert.equal(isSensitiveSector(id), true);
    assert.ok(qualificationPack(id).fields.every(f => f.kind !== 'text'), `${id} has no free-text fields`);
  }
  const clinic = extractQualification({ text: 'I have chest pain and diabetes, need a consultation tomorrow 5pm', sectorId: 'clinic' });
  assert.deepEqual(values(mergeFields([], clinic.updates, 1).fields), { service: 'consultation', preferred_time: 'tomorrow 5pm' });
  assert.equal(JSON.stringify(clinic).includes('pain'), false);
  const contextual = extractQualification({ text: 'my divorce case with my husband', sectorId: 'legal', asked: ['location'], intent: 'services' });
  assert.deepEqual(contextual.updates, []);
  assert.deepEqual(extractQualification({ text: 'I earn 3000 a month', sectorId: 'finance', asked: ['service'] }).updates, []);
});

test('owner-entered values outrank messages, and question plans respect intent, handoff and cooldown', () => {
  const owner = [{ key: 'area', value: 'Ruwi', source: 'owner', confidence: 1, at: 1 }];
  assert.deepEqual(mergeFields(owner, [{ key: 'area', value: 'Seeb', confidence: 0.9, source: 'customer' }], 2).fields, owner);
  const base = { sectorId: 'real-estate', fields: [], now: 10 * ASK_COOLDOWN_MS, lang: 'en' };
  assert.ok(planQuestions({ ...base, intent: 'services' }).text);
  assert.equal(planQuestions({ ...base, intent: 'human', handoff: true }).text, '');
  assert.equal(planQuestions({ ...base, intent: 'unknown' }).text, '');
  assert.equal(planQuestions({ ...base, intent: 'services', asked: ['need'], lastAskedAt: base.now - 1000 }).text, '');
  assert.ok(planQuestions({ ...base, intent: 'services', asked: ['need'], lastAskedAt: base.now - 1000, answeredNow: true }).text);
  assert.ok(planQuestions({ ...base, intent: 'services', asked: ['need'], lastAskedAt: base.now - 1000, fields: [{ key: 'need', value: 'buy' }] }).text);
  assert.equal(planQuestions({ ...base, intent: 'services', askCounts: ['need', 'property_type', 'area', 'budget', 'finance_readiness', 'decision_maker', 'timeline', 'bedrooms', 'must_haves'].map(key => ({ key, count: 2 })) }).text, '');
  assert.equal(sectorIdFor('عيادات الأسنان'), 'dental');
  assert.equal(sectorIdFor('Custom furniture'), 'other');
});

test('live ingest answers first, asks up to three related questions once, captures partial answers and marks the lead qualified', async () => {
  const h = blueHarness();
  await h.enable();
  const t = await seedTenant(h.m, { name: 'q', sector: 'Real estate' });
  await h.messaging('activate', { sessionHash: t.sessionHash });
  await h.inbound(t, { id: 'm1', text: 'Do you have villas for rent?', reply: 'We have villas from 500 OMR.', intent: 'services' });
  let replies = h.m.table('blueMessages').filter(r => r.direction === 'out').map(r => r.text);
  assert.equal(replies[0], 'We have villas from 500 OMR.\n\nTo help you further, could you share your area?');
  h.m.advance(60000);
  await h.inbound(t, { id: 'm2', text: 'Al Mawaleh', reply: 'Thanks!', intent: 'unknown' });
  let contact = h.m.table('blueContacts')[0];
  assert.deepEqual(values(contact.fields), { need: 'rent', property_type: 'villa', area: 'Mawaleh' });
  assert.equal(contact.qualificationStatus, 'in_progress');
  h.m.advance(60000);
  await h.inbound(t, { id: 'm3', text: 'How much are they?', reply: 'From 500 OMR.', intent: 'prices' });
  replies = h.m.table('blueMessages').filter(r => r.direction === 'out').map(r => r.text);
  assert.ok(replies.at(-1).startsWith('From 500 OMR.\n\nTo help you further, could you share your approximate budget'));
  h.m.advance(60000);
  await h.inbound(t, { id: 'm4', text: 'budget 600 OMR, cash buyer, I decide, next month', reply: 'Noted.', intent: 'prices' });
  contact = h.m.table('blueContacts')[0];
  assert.equal(contact.qualificationStatus, 'qualified');
  assert.equal(h.m.table('blueMessages').filter(r => r.direction === 'out').at(-1).text, 'Noted.');
  assert.ok(contact.fields.every(f => ['customer', 'contextual'].includes(f.source) && f.confidence >= 0.6));
});

// Answers built from each pack's own definition, sent one field at a time the
// way a customer replies to Layla's questions.
function answerFor(field, lang) {
  const ar = lang === 'ar';
  if (field.options?.length) return ar ? `أريد ${field.options[0].ar}` : `I want ${field.options[0].en}`;
  switch (field.kind) {
    case 'catalog': return ar ? 'أريد الباقة المميزة' : 'I want the Deluxe Package';
    case 'datetime': return ar ? 'بكرة الساعة 5 مساء' : 'tomorrow at 5pm';
    case 'budget': return ar ? 'ميزانيتي 500 ريال' : 'budget 500 OMR';
    case 'timeline': return ar ? 'الشهر الجاي' : 'next month';
    case 'number': return ar ? '5 أشخاص' : '5 people';
    case 'area': return ar ? 'في منطقة مسقط' : 'in Muscat';
    default: return ar ? 'تجهيز مكتب جديد' : 'Office fit out';
  }
}
test('every one of the 22 sector configurations reaches Qualified from natural Arabic and English answers', () => {
  const catalog = [{ nameEn: 'Deluxe Package', nameAr: 'الباقة المميزة' }];
  for (const id of QUALIFICATION_SECTOR_IDS) {
    for (const lang of ['en', 'ar']) {
      let fields = [];
      for (let turn = 0; turn < 12 && qualificationStatus(id, fields) !== 'qualified'; turn++) {
        const questions = nextQuestions(id, fields);
        assert.ok(questions.length, `${id} ${lang} still has questions`);
        const field = questions[0];
        const { updates } = extractQualification({ text: answerFor(field, lang), sectorId: id, catalog, asked: [field.key], existing: fields });
        const merged = mergeFields(fields, updates, turn + 1);
        assert.ok(merged.fields.some(f => f.key === field.key), `${id} ${lang} captured ${field.key} from “${answerFor(field, lang)}”`);
        fields = merged.fields;
      }
      assert.equal(qualificationStatus(id, fields), 'qualified', `${id} ${lang}`);
    }
  }
});
