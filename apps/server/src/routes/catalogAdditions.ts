import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { catalogAdditions } from "../db/schema/index.js";
import { and, asc, eq } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";

const GST_RATES = ["0", "5", "12", "18", "28"] as const;

const GST_BY_TEXT: Record<string, "0" | "5" | "12" | "18" | "28"> = {
  "0": "0",
  "5": "5",
  "12": "12",
  "18": "18",
  "28": "28",
};

// A single addition as normalized by the client's CSV parser.
const additionSchema = z.object({
  catalogKey: z.string().min(1),
  name: z.string().min(1),
  company: z.string().optional(),
  composition: z.string().optional(),
  form: z.string().optional(),
  unit: z.string().optional(),
  packSize: z.string().optional(),
  price: z.number().min(0).default(0),
  gstRate: z.coerce.number().min(0).max(28).default(5),
});

const importSchema = z.object({
  additions: z.array(additionSchema).max(5000),
});

export default async function catalogAdditionsRoutes(fastify: FastifyInstance) {
  // List the current user's additions, newest first.
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const rows = await db
      .select()
      .from(catalogAdditions)
      .where(eq(catalogAdditions.createdBy, request.userId!))
      .orderBy(asc(catalogAdditions.medicineName));
    return reply.send({ success: true, data: rows });
  });

  // Bulk-import user-supplied additions (deduped against what they've already added).
  fastify.post(
    "/import",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = importSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "Validation error",
          details: parsed.error.flatten(),
        });
      }

      const userId = request.userId!;
      const existing = await db
        .select({ flag: catalogAdditions.catalogKey })
        .from(catalogAdditions)
        .where(eq(catalogAdditions.createdBy, userId));
      const existingKeys = new Set(existing.map((r) => r.flag));

      const now = new Date();
      const added: typeof catalogAdditions.$inferSelect[] = [];
      let duplicates = 0;

      for (const item of parsed.data.additions) {
        const key = item.catalogKey.trim().toLowerCase();
        if (existingKeys.has(key)) {
          duplicates++;
          continue;
        }
        existingKeys.add(key);
        const gstNum = Math.round(item.gstRate);
        const gst = (GST_BY_TEXT[String(gstNum)] ?? "5") as "0" | "5" | "12" | "18" | "28";

        const [row] = await db
          .insert(catalogAdditions)
          .values({
            catalogKey: key,
            medicineName: item.name,
            company: item.company,
            composition: item.composition,
            form: item.form,
            unit: item.unit,
            packSize: item.packSize,
            price: item.price,
            gstRate: gst,
            createdBy: userId,
            createdAt: now,
          })
          .returning();
        if (row) added.push(row);
      }

      return reply.send({
        success: true,
        data: { added, count: added.length, duplicates },
      });
    }
  );
  // Remove a single addition owned by the user.
  fastify.delete(
    "/:id",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const [exists] = await db
        .select({ id: catalogAdditions.id })
        .from(catalogAdditions)
        .where(
          and(
            eq(catalogAdditions.id, id),
            eq(catalogAdditions.createdBy, request.userId!)
          )
        )
        .limit(1);
      if (!exists) {
        return reply.status(404).send({ success: false, error: "Addition not found" });
      }
      await db.delete(catalogAdditions).where(eq(catalogAdditions.id, id));
      return reply.send({ success: true, data: { removed: true } });
    }
  );
}