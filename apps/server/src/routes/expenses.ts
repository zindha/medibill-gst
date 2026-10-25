/**
 * Business Expenses.
 *
 * An expense is its own record (not a payment row): it holds the spend date,
 * a category, the payee, an optional supplier invoice number, one or more item
 * lines with their own GST rate, and the optional payment that settled it.
 *
 * GST split: when the payee sits in the same state as the business the tax is
 * split into CGST + SGST, otherwise the whole amount is IGST. The split is
 * derived from the party's state code (the first two digits of its GSTIN)
 * against the business state code (the store GSTIN).
 *
 * Totals are rounded off to the nearest rupee and the difference is kept in
 * `roundOff`, so the printed total always adds up.
 */
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  EXPENSE_CATEGORIES,
  expenseItems,
  expenseParties,
  expenses,
  medicines,
  stores,
  type PaymentMode,
} from "../db/schema/index.js";
import { authGuard } from "../plugins/auth.js";
import { nextDocumentNumber } from "../services/numbering.js";
import { getUserRole } from "../services/expiryPolicy.js";
import { readSettingString } from "../services/messaging.js";
import { searchPattern } from "../lib/normalizeSearch.js";

/** Money is rounded to two decimals before it is stored or compared. */
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** GSTIN shape: 2 state digits, 5 letters, 4 digits, 1 letter, 1 alnum, "Z", 1 alnum. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/** Two-digit GST state codes → state names (used to prefill a party's state). */
const STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

/** Optional free-text field: a blank string counts as "not provided". */
const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional()
);

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().email("Invalid email address").optional()
);

const booleanFlag = z.preprocess(
  (value) => (typeof value === "string" ? value === "true" : value),
  z.boolean().default(false)
);

const nonNegative = z.coerce.number().min(0, "Cannot be negative").default(0);

const partySchema = z.object({
  name: z.string().min(1, "Party name is required"),
  gstin: optionalText,
  address: optionalText,
  district: optionalText,
  state: optionalText,
  stateCode: optionalText,
  phone: optionalText,
  email: optionalEmail,
  isCompositionDealer: booleanFlag,
});

const itemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  hsn: optionalText,
  gstRate: z.coerce.number().min(0, "GST rate cannot be negative").max(100).default(0),
  quantity: nonNegative,
  unit: optionalText,
  unitRate: nonNegative,
});

const expenseSchema = z.object({
  date: z.string().min(1, "Date is required"),
  category: z.string().min(1, "Category is required"),
  description: optionalText,
  partyId: optionalText,
  invoiceNo: optionalText,
  isGst: booleanFlag,
  notes: optionalText,
  paymentMode: optionalText,
  paymentRef: optionalText,
  paymentDate: optionalText,
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

type PartyRow = typeof expenseParties.$inferSelect;
type ItemInput = z.infer<typeof itemSchema>;

interface ComputedLine {
  name: string;
  hsn: string | null;
  gstRate: number;
  quantity: number;
  unit: string | null;
  unitRate: number;
  amount: number;
  taxAmount: number;
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

/** First two digits of a GSTIN — the GST state code of the registration. */
function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  const match = /^(\d{2})/.exec((gstin ?? "").trim());
  return match ? match[1] : null;
}

/** Uppercase and strip separators so "27 abcde 1234 f 1 z 5" is accepted. */
function normalizeGstin(raw: unknown): { value?: string; valid: boolean } {
  if (typeof raw !== "string") return { valid: true };
  const value = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!value) return { valid: true };
  return { value, valid: GSTIN_PATTERN.test(value) };
}

/** The business state code: the store GSTIN, from settings or the store row. */
async function businessStateCode(userId: string): Promise<string | null> {
  const fromSetting = stateCodeFromGstin(await readSettingString("store_gstin"));
  if (fromSetting) return fromSetting;
  const [store] = await db
    .select({ gstin: stores.gstin })
    .from(stores)
    .where(eq(stores.ownerId, userId))
    .limit(1);
  return stateCodeFromGstin(store?.gstin);
}

/** Same state as the business → CGST + SGST, otherwise IGST. */
function isIntraState(partyStateCode: string | null, businessCode: string | null): boolean {
  if (!partyStateCode || !businessCode) return false;
  return partyStateCode === businessCode;
}

function splitTax(taxAmount: number, intraState: boolean) {
  if (!intraState) return { cgst: 0, sgst: 0, igst: roundMoney(taxAmount) };
  const cgst = roundMoney(taxAmount / 2);
  return { cgst, sgst: roundMoney(taxAmount - cgst), igst: 0 };
}

/** Line amounts and line taxes are always recomputed on the server. */
function computeLines(items: ItemInput[]): ComputedLine[] {
  return items.map((item) => {
    const quantity = Number(item.quantity);
    const unitRate = Number(item.unitRate);
    const gstRate = Number(item.gstRate);
    const amount = roundMoney(quantity * unitRate);
    const taxAmount = roundMoney((amount * gstRate) / 100);
    return {
      name: item.name,
      hsn: item.hsn ?? null,
      gstRate,
      quantity,
      unit: item.unit ?? null,
      unitRate,
      amount,
      taxAmount,
    };
  });
}

function computeTotals(lines: ComputedLine[]) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  const taxAmount = roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const gross = roundMoney(subtotal + taxAmount);
  const roundOff = roundMoney(Math.round(gross) - gross);
  return { subtotal, taxAmount, roundOff, total: roundMoney(gross + roundOff) };
}

