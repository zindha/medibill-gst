import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import { getUserRole } from "../services/expiryPolicy.js";
import {
  bankBook,
  cashBook,
  importStatement,
  listStatementRows,
  match,
  reconciliationStatus,
  suggestMatches,
  toErrorResponse,
  unmatch,
} from "../services/reconciliation.js";

/**
 * Cash Book / Bank Book + bank-statement reconciliation routes (Task 12) at
 * `/api/reconciliation`. Conventions mirror `routes/accounting.ts`: authGuard,
 * zod validation and `{ success, data, error }` envelopes.
 *
 * Role gating (documented): reading books/rows/status/suggestions is open to
 * every role, but importing a statement and matching/unmatching are
 * admin|pharmacist only — cashiers stay read-only (403). `force` matching is
 * therefore also admin|pharmacist because every match is.
 */

const bookQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const importSchema = z.object({
  csv: z.string().min(1, "csv is required"),
});

const rowsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  unreconciledOnly: z.string().optional(),
  q: z.string().optional(),
});

const suggestQuerySchema = z.object({
  bankRowId: z.string().min(1, "bankRowId is required"),
});

const matchSchema = z.object({
  bankRowId: z.string().min(1, "bankRowId is required"),
  journalLineId: z.string().min(1, "journalLineId is required"),
  notes: z.string().optional(),
  force: z.boolean().optional(),
});

const unmatchSchema = z.object({
  matchId: z.string().min(1, "matchId is required"),
});

const statusQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

async function requireManagerRole(request: any, reply: any): Promise<string | null> {
  const role = await getUserRole(request.userId!);
  if (role !== "admin" && role !== "pharmacist") {
    reply.status(403).send({ success: false, error: "Insufficient permissions" });
    return null;
  }
  return role;
}

export default async function reconciliationRoutes(fastify: FastifyInstance) {
  const sendError = (reply: any, err: unknown) => {
    const { statusCode, message } = toErrorResponse(err);
    return reply.status(statusCode).send({ success: false, error: message });
  };

  const sendValidation = (reply: any, error: z.ZodError) =>
    reply.status(400).send({ success: false, error: "Validation error", details: error.flatten() });

  // Cash Book (view/export only — reconciliation status is bank-only)
  fastify.get("/cash", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = bookQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const data = await cashBook(request.userId!, parsed.data.from, parsed.data.to);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Bank Book
  fastify.get("/bank", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = bookQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const data = await bankBook(request.userId!, parsed.data.from, parsed.data.to);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Bank statement CSV import (admin|pharmacist; cashier → 403)
  fastify.post("/import", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const data = await importStatement(request.userId!, parsed.data.csv);
      return reply.status(201).send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Imported statement rows (+ match info)
  fastify.get("/rows", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = rowsQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const data = await listStatementRows(request.userId!, {
        from: parsed.data.from,
        to: parsed.data.to,
        unreconciledOnly: parsed.data.unreconciledOnly === "true" || parsed.data.unreconciledOnly === "1",
        q: parsed.data.q,
      });
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Candidate journal lines for one statement row
  fastify.get("/suggest", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = suggestQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const data = await suggestMatches(request.userId!, parsed.data.bankRowId);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Match a statement row to a journal line (admin|pharmacist)
  fastify.post("/match", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;
    const parsed = matchSchema.safeParse(request.body);
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const data = await match(request.userId!, parsed.data);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Remove a match link only — the journal is never touched (admin|pharmacist)
  fastify.post("/unmatch", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;
    const parsed = unmatchSchema.safeParse(request.body);
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const data = await unmatch(request.userId!, parsed.data.matchId);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Reconciliation status (bank-only: totals + unmatched lists both sides)
  fastify.get("/status", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = statusQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return sendValidation(reply, parsed.error);
    try {
      const data = await reconciliationStatus(request.userId!, {
        from: parsed.data.from,
        to: parsed.data.to,
      });
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
