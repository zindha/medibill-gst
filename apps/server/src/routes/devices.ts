import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authGuard, requireRole } from "../plugins/auth.js";
import { getUserRole } from "../services/expiryPolicy.js";
import { deleteSession } from "../lib/auth.js";
import { db } from "../db/index.js";
import { sessions, userDevices } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { auditEvents } from "../services/audit.js";
import {
  activityFeed,
  capabilitiesFor,
  listDevices,
  listSessions,
  registerDevice,
  setDeviceRevoked,
} from "../services/devices.js";

/**
 * Task 15 — device registry + remote monitoring at `/api/devices`.
 *
 * Guards:
 *  - `authGuard`            → register / list / capabilities (any role)
 *  - `requireRole("admin")` → revoke / restore / sessions / activity.
 *    requireRole also runs the X-Device-Token revocation check, so a revoked
 *    device receives 401 before the role 403.
 *  - Device tokens are returned ONLY by POST /register; every list/monitoring
 *    shape is built without the token column.
 */

const registerSchema = z.object({
  deviceName: z.string().min(1).max(120),
  platform: z.string().min(1).max(40),
  appVersion: z.string().min(1).max(40),
});

export default async function deviceRoutes(fastify: FastifyInstance) {
  // Register this client (any authenticated user). Returns the device token
  // the client persists; called once per login session.
  fastify.post("/register", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const device = await registerDevice(request.userId!, parsed.data);
    return reply.status(201).send({ success: true, data: device });
  });

  // List devices — admin sees every user's devices (single-install monitoring),
  // everyone else sees their own. The token column is never selected.
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const role = await getUserRole(request.userId!);
    const devices = await listDevices({ all: role === "admin", userId: request.userId! });
    return reply.send({ success: true, data: devices });
  });

  // Revoke a device (admin). The token keeps failing authGuard/requireRole
  // with 401 "This device has been revoked".
  fastify.post("/:id/revoke", { preHandler: [requireRole("admin")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.query.userDevices.findFirst({ where: eq(userDevices.id, id) });
    if (!existing) return reply.status(404).send({ success: false, error: "Device not found" });
    const device = await setDeviceRevoked(id, true);
    await auditEvents.record({
      actorId: request.userId!,
      action: "device.revoked",
      entity: "device",
      entityId: id,
      metadata: { owner: existing.userId },
    });
    return reply.send({ success: true, data: device });
  });

  // Restore a previously revoked device (admin).
  fastify.post("/:id/restore", { preHandler: [requireRole("admin")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.query.userDevices.findFirst({ where: eq(userDevices.id, id) });
    if (!existing) return reply.status(404).send({ success: false, error: "Device not found" });
    const device = await setDeviceRevoked(id, false);
    await auditEvents.record({
      actorId: request.userId!,
      action: "device.restored",
      entity: "device",
      entityId: id,
      metadata: { owner: existing.userId },
    });
    return reply.send({ success: true, data: device });
  });

  // Remote session management (admin): every active session on this install.
  fastify.get("/sessions", { preHandler: [requireRole("admin")] }, async (_request, reply) => {
    const rows = await listSessions();
    return reply.send({ success: true, data: rows });
  });

  // Revoke one session by sessions.id (admin). The row's `token` value is what
  // deleteSession() removes, so the Bearer/cookie using it dies immediately.
  fastify.post(
    "/sessions/:tokenId/revoke",
    { preHandler: [requireRole("admin")] },
    async (request, reply) => {
      const { tokenId } = request.params as { tokenId: string };
      const row = await db.query.sessions.findFirst({ where: eq(sessions.id, tokenId) });
      if (!row) return reply.status(404).send({ success: false, error: "Session not found" });
      await deleteSession(row.token);
      await auditEvents.record({
        actorId: request.userId!,
        action: "session.revoked",
        entity: "session",
        entityId: tokenId,
        metadata: { owner: row.userId },
      });
      return reply.send({ success: true, data: { id: tokenId, revoked: true } });
    }
  );

  // Remote activity feed (admin): last 50 audit events + registry counters.
  fastify.get("/activity", { preHandler: [requireRole("admin")] }, async (_request, reply) => {
    const data = await activityFeed();
    return reply.send({ success: true, data });
  });

  // Staff permissions — the capability set the UI uses to hide nav items.
  // GET /api/devices/me (documented in API.md "Devices, Sync & Permissions").
  fastify.get("/me", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const role = await getUserRole(request.userId!);
    return reply.send({
      success: true,
      data: {
        userId: request.userId!,
        role,
        capabilities: capabilitiesFor(role),
      },
    });
  });
}
