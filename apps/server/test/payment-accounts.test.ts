import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { applySchema, seedUser, type SeededUser } from "./helpers.js";
import paymentAccountRoutes from "../src/routes/paymentAccounts.js";
import { db } from "../src/db/index.js";
import { paymentAccountTransactions } from "../src/db/schema/index.js";

let app: FastifyInstance;
let ctx: SeededUser;

function auth(user: SeededUser) {
  return { authorization: `Bearer ${user.token}` };
}

function baseAccount(overrides: Record<string, unknown> = {}) {
  return {
    name: "HDFC Current",
    type: "bank",
    bankName: "HDFC Bank",
    ifsc: "HDFC0001234",
    accountNumberMasked: "**** 4821",
    accountHolder: "Test Pharma",
    openingBalanceMinor: 10000,
    ...overrides,
  };
}

async function createAccount(user: SeededUser, payload: Record<string, unknown> = baseAccount()) {
  return app.inject({
    method: "POST",
    url: "/api/payment-accounts",
    headers: auth(user),
    payload,
  });
}

async function adjust(user: SeededUser, id: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/api/payment-accounts/${id}/adjust`,
    headers: auth(user),
    payload,
  });
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(paymentAccountRoutes, { prefix: "/api/payment-accounts" });
  await app.ready();
});

beforeEach(async () => {
  ctx = seedUser();
});

describe("payment account create and list", () => {
  it("creates an account and reports its opening balance", async () => {
    const res = await createAccount(ctx);
    expect(res.statusCode).toBe(201);
    const account = res.json().data;
    expect(account.name).toBe("HDFC Current");
    expect(account.type).toBe("bank");
    expect(account.currency).toBe("INR");
    expect(account.balanceMinor).toBe(10000);

    const list = await app.inject({
      method: "GET",
      url: "/api/payment-accounts",
      headers: auth(ctx),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0].balanceMinor).toBe(10000);
  });

  it("keeps several accounts of different types side by side", async () => {
    await createAccount(ctx, baseAccount({ name: "Cash Box", type: "cash" }));
    await createAccount(ctx, baseAccount({ name: "UPI Shop", type: "upi", upiId: "shop@bank" }));
    await createAccount(ctx, baseAccount({ name: "Card Settle", type: "card" }));

    const list = await app.inject({
      method: "GET",
      url: "/api/payment-accounts",
      headers: auth(ctx),
    });
    expect(list.json().data).toHaveLength(3);
    expect(new Set(list.json().data.map((a: any) => a.type))).toEqual(
      new Set(["cash", "upi", "card"])
    );
  });

  it("rejects an unknown type and a missing name", async () => {
    const badType = await createAccount(ctx, baseAccount({ type: "crypto" }));
    expect(badType.statusCode).toBe(400);

    const noName = await createAccount(ctx, baseAccount({ name: "  " }));
    expect(noName.statusCode).toBe(400);
  });

  it("rejects a negative opening balance", async () => {
    const res = await createAccount(ctx, baseAccount({ openingBalanceMinor: -5 }));
    expect(res.statusCode).toBe(400);
  });
});

describe("payment account adjust", () => {
  it("adds and reduces with a running balance", async () => {
    const created = await createAccount(ctx);
    const id = created.json().data.id;

    const add = await adjust(ctx, id, {
      direction: "add",
      amountMinor: 25000,
      reason: "Cash sale deposit",
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().data.balanceMinor).toBe(35000);
    expect(add.json().data.transaction.direction).toBe("in");

    const reduce = await adjust(ctx, id, {
      direction: "reduce",
      amountMinor: 5000,
      reason: "Petty cash",
    });
    expect(reduce.json().data.balanceMinor).toBe(30000);
    expect(reduce.json().data.transaction.direction).toBe("out");
  });

  it("rejects zero or non-integer amounts and a bad direction", async () => {
    const created = await createAccount(ctx);
    const id = created.json().data.id;

    expect((await adjust(ctx, id, { direction: "add", amountMinor: 0 })).statusCode).toBe(400);
    expect((await adjust(ctx, id, { direction: "add", amountMinor: 10.5 })).statusCode).toBe(400);
    expect((await adjust(ctx, id, { direction: "topup", amountMinor: 100 })).statusCode).toBe(400);
  });

  it("returns 404 for another owner's account", async () => {
    const created = await createAccount(ctx);
    const id = created.json().data.id;
    const other = seedUser();

    const res = await adjust(other, id, { direction: "add", amountMinor: 100 });
    expect(res.statusCode).toBe(404);

    const rows = await db
      .select()
      .from(paymentAccountTransactions)
      .where(eq(paymentAccountTransactions.accountId, id));
    expect(rows).toHaveLength(0);
  });
});

describe("payment account statement", () => {
  it("shows a running balance and carries pre-window movements into the opening", async () => {
    const created = await createAccount(ctx, baseAccount({ openingBalanceMinor: 10000 }));
    const id = created.json().data.id;

    // Two movements with fixed dates so the window filter is deterministic.
    await db.insert(paymentAccountTransactions).values([
      {
        accountId: id,
        createdBy: ctx.id,
        direction: "in",
        amountMinor: 20000,
        reason: "Deposit",
        createdAt: new Date("2099-01-10T10:00:00"),
      },
      {
        accountId: id,
        createdBy: ctx.id,
        direction: "out",
        amountMinor: 5000,
        reason: "Withdrawal",
        createdAt: new Date("2099-02-10T10:00:00"),
      },
    ]);

    const full = await app.inject({
      method: "GET",
      url: `/api/payment-accounts/${id}/statement`,
      headers: auth(ctx),
    });
    expect(full.statusCode).toBe(200);
    const statement = full.json().data;
    expect(statement.openingMinor).toBe(10000);
    expect(statement.rows).toHaveLength(2);
    expect(statement.rows[0].runningBalanceMinor).toBe(30000);
    expect(statement.rows[1].runningBalanceMinor).toBe(25000);
    expect(statement.closingMinor).toBe(25000);

    // From February: the January deposit is folded into the opening.
    const feb = await app.inject({
      method: "GET",
      url: `/api/payment-accounts/${id}/statement?from=2099-02-01`,
      headers: auth(ctx),
    });
    const febData = feb.json().data;
    expect(febData.openingMinor).toBe(30000);
    expect(febData.rows).toHaveLength(1);
    expect(febData.rows[0].runningBalanceMinor).toBe(25000);
    expect(febData.closingMinor).toBe(25000);

    // January only.
    const jan = await app.inject({
      method: "GET",
      url: `/api/payment-accounts/${id}/statement?from=2099-01-01&to=2099-01-31`,
      headers: auth(ctx),
    });
    const janData = jan.json().data;
    expect(janData.rows).toHaveLength(1);
    expect(janData.closingMinor).toBe(30000);
  });

  it("rejects a malformed date filter and a foreign account", async () => {
    const created = await createAccount(ctx);
    const id = created.json().data.id;

    const badDate = await app.inject({
      method: "GET",
      url: `/api/payment-accounts/${id}/statement?from=not-a-date`,
      headers: auth(ctx),
    });
    expect(badDate.statusCode).toBe(400);

    const other = seedUser();
    const foreign = await app.inject({
      method: "GET",
      url: `/api/payment-accounts/${id}/statement`,
      headers: auth(other),
    });
    expect(foreign.statusCode).toBe(404);
  });
});

describe("payment account update and delete", () => {
  it("updates master fields", async () => {
    const created = await createAccount(ctx);
    const id = created.json().data.id;

    const updated = await app.inject({
      method: "PUT",
      url: `/api/payment-accounts/${id}`,
      headers: auth(ctx),
      payload: { name: "Kotak Current", upiId: "store@kotak", openingBalanceMinor: 15000 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.name).toBe("Kotak Current");
    expect(updated.json().data.upiId).toBe("store@kotak");
    expect(updated.json().data.openingBalanceMinor).toBe(15000);
    expect(updated.json().data.balanceMinor).toBe(15000);
  });

  it("refuses to delete an account that has movements, allows an empty one", async () => {
    const created = await createAccount(ctx);
    const id = created.json().data.id;
    await adjust(ctx, id, { direction: "add", amountMinor: 1000 });

    const blocked = await app.inject({
      method: "DELETE",
      url: `/api/payment-accounts/${id}`,
      headers: auth(ctx),
    });
    expect(blocked.statusCode).toBe(409);

    const fresh = await createAccount(ctx, baseAccount({ name: "Empty Box", type: "cash" }));
    const removed = await app.inject({
      method: "DELETE",
      url: `/api/payment-accounts/${fresh.json().data.id}`,
      headers: auth(ctx),
    });
    expect(removed.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: `/api/payment-accounts/${fresh.json().data.id}`,
      headers: auth(ctx),
    });
    expect(after.statusCode).toBe(404);
  });
});
