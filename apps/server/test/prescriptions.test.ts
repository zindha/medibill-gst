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
  type SeededMedicine,
} from "./helpers.js";
import prescriptionRoutes from "../src/routes/prescriptions.js";
import invoiceRoutes from "../src/routes/invoices.js";
import doctorRoutes from "../src/routes/doctors.js";
import { scheduleRequiresPrescription } from "../src/services/prescriptions.js";
import { db } from "../src/db/index.js";
import { auditEvents } from "../src/db/schema/index.js";
import { and, eq } from "drizzle-orm";

let app: FastifyInstance;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Seed a user with an explicit role (helpers.seedUser always inserts admin). */
function seedUserWithRole(role: "admin" | "pharmacist" | "cashier"): SeededUser {
  const now = Date.now();
  const id = nanoid(16);
  const token = nanoid(32);
  const sqlite = new Database(dbPath());
  sqlite
    .prepare(
      `INSERT INTO users (id, email, name, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    .run(id, `user-${id}@test.local`, `Role ${role}`, role, now, now);
  sqlite
    .prepare(
      `INSERT INTO sessions (id, user_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(nanoid(16), id, token, now + 7 * 24 * 3600e3, now);
  sqlite.close();
  return { id, token };
}

function setSchedule(medicineId: string, schedule: string | null): void {
  const sqlite = new Database(dbPath());
  sqlite.prepare("UPDATE medicines SET schedule = ? WHERE id = ?").run(schedule, medicineId);
  sqlite.close();
}

/** Insert a stored_files row directly (the files route is not registered here). */
function insertStoredFile(ownerId: string): string {
  const id = nanoid(16);
  const sqlite = new Database(dbPath());
  sqlite
    .prepare(
      `INSERT INTO stored_files (id, owner_id, purpose, filename, content_type, size, sha256, path, created_at)
       VALUES (?, ?, 'prescription', 'rx.jpg', 'image/jpeg', 3, ?, ?, ?)`
    )
    .run(id, ownerId, nanoid(32), `rx/${id}.jpg`, Date.now());
  sqlite.close();
  return id;
}

const rxBody = (extra: Record<string, unknown> = {}) => ({
  patientName: "Ramesh Kumar",
  patientAge: 42,
  patientGender: "male",
  date: "2026-09-20",
  notes: "1 tab twice daily",
  ...extra,
});

const createRx = (token: string, extra: Record<string, unknown> = {}) =>
  app.inject({ method: "POST", url: "/api/prescriptions", headers: auth(token), payload: rxBody(extra) as any });

const createDoctor = async (token: string, name = "Dr. Sharma") => {
  const res = await app.inject({ method: "POST", url: "/api/doctors", headers: auth(token), payload: { name } as any });
  return res.json().data as { id: string; name: string };
};

const itemFor = (med: SeededMedicine, overrides: Record<string, unknown> = {}) => ({
  medicineId: med.medicineId,
  medicineName: "Test Med",
  batchNo: "B1",
  quantity: 1,
  unit: "Strip",
  mrp: 100,
  rate: 95.24,
  amount: 95.24,
  gstRate: "5",
  gstAmount: 4.76,
  cgst: 2.38,
  sgst: 2.38,
  ...overrides,
});

function invoiceBody(items: unknown[], extra: Record<string, unknown> = {}) {
  return {
    date: "2099-01-01",
    subtotal: 95.24,
    totalGst: 4.76,
    cgst: 2.38,
    sgst: 2.38,
    grandTotal: 100,
    amountPaid: 100,
    paymentMode: "cash",
    status: "paid",
    discountAmount: 0,
    items,
    ...extra,
  };
}

const postInvoice = (token: string, body: unknown) =>
  app.inject({ method: "POST", url: "/api/invoices", headers: auth(token), payload: body as any });

const auditRows = (action: string, actorId: string) =>
  db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.action, action), eq(auditEvents.actorId, actorId)))
    .all();

beforeAll(async () => {
  applySchema();
  app = Fastify({ logger: false });
  await app.register(prescriptionRoutes, { prefix: "/api/prescriptions" });
  await app.register(invoiceRoutes, { prefix: "/api/invoices" });
  await app.register(doctorRoutes, { prefix: "/api/doctors" });
});

