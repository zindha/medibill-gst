import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { settings } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId } from "../db/schema/index.js";

async function getSetting(key: string): Promise<any> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

async function setSetting(key: string, value: any): Promise<void> {
  const now = new Date();
  const [existing] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const valueStr = typeof value === "string" ? value : JSON.stringify(value);

  if (existing) {
    await db.update(settings).set({ value: valueStr, updatedAt: now }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ id: generateId(), key, value: valueStr, updatedAt: now });
  }
}

export default async function settingsRoutes(fastify: FastifyInstance) {
  // Get all settings
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const allSettings = await db.select().from(settings);
    const settingsObj: Record<string, any> = {};
    for (const s of allSettings) {
      try { settingsObj[s.key] = JSON.parse(s.value); } catch { settingsObj[s.key] = s.value; }
    }
    return reply.send({ success: true, data: settingsObj });
  });

  // Get specific setting
  fastify.get("/:key", { preHandler: [authGuard] }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const value = await getSetting(key);
    return reply.send({ success: true, data: { key, value } });
  });

  // Update setting
  fastify.put("/:key", { preHandler: [authGuard] }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const { value } = request.body as { value: any };
    await setSetting(key, value);
    return reply.send({ success: true, data: { key, value } });
  });

  // Invoice format
  fastify.get("/invoice-format", { preHandler: [authGuard] }, async (request, reply) => {
    const format = await getSetting("invoiceFormat");
    return reply.send({ success: true, data: format ?? { prefix: "MB", pattern: "MB-YYYY-NNNNNN" } });
  });

  fastify.put("/invoice-format", { preHandler: [authGuard] }, async (request, reply) => {
    const { format } = request.body as { format: any };
    await setSetting("invoiceFormat", format);
    return reply.send({ success: true, data: { format } });
  });
}
