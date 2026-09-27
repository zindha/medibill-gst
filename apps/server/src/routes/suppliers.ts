import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { suppliers, payments } from "../db/schema/index.js";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { foldText, searchPattern } from "../lib/normalizeSearch.js";

const createSupplierSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  paymentTerms: z.string().optional(),
  creditLimit: z.number().min(0).optional(),
  openingBalance: z.number().min(0).default(0),
});

export default async function supplierRoutes(fastify: FastifyInstance) {
  // List suppliers
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { search, page = "1", limit = "50" } = request.query as { search?: string; page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conds = [eq(suppliers.isActive, true)];
    if (search) {
      const pat = searchPattern(search);
      conds.push(sql`(fold(${suppliers.name}) LIKE ${pat} OR fold(${suppliers.phone}) LIKE ${pat})`);
    }

    // Weak word-match ranking: exact-name suppliers sort above phone/loose matches.
    let order = asc(suppliers.name);
    if (search) {
      const q = foldText(search);
      order = desc(sql<number>`(
        CASE
          WHEN fold(${suppliers.name}) = ${q} THEN 100
          WHEN fold(${suppliers.name}) LIKE ${q + "%"} THEN 80
          WHEN fold(${suppliers.phone}) = ${q} THEN 75
          WHEN fold(${suppliers.name}) LIKE ${"% " + q + " %"} THEN 55
          WHEN fold(${suppliers.phone}) LIKE ${q + "%"} THEN 50
          ELSE 10
        END
      )`);
    }

    const results = await db.select().from(suppliers).where(and(...conds)).orderBy(order, asc(suppliers.name)).limit(limitNum).offset(offset);
    return reply.send({ success: true, data: results, pagination: { page: pageNum, limit: limitNum } });
  });

  // Get single supplier
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [supplier] = await db.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.isActive, true))).limit(1);
    if (!supplier) return reply.status(404).send({ success: false, error: "Supplier not found" });
    return reply.send({ success: true, data: supplier });
  });

  // Create supplier
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createSupplierSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const now = new Date();
    const [supplier] = await db.insert(suppliers).values({
      ...parsed.data,
      balance: parsed.data.openingBalance ?? 0,
      createdBy: request.userId!,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return reply.status(201).send({ success: true, data: supplier });
  });

  // Update supplier
  fastify.put("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createSupplierSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const [existing] = await db.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.isActive, true))).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Supplier not found" });

    const [updated] = await db.update(suppliers).set({ ...parsed.data, updatedAt: new Date() }).where(eq(suppliers.id, id)).returning();
    return reply.send({ success: true, data: updated });
  });

  // Soft-delete supplier
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await db.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.isActive, true), eq(suppliers.createdBy, request.userId!))).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Supplier not found" });

    await db.update(suppliers).set({ isActive: false, updatedAt: new Date() }).where(eq(suppliers.id, id));
    return reply.send({ success: true, data: { message: "Supplier removed" } });
  });

  // Get supplier ledger
  fastify.get("/:id/ledger", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ledger = await db.select().from(payments).where(eq(payments.supplierId, id)).orderBy(sql`${payments.date} DESC`);
    return reply.send({ success: true, data: ledger });
  });
}
