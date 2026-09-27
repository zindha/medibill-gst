import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import {
  getPolicy,
  setPolicy,
  evaluate,
  getUserRole,
  type ExpiryOperation,
} from "../services/expiryPolicy.js";

const policySchema = z.object({
  blockExpiredSale: z.boolean(),
  blockExpiredPurchase: z.boolean(),
  warningDays: z.number().int().min(0).max(3650),
  blockWithinDays: z.number().int().min(0).max(3650),
  allowOverrideRoles: z.array(z.enum(["admin", "pharmacist", "cashier"])),
});

const evaluateSchema = z.object({
  expiryDate: z.string().min(1),
  operation: z.enum(["sale", "purchase", "batch_edit"]),
});

export default async function expiryPolicyRoutes(fastify: FastifyInstance) {
  // Get the install-wide expiry safety policy (merged over defaults).
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const policy = await getPolicy(request.userId!);
    return reply.send({ success: true, data: { policy } });
  });

  // Update (upsert) the policy. Singleton settings key — one policy per install.
  fastify.put("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = policySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const policy = await setPolicy(parsed.data);
    return reply.send({ success: true, data: { policy } });
  });

  // Evaluate one expiry date with the caller's role — UI pre-checks.
  fastify.post("/evaluate", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = evaluateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const userRole = await getUserRole(request.userId!);
    const policy = await getPolicy(request.userId!);
    const result = evaluate({
      expiryDate: parsed.data.expiryDate,
      operation: parsed.data.operation as ExpiryOperation,
      userRole,
      policy,
    });
    return reply.send({ success: true, data: result });
  });
}
