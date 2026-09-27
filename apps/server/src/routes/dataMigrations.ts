import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import { DATA_IMPORT_ENTITY_TYPES } from "../db/schema/index.js";
import {
  DataMigrationError,
  commitImport,
  createImport,
  deleteImport,
  listImports,
  previewImport,
  resolveImport,
  rollbackImport,
} from "../services/dataMigration.js";

const createSchema = z.object({
  entityType: z.enum(DATA_IMPORT_ENTITY_TYPES),
  filename: z.string().min(1, "filename is required"),
  // CSV sent as JSON text (same transport as the purchase import pipeline).
  csv: z.string().min(1, "csv is required"),
});

function sendMigrationError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof DataMigrationError) {
    return reply
      .status(err.status)
      .send({ success: false, error: err.message, details: err.details });
  }
  throw err;
}

export default async function dataMigrationRoutes(fastify: FastifyInstance) {
  // List the tenant's import sessions (newest first) with row counts.
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    try {
      const rows = await listImports(request.userId!);
      return reply.send({ success: true, data: rows });
    } catch (err) {
      return sendMigrationError(reply, err);
    }
  });

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
        parsed.data.entityType,
        parsed.data.filename,
        parsed.data.csv
      );
      return reply.status(201).send({ success: true, data: session });
    } catch (err) {
      return sendMigrationError(reply, err);
    }
  });

  // Full import session (recomputed for drafts, as-stored once committed).
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const session = await resolveImport(id, request.userId!);
      return reply.send({ success: true, data: session });
    } catch (err) {
      return sendMigrationError(reply, err);
    }
  });

  // Dry-run preview: counts + wouldCreate/wouldSkip + a sample of rows.
  // Never creates entities and never changes the session status.
  fastify.post("/:id/preview", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const preview = await previewImport(request.userId!, id);
      return reply.send({ success: true, data: preview });
    } catch (err) {
      return sendMigrationError(reply, err);
    }
  });

  // Commit a draft import (atomic; 400 with per-row details when any row has
  // blocking errors, 409 on a second commit).
  fastify.post("/:id/commit", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await commitImport(request.userId!, id);
      return reply.status(201).send({ success: true, data: result });
    } catch (err) {
      return sendMigrationError(reply, err);
    }
  });

  // Roll back a committed import — all-or-nothing: any referenced row refuses
  // the whole rollback with 409 (nothing deleted).
  fastify.post("/:id/rollback", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await rollbackImport(request.userId!, id);
      return reply.send({ success: true, data: result });
    } catch (err) {
      return sendMigrationError(reply, err);
    }
  });

  // Delete a draft import (404 for committed/rolled-back or other tenants).
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteImport(request.userId!, id);
      return reply.send({ success: true, data: { message: "Import deleted" } });
    } catch (err) {
      return sendMigrationError(reply, err);
    }
  });
}
