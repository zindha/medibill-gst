import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { settings } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { generateId } from "../db/schema/index.js";
import {
  DEFAULT_NUMBERING_FORMATS,
  DOCUMENT_TYPES,
  NUMBERING_SETTING_KEY,
  type DocumentType,
  type NumberingFormat,
  normaliseNumberingFormat,
  readNumberingFormats,
  saveNumberingFormats,
} from "../services/numbering.js";

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

// ── Document numbering formats ────────────────────────────────────────────────
//
// `numberingFormats` holds the prefix / padding / start value / scope of every
// numbered document type. Only the four known document types are accepted;
// an unknown type is a validation error, not a silently ignored key. A type
// may be patched field by field (missing fields keep their current value) and
// `null` resets that type back to its built-in default.
//
//   { invoice: { prefix: "MB", pad: 6, startAt: 1, scope: "year" }, ... }

const numberingFormatSchema = z
  .object({
    prefix: z.string().trim().min(1).max(8).optional(),
    pad: z.number().int().min(1).max(8).optional(),
    startAt: z.number().int().min(1).optional(),
    scope: z.enum(["year", "month"]).optional(),
  })
  .strict();

const numberingFormatsSchema = z
  .object({
    invoice: numberingFormatSchema.nullable().optional(),
    expense: numberingFormatSchema.nullable().optional(),
    saleReturn: numberingFormatSchema.nullable().optional(),
    purchaseReturn: numberingFormatSchema.nullable().optional(),
  })
  .strict();

/**
 * Validate a numbering patch, merge it over the stored formats and persist it.
 * Returns the effective formats (defaults + stored + patch).
 */
async function applyNumberingFormats(
  value: unknown,
): Promise<Record<DocumentType, NumberingFormat>> {
  const parsed = numberingFormatsSchema.safeParse(value);
  if (!parsed.success) throw parsed.error;

  const current = await readNumberingFormats();
  const merged = { ...current } as Record<DocumentType, NumberingFormat>;
  for (const type of DOCUMENT_TYPES) {
    const patch = parsed.data[type];
    if (patch === undefined) continue;
    merged[type] =
      patch === null
        ? { ...DEFAULT_NUMBERING_FORMATS[type] }
        : normaliseNumberingFormat(type, { ...current[type], ...patch });
  }
  await saveNumberingFormats(merged);
  return merged;
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
    // The numbering formats are validated (and merged per document type) even
    // on the generic key route, so an invalid payload can never be stored.
    if (key === NUMBERING_SETTING_KEY) {
      try {
        const merged = await applyNumberingFormats(value);
        return reply.send({ success: true, data: { key, value: merged } });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ success: false, error: "Validation error", details: error.flatten() });
        }
        throw error;
      }
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

  // Document numbering formats — the single source of truth for the invoice,
  // expense, sale-return and purchase-return number series.
  fastify.get("/numbering-formats", { preHandler: [authGuard] }, async (_request, reply) => {
    const value = await readNumberingFormats();
    return reply.send({ success: true, data: { key: NUMBERING_SETTING_KEY, value } });
  });

  // Body: { value: { invoice?: {...}, expense?: {...}, ... } } — the bare
  // formats object is accepted too. Fields that are not sent keep their
  // current value; `null` resets one document type to its default.
  fastify.put("/numbering-formats", { preHandler: [authGuard] }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const raw = Object.prototype.hasOwnProperty.call(body, "value") ? body.value : body;
    try {
      const value = await applyNumberingFormats(raw);
      return reply.send({ success: true, data: { key: NUMBERING_SETTING_KEY, value } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: "Validation error", details: error.flatten() });
      }
      throw error;
    }
  });
}
