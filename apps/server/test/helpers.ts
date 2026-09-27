import Database from "better-sqlite3";
import Fastify, { FastifyInstance } from "fastify";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import invoiceRoutes from "../src/routes/invoices.js";
import paymentRoutes from "../src/routes/payments.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS_DIR = join(here, "../src/db/migrations");

export function dbPath(): string {
  const dir = process.env.DATA_DIR ?? join("C:", "ProgramData", "MediBill", "data");
  return join(dir, "medibill.db");
}

/** Apply all SQL migrations in order to the scratch DB (idempotent). */
export function applySchema(): void {
  const sqlite = new Database(dbPath());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    // Strip `-- comment` lines and split on `;` so each statement runs standalone.
    const statements = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      try {
        sqlite.exec(stmt);
      } catch (err: any) {
        // Additive `ALTER TABLE ... ADD COLUMN` statements are not natively
        // idempotent — skip columns that already exist so re-running the full
        // migration set stays safe. Anything else still fails loudly.
        if (typeof err?.message === "string" && /duplicate column name/i.test(err.message)) {
          continue;
        }
        throw err;
      }
    }
  }
  sqlite.close();
}

export interface SeededUser {
  id: string;
  token: string;
}

/** Seed one active user + a valid session; returns credentials for authGuard. */
export function seedUser(): SeededUser {
  const now = Date.now();
  const id = nanoid(16);
  const token = nanoid(32);
  const sqlite = new Database(dbPath());
  sqlite
    .prepare(
      `INSERT INTO users (id, email, name, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 1, ?, ?)`
    )
    .run(id, `user-${id}@test.local`, "Tester", now, now);
  sqlite
    .prepare(
      `INSERT INTO sessions (id, user_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(nanoid(16), id, token, now + 7 * 24 * 3600e3, now);
  sqlite.close();
  return { id, token };
}

export interface SeededMedicine {
  medicineId: string;
  /** First (primary) batch id. */
  batchId: string;
  /** Every seeded batch id for this medicine, in seed order. */
  batchIds: string[];
  /** Current quantity written to the primary batch. */
  quantity: number;
  sellingPrice: number;
}

/**
 * Seed a medicine plus one or more active, in-stock batches for the given user.
 * `opts.batches` adds extra batches (e.g. to test FEFO across multiple lots).
 */
export function seedMedicine(
  ownerId: string,
  opts: {
    name?: string;
    quantity?: number;
    sellingPrice?: number;
    mrp?: number;
    expiry?: string;
    unitsPerPack?: number;
    batches?: Array<{ quantity?: number; expiry?: string; sellingPrice?: number; mrp?: number }>;
  } = {}
): SeededMedicine {
  const now = Date.now();
  const medicineId = nanoid(16);
  const qty = opts.quantity ?? 50;
  const price = opts.sellingPrice ?? 95.24;
  const upp = opts.unitsPerPack ?? 1;
  const sqlite = new Database(dbPath());
  sqlite
    .prepare(
      `INSERT INTO medicines (id, name, unit, units_per_pack, gst_rate, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, 'Strip', ?, '5', 1, ?, ?, ?)`
    )
    .run(medicineId, opts.name ?? "Test Med", upp, ownerId, now, now);

  const allBatches = [
    { quantity: qty, expiry: opts.expiry ?? "2099-12-31", sellingPrice: price, mrp: opts.mrp ?? 100 },
    ...(opts.batches ?? []).map((b) => ({
      quantity: b.quantity ?? 0,
      expiry: b.expiry ?? "2099-12-31",
      sellingPrice: b.sellingPrice ?? price,
      mrp: b.mrp ?? opts.mrp ?? 100,
    })),
  ];

  const insertBatch = sqlite.prepare(
    `INSERT INTO batches
       (id, medicine_id, batch_no, expiry_date, mrp, purchase_price, selling_price,
        quantity, initial_quantity, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?, ?, ?)`
  );

  const batchIds: string[] = [];
  allBatches.forEach((b, i) => {
    const id = nanoid(16);
    batchIds.push(id);
    insertBatch.run(
      id,
      medicineId,
      `B${i + 1}`,
      b.expiry,
      b.mrp,
      b.sellingPrice,
      b.quantity,
      b.quantity,
      ownerId,
      now,
      now
    );
  });

  sqlite.close();
  return { medicineId, batchId: batchIds[0], batchIds, quantity: qty, sellingPrice: price };
}

/** A minimal Fastify instance exposing the invoice + payment routes we're testing. */
export async function makeApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(paymentRoutes, { prefix: "/api/payments" });
  return app;
}

/** A minimal Fastify instance exposing the dashboard routes we're testing. */
export async function makeDashboardApp(): Promise<FastifyInstance> {
  const { default: dashboardRoutes } = await import("../src/routes/dashboard.js");
  const app = Fastify({ logger: false });
  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  return app;
}

/** A minimal Fastify instance exposing the outbox routes + request-id hook. */
export async function makeOutboxApp(): Promise<FastifyInstance> {
  const { default: outboxRoutes } = await import("../src/routes/outbox.js");
  const app = Fastify({ logger: false });
  // Must use onSend — async onRequest + reply.header hangs inject() (light-my-request).
  app.addHook("onSend", async (request: any, reply: any, payload: any) => {
    const incoming = request.headers?.["x-request-id"];
    const requestId =
      (Array.isArray(incoming) ? incoming[0] : incoming) ??
      `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    request.requestId = requestId;
    reply.header("x-request-id", requestId);
    return payload;
  });
  await app.register(outboxRoutes, { prefix: "/api/outbox" });
  return app;
}

export interface SeededCustomer {
  id: string;
}

/** Seed a minimal customer for invoice/payment balance tests. */
export function seedCustomer(ownerId: string, opts: { name?: string } = {}): SeededCustomer {
  const now = Date.now();
  const id = nanoid(16);
  const sqlite = new Database(dbPath());
  sqlite
    .prepare(
      `INSERT INTO customers (id, name, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?)`
    )
    .run(id, opts.name ?? "Walk-in", ownerId, now, now);
  sqlite.close();
  return { id };
}

/** Row counts in a table for a given owner, to assert no partial writes leaked. */
export function countFor(table: string, ownerId: string): number {    const ownerCol = (table: string): string => {
      switch (table) {
        case "activity_log":
          return "user_id";
        case "invoices":
        case "payments":
        case "invoice_batch_allocations":
        default:
          return "created_by";
      }
    };
  const col = ownerCol(table);
  const sqlite = new Database(dbPath());
  const row = sqlite
    .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${col} = ?`)
    .get(ownerId) as { c: number };
  sqlite.close();
  return row.c;
}

export function getBatchQuantity(batchId: string): number {
  const sqlite = new Database(dbPath());
  const row = sqlite
    .prepare("SELECT quantity FROM batches WHERE id = ?")
    .get(batchId) as { quantity: number };
  sqlite.close();
  return row.quantity;
}