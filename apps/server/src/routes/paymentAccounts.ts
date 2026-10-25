/**
 * Payment accounts (G4a-01).
 *
 * Named money-in-hand masters — a cash drawer, bank accounts, UPI handles and
 * card settlements — each with its own running balance. Amounts are minor
 * units (paise) as integers: balance = openingBalanceMinor + SUM(in) − SUM(out).
 *
 * Every endpoint is tenant-scoped: a foreign account id is indistinguishable
 * from a missing one (404). Writes are limited to admin / pharmacist roles,
 * mirroring the expenses module.
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  PAYMENT_ACCOUNT_TYPES,
  paymentAccountTransactions,
  paymentAccounts,
  type PaymentTxDirection,
} from "../db/schema/index.js";
import { authGuard } from "../plugins/auth.js";
import { getUserRole } from "../services/expiryPolicy.js";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional()
);

/** Trims a required text field before validation so "  " fails min(1). */
const requiredText = (max: number, message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, message).max(max)
  );

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  name: requiredText(120, "Account name is required"),
  type: z.enum(PAYMENT_ACCOUNT_TYPES),
  storeId: optionalText,
  bankName: optionalText,
  ifsc: optionalText,
  accountNumberMasked: optionalText,
  accountHolder: optionalText,
  upiId: optionalText,
  openingBalanceMinor: z.coerce.number().int("Opening balance must be whole paise").min(0).default(0),
});

const updateSchema = createSchema.partial();

const adjustSchema = z.object({
  direction: z.enum(["add", "reduce"]),
  amountMinor: z.coerce
    .number()
    .int("Amount must be whole paise")
    .positive("Amount must be greater than zero"),
  reason: optionalText,
  refType: optionalText,
  refId: optionalText,
});

const rangeQuerySchema = z.object({
  from: z.string().regex(ISO_DATE, "from must be YYYY-MM-DD").optional(),
  to: z.string().regex(ISO_DATE, "to must be YYYY-MM-DD").optional(),
});

type AccountRow = typeof paymentAccounts.$inferSelect;

interface Sums {
  inMinor: number;
  outMinor: number;
}

/** Per-direction totals of one account's movements, optionally bounded by an extra condition. */
async function accountSums(
  accountId: string,
  extra?: ReturnType<typeof lt>
): Promise<Sums> {
  const conds = [eq(paymentAccountTransactions.accountId, accountId)];
  if (extra) conds.push(extra);
  const [sums] = await db
    .select({
      inMinor: sql<number>`COALESCE(SUM(CASE WHEN ${paymentAccountTransactions.direction} = 'in' THEN ${paymentAccountTransactions.amountMinor} ELSE 0 END), 0)`,
      outMinor: sql<number>`COALESCE(SUM(CASE WHEN ${paymentAccountTransactions.direction} = 'out' THEN ${paymentAccountTransactions.amountMinor} ELSE 0 END), 0)`,
    })
    .from(paymentAccountTransactions)
    .where(and(...conds));
  return { inMinor: Number(sums?.inMinor ?? 0), outMinor: Number(sums?.outMinor ?? 0) };
}

const balanceOf = (account: AccountRow, sums: Sums) =>
  account.openingBalanceMinor + sums.inMinor - sums.outMinor;

/** The caller's account, or null when it is missing or belongs to someone else. */
async function ownAccount(userId: string, id: string): Promise<AccountRow | null> {
  const [account] = await db
    .select()
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.createdBy, userId)))
    .limit(1);
  return account ?? null;
}

/** Writes are limited to the roles that own money movement in this app. */
async function requireManagerRole(request: any, reply: any): Promise<boolean> {
  const role = await getUserRole(request.userId!);
  if (role !== "admin" && role !== "pharmacist") {
    reply.status(403).send({ success: false, error: "Insufficient permissions" });
    return false;
  }
  return true;
}

/** Adjust-direction ("add"/"reduce") → ledger direction ("in"/"out"). */
function ledgerDirection(adjust: "add" | "reduce"): PaymentTxDirection {
  return adjust === "add" ? "in" : "out";
}

