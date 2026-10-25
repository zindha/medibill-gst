/**
 * Staff & Access — the `/api/staff` roster endpoints and the device
 * revoke-all endpoint.
 *
 * Setup mirrors test/devices-sync.test.ts: one Fastify instance with the
 * staff + devices + auth routers, a scratch SQLite DB built from the SQL
 * migrations, and raw-SQL helpers for the rows the API does not expose.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedUser, type SeededUser } from "./helpers.js";
import staffRoutes from "../src/routes/staff.js";
import deviceRoutes from "../src/routes/devices.js";
import authRoutes from "../src/routes/auth.js";

let app: FastifyInstance;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function run(sqlText: string, ...params: any[]) {
  const sqlite = new Database(dbPath());
  try {
    return sqlite.prepare(sqlText).run(...params);
  } finally {
    sqlite.close();
  }
}

function get<T = any>(sqlText: string, ...params: any[]): T {
  const sqlite = new Database(dbPath());
  try {
    return sqlite.prepare(sqlText).get(...params) as T;
  } finally {
    sqlite.close();
  }
}

function count(sqlText: string, ...params: any[]): number {
  const row = get<{ c: number }>(sqlText, ...params);
  return Number(row.c);
}

/** A user with the given global role (seedUser always creates an admin). */
function seedUserWithRole(role: string): SeededUser {
  const seeded = seedUser();
  run(`UPDATE users SET role = ? WHERE id = ?`, role, seeded.id);
  return seeded;
}

/** A device row for a user; returns its device token. */
function seedDevice(userId: string, name = "Test Device"): string {
  const id = nanoid(16);
  const token = nanoid(24);
  const now = Date.now();
  run(
    `INSERT INTO user_devices (id, user_id, device_name, platform, app_version, device_token, revoked, last_seen_at, created_at)
     VALUES (?, ?, ?, 'android', '1.0.0', ?, 0, ?, ?)`,
    id,
    userId,
    name,
    token,
    now,
    now
  );
  return token;
}

