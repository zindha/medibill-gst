import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import * as schema from "./schema/index.js";
import { foldText } from "../lib/normalizeSearch.js";

// Data directory
const DATA_DIR =
  process.env.DATA_DIR ?? join(process.env.PROGRAM_DATA ?? "C:\\ProgramData\\MediBill", "data");
const DB_PATH = join(DATA_DIR, "medibill.db");

// Ensure directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Create SQLite connection
const sqlite = new Database(DB_PATH);

// Academic-accent-folding scalar function so search can compare folded text on both sides.
// e.g. `WHERE fold(medicines.name) LIKE '%paracetamol%'` matches accented/abbreviated names.
sqlite.function("fold", { deterministic: true }, (value: unknown) =>
  typeof value === "string" ? foldText(value) : ""
);

// Subsequence matcher over folded text (both args folded internally). Lets abbreviated
// queries like "pmol" surface "paracetamol". `''` is a subsequence of everything.
sqlite.function(
  "is_subseq",
  { deterministic: true },
  (needle: unknown, haystack: unknown) => {
    const n = foldText(typeof needle === "string" ? needle : "");
    const h = foldText(typeof haystack === "string" ? haystack : "");
    if (!n) return 1;
    if (!h) return 0;
    let i = 0;
    for (let j = 0; j < h.length && i < n.length; j++) {
      if (n[i] === h[j]) i++;
    }
    return i === n.length ? 1 : 0;
  }
);

// Enable WAL mode for better concurrent performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("temp_store = MEMORY");
sqlite.pragma("mmap_size = 268435456"); // 256MB

// Create Drizzle instance with schema
export const db = drizzle(sqlite, { schema });
export function withTransaction<T>(fn: Parameters<typeof db.transaction>[0]): T {
  return (db.transaction(fn) as unknown) as T;
}

// Export DB path for backup operations
export { DB_PATH, DATA_DIR };
