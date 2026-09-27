import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { applySchema, dbPath, seedMedicine, seedUser, type SeededUser } from "./helpers.js";
import labelRoutes from "../src/routes/labels.js";

let app: FastifyInstance;
let ctx: SeededUser;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function raw() {
  return new Database(dbPath());
}

/** Patch arbitrary medicine columns (barcode/brand/pack/mrp) — seedMedicine only covers stock. */
function setMedicineFields(id: string, fields: Record<string, string | number | null>): void {
  const keys = Object.keys(fields);
  const db = raw();
  db.prepare(`UPDATE medicines SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(
    ...keys.map((k) => fields[k]),
    id
  );
  db.close();
}

/** Upsert the global store_name setting exactly like the settings route stores it (raw string). */
function setStoreName(value: string): void {
  const db = raw();
  db.prepare(
    `INSERT INTO settings (id, key, value, updated_at)
     VALUES (?, 'store_name', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(nanoid(16), value, Date.now());
  db.close();
}

const templates = (token: string) =>
  app.inject({ method: "GET", url: "/api/labels/templates", headers: auth(token) });

const preview = (token: string, body: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/api/labels/preview", headers: auth(token), payload: body as any });

beforeAll(async () => {
  applySchema();
  ctx = seedUser();
  setStoreName("City Care Pharmacy");
  app = Fastify({ logger: false });
  await app.register(labelRoutes, { prefix: "/api/labels" });
});

describe("GET /api/labels/templates", () => {
  it("returns the three built-in templates with sheet dimensions", async () => {
    const res = await templates(ctx.token);
    expect(res.statusCode).toBe(200);
    const list = res.json().data as any[];
    const ids = list.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["40x25mm", "50x30mm", "A4-24"]));

    const small = list.find((t) => t.id === "40x25mm");
    expect(small).toMatchObject({ widthMm: 40, heightMm: 25, cols: 4, rows: 10, perSheet: 40 });
  });

  it("every template fits the printable A4 area (180x273mm with 2mm gutters)", async () => {
    const list = (await templates(ctx.token)).json().data as any[];
    expect(list.length).toBe(3);
    const GUTTER_MM = 2; // must match the `gap: 2mm` on .label-sheet in src/index.css
    const PAGE_W = 180; // A4 210mm minus the app-wide @page margin of 15mm each side
    const PAGE_H = 273; // A4 297mm minus the app-wide @page margin of 12mm top/bottom
    for (const t of list) {
      expect(t.perSheet).toBe(t.cols * t.rows);
      expect(t.cols * t.widthMm + (t.cols - 1) * GUTTER_MM).toBeLessThanOrEqual(PAGE_W);
      expect(t.rows * t.heightMm + (t.rows - 1) * GUTTER_MM).toBeLessThanOrEqual(PAGE_H);
      // and still within the bare sheet as a belt-and-braces check
      expect(t.cols * t.widthMm).toBeLessThanOrEqual(210);
      expect(t.rows * t.heightMm).toBeLessThanOrEqual(297);
    }
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/labels/templates" });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/labels/preview — label content", () => {
  it("returns one label per unit of quantity and echoes the requested template dims", async () => {
    const med = seedMedicine(ctx.id, { name: "PARACETAMOL 650" });
    const res = await preview(ctx.token, {
      items: [
        { medicineId: med.medicineId, quantity: 3, template: "40x25mm" },
        { medicineId: med.medicineId, quantity: 2, template: "40x25mm" },
      ],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.totalLabels).toBe(5);
    expect(body.labels).toHaveLength(5);
    expect(body.template).toMatchObject({
      id: "40x25mm",
      widthMm: 40,
      heightMm: 25,
      cols: 4,
      rows: 10,
      perSheet: 40,
    });
  });

  it("carries name (truncated with full name preserved), brand and pack", async () => {
    const longName = "Dolo 650 Extra Strength Paracetamol Prolonged Release Tablets";
    const med = seedMedicine(ctx.id, { name: "placeholder" });
    setMedicineFields(med.medicineId, {
      name: longName,
      brand: "Micro Labs",
      pack_size: "15x10",
    });

    const res = await preview(ctx.token, {
      items: [{ medicineId: med.medicineId, quantity: 1, template: "50x30mm" }],
    });
    expect(res.statusCode).toBe(200);
    const label = (res.json().data as any).labels[0];
    expect(label.fullName).toBe(longName);
    expect(label.name.length).toBeLessThanOrEqual(29);
    expect(label.name.endsWith("…")).toBe(true);
    expect(label.name).toBe(longName.slice(0, 28) + "…");
    expect(label.brand).toBe("Micro Labs");
    expect(label.pack).toBe("15x10");
    expect((res.json().data as any).template).toMatchObject({ id: "50x30mm", widthMm: 50, heightMm: 30 });
  });

  it("uses batch MRP over medicine MRP and formats expiry as MM/YY", async () => {
    const med = seedMedicine(ctx.id, { name: "Azithral 500", expiry: "2027-12-31", mrp: 100 });
    setMedicineFields(med.medicineId, { mrp: 88 });

    const res = await preview(ctx.token, {
      items: [
        { medicineId: med.medicineId, batchId: med.batchId, quantity: 1, template: "40x25mm" },
      ],
    });
    expect(res.statusCode).toBe(200);
    const label = (res.json().data as any).labels[0];
    expect(label.batchNo).toBe("B1");
    expect(label.expiry).toBe("12/27");
    expect(label.mrp).toBe(100);
  });

  it("falls back to the medicine MRP with no batch info when batchId is omitted", async () => {
    const med = seedMedicine(ctx.id, { name: "Crocin Advance", mrp: 100 });
    setMedicineFields(med.medicineId, { mrp: 88 });

    const res = await preview(ctx.token, {
      items: [{ medicineId: med.medicineId, quantity: 1, template: "40x25mm" }],
    });
    const label = (res.json().data as any).labels[0];
    expect(label.batchNo).toBeNull();
    expect(label.expiry).toBeNull();
    expect(label.mrp).toBe(88);
  });

  it("flags missing barcodes (barcode null) and passes stored barcodes through", async () => {
    const without = seedMedicine(ctx.id, { name: "No Barcode Med" });
    const withCode = seedMedicine(ctx.id, { name: "Barcoded Med" });
    setMedicineFields(withCode.medicineId, { barcode: "8901234567890" });

    const res = await preview(ctx.token, {
      items: [
        { medicineId: without.medicineId, quantity: 1, template: "40x25mm" },
        { medicineId: withCode.medicineId, quantity: 1, template: "40x25mm" },
      ],
    });
    const [a, b] = (res.json().data as any).labels;
    expect(a.barcode).toBeNull();
    expect(a.needsBarcode).toBe(true);
    expect(b.barcode).toBe("8901234567890");
    expect(b.needsBarcode).toBe(false);
  });

  it("pulls the store name from the settings table (raw string value)", async () => {
    setStoreName("City Care Pharmacy");
    const med = seedMedicine(ctx.id, { name: "Store Name Med" });
    const res = await preview(ctx.token, {
      items: [{ medicineId: med.medicineId, quantity: 1, template: "40x25mm" }],
    });
    expect((res.json().data as any).labels[0].storeName).toBe("City Care Pharmacy");
  });

  it("accepts a JSON-wrapped store_name value as well", async () => {
    setStoreName(JSON.stringify("Wrapped Pharmacy"));
    const med = seedMedicine(ctx.id, { name: "JSON Store Med" });
    const res = await preview(ctx.token, {
      items: [{ medicineId: med.medicineId, quantity: 1, template: "40x25mm" }],
    });
    expect((res.json().data as any).labels[0].storeName).toBe("Wrapped Pharmacy");
    setStoreName("City Care Pharmacy");
  });

  it("includeBatch:false drops batch/expiry and uses the medicine MRP", async () => {
    const med = seedMedicine(ctx.id, { name: "Batchless", expiry: "2027-12-31", mrp: 100 });
    setMedicineFields(med.medicineId, { mrp: 77 });

    const res = await preview(ctx.token, {
      items: [
        { medicineId: med.medicineId, batchId: med.batchId, quantity: 1, template: "40x25mm" },
      ],
      includeBatch: false,
    });
    expect(res.statusCode).toBe(200);
    const label = (res.json().data as any).labels[0];
    expect(label.batchNo).toBeNull();
    expect(label.expiry).toBeNull();
    expect(label.mrp).toBe(77);
  });
});

describe("POST /api/labels/preview — validation", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    medicineId: seedMedicine(ctx.id, { name: "Validate Med" }).medicineId,
    quantity: 1,
    template: "40x25mm",
    ...over,
  });

  it("rejects quantity 0 with 400", async () => {
    const res = await preview(ctx.token, { items: [item({ quantity: 0 })] });
    expect(res.statusCode).toBe(400);
  });

  it("rejects quantity above 500 with 400", async () => {
    const res = await preview(ctx.token, { items: [item({ quantity: 501 })] });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-integer quantity with 400", async () => {
    const res = await preview(ctx.token, { items: [item({ quantity: 1.5 })] });
    expect(res.statusCode).toBe(400);
  });

  it("accepts the quantity boundary of 500", async () => {
    const res = await preview(ctx.token, { items: [item({ quantity: 500 })] });
    expect(res.statusCode).toBe(200);
    expect((res.json().data as any).totalLabels).toBe(500);
    expect((res.json().data as any).labels).toHaveLength(500);
  });

  it("rejects an unknown template with 400", async () => {
    const res = await preview(ctx.token, { items: [item({ template: "10x10mm" })] });
    expect(res.statusCode).toBe(400);
  });

  it("rejects mixing templates in one preview with 400", async () => {
    const res = await preview(ctx.token, {
      items: [item({ template: "40x25mm" }), item({ template: "A4-24" })],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/template/i);
  });

  it("rejects an empty items array with 400", async () => {
    const res = await preview(ctx.token, { items: [] });
    expect(res.statusCode).toBe(400);
  });

  it("404s a medicine the tenant does not own", async () => {
    const other = seedUser();
    const foreign = seedMedicine(other.id, { name: "Not Mine" });
    const res = await preview(ctx.token, {
      items: [item({ medicineId: foreign.medicineId })],
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s a batch the tenant does not own", async () => {
    const other = seedUser();
    const foreign = seedMedicine(other.id, { name: "Foreign Batch Med" });
    const res = await preview(ctx.token, {
      items: [item({ batchId: foreign.batchId })],
    });
    expect(res.statusCode).toBe(404);
  });

  it("400s a batch that belongs to a different medicine", async () => {
    const mine = seedMedicine(ctx.id, { name: "Owner Med" });
    const otherBatch = seedMedicine(ctx.id, { name: "Other Med" });
    const res = await preview(ctx.token, {
      items: [item({ medicineId: mine.medicineId, batchId: otherBatch.batchId })],
    });
    expect(res.statusCode).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/labels/preview",
      payload: { items: [{ medicineId: "x", quantity: 1, template: "40x25mm" }] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("tenant scoping", () => {
  it("user B cannot build labels from user A's medicine", async () => {
    const a = seedUser();
    const theirMed = seedMedicine(a.id, { name: "A's medicine" });

    const visible = await preview(a.token, {
      items: [{ medicineId: theirMed.medicineId, quantity: 1, template: "40x25mm" }],
    });
    expect(visible.statusCode).toBe(200);

    const b = seedUser();
    const denied = await preview(b.token, {
      items: [{ medicineId: theirMed.medicineId, quantity: 1, template: "40x25mm" }],
    });
    expect(denied.statusCode).toBe(404);
  });
});
