import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import { MESSAGE_CHANNELS } from "../db/schema/index.js";
import {
  EngagementError,
  cancelCampaign,
  createCampaign,
  createOffer,
  deactivateOffer,
  evaluateOffer,
  getCampaign,
  getCustomerInsights,
  listCampaigns,
  listOffers,
  loyaltyEarn,
  loyaltyLedgerView,
  loyaltyRedeem,
  sendCampaign,
  updateOffer,
} from "../services/customerEngagement.js";

const channelEnum = z.enum(MESSAGE_CHANNELS);

const earnRedeemSchema = z.object({
  customerId: z.string().min(1),
  points: z.number().positive(),
  reason: z.string().optional(),
  invoiceId: z.string().optional(),
  idempotencyKey: z.string().min(1).optional(),
});

const offerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["fixed", "percent"]),
  value: z.number().min(0),
  medicineId: z.string().min(1).nullish(),
  minAmount: z.number().min(0).optional(),
  startsOn: z.string().min(1),
  endsOn: z.string().min(1),
  isActive: z.boolean().optional(),
});

const offerPatchSchema = offerSchema.partial();

const evaluateSchema = z.object({
  subtotal: z.number().min(0),
  medicineIds: z.array(z.string()).optional(),
});

const campaignSchema = z.object({
  name: z.string().min(1),
  channel: channelEnum,
  template: z.string().min(1).optional(),
  body: z.string().optional(),
  audience: z.union([z.string(), z.record(z.unknown())]),
  scheduleAt: z.string().nullish(),
});

/** Map service errors to HTTP; anything else keeps bubbling to the 500 handler. */
function sendError(reply: any, err: unknown) {
  if (err instanceof EngagementError) {
    return reply.status(err.statusCode).send({ success: false, error: err.message });
  }
  const message = err instanceof Error ? err.message : String(err);
  return reply.status(500).send({ success: false, error: message });
}

export default async function customerEngagementRoutes(fastify: FastifyInstance) {
  // ── Insights ────────────────────────────────────────────────────────────
  fastify.get("/insights/:customerId", { preHandler: [authGuard] }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    try {
      const insights = await getCustomerInsights(request.userId!, customerId);
      return reply.send({ success: true, data: insights });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ── Loyalty ─────────────────────────────────────────────────────────────
  fastify.get("/loyalty", { preHandler: [authGuard] }, async (request, reply) => {
    const { customerId } = request.query as { customerId?: string };
    if (!customerId) {
      return reply.status(400).send({ success: false, error: "customerId is required" });
    }
    try {
      const data = await loyaltyLedgerView(request.userId!, customerId);
      return reply.send({ success: true, data });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post("/loyalty/earn", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = earnRedeemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const entry = await loyaltyEarn(request.userId!, parsed.data.customerId, parsed.data);
      return reply.status(201).send({ success: true, data: entry });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post("/loyalty/redeem", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = earnRedeemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const entry = await loyaltyRedeem(request.userId!, parsed.data.customerId, parsed.data);
      return reply.status(201).send({ success: true, data: entry });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ── Offers ──────────────────────────────────────────────────────────────
  fastify.get("/offers", { preHandler: [authGuard] }, async (request, reply) => {
    const { activeOnly, q } = request.query as { activeOnly?: string; q?: string };
    try {
      const rows = await listOffers(request.userId!, {
        activeOnly: activeOnly === "1" || activeOnly === "true",
        q,
      });
      return reply.send({ success: true, data: rows, total: rows.length });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post("/offers", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = offerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const offer = await createOffer(request.userId!, parsed.data);
      return reply.status(201).send({ success: true, data: offer });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.put("/offers/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = offerPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const offer = await updateOffer(request.userId!, id, parsed.data);
      return reply.send({ success: true, data: offer });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Soft delete — also reachable via PUT /offers/:id { isActive: false }.
  fastify.post("/offers/:id/deactivate", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const offer = await deactivateOffer(request.userId!, id);
      return reply.send({ success: true, data: offer });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Bill preview — same evaluation invoice creation performs server-side.
  fastify.post("/offers/:id/evaluate", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = evaluateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const result = await evaluateOffer(
        request.userId!,
        id,
        parsed.data.subtotal,
        parsed.data.medicineIds ?? []
      );
      return reply.send({ success: true, data: result });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ── Campaigns ───────────────────────────────────────────────────────────
  fastify.get("/campaigns", { preHandler: [authGuard] }, async (request, reply) => {
    try {
      const rows = await listCampaigns(request.userId!);
      return reply.send({ success: true, data: rows, total: rows.length });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post("/campaigns", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = campaignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const campaign = await createCampaign(request.userId!, parsed.data);
      return reply.status(201).send({ success: true, data: campaign });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.get("/campaigns/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const campaign = await getCampaign(request.userId!, id);
      return reply.send({ success: true, data: campaign });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post("/campaigns/:id/send", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const stats = await sendCampaign(request.userId!, id);
      return reply.send({ success: true, data: stats });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  fastify.post("/campaigns/:id/cancel", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const campaign = await cancelCampaign(request.userId!, id);
      return reply.send({ success: true, data: campaign });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
