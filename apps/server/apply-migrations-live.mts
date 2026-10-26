/**
 * One-off: apply the raw-SQL migrations to the LIVE dev database.
 * Mirrors test/helpers.ts applySchema(), additionally tolerating
 * "already exists" so already-applied statements are skipped safely.
 * Prints every skipped statement class; fails loudly on anything else.
 */
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const DB_PATH = "C:\\ProgramData\\MediBill\\data\\medibill.db";
const MIGRATIONS_DIR = join(import.meta.dirname, "src", "db", "migrations");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
let applied = 0, skipped = 0;
for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
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
      applied++;
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (/duplicate column name|already exists/i.test(msg)) {
        skipped++;
        continue;
      }
      console.error(`FAILED in ${file}: ${msg}\nstmt: ${stmt.slice(0, 120)}`);
      throw err;
    }
  }
  console.log(`${file}: ok`);
}
sqlite.close();
console.log(`applied=${applied} skipped(already-present)=${skipped}`);
