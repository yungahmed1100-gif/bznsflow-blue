// 30 days of a fictional Muscat dental clinic ("Bayan Dental Clinic") for the local
// Hasib demo. Patients write to Layla, the owner records visits and payments, and
// supplies are counted, all in true time order through the real state code.
// Every name and figure here is invented; messages carry no clinical detail.
import { randomUUID } from 'node:crypto';

const TREATMENTS = [
  ['Check-up', 'فحص', 'Examinations', { type: 'fixed', amount: 10 }],
  ['Scaling and polishing', 'تنظيف وتلميع', 'Cleaning', { type: 'fixed', amount: 20 }],
  ['Composite filling', 'حشوة تجميلية', 'Restorative', { type: 'fixed', amount: 25 }],
  ['Whitening', 'تبييض', 'Cosmetic', { type: 'from', amount: 80, minimum: 80 }],
  ['Root canal', 'علاج العصب', 'Restorative', { type: 'from', amount: 90, minimum: 90 }],
  ['Braces consultation', 'استشارة تقويم', 'Orthodontics', { type: 'fixed', amount: 15 }],
  ['Implant', 'زراعة', 'Surgery', { type: 'quote' }],
];

export async function seedDental({ m, tenant, call, hasib, executeMessaging, DAY, HOUR }) {
  const at = daysAgo => Date.now() - daysAgo * DAY + 3 * HOUR;

  // Treatments live in Layla's catalog, which is what she quotes; Hasib charges them on visits.
  for (const [i, [nameEn, nameAr, category, price]] of TREATMENTS.entries()) {
    const label = price.type === 'quote' ? 'On request' : price.type === 'from' ? `From ${price.amount} OMR` : `${price.amount} OMR`;
    await m.db.insert('blueCatalogEntries', { ownerKey: String(tenant.accountId), entryKey: randomUUID(), kind: 'service', status: 'approved', nameEn, nameAr, category,
      benefitEn: '', benefitAr: '', descriptionEn: '', descriptionAr: '', availability: 'Saturday to Thursday, 9am–9pm',
      prices: [{ currency: 'OMR', unit: 'visit', label, ...price }], source: 'owner', confidence: 1, laylaUseEn: '', laylaUseAr: '', revision: 1, sortOrder: i, createdAt: m.now(), updatedAt: m.now() });
  }
  await hasib('services_sync', {});
  const items = (await hasib('items', { limit: 50 })).items;
  const treatment = nameEn => items.find(i => i.nameEn === nameEn).variants[0];

  // Supplies the clinic keeps count of (internal: never shown to patients).
  const supply = async (nameEn, nameAr, unit, onHand, reorderPoint, cost) => (await hasib('item_save', { requestId: randomUUID(),
    item: { kind: 'product', nameAr, nameEn, category: 'Supplies', unit, trackStock: true },
    variants: [{ sku: '', options: [], priceMinor: 0, costMinor: cost, reorderPoint, openingStock: onHand }] }, at(29))).variants[0];
  await supply('Nitrile gloves', 'قفازات نيتريل', 'box', 3, 5, 3500);
  await supply('Anaesthetic cartridges', 'أمبولات تخدير', 'box', 12, 4, 18000);
  await supply('Composite resin', 'مادة الحشو التجميلي', 'syringe', 2, 3, 9500);
  await supply('Face masks', 'كمامات', 'box', 20, 6, 2000);

  const people = [['96893300001', 'سارة الحبسية'], ['96893300002', 'Hamed Al Siyabi'], ['96893300003', 'منى العبرية'], ['96893300004', 'Yasmin Al Zadjali'],
    ['96893300005', 'علي البلوشي'], ['96893300006', 'Fatma Al Mamari'], ['96893300007', 'خالد المعولي'], ['96893300008', 'Rawan Al Hosni'],
    ['96893300009', 'بدر الكلباني'], ['96893300010', 'Huda Al Wahaibi']];
  const contactOf = i => m.table('blueContacts').find(c => c.waId === people[i][0] && c.state === 'active')?._id;
  const events = [];
  const say = (daysAgo, who, text, intent, reply, handoff = false) => events.push({ t: at(daysAgo) - HOUR, run: async () => {
    const t = at(daysAgo) - HOUR; if (t > m.now()) m.advance(t - m.now());
    await call(executeMessaging, 'ingest', { integrationId: tenant.integration.id, events: [{ kind: 'message', id: `dental-${randomUUID()}`, from: people[who][0], at: m.now(), text,
      reply, intent, handoff, profileName: people[who][1] }] });
  } });
  /** A visit: treatments charged, paid in full, part, or not yet; optionally refunded later. */
  const visit = (daysAgo, lines, { who, method = 'card', paid = 'full', done = true, date, refund } = {}) => events.push({ t: at(daysAgo), run: async () => {
    const t = at(daysAgo);
    let o = await hasib('order_create', { requestId: randomUUID(), channel: who !== undefined ? 'whatsapp' : 'walk_in', confirm: true, fulfilment: { type: 'in_store' },
      lines: lines.map(([name, qty = 1, price]) => ({ variantId: treatment(name).id, qty, ...(price ? { unitPriceMinor: price } : {}) })),
      ...(who !== undefined ? { contactId: contactOf(who) } : {}),
      customFields: [{ key: 'visit_date', value: date || new Date(t + 4 * HOUR).toISOString().slice(0, 10) }, { key: 'branch', value: 'Qurum' }] }, t);
    const amount = paid === 'full' ? o.totalMinor : paid === 'part' ? Math.round(o.totalMinor / 2000) * 1000 : 0;
    if (amount) o = (await hasib('payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: amount, method }, t + HOUR)).order;
    if (done) o = await hasib('order_status', { orderId: o.id, to: 'completed', version: o.version }, t + 2 * HOUR);
    // A refunded visit: marked refunded (closed), then the money goes back.
    if (refund) {
      o = await hasib('order_status', { orderId: o.id, to: 'returned', version: o.version }, t + 3 * HOUR);
      await hasib('payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: -o.paidMinor, method }, t + 3 * HOUR);
    }
  } });

  // A month of reception work and visits.
  say(28, 0, 'السلام عليكم، كم سعر تنظيف الأسنان؟', 'prices', 'تنظيف وتلميع الأسنان بسعر 20 ر.ع.');
  say(28, 0, 'أبغى موعد تنظيف يوم الأحد', 'disabled', 'سيتواصل معك الفريق لتأكيد الموعد.');
  visit(27, [['Scaling and polishing']], { who: 0, method: 'cash' });
  say(25, 1, 'Hi, what services do you offer?', 'services', 'We offer check-ups, cleaning, fillings, whitening, root canal, braces consultations and implants.');
  say(25, 1, 'How much is whitening?', 'prices', 'Whitening starts from 80 OMR.');
  visit(22, [['Check-up'], ['Whitening']], { who: 1, method: 'card' });
  say(21, 2, 'عندكم استشارة تقويم؟', 'services', 'نعم، استشارة التقويم بسعر 15 ر.ع.');
  visit(20, [['Braces consultation']], { who: 2, method: 'bank_transfer' });
  visit(19, [['Check-up'], ['Composite filling', 2]], { method: 'card' });
  say(17, 3, 'I would like a check-up on Thursday at the clinic', 'disabled', 'The team will confirm your appointment.');
  visit(15, [['Check-up'], ['Scaling and polishing']], { who: 3, method: 'card' });
  visit(14, [['Root canal', 1, 110000]], { method: 'card', paid: 'part', done: false });
  say(12, 4, 'كم سعر علاج العصب؟', 'prices', 'علاج العصب يبدأ من 90 ر.ع.');
  visit(11, [['Root canal', 1, 95000]], { who: 4, method: 'cash', paid: 'part', done: false });
  visit(9, [['Composite filling']], { method: 'cash' });
  visit(8, [['Whitening']], { method: 'card', refund: true });
  say(7, 5, 'Can I book a cleaning next week?', 'disabled', 'The team will confirm your appointment.');
  visit(6, [['Scaling and polishing'], ['Check-up']], { who: 5, method: 'card' });
  visit(4, [['Check-up']], { method: 'cash' });
  visit(3, [['Composite filling'], ['Check-up']], { method: 'card', paid: 'none', done: false });
  // Recent requests with no visit yet, and today's reception.
  say(2, 6, 'أبغى تبييض الأسنان، متى يناسبكم؟', 'services', 'التبييض يبدأ من 80 ر.ع. سيتواصل معك الفريق.');
  say(1, 7, 'I would like a check-up tomorrow at 5pm at the clinic', 'disabled', 'The team will confirm your appointment.');
  visit(0.5, [['Check-up'], ['Scaling and polishing']], { method: 'cash' });
  say(0.4, 8, 'كم سعر الحشوة التجميلية؟', 'prices', 'الحشوة التجميلية بسعر 25 ر.ع.');
  say(0.3, 8, 'أبغى حشوة تجميلية بكره الساعه 6 مساء', 'disabled', 'سيتواصل معك الفريق لتأكيد الموعد.');
  say(0.2, 9, 'Can I talk to someone at reception please?', 'human', 'I’ll connect you with the team.', true);
  visit(0.1, [['Braces consultation']], { method: 'card', paid: 'none', done: false });

  // The everyday list: walk-in and returning patients most days.
  for (let d = 29; d >= 1; d--) {
    if (d % 7 === 6) continue; // Friday closed
    visit(d + 0.3, [['Check-up'], ['Scaling and polishing']], { method: d % 2 ? 'cash' : 'card' });
    visit(d + 0.25, [[d % 3 ? 'Composite filling' : 'Check-up']], { method: 'card' });
    if (d % 4 === 0) visit(d + 0.2, [['Whitening', 1, 90000]], { method: 'bank_transfer' });
  }
  for (const e of events.sort((x, y) => x.t - y.t)) await e.run();

  const expense = (daysAgo, category, amount, vendor, method = 'bank_transfer') => hasib('expense_create', { requestId: randomUUID(), category, amountMinor: amount, method,
    paidOn: new Date(at(daysAgo) + 4 * HOUR).toISOString().slice(0, 10), vendor }, at(daysAgo));
  await expense(26, 'rent', 650000, 'Qurum clinic landlord');
  await expense(2, 'salaries', 1150000, 'Dentist, hygienist and receptionist');
  await expense(20, 'supplies', 85000, 'Dental supplies trader');
  await expense(12, 'lab_fees', 120000, 'Dental lab');
  await expense(9, 'equipment', 45000, 'Chair maintenance', 'cash');
  await expense(5, 'utilities', 68000, 'Nama electricity');
}
