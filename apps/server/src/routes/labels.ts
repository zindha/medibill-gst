import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import { LabelError, buildLabelData, getTemplates } from "../services/labels.js";

const previewSchema = z.object({
  items: z
    .array(
      z.object({
        medicineId: z.string().min(1),
        batchId: z.string().min(1).optional(),
        quantity: z.number().int().min(1).max(500),
        template: z.string().min(1),
      })
    )
    .min(1),
  includeBatch: z.boolean().optional(),
});

/** Map LabelError to its HTTP reply; rethrow anything else. */
async function guard<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LabelError) {
      await reply
        .status(err.status)
        .send({ success: false, error: err.message, details: err.details });
      return null;
    }
    throw err;
  }
}

export default async function labelRoutes(fastify: FastifyInstance) {
  // Supported label geometries (id, mm dimensions, A4 grid, labels per sheet).
  fastify.get("/templates", { preHandler: [authGuard] }, async (_request, reply) => {
    return reply.send({ success: true, data: getTemplates() });
  });

  // Print-ready label data — pure read, nothing is persisted.
  fastify.post("/preview", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = previewSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const data = await guard(reply, () =>
      buildLabelData(request.userId!, {
        items: parsed.data.items,
        includeBatch: parsed.data.includeBatch,
      })
    );
    if (!data) return undefined;
    return reply.send({ success: true, data });
  });
}
