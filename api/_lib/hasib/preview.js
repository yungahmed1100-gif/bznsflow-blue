import { hasibPack, industryCatalog } from '../../../config/hasib-packs.js';
import { PilotError } from '../layla/config.js';

const READ_LISTS = new Set(['items', 'low_stock', 'orders', 'expenses', 'repairs', 'resources', 'services', 'bookings', 'waitlist', 'memberships', 'membership_credits', 'followups', 'jobs', 'equipment', 'properties', 'property_enquiries', 'product_requests', 'recipes', 'stock_expiry','construction_projects','construction_milestones','construction_progress','construction_costs','construction_variations','construction_commitments','construction_claims','construction_site_reports','construction_quality','construction_risks','construction_tasks','automotive_contacts','automotive_vehicles','automotive_bays','automotive_services','automotive_requests','automotive_appointments','automotive_work_orders','automotive_estimates','automotive_labor_entries','automotive_parts']);
const settings = { currency: 'OMR', vatRegistered: false, vatRateBps: 500, pricesIncludeVat: false, vatin: '', stockPolicy: 'warn', unsoldDays: 60, absenceDays: 14, constructionIncidentHoursDenominator:200000 };

function overview(packId) {
  const pack = hasibPack(packId);
  return { preview: true, readOnly: true, synthetic: true, selectedIndustryId: packId, industry: industryCatalog().find(row => row.id === packId),
    pack: { id: pack.id, archetype: pack.archetype, version: pack.version, ownerUi: pack.ownerUi, todayMetrics: pack.todayMetrics, thresholds: pack.thresholds,
      variantOptions: pack.variantOptions, orderFields: pack.orderFields, expenseCategories: pack.expenseCategories, modules: pack.modules },
    plan: 'ascend', setupRequired: false, livePacks: industryCatalog().filter(row => row.live), industries: industryCatalog(),
    modules: Object.entries(pack.modules).filter(([, value]) => value === 'available').map(([key]) => key), settings,
    counts: { pendingOrders: 0, lowStock: 0, laylaWaiting: 0, laylaOverdue: 0 } };
}

function today(packId) {
  const pack = hasibPack(packId);
  return { date: new Date().toISOString().slice(0, 10), synthetic: true,
    needsYou: { ordersCount: 0, orders: [], chats: 0, lowStockCount: 0, lowStock: [], repairsReady: 0 },
    industryActions: [], industryMetrics: pack.todayMetrics.map(metric => ({ id: metric.id, value: 0, format: 'number', detail: '' })),
    setup: { products: false, photos: false, services: false } };
}

const insights = () => ({ cash: [], receivablesMinor: 0, recordedProfitMinor: 0, expectedProfitMinor: 0,
  sales: { orders: 0, totalMinor: 0, grossProfitMinor: 0 }, expenses: { operatingMinor: 0, stockPurchasesMinor: 0, byCategory: [] },
  pending: { orders: 0, totalMinor: 0 }, demand: { signals: 0, mostWanted: [], lostSales: [], askedNotBought: [], notInCatalog: [] }, topProducts: [], restaurant: null,
  stock: { valueMinor: 0, low: 0, out: 0 }, customers: { buyers: 0, returning: 0, walkIn: 0 }, truncated: false });

export function hasibPreviewResponse(packId, operation) {
  const industry = industryCatalog().find(row => row.id === packId);
  if (industry?.status !== 'preview') throw new PilotError(industry ? 'preview_not_available' : 'invalid_industry', 409);
  if (operation === 'overview') return overview(packId);
  if (operation === 'today') return today(packId);
  if (operation === 'clinic_overview') return { synthetic:true, governance:{status:'review_required',permitStatus:'unknown',approved:false}, activationReady:false,
    metrics:[{id:'unconfirmed_48h',value:0},{id:'missed_today',value:0},{id:'outstanding_minor',value:0}], requests:[], bookings:[], tasks:[], workspaceRole:'manager' };
  if (operation === 'clinic_insights') return { synthetic:true, coverage:{bookings:0,requests:0,arrivalToStart:{numerator:0,denominator:0}}, metrics:{thirdNextAvailableDays:null,responseMedianMinutes:null,responseP90Minutes:null,requestConversion7d:null,noShowRate:null,cancellationRate:null,cancellationLeadMedianHours:null,waitlistRecoveryRate:null,arrivalWaitMedianMinutes:null,arrivalWaitP90Minutes:null,completionRate:null,sameProviderContinuity:null,experienceResponseRate:null,averageRating:null,recordedRevenueMinor:0,cashCollectedMinor:0,collectionRate:null,openReceivablesMinor:0} };
  if (operation === 'construction_overview') return { synthetic:true, metrics:[{key:'schedule_risk',value:0},{key:'variation_exposure',value:0},{key:'overdue_receivables',value:0}], projects:[], tasks:[] };
  if (operation === 'construction_insights') return { synthetic:true, projects:[], claims:[], variations:[], metrics:{revisedContractMinor:0,revisedBudgetMinor:0,actualCostMinor:0,forecastFinalCostMinor:0,forecastVarianceMinor:0,forecastMargin:null,pvMinor:0,evMinor:0,cpi:null,spi:null,variationExposureMinor:0,procurementOnTimeRate:null,reworkRate:null,ncrClosureRate:null,incidentFrequency:null,earnedValuePerWorkerHour:null,certifiedBillingsMinor:0,cashCollectedMinor:0,collectionRate:null,openReceivablesMinor:0,retentionHeldMinor:0,clientRating:null},coverage:{earnedValue:{numerator:0,denominator:0},safety:{numerator:0,denominator:0},experience:{numerator:0,denominator:0}} };
  if (operation === 'automotive_overview') return { synthetic:true, metrics:[{key:'approvals_waiting',value:0},{key:'past_promised',value:0},{key:'ready_for_collection',value:0}], workOrders:[], tasks:[] };
  if (operation === 'automotive_insights') return { synthetic:true, metrics:{requestResponseMedianMs:null,requestResponseP90Ms:null,requestToBookedRate:null,appointmentMissedRate:null,estimateApprovalRate:null,technicianProductivity:null,technicianEfficiency:null,technicianProficiency:null,onTimeDeliveryRate:null,firstTimeFixRate:null,averageRepairOrderMinor:null,recordedRevenueMinor:0,cashCollectedMinor:0,collectionRate:null,openReceivablesMinor:0,experienceAverage:null},coverage:{technicianProductivity:{numerator:0,denominator:0},firstTimeFix:{numerator:0,denominator:0},responseTime:{numerator:0,denominator:0},experience:{numerator:0,denominator:0}} };
  if (operation === 'team_list') return { limit:5, members:[] };
  if (operation === 'insights') return insights();
  if (operation === 'restaurant_summary') return { menu: [], channels: [], priceIncreases: [], foodCostBps: null, laborCostBps: null, primeCostBps: null, wasteMinor: 0, stockVarianceMinor: 0, usageVarianceMinor: null };
  if (operation === 'baking_suggestions') return { items: [] };
  if (READ_LISTS.has(operation)) return { items: [], cursor: null };
  throw new PilotError('preview_read_only', 403);
}
