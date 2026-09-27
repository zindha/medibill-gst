/**
 * GST compliance provider abstraction (Task 13, extended by Task 17).
 *
 * Three paths behind one interface:
 * - FakeGstProvider (DEFAULT): deterministic local fake so the whole
 *   generate → accept → cancel workflow works with zero configuration. IRNs
 *   are FAKE… prefixed and are NOT government-issued — the UI says so.
 * - Integrations Center settings (`integration:einvoice`, AES-256-GCM
 *   encrypted at rest) → NIC adapter bound to those decrypted credentials.
 * - NicProvider: thin fetch wrapper over the NIC e-invoice / e-way endpoints
 *   reading EINVOICE_BASE_URL / EWAY_BASE_URL + GSP credentials from process
 *   env on EVERY call and throwing `GstNotConfiguredError` listing the missing
 *   variable names when anything is absent.
 *
 * Secrets live ONLY in process env or in the encrypted settings record —
 * never in any API response (the /providers health endpoint returns booleans
 * only). Env is read at call time (never at module load) so tests can flip
 * EINVOICE_PROVIDER safely.
 */

import type { EInvoicePayload, EWayPayload } from "../services/compliance.js";
import { getResolvedCredentials } from "../services/integrations.js";

export interface EInvoiceResult {
  irn: string;
  ackNo: string;
  ackDate: string;
  qrData: string;
  raw: unknown;
}

export interface EWayResult {
  ewayBillNo: string;
  validUpto: string;
  raw: unknown;
}

export interface GstProvider {
  name: string;
  generateEInvoice(payload: EInvoicePayload): Promise<EInvoiceResult>;
  cancelEInvoice(irn: string, reason: string): Promise<{ raw: unknown }>;
  generateEWay(payload: EWayPayload): Promise<EWayResult>;
}

export class GstNotConfiguredError extends Error {
  missing: string[];
  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = "GstNotConfiguredError";
    this.missing = missing;
  }
}

/** Required env vars per capability — surfaced as NAMES only (never values). */
const REQUIRED_ENV = {
  einvoice: [
    "EINVOICE_GSP_ID",
    "EINVOICE_GSP_KEY",
    "EINVOICE_USERNAME",
    "EINVOICE_PASSWORD",
    "EINVOICE_BASE_URL",
  ],
  eway: ["EWAY_BASE_URL"],
} as const;

export type GstCapability = keyof typeof REQUIRED_ENV;

export type GstProviderName = "fake" | "nic";

/** Active provider name from env — "fake" unless EINVOICE_PROVIDER=nic. */
export function activeProviderName(): GstProviderName {
  return (process.env.EINVOICE_PROVIDER ?? "").trim().toLowerCase() === "nic" ? "nic" : "fake";
}

/** Names of env vars still missing for a capability (values are never read here). */
export function missingEnvFor(capability: GstCapability): string[] {
  return REQUIRED_ENV[capability].filter((v) => !process.env[v]?.trim());
}

/**
 * Provider health as booleans + missing env NAMES — safe to return to the
 * browser. Fake mode is always "configured" (it needs no credentials).
 */
export function isGstProviderConfigured(): {
  provider: GstProviderName;
  einvoice: boolean;
  eway: boolean;
  missingEinvoice: string[];
  missingEway: string[];
} {
  const provider = activeProviderName();
  if (provider === "fake") {
    return { provider, einvoice: true, eway: true, missingEinvoice: [], missingEway: [] };
  }
  const missingEinvoice = missingEnvFor("einvoice");
  // The e-way call also needs the e-invoice auth credentials.
  const missingEway = [...new Set([...missingEinvoice, ...missingEnvFor("eway")])];
  return {
    provider,
    einvoice: missingEinvoice.length === 0,
    eway: missingEway.length === 0,
    missingEinvoice,
    missingEway,
  };
}

function notConfigured(capability: GstCapability): GstNotConfiguredError {
  const missing = missingEnvFor(capability);
  return new GstNotConfiguredError(
    `GST provider not configured — set ${missing.join(", ")}`,
    missing
  );
}

// ---------------------------------------------------------------------------
// Fake adapter (default)
// ---------------------------------------------------------------------------

let ackSeq = 0;
const randomChunk = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export const fakeGstProvider: GstProvider = {
  name: "fake",

  async generateEInvoice(payload) {
    const stamp = Date.now().toString(36).toUpperCase();
    const irn = `FAKE${stamp}${randomChunk()}`.slice(0, 20);
    // Sequential-ish ack: counter folded in so repeated calls differ visibly.
    const ackNo = `ACK${stamp}${String(ackSeq++).padStart(4, "0")}`;
    const ackDate = new Date().toISOString();
    const gstin = payload?.SellerDtls?.Gstin ?? "";
    const qrData = Buffer.from(JSON.stringify({ irn, date: ackDate, gstin })).toString("base64");
    return { irn, ackNo, ackDate, qrData, raw: { provider: "fake", irn, ackNo, ackDate } };
  },

  async cancelEInvoice(irn) {
    return { raw: { provider: "fake", irn, cancelled: true } };
  },

  async generateEWay(payload) {
    const stamp = Date.now().toString(36).toUpperCase();
    const ewayBillNo = `EWB${stamp}${randomChunk()}`.slice(0, 16);
    const validUpto = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    return {
      ewayBillNo,
      validUpto,
      raw: { provider: "fake", ewayBillNo, validUpto, irn: payload?.Irn },
    };
  },
};

