import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { generateId, outboxEvents } from "../db/schema/index.js";

export interface EnqueueOutboxInput {
  createdBy: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  availableAt?: Date;
  idempotencyKey?: string;
}

/** Durable async-work queue. Idempotent when idempotencyKey is provided. */
export async function enqueueOutbox(input: EnqueueOutboxInput): Promise<{ id: string }> {
  if (input.idempotencyKey) {
    const existing = await db
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.createdBy, input.createdBy),
          eq(outboxEvents.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (existing[0]) return { id: existing[0].id };
  }
  const id = generateId();
  await db.insert(outboxEvents).values({
    id,
    createdBy: input.createdBy,
    type: input.type,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: JSON.stringify(input.payload ?? {}),
    status: "pending",
    attempts: 0,
    availableAt: input.availableAt ?? new Date(),
    idempotencyKey: input.idempotencyKey ?? null,
  });
  return { id };
}

/** Claim due events for a worker (tenant-scoped, pending only). */
export async function claimDueEvents(createdBy: string, limit = 50, now = new Date()) {
  const rows = await db
    .select()
    .from(outboxEvents)
    .where(and(eq(outboxEvents.createdBy, createdBy), eq(outboxEvents.status, "pending")))
    .limit(limit);
  return rows.filter((r) => !r.availableAt || r.availableAt.getTime() <= now.getTime());
}
