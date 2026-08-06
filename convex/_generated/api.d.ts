/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admins from "../admins.js";
import type * as auth from "../auth.js";
import type * as automations from "../automations.js";
import type * as billing from "../billing.js";
import type * as blog from "../blog.js";
import type * as campaigns from "../campaigns.js";
import type * as carts from "../carts.js";
import type * as contacts from "../contacts.js";
import type * as dni from "../dni.js";
import type * as emails from "../emails.js";
import type * as engine from "../engine.js";
import type * as finance from "../finance.js";
import type * as http from "../http.js";
import type * as lib_crm from "../lib/crm.js";
import type * as lib_server from "../lib/server.js";
import type * as links from "../links.js";
import type * as migration from "../migration.js";
import type * as promotions from "../promotions.js";
import type * as shipments from "../shipments.js";
import type * as shopifySync from "../shopifySync.js";
import type * as store from "../store.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admins: typeof admins;
  auth: typeof auth;
  automations: typeof automations;
  billing: typeof billing;
  blog: typeof blog;
  campaigns: typeof campaigns;
  carts: typeof carts;
  contacts: typeof contacts;
  dni: typeof dni;
  emails: typeof emails;
  engine: typeof engine;
  finance: typeof finance;
  http: typeof http;
  "lib/crm": typeof lib_crm;
  "lib/server": typeof lib_server;
  links: typeof links;
  migration: typeof migration;
  promotions: typeof promotions;
  shipments: typeof shipments;
  shopifySync: typeof shopifySync;
  store: typeof store;
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
