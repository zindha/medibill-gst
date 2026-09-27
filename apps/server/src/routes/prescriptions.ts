import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { prescriptions } from "../db/schema/index.js";
import { and, eq } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import {
  PrescriptionError,
  createPrescription,
  dispensePrescription,
  getPrescription,
  getPrescriptionsForInvoice,
  listPrescriptions,
  rejectPrescription,
  updatePrescription,
  verifyPrescription,
} from "../services/prescriptions.js";

const createSchema = z.object({
  patientName: z.string().min(1),
  customerId: z.string().optional(),
  patientAge: z.number().int().min(0).max(150).optional(),
  patientGender: z.string().max(32).optional(),
  doctorId: z.string().optional(),
  date: z.string().min(1),
  notes: z.string().optional(),
  imageFileId: z.string().optional(),
});

const updateSchema = z.object({
  patientName: z.string().min(1).optional(),
  customerId: z.string().optional(),
  patientAge: z.number().int().min(0).max(150).optional(),
  patientGender: z.string().max(32).optional(),
  doctorId: z.string().optional(),
  date: z.string().min(1).optional(),
  notes: z.string().optional(),
  imageFileId: z.string().optional(),
  status: z.enum(["pending", "verified", "dispensed", "rejected"]).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1),
});

const dispenseSchema = z.object({
  invoiceId: z.string().min(1),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  customerId: z.string().optional(),
  doctorId: z.string().optional(),
  status: z.enum(["pending", "verified", "dispensed", "rejected"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

/** Map PrescriptionError to its HTTP reply; rethrow anything else. */
async function guard<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PrescriptionError) {
      await reply.status(err.status).send({ success: false, error: err.message, details: err.details });
      return null;
    }
    throw err;
  }
}

export default async function prescriptionRoutes(fastify: FastifyInstance) {
  // Create — always starts as "pending"; doctor/customer/image must be the
  // caller's own (foreign ids are 404/400 so tenant data never links across).
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const row = await guard(reply, () => createPrescription(request.userId!, parsed.data));
    if (!row) return undefined;
    return reply.status(201).send({ success: true, data: row });
  });

  // List — filters: q (patient/doctor/notes), customerId, doctorId, status, from/to.
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const result = await listPrescriptions(request.userId!, {
      ...parsed.data,
      page: parsed.data.page ? parseInt(parsed.data.page, 10) : undefined,
      limit: parsed.data.limit ? parseInt(parsed.data.limit, 10) : undefined,
    });
    return reply.send({
      success: true,
      data: result.rows,
      total: result.total,
      pagination: { page: result.page, limit: result.limit },
    });
  });

  // Prescriptions linked to one invoice (sale-time link or dispense record).
  fastify.get("/invoice/:invoiceId", { preHandler: [authGuard] }, async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const rows = await guard(reply, () => getPrescriptionsForInvoice(request.userId!, invoiceId));
    if (!rows) return undefined;
    return reply.send({ success: true, data: rows });
  });

  // Detail — includes invoices linked through invoices.prescription_id.
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await guard(reply, () => getPrescription(request.userId!, id));
    if (!row) return undefined;
    return reply.send({ success: true, data: row });
  });

  // Update — status changes are guarded by the transition table (409 otherwise).
  fastify.put("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const row = await guard(reply, () => updatePrescription(request.userId!, id, parsed.data));
    if (!row) return undefined;
    return reply.send({ success: true, data: row });
  });

  // Verify — pending/rejected → verified, audited as "prescription.verify".
  fastify.post("/:id/verify", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await guard(reply, () => verifyPrescription(request.userId!, id));
    if (!row) return undefined;
    return reply.send({ success: true, data: row });
  });

  // Reject — any non-dispensed status → rejected, reason lands in the audit trail.
  fastify.post("/:id/reject", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = rejectSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const row = await guard(reply, () => rejectPrescription(request.userId!, id, parsed.data.reason));
    if (!row) return undefined;
    return reply.send({ success: true, data: row });
  });

  // Dispense — verified prescription + this tenant's invoice become dispensed.
  fastify.post("/:id/dispense", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = dispenseSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const result = await guard(reply, () =>
      dispensePrescription(request.userId!, id, { invoiceId: parsed.data.invoiceId })
    );
    if (!result) return undefined;
    return reply.send({ success: true, data: result });
  });

  // Soft-delete — a dispensed prescription is a legal record and stays.
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await db
      .select()
      .from(prescriptions)
      .where(and(eq(prescriptions.id, id), eq(prescriptions.createdBy, request.userId!)))
      .limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Prescription not found" });
    if ((existing.status ?? "pending") === "dispensed") {
      return reply.status(409).send({ success: false, error: "Dispensed prescriptions cannot be deleted" });
    }
    await db
      .update(prescriptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(prescriptions.id, id));
    return reply.send({ success: true, data: { removed: true } });
  });
}
