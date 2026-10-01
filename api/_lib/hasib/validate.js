import { BOOKING_OPERATIONS, JOB_OPERATIONS, REAL_ESTATE_OPERATIONS, TEAM_OPERATIONS, CLINIC_OPERATIONS, CONSTRUCTION_OPERATIONS, AUTOMOTIVE_OPERATIONS } from '../../../config/hasib-workflow-operations.js';
// Per-action argument allow-lists for the Hasib API. Unknown keys are dropped,
// strings are length-bounded, numbers must already be integers (money is sent
// in minor units and never coerced from a string). Convex re-validates all of it.
import { PilotError } from '../layla/config.js';

const ID = /^[A-Za-z0-9_-]{1,64}$/, UUID = /^[a-f0-9-]{36}$/;
const id = v => typeof v === 'string' && ID.test(v) ? v : undefined;
const uuid = v => typeof v === 'string' && UUID.test(v) ? v : undefined;
const str = (v, n) => typeof v === 'string' && v.length <= n ? v : undefined;
const int = v => Number.isSafeInteger(v) ? v : undefined;
const quantity = v => typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const bool = v => v === true;
const list = (v, max, fn) => Array.isArray(v) ? v.slice(0, max).map(fn) : undefined;
const pair = (k, n) => o => ({ key: str(o?.key, 40) || '', value: str(o?.value, n) || '' });
const compact = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const serialsOf = v => list(v, 100, x => str(x, 40) || '');
const line = l => compact({ variantId: id(l?.variantId), name: str(l?.name, 120), qty: int(l?.qty) ?? 0, unitPriceMinor: int(l?.unitPriceMinor), discountMinor: int(l?.discountMinor), serials: serialsOf(l?.serials), modifierKeys: list(l?.modifierKeys, 20, x => str(x, 40) || '') });
const part = p => compact({ variantId: id(p?.variantId) || '', qty: int(p?.qty) ?? 0, unitPriceMinor: int(p?.unitPriceMinor) });
const variant = v => compact({ variantId: id(v?.variantId), sku: str(v?.sku, 40) ?? '', options: list(v?.options, 3, pair('key', 40)) || [], priceMinor: int(v?.priceMinor) ?? -1,
  costMinor: int(v?.costMinor), reorderPoint: int(v?.reorderPoint), openingStock: int(v?.openingStock) });
const item = i => i && typeof i === 'object' ? compact({ kind: str(i.kind, 20) || '', nameAr: str(i.nameAr, 120) ?? '', nameEn: str(i.nameEn, 120) ?? '', category: str(i.category, 60) ?? '',
  unit: str(i.unit, 20) || 'piece', trackStock: bool(i.trackStock), catalogEntryKey: uuid(i.catalogEntryKey), serialized: bool(i.serialized) || undefined,
  warrantyMonths: int(i.warrantyMonths), warrantyBy: str(i.warrantyBy, 10), photoId: typeof i.photoId === 'string' && /^[A-Za-z0-9_-]{0,64}$/.test(i.photoId) ? i.photoId : undefined }) : undefined;

const importVariant = v => compact({ sku: str(v?.sku, 40) ?? '', options: list(v?.options, 3, pair('key', 40)) || [], priceMinor: int(v?.priceMinor) ?? -1, costMinor: int(v?.costMinor),
  reorderPoint: int(v?.reorderPoint), quantity: int(v?.quantity), serials: list(v?.serials, 200, x => str(x, 40) || '') });
const importProduct = p => ({ requestId: uuid(p?.requestId) || '', item: item(p?.item) || {}, variants: list(p?.variants, 50, importVariant) || [] });
const recipeIngredient = i => compact({ variantId: id(i?.variantId), qty: quantity(i?.qty), unit: str(i?.unit, 20) });
const restaurantLine = i => compact({ variantId: id(i?.variantId), qty: quantity(i?.qty), unitCostMinor: int(i?.unitCostMinor), useBy: str(i?.useBy, 10) });

