import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Blue-only schema. Green data is never read by Convex at runtime.
const path = v.union(v.literal('coexistence'), v.literal('new_number'), v.literal('existing_cloud'));
const qualificationField = v.object({key:v.string(),value:v.string(),source:v.string(),confidence:v.number(),at:v.number()});
const consent = v.object({status:v.union(v.literal('unknown'),v.literal('granted'),v.literal('revoked')),source:v.optional(v.string()),date:v.optional(v.string()),purpose:v.optional(v.string()),attestedAt:v.optional(v.number()),batchId:v.optional(v.id('blueConsentBatches'))});
export default defineSchema({
  blueMessagingSettings: defineTable({key:v.string(),enabled:v.boolean()}).index('by_key',['key']),
  blueReviewerAccess: defineTable({tokenHash:v.string(),accountId:v.id('accounts'),expiresAt:v.number()}).index('by_hash',['tokenHash']).index('by_expiry',['expiresAt']),
  blueMessagingControls: defineTable({integrationId:v.string(),sessionHash:v.string(),accountId:v.id('accounts'),active:v.boolean(),reason:v.string(),activatedAt:v.number(),healthAt:v.number(),profileVersion:v.number()}).index('by_integration',['integrationId']).index('by_active_health',['active','healthAt']),
  // contactId is optional so existing rows stay valid; they are linked lazily.
  blueConversations: defineTable({key:v.string(),integrationId:v.string(),accountId:v.id('accounts'),number:v.string(),contactId:v.optional(v.id('blueContacts')),version:v.optional(v.number()),lastInbound:v.number(),takeover:v.boolean(),optout:v.boolean(),updatedAt:v.number()}).index('by_key',['key']).index('by_account_updated',['accountId','updatedAt']).index('by_contact',['contactId']),
  blueMessages: defineTable({key:v.string(),integrationId:v.string(),accountId:v.id('accounts'),conversationId:v.id('blueConversations'),conversationVersion:v.optional(v.number()),profileVersion:v.optional(v.number()),direction:v.string(),text:v.optional(v.string()),at:v.number(),expiresAt:v.number(),textExpiresAt:v.number(),status:v.string(),manual:v.optional(v.boolean()),handoff:v.optional(v.boolean()),reason:v.optional(v.string()),intent:v.optional(v.string()),attemptAt:v.optional(v.number()),providerId:v.optional(v.string()),errorCode:v.optional(v.number())}).index('by_key',['key']).index('by_account_at',['accountId','at']).index('by_conversation_at',['conversationId','at']).index('by_integration_status',['integrationId','status']).index('by_status_at',['status','at']).index('by_provider',['providerId']).index('by_intent',['intent']).index('by_expiry',['expiresAt']).index('by_text_expiry',['textExpiresAt']),
  // One record per customer number per account. Deleted contacts become PII-free
  // tombstones that keep only the keyed number hash and opt-out state.
  blueContacts: defineTable({accountId:v.id('accounts'),key:v.string(),state:v.union(v.literal('active'),v.literal('deleted')),waId:v.optional(v.string()),numberHash:v.string(),countryIso:v.optional(v.string()),
    ownerName:v.optional(v.string()),customerName:v.optional(v.string()),profileName:v.optional(v.string()),source:v.union(v.literal('inbound'),v.literal('manual'),v.literal('import')),
    sectorId:v.string(),fields:v.array(qualificationField),qualificationStatus:v.string(),qualificationOverride:v.optional(v.string()),asked:v.optional(v.array(v.string())),askCounts:v.optional(v.array(v.object({key:v.string(),count:v.number()}))),lastAskedAt:v.optional(v.number()),
    consent:consent,optout:v.boolean(),optoutAt:v.optional(v.number()),lastActivityAt:v.number(),lastInboundAt:v.optional(v.number()),searchText:v.optional(v.string()),createdAt:v.number(),updatedAt:v.number(),deletedAt:v.optional(v.number())})
    .index('by_key',['key']).index('by_account_state_activity',['accountId','state','lastActivityAt']).index('by_account_hash',['accountId','numberHash'])
    .searchIndex('search_contacts',{searchField:'searchText',filterFields:['accountId','state']}),
  blueConsentBatches: defineTable({accountId:v.id('accounts'),source:v.string(),date:v.string(),purpose:v.string(),attestedAt:v.number(),requestId:v.string(),count:v.number()}).index('by_account_request',['accountId','requestId']),
  blueBusinessSettings: defineTable({accountId:v.id('accounts'),timezone:v.string(),updatedAt:v.number()}).index('by_account',['accountId']),
  blueTemplates: defineTable({accountId:v.id('accounts'),integrationId:v.string(),templateId:v.string(),name:v.string(),language:v.string(),category:v.string(),status:v.string(),parameterFormat:v.string(),
    header:v.optional(v.object({format:v.string(),text:v.optional(v.string())})),body:v.string(),footer:v.optional(v.string()),buttons:v.array(v.object({type:v.string(),text:v.string()})),
    variables:v.array(v.object({key:v.string(),component:v.string(),example:v.optional(v.string())})),sendable:v.boolean(),unsupportedReason:v.optional(v.string()),syncedAt:v.number()})
    .index('by_account_template',['accountId','templateId']).index('by_account_synced',['accountId','syncedAt']),
  blueCampaigns: defineTable({accountId:v.id('accounts'),integrationId:v.string(),requestId:v.string(),name:v.string(),origin:v.union(v.literal('broadcast'),v.literal('chat')),
    template:v.object({templateId:v.string(),name:v.string(),language:v.string(),category:v.string(),parameterFormat:v.string(),body:v.string(),header:v.optional(v.object({format:v.string(),text:v.optional(v.string())})),footer:v.optional(v.string())}),
    mapping:v.array(v.object({key:v.string(),source:v.string(),value:v.string()})),status:v.string(),reason:v.optional(v.string()),scheduledAt:v.number(),timezone:v.string(),recipientCount:v.number(),
    allowance:v.optional(v.number()),createdAt:v.number(),updatedAt:v.number(),startingAt:v.optional(v.number()),startedAt:v.optional(v.number()),completedAt:v.optional(v.number()),cancelledAt:v.optional(v.number())})
    .index('by_account_request',['accountId','requestId']).index('by_account_created',['accountId','createdAt']).index('by_status_scheduled',['status','scheduledAt']).index('by_integration_status',['integrationId','status']),
  // Frozen per-recipient snapshot. PII is stripped if the contact is deleted.
  blueCampaignRecipients: defineTable({campaignId:v.id('blueCampaigns'),accountId:v.id('accounts'),integrationId:v.string(),contactId:v.id('blueContacts'),numberHash:v.string(),waId:v.optional(v.string()),name:v.optional(v.string()),
    parameters:v.array(v.object({key:v.string(),component:v.string(),text:v.string()})),status:v.string(),attempts:v.number(),nextAttemptAt:v.number(),intent:v.optional(v.string()),attemptAt:v.optional(v.number()),
    providerId:v.optional(v.string()),reason:v.optional(v.string()),errorCode:v.optional(v.number()),at:v.number(),updatedAt:v.number(),expiresAt:v.number()})
    .index('by_campaign_status',['campaignId','status']).index('by_status_next',['status','nextAttemptAt']).index('by_integration_status',['integrationId','status'])
    .index('by_contact_at',['contactId','at']).index('by_intent',['intent']).index('by_provider',['providerId']).index('by_expiry',['expiresAt']),
  blueMessageRates: defineTable({key:v.string(),count:v.number(),expiresAt:v.number()}).index('by_key',['key']).index('by_expiry',['expiresAt']),
  blueKnowledgeChunks: defineTable({tenantId:v.string(),revision:v.number(),locale:v.string(),text:v.string(),searchText:v.optional(v.string()),source:v.string(),docType:v.optional(v.string()),effectiveDate:v.optional(v.string()),sectionPath:v.optional(v.string()),approved:v.boolean(),contentHash:v.string(),embedding:v.optional(v.array(v.float64())),updatedAt:v.number()})
    .index('by_tenant_revision',['tenantId','revision'])
    .index('by_tenant_locale',['tenantId','locale'])
    .searchIndex('search_text',{searchField:'text',filterFields:['tenantId','revision','locale','approved']})
    .vectorIndex('by_embedding',{vectorField:'embedding',dimensions:1536,filterFields:['tenantId','revision','locale','approved']}),
  blueIntentUtterances: defineTable({tenantId:v.string(),revision:v.number(),intent:v.string(),text:v.string(),embedding:v.optional(v.array(v.float64())),approved:v.boolean(),createdAt:v.number()})
    .index('by_tenant_revision',['tenantId','revision'])
    .vectorIndex('by_embedding',{vectorField:'embedding',dimensions:1536,filterFields:['tenantId','revision','intent','approved']}),
  blueCatalogEntries: defineTable({ownerKey:v.string(),entryKey:v.string(),kind:v.string(),status:v.string(),nameEn:v.string(),nameAr:v.string(),category:v.string(),benefitEn:v.string(),benefitAr:v.string(),descriptionEn:v.string(),descriptionAr:v.string(),availability:v.string(),prices:v.array(v.object({type:v.string(),currency:v.string(),amount:v.optional(v.number()),minimum:v.optional(v.number()),maximum:v.optional(v.number()),unit:v.string(),label:v.string()})),source:v.string(),confidence:v.number(),laylaUseEn:v.string(),laylaUseAr:v.string(),revision:v.number(),sortOrder:v.number(),createdAt:v.number(),updatedAt:v.number()})
    .index('by_owner_key',['ownerKey','entryKey'])
    .index('by_owner_status_order',['ownerKey','status','sortOrder']),
  blueCatalogMeta: defineTable({ownerKey:v.string(),revision:v.number(),publishedAt:v.optional(v.number()),updatedAt:v.number()}).index('by_owner',['ownerKey']),
  blueAssetClaims: defineTable({phone:v.string(),waba:v.string(),sessionHash:v.string(),createdAt:v.number()}).index('by_phone',['phone']).index('by_waba',['waba']),
  blueAuthChallenges: defineTable({email:v.string(),codeHash:v.string(),challengeId:v.string(),createdAt:v.number(),expiresAt:v.number(),attempts:v.number(),sent:v.boolean()}).index('by_email',['email']).index('by_expiry',['expiresAt']),
  blueAuthLimits: defineTable({key:v.string(),count:v.number(),expiresAt:v.number()}).index('by_key',['key']).index('by_expiry',['expiresAt']),
  blueReviewSessions: defineTable({
    metrics:v.optional(v.object({draftSavedAt:v.optional(v.number()),firstPreviewAt:v.optional(v.number()),accountVerifiedAt:v.optional(v.number()),metaStartedAt:v.optional(v.number()),assetsVerifiedAt:v.optional(v.number()),connectionReadyAt:v.optional(v.number())})),
    accountId: v.optional(v.id('accounts')),
    sessionHash: v.string(), status: v.string(), expiresAt: v.number(), createdAt: v.number(), updatedAt: v.number(), attempts: v.number(),
    pendingSelection: v.optional(v.object({ waba: v.string(), path, candidates: v.array(v.object({ id: v.string(), sender: v.string() })), credential: v.object({ v: v.number(), iv: v.string(), data: v.string(), tag: v.string() }) })),
    checkedAt: v.optional(v.number()), diagnostic: v.optional(v.object({ reason: v.string(), stage: v.string(), at: v.number(), providerCode: v.optional(v.number()) })),
    connectionChecks: v.optional(v.object({ routing: v.boolean(), registered: v.boolean(), path: v.boolean(), nameStatus:v.optional(v.string()) })),
    journeyStep: v.optional(v.number()), profileVersion: v.optional(v.number()), previewReviewedVersion: v.optional(v.number()),
    previewIntents: v.optional(v.array(v.string())),
    lastPreview: v.optional(v.object({ question: v.string(), text: v.string(), sourceFields: v.array(v.string()), needsHuman: v.boolean(), intent: v.string() })),
    profile: v.optional(v.object({ businessName: v.string(), sector: v.string(), services: v.string(), prices: v.string(), hours: v.string(), location: v.string(), humanContact: v.string(), faqs:v.optional(v.array(v.object({question:v.string(),answer:v.string()}))), reviewed: v.boolean() })),
    attempt: v.optional(v.object({ id: v.string(), stateHash: v.string(), path, expiresAt: v.number(), claimed: v.boolean() })),
    integration: v.optional(v.object({ id: v.string(), app: v.string(), waba: v.string(), phone: v.string(), sender: v.string(), path,
      credential: v.object({ v: v.number(), iv: v.string(), data: v.string(), tag: v.string() }) })),
    phone: v.optional(v.string()), waba: v.optional(v.string()), operation: v.optional(v.string()), operationAt: v.optional(v.number()), operationEffect: v.optional(v.string()),
    registrationAttempted: v.optional(v.boolean()), subscriptionAttempted: v.optional(v.boolean()),
  }).index('by_hash', ['sessionHash']).index('by_expiry', ['expiresAt']).index('by_phone', ['phone']).index('by_waba', ['waba']),
  accounts: defineTable({
    draftHash: v.optional(v.string()),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.union(v.literal("owner"), v.literal("customer")),
    createdAt: v.number(),
    migratedFromGreen: v.optional(v.boolean()),
  }).index("by_email", ["email"]),
  sessions: defineTable({
    accountId: v.id("accounts"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_token_hash", ["tokenHash"]).index('by_expiry',['expiresAt']),
  businesses: defineTable({
    accountId: v.id("accounts"),
    businessName: v.string(),
    sector: v.string(),
    services: v.string(),
    prices: v.optional(v.string()),
    hours: v.optional(v.string()),
    location: v.optional(v.string()),
    humanContact: v.string(),
    reviewedAt: v.optional(v.number()),
  }).index("by_account", ["accountId"]),
  whatsappIntegrations: defineTable({
    accountId: v.id("accounts"),
    path: v.union(v.literal("coexistence"), v.literal("new_number")),
    wabaId: v.string(),
    phoneNumberId: v.string(),
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("paused")),
    // Store only ciphertext; the encryption key stays in the server environment.
    encryptedCredential: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_account", ["accountId"]),
  reviewTests: defineTable({
    accountId: v.id("accounts"),
    recipient: v.string(),
    state: v.union(v.literal("draft"), v.literal("review"), v.literal("stopped"), v.literal("complete")),
    replies: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_account", ["accountId"]).index("by_expiry", ["expiresAt"]),
  reviewSessions: defineTable({
    sessionKey: v.string(),
    path: v.union(v.literal("coexistence"), v.literal("new_number")),
    status: v.union(v.literal("started"), v.literal("assets_received"), v.literal("ready"), v.literal("expired")),
    expiresAt: v.number(),
    wabaId: v.optional(v.string()),
    phoneNumberId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_session_key", ["sessionKey"]).index("by_expiry", ["expiresAt"]),
});
