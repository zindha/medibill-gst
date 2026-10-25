/**
 * Staff & Access — the roster of one store at `/api/staff`.
 *
 * Every route is admin-only: the roster exposes roles, e-mail, phone and
 * device/session counts, so it is an admin surface (a pharmacist/cashier
 * gets 403 "Insufficient permissions" from `requireRole`).
 *
 * Store scoping: the caller's store is the store they are a member of
 * (`store_members`), else the store they own (`stores.owner_id`). The app has
 * no "create store" route, so the first write provisions the store and the
 * caller's own admin membership row.
 *
 * The membership role/status is mirrored onto the user row (`users.role`,
 * `users.is_active`) because route guards and login read the user row and not
 * `store_members` — without the mirror a demotion would have no effect.
 */
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import {
  MEMBER_STATUS,
  ROLES,
  generateId,
  storeMembers,
  stores,
  users,
  type MemberStatus,
  type Role,
} from "../db/schema/index.js";
import { requireRole } from "../plugins/auth.js";
import { createUser, deleteAllUserSessions, hashPassword } from "../lib/auth.js";
import { auditEvents } from "../services/audit.js";

const ROLE_VALUES = [ROLES.ADMIN, ROLES.PHARMACIST, ROLES.CASHIER] as const;

// ponytail: MEMBER_STATUS has no "revoked" member but the staff UI needs a
// terminal state; the column is plain TEXT without a CHECK constraint, so
// "revoked" is accepted here as a runtime extension. Upgrade path: add
// REVOKED to MEMBER_STATUS in apps/server/src/db/schema/index.ts.
const STATUS_VALUES = [
  MEMBER_STATUS.PENDING,
  MEMBER_STATUS.ACTIVE,
  MEMBER_STATUS.INACTIVE,
  "revoked",
] as const;

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email("A valid email is required"),
  phone: z.string().min(1, "Phone is required").max(20).optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(ROLE_VALUES),
});

const updateSchema = z.object({
  role: z.enum(ROLE_VALUES).optional(),
  status: z.enum(STATUS_VALUES).optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

const idParamSchema = z.object({ id: z.string().min(1) });

/** Roster columns shared by the member query and the synthesised owner row. */
const memberFields = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  isActive: users.isActive,
  createdAt: users.createdAt,
  deviceCount: sql<number>`(SELECT COUNT(*) FROM user_devices d WHERE d.user_id = ${users.id})`,
  sessionCount: sql<number>`(SELECT COUNT(*) FROM sessions s WHERE s.user_id = ${users.id})`,
};

interface CallerStore {
  storeId: string;
  membershipId: string | null;
}

interface RosterRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
  isActive: boolean | null;
  createdAt: Date;
  deviceCount: number;
  sessionCount: number;
}

function toItem(row: RosterRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role ?? ROLES.CASHIER,
    status: row.status ?? MEMBER_STATUS.INACTIVE,
    isActive: Boolean(row.isActive),
    createdAt: new Date(row.createdAt).toISOString(),
    deviceCount: Number(row.deviceCount),
    sessionCount: Number(row.sessionCount),
  };
}

/** The caller's store: membership first, then ownership. */
async function resolveCallerStore(userId: string): Promise<CallerStore | null> {
  const memberships = await db
    .select({ id: storeMembers.id, storeId: storeMembers.storeId, status: storeMembers.status })
    .from(storeMembers)
    .where(eq(storeMembers.userId, userId))
    .orderBy(asc(storeMembers.createdAt));

  const membership =
    memberships.find((m) => m.status === MEMBER_STATUS.ACTIVE) ?? memberships[0];
  if (membership) {
    return { storeId: membership.storeId, membershipId: membership.id };
  }

  const [owned] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, userId))
    .limit(1);
  return owned ? { storeId: owned.id, membershipId: null } : null;
}

/**
 * Store + membership for the caller, provisioned on first use because the app
 * exposes no store-creation route. The caller's global role becomes the
 * membership role (every caller of this router is an admin).
 */
async function ensureCallerStore(userId: string): Promise<CallerStore> {
  const resolved = await resolveCallerStore(userId);
  if (resolved?.membershipId) return resolved;

  const [caller] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const role = (caller?.role ?? ROLES.ADMIN) as Role;

  const now = new Date();
  let storeId = resolved?.storeId;
  if (!storeId) {
    const [store] = await db
      .insert(stores)
      .values({
        id: generateId(),
        name: "My Pharmacy",
        ownerId: userId,
        joinCode: nanoid(6),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    storeId = store.id;
  }

  const [membership] = await db
    .insert(storeMembers)
    .values({
      id: generateId(),
      storeId,
      userId,
      role,
      status: MEMBER_STATUS.ACTIVE,
      createdAt: now,
    })
    .returning();

  return { storeId, membershipId: membership.id };
}

async function membershipInStore(storeId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(storeMembers)
    .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)))
    .limit(1);
  return membership ?? null;
}

