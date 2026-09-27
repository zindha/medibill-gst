import { db } from "../db/index.js";
import {
  userDevices,
  sessions,
  users,
  auditEvents as auditEventsTable,
} from "../db/schema/index.js";
import { desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auditEvents } from "./audit.js";

/**
 * Task 15 — device registry, remote session control, activity feed and the
 * staff capability map.
 *
 * Design notes:
 *  - A device row is created once per login session (POST /api/devices/register)
 *    with a fresh nanoid(32) token; the client stores it and sends it back as
 *    `X-Device-Token` (see plugins/auth.ts checkDeviceToken).
 *  - Revocation is a flag (revoked = 1), never a delete — the audit trail and
 *    monitoring views keep the row. A revoked token fails every guarded request.
 *  - Per-user cap: registering beyond MAX_DEVICES_PER_USER auto-revokes the
 *    OLDEST rows (insertion order via rowid, so same-millisecond inserts stay
 *    deterministic).
 *  - Device tokens are NEVER returned by list/monitoring endpoints — only the
 *    register response carries the new token.
 *  - CAPABILITY_MAP mirrors the role gates that actually exist in the routes
 *    (accounting post/reverse/close/reopen, reconciliation import/match/unmatch,
 *    compliance generate/cancel/e-way, stock-audit approve/cancel, invoice
 *    prescription override — all admin|pharmacist; device/session/activity
 *    management — admin only). Everything else is open to every authenticated
 *    role, so every role carries those capabilities.
 */

export const MAX_DEVICES_PER_USER = 10;

/**
 * Honest capability map — built by grepping the real role gates:
 *  - accounting.ts  requireJournalRole → POST /post, /entries/:id/reverse,
 *                   /periods/close, /periods/:id/reopen           (admin|pharmacist)
 *  - reconciliation.ts requireManagerRole → /import, /match, /unmatch (admin|pharmacist)
 *  - compliance.ts  requireManagerRole → generate / cancel / eway  (admin|pharmacist)
 *  - stockAudit.ts  assertApprover → approve / cancel              (admin|pharmacist)
 *  - invoices.ts    prescriptionOverride                            (admin|pharmacist)
 *  - devices routes → list-all / revoke / restore / sessions /
 *                     activity (Task 15, admin only)
 * Anything not listed as gated here is reachable by every authenticated role
 * (purchases, inventory, settings, messaging, orders, prescriptions, imports,
 * expiry-policy PUT, …) — cashiers therefore keep those capabilities.
 */
export const CAPABILITY_MAP: Record<string, readonly string[]> = {
  admin: ["*"],
  pharmacist: [
    "billing",
    "billing_prescription_override",
    "purchases",
    "inventory",
    "reports",
    "gst",
    "prescriptions",
    "stock_audit",
    "stock_audit_approve",
    "expiry_policy",
    "compliance",
    "accounting_view",
    "accounting_manual",
    "reconciliation_view",
    "reconciliation_manage",
    "messaging",
    "campaigns",
    "loyalty",
    "orders",
    "settings",
    "imports",
    "backup",
    "devices",
  ],
  cashier: [
    "billing",
    "purchases",
    "inventory",
    "reports",
    "gst",
    "prescriptions",
    "stock_audit",
    "expiry_policy",
    "accounting_view",
    "reconciliation_view",
    "messaging",
    "campaigns",
    "loyalty",
    "orders",
    "settings",
    "imports",
    "backup",
    "devices",
  ],
};

/** Capabilities for a role; unknown roles fall back to the cashier set. */
export function capabilitiesFor(role: string): string[] {
  if (role === "admin") return [...CAPABILITY_MAP.admin];
  return [...(CAPABILITY_MAP[role] ?? CAPABILITY_MAP.cashier)];
}

export interface RegisterDeviceInput {
  deviceName?: string;
  platform?: string;
  appVersion?: string;
}

export interface RegisteredDevice {
  id: string;
  deviceToken: string;
}

/** Create a device row for `userId` with a fresh token; enforce the per-user cap. */
export async function registerDevice(
  userId: string,
  input: RegisterDeviceInput
): Promise<RegisteredDevice> {
  const now = new Date();
  const deviceToken = nanoid(32);
  const [row] = await db
    .insert(userDevices)
    .values({
      userId,
      deviceName: input.deviceName?.slice(0, 120) ?? null,
      platform: input.platform?.slice(0, 40) ?? null,
      appVersion: input.appVersion?.slice(0, 40) ?? null,
      deviceToken,
      revoked: false,
      lastSeenAt: now,
      createdAt: now,
    })
    .returning();

  // Cap: keep at most MAX_DEVICES_PER_USER active rows — revoke the oldest
  // (rowid = insertion order, deterministic even for same-ms inserts).
  const all = await db
    .select({ id: userDevices.id, revoked: userDevices.revoked })
    .from(userDevices)
    .where(eq(userDevices.userId, userId))
    .orderBy(sql`user_devices.rowid ASC`);
  const excess = all.length - MAX_DEVICES_PER_USER;
  if (excess > 0) {
    const oldestActive = all.filter((r) => !r.revoked).slice(0, excess);
    for (const r of oldestActive) {
      await db.update(userDevices).set({ revoked: true }).where(eq(userDevices.id, r.id));
    }
  }

  await auditEvents.record({
    actorId: userId,
    action: "device.registered",
    entity: "device",
    entityId: row.id,
    metadata: { platform: input.platform, appVersion: input.appVersion },
  });

  return { id: row.id, deviceToken };
}

