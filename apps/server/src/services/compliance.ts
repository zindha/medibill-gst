import { createHash } from "crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  GST_RATES,
  complianceSubmissions,
  generateId,
  invoiceItems,
  invoices,
  type ComplianceKind,
  type ComplianceStatus,
} from "../db/schema/index.js";
import { getGstProvider } from "../providers/gst.js";
import { auditEvents } from "./audit.js";
import { readSettingString } from "./messaging.js";

/**
 * E-Invoice / E-Way Bill compliance (Task 13).
 *
 * Design decisions (documented in docs/API.md):
 * - SUBMISSION is synchronous: `generate` blocks the HTTP request until the
 *   provider answers. That is deliberate — e-invoice generation is idempotent
 *   per invoice (UNIQUE(created_by, invoice_id, kind) means one live row per
 *   invoice per kind), a rejected row is retried by re-generating (the same
 *   row is updated in place, never duplicated), and a crash mid-call leaves a
 *   traceable `pending`/`submitted` row instead of an invisible outbox event.
 *   No outbox/worker is used for this flow, unlike messaging.
 * - Cancellation window is a hard local 24h constant measured from
 *   `submitted_at`, enforced BEFORE the provider call so an expired cancel
 *   never reaches the network.
 * - Provider: FAKE-ONLY (see providers/gst.ts). There are no credentials and
 *   no "not configured" state — the only provider failure mode handled here
 *   is a rejection (→ 422 with the provider message).
 *
 * Validation is strict B2B: a customer GSTIN is required (B2C e-invoice
 * without buyerDtls.gstin is out of scope for this task and rejected with a
 * stable message), as is the store GSTIN (Settings → Taxation) and an HSN
 * code on every line.
 */

/** Hard cancellation window — 24h from `submitted_at`, not configurable. */
export const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;

export const GST_EINVOICE_VERSION = "1.1";

// ---------------------------------------------------------------------------
// Payload types (documented, simplified IRN-ready structure)
// ---------------------------------------------------------------------------

export interface EInvoiceItemPayload {
  SlNo: string;
  PrdDesc: string;
  HsnCd: string;
  Qty: number;
  UnitPrice: number;
  TotAmt: number;
  /** Taxable value = line amount − line GST. */
  AssAmt: number;
  GstRt: number;
  CgstAmt: number;
  SgstAmt: number;
  IgstAmt: number;
  TotItemVal: number;
}

export interface EInvoicePayload {
  version: string;
  TranDtls: { TaxSch: string; SupTyp: string };
  DocDtls: { Typ: string; No: string; Dt: string };
  SellerDtls: { Gstin: string; LglNm: string; Std: string };
  BuyerDtls: { Gstin: string; LglNm: string; Pos: string };
  ItemList: EInvoiceItemPayload[];
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    TotInvVal: number;
  };
}

export interface EWayPayload {
  Irn: string;
  Distance: number;
  TransName?: string;
  VehNo?: string;
}

/** Validation/permission error carrying the HTTP status the route should send. */
export class ComplianceError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ComplianceError";
    this.statusCode = statusCode;
  }
}

export function toErrorResponse(err: unknown): { statusCode: number; message: string } {
  if (err instanceof ComplianceError) return { statusCode: err.statusCode, message: err.message };
  return { statusCode: 500, message: err instanceof Error ? err.message : String(err) };
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const isValidGstRate = (rate: unknown): boolean =>
  (GST_RATES as readonly string[]).includes(String(rate));

/** `YYYY-MM-DD` (invoice.date) → `DD-MM-YYYY` (provider DocDtls.Dt). */
function toProviderDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? "");
  if (!m) return isoDate ?? "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** First 2 digits of a GSTIN = state code (BuyerDtls.Pos / SellerDtls.Std). */
function stateCode(gstin: string | null | undefined): string {
  const m = /^(\d{2})/.exec((gstin ?? "").trim());
  return m ? m[1] : "00";
}

const sha256Hex = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// ---------------------------------------------------------------------------
// Loading + validation
// ---------------------------------------------------------------------------

