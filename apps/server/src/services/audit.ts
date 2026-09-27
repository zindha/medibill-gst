import { db } from "../db/index.js";
import { auditEvents as auditEventsTable, generateId } from "../db/schema/index.js";

export interface RecordAuditInput {
  actorId: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: unknown;
}

/** Append-only audit trail for sensitive mutations. Never throws. */
export const auditEvents = {
  async record(input: RecordAuditInput): Promise<{ id: string }> {
    const id = generateId();
    try {
      await db.insert(auditEventsTable).values({
        id,
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
      });
    } catch (err) {
      // Audit must never break the primary operation.
      console.error("[audit] failed to record event:", err);
    }
    return { id };
  },
};
