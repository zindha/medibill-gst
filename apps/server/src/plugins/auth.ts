import { FastifyRequest, FastifyReply } from "fastify";
import { validateSession } from "../lib/auth.js";
import { db } from "../db/index.js";
import { userDevices } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    sessionToken?: string;
  }
  // `cookies` (FastifyRequest) and `setCookie`/`clearCookie` (FastifyReply) are
  // intentionally NOT declared here — @fastify/cookie v11 already augments
  // `fastify` with them, and @fastify/static owns `sendFile`. Re-declaring them
  // causes TS2687/TS2717/TS2300 (duplicate/conflicting declarations).
}

/**
 * Task 15 — optional device-token check shared by authGuard and requireRole.
 *
 * Reads the `X-Device-Token` header (set by the client from localStorage after
 * POST /api/devices/register). Semantics:
 *   - no header            → null (unchanged behaviour; every existing test and
 *                            cookie-only client keeps working)
 *   - unknown token        → 401 "Device token mismatch"
 *   - token of other user  → 401 "Device token mismatch" (session/device mismatch)
 *   - revoked device       → 401 "This device has been revoked"
 *   - valid                → null, plus a fire-and-forget lastSeenAt heartbeat
 *
 * Returns `{ status, error }` when the request must be rejected, `null` otherwise.
 */
export async function checkDeviceToken(
  request: FastifyRequest,
  userId: string
): Promise<{ status: number; error: string } | null> {
  const raw = request.headers["x-device-token"];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) return null;

  try {
    const device = await db.query.userDevices.findFirst({
      where: eq(userDevices.deviceToken, token),
    });
    if (!device) return { status: 401, error: "Device token mismatch" };
    if (device.userId !== userId) return { status: 401, error: "Device token mismatch" };
    if (device.revoked) return { status: 401, error: "This device has been revoked" };

    // Heartbeat — best effort, never blocks or fails the request.
    await db
      .update(userDevices)
      .set({ lastSeenAt: new Date() })
      .where(eq(userDevices.id, device.id));
  } catch {
    // A failing heartbeat must not take the API down; treat lookup failure as
    // "no opinion" and let the session guard decide.
    return null;
  }
  return null;
}

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const cookieToken = request.cookies?.session_token;
  const headerToken = request.headers.authorization?.replace("Bearer ", "");

  const token = cookieToken ?? headerToken;

  if (!token) {
    return reply.status(401).send({
      success: false,
      error: "Authentication required",
    });
  }

  const result = await validateSession(token);

  if (!result) {
    // Clear invalid cookie
    reply.clearCookie("session_token");
    return reply.status(401).send({
      success: false,
      error: "Session expired or invalid",
    });
  }

  const deviceError = await checkDeviceToken(request, result.user.id);
  if (deviceError) {
    return reply.status(deviceError.status).send({
      success: false,
      error: deviceError.error,
    });
  }

  request.userId = result.user.id;
  request.sessionToken = token;
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const cookieToken = request.cookies?.session_token;
    const headerToken = request.headers.authorization?.replace("Bearer ", "");

    const token = cookieToken ?? headerToken;
    if (!token) {
      return reply.status(401).send({
        success: false,
        error: "Authentication required",
      });
    }

    const result = await validateSession(token);
    if (!result) {
      reply.clearCookie("session_token");
      return reply.status(401).send({
        success: false,
        error: "Session expired or invalid",
      });
    }

    // Device revocation is a kill-switch: it outranks the role check so a
    // revoked device gets 401 (not 403) on every guarded route.
    const deviceError = await checkDeviceToken(request, result.user.id);
    if (deviceError) {
      return reply.status(deviceError.status).send({
        success: false,
        error: deviceError.error,
      });
    }

    if (!roles.includes(result.user.role ?? "")) {
      return reply.status(403).send({
        success: false,
        error: "Insufficient permissions",
      });
    }

    request.userId = result.user.id;
    request.sessionToken = token;
  };
}
