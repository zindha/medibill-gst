import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { settings, users, generateId } from "../db/schema/index.js";

/**
 * Expiry Safety Policy (Task 5).
 *
 * Scope: the `settings` table is a global key/value singleton — `key` is
 * UNIQUE and the table has no `created_by`/tenant column — so the policy is
 * PER-INSTALL (single-store app). One policy row serves every user of the
 * install; no per-tenant columns are added here or in migrations.
 *
 * Override semantics (documented decision): `allowOverrideRoles` may lift
 * rows whose severity is `"blocked"` (expired stock when the matching
 * block-flag is on, or stock inside the `blockWithinDays` window). Rows with
 * severity `"warning"` never block and never need an override, and an expired
 * row is ALWAYS severity `"blocked"` when its block-flag is on — the flag
 * cannot soften it to a warning.
 */
export interface ExpiryPolicy {
  blockExpiredSale: boolean;
  blockExpiredPurchase: boolean;
  warningDays: number;
  blockWithinDays: number;
  allowOverrideRoles: string[];
}

export const EXPIRY_POLICY_KEY = "expiry_policy";

export const DEFAULT_POLICY: ExpiryPolicy = {
  blockExpiredSale: true,
  blockExpiredPurchase: true,
  warningDays: 90,
  blockWithinDays: 0,
  allowOverrideRoles: ["admin", "pharmacist"],
};

export type ExpiryOperation = "sale" | "purchase" | "batch_edit";
export type ExpirySeverity = "ok" | "warning" | "blocked";

export interface ExpiryEvaluation {
  allowed: boolean;
  severity: ExpirySeverity;
  reason: string;
  expiryDate: string;
  daysToExpiry: number;
  /** True when the caller's role may lift a "blocked" result via override. */
  requiresOverride: boolean;
}

export interface ExpiryLine {
  batchNo?: string;
  expiryDate: string;
  daysToExpiry: number;
  severity: ExpirySeverity;
  reason: string;
}

export interface ExpiryLineItemsResult {
  ok: boolean;
  blocked: ExpiryLine[];
  warnings: ExpiryLine[];
  messages: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days between today and `expiryDate` (YYYY-MM-DD).
 * Negative = already expired; 0 = expires today; null = unparseable/absent.
 */
export function daysUntil(expiryDate: string | undefined | null): number | null {
  if (!expiryDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(expiryDate.trim());
  if (!m) return null;
  const expiryUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiryUtc - todayUtc) / DAY_MS);
}

/**
 * Read the install-wide policy from the `expiry_policy` settings row and
 * merge it over DEFAULT_POLICY. `userId` is accepted for call-site symmetry
 * but the policy is NOT per-user (singleton settings key — see file header).
 */
export async function getPolicy(_userId?: string): Promise<ExpiryPolicy> {
  let row;
  try {
    [row] = await db.select().from(settings).where(eq(settings.key, EXPIRY_POLICY_KEY)).limit(1);
  } catch {
    row = undefined;
  }
  if (!row) return { ...DEFAULT_POLICY, allowOverrideRoles: [...DEFAULT_POLICY.allowOverrideRoles] };

  let parsed: any = null;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...DEFAULT_POLICY, allowOverrideRoles: [...DEFAULT_POLICY.allowOverrideRoles] };
  }
  return {
    blockExpiredSale: typeof parsed.blockExpiredSale === "boolean" ? parsed.blockExpiredSale : DEFAULT_POLICY.blockExpiredSale,
    blockExpiredPurchase: typeof parsed.blockExpiredPurchase === "boolean" ? parsed.blockExpiredPurchase : DEFAULT_POLICY.blockExpiredPurchase,
    warningDays: Number.isFinite(parsed.warningDays) ? Number(parsed.warningDays) : DEFAULT_POLICY.warningDays,
    blockWithinDays: Number.isFinite(parsed.blockWithinDays) ? Number(parsed.blockWithinDays) : DEFAULT_POLICY.blockWithinDays,
    allowOverrideRoles: Array.isArray(parsed.allowOverrideRoles)
      ? parsed.allowOverrideRoles.filter((r: unknown): r is string => typeof r === "string")
      : [...DEFAULT_POLICY.allowOverrideRoles],
  };
}

/** Upsert the singleton `expiry_policy` settings row. */
export async function setPolicy(policy: ExpiryPolicy): Promise<ExpiryPolicy> {
  const now = new Date();
  const value = JSON.stringify(policy);
  const [existing] = await db.select().from(settings).where(eq(settings.key, EXPIRY_POLICY_KEY)).limit(1);
  if (existing) {
    await db.update(settings).set({ value, updatedAt: now }).where(eq(settings.key, EXPIRY_POLICY_KEY));
  } else {
    await db.insert(settings).values({ id: generateId(), key: EXPIRY_POLICY_KEY, value, updatedAt: now });
  }
  return policy;
}

