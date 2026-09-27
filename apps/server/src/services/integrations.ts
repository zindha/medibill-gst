/**
 * Integrations Center (Task 17) — one registry, one settings record per
 * provider, encrypted secrets, health resolution and adapter credentials.
 *
 * Storage: the install-wide `settings` singleton table, key
 * `integration:<providerId>`, value JSON:
 *   { enabled, config: {plainField: "value"},
 *     secrets: {secretField: "enc:v1:<base64(iv|tag|cipher)>"},
 *     connectedAt, updatedBy }
 *
 * Encryption (documented): AES-256-GCM exactly like backup/crypto.ts
 * ([IV 16][AuthTag 16][Ciphertext]) but keyed by a dedicated 32-byte file
 * `DATA_DIR/integration.key` (hex), auto-generated once and NEVER logged or
 * returned. The `enc:v1:` prefix makes encrypted values obvious in raw rows
 * and in redacted API output. Disconnect WIPES config + secrets (documented:
 * disconnect forgets the configuration, it is not a soft disable).
 *
 * Scope: settings is a global singleton with no tenant column (same pattern as
 * expiryPolicy / onlineOrders) — integrations are PER-INSTALL, one
 * configuration shared by every user of this install.
 *
 * Module graph note: the env checks (`providers/messaging`), Drive status
 * (`backup/drive`) and the online-orders toggle (`services/customerOrders`)
 * are all loaded via DYNAMIC import inside the async functions that need them
 * — so `providers/messaging.ts` can statically import `getResolvedCredentials`
 * from this module without creating an ESM cycle.
 */

import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, DATA_DIR } from "../db/index.js";
import { generateId, settings } from "../db/schema/index.js";
import { auditEvents } from "./audit.js";
import { getUserRole } from "./expiryPolicy.js";
import type { MessageChannel } from "../providers/messaging.js";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface IntegrationField {
  key: string;
  secret: boolean;
}

export interface IntegrationProviderDef {
  id: string;
  name: string;
  category: string;
  fields: IntegrationField[];
}

export const PROVIDERS: readonly IntegrationProviderDef[] = [
  {
    id: "whatsapp",
    name: "WhatsApp (Cloud API)",
    category: "Messaging",
    fields: [
      { key: "apiToken", secret: true },
      { key: "phoneNumberId", secret: false },
    ],
  },
  {
    id: "sms",
    name: "SMS Gateway",
    category: "Messaging",
    fields: [
      { key: "webhookUrl", secret: true },
      { key: "sender", secret: false },
    ],
  },
  {
    id: "email",
    name: "Email",
    category: "Messaging",
    fields: [{ key: "webhookUrl", secret: true }],
  },
  {
    id: "einvoice",
    name: "E-Invoice (fake IRN generator)",
    category: "Compliance",
    // Fake-only build (no live GSTN submission) — informational card, no
    // credentials to collect. See providers/gst.ts.
    fields: [],
  },
  {
    id: "google_drive",
    name: "Google Drive Backup",
    category: "Backup",
    // OAuth flow lives in Settings → Backup (routes/backup.ts + backup/drive.ts).
    fields: [],
  },
  {
    id: "online_orders",
    name: "Online Ordering",
    category: "Storefront",
    // Toggle mirrored to the existing `online_orders` settings singleton.
    fields: [],
  },
  {
    id: "payment_collect",
    name: "Payment Collection (UPI QR)",
    category: "Payments",
    // Informational only — MediBill renders a UPI QR, there is no gateway.
    fields: [{ key: "upiId", secret: false }],
  },
];

export function findProvider(id: string): IntegrationProviderDef | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Validation/permission error carrying the HTTP status the route should send. */
export class IntegrationError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "IntegrationError";
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

export const SECRET_PREFIX = "enc:v1:";
const KEY_FILENAME = "integration.key";

function keyPath(): string {
  return join(DATA_DIR, KEY_FILENAME);
}

/** 32-byte hex key, auto-generated once. Never logged, never exported. */
function loadKey(): Buffer {
  const path = keyPath();
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8").trim();
    const buf = Buffer.from(raw, "hex");
    if (buf.length === 32) return buf;
    throw new Error("integration key file is corrupt (expected 64 hex chars)");
  }
  const fresh = crypto.randomBytes(32);
  mkdirSync(DATA_DIR, { recursive: true });
  try {
    // wx: if another process won the race, re-read its key instead.
    writeFileSync(path, fresh.toString("hex"), { flag: "wx" });
    return fresh;
  } catch (err: any) {
    if (err?.code === "EEXIST") {
      const buf = Buffer.from(readFileSync(path, "utf8").trim(), "hex");
      if (buf.length === 32) return buf;
      throw new Error("integration key file is corrupt (expected 64 hex chars)");
    }
    throw err;
  }
}

