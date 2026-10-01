import { v } from 'convex/values';
import { HASIB_OPERATIONS } from './hasibState.js';
const option = v.object({ key: v.string(), value: v.string() });
const ingredient = v.object({ variantId: v.string(), qty: v.number(), unit: v.string() });
const receiptLine = v.object({ variantId: v.string(), qty: v.number(), unitCostMinor: v.number(), useBy: v.optional(v.string()) });
const line = v.object({ variantId: v.optional(v.string()), name: v.optional(v.string()), qty: v.number(), unitPriceMinor: v.optional(v.number()), discountMinor: v.optional(v.number()), serials: v.optional(v.array(v.string())), modifierKeys: v.optional(v.array(v.string())) });
const part = v.object({ variantId: v.string(), qty: v.number(), unitPriceMinor: v.optional(v.number()) });
const variant = v.object({ variantId: v.optional(v.string()), sku: v.string(), options: v.array(option), priceMinor: v.number(), costMinor: v.optional(v.number()), reorderPoint: v.optional(v.number()), openingStock: v.optional(v.number()) });

const itemArg = v.object({ kind: v.string(), nameAr: v.string(), nameEn: v.string(), category: v.string(), unit: v.string(), trackStock: v.boolean(), catalogEntryKey: v.optional(v.string()),
  serialized: v.optional(v.boolean()), warrantyMonths: v.optional(v.number()), warrantyBy: v.optional(v.string()), photoId: v.optional(v.string()) });
const importVariant = v.object({ sku: v.string(), options: v.array(option), priceMinor: v.number(), costMinor: v.optional(v.number()), reorderPoint: v.optional(v.number()), quantity: v.optional(v.number()), serials: v.optional(v.array(v.string())) });

const bookingArgs = {
 resourceId:v.optional(v.id('hasibResources')),resourceIds:v.optional(v.array(v.id('hasibResources'))),serviceId:v.optional(v.id('hasibServices')),bookingId:v.optional(v.id('hasibBookings')),waitlistId:v.optional(v.id('hasibWaitlist')),
 membershipId:v.optional(v.id('hasibMemberships')),guardianId:v.optional(v.id('blueContacts')),creditId:v.optional(v.id('hasibCredits')),followupId:v.optional(v.id('hasibFollowups')),
 kind:v.optional(v.string()),name:v.optional(v.string()),capacity:v.optional(v.number()),availability:v.optional(v.array(v.object({startsAt:v.number(),endsAt:v.number()}))),durationMinutes:v.optional(v.number()),startsAt:v.optional(v.number()),endsAt:v.optional(v.number()),earliestAt:v.optional(v.number()),latestAt:v.optional(v.number()),credits:v.optional(v.number()),attendedAt:v.optional(v.number()),replacementForId:v.optional(v.id('hasibBookings')),
 linkedType:v.optional(v.union(v.literal('booking'),v.literal('membership'),v.literal('order'),v.literal('job'),v.literal('property'))),linkedId:v.optional(v.string()),
};

