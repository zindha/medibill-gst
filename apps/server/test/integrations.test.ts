import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { randomBytes } from "crypto";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { nanoid } from "nanoid";
import { eq, sql } from "drizzle-orm";
import { applySchema, dbPath, seedMedicine, seedUser, type SeededUser } from "./helpers.js";
import { DATA_DIR, db } from "../src/db/index.js";
import {
  auditEvents as auditEventsTable,
  customers,
  generateId,
  invoices,
  messageDeliveries,
  outboxEvents,
  scheduledReportRuns,
  scheduledReports,
  settings,
  storedFiles,
} from "../src/db/schema/index.js";
import integrationRoutes from "../src/routes/integrations.js";
import scheduledReportRoutes from "../src/routes/scheduledReports.js";
import {
  PROVIDERS,
  SECRET_PREFIX,
  connect,
  disconnect,
  getResolvedCredentials,
  integrationSettingsKey,
} from "../src/services/integrations.js";
import { NotConfiguredError, getProvider } from "../src/providers/messaging.js";
import { getGstProvider } from "../src/providers/gst.js";
import {
  buildCsv,
  computeNextRun,
  localStamp,
  runReport,
  tickDueScheduledReports,
} from "../src/services/reportsDelivery.js";
import { fileStorage } from "../src/services/fileStorage.js";

/**
 * Task 17 — Integrations Center + Scheduled Reports.
 *
 * The VITEST env has NO provider env vars (messaging relies on that) and the
 * settings table is shared across test files, so this file scrubs
 * `integration:*` / `online_orders` / provider env BOTH before and after it
 * runs — later files (e.g. messaging.test.ts) must still see the pristine
 * unconfigured state.
 */

const PROVIDER_ENV = [
  "WHATSAPP_API_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "SMS_WEBHOOK_URL",
  "SMS_API_KEY",
  "SMS_SENDER",
  "EMAIL_WEBHOOK_URL",
  "EINVOICE_PROVIDER",
  "EINVOICE_GSP_ID",
  "EINVOICE_GSP_KEY",
  "EINVOICE_USERNAME",
  "EINVOICE_PASSWORD",
  "EINVOICE_BASE_URL",
  "EWAY_BASE_URL",
];

const KEY_FILE = join(DATA_DIR, "integration.key");

