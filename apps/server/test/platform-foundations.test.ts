import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import {
  applySchema,
  dbPath,
  makeOutboxApp,
  seedUser,
  type SeededUser,
} from "./helpers.js";
import { db } from "../src/db/index.js";
import { outboxEvents, auditEvents as auditEventsTable } from "../src/db/schema/index.js";
import { enqueueOutbox } from "../src/services/outbox.js";
import { fileStorage } from "../src/services/fileStorage.js";
import { auditEvents } from "../src/services/audit.js";

let app: FastifyInstance;
let userA: SeededUser;
let userB: SeededUser;

beforeAll(async () => {
  applySchema();
  app = await makeOutboxApp();
  userA = seedUser();
  userB = seedUser();
});

function countOutboxByKey(key: string): number {
  const sqlite = new Database(dbPath());
  const row = sqlite
    .prepare("SELECT COUNT(*) AS c FROM outbox_events WHERE idempotency_key = ?")
    .get(key) as { c: number };
  sqlite.close();
  return row.c;
}

describe("tenant isolation", () => {
  it("user B cannot see or ack user A's outbox events", async () => {
    const { id } = await enqueueOutbox({
      createdBy: userA.id,
      type: "invoice.shared",
      aggregateType: "invoice",
      aggregateId: "inv-1",
      payload: { channel: "whatsapp" },
    });

    const resB = await app.inject({
      method: "GET",
      url: "/api/outbox/pending",
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(resB.statusCode).toBe(200);
    expect(resB.json().data).toEqual([]);

    const resA = await app.inject({
      method: "GET",
      url: "/api/outbox/pending",
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(resA.statusCode).toBe(200);
    expect(resA.json().data.map((r: { id: string }) => r.id)).toContain(id);

    const ackB = await app.inject({
      method: "POST",
      url: `/api/outbox/${id}/ack`,
      headers: { authorization: `Bearer ${userB.token}` },
      payload: { status: "done" },
    });
    expect(ackB.statusCode).toBe(404);
  });

  it("user B cannot read user A's stored files", async () => {
    const bytes = Buffer.from("prescription-image-bytes");
    const stored = await fileStorage.put({
      ownerId: userA.id,
      purpose: "prescription",
      filename: "rx.png",
      contentType: "image/png",
      bytes,
    });
    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);

    await expect(fileStorage.get(userB.id, stored.id)).rejects.toThrow();

    const own = await fileStorage.get(userA.id, stored.id);
    expect(own.bytes.equals(bytes)).toBe(true);
    expect(own.row.sha256).toBe(stored.sha256);
  });
});

describe("outbox", () => {
  it("is idempotent on idempotencyKey: same key twice yields one row", async () => {
    const key = `test-key-${Date.now()}`;
    const first = await enqueueOutbox({
      createdBy: userA.id,
      type: "message.send",
      aggregateType: "message",
      aggregateId: "msg-1",
      payload: { to: "+911234567890" },
      idempotencyKey: key,
    });
    const second = await enqueueOutbox({
      createdBy: userA.id,
      type: "message.send",
      aggregateType: "message",
      aggregateId: "msg-1",
      payload: { to: "+911234567890" },
      idempotencyKey: key,
    });
    expect(second.id).toBe(first.id);
    expect(countOutboxByKey(key)).toBe(1);
  });

  it("ack moves a pending event to done", async () => {
    const { id } = await enqueueOutbox({
      createdBy: userA.id,
      type: "report.ready",
      aggregateType: "report",
      aggregateId: "r-1",
      payload: {},
    });
    const ack = await app.inject({
      method: "POST",
      url: `/api/outbox/${id}/ack`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { status: "done" },
    });
    expect(ack.statusCode).toBe(200);
    expect(ack.json().data.status).toBe("done");

    const rows = await db.select().from(outboxEvents).where(eq(outboxEvents.id, id));
    expect(rows[0]?.status).toBe("done");

    const pending = await app.inject({
      method: "GET",
      url: "/api/outbox/pending",
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(pending.json().data.map((r: { id: string }) => r.id)).not.toContain(id);
  });

  it("rejects unauthenticated polling and invalid ack payloads", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/api/outbox/pending" });
    expect(noAuth.statusCode).toBe(401);

    const bad = await app.inject({
      method: "POST",
      url: "/api/outbox/does-not-exist/ack",
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { status: "bogus" },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe("audit events", () => {
  it("records actor, action, entity and metadata", async () => {
    const { id } = await auditEvents.record({
      actorId: userA.id,
      action: "invoice.cancel",
      entity: "invoice",
      entityId: "inv-9",
      metadata: { reason: "duplicate entry" },
    });
    const rows = await db.select().from(auditEventsTable).where(eq(auditEventsTable.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(userA.id);
    expect(rows[0]?.action).toBe("invoice.cancel");
    expect(JSON.parse(rows[0]?.metadata ?? "{}")).toEqual({ reason: "duplicate entry" });
  });
});

describe("request id", () => {
  it("echoes X-Request-Id and generates one when missing", async () => {
    const provided = await app.inject({
      method: "GET",
      url: "/api/outbox/pending",
      headers: { authorization: `Bearer ${userA.token}`, "x-request-id": "req-123" },
    });
    expect(provided.headers["x-request-id"]).toBe("req-123");

    const generated = await app.inject({
      method: "GET",
      url: "/api/outbox/pending",
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(typeof generated.headers["x-request-id"]).toBe("string");
    expect((generated.headers["x-request-id"] as string).length).toBeGreaterThan(0);
  });
});