async function loadInvoiceForCompliance(userId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.createdBy, userId)))
    .limit(1);
  if (!invoice) throw new ComplianceError(404, "Invoice not found");
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  return { invoice, items };
}

/** Collect every blocking issue WITHOUT throwing (UI preflight uses this). */
function collectIssues(
  invoice: { status: string | null; customerGstin: string | null },
  items: Array<{ medicineName: string; hsnCode: string | null; gstRate: string | null }>,
  storeGstin: string | null
): string[] {
  const issues: string[] = [];
  if (invoice.status === "cancelled") issues.push("Invoice is cancelled");
  if (!invoice.customerGstin?.trim()) issues.push("Customer GSTIN required for e-invoice");
  if (!storeGstin?.trim()) issues.push("Set store GSTIN in Settings → Taxation");
  const missingHsn = [
    ...new Set(items.filter((i) => !i.hsnCode?.trim()).map((i) => i.medicineName)),
  ];
  if (missingHsn.length > 0) issues.push(`Missing HSN code for: ${missingHsn.join(", ")}`);
  const badRate = [
    ...new Set(items.filter((i) => !isValidGstRate(i.gstRate)).map((i) => i.medicineName)),
  ];
  if (badRate.length > 0) issues.push(`Invalid GST rate for: ${badRate.join(", ")}`);
  return issues;
}

function assemblePayload(
  invoice: {
    invoiceNo: string;
    date: string;
    customerName: string | null;
    customerGstin: string | null;
    grandTotal: number;
    igst: number | null;
  },
  items: Array<{
    medicineName: string;
    hsnCode: string | null;
    quantity: number;
    rate: number;
    amount: number;
    gstRate: string | null;
    gstAmount: number;
    cgst: number;
    sgst: number;
  }>,
  storeGstin: string,
  storeName: string | null
): EInvoicePayload {
  let assVal = 0;
  let cgstVal = 0;
  let sgstVal = 0;

  const itemList: EInvoiceItemPayload[] = items.map((item, index) => {
    const assAmt = round2((item.amount ?? 0) - (item.gstAmount ?? 0));
    const lineCgst = round2(item.cgst ?? 0);
    const lineSgst = round2(item.sgst ?? 0);
    assVal += assAmt;
    cgstVal += lineCgst;
    sgstVal += lineSgst;
    return {
      SlNo: String(index + 1),
      PrdDesc: item.medicineName,
      HsnCd: item.hsnCode ?? "",
      Qty: item.quantity,
      UnitPrice: round2(item.rate ?? 0),
      TotAmt: round2(item.amount ?? 0),
      AssAmt: assAmt,
      GstRt: Number(item.gstRate ?? 0),
      CgstAmt: lineCgst,
      SgstAmt: lineSgst,
      IgstAmt: 0,
      TotItemVal: round2(item.amount ?? 0),
    };
  });

  return {
    version: GST_EINVOICE_VERSION,
    TranDtls: { TaxSch: "GST", SupTyp: "B2B" },
    DocDtls: { Typ: "INV", No: invoice.invoiceNo, Dt: toProviderDate(invoice.date) },
    SellerDtls: { Gstin: storeGstin, LglNm: storeName?.trim() || "Store", Std: stateCode(storeGstin) },
    BuyerDtls: {
      Gstin: invoice.customerGstin ?? "",
      LglNm: invoice.customerName ?? "Walk-in",
      Pos: stateCode(invoice.customerGstin),
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: round2(assVal),
      CgstVal: round2(cgstVal),
      SgstVal: round2(sgstVal),
      IgstVal: round2(invoice.igst ?? 0),
      TotInvVal: round2(invoice.grandTotal),
    },
  };
}

/**
 * Build the IRN-ready payload for one invoice. Throws `ComplianceError`
 * (404 foreign/unknown invoice, 400 any validation issue).
 */