/** Actions whose id-bearing argument is required; a malformed id is refused rather than dropped. */
const REQUIRED = { item_photo: 'itemId', order: 'orderId', order_status: 'orderId', payment_record: 'orderId', item_archive: 'itemId', stock_moves: 'variantId', stock_move: 'variantId', contact_summary: 'contactId', conversation_orders: 'conversationId', expense_void: 'expenseId', serials: 'variantId', trade_in: 'variantId', repair: 'repairId', repair_update: 'repairId', repair_status: 'repairId', recipe_save: 'menuVariantId', waste_create: 'variantId', stock_count: 'variantId', batch_create: 'outputVariantId' };
// A Real Estate save that names an existing record is an update, versioned rather than replay-keyed.
const UPDATED_BY = { opportunity_save: 'opportunityId', viewing_save: 'viewingId', offer_save: 'offerId', draft_save: 'draftId' };
const NEEDS_REQUEST = new Set(['order_create', 'payment_record', 'stock_move', 'expense_create', 'trade_in', 'repair_create', 'waste_create', 'stock_count', 'stock_receive', 'batch_create']);

const SHAPES = {
  items: b => ({ search: str(b.search, 80), cursor: str(b.cursor, 100), limit: int(b.limit), kind: ['product', 'service'].includes(b.kind) ? b.kind : undefined }),
  low_stock: () => ({}),
  today: () => ({}),
  services_sync: () => ({}),
  item_save: b => ({ requestId: uuid(b.requestId), itemId: id(b.itemId), item: item(b.item), variants: list(b.variants, 50, variant) }),
  item_archive: b => ({ itemId: id(b.itemId) }),
  item_photo: b => ({ itemId: id(b.itemId), photoId: typeof b.photoId === 'string' && /^[A-Za-z0-9_-]{0,64}$/.test(b.photoId) ? b.photoId : undefined }),
  items_import: b => ({ products: list(b.products, 25, importProduct) || [] }),
  stock_move: b => ({ requestId: uuid(b.requestId), variantId: id(b.variantId), delta: int(b.delta), reason: str(b.reason, 20), unitCostMinor: int(b.unitCostMinor), note: str(b.note, 200), serials: serialsOf(b.serials) }),
  stock_moves: b => ({ variantId: id(b.variantId), cursor: str(b.cursor, 100), limit: int(b.limit) }),
  orders: b => ({ status: str(b.status, 20), cursor: str(b.cursor, 100), limit: int(b.limit) }),
  order: b => ({ orderId: id(b.orderId) }),
  order_create: b => ({ requestId: uuid(b.requestId), channel: str(b.channel, 20), confirm: bool(b.confirm), contactId: id(b.contactId), conversationId: id(b.conversationId),
    customerName: str(b.customerName, 80), lines: list(b.lines, 50, line) || [], deliveryFeeMinor: int(b.deliveryFeeMinor), channelCostMinor: int(b.channelCostMinor), notes: str(b.notes, 500),
    fulfilment: b.fulfilment && typeof b.fulfilment === 'object' ? compact({ type: str(b.fulfilment.type, 20) || '', area: str(b.fulfilment.area, 80), dueAt: int(b.fulfilment.dueAt) }) : { type: '' },
    customFields: list(b.customFields, 10, pair('key', 300)) }),
  order_status: b => ({ orderId: id(b.orderId), to: str(b.to, 20), version: int(b.version), disposition: str(b.disposition, 20),
    lineSerials: list(b.lineSerials, 50, p => compact({ variantId: id(p?.variantId) || '', serials: serialsOf(p?.serials) || [] })) }),
  payment_record: b => ({ requestId: uuid(b.requestId), orderId: id(b.orderId), amountMinor: int(b.amountMinor), method: str(b.method, 20), reference: str(b.reference, 80) }),
  contact_summary: b => ({ contactId: id(b.contactId) }),
  conversation_orders: b => ({ conversationId: id(b.conversationId) }),
  expense_create: b => ({ requestId: uuid(b.requestId), category: str(b.category, 40), amountMinor: int(b.amountMinor), vatMinor: int(b.vatMinor), vendor: str(b.vendor, 80),
    method: str(b.method, 20), paidOn: str(b.paidOn, 10), note: str(b.note, 200) }),
  expenses: b => ({ period: str(b.period, 12) }),
  expense_void: b => ({ expenseId: id(b.expenseId) }),
  insights: b => ({ period: str(b.period, 12) }),
  photo_upload_url: () => ({}),
  photo_register: b => ({ storageId: typeof b.storageId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(b.storageId) ? b.storageId : '' }),
  serials: b => ({ variantId: id(b.variantId), status: str(b.status, 20) }),
  serial_lookup: b => ({ serial: str(b.serial, 40) }),
  trade_in: b => ({ requestId: uuid(b.requestId), variantId: id(b.variantId), serial: str(b.serial, 40), costMinor: int(b.costMinor), method: str(b.method, 20),
    contactId: id(b.contactId), customerName: str(b.customerName, 80), note: str(b.note, 200) }),
  repairs: b => ({ status: str(b.status, 20), cursor: str(b.cursor, 100), limit: int(b.limit) }),
  repair: b => ({ repairId: id(b.repairId) }),
  repair_create: b => ({ requestId: uuid(b.requestId), device: str(b.device, 80), serial: str(b.serial, 40), fault: str(b.fault, 500), accessories: str(b.accessories, 200),
    contactId: id(b.contactId), conversationId: id(b.conversationId), customerName: str(b.customerName, 80), quoteMinor: int(b.quoteMinor), dueAt: int(b.dueAt) }),
  repair_approval: b => ({repairId:id(b.repairId),version:int(b.version),approvedBy:str(b.approvedBy,100)}),
  repair_update: b => ({ repairId: id(b.repairId), version: int(b.version), labourMinor: int(b.labourMinor), fault: str(b.fault, 500), parts: list(b.parts, 20, part) }),
  repair_status: b => ({ repairId: id(b.repairId), to: str(b.to, 20), version: int(b.version) }),
  baking_suggestions: () => ({}),
  order_preparation: b => ({ orderId:id(b.orderId), version:int(b.version), checklist:list(b.checklist,30,c=>compact({text:str(c?.text,160),done:typeof c?.done==='boolean'?c.done:undefined})) }),
  recipes: b => ({ limit: int(b.limit) }),
  recipe_save: b => ({ version: int(b.version), modifiers: list(b.modifiers, 20, m => compact({ key: str(m?.key, 40), label: str(m?.label, 80), priceMinor: int(m?.priceMinor), ingredients: list(m?.ingredients, 20, recipeIngredient) || [] })), menuVariantId: id(b.menuVariantId), yieldQty: int(b.yieldQty), ingredients: list(b.ingredients, 50, recipeIngredient) || [] }),
  waste_create: b => ({ requestId: uuid(b.requestId), variantId: id(b.variantId), qty: quantity(b.qty), reason: str(b.reason, 30), note: str(b.note, 200) }),
  stock_count: b => ({ requestId: uuid(b.requestId), variantId: id(b.variantId), countedQty: quantity(b.countedQty), note: str(b.note, 200) }),
  stock_receive: b => ({ requestId: uuid(b.requestId), vendor: str(b.vendor, 100), invoiceNumber: str(b.invoiceNumber, 60), receivedOn: str(b.receivedOn, 10), lines: list(b.lines, 50, restaurantLine) || [] }),
  batch_create: b => ({ requestId: uuid(b.requestId), outputVariantId: id(b.outputVariantId), outputQty: quantity(b.outputQty), inputs: list(b.inputs, 50, i => compact({ variantId: id(i?.variantId), qty: quantity(i?.qty), unit: str(i?.unit, 20) })) || [], note: str(b.note, 200), producedOn: str(b.producedOn, 10), useBy: str(b.useBy, 10) }),
  restaurant_summary: b => ({ period: str(b.period, 12) }),
  stock_expiry: b => ({ days: int(b.days) }),
  settings_update: b => ({ unsoldDays: int(b.unsoldDays), absenceDays: int(b.absenceDays), listingFreshnessDays:int(b.listingFreshnessDays), constructionIncidentHoursDenominator:int(b.constructionIncidentHoursDenominator), stockPolicy: str(b.stockPolicy, 10), packId: str(b.packId, 30),
    vat: b.vat && typeof b.vat === 'object' ? compact({ registered: bool(b.vat.registered), rateBps: int(b.vat.rateBps) ?? -1, pricesIncludeVat: bool(b.vat.pricesIncludeVat), vatin: str(b.vat.vatin, 20) }) : undefined }),
};
const bookingFields = new Set(Object.values(BOOKING_OPERATIONS).flat());
const workflowStrings = new Set('title kind label identifier location availability status viewingOutcome approvedBy reference transactionType propertyType area pricePeriod description authorityStatus source need financeReadiness decisionMakerReadiness timeline nextAction lostReason outcome terms text templateId contractType reason supplier package category severity mitigation'.split(' '));
const workflowIds = new Set('contactId conversationId assignedAccountId equipmentId repeatOfId propertyId opportunityId variantId orderId projectId milestoneId'.split(' '));
const workflowNumbers = new Set('dueAt recurringDays actualMinutes budgetMinor budgetMinMinor budgetMaxMinor nextServiceAt visitsRemaining askingPriceMinor viewingAt followUpAt commissionMinor qty estimateVersion bedrooms bathrooms sizeSqm verificationAt firstInboundAt replyQueuedAt providerSubmittedAt deliveredAt scheduledAt amountMinor originalContractMinor originalBudgetMinor startAt contractFinishAt forecastFinishAt estimateToCompleteMinor weightBps plannedStartAt plannedFinishAt actualProgressBps plannedBps actualBps workerHours asOfAt incurredAt contractDeltaMinor budgetDeltaMinor scheduleDeltaDays requiredAt grossMinor retentionMinor advanceRecoveryMinor netMinor retentionReleaseAt reportDate toolboxTalks inspections recordableIncidents lostTimeIncidents lostDays probability impact'.split(' '));
function workflowShape(w = {}) {
  const out = {};
  for (const k of workflowStrings) if (w[k] !== undefined) out[k] = str(w[k], k === 'title' || k === 'label' ? 120 : 100);
  for (const k of workflowIds) if (w[k] !== undefined) out[k] = id(w[k]);
  for (const k of workflowNumbers) if (w[k] !== undefined) out[k] = int(w[k]);
  if (w.costsComplete !== undefined) out.costsComplete = typeof w.costsComplete === 'boolean' ? w.costsComplete : undefined;
  if (w.rework !== undefined) out.rework = typeof w.rework === 'boolean' ? w.rework : undefined;
  out.checklist = list(w.checklist, 50, c => compact({ text:str(c?.text,160), done: typeof c?.done === 'boolean' ? c.done : undefined }));
  out.costs = list(w.costs, 100, c => compact({ label:str(c?.label,120), amountMinor:int(c?.amountMinor), expenseId:id(c?.expenseId) }));
  out.milestones = list(w.milestones, 50, c => compact({ label:str(c?.label,120), amountMinor:int(c?.amountMinor), dueAt:int(c?.dueAt), withheld: typeof c?.withheld === 'boolean' ? c.withheld : undefined, orderId:id(c?.orderId) }));
  out.extras = list(w.extras, 50, c => compact({ label:str(c?.label,120), amountMinor:int(c?.amountMinor), approved:typeof c?.approved === 'boolean' ? c.approved : undefined, approvedBy:str(c?.approvedBy,100), approvedAt:int(c?.approvedAt) }));
  out.lines = list(w.lines, 50, c => compact({ name:str(c?.name,120), variantId:id(c?.variantId), qty:int(c?.qty), unitPriceMinor:int(c?.unitPriceMinor) }));
  for (const key of ['areas','propertyTypes','mustHaves','features','photoIds']) out[key] = list(w[key], key === 'photoIds' ? 10 : 30, x => str(x, 160) || '');
  for (const key of ['identityStatus','authorityStatus','financingStatus','agreementStatus','completionStatus']) if (w[key] !== undefined) out[key] = str(w[key], 30);
  return compact(out);
}
function bookingField(k, value) {
  if (k === 'cursor') return str(value,2048);
  if (k === 'requestId') return uuid(value);
  if (k.endsWith('Id')) return id(value);
  if (k === 'resourceIds') return list(value, 20, x => id(x) || '');
  if (k === 'availability') return list(value, 100, x => compact({ startsAt:int(x?.startsAt), endsAt:int(x?.endsAt) }));
  if (['name','kind','status','to','reason','linkedType'].includes(k)) return str(value, k === 'reason' ? 160 : 120);
  return int(value);
}
for (const [operation, fields] of Object.entries(BOOKING_OPERATIONS)) {
  SHAPES[operation] = b => Object.fromEntries(fields.filter(k => bookingFields.has(k)).map(k => [k, bookingField(k,b[k])]));
  if (fields.includes('requestId')) NEEDS_REQUEST.add(operation);
}
for (const operation of JOB_OPERATIONS) {
  SHAPES[operation] = b => ({ requestId:uuid(b.requestId), version:int(b.version), jobId:id(b.jobId),equipmentId:id(b.equipmentId),propertyId:id(b.propertyId),enquiryId:id(b.enquiryId),productRequestId:id(b.productRequestId),variantId:id(b.variantId),status:str(b.status,30),cursor:str(b.cursor,2048),limit:int(b.limit),workflow:workflowShape(b.workflow) });
  if (operation.endsWith('_create')) NEEDS_REQUEST.add(operation);
}
for (const operation of REAL_ESTATE_OPERATIONS) {
  SHAPES[operation] = b => ({ requestId:uuid(b.requestId), version:int(b.version), opportunityId:id(b.opportunityId), matchId:id(b.matchId), viewingId:id(b.viewingId), offerId:id(b.offerId), draftId:id(b.draftId), commissionId:id(b.commissionId), taskId:id(b.taskId), propertyId:id(b.propertyId), kind:str(b.kind,30), reason:str(b.reason,200), memberId:id(b.memberId), email:str(b.email,254), commissionMinor:int(b.commissionMinor), status:str(b.status,30), cursor:str(b.cursor,2048), limit:int(b.limit), workflow:workflowShape(b.workflow) });
  if (['opportunity_save','viewing_save','offer_save','draft_save'].includes(operation)) NEEDS_REQUEST.add(operation);
}
for (const operation of TEAM_OPERATIONS) {
  SHAPES[operation] = b => ({ memberId:id(b.memberId), email:str(b.email,254), operationalRole:str(b.operationalRole,30) });
}
const clinicShape = b => ({requestId:uuid(b.requestId),version:int(b.version),cursor:str(b.cursor,2048),limit:int(b.limit),status:str(b.status,40),contactId:id(b.contactId),conversationId:id(b.conversationId),serviceId:id(b.serviceId),bookingId:id(b.bookingId),appointmentRequestId:id(b.appointmentRequestId),notificationId:id(b.notificationId),waitlistId:id(b.waitlistId),waitlistOfferId:id(b.waitlistOfferId),taskId:id(b.taskId),assignedAccountId:id(b.assignedAccountId),source:str(b.source,30),channel:str(b.channel,20),reason:str(b.reason,50),preferredFrom:int(b.preferredFrom),preferredTo:int(b.preferredTo),firstInboundAt:int(b.firstInboundAt),startsAt:int(b.startsAt),expiresAt:int(b.expiresAt),fromAt:int(b.fromAt),toAt:int(b.toAt),preferenceStatus:str(b.preferenceStatus,20),evidenceSource:str(b.evidenceSource,30),evidenceAt:int(b.evidenceAt),notificationKind:str(b.notificationKind,30),idempotencyKey:str(b.idempotencyKey,160),templateId:str(b.templateId,120),outsideServiceWindow:b.outsideServiceWindow===true?true:undefined,rating:int(b.rating),experienceReason:str(b.experienceReason,40),weekStart:str(b.weekStart,10),governance:b.governance&&typeof b.governance==='object'?compact({status:str(b.governance.status,30),jurisdiction:str(b.governance.jurisdiction,2),permitStatus:str(b.governance.permitStatus,40),controller:str(b.governance.controller,120),processor:str(b.governance.processor,120),approvedRegions:list(b.governance.approvedRegions,20,x=>str(x,80)||''),subprocessors:list(b.governance.subprocessors,40,x=>str(x,120)||''),retentionDays:int(b.governance.retentionDays),backupRetentionDays:int(b.governance.backupRetentionDays),supportAccess:str(b.governance.supportAccess,120),incidentOwner:str(b.governance.incidentOwner,120),rightsOwner:str(b.governance.rightsOwner,120),crossBorderStatus:str(b.governance.crossBorderStatus,30)}):undefined});
for(const operation of CLINIC_OPERATIONS){SHAPES[operation]=clinicShape;if(['clinic_request_save','clinic_request_assign','clinic_request_decline','clinic_request_withdraw','clinic_request_book','clinic_preference_update','clinic_notification_queue','clinic_notification_retry','clinic_notification_resolve','clinic_waitlist_offer','clinic_waitlist_expire','clinic_waitlist_cancel','clinic_experience_save','clinic_task_resolve','clinic_governance_update','clinic_metric_snapshot'].includes(operation))NEEDS_REQUEST.add(operation);}
const constructionShape = b => ({requestId:uuid(b.requestId),version:int(b.version),cursor:str(b.cursor,2048),limit:int(b.limit),status:str(b.status,40),projectId:id(b.projectId),milestoneId:id(b.milestoneId),variationId:id(b.variationId),commitmentId:id(b.commitmentId),claimId:id(b.claimId),qualityId:id(b.qualityId),riskId:id(b.riskId),taskId:id(b.taskId),expenseId:id(b.expenseId),rating:int(b.rating),experienceReason:str(b.experienceReason,40),workflow:workflowShape(b.workflow)});
for(const operation of CONSTRUCTION_OPERATIONS){SHAPES[operation]=constructionShape;if(['construction_project_save','construction_milestone_save','construction_progress_save','construction_cost_save','construction_variation_save','construction_commitment_save','construction_claim_save','construction_site_report_save','construction_quality_save','construction_risk_save','construction_experience_save'].includes(operation))NEEDS_REQUEST.add(operation);}
const automotiveWorkflow = w => w && typeof w === 'object' ? compact({
  contactId:id(w.contactId),conversationId:id(w.conversationId),vehicleId:id(w.vehicleId),serviceId:id(w.serviceId),bayId:id(w.bayId),appointmentId:id(w.appointmentId),technicianAccountId:id(w.technicianAccountId),assignedAdvisorAccountId:id(w.assignedAdvisorAccountId),repeatOfId:id(w.repeatOfId),variantId:id(w.variantId),
  name:str(w.name,120),category:str(w.category,40),plate:str(w.plate,24),vin:str(w.vin,32),make:str(w.make,60),model:str(w.model,60),powertrain:str(w.powertrain,20),concern:str(w.concern,500),source:str(w.source,30),channel:str(w.channel,20),status:str(w.status,30),warrantyDisposition:str(w.warrantyDisposition,30),
  year:int(w.year),odometerKm:int(w.odometerKm),nextServiceAt:int(w.nextServiceAt),durationMinutes:int(w.durationMinutes),standardLaborMinutes:int(w.standardLaborMinutes),priceMinor:int(w.priceMinor),preferredFrom:int(w.preferredFrom),preferredTo:int(w.preferredTo),firstInboundAt:int(w.firstInboundAt),startsAt:int(w.startsAt),promisedAt:int(w.promisedAt),qty:int(w.qty),active:typeof w.active==='boolean'?w.active:undefined,
  availability:list(w.availability,100,x=>compact({startsAt:int(x?.startsAt),endsAt:int(x?.endsAt)})),
  checklist:Array.isArray(w.checklist)?w.checklist.slice(0,50).map(x=>typeof x==='string'?str(x,160)||'':compact({text:str(x?.text,160),done:typeof x?.done==='boolean'?x.done:undefined})):undefined,
  items:list(w.items,80,x=>compact({category:str(x?.category,40),condition:str(x?.condition,20),note:str(x?.note,300),photoIds:list(x?.photoIds,12,p=>id(p)||'')})),
  lines:list(w.lines,80,x=>compact({kind:str(x?.kind,20),name:str(x?.name,120),variantId:id(x?.variantId),qty:int(x?.qty),unitPriceMinor:int(x?.unitPriceMinor),standardMinutes:int(x?.standardMinutes)})),
}) : undefined;
const automotiveShape = b => ({requestId:uuid(b.requestId),version:int(b.version),cursor:str(b.cursor,2048),limit:int(b.limit),status:str(b.status,40),reason:str(b.reason,50),vehicleId:id(b.vehicleId),bayId:id(b.bayId),serviceId:id(b.serviceId),appointmentRequestId:id(b.appointmentRequestId),appointmentId:id(b.appointmentId),workOrderId:id(b.workOrderId),estimateId:id(b.estimateId),laborEntryId:id(b.laborEntryId),partAllocationId:id(b.partAllocationId),assignedAccountId:id(b.assignedAccountId),firstResponseSubmittedAt:int(b.firstResponseSubmittedAt),evidenceSource:str(b.evidenceSource,30),approvedBy:str(b.approvedBy,100),rating:int(b.rating),experienceReason:str(b.experienceReason,40),workflow:automotiveWorkflow(b.workflow)});
for(const operation of AUTOMOTIVE_OPERATIONS){SHAPES[operation]=automotiveShape;if(['automotive_vehicle_save','automotive_bay_save','automotive_service_save','automotive_request_save','automotive_request_status','automotive_appointment_save','automotive_appointment_status','automotive_work_order_save','automotive_work_order_status','automotive_inspection_save','automotive_estimate_save','automotive_estimate_status','automotive_approval_record','automotive_labor_start','automotive_labor_stop','automotive_part_save','automotive_part_status','automotive_quality_save','automotive_experience_save'].includes(operation))NEEDS_REQUEST.add(operation);}

export const HASIB_ACTIONS = Object.keys(SHAPES);

export function hasibArgs(action, body) {
  const shape = SHAPES[action];
  if (!shape) throw new PilotError('invalid_action');
  const args = compact(shape(body));
  if (REQUIRED[action] && !args[REQUIRED[action]]) throw new PilotError('invalid_request');
  if (NEEDS_REQUEST.has(action) && !args.requestId && !(UPDATED_BY[action] && args[UPDATED_BY[action]])) throw new PilotError('invalid_request');
  if (action === 'item_save' && !args.itemId && !args.requestId) throw new PilotError('invalid_request');
  return args;
}