export default async function paymentAccountRoutes(fastify: FastifyInstance) {
  // GET /api/payment-accounts — every account of the caller with its balance.
  fastify.get("/", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const accounts = await db
      .select()
      .from(paymentAccounts)
      .where(eq(paymentAccounts.createdBy, request.userId!))
      .orderBy(asc(paymentAccounts.name));

    const withBalances = await Promise.all(
      accounts.map(async (account) => {
        const sums = await accountSums(account.id);
        return { ...account, balanceMinor: balanceOf(account, sums) };
      })
    );
    return reply.send({ success: true, data: withBalances });
  });

  // POST /api/payment-accounts
  fastify.post("/", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireManagerRole(request, reply))) return;

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }

    const [account] = await db
      .insert(paymentAccounts)
      .values({
        storeId: parsed.data.storeId ?? null,
        createdBy: request.userId!,
        name: parsed.data.name,
        type: parsed.data.type,
        bankName: parsed.data.bankName ?? null,
        ifsc: parsed.data.ifsc ?? null,
        accountNumberMasked: parsed.data.accountNumberMasked ?? null,
        accountHolder: parsed.data.accountHolder ?? null,
        upiId: parsed.data.upiId ?? null,
        openingBalanceMinor: parsed.data.openingBalanceMinor,
      })
      .returning();

    return reply
      .status(201)
      .send({ success: true, data: { ...account, balanceMinor: account.openingBalanceMinor } });
  });

  // GET /api/payment-accounts/:id
  fastify.get("/:id", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const account = await ownAccount(request.userId!, id);
    if (!account) return reply.status(404).send({ success: false, error: "Account not found" });

    const sums = await accountSums(account.id);
    return reply.send({ success: true, data: { ...account, balanceMinor: balanceOf(account, sums) } });
  });

  // PUT /api/payment-accounts/:id
  fastify.put("/:id", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireManagerRole(request, reply))) return;

    const { id } = request.params as { id: string };
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }

    const account = await ownAccount(request.userId!, id);
    if (!account) return reply.status(404).send({ success: false, error: "Account not found" });

    const [updated] = await db
      .update(paymentAccounts)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
        ...(parsed.data.storeId !== undefined ? { storeId: parsed.data.storeId ?? null } : {}),
        ...(parsed.data.bankName !== undefined ? { bankName: parsed.data.bankName ?? null } : {}),
        ...(parsed.data.ifsc !== undefined ? { ifsc: parsed.data.ifsc ?? null } : {}),
        ...(parsed.data.accountNumberMasked !== undefined
          ? { accountNumberMasked: parsed.data.accountNumberMasked ?? null }
          : {}),
        ...(parsed.data.accountHolder !== undefined
          ? { accountHolder: parsed.data.accountHolder ?? null }
          : {}),
        ...(parsed.data.upiId !== undefined ? { upiId: parsed.data.upiId ?? null } : {}),
        ...(parsed.data.openingBalanceMinor !== undefined
          ? { openingBalanceMinor: parsed.data.openingBalanceMinor }
          : {}),
      })
      .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.createdBy, request.userId!)))
      .returning();

    const sums = await accountSums(id);
    return reply.send({ success: true, data: { ...updated, balanceMinor: balanceOf(updated, sums) } });
  });

  // DELETE /api/payment-accounts/:id — refused while movements exist so the
  // money trail (statement rows, cheque clearings) stays auditable.
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireManagerRole(request, reply))) return;

    const { id } = request.params as { id: string };
    const account = await ownAccount(request.userId!, id);
    if (!account) return reply.status(404).send({ success: false, error: "Account not found" });

    const [movement] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(paymentAccountTransactions)
      .where(eq(paymentAccountTransactions.accountId, id));
    if (Number(movement?.count ?? 0) > 0) {
      return reply.status(409).send({
        success: false,
        error: "Account has recorded movements and cannot be deleted",
      });
    }

    await db
      .delete(paymentAccounts)
      .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.createdBy, request.userId!)));
    return reply.send({ success: true, data: { message: "Account deleted" } });
  });

  // GET /api/payment-accounts/:id/statement?from=&to= — movements in the
  // window with a running balance. The opening carries the opening balance
  // plus every movement dated before `from`.
  fastify.get(
    "/:id/statement",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = rangeQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }
      const account = await ownAccount(request.userId!, id);
      if (!account) return reply.status(404).send({ success: false, error: "Account not found" });

      const from = parsed.data.from ? new Date(`${parsed.data.from}T00:00:00`) : null;
      const to = parsed.data.to ? new Date(`${parsed.data.to}T23:59:59.999`) : null;

      // Carry the pre-window movements into the opening balance.
      let openingMinor = account.openingBalanceMinor;
      if (from) {
        const pre = await accountSums(id, lt(paymentAccountTransactions.createdAt, from));
        openingMinor += pre.inMinor - pre.outMinor;
      }

      const conds = [eq(paymentAccountTransactions.accountId, id)];
      if (from) conds.push(gte(paymentAccountTransactions.createdAt, from));
      if (to) conds.push(lte(paymentAccountTransactions.createdAt, to));

      const rows = await db
        .select()
        .from(paymentAccountTransactions)
        .where(and(...conds))
        .orderBy(asc(paymentAccountTransactions.createdAt), asc(paymentAccountTransactions.id));

      let running = openingMinor;
      const statement = rows.map((row) => {
        running += row.direction === "in" ? row.amountMinor : -row.amountMinor;
        return { ...row, runningBalanceMinor: running };
      });

      return reply.send({
        success: true,
        data: {
          account: {
            ...account,
            balanceMinor: balanceOf(account, await accountSums(id)),
          },
          openingMinor,
          closingMinor: running,
          rows: statement,
        },
      });
    }
  );

  // POST /api/payment-accounts/:id/adjust — one manual movement with a reason.
  fastify.post(
    "/:id/adjust",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireManagerRole(request, reply))) return;

      const { id } = request.params as { id: string };
      const parsed = adjustSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }
      const account = await ownAccount(request.userId!, id);
      if (!account) return reply.status(404).send({ success: false, error: "Account not found" });

      const [transaction] = await db
        .insert(paymentAccountTransactions)
        .values({
          accountId: id,
          createdBy: request.userId!,
          direction: ledgerDirection(parsed.data.direction),
          amountMinor: parsed.data.amountMinor,
          reason: parsed.data.reason ?? null,
          refType: parsed.data.refType ?? null,
          refId: parsed.data.refId ?? null,
        })
        .returning();

      const sums = await accountSums(id);
      return reply.status(201).send({
        success: true,
        data: { transaction, balanceMinor: balanceOf(account, sums) },
      });
    }
  );
}
