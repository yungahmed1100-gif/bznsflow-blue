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
import type * as blueDashboardState from "../blueDashboardState.js";
import type * as blueKnowledge from "../blueKnowledge.js";
import type * as blueMessaging from "../blueMessaging.js";
import type * as blueMessagingState from "../blueMessagingState.js";
import type * as blueTenant from "../blueTenant.js";
import type * as crons from "../crons.js";
import type * as hash from "../hash.js";
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
  blueDashboardState: typeof blueDashboardState;
  blueKnowledge: typeof blueKnowledge;
  blueMessaging: typeof blueMessaging;
  blueMessagingState: typeof blueMessagingState;
  blueTenant: typeof blueTenant;
  crons: typeof crons;
  hash: typeof hash;
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