const workflow = v.object({
  title: v.optional(v.string()),
  kind: v.optional(v.string()),
  label: v.optional(v.string()),
  identifier: v.optional(v.string()),
  location: v.optional(v.string()),
  availability: v.optional(v.union(v.string(), v.array(v.object({ startsAt: v.number(), endsAt: v.number() })))),
  status: v.optional(v.string()),
  viewingOutcome: v.optional(v.string()),
  approvedBy: v.optional(v.string()),
  contactId: v.optional(v.string()),
  conversationId: v.optional(v.string()),
  assignedAccountId: v.optional(v.string()),
  equipmentId: v.optional(v.string()),
  repeatOfId: v.optional(v.string()),
  propertyId: v.optional(v.string()),
  // Real Estate viewings, offers and follow-up drafts name their deal.
  opportunityId: v.optional(v.string()),
  variantId: v.optional(v.string()),
  orderId: v.optional(v.string()),
  dueAt: v.optional(v.number()),
  recurringDays: v.optional(v.number()),
  actualMinutes: v.optional(v.number()),
  budgetMinor: v.optional(v.number()),
  nextServiceAt: v.optional(v.number()),
  visitsRemaining: v.optional(v.number()),
  askingPriceMinor: v.optional(v.number()),
  viewingAt: v.optional(v.number()),
  followUpAt: v.optional(v.number()),
  commissionMinor: v.optional(v.number()),
  qty: v.optional(v.number()),
  estimateVersion: v.optional(v.number()),
  reference: v.optional(v.string()), transactionType: v.optional(v.string()), propertyType: v.optional(v.string()), area: v.optional(v.string()), pricePeriod: v.optional(v.string()), description: v.optional(v.string()), authorityStatus: v.optional(v.string()),
  source: v.optional(v.string()), need: v.optional(v.string()), financeReadiness: v.optional(v.string()), decisionMakerReadiness: v.optional(v.string()), timeline: v.optional(v.string()), nextAction: v.optional(v.string()), lostReason: v.optional(v.string()), outcome: v.optional(v.string()), terms: v.optional(v.string()), text: v.optional(v.string()), templateId: v.optional(v.string()),
  budgetMinMinor: v.optional(v.number()), budgetMaxMinor: v.optional(v.number()), bedrooms: v.optional(v.number()), bathrooms: v.optional(v.number()), sizeSqm: v.optional(v.number()), verificationAt: v.optional(v.number()), firstInboundAt: v.optional(v.number()), replyQueuedAt: v.optional(v.number()), providerSubmittedAt: v.optional(v.number()), deliveredAt: v.optional(v.number()), scheduledAt: v.optional(v.number()), amountMinor: v.optional(v.number()),
  areas: v.optional(v.array(v.string())), propertyTypes: v.optional(v.array(v.string())), mustHaves: v.optional(v.array(v.string())), features: v.optional(v.array(v.string())), photoIds: v.optional(v.array(v.string())),
  identityStatus:v.optional(v.string()),financingStatus:v.optional(v.string()),agreementStatus:v.optional(v.string()),completionStatus:v.optional(v.string()),
  contractType:v.optional(v.string()), originalContractMinor:v.optional(v.number()), originalBudgetMinor:v.optional(v.number()), startAt:v.optional(v.number()), contractFinishAt:v.optional(v.number()), forecastFinishAt:v.optional(v.number()), estimateToCompleteMinor:v.optional(v.number()),
  projectId:v.optional(v.string()), milestoneId:v.optional(v.string()), weightBps:v.optional(v.number()), plannedStartAt:v.optional(v.number()), plannedFinishAt:v.optional(v.number()), actualProgressBps:v.optional(v.number()), plannedBps:v.optional(v.number()), actualBps:v.optional(v.number()), workerHours:v.optional(v.number()), asOfAt:v.optional(v.number()),
  incurredAt:v.optional(v.number()), rework:v.optional(v.boolean()), reason:v.optional(v.string()), contractDeltaMinor:v.optional(v.number()), budgetDeltaMinor:v.optional(v.number()), scheduleDeltaDays:v.optional(v.number()), supplier:v.optional(v.string()), package:v.optional(v.string()), requiredAt:v.optional(v.number()),
  grossMinor:v.optional(v.number()), retentionMinor:v.optional(v.number()), advanceRecoveryMinor:v.optional(v.number()), netMinor:v.optional(v.number()), retentionReleaseAt:v.optional(v.number()), reportDate:v.optional(v.number()), toolboxTalks:v.optional(v.number()), inspections:v.optional(v.number()), recordableIncidents:v.optional(v.number()), lostTimeIncidents:v.optional(v.number()), lostDays:v.optional(v.number()), severity:v.optional(v.string()), probability:v.optional(v.number()), impact:v.optional(v.number()), mitigation:v.optional(v.string()),
  costsComplete: v.optional(v.boolean()),
  checklist: v.optional(v.union(v.array(v.string()),v.array(v.object({ text:v.string(), done:v.boolean() })))),
  costs: v.optional(v.array(v.object({ label:v.string(), amountMinor:v.number(), expenseId:v.optional(v.string()) }))),
  milestones: v.optional(v.array(v.object({ label:v.string(), amountMinor:v.number(), dueAt:v.number(), withheld:v.boolean(), orderId:v.optional(v.string()) }))),
  extras: v.optional(v.array(v.object({ label:v.string(), amountMinor:v.number(), approved:v.boolean(), approvedBy:v.optional(v.string()), approvedAt:v.optional(v.number()) }))),
  lines: v.optional(v.array(v.object({ kind:v.optional(v.string()), name:v.optional(v.string()), variantId:v.optional(v.string()), qty:v.number(), unitPriceMinor:v.number(), standardMinutes:v.optional(v.number()) }))),
  vehicleId:v.optional(v.string()),serviceId:v.optional(v.string()),bayId:v.optional(v.string()),appointmentId:v.optional(v.string()),technicianAccountId:v.optional(v.string()),assignedAdvisorAccountId:v.optional(v.string()),name:v.optional(v.string()),category:v.optional(v.string()),plate:v.optional(v.string()),vin:v.optional(v.string()),make:v.optional(v.string()),model:v.optional(v.string()),year:v.optional(v.number()),powertrain:v.optional(v.string()),odometerKm:v.optional(v.number()),durationMinutes:v.optional(v.number()),standardLaborMinutes:v.optional(v.number()),priceMinor:v.optional(v.number()),active:v.optional(v.boolean()),preferredFrom:v.optional(v.number()),preferredTo:v.optional(v.number()),startsAt:v.optional(v.number()),promisedAt:v.optional(v.number()),concern:v.optional(v.string()),warrantyDisposition:v.optional(v.string()),
  items:v.optional(v.array(v.object({category:v.string(),condition:v.string(),note:v.optional(v.string()),photoIds:v.optional(v.array(v.string()))}))),
});


