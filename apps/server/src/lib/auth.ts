import { db } from "../db/index.js";
import { users, sessions } from "../db/schema/index.js";
import { eq, or, and, gt, sql } from "drizzle-orm";
import argon2 from "argon2";
import { nanoid } from "nanoid";
import type { User, Session } from "../db/schema/index.js";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hashedPassword, password);
  } catch {
    return false;
  }
}

export function generateToken(): string {
  return nanoid(32);
}

export async function createUser(data: {
  email?: string;
  phone?: string;
  name: string;
  password: string;
  role?: string;
}): Promise<User> {
  const passwordHash = await hashPassword(data.password);
  const now = new Date();

  const [user] = await db.insert(users).values({
    email: data.email,
    phone: data.phone,
    name: data.name,
    passwordHash,
    role: (data.role ?? "cashier") as any,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return user;
}

export async function authenticateUser(identifier: string, password: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: or(eq(users.email, identifier ?? ""), eq(users.phone, identifier ?? "")),
  });

  if (!user || !user.passwordHash) return null;
  if (!user.isActive) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  return user;
}

export async function createSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<Session> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  const token = generateToken();

  const [session] = await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
    ipAddress,
    userAgent,
    createdAt: now,
  }).returning();

  return session;
}

export async function validateSession(token: string): Promise<{ session: Session; user: User } | null> {
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())),
  });

  if (!session) return null;

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user || !user.isActive) return null;

  return { session, user };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function cleanExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(gt(sql`${sessions.expiresAt}`, new Date()));
}
