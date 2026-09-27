import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { join } from "path";
import { applySchema, dbPath, seedUser, type SeededUser } from "./helpers.js";
import piRoutes from "../src/routes/productIntelligence.js";
import {
  extractStrength,
  getAlternatives,
  normalizeComposition,
} from "../src/services/productIntelligence.js";

let app: FastifyInstance;
let userA: SeededUser;
let userB: SeededUser;

/** Source medicine for the classification/ranking tests (Paracetamol 500). */
let srcId: string;
/** Exact salt match, stocked. */
let exactStockedId: string;
/** Exact salt match, zero stock (for inStock + ranking tests). */
let exactZeroId: string;
/** Same composition, different strength. */
let diffStrengthId: string;
/** 50% token overlap with source → substitutes. */
let overlap50Id: string;
/** 33% token overlap with source → excluded. */
let overlapLowId: string;
/** Same genericName, disjoint composition → substitutes. */
let genericMatchId: string;
/** Different schedule than source → excluded by default sameSchedule. */
let otherScheduleId: string;
/** Source with its own salt group for filter tests (Omeprazole). */
let filterSrcId: string;
let filterExactId: string;
let filterExpensiveId: string;
/** User B's medicine that would match user A's source. */
let foreignId: string;
/** A source with no matches at all → empty buckets shape. */
let lonelyId: string;

interface SeedMed {
  name: string;
  createdBy: string;
  genericName?: string | null;
  brand?: string | null;
  composition?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  schedule?: string | null;
  sellingPrice?: number;
  purchasePrice?: number;
  mrp?: number;
  isActive?: boolean;
  /** undefined = no batch rows; 0 = an active zero-quantity batch; >0 = stocked batch. */
  stock?: number;
  expiry?: string;
}