// ---------------------------------------------------------------------------
// NIC adapter (EINVOICE_PROVIDER=nic or Integrations Center settings)
// ---------------------------------------------------------------------------

/** Explicit credentials — the settings path (Task 17) passes these in. */
export interface NicCreds {
  gspId?: string;
  gspKey?: string;
  username?: string;
  password?: string;
  baseUrl?: string;
  eWayBaseUrl?: string;
}

function authHeaders(creds?: NicCreds): Record<string, string> {
  const gspId = creds?.gspId?.trim() || process.env.EINVOICE_GSP_ID?.trim();
  const gspKey = creds?.gspKey?.trim() || process.env.EINVOICE_GSP_KEY?.trim();
  const username = creds?.username?.trim() || process.env.EINVOICE_USERNAME?.trim();
  const password = creds?.password?.trim() || process.env.EINVOICE_PASSWORD?.trim();
  return {
    "Content-Type": "application/json",
    "gsp-id": gspId ?? "",
    "gsp-key": gspKey ?? "",
    username: username ?? "",
    password: password ?? "",
  };
}

async function postJson(
  url: string,
  body: unknown,
  capability: GstCapability,
  creds?: NicCreds
): Promise<any> {
  // Settings-backed calls arrive with complete creds (validated at connect
  // time) — only the env path still needs the missing-variable pre-check.
  if (!creds && (capability === "eway" ? missingEnvFor("eway").length > 0 : missingEnvFor("einvoice").length > 0)) {
    throw notConfigured(capability);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message =
      data?.message ?? data?.error ?? data?.msg ?? `GST provider error ${res.status}`;
    throw new Error(String(message));
  }
  return data ?? {};
}

/**
 * NIC adapter bound to explicit credentials when given (settings path);
 * env-driven otherwise. The e-invoice base URL comes from `creds.baseUrl`
 * (settings) or EINVOICE_BASE_URL (env).
 */
export function createNicProvider(creds?: NicCreds): GstProvider {
  const invoiceBase = () =>
    (creds?.baseUrl?.trim() || process.env.EINVOICE_BASE_URL?.trim() || "").replace(/\/$/, "");
  const eWayBase = () =>
    (creds?.eWayBaseUrl?.trim() || process.env.EWAY_BASE_URL?.trim() || "").replace(/\/$/, "");

  return {
    name: "nic",

    async generateEInvoice(payload) {
      const base = invoiceBase();
      const data = await postJson(`${base}/invoice`, payload, "einvoice", creds);
      return {
        irn: String(data.irn ?? data.Irn ?? ""),
        ackNo: String(data.ackNo ?? data.AckNo ?? ""),
        ackDate: String(data.ackDate ?? data.AckDate ?? new Date().toISOString()),
        qrData: String(data.qrData ?? data.QrCode ?? ""),
        raw: data,
      };
    },

    async cancelEInvoice(irn, reason) {
      const base = invoiceBase();
      const data = await postJson(`${base}/invoice/cancel`, { irn, reason }, "einvoice", creds);
      return { raw: data };
    },

    async generateEWay(payload) {
      const base = eWayBase();
      const data = await postJson(`${base}/eway`, payload, "eway", creds);
      return {
        ewayBillNo: String(data.ewayBillNo ?? data.ewayBillNumber ?? ""),
        validUpto: String(data.validUpto ?? ""),
        raw: data,
      };
    },
  };
}

/** Env-driven default instance (kept for direct imports). */
export const nicGstProvider: GstProvider = createNicProvider();

// ---------------------------------------------------------------------------
// Factory + test hook
// ---------------------------------------------------------------------------

let testProvider: GstProvider | null = null;

/**
 * TEST-ONLY: swap the provider adapter (pass `null` to restore the real
 * env-driven resolution). Never call this from production code.
 */
export function __setGstProviderForTest(provider: GstProvider | null): void {
  testProvider = provider;
}

/**
 * Resolve the active provider. Precedence (Task 17):
 *   1. Integrations Center settings (`integration:einvoice`, enabled) →
 *      NIC adapter bound to the decrypted settings credentials;
 *   2. env (EINVOICE_PROVIDER=nic) → env-driven NIC adapter;
 *   3. fake (default, zero configuration).
 * Reads env on every call; with EINVOICE_PROVIDER=nic and any credential
 * missing it throws `GstNotConfiguredError` BEFORE any network call.
 */
export function getGstProvider(): GstProvider {
  if (testProvider) return testProvider;

  try {
    const resolved = getResolvedCredentials("einvoice");
    if (resolved) {
      const merged: NicCreds = {
        gspId: resolved.config.gspId ?? resolved.secrets.gspId,
        gspKey: resolved.config.gspKey ?? resolved.secrets.gspKey,
        username: resolved.config.username ?? resolved.secrets.username,
        password: resolved.config.password ?? resolved.secrets.password,
        baseUrl: resolved.config.baseUrl ?? resolved.secrets.baseUrl,
      };
      if (merged.gspId && merged.gspKey && merged.username && merged.password && merged.baseUrl) {
        return createNicProvider(merged);
      }
    }
  } catch {
    // Credentials unreadable — fall through to env/fake resolution.
  }

  if (activeProviderName() === "nic") {
    const missing = missingEnvFor("einvoice");
    if (missing.length > 0) throw notConfigured("einvoice");
    return nicGstProvider;
  }
  return fakeGstProvider;
}
