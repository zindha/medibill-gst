import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import {
  pullOperations,
  pushOperations,
  pushSchema,
  syncStatus,
} from "../services/sync.js";

/**
 * Task 15 — sync endpoints at `/api/sync` (authGuard; any authenticated role).
 *
 *  - POST /push  idempotent batch apply (≤100 ops) — see services/sync.ts for
 *    entity scope, version/conflict policy and the force-overwrite rule.
 *  - GET  /pull?cursor=&limit=  cursor feed of the caller's own applied +
 *    conflict operations.
 *  - GET  /status  ops journal size, db size, newest backup, server time.
 *
 * Envelope: `{ success, data }` like the rest of the API — the shapes documented
 * in API.md (`results/applied/...`, `ops/nextCursor/...`) live under `data`.
 */
const pullQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export default async function syncRoutes(fastify: FastifyInstance) {
  fastify.post("/push", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = pushSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const rawToken = request.headers["x-device-token"];
    const deviceToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    const outcome = await pushOperations(request.userId!, parsed.data.operations, deviceToken);
    return reply.send({ success: true, data: outcome });
  });

  fastify.get("/pull", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = pullQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const outcome = await pullOperations(
        request.userId!,
        parsed.data.cursor,
        parsed.data.limit
      );
      return reply.send({ success: true, data: outcome });
    } catch (err: any) {
      if (err?.statusCode === 400) {
        return reply.status(400).send({ success: false, error: err.message });
      }
      throw err;
    }
  });

  fastify.get("/status", { preHandler: [authGuard] }, async (request, reply) => {
    const data = await syncStatus(request.userId!);
    return reply.send({ success: true, data });
  });
}
