import { FastifyInstance, FastifyReply } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { storedFiles } from "../db/schema/index.js";
import { authGuard } from "../plugins/auth.js";
import { extractHeaderFields, extractOcrRows } from "../services/ocrExtract.js";
import {
  PURCHASE_IMPORT_FIELDS,
  PurchaseImportError,
  commitImport,
  createDraftImport,
  createImport,
  deleteImport,
  resolveImport,
  updateImportMappings,
  type ParsedPurchaseCsv,
  type PurchaseImportHeaderFields,
} from "../services/purchaseImport.js";

const GST_RATE_VALUES = ["0", "5", "12", "18", "28"] as const;

const createSchema = z.object({
  filename: z.string().min(1, "filename is required"),
  // CSV sent as JSON text for now (multipart comes with the OCR task).
  csv: z.string().min(1, "csv is required"),
});

const ocrSchema = z.object({
  filename: z.string().min(1, "filename is required"),
  text: z.string().min(10, "text must be at least 10 characters"),
  fileId: z.string().min(1).optional(),
});

/** Pseudo columns for OCR rows — named after target fields so they auto-map. */
const OCR_COLUMNS = [
  "product",
  "quantity",
  "purchase_rate",
  "gst_rate",
  "batch",
  "expiry",
  "ocr_confidence",
] as const;

const mappingsSchema = z.object({
  mappings: z.record(
    z.string(),
    z.union([z.enum(PURCHASE_IMPORT_FIELDS), z.literal("")])
  ),
  defaults: z
    .object({
      supplierId: z.string().min(1).optional(),
      gstRate: z.enum(GST_RATE_VALUES).optional(),
    })
    .optional(),
});

const commitRowSchema = z.object({
  rowIndex: z.number().int().min(0),
  medicineId: z.string().min(1, "medicineId is required"),
  batchNo: z.string().min(1, "batchNo is required"),
  expiryDate: z.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/, "expiryDate must be YYYY-MM-DD"),
  quantity: z.number().int().min(1),
  freeQuantity: z.number().int().min(0).optional(),
  mrp: z.number().min(0).optional(),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0).optional(),
  gstRate: z.enum(GST_RATE_VALUES).optional(),
});

const commitSchema = z.object({
  billNo: z.string().min(1, "billNo is required"),
  billDate: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
  rows: z.array(commitRowSchema).min(1),
});

function sendImportError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof PurchaseImportError) {
    return reply
      .status(err.status)
      .send({ success: false, error: err.message, details: err.details });
  }
  throw err;
}

export default async function purchaseImportRoutes(fastify: FastifyInstance) {
  // Create a draft import session from CSV text.
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const session = await createImport(
        request.userId!,
        parsed.data.filename,
        parsed.data.csv
      );
      return reply.status(201).send({ success: true, data: session });
    } catch (err) {
      return sendImportError(reply, err);
    }
  });

  // Create a draft import session from client-side OCR text (image flow).
  // The server re-parses the text into the same normalized import shape as a
  // CSV upload; the stored source image is linked through `fileId`.
  fastify.post("/ocr", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = ocrSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const { filename, text, fileId } = parsed.data;

      if (fileId) {
        const [file] = await db
          .select({ id: storedFiles.id })
          .from(storedFiles)
          .where(and(eq(storedFiles.id, fileId), eq(storedFiles.ownerId, request.userId!)))
          .limit(1);
        if (!file) throw new PurchaseImportError("Source file not found", 404);
      }

      const ocrRows = extractOcrRows(text);
      if (ocrRows.length === 0) {
        throw new PurchaseImportError("No line items detected in the OCR text", 400);
      }

      const header = extractHeaderFields(text);
      const headerFields: PurchaseImportHeaderFields = {
        billNo: header.billNo,
        billDate: header.billDate,
        supplierName: header.supplierName,
      };

      const pseudo: ParsedPurchaseCsv = {
        columns: [...OCR_COLUMNS],
        rows: ocrRows.map((row, index) => ({
          rowIndex: index,
          raw: {
            product: row.product,
            quantity: row.quantity === null ? "" : String(row.quantity),
            purchase_rate: row.rate === null ? "" : String(row.rate),
            gst_rate: String(row.gstRate),
            batch: row.batchNo ?? "",
            expiry: row.expiryDate ?? "",
            ocr_confidence: String(row.confidence),
          },
        })),
      };

      const session = await createDraftImport(request.userId!, filename, pseudo, {
        source: "ocr",
        fileId: fileId ?? null,
        headerFields,
      });
      return reply.status(201).send({ success: true, data: session });
    } catch (err) {
      return sendImportError(reply, err);
    }
  });

  // Replace column mappings + defaults, recompute every row.
  fastify.put("/:id/mappings", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = mappingsSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const session = await updateImportMappings(
        request.userId!,
        id,
        parsed.data.mappings,
        parsed.data.defaults ?? {}
      );
      return reply.send({ success: true, data: session });
    } catch (err) {
      return sendImportError(reply, err);
    }
  });

  // Full import session (recomputed for drafts, as-stored for committed ones).
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const session = await resolveImport(id, request.userId!);
      return reply.send({ success: true, data: session });
    } catch (err) {
      return sendImportError(reply, err);
    }
  });

  // Commit a draft import as a purchase bill (atomic; 400 on any error).
  fastify.post("/:id/commit", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = commitSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    try {
      const bill = await commitImport(request.userId!, id, parsed.data);
      return reply.status(201).send({ success: true, data: bill });
    } catch (err) {
      return sendImportError(reply, err);
    }
  });

  // Delete a draft import (404 for committed imports or other tenants).
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteImport(request.userId!, id);
      return reply.send({ success: true, data: { message: "Import deleted" } });
    } catch (err) {
      return sendImportError(reply, err);
    }
  });
}