/** AES-256-GCM → `enc:v1:` + base64(iv[16] | authTag[16] | ciphertext). */
export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return SECRET_PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Inverse of encryptSecret. Throws on a missing prefix, truncated payload or
 * WRONG KEY (GCM auth failure) — callers that must not crash (health,
 * getResolvedCredentials) catch and treat it as "not configured".
 */
export function decryptSecret(value: string): string {
  if (!value.startsWith(SECRET_PREFIX)) {
    throw new Error("not an encrypted integration secret");
  }
  const payload = Buffer.from(value.slice(SECRET_PREFIX.length), "base64");
  if (payload.length < 33) throw new Error("encrypted integration secret is truncated");
  const iv = payload.subarray(0, 16);
  const tag = payload.subarray(16, 32);
  const ciphertext = payload.subarray(32);
  const key = loadKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Settings record IO
// ---------------------------------------------------------------------------

export interface IntegrationRecord {
  enabled: boolean;
  config: Record<string, string>;
  /** Values are ALWAYS `enc:v1:...` — never plaintext, never returned raw. */
  secrets: Record<string, string>;
  connectedAt: string | null;
  updatedBy: string | null;
}

export function integrationSettingsKey(id: string): string {
  return `integration:${id}`;
}

const EMPTY_RECORD: IntegrationRecord = {
  enabled: false,
  config: {},
  secrets: {},
  connectedAt: null,
  updatedBy: null,
};

export async function readRecord(id: string): Promise<IntegrationRecord | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, integrationSettingsKey(id)))
    .limit(1);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      enabled: parsed.enabled === true,
      config: normalizeStringMap(parsed.config),
      secrets: normalizeStringMap(parsed.secrets),
      connectedAt: typeof parsed.connectedAt === "string" ? parsed.connectedAt : null,
      updatedBy: typeof parsed.updatedBy === "string" ? parsed.updatedBy : null,
    };
  } catch {
    return null;
  }
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    // API clients sometimes send ids/rates as numbers — coerce, don't drop.
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = String(v);
    else if (typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

async function writeRecord(id: string, record: IntegrationRecord): Promise<void> {
  const now = new Date();
  const value = JSON.stringify(record);
  const [existing] = await db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, integrationSettingsKey(id)))
    .limit(1);
  if (existing) {
    await db
      .update(settings)
      .set({ value, updatedAt: now })
      .where(eq(settings.key, integrationSettingsKey(id)));
  } else {
    await db
      .insert(settings)
      .values({ id: generateId(), key: integrationSettingsKey(id), value, updatedAt: now });
  }
}

// ---------------------------------------------------------------------------
// connect / disconnect
// ---------------------------------------------------------------------------

export interface ConnectInput {
  config?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  enabled?: boolean;
}

const MANAGER_ROLES = ["admin", "pharmacist"];

/**
 * Upsert one provider's configuration.
 * - Validates the id against the registry (404 unknown).
 * - Role gate: admin | pharmacist only (cashier → 403).
 * - When `enabled` resolves to true, EVERY registry field must have a value
 *   (from this payload or an already-stored one) → else 400 listing the
 *   missing keys.
 * - Secret fields are encrypted (`enc:v1:`) before storage; audit metadata
 *   records field NAMES only, never values.
 * - `online_orders` additionally mirrors its toggle into the existing
 *   `online_orders` settings singleton so health stays coherent (documented).
 */