let app: FastifyInstance;
let ctx: SeededUser;
let other: SeededUser;
let cashier: SeededUser;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Seed a user with an arbitrary role (helpers.seedUser is admin-only). */
function seedRoleUser(role: string): SeededUser {
  const now = Date.now();
  const id = nanoid(16);
  const token = nanoid(32);
  const sqlite = new Database(dbPath());
  sqlite
    .prepare(
      `INSERT INTO users (id, email, name, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    .run(id, `user-${id}@test.local`, "Role Tester", role, now, now);
  sqlite
    .prepare(
      `INSERT INTO sessions (id, user_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(nanoid(16), id, token, now + 7 * 24 * 3600e3, now);
  sqlite.close();
  return { id, token };
}

async function scrubGlobalState(): Promise<void> {
  await db.delete(settings).where(sql`${settings.key} LIKE ${"integration:%"}`);
  await db.delete(settings).where(eq(settings.key, "online_orders"));
  await db.delete(scheduledReports); // cascades scheduled_report_runs
  for (const key of PROVIDER_ENV) delete process.env[key];
  if (existsSync(KEY_FILE)) unlinkSync(KEY_FILE);
}

async function settingRow(key: string) {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0];
}

async function auditRows(action: string) {
  return db
    .select()
    .from(auditEventsTable)
    .where(eq(auditEventsTable.action, action));
}

async function seedInvoice(
  ownerId: string,
  opts: { date: string; invoiceNo?: string; grandTotal?: number }
) {
  const id = generateId();
  await db.insert(invoices).values({
    id,
    invoiceNo: opts.invoiceNo ?? `SR-${nanoid(8)}`,
    customerName: "Report Customer",
    date: opts.date,
    subtotal: opts.grandTotal ?? 100,
    totalGst: 5,
    discountAmount: 0,
    grandTotal: opts.grandTotal ?? 100,
    amountPaid: opts.grandTotal ?? 100,
    status: "paid",
    createdBy: ownerId,
  });
  return id;
}

async function insertReportRow(
  ownerId: string,
  overrides: Partial<{ nextRunAt: string; enabled: boolean; name: string; recipients: string }> = {}
) {
  const now = new Date();
  const id = generateId();
  await db.insert(scheduledReports).values({
    id,
    createdBy: ownerId,
    name: overrides.name ?? "Tick Report",
    reportType: "sales",
    schedule: JSON.stringify({ kind: "daily", time: "09:00" }),
    recipients: overrides.recipients ?? "[]",
    format: "csv",
    filters: JSON.stringify({ daysBack: 30 }),
    nextRunAt: overrides.nextRunAt ?? "2099-01-01T09:00",
    enabled: overrides.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Minimal RFC-4180 parser for round-trip assertions. */
function naiveParse(csv: string): string[][] {
  const text = csv.replace(/^\uFEFF/, "").replace(/\r\n$/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

beforeAll(async () => {
  applySchema();
  await scrubGlobalState();
  ctx = seedUser();
  other = seedUser();
  cashier = seedRoleUser("cashier");
  app = Fastify({ logger: false });
  await app.register(integrationRoutes, { prefix: "/api/integrations" });
  await app.register(scheduledReportRoutes, { prefix: "/api/scheduled-reports" });
});

afterAll(async () => {
  await app?.close();
  // Leave the shared test DB pristine for every file that runs after this one.
  await scrubGlobalState();
});

// ---------------------------------------------------------------------------
// Registry + health
// ---------------------------------------------------------------------------
describe("integrations registry & health", () => {
  it("GET /api/integrations returns the full registry with a connected/total summary", async () => {
    const res = await app.inject({ method: "GET", url: "/api/integrations", headers: auth(ctx.token) });
    expect(res.statusCode).toBe(200);
    const { providers, summary } = res.json().data;
    expect(providers).toHaveLength(PROVIDERS.length);
    expect(providers.map((p: any) => p.id).sort()).toEqual(PROVIDERS.map((p) => p.id).sort());
    expect(summary.total).toBe(PROVIDERS.length);
    // e-invoice fake mode + online ordering default-on are connected out of the box.
    expect(summary.connected).toBeGreaterThanOrEqual(2);
    const whats = providers.find((p: any) => p.id === "whatsapp");
    expect(whats.fields).toEqual([
      { key: "apiToken", secret: true },
      { key: "phoneNumberId", secret: false },
    ]);
    // Never leaks a value.
    expect(res.body).not.toMatch(/enc:v1:/);
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/integrations" });
    expect(res.statusCode).toBe(401);
  });

  it("404s an unknown provider id on GET", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/integrations/telegram",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/Unknown integration/);
  });

  it("404s an unknown provider id on connect", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/connect",
      headers: auth(ctx.token),
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it("connect validates required fields when enabling (whatsapp without apiToken → 400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/whatsapp/connect",
      headers: auth(ctx.token),
      payload: { enabled: true, config: { phoneNumberId: "12345" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("apiToken");
  });

  it("connect + health: settings-backed whatsapp reports connected with mode=settings", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/whatsapp/connect",
      headers: auth(ctx.token),
      payload: {
        enabled: true,
        config: { phoneNumberId: "9876543210" },
        secrets: { apiToken: "wh-secret-token-abc" },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.mode).toBe("settings");
    expect(res.json().data.connected).toBe(true);
    expect(res.json().data.enabled).toBe(true);
  });

  it("stores secrets encrypted (raw row has enc:v1: and NOT the plaintext token)", async () => {
    const row = await settingRow(integrationSettingsKey("whatsapp"));
    expect(row).toBeTruthy();
    expect(row!.value).toContain(SECRET_PREFIX);
    expect(row!.value).not.toContain("wh-secret-token-abc");
    // Plain (non-secret) config stays readable JSON.
    const parsed = JSON.parse(row!.value);
    expect(parsed.config.phoneNumberId).toBe("9876543210");
    expect(parsed.secrets.apiToken.startsWith(SECRET_PREFIX)).toBe(true);
  });

  it("GET /api/integrations/:id redacts secrets to bullets and never returns plaintext", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/integrations/whatsapp",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.secrets.apiToken).toBe("•••");
    expect(data.config.phoneNumberId).toBe("9876543210");
    expect(res.body).not.toContain("wh-secret-token-abc");
    expect(res.body).not.toContain(SECRET_PREFIX);
  });

  it("audit metadata records field names only — no secret values", async () => {
    const rows = await auditRows("integration.connected");
    expect(rows.length).toBeGreaterThan(0);
    const metadata = rows.map((r) => r.metadata ?? "").join(" ");
    expect(metadata).toContain("apiToken");
    expect(metadata).not.toContain("wh-secret-token-abc");
    expect(metadata).not.toContain(SECRET_PREFIX);
  });

  it("disconnect wipes the settings row, audits, and health falls back to not-configured", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/whatsapp/disconnect",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    expect(await settingRow(integrationSettingsKey("whatsapp"))).toBeUndefined();

    const disconnected = await auditRows("integration.disconnected");
    expect(disconnected.length).toBeGreaterThan(0);
    expect(disconnected[0].entityId).toBe("whatsapp");

    const health = await app.inject({
      method: "GET",
      url: "/api/integrations/whatsapp",
      headers: auth(ctx.token),
    });
    expect(health.json().data.connected).toBe(false);
    expect(health.json().data.mode).toBeNull();
    expect(health.json().data.missingEnv).toContain("WHATSAPP_API_TOKEN");
  });

  it("cashier cannot connect (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/sms/connect",
      headers: auth(cashier.token),
      payload: { enabled: true, secrets: { webhookUrl: "https://hook.test/x" }, config: { sender: "CARE" } },
    });
    expect(res.statusCode).toBe(403);
  });

  it("cashier cannot disconnect (403) but may read (200)", async () => {
    const deny = await app.inject({
      method: "POST",
      url: "/api/integrations/sms/disconnect",
      headers: auth(cashier.token),
    });
    expect(deny.statusCode).toBe(403);
    const read = await app.inject({
      method: "GET",
      url: "/api/integrations",
      headers: auth(cashier.token),
    });
    expect(read.statusCode).toBe(200);
  });

  it("sms health: no env + no settings → not connected, mode null, missing env names only", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/integrations/sms",
      headers: auth(ctx.token),
    });
    const data = res.json().data;
    expect(data.connected).toBe(false);
    expect(data.mode).toBeNull();
    expect(data.missingEnv).toEqual(["SMS_WEBHOOK_URL"]);
    expect(res.body).not.toContain("http"); // no values, names only
  });

  it("sms health: settings connected → mode settings", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/sms/connect",
      headers: auth(ctx.token),
      payload: { enabled: true, secrets: { webhookUrl: "https://sms.test/hook" }, config: { sender: "CARE" } },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.mode).toBe("settings");
    expect(data.connected).toBe(true);
  });

  it("sms health: falls back to env (mode=env) when settings are absent but env is set", async () => {
    await app.inject({
      method: "POST",
      url: "/api/integrations/sms/disconnect",
      headers: auth(ctx.token),
    });
    process.env.SMS_WEBHOOK_URL = "https://env-sms.test/hook";
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/integrations/sms",
        headers: auth(ctx.token),
      });
      expect(res.json().data.mode).toBe("env");
      expect(res.json().data.connected).toBe(true);
      expect(res.json().data.missingEnv).toEqual([]);
    } finally {
      delete process.env.SMS_WEBHOOK_URL;
    }
  });

  it("online_orders health reflects the existing toggle (off → on)", async () => {
    const off = await app.inject({
      method: "POST",
      url: "/api/integrations/online_orders/connect",
      headers: auth(ctx.token),
      payload: { enabled: false },
    });
    expect(off.statusCode).toBe(200);
    let health = await app.inject({
      method: "GET",
      url: "/api/integrations/online_orders",
      headers: auth(ctx.token),
    });
    expect(health.json().data.enabled).toBe(false);
    expect(health.json().data.connected).toBe(false);

    const on = await app.inject({
      method: "POST",
      url: "/api/integrations/online_orders/connect",
      headers: auth(ctx.token),
      payload: { enabled: true },
    });
    expect(on.statusCode).toBe(200);
    health = await app.inject({
      method: "GET",
      url: "/api/integrations/online_orders",
      headers: auth(ctx.token),
    });
    expect(health.json().data.enabled).toBe(true);
    expect(health.json().data.connected).toBe(true);
  });

  it("einvoice health defaults to mode=fake (configured, zero config)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/integrations/einvoice",
      headers: auth(ctx.token),
    });
    const data = res.json().data;
    expect(data.mode).toBe("fake");
    expect(data.connected).toBe(true);
  });

  it("einvoice health switches to mode=settings when GSP credentials are stored", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/einvoice/connect",
      headers: auth(ctx.token),
      payload: {
        enabled: true,
        config: { gspId: "GSP1", username: "user1", baseUrl: "https://nic.test/api" },
        secrets: { gspKey: "key-1", password: "pw-1" },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.mode).toBe("settings");
    expect(res.json().data.connected).toBe(true);
    // Back to fake for every later test in this file.
    await disconnect("einvoice", ctx.id);
  });

  it("payment_collect connects on a plain UPI id and disconnects cleanly", async () => {
    const on = await app.inject({
      method: "POST",
      url: "/api/integrations/payment_collect/connect",
      headers: auth(ctx.token),
      payload: { enabled: true, config: { upiId: "care@upi" } },
    });
    expect(on.statusCode).toBe(200);
    expect(on.json().data.connected).toBe(true);
    expect(on.json().data.mode).toBe("settings");

    const off = await app.inject({
      method: "POST",
      url: "/api/integrations/payment_collect/disconnect",
      headers: auth(ctx.token),
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().data.connected).toBe(false);
    expect(off.json().data.mode).toBeNull();
  });

  it("google_drive health reflects the OAuth flow status (not connected in tests)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/integrations/google_drive",
      headers: auth(ctx.token),
    });
    const data = res.json().data;
    expect(data.connected).toBe(false);
    expect(data.mode).toBeNull();
    expect(data.fields).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Credentials + adapter fallbacks
