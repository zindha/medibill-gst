import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  applySchema,
  seedMedicine,
  seedUser,
  type SeededMedicine,
  type SeededUser,
} from "./helpers.js";
import invoiceRoutes from "../src/routes/invoices.js";
import expenseRoutes from "../src/routes/expenses.js";
import returnsRoutes from "../src/routes/returns.js";
import purchaseReturnRoutes from "../src/routes/purchaseReturns.js";
import settingsRoutes from "../src/routes/settings.js";
import { db } from "../src/db/index.js";
import { settings } from "../src/db/schema/index.js";
import { NUMBERING_SETTING_KEY, nextDocumentNumber } from "../src/services/numbering.js";

let app: FastifyInstance;
let ctx: SeededUser;
let med: SeededMedicine;

const auth = (u: SeededUser) => ({ authorization: `Bearer ${u.token}` });

/** The year the invoice / return series is dated with. */
const currentYear = new Date().getFullYear();

async function putFormats(user: SeededUser, patch: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: "/api/settings/numbering-formats",
    headers: auth(user),
    payload: { value: patch },
  });
}

async function getFormats(user: SeededUser) {
  return app.inject({
    method: "GET",
    url: "/api/settings/numbering-formats",
    headers: auth(user),
  });
}

async function nextInvoiceNumber(user: SeededUser) {
  const res = await app.inject({
    method: "GET",
    url: "/api/invoices/next-number",
    headers: auth(user),
  });
  return res.json().data.invoiceNo as string;
}

async function postInvoice(user: SeededUser, medicine: SeededMedicine = med) {
  const item = {
    medicineId: medicine.medicineId,
    medicineName: "Test Med",
    quantity: 1,
    unit: "Strip",
    mrp: 100,
    rate: 95.24,
    amount: 95.24,
    gstRate: "5",
    gstAmount: 4.76,
    cgst: 2.38,
    sgst: 2.38,
  };
  return app.inject({
    method: "POST",
    url: "/api/invoices",
    headers: auth(user),
    payload: {
      date: "2099-01-01",
      subtotal: 95.24,
      totalGst: 4.76,
      cgst: 2.38,
      sgst: 2.38,
      grandTotal: 100,
      amountPaid: 100,
      paymentMode: "cash",
      status: "paid",
      items: [item],
    },
  });
}

async function postExpense(user: SeededUser, over: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/expenses",
    headers: auth(user),
    payload: {
      date: "2099-03-05",
      category: "Rent",
      isGst: false,
      items: [{ name: "Shop rent", quantity: 1, unitRate: 1000, gstRate: 0 }],
      ...over,
    },
  });
}

async function postSaleReturn(user: SeededUser, invoice: any) {
  return app.inject({
    method: "POST",
    url: "/api/returns",
    headers: auth(user),
    payload: {
      invoiceId: invoice.id,
      refundMode: "cash",
      items: [
        {
          medicineId: med.medicineId,
          medicineName: "Test Med",
          batchId: med.batchId,
          quantity: 1,
          rate: 95.24,
          amount: 95.24,
          gstRate: "5",
          gstAmount: invoice.totalGst,
          refundAmount: invoice.grandTotal,
        },
      ],
      subtotal: invoice.subtotal,
      totalGst: invoice.totalGst,
      grandTotal: invoice.grandTotal,
      refundAmount: invoice.grandTotal,
    },
  });
}

async function postPurchaseReturn(user: SeededUser, medicine: SeededMedicine = med) {
  return app.inject({
    method: "POST",
    url: "/api/purchase-returns",
    headers: auth(user),
    payload: {
      date: "2099-05-06",
      refundMode: "cash",
      items: [{ medicineId: medicine.medicineId, quantity: 2, rate: 100 }],
    },
  });
}

