import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import {
  applySchema,
  dbPath,
  seedMedicine,
  seedUser,
  type SeededUser,
} from "./helpers.js";
import purchaseImportRoutes from "../src/routes/purchaseImports.js";
import fileRoutes from "../src/routes/files.js";
import { extractHeaderFields, extractOcrRows } from "../src/services/ocrExtract.js";

let app: FastifyInstance;
let userA: SeededUser;
let userB: SeededUser;
let doloId: string;

function raw() {
  return new Database(dbPath());
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(url: string, token: string | null, payload: unknown) {
  const res = await app.inject({
    method: "POST",
    url,
    headers: token ? auth(token) : {},
    payload,
  });
  return { status: res.statusCode, body: res.json() as any };
}

async function get(url: string, token: string | null) {
  const res = await app.inject({
    method: "GET",
    url,
    headers: token ? auth(token) : {},
  });
  return { status: res.statusCode, body: res.json() as any };
}

async function put(url: string, token: string, payload: unknown) {
  const res = await app.inject({
    method: "PUT",
    url,
    headers: auth(token),
    payload,
  });
  return { status: res.statusCode, body: res.json() as any };
}

async function del(url: string, token: string) {
  const res = await app.inject({ method: "DELETE", url, headers: auth(token) });
  return { status: res.statusCode, body: res.json() as any };
}

/** Realistic multi-line OCR invoice: supplier header, bill no/date, spaced rows. */
const OCR_INVOICE = [
  "SHREE PHARMA DISTRIBUTORS",
  "GSTIN: 27AAACS9603R1ZV",
  "Supplier: SHREE PHARMA DISTRIBUTORS",
  "Bill No: INV-2026-0917",
  "Bill Date: 12/09/2026",
  "DOLO 650  10  45.00  12",
  "AZITHROMYCIN 500  5  80.00  5",
  "     10  120.00  12",
  "Grand Total: Rs. 1650.00",
].join("\n");

/** OCR text without a bill date line (for the low-confidence header case). */
const OCR_WITHOUT_DATE = [
  "ACME PHARMA DISTRIBUTORS",
  "Supplier: ACME PHARMA DISTRIBUTORS",
  "Bill No: INV-8891",
  "DOLO 650  10  45.00  12",
].join("\n");

/** Clean single-row OCR bill used by the commit test. */
const OCR_CLEAN = [
  "ACME PHARMA DISTRIBUTORS",
  "Supplier: ACME PHARMA DISTRIBUTORS",
  "Bill No: OCR-BILL-1",
  "Bill Date: 2026-09-12",
  "DOLO 650  10  45.00  12",
].join("\n");

const IMAGE_BYTES = Buffer.from("fake invoice image bytes for OCR tests");

function b64(buf: Buffer): string {
  return buf.toString("base64");
}

async function uploadFile(token: string, bytes: Buffer = IMAGE_BYTES) {
  return post("/api/files", token, {
    filename: "invoice.png",
    contentType: "image/png",
    data: b64(bytes),
  });
}

beforeAll(async () => {
  applySchema();
  userA = seedUser();
  userB = seedUser();
  doloId = seedMedicine(userA.id, { name: "DOLO 650" }).medicineId;

  app = Fastify({ logger: false });
  await app.register(purchaseImportRoutes, { prefix: "/api/purchase-imports" });
  await app.register(fileRoutes, { prefix: "/api/files" });
});

describe("extractHeaderFields", () => {
  it("reads bill no, bill date and supplier with strong confidence", () => {
    const header = extractHeaderFields(OCR_INVOICE);
    expect(header.billNo.value).toBe("INV-2026-0917");
    expect(header.billNo.confidence).toBeGreaterThan(0.8);
    expect(header.billDate.value).toBe("2026-09-12");
    expect(header.billDate.confidence).toBeGreaterThan(0.8);
    expect(header.supplierName.value).toBe("SHREE PHARMA DISTRIBUTORS");
    expect(header.supplierName.confidence).toBeGreaterThanOrEqual(0.6);
    expect(header.total.value).toBe("1650.00");
  });

  it("returns low confidence (<= 0.5) when fields are absent", () => {
    const header = extractHeaderFields("HELLO WORLD\nplain description text here");
    expect(header.billNo.value).toBeNull();
    expect(header.billNo.confidence).toBeLessThanOrEqual(0.5);
    expect(header.billDate.value).toBeNull();
    expect(header.billDate.confidence).toBeLessThanOrEqual(0.5);
    expect(header.supplierName.confidence).toBeLessThanOrEqual(0.6);
  });

  it("uses weak confidence (0.6) for an id-like token without a bill label", () => {
    const header = extractHeaderFields("Payment record\nXY-998811\nTotal: 500");
    expect(header.billNo.value).toBe("XY-998811");
    expect(header.billNo.confidence).toBeGreaterThanOrEqual(0.5);
    expect(header.billNo.confidence).toBeLessThan(0.8);
  });
});

describe("extractOcrRows", () => {
  it("parses spaced line items into product / quantity / rate / gst", () => {
    const rows = extractOcrRows(OCR_INVOICE);
    expect(rows.length).toBeGreaterThanOrEqual(3);

    const dolo = rows.find((r) => r.product.includes("DOLO"));
    expect(dolo).toBeTruthy();
    expect(dolo!.quantity).toBe(10);
    expect(dolo!.rate).toBe(45);
    expect(dolo!.gstRate).toBe(12);
    expect(dolo!.confidence).toBeGreaterThan(0);

    const azith = rows.find((r) => r.product.includes("AZITHROMYCIN"));
    expect(azith).toBeTruthy();
    expect(azith!.quantity).toBe(5);
    expect(azith!.rate).toBe(80);
    expect(azith!.gstRate).toBe(5);
  });

  it("emits a zero-confidence row when the product cell is missing", () => {
    const rows = extractOcrRows(OCR_INVOICE);
    const bad = rows.find((r) => r.product === "");
    expect(bad).toBeTruthy();
    expect(bad!.confidence).toBe(0);
    expect(bad!.quantity).toBe(10);
    expect(bad!.rate).toBe(120);
  });

  it("detects batch and expiry cells and marks full confidence", () => {
    const rows = extractOcrRows("CROCN 650  CB789  09/27  10  45.00  12");
    expect(rows).toHaveLength(1);
    expect(rows[0].product).toBe("CROCN 650");
    expect(rows[0].batchNo).toBe("CB789");
    expect(rows[0].expiryDate).toBe("09/27");
    expect(rows[0].quantity).toBe(10);
    expect(rows[0].rate).toBe(45);
    expect(rows[0].confidence).toBeCloseTo(0.85, 5);
  });

  it("skips header and footer lines that are not items", () => {
    const rows = extractOcrRows(OCR_INVOICE);
    expect(rows.some((r) => r.product.includes("TOTAL"))).toBe(false);
    expect(rows.some((r) => r.product.includes("GSTIN"))).toBe(false);
    expect(rows.some((r) => r.product.includes("Bill"))).toBe(false);
  });
});

describe("POST /api/purchase-imports/ocr", () => {
  it("creates an OCR session with header confidence, parsed rows and source metadata", async () => {
    const { status, body } = await post("/api/purchase-imports/ocr", userA.token, {
      filename: "invoice.jpg",
      text: OCR_INVOICE,
    });
    expect(status).toBe(201);
    const session = body.data;

    expect(session.importId).toBeTruthy();
    expect(session.source).toBe("ocr");
    expect(session.filename).toBe("invoice.jpg");
    expect(session.headerFields.billNo.value).toBe("INV-2026-0917");
    expect(session.headerFields.billNo.confidence).toBeGreaterThan(0.8);
    expect(session.headerFields.billDate.value).toBe("2026-09-12");
    expect(session.headerFields.supplierName.value).toBe("SHREE PHARMA DISTRIBUTORS");
    expect(session.fileId).toBeUndefined();

    // Pseudo columns are named after target fields so they auto-map.
    expect(session.columns).toEqual([
      "product",
      "quantity",
      "purchase_rate",
      "gst_rate",
      "batch",
      "expiry",
      "ocr_confidence",
    ]);
    expect(session.mappings.product).toBe("product");
    expect(session.mappings.quantity).toBe("quantity");
    expect(session.mappings.purchase_rate).toBe("purchase_rate");

    expect(session.rows.length).toBeGreaterThanOrEqual(3);
    const dolo = session.rows.find((r: any) => r.normalized?.product?.includes("DOLO"));
    expect(dolo.normalized.quantity).toBe(10);
    expect(dolo.normalized.purchaseRate).toBe(45);
    expect(dolo.normalized.gstRate).toBe("12");
    expect(dolo.medicineId).toBe(doloId);

    // The product-less row carries errors and flips the row status.
    const bad = session.rows.find((r: any) => r.raw.product === "");
    expect(bad).toBeTruthy();
    expect(
      bad.issues.some((i: any) => i.field === "product" && i.severity === "error")
    ).toBe(true);
    expect(bad.status).toBe("error");
    expect(session.errors).toBeGreaterThan(0);

    const db = raw();
    const record = db
      .prepare("SELECT source, file_id, header_fields FROM purchase_imports WHERE id = ?")
      .get(session.importId) as any;
    db.close();
    expect(record.source).toBe("ocr");
    expect(record.file_id).toBeNull();
    const stored = JSON.parse(record.header_fields);
    expect(stored.billNo.value).toBe("INV-2026-0917");
  });

  it("attaches the uploaded file id to the import row", async () => {
    const upload = await uploadFile(userA.token);
    expect(upload.status).toBe(201);
    const fileId = upload.body.data.id;

    const { status, body } = await post("/api/purchase-imports/ocr", userA.token, {
      filename: "invoice.png",
      text: OCR_CLEAN,
      fileId,
    });
    expect(status).toBe(201);
    expect(body.data.fileId).toBe(fileId);

    const db = raw();
    const record = db
      .prepare("SELECT file_id FROM purchase_imports WHERE id = ?")
      .get(body.data.importId) as { file_id: string };
    db.close();
    expect(record.file_id).toBe(fileId);
  });

  it("warns when the bill date is missing (confidence <= 0.5)", async () => {
    const { status, body } = await post("/api/purchase-imports/ocr", userA.token, {
      filename: "nodate.jpg",
      text: OCR_WITHOUT_DATE,
    });
    expect(status).toBe(201);
    const session = body.data;

    expect(session.headerFields.billDate.value).toBeNull();
    expect(session.headerFields.billDate.confidence).toBeLessThanOrEqual(0.5);
    expect(session.headerFields.billNo.confidence).toBeGreaterThan(0.8);
    expect(session.warnings).toBeGreaterThan(0);
    expect(
      session.rows.some((r: any) =>
        r.issues.some(
          (i: any) => i.field === "bill_date" && i.severity === "warning"
        )
      )
    ).toBe(true);

    // The warning survives a fresh GET (recomputed from stored header fields).
    const again = await get(`/api/purchase-imports/${session.importId}`, userA.token);
    expect(again.status).toBe(200);
    expect(
      again.body.data.rows.some((r: any) =>
        r.issues.some(
          (i: any) => i.field === "bill_date" && i.severity === "warning"
        )
      )
    ).toBe(true);
  });

  it("rejects text shorter than 10 characters with 400", async () => {
    const { status } = await post("/api/purchase-imports/ocr", userA.token, {
      filename: "tiny.jpg",
      text: "short",
    });
    expect(status).toBe(400);
  });

  it("rejects OCR text without any line items with 400", async () => {
    const { status, body } = await post("/api/purchase-imports/ocr", userA.token, {
      filename: "blank.jpg",
      text: "This document has no item rows at all, only a header section.",
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/line item/i);
  });

  it("rejects unauthenticated OCR creation with 401", async () => {
    const { status } = await post("/api/purchase-imports/ocr", null, {
      filename: "x.jpg",
      text: OCR_INVOICE,
    });
    expect(status).toBe(401);
  });
});

describe("OCR session commit", () => {
  it("commits an OCR session into a purchase bill, batch and stock", async () => {
    const created = await post("/api/purchase-imports/ocr", userA.token, {
      filename: "commit.jpg",
      text: OCR_CLEAN,
    });
    expect(created.status).toBe(201);
    const session = created.body.data;
    expect(session.rows).toHaveLength(1);
    expect(session.rows[0].medicineId).toBe(doloId);

    const beforeDb = raw();
    const billsBefore = (
      beforeDb.prepare("SELECT COUNT(*) AS c FROM purchase_bills").get() as { c: number }
    ).c;
    beforeDb.close();

    const { status, body } = await post(
      `/api/purchase-imports/${session.importId}/commit`,
      userA.token,
      {
        billNo: "OCR-BILL-1",
        billDate: "2026-09-12",
        rows: [
          {
            rowIndex: 0,
            medicineId: doloId,
            batchNo: "OCRB1",
            expiryDate: "2027-12-31",
            quantity: 10,
            freeQuantity: 0,
            mrp: 90,
            purchasePrice: 45,
            sellingPrice: 90,
            gstRate: "12",
          },
        ],
      }
    );
    expect(status).toBe(201);
    expect(body.data.billNo).toBe("OCR-BILL-1");
    expect(body.data.subtotal).toBe(450);

    const db = raw();
    expect(
      (db.prepare("SELECT COUNT(*) AS c FROM purchase_bills").get() as { c: number }).c
    ).toBe(billsBefore + 1);

    const bill = db
      .prepare("SELECT * FROM purchase_bills WHERE bill_no = ?")
      .get("OCR-BILL-1") as any;
    expect(bill.created_by).toBe(userA.id);

    const items = db
      .prepare("SELECT * FROM purchase_bill_items WHERE purchase_bill_id = ?")
      .all(bill.id) as any[];
    expect(items).toHaveLength(1);
    expect(items[0].batch_no).toBe("OCRB1");
    expect(items[0].quantity).toBe(10);
    expect(items[0].rate).toBe(45);

    const batch = db
      .prepare("SELECT * FROM batches WHERE batch_no = ? AND created_by = ?")
      .get("OCRB1", userA.id) as any;
    expect(batch).toBeTruthy();
    expect(batch.quantity).toBe(10);
    expect(batch.expiry_date).toBe("2027-12-31");
    expect(batch.purchase_bill_id).toBe(bill.id);

    const tx = db
      .prepare(
        "SELECT * FROM inventory_transactions WHERE reference = ? AND created_by = ?"
      )
      .get("OCR-BILL-1", userA.id) as any;
    expect(tx).toBeTruthy();
    expect(tx.type).toBe("purchase");
    expect(tx.quantity).toBe(10);

    const imp = db
      .prepare("SELECT status, source FROM purchase_imports WHERE id = ?")
      .get(session.importId) as any;
    expect(imp.status).toBe("committed");
    expect(imp.source).toBe("ocr");

    const committedRows = db
      .prepare(
        "SELECT COUNT(*) AS c FROM purchase_import_rows WHERE import_id = ? AND row_status = 'committed'"
      )
      .get(session.importId) as { c: number };
    expect(committedRows.c).toBe(1);
    db.close();
  });
});

describe("POST /api/files", () => {
  it("uploads, detects duplicate content by sha256 and serves the file back", async () => {
    const bytes = Buffer.from("unique duplicate-detection image bytes");
    const first = await uploadFile(userA.token, bytes);
    expect(first.status).toBe(201);
    expect(first.body.data.duplicate).toBe(false);
    expect(first.body.data.id).toBeTruthy();
    expect(first.body.data.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.body.data.size).toBe(bytes.length);

    const second = await uploadFile(userA.token, bytes);
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data.sha256).toBe(first.body.data.sha256);

    const read = await get(`/api/files/${first.body.data.id}`, userA.token);
    expect(read.status).toBe(200);
    expect(read.body.data.contentType).toBe("image/png");
    expect(read.body.data.filename).toBe("invoice.png");
    expect(read.body.data.data).toBe(b64(bytes));
  });

  it("returns 404 when another tenant fetches the file", async () => {
    const first = await uploadFile(userA.token, Buffer.from("tenant isolated bytes"));
    expect(first.status).toBe(201);

    const read = await get(`/api/files/${first.body.data.id}`, userB.token);
    expect(read.status).toBe(404);
  });

  it("rejects unauthenticated uploads with 401", async () => {
    const { status } = await post("/api/files", null, {
      filename: "x.png",
      contentType: "image/png",
      data: b64(IMAGE_BYTES),
    });
    expect(status).toBe(401);
  });
});

describe("OCR tenant isolation", () => {
  it("user B gets 404 for user A's OCR import on GET, PUT, commit and DELETE", async () => {
    const created = await post("/api/purchase-imports/ocr", userA.token, {
      filename: "tenant.jpg",
      text: OCR_CLEAN,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.importId;

    const read = await get(`/api/purchase-imports/${id}`, userB.token);
    expect(read.status).toBe(404);

    const update = await put(`/api/purchase-imports/${id}/mappings`, userB.token, {
      mappings: { product: "product" },
      defaults: {},
    });
    expect(update.status).toBe(404);

    const commit = await post(`/api/purchase-imports/${id}/commit`, userB.token, {
      billNo: "TENANT-OCR-BILL",
      rows: [
        {
          rowIndex: 0,
          medicineId: doloId,
          batchNo: "T1",
          expiryDate: "2027-12-31",
          quantity: 10,
          purchasePrice: 45,
        },
      ],
    });
    expect(commit.status).toBe(404);

    const remove = await del(`/api/purchase-imports/${id}`, userB.token);
    expect(remove.status).toBe(404);

    // The owner can still read it.
    const owner = await get(`/api/purchase-imports/${id}`, userA.token);
    expect(owner.status).toBe(200);
    expect(owner.body.data.importId).toBe(id);

    // A cross-tenant file id cannot be attached to a new OCR session.
    const upload = await uploadFile(userA.token, Buffer.from("ocr tenant file"));
    expect(upload.status).toBe(201);
    const crossFile = await post("/api/purchase-imports/ocr", userB.token, {
      filename: "steal.jpg",
      text: OCR_CLEAN,
      fileId: upload.body.data.id,
    });
    expect(crossFile.status).toBe(404);
  });
});