describe("POST /api/prescriptions — create", () => {
  it("creates a pending prescription with defaults", async () => {
    const ctx = seedUser();
    const res = await createRx(ctx.token);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("pending");
    expect(body.data.patientName).toBe("Ramesh Kumar");
    expect(body.data.createdBy).toBe(ctx.id);
    expect(body.data.isActive).toBe(true);
    expect(body.data.dispensedAt).toBeNull();
    expect(body.data.dispensedInvoiceId).toBeNull();
  });

  it("validates required fields with zod (400)", async () => {
    const ctx = seedUser();
    const res = await app.inject({
      method: "POST",
      url: "/api/prescriptions",
      headers: auth(ctx.token),
      payload: { patientAge: 40 } as any,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
    expect(res.json().error).toBe("Validation error");
  });

  it("denormalizes the doctor name for an owned doctor", async () => {
    const ctx = seedUser();
    const doctor = await createDoctor(ctx.token, "Dr. Iyer");
    const res = await createRx(ctx.token, { doctorId: doctor.id });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.doctorId).toBe(doctor.id);
    expect(res.json().data.doctorName).toBe("Dr. Iyer");
  });

  it("rejects a foreign doctorId with 404", async () => {
    const owner = seedUser();
    const stranger = seedUser();
    const doctor = await createDoctor(owner.token);
    const res = await createRx(stranger.token, { doctorId: doctor.id });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Doctor not found");
  });

  it("rejects an unknown doctorId with 404", async () => {
    const ctx = seedUser();
    const res = await createRx(ctx.token, { doctorId: "does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("rejects a foreign customerId with 404", async () => {
    const owner = seedUser();
    const stranger = seedUser();
    const customer = seedCustomer(owner.id);
    const res = await createRx(stranger.token, { customerId: customer.id });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Customer not found");
  });

  it("rejects a foreign image file with 400", async () => {
    const owner = seedUser();
    const stranger = seedUser();
    const fileId = insertStoredFile(owner.id);
    const res = await createRx(stranger.token, { imageFileId: fileId });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid prescription image");
  });

  it("stores an owned imageFileId as prescription.imagePath", async () => {
    const ctx = seedUser();
    const fileId = insertStoredFile(ctx.id);
    const res = await createRx(ctx.token, { imageFileId: fileId });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.imagePath).toBe(fileId);
  });
});

describe("GET /api/prescriptions — list", () => {
  it("only lists the caller's prescriptions (tenant isolation)", async () => {
    const a = seedUser();
    const b = seedUser();
    await createRx(a.token, { patientName: "Alice Owner" });
    await createRx(b.token, { patientName: "Bob Owner" });

    const mine = await app.inject({ method: "GET", url: "/api/prescriptions", headers: auth(b.token) });
    expect(mine.statusCode).toBe(200);
    const rows = mine.json().data as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].patientName).toBe("Bob Owner");
    expect(rows.every((r) => r.createdBy === b.id)).toBe(true);
  });

  it("filters by status", async () => {
    const ctx = seedUser();
    const pending = (await createRx(ctx.token, { patientName: "Still Pending" })).json().data;
    const verified = (await createRx(ctx.token, { patientName: "Already Verified" })).json().data;
    const verify = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${verified.id}/verify`,
      headers: auth(ctx.token),
      payload: {},
    });
    expect(verify.statusCode).toBe(200);

    const res = await app.inject({ method: "GET", url: "/api/prescriptions?status=pending", headers: auth(ctx.token) });
    const rows = res.json().data as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(pending.id);

    const verifiedList = await app.inject({ method: "GET", url: "/api/prescriptions?status=verified", headers: auth(ctx.token) });
    expect(verifiedList.json().data as any[]).toHaveLength(1);
    expect((verifiedList.json().data as any[])[0].id).toBe(verified.id);
  });

  it("searches by q across patient name, doctor and notes", async () => {
    const ctx = seedUser();
    await createRx(ctx.token, { patientName: "Sunita Devi", notes: "asthma inhaler" });
    await createRx(ctx.token, { patientName: "Other Person" });

    const byName = await app.inject({ method: "GET", url: "/api/prescriptions?q=sunita", headers: auth(ctx.token) });
    expect((byName.json().data as any[]).map((r) => r.patientName)).toEqual(["Sunita Devi"]);

    const byNote = await app.inject({ method: "GET", url: "/api/prescriptions?q=asthma", headers: auth(ctx.token) });
    expect((byNote.json().data as any[]).map((r) => r.patientName)).toEqual(["Sunita Devi"]);
  });

  it("paginates with page/limit and reports total", async () => {
    const ctx = seedUser();
    await createRx(ctx.token, { patientName: "P1" });
    await createRx(ctx.token, { patientName: "P2" });
    await createRx(ctx.token, { patientName: "P3" });

    const res = await app.inject({ method: "GET", url: "/api/prescriptions?page=1&limit=2", headers: auth(ctx.token) });
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(3);
    expect(body.pagination).toEqual({ page: 1, limit: 2 });
  });

  it("rejects an invalid status filter with 400 (zod)", async () => {
    const ctx = seedUser();
    const res = await app.inject({ method: "GET", url: "/api/prescriptions?status=bogus", headers: auth(ctx.token) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Validation error");
  });
});

describe("GET /api/prescriptions/:id — detail", () => {
  it("returns the prescription with its linked invoices", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const rx = await createRx(ctx.token);
    const rxId = rx.json().data.id;
    await app.inject({ method: "POST", url: `/api/prescriptions/${rxId}/verify`, headers: auth(ctx.token), payload: {} });
    const sale = await postInvoice(ctx.token, invoiceBody([itemFor(med)], { prescriptionId: rxId }));
    expect(sale.statusCode).toBe(201);

    const res = await app.inject({ method: "GET", url: `/api/prescriptions/${rxId}`, headers: auth(ctx.token) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.id).toBe(rxId);
    expect(data.invoices).toHaveLength(1);
    expect(data.invoices[0].prescriptionId).toBe(rxId);
    expect(data.invoices[0].prescriptionStatus).toBe("verified");
  });

  it("404s for a foreign prescription", async () => {
    const owner = seedUser();
    const stranger = seedUser();
    const rx = await createRx(owner.token);
    const res = await app.inject({ method: "GET", url: `/api/prescriptions/${rx.json().data.id}`, headers: auth(stranger.token) });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Prescription not found");
  });
});

describe("status transitions", () => {
  it("verifies a pending prescription and records the audit event", async () => {
    const ctx = seedUser();
    const rx = await createRx(ctx.token);
    const res = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${rx.json().data.id}/verify`,
      headers: auth(ctx.token),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("verified");

    const events = auditRows("prescription.verify", ctx.id);
    expect(events).toHaveLength(1);
    expect(events[0].entity).toBe("prescription");
    expect(events[0].entityId).toBe(rx.json().data.id);
  });

  it("unverifies verified → pending through PUT", async () => {
    const ctx = seedUser();
    const rx = await createRx(ctx.token);
    await app.inject({ method: "POST", url: `/api/prescriptions/${rx.json().data.id}/verify`, headers: auth(ctx.token), payload: {} });

    const res = await app.inject({
      method: "PUT",
      url: `/api/prescriptions/${rx.json().data.id}`,
      headers: auth(ctx.token),
      payload: { status: "pending" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("pending");
  });

  it("refuses pending → dispensed via PUT with 409 (dispensed is set only by dispense)", async () => {
    const ctx = seedUser();
    const rx = await createRx(ctx.token);
    const res = await app.inject({
      method: "PUT",
      url: `/api/prescriptions/${rx.json().data.id}`,
      headers: auth(ctx.token),
      payload: { status: "dispensed" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("Cannot change prescription status");
  });

  it("allows a rejected prescription to be re-verified", async () => {
    const ctx = seedUser();
    const rx = await createRx(ctx.token);
    const id = rx.json().data.id;
    await app.inject({ method: "POST", url: `/api/prescriptions/${id}/reject`, headers: auth(ctx.token), payload: { reason: "Blurred image" } });
    expect((await app.inject({ method: "GET", url: `/api/prescriptions/${id}`, headers: auth(ctx.token) })).json().data.status).toBe("rejected");

    const res = await app.inject({ method: "POST", url: `/api/prescriptions/${id}/verify`, headers: auth(ctx.token), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("verified");
  });

  it("refuses verify on a dispensed prescription with 409", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const rx = await createRx(ctx.token);
    const id = rx.json().data.id;
    await app.inject({ method: "POST", url: `/api/prescriptions/${id}/verify`, headers: auth(ctx.token), payload: {} });
    const sale = await postInvoice(ctx.token, invoiceBody([itemFor(med)], { prescriptionId: id }));
    expect(sale.statusCode).toBe(201);
    await app.inject({ method: "POST", url: `/api/prescriptions/${id}/dispense`, headers: auth(ctx.token), payload: { invoiceId: sale.json().data.id } });

    const res = await app.inject({ method: "POST", url: `/api/prescriptions/${id}/verify`, headers: auth(ctx.token), payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("dispensed to verified");
  });

  it("treats a same-status PUT as a no-op edit", async () => {
    const ctx = seedUser();
    const rx = await createRx(ctx.token);
    const res = await app.inject({
      method: "PUT",
      url: `/api/prescriptions/${rx.json().data.id}`,
      headers: auth(ctx.token),
      payload: { status: "pending" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("pending");
  });

  it("updates patient fields on an owned prescription", async () => {
    const ctx = seedUser();
    const rx = await createRx(ctx.token);
    const res = await app.inject({
      method: "PUT",
      url: `/api/prescriptions/${rx.json().data.id}`,
      headers: auth(ctx.token),
      payload: { patientName: "Renamed Patient", patientAge: 51, notes: "changed dosage" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.patientName).toBe("Renamed Patient");
    expect(res.json().data.patientAge).toBe(51);
    expect(res.json().data.notes).toBe("changed dosage");
  });

  it("404s a PUT against a foreign prescription", async () => {
    const owner = seedUser();
    const stranger = seedUser();
    const rx = await createRx(owner.token);
    const res = await app.inject({
      method: "PUT",
      url: `/api/prescriptions/${rx.json().data.id}`,
      headers: auth(stranger.token),
      payload: { patientName: "Hijacked" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/prescriptions/:id/reject", () => {
  it("rejects with a reason and audits it", async () => {
    const ctx = seedUser();
    const rx = await createRx(ctx.token);
    const res = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${rx.json().data.id}/reject`,
      headers: auth(ctx.token),
      payload: { reason: "Not legible" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("rejected");

    const events = auditRows("prescription.reject", ctx.id);
    expect(events).toHaveLength(1);
    const meta = JSON.parse(events[0].metadata ?? "{}");
    expect(meta.reason).toBe("Not legible");
  });

  it("requires a reason (zod 400)", async () => {
    const ctx = seedUser();
    const rx = await createRx(ctx.token);
    const res = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${rx.json().data.id}/reject`,
      headers: auth(ctx.token),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Validation error");
  });
});

describe("POST /api/prescriptions/:id/dispense", () => {
  it("marks both prescription and invoice dispensed and records the audit", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const rx = await createRx(ctx.token);
    const id = rx.json().data.id;
    await app.inject({ method: "POST", url: `/api/prescriptions/${id}/verify`, headers: auth(ctx.token), payload: {} });
    const sale = await postInvoice(ctx.token, invoiceBody([itemFor(med)], { prescriptionId: id }));
    expect(sale.statusCode).toBe(201);
    const invoiceId = sale.json().data.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${id}/dispense`,
      headers: auth(ctx.token),
      payload: { invoiceId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.prescription.status).toBe("dispensed");
    expect(res.json().data.prescription.dispensedInvoiceId).toBe(invoiceId);
    expect(res.json().data.prescription.dispensedAt).toBeTruthy();
    expect(res.json().data.invoice.prescriptionStatus).toBe("dispensed");

    const detail = await app.inject({ method: "GET", url: `/api/prescriptions/${id}`, headers: auth(ctx.token) });
    expect(detail.json().data.status).toBe("dispensed");

    const invoice = await app.inject({ method: "GET", url: `/api/invoices/${invoiceId}`, headers: auth(ctx.token) });
    expect(invoice.json().data.prescriptionId).toBe(id);
    expect(invoice.json().data.prescriptionStatus).toBe("dispensed");

    const events = auditRows("prescription.dispense", ctx.id);
    expect(events).toHaveLength(1);
    const meta = JSON.parse(events[0].metadata ?? "{}");
    expect(meta.invoiceId).toBe(invoiceId);
  });

  it("409s on a second dispense (idempotency guard)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const rx = await createRx(ctx.token);
    const id = rx.json().data.id;
    await app.inject({ method: "POST", url: `/api/prescriptions/${id}/verify`, headers: auth(ctx.token), payload: {} });
    const sale = await postInvoice(ctx.token, invoiceBody([itemFor(med)], { prescriptionId: id }));
    const invoiceId = sale.json().data.id;
    await app.inject({ method: "POST", url: `/api/prescriptions/${id}/dispense`, headers: auth(ctx.token), payload: { invoiceId } });

    const second = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${id}/dispense`,
      headers: auth(ctx.token),
      payload: { invoiceId },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("Prescription already dispensed");
  });

  it("409s when the prescription was never verified (must verify first)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const rx = await createRx(ctx.token);
    const sale = await postInvoice(ctx.token, invoiceBody([itemFor(med)]));

    const res = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${rx.json().data.id}/dispense`,
      headers: auth(ctx.token),
      payload: { invoiceId: sale.json().data.id },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("verified before dispensing");
  });

  it("404s for a foreign invoice", async () => {
    const owner = seedUser();
    const stranger = seedUser();
    const med = seedMedicine(owner.id);
    const rx = await createRx(owner.token);
    const id = rx.json().data.id;
    await app.inject({ method: "POST", url: `/api/prescriptions/${id}/verify`, headers: auth(owner.token), payload: {} });
    const sale = await postInvoice(owner.token, invoiceBody([itemFor(med)]));

    const res = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${id}/dispense`,
      headers: auth(stranger.token),
      payload: { invoiceId: sale.json().data.id },
    });
    // Stranger does not own the prescription either → 404 before the invoice check.
    expect(res.statusCode).toBe(404);

    // Same tenant, invoice owned by someone else → invoice 404.
    const third = seedUser();
    const ownRx = await createRx(third.token);
    await app.inject({ method: "POST", url: `/api/prescriptions/${ownRx.json().data.id}/verify`, headers: auth(third.token), payload: {} });
    const foreignInvoice = await postInvoice(owner.token, invoiceBody([itemFor(med)]));
    const ownRes = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${ownRx.json().data.id}/dispense`,
      headers: auth(third.token),
      payload: { invoiceId: foreignInvoice.json().data.id },
    });
    expect(ownRes.statusCode).toBe(404);
    expect(ownRes.json().error).toBe("Invoice not found");
  });

  it("409s when the invoice is already linked to another prescription", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { name: "Med One" });
    const rx1 = (await createRx(ctx.token, { patientName: "First" })).json().data;
    const rx2 = (await createRx(ctx.token, { patientName: "Second" })).json().data;
    await app.inject({ method: "POST", url: `/api/prescriptions/${rx1.id}/verify`, headers: auth(ctx.token), payload: {} });
    await app.inject({ method: "POST", url: `/api/prescriptions/${rx2.id}/verify`, headers: auth(ctx.token), payload: {} });

    const sale = await postInvoice(ctx.token, invoiceBody([itemFor(med)], { prescriptionId: rx1.id }));
    const invoiceId = sale.json().data.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${rx2.id}/dispense`,
      headers: auth(ctx.token),
      payload: { invoiceId },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("already linked to another prescription");

    // The first prescription still dispenses against its own invoice.
    const ok = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${rx1.id}/dispense`,
      headers: auth(ctx.token),
      payload: { invoiceId },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("dispenses against an invoice that already references the prescription (sale-time link)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const rx = (await createRx(ctx.token)).json().data;
    await app.inject({ method: "POST", url: `/api/prescriptions/${rx.id}/verify`, headers: auth(ctx.token), payload: {} });
    const sale = await postInvoice(ctx.token, invoiceBody([itemFor(med)], { prescriptionId: rx.id }));
    expect(sale.statusCode).toBe(201);

    const res = await app.inject({
      method: "POST",
      url: `/api/prescriptions/${rx.id}/dispense`,
      headers: auth(ctx.token),
      payload: { invoiceId: sale.json().data.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.prescription.status).toBe("dispensed");
    expect(res.json().data.invoice.prescriptionStatus).toBe("dispensed");
  });
});

describe("GET /api/prescriptions/invoice/:invoiceId", () => {
  it("returns prescriptions linked to the invoice", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const rx = (await createRx(ctx.token)).json().data;
    await app.inject({ method: "POST", url: `/api/prescriptions/${rx.id}/verify`, headers: auth(ctx.token), payload: {} });
    const sale = await postInvoice(ctx.token, invoiceBody([itemFor(med)], { prescriptionId: rx.id }));
    const invoiceId = sale.json().data.id;

    const res = await app.inject({ method: "GET", url: `/api/prescriptions/invoice/${invoiceId}`, headers: auth(ctx.token) });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(rx.id);
  });

  it("404s for a foreign invoice", async () => {
    const owner = seedUser();
    const stranger = seedUser();
    const med = seedMedicine(owner.id);
    const sale = await postInvoice(owner.token, invoiceBody([itemFor(med)]));
    const res = await app.inject({
      method: "GET",
      url: `/api/prescriptions/invoice/${sale.json().data.id}`,
      headers: auth(stranger.token),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Invoice not found");
  });
});

describe("DELETE /api/prescriptions/:id — soft delete", () => {
  it("soft-deletes an open prescription (no longer listed)", async () => {
    const ctx = seedUser();
    const rx = await createRx(ctx.token, { patientName: "Temporary" });
    const id = rx.json().data.id;

    const res = await app.inject({ method: "DELETE", url: `/api/prescriptions/${id}`, headers: auth(ctx.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.removed).toBe(true);

    const list = await app.inject({ method: "GET", url: "/api/prescriptions", headers: auth(ctx.token) });
    expect((list.json().data as any[]).some((r) => r.id === id)).toBe(false);
  });

  it("refuses to delete a dispensed prescription (409)", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id);
    const rx = (await createRx(ctx.token)).json().data;
    await app.inject({ method: "POST", url: `/api/prescriptions/${rx.id}/verify`, headers: auth(ctx.token), payload: {} });
    const sale = await postInvoice(ctx.token, invoiceBody([itemFor(med)], { prescriptionId: rx.id }));
    await app.inject({ method: "POST", url: `/api/prescriptions/${rx.id}/dispense`, headers: auth(ctx.token), payload: { invoiceId: sale.json().data.id } });

    const res = await app.inject({ method: "DELETE", url: `/api/prescriptions/${rx.id}`, headers: auth(ctx.token) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("cannot be deleted");
  });

  it("404s for a foreign delete", async () => {
    const owner = seedUser();
    const stranger = seedUser();
    const rx = await createRx(owner.token);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/prescriptions/${rx.json().data.id}`,
      headers: auth(stranger.token),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("scheduled-drug enforcement on invoice create", () => {
  it("blocks a scheduled (H) medicine without a prescription and lists the items", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { name: "H Med" });
    setSchedule(med.medicineId, "H");

    const res = await postInvoice(ctx.token, invoiceBody([itemFor(med, { medicineName: "H Med" })]));
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Prescription required for scheduled drugs (H/H1/X)");
    expect(body.items).toEqual(["H Med"]);
  });

  it("accepts the same sale with a pending prescriptionId and stores the link", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { name: "H Med 2" });
    setSchedule(med.medicineId, "H");
    const rx = (await createRx(ctx.token)).json().data;

    const res = await postInvoice(ctx.token, invoiceBody([itemFor(med, { medicineName: "H Med 2" })], { prescriptionId: rx.id }));
    expect(res.statusCode).toBe(201);
    expect(res.json().data.prescriptionId).toBe(rx.id);
    expect(res.json().data.prescriptionStatus).toBe("pending");

    const events = auditRows("invoice.link_prescription", ctx.id);
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].metadata ?? "{}").prescriptionId).toBe(rx.id);
  });

  it("lets an admin override with prescriptionOverride and audits it", async () => {
    const ctx = seedUser(); // helpers.seedUser → admin
    const med = seedMedicine(ctx.id, { name: "H Med 3" });
    setSchedule(med.medicineId, "H");

    const res = await postInvoice(
      ctx.token,
      invoiceBody([itemFor(med, { medicineName: "H Med 3" })], { prescriptionOverride: true })
    );
    expect(res.statusCode).toBe(201);

    const events = auditRows("invoice.prescription_override", ctx.id);
    expect(events).toHaveLength(1);
    const meta = JSON.parse(events[0].metadata ?? "{}");
    expect(meta.role).toBe("admin");
    expect(meta.items).toEqual(["H Med 3"]);
  });

  it("lets a pharmacist override with prescriptionOverride", async () => {
    const ctx = seedUserWithRole("pharmacist");
    const med = seedMedicine(ctx.id, { name: "H Med 4" });
    setSchedule(med.medicineId, "H1");

    const res = await postInvoice(
      ctx.token,
      invoiceBody([itemFor(med, { medicineName: "H Med 4" })], { prescriptionOverride: true })
    );
    expect(res.statusCode).toBe(201);
    expect(auditRows("invoice.prescription_override", ctx.id)).toHaveLength(1);
  });

  it("refuses a cashier override with 400 and writes no audit", async () => {
    const ctx = seedUserWithRole("cashier");
    const med = seedMedicine(ctx.id, { name: "H Med 5" });
    setSchedule(med.medicineId, "H");

    const res = await postInvoice(
      ctx.token,
      invoiceBody([itemFor(med, { medicineName: "H Med 5" })], { prescriptionOverride: true })
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Prescription required for scheduled drugs (H/H1/X)");
    expect(auditRows("invoice.prescription_override", ctx.id)).toHaveLength(0);
  });

  it("does not enforce on non-scheduled medicines", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { name: "Plain Med" });
    setSchedule(med.medicineId, null);

    const res = await postInvoice(ctx.token, invoiceBody([itemFor(med, { medicineName: "Plain Med" })]));
    expect(res.statusCode).toBe(201);
  });

  it("400s a foreign prescriptionId", async () => {
    const owner = seedUser();
    const stranger = seedUser();
    const med = seedMedicine(stranger.id, { name: "H Med 6" });
    setSchedule(med.medicineId, "H");
    const rx = (await createRx(owner.token)).json().data;

    const res = await postInvoice(
      stranger.token,
      invoiceBody([itemFor(med, { medicineName: "H Med 6" })], { prescriptionId: rx.id })
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Prescription not verifiable or foreign");
  });

  it("400s a prescription that is already dispensed", async () => {
    const ctx = seedUser();
    const med = seedMedicine(ctx.id, { name: "Plain Med 2" });
    const rx = (await createRx(ctx.token)).json().data;
    await app.inject({ method: "POST", url: `/api/prescriptions/${rx.id}/verify`, headers: auth(ctx.token), payload: {} });
    const first = await postInvoice(ctx.token, invoiceBody([itemFor(med, { medicineName: "Plain Med 2" })], { prescriptionId: rx.id }));
    expect(first.statusCode).toBe(201);
    await app.inject({ method: "POST", url: `/api/prescriptions/${rx.id}/dispense`, headers: auth(ctx.token), payload: { invoiceId: first.json().data.id } });

    const med2 = seedMedicine(ctx.id, { name: "Plain Med 3" });
    const res = await postInvoice(
      ctx.token,
      invoiceBody([itemFor(med2, { medicineName: "Plain Med 3" })], { prescriptionId: rx.id })
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Prescription not verifiable or foreign");
  });
});

describe("scheduleRequiresPrescription", () => {
  it("matches H, H1 and X case-insensitively and rejects everything else", () => {
    expect(scheduleRequiresPrescription("H")).toBe(true);
    expect(scheduleRequiresPrescription("h")).toBe(true);
    expect(scheduleRequiresPrescription("H1")).toBe(true);
    expect(scheduleRequiresPrescription("h1 ")).toBe(true);
    expect(scheduleRequiresPrescription("X")).toBe(true);
    expect(scheduleRequiresPrescription("x")).toBe(true);

    expect(scheduleRequiresPrescription("A")).toBe(false);
    expect(scheduleRequiresPrescription("H40")).toBe(false);
    expect(scheduleRequiresPrescription("")).toBe(false);
    expect(scheduleRequiresPrescription(null)).toBe(false);
    expect(scheduleRequiresPrescription(undefined)).toBe(false);
  });
});
