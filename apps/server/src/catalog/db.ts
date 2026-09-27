/**
 * Medicine catalog — server-side search over the large reference dataset plus
 * the curated pharmacy-staples dataset.
 *
 * Why this exists: the catalog used to be a 37 MB `medicineCatalog.jsonl` that
 * every browser downloaded and `JSON.parse`d row-by-row (243,578 calls). That
 * cost ~1.3 s locally and ~51 s over a tunnel, plus ~143 MB of JS heap.
 * Searching is now an indexed SQLite query on the server, so the wire payload
 * for a search is ~5 KB instead of 37 MB.
 *
 * Storage: a dedicated `catalog.db` kept SEPARATE from the user's transactional
 * database, so the user's own DB and backups stay small and the catalog can be
 * rebuilt or replaced independently.
 *
 * Indexing: FTS5 with the `trigram` tokenizer. This matters — the default
 * `unicode61` tokenizer only matches whole/prefix tokens, so a pharmacist
 * searching "cillin" would find brand names like "B Cillin" but MISS
 * "Amoxycillin". Trigram gives true substring matching on an index (0-1 ms),
 * at the cost of requiring >= 3 characters; shorter queries fall back to LIKE.
 */

import Database from "better-sqlite3";
import { existsSync, statSync, readFileSync, mkdirSync, rmSync, renameSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { DATA_DIR } from "../db/index.js";

const here = fileURLToPath(new URL(".", import.meta.url));

export const CATALOG_DB_PATH = join(DATA_DIR, "catalog.db");

/** Reference datasets are indexed together into the isolated catalog database. */
function resolveSources(): string[] {
  const curated = join(here, "../../../../data/curatedMedicineCatalog.jsonl");
  const primary = [
    process.env.CATALOG_SOURCE,
    join(here, "../../../../data/medicineCatalog.jsonl"),
    join(here, "../../../data/medicineCatalog.jsonl"),
    join(here, "../../../../public/medicineCatalog.jsonl"),
    join(here, "../../../../dist/medicineCatalog.jsonl"),
  ].filter(Boolean) as string[];
  const packagedCurated = join(here, "../../../data/curatedMedicineCatalog.jsonl");
  const source = primary.find((p) => existsSync(p));
  return [source, curated, packagedCurated]
    .filter((p): p is string => !!p && existsSync(p))
    .filter((p, index, all) => all.indexOf(p) === index);
}

export interface CatalogRow {
  name: string;
  company: string;
  composition: string;
  pack: string;
  form: string;
  unit: string;
  price: number;
  gst: number;
}

let connection: Database.Database | null = null;
let buildPromise: Promise<void> | null = null;
let ready = false;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build(sourcePaths: string[], targetPath: string): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  // Build into a temp file so an interrupted build never leaves a half catalog.
  const tmpPath = `${targetPath}.building`;
  rmSync(tmpPath, { force: true });
  rmSync(`${tmpPath}-wal`, { force: true });
  rmSync(`${tmpPath}-shm`, { force: true });

  const started = Date.now();
  const target = new Database(tmpPath);
  try {
    target.pragma("journal_mode = OFF");
    target.pragma("synchronous = OFF");

    target.exec(`
      CREATE TABLE catalog (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT NOT NULL,
        composition TEXT NOT NULL,
        pack TEXT NOT NULL DEFAULT '',
        form TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT '',
        price REAL NOT NULL DEFAULT 0,
        gst INTEGER NOT NULL DEFAULT 5,
        lname TEXT NOT NULL,
        lcompany TEXT NOT NULL,
        lcomposition TEXT NOT NULL
      );
    `);

    const insert = target.prepare(
      `INSERT INTO catalog (name, company, composition, pack, form, unit, price, gst, lname, lcompany, lcomposition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const seen = new Set<string>();
    let n = 0;

    const insertMany = target.transaction((chunk: string[]) => {
      for (const line of chunk) {
        if (!line.trim()) continue;
        let r: any;
        try {
          r = JSON.parse(line);
        } catch {
          continue; // skip malformed rows rather than failing the whole build
        }
        insert.run(
          r.n ?? "",
          r.c ?? "",
          r.s ?? "",
          r.p ?? "",
          r.f ?? "",
          r.u ?? "",
          typeof r.r === "number" ? r.r : 0,
          typeof r.g === "number" ? r.g : 5,
          String(r.n ?? "").toLowerCase(),
          String(r.c ?? "").toLowerCase(),
          String(r.s ?? "").toLowerCase()
        );
        n++;
      }
    });

    // Chunk to keep peak memory sane while parsing 243k lines.
    const CHUNK = 5000;
    for (const sourcePath of sourcePaths) {
      const lines = readFileSync(sourcePath, "utf8").split("\n");
      for (let i = 0; i < lines.length; i += CHUNK) {
        const uniqueLines = lines.slice(i, i + CHUNK).filter((line) => {
          if (!line.trim()) return false;
          try {
            const row = JSON.parse(line);
            const key = `${String(row.n ?? "").toLowerCase().replace(/\s+/g, " ").trim()}|${String(row.c ?? "").toLowerCase().replace(/\s+/g, " ").trim()}`;
            if (!row.n || !row.c || seen.has(key)) return false;
            seen.add(key);
            return true;
          } catch {
            return false;
          }
        });
        insertMany(uniqueLines);
      }
    }

    // Trigram index enables true substring MATCH.
    target.exec(`
      CREATE VIRTUAL TABLE catalog_fts USING fts5(
        name, company, composition,
        content='catalog', content_rowid='id', tokenize='trigram'
      );
    `);
    target.exec(`INSERT INTO catalog_fts(catalog_fts) VALUES('rebuild');`);

    target.exec(`CREATE INDEX idx_catalog_lname ON catalog(lname);`);
    target.exec(`ANALYZE;`);

    console.log(
      `[catalog] built ${n.toLocaleString()} medicines from ${sourcePaths.length} datasets in ${Date.now() - started} ms`
    );
  } finally {
    target.close();
  }

  // Swap into place atomically.
  rmSync(targetPath, { force: true });
  rmSync(`${targetPath}-wal`, { force: true });
  rmSync(`${targetPath}-shm`, { force: true });
  renameSync(tmpPath, targetPath);
}

/** True when the built catalog is missing or older than its source dataset. */
function isStale(sourcePaths: string[]): boolean {
  if (!existsSync(CATALOG_DB_PATH)) return true;
  if (sourcePaths.length === 0) return false; // no source to rebuild from; use what we have
  try {
    const catalogMtime = statSync(CATALOG_DB_PATH).mtimeMs;
    return sourcePaths.some((sourcePath) => statSync(sourcePath).mtimeMs > catalogMtime);
  } catch {
    return false;
  }
}

/** Ensure the catalog DB exists and is current. Safe to call repeatedly. */
export function ensureCatalog(): Promise<void> {
  if (ready) return Promise.resolve();
  if (buildPromise) return buildPromise;

  buildPromise = (async () => {
    const sources = resolveSources();

    if (isStale(sources)) {
      if (sources.length > 0) {
        console.log("[catalog] building search index (one-time)...");
        build(sources, CATALOG_DB_PATH);
      } else if (existsSync(CATALOG_DB_PATH)) {
        console.warn("[catalog] source dataset not found; using existing catalog.db");
      } else {
        throw new Error(
          "Medicine catalog not found. Expected data/medicineCatalog.jsonl next to the app."
        );
      }
    }

    connection = new Database(CATALOG_DB_PATH, { readonly: true, fileMustExist: true });
    connection.pragma("mmap_size = 268435456");
    ready = true;
  })().catch((err) => {
    buildPromise = null; // allow a retry on the next request
    throw err;
  });

  return buildPromise;
}

/** Kick off the (idempotent) build in the background at startup. */
export function warmCatalog(): void {
  void ensureCatalog().catch((err) => {
    console.error("[catalog] warmup failed:", err instanceof Error ? err.message : err);
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * FTS5 trigram needs >= 3 characters per token. Shorter tokens (e.g. "vit c")
 * fall back to a LIKE scan, which is fine for the first couple of keystrokes.
 */
function buildMatchQuery(query: string): string | null {
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.some((t) => t.length < 3)) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" AND ");
}

export interface SearchResult {
  rows: CatalogRow[];
  total: number;
  strategy: "fts" | "like";
}

export async function searchCatalog(query: string, limit: number): Promise<SearchResult> {
  await ensureCatalog();
  const db = connection!;

  const q = query.trim().toLowerCase();
  if (!q) return { rows: [], total: 0, strategy: "fts" };

  const match = buildMatchQuery(q);

  if (match) {
    const total = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM catalog_fts WHERE catalog_fts MATCH ?`)
        .get(match) as { c: number }
    ).c;

    const rows = db
      .prepare(
        `SELECT c.name, c.company, c.composition, c.pack, c.form, c.unit, c.price, c.gst
           FROM catalog_fts f
           JOIN catalog c ON c.id = f.rowid
          WHERE catalog_fts MATCH ?
          ORDER BY rank
          LIMIT ?`
      )
      .all(match, limit) as any[];

    return { rows: rows.map(normalize), total, strategy: "fts" };
  }

  // LIKE fallback for very short queries.
  const like = `%${q}%`;
  const where = `(lname LIKE ? OR lcompany LIKE ? OR lcomposition LIKE ?)`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM catalog WHERE ${where}`).get(like, like, like) as {
      c: number;
    }
  ).c;

  const rows = db
    .prepare(
      `SELECT name, company, composition, pack, form, unit, price, gst
         FROM catalog WHERE ${where} LIMIT ?`
    )
    .all(like, like, like, limit) as any[];

  return { rows: rows.map(normalize), total, strategy: "like" };
}

function normalize(r: any): CatalogRow {
  return {
    name: r.name,
    company: r.company,
    composition: r.composition,
    pack: r.pack,
    form: r.form,
    unit: r.unit,
    price: r.price ?? 0,
    gst: r.gst ?? 5,
  };
}

export interface CatalogStats {
  total: number;
  /** Timestamp (ms) the catalog DB was last written. */
  builtAt: number | null;
  strategy: "trigram-fts5";
}

export async function getCatalogStats(): Promise<CatalogStats> {
  await ensureCatalog();
  const db = connection!;
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM catalog`).get() as { c: number }).c;
  let builtAt: number | null = null;
  try {
    builtAt = statSync(CATALOG_DB_PATH).mtimeMs;
  } catch {
    /* ignore */
  }
  return { total, builtAt, strategy: "trigram-fts5" };
}