/** Drop the stored numbering setting so a test starts from the defaults. */
async function clearFormats() {
  await db.delete(settings).where(eq(settings.key, NUMBERING_SETTING_KEY));
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(expenseRoutes, { prefix: "/api/expenses" });
  await app.register(returnsRoutes, { prefix: "/api/returns" });
  await app.register(purchaseReturnRoutes, { prefix: "/api/purchase-returns" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.ready();
});

beforeEach(async () => {
  await clearFormats();
  ctx = seedUser();
  med = seedMedicine(ctx.id, { quantity: 50 });
});

afterEach(async () => {
  // The scratch database is shared by every test file in the run — never leak
  // a numbering override into another file.
  await clearFormats();
});

describe("numbering settings", () => {
  it("exposes the built-in defaults when nothing is stored", async () => {
    const res = await getFormats(ctx);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.key).toBe("numberingFormats");
    expect(body.data.value).toEqual({
      invoice: { prefix: "MB", pad: 6, startAt: 1, scope: "year" },
      expense: { prefix: "EXP", pad: 4, startAt: 1, scope: "month" },
      saleReturn: { prefix: "RET", pad: 6, startAt: 1, scope: "year" },
      purchaseReturn: { prefix: "PR", pad: 6, startAt: 1, scope: "year" },
    });
  });

  it("stores a prefix change and reports it back", async () => {
    const put = await putFormats(ctx, { invoice: { prefix: "ABC" } });
    expect(put.statusCode).toBe(200);
    expect(put.json().data.value.invoice.prefix).toBe("ABC");

    const res = await getFormats(ctx);
    expect(res.json().data.value.invoice).toEqual({
      prefix: "ABC",
      pad: 6,
      startAt: 1,
      scope: "year",
    });
  });

  it("rejects an invalid numberingFormats payload", async () => {
    const cases: unknown[] = [
      { invoice: { prefix: "" } }, // empty prefix
      { invoice: { prefix: "TOO-LONG-PREFIX" } }, // more than 8 characters
      { invoice: { pad: 0 } }, // pad below 1
      { invoice: { pad: 9 } }, // pad above 8
      { invoice: { startAt: 0 } }, // startAt below 1
      { invoice: { scope: "decade" } }, // unknown scope
      { invoice: { prefix: "MB", pattern: "legacy" } }, // unknown field
      { invoice: { prefix: "MB" }, purchaseBill: { prefix: "PB" } }, // unknown document type
    ];
    for (const value of cases) {
      const res = await putFormats(ctx, value as Record<string, unknown>);
      expect(res.statusCode, `payload ${JSON.stringify(value)} must be rejected`).toBe(400);
      expect(res.json().success).toBe(false);
    }

    // Nothing was stored by the rejected calls.
    const stored = await getFormats(ctx);
    expect(stored.json().data.value.invoice.prefix).toBe("MB");
  });

  it("falls back to the defaults when the stored setting is unusable", async () => {
    await db.insert(settings).values({ key: NUMBERING_SETTING_KEY, value: "{not json" });

    const res = await getFormats(ctx);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.value.invoice).toEqual({
      prefix: "MB",
      pad: 6,
      startAt: 1,
      scope: "year",
    });
    expect(await nextInvoiceNumber(ctx)).toMatch(/^MB-\d{4}-\d{6}$/);
  });
});

