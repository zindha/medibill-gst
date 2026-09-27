import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { authGuard } from "../plugins/auth.js";
import { db } from "../db/index.js";
import {
  SCHEDULED_REPORT_TYPES,
  scheduledReportRuns,
  scheduledReports,
} from "../db/schema/index.js";
import { getUserRole } from "../services/expiryPolicy.js";
import { ComplianceError } from "../services/compliance.js";
import {
  computeNextRun,
  getReport,
  runReport,
} from "../services/reportsDelivery.js";

/**
 * Scheduled Reports routes (Task 17) at `/api/scheduled-reports`.
 *
 * Guards: `authGuard` on reads; create / update / delete / run require
 * admin | pharmacist (cashier → 403). Every loader filters by
 * `created_by = caller` → cross-tenant ids 404.
 *
 * PDF is intentionally rejected with 400 "PDF export not supported yet" —
 * the product has no server-side PDF renderer, only CSV (documented in
 * docs/API.md).
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const scheduleSchema = z.union([
  z.object({ kind: z.literal("daily"), time: z.string().regex(TIME_RE, "time must be HH:mm (24h)") }),
  z.object({
    kind: z.literal("weekly"),
    day: z.number().int().min(0).max(6),
    time: z.string().regex(TIME_RE, "time must be HH:mm (24h)"),
  }),
  z.object({
    kind: z.literal("monthly"),
    // Capped at 28 so "day 31" can never target a month that lacks it.
    day: z.number().int().min(1).max(28),
    time: z.string().regex(TIME_RE, "time must be HH:mm (24h)"),
  }),
]);

const recipientSchema = z.object({
  channel: z.enum(["email", "sms"]),
  address: z.string().trim().min(3).max(200),
});

const filtersSchema = z.object({
  daysBack: z.number().int().min(1).max(365).default(30),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  reportType: z.enum(SCHEDULED_REPORT_TYPES),
  schedule: scheduleSchema,
  recipients: z.array(recipientSchema).max(20),
  format: z.enum(["csv", "pdf"]).default("csv"),
  filters: filtersSchema.default({ daysBack: 30 }),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    schedule: scheduleSchema.optional(),
    recipients: z.array(recipientSchema).max(20).optional(),
    filters: filtersSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });

async function requireManager(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const role = await getUserRole(request.userId!);
  if (role !== "admin" && role !== "pharmacist") {
    reply.status(403).send({ success: false, error: "Insufficient permissions" });
    return false;
  }
  return true;
}

export default async function scheduledReportRoutes(fastify: FastifyInstance) {
  const sendError = (reply: FastifyReply, err: unknown) => {
    const status = err instanceof ComplianceError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : String(err);
    return reply.status(status).send({ success: false, error: message });
  };

  // Create (admin | pharmacist).
  fastify.post("/", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManager(request, reply))) return;
    const parsed = createSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    if (parsed.data.format === "pdf") {
      return reply
        .status(400)
        .send({ success: false, error: "PDF export not supported yet" });
    }
    const now = new Date();
    const [row] = await db
      .insert(scheduledReports)
      .values({
        createdBy: request.userId!,
        name: parsed.data.name,
        reportType: parsed.data.reportType,
        schedule: JSON.stringify(parsed.data.schedule),
        recipients: JSON.stringify(parsed.data.recipients),
        format: parsed.data.format,
        filters: JSON.stringify(parsed.data.filters),
        nextRunAt: computeNextRun(now, parsed.data.schedule),
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return reply.status(201).send({ success: true, data: row });
  });

  // List mine (newest first).
  fastify.get("/", { preHandler: [authGuard] }, async (request, reply) => {
    const rows = await db
      .select()
      .from(scheduledReports)
      .where(eq(scheduledReports.createdBy, request.userId!))
      .orderBy(desc(scheduledReports.createdAt));
    return reply.send({ success: true, data: rows, total: rows.length });
  });

  // One report + its 10 most recent runs.
  fastify.get("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = await getReport(request.userId!, id);
    if (!report) return reply.status(404).send({ success: false, error: "Scheduled report not found" });
    const runs = await db
      .select()
      .from(scheduledReportRuns)
      .where(
        and(
          eq(scheduledReportRuns.scheduledReportId, id),
          eq(scheduledReportRuns.createdBy, request.userId!)
        )
      )
      .orderBy(desc(scheduledReportRuns.startedAt))
      .limit(10);
    return reply.send({ success: true, data: { report, runs } });
  });

  // Full run history for one report.
  fastify.get("/:id/runs", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = await getReport(request.userId!, id);
    if (!report) return reply.status(404).send({ success: false, error: "Scheduled report not found" });
    const runs = await db
      .select()
      .from(scheduledReportRuns)
      .where(
        and(
          eq(scheduledReportRuns.scheduledReportId, id),
          eq(scheduledReportRuns.createdBy, request.userId!)
        )
      )
      .orderBy(desc(scheduledReportRuns.startedAt))
      .limit(50);
    return reply.send({ success: true, data: runs, total: runs.length });
  });

  // Update (admin | pharmacist): name/schedule/recipients/filters/enable.
  fastify.put("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManager(request, reply))) return;
    const { id } = request.params as { id: string };
    const report = await getReport(request.userId!, id);
    if (!report) return reply.status(404).send({ success: false, error: "Scheduled report not found" });
    const parsed = updateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: "Validation error", details: parsed.error.flatten() });
    }
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.recipients !== undefined)
      patch.recipients = JSON.stringify(parsed.data.recipients);
    if (parsed.data.filters !== undefined) patch.filters = JSON.stringify(parsed.data.filters);
    if (parsed.data.schedule !== undefined) {
      patch.schedule = JSON.stringify(parsed.data.schedule);
      // A schedule change restarts the countdown from now.
      patch.nextRunAt = computeNextRun(now, parsed.data.schedule);
    }
    if (parsed.data.enabled !== undefined) {
      patch.enabled = parsed.data.enabled;
      if (parsed.data.enabled && !report.nextRunAt) {
        const schedule = parsed.data.schedule ?? JSON.parse(report.schedule);
        patch.nextRunAt = computeNextRun(now, schedule);
      }
    }
    const [row] = await db
      .update(scheduledReports)
      .set(patch)
      .where(and(eq(scheduledReports.id, id), eq(scheduledReports.createdBy, request.userId!)))
      .returning();
    return reply.send({ success: true, data: row });
  });

  // Delete (admin | pharmacist) — runs cascade with the report (FK ON DELETE CASCADE).
  fastify.delete("/:id", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManager(request, reply))) return;
    const { id } = request.params as { id: string };
    const report = await getReport(request.userId!, id);
    if (!report) return reply.status(404).send({ success: false, error: "Scheduled report not found" });
    await db
      .delete(scheduledReports)
      .where(and(eq(scheduledReports.id, id), eq(scheduledReports.createdBy, request.userId!)));
    return reply.send({ success: true, data: { deleted: true } });
  });

  // Manual run (admin | pharmacist) — does NOT advance the schedule.
  fastify.post("/:id/run", { preHandler: [authGuard] }, async (request, reply) => {
    if (!(await requireManager(request, reply))) return;
    const { id } = request.params as { id: string };
    try {
      const result = await runReport(request.userId!, id, "manual");
      return reply.send({ success: true, data: result });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