export async function buildEInvoicePayload(
  userId: string,
  invoiceId: string
): Promise<{ payload: EInvoicePayload; requestHash: string }> {
  const { invoice, items } = await loadInvoiceForCompliance(userId, invoiceId);
  const storeGstin = await readSettingString("store_gstin");
  const issues = collectIssues(invoice, items, storeGstin);
  if (issues.length > 0) throw new ComplianceError(400, issues.join("; "));
  const storeName = await readSettingString("store_name");
  const payload = assemblePayload(invoice, items, storeGstin!, storeName);
  return { payload, requestHash: sha256Hex(payload) };
}

// ---------------------------------------------------------------------------
// Submission rows
// ---------------------------------------------------------------------------

async function getSubmission(userId: string, invoiceId: string, kind: ComplianceKind) {
  const [row] = await db
    .select()
    .from(complianceSubmissions)
    .where(
      and(
        eq(complianceSubmissions.createdBy, userId),
        eq(complianceSubmissions.invoiceId, invoiceId),
        eq(complianceSubmissions.kind, kind)
      )
    )
    .limit(1);
  return row ?? null;
}

type SubmissionRow = NonNullable<Awaited<ReturnType<typeof getSubmission>>>;

/**
 * Insert (or update in place) the pending row for one (invoice, kind).
 * The UNIQUE(created_by, invoice_id, kind) constraint is the idempotency
 * guard — a constraint race falls back to updating the row that won.
 */
async function upsertPendingRow(input: {
  userId: string;
  invoiceId: string;
  kind: ComplianceKind;
  requestHash?: string;
  vehicle?: Record<string, unknown> | null;
  existing: SubmissionRow | null;
}): Promise<SubmissionRow> {
  const now = new Date();
  const base = {
    // Fake-only build — the resolved provider's name (always "fake" unless a
    // test override is installed).
    provider: getGstProvider().name,
    status: "pending" as ComplianceStatus,
    requestHash: input.requestHash ?? null,
    responseJson: null,
    error: null,
    irn: null,
    ackNo: null,
    ackDate: null,
    qrData: null,
    submittedAt: null,
    cancelledAt: null,
    vehicleJson: input.vehicle ? JSON.stringify(input.vehicle) : null,
    updatedAt: now,
  };

  if (input.existing) {
    await db
      .update(complianceSubmissions)
      .set(base)
      .where(eq(complianceSubmissions.id, input.existing.id));
    const row = await db
      .select()
      .from(complianceSubmissions)
      .where(eq(complianceSubmissions.id, input.existing.id))
      .limit(1);
    return row[0];
  }

  const id = generateId();
  try {
    await db.insert(complianceSubmissions).values({
      id,
      createdBy: input.userId,
      invoiceId: input.invoiceId,
      kind: input.kind,
      createdAt: now,
      ...base,
    });
  } catch (err) {
    // UNIQUE(created_by, invoice_id, kind) race — reuse the winner's row.
    const winner = await getSubmission(input.userId, input.invoiceId, input.kind);
    if (!winner) throw err;
    await db
      .update(complianceSubmissions)
      .set(base)
      .where(eq(complianceSubmissions.id, winner.id));
    return (await getSubmission(input.userId, input.invoiceId, input.kind))!;
  }
  return (await getSubmission(input.userId, input.invoiceId, input.kind))!;
}

async function patchRow(id: string, patch: Record<string, unknown>): Promise<void> {
  await db
    .update(complianceSubmissions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(complianceSubmissions.id, id));
}

// ---------------------------------------------------------------------------
// Status (UI preflight)
// ---------------------------------------------------------------------------

export interface ComplianceStatusResult {
  invoiceId: string;
  invoiceNo: string;
  state: "none" | "pending" | "accepted" | "rejected" | "cancelled";
  submission: SubmissionRow | null;
  ewaybill: SubmissionRow | null;
  payloadReady: { ok: boolean; issues: string[] };
}

/**
 * Submission state + payload preflight for one invoice. Payload validation
 * runs in VALIDATE-ONLY mode (issues are collected, never thrown) so the UI
 * can show "what blocks generation" before the operator presses the button.
 * Only a foreign/unknown invoice 404s.
 */
