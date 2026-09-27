/**
 * GST compliance provider abstraction (Task 13).
 *
 * FAKE-ONLY (decision): the live NIC e-invoice / e-way adapter was removed —
 * this build never submits to the GSTN portal. `getGstProvider()` returns the
 * deterministic `fakeGstProvider` on every call (zero configuration), which
 * issues `FAKE…` IRNs that are NOT government-issued — the UI says so.
 *
 * There is no `GstNotConfiguredError` anymore: the fake provider cannot fail
 * for lack of credentials, so the compliance service only ever handles
 * provider REJECTIONS (surfaced as 422), never "not configured" (503).
 */

import type { EInvoicePayload, EWayPayload } from "../services/compliance.js";

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

export type GstProviderName = "fake";

// ---------------------------------------------------------------------------
// Fake adapter (the only provider)
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
// Factory + test hook
// ---------------------------------------------------------------------------

let testProvider: GstProvider | null = null;

/**
 * TEST-ONLY: swap the provider adapter (pass `null` to restore the default).
 * Never call this from production code.
 */
export function __setGstProviderForTest(provider: GstProvider | null): void {
  testProvider = provider;
}

/**
 * Resolve the active provider — always the zero-config fake adapter (or the
 * test override). Never throws, never reads credentials.
 */
export function getGstProvider(): GstProvider {
  return testProvider ?? fakeGstProvider;
}
