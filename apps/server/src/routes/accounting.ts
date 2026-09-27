import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import { getUserRole } from "../services/expiryPolicy.js";
import {
  ACCOUNT_TYPES,
} from "../db/schema/index.js";
import {
  closePeriod,
  createAccount,
  dayBook,
  entriesForSource,
  getAccounts,
  getEntry,
  listPeriods,
  post,
  postOpeningBalances,
  profitLoss,
  balanceSheet,
  reopenPeriod,
  reverse,
  suggestOpeningLines,
  toErrorResponse,
  trialBalance,
} from "../services/accounting.js";

const lineSchema = z.object({
  code: z.string().min(1),
  // Amount validation (non-negative, one side only, balanced) lives in the
  // service so its precise messages reach the client.
  debit: z.number().optional(),
  credit: z.number().optional(),
  partyType: z.enum(["customer", "supplier"]).optional(),
  partyId: z.string().optional(),
  memo: z.string().optional(),
});

const manualPostSchema = z.object({
  date: z.string().min(1),
  description: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

const createAccountSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
});

const reverseSchema = z.object({ reason: z.string().optional() });

const closePeriodSchema = z.object({ fromDate: z.string().min(1), toDate: z.string().min(1) });

const openingPostSchema = z.object({
  date: z.string().min(1),
  description: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

async function requireJournalRole(request: any, reply: any): Promise<string | null> {
  const role = await getUserRole(request.userId!);
  if (role !== "admin" && role !== "pharmacist") {
    reply.status(403).send({ success: false, error: "Insufficient permissions" });
    return null;
  }
  return role;
}

export default async function accountingRoutes(fastify: FastifyInstance) {
  const sendError = (reply: any, err: unknown) => {
    const { statusCode, message } = toErrorResponse(err);
    return reply.status(statusCode).send({ success: false, error: message });
  };

  // Chart of accounts (system 14 + manual)
  fastify.get("/accounts", { preHandler: [authGuard] }, async (request, reply) => {
    try {
      const rows = await getAccounts(request.userId!);
      return reply.send({ success: true, data: rows });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post("/accounts", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const row = await createAccount(request.userId!, parsed.data);
      return reply.status(201).send({ success: true, data: row });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Manual journal post (admin|pharmacist only)
  fastify.post("/post", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireJournalRole(request, reply))) return;
    const parsed = manualPostSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const result = await post(request.userId!, {
        date: parsed.data.date,
        sourceType: "manual",
        sourceId: null,
        description: parsed.data.description,
        lines: parsed.data.lines,
      });
      return reply.status(result.alreadyPosted ? 200 : 201).send({ success: true, data: result });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Opening balances (admin | pharmacist only). One batch per date: the
  // sourceId is date-keyed, so a repeat POST for the same date → 400.
  fastify.post("/opening", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireJournalRole(request, reply))) return;
    const parsed = openingPostSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const result = await postOpeningBalances(request.userId!, {
        date: parsed.data.date,
        description: parsed.data.description,
        lines: parsed.data.lines,
      });
      return reply.status(result.alreadyPosted ? 200 : 201).send({ success: true, data: result });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Prefill for the Opening tab: INVENTORY/AR/AP from current stock +
  // ledgers, CASH left at 0 (editable) and CAPITAL as the balancing figure.
  fastify.get("/opening/suggest", { preHandler: [authGuard] }, async (request, reply) => {
    try {
      const lines = await suggestOpeningLines(request.userId!);
      return reply.send({ success: true, data: { lines } });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Reports
  fastify.get("/trial-balance", { preHandler: [authGuard] }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };
    try {
      const data = await trialBalance(request.userId!, from, to);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.get("/profit-loss", { preHandler: [authGuard] }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };
    try {
      const data = await profitLoss(request.userId!, from, to);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.get("/balance-sheet", { preHandler: [authGuard] }, async (request, reply) => {
    const { asOf } = request.query as { asOf?: string };
    if (!asOf) {
      return reply.status(400).send({ success: false, error: "asOf is required" });
    }
    try {
      const data = await balanceSheet(request.userId!, asOf);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.get("/day-book", { preHandler: [authGuard] }, async (request, reply) => {
    const { from, to, page, limit } = request.query as { from?: string; to?: string; page?: string; limit?: string };
    try {
      const data = await dayBook(
        request.userId!,
        from,
        to,
        Math.max(1, parseInt(page ?? "1", 10) || 1),
        Math.min(200, Math.max(1, parseInt(limit ?? "50", 10) || 50))
      );
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Entry trace + manual reversal
  fastify.get("/entries", { preHandler: [authGuard] }, async (request, reply) => {
    const { sourceType, sourceId } = request.query as { sourceType?: string; sourceId?: string };
    if (!sourceType) {
      return reply.status(400).send({ success: false, error: "sourceType is required" });
    }
    try {
      const data = await entriesForSource(request.userId!, sourceType, sourceId);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.get("/entries/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const data = await getEntry(request.userId!, id);
      if (!data) return reply.status(404).send({ success: false, error: "Journal entry not found" });
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post("/entries/:id/reverse", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireJournalRole(request, reply))) return;
    const { id } = request.params as { id: string };
    const parsed = reverseSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const entry = await getEntry(request.userId!, id);
      if (!entry) return reply.status(404).send({ success: false, error: "Journal entry not found" });
      if (entry.isReversal) {
        return reply.status(400).send({ success: false, error: "Cannot reverse a reversal entry" });
      }
      if (!entry.sourceId) {
        return reply.status(400).send({ success: false, error: "Entry has no source to reverse" });
      }
      const result = await reverse(request.userId!, {
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        date: new Date().toISOString().split("T")[0],
        reason: parsed.data.reason ?? "Manual reversal",
      });
      return reply.send({ success: true, data: result });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Accounting periods
  fastify.get("/periods", { preHandler: [authGuard] }, async (request, reply) => {
    try {
      const data = await listPeriods(request.userId!);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post("/periods/close", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireJournalRole(request, reply))) return;
    const parsed = closePeriodSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const data = await closePeriod(request.userId!, parsed.data);
      return reply.status(201).send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post("/periods/:id/reopen", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireJournalRole(request, reply))) return;
    const { id } = request.params as { id: string };
    try {
      const data = await reopenPeriod(request.userId!, id);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
