/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activityLog from "../activityLog.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as catalogOverrides from "../catalogOverrides.js";
import type * as creditAccounts from "../creditAccounts.js";
import type * as customers from "../customers.js";
import type * as doctors from "../doctors.js";
import type * as http from "../http.js";
import type * as invoices from "../invoices.js";
import type * as medicines from "../medicines.js";
import type * as payments from "../payments.js";
import type * as prescriptions from "../prescriptions.js";
import type * as purchaseBills from "../purchaseBills.js";
import type * as purchaseReturns from "../purchaseReturns.js";
import type * as refillReminders from "../refillReminders.js";
import type * as salesReturns from "../salesReturns.js";
import type * as stats from "../stats.js";
import type * as suppliers from "../suppliers.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activityLog: typeof activityLog;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  catalogOverrides: typeof catalogOverrides;
  creditAccounts: typeof creditAccounts;
  customers: typeof customers;
  doctors: typeof doctors;
  http: typeof http;
  invoices: typeof invoices;
  medicines: typeof medicines;
  payments: typeof payments;
  prescriptions: typeof prescriptions;
  purchaseBills: typeof purchaseBills;
  purchaseReturns: typeof purchaseReturns;
  refillReminders: typeof refillReminders;
  salesReturns: typeof salesReturns;
  stats: typeof stats;
  suppliers: typeof suppliers;
  users: typeof users;
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
