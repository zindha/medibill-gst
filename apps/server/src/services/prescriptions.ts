import { db } from "../db/index.js";
import {
  prescriptions,
  invoices,
  doctors,
  customers,
  storedFiles,
  type Prescription,
  type PrescriptionStatus,
  type Invoice,
} from "../db/schema/index.js";
import { and, asc, desc, eq, gte, lte, or, sql, inArray } from "drizzle-orm";
import { auditEvents } from "./audit.js";
import { searchPattern } from "../lib/normalizeSearch.js";

/** Domain error with an HTTP status the route layer maps straight to a reply. */
export class PrescriptionError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "PrescriptionError";
    this.status = status;
    this.details = details;
  }
}

export interface CreatePrescriptionInput {
  patientName: string;
  customerId?: string;
  patientAge?: number;
  patientGender?: string;
  doctorId?: string;
  date: string;
  notes?: string;
  /** stored_files.id of an uploaded prescription image (filesApi). */
  imageFileId?: string;
}

export interface UpdatePrescriptionInput {
  patientName?: string;
  customerId?: string;
  patientAge?: number;
  patientGender?: string;
  doctorId?: string;
  date?: string;
  notes?: string;
  imageFileId?: string;
  status?: PrescriptionStatus;
}

export interface ListPrescriptionsOptions {
  q?: string;
  customerId?: string;
  doctorId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** Allowed status transitions. `dispensed` is terminal — only dispense() sets it. */
const ALLOWED_TRANSITIONS: Record<PrescriptionStatus, PrescriptionStatus[]> = {
  pending: ["verified", "rejected"],
  verified: ["pending", "rejected"],
  rejected: ["verified", "pending"],
  dispensed: [],
};

/** Case-insensitive check: does this medicine schedule require a prescription? */
export function scheduleRequiresPrescription(schedule?: string | null): boolean {
  if (!schedule) return false;
  const normalized = schedule.trim().toUpperCase();
  return normalized === "H" || normalized === "H1" || normalized === "X";
}

async function loadOwned(userId: string, id: string): Promise<Prescription> {
  const [row] = await db
    .select()
    .from(prescriptions)
    .where(and(eq(prescriptions.id, id), eq(prescriptions.createdBy, userId)))
    .limit(1);
  if (!row) throw new PrescriptionError("Prescription not found", 404);
  return row;
}

/** Resolve an optional doctorId — foreign/unknown doctors are a 404 (tenant-scoped). */
async function resolveDoctor(userId: string, doctorId: string) {
  const [doctor] = await db
    .select()
    .from(doctors)
    .where(and(eq(doctors.id, doctorId), eq(doctors.createdBy, userId)))
    .limit(1);
  if (!doctor) throw new PrescriptionError("Doctor not found", 404);
  return doctor;
}

async function resolveCustomer(userId: string, customerId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.createdBy, userId)))
    .limit(1);
  if (!customer) throw new PrescriptionError("Customer not found", 404);
  return customer;
}

/** Validate an uploaded image belongs to this tenant; returns its stored_files id. */
async function resolveImage(userId: string, imageFileId: string): Promise<string> {
  const [file] = await db
    .select({ id: storedFiles.id })
    .from(storedFiles)
    .where(and(eq(storedFiles.id, imageFileId), eq(storedFiles.ownerId, userId)))
    .limit(1);
  if (!file) throw new PrescriptionError("Invalid prescription image", 400);
  return file.id;
}

export async function createPrescription(
  userId: string,
  input: CreatePrescriptionInput
): Promise<Prescription> {
  let doctorName: string | undefined;
  if (input.doctorId) {
    doctorName = (await resolveDoctor(userId, input.doctorId)).name;
  }
  if (input.customerId) await resolveCustomer(userId, input.customerId);
  const imagePath = input.imageFileId ? await resolveImage(userId, input.imageFileId) : undefined;

  const now = new Date();
  const [row] = await db
    .insert(prescriptions)
    .values({
      patientName: input.patientName,
      patientAge: input.patientAge,
      patientGender: input.patientGender,
      customerId: input.customerId,
      doctorId: input.doctorId,
      doctorName,
      date: input.date,
      notes: input.notes,
      imagePath,
      status: "pending",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function listPrescriptions(
  userId: string,
  opts: ListPrescriptionsOptions
): Promise<{ rows: Prescription[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));

  const conds = [eq(prescriptions.createdBy, userId), eq(prescriptions.isActive, true)];
  if (opts.customerId) conds.push(eq(prescriptions.customerId, opts.customerId));
  if (opts.doctorId) conds.push(eq(prescriptions.doctorId, opts.doctorId));
  if (opts.status) conds.push(eq(prescriptions.status, opts.status as PrescriptionStatus));
  if (opts.from) conds.push(gte(prescriptions.date, opts.from));
  if (opts.to) conds.push(lte(prescriptions.date, opts.to));
  if (opts.q) {
    const pat = searchPattern(opts.q);
    conds.push(
      or(
        sql`fold(${prescriptions.patientName}) LIKE ${pat}`,
        sql`fold(${prescriptions.doctorName}) LIKE ${pat}`,
        sql`fold(${prescriptions.notes}) LIKE ${pat}`
      )!
    );
  }

  const all = await db
    .select()
    .from(prescriptions)
    .where(and(...conds))
    .orderBy(desc(prescriptions.date), desc(prescriptions.createdAt));

  const total = all.length;
  const rows = all.slice((page - 1) * limit, page * limit);
  return { rows, total, page, limit };
}

export interface PrescriptionDetail extends Prescription {
  invoices: Invoice[];
}

export async function getPrescription(userId: string, id: string): Promise<PrescriptionDetail> {
  const row = await loadOwned(userId, id);
  const linked = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.prescriptionId, id), eq(invoices.createdBy, userId)))
    .orderBy(asc(invoices.date));
  return { ...row, invoices: linked };
}