export const hasibEntryArgs = {
    ...bookingArgs,
    fromAt:v.optional(v.number()),toAt:v.optional(v.number()),
    approvedBy:v.optional(v.string()),
    checklist:v.optional(v.array(v.object({text:v.string(),done:v.boolean()}))),
    workflow: v.optional(workflow), actorAccountId:v.optional(v.string()), jobId:v.optional(v.string()),equipmentId:v.optional(v.string()),propertyId:v.optional(v.string()),enquiryId:v.optional(v.string()),productRequestId:v.optional(v.string()),opportunityId:v.optional(v.string()),matchId:v.optional(v.string()),viewingId:v.optional(v.string()),offerId:v.optional(v.string()),draftId:v.optional(v.string()),commissionId:v.optional(v.string()),memberId:v.optional(v.string()),email:v.optional(v.string()),operationalRole:v.optional(v.string()),commissionMinor:v.optional(v.number()),
    appointmentRequestId:v.optional(v.string()),notificationId:v.optional(v.string()),waitlistOfferId:v.optional(v.string()),taskId:v.optional(v.string()),assignedAccountId:v.optional(v.string()),projectId:v.optional(v.string()),milestoneId:v.optional(v.string()),variationId:v.optional(v.string()),commitmentId:v.optional(v.string()),claimId:v.optional(v.string()),qualityId:v.optional(v.string()),riskId:v.optional(v.string()),vehicleId:v.optional(v.string()),bayId:v.optional(v.string()),serviceId:v.optional(v.string()),appointmentId:v.optional(v.string()),workOrderId:v.optional(v.string()),estimateId:v.optional(v.string()),laborEntryId:v.optional(v.string()),partAllocationId:v.optional(v.string()),
    source:v.optional(v.string()),preferredFrom:v.optional(v.number()),preferredTo:v.optional(v.number()),firstInboundAt:v.optional(v.number()),firstResponseSubmittedAt:v.optional(v.number()),preferenceStatus:v.optional(v.string()),evidenceSource:v.optional(v.string()),evidenceAt:v.optional(v.number()),notificationKind:v.optional(v.string()),idempotencyKey:v.optional(v.string()),templateId:v.optional(v.string()),outsideServiceWindow:v.optional(v.boolean()),rating:v.optional(v.number()),experienceReason:v.optional(v.string()),weekStart:v.optional(v.string()),
    governance:v.optional(v.object({status:v.string(),jurisdiction:v.string(),permitStatus:v.string(),controller:v.string(),processor:v.string(),approvedRegions:v.array(v.string()),subprocessors:v.array(v.string()),retentionDays:v.number(),backupRetentionDays:v.number(),supportAccess:v.string(),incidentOwner:v.string(),rightsOwner:v.string(),crossBorderStatus:v.string()})),
    operation: v.union(...HASIB_OPERATIONS.map(s => v.literal(s))),
    sessionHash: v.string(), requestId: v.optional(v.string()), cursor: v.optional(v.string()), limit: v.optional(v.number()), search: v.optional(v.string()), status: v.optional(v.string()),
    itemId: v.optional(v.string()), variantId: v.optional(v.string()), orderId: v.optional(v.string()), contactId: v.optional(v.string()), conversationId: v.optional(v.string()),
    item: v.optional(itemArg),
    variants: v.optional(v.array(variant)),
    delta: v.optional(v.number()), reason: v.optional(v.string()), unitCostMinor: v.optional(v.number()), note: v.optional(v.string()),
    channel: v.optional(v.string()), lines: v.optional(v.union(v.array(line), v.array(receiptLine))), deliveryFeeMinor: v.optional(v.number()), confirm: v.optional(v.boolean()),
    fulfilment: v.optional(v.object({ type: v.string(), area: v.optional(v.string()), dueAt: v.optional(v.number()) })),
    customFields: v.optional(v.array(option)), notes: v.optional(v.string()), customerName: v.optional(v.string()),
    to: v.optional(v.string()), version: v.optional(v.number()), amountMinor: v.optional(v.number()), method: v.optional(v.string()), reference: v.optional(v.string()),
    vat: v.optional(v.object({ registered: v.boolean(), rateBps: v.number(), pricesIncludeVat: v.boolean(), vatin: v.optional(v.string()) })),
    unsoldDays: v.optional(v.number()), absenceDays: v.optional(v.number()), listingFreshnessDays:v.optional(v.number()), constructionIncidentHoursDenominator:v.optional(v.number()), channelCostMinor: v.optional(v.number()),
    stockPolicy: v.optional(v.string()), packId: v.optional(v.string()),
    products: v.optional(v.array(v.object({ requestId: v.string(), item: itemArg, variants: v.array(importVariant) }))),
    storageId: v.optional(v.string()), photoId: v.optional(v.string()), photoCheck: v.optional(v.union(v.literal('ok'), v.literal('bad'), v.literal('missing'))),
    lineSerials: v.optional(v.array(v.object({ variantId: v.string(), serials: v.array(v.string()) }))),
    serials: v.optional(v.array(v.string())), serial: v.optional(v.string()), costMinor: v.optional(v.number()), repairId: v.optional(v.string()), device: v.optional(v.string()), fault: v.optional(v.string()),
    accessories: v.optional(v.string()), quoteMinor: v.optional(v.number()), labourMinor: v.optional(v.number()), parts: v.optional(v.array(part)), dueAt: v.optional(v.number()),
    modifiers: v.optional(v.array(v.object({ key: v.string(), label: v.string(), priceMinor: v.number(), ingredients: v.array(ingredient) }))),
    menuVariantId: v.optional(v.string()), yieldQty: v.optional(v.number()), ingredients: v.optional(v.array(ingredient)),
    qty: v.optional(v.number()), countedQty: v.optional(v.number()), invoiceNumber: v.optional(v.string()), receivedOn: v.optional(v.string()),
    outputVariantId: v.optional(v.string()), outputQty: v.optional(v.number()), inputs: v.optional(v.array(v.object({ variantId: v.string(), qty: v.number(), unit: v.optional(v.string()) }))),
    producedOn: v.optional(v.string()), useBy: v.optional(v.string()), days: v.optional(v.number()), disposition: v.optional(v.string()),
    expenseId: v.optional(v.string()), category: v.optional(v.string()), vatMinor: v.optional(v.number()), vendor: v.optional(v.string()), paidOn: v.optional(v.string()), period: v.optional(v.string()),
  };