/** Role for a request user (authGuard only sets request.userId). */
export async function getUserRole(userId: string): Promise<string> {
  try {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    return row?.role ?? "cashier";
  } catch {
    return "cashier";
  }
}

export interface EvaluateInput {
  expiryDate?: string;
  operation: ExpiryOperation;
  userRole?: string;
  policy?: ExpiryPolicy;
}

/**
 * Evaluate one expiry date against the policy.
 * - operation "sale":      expired blocked per blockExpiredSale
 * - operation "purchase":  incoming stock expired blocked per blockExpiredPurchase
 * - operation "batch_edit": treated like purchase (validity of the new expiry)
 * - blockWithinDays (>0):  near-expiry → severity "blocked" (separate from expired)
 * - warningDays (>0):      near-expiry → severity "warning" (never blocks)
 */
export function evaluate(input: EvaluateInput): ExpiryEvaluation {
  const policy = input.policy ?? DEFAULT_POLICY;
  const expiryDate = (input.expiryDate ?? "").trim();
  const days = daysUntil(expiryDate || null);
  const mayOverride = policy.allowOverrideRoles.includes(input.userRole ?? "");

  if (days === null) {
    return {
      allowed: true,
      severity: "ok",
      reason: expiryDate ? `Unparseable expiry date "${expiryDate}" — not evaluated` : "No expiry date provided",
      expiryDate,
      daysToExpiry: 0,
      requiresOverride: false,
    };
  }

  if (days < 0) {
    const blockExpired = input.operation === "sale" ? policy.blockExpiredSale : policy.blockExpiredPurchase;
    if (blockExpired) {
      return {
        allowed: false,
        severity: "blocked",
        reason: `Expired on ${expiryDate} (${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago) — blocked by expiry policy`,
        expiryDate,
        daysToExpiry: days,
        requiresOverride: mayOverride,
      };
    }
    return {
      allowed: true,
      severity: "warning",
      reason: `Expired on ${expiryDate} — expired-stock blocking is disabled for this operation`,
      expiryDate,
      daysToExpiry: days,
      requiresOverride: false,
    };
  }

  if (policy.blockWithinDays > 0 && days <= policy.blockWithinDays) {
    return {
      allowed: false,
      severity: "blocked",
      reason: `Expiring within the ${policy.blockWithinDays}-day block window (${days} day${days === 1 ? "" : "s"} to expiry)`,
      expiryDate,
      daysToExpiry: days,
      requiresOverride: mayOverride,
    };
  }

  if (policy.warningDays > 0 && days <= policy.warningDays) {
    return {
      allowed: true,
      severity: "warning",
      reason: `Expires within ${policy.warningDays} days (${days} day${days === 1 ? "" : "s"} to expiry)`,
      expiryDate,
      daysToExpiry: days,
      requiresOverride: false,
    };
  }

  return {
    allowed: true,
    severity: "ok",
    reason: `Not expiring soon (${days} days to expiry)`,
    expiryDate,
    daysToExpiry: days,
    requiresOverride: false,
  };
}

export interface ExpiryLineInput {
  expiryDate?: string;
  batchNo?: string;
}

/**
 * Evaluate a whole invoice/purchase line set at once. Deduplicates identical
 * (batchNo, expiryDate) pairs so the same batch isn't reported twice when the
 * client-declared line expiry matches the selected stock batch.
 */
export async function evaluateLineItems(
  userId: string,
  items: ExpiryLineInput[],
  operation: ExpiryOperation,
  userRole?: string,
  policy?: ExpiryPolicy,
): Promise<ExpiryLineItemsResult> {
  const activePolicy = policy ?? (await getPolicy(userId));
  const role = userRole ?? (await getUserRole(userId));

  const blocked: ExpiryLine[] = [];
  const warnings: ExpiryLine[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!item.expiryDate) continue;
    const key = `${item.batchNo ?? ""}|${item.expiryDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const result = evaluate({ expiryDate: item.expiryDate, operation, userRole: role, policy: activePolicy });
    if (result.severity === "ok") continue;

    const line: ExpiryLine = {
      batchNo: item.batchNo,
      expiryDate: result.expiryDate,
      daysToExpiry: result.daysToExpiry,
      severity: result.severity,
      reason: result.reason,
    };
    if (result.severity === "blocked") blocked.push(line);
    else warnings.push(line);
  }

  const messages = [
    ...blocked.map((b) => `Blocked: ${b.batchNo ?? "line item"} — ${b.reason}`),
    ...warnings.map((w) => `Warning: ${w.batchNo ?? "line item"} — ${w.reason}`),
  ];

  return { ok: blocked.length === 0, blocked, warnings, messages };
}
