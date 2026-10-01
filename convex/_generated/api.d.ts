/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as blueAudienceState from "../blueAudienceState.js";
import type * as blueAuth from "../blueAuth.js";
import type * as blueAuthState from "../blueAuthState.js";
import type * as blueCampaign from "../blueCampaign.js";
import type * as blueCampaignState from "../blueCampaignState.js";
import type * as blueCatalog from "../blueCatalog.js";
import type * as blueContacts from "../blueContacts.js";
import type * as blueDashboard from "../blueDashboard.js";
import type * as blueDashboardGate from "../blueDashboardGate.js";
import type * as blueDashboardState from "../blueDashboardState.js";
import type * as blueHasib from "../blueHasib.js";
import type * as blueInstagram from "../blueInstagram.js";
import type * as blueInstagramState from "../blueInstagramState.js";
import type * as blueKnowledge from "../blueKnowledge.js";
import type * as blueMessaging from "../blueMessaging.js";
import type * as blueMessagingState from "../blueMessagingState.js";
import type * as blueReset from "../blueReset.js";
import type * as blueResetState from "../blueResetState.js";
import type * as blueTenant from "../blueTenant.js";
import type * as crons from "../crons.js";
import type * as hash from "../hash.js";
import type * as hasib_automotiveDomain from "../hasib/automotiveDomain.js";
import type * as hasib_automotiveMetrics from "../hasib/automotiveMetrics.js";
import type * as hasib_automotiveSchema from "../hasib/automotiveSchema.js";
import type * as hasib_automotiveState from "../hasib/automotiveState.js";
import type * as hasib_bookingsState from "../hasib/bookingsState.js";
import type * as hasib_capabilities from "../hasib/capabilities.js";
import type * as hasib_catalogState from "../hasib/catalogState.js";
import type * as hasib_clinicState from "../hasib/clinicState.js";
import type * as hasib_constructionState from "../hasib/constructionState.js";
import type * as hasib_contactLink from "../hasib/contactLink.js";
import type * as hasib_demandState from "../hasib/demandState.js";
import type * as hasib_entryArgs from "../hasib/entryArgs.js";
import type * as hasib_expensesState from "../hasib/expensesState.js";
import type * as hasib_followupsState from "../hasib/followupsState.js";
import type * as hasib_gate from "../hasib/gate.js";
import type * as hasib_hasibState from "../hasib/hasibState.js";
import type * as hasib_importState from "../hasib/importState.js";
import type * as hasib_industryMetrics from "../hasib/industryMetrics.js";
import type * as hasib_insightsState from "../hasib/insightsState.js";
import type * as hasib_jobsState from "../hasib/jobsState.js";
import type * as hasib_laylaOrders from "../hasib/laylaOrders.js";
import type * as hasib_matching from "../hasib/matching.js";
import type * as hasib_membershipsState from "../hasib/membershipsState.js";
import type * as hasib_money from "../hasib/money.js";
import type * as hasib_orderMachine from "../hasib/orderMachine.js";
import type * as hasib_ordersState from "../hasib/ordersState.js";
import type * as hasib_period from "../hasib/period.js";
import type * as hasib_photoBytes from "../hasib/photoBytes.js";
import type * as hasib_photosState from "../hasib/photosState.js";
import type * as hasib_plans from "../hasib/plans.js";
import type * as hasib_profit from "../hasib/profit.js";
import type * as hasib_propertyState from "../hasib/propertyState.js";
import type * as hasib_realEstateBoard from "../hasib/realEstateBoard.js";
import type * as hasib_realEstateState from "../hasib/realEstateState.js";
import type * as hasib_realEstateTurn from "../hasib/realEstateTurn.js";
import type * as hasib_repairMachine from "../hasib/repairMachine.js";
import type * as hasib_repairsState from "../hasib/repairsState.js";
import type * as hasib_requestsState from "../hasib/requestsState.js";
import type * as hasib_restaurantState from "../hasib/restaurantState.js";
import type * as hasib_serialFormat from "../hasib/serialFormat.js";
import type * as hasib_serialsState from "../hasib/serialsState.js";
import type * as hasib_serviceSync from "../hasib/serviceSync.js";
import type * as hasib_shared from "../hasib/shared.js";
import type * as hasib_staffPolicy from "../hasib/staffPolicy.js";
import type * as hasib_stock from "../hasib/stock.js";
import type * as hasib_stockSync from "../hasib/stockSync.js";
import type * as hasib_todayState from "../hasib/todayState.js";
import type * as hasib_totals from "../hasib/totals.js";
import type * as hasib_units from "../hasib/units.js";
import type * as hasib_workflowSchema from "../hasib/workflowSchema.js";
import type * as hasib_workspaceState from "../hasib/workspaceState.js";
import type * as http from "../http.js";
import type * as layla from "../layla.js";
import type * as migrate from "../migrate.js";
import type * as review from "../review.js";
import type * as reviewState from "../reviewState.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  blueAudienceState: typeof blueAudienceState;
  blueAuth: typeof blueAuth;
  blueAuthState: typeof blueAuthState;
  blueCampaign: typeof blueCampaign;
  blueCampaignState: typeof blueCampaignState;
  blueCatalog: typeof blueCatalog;
  blueContacts: typeof blueContacts;
  blueDashboard: typeof blueDashboard;
  blueDashboardGate: typeof blueDashboardGate;
  blueDashboardState: typeof blueDashboardState;
  blueHasib: typeof blueHasib;
  blueInstagram: typeof blueInstagram;
  blueInstagramState: typeof blueInstagramState;
  blueKnowledge: typeof blueKnowledge;
  blueMessaging: typeof blueMessaging;
  blueMessagingState: typeof blueMessagingState;
  blueReset: typeof blueReset;
  blueResetState: typeof blueResetState;
  blueTenant: typeof blueTenant;
  crons: typeof crons;
  hash: typeof hash;
  "hasib/automotiveDomain": typeof hasib_automotiveDomain;
  "hasib/automotiveMetrics": typeof hasib_automotiveMetrics;
  "hasib/automotiveSchema": typeof hasib_automotiveSchema;
  "hasib/automotiveState": typeof hasib_automotiveState;
  "hasib/bookingsState": typeof hasib_bookingsState;
  "hasib/capabilities": typeof hasib_capabilities;
  "hasib/catalogState": typeof hasib_catalogState;
  "hasib/clinicState": typeof hasib_clinicState;
  "hasib/constructionState": typeof hasib_constructionState;
  "hasib/contactLink": typeof hasib_contactLink;
  "hasib/demandState": typeof hasib_demandState;
  "hasib/entryArgs": typeof hasib_entryArgs;
  "hasib/expensesState": typeof hasib_expensesState;
  "hasib/followupsState": typeof hasib_followupsState;
  "hasib/gate": typeof hasib_gate;
  "hasib/hasibState": typeof hasib_hasibState;
  "hasib/importState": typeof hasib_importState;
  "hasib/industryMetrics": typeof hasib_industryMetrics;
  "hasib/insightsState": typeof hasib_insightsState;
  "hasib/jobsState": typeof hasib_jobsState;
  "hasib/laylaOrders": typeof hasib_laylaOrders;
  "hasib/matching": typeof hasib_matching;
  "hasib/membershipsState": typeof hasib_membershipsState;
  "hasib/money": typeof hasib_money;
  "hasib/orderMachine": typeof hasib_orderMachine;
  "hasib/ordersState": typeof hasib_ordersState;
  "hasib/period": typeof hasib_period;
  "hasib/photoBytes": typeof hasib_photoBytes;
  "hasib/photosState": typeof hasib_photosState;
  "hasib/plans": typeof hasib_plans;
  "hasib/profit": typeof hasib_profit;
  "hasib/propertyState": typeof hasib_propertyState;
  "hasib/realEstateBoard": typeof hasib_realEstateBoard;
  "hasib/realEstateState": typeof hasib_realEstateState;
  "hasib/realEstateTurn": typeof hasib_realEstateTurn;
  "hasib/repairMachine": typeof hasib_repairMachine;
  "hasib/repairsState": typeof hasib_repairsState;
  "hasib/requestsState": typeof hasib_requestsState;
  "hasib/restaurantState": typeof hasib_restaurantState;
  "hasib/serialFormat": typeof hasib_serialFormat;
  "hasib/serialsState": typeof hasib_serialsState;
  "hasib/serviceSync": typeof hasib_serviceSync;
  "hasib/shared": typeof hasib_shared;
  "hasib/staffPolicy": typeof hasib_staffPolicy;
  "hasib/stock": typeof hasib_stock;
  "hasib/stockSync": typeof hasib_stockSync;
  "hasib/todayState": typeof hasib_todayState;
  "hasib/totals": typeof hasib_totals;
  "hasib/units": typeof hasib_units;
  "hasib/workflowSchema": typeof hasib_workflowSchema;
  "hasib/workspaceState": typeof hasib_workspaceState;
  http: typeof http;
  layla: typeof layla;
  migrate: typeof migrate;
  review: typeof review;
  reviewState: typeof reviewState;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
