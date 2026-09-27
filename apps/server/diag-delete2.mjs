import { db } from "./src/db/index.ts";
import { medicines, batches, inventoryTransactions, invoiceItems } from "./src/db/schema/index.ts";
import { eq, sql } from "drizzle-orm";
import Database from "better-sqlite3";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR ?? join(process.env.PROGRAM_DATA ?? "C:\\ProgramData\\MediBill", "data");
const raw = new Database(join(DATA_DIR, "medibill.db"));

// Check invoice refs for Gelusil
for (const row of raw.prepare("SELECT id, name FROM medicines WHERE name LIKE '%Gelusil%'").all()) {
  console.log("Medicine:", row);
  const invCount = raw.prepare("SELECT count(*) as c FROM invoice_items WHERE medicine_id=?").get(row.id);
  console.log("  invoice_items:", invCount.c);
  const batchCount = raw.prepare("SELECT count(*) as c FROM batches WHERE medicine_id=?").get(row.id);
  console.log("  batches:", batchCount.c);
  const txCount = raw.prepare("SELECT count(*) as c FROM inventory_transactions WHERE medicine_id=?").get(row.id);
  console.log("  inventory_transactions:", txCount.c);
  const allocCount = raw.prepare("SELECT count(*) as c FROM invoice_batch_allocations WHERE medicine_id=?").get(row.id);
  console.log("  invoice_batch_allocations:", allocCount.c);
}

// Check session handling - create via drizzle then via raw and compare validation
import { sessions } from "./src/db/schema/index.ts";
import { nanoid } from "nanoid";
const userId = "h-iq6qxC_tvgVeeN";

// Clean old diag sessions
raw.prepare("DELETE FROM sessions WHERE token LIKE 'diag%'").run();
console.log("\nCleaned old diag sessions");

// Create via drizzle
const future = new Date(Date.now() + 7*24*3600*1000);
const token = "diag-drizzle-" + nanoid(8);
const [s1] = await db.insert(sessions).values({ userId, token, expiresAt: future, createdAt: new Date() }).returning();
console.log("Drizzle session raw expires:", raw.prepare("SELECT expires_at FROM sessions WHERE id=?").get(s1.id).expires_at, "future ms", future.getTime(), "future sec", Math.floor(future.getTime()/1000));

// Create via raw ms
const token2 = "diag-raw-" + nanoid(8);
const nowMs = Date.now();
const expiresMs = nowMs + 7*24*3600*1000;
raw.prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(nanoid(16), userId, token2, expiresMs, nowMs);
console.log("Raw session raw expires_ms:", expiresMs, "stored:", raw.prepare("SELECT expires_at FROM sessions WHERE token=?").get(token2).expires_at);

// Now test validation via db.query
import { validateSession } from "./src/lib/auth.ts";
const v1 = await validateSession(token);
console.log("validate drizzle token:", !!v1, v1 ? "valid" : "expired");
const v2 = await validateSession(token2);
console.log("validate raw token:", !!v2, v2 ? "valid" : "expired");
const vExpired = await validateSession("swQHo6SqvhFfyyksMzTd8GAyM28EFOI0");
console.log("validate old expired token:", !!vExpired);

// Cleanup
raw.prepare("DELETE FROM sessions WHERE token IN (?, ?)").run(token, token2);
console.log("cleaned");