describe("invoice numbering", () => {
  it("keeps the current MB-YYYY-###### shape by default", async () => {
    const preview = await nextInvoiceNumber(ctx);
    expect(preview).toMatch(/^MB-\d{4}-\d{6}$/);
    expect(preview).toMatch(new RegExp(`^MB-${currentYear}-\\d{6}$`));

    const created = await postInvoice(ctx);
    expect(created.statusCode).toBe(201);
    const invoiceNo = created.json().data.invoiceNo as string;
    expect(invoiceNo).toMatch(/^MB-\d{4}-\d{6}$/);
    // The previewed number is the number the server actually assigns.
    expect(invoiceNo).toBe(preview);
  });

  it("uses a changed invoice prefix for the next invoice", async () => {
    await putFormats(ctx, { invoice: { prefix: "ABC" } });

    const preview = await nextInvoiceNumber(ctx);
    expect(preview).toMatch(new RegExp(`^ABC-${currentYear}-\\d{6}$`));

    const created = await postInvoice(ctx);
    expect(created.statusCode).toBe(201);
    expect(created.json().data.invoiceNo).toBe(preview);
    expect(created.json().data.invoiceNo).toMatch(new RegExp(`^ABC-${currentYear}-\\d{6}$`));
  });

  it("continues the sequence from the highest existing number", async () => {
    await putFormats(ctx, { invoice: { prefix: "SEQ" } });

    const first = (await postInvoice(ctx)).json().data.invoiceNo as string;
    const second = (await postInvoice(ctx)).json().data.invoiceNo as string;
    expect(first).toBe(`SEQ-${currentYear}-000001`);
    expect(second).toBe(`SEQ-${currentYear}-000002`);

    // The next one continues from the highest existing sequence.
    expect(await nextInvoiceNumber(ctx)).toBe(`SEQ-${currentYear}-000003`);
  });

  it("never hands out a sequence below startAt", async () => {
    await putFormats(ctx, { invoice: { prefix: "STA", startAt: 50 } });
    const first = (await postInvoice(ctx)).json().data.invoiceNo as string;
    expect(first).toBe(`STA-${currentYear}-000050`);

    // startAt is a floor, not a counter: the sequence continues past it.
    await putFormats(ctx, { invoice: { prefix: "STA", startAt: 1 } });
    const second = (await postInvoice(ctx)).json().data.invoiceNo as string;
    expect(second).toBe(`STA-${currentYear}-000051`);
  });

  it("honours the padding width", async () => {
    await putFormats(ctx, { invoice: { prefix: "PAD", pad: 3, startAt: 7 } });
    const created = await postInvoice(ctx);
    expect(created.statusCode).toBe(201);
    expect(created.json().data.invoiceNo).toBe(`PAD-${currentYear}-007`);
  });
});

describe("other document series", () => {
  it("numbers expenses with their own prefix and per-month scope", async () => {
    await putFormats(ctx, { expense: { prefix: "EXX" } });

    const res = await postExpense(ctx);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.expense.number).toBe("EXX-209903-0001");

    const second = await postExpense(ctx);
    expect(second.json().data.expense.number).toBe("EXX-209903-0002");

    // A different month restarts the sequence (month scope).
    const later = await postExpense(ctx, { date: "2099-04-01" });
    expect(later.json().data.expense.number).toBe("EXX-209904-0001");
  });

  it("numbers sale returns with their own prefix and year scope", async () => {
    const invoice = (await postInvoice(ctx)).json().data;
    await putFormats(ctx, { saleReturn: { prefix: "RTS" } });

    const res = await postSaleReturn(ctx, invoice);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.returnNo).toBe(`RTS-${currentYear}-000001`);
  });

  it("numbers purchase returns with their own prefix and year scope", async () => {
    await putFormats(ctx, { purchaseReturn: { prefix: "PRS" } });

    const res = await postPurchaseReturn(ctx);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.returnNo).toBe(`PRS-${currentYear}-000001`);
  });

  it("keeps the default prefixes for the other series", async () => {
    const expense = await nextDocumentNumber("expense", { ownerId: ctx.id, date: "2099-03-05" });
    expect(expense.number).toBe("EXP-209903-0001");

    const saleReturn = await nextDocumentNumber("saleReturn");
    expect(saleReturn.number).toMatch(new RegExp(`^RET-${currentYear}-\\d{6}$`));

    const purchaseReturn = await nextDocumentNumber("purchaseReturn");
    expect(purchaseReturn.number).toMatch(new RegExp(`^PR-${currentYear}-\\d{6}$`));
  });
});