// ---------------------------------------------------------------------------
describe("credential resolution & adapters", () => {
  it("getResolvedCredentials decrypts a connect → resolve roundtrip", async () => {
    await connect("whatsapp", ctx.id, {
      enabled: true,
      config: { phoneNumberId: "5551234" },
      secrets: { apiToken: "roundtrip-token" },
    });
    const resolved = getResolvedCredentials("whatsapp");
    expect(resolved).toBeTruthy();
    expect(resolved!.secrets.apiToken).toBe("roundtrip-token");
    expect(resolved!.config.phoneNumberId).toBe("5551234");
  });

  it("returns null for an unknown id and for a never-connected provider", () => {
    expect(getResolvedCredentials("nope")).toBeNull();
    expect(getResolvedCredentials("email")).toBeNull();
  });

  it("returns null when the record is disabled", async () => {
    await connect("email", ctx.id, {
      enabled: false,
      secrets: { webhookUrl: "https://mail.test/hook" },
    });
    expect(getResolvedCredentials("email")).toBeNull();
  });

  it("getProvider resolves a settings-backed SMS adapter (no env, no throw)", async () => {
    await connect("sms", ctx.id, {
      enabled: true,
      secrets: { webhookUrl: "https://sms-settings.test/hook" },
      config: { sender: "CARE" },
    });
    const provider = getProvider("sms");
    expect(provider).toBeTruthy();
    expect(typeof provider.send).toBe("function");
  });

  it("getProvider still throws NotConfiguredError for an unconfigured channel", () => {
    expect(() => getProvider("email")).toThrow(NotConfiguredError);
  });

  it("getGstProvider defaults to the fake adapter", () => {
    expect(getGstProvider().name).toBe("fake");
  });

  it("getGstProvider returns a settings-bound NIC adapter when einvoice is connected", async () => {
    await connect("einvoice", ctx.id, {
      enabled: true,
      config: { gspId: "GSP9", username: "user9", baseUrl: "https://nic-settings.test" },
      secrets: { gspKey: "key-9", password: "pw-9" },
    });
    expect(getGstProvider().name).toBe("nic");
    await disconnect("einvoice", ctx.id);
    expect(getGstProvider().name).toBe("fake");
  });

  it("a tampered/corrupt key file resolves to null instead of throwing", async () => {
    await connect("whatsapp", ctx.id, {
      enabled: true,
      config: { phoneNumberId: "111" },
      secrets: { apiToken: "tamper-token" },
    });
    expect(getResolvedCredentials("whatsapp")?.secrets.apiToken).toBe("tamper-token");

    // Valid-looking but DIFFERENT key → GCM auth failure → safe null.
    writeFileSync(KEY_FILE, randomBytes(32).toString("hex"));
    expect(getResolvedCredentials("whatsapp")).toBeNull();

    // Corrupt (non-hex) key → loadKey throws → safe null.
    writeFileSync(KEY_FILE, "zzzz-not-a-key");
    expect(getResolvedCredentials("whatsapp")).toBeNull();

    // Restore a fresh key so later connects in this file keep working.
    writeFileSync(KEY_FILE, randomBytes(32).toString("hex"));
  });
});