/** Blank item rows are dropped before validation so an unused row is not an error. */
function normalizeExpenseBody(raw: unknown): Record<string, unknown> {
  const body = { ...((raw ?? {}) as Record<string, unknown>) };
  if (Array.isArray(body.items)) {
    body.items = body.items
      .filter((item: any) => item && typeof item.name === "string" && item.name.trim() !== "")
      .map((item: any) => ({ ...item, name: item.name.trim() }));
  }
  return body;
}

export default async function expenseRoutes(fastify: FastifyInstance) {
  // ── Parties (payees) ─────────────────────────────────────────────────────

  // Search parties owned by the current user.
  fastify.get("/parties", { preHandler: [authGuard] }, async (request, reply) => {
    const { q } = request.query as { q?: string };

    const conds = [eq(expenseParties.createdBy, request.userId!), eq(expenseParties.isActive, true)];
    if (q && q.trim()) {
      const pat = searchPattern(q);
      conds.push(sql`(fold(${expenseParties.name}) LIKE ${pat} OR fold(${expenseParties.gstin}) LIKE ${pat})`);
    }

    const parties = await db
      .select()
      .from(expenseParties)
      .where(and(...conds))
      .orderBy(asc(expenseParties.name));
    return reply.send({ success: true, data: parties });
  });

  // Create a party; a valid GSTIN prefills the state and its code.
  fastify.post("/parties", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;

    const parsed = partySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }

    const gstin = normalizeGstin(parsed.data.gstin);
    if (!gstin.valid) {
      return reply.status(400).send({ success: false, error: "Invalid GSTIN format" });
    }

    const stateCode = gstin.value ? gstin.value.slice(0, 2) : parsed.data.stateCode ?? null;
    const now = new Date();
    const [party] = await db
      .insert(expenseParties)
      .values({
        name: parsed.data.name.trim(),
        gstin: gstin.value ?? null,
        address: parsed.data.address ?? null,
        district: parsed.data.district ?? null,
        state: parsed.data.state ?? (stateCode ? STATE_NAMES[stateCode] ?? null : null),
        stateCode,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        isCompositionDealer: parsed.data.isCompositionDealer,
        isActive: true,
        createdBy: request.userId!,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return reply.status(201).send({ success: true, data: party });
  });

  // Update a party.
  fastify.put("/parties/:id", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;

    const { id } = request.params as { id: string };
    const parsed = partySchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }

    const [existing] = await db
      .select()
      .from(expenseParties)
      .where(and(eq(expenseParties.id, id), eq(expenseParties.createdBy, request.userId!)))
      .limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Party not found" });

    const gstin = normalizeGstin(parsed.data.gstin);
    if (!gstin.valid) {
      return reply.status(400).send({ success: false, error: "Invalid GSTIN format" });
    }

    const stateCode = gstin.value ? gstin.value.slice(0, 2) : parsed.data.stateCode ?? existing.stateCode;
    const [updated] = await db
      .update(expenseParties)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.gstin !== undefined ? { gstin: gstin.value ?? null } : {}),
        ...(parsed.data.address !== undefined ? { address: parsed.data.address ?? null } : {}),
        ...(parsed.data.district !== undefined ? { district: parsed.data.district ?? null } : {}),
        ...(parsed.data.state !== undefined ? { state: parsed.data.state ?? null } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone ?? null } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email ?? null } : {}),
        ...(parsed.data.isCompositionDealer !== undefined
          ? { isCompositionDealer: parsed.data.isCompositionDealer }
          : {}),
        ...(stateCode !== undefined ? { stateCode } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(expenseParties.id, id), eq(expenseParties.createdBy, request.userId!)))
      .returning();

    return reply.send({ success: true, data: updated });
  });

  // Deactivate a party — existing expenses keep pointing at it.
  fastify.delete("/parties/:id", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;

    const { id } = request.params as { id: string };
    const [existing] = await db
      .select()
      .from(expenseParties)
      .where(and(eq(expenseParties.id, id), eq(expenseParties.createdBy, request.userId!)))
      .limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Party not found" });

    await db
      .update(expenseParties)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(expenseParties.id, id));
    return reply.send({ success: true, data: { message: "Party removed" } });
  });

  // ── Screen metadata ──────────────────────────────────────────────────────

  fastify.get("/metadata", { preHandler: [authGuard] }, async (request, reply) => {
    return reply.send({
      success: true,
      data: {
        categories: [...EXPENSE_CATEGORIES],
        // The client needs it to preview CGST/SGST versus IGST before saving.
        businessStateCode: await businessStateCode(request.userId!),
      },
    });
  });

  // Optional product suggestions for an item line (free text is still allowed).
  fastify.get("/products", { preHandler: [authGuard] }, async (request, reply) => {
    const { q } = request.query as { q?: string };
    const trimmed = (q ?? "").trim();
    if (!trimmed) return reply.send({ success: true, data: [] });

    const pat = searchPattern(trimmed);
    const rows = await db
      .select({
        id: medicines.id,
        name: medicines.name,
        hsn: medicines.hsnCode,
        gstRate: medicines.gstRate,
        unit: medicines.unit,
        price: medicines.sellingPrice,
      })
      .from(medicines)
      .where(and(eq(medicines.createdBy, request.userId!), sql`fold(${medicines.name}) LIKE ${pat}`))
      .limit(20);

    return reply.send({ success: true, data: rows });
  });

  // ── Expenses ─────────────────────────────────────────────────────────────

  // List expenses owned by the current user.
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { q, from, to, gstOnly, page = "1", pageSize = "20" } = request.query as {
      q?: string;
      from?: string;
      to?: string;
      gstOnly?: string;
      page?: string;
      pageSize?: string;
    };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const sizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const offset = (pageNum - 1) * sizeNum;

    const conds = [eq(expenses.createdBy, request.userId!)];
    if (gstOnly === "true" || gstOnly === "1") conds.push(eq(expenses.isGst, true));
    if (from) conds.push(sql`${expenses.date} >= ${from}`);
    if (to) conds.push(sql`${expenses.date} <= ${to}`);
    if (q && q.trim()) {
      const pat = searchPattern(q);
      conds.push(
        sql`(fold(${expenses.number}) LIKE ${pat} OR fold(${expenseParties.name}) LIKE ${pat})`
      );
    }

    const items = await db
      .select({
        id: expenses.id,
        number: expenses.number,
        date: expenses.date,
        category: expenses.category,
        partyId: expenses.partyId,
        partyName: expenseParties.name,
        invoiceNo: expenses.invoiceNo,
        isGst: expenses.isGst,
        subtotal: expenses.subtotal,
        taxAmount: expenses.taxAmount,
        roundOff: expenses.roundOff,
        total: expenses.total,
      })
      .from(expenses)
      .leftJoin(expenseParties, eq(expenses.partyId, expenseParties.id))
      .where(and(...conds))
      .orderBy(desc(expenses.date), desc(expenses.createdAt))
      .limit(sizeNum)
      .offset(offset);

    const [countRow] = await db
      .select({ total: sql<number>`count(*)` })
      .from(expenses)
      .leftJoin(expenseParties, eq(expenses.partyId, expenseParties.id))
      .where(and(...conds));

    return reply.send({
      success: true,
      data: { items, total: Number(countRow?.total ?? 0), page: pageNum, pageSize: sizeNum },
    });
  });

  // Detail of one expense with its party and item lines.
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [expense] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.createdBy, request.userId!)))
      .limit(1);
    if (!expense) return reply.status(404).send({ success: false, error: "Expense not found" });

    const party = expense.partyId
      ? (
          await db
            .select()
            .from(expenseParties)
            .where(eq(expenseParties.id, expense.partyId))
            .limit(1)
        )[0] ?? null
      : null;

    const lines = await db
      .select()
      .from(expenseItems)
      .where(eq(expenseItems.expenseId, id))
      .orderBy(asc(expenseItems.sortOrder));

    const intraState = isIntraState(
      party?.stateCode ?? null,
      await businessStateCode(request.userId!)
    );

    const items = lines.map((line) => ({ ...line, ...splitTax(line.taxAmount, intraState) }));
    const taxBreakup = {
      intraState,
      cgst: roundMoney(items.reduce((sum, line) => sum + line.cgst, 0)),
      sgst: roundMoney(items.reduce((sum, line) => sum + line.sgst, 0)),
      igst: roundMoney(items.reduce((sum, line) => sum + line.igst, 0)),
    };

    return reply.send({ success: true, data: { expense, party, items, taxBreakup } });
  });

  // Create an expense.
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;

    const parsed = expenseSchema.safeParse(normalizeExpenseBody(request.body));
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const data = parsed.data;

    if (data.isGst && !data.invoiceNo) {
      return reply.status(400).send({ success: false, error: "Invoice number is required for GST expenses" });
    }
    if (data.isGst && data.items.some((item) => !item.hsn)) {
      return reply.status(400).send({ success: false, error: "HSN code is required for every item of a GST expense" });
    }

    let party: PartyRow | null = null;
    if (data.partyId) {
      const [found] = await db
        .select()
        .from(expenseParties)
        .where(and(eq(expenseParties.id, data.partyId), eq(expenseParties.createdBy, request.userId!)))
        .limit(1);
      if (!found) return reply.status(400).send({ success: false, error: "Party not found" });
      party = found;
    }

    const lines = computeLines(data.items);
    const totals = computeTotals(lines);
    const number = (await nextDocumentNumber("expense", { ownerId: request.userId!, date: data.date })).number;
    const now = new Date();

    const [expense] = await db
      .insert(expenses)
      .values({
        number,
        date: data.date,
        category: data.category,
        description: data.description ?? null,
        partyId: data.partyId ?? null,
        invoiceNo: data.invoiceNo ?? null,
        isGst: data.isGst,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        roundOff: totals.roundOff,
        total: totals.total,
        paymentMode: (data.paymentMode ?? null) as PaymentMode | null,
        paymentRef: data.paymentRef ?? null,
        paymentDate: data.paymentDate ?? null,
        notes: data.notes ?? null,
        createdBy: request.userId!,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db.insert(expenseItems).values(
      lines.map((line, index) => ({
        expenseId: expense.id,
        name: line.name,
        hsn: line.hsn,
        gstRate: line.gstRate,
        quantity: line.quantity,
        unit: line.unit,
        unitRate: line.unitRate,
        taxAmount: line.taxAmount,
        amount: line.amount,
        sortOrder: index,
      }))
    );

    const intraState = isIntraState(
      party?.stateCode ?? null,
      await businessStateCode(request.userId!)
    );
    const items = lines.map((line) => ({ ...line, ...splitTax(line.taxAmount, intraState) }));
    const taxBreakup = {
      intraState,
      cgst: roundMoney(items.reduce((sum, line) => sum + line.cgst, 0)),
      sgst: roundMoney(items.reduce((sum, line) => sum + line.sgst, 0)),
      igst: roundMoney(items.reduce((sum, line) => sum + line.igst, 0)),
    };

    return reply.status(201).send({
      success: true,
      data: { expense, party, items, taxBreakup },
    });
  });

  // Update an expense (totals are recomputed from the submitted lines).
  fastify.put("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;

    const { id } = request.params as { id: string };
    const parsed = expenseSchema.safeParse(normalizeExpenseBody(request.body));
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const data = parsed.data;

    if (data.isGst && !data.invoiceNo) {
      return reply.status(400).send({ success: false, error: "Invoice number is required for GST expenses" });
    }
    if (data.isGst && data.items.some((item) => !item.hsn)) {
      return reply.status(400).send({ success: false, error: "HSN code is required for every item of a GST expense" });
    }

    const [existing] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.createdBy, request.userId!)))
      .limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Expense not found" });

    let party: PartyRow | null = null;
    if (data.partyId) {
      const [found] = await db
        .select()
        .from(expenseParties)
        .where(and(eq(expenseParties.id, data.partyId), eq(expenseParties.createdBy, request.userId!)))
        .limit(1);
      if (!found) return reply.status(400).send({ success: false, error: "Party not found" });
      party = found;
    }

    const lines = computeLines(data.items);
    const totals = computeTotals(lines);

    const [expense] = await db
      .update(expenses)
      .set({
        date: data.date,
        category: data.category,
        description: data.description ?? null,
        partyId: data.partyId ?? null,
        invoiceNo: data.invoiceNo ?? null,
        isGst: data.isGst,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        roundOff: totals.roundOff,
        total: totals.total,
        paymentMode: (data.paymentMode ?? null) as PaymentMode | null,
        paymentRef: data.paymentRef ?? null,
        paymentDate: data.paymentDate ?? null,
        notes: data.notes ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(expenses.id, id), eq(expenses.createdBy, request.userId!)))
      .returning();

    await db.delete(expenseItems).where(eq(expenseItems.expenseId, id));
    await db.insert(expenseItems).values(
      lines.map((line, index) => ({
        expenseId: id,
        name: line.name,
        hsn: line.hsn,
        gstRate: line.gstRate,
        quantity: line.quantity,
        unit: line.unit,
        unitRate: line.unitRate,
        taxAmount: line.taxAmount,
        amount: line.amount,
        sortOrder: index,
      }))
    );

    const intraState = isIntraState(
      party?.stateCode ?? null,
      await businessStateCode(request.userId!)
    );
    const items = lines.map((line) => ({ ...line, ...splitTax(line.taxAmount, intraState) }));
    const taxBreakup = {
      intraState,
      cgst: roundMoney(items.reduce((sum, line) => sum + line.cgst, 0)),
      sgst: roundMoney(items.reduce((sum, line) => sum + line.sgst, 0)),
      igst: roundMoney(items.reduce((sum, line) => sum + line.igst, 0)),
    };

    return reply.send({ success: true, data: { expense, party, items, taxBreakup } });
  });

  // Delete an expense together with its item lines.
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManagerRole(request, reply))) return;

    const { id } = request.params as { id: string };
    const [existing] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.createdBy, request.userId!)))
      .limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Expense not found" });

    await db.delete(expenseItems).where(eq(expenseItems.expenseId, id));
    await db.delete(expenses).where(eq(expenses.id, id));
    return reply.send({ success: true, data: { message: "Expense removed" } });
  });
}
