import { createHash } from "crypto";
import { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { customerOrderItems, customerOrders, settings, storedFiles, users } from "../db/schema/index.js";
import { fileStorage } from "../services/fileStorage.js";
import {
  OrderError,
  createOrder,
  publicCatalog,
} from "../services/customerOrders.js";

/** Base64 of a 10 MB file is ~13.4 MB — headroom over the storage cap. */
const FILE_BODY_LIMIT = 20 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

// Strict public input caps — these endpoints are unauthenticated, so zod does
// the heavy lifting (notes ≤500, address ≤300, items ≤50, tight string sizes).
const createOrderSchema = z.object({
  storeId: z.string().min(1).max(64),
  customerId: z.string().max(64).optional(),
  customerName: z.string().trim().min(1, "customerName is required").max(120),
  phone: z
    .string()
    .trim()
    .min(7, "phone must be at least 7 characters")
    .max(20, "phone must be at most 20 characters"),
  deliveryAddress: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
  prescriptionFileId: z.string().max(64).optional(),
  items: z
    .array(
      z.object({
        medicineId: z.string().min(1).max(64),
        quantity: z.number().positive().max(9999),
      })
    )
    .min(1, "At least one medicine is required")
    .max(50, "A maximum of 50 items per order"),
});

const catalogQuerySchema = z.object({
  storeId: z.string().min(1).max(64),
  q: z.string().min(2, "Search must be at least 2 characters").max(120),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const storeQuerySchema = z.object({
  storeId: z.string().min(1).max(64),
});

const uploadSchema = z.object({
  storeId: z.string().min(1).max(64),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  data: z.string().min(1),
});

const statusParamsSchema = z.object({ id: z.string().min(1).max(64) });
const statusQuerySchema = z.object({ storeId: z.string().min(1).max(64) });

/**
 * Public (unauthenticated) ordering endpoints (Task 14), registered under
 * /api/public with NO authGuard. `storeId` = the install owner's user id
 * (single-store convention — documented in API.md and on the /order page).
 * Abuse control: the global rate limiter in index.ts covers these routes, and
 * every input here is strictly zod-capped.
 */
export default async function publicOrderRoutes(fastify: FastifyInstance) {
  // Create an order → status pending. 403 when settings online_orders.enabled
  // is false (default: enabled).
  fastify.post("/orders", { bodyLimit: 64 * 1024 }, async (request, reply) => {
    const parsed = createOrderSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const order = await createOrder(parsed.data);
      return reply.status(201).send({ success: true, data: order });
    } catch (err) {
      if (err instanceof OrderError) {
        return reply
          .status(err.status)
          .send({ success: false, error: err.message, details: err.details });
      }
      throw err;
    }
  });

  // Public catalog search — active medicines for storeId only; q ≥ 2 chars so
  // the endpoint cannot be used to dump the catalog; ≤ 50 rows.
  fastify.get("/medicines", async (request, reply) => {
    const parsed = catalogQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const rows = await publicCatalog(parsed.data.storeId, parsed.data.q, parsed.data.limit ?? 20);
      return reply.send({ success: true, data: rows });
    } catch (err) {
      if (err instanceof OrderError) {
        return reply.status(err.status).send({ success: false, error: err.message });
      }
      throw err;
    }
  });

  // Tiny public store header (portal title).
  fastify.get("/store", async (request, reply) => {
    const parsed = storeQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const [user] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.id, parsed.data.storeId), eq(users.isActive, true)))
      .limit(1);
    if (!user) return reply.status(404).send({ success: false, error: "Store not found" });
    let name = user.name ?? "Pharmacy";
    try {
      const [row] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, "store_name"))
        .limit(1);
      if (row) {
        const parsedName = JSON.parse(row.value);
        if (typeof parsedName === "string" && parsedName.trim()) name = parsedName.trim();
      }
    } catch {
      /* fall back to the owner's display name */
    }
    return reply.send({ success: true, data: { name } });
  });

  // Public prescription upload — owner-scoped file put. Duplicate content for
  // the same store is detected by sha256 and returns the existing file.
  fastify.post("/files", { bodyLimit: FILE_BODY_LIMIT }, async (request, reply) => {
    const parsed = uploadSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const { storeId, filename, contentType, data } = parsed.data;

    const [store] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, storeId), eq(users.isActive, true)))
      .limit(1);
    if (!store) return reply.status(404).send({ success: false, error: "Store not found" });

    const normalized = data.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
    if (!BASE64_RE.test(normalized)) {
      return reply
        .status(400)
        .send({ success: false, error: "data must be a valid base64 string" });
    }
    const bytes = Buffer.from(normalized, "base64");
    if (bytes.length === 0) {
      return reply.status(400).send({ success: false, error: "File is empty" });
    }
    if (bytes.length > MAX_FILE_BYTES) {
      return reply.status(400).send({ success: false, error: "File is too large (max 10MB)" });
    }

    try {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const [existing] = await db
        .select()
        .from(storedFiles)
        .where(and(eq(storedFiles.ownerId, storeId), eq(storedFiles.sha256, sha256)))
        .limit(1);
      if (existing) {
        return reply.send({
          success: true,
          data: { id: existing.id, sha256: existing.sha256, duplicate: true },
        });
      }
      const stored = await fileStorage.put({
        ownerId: storeId,
        purpose: "order-prescription",
        filename,
        contentType,
        bytes,
      });
      return reply.status(201).send({
        success: true,
        data: { id: stored.id, sha256: stored.sha256, duplicate: false },
      });
    } catch (err: any) {
      return reply
        .status(400)
        .send({ success: false, error: err?.message ?? "Unable to store file" });
    }
  });

  // Customer-facing status view — intentionally minimal (id/status/timestamps
  // + item names only — no phone, address, prices or internal ids). Wrong
  // storeId or unknown id is an identical 404 (no existence leak).
  fastify.get("/orders/:id", async (request, reply) => {
    const params = statusParamsSchema.safeParse(request.params ?? {});
    const query = statusQuerySchema.safeParse(request.query ?? {});
    if (!params.success || !query.success) {
      return reply.status(400).send({ success: false, error: "Validation error" });
    }
    const [order] = await db
      .select()
      .from(customerOrders)
      .where(eq(customerOrders.id, params.data.id))
      .limit(1);
    if (!order || order.storeId !== query.data.storeId) {
      return reply.status(404).send({ success: false, error: "Order not found" });
    }
    const items = await db
      .select()
      .from(customerOrderItems)
      .where(eq(customerOrderItems.orderId, order.id));
    return reply.send({
      success: true,
      data: {
        id: order.id,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: items.map((i) => ({ medicineName: i.medicineName, quantity: i.quantity })),
      },
    });
  });
}
