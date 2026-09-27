import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authenticateUser, createSession, deleteSession, createUser } from "../lib/auth.js";
import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId } from "../db/schema/index.js";

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or phone is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post("/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "Validation error",
        details: parsed.error.flatten(),
      });
    }

    const { identifier, password } = parsed.data;

    const user = await authenticateUser(identifier, password);
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: "Invalid credentials",
      });
    }

    const session = await createSession(
      user.id,
      request.ip,
      request.headers["user-agent"]
    );

    // Set session cookie (httpOnly, sameSite strict)
    reply.setCookie("session_token", session.token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return reply.send({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        token: session.token,
      },
    });
  });

  // Register (for creating the first admin user)
  fastify.post("/register", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "Validation error",
        details: parsed.error.flatten(),
      });
    }

    const { name, email, phone, password } = parsed.data;

    // Check if any users exist
    const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
    if (existingUsers.length > 0) {
      return reply.status(403).send({
        success: false,
        error: "Registration is disabled. Users already exist.",
      });
    }

    // Check for duplicate email/phone
    if (email) {
      const existing = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: "Email already registered",
        });
      }
    }

    if (phone) {
      const existing = await db.query.users.findFirst({
        where: eq(users.phone, phone),
      });
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: "Phone already registered",
        });
      }
    }

    const user = await createUser({
      name,
      email,
      phone,
      password,
      role: "admin",
    });

    const session = await createSession(
      user.id,
      request.ip,
      request.headers["user-agent"]
    );

    reply.setCookie("session_token", session.token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.status(201).send({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        token: session.token,
      },
    });
  });

  // Get current user
  fastify.get(
    "/me",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, request.userId!),
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: "User not found",
        });
      }

      return reply.send({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    }
  );

  // Logout
  fastify.post(
    "/logout",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.cookies?.session_token;
      if (token) {
        await deleteSession(token);
      }

      reply.clearCookie("session_token", { path: "/" });

      return reply.send({
        success: true,
        data: { message: "Logged out successfully" },
      });
    }
  );

  // Change password
  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  });

  fastify.post(
    "/change-password",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "Validation error",
          details: parsed.error.flatten(),
        });
      }

      const { verifyPassword, hashPassword } = await import("../lib/auth.js");

      const user = await db.query.users.findFirst({
        where: eq(users.id, request.userId!),
      });

      if (!user || !user.passwordHash) {
        return reply.status(404).send({
          success: false,
          error: "User not found",
        });
      }

      const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({
          success: false,
          error: "Current password is incorrect",
        });
      }

      const newHash = await hashPassword(parsed.data.newPassword);

      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, request.userId!));

      return reply.send({
        success: true,
        data: { message: "Password changed successfully" },
      });
    }
  );
}