export async function connect(
  id: string,
  userId: string,
  input: ConnectInput
): Promise<IntegrationRecord> {
  const def = findProvider(id);
  if (!def) throw new IntegrationError(404, `Unknown integration "${id}"`);
  const role = await getUserRole(userId);
  if (!MANAGER_ROLES.includes(role)) {
    throw new IntegrationError(403, "Insufficient permissions");
  }

  const existing = (await readRecord(id)) ?? { ...EMPTY_RECORD };
  const nextConfig = { ...existing.config };
  const nextSecrets = { ...existing.secrets };

  const incomingPlain = normalizeStringMap(input.config);
  const incomingSecret = normalizeStringMap(input.secrets);

  for (const field of def.fields) {
    // A value may arrive in either bucket — route it to the right one.
    const raw = incomingSecret[field.key] ?? incomingPlain[field.key];
    if (raw === undefined) continue;
    const value = String(raw).trim();
    if (field.secret) {
      delete nextConfig[field.key];
      if (value === "") delete nextSecrets[field.key];
      else if (value.startsWith(SECRET_PREFIX)) nextSecrets[field.key] = value;
      else nextSecrets[field.key] = encryptSecret(value);
    } else {
      delete nextSecrets[field.key];
      if (value === "") delete nextConfig[field.key];
      else nextConfig[field.key] = value;
    }
  }

  const enabled = input.enabled ?? existing.enabled;
  if (enabled) {
    const missing = def.fields
      .filter((f) => {
        const value = f.secret ? nextSecrets[f.key] : nextConfig[f.key];
        return !value || !String(value).trim();
      })
      .map((f) => f.key);
    if (missing.length > 0) {
      throw new IntegrationError(
        400,
        `Missing required fields for ${id}: ${missing.join(", ")}`
      );
    }
  }

  const record: IntegrationRecord = {
    enabled,
    config: nextConfig,
    secrets: nextSecrets,
    connectedAt: enabled
      ? existing.connectedAt ?? new Date().toISOString()
      : existing.connectedAt,
    updatedBy: userId,
  };
  await writeRecord(id, record);

  if (id === "online_orders") {
    const { setOnlineOrdersEnabled } = await import("./customerOrders.js");
    await setOnlineOrdersEnabled(enabled);
  }

  await auditEvents.record({
    actorId: userId,
    action: "integration.connected",
    entity: "integration",
    entityId: id,
    metadata: {
      enabled,
      // Field NAMES only — never a value, never a decrypted secret.
      fields: def.fields.map((f) => f.key),
      secretFields: def.fields.filter((f) => f.secret).map((f) => f.key),
    },
  });
  return record;
}

/**
 * Disable + FORGET the provider's configuration: config and secrets are both
 * wiped (documented — disconnect is not a soft disable). The encrypted
 * settings row is deleted outright so nothing lingers. Audit recorded.
 */
