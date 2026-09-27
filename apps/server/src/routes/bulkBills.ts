import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import { INVOICE_STATUS, PAYMENT_MODES } from "../db/schema/index.js";
import { getUserRole } from "../services/expiryPolicy.js";
import {
  DataMigrationError,
  bulkBillCommit,
  bulkBillPreview,
  type BulkBillFilters,
  type BulkBillPatch,
} from "../services/dataMigration.js";

const PAYMENT_MODE_VALUES = Object.values(PAYMENT_MODES) as [string, ...string[]];
const INVOICE_STATUS_VALUES = Object.values(INVOICE_STATUS) as [string, ...string[]];

const filtersSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.enum(INVOICE_STATUS_VALUES).optional(),
  customerId: z.string().optional(),
  minAmount: z.number().min(0).optional(),
  maxAmount: z.number().min(0).optional(),
  q: z.string().optional(),
});

const patchSchema = z
  .object({
    // `null` clears the customer (walk-in); a string must be a tenant customer.
    customerId: z.string().min(1).nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").optional(),
    notes: z.string().max(500, "notes must be 500 characters or fewer").optional(),
    paymentMode: z.enum(PAYMENT_MODE_VALUES).optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((v) => v !== undefined),
    { message: "No fields to update" }
  );

const bulkSchema = z.object({
  filters: filtersSchema.optional().default({}),
  patch: patchSchema,
});

const commitSchema = bulkSchema.extend({
  confirm: z.string().optional(),
});

function sendError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof DataMigrationError) {
    return reply
      .status(err.status)
      .send({ success: false, error: err.message, details: err.details });
  }
  throw err;
}

/** Bulk mutations are admin|pharmacist — cashiers get 403 (read-only preview stays open). */
async function requireBillRole(request: any, reply: FastifyReply): Promise<string | null> {
  const role = await getUserRole(request.userId!);
  if (role !== "admin" && role !== "pharmacist") {
    reply.status(403).send({ success: false, error: "Insufficient permissions" });
    return null;
  }
  return role;
}

export default async function bulkBillRoutes(fastify: FastifyInstance) {
  // Preview: matched invoices + per-field current → proposed diffs. No writes.
  fastify.post("/preview", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = bulkSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const result = await bulkBillPreview(
        request.userId!,
        parsed.data.filters as BulkBillFilters,
        parsed.data.patch as BulkBillPatch
      );
      return reply.send({ success: true, data: result });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Commit: requires the literal `confirm: "CONFIRM"` and admin|pharmacist.
  fastify.post("/commit", { preHandler: [authGuard] }, async (request, reply) => {
    const role = await requireBillRole(request, reply);
    if (!role) return reply;

    const parsed = commitSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const result = await bulkBillCommit(
        request.userId!,
        parsed.data.filters as BulkBillFilters,
        parsed.data.patch as BulkBillPatch,
        { confirm: parsed.data.confirm }
      );
      return reply.send({ success: true, data: result });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