export async function complianceStatus(
  userId: string,
  invoiceId: string
): Promise<ComplianceStatusResult> {
  const { invoice, items } = await loadInvoiceForCompliance(userId, invoiceId);
  const storeGstin = await readSettingString("store_gstin");
  const issues = collectIssues(invoice, items, storeGstin);
  const submission = await getSubmission(userId, invoiceId, "einvoice");
  const ewaybill = await getSubmission(userId, invoiceId, "ewaybill");
  const raw = submission?.status;
  const state: ComplianceStatusResult["state"] = !raw
    ? "none"
    : raw === "submitted"
      ? "pending"
      : (raw as ComplianceStatusResult["state"]);
  return {
    invoiceId,
    invoiceNo: invoice.invoiceNo,
    state,
    submission,
    ewaybill,
    payloadReady: { ok: issues.length === 0, issues },
  };
}

// ---------------------------------------------------------------------------
// Generate e-invoice (synchronous — see header)
// ---------------------------------------------------------------------------

export interface GenerateResult {
  created: boolean;
  submission: SubmissionRow;
}

export async function generate(
  userId: string,
  invoiceId: string
): Promise<GenerateResult> {
  const { payload, requestHash } = await buildEInvoicePayload(userId, invoiceId);
  const existing = await getSubmission(userId, invoiceId, "einvoice");
  if (existing?.status === "accepted") {
    throw new ComplianceError(409, "E-invoice already generated");
  }

  // Persist the row BEFORE any provider interaction so failures are traceable.
  const row = await upsertPendingRow({ userId, invoiceId, kind: "einvoice", requestHash, existing });

  const provider = getGstProvider();

  await patchRow(row.id, { status: "submitted", submittedAt: new Date(), error: null });

  try {
    const result = await provider.generateEInvoice(payload);
    await patchRow(row.id, {
      status: "accepted",
      irn: result.irn,
      ackNo: result.ackNo,
      ackDate: result.ackDate,
      qrData: result.qrData,
      responseJson: JSON.stringify(result.raw ?? null),
      error: null,
    });
    await auditEvents.record({
      actorId: userId,
      action: "compliance.einvoice_generated",
      entity: "invoice",
      entityId: invoiceId,
      metadata: { invoiceNo: payload.DocDtls.No, irn: result.irn, provider: provider.name },
    });
    const submission = (await getSubmission(userId, invoiceId, "einvoice"))!;
    return { created: !existing, submission };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patchRow(row.id, { status: "rejected", error: message });
    throw new ComplianceError(422, message);
  }
}

// ---------------------------------------------------------------------------
// Cancel e-invoice
// ---------------------------------------------------------------------------

export async function cancelEInvoice(
  userId: string,
  invoiceId: string,
  reason: string
): Promise<SubmissionRow> {
  const { invoice } = await loadInvoiceForCompliance(userId, invoiceId);
  const row = await getSubmission(userId, invoiceId, "einvoice");
  if (!row || row.status !== "accepted") {
    throw new ComplianceError(409, "No accepted e-invoice to cancel");
  }

  // Local 24h window — checked BEFORE the provider call (hard constant).
  const submittedAt = row.submittedAt?.getTime();
  if (submittedAt && Date.now() - submittedAt > CANCEL_WINDOW_MS) {
    throw new ComplianceError(400, "Cancellation window exceeded (24h)");
  }

  const provider = getGstProvider();

  try {
    await provider.cancelEInvoice(row.irn ?? "", reason);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ComplianceError(422, message);
  }

  const now = new Date();
  await patchRow(row.id, { status: "cancelled", cancelledAt: now, error: null });
  await auditEvents.record({
    actorId: userId,
    action: "compliance.einvoice_cancelled",
    entity: "invoice",
    entityId: invoiceId,
    metadata: { invoiceNo: invoice.invoiceNo, irn: row.irn, reason, provider: provider.name },
  });
  return (await getSubmission(userId, invoiceId, "einvoice"))!;
}

// ---------------------------------------------------------------------------
// E-way bill
// ---------------------------------------------------------------------------

export interface EWayInput {
  distanceKm: number;
  transporterName?: string;
  transporterGstin?: string;
  vehicleNo?: string;
  reason?: string;
}

