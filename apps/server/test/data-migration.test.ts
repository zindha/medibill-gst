import { beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import {
  applySchema,
  dbPath,
  seedCustomer,
  seedMedicine,
  seedUser,
  type SeededUser,
} from "./helpers.js";
import dataMigrationRoutes from "../src/routes/dataMigrations.js";
import bulkBillRoutes from "../src/routes/bulkBills.js";
import {
  autoMapColumns,
  normalizeEntityRow,
  normalizeStockExpiry,
  parseDataCsv,
} from "../src/services/dataMigration.js";

let app: FastifyInstance;

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

function setRole(userId: string, role: "admin" | "pharmacist" | "cashier"): void {
  const db = raw();
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
  db.close();
}

function seedUserWithRole(role: "admin" | "pharmacist" | "cashier"): SeededUser {
  const user = seedUser();
  setRole(user.id, role);
  return user;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(url: string, token: string, payload: unknown) {
  const res = await app.inject({ method: "POST", url, headers: auth(token), payload });
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

async function createImport(
  token: string,
  entityType: string,
  filename: string,
  csv: string
) {
  return post("/api/data-migrations", token, { entityType, filename, csv });
}

/** Seed an invoice row directly (bypasses the sale flow — bulk edit only reads). */
function seedInvoice(
  ownerId: string,
  opts: {
    invoiceNo?: string;
    customerId?: string | null;
    customerName?: string | null;
    date?: string;
    status?: string;
    subtotal?: number;
    grandTotal?: number;
    paymentMode?: string;
    notes?: string | null;
  } = {}
): string {
  const id = nanoid(16);
  const db = raw();
  db.prepare(
    `INSERT INTO invoices
       (id, invoice_no, customer_id, customer_name, date, subtotal, total_gst, cgst, sgst,
        igst, discount_amount, grand_total, amount_paid, payment_mode, status, notes,
        created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, 0, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    opts.invoiceNo ?? `TST-${nanoid(8)}`,
    opts.customerId ?? null,
    opts.customerName ?? null,
    opts.date ?? "2026-01-10",
    opts.subtotal ?? 100,
    opts.grandTotal ?? 100,
    opts.paymentMode ?? "cash",
    opts.status ?? "paid",
    opts.notes ?? null,
    ownerId,
    Date.now(),
    Date.now()
  );
  db.close();
  return id;
}

function getInvoice(id: string): any {
  const db = raw();
  const row = db.prepare("SELECT * FROM invoices WHERE id = ?").get(id);
  db.close();
  return row;
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(dataMigrationRoutes, { prefix: "/api/data-migrations" });
  await app.register(bulkBillRoutes, { prefix: "/api/bulk-bills" });
});

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

describe("parseDataCsv", () => {
  it("parses quoted commas, CRLF and BOM", () => {
    const csv =
      "\uFEFFName,Phone,Balance\r\n\"Doe, John\",9876543210,100\r\n\"Party, The\",9123456780,50\r\n";
    const { columns, rows } = parseDataCsv(csv);
    expect(columns).toEqual(["Name", "Phone", "Balance"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].rowIndex).toBe(0);
    expect(rows[1].rowIndex).toBe(1);
    expect(rows[0].raw).toEqual({ Name: "Doe, John", Phone: "9876543210", Balance: "100" });
    expect(rows[1].raw.Name).toBe("Party, The");
  });

  it("handles quoted newlines, escaped quotes and blank lines", () => {
    const csv = 'Name,Address\r\n"Multi\nLine","say ""hi"""\r\n\r\n,\r\n';
    const { columns, rows } = parseDataCsv(csv);
    expect(columns).toEqual(["Name", "Address"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].raw.Name).toBe("Multi\nLine");
    expect(rows[0].raw.Address).toBe('say "hi"');
  });
});

// ---------------------------------------------------------------------------
// Header aliases
// ---------------------------------------------------------------------------

describe("header aliases", () => {
  it("maps customer headers (name/phone/balance/gstin) to target fields", () => {
    const mappings = autoMapColumns(
      ["Customer", "Mobile No", "Opening Balance", "GST No", "Credit Limit"],
      "customers"
    );
    expect(mappings["Customer"]).toBe("name");
    expect(mappings["Mobile No"]).toBe("phone");
    expect(mappings["Opening Balance"]).toBe("openingBalance");
    expect(mappings["GST No"]).toBe("gstin");
    expect(mappings["Credit Limit"]).toBe("creditLimit");
    expect(mappings["unknown column"]).toBeUndefined();
  });

  it("maps medicine and stock headers (product/gst/hsn/cost, medicine/lot/exp/qty)", () => {
    const med = autoMapColumns(["product", "gst", "hsn code", "cost", "mrp", "brand"], "medicines");
    expect(med["product"]).toBe("name");
    expect(med["gst"]).toBe("gstRate");
    expect(med["hsn code"]).toBe("hsnCode");
    expect(med["cost"]).toBe("purchasePrice");
    expect(med["mrp"]).toBe("mrp");
    expect(med["brand"]).toBe("brand");

    const stock = autoMapColumns(["medicine", "lot", "exp", "qty", "selling price"], "stock");
    expect(stock["medicine"]).toBe("medicineName");
    expect(stock["lot"]).toBe("batchNo");
    expect(stock["exp"]).toBe("expiryDate");
    expect(stock["qty"]).toBe("quantity");
    expect(stock["selling price"]).toBe("sellingPrice");
  });
});

// ---------------------------------------------------------------------------
// Row normalization
// ---------------------------------------------------------------------------

describe("normalizeEntityRow", () => {
  it("flags a missing customer name and a malformed opening balance as errors", () => {
    const mappings = { Name: "name", Balance: "openingBalance", Mobile: "phone" };
    const { issues } = normalizeEntityRow(
      "customers",
      { Name: "", Balance: "abc", Mobile: "9876543210" },
      mappings
    );
    const errorFields = issues.filter((i) => i.severity === "error").map((i) => i.field);
    expect(errorFields).toEqual(expect.arrayContaining(["name", "openingBalance"]));
  });

  it("normalizes phone digits, keeps a good opening balance and warns on bad GSTIN/phone", () => {
    const mappings = { Name: "name", Mobile: "phone", Balance: "openingBalance", GSTIN: "gstin" };
    const good = normalizeEntityRow(
      "customers",
      { Name: "Alice", Mobile: "98765 43210", Balance: "1,250.50", GSTIN: "27AAAAA1111A1Z1" },
      mappings
    );
    expect(good.issues).toHaveLength(0);
    expect(good.normalized.phone).toBe("9876543210");
    expect(good.normalized.openingBalance).toBe(1250.5);

    const warn = normalizeEntityRow(
      "customers",
      { Name: "Bob", Mobile: "+91 12345", Balance: "0", GSTIN: "NOT-A-GSTIN" },
      mappings
    );
    expect(warn.issues.filter((i) => i.severity === "warning").length).toBeGreaterThanOrEqual(2);
    expect(warn.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(warn.normalized.phone).toBe("9112345");
    expect(warn.normalized.gstin).toBe("NOT-A-GSTIN");
  });

  it("defaults an invalid medicine GST rate to 12 with a warning", () => {
    const mappings = { Product: "name", GST: "gstRate" };
    const weird = normalizeEntityRow("medicines", { Product: "PARA", GST: "7.5" }, mappings);
    expect(weird.normalized.gstRate).toBe("12");
    expect(
      weird.issues.some((i) => i.field === "gstRate" && i.severity === "warning")
    ).toBe(true);
    expect(weird.issues.filter((i) => i.severity === "error")).toHaveLength(0);

    const good = normalizeEntityRow("medicines", { Product: "PARA", GST: "5" }, mappings);
    expect(good.normalized.gstRate).toBe("5");
  });

  it("flags missing stock batch/quantity and negative quantity as errors", () => {
    const mappings = { medicine: "medicineName", lot: "batchNo", exp: "expiryDate", qty: "quantity" };
    const { issues } = normalizeEntityRow(
      "stock",
      { medicine: "DOLO 650", lot: "", exp: "02/27", qty: "-3" },
      mappings
    );
    const errorFields = issues.filter((i) => i.severity === "error").map((i) => i.field);
    expect(errorFields).toEqual(expect.arrayContaining(["batchNo", "quantity"]));

    const missing = normalizeEntityRow(
      "stock",
      { medicine: "DOLO 650", lot: "B1", exp: "", qty: "10" },
      mappings
    );
    expect(
      missing.issues.some((i) => i.field === "expiryDate" && i.severity === "error")
    ).toBe(true);
  });
});

describe("normalizeStockExpiry", () => {
  it("normalizes MM/YY, MM/YYYY, DD/MM/YYYY and YYYY-MM-DD to real dates", () => {
    expect(normalizeStockExpiry("02/27")).toBe("2027-02-28"); // month end
    expect(normalizeStockExpiry("12/27")).toBe("2027-12-31"); // month end
    expect(normalizeStockExpiry("02/2027")).toBe("2027-02-28"); // month end
    expect(normalizeStockExpiry("27/12/2027")).toBe("2027-12-27"); // day first, exact date
    expect(normalizeStockExpiry("05/06/2027")).toBe("2027-06-05"); // day first, unambiguous
    expect(normalizeStockExpiry("2027-02-15")).toBe("2027-02-15"); // ISO kept
    expect(normalizeStockExpiry("13/40/2027")).toBeNull();
    expect(normalizeStockExpiry("someday")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Session creation + resolution
// ---------------------------------------------------------------------------

describe("POST /api/data-migrations", () => {
  it("creates a customers draft with auto-mapped columns and per-row counts", async () => {
    const user = seedUser();
    const csv = [
      "Customer,Mobile,Opening Balance,GST No",
      "Alice Traders,9876543210,150,27AAAAA1111A1Z1",
      ",12345,abc,BADGSTIN",
    ].join("\r\n");

    const { status, body } = await createImport(user.token, "customers", "customers.csv", csv);
    expect(status).toBe(201);
    const session = body.data;
    expect(session.entityType).toBe("customers");
    expect(session.filename).toBe("customers.csv");
    expect(session.status).toBe("draft");
    expect(session.mappings.Customer).toBe("name");
    expect(session.mappings.Mobile).toBe("phone");
    expect(session.mappings["Opening Balance"]).toBe("openingBalance");
    expect(session.rows).toHaveLength(2);
    expect(session.counts.total).toBe(2);
    expect(session.counts.ok).toBe(1);
    expect(session.counts.error).toBe(1);
    expect(session.errors).toBe(1);
    expect(session.rows[0].normalized.openingBalance).toBe(150);
    expect(session.rows[1].status).toBe("error");

    expect(countRows("data_import_rows", "import_id = ?", session.importId)).toBe(2);
  });

  it("rejects an empty CSV and a header-only CSV with 400", async () => {
    const user = seedUser();
    expect((await createImport(user.token, "customers", "empty.csv", "   \n  ")).status).toBe(400);
    expect((await createImport(user.token, "customers", "header.csv", "name,phone\n")).status).toBe(400);
  });

  it("rejects an unknown entityType and unauthenticated creation", async () => {
    const user = seedUser();
    const bad = await createImport(user.token, "batches", "x.csv", "name\nA");
    expect(bad.status).toBe(400);

    const res = await app.inject({
      method: "POST",
      url: "/api/data-migrations",
      payload: { entityType: "customers", filename: "x.csv", csv: "name\nA" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/data-migrations/:id and list", () => {
  it("returns the full session (rows + issues + counts) for its owner", async () => {
    const user = seedUser();
    const created = await createImport(
      user.token,
      "suppliers",
      "suppliers.csv",
      "Supplier,Payment Terms,Credit Limit\nAcme Ltd,Net 30,5000\n,Broken,,"
    );
    expect(created.status).toBe(201);
    const id = created.body.data.importId;

    const read = await get(`/api/data-migrations/${id}`, user.token);
    expect(read.status).toBe(200);
    expect(read.body.data.importId).toBe(id);
    expect(read.body.data.rows).toHaveLength(2);
    expect(read.body.data.counts.error).toBe(1);
    expect(read.body.data.rows[0].issues).toBeInstanceOf(Array);
  });

  it("lists the tenant's imports with row counts", async () => {
    const user = seedUser();
    await createImport(user.token, "customers", "list-1.csv", "name\nAlpha");
    await createImport(user.token, "medicines", "list-2.csv", "name\nBeta");

    const list = await get("/api/data-migrations", user.token);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);

    const med = list.body.data.find((x: any) => x.filename === "list-2.csv");
    expect(med).toBeTruthy();
    expect(med.entityType).toBe("medicines");
    expect(med.status).toBe("draft");
    expect(med.counts.total).toBe(1);
    expect(med.counts.ok).toBe(1);
    expect(list.body.data.every((x: any) => typeof x.id === "string")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

describe("POST /api/data-migrations/:id/preview", () => {
  it("returns wouldCreate/wouldSkip counts without creating anything", async () => {
    const user = seedUser();
    seedCustomer(user.id, { name: "Existing Party" });
    const before = countRows("customers", "created_by = ?", user.id);

    const created = await createImport(
      user.token,
      "customers",
      "preview.csv",
      "name\nExisting Party\nFresh Party"
    );
    expect(created.status).toBe(201);
    const id = created.body.data.importId;
    expect(created.body.data.counts.ok).toBe(1);
    expect(created.body.data.counts.skipped).toBe(1);

    const preview = await post(`/api/data-migrations/${id}/preview`, user.token, {});
    expect(preview.status).toBe(200);
    expect(preview.body.data.wouldCreate).toBe(1);
    expect(preview.body.data.wouldSkip).toBe(1);
    expect(preview.body.data.errors).toBe(0);
    expect(preview.body.data.rows.length).toBeGreaterThan(0);
    expect(preview.body.data.status).toBe("draft");

    // No entities created, session still a draft.
    expect(countRows("customers", "created_by = ?", user.id)).toBe(before + 0);
    const db = raw();
    const rec = db.prepare("SELECT status FROM data_imports WHERE id = ?").get(id) as any;
    db.close();
    expect(rec.status).toBe("draft");
  });

  it("previews stock rows with medicine resolution and duplicate batches as skips", async () => {
    const user = seedUser();
    seedMedicine(user.id, { name: "DOLO 650" });
    const csv = [
      "medicine,lot,exp,qty",
      "DOLO 650,OPEN-A,02/27,10",
      "DOLO 650,OPEN-A,02/27,5",
      "Ghost Med,OPEN-B,02/27,5",
    ].join("\n");
    const created = await createImport(user.token, "stock", "stock-preview.csv", csv);
    expect(created.status).toBe(201);
    const id = created.body.data.importId;

    const preview = await post(`/api/data-migrations/${id}/preview`, user.token, {});
    expect(preview.status).toBe(200);
    expect(preview.body.data.wouldCreate).toBe(1);
    expect(preview.body.data.wouldSkip).toBe(1);
    expect(preview.body.data.errors).toBe(1);
    expect(preview.body.data.counts.error).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Commit — customers
// ---------------------------------------------------------------------------

describe("POST /api/data-migrations/:id/commit (customers)", () => {
  it("creates customers with opening balance, tenant ownership and committed rows", async () => {
    const user = seedUser();
    const csv = "name,phone,opening balance\nCust One,9876543210,250\nCust Two,,0";
    const created = await createImport(user.token, "customers", "commit-customers.csv", csv);
    expect(created.status).toBe(201);
    const id = created.body.data.importId;
    expect(created.body.data.errors).toBe(0);

    const { status, body } = await post(`/api/data-migrations/${id}/commit`, user.token, {});
    expect(status).toBe(201);
    expect(body.data.status).toBe("committed");
    expect(body.data.created).toBe(2);
    expect(body.data.skipped).toBe(0);

    const db = raw();
    const rows = db
      .prepare("SELECT * FROM customers WHERE created_by = ? ORDER BY name")
      .all(user.id) as any[];
    const audit = db
      .prepare("SELECT COUNT(*) AS c FROM audit_events WHERE action = 'data_import.commit' AND actor_id = ?")
      .get(user.id) as { c: number };
    const rec = db.prepare("SELECT status FROM data_imports WHERE id = ?").get(id) as any;
    const committedRows = db
      .prepare(
        "SELECT COUNT(*) AS c FROM data_import_rows WHERE import_id = ? AND row_status = 'committed' AND created_entity_id IS NOT NULL"
      )
      .get(id) as { c: number };
    db.close();

    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("Cust One");
    expect(rows[0].balance).toBe(250);
    expect(rows[0].opening_balance).toBe(250);
    expect(rows[0].phone).toBe("9876543210");
    expect(rows[1].balance).toBe(0);
    expect(rec.status).toBe("committed");
    expect(committedRows.c).toBe(2);
    expect(audit.c).toBe(1);
  });

  it("skips a row that already exists in the tenant (dedupe, no update)", async () => {
    const user = seedUser();
    seedCustomer(user.id, { name: "Duplicate Party" });
    const before = countRows("customers", "created_by = ?", user.id);

    const created = await createImport(
      user.token,
      "customers",
      "dupe.csv",
      "name\nDUPLICATE party\nFresh Party"
    );
    expect(created.status).toBe(201);
    const id = created.body.data.importId;
    expect(created.body.data.counts.skipped).toBe(1);

    const { status, body } = await post(`/api/data-migrations/${id}/commit`, user.token, {});
    expect(status).toBe(201);
    expect(body.data.created).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(countRows("customers", "created_by = ?", user.id)).toBe(before + 1);

    const db = raw();
    const skipped = db
      .prepare(
        "SELECT row_status FROM data_import_rows WHERE import_id = ? AND row_index = 0"
      )
      .get(id) as any;
    db.close();
    expect(skipped.row_status).toBe("skipped");
  });

  it("blocks commit with 400 (per-row details) while a row has errors and persists nothing", async () => {
    const user = seedUser();
    const csv = "name,opening balance\nGood Party,10\n,not-a-number";
    const created = await createImport(user.token, "customers", "bad-customers.csv", csv);
    expect(created.status).toBe(201);
    const id = created.body.data.importId;
    expect(created.body.data.errors).toBe(1);

    const before = countRows("customers", "created_by = ?", user.id);
    const { status, body } = await post(`/api/data-migrations/${id}/commit`, user.token, {});
    expect(status).toBe(400);
    expect(body.details.rows.length).toBeGreaterThan(0);
    expect(body.details.rows[0].rowIndex).toBe(1);
    expect(countRows("customers", "created_by = ?", user.id)).toBe(before);

    const db = raw();
    const rec = db.prepare("SELECT status FROM data_imports WHERE id = ?").get(id) as any;
    db.close();
    expect(rec.status).toBe("draft");
  });

  it("rejects a second commit with 409", async () => {
    const user = seedUser();
    const created = await createImport(user.token, "customers", "twice.csv", "name\nOnce Party");
    const id = created.body.data.importId;
    expect((await post(`/api/data-migrations/${id}/commit`, user.token, {})).status).toBe(201);

    const again = await post(`/api/data-migrations/${id}/commit`, user.token, {});
    expect(again.status).toBe(409);
    expect(countRows("customers", "name = ? AND created_by = ?", "Once Party", user.id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Commit — medicines
// ---------------------------------------------------------------------------

describe("POST /api/data-migrations/:id/commit (medicines)", () => {
  it("commits with the default 12% GST when the rate is invalid (warning issue kept)", async () => {
    const user = seedUser();
    const csv = "product,gst,hsn code\nPARA 500,7.5,3004";
    const created = await createImport(user.token, "medicines", "meds.csv", csv);
    expect(created.status).toBe(201);
    const id = created.body.data.importId;
    expect(created.body.data.errors).toBe(0);
    expect(created.body.data.warnings).toBe(1);

    const { status, body } = await post(`/api/data-migrations/${id}/commit`, user.token, {});
    expect(status).toBe(201);
    expect(body.data.created).toBe(1);

    const db = raw();
    const med = db
      .prepare("SELECT * FROM medicines WHERE created_by = ? AND name = 'PARA 500'")
      .get(user.id) as any;
    const row = db
      .prepare("SELECT issues FROM data_import_rows WHERE import_id = ?")
      .get(id) as any;
    db.close();
    expect(med.gst_rate).toBe("12");
    expect(med.hsn_code).toBe("3004");
    expect(JSON.parse(row.issues).some((i: any) => i.severity === "warning")).toBe(true);
  });

  it("skips a medicine that already exists with the same name + brand", async () => {
    const user = seedUser();
    seedMedicine(user.id, { name: "EXISTING MED" });
    const before = countRows("medicines", "created_by = ?", user.id);

    const created = await createImport(
      user.token,
      "medicines",
      "med-dupe.csv",
      "name,brand\nexisting med,"
    );
    expect(created.status).toBe(201);
    const id = created.body.data.importId;
    expect(created.body.data.counts.skipped).toBe(1);

    const { status, body } = await post(`/api/data-migrations/${id}/commit`, user.token, {});
    expect(status).toBe(201);
    expect(body.data.created).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(countRows("medicines", "created_by = ?", user.id)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Commit — opening stock
// ---------------------------------------------------------------------------

describe("POST /api/data-migrations/:id/commit (stock)", () => {
  it("creates a batch + stock_in transaction with balanceAfter and reason", async () => {
    const user = seedUser();
    const med = seedMedicine(user.id, { name: "DOLO 650" });
    const db0 = raw();
    db0
      .prepare("UPDATE medicines SET selling_price = 88.5, purchase_price = 60 WHERE id = ?")
      .run(med.medicineId);
    db0.close();

    const csv = "medicine,lot,exp,qty,mrp\nDOLO 650,OPEN-1,02/27,10,120";
    const created = await createImport(user.token, "stock", "opening-stock.csv", csv);
    expect(created.status).toBe(201);
    const id = created.body.data.importId;
    expect(created.body.data.errors).toBe(0);
    expect(created.body.data.rows[0].normalized.expiryDate).toBe("2027-02-28");

    const { status, body } = await post(`/api/data-migrations/${id}/commit`, user.token, {});
    expect(status).toBe(201);
    expect(body.data.created).toBe(1);

    const db = raw();
    const batch = db
      .prepare("SELECT * FROM batches WHERE created_by = ? AND batch_no = 'OPEN-1'")
      .get(user.id) as any;
    expect(batch).toBeTruthy();
    expect(batch.medicine_id).toBe(med.medicineId);
    expect(batch.quantity).toBe(10);
    expect(batch.initial_quantity).toBe(10);
    expect(batch.expiry_date).toBe("2027-02-28");
    expect(batch.mrp).toBe(120);
    // Blank prices fall back to the medicine's own values.
    expect(batch.selling_price).toBe(88.5);
    expect(batch.purchase_price).toBe(60);

    const tx = db
      .prepare(
        "SELECT * FROM inventory_transactions WHERE batch_id = ? AND type = 'stock_in'"
      )
      .get(batch.id) as any;
    expect(tx).toBeTruthy();
    expect(tx.quantity).toBe(10);
    expect(tx.balance_after).toBe(10);
    expect(tx.reason).toBe("Opening stock import");
    expect(tx.reference).toBe("opening-stock.csv");
    expect(tx.medicine_id).toBe(med.medicineId);
    db.close();
  });

  it("blocks commit with 400 when a medicine is unknown and persists nothing", async () => {
    const user = seedUser();
    seedMedicine(user.id, { name: "DOLO 650" });
    const csv = "medicine,lot,exp,qty\nDOLO 650,OPEN-OK,02/27,5\nGhost Med,OPEN-GHOST,02/27,5";
    const created = await createImport(user.token, "stock", "bad-stock.csv", csv);
    expect(created.status).toBe(201);
    const id = created.body.data.importId;
    expect(created.body.data.errors).toBe(1);

    const batchesBefore = countRows("batches", "created_by = ?", user.id);
    const txBefore = countRows("inventory_transactions", "created_by = ?", user.id);
    const { status, body } = await post(`/api/data-migrations/${id}/commit`, user.token, {});
    expect(status).toBe(400);
    expect(body.details.rows[0].field).toBe("medicineName");
    expect(countRows("batches", "created_by = ?", user.id)).toBe(batchesBefore);
    expect(countRows("inventory_transactions", "created_by = ?", user.id)).toBe(txBefore);

    const db = raw();
    const rec = db.prepare("SELECT status FROM data_imports WHERE id = ?").get(id) as any;
    db.close();
    expect(rec.status).toBe("draft");
  });

  it("skips duplicate batches inside the same file", async () => {
    const user = seedUser();
    seedMedicine(user.id, { name: "DOLO 650" });
    const csv = [
      "medicine,lot,exp,qty",
      "DOLO 650,OPEN-DUP,02/27,10",
      "DOLO 650,open-dup,02/27,20",
    ].join("\n");
    const created = await createImport(user.token, "stock", "dup-stock.csv", csv);
    const id = created.body.data.importId;
    expect(created.body.data.counts.ok).toBe(1);
    expect(created.body.data.counts.skipped).toBe(1);

    const { status, body } = await post(`/api/data-migrations/${id}/commit`, user.token, {});
    expect(status).toBe(201);
    expect(body.data.created).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(countRows("batches", "batch_no = 'OPEN-DUP' AND created_by = ?", user.id)).toBe(1);
  });

  it("does not skip a batch that already exists from a previous import", async () => {
    const user = seedUser();
    seedMedicine(user.id, { name: "DOLO 650" });
    const csv = "medicine,lot,exp,qty\nDOLO 650,OPEN-SAME,03/27,5";
    const first = await createImport(user.token, "stock", "stock-1.csv", csv);
    expect((await post(`/api/data-migrations/${first.body.data.importId}/commit`, user.token, {})).status).toBe(201);

    const second = await createImport(user.token, "stock", "stock-2.csv", csv);
    expect(second.body.data.counts.skipped).toBe(1);
    const { status, body } = await post(
      `/api/data-migrations/${second.body.data.importId}/commit`,
      user.token,
      {}
    );
    expect(status).toBe(201);
    expect(body.data.created).toBe(0);
    expect(countRows("batches", "batch_no = 'OPEN-SAME' AND created_by = ?", user.id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/data-migrations/:id", () => {
  it("deletes a draft import (and its rows)", async () => {
    const user = seedUser();
    const created = await createImport(user.token, "customers", "draft.csv", "name\nDraft Party");
    const id = created.body.data.importId;

    const removed = await del(`/api/data-migrations/${id}`, user.token);
    expect(removed.status).toBe(200);

    const after = await get(`/api/data-migrations/${id}`, user.token);
    expect(after.status).toBe(404);
    expect(countRows("data_import_rows", "import_id = ?", id)).toBe(0);
  });

  it("refuses to delete a committed import (404)", async () => {
    const user = seedUser();
    const created = await createImport(user.token, "customers", "to-commit.csv", "name\nKept Party");
    const id = created.body.data.importId;
    expect((await post(`/api/data-migrations/${id}/commit`, user.token, {})).status).toBe(201);

    const removed = await del(`/api/data-migrations/${id}`, user.token);
    expect(removed.status).toBe(404);
    expect(countRows("customers", "name = 'Kept Party' AND created_by = ?", user.id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

describe("POST /api/data-migrations/:id/rollback", () => {
  it("deletes the created customers and marks rows/session rolled_back", async () => {
    const user = seedUser();
    const created = await createImport(
      user.token,
      "customers",
      "rb-customers.csv",
      "name\nRollback One\nRollback Two"
    );
    const id = created.body.data.importId;
    expect((await post(`/api/data-migrations/${id}/commit`, user.token, {})).status).toBe(201);
    expect(countRows("customers", "created_by = ?", user.id)).toBe(2);

    const { status, body } = await post(`/api/data-migrations/${id}/rollback`, user.token, {});
    expect(status).toBe(200);
    expect(body.data.status).toBe("rolled_back");
    expect(body.data.deleted).toBe(2);
    expect(countRows("customers", "created_by = ?", user.id)).toBe(0);

    const db = raw();
    const rec = db.prepare("SELECT status FROM data_imports WHERE id = ?").get(id) as any;
    const rolled = db
      .prepare(
        "SELECT COUNT(*) AS c FROM data_import_rows WHERE import_id = ? AND row_status = 'rolled_back'"
      )
      .get(id) as { c: number };
    const audit = db
      .prepare(
        "SELECT COUNT(*) AS c FROM audit_events WHERE action = 'data_import.rollback' AND actor_id = ?"
      )
      .get(user.id) as { c: number };
    db.close();
    expect(rec.status).toBe("rolled_back");
    expect(rolled.c).toBe(2);
    expect(audit.c).toBe(1);
  });

  it("refuses with 409 and deletes nothing when a created customer is referenced", async () => {
    const user = seedUser();
    const created = await createImport(
      user.token,
      "customers",
      "rb-referenced.csv",
      "name\nUsed Party\nUnused Party"
    );
    const id = created.body.data.importId;
    expect((await post(`/api/data-migrations/${id}/commit`, user.token, {})).status).toBe(201);

    const customer = raw()
      .prepare("SELECT id FROM customers WHERE created_by = ? AND name = 'Used Party'")
      .get(user.id) as { id: string };
    seedInvoice(user.id, { customerId: customer.id, customerName: "Used Party" });

    const { status, body } = await post(`/api/data-migrations/${id}/rollback`, user.token, {});
    expect(status).toBe(409);
    expect(body.error).toContain("Cannot roll back");
    expect(body.details.skipped.length).toBeGreaterThan(0);
    expect(body.details.skipped[0].reason).toContain("referenced");

    // Nothing deleted, session stays committed.
    expect(countRows("customers", "name = 'Used Party' AND created_by = ?", user.id)).toBe(1);
    expect(countRows("customers", "name = 'Unused Party' AND created_by = ?", user.id)).toBe(1);
    const db = raw();
    const rec = db.prepare("SELECT status FROM data_imports WHERE id = ?").get(id) as any;
    db.close();
    expect(rec.status).toBe("committed");
  });

  it("removes the created batch + stock_in transaction when quantity is unchanged", async () => {
    const user = seedUser();
    seedMedicine(user.id, { name: "DOLO 650" });
    const created = await createImport(
      user.token,
      "stock",
      "rb-stock.csv",
      "medicine,lot,exp,qty\nDOLO 650,RB-1,04/27,8"
    );
    const id = created.body.data.importId;
    expect((await post(`/api/data-migrations/${id}/commit`, user.token, {})).status).toBe(201);

    const batch = raw()
      .prepare("SELECT id FROM batches WHERE created_by = ? AND batch_no = 'RB-1'")
      .get(user.id) as { id: string };
    expect(batch).toBeTruthy();
    expect(countRows("inventory_transactions", "batch_id = ?", batch.id)).toBe(1);

    const { status, body } = await post(`/api/data-migrations/${id}/rollback`, user.token, {});
    expect(status).toBe(200);
    expect(body.data.deleted).toBe(1);
    expect(countRows("batches", "id = ?", batch.id)).toBe(0);
    expect(countRows("inventory_transactions", "batch_id = ?", batch.id)).toBe(0);
    // The medicine itself is untouched.
    expect(countRows("medicines", "created_by = ?", user.id)).toBe(1);
  });

  it("refuses to roll back stock whose quantity moved since commit (nothing deleted)", async () => {
    const user = seedUser();
    seedMedicine(user.id, { name: "DOLO 650" });
    const created = await createImport(
      user.token,
      "stock",
      "rb-moved.csv",
      "medicine,lot,exp,qty\nDOLO 650,RB-2,05/27,8"
    );
    const id = created.body.data.importId;
    expect((await post(`/api/data-migrations/${id}/commit`, user.token, {})).status).toBe(201);

    const db = raw();
    const batch = db
      .prepare("SELECT id FROM batches WHERE created_by = ? AND batch_no = 'RB-2'")
      .get(user.id) as { id: string };
    db.prepare("UPDATE batches SET quantity = 3 WHERE id = ?").run(batch.id);
    db.close();

    const { status, body } = await post(`/api/data-migrations/${id}/rollback`, user.token, {});
    expect(status).toBe(409);
    expect(body.details.skipped[0].reason).toContain("stock moved");
    expect(countRows("batches", "id = ?", batch.id)).toBe(1);
    expect(countRows("inventory_transactions", "batch_id = ?", batch.id)).toBe(1);

    const check = raw();
    const rec = check.prepare("SELECT status FROM data_imports WHERE id = ?").get(id) as any;
    check.close();
    expect(rec.status).toBe("committed");
  });

  it("refuses rollback for drafts and refuses a second rollback", async () => {
    const user = seedUser();
    const created = await createImport(user.token, "customers", "rb-once.csv", "name\nOnce Party");
    const id = created.body.data.importId;

    const draftRollback = await post(`/api/data-migrations/${id}/rollback`, user.token, {});
    expect(draftRollback.status).toBe(409);

    expect((await post(`/api/data-migrations/${id}/commit`, user.token, {})).status).toBe(201);
    expect((await post(`/api/data-migrations/${id}/rollback`, user.token, {})).status).toBe(200);
    const twice = await post(`/api/data-migrations/${id}/rollback`, user.token, {});
    expect(twice.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Commit — suppliers
// ---------------------------------------------------------------------------

describe("POST /api/data-migrations/:id/commit (suppliers)", () => {
  it("creates suppliers with payment terms, credit limit and opening balance", async () => {
    const user = seedUser();
    const csv = "supplier,payment terms,credit limit,opening balance,mobile\nAcme Distributors,Net 45,25000,750,9876501234";
    const created = await createImport(user.token, "suppliers", "suppliers-commit.csv", csv);
    expect(created.status).toBe(201);
    const id = created.body.data.importId;
    expect(created.body.data.errors).toBe(0);

    const { status, body } = await post(`/api/data-migrations/${id}/commit`, user.token, {});
    expect(status).toBe(201);
    expect(body.data.created).toBe(1);

    const db = raw();
    const supplier = db
      .prepare("SELECT * FROM suppliers WHERE created_by = ? AND name = 'Acme Distributors'")
      .get(user.id) as any;
    db.close();
    expect(supplier.payment_terms).toBe("Net 45");
    expect(supplier.credit_limit).toBe(25000);
    expect(supplier.opening_balance).toBe(750);
    expect(supplier.balance).toBe(750);
    expect(supplier.phone).toBe("9876501234");
    expect(supplier.is_active).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe("tenant isolation", () => {
  it("list never exposes another tenant's import sessions", async () => {
    const userA = seedUser();
    const userB = seedUser();
    await createImport(userA.token, "customers", "private-a.csv", "name\nA Only");

    const listB = await get("/api/data-migrations", userB.token);
    expect(listB.status).toBe(200);
    expect(listB.body.data.some((x: any) => x.filename === "private-a.csv")).toBe(false);

    const listA = await get("/api/data-migrations", userA.token);
    expect(listA.body.data.some((x: any) => x.filename === "private-a.csv")).toBe(true);
  });

  it("returns 404 for a foreign import on every endpoint", async () => {
    const userA = seedUser();
    const userB = seedUser();
    const created = await createImport(
      userA.token,
      "customers",
      "tenant.csv",
      "name\nA Party"
    );
    const id = created.body.data.importId;

    expect((await get(`/api/data-migrations/${id}`, userB.token)).status).toBe(404);
    expect((await post(`/api/data-migrations/${id}/preview`, userB.token, {})).status).toBe(404);
    expect((await post(`/api/data-migrations/${id}/commit`, userB.token, {})).status).toBe(404);
    expect((await post(`/api/data-migrations/${id}/rollback`, userB.token, {})).status).toBe(404);
    expect((await del(`/api/data-migrations/${id}`, userB.token)).status).toBe(404);

    // Owner still reads it.
    expect((await get(`/api/data-migrations/${id}`, userA.token)).status).toBe(200);
    expect(countRows("customers", "name = 'A Party' AND created_by = ?", userA.id)).toBe(0);
  });

  it("creates entities for the importer only — another tenant's names never dedupe", async () => {
    const userA = seedUser();
    const userB = seedUser();
    seedCustomer(userA.id, { name: "Shared Party" });

    const created = await createImport(
      userB.token,
      "customers",
      "cross.csv",
      "name\nShared Party"
    );
    expect(created.status).toBe(201);
    const id = created.body.data.importId;
    // B has never seen A's customer — the row is ok for B.
    expect(created.body.data.counts.ok).toBe(1);

    const { status, body } = await post(`/api/data-migrations/${id}/commit`, userB.token, {});
    expect(status).toBe(201);
    expect(body.data.created).toBe(1);
    expect(countRows("customers", "name = 'Shared Party' AND created_by = ?", userB.id)).toBe(1);
    expect(countRows("customers", "name = 'Shared Party' AND created_by = ?", userA.id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Bulk bill operations
// ---------------------------------------------------------------------------

describe("POST /api/bulk-bills/preview", () => {
  it("returns matched invoices with correct per-field diffs", async () => {
    const user = seedUser();
    seedInvoice(user.id, { date: "2026-01-10", notes: "old note", paymentMode: "cash" });
    seedInvoice(user.id, { date: "2026-01-20", notes: "other", paymentMode: "upi" });
    seedInvoice(user.id, { date: "2026-02-10", notes: "outside", paymentMode: "cash" });

    const preview = await post("/api/bulk-bills/preview", user.token, {
      filters: { from: "2026-01-01", to: "2026-01-31" },
      patch: { notes: "batch note", paymentMode: "card" },
    });
    expect(preview.status).toBe(200);
    const data = preview.body.data;
    expect(data.total).toBe(2);
    expect(data.requiresConfirmation).toBe(true);
    expect(data.patch.notes).toBe("batch note");
    for (const inv of data.invoices) {
      expect(inv.diffs.notes.from).toBeTruthy();
      expect(inv.diffs.notes.to).toBe("batch note");
      expect(inv.diffs.paymentMode.to).toBe("card");
      expect(["2026-01-10", "2026-01-20"]).toContain(inv.date);
    }

    // Preview writes nothing.
    const db = raw();
    const unchanged = db
      .prepare("SELECT COUNT(*) AS c FROM invoices WHERE created_by = ? AND notes = 'batch note'")
      .get(user.id) as { c: number };
    db.close();
    expect(unchanged.c).toBe(0);
  });

  it("matches nothing with empty filters", async () => {
    const user = seedUser();
    seedInvoice(user.id, { date: "2026-01-10" });

    const preview = await post("/api/bulk-bills/preview", user.token, {
      filters: {},
      patch: { notes: "nope" },
    });
    expect(preview.status).toBe(200);
    expect(preview.body.data.total).toBe(0);
    expect(preview.body.data.invoices).toHaveLength(0);
  });

  it("rejects an invalid paymentMode and an unknown customer with 400", async () => {
    const user = seedUser();
    const badMode = await post("/api/bulk-bills/preview", user.token, {
      filters: { from: "2026-01-01" },
      patch: { paymentMode: "bitcoin" },
    });
    expect(badMode.status).toBe(400);

    const badCustomer = await post("/api/bulk-bills/preview", user.token, {
      filters: { from: "2026-01-01" },
      patch: { customerId: "does-not-exist" },
    });
    expect(badCustomer.status).toBe(400);
    expect(badCustomer.body.error).toBe("Customer not found");

    const emptyPatch = await post("/api/bulk-bills/preview", user.token, {
      filters: { from: "2026-01-01" },
      patch: {},
    });
    expect(emptyPatch.status).toBe(400);
  });

  it("never matches another tenant's invoices", async () => {
    const userA = seedUser();
    const userB = seedUser();
    seedInvoice(userB.id, { date: "2026-01-15", notes: "B bill" });

    const preview = await post("/api/bulk-bills/preview", userA.token, {
      filters: { from: "2026-01-01", to: "2026-01-31" },
      patch: { notes: "A edit" },
    });
    expect(preview.status).toBe(200);
    expect(preview.body.data.total).toBe(0);
  });
});

describe("POST /api/bulk-bills/commit", () => {
  it("requires the literal CONFIRM with 400", async () => {
    const user = seedUser();
    seedInvoice(user.id, { date: "2026-01-10" });

    const missing = await post("/api/bulk-bills/commit", user.token, {
      filters: { from: "2026-01-01" },
      patch: { notes: "x" },
    });
    expect(missing.status).toBe(400);

    const wrong = await post("/api/bulk-bills/commit", user.token, {
      filters: { from: "2026-01-01" },
      patch: { notes: "x" },
      confirm: "confirm",
    });
    expect(wrong.status).toBe(400);
    expect(getInvoiceCount(user.id, "x")).toBe(0);
  });

  it("returns 403 for a cashier", async () => {
    const cashier = seedUserWithRole("cashier");
    seedInvoice(cashier.id, { date: "2026-01-10" });

    const res = await post("/api/bulk-bills/commit", cashier.token, {
      filters: { from: "2026-01-01" },
      patch: { notes: "cashier edit" },
      confirm: "CONFIRM",
    });
    expect(res.status).toBe(403);
    expect(getInvoiceCount(cashier.id, "cashier edit")).toBe(0);
  });

  it("lets an admin update N invoices across date/notes/paymentMode/customer, audits once and skips cancelled", async () => {
    const admin = seedUserWithRole("admin");
    const customer = seedCustomer(admin.id, { name: "Bulk Party" });
    const inRange = [
      seedInvoice(admin.id, { date: "2026-01-05" }),
      seedInvoice(admin.id, { date: "2026-01-15" }),
      seedInvoice(admin.id, { date: "2026-01-25" }),
    ];
    const cancelled = seedInvoice(admin.id, { date: "2026-01-18", status: "cancelled" });
    const outside = seedInvoice(admin.id, { date: "2026-03-01" });

    const res = await post("/api/bulk-bills/commit", admin.token, {
      filters: { from: "2026-01-01", to: "2026-01-31" },
      patch: {
        date: "2026-02-01",
        notes: "bulk updated",
        paymentMode: "upi",
        customerId: customer.id,
      },
      confirm: "CONFIRM",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(3);
    expect(res.body.data.skipped).toBe(0);

    for (const id of inRange) {
      const inv = getInvoice(id);
      expect(inv.date).toBe("2026-02-01");
      expect(inv.notes).toBe("bulk updated");
      expect(inv.payment_mode).toBe("upi");
      expect(inv.customer_id).toBe(customer.id);
      expect(inv.customer_name).toBe("Bulk Party");
    }
    expect(getInvoice(cancelled).notes).toBeNull();
    expect(getInvoice(cancelled).date).toBe("2026-01-18");
    expect(getInvoice(outside).notes).toBeNull();
    expect(getInvoice(outside).date).toBe("2026-03-01");

    const db = raw();
    const audits = db
      .prepare("SELECT * FROM audit_events WHERE action = 'invoice.bulk_patch' AND actor_id = ?")
      .all(admin.id) as any[];
    db.close();
    expect(audits).toHaveLength(1);
    const metadata = JSON.parse(audits[0].metadata);
    expect(metadata.count).toBe(3);
    expect(metadata.patch.notes).toBe("bulk updated");
    expect(metadata.filters.from).toBe("2026-01-01");
  });

  it("only touches the provided patch keys — everything else stays intact", async () => {
    const admin = seedUserWithRole("admin");
    const customer = seedCustomer(admin.id, { name: "Untouched Party" });
    const id = seedInvoice(admin.id, {
      date: "2026-01-10",
      customerId: customer.id,
      customerName: "Untouched Party",
      paymentMode: "cash",
      subtotal: 499.5,
      grandTotal: 549.45,
      notes: "before",
    });

    const res = await post("/api/bulk-bills/commit", admin.token, {
      filters: { from: "2026-01-01", to: "2026-01-31" },
      patch: { notes: "only notes changed" },
      confirm: "CONFIRM",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);

    const inv = getInvoice(id);
    expect(inv.notes).toBe("only notes changed");
    expect(inv.date).toBe("2026-01-10");
    expect(inv.payment_mode).toBe("cash");
    expect(inv.customer_id).toBe(customer.id);
    expect(inv.customer_name).toBe("Untouched Party");
    expect(inv.subtotal).toBe(499.5);
    expect(inv.grand_total).toBe(549.45);
    expect(inv.status).toBe("paid");
  });

  it("is a no-op (updated 0) when the filters match nothing", async () => {
    const admin = seedUserWithRole("admin");
    seedInvoice(admin.id, { date: "2026-05-05" });

    const res = await post("/api/bulk-bills/commit", admin.token, {
      filters: { from: "2026-01-01", to: "2026-01-31" },
      patch: { notes: "should not land" },
      confirm: "CONFIRM",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(0);
    expect(getInvoiceCount(admin.id, "should not land")).toBe(0);
  });

  it("allows a pharmacist to commit", async () => {
    const pharmacist = seedUserWithRole("pharmacist");
    const id = seedInvoice(pharmacist.id, { date: "2026-01-12" });

    const res = await post("/api/bulk-bills/commit", pharmacist.token, {
      filters: { from: "2026-01-01", to: "2026-01-31" },
      patch: { paymentMode: "card" },
      confirm: "CONFIRM",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);
    expect(getInvoice(id).payment_mode).toBe("card");
  });
});

function getInvoiceCount(ownerId: string, notes: string): number {
  const db = raw();
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM invoices WHERE created_by = ? AND notes = ?")
    .get(ownerId, notes) as { c: number };
  db.close();
  return row.c;
}
