import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import { getUserRole } from "../services/expiryPolicy.js";
import {
  PROVIDERS,
  IntegrationError,
  connect,
  disconnect,
  health,
  listHealth,
  readRecord,
} from "../services/integrations.js";

/**
 * Integrations Center routes (Task 17) at `/api/integrations`.
 *
 * Guards: `authGuard` on every route; connect/disconnect additionally require
 * admin | pharmacist (cashier → 403). GET returns health + NON-secret config
 * only — every stored secret is redacted to `•••` and NEVER decrypted in a
 * response (decryption happens server-side for adapters only).
 */

const connectSchema = z.object({
  config: z.record(z.unknown()).optional(),
  secrets: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

async function requireManager(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const role = await getUserRole(request.userId!);
  if (role !== "admin" && role !== "pharmacist") {
    reply.status(403).send({ success: false, error: "Insufficient permissions" });
    return false;
  }
  return true;
}

/** Replace every stored `enc:v1:` value with a bullet mask. */
function redactSecrets(record: { secrets: Record<string, string> }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(record.secrets)) out[key] = "•••";
  return out;
}

export default async function integrationRoutes(fastify: FastifyInstance) {
  const sendError = (reply: FastifyReply, err: unknown) => {
    if (err instanceof IntegrationError) {
      return reply.status(err.statusCode).send({ success: false, error: err.message });
    }
    const message = err instanceof Error ? err.message : String(err);
    return reply.status(500).send({ success: false, error: message });
  };

  // Registry + health for every provider + aggregate summary.
  fastify.get("/", { preHandler: [authGuard] }, async (_request, reply) => {
    try {
      const data = await listHealth();
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // One provider: health + saved config (secrets redacted to •••).
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const base = await health(id);
      const record = await readRecord(id);
      return reply.send({
        success: true,
        data: {
          ...base,
          config: record?.config ?? {},
          secrets: record ? redactSecrets(record) : {},
          updatedBy: record?.updatedBy ?? null,
        },
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Connect / update (admin | pharmacist).
  fastify.post("/:id/connect", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManager(request, reply))) return;
    const { id } = request.params as { id: string };
    const parsed = connectSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      await connect(id, request.userId!, parsed.data);
      const data = await health(id);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Disconnect (admin | pharmacist) — wipes config + secrets.
  fastify.post("/:id/disconnect", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManager(request, reply))) return;
    const { id } = request.params as { id: string };
    try {
      await disconnect(id, request.userId!);
      const data = await health(id);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Registry metadata (field shapes for dynamic forms) — no state, no secrets.
  fastify.get("/registry", { preHandler: [authGuard] }, async (_request, reply) => {
    return reply.send({ success: true, data: { providers: PROVIDERS } });
  });
}
