import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { applySchema, seedMedicine, seedUser, type SeededUser } from "./helpers.js";
import medicineRoutes from "../src/routes/medicines.js";

let app: FastifyInstance;
let ctx: SeededUser;
let accentedId: string;
let messyId: string;
let plainId: string;

async function searchMeds(search: string) {
  const res = await app.inject({
    method: "GET",
    url: `/api/medicines?search=${encodeURIComponent(search)}`,
    headers: { authorization: `Bearer ${ctx.token}` },
  });
  const body = res.json();
  return { status: res.statusCode, data: (Array.isArray(body) ? body : body?.data) ?? [] };
}

beforeAll(async () => {
  applySchema();
  ctx = seedUser();

  accentedId = seedMedicine(ctx.id, { name: "Déxona 0.5" }).medicineId;
  messyId = seedMedicine(ctx.id, { name: "  Paracetamol   500   " }).medicineId;
  plainId = seedMedicine(ctx.id, { name: "CALPOL 500" }).medicineId;

  app = Fastify({ logger: false });
  await app.register(medicineRoutes, { prefix: "/api/medicines" });
});

describe("GET /api/medicines folded search", () => {
  it("matches accented names when the query is accent-stripped", async () => {
    const { status, data } = await searchMeds("dexona");
    expect(status).toBe(200);
    const ids = data.map((m: any) => m.id);
    // "dexona" must surface the accented "Déxona 0.5" stored value (é → e on both sides).
    expect(ids).toContain(accentedId);
    expect(ids).not.toContain(plainId);
  });

  it("matches whitespace-messy names with a cleanly-spaced query", async () => {
    const { status, data } = await searchMeds("paracetamol 500");
    expect(status).toBe(200);
    const ids = data.map((m: any) => m.id);
    expect(ids).toContain(messyId);
  });

  it("still matches a single-token query against a whitespace-messy name", async () => {
    const { status, data } = await searchMeds("paracetamol");
    expect(status).toBe(200);
    const ids = data.map((m: any) => m.id);
    expect(ids).toContain(messyId);
  });

  it("surfaces abbreviated queries via token-level matching on folded text", async () => {
    const { status, data } = await searchMeds("pmol");
    expect(status).toBe(200);
    const ids = data.map((m: any) => m.id);
    // "pmol" is a subsequence of the folded "paracetamol 500"; no substring contains it.
    expect(ids).toContain(messyId);
  });

  it("returns no results for a non-matching query", async () => {
    const { status, data } = await searchMeds("zzzzzzzzzz");
    expect(status).toBe(200);
    expect(data.length).toBe(0);
  });
});