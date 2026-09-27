import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import { getUserRole } from "../services/expiryPolicy.js";
import {
  COMPLIANCE_STATUSES,
  type ComplianceStatus,
} from "../db/schema/index.js";
import {
  cancelEInvoice,
  complianceStatus,
  generate,
  generateEWay,
  listSubmissions,
  toErrorResponse,
} from "../services/compliance.js";

/**
 * E-Invoice / E-Way Bill compliance routes (Task 13) at `/api/compliance`.
 * Conventions mirror `routes/reconciliation.ts`: authGuard, zod validation and
 * `{ success, data, error }` envelopes.
 *
 * Role gating (documented): reading status/submissions/providers is open to
 * every role, but generate / cancel / e-way are **admin | pharmacist** only —
 * cashiers get 403. This build is fake-only (no live GSTN submission): the
 * /providers endpoint returns static booleans and never a credential.
 */

const cancelSchema = z.object({
  reason: z.string().trim().min(1, "reason is required"),
});

const ewaySchema = z.object({
  distanceKm: z.number().positive("distanceKm must be a positive number"),
  transporterName: z.string().trim().min(1).optional(),
  transporterGstin: z.string().trim().min(1).optional(),
  vehicleNo: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1).optional(),
});

const submissionsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.enum(COMPLIANCE_STATUSES).optional(),
});

async function requireManagerRole(request: any, reply: any): Promise<string | null> {
  const role = await getUserRole(request.userId!);
  if (role !== "admin" && role !== "pharmacist") {
    reply.status(403).send({ success: false, error: "Insufficient permissions" });
    return null;
  }
  return role;
}

export default async function complianceRoutes(fastify: FastifyInstance) {
  const sendError = (reply: any, err: unknown) => {
    const { statusCode, message } = toErrorResponse(err);
    return reply.status(statusCode).send({ success: false, error: message });
  };

  const sendValidation = (reply: any, error: z.ZodError) =>
    reply.status(400).send({ success: false, error: "Validation error", details: error.flatten() });

  // Submission state + payload preflight for one invoice (all roles)
  fastify.get("/invoices/:invoiceId", { preHandler: [authGuard] }, async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    try {
      const data = await complianceStatus(request.userId!, invoiceId);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Generate an e-invoice (admin | pharmacist; cashier → 403)
  fastify.post("/invoices/:invoiceId/generate", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;
    const { invoiceId } = request.params as { invoiceId: string };
    try {
      const { created, submission } = await generate(request.userId!, invoiceId);
      return reply.status(created ? 201 : 200).send({ success: true, data: submission });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Cancel an accepted e-invoice within the 24h window (admin | pharmacist)
  fastify.post("/invoices/:invoiceId/cancel", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;
    const { invoiceId } = request.params as { invoiceId: string };
    const parsed = cancelSchema.safeParse(request.body ?? {});
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const submission = await cancelEInvoice(request.userId!, invoiceId, parsed.data.reason);
      return reply.send({ success: true, data: submission });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // E-way bill for an accepted e-invoice (admin | pharmacist)
  fastify.post("/invoices/:invoiceId/eway", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;
    const { invoiceId } = request.params as { invoiceId: string };
    const parsed = ewaySchema.safeParse(request.body ?? {});
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const { created, submission } = await generateEWay(request.userId!, invoiceId, parsed.data);
      return reply.status(created ? 201 : 200).send({ success: true, data: submission });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Provider health — static, fake-only build: no credentials, no env, no
  // secrets. `live:false` states plainly that nothing reaches the GSTN portal.
  fastify.get("/providers", { preHandler: [authGuard] }, async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        provider: "fake",
        einvoice: true,
        eway: true,
        live: false,
        note: "Fake provider — IRNs are generated locally and are not government-issued.",
      },
    });
  });

  // Compliance center listing (tenant-scoped)
  fastify.get("/submissions", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = submissionsQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const data = await listSubmissions(request.userId!, {
        from: parsed.data.from,
        to: parsed.data.to,
        status: parsed.data.status as ComplianceStatus | undefined,
      });
      return reply.send({ success: true, data, total: data.length });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
