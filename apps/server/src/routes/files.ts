import { createHash } from "crypto";
import { FastifyInstance, FastifyReply } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { storedFiles } from "../db/schema/index.js";
import { authGuard } from "../plugins/auth.js";
import { fileStorage } from "../services/fileStorage.js";

/** Base64 of a 10 MB file is ~13.4 MB; leave headroom over the storage cap. */
const BODY_LIMIT = 20 * 1024 * 1024;

const uploadSchema = z.object({
  filename: z.string().min(1, "filename is required"),
  contentType: z.string().min(1, "contentType is required"),
  data: z.string().min(1, "data must be a base64 string"),
});

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export default async function fileRoutes(fastify: FastifyInstance) {
  // Store an uploaded file (OCR source images, attachments). Duplicate content
  // for the same tenant is detected by sha256 and returns the existing file.
  fastify.post(
    "/",
    { preHandler: [authGuard], bodyLimit: BODY_LIMIT },
    async (request, reply) => {
      const parsed = uploadSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
      }
      const { filename, contentType, data } = parsed.data;
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

      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const [existing] = await db
        .select()
        .from(storedFiles)
        .where(and(eq(storedFiles.ownerId, request.userId!), eq(storedFiles.sha256, sha256)))
        .limit(1);
      if (existing) {
        return reply.send({
          success: true,
          data: {
            id: existing.id,
            sha256: existing.sha256,
            size: existing.size ?? bytes.length,
            duplicate: true,
          },
        });
      }

      try {
        const stored = await fileStorage.put({
          ownerId: request.userId!,
          purpose: "purchase-ocr",
          filename,
          contentType,
          bytes,
        });
        return reply.status(201).send({
          success: true,
          data: { id: stored.id, sha256: stored.sha256, size: stored.size, duplicate: false },
        });
      } catch (err: any) {
        return reply
          .status(400)
          .send({ success: false, error: err?.message ?? "Unable to store file" });
      }
    }
  );

  // Fetch a stored file as base64 (side-by-side review preview). 404 for
  // files owned by another tenant.
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { row, bytes } = await fileStorage.get(request.userId!, id);
      return reply.send({
        success: true,
        data: {
          contentType: row.contentType ?? "application/octet-stream",
          filename: row.filename,
          data: bytes.toString("base64"),
        },
      });
    } catch {
      return reply.status(404).send({ success: false, error: "File not found" });
    }
  });
}
