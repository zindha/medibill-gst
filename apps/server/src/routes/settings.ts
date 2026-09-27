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
  // Get all settings.
  // The settings table has no tenant column — an install-wide singleton by
  // design (invoice format, store name, templates, integrations config), so
  // these reads are intentionally NOT tenant-scoped.
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
  //
  // `message_templates` (documented in API.md) uses per-key MERGE semantics
  // so saving one template can never clobber the others: the payload is a
  // partial `{ "<template>": "<body>" }` object merged into the stored JSON.
  // A `null` / `""` value REMOVES that key's override (reset to the built-in
  // default). Every other key keeps the plain replace behaviour.
  fastify.put("/:key", { preHandler: [authGuard] }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const { value } = (request.body ?? {}) as { value: any };
    if (value === undefined) {
      return reply.status(400).send({ success: false, error: "value is required" });
    }
    if (key === "message_templates" && value && typeof value === "object" && !Array.isArray(value)) {
      const current = await getSetting(key);
      const merged: Record<string, unknown> =
        current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === null || v === undefined || v === "") delete merged[k];
        else merged[k] = v;
      }
      await setSetting(key, merged);
      return reply.send({ success: true, data: { key, value: merged } });
    }
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
