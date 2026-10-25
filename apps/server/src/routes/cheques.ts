/**
 * Cheque register (issued + received post-dated cheques).
 *
 * Lifecycle: pending → cleared | bounced | cancelled (one-way). Clearing a
 * cheque that is linked to a payment account posts one movement on that
 * account inside a transaction — issued cheques take money out, received
 * cheques bring money in. Bounced and cancelled cheques leave the account
 * untouched.
 *
 * Everything is tenant-scoped: a foreign cheque id is a 404.
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db, withTransaction } from "../db/index.js";
import {
  CHEQUE_DIRECTIONS,
  CHEQUE_PARTY_TYPES,
  CHEQUE_STATUSES,
  cheques,
  paymentAccounts,
  paymentAccountTransactions,
} from "../db/schema/index.js";
import { authGuard } from "../plugins/auth.js";
import { getUserRole } from "../services/expiryPolicy.js";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional()
);

const requiredText = (max: number, message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, message).max(max)
  );

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  direction: z.enum(CHEQUE_DIRECTIONS),
  partyType: z.enum(CHEQUE_PARTY_TYPES),
  partyName: requiredText(160, "Party name is required"),
  accountId: optionalText,
  chequeNo: requiredText(40, "Cheque number is required"),
  bankName: optionalText,
  amountMinor: z.coerce
    .number()
    .int("Amount must be whole paise")
    .positive("Amount must be greater than zero"),
  issueDate: z.string().regex(ISO_DATE, "Issue date must be YYYY-MM-DD"),
  dueDate: z.string().regex(ISO_DATE, "Due date must be YYYY-MM-DD"),
  notes: optionalText,
});

const listQuerySchema = z.object({
  status: z.enum(CHEQUE_STATUSES).optional(),
  direction: z.enum(CHEQUE_DIRECTIONS).optional(),
  from: z.string().regex(ISO_DATE, "from must be YYYY-MM-DD").optional(),
  to: z.string().regex(ISO_DATE, "to must be YYYY-MM-DD").optional(),
});

const statusSchema = z.object({
  status: z.enum(["cleared", "bounced", "cancelled"]),
  // Epoch ms of the clearing event; defaults to now.
  clearedAt: z.coerce.number().int().optional(),
});

/** The caller's cheque, or null when it is missing or belongs to someone else. */
async function ownCheque(userId: string, id: string) {
  const [cheque] = await db
    .select()
    .from(cheques)
    .where(and(eq(cheques.id, id), eq(cheques.createdBy, userId)))
    .limit(1);
  return cheque ?? null;
}

async function requireManagerRole(request: any, reply: any): Promise<boolean> {
  const role = await getUserRole(request.userId!);
  if (role !== "admin" && role !== "pharmacist") {
    reply.status(403).send({ success: false, error: "Insufficient permissions" });
    return false;
  }
  return true;
}

export default async function chequeRoutes(fastify: FastifyInstance) {
  // GET /api/cheques?status=&direction=&from=&to= (due-date window)
  fastify.get("/", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = listQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }

    const conds = [eq(cheques.createdBy, request.userId!)];
    if (parsed.data.status) conds.push(eq(cheques.status, parsed.data.status));
    if (parsed.data.direction) conds.push(eq(cheques.direction, parsed.data.direction));
    if (parsed.data.from) conds.push(gte(cheques.dueDate, parsed.data.from));
    if (parsed.data.to) conds.push(lte(cheques.dueDate, parsed.data.to));

    const rows = await db
      .select({
        cheque: cheques,
        accountName: paymentAccounts.name,
      })
      .from(cheques)
      .leftJoin(paymentAccounts, eq(cheques.accountId, paymentAccounts.id))
      .where(and(...conds))
      .orderBy(asc(cheques.dueDate), desc(cheques.createdAt));

    const data = rows.map((row) => ({ ...row.cheque, accountName: row.accountName }));
    return reply.send({ success: true, data: { rows: data, count: data.length } });
  });

  // POST /api/cheques
  fastify.post("/", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireManagerRole(request, reply))) return;

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }

    // A linked account must exist and belong to the caller.
    let accountId: string | null = null;
    if (parsed.data.accountId) {
      const [account] = await db
        .select({ id: paymentAccounts.id })
        .from(paymentAccounts)
        .where(
          and(
            eq(paymentAccounts.id, parsed.data.accountId),
            eq(paymentAccounts.createdBy, request.userId!)
          )
        )
        .limit(1);
      if (!account) {
        return reply.status(400).send({ success: false, error: "Payment account not found" });
      }
      accountId = account.id;
    }

    const [cheque] = await db
      .insert(cheques)
      .values({
        createdBy: request.userId!,
        direction: parsed.data.direction,
        partyType: parsed.data.partyType,
        partyName: parsed.data.partyName,
        accountId,
        chequeNo: parsed.data.chequeNo,
        bankName: parsed.data.bankName ?? null,
        amountMinor: parsed.data.amountMinor,
        issueDate: parsed.data.issueDate,
        dueDate: parsed.data.dueDate,
      })
      .returning();

    return reply.status(201).send({ success: true, data: cheque });
  });

  // POST /api/cheques/:id/status — pending → cleared | bounced | cancelled.
  // Clearing with a linked account posts the movement atomically.
  fastify.post(
    "/:id/status",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireManagerRole(request, reply))) return;

      const { id } = request.params as { id: string };
      const parsed = statusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }

      const existing = await ownCheque(request.userId!, id);
      if (!existing) return reply.status(404).send({ success: false, error: "Cheque not found" });
      if (existing.status !== "pending") {
        return reply
          .status(409)
          .send({ success: false, error: `Cheque is already ${existing.status}` });
      }

      const clearedAt = new Date(parsed.data.clearedAt ?? Date.now());

      // A linked account must exist and belong to the caller — checked before
      // the (synchronous) better-sqlite3 transaction body below.
      if (parsed.data.status === "cleared" && existing.accountId) {
        const [account] = await db
          .select({ id: paymentAccounts.id })
          .from(paymentAccounts)
          .where(
            and(
              eq(paymentAccounts.id, existing.accountId),
              eq(paymentAccounts.createdBy, request.userId!)
            )
          )
          .limit(1);
        if (!account) {
          return reply
            .status(400)
            .send({ success: false, error: "Linked payment account not found" });
        }
      }

      // Synchronous transaction body (better-sqlite3): builders terminate with
      // .all() — they are only awaitable outside the transaction.
      const result = withTransaction((tx) => {
        const [cheque] = tx
          .update(cheques)
          .set({
            status: parsed.data.status,
            clearedAt: parsed.data.status === "cleared" ? clearedAt : null,
          })
          .where(and(eq(cheques.id, id), eq(cheques.createdBy, request.userId!)))
          .returning()
          .all();

        let transaction = null;
        if (parsed.data.status === "cleared" && existing.accountId) {
          // Issued = money leaves the account; received = money enters it.
          const [posted] = tx
            .insert(paymentAccountTransactions)
            .values({
              accountId: existing.accountId,
              createdBy: request.userId!,
              direction: existing.direction === "issued" ? "out" : "in",
              amountMinor: existing.amountMinor,
              reason: `Cheque ${existing.chequeNo} cleared`,
              refType: "cheque",
              refId: existing.id,
            })
            .returning()
            .all();
          transaction = posted;
        }
        return { cheque, transaction };
      });

      return reply.send({ success: true, data: result });
    }
  );
}
