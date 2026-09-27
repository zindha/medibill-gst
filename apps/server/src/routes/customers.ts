import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { customers, payments } from "../db/schema/index.js";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { foldText, searchPattern } from "../lib/normalizeSearch.js";

const createCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  creditLimit: z.number().min(0).optional(),
  openingBalance: z.number().min(0).default(0),
  notes: z.string().optional(),
});

export default async function customerRoutes(fastify: FastifyInstance) {
  // List customers
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { search, page = "1", limit = "50" } = request.query as { search?: string; page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conds = [eq(customers.createdBy, request.userId!), eq(customers.isActive, true)];
    if (search) {
      const pat = searchPattern(search);
      conds.push(sql`(fold(${customers.name}) LIKE ${pat} OR fold(${customers.phone}) LIKE ${pat})`);
    }

    // Weak word-match ranking: exact-name customers sort above phone/loose matches.
    let order = asc(customers.name);
    if (search) {
      const q = foldText(search);
      order = desc(sql<number>`(
        CASE
          WHEN fold(${customers.name}) = ${q} THEN 100
          WHEN fold(${customers.name}) LIKE ${q + "%"} THEN 80
          WHEN fold(${customers.phone}) = ${q} THEN 75
          WHEN fold(${customers.name}) LIKE ${"% " + q + " %"} THEN 55
          WHEN fold(${customers.phone}) LIKE ${q + "%"} THEN 50
          ELSE 10
        END
      )`);
    }

    const results = await db.select().from(customers).where(and(...conds)).orderBy(order, asc(customers.name)).limit(limitNum).offset(offset);
    return reply.send({ success: true, data: results, pagination: { page: pageNum, limit: limitNum } });
  });

  // Get single customer with ledger
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [customer] = await db.select().from(customers)
      .where(and(eq(customers.id, id), eq(customers.createdBy, request.userId!), eq(customers.isActive, true))).limit(1);
    if (!customer) return reply.status(404).send({ success: false, error: "Customer not found" });

    const ledger = await db.select().from(payments)
      .where(and(eq(payments.customerId, id), eq(payments.createdBy, request.userId!)))
      .orderBy(sql`${payments.date} DESC`);
    return reply.send({ success: true, data: { ...customer, ledger } });
  });

  // Create customer
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const now = new Date();
    const [customer] = await db.insert(customers).values({
      ...parsed.data,
      balance: parsed.data.openingBalance ?? 0,
      createdBy: request.userId!,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return reply.status(201).send({ success: true, data: customer });
  });

  // Update customer
  fastify.put("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createCustomerSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const [existing] = await db.select().from(customers)
      .where(and(eq(customers.id, id), eq(customers.createdBy, request.userId!), eq(customers.isActive, true))).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Customer not found" });

    const [updated] = await db.update(customers).set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.createdBy, request.userId!))).returning();
    return reply.send({ success: true, data: updated });
  });

  // Soft-delete customer
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.isActive, true), eq(customers.createdBy, request.userId!))).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Customer not found" });

    await db.update(customers).set({ isActive: false, updatedAt: new Date() }).where(eq(customers.id, id));
    return reply.send({ success: true, data: { message: "Customer removed" } });
  });

  // Get customer ledger
  fastify.get("/:id/ledger", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const [customer] = await db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, id), eq(customers.createdBy, request.userId!))).limit(1);
    if (!customer) return reply.status(404).send({ success: false, error: "Customer not found" });

    let ledger = await db.select().from(payments)
      .where(and(eq(payments.customerId, id), eq(payments.createdBy, request.userId!)))
      .orderBy(sql`${payments.date} DESC`);
    if (from) ledger = ledger.filter(p => p.date >= from);
    if (to) ledger = ledger.filter(p => p.date <= to);
    return reply.send({ success: true, data: ledger });
  });
}
