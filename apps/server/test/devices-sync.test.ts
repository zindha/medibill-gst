import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import Database from "better-sqlite3";
import { applySchema, dbPath, seedUser, type SeededUser } from "./helpers.js";
import deviceRoutes from "../src/routes/devices.js";
import syncRoutes from "../src/routes/sync.js";

/**
 * Task 15 — devices, staff capabilities and offline sync.
 *
 * Covers: device registry + cap, token revocation through authGuard AND
 * requireRole, remote sessions/activity (admin-only), the honest capability
 * map, idempotent push, version conflicts, force-overwrite, cursor pull and
 * tenant isolation.
 */

let app: FastifyInstance;

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(deviceRoutes, { prefix: "/api/devices" });
  await app.register(syncRoutes, { prefix: "/api/sync" });
});

// ---------------------------------------------------------------------------
// Small raw-SQL helpers (same pattern as the other suites)
// ---------------------------------------------------------------------------
function run(sql: string, ...params: unknown[]): void {
  const sqlite = new Database(dbPath());
  sqlite.prepare(sql).run(...(params as any[]));
  sqlite.close();
}

function get<T>(sql: string, ...params: unknown[]): T | undefined {
  const sqlite = new Database(dbPath());
  const row = sqlite.prepare(sql).get(...(params as any[])) as T | undefined;
  sqlite.close();
  return row;
}

function count(sql: string, ...params: unknown[]): number {
  const sqlite = new Database(dbPath());
  const row = sqlite.prepare(sql).get(...(params as any[])) as { c: number };
  sqlite.close();
  return row.c;
}

function setRole(userId: string, role: "admin" | "pharmacist" | "cashier"): void {
  run("UPDATE users SET role = ? WHERE id = ?", role, userId);
}

function seedUserWithRole(role: "admin" | "pharmacist" | "cashier"): SeededUser {
  const user = seedUser();
  setRole(user.id, role);
  return user;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function registerDevice(
  user: SeededUser,
  body: { deviceName: string; platform?: string; appVersion?: string } = {
    deviceName: "Test Device",
    platform: "Windows",
    appVersion: "1.0.0",
  }
) {
  return app.inject({
    method: "POST",
    url: "/api/devices/register",
    headers: auth(user.token),
    payload: {
      platform: "Windows",
      appVersion: "1.0.0",
      ...body,
    },
  });
}

async function pushAs(user: SeededUser, operations: unknown[], headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/sync/push",
    headers: { ...auth(user.token), ...headers },
    payload: { operations },
  });
}

