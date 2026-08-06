/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as billing from "../billing.js";
import type * as blog from "../blog.js";
import type * as dni from "../dni.js";
import type * as finance from "../finance.js";
import type * as lib_server from "../lib/server.js";
import type * as links from "../links.js";
import type * as migration from "../migration.js";
import type * as promotions from "../promotions.js";
import type * as shipments from "../shipments.js";
import type * as store from "../store.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  billing: typeof billing;
  blog: typeof blog;
  dni: typeof dni;
  finance: typeof finance;
  "lib/server": typeof lib_server;
  links: typeof links;
  migration: typeof migration;
  promotions: typeof promotions;
  shipments: typeof shipments;
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