function seedCustom(o: SeedMed): string {
  const db = new Database(dbPath());
  const id = nanoid(16);
  const now = Date.now();
  db.prepare(
    `INSERT INTO medicines
       (id, name, generic_name, brand, composition, strength, dosage_form, schedule,
        selling_price, purchase_price, mrp, is_active, gst_rate, unit, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '12', 'Strip', ?, ?, ?)`
  ).run(
    id,
    o.name,
    o.genericName ?? null,
    o.brand ?? null,
    o.composition ?? null,
    o.strength ?? null,
    o.dosageForm ?? null,
    o.schedule ?? null,
    o.sellingPrice ?? 0,
    o.purchasePrice ?? 0,
    o.mrp ?? 0,
    o.isActive === false ? 0 : 1,
    o.createdBy,
    now,
    now
  );
  if (o.stock !== undefined) {
    db.prepare(
      `INSERT INTO batches
         (id, medicine_id, batch_no, expiry_date, mrp, purchase_price, selling_price,
          quantity, initial_quantity, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(
      nanoid(16),
      id,
      `B-${id.slice(0, 6)}`,
      o.expiry ?? "2099-12-31",
      o.mrp ?? 0,
      o.purchasePrice ?? 0,
      o.sellingPrice ?? 0,
      o.stock,
      o.stock,
      o.createdBy,
      now,
      now
    );
  }
  db.close();
  return id;
}

/**
 * A tiny reference catalog so the catalog-fallback path is testable without
 * building the full 243k-row index. Created AFTER the source datasets, so
 * `ensureCatalog()` treats it as current and never rebuilds.
 */
function seedCatalogDb(): void {
  const path = join(process.env.DATA_DIR!, "catalog.db");
  const db = new Database(path);
  db.pragma("journal_mode = OFF");
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog (
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
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS catalog_fts USING fts5(
      name, company, composition,
      content='catalog', content_rowid='id', tokenize='trigram'
    );
  `);
  const insert = db.prepare(
    `INSERT INTO catalog (name, company, composition, pack, form, unit, price, gst, lname, lcompany, lcomposition)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insert.run(
    "Paracete 500 Tablet",
    "TestCatalog Pharma",
    "Paracetamol 500mg",
    "Strip of 10",
    "Tablet",
    "Strip",
    42,
    5,
    "paracete 500 tablet",
    "testcatalog pharma",
    "paracetamol 500mg"
  );
  db.exec(`INSERT INTO catalog_fts(catalog_fts) VALUES('rebuild');`);
  db.close();
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function get(url: string, token: string) {
  const res = await app.inject({ method: "GET", url, headers: auth(token) });
  return { status: res.statusCode, body: res.json() as any };
}

async function post(url: string, token: string, payload: unknown) {
  const res = await app.inject({ method: "POST", url, headers: auth(token), payload });
  return { status: res.statusCode, body: res.json() as any };
}

function bucketIds(result: any, bucket: string): string[] {
  return (result.buckets[bucket] ?? []).map((m: any) => m.medicineId);
}

beforeAll(async () => {
  applySchema();
  userA = seedUser();
  userB = seedUser();
  seedCatalogDb();

  // ── Group 1: Paracetamol source + candidates ──────────────────────────
  srcId = seedCustom({
    name: "Paracure 500 Tablet",
    createdBy: userA.id,
    genericName: "Paracetamol",
    brand: "Paracure",
    composition: "Paracetamol 500mg",
    strength: "500 mg",
    dosageForm: "Tablet",
    schedule: "H",
    sellingPrice: 30,
    purchasePrice: 20,
    mrp: 32,
    stock: 12,
  });

  exactStockedId = seedCustom({
    name: "Para-EX 500",
    createdBy: userA.id,
    genericName: "Paracetamol",
    brand: "ParaEX",
    composition: "Paracetamol 500 mg",
    strength: "500mg",
    dosageForm: "tablet",
    schedule: "H",
    sellingPrice: 28,
    purchasePrice: 18,
    mrp: 30,
    stock: 7,
  });

  exactZeroId = seedCustom({
    name: "Para-ZERO 500",
    createdBy: userA.id,
    genericName: "Paracetamol",
    composition: "Paracetamol 500mg",
    strength: "500 mg",
    dosageForm: "Tablet",
    schedule: "H",
    sellingPrice: 25,
    purchasePrice: 15,
    mrp: 27,
    stock: 0,
  });

  diffStrengthId = seedCustom({
    name: "Para-STR 650",
    createdBy: userA.id,
    genericName: "Paracetamol",
    composition: "Paracetamol 500mg",
    strength: "650 mg",
    dosageForm: "Tablet",
    schedule: "H",
    sellingPrice: 40,
    purchasePrice: 25,
    mrp: 42,
    stock: 5,
  });

  overlap50Id = seedCustom({
    name: "Para-Caf 500",
    createdBy: userA.id,
    composition: "Paracetamol + Caffeine",
    strength: "500 mg",
    dosageForm: "Tablet",
    schedule: "H",
    sellingPrice: 45,
    purchasePrice: 30,
    mrp: 48,
    stock: 3,
  });

  overlapLowId = seedCustom({
    name: "Triple-Caf 500",
    createdBy: userA.id,
    composition: "Ibuprofen + Paracetamol + Caffeine",
    dosageForm: "Tablet",
    schedule: "H",
    sellingPrice: 50,
    purchasePrice: 35,
    mrp: 52,
    stock: 4,
  });

  genericMatchId = seedCustom({
    name: "PCM Granules",
    createdBy: userA.id,
    genericName: "paracetamol",
    composition: "Acetaminophen Granules",
    dosageForm: "Syrup",
    schedule: "H",
    sellingPrice: 55,
    purchasePrice: 40,
    mrp: 58,
    stock: 2,
  });

  otherScheduleId = seedCustom({
    name: "Para-SCHX 500",
    createdBy: userA.id,
    genericName: "Paracetamol",
    composition: "Paracetamol 500mg",
    strength: "500 mg",
    dosageForm: "Tablet",
    schedule: "X",
    sellingPrice: 35,
    purchasePrice: 22,
    mrp: 36,
    stock: 6,
  });

  // ── Group 2: Omeprazole source for filter tests ───────────────────────
  filterSrcId = seedCustom({
    name: "Omeprazole 20 Capsule",
    createdBy: userA.id,
    genericName: "Omeprazole",
    composition: "Omeprazole 20mg",
    strength: "20 mg",
    dosageForm: "Capsule",
    schedule: "H",
    sellingPrice: 100,
    purchasePrice: 70,
    mrp: 110,
    stock: 9,
  });

  filterExactId = seedCustom({
    name: "Omez 20",
    createdBy: userA.id,
    genericName: "Omeprazole",
    composition: "Omeprazole 20mg",
    strength: "20 mg",
    dosageForm: "Capsule",
    schedule: "H",
    sellingPrice: 90,
    purchasePrice: 60,
    mrp: 95,
    stock: 0,
  });

  filterExpensiveId = seedCustom({
    name: "Omez Premium 20",
    createdBy: userA.id,
    genericName: "Omeprazole",
    composition: "Omeprazole 20mg",
    strength: "20 mg",
    dosageForm: "Capsule",
    schedule: "H",
    sellingPrice: 500,
    purchasePrice: 400,
    mrp: 520,
    stock: 2,
  });

  // ── Lonely source: no other medicine shares its salt ──────────────────
  lonelyId = seedCustom({
    name: "Rarevil 7 Capsule",
    createdBy: userA.id,
    genericName: "Rarevil",
    composition: "Rarevilastine 7mg",
    strength: "7 mg",
    dosageForm: "Capsule",
    schedule: "H",
    sellingPrice: 80,
    purchasePrice: 50,
    mrp: 85,
    stock: 1,
  });

  // ── User B's look-alike (must never leak into user A's results) ───────
  foreignId = seedCustom({
    name: "Foreign Para 500",
    createdBy: userB.id,
    genericName: "Paracetamol",
    composition: "Paracetamol 500mg",
    strength: "500 mg",
    dosageForm: "Tablet",
    schedule: "H",
    sellingPrice: 31,
    purchasePrice: 21,
    mrp: 33,
    stock: 15,
  });

  app = Fastify({ logger: false });
  await app.register(piRoutes, { prefix: "/api/product-intelligence" });
});

// ─────────────────────────────────────────────────────────────────────────
describe("normalizeComposition", () => {
  it("strips strength/dosage tokens and compares order-insensitively", () => {
    const a = normalizeComposition("Paracetamol 500mg + Caffeine 65mg");
    const b = normalizeComposition("paracetamol + caffeine");
    expect(a).toEqual(["caffeine", "paracetamol"]);
    expect(a).toEqual(b);
    // Reversed order must not matter — tokens are sorted + unique.
    expect(normalizeComposition("Caffeine 65mg + Paracetamol 500mg")).toEqual(a);
  });

  it("drops dosage-form stopwords and dedupes repeated tokens", () => {
    expect(normalizeComposition("Aspirin Tablet 75 mg Tablet")).toEqual(["aspirin"]);
    expect(normalizeComposition("Amoxicillin + Clavulanic Acid / Potassium")).toEqual([
      "acid",
      "amoxicillin",
      "clavulanic",
      "potassium",
    ]);
    expect(normalizeComposition("")).toEqual([]);
    expect(normalizeComposition(null)).toEqual([]);
  });
});

describe("extractStrength", () => {
  it("prefers the strength field", () => {
    expect(extractStrength({ strength: "500 mg", name: "Anything 20mg" })).toEqual({
      value: 500,
      unit: "mg",
    });
  });

  it("falls back to name/composition when strength is absent", () => {
    expect(extractStrength({ strength: null, name: "Zincovit 20mg Syrup", composition: null })).toEqual({
      value: 20,
      unit: "mg",
    });
    expect(extractStrength({ strength: "", name: "Dolo 650", composition: "Paracetamol" })).toBeNull();
    expect(extractStrength({ strength: null, name: null, composition: null })).toBeNull();
  });
});

describe("getAlternatives — classification", () => {
  it("buckets exact salt match first, strength mismatch into sameComposition", async () => {
    const result = await getAlternatives(userA.id, srcId, {});
    expect(result).not.toBeNull();
    expect(bucketIds(result, "exactSalt")).toContain(exactStockedId);
    expect(bucketIds(result, "exactSalt")).toContain(exactZeroId);
    expect(bucketIds(result, "exactSalt")).not.toContain(srcId); // never the source itself
    expect(bucketIds(result, "sameComposition")).toContain(diffStrengthId);
    expect(bucketIds(result, "exactSalt")).not.toContain(diffStrengthId);
  });

  it("puts >=50% composition overlap into substitutes with a score; excludes <50%", async () => {
    const result = await getAlternatives(userA.id, srcId, {});
    const subs = result!.buckets.substitutes;
    const sub50 = subs.find((m) => m.medicineId === overlap50Id);
    expect(sub50).toBeTruthy();
    expect(sub50!.score).toBeGreaterThanOrEqual(0.5);
    expect(bucketIds(result, "substitutes")).not.toContain(overlapLowId);
    expect(bucketIds(result, "substitutes")).not.toContain(filterExactId); // different salt entirely
  });

  it("matches a case-insensitive genericName even when composition tokens are disjoint", async () => {
    const result = await getAlternatives(userA.id, srcId, {});
    const gen = result!.buckets.substitutes.find((m) => m.medicineId === genericMatchId);
    expect(gen).toBeTruthy();
    expect(gen!.score).toBeGreaterThanOrEqual(0.5);
  });

  it("annotates each candidate with stock, margin and nearest expiry", async () => {
    const result = await getAlternatives(userA.id, srcId, {});
    const exact = result!.buckets.exactSalt.find((m) => m.medicineId === exactStockedId)!;
    expect(exact.name).toBe("Para-EX 500");
    expect(exact.stockPacks).toBe(7);
    expect(exact.nearestExpiry).toBe("2099-12-31");
    expect(exact.sellingPrice).toBe(28);
    expect(exact.purchasePrice).toBe(18);
    expect(exact.marginPercent).toBeCloseTo(((28 - 18) / 28) * 100, 1);
    expect(result!.source.medicineId).toBe(srcId);
    expect(result!.source.compositionTokens).toContain("paracetamol");
  });
});

describe("getAlternatives — filters and ranking", () => {
  it("inStock=true excludes zero-stock candidates", async () => {
    const result = await getAlternatives(userA.id, srcId, { inStock: true });
    expect(bucketIds(result, "exactSalt")).toContain(exactStockedId);
    expect(bucketIds(result, "exactSalt")).not.toContain(exactZeroId);
  });

  it("maxPrice filters out candidates priced above the cap", async () => {
    const result = await getAlternatives(userA.id, filterSrcId, { maxPrice: 200 });
    expect(bucketIds(result, "exactSalt")).toContain(filterExactId);
    expect(bucketIds(result, "exactSalt")).not.toContain(filterExpensiveId);
  });

  it("sameSchedule defaults to true and excludes other schedules", async () => {
    const withDefault = await getAlternatives(userA.id, srcId, {});
    expect(bucketIds(withDefault, "exactSalt")).not.toContain(otherScheduleId);

    const relaxed = await getAlternatives(userA.id, srcId, { sameSchedule: false });
    expect(bucketIds(relaxed, "exactSalt")).toContain(otherScheduleId);
  });

  it("ranks stocked candidates above zero-stock ones inside a bucket", async () => {
    const result = await getAlternatives(userA.id, srcId, {});
    const ids = bucketIds(result, "exactSalt");
    expect(ids.indexOf(exactStockedId)).toBeLessThan(ids.indexOf(exactZeroId));
  });
});

describe("explicit substitute links", () => {
  it("stores a link once (unique) and surfaces it first with explicit=true", async () => {
    const first = await post("/api/product-intelligence/substitutes", userA.token, {
      medicineId: srcId,
      substituteMedicineId: overlapLowId,
      reason: "pharmacist reviewed",
    });
    expect(first.status).toBe(201);
    expect(first.body.data.created).toBe(true);

    // Duplicate insert is ignored by the unique constraint.
    const dup = await post("/api/product-intelligence/substitutes", userA.token, {
      medicineId: srcId,
      substituteMedicineId: overlapLowId,
      reason: "duplicate attempt",
    });
    expect(dup.status).toBe(201);
    expect(dup.body.data.created).toBe(false);

    const links = await get(
      `/api/product-intelligence/links?medicineId=${srcId}`,
      userA.token
    );
    expect(links.status).toBe(200);
    expect(links.body.data).toHaveLength(1);
    expect(links.body.data[0].reason).toBe("pharmacist reviewed");

    // The explicit link wins a place in substitutes — even though its
    // composition overlap alone would have been below the 50% threshold.
    const result = await getAlternatives(userA.id, srcId, {});
    const subs = result!.buckets.substitutes;
    expect(subs[0].medicineId).toBe(overlapLowId);
    expect(subs[0].explicit).toBe(true);
    expect(bucketIds(result, "exactSalt")).not.toContain(overlapLowId);
  });

  it("keeps explicit links tenant-scoped: user B cannot link user A's medicines", async () => {
    const res = await post("/api/product-intelligence/substitutes", userB.token, {
      medicineId: srcId,
      substituteMedicineId: foreignId,
      reason: "cross tenant",
    });
    expect(res.status).toBe(404);
  });
});

describe("getAlternatives — tenant isolation and empty shape", () => {
  it("never returns another tenant's medicine", async () => {
    const result = await getAlternatives(userA.id, srcId, { sameSchedule: false });
    const all = [
      ...bucketIds(result, "exactSalt"),
      ...bucketIds(result, "sameComposition"),
      ...bucketIds(result, "substitutes"),
    ];
    expect(all).not.toContain(foreignId);
    expect(all).not.toContain(srcId);
  });

  it("returns null for a foreign or unknown medicineId (route maps to 404)", async () => {
    expect(await getAlternatives(userA.id, foreignId, {})).toBeNull();
    expect(await getAlternatives(userA.id, "does-not-exist", {})).toBeNull();
    expect(await getAlternatives(userB.id, srcId, {})).toBeNull();
  });

  it("returns the documented empty shape when nothing matches", async () => {
    const result = await getAlternatives(userA.id, lonelyId, {});
    expect(result).toEqual({
      source: expect.objectContaining({ medicineId: lonelyId }),
      buckets: { exactSalt: [], sameComposition: [], substitutes: [] },
    });
  });
});

describe("GET /api/product-intelligence/alternatives", () => {
  it("returns buckets for a valid medicine", async () => {
    const { status, body } = await get(
      `/api/product-intelligence/alternatives?medicineId=${srcId}`,
      userA.token
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.source.medicineId).toBe(srcId);
    expect(Array.isArray(body.data.buckets.exactSalt)).toBe(true);
    expect(bucketIds(body.data, "exactSalt")).toContain(exactStockedId);
  });

  it("404s a foreign medicineId", async () => {
    const { status, body } = await get(
      `/api/product-intelligence/alternatives?medicineId=${srcId}`,
      userB.token
    );
    expect(status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("404s an unknown medicineId", async () => {
    const { status } = await get(
      "/api/product-intelligence/alternatives?medicineId=nope",
      userA.token
    );
    expect(status).toBe(404);
  });

  it("400s a missing medicineId", async () => {
    const { status } = await get("/api/product-intelligence/alternatives", userA.token);
    expect(status).toBe(400);
  });
});

describe("GET /api/product-intelligence/search", () => {
  it("returns tenant stock matches with stockPacks and source:stock", async () => {
    const { status, body } = await get(
      "/api/product-intelligence/search?q=para-ex",
      userA.token
    );
    expect(status).toBe(200);
    const row = body.data.stock.find((s: any) => s.medicineId === exactStockedId);
    expect(row).toBeTruthy();
    expect(row.source).toBe("stock");
    expect(row.stockPacks).toBe(7);
    expect(row.inStock).toBe(true);
    expect(row.compositionTokens).toContain("paracetamol");
  });

  it("does not leak other tenants' stock rows", async () => {
    const { body } = await get(
      "/api/product-intelligence/search?q=foreign",
      userA.token
    );
    const ids = body.data.stock.map((s: any) => s.medicineId);
    expect(ids).not.toContain(foreignId);
  });

  it("falls back to the reference catalog marked source:catalog", async () => {
    const { status, body } = await get(
      "/api/product-intelligence/search?q=paracete",
      userA.token
    );
    expect(status).toBe(200);
    expect(body.data.stock).toHaveLength(0);
    const cat = body.data.catalog.find((c: any) => c.name === "Paracete 500 Tablet");
    expect(cat).toBeTruthy();
    expect(cat.source).toBe("catalog");
    expect(cat.stockPacks).toBe(0);
    expect(cat.inStock).toBe(false);
    expect(cat.compositionTokens).toContain("paracetamol");
  });

  it("returns both lists as empty for an empty query", async () => {
    const { status, body } = await get("/api/product-intelligence/search?q=", userA.token);
    expect(status).toBe(200);
    expect(body.data).toEqual({ stock: [], catalog: [] });
  });

  it("filters stock by composition when composition= is supplied", async () => {
    const { body } = await get(
      "/api/product-intelligence/search?q=ome&composition=Omeprazole",
      userA.token
    );
    const ids = body.data.stock.map((s: any) => s.medicineId);
    expect(ids).toContain(filterSrcId);
    expect(ids).not.toContain(srcId);
  });
});

describe("GET /api/product-intelligence/links", () => {
  it("requires a medicineId", async () => {
    const { status } = await get("/api/product-intelligence/links", userA.token);
    expect(status).toBe(400);
  });

  it("returns links scoped to the tenant", async () => {
    const mine = await get(`/api/product-intelligence/links?medicineId=${srcId}`, userA.token);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);

    const theirs = await get(`/api/product-intelligence/links?medicineId=${srcId}`, userB.token);
    expect(theirs.status).toBe(200);
    expect(theirs.body.data).toHaveLength(0);
  });
});