// ===========================================================================
// Devices — registry
// ===========================================================================
describe("device registry", () => {
  it("register returns id + device token and persists the row", async () => {
    const user = seedUser();
    const res = await registerDevice(user, { deviceName: "POS-1" });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.id).toBeTruthy();
    expect(data.deviceToken).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const row = get<{ user_id: string; device_token: string; revoked: number }>(
      "SELECT user_id, device_token, revoked FROM user_devices WHERE id = ?",
      data.id
    );
    expect(row?.user_id).toBe(user.id);
    expect(row?.device_token).toBe(data.deviceToken);
    expect(row?.revoked).toBe(0);
  });

  it("register validates its body (400 on missing fields)", async () => {
    const user = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/devices/register",
      headers: auth(user.token),
      payload: { deviceName: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("register requires authentication", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/devices/register",
      payload: { deviceName: "X", platform: "Web", appVersion: "1.0.0" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("auto-revokes the oldest device once a user exceeds 10 devices", async () => {
    const user = seedUser();
    const ids: string[] = [];
    for (let i = 1; i <= 11; i++) {
      const res = await registerDevice(user, { deviceName: `Device ${i}` });
      expect(res.statusCode).toBe(201);
      ids.push(res.json().data.id);
    }
    const first = get<{ revoked: number }>(
      "SELECT revoked FROM user_devices WHERE id = ?",
      ids[0]
    );
    expect(first?.revoked).toBe(1);
    const active = count(
      "SELECT COUNT(*) AS c FROM user_devices WHERE user_id = ? AND revoked = 0",
      user.id
    );
    expect(active).toBe(10);
  });

  it("non-admin GET / returns own devices only and never exposes a token", async () => {
    // helpers.seedUser() always inserts an admin — use an explicit role here so
    // the scoping assertion actually exercises the non-admin branch.
    const owner = seedUserWithRole("cashier");
    const stranger = seedUserWithRole("cashier");
    const mine = await registerDevice(owner, { deviceName: "Mine" });
    await registerDevice(stranger, { deviceName: "Theirs" });

    const res = await app.inject({
      method: "GET",
      url: "/api/devices",
      headers: auth(owner.token),
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].deviceName).toBe("Mine");
    expect(rows[0].userId).toBe(owner.id);
    expect(res.body).not.toContain("deviceToken");
    expect(res.body).not.toContain(mine.json().data.deviceToken);
  });

  it("admin GET / sees every user's devices with the owner name, no tokens", async () => {
    const admin = seedUser();
    const staff = seedUserWithRole("cashier");
    const reg = await registerDevice(staff, { deviceName: "StaffPOS" });

    const res = await app.inject({
      method: "GET",
      url: "/api/devices",
      headers: auth(admin.token),
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data as any[];
    const staffRow = rows.find((r) => r.id === reg.json().data.id);
    expect(staffRow).toBeTruthy();
    expect(staffRow.userId).toBe(staff.id);
    expect(staffRow.userName).toBeTruthy();
    expect(res.body).not.toContain("deviceToken");
    expect(res.body).not.toContain(reg.json().data.deviceToken);
  });

  it("admin can revoke and restore a device; cashier gets 403", async () => {
    const admin = seedUser();
    const cashier = seedUserWithRole("cashier");
    const reg = await registerDevice(admin, { deviceName: "RevokeMe" });
    const id = reg.json().data.id;

    const denied = await app.inject({
      method: "POST",
      url: `/api/devices/${id}/revoke`,
      headers: auth(cashier.token),
    });
    expect(denied.statusCode).toBe(403);

    const revoked = await app.inject({
      method: "POST",
      url: `/api/devices/${id}/revoke`,
      headers: auth(admin.token),
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().data.revoked).toBe(true);
    expect(get<{ revoked: number }>("SELECT revoked FROM user_devices WHERE id = ?", id)?.revoked).toBe(1);

    const restored = await app.inject({
      method: "POST",
      url: `/api/devices/${id}/restore`,
      headers: auth(admin.token),
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().data.revoked).toBe(false);
  });

  it("revoke/restore on an unknown id → 404", async () => {
    const admin = seedUser();
    for (const action of ["revoke", "restore"]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/devices/nope-id/${action}`,
        headers: auth(admin.token),
      });
      expect(res.statusCode).toBe(404);
    }
  });
});

// ===========================================================================
// authGuard / requireRole device checks
// ===========================================================================
describe("device token enforcement", () => {
  it("valid device token passes authGuard and updates lastSeenAt", async () => {
    const user = seedUser();
    const reg = await registerDevice(user, { deviceName: "Heartbeat" });
    const token = reg.json().data.deviceToken;
    // Age the heartbeat so we can prove the request refreshes it.
    run("UPDATE user_devices SET last_seen_at = 1000 WHERE device_token = ?", token);

    const res = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: { ...auth(user.token), "x-device-token": token },
    });
    expect(res.statusCode).toBe(200);
    const seen = get<{ last_seen_at: number }>(
      "SELECT last_seen_at FROM user_devices WHERE device_token = ?",
      token
    );
    expect(seen?.last_seen_at).toBeGreaterThan(1000);
  });

  it("requests without the header behave exactly as before (regression)", async () => {
    const user = seedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: auth(user.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.userId).toBe(user.id);
  });

  it("revoked device token → 401 'This device has been revoked'", async () => {
    const user = seedUser();
    const reg = await registerDevice(user, { deviceName: "Doomed" });
    const token = reg.json().data.deviceToken;
    run("UPDATE user_devices SET revoked = 1 WHERE device_token = ?", token);

    const res = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: { ...auth(user.token), "x-device-token": token },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("This device has been revoked");
  });

  it("device token belonging to another user → 401 'Device token mismatch'", async () => {
    const alice = seedUser();
    const bob = seedUser();
    const reg = await registerDevice(bob, { deviceName: "Bob's phone" });

    const res = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: { ...auth(alice.token), "x-device-token": reg.json().data.deviceToken },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Device token mismatch");
  });

  it("unknown device token → 401 'Device token mismatch'", async () => {
    const user = seedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: { ...auth(user.token), "x-device-token": "not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Device token mismatch");
  });

  it("requireRole path blocks a revoked device with 401 before any 403", async () => {
    const admin = seedUser();
    const reg = await registerDevice(admin, { deviceName: "RevokedAdmin" });
    const token = reg.json().data.deviceToken;
    run("UPDATE user_devices SET revoked = 1 WHERE device_token = ?", token);

    const res = await app.inject({
      method: "POST",
      url: "/api/devices/some-id/revoke",
      headers: { ...auth(admin.token), "x-device-token": token },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("This device has been revoked");
  });

  it("requireRole still returns 403 (not 401) for a cashier with a healthy device", async () => {
    const cashier = seedUserWithRole("cashier");
    const reg = await registerDevice(cashier, { deviceName: "CashierPOS" });

    const res = await app.inject({
      method: "POST",
      url: "/api/devices/some-id/revoke",
      headers: { ...auth(cashier.token), "x-device-token": reg.json().data.deviceToken },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ===========================================================================
// Remote sessions + activity (admin monitoring)
// ===========================================================================
describe("remote session management", () => {
  it("admin lists sessions without exposing tokens; cashier gets 403", async () => {
    const admin = seedUser();
    const cashier = seedUserWithRole("cashier");

    const denied = await app.inject({
      method: "GET",
      url: "/api/devices/sessions",
      headers: auth(cashier.token),
    });
    expect(denied.statusCode).toBe(403);

    const res = await app.inject({
      method: "GET",
      url: "/api/devices/sessions",
      headers: auth(admin.token),
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data as any[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("userId");
    expect(rows[0]).toHaveProperty("createdAt");
    expect(res.body).not.toContain("token");
    expect(res.body).not.toContain(admin.token);
  });

  it("revoking a session kills its Bearer token immediately", async () => {
    const admin = seedUser();
    const staff = seedUserWithRole("cashier");
    // staff logs in on a second device/session
    const sessionId = `sess-${Date.now()}`;
    run(
      `INSERT INTO sessions (id, user_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      sessionId,
      staff.id,
      "second-session-token",
      Date.now() + 7 * 24 * 3600e3,
      Date.now()
    );

    const before = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: auth("second-session-token"),
    });
    expect(before.statusCode).toBe(200);

    const revoke = await app.inject({
      method: "POST",
      url: `/api/devices/sessions/${sessionId}/revoke`,
      headers: auth(admin.token),
    });
    expect(revoke.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: auth("second-session-token"),
    });
    expect(after.statusCode).toBe(401);
  });

  it("revoke of an unknown session id → 404", async () => {
    const admin = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/devices/sessions/nope/revoke",
      headers: auth(admin.token),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("activity feed", () => {
  it("admin gets audit events + registry counts; cashier gets 403", async () => {
    const admin = seedUser();
    const cashier = seedUserWithRole("cashier");
    await registerDevice(admin, { deviceName: "FeedDevice" });

    const denied = await app.inject({
      method: "GET",
      url: "/api/devices/activity",
      headers: auth(cashier.token),
    });
    expect(denied.statusCode).toBe(403);

    const res = await app.inject({
      method: "GET",
      url: "/api/devices/activity",
      headers: auth(admin.token),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events.length).toBeGreaterThan(0);
    expect(data.counts).toMatchObject({
      devicesActive: expect.any(Number),
      devicesRevoked: expect.any(Number),
      sessions: expect.any(Number),
    });
    // Registration is audited — the feed surfaces it with the actor name.
    const registered = data.events.find((e: any) => e.action === "device.registered");
    expect(registered).toBeTruthy();
    expect(registered.actorName).toBeTruthy();
    expect(res.body).not.toContain("deviceToken");
  });
});

// ===========================================================================
// Staff permissions — capability map
// ===========================================================================
describe("capabilities", () => {
  it("admin /me → ['*'] with userId and role", async () => {
    const admin = seedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: auth(admin.token),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Object.keys(data).sort()).toEqual(["capabilities", "role", "userId"]);
    expect(data.userId).toBe(admin.id);
    expect(data.role).toBe("admin");
    expect(data.capabilities).toEqual(["*"]);
  });

  it("cashier /me has billing but not compliance / accounting / stock approve", async () => {
    const cashier = seedUserWithRole("cashier");
    const res = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: auth(cashier.token),
    });
    expect(res.statusCode).toBe(200);
    const { role, capabilities } = res.json().data;
    expect(role).toBe("cashier");
    expect(capabilities).toContain("billing");
    expect(capabilities).not.toContain("compliance");
    expect(capabilities).not.toContain("accounting_manual");
    expect(capabilities).not.toContain("reconciliation_manage");
    expect(capabilities).not.toContain("stock_audit_approve");
    expect(capabilities).not.toContain("billing_prescription_override");
  });

  it("cashier keeps the capabilities whose routes are genuinely ungated", async () => {
    const cashier = seedUserWithRole("cashier");
    const res = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: auth(cashier.token),
    });
    const { capabilities } = res.json().data;
    for (const cap of ["purchases", "inventory", "reports", "orders", "messaging", "devices"]) {
      expect(capabilities).toContain(cap);
    }
  });

  it("pharmacist /me mirrors every admin|pharmacist gate", async () => {
    const pharmacist = seedUserWithRole("pharmacist");
    const res = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: auth(pharmacist.token),
    });
    expect(res.statusCode).toBe(200);
    const { role, capabilities } = res.json().data;
    expect(role).toBe("pharmacist");
    for (const cap of [
      "compliance",
      "accounting_manual",
      "reconciliation_manage",
      "stock_audit_approve",
      "billing_prescription_override",
    ]) {
      expect(capabilities).toContain(cap);
    }
  });
});

// ===========================================================================
// Sync — push
// ===========================================================================
describe("sync push", () => {
  it("medicine create is applied, recorded, and owned by the pushing user", async () => {
    const user = seedUser();
    const res = await pushAs(user, [
      {
        operationId: "op-create-1",
        entity: "medicine",
        action: "create",
        payload: { name: "Sync Med A", gstRate: "12", unit: "Strip", sellingPrice: 10 },
      },
    ]);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.applied).toBe(1);
    expect(data.results[0].status).toBe("applied");
    expect(data.results[0].entityId).toBeTruthy();
    expect(data.results[0].appliedVersion).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const row = get<{ created_by: string; name: string }>(
      "SELECT created_by, name FROM medicines WHERE id = ?",
      data.results[0].entityId
    );
    expect(row?.created_by).toBe(user.id);
    expect(row?.name).toBe("Sync Med A");

    // The journal row carries the pushed payload.
    const journal = get<{ payload: string; status: string }>(
      "SELECT payload, status FROM sync_operations WHERE created_by = ? AND operation_id = ?",
      user.id,
      "op-create-1"
    );
    expect(journal?.status).toBe("applied");
    expect(journal?.payload).toContain("Sync Med A");
  });

  it("replaying the same operationId → duplicate, no second row", async () => {
    const user = seedUser();
    const op = [
      {
        operationId: "op-dup-1",
        entity: "medicine",
        action: "create",
        payload: { name: "Dup Med" },
      },
    ];
    const first = await pushAs(user, op);
    expect(first.json().data.applied).toBe(1);

    const second = await pushAs(user, op);
    const data = second.json().data;
    expect(data.results[0].status).toBe("duplicate");
    expect(data.duplicates).toBe(1);
    expect(data.applied).toBe(0);

    const rows = count(
      "SELECT COUNT(*) AS c FROM medicines WHERE name = 'Dup Med' AND created_by = ?",
      user.id
    );
    expect(rows).toBe(1);
  });

  it("update with the correct baseVersion is applied and bumps updatedAt", async () => {
    const user = seedUser();
    const create = await pushAs(user, [
      {
        operationId: "op-upd-create",
        entity: "medicine",
        action: "create",
        payload: { name: "Versioned Med" },
      },
    ]);
    const { entityId, appliedVersion } = create.json().data.results[0];
    await delay(5);

    const res = await pushAs(user, [
      {
        operationId: "op-upd-1",
        entity: "medicine",
        action: "update",
        baseVersion: appliedVersion,
        payload: { id: entityId, name: "Versioned Med v2", sellingPrice: 42 },
      },
    ]);
    const result = res.json().data.results[0];
    expect(result.status).toBe("applied");
    expect(result.appliedVersion).not.toBe(appliedVersion);

    const row = get<{ name: string; selling_price: number; updated_at: number }>(
      "SELECT name, selling_price, updated_at FROM medicines WHERE id = ?",
      entityId
    );
    expect(row?.name).toBe("Versioned Med v2");
    expect(row?.selling_price).toBe(42);
  });

  it("stale baseVersion → conflict with server snapshot, row unchanged", async () => {
    const user = seedUser();
    const create = await pushAs(user, [
      {
        operationId: "op-conf-create",
        entity: "medicine",
        action: "create",
        payload: { name: "Conflict Med" },
      },
    ]);
    const { entityId, appliedVersion } = create.json().data.results[0];

    const res = await pushAs(user, [
      {
        operationId: "op-conf-1",
        entity: "medicine",
        action: "update",
        baseVersion: "1999-01-01T00:00:00.000Z",
        payload: { id: entityId, name: "Conflict Med STALE" },
      },
    ]);
    const data = res.json().data;
    expect(data.conflicts).toBe(1);
    const result = data.results[0];
    expect(result.status).toBe("conflict");
    expect(result.conflict).toBeTruthy();
    expect(result.conflict.name).toBe("Conflict Med");
    expect(result.conflict.updatedAt).toBeTruthy();

    // Row untouched.
    const row = get<{ name: string }>("SELECT name FROM medicines WHERE id = ?", entityId);
    expect(row?.name).toBe("Conflict Med");
    // Journal stores the conflict snapshot too.
    const journal = get<{ conflict_json: string }>(
      "SELECT conflict_json FROM sync_operations WHERE created_by = ? AND operation_id = ?",
      user.id,
      "op-conf-1"
    );
    expect(journal?.conflict_json).toContain("Conflict Med");
    expect(appliedVersion).toBeTruthy();
  });

  it("force resolution: re-push without baseVersion overwrites", async () => {
    const user = seedUser();
    const create = await pushAs(user, [
      {
        operationId: "op-force-create",
        entity: "medicine",
        action: "create",
        payload: { name: "Force Med" },
      },
    ]);
    const { entityId } = create.json().data.results[0];

    const res = await pushAs(user, [
      {
        operationId: "op-force-1",
        entity: "medicine",
        action: "update",
        payload: { id: entityId, name: "Force Med WINS" },
      },
    ]);
    expect(res.json().data.results[0].status).toBe("applied");
    const row = get<{ name: string }>("SELECT name FROM medicines WHERE id = ?", entityId);
    expect(row?.name).toBe("Force Med WINS");
  });

  it("unsupported entity (invoice) → error 'unsupported entity'", async () => {
    const user = seedUser();
    const res = await pushAs(user, [
      { operationId: "op-inv-1", entity: "invoice", action: "create", payload: { total: 10 } },
    ]);
    const data = res.json().data;
    expect(data.errors).toBe(1);
    expect(data.results[0].status).toBe("error");
    expect(data.results[0].error).toBe("unsupported entity");
    expect(
      count("SELECT COUNT(*) AS c FROM sync_operations WHERE operation_id = 'op-inv-1'")
    ).toBe(1);
  });

  it("another user's medicineId → error not-found (tenant safe)", async () => {
    const alice = seedUser();
    const bob = seedUser();
    const create = await pushAs(alice, [
      { operationId: "op-tenant-create", entity: "medicine", action: "create", payload: { name: "Alice Med" } },
    ]);
    const { entityId } = create.json().data.results[0];

    const res = await pushAs(bob, [
      {
        operationId: "op-tenant-1",
        entity: "medicine",
        action: "update",
        payload: { id: entityId, name: "Hijacked" },
      },
    ]);
    const result = res.json().data.results[0];
    expect(result.status).toBe("error");
    expect(result.error).toContain("not found");

    const row = get<{ name: string }>("SELECT name FROM medicines WHERE id = ?", entityId);
    expect(row?.name).toBe("Alice Med");
  });

  it("rejects batches larger than 100 operations (400)", async () => {
    const user = seedUser();
    const operations = Array.from({ length: 101 }, (_, i) => ({
      operationId: `bulk-${i}`,
      entity: "setting",
      action: "update",
      payload: { key: `k${i}`, value: i },
    }));
    const res = await pushAs(user, operations);
    expect(res.statusCode).toBe(400);
  });

  it("rejects operationId longer than 64 chars (400)", async () => {
    const user = seedUser();
    const res = await pushAs(user, [
      {
        operationId: "x".repeat(65),
        entity: "setting",
        action: "update",
        payload: { key: "k", value: 1 },
      },
    ]);
    expect(res.statusCode).toBe(400);
  });

  it("setting update upserts store_name", async () => {
    const user = seedUser();
    const res = await pushAs(user, [
      {
        operationId: "op-set-1",
        entity: "setting",
        action: "update",
        payload: { key: "store_name", value: "MediShop Sync" },
      },
    ]);
    const result = res.json().data.results[0];
    expect(result.status).toBe("applied");
    expect(result.entityId).toBeTruthy();

    const row = get<{ value: string }>("SELECT value FROM settings WHERE key = 'store_name'");
    expect(row?.value).toContain("MediShop Sync");
  });

  it("setting update with stale baseVersion conflicts and leaves the value alone", async () => {
    const user = seedUser();
    const first = await pushAs(user, [
      {
        operationId: "op-set-2",
        entity: "setting",
        action: "update",
        payload: { key: "store_name2", value: "original" },
      },
    ]);
    const { appliedVersion } = first.json().data.results[0];

    const res = await pushAs(user, [
      {
        operationId: "op-set-3",
        entity: "setting",
        action: "update",
        baseVersion: "1970-01-01T00:00:00.000Z",
        payload: { key: "store_name2", value: "changed" },
      },
    ]);
    const result = res.json().data.results[0];
    expect(result.status).toBe("conflict");
    expect(result.conflict).toBeTruthy();

    const row = get<{ value: string }>("SELECT value FROM settings WHERE key = 'store_name2'");
    expect(row?.value).toContain("original");
    expect(appliedVersion).toBeTruthy();
  });

  it("push requires authentication", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      payload: { operations: [{ operationId: "x", entity: "setting", action: "update", payload: { key: "k", value: 1 } }] },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// Sync — pull + status
// ===========================================================================
describe("sync pull", () => {
  it("returns the caller's own applied/conflict ops in chronological order", async () => {
    const user = seedUser();
    for (let i = 1; i <= 3; i++) {
      const res = await pushAs(user, [
        {
          operationId: `ord-${i}`,
          entity: "setting",
          action: "update",
          payload: { key: `order-key-${i}`, value: i },
        },
      ]);
      expect(res.json().data.results[0].status).toBe("applied");
      await delay(5);
    }

    const res = await app.inject({
      method: "GET",
      url: "/api/sync/pull",
      headers: auth(user.token),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.ops.map((o: any) => o.operationId)).toEqual(["ord-1", "ord-2", "ord-3"]);
    expect(data.hasMore).toBe(false);
    expect(data.nextCursor).toBeNull();
    expect(data.ops[0]).toHaveProperty("appliedAt");
    expect(data.ops[0]).toHaveProperty("appliedVersion");
    expect(data.ops[0].payload).toMatchObject({ key: "order-key-1" });
  });

  it("cursor pagination advances without repeats", async () => {
    const user = seedUser();
    for (let i = 1; i <= 5; i++) {
      await pushAs(user, [
        {
          operationId: `cur-${i}`,
          entity: "setting",
          action: "update",
          payload: { key: `cur-key-${i}`, value: i },
        },
      ]);
      await delay(5);
    }

    const page1 = await app.inject({
      method: "GET",
      url: "/api/sync/pull?limit=2",
      headers: auth(user.token),
    });
    const d1 = page1.json().data;
    expect(d1.ops).toHaveLength(2);
    expect(d1.hasMore).toBe(true);
    expect(d1.nextCursor).toBeTruthy();

    const page2 = await app.inject({
      method: "GET",
      url: `/api/sync/pull?limit=2&cursor=${encodeURIComponent(d1.nextCursor)}`,
      headers: auth(user.token),
    });
    const d2 = page2.json().data;
    expect(d2.ops).toHaveLength(2);
    const seen = new Set([...d1.ops, ...d2.ops].map((o: any) => o.operationId));
    expect(seen.size).toBe(4);

    const page3 = await app.inject({
      method: "GET",
      url: `/api/sync/pull?limit=2&cursor=${encodeURIComponent(d2.nextCursor)}`,
      headers: auth(user.token),
    });
    const d3 = page3.json().data;
    expect(d3.ops).toHaveLength(1);
    expect(d3.hasMore).toBe(false);
    expect(d3.nextCursor).toBeNull();
    const all = [...d1.ops, ...d2.ops, ...d3.ops].map((o: any) => o.operationId);
    expect(new Set(all).size).toBe(5);
    expect(all).toEqual(["cur-1", "cur-2", "cur-3", "cur-4", "cur-5"]);
  });

  it("cross-tenant: B never sees A's operations", async () => {
    const alice = seedUser();
    const bob = seedUser();
    await pushAs(alice, [
      { operationId: "a-private-1", entity: "setting", action: "update", payload: { key: "a-key", value: 1 } },
    ]);
    await pushAs(bob, [
      { operationId: "b-private-1", entity: "setting", action: "update", payload: { key: "b-key", value: 2 } },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/sync/pull",
      headers: auth(bob.token),
    });
    const ids = res.json().data.ops.map((o: any) => o.operationId);
    expect(ids).toContain("b-private-1");
    expect(ids).not.toContain("a-private-1");
  });

  it("omits duplicate and error operations from the feed", async () => {
    const user = seedUser();
    await pushAs(user, [
      { operationId: "feed-err", entity: "invoice", action: "create", payload: {} },
    ]);
    await pushAs(user, [
      { operationId: "feed-ok", entity: "setting", action: "update", payload: { key: "feed-key", value: 1 } },
    ]);
    // Replay → duplicate (never surfaced).
    await pushAs(user, [
      { operationId: "feed-ok", entity: "setting", action: "update", payload: { key: "feed-key", value: 1 } },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/sync/pull",
      headers: auth(user.token),
    });
    const ids = res.json().data.ops.map((o: any) => o.operationId);
    expect(ids).toContain("feed-ok");
    expect(ids).not.toContain("feed-err");
    expect(ids.filter((id: string) => id === "feed-ok")).toHaveLength(1);
  });

  it("invalid cursor → 400", async () => {
    const user = seedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/sync/pull?cursor=garbage",
      headers: auth(user.token),
    });
    expect(res.statusCode).toBe(400);
  });

  it("pull requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/sync/pull" });
    expect(res.statusCode).toBe(401);
  });
});

describe("sync status", () => {
  it("returns ops count, db size, last backup and server time", async () => {
    const user = seedUser();
    await pushAs(user, [
      { operationId: "status-op", entity: "setting", action: "update", payload: { key: "status-key", value: 1 } },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/sync/status",
      headers: auth(user.token),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.opsCount).toBeGreaterThanOrEqual(1);
    expect(typeof data.dbSizeBytes).toBe("number");
    expect(data.dbSizeBytes).toBeGreaterThan(0);
    expect(data.lastBackupAt === null || typeof data.lastBackupAt === "string").toBe(true);
    expect(typeof data.serverTime).toBe("string");
    expect(new Date(data.serverTime).getTime()).not.toBeNaN();
  });
});
