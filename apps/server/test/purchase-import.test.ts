import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import {
  applySchema,
  dbPath,
  seedUser,
  seedMedicine,
  type SeededUser,
} from "./helpers.js";
import purchaseImportRoutes from "../src/routes/purchaseImports.js";
import {
  autoMapColumns,
  matchMedicine,
  normalizeRow,
  parsePurchaseCsv,
} from "../src/services/purchaseImport.js";

let app: FastifyInstance;
let userA: SeededUser;
let userB: SeededUser;
let doloId: string;

function raw() {
  return new Database(dbPath());
}

function countRows(table: string, where?: string, ...params: unknown[]): number {
  const db = raw();
  const row = (
    where
      ? db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`).get(...params)
      : db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get()
  ) as { c: number };
  db.close();
  return row.c;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(url: string, token: string, payload: unknown) {
  const res = await app.inject({ method: "POST", url, headers: auth(token), payload });
  return { status: res.statusCode, body: res.json() as any };
}

async function put(url: string, token: string, payload: unknown) {
  const res = await app.inject({ method: "PUT", url, headers: auth(token), payload });
  return { status: res.statusCode, body: res.json() as any };
}

async function get(url: string, token: string) {
  const res = await app.inject({ method: "GET", url, headers: auth(token) });
  return { status: res.statusCode, body: res.json() as any };
}

async function del(url: string, token: string) {
  const res = await app.inject({ method: "DELETE", url, headers: auth(token) });
  return { status: res.statusCode, body: res.json() as any };
}

async function createImport(token: string, filename: string, csv: string) {
  return post("/api/purchase-imports", token, { filename, csv });
}

beforeAll(async () => {
  applySchema();
  userA = seedUser();
  userB = seedUser();
  const med = seedMedicine(userA.id, { name: "DOLO 650" });
  doloId = med.medicineId;
  const db = raw();
  db.prepare("UPDATE medicines SET barcode = ? WHERE id = ?").run("8901234500011", doloId);
  db.close();

  app = Fastify({ logger: false });
  await app.register(purchaseImportRoutes, { prefix: "/api/purchase-imports" });
});

describe("parsePurchaseCsv", () => {
  it("parses quoted commas, CRLF and BOM", () => {
    const csv =
      '\uFEFFInvoice No,Product,Qty\r\nINV-1,"DOLO 650, Tablet",10\r\nINV-2,"PARA, 500",5\r\n';
    const { columns, rows } = parsePurchaseCsv(csv);
    expect(columns).toEqual(["Invoice No", "Product", "Qty"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].rowIndex).toBe(0);
    expect(rows[1].rowIndex).toBe(1);
    expect(rows[0].raw).toEqual({
      "Invoice No": "INV-1",
      Product: "DOLO 650, Tablet",
      Qty: "10",
    });
    expect(rows[1].raw.Product).toBe("PARA, 500");
    expect(rows[1].raw.Qty).toBe("5");
  });

  it("handles quoted fields containing newlines and escaped quotes", () => {
    const csv = 'Product,Note\r\n"DOLO\r\n650","say ""hi""",\r\n';
    const { columns, rows } = parsePurchaseCsv(csv);
    expect(columns).toEqual(["Product", "Note"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].raw.Product).toBe("DOLO\r\n650");
    expect(rows[0].raw.Note).toBe('say "hi"');
  });
});

describe("header aliases", () => {
  it("maps invoice no, qty, rate, exp and friends to target fields", () => {
    const columns = [
      "invoice no",
      "qty",
      "rate",
      "exp",
      "product",
      "mrp",
      "gst",
      "free",
      "batch",
      "discount",
      "barcode",
      "vendor",
      "bill date",
    ];
    const mappings = autoMapColumns(columns);
    expect(mappings["invoice no"]).toBe("bill_no");
    expect(mappings["qty"]).toBe("quantity");
    expect(mappings["rate"]).toBe("purchase_rate");
    expect(mappings["exp"]).toBe("expiry");
    expect(mappings["product"]).toBe("product");
    expect(mappings["mrp"]).toBe("mrp");
    expect(mappings["gst"]).toBe("gst_rate");
    expect(mappings["free"]).toBe("free_quantity");
    expect(mappings["batch"]).toBe("batch");
    expect(mappings["discount"]).toBe("discount");
    expect(mappings["barcode"]).toBe("barcode");
    expect(mappings["vendor"]).toBe("supplier");
    expect(mappings["bill date"]).toBe("bill_date");
    expect(mappings["unknown column"]).toBeUndefined();
  });
});

describe("normalizeRow", () => {
  const mappings = { product: "product", qty: "quantity", exp: "expiry" };

  it("flags missing product, bad quantity and bad expiry as errors", () => {
    const { issues } = normalizeRow({ product: "", qty: "abc", exp: "someday" }, mappings, {});
    const errorFields = issues
      .filter((i) => i.severity === "error")
      .map((i) => i.field);
    expect(errorFields).toEqual(
      expect.arrayContaining(["product", "quantity", "expiry"])
    );
    expect(issues.every((i) => i.message.length > 0)).toBe(true);
  });

  it("rejects non-positive and non-integer quantities", () => {
    const neg = normalizeRow(
      { product: "DOLO 650", qty: "-2", exp: "12/27" },
      mappings,
      {}
    );
    expect(
      neg.issues.some((i) => i.field === "quantity" && i.severity === "error")
    ).toBe(true);

    const frac = normalizeRow(
      { product: "DOLO 650", qty: "2.5", exp: "12/27" },
      mappings,
      {}
    );
    expect(
      frac.issues.some((i) => i.field === "quantity" && i.severity === "error")
    ).toBe(true);
  });

  it('normalizes expiry "12/27" to 2027-12-31 and other month formats to month end', () => {
    const a = normalizeRow(
      { product: "DOLO 650", qty: "10", exp: "12/27" },
      mappings,
      {}
    );
    expect(a.normalized.expiryDate).toBe("2027-12-31");
    expect(a.issues.filter((i) => i.severity === "error")).toHaveLength(0);

    const b = normalizeRow(
      { product: "DOLO 650", qty: "10", exp: "02/2027" },
      mappings,
      {}
    );
    expect(b.normalized.expiryDate).toBe("2027-02-28");

    const c = normalizeRow(
      { product: "DOLO 650", qty: "10", exp: "2027-02" },
      mappings,
      {}
    );
    expect(c.normalized.expiryDate).toBe("2027-02-28");

    const d = normalizeRow(
      { product: "DOLO 650", qty: "10", exp: "2027-12-31" },
      mappings,
      {}
    );
    expect(d.normalized.expiryDate).toBe("2027-12-31");
  });

  it("applies GST defaults and warns on unknown GST values", () => {
    const full = {
      product: "product",
      qty: "quantity",
      exp: "expiry",
      gst: "gst_rate",
    };
    const missing = normalizeRow(
      { product: "DOLO 650", qty: "1", exp: "12/27", gst: "" },
      full,
      { gstRate: "5" }
    );
    expect(missing.normalized.gstRate).toBe("5");

    const weird = normalizeRow(
      { product: "DOLO 650", qty: "1", exp: "12/27", gst: "7.5" },
      full,
      {}
    );
    expect(weird.normalized.gstRate).toBe("12");
    expect(
      weird.issues.some((i) => i.field === "gst_rate" && i.severity === "warning")
    ).toBe(true);
    expect(weird.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });
});

describe("matchMedicine", () => {
  it("matches exact barcode and case-insensitive name within the tenant", async () => {
    const byBarcode = await matchMedicine(userA.id, {
      barcode: "8901234500011",
    });
    expect(byBarcode.medicineId).toBe(doloId);
    expect(byBarcode.confidence).toBeGreaterThan(0);

    const byName = await matchMedicine(userA.id, { product: "dolo 650" });
    expect(byName.medicineId).toBe(doloId);

    const unknown = await matchMedicine(userA.id, {
      product: "Totally Unknown Med 999",
    });
    expect(unknown.medicineId).toBeNull();
    expect(unknown.confidence).toBe(0);
  });

  it("never matches another tenant's medicine", async () => {
    const crossTenant = await matchMedicine(userB.id, {
      barcode: "8901234500011",
    });
    expect(crossTenant.medicineId).toBeNull();

    const crossTenantName = await matchMedicine(userB.id, { product: "DOLO 650" });
    expect(crossTenantName.medicineId).toBeNull();
  });
});

describe("POST /api/purchase-imports", () => {
  it("creates a draft import with auto-mapped columns and per-row issues", async () => {
    const csv = [
      "Product,Batch,Expiry,Qty,Rate,MRP,GST",
      "DOLO 650,B100,12/27,10,12,20,12",
      "Unknown Med X,B101,12/27,5,10,15,12",
    ].join("\n");

    const { status, body } = await createImport(userA.token, "bills.csv", csv);
    expect(status).toBe(201);
    const session = body.data;
    expect(session.importId).toBeTruthy();
    expect(session.filename).toBe("bills.csv");
    expect(session.status).toBe("draft");
    expect(session.columns).toEqual([
      "Product",
      "Batch",
      "Expiry",
      "Qty",
      "Rate",
      "MRP",
      "GST",
    ]);
    expect(session.mappings.Product).toBe("product");
    expect(session.mappings.Qty).toBe("quantity");
    expect(session.mappings.Expiry).toBe("expiry");
    expect(session.mappings.Rate).toBe("purchase_rate");
    expect(session.rows).toHaveLength(2);

    // Row 0 matches the seeded medicine by name.
    expect(session.rows[0].medicineId).toBe(doloId);
    expect(session.rows[0].status).toBe("mapped");
    expect(session.rows[0].normalized.expiryDate).toBe("2027-12-31");
    expect(session.rows[0].normalized.quantity).toBe(10);
    expect(session.rows[0].normalized.purchaseRate).toBe(12);
    expect(session.errors).toBe(0);

    // Row 1 stays unmapped but only carries a warning.
    expect(session.rows[1].medicineId).toBeNull();
    expect(session.rows[1].status).toBe("pending");
    expect(
      session.rows[1].issues.some(
        (i: any) => i.severity === "warning" && i.field === "product"
      )
    ).toBe(true);
    expect(session.warnings).toBeGreaterThan(0);

    const db = raw();
    const stored = db
      .prepare("SELECT COUNT(*) AS c FROM purchase_import_rows WHERE import_id = ?")
      .get(session.importId) as { c: number };
    db.close();
    expect(stored.c).toBe(2);
  });

  it("rejects an empty CSV with 400", async () => {
    const { status } = await createImport(userA.token, "empty.csv", "   \n  ");
    expect(status).toBe(400);
  });

  it("rejects unauthenticated creation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/purchase-imports",
      payload: { filename: "x.csv", csv: "a\n1" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("PUT /api/purchase-imports/:id/mappings", () => {
  it("recomputes rows when a column is manually mapped", async () => {
    const csv = [
      "Item Name,Batch,Expiry,Qty,Rate",
      "DOLO 650,B300,12/27,5,10",
    ].join("\n");
    const created = await createImport(userA.token, "map.csv", csv);
    expect(created.status).toBe(201);
    const session = created.body.data;

    // "Item Name" is not a known alias → product missing → error row.
    expect(session.errors).toBeGreaterThan(0);
    expect(
      session.rows[0].issues.some(
        (i: any) => i.field === "product" && i.severity === "error"
      )
    ).toBe(true);
    expect(session.rows[0].status).toBe("error");

    const updated = await put(
      `/api/purchase-imports/${session.importId}/mappings`,
      userA.token,
      {
        mappings: {
          "Item Name": "product",
          Batch: "batch",
          Expiry: "expiry",
          Qty: "quantity",
          Rate: "purchase_rate",
        },
        defaults: { gstRate: "12" },
      }
    );
    expect(updated.status).toBe(200);
    expect(updated.body.data.errors).toBe(0);
    expect(updated.body.data.rows[0].medicineId).toBe(doloId);
    expect(updated.body.data.rows[0].status).toBe("mapped");
    expect(updated.body.data.rows[0].normalized.quantity).toBe(5);
  });

  it("rejects unknown mapping fields with 400", async () => {
    const csv = "Product,Qty\nDOLO 650,5";
    const created = await createImport(userA.token, "badmap.csv", csv);
    const id = created.body.data.importId;
    const res = await put(`/api/purchase-imports/${id}/mappings`, userA.token, {
      mappings: { Product: "not_a_field" },
      defaults: {},
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/purchase-imports/:id/commit", () => {
  let committedImportId: string;

  it("creates a purchase bill, batch and inventory transaction with correct totals", async () => {
    const csv = [
      "Product,Batch,Expiry,Qty,Rate,MRP,GST",
      "DOLO 650,B100,12/27,10,12,20,12",
    ].join("\n");
    const created = await createImport(userA.token, "commit.csv", csv);
    expect(created.status).toBe(201);
    committedImportId = created.body.data.importId;
    expect(created.body.data.errors).toBe(0);

    const billsBefore = countRows("purchase_bills");
    const { status, body } = await post(
      `/api/purchase-imports/${committedImportId}/commit`,
      userA.token,
      {
        billNo: "IMP-BILL-1",
        billDate: "2026-09-20",
        rows: [
          {
            rowIndex: 0,
            medicineId: doloId,
            batchNo: "B100",
            expiryDate: "2027-12-31",
            quantity: 10,
            freeQuantity: 0,
            mrp: 20,
            purchasePrice: 12,
            sellingPrice: 20,
            gstRate: "12",
          },
        ],
      }
    );
    expect(status).toBe(201);
    expect(body.data.billNo).toBe("IMP-BILL-1");
    expect(body.data.subtotal).toBe(120);
    expect(body.data.totalGst).toBeCloseTo(12.86, 2);
    expect(body.data.grandTotal).toBeCloseTo(132.86, 2);
    expect(countRows("purchase_bills")).toBe(billsBefore + 1);

    const db = raw();
    const bill = db
      .prepare("SELECT * FROM purchase_bills WHERE bill_no = ?")
      .get("IMP-BILL-1") as any;
    expect(bill.created_by).toBe(userA.id);

    const items = db
      .prepare("SELECT * FROM purchase_bill_items WHERE purchase_bill_id = ?")
      .all(bill.id) as any[];
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(10);
    expect(items[0].rate).toBe(12);
    expect(items[0].batch_no).toBe("B100");

    const batch = db
      .prepare("SELECT * FROM batches WHERE batch_no = ? AND created_by = ?")
      .get("B100", userA.id) as any;
    expect(batch).toBeTruthy();
    expect(batch.medicine_id).toBe(doloId);
    expect(batch.purchase_price).toBe(12);
    expect(batch.expiry_date).toBe("2027-12-31");
    expect(batch.quantity).toBe(10);
    expect(batch.purchase_bill_id).toBe(bill.id);

    const tx = db
      .prepare(
        "SELECT * FROM inventory_transactions WHERE reference = ? AND created_by = ?"
      )
      .get("IMP-BILL-1", userA.id) as any;
    expect(tx).toBeTruthy();
    expect(tx.type).toBe("purchase");
    expect(tx.medicine_id).toBe(doloId);
    expect(tx.quantity).toBe(10);
    expect(tx.balance_after).toBe(10);
    expect(tx.batch_id).toBeTruthy();

    const imp = db
      .prepare("SELECT status FROM purchase_imports WHERE id = ?")
      .get(committedImportId) as any;
    expect(imp.status).toBe("committed");

    const committedRows = db
      .prepare(
        "SELECT COUNT(*) AS c FROM purchase_import_rows WHERE import_id = ? AND row_status = 'committed'"
      )
      .get(committedImportId) as { c: number };
    expect(committedRows.c).toBe(1);
    db.close();
  });

  it("rejects a second commit attempt with 409 and keeps a single bill", async () => {
    const before = countRows("purchase_bills", "bill_no = ?", "IMP-BILL-1");
    expect(before).toBe(1);

    const { status } = await post(
      `/api/purchase-imports/${committedImportId}/commit`,
      userA.token,
      {
        billNo: "IMP-BILL-1",
        rows: [
          {
            rowIndex: 0,
            medicineId: doloId,
            batchNo: "B100",
            expiryDate: "2027-12-31",
            quantity: 10,
            purchasePrice: 12,
          },
        ],
      }
    );
    expect([409, 400]).toContain(status);
    expect(countRows("purchase_bills", "bill_no = ?", "IMP-BILL-1")).toBe(1);
  });

  it("rejects commit while a row still has errors and persists nothing", async () => {
    const csv = [
      "Product,Batch,Expiry,Qty,Rate",
      "DOLO 650,B400,12/27,5,10",
      ",B401,12/27,5,10",
    ].join("\n");
    const created = await createImport(userA.token, "bad.csv", csv);
    expect(created.status).toBe(201);
    const importId = created.body.data.importId;
    expect(created.body.data.errors).toBeGreaterThan(0);

    const billsBefore = countRows("purchase_bills");
    const { status, body } = await post(
      `/api/purchase-imports/${importId}/commit`,
      userA.token,
      {
        billNo: "IMP-BILL-BAD",
        billDate: "2026-09-21",
        rows: [
          {
            rowIndex: 0,
            medicineId: doloId,
            batchNo: "B400",
            expiryDate: "2027-12-31",
            quantity: 5,
            freeQuantity: 0,
            purchasePrice: 10,
          },
          {
            rowIndex: 1,
            medicineId: "",
            batchNo: "B401",
            expiryDate: "2027-12-31",
            quantity: 5,
            freeQuantity: 0,
            purchasePrice: 10,
          },
        ],
      }
    );
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();

    expect(countRows("purchase_bills")).toBe(billsBefore);
    expect(countRows("batches", "batch_no = ?", "B401")).toBe(0);

    const db = raw();
    const imp = db
      .prepare("SELECT status FROM purchase_imports WHERE id = ?")
      .get(importId) as any;
    expect(imp.status).toBe("draft");
    const badItems = db
      .prepare(
        "SELECT COUNT(*) AS c FROM purchase_bill_items WHERE batch_no = 'B401'"
      )
      .get() as { c: number };
    expect(badItems.c).toBe(0);
    db.close();
  });

  it("rejects a commit payload that does not cover every row", async () => {
    const csv = [
      "Product,Batch,Expiry,Qty,Rate",
      "DOLO 650,B600,12/27,5,10",
      "DOLO 650,B601,12/27,5,10",
    ].join("\n");
    const created = await createImport(userA.token, "partial.csv", csv);
    const importId = created.body.data.importId;

    const { status } = await post(
      `/api/purchase-imports/${importId}/commit`,
      userA.token,
      {
        billNo: "IMP-BILL-PARTIAL",
        rows: [
          {
            rowIndex: 0,
            medicineId: doloId,
            batchNo: "B600",
            expiryDate: "2027-12-31",
            quantity: 5,
            purchasePrice: 10,
          },
        ],
      }
    );
    expect(status).toBe(400);
    expect(countRows("purchase_bills", "bill_no = ?", "IMP-BILL-PARTIAL")).toBe(0);
  });
});

describe("tenant isolation", () => {
  it("user B gets 404 for user A's import on GET, PUT, commit and DELETE", async () => {
    const csv = "Product,Batch,Expiry,Qty,Rate\nDOLO 650,B500,12/27,5,10";
    const created = await createImport(userA.token, "tenant.csv", csv);
    expect(created.status).toBe(201);
    const id = created.body.data.importId;

    const read = await get(`/api/purchase-imports/${id}`, userB.token);
    expect(read.status).toBe(404);

    const update = await put(
      `/api/purchase-imports/${id}/mappings`,
      userB.token,
      { mappings: { Product: "product" }, defaults: {} }
    );
    expect(update.status).toBe(404);

    const commit = await post(
      `/api/purchase-imports/${id}/commit`,
      userB.token,
      {
        billNo: "IMP-BILL-TENANT",
        rows: [
          {
            rowIndex: 0,
            medicineId: doloId,
            batchNo: "B500",
            expiryDate: "2027-12-31",
            quantity: 5,
            purchasePrice: 10,
          },
        ],
      }
    );
    expect(commit.status).toBe(404);
    expect(countRows("purchase_bills", "bill_no = ?", "IMP-BILL-TENANT")).toBe(0);

    const remove = await del(`/api/purchase-imports/${id}`, userB.token);
    expect(remove.status).toBe(404);

    // The owner can still read it.
    const owner = await get(`/api/purchase-imports/${id}`, userA.token);
    expect(owner.status).toBe(200);
    expect(owner.body.data.importId).toBe(id);
  });
});

describe("DELETE /api/purchase-imports/:id", () => {
  it("deletes a draft import and refuses committed ones", async () => {
    const csv = "Product,Batch,Expiry,Qty,Rate\nDOLO 650,B700,12/27,5,10";
    const created = await createImport(userA.token, "draft.csv", csv);
    const id = created.body.data.importId;

    const removed = await del(`/api/purchase-imports/${id}`, userA.token);
    expect(removed.status).toBe(200);

    const after = await get(`/api/purchase-imports/${id}`, userA.token);
    expect(after.status).toBe(404);

    const db = raw();
    const rows = db
      .prepare("SELECT COUNT(*) AS c FROM purchase_import_rows WHERE import_id = ?")
      .get(id) as { c: number };
    db.close();
    expect(rows.c).toBe(0);
  });

  it("returns 404 when deleting an already committed import", async () => {
    // Re-use the committed import from the commit describe block by creating a new one.
    const csv = "Product,Batch,Expiry,Qty,Rate\nDOLO 650,B800,12/27,5,10";
    const created = await createImport(userA.token, "tocommit.csv", csv);
    const id = created.body.data.importId;
    const commit = await post(`/api/purchase-imports/${id}/commit`, userA.token, {
      billNo: "IMP-BILL-DEL",
      rows: [
        {
          rowIndex: 0,
          medicineId: doloId,
          batchNo: "B800",
          expiryDate: "2027-12-31",
          quantity: 5,
          purchasePrice: 10,
        },
      ],
    });
    expect(commit.status).toBe(201);

    const removed = await del(`/api/purchase-imports/${id}`, userA.token);
    expect(removed.status).toBe(404);
  });
});