export async function disconnect(id: string, userId: string): Promise<void> {
  const def = findProvider(id);
  if (!def) throw new IntegrationError(404, `Unknown integration "${id}"`);
  const role = await getUserRole(userId);
  if (!MANAGER_ROLES.includes(role)) {
    throw new IntegrationError(403, "Insufficient permissions");
  }

  const key = integrationSettingsKey(id);
  const [existing] = await db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  if (existing) await db.delete(settings).where(eq(settings.key, key));

  if (id === "online_orders") {
    const { setOnlineOrdersEnabled } = await import("./customerOrders.js");
    await setOnlineOrdersEnabled(false);
  }

  await auditEvents.record({
    actorId: userId,
    action: "integration.disconnected",
    entity: "integration",
    entityId: id,
    metadata: { fields: def.fields.map((f) => f.key) },
  });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export type IntegrationMode = "settings" | "env" | "fake" | null;

export interface IntegrationHealth {
  id: string;
  name: string;
  category: string;
  fields: IntegrationField[];
  /** User toggle from the settings record (drive/online-orders are special). */
  enabled: boolean;
  /**
   * Provider readiness. For settings-backed providers the settings path only
   * counts when `enabled` is true (so `enabled && configured` is folded in);
   * env/fake paths are "connected" on their own because the operator enabled
   * them out-of-band (.env) or they are zero-config (einvoice → fake).
   */
  connected: boolean;
  mode: IntegrationMode;
  /** Env var NAMES still missing (values are never read or returned). */
  missingEnv: string[];
  connectedAt: string | null;
  /** Extra display detail (e.g. Drive account email) — never a secret. */
  detail?: Record<string, string | null>;
}

function settingsComplete(record: IntegrationRecord | null, def: IntegrationProviderDef): boolean {
  if (!record || !record.enabled) return false;
  return def.fields.every((f) => {
    const value = f.secret ? record.secrets[f.key] : record.config[f.key];
    if (!value || !String(value).trim()) return false;
    // A stored secret must decrypt — a corrupt key means NOT configured.
    if (f.secret) {
      try {
        decryptSecret(value);
      } catch {
        return false;
      }
    }
    return true;
  });
}

/** Health for one provider (throws IntegrationError 404 for unknown ids). */
export async function health(id: string): Promise<IntegrationHealth> {
  const def = findProvider(id);
  if (!def) throw new IntegrationError(404, `Unknown integration "${id}"`);
  const record = await readRecord(id);
  const base = {
    id: def.id,
    name: def.name,
    category: def.category,
    fields: def.fields,
    connectedAt: record?.connectedAt ?? null,
  };

  if (def.id === "whatsapp" || def.id === "sms" || def.id === "email") {
    const channel = def.id as MessageChannel;
    const { isProviderConfigured, requiredEnvFor } = await import("../providers/messaging.js");
    const envReady = isProviderConfigured(channel);
    if (settingsComplete(record, def)) {
      return { ...base, enabled: true, connected: true, mode: "settings", missingEnv: [] };
    }
    if (envReady) {
      return { ...base, enabled: record?.enabled ?? false, connected: true, mode: "env", missingEnv: [] };
    }
    return {
      ...base,
      enabled: record?.enabled ?? false,
      connected: false,
      mode: null,
      missingEnv: requiredEnvFor(channel),
    };
  }

  if (def.id === "einvoice") {
    // Fake-only build: IRNs are generated locally (explicitly labelled FAKE…
    // in the UI) — always configured, no settings and no env to check.
    return { ...base, enabled: true, connected: true, mode: "fake", missingEnv: [] };
  }

  if (def.id === "google_drive") {
    const { getDriveStatus } = await import("../backup/drive.js");
    const drive = await getDriveStatus();
    return {
      ...base,
      enabled: drive.connected || (record?.enabled ?? false),
      connected: drive.connected,
      mode: drive.connected ? "settings" : null,
      missingEnv: [],
      detail: { email: drive.email, folder: drive.folder },
    };
  }

  if (def.id === "online_orders") {
    const { getOnlineOrdersEnabled } = await import("./customerOrders.js");
    const enabled = await getOnlineOrdersEnabled();
    return { ...base, enabled, connected: enabled, mode: "settings", missingEnv: [] };
  }

  // payment_collect — informational UPI QR (no gateway in the product).
  const upiId = record?.enabled ? record.config.upiId?.trim() ?? "" : "";
  return {
    ...base,
    enabled: record?.enabled ?? false,
    connected: !!upiId,
    mode: upiId ? "settings" : null,
    missingEnv: [],
  };
}

/** Every provider + aggregate `{ connected, total }`. */
export async function listHealth(): Promise<{
  providers: IntegrationHealth[];
  summary: { connected: number; total: number };
}> {
  const providers: IntegrationHealth[] = [];
  for (const def of PROVIDERS) providers.push(await health(def.id));
  return {
    providers,
    summary: {
      connected: providers.filter((p) => p.connected).length,
      total: providers.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Credentials for adapters
// ---------------------------------------------------------------------------

export interface ResolvedCredentials {
  enabled: true;
  config: Record<string, string>;
  secrets: Record<string, string>; // DECRYPTED values
}

/**
 * Decrypted settings-backed credentials for one provider, or `null` when:
 * no record exists, the record is disabled, a field fails to decrypt (e.g.
 * the key file was replaced) or the id is unknown. Safe to call anywhere —
 * it never throws and never returns partially-decrypted data.
 *
 * Used by `providers/messaging.getProvider` (whatsapp/sms/email) as the
 * settings-over-env path.
 */
export function getResolvedCredentials(id: string): ResolvedCredentials | null {
  const def = findProvider(id);
  if (!def) return null;
  let record: IntegrationRecord | null = null;
  try {
    record = readRecordSync(id);
  } catch {
    return null;
  }
  if (!record || !record.enabled || def.fields.length === 0) return null;

  try {
    const config: Record<string, string> = {};
    const secrets: Record<string, string> = {};
    for (const field of def.fields) {
      if (field.secret) {
        const raw = record.secrets[field.key];
        if (!raw) return null;
        secrets[field.key] = decryptSecret(raw);
      } else {
        const raw = record.config[field.key];
        if (raw === undefined) return null;
        config[field.key] = raw;
      }
    }
    return { enabled: true, config, secrets };
  } catch {
    // Tampered/corrupt key or payload — behave like "not configured".
    return null;
  }
}

/**
 * Synchronous settings read: better-sqlite3's drizzle driver exposes `.all()`
 * on the query builder (see routes/invoices.ts). `getProvider()` is
 * synchronous, so the credentials lookup must be too.
 */
function readRecordSync(id: string): IntegrationRecord | null {
  const rows = db
    .select()
    .from(settings)
    .where(eq(settings.key, integrationSettingsKey(id)))
    .limit(1)
    .all();
  const row = rows[0];
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      enabled: parsed.enabled === true,
      config: normalizeStringMap(parsed.config),
      secrets: normalizeStringMap(parsed.secrets),
      connectedAt: typeof parsed.connectedAt === "string" ? parsed.connectedAt : null,
      updatedBy: typeof parsed.updatedBy === "string" ? parsed.updatedBy : null,
    };
  } catch {
    return null;
  }
}
