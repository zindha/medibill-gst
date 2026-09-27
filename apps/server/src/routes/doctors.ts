import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { doctors } from "../db/schema/index.js";
import { eq, and, asc, or, sql } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { searchPattern } from "../lib/normalizeSearch.js";

const createDoctorSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  clinicName: z.string().optional(),
  clinicAddress: z.string().optional(),
  specialization: z.string().optional(),
  registrationNo: z.string().optional(),
  notes: z.string().optional(),
});

export default async function doctorRoutes(fastify: FastifyInstance) {
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const { search, page = "1", limit = "50" } = request.query as { search?: string; page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conds = [eq(doctors.isActive, true)];
    if (search) {
      const pat = searchPattern(search);
      conds.push(or(
        sql`fold(${doctors.name}) LIKE ${pat}`,
        sql`fold(${doctors.phone}) LIKE ${pat}`,
        sql`fold(${doctors.clinicName}) LIKE ${pat}`,
        sql`fold(${doctors.specialization}) LIKE ${pat}`,
        sql`fold(${doctors.registrationNo}) LIKE ${pat}`
      )!);
    }

    const results = await db.select().from(doctors).where(and(...conds)).orderBy(asc(doctors.name)).limit(limitNum).offset(offset);
    return reply.send({ success: true, data: results, pagination: { page: pageNum, limit: limitNum } });
  });

  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [doctor] = await db.select().from(doctors).where(and(eq(doctors.id, id), eq(doctors.isActive, true))).limit(1);
    if (!doctor) return reply.status(404).send({ success: false, error: "Doctor not found" });
    return reply.send({ success: true, data: doctor });
  });

  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createDoctorSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const now = new Date();
    const [doctor] = await db.insert(doctors).values({
      ...parsed.data,
      createdBy: request.userId!,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return reply.status(201).send({ success: true, data: doctor });
  });

  fastify.put("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createDoctorSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });

    const [existing] = await db.select().from(doctors).where(and(eq(doctors.id, id), eq(doctors.isActive, true))).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Doctor not found" });

    const [updated] = await db.update(doctors).set({ ...parsed.data, updatedAt: new Date() }).where(eq(doctors.id, id)).returning();
    return reply.send({ success: true, data: updated });
  });

  // Soft-delete doctor
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await db.select().from(doctors).where(and(eq(doctors.id, id), eq(doctors.isActive, true), eq(doctors.createdBy, request.userId!))).limit(1);
    if (!existing) return reply.status(404).send({ success: false, error: "Doctor not found" });

    await db.update(doctors).set({ isActive: false, updatedAt: new Date() }).where(eq(doctors.id, id));
    return reply.send({ success: true, data: { message: "Doctor removed" } });
  });
}