export async function generateEWay(
  userId: string,
  invoiceId: string,
  input: EWayInput
): Promise<{ created: boolean; submission: SubmissionRow }> {
  await loadInvoiceForCompliance(userId, invoiceId);
  const einv = await getSubmission(userId, invoiceId, "einvoice");
  if (!einv || einv.status !== "accepted") {
    throw new ComplianceError(400, "Generate e-invoice first");
  }
  const existing = await getSubmission(userId, invoiceId, "ewaybill");
  if (existing?.status === "accepted") {
    throw new ComplianceError(409, "E-way bill already generated");
  }

  const vehicle = {
    transporterName: input.transporterName ?? null,
    transporterGstin: input.transporterGstin ?? null,
    distanceKm: input.distanceKm,
    vehicleNo: input.vehicleNo ?? null,
    reason: input.reason ?? null,
  };

  // Payload shape is the documented minimal e-way request. Transporter GSTIN
  // travels on the row (vehicle_json), not in the request body.
  const payload: EWayPayload = {
    Irn: einv.irn ?? "",
    Distance: input.distanceKm,
    TransName: input.transporterName,
    VehNo: input.vehicleNo,
  };
  const requestHash = sha256Hex(payload);

  const row = await upsertPendingRow({
    userId,
    invoiceId,
    kind: "ewaybill",
    requestHash,
    vehicle,
    existing,
  });

  const provider = getGstProvider();

  await patchRow(row.id, { status: "submitted", submittedAt: new Date(), error: null });

  try {
    const result = await provider.generateEWay(payload);
    await patchRow(row.id, {
      status: "accepted",
      irn: einv.irn,
      ackNo: result.ewayBillNo,
      ackDate: result.validUpto,
      responseJson: JSON.stringify(result.raw ?? null),
      error: null,
    });
    await auditEvents.record({
      actorId: userId,
      action: "compliance.ewaybill_generated",
      entity: "invoice",
      entityId: invoiceId,
      metadata: { invoiceId, ewayBillNo: result.ewayBillNo, irn: einv.irn, provider: provider.name },
    });
    const submission = (await getSubmission(userId, invoiceId, "ewaybill"))!;
    return { created: !existing, submission };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patchRow(row.id, { status: "rejected", error: message });
    throw new ComplianceError(422, message);
  }
}

// ---------------------------------------------------------------------------
// Compliance center listing
// ---------------------------------------------------------------------------

export interface SubmissionListItem extends SubmissionRow {
  invoiceNo: string;
  invoiceDate: string;
  customerName: string | null;
  grandTotal: number;
  vehicle: Record<string, unknown> | null;
}

export async function listSubmissions(
  userId: string,
  filters: { from?: string; to?: string; status?: ComplianceStatus }
): Promise<SubmissionListItem[]> {
  const conds = [eq(complianceSubmissions.createdBy, userId)];
  if (filters.status) conds.push(eq(complianceSubmissions.status, filters.status));
  if (filters.from) conds.push(gte(complianceSubmissions.createdAt, new Date(`${filters.from}T00:00:00`)));
  if (filters.to) conds.push(lte(complianceSubmissions.createdAt, new Date(`${filters.to}T23:59:59.999`)));

  const rows = await db
    .select({
      sub: complianceSubmissions,
      invoiceNo: invoices.invoiceNo,
      invoiceDate: invoices.date,
      customerName: invoices.customerName,
      grandTotal: invoices.grandTotal,
    })
    .from(complianceSubmissions)
    .innerJoin(invoices, eq(complianceSubmissions.invoiceId, invoices.id))
    .where(and(...conds))
    .orderBy(desc(complianceSubmissions.createdAt));

  return rows.map((r) => {
    let vehicle: Record<string, unknown> | null = null;
    if (r.sub.vehicleJson) {
      try {
        vehicle = JSON.parse(r.sub.vehicleJson);
      } catch {
        vehicle = null;
      }
    }
    return { ...r.sub, invoiceNo: r.invoiceNo, invoiceDate: r.invoiceDate, customerName: r.customerName, grandTotal: r.grandTotal, vehicle };
  });
}
