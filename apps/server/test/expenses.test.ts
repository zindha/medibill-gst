import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { applySchema, seedUser, type SeededUser } from "./helpers.js";
import expenseRoutes from "../src/routes/expenses.js";
import { db } from "../src/db/index.js";
import { expenseItems, expenses, settings } from "../src/db/schema/index.js";

let app: FastifyInstance;
let ctx: SeededUser;

/** Business state code used by the GST split: 27 = Maharashtra. */
const BUSINESS_GSTIN = "27AAAAA0000A1Z5";

function auth(user: SeededUser) {
  return { authorization: `Bearer ${user.token}` };
}

function baseExpense(overrides: Record<string, unknown> = {}) {
  return {
    date: "2099-03-05",
    category: "Rent",
    isGst: false,
    items: [{ name: "Shop rent", quantity: 1, unitRate: 1000, gstRate: 0 }],
    ...overrides,
  };
}

async function postExpense(user: SeededUser, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/expenses",
    headers: auth(user),
    payload,
  });
}

async function postParty(user: SeededUser, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/expenses/parties",
    headers: auth(user),
    payload,
  });
}

async function listExpenses(user: SeededUser, query: Record<string, string> = {}) {
  const search = new URLSearchParams(query).toString();
  return app.inject({
    method: "GET",
    url: `/api/expenses${search ? `?${search}` : ""}`,
    headers: auth(user),
  });
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(expenseRoutes, { prefix: "/api/expenses" });
  await app.ready();
});

beforeEach(async () => {
  ctx = seedUser();
  await db.delete(settings).where(eq(settings.key, "store_gstin"));
  await db.insert(settings).values({ key: "store_gstin", value: BUSINESS_GSTIN });
});

describe("expense numbering", () => {
  it("increments the expense number per owner and month", async () => {
    const first = await postExpense(ctx, baseExpense());
    expect(first.statusCode).toBe(201);
    expect(first.json().data.expense.number).toBe("EXP-209903-0001");

    const second = await postExpense(ctx, baseExpense({ date: "2099-03-31" }));
    expect(second.json().data.expense.number).toBe("EXP-209903-0002");

    // A different month restarts the sequence.
    const later = await postExpense(ctx, baseExpense({ date: "2099-04-01" }));
    expect(later.json().data.expense.number).toBe("EXP-209904-0001");

    // Another owner keeps its own sequence.
    const other = seedUser();
    const theirs = await postExpense(other, baseExpense());
    expect(theirs.json().data.expense.number).toBe("EXP-209903-0001");
  });
});