// ---------------------------------------------------------------------------
// Schedule math + validation
// ---------------------------------------------------------------------------
describe("schedule presets", () => {
  it("daily 09:00: 08:00 → today 09:00, 10:00 → tomorrow 09:00", () => {
    const morning = new Date(2026, 0, 5, 8, 0, 0);
    const evening = new Date(2026, 0, 5, 10, 0, 0);
    expect(computeNextRun(morning, { kind: "daily", time: "09:00" })).toBe("2026-01-05T09:00");
    expect(computeNextRun(evening, { kind: "daily", time: "09:00" })).toBe("2026-01-06T09:00");
  });

  it("weekly picks the next matching weekday", () => {
    // 2026-01-05 is a Monday; ask for Wednesday (3).
    const monday = new Date(2026, 0, 5, 10, 0, 0);
    expect(computeNextRun(monday, { kind: "weekly", day: 3, time: "09:00" })).toBe(
      "2026-01-07T09:00"
    );
    // Same weekday later in the day rolls to next week.
    const lateWednesday = new Date(2026, 0, 7, 10, 0, 0);
    expect(computeNextRun(lateWednesday, { kind: "weekly", day: 3, time: "09:00" })).toBe(
      "2026-01-14T09:00"
    );
  });

  it("monthly targets this month's day when still ahead, else next month", () => {
    const early = new Date(2026, 0, 3, 8, 0, 0);
    expect(computeNextRun(early, { kind: "monthly", day: 15, time: "09:00" })).toBe(
      "2026-01-15T09:00"
    );
    const late = new Date(2026, 0, 20, 8, 0, 0);
    expect(computeNextRun(late, { kind: "monthly", day: 15, time: "09:00" })).toBe(
      "2026-02-15T09:00"
    );
  });

  it("rejects an invalid time (25:00) with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
      payload: {
        name: "Bad time",
        reportType: "sales",
        schedule: { kind: "daily", time: "25:00" },
        recipients: [{ channel: "email", address: "a@example.com" }],
        format: "csv",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects weekly day 31 and monthly day 31 with 400", async () => {
    const weekly = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
      payload: {
        name: "Bad weekly",
        reportType: "sales",
        schedule: { kind: "weekly", day: 31, time: "09:00" },
        recipients: [{ channel: "email", address: "a@example.com" }],
        format: "csv",
      },
    });
    expect(weekly.statusCode).toBe(400);

    const monthly = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
      payload: {
        name: "Bad monthly",
        reportType: "sales",
        schedule: { kind: "monthly", day: 31, time: "09:00" },
        recipients: [{ channel: "email", address: "a@example.com" }],
        format: "csv",
      },
    });
    expect(monthly.statusCode).toBe(400);
  });

  it("rejects format=pdf with an honest 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
      payload: {
        name: "PDF report",
        reportType: "sales",
        schedule: { kind: "daily", time: "09:00" },
        recipients: [{ channel: "email", address: "a@example.com" }],
        format: "pdf",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("PDF export not supported yet");
  });

  it("validates recipients (unknown channel → 400) and name (empty → 400)", async () => {
    const badChannel = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
      payload: {
        name: "Bad recipient",
        reportType: "sales",
        schedule: { kind: "daily", time: "09:00" },
        recipients: [{ channel: "whatsapp", address: "+91111111111" }],
        format: "csv",
      },
    });
    expect(badChannel.statusCode).toBe(400);

    const noName = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
      payload: {
        name: "   ",
        reportType: "sales",
        schedule: { kind: "daily", time: "09:00" },
        recipients: [{ channel: "email", address: "a@example.com" }],
        format: "csv",
      },
    });
    expect(noName.statusCode).toBe(400);
  });

  it("creates a valid report with a computed next_run_at (route-level sanity)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
      payload: {
        name: "Morning sales",
        reportType: "sales",
        schedule: { kind: "daily", time: "09:00" },
        recipients: [{ channel: "email", address: "owner@example.com" }],
        format: "csv",
        filters: { daysBack: 14 },
      },
    });
    expect(res.statusCode).toBe(201);
    const row = res.json().data;
    expect(row.nextRunAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(row.nextRunAt > localStamp(new Date())).toBe(true);
    expect(JSON.parse(row.filters).daysBack).toBe(14);
    expect(JSON.parse(row.schedule).kind).toBe("daily");
  });
});