function assertTransition(from: PrescriptionStatus, to: PrescriptionStatus): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new PrescriptionError(
      `Cannot change prescription status from ${from} to ${to}`,
      409
    );
  }
}

export async function updatePrescription(
  userId: string,
  id: string,
  patch: UpdatePrescriptionInput
): Promise<Prescription> {
  const existing = await loadOwned(userId, id);
  const now = new Date();
  const next: Record<string, unknown> = { updatedAt: now };

  if (patch.patientName !== undefined) next.patientName = patch.patientName;
  if (patch.patientAge !== undefined) next.patientAge = patch.patientAge;
  if (patch.patientGender !== undefined) next.patientGender = patch.patientGender;
  if (patch.date !== undefined) next.date = patch.date;
  if (patch.notes !== undefined) next.notes = patch.notes;

  if (patch.customerId !== undefined) {
    if (patch.customerId) await resolveCustomer(userId, patch.customerId);
    next.customerId = patch.customerId || null;
  }
  if (patch.doctorId !== undefined && patch.doctorId) {
    const doctor = await resolveDoctor(userId, patch.doctorId);
    next.doctorId = doctor.id;
    next.doctorName = doctor.name;
  }
  if (patch.imageFileId !== undefined) {
    next.imagePath = patch.imageFileId
      ? await resolveImage(userId, patch.imageFileId)
      : null;
  }
  if (patch.status !== undefined) {
    const from = existing.status ?? "pending";
    assertTransition(from, patch.status);
    next.status = patch.status;
  }

  const [updated] = await db
    .update(prescriptions)
    .set(next)
    .where(eq(prescriptions.id, id))
    .returning();
  return updated;
}

export async function verifyPrescription(userId: string, id: string): Promise<Prescription> {
  const existing = await loadOwned(userId, id);
  const from = existing.status ?? "pending";
  if (from === "verified") return existing;
  assertTransition(from, "verified");

  const now = new Date();
  const [updated] = await db
    .update(prescriptions)
    .set({ status: "verified", updatedAt: now })
    .where(eq(prescriptions.id, id))
    .returning();

  await auditEvents.record({
    actorId: userId,
    action: "prescription.verify",
    entity: "prescription",
    entityId: id,
    metadata: { patientName: existing.patientName, previousStatus: from },
  });
  return updated;
}

export async function rejectPrescription(
  userId: string,
  id: string,
  reason: string
): Promise<Prescription> {
  const existing = await loadOwned(userId, id);
  const from = existing.status ?? "pending";
  if (from === "rejected") return existing;
  assertTransition(from, "rejected");

  const now = new Date();
  const [updated] = await db
    .update(prescriptions)
    .set({ status: "rejected", updatedAt: now })
    .where(eq(prescriptions.id, id))
    .returning();

  await auditEvents.record({
    actorId: userId,
    action: "prescription.reject",
    entity: "prescription",
    entityId: id,
    metadata: { reason, patientName: existing.patientName, previousStatus: from },
  });
  return updated;
}

export interface DispenseResult {
  prescription: Prescription;
  invoice: Invoice;
}

/** Link a sale to this prescription and mark both sides dispensed (one transaction). */
export async function dispensePrescription(
  userId: string,
  id: string,
  input: { invoiceId: string }
): Promise<DispenseResult> {
  const prescription = await loadOwned(userId, id);
  const status = prescription.status ?? "pending";
  if (status === "dispensed") {
    throw new PrescriptionError("Prescription already dispensed", 409);
  }
  if (status !== "verified") {
    throw new PrescriptionError("Prescription must be verified before dispensing", 409);
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.createdBy, userId)))
    .limit(1);
  if (!invoice) throw new PrescriptionError("Invoice not found", 404);
  if (invoice.prescriptionId && invoice.prescriptionId !== id) {
    throw new PrescriptionError("Invoice is already linked to another prescription", 409);
  }

  const now = new Date();
  const updatedInvoice = db.transaction((tx) => {
    tx.update(prescriptions)
      .set({
        status: "dispensed",
        dispensedAt: now,
        dispensedInvoiceId: invoice.id,
        updatedAt: now,
      })
      .where(eq(prescriptions.id, id))
      .run();

    tx.update(invoices)
      .set({
        prescriptionId: id,
        prescriptionStatus: "dispensed",
        updatedAt: now,
      })
      .where(eq(invoices.id, invoice.id))
      .run();

    const [row] = tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoice.id))
      .limit(1)
      .all();
    return row;
  });

  const [updatedPrescription] = await db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, id))
    .limit(1);

  await auditEvents.record({
    actorId: userId,
    action: "prescription.dispense",
    entity: "prescription",
    entityId: id,
    metadata: {
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      patientName: prescription.patientName,
    },
  });

  return { prescription: updatedPrescription!, invoice: updatedInvoice! };
}

export async function getPrescriptionsForInvoice(
  userId: string,
  invoiceId: string
): Promise<Prescription[]> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.createdBy, userId)))
    .limit(1);
  if (!invoice) throw new PrescriptionError("Invoice not found", 404);

  const ids = new Set<string>();
  if (invoice.prescriptionId) ids.add(invoice.prescriptionId);
  const dispensed = await db
    .select({ id: prescriptions.id })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.createdBy, userId),
        eq(prescriptions.dispensedInvoiceId, invoiceId)
      )
    );
  for (const row of dispensed) ids.add(row.id);
  if (ids.size === 0) return [];

  const rows = await db
    .select()
    .from(prescriptions)
    .where(and(eq(prescriptions.createdBy, userId), inArray(prescriptions.id, [...ids])))
    .orderBy(desc(prescriptions.date));
  return rows;
}
