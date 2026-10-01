// Synthetic local preview records. Every operational mutation uses the same API as the dashboard.
import { randomUUID } from 'node:crypto';

const DAY = 86400000, HOUR = 3600000;
const date = time => new Date(time + 4 * HOUR).toISOString().slice(0, 10);
const TITLES = { retail: 'Sample Abayas', 'retail-tech': 'Sample Phones', beauty: 'Sample Salon', dental: 'Sample Dental Reception', clinic: 'Sample Clinic Reception', restaurant: 'Sample Restaurant', cafe: 'Sample Café', cakes: 'Sample Bakery', automotive: 'Sample Garage', fitness: 'Sample Fitness', education: 'Sample Lessons', cleaning: 'Sample Cleaning', hvac: 'Sample Maintenance', construction: 'Sample Projects', 'real-estate': 'Sample Property Agency' };

export async function seedIndustry({ m, tenant, hasib, pack }) {
  if (m.ctx.hasibPreview !== true) throw new Error('Synthetic industry seeds require the local preview context');
  // The retail demo starts its replay a month ago; operational previews should open on today's work.
  if (m.now() < Date.now()) m.advance(Date.now() - m.now());
  const now = m.now(), refs = { packId: pack.id };
  const session = await m.db.get(tenant.rowId);
  await m.db.patch(tenant.rowId, { profile: { ...session.profile, businessName: TITLES[pack.id], services: 'Synthetic local preview', reviewed: true } });
  const contact = async (name, suffix) => {
    const waId = `9689900000${suffix}`;
    return m.db.insert('blueContacts', { accountId: tenant.accountId, key: `synthetic:${pack.id}:${suffix}`, state: 'active', waId, numberHash: String(suffix).repeat(64),
      ownerName: name, source: 'manual', sectorId: pack.id, fields: [], qualificationStatus: 'new', consent: { status: 'unknown' }, optout: false,
      searchText: `${name} ${waId}`, lastActivityAt: now, createdAt: now, updatedAt: now });
  };
  refs.contactId = await contact('Sample customer / عميل تجريبي', 1);
  refs.secondContactId = await contact('Sample second customer / عميل ثانٍ', 2);
  refs.conversationId = await m.db.insert('blueConversations', { accountId: tenant.accountId, key: `synthetic:${pack.id}`, integrationId: tenant.integration.id,
    number: '96899000001', contactId: refs.contactId, version: 1, lastInbound: now, takeover: true, optout: false, updatedAt: now });
  const run = (operation, args = {}) => hasib(operation, args, m.now());
  const create = (operation, args = {}) => run(operation, { requestId: randomUUID(), ...args });
  const product = async (nameEn, nameAr, { stock = 0, price = 0, cost = 0, tracked = true, serialized = false, unit = 'piece', options = [] } = {}) => {
    const saved = await create('item_save', { item: { kind: 'product', nameEn, nameAr, category: tracked ? 'Supplies' : 'Menu', unit, trackStock: tracked,
      ...(serialized ? { serialized: true, warrantyMonths: 12, warrantyBy: 'store' } : {}) },
      variants: [{ sku: `DEMO-${randomUUID().slice(0, 8)}`, options, priceMinor: price, costMinor: cost, reorderPoint: 3, openingStock: stock }] });
    return saved.variants[0].id;
  };
  const charge = args => create('order_create', { contactId: refs.contactId, channel: 'walk_in', confirm: true, fulfilment: { type: 'in_store' }, ...args });
  const pay = order => create('payment_record', { orderId: order.id, amountMinor: Math.min(order.totalMinor, 5000), method: 'cash' });
  const complete = order => run('order_status', { orderId: order.id, version: order.version, to: 'completed' });
  const followup = (linkedType, linkedId) => create('followup_save', { contactId: refs.contactId, conversationId: refs.conversationId, dueAt: m.now(), reason: 'Owner chose this follow-up date', ...(linkedId ? { linkedType, linkedId } : {}) });

  if (['beauty', 'dental', 'clinic', 'fitness', 'education'].includes(pack.id)) {
    const resource = await create('resource_save', { name: 'Sample provider / الموظف', kind: 'provider', capacity: pack.id === 'fitness' ? 8 : 1 });
    const room = await create('resource_save', { name: 'Sample room / الغرفة', kind: 'room', capacity: pack.id === 'fitness' ? 8 : 1 });
    const service = await create('service_save', { name: pack.id === 'education' ? 'Lesson / درس' : pack.id === 'fitness' ? 'Class / حصة' : 'Visit / زيارة', durationMinutes: 30, resourceIds: [resource.id, room.id] });
    const order = await charge({ lines: [{ name: pack.id === 'education' ? 'Four lessons' : 'Recorded visit charge', qty: 1, unitPriceMinor: 20000 }] });
    refs.orderId = order.id;
    await pay(order);
    let membership;
    if (['fitness', 'education'].includes(pack.id)) {
      const guardianId = pack.id === 'education' ? await contact('Sample paying guardian / ولي الأمر', 3) : undefined;
      membership = await create('membership_create', { contactId: refs.contactId, ...(guardianId ? { guardianId } : {}), orderId: order.id,
        kind: pack.id === 'education' ? 'lessons' : 'membership', name: pack.id === 'education' ? 'Four prepaid lessons / أربعة دروس' : 'Monthly membership / اشتراك شهري',
        startsAt: now - DAY, endsAt: now + 5 * DAY, ...(pack.id === 'education' ? { credits: 4 } : {}) });
      refs.membershipId = membership.id;
    }
    let visit = await create('booking_create', { serviceId: service.id, contactId: refs.contactId, startsAt: now - HOUR, orderId: order.id, ...(membership ? { membershipId: membership.id } : {}) });
    for (const to of ['confirmed', 'arrived', ...(pack.id === 'clinic' ? ['in_service'] : []), 'completed']) visit = await create('booking_status', { bookingId: visit.id, version: visit.version, to });
    refs.completedBookingId = visit.id;
    refs.futureBookingId = (await create('booking_create', { serviceId: service.id, contactId: refs.contactId, startsAt: now + HOUR, ...(membership ? { membershipId: membership.id } : {}) })).id;
    refs.waitlistId = (await create('waitlist_add', { serviceId: service.id, contactId: refs.secondContactId, earliestAt: now, latestAt: now + DAY })).id;
    await followup('booking', visit.id);
    await complete((await run('order', { orderId: order.id })));
  } else if (['restaurant', 'cafe', 'cakes'].includes(pack.id)) {
    const first = await product(pack.id === 'cakes' ? 'Flour' : 'Milk', pack.id === 'cakes' ? 'طحين' : 'حليب', { cost: 1000 });
    const second = await product(pack.id === 'cakes' ? 'Butter' : 'Coffee', pack.id === 'cakes' ? 'زبدة' : 'قهوة', { cost: 500 });
    const packaging = await product('Packaging', 'عبوة', { cost: 100 });
    const menu = await product(pack.id === 'cakes' ? 'Vanilla cake' : pack.id === 'cafe' ? 'Latte' : 'Lunch plate', pack.id === 'cakes' ? 'كيك فانيلا' : pack.id === 'cafe' ? 'لاتيه' : 'طبق غداء', { tracked: pack.id === 'cakes', price: 12000, options: pack.id === 'cakes' ? [{ key: 'size', value: 'Medium' }, { key: 'flavour', value: 'Vanilla' }] : [] });
    await create('stock_receive', { vendor: 'Synthetic supplier', receivedOn: date(now), lines: [first, second, packaging].map((variantId, i) => ({ variantId, qty: 30, unitCostMinor: [1000, 500, 100][i], useBy: date(now + 3 * DAY) })) });
    await create('stock_count', { variantId: first, countedQty: 30, note: 'Opening physical count' });
    if (pack.id === 'cakes') {
      refs.batchId = (await create('batch_create', { outputVariantId: menu, outputQty: 4, inputs: [{ variantId: first, qty: 4, unit: 'piece' }, { variantId: second, qty: 2, unit: 'piece' }, { variantId: packaging, qty: 4, unit: 'piece' }], producedOn: date(now), useBy: date(now + 2 * DAY), note: 'Owner-approved dates, synthetic morning bake' })).id;
    } else await run('recipe_save', { menuVariantId: menu, yieldQty: 1, ingredients: [{ variantId: first, qty: 1, unit: 'piece' }, { variantId: second, qty: 1, unit: 'piece' }, { variantId: packaging, qty: 1, unit: 'piece' }],
      ...(pack.id === 'cafe' ? { modifiers: [{ key: 'extra_shot', label: 'Extra shot / جرعة إضافية', priceMinor: 500, ingredients: [{ variantId: second, qty: 1, unit: 'piece' }] }] } : {}) });
    let order = await charge({ lines: [{ variantId: menu, qty: 1, ...(pack.id === 'cafe' ? { modifierKeys: ['extra_shot'] } : {}) }],
      ...(pack.id === 'cakes' ? { fulfilment: { type: 'pickup', dueAt: now + HOUR }, customFields: [{ key: 'inscription', value: 'Sample celebration' }] } : { channelCostMinor: 500 }) });
    refs.orderId = order.id;
    await pay(order);
    if (pack.id !== 'cakes') order = await complete(await run('order', { orderId: order.id }));
    refs.wasteId = (await create('waste_create', { variantId: first, qty: 1, reason: pack.id === 'cafe' ? 'remake' : 'spoilage', note: 'Synthetic owner-recorded waste' })).id;
    await create('stock_count', { variantId: first, countedQty: (await m.db.get(first)).onHand, note: 'Closing physical count' });
    refs.ingredientId = first;
    refs.menuVariantId = menu;
    await followup('order', order.id);
  } else if (pack.id === 'automotive') {
    const part = await product('Oil filter', 'فلتر زيت', { stock: 12, price: 5000, cost: 2000 });
    const bay = await create('automotive_bay_save', { workflow: { name: 'Bay 1 / المسار ١', availability: [{ startsAt: now - DAY, endsAt: now + 7 * DAY }] } });
    const service = await create('automotive_service_save', { workflow: { name: 'Routine service / صيانة دورية', category: 'maintenance', durationMinutes: 90, standardLaborMinutes: 90, priceMinor: 25000, checklist: ['Fluids / السوائل', 'Brakes / الفرامل'] } });
    const vehicle = await create('automotive_vehicle_save', { workflow: { contactId: refs.contactId, plate: 'SYN 1234', vin: 'SYNTHETIC00000001', make: 'Sample', model: 'Sedan', year: 2024, powertrain: 'petrol', odometerKm: 32000, nextServiceAt: now + 180 * DAY } });
    refs.vehicleId = vehicle.id;
    refs.appointmentId = (await create('automotive_appointment_save', { workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: tenant.accountId, startsAt: now + HOUR } })).id;
    let work = await create('automotive_work_order_save', { workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: tenant.accountId, concern: 'Routine service requested / طلب صيانة دورية', promisedAt: now + 4 * HOUR, odometerKm: 32000 } });
    let estimate = await create('automotive_estimate_save', { workOrderId: work.id, workflow: { lines: [{ kind: 'labor', name: 'Routine service', qty: 1, unitPriceMinor: 25000, standardMinutes: 90 }, { kind: 'part', name: 'Oil filter', variantId: part, qty: 1, unitPriceMinor: 5000 }] } });
    estimate = await create('automotive_estimate_status', { estimateId: estimate.id, version: estimate.version, status: 'issued' });
    work = await run('automotive_work_order', { workOrderId: work.id });
    work = await create('automotive_approval_record', { workOrderId: work.id, version: work.version, estimateId: estimate.id, evidenceSource: 'in_person', approvedBy: 'Sample customer' });
    const allocation = await create('automotive_part_save', { workOrderId: work.id, workflow: { variantId: part, qty: 1, status: 'reserved' } });
    await create('automotive_part_status', { partAllocationId: allocation.id, version: allocation.version, status: 'issued' });
    work = await create('automotive_work_order_status', { workOrderId: work.id, version: work.version, status: 'in_progress' });
    const clock = await create('automotive_labor_start', { workOrderId: work.id });
    m.advance(90 * 60000);
    await create('automotive_labor_stop', { laborEntryId: clock.id, version: clock.version });
    work = await run('automotive_work_order', { workOrderId: work.id });
    work = await create('automotive_work_order_status', { workOrderId: work.id, version: work.version, status: 'quality_check' });
    work = await create('automotive_quality_save', { workOrderId: work.id, version: work.version, workflow: { checklist: [{ text: 'Final check / الفحص النهائي', done: true }] } });
    work = await create('automotive_work_order_status', { workOrderId: work.id, version: work.version, status: 'ready' });
    await pay(await run('order', { orderId: work.orderId }));
    await followup('order', work.orderId);
    refs.workOrderId = work.id;
    refs.orderId = work.orderId;
  } else if (['cleaning', 'hvac', 'construction'].includes(pack.id)) {
    const kind = { cleaning: 'cleaning', hvac: 'maintenance', construction: 'construction' }[pack.id];
    let equipment;
    if (['automotive', 'hvac'].includes(pack.id)) equipment = await create('equipment_save', { workflow: { contactId: refs.contactId, label: pack.id === 'hvac' ? 'Sample air conditioner' : 'Sample vehicle', identifier: 'SYNTHETIC-01', nextServiceAt: now, visitsRemaining: 3 } });
    let job = await create('job_create', { workflow: { title: 'Sample agreed work / عمل متفق عليه', kind, contactId: refs.contactId, dueAt: now + HOUR,
      ...(equipment ? { equipmentId: equipment.id } : {}), ...(['cleaning', 'hvac'].includes(pack.id) ? { recurringDays: 30 } : {}),
      checklist: [{ text: 'Owner completion check / فحص الإنجاز', done: false }], actualMinutes: 45, costs: [{ label: 'Recorded labour and supplies', amountMinor: 3000 }], costsComplete: true,
      ...(pack.id === 'construction' ? { budgetMinor: 50000, milestones: [{ label: 'Stage payment', amountMinor: 10000, dueAt: now, withheld: false }, { label: 'Withheld amount', amountMinor: 2000, dueAt: now, withheld: true }], extras: [{ label: 'Extra paint requested', amountMinor: 1500, approved: false }] } : {}) } });
    job = await run('job_estimate', { jobId: job.id, version: job.version, workflow: { lines: [{ name: 'Approved work', qty: 1, unitPriceMinor: 15000 }] } });
    job = await run('job_approve', { jobId: job.id, version: job.version, workflow: { estimateVersion: 1, approvedBy: 'Sample customer' } });
    refs.orderId = job.orderId;
    job = await run('job_status', { jobId: job.id, version: job.version, workflow: { status: 'in_progress' } });
    job = await run('job_update', { jobId: job.id, version: job.version, workflow: { checklist: [{ text: 'Owner completion check / فحص الإنجاز', done: true }] } });
    job = await run('job_status', { jobId: job.id, version: job.version, workflow: { status: 'completed' } });
    await pay(await run('order', { orderId: job.orderId }));
    refs.jobId = job.id;
    if (job.recurringDays) refs.nextJobId = (await create('job_repeat', { jobId: job.id, version: job.version })).id;
    await followup('job', job.id);
  } else if (pack.id === 'real-estate') {
    // The deal pipeline end to end: a verified listing, a qualified buyer, a viewing, an approved and accepted offer,
    // five compliance checks, then the close that books only the agency's commission.
    let property = await create('property_save', { workflow: { label: 'Sample two-bedroom apartment', reference: 'DEMO-1', transactionType: 'sale', propertyType: 'apartment', area: 'Muscat', location: 'Muscat', askingPriceMinor: 65000000, bedrooms: 2, authorityStatus: 'confirmed', availability: 'available' } });
    property = await run('property_verify', { propertyId: property.id, version: property.version });
    const deal = await create('opportunity_save', { workflow: { contactId: refs.contactId, conversationId: refs.conversationId, need: 'buy', areas: ['Muscat'], propertyTypes: ['apartment'], budgetMinMinor: 50000000, budgetMaxMinor: 70000000, bedrooms: 2, financeReadiness: 'cash', decisionMakerReadiness: 'ready', timeline: '30 days', mustHaves: [] } });
    const viewing = await create('viewing_save', { workflow: { opportunityId: deal.id, propertyId: property.id, status: 'confirmed', scheduledAt: now - HOUR } });
    await run('viewing_save', { viewingId: viewing.id, version: viewing.version, workflow: { status: 'completed', outcome: 'Owner recorded agreement' } });
    let offer = await create('offer_save', { workflow: { opportunityId: deal.id, propertyId: property.id, amountMinor: 64000000, terms: 'Cash, completion in 30 days' } });
    offer = await run('offer_approve', { offerId: offer.id, version: offer.version });
    offer = await run('offer_save', { offerId: offer.id, version: offer.version, workflow: { status: 'presented' } });
    offer = await run('offer_save', { offerId: offer.id, version: offer.version, workflow: { status: 'accepted' } });
    let check;
    for (const kind of ['identity', 'authority', 'financing', 'agreement', 'completion']) check = await run('compliance_update', { opportunityId: deal.id, version: check?.version, kind, status: 'confirmed' });
    const commission = await run('deal_close', { opportunityId: deal.id, offerId: offer.id, commissionMinor: 150000 });
    refs.opportunityId = deal.id;
    refs.propertyId = property.id;
    refs.orderId = commission.orderId;
    let order = await run('order', { orderId: commission.orderId });
    order = await run('order_status', { orderId: order.id, version: order.version, to: 'confirmed' });
    await complete(order);
    await pay(await run('order', { orderId: commission.orderId }));
    await create('opportunity_save', { workflow: { contactId: refs.secondContactId, need: 'rent', areas: ['Seeb'], propertyTypes: ['villa'], budgetMinMinor: 0, budgetMaxMinor: 600000, financeReadiness: 'unknown', decisionMakerReadiness: 'unknown', timeline: 'unknown', mustHaves: [] } });
    await followup('property', property.id);
  } else if (['retail', 'retail-tech'].includes(pack.id)) {
    const tech = pack.id === 'retail-tech';
    const variantId = await product(tech ? 'Sample phone' : 'Sample black abaya', tech ? 'هاتف تجريبي' : 'عباية سوداء تجريبية', { stock: tech ? 0 : 5, price: tech ? 150000 : 20000, cost: tech ? 90000 : 8000, serialized: tech, options: tech ? [] : [{ key: 'size', value: '54' }, { key: 'colour', value: 'Black' }] });
    if (tech) await create('stock_move', { variantId, delta: 2, reason: 'stock_in', serials: ['DEMO-PHONE-001', 'DEMO-PHONE-002'], unitCostMinor: 90000 });
    const order = await charge({ lines: [{ variantId, qty: 1, ...(tech ? { serials: ['DEMO-PHONE-001'] } : {}) }] });
    refs.orderId = order.id;
    refs.variantId = variantId;
    await complete(order);
    await pay(await run('order', { orderId: order.id }));
    refs.productRequestId = (await create('product_request_create', { workflow: { contactId: refs.secondContactId, variantId, qty: 1 } })).id;
    if (tech) refs.repairId = (await create('repair_create', { contactId: refs.contactId, device: 'Sample customer phone', fault: 'Owner-reported charging issue', quoteMinor: 15000, dueAt: now - HOUR })).id;
    await followup('order', order.id);
  } else throw new Error(`No synthetic journey for ${pack.id}`);
  return refs;
}