/** An extra session row for a user; returns its bearer token. */
function seedSession(userId: string): string {
  const token = nanoid(32);
  const now = Date.now();
  run(
    `INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
    nanoid(16),
    userId,
    token,
    now + 7 * 24 * 3600e3,
    now
  );
  return token;
}

let seq = 0;
function uniqueEmail(): string {
  seq += 1;
  return `staff-${nanoid(10)}-${seq}@test.local`;
}
function uniquePhone(): string {
  seq += 1;
  return `98${String(Date.now()).slice(-8)}${String(seq).padStart(2, "0")}`;
}

/** POST /api/staff as an admin; returns the created member. */
async function createStaff(
  token: string,
  role: string,
  overrides: Record<string, any> = {}
) {
  return app.inject({
    method: "POST",
    url: "/api/staff",
    headers: auth(token),
    payload: {
      name: "Rita Devi",
      email: uniqueEmail(),
      phone: uniquePhone(),
      password: "secret123",
      role,
      ...overrides,
    },
  });
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(staffRoutes, { prefix: "/api/staff" });
  await app.register(deviceRoutes, { prefix: "/api/devices" });
});

afterAll(async () => {
  await app.close();
});

describe("Staff & Access — /api/staff", () => {
  it("lists the store roster with role, device and session counts", async () => {
    const admin = seedUser();
    const created = await createStaff(admin.token, "pharmacist");
    expect(created.statusCode).toBe(201);
    const staffId = created.json().user.id;

    seedDevice(staffId, "Rita Phone");
    seedSession(staffId);

    const res = await app.inject({
      method: "GET",
      url: "/api/staff",
      headers: auth(admin.token),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items.length).toBe(2);

    const adminItem = items.find((i: any) => i.id === admin.id);
    expect(adminItem).toBeTruthy();
    expect(adminItem.role).toBe("admin");
    expect(adminItem.status).toBe("active");
    expect(adminItem.isActive).toBe(true);
    expect(adminItem.sessionCount).toBe(1);
    expect(adminItem.deviceCount).toBe(0);

    const staffItem = items.find((i: any) => i.id === staffId);
    expect(staffItem).toBeTruthy();
    expect(staffItem.name).toBe("Rita Devi");
    expect(staffItem.role).toBe("pharmacist");
    expect(staffItem.status).toBe("active");
    expect(staffItem.deviceCount).toBe(1);
    expect(staffItem.sessionCount).toBe(1);
    expect(typeof staffItem.createdAt).toBe("string");
  });

  it("refuses non-admins on both list and create", async () => {
    const cashier = seedUserWithRole("cashier");

    const list = await app.inject({
      method: "GET",
      url: "/api/staff",
      headers: auth(cashier.token),
    });
    expect(list.statusCode).toBe(403);

    const create = await createStaff(cashier.token, "cashier");
    expect(create.statusCode).toBe(403);
  });

  it("creates a staff user with a role who can authenticate", async () => {
    const admin = seedUser();
    const email = uniqueEmail();
    const phone = uniquePhone();

    const res = await app.inject({
      method: "POST",
      url: "/api/staff",
      headers: auth(admin.token),
      payload: { name: "Ravi Kumar", email, phone, password: "secret123", role: "pharmacist" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.user.role).toBe("pharmacist");
    expect(body.user.email).toBe(email);
    expect(body.user.phone).toBe(phone);
    expect(body.user.isActive).toBe(true);
    expect(body.user.passwordHash).toBeUndefined();

    // The membership row carries the role and the active status.
    const membership = get(
      `SELECT role, status FROM store_members WHERE user_id = ?`,
      body.user.id
    );
    expect(membership.role).toBe("pharmacist");
    expect(membership.status).toBe("active");

    // ...and the new user can log in with the password the admin chose.
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: email, password: "secret123" },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().data.user.id).toBe(body.user.id);
    expect(login.json().data.user.role).toBe("pharmacist");
    expect(login.json().data.token).toBeTruthy();
  });

  it("rejects a duplicate e-mail or phone inside the store with 409", async () => {
    const admin = seedUser();
    const email = uniqueEmail();
    const phone = uniquePhone();

    const first = await app.inject({
      method: "POST",
      url: "/api/staff",
      headers: auth(admin.token),
      payload: { name: "First", email, phone, password: "secret123", role: "cashier" },
    });
    expect(first.statusCode).toBe(201);

    const sameEmail = await app.inject({
      method: "POST",
      url: "/api/staff",
      headers: auth(admin.token),
      payload: {
        name: "Second",
        email,
        phone: uniquePhone(),
        password: "secret123",
        role: "cashier",
      },
    });
    expect(sameEmail.statusCode).toBe(409);
    expect(sameEmail.json().success).toBe(false);
    expect(sameEmail.json().error).toMatch(/email/i);

    const samePhone = await app.inject({
      method: "POST",
      url: "/api/staff",
      headers: auth(admin.token),
      payload: {
        name: "Third",
        email: uniqueEmail(),
        phone,
        password: "secret123",
        role: "cashier",
      },
    });
    expect(samePhone.statusCode).toBe(409);
    expect(samePhone.json().error).toMatch(/phone/i);

    // Only the first member was written.
    expect(
      count(`SELECT COUNT(*) AS c FROM store_members WHERE user_id = ?`, first.json().user.id)
    ).toBe(1);
  });

  it("refuses to demote or deactivate the last active admin of the store", async () => {
    const admin = seedUser();
    await createStaff(admin.token, "pharmacist"); // provisions the store

    const demote = await app.inject({
      method: "PATCH",
      url: `/api/staff/${admin.id}`,
      headers: auth(admin.token),
      payload: { role: "cashier" },
    });
    expect(demote.statusCode).toBe(400);
    expect(demote.json().error).toMatch(/last active admin/i);

    const deactivate = await app.inject({
      method: "PATCH",
      url: `/api/staff/${admin.id}`,
      headers: auth(admin.token),
      payload: { status: "inactive" },
    });
    expect(deactivate.statusCode).toBe(400);

    // With a second active admin the demotion is allowed.
    const second = await createStaff(admin.token, "admin");
    expect(second.statusCode).toBe(201);

    const allowed = await app.inject({
      method: "PATCH",
      url: `/api/staff/${admin.id}`,
      headers: auth(admin.token),
      payload: { role: "cashier" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().member.role).toBe("cashier");
    expect(
      get(`SELECT role FROM store_members WHERE user_id = ?`, admin.id).role
    ).toBe("cashier");
  });

  it("resets a password and invalidates that user's sessions", async () => {
    const admin = seedUser();
    const email = uniqueEmail();
    const created = await app.inject({
      method: "POST",
      url: "/api/staff",
      headers: auth(admin.token),
      payload: {
        name: "Suresh",
        email,
        phone: uniquePhone(),
        password: "secret123",
        role: "cashier",
      },
    });
    expect(created.statusCode).toBe(201);
    const staffId = created.json().user.id;

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: email, password: "secret123" },
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().data.token;
    expect(count(`SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?`, staffId)).toBe(1);

    const reset = await app.inject({
      method: "POST",
      url: `/api/staff/${staffId}/reset-password`,
      headers: auth(admin.token),
      payload: { newPassword: "brandnew123" },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().success).toBe(true);
    expect(reset.json().ok).toBe(true);

    // Every session of that user is gone.
    expect(count(`SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?`, staffId)).toBe(0);
    const after = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: auth(token),
    });
    expect(after.statusCode).toBe(401);

    // The old password is dead, the new one works.
    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: email, password: "secret123" },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: email, password: "brandnew123" },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it("revoke-all revokes every device of a user and kills their sessions", async () => {
    const admin = seedUser();
    const email = uniqueEmail();
    const created = await app.inject({
      method: "POST",
      url: "/api/staff",
      headers: auth(admin.token),
      payload: {
        name: "Anita",
        email,
        phone: uniquePhone(),
        password: "secret123",
        role: "cashier",
      },
    });
    expect(created.statusCode).toBe(201);
    const staffId = created.json().user.id;

    const deviceToken = seedDevice(staffId, "Anita Phone");
    seedDevice(staffId, "Anita Tablet");
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: email, password: "secret123" },
    });
    const token = login.json().data.token;

    expect(count(`SELECT COUNT(*) AS c FROM user_devices WHERE user_id = ?`, staffId)).toBe(2);
    expect(count(`SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?`, staffId)).toBe(1);

    const res = await app.inject({
      method: "POST",
      url: `/api/devices/users/${staffId}/revoke-all`,
      headers: auth(admin.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().devicesRevoked).toBe(2);
    expect(res.json().sessionsRevoked).toBe(1);

    expect(
      count(`SELECT COUNT(*) AS c FROM user_devices WHERE user_id = ? AND revoked = 1`, staffId)
    ).toBe(2);
    expect(count(`SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?`, staffId)).toBe(0);

    // The session is dead and the device token is refused.
    const after = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: auth(token),
    });
    expect(after.statusCode).toBe(401);

    const withDevice = await app.inject({
      method: "GET",
      url: "/api/devices/me",
      headers: { ...auth(token), "x-device-token": deviceToken },
    });
    expect(withDevice.statusCode).toBe(401);

    // Non-admins cannot revoke, unknown users are 404.
    const cashier = seedUserWithRole("cashier");
    const forbidden = await app.inject({
      method: "POST",
      url: `/api/devices/users/${staffId}/revoke-all`,
      headers: auth(cashier.token),
    });
    expect(forbidden.statusCode).toBe(403);

    const missing = await app.inject({
      method: "POST",
      url: "/api/devices/users/does-not-exist/revoke-all",
      headers: auth(admin.token),
    });
    expect(missing.statusCode).toBe(404);
  });
});
