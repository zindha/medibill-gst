import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { catalogOverrides } from "../db/schema/index.js";
import { eq, and, asc } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";

const GST_RATES = ["0", "5", "12", "18", "28"] as const;

const setUnavailableSchema = z.object({
  catalogKey: z.string().min(1),
  medicineName: z.string().min(1),
  company: z.string().optional(),
  unavailable: z.boolean(),
});

const saveGstSchema = z.object({
  catalogKey: z.string().min(1),
  medicineName: z.string().min(1),
  company: z.string().optional(),
  gstRate: z.enum(GST_RATES),
  hsnCode: z.string().optional(),
});

export default async function catalogOverrideRoutes(fastify: FastifyInstance) {
  // List all overrides for the current user
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const rows = await db
      .select()
      .from(catalogOverrides)
      .where(eq(catalogOverrides.createdBy, request.userId!))
      .orderBy(asc(catalogOverrides.medicineName));
    return reply.send({ success: true, data: rows });
  });

  // Flag a catalog entry as unavailable (or available) in the user's region
  fastify.post(
    "/unavailable",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = setUnavailableSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }
      const data = parsed.data;
      const now = new Date();

      const [existing] = await db
        .select()
        .from(catalogOverrides)
        .where(and(eq(catalogOverrides.createdBy, request.userId!), eq(catalogOverrides.catalogKey, data.catalogKey)))
        .limit(1);

      if (existing) {
        if (
          !data.unavailable &&
          existing.gstRate === null &&
          existing.hsnCode === null
        ) {
          // Nothing left to override — clean up the row
          await db.delete(catalogOverrides).where(eq(catalogOverrides.id, existing.id));
          return reply.send({ success: true, data: { removed: true } });
        }
        await db
          .update(catalogOverrides)
          .set({ unavailable: data.unavailable, updatedAt: now })
          .where(eq(catalogOverrides.id, existing.id));
      } else if (data.unavailable) {
        await db.insert(catalogOverrides).values({
          catalogKey: data.catalogKey,
          medicineName: data.medicineName,
          company: data.company,
          unavailable: true,
          createdBy: request.userId!,
          createdAt: now,
          updatedAt: now,
        });
      }
      return reply.send({ success: true, data: { removed: false } });
    }
  );

  // Save a verified GST rate (and optional HSN) for a catalog entry
  fastify.post(
    "/gst",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = saveGstSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }
      const data = parsed.data;
      const now = new Date();

      const [existing] = await db
        .select()
        .from(catalogOverrides)
        .where(and(eq(catalogOverrides.createdBy, request.userId!), eq(catalogOverrides.catalogKey, data.catalogKey)))
        .limit(1);

      if (existing) {
        await db
          .update(catalogOverrides)
          .set({
            gstRate: data.gstRate,
            hsnCode: data.hsnCode || undefined,
            verified: true,
            updatedAt: now,
          })
          .where(eq(catalogOverrides.id, existing.id));
      } else {
        await db.insert(catalogOverrides).values({
          catalogKey: data.catalogKey,
          medicineName: data.medicineName,
          company: data.company,
          gstRate: data.gstRate,
          hsnCode: data.hsnCode || undefined,
          verified: true,
          createdBy: request.userId!,
          createdAt: now,
          updatedAt: now,
        });
      }
      return reply.send({ success: true, data: { saved: true } });
    }
  );

  // Remove all overrides for a catalog entry
  fastify.delete(
    "/:catalogKey",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { catalogKey } = request.params as { catalogKey: string };
      await db
        .delete(catalogOverrides)
        .where(and(eq(catalogOverrides.createdBy, request.userId!), eq(catalogOverrides.catalogKey, catalogKey)));
      return reply.send({ success: true, data: { removed: true } });
    }
  );
}