describe("GST split", () => {
  it("splits CGST and SGST for a party in the business state", async () => {
    const party = await postParty(ctx, { name: "Maha Vendor", gstin: "27ABCDE1234F1Z5" });
    expect(party.statusCode).toBe(201);

    const res = await postExpense(
      ctx,
      baseExpense({
        partyId: party.json().data.id,
        isGst: true,
        invoiceNo: "INV-001",
        items: [{ name: "Consulting", hsn: "998311", quantity: 2, unitRate: 500, gstRate: 18 }],
      })
    );
    expect(res.statusCode).toBe(201);

    const data = res.json().data;
    expect(data.expense.subtotal).toBe(1000);
    expect(data.expense.taxAmount).toBe(180);
    expect(data.expense.total).toBe(1180);
    expect(data.taxBreakup.intraState).toBe(true);
    expect(data.taxBreakup.cgst).toBe(90);
    expect(data.taxBreakup.sgst).toBe(90);
    expect(data.taxBreakup.igst).toBe(0);
    expect(data.items[0].cgst).toBe(90);
    expect(data.items[0].sgst).toBe(90);
  });

  it("charges IGST for a party in another state", async () => {
    const party = await postParty(ctx, { name: "Karnataka Vendor", gstin: "29ABCDE1234F1Z5" });
    expect(party.statusCode).toBe(201);

    const res = await postExpense(
      ctx,
      baseExpense({
        partyId: party.json().data.id,
        isGst: true,
        invoiceNo: "INV-002",
        items: [{ name: "Consulting", hsn: "998311", quantity: 2, unitRate: 500, gstRate: 18 }],
      })
    );
    expect(res.statusCode).toBe(201);

    const data = res.json().data;
    expect(data.taxBreakup.intraState).toBe(false);
    expect(data.taxBreakup.cgst).toBe(0);
    expect(data.taxBreakup.sgst).toBe(0);
    expect(data.taxBreakup.igst).toBe(180);
    expect(data.expense.total).toBe(1180);
  });

  it("rounds the total off to the nearest rupee and keeps the difference", async () => {
    const res = await postExpense(
      ctx,
      baseExpense({
        items: [{ name: "Packing", quantity: 3, unitRate: 33.33, gstRate: 0 }],
      })
    );
    const data = res.json().data;
    expect(data.expense.subtotal).toBe(99.99);
    expect(data.expense.roundOff).toBe(0.01);
    expect(data.expense.total).toBe(100);
  });

  it("rejects a GST expense without an invoice number", async () => {
    const res = await postExpense(
      ctx,
      baseExpense({
        isGst: true,
        items: [{ name: "Consulting", hsn: "998311", quantity: 1, unitRate: 500, gstRate: 18 }],
      })
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
    expect(res.json().error).toMatch(/invoice number/i);
  });

  it("rejects a GST expense without an HSN code on a line", async () => {
    const res = await postExpense(
      ctx,
      baseExpense({
        isGst: true,
        invoiceNo: "INV-003",
        items: [
          { name: "Consulting", hsn: "998311", quantity: 1, unitRate: 500, gstRate: 18 },
          { name: "Courier", quantity: 1, unitRate: 50, gstRate: 5 },
        ],
      })
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/hsn/i);
  });

  it("rejects an expense without a date, category or item", async () => {
    const noDate = await postExpense(ctx, baseExpense({ date: "" }));
    expect(noDate.statusCode).toBe(400);

    const noCategory = await postExpense(ctx, baseExpense({ category: "" }));
    expect(noCategory.statusCode).toBe(400);

    const noItems = await postExpense(ctx, baseExpense({ items: [] }));
    expect(noItems.statusCode).toBe(400);
  });
});

describe("expense list", () => {
  it("filters by free text on the number or the party name", async () => {
    const party = await postParty(ctx, { name: "Alpha Traders" });
    await postExpense(ctx, baseExpense({ partyId: party.json().data.id }));

    const byParty = await listExpenses(ctx, { q: "Alpha" });
    expect(byParty.statusCode).toBe(200);
    expect(byParty.json().data.total).toBe(1);
    expect(byParty.json().data.items[0].partyName).toBe("Alpha Traders");

    const byNumber = await listExpenses(ctx, { q: "EXP-209903-0001" });
    expect(byNumber.json().data.total).toBe(1);

    const noMatch = await listExpenses(ctx, { q: "Nothing" });
    expect(noMatch.json().data.total).toBe(0);
  });

  it("filters by date range", async () => {
    await postExpense(ctx, baseExpense({ date: "2099-03-05" }));
    await postExpense(ctx, baseExpense({ date: "2099-04-02" }));

    const march = await listExpenses(ctx, { from: "2099-03-01", to: "2099-03-31" });
    expect(march.json().data.total).toBe(1);
    expect(march.json().data.items[0].date).toBe("2099-03-05");

    const all = await listExpenses(ctx, { from: "2099-01-01", to: "2099-12-31" });
    expect(all.json().data.total).toBe(2);
  });

  it("filters GST expenses only", async () => {
    await postExpense(ctx, baseExpense({ isGst: false }));
    await postExpense(
      ctx,
      baseExpense({
        isGst: true,
        invoiceNo: "INV-004",
        items: [{ name: "Consulting", hsn: "998311", quantity: 1, unitRate: 500, gstRate: 18 }],
      })
    );

    const gstOnly = await listExpenses(ctx, { gstOnly: "true" });
    expect(gstOnly.json().data.total).toBe(1);
    expect(gstOnly.json().data.items[0].isGst).toBe(true);

    const all = await listExpenses(ctx);
    expect(all.json().data.total).toBe(2);
  });

  it("paginates the list", async () => {
    await postExpense(ctx, baseExpense());
    await postExpense(ctx, baseExpense());
    await postExpense(ctx, baseExpense());

    const firstPage = await listExpenses(ctx, { page: "1", pageSize: "2" });
    const firstData = firstPage.json().data;
    expect(firstData.total).toBe(3);
    expect(firstData.page).toBe(1);
    expect(firstData.pageSize).toBe(2);
    expect(firstData.items).toHaveLength(2);

    const secondPage = await listExpenses(ctx, { page: "2", pageSize: "2" });
    expect(secondPage.json().data.items).toHaveLength(1);
  });

  it("does not show another owner's expenses", async () => {
    const other = seedUser();
    await postExpense(other, baseExpense());

    const mine = await listExpenses(ctx);
    expect(mine.json().data.total).toBe(0);
  });
});

describe("expense update and delete", () => {
  it("recomputes the totals on update", async () => {
    const created = await postExpense(ctx, baseExpense());
    const id = created.json().data.expense.id;
    expect(created.json().data.expense.total).toBe(1000);

    const updated = await app.inject({
      method: "PUT",
      url: `/api/expenses/${id}`,
      headers: auth(ctx),
      payload: baseExpense({
        items: [{ name: "Shop rent", quantity: 2, unitRate: 1000, gstRate: 0 }],
      }),
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.expense.subtotal).toBe(2000);
    expect(updated.json().data.expense.total).toBe(2000);
    // The expense number is kept on update.
    expect(updated.json().data.expense.number).toBe("EXP-209903-0001");

    const rows = await db.select().from(expenseItems).where(eq(expenseItems.expenseId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(2000);
  });

  it("deletes the expense and its items", async () => {
    const created = await postExpense(ctx, baseExpense());
    const id = created.json().data.expense.id;

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/expenses/${id}`,
      headers: auth(ctx),
    });
    expect(removed.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: `/api/expenses/${id}`,
      headers: auth(ctx),
    });
    expect(after.statusCode).toBe(404);

    const rows = await db.select().from(expenseItems).where(eq(expenseItems.expenseId, id));
    expect(rows).toHaveLength(0);
  });
});

describe("expense parties", () => {
  it("rejects an invalid GSTIN", async () => {
    const res = await postParty(ctx, { name: "Bad Vendor", gstin: "NOT-A-GSTIN" });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);

    const rows = await db.select().from(expenses).where(eq(expenses.createdBy, ctx.id));
    expect(rows).toHaveLength(0);
  });

  it("accepts a valid GSTIN and prefills the state", async () => {
    const res = await postParty(ctx, { name: "Good Vendor", gstin: " 27 abcde-1234 f1z5 " });
    expect(res.statusCode).toBe(201);

    const party = res.json().data;
    expect(party.gstin).toBe("27ABCDE1234F1Z5");
    expect(party.stateCode).toBe("27");
    expect(party.state).toBe("Maharashtra");
    expect(party.isActive).toBe(true);
  });

  it("deactivates a party instead of destroying it", async () => {
    const created = await postParty(ctx, { name: "Temp Vendor" });
    const id = created.json().data.id;

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/expenses/parties/${id}`,
      headers: auth(ctx),
    });
    expect(removed.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: "/api/expenses/parties",
      headers: auth(ctx),
    });
    expect(list.json().data).toHaveLength(0);
  });
});

describe("expense metadata and products", () => {
  it("returns the expense categories", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/expenses/metadata",
      headers: auth(ctx),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.categories).toContain("Rent");
    expect(res.json().data.categories).toContain("Other");
  });

  it("returns an empty product list when nothing matches", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/expenses/products?q=zzz",
      headers: auth(ctx),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });
});