export default async function staffRoutes(fastify: FastifyInstance) {
  // GET /api/staff — the roster of the caller's store.
  fastify.get("/", { preHandler: [requireRole("admin")] }, async (request, reply) => {
    const callerId = request.userId!;
    const store = await ensureCallerStore(callerId);

    const rows = await db
      .select({ ...memberFields, role: storeMembers.role, status: storeMembers.status })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .where(eq(storeMembers.storeId, store.storeId))
      .orderBy(
        sql`CASE ${storeMembers.role} WHEN ${ROLES.ADMIN} THEN 0 WHEN ${ROLES.PHARMACIST} THEN 1 ELSE 2 END`,
        asc(users.name),
      );

    // The caller's own membership row is part of the roster.
    return reply.send({ success: true, items: rows.map(toItem) });
  });

  // POST /api/staff — invite a new member of the caller's store.
  fastify.post("/", { preHandler: [requireRole("admin")] }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const { name, email, phone, password, role } = parsed.data;
    const callerId = request.userId!;

    const store = await ensureCallerStore(callerId);

    // E-mail/phone must stay unique: login resolves them globally.
    const clashConditions = [eq(users.email, email)];
    if (phone) clashConditions.push(eq(users.phone, phone));
    const [clash] = await db
      .select({ id: users.id, email: users.email, phone: users.phone })
      .from(users)
      .where(or(...clashConditions))
      .limit(1);

    if (clash) {
      const isEmail = clash.email === email;
      const inStore = (await membershipInStore(store.storeId, clash.id)) !== null;
      const error = isEmail
        ? inStore
          ? "Email already exists in this store"
          : "Email already registered"
        : inStore
          ? "Phone already exists in this store"
          : "Phone already registered";
      return reply.status(409).send({ success: false, error });
    }

    const user = await createUser({ name, email, phone, password, role });
    await db.insert(storeMembers).values({
      id: generateId(),
      storeId: store.storeId,
      userId: user.id,
      role,
      status: MEMBER_STATUS.ACTIVE,
      createdAt: new Date(),
    });

    await auditEvents.record({
      actorId: callerId,
      action: "staff.created",
      entity: "staff",
      entityId: user.id,
      metadata: { storeId: store.storeId, role },
    });

    return reply.status(201).send({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        createdAt: new Date(user.createdAt).toISOString(),
      },
    });
  });

  // PATCH /api/staff/:id — change a member's role or status.
  fastify.patch("/:id", { preHandler: [requireRole("admin")] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: params.error.flatten() });
    }
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }

    const callerId = request.userId!;
    const store = await resolveCallerStore(callerId);
    if (!store) {
      return reply.status(404).send({ success: false, error: "Store not found" });
    }

    const membership = await membershipInStore(store.storeId, params.data.id);
    if (!membership) {
      return reply.status(404).send({ success: false, error: "Staff member not found" });
    }

    const nextRole = parsed.data.role ?? membership.role;
    const nextStatus = parsed.data.status ?? membership.status;

    const dropsAdmin =
      membership.role === ROLES.ADMIN &&
      membership.status === MEMBER_STATUS.ACTIVE &&
      (nextRole !== ROLES.ADMIN || nextStatus !== MEMBER_STATUS.ACTIVE);

    if (dropsAdmin) {
      const [countRow] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(storeMembers)
        .where(
          and(
            eq(storeMembers.storeId, store.storeId),
            eq(storeMembers.role, ROLES.ADMIN),
            eq(storeMembers.status, MEMBER_STATUS.ACTIVE),
          ),
        );
      if (Number(countRow.total) <= 1) {
        return reply.status(400).send({
          success: false,
          error: "Cannot demote or deactivate the last active admin of this store",
        });
      }
    }

    await db
      .update(storeMembers)
      .set({ role: nextRole, status: nextStatus as MemberStatus })
      .where(eq(storeMembers.id, membership.id));

    // Keep the user row in sync — route guards and login read it.
    await db
      .update(users)
      .set({
        role: nextRole,
        isActive: nextStatus === MEMBER_STATUS.ACTIVE,
        updatedAt: new Date(),
      })
      .where(eq(users.id, membership.userId));

    await auditEvents.record({
      actorId: callerId,
      action: "staff.updated",
      entity: "staff",
      entityId: membership.userId,
      metadata: { storeId: store.storeId, role: nextRole, status: nextStatus },
    });

    const [updated] = await db
      .select({ ...memberFields, role: storeMembers.role, status: storeMembers.status })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .where(eq(storeMembers.id, membership.id))
      .limit(1);

    return reply.send({ success: true, member: toItem(updated) });
  });

  // POST /api/staff/:id/reset-password — force a new password, log out
  // every device of that user.
  fastify.post(
    "/:id/reset-password",
    { preHandler: [requireRole("admin")] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply
          .status(400)
          .send({ success: false, error: "Validation error", details: params.error.flatten() });
      }
      const parsed = resetPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }

      const callerId = request.userId!;
      const store = await resolveCallerStore(callerId);
      if (!store) {
        return reply.status(404).send({ success: false, error: "Store not found" });
      }

      const membership = await membershipInStore(store.storeId, params.data.id);
      if (!membership) {
        return reply.status(404).send({ success: false, error: "Staff member not found" });
      }

      const passwordHash = await hashPassword(parsed.data.newPassword);
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, membership.userId));
      await deleteAllUserSessions(membership.userId);

      await auditEvents.record({
        actorId: callerId,
        action: "staff.password_reset",
        entity: "staff",
        entityId: membership.userId,
        metadata: { storeId: store.storeId },
      });

      return reply.send({ success: true, ok: true });
    },
  );
}