/** Public device shape — never includes deviceToken. */
export interface DeviceView {
  id: string;
  userId: string;
  userName?: string;
  deviceName: string | null;
  platform: string | null;
  appVersion: string | null;
  revoked: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

function toDeviceView(row: any): DeviceView {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    deviceName: row.deviceName ?? null,
    platform: row.platform ?? null,
    appVersion: row.appVersion ?? null,
    revoked: !!row.revoked,
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/**
 * List devices. `scope: "all"` (admin) joins the owning user's name;
 * `scope: "own"` restricts to one user. Never selects the token column.
 */
export async function listDevices(scope: { all: boolean; userId: string }): Promise<DeviceView[]> {
  if (scope.all) {
    const rows = await db
      .select({
        id: userDevices.id,
        userId: userDevices.userId,
        userName: users.name,
        deviceName: userDevices.deviceName,
        platform: userDevices.platform,
        appVersion: userDevices.appVersion,
        revoked: userDevices.revoked,
        lastSeenAt: userDevices.lastSeenAt,
        createdAt: userDevices.createdAt,
      })
      .from(userDevices)
      .leftJoin(users, eq(userDevices.userId, users.id))
      .orderBy(desc(userDevices.createdAt), sql`user_devices.rowid DESC`);
    return rows.map(toDeviceView);
  }
  const rows = await db
    .select({
      id: userDevices.id,
      userId: userDevices.userId,
      deviceName: userDevices.deviceName,
      platform: userDevices.platform,
      appVersion: userDevices.appVersion,
      revoked: userDevices.revoked,
      lastSeenAt: userDevices.lastSeenAt,
      createdAt: userDevices.createdAt,
    })
    .from(userDevices)
    .where(eq(userDevices.userId, scope.userId))
    .orderBy(desc(userDevices.createdAt), sql`user_devices.rowid DESC`);
  return rows.map(toDeviceView);
}

export async function setDeviceRevoked(
  id: string,
  revoked: boolean
): Promise<DeviceView | null> {
  const [updated] = await db
    .update(userDevices)
    .set({ revoked })
    .where(eq(userDevices.id, id))
    .returning({ id: userDevices.id });
  if (!updated) return null;
  const row = await db.query.userDevices.findFirst({ where: eq(userDevices.id, id) });
  return row ? toDeviceView(row) : null;
}

export interface SessionView {
  id: string;
  userId: string;
  userName?: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

/** All sessions across users (admin monitoring). The session token is never exposed. */
export async function listSessions(): Promise<SessionView[]> {
  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      userName: users.name,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .leftJoin(users, eq(sessions.userId, users.id))
    .orderBy(desc(sessions.createdAt));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    ipAddress: r.ipAddress ?? null,
    userAgent: r.userAgent ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
    expiresAt: new Date(r.expiresAt).toISOString(),
  }));
}

export interface ActivityEvent {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: string;
  actorName: string | null;
  metadata: string | null;
  createdAt: string;
}

/** Remote-monitoring feed: last 50 audit events + registry/session counters. */
export async function activityFeed(): Promise<{
  events: ActivityEvent[];
  counts: { devicesActive: number; devicesRevoked: number; sessions: number };
}> {
  const rows = await db
    .select({
      id: auditEventsTable.id,
      action: auditEventsTable.action,
      entity: auditEventsTable.entity,
      entityId: auditEventsTable.entityId,
      actorId: auditEventsTable.actorId,
      actorName: users.name,
      metadata: auditEventsTable.metadata,
      createdAt: auditEventsTable.createdAt,
    })
    .from(auditEventsTable)
    .leftJoin(users, eq(auditEventsTable.actorId, users.id))
    .orderBy(desc(auditEventsTable.createdAt), sql`audit_events.rowid DESC`)
    .limit(50);

  const [active, revoked, sessionCount] = await Promise.all([
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(userDevices)
      .where(eq(userDevices.revoked, false)),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(userDevices)
      .where(eq(userDevices.revoked, true)),
    db.select({ c: sql<number>`COUNT(*)` }).from(sessions),
  ]);

  return {
    events: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId ?? null,
      actorId: r.actorId,
      actorName: r.actorName ?? null,
      metadata: r.metadata ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
    counts: {
      devicesActive: Number(active[0]?.c ?? 0),
      devicesRevoked: Number(revoked[0]?.c ?? 0),
      sessions: Number(sessionCount[0]?.c ?? 0),
    },
  };
}