// ---------------------------------------------------------------------------
// CSV builder
// ---------------------------------------------------------------------------
describe("buildCsv", () => {
  it("escapes commas/quotes/newlines per RFC 4180 and round-trips", () => {
    const csv = buildCsv(
      [
        { key: "a", header: "A" },
        { key: "b", header: "B" },
      ],
      [
        { a: 'He said "hi",', b: "line1\nline2" },
        { a: "plain", b: "ok" },
      ]
    );
    // BOM prefix for Excel + CRLF endings.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("\r\n");

    const parsed = naiveParse(csv);
    expect(parsed[0]).toEqual(["A", "B"]);
    expect(parsed[1][0]).toBe('He said "hi",');
    expect(parsed[1][1]).toBe("line1\nline2");
    expect(parsed[2]).toEqual(["plain", "ok"]);
    expect(parsed).toHaveLength(3);
  });

  it("renders null/undefined as empty cells", () => {
    const csv = buildCsv([{ key: "a", header: "A" }], [{ a: null }]);
    expect(naiveParse(csv)[1]).toEqual([""]);
  });
});

// ---------------------------------------------------------------------------
// Manual runs + delivery
// ---------------------------------------------------------------------------
describe("scheduled report runs", () => {
  let reportId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
      payload: {
        name: "Run Me",
        reportType: "sales",
        schedule: { kind: "daily", time: "09:00" },
        recipients: [
          { channel: "email", address: "owner@example.com" },
          { channel: "sms", address: "+91999999999" },
        ],
        format: "csv",
        filters: { daysBack: 30 },
      },
    });
    expect(res.statusCode).toBe(201);
    reportId = res.json().data.id;
    // One invoice inside the window, one far outside it.
    await seedInvoice(ctx.id, { date: new Date().toISOString().split("T")[0] });
    await seedInvoice(ctx.id, { date: "2000-01-01" });
  });

  it("POST /:id/run executes a manual run: done, rows>0, file stored", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/scheduled-reports/${reportId}/run`,
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    const { run, rows, delivered, deliveryFailed } = res.json().data;
    expect(run.status).toBe("done");
    expect(run.rowCount).toBeGreaterThan(0);
    expect(run.fileId).toBeTruthy();
    expect(run.messageStatus).toBe("queued");
    expect(rows).toBe(run.rowCount);
    expect(delivered).toBe(2);
    expect(deliveryFailed).toBe(0);

    // Out-of-period invoice excluded (daysBack=30 window).
    const file = await fileStorage.get(ctx.id, run.fileId);
    const text = file.bytes.toString("utf8");
    expect(text).not.toContain("2000-01-01");
    expect(text).toContain("Invoice No");
  });

  it("stores the CSV as a stored_files row (purpose scheduled-report) with a BOM", async () => {
    const runs = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, reportId));
    expect(runs.length).toBe(1);
    const fileId = runs[0].fileId!;
    const [fileRow] = await db.select().from(storedFiles).where(eq(storedFiles.id, fileId));
    expect(fileRow).toBeTruthy();
    expect(fileRow.purpose).toBe("scheduled-report");
    expect(fileRow.ownerId).toBe(ctx.id);
    const { bytes } = await fileStorage.get(ctx.id, fileId);
    // UTF-8 BOM + header line.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString("utf8").split("\r\n")[0]).toContain("Invoice No");
  });

  it("queues one message per recipient even with NO messaging env configured", async () => {
    const runs = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, reportId));
    const runId = runs[0].id;

    const deliveries = await db
      .select()
      .from(messageDeliveries)
      .where(eq(messageDeliveries.aggregateId, runId));
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((d) => d.status === "queued")).toBe(true);
    expect(deliveries.every((d) => d.template === "custom")).toBe(true);
    expect(deliveries.map((d) => d.channel).sort()).toEqual(["email", "sms"]);

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, runId));
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.status === "pending")).toBe(true);
    expect(events.every((e) => e.idempotencyKey!.startsWith(`sr:${runId}:`))).toBe(true);
  });

  it("manual runs do not advance next_run_at but do set last_run_at", async () => {
    const [before] = await db
      .select()
      .from(scheduledReports)
      .where(eq(scheduledReports.id, reportId));
    const nextBefore = before.nextRunAt;
    const lastBefore = before.lastRunAt;

    const res = await app.inject({
      method: "POST",
      url: `/api/scheduled-reports/${reportId}/run`,
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);

    const [after] = await db
      .select()
      .from(scheduledReports)
      .where(eq(scheduledReports.id, reportId));
    expect(after.nextRunAt).toBe(nextBefore);
    expect(after.lastRunAt).toBeTruthy();
    expect(after.lastRunAt).not.toBe(lastBefore);

    // Two runs total now.
    const runs = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, reportId));
    expect(runs).toHaveLength(2);
  });

  it("records the audit event report.scheduled_run", async () => {
    const rows = await auditRows("report.scheduled_run");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].entityId).toBe(reportId);
  });

  it("GET /:id returns the report plus recent runs; GET /:id/runs lists history", async () => {
    const one = await app.inject({
      method: "GET",
      url: `/api/scheduled-reports/${reportId}`,
      headers: auth(ctx.token),
    });
    expect(one.statusCode).toBe(200);
    expect(one.json().data.report.id).toBe(reportId);
    expect(one.json().data.runs.length).toBeGreaterThanOrEqual(2);

    const runs = await app.inject({
      method: "GET",
      url: `/api/scheduled-reports/${reportId}/runs`,
      headers: auth(ctx.token),
    });
    expect(runs.statusCode).toBe(200);
    expect(runs.json().data.length).toBeGreaterThanOrEqual(2);
    expect(runs.json().data[0].status).toBe("done");
  });

  it("runs a stock report from current batches", async () => {
    seedMedicine(ctx.id, { name: "Scheduled Stock Med", quantity: 12 });
    const create = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
      payload: {
        name: "Stock levels",
        reportType: "stock",
        schedule: { kind: "weekly", day: 1, time: "08:30" },
        recipients: [],
        format: "csv",
      },
    });
    expect(create.statusCode).toBe(201);
    const stockId = create.json().data.id;

    const run = await app.inject({
      method: "POST",
      url: `/api/scheduled-reports/${stockId}/run`,
      headers: auth(ctx.token),
    });
    expect(run.statusCode).toBe(200);
    expect(run.json().data.rows).toBeGreaterThan(0);
    const fileId = run.json().data.run.fileId;
    const { bytes } = await fileStorage.get(ctx.id, fileId);
    const text = bytes.toString("utf8");
    expect(text).toContain("Scheduled Stock Med");
    expect(text).toContain("Batch");
    expect(text).toContain("Stock Value");
  });

  it("runs a party report (customers with balance > 0 only)", async () => {
    await db.insert(customers).values({
      name: "Credited Customer",
      balance: 250,
      createdBy: ctx.id,
    });
    const create = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
      payload: {
        name: "Who owes us",
        reportType: "party",
        schedule: { kind: "monthly", day: 1, time: "10:00" },
        recipients: [],
        format: "csv",
      },
    });
    expect(create.statusCode).toBe(201);
    const run = await app.inject({
      method: "POST",
      url: `/api/scheduled-reports/${create.json().data.id}/run`,
      headers: auth(ctx.token),
    });
    expect(run.statusCode).toBe(200);
    const fileId = run.json().data.run.fileId;
    const { bytes } = await fileStorage.get(ctx.id, fileId);
    const text = bytes.toString("utf8");
    expect(text).toContain("Credited Customer");
    expect(text).not.toContain("Walk-in");
  });

  it("a failed run stores status=failed and rethrows a 500 for the route", async () => {
    const spy = vi.spyOn(fileStorage, "put").mockRejectedValueOnce(new Error("disk full"));
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/scheduled-reports/${reportId}/run`,
        headers: auth(ctx.token),
      });
      expect(res.statusCode).toBe(500);
      expect(res.json().error).toContain("disk full");
    } finally {
      spy.mockRestore();
    }
    const runs = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, reportId));
    const failed = runs.filter((r) => r.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toContain("disk full");
    expect(failed[0].fileId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CRUD, roles, tenancy
// ---------------------------------------------------------------------------
describe("scheduled report CRUD & tenancy", () => {
  let mine: string;
  let theirs: string;

  beforeAll(async () => {
    const make = async (token: string, name: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/scheduled-reports",
        headers: auth(token),
        payload: {
          name,
          reportType: "payments",
          schedule: { kind: "daily", time: "21:00" },
          recipients: [{ channel: "email", address: `${name}@example.com` }],
          format: "csv",
        },
      });
      expect(res.statusCode).toBe(201);
      return res.json().data.id as string;
    };
    mine = await make(ctx.token, "Mine");
    theirs = await make(other.token, "Theirs");
  });

  it("list is tenant scoped", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/scheduled-reports",
      headers: auth(ctx.token),
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((r: any) => r.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });

  it("404s cross-tenant GET, run, runs and delete", async () => {
    const get = await app.inject({
      method: "GET",
      url: `/api/scheduled-reports/${theirs}`,
      headers: auth(ctx.token),
    });
    expect(get.statusCode).toBe(404);

    const run = await app.inject({
      method: "POST",
      url: `/api/scheduled-reports/${theirs}/run`,
      headers: auth(ctx.token),
    });
    expect(run.statusCode).toBe(404);

    const runs = await app.inject({
      method: "GET",
      url: `/api/scheduled-reports/${theirs}/runs`,
      headers: auth(ctx.token),
    });
    expect(runs.statusCode).toBe(404);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/scheduled-reports/${theirs}`,
      headers: auth(ctx.token),
    });
    expect(del.statusCode).toBe(404);
  });

  it("PUT toggles enabled and rejects an invalid schedule", async () => {
    const off = await app.inject({
      method: "PUT",
      url: `/api/scheduled-reports/${mine}`,
      headers: auth(ctx.token),
      payload: { enabled: false },
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().data.enabled).toBe(false);

    const on = await app.inject({
      method: "PUT",
      url: `/api/scheduled-reports/${mine}`,
      headers: auth(ctx.token),
      payload: { enabled: true },
    });
    expect(on.statusCode).toBe(200);
    expect(on.json().data.enabled).toBe(true);

    const bad = await app.inject({
      method: "PUT",
      url: `/api/scheduled-reports/${mine}`,
      headers: auth(ctx.token),
      payload: { schedule: { kind: "daily", time: "99:99" } },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("cashier cannot create, update, delete or run (403)", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/scheduled-reports",
      headers: auth(cashier.token),
      payload: {
        name: "Cashier report",
        reportType: "sales",
        schedule: { kind: "daily", time: "09:00" },
        recipients: [],
        format: "csv",
      },
    });
    expect(create.statusCode).toBe(403);

    const update = await app.inject({
      method: "PUT",
      url: `/api/scheduled-reports/${theirs}`,
      headers: auth(cashier.token),
      payload: { enabled: false },
    });
    expect(update.statusCode).toBe(403);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/scheduled-reports/${theirs}`,
      headers: auth(cashier.token),
    });
    expect(del.statusCode).toBe(403);

    const run = await app.inject({
      method: "POST",
      url: `/api/scheduled-reports/${theirs}/run`,
      headers: auth(cashier.token),
    });
    expect(run.statusCode).toBe(403);
  });

  it("DELETE removes the report and cascades its runs", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/api/scheduled-reports/${mine}`,
      headers: auth(ctx.token),
    });
    expect(del.statusCode).toBe(200);

    const reports = await db
      .select()
      .from(scheduledReports)
      .where(eq(scheduledReports.id, mine));
    expect(reports).toHaveLength(0);

    const runs = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, mine));
    expect(runs).toHaveLength(0);

    const gone = await app.inject({
      method: "GET",
      url: `/api/scheduled-reports/${mine}`,
      headers: auth(ctx.token),
    });
    expect(gone.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// tickDueScheduledReports (worker)
// ---------------------------------------------------------------------------
describe("tickDueScheduledReports", () => {
  it("is safe to call when nothing is due", async () => {
    const result = await tickDueScheduledReports();
    expect(result.due).toBe(0);
    expect(result.ran).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("runs a due report and advances next_run_at into the future", async () => {
    const id = await insertReportRow(ctx.id, { nextRunAt: "2000-01-01T00:00" });
    const result = await tickDueScheduledReports();
    expect(result.due).toBeGreaterThanOrEqual(1);
    expect(result.ran).toBeGreaterThanOrEqual(1);

    const [row] = await db.select().from(scheduledReports).where(eq(scheduledReports.id, id));
    expect(row.nextRunAt! > localStamp(new Date())).toBe(true);
    expect(row.lastRunAt).toBeTruthy();

    const runs = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, id));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("done");
  });

  it("skips disabled reports even when they are due", async () => {
    const id = await insertReportRow(ctx.id, { nextRunAt: "2000-01-01T00:00", enabled: false });
    await tickDueScheduledReports();
    const runs = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, id));
    expect(runs).toHaveLength(0);
  });

  it("does not run reports whose next_run_at is in the future", async () => {
    const id = await insertReportRow(ctx.id, { nextRunAt: "2099-06-01T09:00" });
    const result = await tickDueScheduledReports();
    expect(result.due).toBe(0);
    const runs = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, id));
    expect(runs).toHaveLength(0);
  });

  it("runReport 404s a foreign report id", async () => {
    const foreign = await insertReportRow(cashier.id, { nextRunAt: "2099-06-01T09:00" });
    await expect(runReport(ctx.id, foreign, "manual")).rejects.toMatchObject({ statusCode: 404 });
  });
});
