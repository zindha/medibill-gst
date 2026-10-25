import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { applySchema, seedUser, type SeededUser } from "./helpers.js";
import chequeRoutes from "../src/routes/cheques.js";
import paymentAccountRoutes from "../src/routes/paymentAccounts.js";

let app: FastifyInstance;
let ctx: SeededUser;

function auth(user: SeededUser) {
  return { authorization: `Bearer ${user.token}` };
}

async function createAccount(user: SeededUser, openingBalanceMinor: number) {
  const res = await app.inject({
    method: "POST",
    url: "/api/payment-accounts",
    headers: auth(user),
    payload: { name: "HDFC Current", type: "bank", openingBalanceMinor },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data;
}

function baseCheque(overrides: Record<string, unknown> = {}) {
  return {
    direction: "issued",
    partyType: "supplier",
    partyName: "Med Distributors",
    chequeNo: "000481",
    amountMinor: 25000,
    issueDate: "2099-03-01",
    dueDate: "2099-03-15",
    ...overrides,
  };
}

async function createCheque(user: SeededUser, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/cheques",
    headers: auth(user),
    payload,
  });
}

async function setStatus(user: SeededUser, id: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/api/cheques/${id}/status`,
    headers: auth(user),
    payload,
  });
}

async function accountBalance(user: SeededUser, id: string): Promise<number> {
  const res = await app.inject({
    method: "GET",
    url: `/api/payment-accounts/${id}`,
    headers: auth(user),
  });
  expect(res.statusCode).toBe(200);
  return res.json().data.balanceMinor;
}

async function listCheques(user: SeededUser, query: Record<string, string> = {}) {
  const search = new URLSearchParams(query).toString();
  return app.inject({
    method: "GET",
    url: `/api/cheques${search ? `?${search}` : ""}`,
    headers: auth(user),
  });
}

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(chequeRoutes, { prefix: "/api/cheques" });
  await app.register(paymentAccountRoutes, { prefix: "/api/payment-accounts" });
  await app.ready();
});

beforeEach(async () => {
  ctx = seedUser();
});

describe("cheque create and list", () => {
  it("creates a pending cheque with its details", async () => {
    const res = await createCheque(ctx, baseCheque());
    expect(res.statusCode).toBe(201);
    const cheque = res.json().data;
    expect(cheque.status).toBe("pending");
    expect(cheque.direction).toBe("issued");
    expect(cheque.partyName).toBe("Med Distributors");
    expect(cheque.accountId).toBeNull();
    expect(cheque.clearedAt).toBeNull();
  });

  it("rejects a bad due date, zero amount and unknown party type", async () => {
    expect(
      (await createCheque(ctx, baseCheque({ dueDate: "15/03/2099" }))).statusCode
    ).toBe(400);
    expect((await createCheque(ctx, baseCheque({ amountMinor: 0 }))).statusCode).toBe(400);
    expect((await createCheque(ctx, baseCheque({ partyType: "agent" }))).statusCode).toBe(400);
  });

  it("rejects a linked account that belongs to someone else", async () => {
    const other = seedUser();
    const foreign = await createAccount(other, 1000);

    const res = await createCheque(ctx, baseCheque({ accountId: foreign.id }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/account/i);
  });

  it("filters by status, direction and due-date range", async () => {
    const account = await createAccount(ctx, 100000);
    const clearable = await createCheque(
      ctx,
      baseCheque({ dueDate: "2099-03-10", accountId: account.id })
    );
    await createCheque(ctx, baseCheque({ dueDate: "2099-03-20", direction: "received" }));
    await createCheque(ctx, baseCheque({ dueDate: "2099-04-05" }));
    await setStatus(ctx, clearable.json().data.id, { status: "cleared" });

    const pending = await listCheques(ctx, { status: "pending" });
    expect(pending.json().data.count).toBe(2);

    const received = await listCheques(ctx, { direction: "received" });
    expect(received.json().data.count).toBe(1);
    expect(received.json().data.rows[0].direction).toBe("received");

    const march = await listCheques(ctx, { from: "2099-03-01", to: "2099-03-31" });
    expect(march.json().data.count).toBe(2);

    // Cleared rows keep the linked account's name for the register table.
    const cleared = await listCheques(ctx, { status: "cleared" });
    expect(cleared.json().data.rows[0].accountName).toBe("HDFC Current");
  });

  it("does not show another owner's cheques", async () => {
    const other = seedUser();
    await createCheque(other, baseCheque());

    const mine = await listCheques(ctx);
    expect(mine.json().data.count).toBe(0);
  });
});

describe("cheque status transitions", () => {
  it("clears an issued cheque by taking money out of the linked account", async () => {
    const account = await createAccount(ctx, 100000);
    const cheque = (await createCheque(ctx, baseCheque({ accountId: account.id }))).json().data;

    const res = await setStatus(ctx, cheque.id, { status: "cleared" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.cheque.status).toBe("cleared");
    expect(res.json().data.cheque.clearedAt).toBeTruthy();
    expect(res.json().data.transaction.direction).toBe("out");
    expect(res.json().data.transaction.amountMinor).toBe(25000);
    expect(res.json().data.transaction.refType).toBe("cheque");
    expect(res.json().data.transaction.refId).toBe(cheque.id);
    expect(await accountBalance(ctx, account.id)).toBe(75000);
  });

  it("clears a received cheque by bringing money into the linked account", async () => {
    const account = await createAccount(ctx, 1000);
    const cheque = (
      await createCheque(
        ctx,
        baseCheque({ direction: "received", partyType: "customer", accountId: account.id })
      )
    ).json().data;

    const res = await setStatus(ctx, cheque.id, { status: "cleared" });
    expect(res.json().data.transaction.direction).toBe("in");
    expect(await accountBalance(ctx, account.id)).toBe(26000);
  });

  it("does not touch the account on bounce or cancel", async () => {
    const account = await createAccount(ctx, 100000);
    const bounced = (
      await createCheque(ctx, baseCheque({ accountId: account.id, chequeNo: "000490" }))
    ).json().data;
    const cancelled = (
      await createCheque(ctx, baseCheque({ accountId: account.id, chequeNo: "000491" }))
    ).json().data;

    const bounce = await setStatus(ctx, bounced.id, { status: "bounced" });
    expect(bounce.statusCode).toBe(200);
    expect(bounce.json().data.transaction).toBeNull();
    expect(bounce.json().data.cheque.clearedAt).toBeNull();

    const cancel = await setStatus(ctx, cancelled.id, { status: "cancelled" });
    expect(cancel.json().data.transaction).toBeNull();

    expect(await accountBalance(ctx, account.id)).toBe(100000);
  });

  it("allows a cheque to leave pending only once", async () => {
    const account = await createAccount(ctx, 100000);
    const cheque = (
      await createCheque(ctx, baseCheque({ accountId: account.id, chequeNo: "000499" }))
    ).json().data;

    await setStatus(ctx, cheque.id, { status: "cleared" });
    const again = await setStatus(ctx, cheque.id, { status: "cleared" });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatch(/already cleared/);

    const bounce = await setStatus(ctx, cheque.id, { status: "bounced" });
    expect(bounce.statusCode).toBe(409);

    // Only one movement was posted.
    expect(await accountBalance(ctx, account.id)).toBe(75000);
  });

  it("returns 404 for a foreign cheque", async () => {
    const other = seedUser();
    const cheque = (await createCheque(other, baseCheque())).json().data;

    const res = await setStatus(ctx, cheque.id, { status: "cleared" });
    expect(res.statusCode).toBe(404);
  });
});
