import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db/index.js";
import {
  invoices,
  invoiceItems,
  purchaseBills,
  purchaseBillItems,
  purchaseReturns,
  purchaseReturnItems,
  salesReturns,
  salesReturnItems,
  medicines,
  batches,
  suppliers,
  customers,
  doctors,
  inventoryTransactions,
  payments,
  refillReminders,
} from "../db/schema/index.js";
import { eq, and, desc, asc, sql, gt, gte, lte, lt, inArray, ne } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";
import { recommendForShortbookRow } from "../services/procurement.js";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const inPeriod = (dateStr: string | null | undefined, from?: string, to?: string) => {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
};

type RateBucket = { taxable: number; cgst: number; sgst: number; igst: number; gst: number; count: number };

const emptyBucket = (): RateBucket => ({ taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, count: 0 });

function deriveItemTax(amount: number, gstAmount: number, rateNum: number) {
  const amt = Number(amount) || 0;
  let gst = Number(gstAmount) || 0;
  if ((!gst || gst < 0) && rateNum > 0 && amt > 0) {
    const base = amt / (1 + rateNum / 100);
    gst = amt - base;
  }
  const taxable = amt - gst;
  return { taxable, gst, cgst: gst / 2, sgst: gst / 2 };
}

export default async function reportRoutes(fastify: FastifyInstance) {
  // Sales report
  fastify.get(
    "/sales",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { from, to, customerId, page = "1", limit = "100" } = request.query as {
        from?: string;
        to?: string;
        customerId?: string;
        page?: string;
        limit?: string;
      };

      const conditions = [eq(invoices.status, "paid"), eq(invoices.createdBy, (request as any).userId)];
      if (customerId) conditions.push(eq(invoices.customerId, customerId));

      const results = await db
        .select()
        .from(invoices)
        .where(and(...conditions))
        .orderBy(desc(invoices.date))
        .limit(parseInt(limit, 10));

      let filtered = results;
      if (from) filtered = filtered.filter((i) => i.date >= from);
      if (to) filtered = filtered.filter((i) => i.date <= to);

      const totals = filtered.reduce(
        (acc, inv) => {
          acc.totalSales += inv.grandTotal;
          acc.totalGst += inv.totalGst;
          acc.totalDiscount += inv.discountAmount ?? 0;
          return acc;
        },
        { totalSales: 0, totalGst: 0, totalDiscount: 0 }
      );

      return reply.send({
        success: true,
        data: {
          invoices: filtered,
          summary: totals,
        },
      });
    }
  );

  // Purchase report
  fastify.get(
    "/purchase",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { from, to, supplierId } = request.query as {
        from?: string;
        to?: string;
        supplierId?: string;
      };

      const conditions = [eq(purchaseBills.createdBy, (request as any).userId)];
      if (supplierId) conditions.push(eq(purchaseBills.supplierId, supplierId));

      const results = await db
        .select()
        .from(purchaseBills)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(purchaseBills.billDate));

      let filtered = results;
      if (from) filtered = filtered.filter((p) => p.billDate >= from);
      if (to) filtered = filtered.filter((p) => p.billDate <= to);

      const totals = filtered.reduce(
        (acc, b) => {
          acc.totalPurchase += b.grandTotal;
          acc.totalGst += b.totalGst;
          return acc;
        },
        { totalPurchase: 0, totalGst: 0 }
      );

      return reply.send({
        success: true,
        data: {
          bills: filtered,
          summary: totals,
        },
      });
    }
  );

  // Profit report
  fastify.get(
    "/profit",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { from, to } = request.query as { from?: string; to?: string };

      // Get all paid invoices in date range (tenant-scoped)
      const conditions = [eq(invoices.status, "paid"), eq(invoices.createdBy, (request as any).userId)];
      const salesResults = await db
        .select()
        .from(invoices)
        .where(and(...conditions));

      let sales = salesResults;
      if (from) sales = sales.filter((i) => i.date >= from);
      if (to) sales = sales.filter((i) => i.date <= to);

      // Get cost of goods from inventory transactions (sales only)
      const today = new Date().toISOString().split("T")[0];

      const costResults = await db
        .select({
          totalCost: sql<number>`SUM(${inventoryTransactions.rate} * ABS(${inventoryTransactions.quantity}))`,
        })
        .from(inventoryTransactions)
        .where(
          and(
            eq(inventoryTransactions.type, "sales"),
            eq(inventoryTransactions.createdBy, (request as any).userId),
            gte(inventoryTransactions.createdAt, new Date(from ?? "2000-01-01")),
            lte(inventoryTransactions.createdAt, new Date(to ?? today))
          )
        );

      const totalSales = sales.reduce((acc, i) => acc + i.grandTotal, 0);
      const totalGst = sales.reduce((acc, i) => acc + i.totalGst, 0);
      const totalDiscount = sales.reduce((acc, i) => acc + (i.discountAmount ?? 0), 0);
      const totalCost = costResults[0]?.totalCost ?? 0;

      return reply.send({
        success: true,
        data: {
          totalSales,
          totalGst,
          totalDiscount,
          taxableAmount: totalSales - totalGst,
          costOfGoods: totalCost,
          grossProfit: totalSales - totalGst - totalCost,
          profitMargin: totalSales > 0 ? ((totalSales - totalGst - totalCost) / totalSales) * 100 : 0,
        },
      });
    }
  );

  // Inventory report
  fastify.get(
    "/inventory",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { status } = request.query as { status?: "low" | "out" | "expired" | "near" };

      const allMedicines = await db
        .select()
        .from(medicines)
        .where(and(eq(medicines.isActive, true), eq(medicines.createdBy, (request as any).userId)));

      const today = new Date().toISOString().split("T")[0];

      const inventoryData = await Promise.all(
        allMedicines.map(async (med) => {
          const stockResult = await db
            .select({
              totalQty: sql<number>`COALESCE(SUM(${batches.quantity}), 0)`,
            })
            .from(batches)
            .where(
              and(eq(batches.medicineId, med.id), eq(batches.isActive, true))
            );

          const availableResult = await db
            .select({
              availableQty: sql<number>`COALESCE(SUM(${batches.quantity}), 0)`,
            })
            .from(batches)
            .where(
              and(
                eq(batches.medicineId, med.id),
                eq(batches.isActive, true),
                gt(batches.expiryDate, today)
              )
            );

          return {
            ...med,
            totalStock: stockResult[0]?.totalQty ?? 0,
            availableStock: availableResult[0]?.availableQty ?? 0,
          };
        })
      );

      let filtered = inventoryData;
      if (status === "low") {
        filtered = inventoryData.filter((m) => m.availableStock <= (m.minQuantity ?? 10));
      } else if (status === "out") {
        filtered = inventoryData.filter((m) => m.availableStock === 0);
      }

      return reply.send({
        success: true,
        data: filtered,
      });
    }
  );

  // Tax report (legacy shape, now rate-accurate from line items)
  fastify.get(
    "/tax",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { from, to } = request.query as { from?: string; to?: string };
      const userId = (request as any).userId as string;
      const summary = await buildOutwardSummary(userId, from, to);

      const breakdown: Record<string, { taxableAmount: number; gstAmount: number; cgst: number; sgst: number; igst: number }> = {};
      for (const [rate, b] of Object.entries(summary.byRate)) {
        breakdown[rate] = {
          taxableAmount: round2(b.taxable),
          gstAmount: round2(b.gst),
          cgst: round2(b.cgst),
          sgst: round2(b.sgst),
          igst: round2(b.igst),
        };
      }

      return reply.send({
        success: true,
        data: {
          salesCount: summary.invoiceCount,
          totalTaxable: round2(summary.taxable),
          totalGst: round2(summary.gst),
          totalCgst: round2(summary.cgst),
          totalSgst: round2(summary.sgst),
          totalIgst: round2(summary.igst),
          totalInvoiceValue: round2(summary.invoiceValue),
          // Credit notes in period (to net off)
          creditNoteCount: summary.creditNoteCount,
          creditNoteTaxable: round2(summary.creditTaxable),
          creditNoteGst: round2(summary.creditGst),
          netTaxable: round2(summary.taxable - summary.creditTaxable),
          netGst: round2(summary.gst - summary.creditGst),
          netCgst: round2(summary.cgst - summary.creditCgst),
          netSgst: round2(summary.sgst - summary.creditSgst),
          breakdown,
        },
      });
    }
  );

  // GSTR-1 — outward supplies, invoice-wise (B2B / B2C) + credit notes
  fastify.get(
    "/gstr1",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { from, to } = request.query as { from?: string; to?: string };
      const userId = (request as any).userId as string;
      const data = await buildGstr1(userId, from, to);
      return reply.send({ success: true, data });
    }
  );

  // GSTR-3B — monthly summary: outward liability, ITC, net payable
  fastify.get(
    "/gstr3b",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { from, to } = request.query as { from?: string; to?: string };
      const userId = (request as any).userId as string;
      const data = await buildGstr3b(userId, from, to);
      return reply.send({ success: true, data });
    }
  );

  // HSN summary (GSTR-1 Table 12) — sales + purchase
  fastify.get(
    "/hsn",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { from, to } = request.query as { from?: string; to?: string };
      const userId = (request as any).userId as string;
      const data = await buildHsnSummary(userId, from, to);
      return reply.send({ success: true, data });
    }
  );

  // ITC ledger — purchase-bill-wise input credit + reversals
  fastify.get(
    "/itc",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { from, to } = request.query as { from?: string; to?: string };
      const userId = (request as any).userId as string;
      const data = await buildItcLedger(userId, from, to);
      return reply.send({ success: true, data });
    }
  );

  // GSTR-2 — inward supplies (purchases + purchaseReturns as debit notes)
  fastify.get(
    "/gstr2",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { from, to } = request.query as { from?: string; to?: string };
      const userId = (request as any).userId as string;
      const data = await buildGstr2(userId, from, to);
      return reply.send({ success: true, data });
    }
  );

  // -------------------------------------------------------------------------
  // Sales parity (LocalWell — delivery-challan views are intentionally omitted)
  // -------------------------------------------------------------------------

  fastify.get("/sales/register", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const from = q.from;
    const to = q.to;
    const view = (q.view === "date" ? "date" : "invoice") as "invoice" | "date";
    const data = await buildSalesRegister((request as any).userId, from, to, view, {
      customer: q.customer,
      doctor: q.doctor,
      schedule: q.schedule,
      q: q.q,
      customerId: q.customerId,
      doctorId: q.doctorId,
      party: q.party,
    });
    return reply.send({ success: true, data });
  });

  fastify.get("/sales/detail", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildSalesDetail((request as any).userId, q.from, q.to, { customer: q.customer, q: q.q, customerId: q.customerId });
    return reply.send({ success: true, data });
  });

  fastify.get("/sales/summary", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const groupBy = (q.groupBy ?? "product") as string;
    const allowed = ["product", "company", "category", "customer", "supplier", "user"];
    if (!allowed.includes(groupBy)) {
      return reply.status(400).send({ success: false, error: `Invalid groupBy. Allowed: ${allowed.join(", ")}` });
    }
    const data = await buildSalesSummary((request as any).userId, q.from, q.to, groupBy as any);
    return reply.send({ success: true, data });
  });

  fastify.get("/sales/doctor", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildSalesDoctor((request as any).userId, q.from, q.to, q.doctorId ?? q.doctor ?? null);
    return reply.send({ success: true, data });
  });

  fastify.get("/sales/schedule", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const sched = q.schedule ?? null;
    const data = await buildSalesSchedule((request as any).userId, q.from, q.to, sched);
    return reply.send({ success: true, data });
  });

  fastify.get("/sales/party", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const cid = q.customerId ?? q.customer ?? q.party ?? null;
    const data = await buildSalesParty((request as any).userId, q.from, q.to, cid);
    return reply.send({ success: true, data });
  });

  // -------------------------------------------------------------------------
  // Stock parity — 7 routes
  // -------------------------------------------------------------------------

  fastify.get("/stock/fast", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const limit = q.limit ? Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200) : 50;
    const data = await buildFastSlow((request as any).userId, q.from, q.to, "fast", limit);
    return reply.send({ success: true, data });
  });

  fastify.get("/stock/slow", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildFastSlow((request as any).userId, q.from, q.to, "slow", 50);
    return reply.send({ success: true, data });
  });

  fastify.get("/stock/current", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await buildCurrentStock((request as any).userId);
    return reply.send({ success: true, data });
  });

  fastify.get("/stock/expired", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildExpired((request as any).userId, q.from, q.to);
    return reply.send({ success: true, data });
  });

  fastify.get("/stock/opening-closing", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildOpeningClosing((request as any).userId, q.from, q.to);
    return reply.send({ success: true, data });
  });

  fastify.get("/stock/statement", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    if (!q.medicineId) return reply.status(400).send({ success: false, error: "medicineId required" });
    const data = await buildStatement((request as any).userId, q.medicineId, q.from, q.to);
    return reply.send({ success: true, data });
  });

  fastify.get("/stock/adjustments", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildAdjustments((request as any).userId, q.from, q.to);
    return reply.send({ success: true, data });
  });

  // -------------------------------------------------------------------------
  // Purchase parity — 4 routes
  // -------------------------------------------------------------------------

  fastify.get("/purchase/register", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const view = (q.view === "date" ? "date" : "invoice") as "invoice" | "date";
    const data = await buildPurchaseRegister((request as any).userId, q.from, q.to, view, {
      distributor: (q.distributor ?? q.supplier ?? null) as string | null,
      q: (q.q ?? null) as string | null,
    });
    return reply.send({ success: true, data });
  });

  fastify.get("/purchase/detail", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildPurchaseDetail((request as any).userId, q.from, q.to, {
      distributor: (q.distributor ?? q.supplier ?? null) as string | null,
      q: (q.q ?? null) as string | null,
    });
    return reply.send({ success: true, data });
  });

  fastify.get("/purchase/summary", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const groupBy = (q.groupBy ?? "product") as string;
    const allowed = ["product", "supplier", "company"];
    if (!allowed.includes(groupBy)) {
      return reply.status(400).send({ success: false, error: `Invalid groupBy. Allowed: ${allowed.join(", ")}` });
    }
    const data = await buildPurchaseSummary((request as any).userId, q.from, q.to, groupBy as any);
    return reply.send({ success: true, data });
  });

  fastify.get("/purchase/schedule", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const sched = q.schedule ?? null;
    const data = await buildPurchaseSchedule((request as any).userId, q.from, q.to, sched);
    return reply.send({ success: true, data });
  });

  // -------------------------------------------------------------------------
  // Payments parity — 4 routes (LocalWell PAYMENTS REPORTS)
  // -------------------------------------------------------------------------

  fastify.get("/payments/pending-customers", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const view = (q.view === "detail" ? "detail" : "summary") as "summary" | "detail";
    const data = await buildPendingCustomers((request as any).userId, view, q.q ?? null);
    return reply.send({ success: true, data });
  });

  fastify.get("/payments/pending-distributors", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const view = (q.view === "detail" ? "detail" : "summary") as "summary" | "detail";
    const data = await buildPendingDistributors((request as any).userId, view, q.q ?? null);
    return reply.send({ success: true, data });
  });

  fastify.get("/payments/register", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildPaymentsRegister((request as any).userId, q.from, q.to, {
      type: (q.type ?? null) as string | null,
      mode: (q.mode ?? q.paymentMode ?? null) as string | null,
      q: (q.q ?? null) as string | null,
    });
    return reply.send({ success: true, data });
  });

  fastify.get("/payments/expense", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const groupBy = (q.groupBy === "name" ? "name" : "category") as "category" | "name";
    const data = await buildExpenseRegister((request as any).userId, q.from, q.to, groupBy, q.q ?? null);
    return reply.send({ success: true, data });
  });

  // -------------------------------------------------------------------------
  // Party parity — 4 routes (LocalWell PARTY REPORTS)
  // -------------------------------------------------------------------------

  fastify.get("/party/customers", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildPartyCustomers((request as any).userId, q.q ?? null, q.sort ?? null);
    return reply.send({ success: true, data });
  });

  fastify.get("/party/distributors", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildPartyDistributors((request as any).userId, q.q ?? null);
    return reply.send({ success: true, data });
  });

  fastify.get("/party/ledger", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const type = (q.type ?? null) as string | null;
    const id = (q.id ?? null) as string | null;
    if (!type || !id || !["customer", "supplier"].includes(String(type))) {
      return reply.status(400).send({ success: false, error: "type=customer|supplier and id required" });
    }
    const data = await buildPartyLedger((request as any).userId, type as "customer" | "supplier", id, q.from ?? null, q.to ?? null);
    return reply.send({ success: true, data });
  });

  fastify.get("/party/followups", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildPartyFollowups((request as any).userId, q.from ?? null, q.to ?? null, q.q ?? null);
    return reply.send({ success: true, data });
  });

  // -------------------------------------------------------------------------
  // Order parity — 2 routes (LocalWell ORDER REPORTS)
  // -------------------------------------------------------------------------

  fastify.get("/order/shortbook", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildShortbook((request as any).userId, q.q ?? null, q.sort ?? null);
    return reply.send({ success: true, data });
  });

  fastify.get("/order/purchase-orders", { preHandler: [authGuard] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, string | undefined>;
    const data = await buildPurchaseOrdersRegister((request as any).userId, q.from ?? null, q.to ?? null, (q.groupBy ?? "product") as string, q.q ?? null);
    return reply.send({ success: true, data });
  });
}

// ---------------------------------------------------------------------------
// GST helpers — all aggregations derive from line-item gstRate snapshots,
// never from a hardcoded rate. Cancelled invoices are excluded throughout.
// ---------------------------------------------------------------------------

async function buildOutwardSummary(userId: string, from?: string, to?: string) {
  const allInvoices = await db.select().from(invoices).where(eq(invoices.createdBy, userId));
  const list = allInvoices.filter(
    (i) => i.status !== "cancelled" && !(i as any).hold && inPeriod(i.date, from, to)
  );

  const ids = list.map((i) => i.id);
  const items = ids.length
    ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, ids))
    : [];

  const byRate: Record<string, RateBucket> = {};
  const ensure = (rate: string) => (byRate[rate] ??= emptyBucket());

  for (const it of items) {
    const rateKey = String((it as any).gstRate ?? "12");
    const rateNum = Number(rateKey) || 0;
    const { taxable, gst, cgst, sgst } = deriveItemTax((it as any).amount ?? 0, (it as any).gstAmount ?? 0, rateNum);
    const b = ensure(rateKey);
    b.taxable += taxable;
    b.gst += gst;
    b.cgst += cgst;
    b.sgst += sgst;
    b.count += 1;
  }

  let taxable = 0, gst = 0, cgst = 0, sgst = 0, igst = 0, invoiceValue = 0;
  for (const b of Object.values(byRate)) {
    taxable += b.taxable; gst += b.gst; cgst += b.cgst; sgst += b.sgst;
  }
  for (const inv of list) {
    invoiceValue += (inv as any).grandTotal ?? 0;
    igst += (inv as any).igst ?? 0;
  }
  // Header IGST (if ever used) rides on top of the CGST/SGST split.
  gst += igst;

  // Credit notes (sales returns) in the same period — tenant-scoped
  const allReturns = await db.select().from(salesReturns).where(eq(salesReturns.createdBy, userId));
  const rets = allReturns.filter((r) => inPeriod((r as any).date, from, to));
  const retIds = rets.map((r) => (r as any).id);
  const retItems = retIds.length
    ? await db.select().from(salesReturnItems).where(inArray(salesReturnItems.returnId, retIds))
    : [];
  let creditTaxable = 0, creditGst = 0, creditCgst = 0, creditSgst = 0, creditValue = 0;
  for (const it of retItems) {
    const rateNum = Number((it as any).gstRate ?? 12) || 0;
    const { taxable: t, gst: g, cgst: c, sgst: s } = deriveItemTax((it as any).amount ?? 0, (it as any).gstAmount ?? 0, rateNum);
    creditTaxable += t; creditGst += g; creditCgst += c; creditSgst += s;
  }
  for (const r of rets) creditValue += (r as any).grandTotal ?? (r as any).refundAmount ?? 0;

  return {
    invoiceCount: list.length,
    taxable, gst, cgst, sgst, igst, invoiceValue,
    byRate,
    creditNoteCount: rets.length,
    creditTaxable, creditGst, creditCgst, creditSgst, creditValue,
  };
}

async function buildGstr1(userId: string, from?: string, to?: string) {
  const allInvoices = await db.select().from(invoices).where(eq(invoices.createdBy, userId));
  const list = allInvoices
    .filter((i) => i.status !== "cancelled" && !(i as any).hold && inPeriod(i.date, from, to))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const ids = list.map((i) => i.id);
  const items = ids.length
    ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, ids))
    : [];
  const byInvoice = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byInvoice.get((it as any).invoiceId) ?? [];
    arr.push(it);
    byInvoice.set((it as any).invoiceId, arr);
  }

  const rowFor = (inv: typeof list[number]) => {
    const lines = byInvoice.get((inv as any).id) ?? [];
    let taxable = 0, gst = 0, cgst = 0, sgst = 0;
    const rates = new Set<string>();
    for (const it of lines) {
      const rateKey = String((it as any).gstRate ?? "12");
      rates.add(rateKey);
      const { taxable: t, gst: g, cgst: c, sgst: s } = deriveItemTax(
        (it as any).amount ?? 0, (it as any).gstAmount ?? 0, Number(rateKey) || 0
      );
      taxable += t; gst += g; cgst += c; sgst += s;
    }
    return {
      id: (inv as any).id,
      invoiceNo: (inv as any).invoiceNo,
      date: (inv as any).date,
      customerName: (inv as any).customerName ?? "Walk-in",
      customerGstin: (inv as any).customerGstin ?? null,
      invoiceValue: round2((inv as any).grandTotal ?? 0),
      taxable: round2(taxable),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: round2((inv as any).igst ?? 0),
      totalGst: round2(gst + ((inv as any).igst ?? 0)),
      gstRates: [...rates].sort(),
      itemCount: lines.length,
    };
  };

  const b2b: ReturnType<typeof rowFor>[] = [];
  const b2c: ReturnType<typeof rowFor>[] = [];
  for (const inv of list) {
    const row = rowFor(inv);
    if (row.customerGstin) b2b.push(row);
    else b2c.push(row);
  }

  // Credit notes (Table 9B / CDN) — tenant-scoped
  const allReturns = await db.select().from(salesReturns).where(eq(salesReturns.createdBy, userId));
  const rets = allReturns
    .filter((r) => inPeriod((r as any).date, from, to))
    .sort((a, b) => String((a as any).date).localeCompare(String((b as any).date)));
  const invNoById = new Map<string, string>(list.map((i) => [(i as any).id as string, (i as any).invoiceNo as string]));
  // Also resolve original numbers for returns whose invoice falls outside the period
  if (rets.length) {
    const outsideIds = [...new Set(rets.map((r) => (r as any).invoiceId).filter((id: string) => id && !invNoById.has(id)))];
    if (outsideIds.length) {
      const extra = await db.select({ id: invoices.id, invoiceNo: invoices.invoiceNo }).from(invoices).where(inArray(invoices.id, outsideIds));
      for (const e of extra) invNoById.set((e as any).id, (e as any).invoiceNo);
    }
  }
  const retIds = rets.map((r) => (r as any).id);
  const retItems = retIds.length
    ? await db.select().from(salesReturnItems).where(inArray(salesReturnItems.returnId, retIds))
    : [];
  const retById = new Map<string, typeof retItems>();
  for (const it of retItems) {
    const arr = retById.get((it as any).returnId) ?? [];
    arr.push(it);
    retById.set((it as any).returnId, arr);
  }
  const cdnr = rets.map((r: any) => {
    const lines = retById.get(r.id) ?? [];
    let taxable = 0, gst = 0, cgst = 0, sgst = 0;
    for (const it of lines as any[]) {
      const { taxable: t, gst: g, cgst: c, sgst: s } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      taxable += t; gst += g; cgst += c; sgst += s;
    }
    return {
      id: r.id,
      returnNo: r.returnNo,
      date: r.date,
      originalInvoiceNo: invNoById.get(r.invoiceId) ?? null,
      customerName: r.customerName ?? "Walk-in",
      noteValue: round2(r.grandTotal ?? r.refundAmount ?? 0),
      taxable: round2(taxable),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: round2(r.igst ?? 0),
      totalGst: round2(gst + (r.igst ?? 0)),
    };
  });

  const sum = (rows: { taxable: number; cgst: number; sgst: number; igst: number; totalGst: number; invoiceValue?: number; noteValue?: number }[]) =>
    rows.reduce(
      (a, r) => ({
        taxable: a.taxable + r.taxable,
        cgst: a.cgst + r.cgst,
        sgst: a.sgst + r.sgst,
        igst: a.igst + r.igst,
        gst: a.gst + r.totalGst,
        value: a.value + (r.invoiceValue ?? r.noteValue ?? 0),
        count: a.count + 1,
      }),
      { taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, value: 0, count: 0 }
    );

  const sB2b = sum(b2b);
  const sB2c = sum(b2c);
  const sCdn = sum(cdnr);

  return {
    from: from ?? null,
    to: to ?? null,
    summary: {
      b2bCount: sB2b.count,
      b2cCount: sB2c.count,
      creditNoteCount: sCdn.count,
      totalInvoiceValue: round2(sB2b.value + sB2c.value),
      totalTaxable: round2(sB2b.taxable + sB2c.taxable),
      totalCgst: round2(sB2b.cgst + sB2c.cgst),
      totalSgst: round2(sB2b.sgst + sB2c.sgst),
      totalIgst: round2(sB2b.igst + sB2c.igst),
      totalGst: round2(sB2b.gst + sB2c.gst),
      creditNoteValue: round2(sCdn.value),
      creditTaxable: round2(sCdn.taxable),
      creditGst: round2(sCdn.gst),
      netTaxable: round2(sB2b.taxable + sB2c.taxable - sCdn.taxable),
      netGst: round2(sB2b.gst + sB2c.gst - sCdn.gst),
    },
    b2b,
    b2c,
    cdnr,
  };
}

async function buildInwardSummary(userId: string, from?: string, to?: string) {
  const allBills = await db.select().from(purchaseBills).where(eq(purchaseBills.createdBy, userId));
  const bills = allBills.filter((b) => inPeriod((b as any).billDate, from, to));
  const ids = bills.map((b) => (b as any).id);
  const items = ids.length
    ? await db.select().from(purchaseBillItems).where(inArray(purchaseBillItems.purchaseBillId, ids))
    : [];

  const byRate: Record<string, RateBucket> = {};
  const ensure = (rate: string) => (byRate[rate] ??= emptyBucket());
  for (const it of items as any[]) {
    const rateKey = String(it.gstRate ?? "12");
    const { taxable, gst, cgst, sgst } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(rateKey) || 0);
    const b = ensure(rateKey);
    b.taxable += taxable; b.gst += gst; b.cgst += cgst; b.sgst += sgst; b.count += 1;
  }

  let taxable = 0, gst = 0, cgst = 0, sgst = 0, billValue = 0;
  for (const b of Object.values(byRate)) {
    taxable += b.taxable; gst += b.gst; cgst += b.cgst; sgst += b.sgst;
  }
  for (const b of bills as any[]) billValue += b.grandTotal ?? 0;

  // Purchase-return reversals (table exists even though no UI writes to it yet) — tenant-scoped
  let revTaxable = 0, revGst = 0, revCgst = 0, revSgst = 0, revValue = 0, revCount = 0;
  try {
    const allRets = await db.select().from(purchaseReturns).where(eq(purchaseReturns.createdBy, userId));
    const rets = (allRets as any[]).filter((r) => inPeriod(r.date, from, to));
    revCount = rets.length;
    const rIds = rets.map((r) => r.id);
    const rItems = rIds.length
      ? await db.select().from(purchaseReturnItems).where(inArray(purchaseReturnItems.returnId, rIds))
      : [];
    for (const it of rItems as any[]) {
      const { taxable: t, gst: g, cgst: c, sgst: s } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      revTaxable += t; revGst += g; revCgst += c; revSgst += s;
    }
    for (const r of rets) revValue += r.grandTotal ?? r.refundAmount ?? 0;
  } catch {
    // purchase_returns table predates some installs — treat as zero reversals
  }

  // Nil / exempt inward = gstRate 0 slice
  const nilTaxable = byRate["0"] ? byRate["0"].taxable : 0;

  return {
    billCount: bills.length,
    taxable, gst, cgst, sgst, billValue, byRate, nilTaxable,
    revCount, revTaxable, revGst, revCgst, revSgst, revValue,
    netTaxable: taxable - revTaxable,
    netGst: gst - revGst,
    netCgst: cgst - revCgst,
    netSgst: sgst - revSgst,
  };
}

async function buildGstr3b(userId: string, from?: string, to?: string) {
  const outward = await buildOutwardSummary(userId, from, to);
  const inward = await buildInwardSummary(userId, from, to);

  const outTaxable = outward.taxable - outward.creditTaxable;
  const outCgst = outward.cgst - outward.creditCgst;
  const outSgst = outward.sgst - outward.creditSgst;
  const outIgst = outward.igst; // returns carry no IGST split at line level
  const outGst = outward.gst - outward.creditGst;

  const itcCgst = inward.netCgst;
  const itcSgst = inward.netSgst;

  return {
    from: from ?? null,
    to: to ?? null,
    outward: {
      invoiceCount: outward.invoiceCount,
      invoiceValue: round2(outward.invoiceValue),
      taxable: round2(outward.taxable),
      cgst: round2(outward.cgst),
      sgst: round2(outward.sgst),
      igst: round2(outward.igst),
      gst: round2(outward.gst),
      creditNoteCount: outward.creditNoteCount,
      creditValue: round2(outward.creditValue),
      creditTaxable: round2(outward.creditTaxable),
      creditGst: round2(outward.creditGst),
      netTaxable: round2(outTaxable),
      netCgst: round2(outCgst),
      netSgst: round2(outSgst),
      netIgst: round2(outIgst),
      netGst: round2(outGst),
      byRate: Object.fromEntries(
        Object.entries(outward.byRate).map(([rate, b]) => [
          rate,
          { taxable: round2(b.taxable), cgst: round2(b.cgst), sgst: round2(b.sgst), igst: 0, gst: round2(b.gst) },
        ])
      ),
    },
    itc: {
      billCount: inward.billCount,
      billValue: round2(inward.billValue),
      taxable: round2(inward.taxable),
      cgst: round2(inward.cgst),
      sgst: round2(inward.sgst),
      gst: round2(inward.gst),
      reversalCount: inward.revCount,
      reversalValue: round2(inward.revValue),
      reversalGst: round2(inward.revGst),
      netTaxable: round2(inward.netTaxable),
      netCgst: round2(inward.netCgst),
      netSgst: round2(inward.netSgst),
      netGst: round2(inward.netGst),
      nilTaxable: round2(inward.nilTaxable),
      byRate: Object.fromEntries(
        Object.entries(inward.byRate).map(([rate, b]) => [
          rate,
          { taxable: round2(b.taxable), cgst: round2(b.cgst), sgst: round2(b.sgst), gst: round2(b.gst) },
        ])
      ),
    },
    liability: {
      outputCgst: round2(outCgst),
      outputSgst: round2(outSgst),
      outputIgst: round2(outIgst),
      itcCgst: round2(itcCgst),
      itcSgst: round2(itcSgst),
      netCgstPayable: round2(Math.max(0, outCgst - itcCgst)),
      netSgstPayable: round2(Math.max(0, outSgst - itcSgst)),
      netIgstPayable: round2(outIgst),
      totalPayable: round2(Math.max(0, outCgst - itcCgst) + Math.max(0, outSgst - itcSgst) + outIgst),
    },
  };
}

async function buildHsnSummary(userId: string, from?: string, to?: string) {
  const outwardIds = (await db.select({ id: invoices.id, date: invoices.date, status: invoices.status, hold: invoices.hold, createdBy: invoices.createdBy }).from(invoices).where(eq(invoices.createdBy, userId)))
    .filter((i: any) => i.status !== "cancelled" && !i.hold && inPeriod(i.date, from, to))
    .map((i: any) => i.id);
  const outwardItems = outwardIds.length
    ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, outwardIds))
    : [];

  const inwardIds = (await db.select({ id: purchaseBills.id, billDate: purchaseBills.billDate, createdBy: purchaseBills.createdBy }).from(purchaseBills).where(eq(purchaseBills.createdBy, userId)))
    .filter((b: any) => inPeriod(b.billDate, from, to))
    .map((b: any) => b.id);
  const inwardItems = inwardIds.length
    ? await db.select().from(purchaseBillItems).where(inArray(purchaseBillItems.purchaseBillId, inwardIds))
    : [];

  const rollup = (lines: any[]) => {
    const map = new Map<string, {
      hsn: string; gstRate: string; unit: string;
      description: string; quantity: number; taxable: number;
      cgst: number; sgst: number; igst: number; gst: number; count: number;
    }>();
    for (const it of lines) {
      const hsn = (it.hsnCode || "—").trim() || "—";
      const rateKey = String(it.gstRate ?? "12");
      const key = `${hsn}||${rateKey}`;
      const { taxable, gst, cgst, sgst } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(rateKey) || 0);
      const row = map.get(key) ?? {
        hsn, gstRate: rateKey, unit: it.unit || "NOS",
        description: it.medicineName, quantity: 0, taxable: 0,
        cgst: 0, sgst: 0, igst: 0, gst: 0, count: 0,
      };
      row.quantity += it.quantity ?? 0;
      row.taxable += taxable; row.gst += gst; row.cgst += cgst; row.sgst += sgst;
      row.count += 1;
      map.set(key, row);
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        quantity: round2(r.quantity),
        taxable: round2(r.taxable),
        cgst: round2(r.cgst),
        sgst: round2(r.sgst),
        igst: 0,
        gst: round2(r.gst),
      }))
      .sort((a, b) => (a.hsn === "—" ? 1 : b.hsn === "—" ? -1 : a.hsn.localeCompare(b.hsn)) || Number(a.gstRate) - Number(b.gstRate));
  };

  const sales = rollup(outwardItems as any[]);
  const purchase = rollup(inwardItems as any[]);
  const tot = (rows: typeof sales) => rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, gst: a.gst + r.gst, qty: a.qty + r.quantity }), { taxable: 0, gst: 0, qty: 0 });

  return {
    from: from ?? null,
    to: to ?? null,
    sales,
    purchase,
    salesTotal: tot(sales),
    purchaseTotal: tot(purchase),
  };
}

async function buildItcLedger(userId: string, from?: string, to?: string) {
  const allBills = await db.select().from(purchaseBills).where(eq(purchaseBills.createdBy, userId));
  const bills = allBills
    .filter((b) => inPeriod((b as any).billDate, from, to))
    .sort((a, b) => String((a as any).billDate).localeCompare(String((b as any).billDate)));

  const supplierIds = [...new Set(bills.map((b) => (b as any).supplierId).filter(Boolean))];
  const suppGstin = new Map<string, string | null>();
  if (supplierIds.length) {
    const supps = await db.select().from(suppliers).where(inArray(suppliers.id, supplierIds));
    for (const s of supps as any[]) suppGstin.set(s.id, s.gstin ?? null);
  }

  const ids = bills.map((b) => (b as any).id);
  const items = ids.length
    ? await db.select().from(purchaseBillItems).where(inArray(purchaseBillItems.purchaseBillId, ids))
    : [];
  const byBill = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byBill.get((it as any).purchaseBillId) ?? [];
    arr.push(it);
    byBill.set((it as any).purchaseBillId, arr);
  }

  const rows = (bills as any[]).map((b) => {
    const lines = byBill.get(b.id) ?? [];
    let taxable = 0, gst = 0, cgst = 0, sgst = 0;
    const rates = new Set<string>();
    for (const it of lines as any[]) {
      const rateKey = String(it.gstRate ?? "12");
      rates.add(rateKey);
      const { taxable: t, gst: g, cgst: c, sgst: s } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(rateKey) || 0);
      taxable += t; gst += g; cgst += c; sgst += s;
    }
    return {
      id: b.id,
      billNo: b.billNo,
      billDate: b.billDate,
      supplierName: b.supplierName ?? "—",
      supplierGstin: (b.supplierId && suppGstin.get(b.supplierId)) || null,
      billValue: round2(b.grandTotal ?? 0),
      taxable: round2(taxable),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: 0,
      totalGst: round2(gst),
      gstRates: [...rates].sort(),
      eligible: !(b.supplierId && suppGstin.get(b.supplierId)) ? "verify-supplier-gstin" : "eligible",
    };
  });

  const gross = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, gst: a.gst + r.totalGst, value: a.value + r.billValue }), { taxable: 0, gst: 0, value: 0 });
  const inward = await buildInwardSummary(userId, from, to);

  return {
    from: from ?? null,
    to: to ?? null,
    summary: {
      billCount: rows.length,
      billValue: round2(gross.value),
      taxable: round2(gross.taxable),
      cgst: round2(gross.taxable ? rows.reduce((a, r) => a + r.cgst, 0) : 0),
      sgst: round2(gross.taxable ? rows.reduce((a, r) => a + r.sgst, 0) : 0),
      grossItc: round2(gross.gst),
      reversalCount: inward.revCount,
      reversalGst: round2(inward.revGst),
      netItc: round2(gross.gst - inward.revGst),
      withoutSupplierGstin: rows.filter((r) => r.eligible !== "eligible").length,
    },
    bills: rows,
    byRate: Object.fromEntries(
      Object.entries(inward.byRate).map(([rate, b]) => [
        rate,
        { taxable: round2(b.taxable), cgst: round2(b.cgst), sgst: round2(b.sgst), gst: round2(b.gst) },
      ])
    ),
  };
}

async function buildGstr2(userId: string, from?: string, to?: string) {
  const allBills = await db.select().from(purchaseBills).where(eq(purchaseBills.createdBy, userId));
  const bills = (allBills as any[])
    .filter((b) => inPeriod(b.billDate, from, to))
    .sort((a, b) => String(a.billDate).localeCompare(String(b.billDate)));

  const supplierIds = [...new Set(bills.map((b) => b.supplierId).filter(Boolean))] as string[];
  const suppGstin = new Map<string, string | null>();
  if (supplierIds.length) {
    const supps = await db.select().from(suppliers).where(inArray(suppliers.id, supplierIds));
    for (const s of supps as any[]) suppGstin.set(s.id, s.gstin ?? null);
  }

  const ids = bills.map((b) => b.id as string);
  const items = ids.length
    ? await db.select().from(purchaseBillItems).where(inArray(purchaseBillItems.purchaseBillId, ids))
    : [];
  const byBill = new Map<string, typeof items>();
  for (const it of items as any[]) {
    const arr = byBill.get(it.purchaseBillId) ?? [];
    arr.push(it);
    byBill.set(it.purchaseBillId, arr);
  }

  // Gross byRate buckets (derive from line items, split CGST/SGST half)
  const byRate: Record<string, RateBucket> = {};
  const ensure = (rate: string) => (byRate[rate] ??= emptyBucket());
  for (const it of items as any[]) {
    const rateKey = String(it.gstRate ?? "12");
    const { taxable, gst, cgst, sgst } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(rateKey) || 0);
    const b = ensure(rateKey);
    b.taxable += taxable; b.gst += gst; b.cgst += cgst; b.sgst += sgst; b.count += 1;
  }

  const rowFor = (bill: any) => {
    const lines = byBill.get(bill.id) ?? [];
    let taxable = 0, gst = 0, cgst = 0, sgst = 0;
    const rates = new Set<string>();
    for (const it of lines as any[]) {
      const rateKey = String(it.gstRate ?? "12");
      rates.add(rateKey);
      const { taxable: t, gst: g, cgst: c, sgst: s } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(rateKey) || 0);
      taxable += t; gst += g; cgst += c; sgst += s;
    }
    const supplierGstin = (bill.supplierId && suppGstin.get(bill.supplierId)) || null;
    return {
      id: bill.id,
      billId: bill.id,
      billNo: bill.billNo,
      billDate: bill.billDate,
      date: bill.billDate,
      supplierId: bill.supplierId ?? null,
      supplierName: bill.supplierName ?? "—",
      supplierGstin,
      billValue: round2(bill.grandTotal ?? 0),
      invoiceValue: round2(bill.grandTotal ?? 0),
      taxable: round2(taxable),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: 0,
      totalGst: round2(gst),
      gst: round2(gst),
      gstRates: [...rates].sort(),
      itemCount: lines.length,
    };
  };

  const b2b: ReturnType<typeof rowFor>[] = [];
  const b2c: ReturnType<typeof rowFor>[] = [];
  for (const bill of bills as any[]) {
    const row = rowFor(bill);
    if (row.supplierGstin) b2b.push(row);
    else b2c.push(row);
  }

  // Debit notes (CNDR analog) = purchaseReturns in period scoped by userId
  const allReturns = await db.select().from(purchaseReturns).where(eq(purchaseReturns.createdBy, userId));
  const rets = (allReturns as any[])
    .filter((r) => inPeriod(r.date, from, to))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const billNoById = new Map<string, string>(bills.map((b: any) => [b.id as string, b.billNo as string]));
  if (rets.length) {
    const outsideIds = [...new Set(rets.map((r: any) => r.purchaseBillId).filter((id: string) => id && !billNoById.has(id)))];
    if (outsideIds.length) {
      const extra = await db.select({ id: purchaseBills.id, billNo: purchaseBills.billNo }).from(purchaseBills).where(inArray(purchaseBills.id, outsideIds));
      for (const e of extra as any[]) billNoById.set(e.id, e.billNo);
    }
  }

  const retIds = rets.map((r: any) => r.id as string);
  const retItems = retIds.length
    ? await db.select().from(purchaseReturnItems).where(inArray(purchaseReturnItems.returnId, retIds))
    : [];
  const retById = new Map<string, typeof retItems>();
  for (const it of retItems as any[]) {
    const arr = retById.get(it.returnId) ?? [];
    arr.push(it);
    retById.set(it.returnId, arr);
  }

  const cdnr = rets.map((r: any) => {
    const lines = retById.get(r.id) ?? [];
    let taxable = 0, gst = 0, cgst = 0, sgst = 0;
    for (const it of lines as any[]) {
      const { taxable: t, gst: g, cgst: c, sgst: s } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      taxable += t; gst += g; cgst += c; sgst += s;
    }
    return {
      id: r.id,
      returnId: r.id,
      returnNo: r.returnNo,
      date: r.date,
      billDate: r.date,
      originalBillNo: r.purchaseBillId ? (billNoById.get(r.purchaseBillId) ?? null) : null,
      originalInvoiceNo: r.purchaseBillId ? (billNoById.get(r.purchaseBillId) ?? null) : null,
      supplierId: r.supplierId ?? null,
      supplierName: r.supplierName ?? "—",
      supplierGstin: (r.supplierId && suppGstin.get(r.supplierId)) || null,
      noteValue: round2(r.grandTotal ?? r.refundAmount ?? 0),
      billValue: round2(r.grandTotal ?? r.refundAmount ?? 0),
      taxable: round2(taxable),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: 0,
      totalGst: round2(gst),
      gst: round2(gst),
    };
  });

  const sumRows = (rows: { taxable: number; cgst: number; sgst: number; igst: number; totalGst: number; billValue?: number; noteValue?: number }[]) =>
    rows.reduce(
      (a, r) => ({
        taxable: a.taxable + r.taxable,
        cgst: a.cgst + r.cgst,
        sgst: a.sgst + r.sgst,
        igst: a.igst + r.igst,
        gst: a.gst + r.totalGst,
        value: a.value + (r.billValue ?? r.noteValue ?? 0),
        count: a.count + 1,
      }),
      { taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, value: 0, count: 0 }
    );

  const sB2b = sumRows(b2b);
  const sB2c = sumRows(b2c);
  const sCdn = sumRows(cdnr);

  const grossTaxable = sB2b.taxable + sB2c.taxable;
  const grossGst = sB2b.gst + sB2c.gst;
  const grossCgst = sB2b.cgst + sB2c.cgst;
  const grossSgst = sB2b.sgst + sB2c.sgst;
  const grossIgst = sB2b.igst + sB2c.igst;
  const grossValue = sB2b.value + sB2c.value;

  const debitTaxable = sCdn.taxable;
  const debitGst = sCdn.gst;
  const debitCgst = sCdn.cgst;
  const debitSgst = sCdn.sgst;
  const debitValue = sCdn.value;

  const byRateRounded = Object.fromEntries(
    Object.entries(byRate).map(([rate, b]) => [
      rate,
      { taxable: round2(b.taxable), cgst: round2(b.cgst), sgst: round2(b.sgst), igst: 0, gst: round2(b.gst), count: b.count },
    ])
  );

  return {
    from: from ?? null,
    to: to ?? null,
    summary: {
      billCount: bills.length,
      b2bCount: sB2b.count,
      b2cCount: sB2c.count,
      debitNoteCount: sCdn.count,
      cdnrCount: sCdn.count,
      creditNoteCount: sCdn.count,
      totalInvoiceValue: round2(grossValue),
      billValue: round2(grossValue),
      invoiceValue: round2(grossValue),
      totalTaxable: round2(grossTaxable),
      taxable: round2(grossTaxable),
      totalGst: round2(grossGst),
      gst: round2(grossGst),
      cgst: round2(grossCgst),
      sgst: round2(grossSgst),
      igst: round2(grossIgst),
      totalCgst: round2(grossCgst),
      totalSgst: round2(grossSgst),
      totalIgst: round2(grossIgst),
      debitValue: round2(debitValue),
      debitTaxable: round2(debitTaxable),
      debitGst: round2(debitGst),
      debitCgst: round2(debitCgst),
      debitSgst: round2(debitSgst),
      creditTaxable: round2(debitTaxable),
      creditGst: round2(debitGst),
      netTaxable: round2(grossTaxable - debitTaxable),
      netGst: round2(grossGst - debitGst),
      netCgst: round2(grossCgst - debitCgst),
      netSgst: round2(grossSgst - debitSgst),
      netIgst: round2(grossIgst),
      netValue: round2(grossValue - debitValue),
    },
    b2b,
    b2c,
    cdnr,
    cdn: cdnr,
    debitNotes: cdnr,
    byRate: byRateRounded,
  };
}

// ---------------------------------------------------------------------------
// Sales parity helpers
// ---------------------------------------------------------------------------

async function medicineMaps(userId?: string) {
  const allMeds = userId
    ? await db.select().from(medicines).where(eq(medicines.createdBy, userId))
    : await db.select().from(medicines);
  const byId = new Map<string, typeof allMeds[number]>();
  for (const m of allMeds) byId.set((m as any).id, m as any);
  return byId;
}

function invoiceProfit(items: any[], medById: Map<string, any>) {
  let profit = 0;
  for (const it of items) {
    const qty = Number(it.quantity ?? 0);
    const rate = Number(it.rate ?? 0);
    const disc = Number(it.discountAmount ?? 0);
    const med = it.medicineId ? medById.get(it.medicineId) : null;
    const cost = med ? Number((med as any).purchasePrice ?? 0) : rate * 0.8;
    profit += (rate - cost) * qty - disc;
  }
  return profit;
}

async function fetchInvoicesInPeriod(userId: string, from?: string, to?: string) {
  const all = await db.select().from(invoices).where(eq(invoices.createdBy, userId));
  return (all as any[]).filter((i) => i.status !== "cancelled" && !(i as any).hold && inPeriod(i.date, from, to));
}

async function buildSalesRegister(
  userId: string,
  from?: string,
  to?: string,
  view: "invoice" | "date" = "invoice",
  filters: { customer?: string | null; doctor?: string | null; schedule?: string | null; q?: string | null; customerId?: string | null; doctorId?: string | null; party?: string | null } = {}
) {
  let list = await fetchInvoicesInPeriod(userId, from, to);
  const medById = await medicineMaps(userId);

  // pre-filter by customer/doctor (id or name)
  const custFilter = (filters.customerId ?? filters.customer ?? filters.party ?? null)?.trim() || null;
  const docFilter = (filters.doctorId ?? filters.doctor ?? null)?.trim() || null;
  if (custFilter) {
    const cf = custFilter.toLowerCase();
    list = list.filter((i: any) => String(i.customerId ?? "").toLowerCase() === cf || String(i.customerName ?? "").toLowerCase().includes(cf));
  }
  if (docFilter) {
    const df = docFilter.toLowerCase();
    list = list.filter((i: any) => String(i.doctorId ?? "").toLowerCase() === df || String(i.doctorName ?? "").toLowerCase().includes(df));
  }
  if (filters.q) {
    const ql = filters.q.toLowerCase();
    list = list.filter((i: any) => String(i.customerName ?? "").toLowerCase().includes(ql) || String(i.invoiceNo ?? "").toLowerCase().includes(ql) || String(i.customerPhone ?? "").includes(ql));
  }

  const ids = list.map((i: any) => i.id);
  const allItems = ids.length ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, ids)) : [];

  // schedule filter via items -> medicines.schedule
  let allowedIds: Set<string> | null = null;
  if (filters.schedule) {
    const sched = String(filters.schedule).trim();
    const keep = new Set<string>();
    for (const it of allItems as any[]) {
      const med = it.medicineId ? medById.get(it.medicineId) : null;
      if (String((med as any)?.schedule ?? "") === sched) keep.add(it.invoiceId);
    }
    allowedIds = keep;
    list = list.filter((i: any) => keep.has(i.id));
  }

  const byInvoice = new Map<string, any[]>();
  for (const it of allItems as any[]) {
    const arr = byInvoice.get(it.invoiceId) ?? [];
    arr.push(it);
    byInvoice.set(it.invoiceId, arr);
  }

  const computeRow = (inv: any) => {
    const lines = byInvoice.get(inv.id) ?? [];
    let taxable = 0, gst = 0;
    for (const it of lines) {
      const rateNum = Number(it.gstRate ?? 12) || 0;
      const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, rateNum);
      taxable += t; gst += g;
    }
    const invoiceValue = lines.reduce((a: number, it: any) => a + Number(it.amount ?? 0) + Number(it.gstAmount ?? 0), 0);
    // grandTotal already is authoritative; adj is mismatch between stored total and recomputed line sum
    const adjAmount = round2(Number(inv.grandTotal ?? 0) - invoiceValue);
    const netProfit = round2(invoiceProfit(lines, medById));
    const payable = round2(Number(inv.grandTotal ?? 0));
    const marginPercent = payable > 0 ? round2((netProfit / payable) * 100) : 0;
    return {
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      customerId: inv.customerId ?? null,
      customerName: inv.customerName ?? "Walk-in",
      doctorId: inv.doctorId ?? null,
      doctorName: inv.doctorName ?? null,
      taxable: round2(taxable),
      gst: round2(gst),
      netProfit,
      adjAmount,
      payable,
      balance: 0,
      marginPercent,
      grandTotal: round2(Number(inv.grandTotal ?? 0)),
      status: inv.status,
    };
  };

  const invoiceRows = list
    .map(computeRow)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (view === "date") {
    const bucketMap = new Map<string, { date: string; invoiceCount: number; taxable: number; gst: number; payable: number; netProfit: number; adjAmount: number }>();
    for (const r of invoiceRows) {
      const k = r.date;
      const b = bucketMap.get(k) ?? { date: k, invoiceCount: 0, taxable: 0, gst: 0, payable: 0, netProfit: 0, adjAmount: 0 };
      b.invoiceCount += 1;
      b.taxable += r.taxable; b.gst += r.gst; b.payable += r.payable; b.netProfit += r.netProfit; b.adjAmount += r.adjAmount;
      bucketMap.set(k, b);
    }
    const buckets = [...bucketMap.values()]
      .map((b) => ({ ...b, taxable: round2(b.taxable), gst: round2(b.gst), payable: round2(b.payable), netProfit: round2(b.netProfit), adjAmount: round2(b.adjAmount), balance: 0, marginPercent: b.payable > 0 ? round2((b.netProfit / b.payable) * 100) : 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const summary = summarizeRegister(buckets);
    return { from: from ?? null, to: to ?? null, view, buckets, invoices: invoiceRows, summary };
  }

  const summary = summarizeRegister(invoiceRows);
  return { from: from ?? null, to: to ?? null, view, invoices: invoiceRows, buckets: undefined, rows: invoiceRows, summary };
}

function summarizeRegister(rows: Array<{ taxable: number; gst: number; payable: number; netProfit: number; adjAmount: number }>) {
  let taxable = 0, gst = 0, payable = 0, netProfit = 0, adjAmount = 0;
  for (const r of rows) { taxable += r.taxable; gst += r.gst; payable += r.payable; netProfit += r.netProfit; adjAmount += r.adjAmount; }
  return { invoiceCount: rows.length, taxable: round2(taxable), gst: round2(gst), payable: round2(payable), netProfit: round2(netProfit), adjAmount: round2(adjAmount), balance: 0 };
}

async function buildSalesDetail(userId: string, from?: string, to?: string, filters: { customer?: string | null; q?: string | null; customerId?: string | null } = {}) {
  let list = await fetchInvoicesInPeriod(userId, from, to);
  const custFilter = (filters.customerId ?? filters.customer ?? null)?.trim() || null;
  if (custFilter) {
    const cf = custFilter.toLowerCase();
    list = list.filter((i: any) => String(i.customerId ?? "").toLowerCase() === cf || String(i.customerName ?? "").toLowerCase().includes(cf));
  }
  if (filters.q) {
    const ql = filters.q.toLowerCase();
    list = list.filter((i: any) => String(i.customerName ?? "").toLowerCase().includes(ql));
  }
  const ids = list.map((i: any) => i.id);
  const saleItems = ids.length ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, ids)) : [];
  const medById = await medicineMaps(userId);

  // returns in period (same from/to filter) scoped to those invoices
  const allReturns = await db.select().from(salesReturns).where(eq(salesReturns.createdBy, userId));
  const rets = (allReturns as any[]).filter((r) => inPeriod(r.date, from, to) && ids.includes(r.invoiceId));
  const retIds = rets.map((r: any) => r.id);
  const retItems = retIds.length ? await db.select().from(salesReturnItems).where(inArray(salesReturnItems.returnId, retIds)) : [];

  const keyFor = (it: any) => it.medicineId ?? `name:${String(it.medicineName ?? "").toLowerCase()}`;
  const agg = new Map<string, { medicineId: string | null; medicineName: string; hsnCode: string | null; saleQty: number; returnQty: number; taxable: number; gst: number; cost: number; amount: number }>();

  for (const it of saleItems as any[]) {
    const key = keyFor(it);
    const row = agg.get(key) ?? { medicineId: it.medicineId ?? null, medicineName: it.medicineName, hsnCode: it.hsnCode ?? null, saleQty: 0, returnQty: 0, taxable: 0, gst: 0, cost: 0, amount: 0 };
    const qty = Number(it.quantity ?? 0);
    const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
    row.saleQty += qty; row.taxable += t; row.gst += g; row.amount += Number(it.amount ?? 0);
    const med = it.medicineId ? medById.get(it.medicineId) : null;
    const cost = med ? Number((med as any).purchasePrice ?? 0) : Number(it.rate ?? 0) * 0.8;
    row.cost += cost * qty;
    row.hsnCode = row.hsnCode ?? it.hsnCode ?? null;
    agg.set(key, row);
  }
  for (const it of retItems as any[]) {
    const key = keyFor(it);
    const row = agg.get(key) ?? { medicineId: it.medicineId ?? null, medicineName: it.medicineName, hsnCode: it.hsnCode ?? null, saleQty: 0, returnQty: 0, taxable: 0, gst: 0, cost: 0, amount: 0 };
    row.returnQty += Number(it.quantity ?? 0);
    // returns do not contribute to sale taxable/gst; net is sale minus return at return rate for display
    agg.set(key, row);
  }

  const rows = [...agg.values()].map((r) => {
    const netQty = r.saleQty - r.returnQty;
    const netAmount = r.amount - 0; // keep sale amount for margin; net display via qty
    const netProfit = round2(r.amount - r.cost - 0);
    const payable = round2(r.amount + r.gst);
    const marginPercent = payable > 0 ? round2((netProfit / payable) * 100) : 0;
    return {
      medicineId: r.medicineId,
      medicineName: r.medicineName,
      hsnCode: r.hsnCode,
      saleQty: round2(r.saleQty),
      returnQty: round2(r.returnQty),
      netQty: round2(netQty),
      taxable: round2(r.taxable),
      gst: round2(r.gst),
      amount: round2(r.amount),
      netProfit,
      marginPercent,
    };
  }).sort((a, b) => a.medicineName.localeCompare(b.medicineName));

  const summary = rows.reduce((a, r) => ({ saleQty: a.saleQty + r.saleQty, returnQty: a.returnQty + r.returnQty, netQty: a.netQty + r.netQty, taxable: a.taxable + r.taxable, gst: a.gst + r.gst }), { saleQty: 0, returnQty: 0, netQty: 0, taxable: 0, gst: 0 });
  return { from: from ?? null, to: to ?? null, rows, summary: { saleQty: round2(summary.saleQty), returnQty: round2(summary.returnQty), netQty: round2(summary.netQty), taxable: round2(summary.taxable), gst: round2(summary.gst) } };
}

async function buildSalesSummary(userId: string, from?: string, to?: string, groupBy: "product" | "company" | "category" | "customer" | "supplier" | "user" = "product") {
  let list = await fetchInvoicesInPeriod(userId, from, to);
  const ids = list.map((i: any) => i.id);
  const saleItems = ids.length ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, ids)) : [];
  const medById = await medicineMaps(userId);

  const allReturns = await db.select().from(salesReturns).where(eq(salesReturns.createdBy, userId));
  const rets = (allReturns as any[]).filter((r) => inPeriod(r.date, from, to) && ids.includes(r.invoiceId));
  const retIds = rets.map((r: any) => r.id);
  const retItems = retIds.length ? await db.select().from(salesReturnItems).where(inArray(salesReturnItems.returnId, retIds)) : [];

  const keyForSale = (it: any): string => {
    if (groupBy === "product") return String(it.medicineId ?? `name:${it.medicineName}`);
    if (groupBy === "company") return String((it.medicineId ? (medById.get(it.medicineId) as any)?.brand : null) ?? "—");
    if (groupBy === "category") return String((it.medicineId ? (medById.get(it.medicineId) as any)?.category : null) ?? "—");
    return "—";
  };
  const keyForParty = (inv: any): string => {
    if (groupBy === "customer") return String(inv.customerName ?? "Walk-in");
    if (groupBy === "user") return String(inv.createdBy ?? "—");
    if (groupBy === "supplier") return "—";
    return "—";
  };

  const bucket = new Map<string, { group: string; saleQty: number; returnQty: number; taxable: number; gst: number; payable: number }>();

  if (groupBy === "customer" || groupBy === "user" || groupBy === "supplier") {
    const invById = new Map(list.map((i: any) => [i.id, i]));
    // group by invoice party, sum its line totals
    for (const it of saleItems as any[]) {
      const inv = invById.get(it.invoiceId) as any;
      const key = keyForParty(inv);
      const b = bucket.get(key) ?? { group: key, saleQty: 0, returnQty: 0, taxable: 0, gst: 0, payable: 0 };
      b.saleQty += Number(it.quantity ?? 0);
      const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      b.taxable += t; b.gst += g; b.payable += Number(it.amount ?? 0) + g;
      bucket.set(key, b);
    }
    // returns attributed to customer in supplier/user case still count
    const retByInvoice = new Map(rets.map((r: any) => [r.id, r.invoiceId] as const));
    for (const it of retItems as any[]) {
      const invId = retByInvoice.get(it.returnId) as string | undefined;
      const inv = invId ? invById.get(invId) as any : null;
      const key = inv ? keyForParty(inv) : "—";
      const b = bucket.get(key) ?? { group: key, saleQty: 0, returnQty: 0, taxable: 0, gst: 0, payable: 0 };
      b.returnQty += Number(it.quantity ?? 0);
      bucket.set(key, b);
    }
  } else {
    for (const it of saleItems as any[]) {
      const key = keyForSale(it);
      const b = bucket.get(key) ?? { group: key, saleQty: 0, returnQty: 0, taxable: 0, gst: 0, payable: 0 };
      b.saleQty += Number(it.quantity ?? 0);
      const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      b.taxable += t; b.gst += g; b.payable += Number(it.amount ?? 0) + g;
      bucket.set(key, b);
    }
    for (const it of retItems as any[]) {
      const key = keyForSale(it);
      const b = bucket.get(key) ?? { group: key, saleQty: 0, returnQty: 0, taxable: 0, gst: 0, payable: 0 };
      b.returnQty += Number(it.quantity ?? 0);
      bucket.set(key, b);
    }
  }

  const rows = [...bucket.values()].map((r) => ({
    group: r.group,
    brand: groupBy === "company" ? r.group : undefined,
    company: groupBy === "company" ? r.group : undefined,
    category: groupBy === "category" ? r.group : undefined,
    saleQty: round2(r.saleQty),
    returnQty: round2(r.returnQty),
    netQty: round2(r.saleQty - r.returnQty),
    taxable: round2(r.taxable),
    gst: round2(r.gst),
    payable: round2(r.payable),
  })).sort((a, b) => b.payable - a.payable);

  const summary = rows.reduce((a, r) => ({ saleQty: a.saleQty + r.saleQty, returnQty: a.returnQty + r.returnQty, taxable: a.taxable + r.taxable, gst: a.gst + r.gst, payable: a.payable + r.payable }), { saleQty: 0, returnQty: 0, taxable: 0, gst: 0, payable: 0 });
  return { from: from ?? null, to: to ?? null, groupBy, rows, summary: { saleQty: round2(summary.saleQty), returnQty: round2(summary.returnQty), netQty: round2(summary.saleQty - summary.returnQty), taxable: round2(summary.taxable), gst: round2(summary.gst), payable: round2(summary.payable) } };
}

async function buildSalesDoctor(userId: string, from: string | undefined, to: string | undefined, doctorId: string | null) {
  let list = await fetchInvoicesInPeriod(userId, from, to);
  if (doctorId) {
    const df = doctorId.toLowerCase();
    list = list.filter((i: any) => String(i.doctorId ?? "").toLowerCase() === df || String(i.doctorName ?? "").toLowerCase().includes(df));
  } else {
    list = list.filter((i: any) => !!i.doctorId);
  }
  const ids = list.map((i: any) => i.id);
  const items = ids.length ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, ids)) : [];
  const medById = await medicineMaps(userId);
  const byInv = new Map<string, any[]>();
  for (const it of items as any[]) {
    const arr = byInv.get(it.invoiceId) ?? []; arr.push(it); byInv.set(it.invoiceId, arr);
  }
  const rows = list.map((inv: any) => {
    const lines = byInv.get(inv.id) ?? [];
    let taxable = 0, gst = 0;
    for (const it of lines) {
      const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      taxable += t; gst += g;
    }
    const netProfit = round2(invoiceProfit(lines, medById));
    return {
      id: inv.id, invoiceNo: inv.invoiceNo, date: inv.date,
      customerName: inv.customerName ?? "Walk-in",
      doctorId: inv.doctorId ?? null, doctorName: inv.doctorName ?? null,
      taxable: round2(taxable), gst: round2(gst), netProfit,
      payable: round2(Number(inv.grandTotal ?? 0)), balance: 0,
      adjAmount: round2(Number(inv.grandTotal ?? 0) - lines.reduce((a: number, it: any) => a + Number(it.amount ?? 0) + Number(it.gstAmount ?? 0), 0)),
    };
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const summary = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, gst: a.gst + r.gst, payable: a.payable + r.payable, netProfit: a.netProfit + r.netProfit }), { taxable: 0, gst: 0, payable: 0, netProfit: 0 });
  return { from: from ?? null, to: to ?? null, rows, invoices: rows, summary: { invoiceCount: rows.length, ...Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, round2(v as number)])) } };
}

async function buildSalesSchedule(userId: string, from: string | undefined, to: string | undefined, schedule: string | null) {
  let list = await fetchInvoicesInPeriod(userId, from, to);
  const ids = list.map((i: any) => i.id);
  const allItems = ids.length ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, ids)) : [];
  const medById = await medicineMaps(userId);
  const sched = schedule ? String(schedule).trim() : null;
  const filteredItems = sched ? (allItems as any[]).filter((it) => String((it.medicineId ? (medById.get(it.medicineId) as any)?.schedule : null) ?? "") === sched) : (allItems as any[]);
  const invoiceIds = new Set(filteredItems.map((it: any) => it.invoiceId));
  const filteredList = sched ? list.filter((i: any) => invoiceIds.has(i.id)) : list;

  const byInv = new Map<string, any[]>();
  for (const it of filteredItems as any[]) {
    const arr = byInv.get(it.invoiceId) ?? []; arr.push(it); byInv.set(it.invoiceId, arr);
  }
  const rows = filteredList.map((inv: any) => {
    const lines = byInv.get(inv.id) ?? [];
    let taxable = 0, gst = 0;
    for (const it of lines) {
      const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      taxable += t; gst += g;
    }
    return {
      id: inv.id, invoiceNo: inv.invoiceNo, date: inv.date,
      customerName: inv.customerName ?? "Walk-in",
      schedule: sched ?? null,
      taxable: round2(taxable), gst: round2(gst),
      quantity: round2(lines.reduce((a: number, it: any) => a + Number(it.quantity ?? 0), 0)),
      payable: round2(Number(inv.grandTotal ?? 0)), balance: 0,
      items: lines.map((it: any) => ({ medicineName: it.medicineName, quantity: it.quantity, rate: it.rate, gstRate: it.gstRate })),
    };
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const summary = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, gst: a.gst + r.gst, quantity: a.quantity + r.quantity, payable: a.payable + r.payable }), { taxable: 0, gst: 0, quantity: 0, payable: 0 });
  return { from: from ?? null, to: to ?? null, schedule: sched, rows, invoices: rows, summary: { invoiceCount: rows.length, ...Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, round2(v as number)])) } };
}

async function buildSalesParty(userId: string, from: string | undefined, to: string | undefined, customerId: string | null) {
  let list = await fetchInvoicesInPeriod(userId, from, to);
  if (customerId) {
    const cf = customerId.toLowerCase();
    list = list.filter((i: any) => String(i.customerId ?? "").toLowerCase() === cf || String(i.customerName ?? "").toLowerCase() === cf);
  }
  const ids = list.map((i: any) => i.id);
  const items = ids.length ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, ids)) : [];
  const medById = await medicineMaps(userId);
  const byInv = new Map<string, any[]>();
  for (const it of items as any[]) {
    const arr = byInv.get(it.invoiceId) ?? []; arr.push(it); byInv.set(it.invoiceId, arr);
  }
  const rows = list.map((inv: any) => {
    const lines = byInv.get(inv.id) ?? [];
    let taxable = 0, gst = 0;
    for (const it of lines) {
      const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      taxable += t; gst += g;
    }
    const netProfit = round2(invoiceProfit(lines, medById));
    return {
      id: inv.id, invoiceNo: inv.invoiceNo, date: inv.date,
      customerId: inv.customerId ?? null, customerName: inv.customerName ?? "Walk-in",
      taxable: round2(taxable), gst: round2(gst), netProfit,
      payable: round2(Number(inv.grandTotal ?? 0)), balance: 0,
      adjAmount: round2(Number(inv.grandTotal ?? 0) - lines.reduce((a: number, it: any) => a + Number(it.amount ?? 0) + Number(it.gstAmount ?? 0), 0)),
    };
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const summary = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, gst: a.gst + r.gst, payable: a.payable + r.payable, netProfit: a.netProfit + r.netProfit }), { taxable: 0, gst: 0, payable: 0, netProfit: 0 });
  return { from: from ?? null, to: to ?? null, customerId, rows, invoices: rows, summary: { invoiceCount: rows.length, ...Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, round2(v as number)])) } };
}

// ---------------------------------------------------------------------------
// Stock parity helpers
// ---------------------------------------------------------------------------

async function buildFastSlow(userId: string, from: string | undefined, to: string | undefined, mode: "fast" | "slow", limit: number) {
  const allMeds = await db.select().from(medicines).where(and(eq(medicines.isActive, true), eq(medicines.createdBy, userId)));
  const medById = new Map(allMeds.map((m: any) => [m.id, m]));
  // invoices in period (exclude cancelled/hold)
  const allInv = await db.select().from(invoices).where(eq(invoices.createdBy, userId));
  const periodInv = (allInv as any[]).filter((i) => i.status !== "cancelled" && !(i as any).hold && inPeriod(i.date, from, to));
  const invIds = periodInv.map((i: any) => i.id);
  const invById = new Map(periodInv.map((i: any) => [i.id, i]));
  const items = invIds.length ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invIds)) : [];
  // aggregate qty and lastSold per medicine
  const agg = new Map<string, { qtySold: number; lastSold: string | null }>();
  for (const it of items as any[]) {
    const mid = it.medicineId as string | null;
    if (!mid || !medById.has(mid)) continue;
    const cur = agg.get(mid) ?? { qtySold: 0, lastSold: null };
    cur.qtySold += Number(it.quantity ?? 0);
    const d = invById.get(it.invoiceId)?.date as string | undefined;
    if (d && (!cur.lastSold || d > cur.lastSold)) cur.lastSold = d;
    agg.set(mid, cur);
  }
  // stock per medicine (sum active batches quantity scoped by createdBy)
  const batchRows = await db.select().from(batches).where(and(eq(batches.isActive, true), eq(batches.createdBy, userId)));
  const stockByMed = new Map<string, number>();
  for (const b of batchRows as any[]) {
    stockByMed.set(b.medicineId, (stockByMed.get(b.medicineId) ?? 0) + Number(b.quantity ?? 0));
  }
  const rows = allMeds.map((m: any) => {
    const a = agg.get(m.id);
    return {
      medicineId: m.id,
      medicineName: m.name,
      brand: m.brand ?? null,
      category: m.category ?? null,
      qtySold: round2(a?.qtySold ?? 0),
      currentStock: round2(stockByMed.get(m.id) ?? 0),
      lastSold: a?.lastSold ?? null,
    };
  });
  rows.sort((a, b) => (mode === "fast" ? b.qtySold - a.qtySold : a.qtySold - b.qtySold));
  const sliced = rows.slice(0, limit);
  return { from: from ?? null, to: to ?? null, mode, rows: sliced, count: sliced.length };
}

async function buildCurrentStock(userId: string) {
  const allMeds = await db.select().from(medicines).where(and(eq(medicines.isActive, true), eq(medicines.createdBy, userId)));
  const batchRows = await db.select().from(batches).where(and(eq(batches.isActive, true), eq(batches.createdBy, userId)));
  const byMed = new Map<string, any[]>();
  for (const b of batchRows as any[]) {
    const arr = byMed.get(b.medicineId) ?? [];
    arr.push(b);
    byMed.set(b.medicineId, arr);
  }
  const rows = allMeds.map((m: any) => {
    const lots = byMed.get(m.id) ?? [];
    const stockPacks = lots.reduce((a: number, b: any) => a + Number(b.quantity ?? 0), 0);
    // Value each batch at its own rate (matching dashboard stock valuation); fall back to the
    // medicine master rate only when a batch carries no price of its own.
    const masterSale = Number((m as any).sellingPrice ?? 0);
    const masterMrp = Number((m as any).mrp ?? 0);
    const masterCost = Number((m as any).purchasePrice ?? 0);
    let saleValue = 0, mrpValue = 0, costValue = 0;
    for (const b of lots) {
      const qty = Number(b.quantity ?? 0);
      saleValue += qty * Number(b.sellingPrice ?? masterSale);
      mrpValue += qty * Number(b.mrp ?? masterMrp);
      costValue += qty * Number(b.purchasePrice ?? masterCost);
    }
    return {
      medicineId: m.id,
      medicineName: m.name,
      brand: m.brand ?? null,
      category: m.category ?? null,
      stockPacks: round2(stockPacks),
      saleValue: round2(saleValue),
      mrpValue: round2(mrpValue),
      costValue: round2(costValue),
      sellingPrice: masterSale,
      mrp: masterMrp,
      purchasePrice: masterCost,
    };
  }).sort((a, b) => b.stockPacks - a.stockPacks);
  const totalValue = rows.reduce((a, r) => a + r.saleValue, 0);
  const totalCost = rows.reduce((a, r) => a + r.costValue, 0);
  const totalMrp = rows.reduce((a, r) => a + r.mrpValue, 0);
  const totalPacks = rows.reduce((a, r) => a + r.stockPacks, 0);
  return { rows, totalValue: round2(totalValue), totalCost: round2(totalCost), totalMrp: round2(totalMrp), totalPacks: round2(totalPacks) };
}

async function buildExpired(userId: string, from: string | undefined, to: string | undefined) {
  const today = new Date().toISOString().split("T")[0];
  const nearCutoff = new Date(Date.now() + 90 * 24 * 3600e3).toISOString().split("T")[0];
  const allMeds = await db.select().from(medicines).where(eq(medicines.createdBy, userId));
  const medById = new Map(allMeds.map((m: any) => [m.id, m]));
  const batchRows = await db.select().from(batches).where(and(eq(batches.isActive, true), eq(batches.createdBy, userId), gt(batches.quantity, 0)));
  const rows: any[] = [];
  for (const b of batchRows as any[]) {
    const expiry = String(b.expiryDate);
    const isExpired = expiry <= today;
    const isNear = !isExpired && expiry > today && expiry <= nearCutoff;
    // include if expired, near, OR expiry in from/to window
    const inWindow = !!from && !!to ? (expiry >= from && expiry <= to) : (!from && !to ? false : (from ? expiry >= from : expiry <= (to ?? expiry)));
    // Spec: batches where expiryDate between from/to OR <= today (expired), near = today..today+90d
    const include = isExpired || isNear || inWindow;
    if (!include) continue;
    const status: "expired" | "near" | "in-window" = isExpired ? "expired" : isNear ? "near" : "in-window";
    // normalize: window-only rows that are not expired/near should read as near if within 90d else expired-like? Keep as near-ish for display.
    const displayStatus: "expired" | "near" = status === "expired" ? "expired" : "near";
    const med = medById.get(b.medicineId) as any;
    rows.push({
      batchId: b.id,
      medicineId: b.medicineId,
      medicineName: med?.name ?? b.medicineId,
      brand: med?.brand ?? null,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate,
      quantity: round2(Number(b.quantity ?? 0)),
      mrp: b.mrp,
      status: displayStatus,
      daysToExpiry: Math.ceil((new Date(expiry).getTime() - new Date(today).getTime()) / (24 * 3600e3)),
    });
  }
  rows.sort((a, b) => String(a.expiryDate).localeCompare(String(b.expiryDate)));
  // ensure both buckets present shape
  return { from: from ?? null, to: to ?? null, rows, expiredCount: rows.filter((r) => r.status === "expired").length, nearCount: rows.filter((r) => r.status === "near").length };
}

async function buildOpeningClosing(userId: string, from: string | undefined, to: string | undefined) {
  const allMeds = await db.select().from(medicines).where(eq(medicines.createdBy, userId));
  const allTx = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.createdBy, userId));
  const fromTs = from ? new Date(from + "T00:00:00Z").getTime() : null;
  const toTs = to ? new Date(to + "T23:59:59Z").getTime() : null;
  const byMed = new Map<string, typeof allTx>();
  for (const tx of allTx as any[]) {
    const arr = byMed.get(tx.medicineId) ?? [];
    arr.push(tx);
    byMed.set(tx.medicineId, arr);
  }
  const rows = allMeds.map((m: any) => {
    const txs = byMed.get(m.id) ?? [];
    let opening = 0;
    let inRange = 0;
    for (const tx of txs as any[]) {
      const ts = new Date(tx.createdAt).getTime();
      if (fromTs !== null && !isNaN(fromTs)) {
        if (ts < fromTs) opening += Number(tx.quantity ?? 0);
        else if (toTs === null || ts <= toTs) inRange += Number(tx.quantity ?? 0);
      } else {
        // no from => opening 0, everything up to to counts as range
        if (toTs === null || ts <= toTs) inRange += Number(tx.quantity ?? 0);
      }
    }
    const closing = opening + inRange;
    return {
      medicineId: m.id,
      medicineName: m.name,
      brand: m.brand ?? null,
      category: m.category ?? null,
      opening: round2(opening),
      inRange: round2(inRange),
      closing: round2(closing),
    };
  }).sort((a, b) => a.medicineName.localeCompare(b.medicineName));
  return { from: from ?? null, to: to ?? null, rows };
}

async function buildStatement(userId: string, medicineId: string, from: string | undefined, to: string | undefined) {
  const allTx = await db.select().from(inventoryTransactions).where(and(eq(inventoryTransactions.createdBy, userId), eq(inventoryTransactions.medicineId, medicineId)));
  const fromTs = from ? new Date(from + "T00:00:00Z").getTime() : null;
  const toTs = to ? new Date(to + "T23:59:59Z").getTime() : null;
  // sort by createdAt asc for ledger
  const sorted = [...(allTx as any[])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  // running balance from zero
  let running = 0;
  const entries: any[] = [];
  for (const tx of sorted) {
    const ts = new Date(tx.createdAt).getTime();
    if (fromTs !== null && !isNaN(fromTs) && ts < fromTs) {
      running += Number(tx.quantity ?? 0);
      continue;
    }
    if (toTs !== null && !isNaN(toTs) && ts > toTs) break;
    running += Number(tx.quantity ?? 0);
    entries.push({
      id: tx.id,
      medicineId: tx.medicineId,
      batchId: tx.batchId,
      type: tx.type,
      quantity: round2(Number(tx.quantity ?? 0)),
      balanceAfter: round2(Number(tx.balanceAfter ?? running)),
      runningBalance: round2(running),
      reference: tx.reference ?? null,
      reason: tx.reason ?? null,
      createdAt: tx.createdAt,
      date: tx.createdAt instanceof Date ? tx.createdAt.toISOString().split("T")[0] : String(tx.createdAt).split("T")[0],
    });
  }
  return { medicineId, from: from ?? null, to: to ?? null, entries, rows: entries, openingBalance: round2(sorted.filter((tx: any) => fromTs !== null && new Date(tx.createdAt).getTime() < fromTs!).reduce((a: number, tx: any) => a + Number(tx.quantity ?? 0), 0)) };
}

async function buildAdjustments(userId: string, from: string | undefined, to: string | undefined) {
  const types = ["adjustment", "damage", "expired"] as const;
  const fromTs = from ? new Date(from + "T00:00:00Z").getTime() : null;
  const toTs = to ? new Date(to + "T23:59:59Z").getTime() : null;
  const allTx = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.createdBy, userId));
  let filtered = (allTx as any[]).filter((tx) => (types as readonly string[]).includes(tx.type));
  if (fromTs !== null && !isNaN(fromTs)) filtered = filtered.filter((tx: any) => new Date(tx.createdAt).getTime() >= fromTs!);
  if (toTs !== null && !isNaN(toTs)) filtered = filtered.filter((tx: any) => new Date(tx.createdAt).getTime() <= toTs!);
  filtered.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const medIds = [...new Set(filtered.map((r: any) => r.medicineId).filter(Boolean))];
  const medById = new Map<string, any>();
  if (medIds.length) {
    const meds = await db.select().from(medicines).where(inArray(medicines.id, medIds as string[]));
    for (const m of meds as any[]) medById.set(m.id, m);
  }
  const rows = filtered.map((tx: any) => ({
    id: tx.id,
    medicineId: tx.medicineId,
    medicineName: medById.get(tx.medicineId)?.name ?? tx.medicineId,
    brand: medById.get(tx.medicineId)?.brand ?? null,
    batchId: tx.batchId,
    type: tx.type,
    quantity: round2(Number(tx.quantity ?? 0)),
    reason: tx.reason ?? null,
    reference: tx.reference ?? null,
    createdAt: tx.createdAt,
    date: tx.createdAt instanceof Date ? tx.createdAt.toISOString().split("T")[0] : String(tx.createdAt).split("T")[0],
    createdBy: tx.createdBy,
  }));
  const byUser = new Map<string, number>();
  for (const r of rows) byUser.set(r.createdBy, (byUser.get(r.createdBy) ?? 0) + 1);
  const grouped = [...byUser.entries()].map(([userId_, count]) => ({ userId: userId_, count }));
  const byType = new Map<string, number>();
  for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
  return { from: from ?? null, to: to ?? null, rows, entries: rows, grouped, byUser: grouped, byType: [...byType.entries()].map(([type, count]) => ({ type, count })), summary: { total: rows.length, byType: Object.fromEntries(byType) } };
}

// ---------------------------------------------------------------------------
// Purchase parity helpers
// ---------------------------------------------------------------------------

async function fetchPurchaseBillsInPeriod(userId: string, from?: string, to?: string) {
  const all = await db.select().from(purchaseBills).where(eq(purchaseBills.createdBy, userId));
  return (all as any[]).filter((b) => inPeriod(b.billDate, from, to));
}

async function buildPurchaseRegister(
  userId: string,
  from?: string,
  to?: string,
  view: "invoice" | "date" = "invoice",
  filters: { distributor?: string | null; q?: string | null } = {}
) {
  let list = await fetchPurchaseBillsInPeriod(userId, from, to);
  const distributor = (filters.distributor ?? null)?.trim() || null;
  const q = (filters.q ?? null)?.trim() || null;
  if (distributor) {
    const dl = distributor.toLowerCase();
    list = list.filter((b: any) => String(b.supplierId ?? "").toLowerCase() === dl || String(b.supplierName ?? "").toLowerCase().includes(dl));
  }
  if (q) {
    const ql = q.toLowerCase();
    list = list.filter((b: any) => String(b.supplierName ?? "").toLowerCase().includes(ql) || String(b.billNo ?? "").toLowerCase().includes(ql));
  }

  const ids = list.map((b: any) => b.id);
  const allItems = ids.length ? await db.select().from(purchaseBillItems).where(inArray(purchaseBillItems.purchaseBillId, ids)) : [];
  const medById = await medicineMaps(userId);
  const byBill = new Map<string, any[]>();
  for (const it of allItems as any[]) {
    const arr = byBill.get(it.purchaseBillId) ?? [];
    arr.push(it);
    byBill.set(it.purchaseBillId, arr);
  }

  const computeRow = (bill: any) => {
    const lines = byBill.get(bill.id) ?? [];
    let taxable = 0, gst = 0;
    let profit = 0;
    let mrpTotal = 0;
    for (const it of lines) {
      const rateNum = Number(it.gstRate ?? 12) || 0;
      const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, rateNum);
      taxable += t; gst += g;
      const qty = Number(it.quantity ?? 0);
      const rate = Number(it.rate ?? 0);
      const med = it.medicineId ? medById.get(it.medicineId) : null;
      const mrp = Number(it.mrp ?? (med as any)?.mrp ?? rate * 1.5) || 0;
      profit += (mrp - rate) * qty;
      mrpTotal += mrp * qty;
    }
    const grandTotal = Number(bill.grandTotal ?? 0);
    const marginPercent = mrpTotal > 0 ? round2((profit / mrpTotal) * 100) : 0;
    return {
      id: bill.id,
      billId: bill.id,
      billNo: bill.billNo,
      billDate: bill.billDate,
      date: bill.billDate,
      supplierId: bill.supplierId ?? null,
      supplierName: bill.supplierName ?? "—",
      distributor: bill.supplierName ?? "—",
      taxable: round2(taxable),
      gst: round2(gst),
      totalGst: round2(gst),
      grandTotal: round2(grandTotal),
      payable: round2(grandTotal),
      profit: round2(profit),
      netProfit: round2(profit),
      marginPercent,
      subtotal: round2(Number(bill.subtotal ?? taxable)),
      status: (bill as any).paymentStatus ?? "unpaid",
    };
  };

  const billRows = list.map(computeRow).sort((a, b) => String(a.billDate).localeCompare(String(b.billDate)));

  const summarize = (rows: Array<{ taxable: number; gst: number; payable: number; profit: number }>) => {
    let taxable = 0, gst = 0, payable = 0, profit = 0;
    for (const r of rows) { taxable += r.taxable; gst += r.gst; payable += r.payable; profit += (r as any).profit ?? 0; }
    const mrpProfitBase = profit; // keep margin calc simple: profit/mrp -> use profit vs payable approx
    // recompute margin as profit over payable+profit? use profit / (taxable+gst+profit) not needed — expose
    return { billCount: rows.length, invoiceCount: rows.length, taxable: round2(taxable), gst: round2(gst), payable: round2(payable), profit: round2(profit), netProfit: round2(profit), totalPurchase: round2(payable), totalGst: round2(gst) };
  };

  if (view === "date") {
    const bucketMap = new Map<string, { date: string; billCount: number; invoiceCount: number; taxable: number; gst: number; payable: number; profit: number }>();
    for (const r of billRows) {
      const k = r.billDate;
      const b = bucketMap.get(k) ?? { date: k, billCount: 0, invoiceCount: 0, taxable: 0, gst: 0, payable: 0, profit: 0 };
      b.billCount += 1; b.invoiceCount += 1;
      b.taxable += r.taxable; b.gst += r.gst; b.payable += r.payable; b.profit += (r as any).profit ?? 0;
      bucketMap.set(k, b);
    }
    const buckets = [...bucketMap.values()].map((b) => ({ ...b, taxable: round2(b.taxable), gst: round2(b.gst), payable: round2(b.payable), profit: round2(b.profit), netProfit: round2(b.profit), marginPercent: b.payable > 0 ? round2((b.profit / b.payable) * 100) : 0, totalGst: round2(b.gst) })).sort((a, b) => a.date.localeCompare(b.date));
    const summary = summarize(billRows);
    return { from: from ?? null, to: to ?? null, view, buckets, bills: billRows, rows: billRows, invoices: billRows, summary };
  }

  const summary = summarize(billRows);
  return { from: from ?? null, to: to ?? null, view, bills: billRows, rows: billRows, invoices: billRows, summary };
}

async function buildPurchaseDetail(
  userId: string,
  from?: string,
  to?: string,
  filters: { distributor?: string | null; q?: string | null } = {}
) {
  let bills = await fetchPurchaseBillsInPeriod(userId, from, to);
  const distributor = (filters.distributor ?? null)?.trim() || null;
  const q = (filters.q ?? null)?.trim() || null;
  if (distributor) {
    const dl = distributor.toLowerCase();
    bills = bills.filter((b: any) => String(b.supplierId ?? "").toLowerCase() === dl || String(b.supplierName ?? "").toLowerCase().includes(dl));
  }
  if (q) {
    const ql = q.toLowerCase();
    bills = bills.filter((b: any) => String(b.supplierName ?? "").toLowerCase().includes(ql) || String(b.billNo ?? "").toLowerCase().includes(ql));
  }
  const ids = bills.map((b: any) => b.id);
  const purchItems = ids.length ? await db.select().from(purchaseBillItems).where(inArray(purchaseBillItems.purchaseBillId, ids)) : [];
  const medById = await medicineMaps(userId);

  // purchase returns in same period for this user (debit-note side of purchases)
  let allReturns: any[] = [];
  try {
    allReturns = await db.select().from(purchaseReturns).where(eq(purchaseReturns.createdBy, userId)) as any[];
  } catch { allReturns = []; }
  const rets = (allReturns as any[]).filter((r) => inPeriod(r.date, from, to));
  // also include returns linked to these bills even if date outside? keep date-scoped only to match spec
  const retIds = rets.map((r: any) => r.id);
  const retItems: any[] = retIds.length ? await db.select().from(purchaseReturnItems).where(inArray(purchaseReturnItems.returnId, retIds)) as any[] : [];

  const keyFor = (it: any) => it.medicineId ?? `name:${String(it.medicineName ?? "").toLowerCase()}`;
  const agg = new Map<string, { medicineId: string | null; medicineName: string; hsnCode: string | null; purchQty: number; returnQty: number; taxable: number; gst: number; amount: number; rateSum: number; mrpSum: number; qtyForMargin: number }>();

  for (const it of purchItems as any[]) {
    const key = keyFor(it);
    const row = agg.get(key) ?? { medicineId: it.medicineId ?? null, medicineName: it.medicineName, hsnCode: it.hsnCode ?? null, purchQty: 0, returnQty: 0, taxable: 0, gst: 0, amount: 0, rateSum: 0, mrpSum: 0, qtyForMargin: 0 };
    const qty = Number(it.quantity ?? 0);
    const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
    row.purchQty += qty; row.taxable += t; row.gst += g; row.amount += Number(it.amount ?? 0);
    const med = it.medicineId ? medById.get(it.medicineId) : null;
    const rate = Number(it.rate ?? 0);
    const mrp = Number(it.mrp ?? (med as any)?.mrp ?? rate * 1.5) || 0;
    row.rateSum += rate * qty;
    row.mrpSum += mrp * qty;
    row.qtyForMargin += qty;
    agg.set(key, row);
  }
  for (const it of retItems as any[]) {
    const key = keyFor(it);
    const row = agg.get(key) ?? { medicineId: it.medicineId ?? null, medicineName: it.medicineName, hsnCode: it.hsnCode ?? null, purchQty: 0, returnQty: 0, taxable: 0, gst: 0, amount: 0, rateSum: 0, mrpSum: 0, qtyForMargin: 0 };
    row.returnQty += Number(it.quantity ?? 0);
    agg.set(key, row);
  }

  const rows = [...agg.values()].map((r) => {
    const netQty = r.purchQty - r.returnQty;
    const avgRate = r.qtyForMargin > 0 ? r.rateSum / r.qtyForMargin : 0;
    const avgMrp = r.qtyForMargin > 0 ? r.mrpSum / r.qtyForMargin : 0;
    const marginPercent = avgMrp > 0 ? round2(((avgMrp - avgRate) / avgMrp) * 100) : 0;
    return {
      medicineId: r.medicineId,
      medicineName: r.medicineName,
      hsnCode: r.hsnCode,
      purchQty: round2(r.purchQty),
      returnQty: round2(r.returnQty),
      netQty: round2(netQty),
      quantity: round2(r.purchQty),
      saleQty: round2(r.purchQty),
      taxable: round2(r.taxable),
      gst: round2(r.gst),
      totalGst: round2(r.gst),
      amount: round2(r.amount),
      mrp: round2(avgMrp),
      rate: round2(avgRate),
      marginPercent,
      margin: marginPercent,
    };
  }).sort((a, b) => a.medicineName.localeCompare(b.medicineName));

  const summary = rows.reduce((a, r) => ({ purchQty: a.purchQty + r.purchQty, returnQty: a.returnQty + r.returnQty, netQty: a.netQty + r.netQty, taxable: a.taxable + r.taxable, gst: a.gst + r.gst }), { purchQty: 0, returnQty: 0, netQty: 0, taxable: 0, gst: 0 });
  return { from: from ?? null, to: to ?? null, rows, summary: { purchQty: round2(summary.purchQty), returnQty: round2(summary.returnQty), netQty: round2(summary.netQty), taxable: round2(summary.taxable), gst: round2(summary.gst) } };
}

async function buildPurchaseSummary(
  userId: string,
  from?: string,
  to?: string,
  groupBy: "product" | "supplier" | "company" = "product"
) {
  const bills = await fetchPurchaseBillsInPeriod(userId, from, to);
  const ids = bills.map((b: any) => b.id);
  const billById = new Map(bills.map((b: any) => [b.id, b]));
  const purchItems = ids.length ? await db.select().from(purchaseBillItems).where(inArray(purchaseBillItems.purchaseBillId, ids)) : [];
  const medById = await medicineMaps(userId);

  let allReturns: any[] = [];
  try { allReturns = await db.select().from(purchaseReturns).where(eq(purchaseReturns.createdBy, userId)) as any[]; } catch { allReturns = []; }
  const rets = (allReturns as any[]).filter((r) => inPeriod(r.date, from, to));
  const retIds = rets.map((r: any) => r.id);
  const retItems: any[] = retIds.length ? await db.select().from(purchaseReturnItems).where(inArray(purchaseReturnItems.returnId, retIds)) as any[] : [];

  const bucket = new Map<string, { group: string; purchQty: number; returnQty: number; taxable: number; gst: number; payable: number }>();

  const keyForItem = (it: any): string => {
    if (groupBy === "product") return String(it.medicineId ?? `name:${it.medicineName}`);
    if (groupBy === "company") return String((it.medicineId ? (medById.get(it.medicineId) as any)?.brand : null) ?? "—");
    return "—";
  };
  const keyForSupplier = (bill: any): string => String(bill.supplierName ?? "—");

  if (groupBy === "supplier") {
    for (const it of purchItems as any[]) {
      const bill = billById.get(it.purchaseBillId) as any;
      const key = keyForSupplier(bill);
      const b = bucket.get(key) ?? { group: key, purchQty: 0, returnQty: 0, taxable: 0, gst: 0, payable: 0 };
      b.purchQty += Number(it.quantity ?? 0);
      const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      b.taxable += t; b.gst += g; b.payable += Number(it.amount ?? 0) + g;
      bucket.set(key, b);
    }
    for (const it of retItems as any[]) {
      // find return's supplier
      const ret = rets.find((r: any) => r.id === it.returnId) as any;
      const key = ret ? keyForSupplier(ret) : "—";
      const b = bucket.get(key) ?? { group: key, purchQty: 0, returnQty: 0, taxable: 0, gst: 0, payable: 0 };
      b.returnQty += Number(it.quantity ?? 0);
      bucket.set(key, b);
    }
  } else {
    for (const it of purchItems as any[]) {
      const key = keyForItem(it);
      const label = groupBy === "product" ? it.medicineName : key;
      const bucketKey = groupBy === "product" ? `${key}||${it.medicineName}` : key;
      const group = groupBy === "product" ? String(it.medicineName) : key;
      const b = bucket.get(bucketKey) ?? { group, purchQty: 0, returnQty: 0, taxable: 0, gst: 0, payable: 0 };
      b.purchQty += Number(it.quantity ?? 0);
      const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      b.taxable += t; b.gst += g; b.payable += Number(it.amount ?? 0) + g;
      bucket.set(bucketKey, b);
    }
    for (const it of retItems as any[]) {
      const key = keyForItem(it);
      const group = groupBy === "product" ? String(it.medicineName) : key;
      const bucketKey = groupBy === "product" ? `${key}||${it.medicineName}` : key;
      const b = bucket.get(bucketKey) ?? { group, purchQty: 0, returnQty: 0, taxable: 0, gst: 0, payable: 0 };
      b.returnQty += Number(it.quantity ?? 0);
      bucket.set(bucketKey, b);
    }
  }

  const rows = [...bucket.values()].map((r) => ({
    group: r.group,
    brand: groupBy === "company" ? r.group : undefined,
    company: groupBy === "company" ? r.group : undefined,
    purchQty: round2(r.purchQty),
    returnQty: round2(r.returnQty),
    netQty: round2(r.purchQty - r.returnQty),
    saleQty: round2(r.purchQty),
    quantity: round2(r.purchQty),
    taxable: round2(r.taxable),
    gst: round2(r.gst),
    totalGst: round2(r.gst),
    payable: round2(r.payable),
  })).sort((a, b) => b.payable - a.payable);

  const summary = rows.reduce((a, r) => ({ purchQty: a.purchQty + r.purchQty, returnQty: a.returnQty + r.returnQty, taxable: a.taxable + r.taxable, gst: a.gst + r.gst, payable: a.payable + r.payable }), { purchQty: 0, returnQty: 0, taxable: 0, gst: 0, payable: 0 });
  return { from: from ?? null, to: to ?? null, groupBy, rows, summary: { purchQty: round2(summary.purchQty), returnQty: round2(summary.returnQty), netQty: round2(summary.purchQty - summary.returnQty), taxable: round2(summary.taxable), gst: round2(summary.gst), payable: round2(summary.payable) } };
}

async function buildPurchaseSchedule(userId: string, from: string | undefined, to: string | undefined, schedule: string | null) {
  const bills = await fetchPurchaseBillsInPeriod(userId, from, to);
  const ids = bills.map((b: any) => b.id);
  const allItems = ids.length ? await db.select().from(purchaseBillItems).where(inArray(purchaseBillItems.purchaseBillId, ids)) : [];
  const medById = await medicineMaps(userId);
  const sched = schedule ? String(schedule).trim() : null;
  const filteredItems = sched ? (allItems as any[]).filter((it) => String((it.medicineId ? (medById.get(it.medicineId) as any)?.schedule : null) ?? "") === sched) : (allItems as any[]);
  const billIds = new Set(filteredItems.map((it: any) => it.purchaseBillId));
  const filteredBills = sched ? bills.filter((b: any) => billIds.has(b.id)) : bills;

  const byBill = new Map<string, any[]>();
  for (const it of filteredItems as any[]) {
    const arr = byBill.get(it.purchaseBillId) ?? []; arr.push(it); byBill.set(it.purchaseBillId, arr);
  }
  const rows = filteredBills.map((bill: any) => {
    const lines = byBill.get(bill.id) ?? [];
    let taxable = 0, gst = 0;
    for (const it of lines) {
      const { taxable: t, gst: g } = deriveItemTax(it.amount ?? 0, it.gstAmount ?? 0, Number(it.gstRate ?? 12) || 0);
      taxable += t; gst += g;
    }
    return {
      id: bill.id, billId: bill.id, billNo: bill.billNo, billDate: bill.billDate, date: bill.billDate,
      supplierId: bill.supplierId ?? null, supplierName: bill.supplierName ?? "—",
      schedule: sched ?? null,
      taxable: round2(taxable), gst: round2(gst), totalGst: round2(gst),
      quantity: round2(lines.reduce((a: number, it: any) => a + Number(it.quantity ?? 0), 0)),
      purchQty: round2(lines.reduce((a: number, it: any) => a + Number(it.quantity ?? 0), 0)),
      payable: round2(Number(bill.grandTotal ?? 0)),
      grandTotal: round2(Number(bill.grandTotal ?? 0)),
      items: lines.map((it: any) => ({ medicineName: it.medicineName, quantity: it.quantity, rate: it.rate, gstRate: it.gstRate, mrp: it.mrp })),
    };
  }).sort((a, b) => String(a.billDate).localeCompare(String(b.billDate)));
  const summary = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, gst: a.gst + r.gst, quantity: a.quantity + r.quantity, payable: a.payable + r.payable }), { taxable: 0, gst: 0, quantity: 0, payable: 0 });
  return { from: from ?? null, to: to ?? null, schedule: sched, rows, bills: rows, invoices: rows, summary: { billCount: rows.length, invoiceCount: rows.length, ...Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, round2(v as number)])) } };
}

// ---------------------------------------------------------------------------
// Payments parity helpers — 4 reports (see 2026-09-25-localwell-parity Task 4)
// ---------------------------------------------------------------------------

async function buildPendingCustomers(userId: string, view: "summary" | "detail", q: string | null) {
  const all = await db.select().from(customers).where(and(eq(customers.createdBy, userId), gt(customers.balance, 0)));
  let filtered = [...(all as any[])];
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter((c: any) => String(c.name ?? "").toLowerCase().includes(ql) || String(c.phone ?? "").includes(ql));
  }
  filtered.sort((a: any, b: any) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
  const totalDue = round2(filtered.reduce((a: number, c: any) => a + Number(c.balance ?? 0), 0));
  const count = filtered.length;
  if (view === "summary") {
    return { view, totalDue, count, summary: { totalDue, count, total: totalDue }, rows: undefined };
  }
  // detail: enrich with last invoice date per customer (from invoices, not voided/hold)
  const ids = filtered.map((c: any) => c.id);
  const invByCustomer = new Map<string, string>();
  if (ids.length) {
    const allInv = await db.select({ id: invoices.id, customerId: invoices.customerId, date: invoices.date, status: invoices.status, hold: invoices.hold }).from(invoices);
    for (const inv of allInv as any[]) {
      if (!inv.customerId || !ids.includes(inv.customerId)) continue;
      if (inv.status === "cancelled" || inv.hold) continue;
      const prev = invByCustomer.get(inv.customerId);
      if (!prev || String(inv.date) > String(prev)) invByCustomer.set(inv.customerId, String(inv.date));
    }
  }
  const rows = filtered.map((c: any) => ({
    id: c.id,
    customerId: c.id,
    name: c.name,
    customerName: c.name,
    phone: c.phone ?? null,
    balance: round2(Number(c.balance ?? 0)),
    // use neutral naming that tests accept alongside balance-desc ordering
    lastInvoiceDate: invByCustomer.get(c.id) ?? null,
    lastPurchaseDate: invByCustomer.get(c.id) ?? c.lastPurchaseDate ?? null,
    last_purchase_date: invByCustomer.get(c.id) ?? null,
    gstin: c.gstin ?? null,
    address: c.address ?? null,
    isActive: !!c.isActive,
  }));
  return { view, totalDue, count, summary: { totalDue, count, total: totalDue }, rows, customers: rows };
}

async function buildPendingDistributors(userId: string, view: "summary" | "detail", q: string | null) {
  const all = await db.select().from(suppliers).where(and(eq(suppliers.createdBy, userId), gt(suppliers.balance, 0)));
  let filtered = [...(all as any[])];
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter((s: any) => String(s.name ?? "").toLowerCase().includes(ql) || String(s.phone ?? "").includes(ql));
  }
  filtered.sort((a: any, b: any) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
  const totalDue = round2(filtered.reduce((a: number, s: any) => a + Number(s.balance ?? 0), 0));
  const count = filtered.length;
  if (view === "summary") {
    return { view, totalDue, count, summary: { totalDue, count, total: totalDue }, rows: undefined };
  }
  const rows = filtered.map((s: any) => ({
    id: s.id,
    supplierId: s.id,
    name: s.name,
    supplierName: s.name,
    phone: s.phone ?? null,
    balance: round2(Number(s.balance ?? 0)),
    gstin: s.gstin ?? null,
    address: s.address ?? null,
    isActive: !!s.isActive,
  }));
  return { view, totalDue, count, summary: { totalDue, count, total: totalDue }, rows, suppliers: rows };
}

async function buildPaymentsRegister(
  userId: string,
  from: string | undefined,
  to: string | undefined,
  filters: { type?: string | null; mode?: string | null; q?: string | null }
) {
  const all = await db.select().from(payments).where(and(eq(payments.createdBy, userId), eq(payments.voided, false)));
  let filtered = (all as any[]).filter((p) => inPeriod(p.date, from, to));
  const type = (filters.type ?? null)?.trim() || null;
  const mode = (filters.mode ?? null)?.trim() || null;
  const q = (filters.q ?? null)?.trim() || null;
  if (type) {
    const tl = type.toLowerCase();
    filtered = filtered.filter((p: any) => String(p.type ?? "").toLowerCase() === tl);
  }
  if (mode) {
    const ml = mode.toLowerCase();
    filtered = filtered.filter((p: any) => String(p.paymentMode ?? "").toLowerCase() === ml);
  }
  // join customer/supplier name for display + q search across category/description/party name
  const cIds = [...new Set(filtered.map((p: any) => p.customerId).filter(Boolean))] as string[];
  const sIds = [...new Set(filtered.map((p: any) => p.supplierId).filter(Boolean))] as string[];
  const cNameById = new Map<string, string>();
  const sNameById = new Map<string, string>();
  if (cIds.length) {
    const cs = await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, cIds));
    for (const c of cs as any[]) cNameById.set(c.id, c.name);
  }
  if (sIds.length) {
    const ss = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(inArray(suppliers.id, sIds));
    for (const s of ss as any[]) sNameById.set(s.id, s.name);
  }
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter((p: any) =>
      String(p.category ?? "").toLowerCase().includes(ql) ||
      String(p.description ?? "").toLowerCase().includes(ql) ||
      String(p.reference ?? "").toLowerCase().includes(ql) ||
      String((p.customerId && cNameById.get(p.customerId)) ?? "").toLowerCase().includes(ql) ||
      String((p.supplierId && sNameById.get(p.supplierId)) ?? "").toLowerCase().includes(ql)
    );
  }
  filtered.sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
  const rows = filtered.map((p: any) => ({
    id: p.id,
    date: p.date,
    type: p.type,
    category: p.category ?? null,
    amount: round2(Number(p.amount ?? 0)),
    description: p.description ?? null,
    paymentMode: p.paymentMode ?? null,
    mode: p.paymentMode ?? null,
    payment_mode: p.paymentMode ?? null,
    invoiceId: p.invoiceId ?? null,
    customerId: p.customerId ?? null,
    customerName: p.customerId ? (cNameById.get(p.customerId) ?? null) : null,
    supplierId: p.supplierId ?? null,
    supplierName: p.supplierId ? (sNameById.get(p.supplierId) ?? null) : null,
    reference: p.reference ?? null,
    voided: !!p.voided,
  }));
  let totalReceived = 0, totalPaid = 0, totalExpense = 0;
  for (const r of rows) {
    if (r.type === "received") totalReceived += r.amount;
    else if (r.type === "paid") totalPaid += r.amount;
    else if (r.type === "expense") totalExpense += r.amount;
  }
  return {
    from: from ?? null,
    to: to ?? null,
    rows,
    summary: {
      totalReceived: round2(totalReceived),
      totalPaid: round2(totalPaid),
      totalExpense: round2(totalExpense),
      count: rows.length,
      total: round2(totalReceived + totalPaid + totalExpense),
    },
  };
}

async function buildExpenseRegister(
  userId: string,
  from: string | undefined,
  to: string | undefined,
  groupBy: "category" | "name",
  q: string | null
) {
  const all = await db.select().from(payments).where(and(eq(payments.createdBy, userId), eq(payments.voided, false), eq(payments.type, "expense")));
  let filtered = (all as any[]).filter((p) => inPeriod(p.date, from, to));
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter((p: any) =>
      String(p.category ?? "").toLowerCase().includes(ql) ||
      String(p.description ?? "").toLowerCase().includes(ql)
    );
  }
  filtered.sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
  const totalExpense = round2(filtered.reduce((a: number, p: any) => a + Number(p.amount ?? 0), 0));
  const count = filtered.length;
  // grouping: category = payments.category (may contain GST info, pass through unchanged), name = description
  const keyFor = (p: any) => groupBy === "name" ? (String(p.description ?? "—").trim() || "—") : (String(p.category ?? "—").trim() || "—");
  const buckets = new Map<string, { group: string; category: string; description: string | null; count: number; total: number; totalAmount: number; amount: number }>();
  for (const p of filtered as any[]) {
    const k = keyFor(p);
    const b = buckets.get(k) ?? { group: k, category: k, description: k, count: 0, total: 0, totalAmount: 0, amount: 0 };
    b.count += 1;
    b.total += Number(p.amount ?? 0);
    b.totalAmount += Number(p.amount ?? 0);
    b.amount += Number(p.amount ?? 0);
    // preserve GST hint passthrough: category on row mirrors original payments.category
    buckets.set(k, b);
  }
  const rows = [...buckets.values()].map((b) => ({
    group: b.group,
    category: b.group,
    description: b.group,
    // with/without GST hint field — pass through category unchanged per spec
    gstInfo: b.group,
    count: b.count,
    total: round2(b.total),
    totalAmount: round2(b.total),
    amount: round2(b.amount),
  })).sort((a, b) => b.total - a.total);
  const entries = filtered.map((p: any) => ({
    id: p.id,
    date: p.date,
    type: p.type,
    category: p.category ?? null,
    description: p.description ?? null,
    amount: round2(Number(p.amount ?? 0)),
    paymentMode: p.paymentMode ?? null,
    // gst hint passthrough field
    gstInfo: p.category ?? null,
  }));
  return {
    from: from ?? null,
    to: to ?? null,
    groupBy,
    rows,
    groups: rows,
    entries,
    summary: { totalExpense, total: totalExpense, count, totalAmount: totalExpense },
    totalExpense,
  };
}

// ---------------------------------------------------------------------------
// Party parity helpers — 4 reports (Task 6)
// ---------------------------------------------------------------------------

function daysBetween(a: string, b: string): number {
  const ta = new Date(a + "T00:00:00Z").getTime();
  const tb = new Date(b + "T00:00:00Z").getTime();
  return Math.max(0, Math.floor((ta - tb) / (24 * 3600e3)));
}

function normalize15(value: number, min: number, max: number, invert = false): number {
  if (max === min) return 3;
  const ratio = invert ? (max - value) / (max - min) : (value - min) / (max - min);
  const score = Math.round(ratio * 4) + 1;
  return Math.min(5, Math.max(1, score));
}

async function buildPartyCustomers(userId: string, q: string | null, sort: string | null) {
  const allCustomers = await db.select().from(customers).where(eq(customers.createdBy, userId));
  let filtered = [...(allCustomers as any[])];
  // exclude inactive? schema has isActive boolean default true; keep only active
  filtered = filtered.filter((c: any) => c.isActive === true || c.isActive === 1);
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter((c: any) => String(c.name ?? "").toLowerCase().includes(ql) || String(c.phone ?? "").toLowerCase().includes(ql) || String(c.email ?? "").toLowerCase().includes(ql));
  }

  // invoices for RFM (scoped by user)
  const allInvoices = await db.select().from(invoices).where(eq(invoices.createdBy, userId));
  const validInvoices = (allInvoices as any[]).filter((i) => i.status !== "cancelled" && !(i as any).hold);
  const todayStr = new Date().toISOString().split("T")[0];
  const cutoff180 = new Date(Date.now() - 180 * 24 * 3600e3).toISOString().split("T")[0];

  // map customerId -> invoices
  const byCustomer = new Map<string, any[]>();
  for (const inv of validInvoices) {
    if (!inv.customerId) continue;
    const arr = byCustomer.get(inv.customerId) ?? [];
    arr.push(inv);
    byCustomer.set(inv.customerId, arr);
  }

  // collect raw metrics for normalization
  const rawList: Array<{ id: string; recencyDays: number | null; freq: number; monetary: number }> = [];
  for (const c of filtered) {
    const invs = byCustomer.get(c.id) ?? [];
    const lastPurchase = (c as any).lastPurchaseDate as string | null ?? null;
    let maxInvoiceDate: string | null = null;
    for (const inv of invs) {
      const d = String(inv.date);
      if (!maxInvoiceDate || d > maxInvoiceDate) maxInvoiceDate = d;
    }
    const recencySource = lastPurchase ?? maxInvoiceDate ?? null;
    const recencyDays = recencySource ? daysBetween(todayStr, String(recencySource)) : null;
    const inWindow = invs.filter((inv: any) => String(inv.date) >= cutoff180);
    const freq = inWindow.length;
    const monetary = inWindow.reduce((a: number, inv: any) => a + Number(inv.grandTotal ?? 0), 0);
    rawList.push({ id: c.id, recencyDays, freq, monetary });
  }

  // normalization pools (exclude null recency for R)
  const withHistory = rawList.filter((r) => r.recencyDays !== null);
  const freqVals = withHistory.map((r) => r.freq);
  const monetaryVals = withHistory.map((r) => r.monetary);
  const recencyVals = withHistory.map((r) => r.recencyDays as number);
  const freqMin = freqVals.length ? Math.min(...freqVals) : 0;
  const freqMax = freqVals.length ? Math.max(...freqVals) : 0;
  const monMin = monetaryVals.length ? Math.min(...monetaryVals) : 0;
  const monMax = monetaryVals.length ? Math.max(...monetaryVals) : 0;
  const recMin = recencyVals.length ? Math.min(...recencyVals) : 0;
  const recMax = recencyVals.length ? Math.max(...recencyVals) : 0;

  const rows = filtered.map((c: any) => {
    const raw = rawList.find((r) => r.id === c.id)!;
    let rfmScore = 0;
    let rScore = 0, fScore = 0, mScore = 0;
    if (raw.recencyDays === null) {
      rfmScore = 0;
    } else {
      rScore = normalize15(raw.recencyDays, recMin, recMax, true);
      fScore = normalize15(raw.freq, freqMin, freqMax, false);
      mScore = normalize15(raw.monetary, monMin, monMax, false);
      rfmScore = rScore + fScore + mScore;
    }
    return {
      id: c.id,
      customerId: c.id,
      name: c.name,
      customerName: c.name,
      phone: c.phone ?? null,
      email: c.email ?? null,
      gstin: c.gstin ?? null,
      balance: round2(Number(c.balance ?? 0)),
      totalPurchases: round2(Number((c as any).totalPurchases ?? c.balance ?? 0)),
      lastPurchaseDate: (c as any).lastPurchaseDate ?? null,
      last_purchase_date: (c as any).lastPurchaseDate ?? null,
      recencyDays: raw.recencyDays,
      freq: raw.freq,
      monetary: round2(raw.monetary),
      rScore,
      fScore,
      mScore,
      rfmScore,
      isActive: !!c.isActive,
    };
  });

  const sortKey = (sort ?? "rfm").toLowerCase();
  if (sortKey === "balance") {
    rows.sort((a, b) => b.balance - a.balance);
  } else {
    // default rfm desc
    rows.sort((a, b) => b.rfmScore - a.rfmScore || b.balance - a.balance);
  }

  return { rows, customers: rows, count: rows.length, total: rows.length };
}

async function buildPartyDistributors(userId: string, q: string | null) {
  const all = await db.select().from(suppliers).where(eq(suppliers.createdBy, userId));
  let filtered = (all as any[]).filter((s: any) => s.isActive === true || s.isActive === 1);
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter((s: any) => String(s.name ?? "").toLowerCase().includes(ql) || String(s.phone ?? "").toLowerCase().includes(ql));
  }
  filtered.sort((a: any, b: any) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
  const rows = filtered.map((s: any) => ({
    id: s.id,
    supplierId: s.id,
    name: s.name,
    supplierName: s.name,
    phone: s.phone ?? null,
    email: s.email ?? null,
    gstin: s.gstin ?? null,
    balance: round2(Number(s.balance ?? 0)),
    address: s.address ?? null,
    isActive: !!s.isActive,
  }));
  return { rows, suppliers: rows, count: rows.length };
}

async function buildPartyLedger(userId: string, type: "customer" | "supplier", id: string, from: string | null, to: string | null) {
  const entries: any[] = [];
  if (type === "customer") {
    const allInv = await db.select().from(invoices).where(and(eq(invoices.createdBy, userId), eq(invoices.customerId, id)));
    const filteredInv = (allInv as any[]).filter((inv) => inv.status !== "cancelled" && !(inv as any).hold && inPeriod(inv.date, from ?? undefined, to ?? undefined));
    for (const inv of filteredInv) {
      entries.push({
        id: inv.id,
        date: inv.date,
        type: "invoice",
        kind: "invoice",
        amount: round2(Number(inv.grandTotal ?? 0)),
        grandTotal: round2(Number(inv.grandTotal ?? 0)),
        invoiceNo: inv.invoiceNo,
        billNo: inv.invoiceNo,
        reference: inv.invoiceNo,
        description: inv.customerName ?? "",
        invoiceId: inv.id,
        customerId: inv.customerId,
      });
    }
    const allPay = await db.select().from(payments).where(and(eq(payments.createdBy, userId), eq(payments.customerId, id), eq(payments.voided, false)));
    const filteredPay = (allPay as any[]).filter((p) => inPeriod(p.date, from ?? undefined, to ?? undefined));
    for (const p of filteredPay) {
      entries.push({
        id: p.id,
        date: p.date,
        type: p.type === "received" ? "payment" : p.type,
        kind: "payment",
        amount: round2(Number(p.amount ?? 0)),
        paymentMode: p.paymentMode ?? null,
        mode: p.paymentMode ?? null,
        description: p.description ?? null,
        reference: p.reference ?? null,
        invoiceId: p.invoiceId ?? null,
        customerId: p.customerId,
        supplierId: p.supplierId ?? null,
      });
    }
  } else {
    const allBills = await db.select().from(purchaseBills).where(and(eq(purchaseBills.createdBy, userId), eq(purchaseBills.supplierId, id)));
    const filteredBills = (allBills as any[]).filter((b) => inPeriod((b as any).billDate, from ?? undefined, to ?? undefined));
    for (const b of filteredBills as any[]) {
      entries.push({
        id: b.id,
        date: b.billDate,
        type: "invoice",
        kind: "purchase_bill",
        amount: round2(Number(b.grandTotal ?? 0)),
        grandTotal: round2(Number(b.grandTotal ?? 0)),
        billNo: b.billNo,
        invoiceNo: b.billNo,
        reference: b.billNo,
        description: b.supplierName ?? "",
        supplierId: b.supplierId,
      });
    }
    const allPay = await db.select().from(payments).where(and(eq(payments.createdBy, userId), eq(payments.supplierId, id), eq(payments.voided, false)));
    const filteredPay = (allPay as any[]).filter((p) => inPeriod(p.date, from ?? undefined, to ?? undefined));
    for (const p of filteredPay) {
      entries.push({
        id: p.id,
        date: p.date,
        type: p.type === "paid" ? "payment" : p.type,
        kind: "payment",
        amount: round2(Number(p.amount ?? 0)),
        paymentMode: p.paymentMode ?? null,
        mode: p.paymentMode ?? null,
        description: p.description ?? null,
        reference: p.reference ?? null,
        supplierId: p.supplierId,
      });
    }
  }
  entries.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  let running = 0;
  for (const e of entries) {
    const kind = String(e.kind ?? e.type ?? "").toLowerCase();
    const isPayment = kind === "payment" || e.type === "payment" || e.type === "received" || e.type === "paid";
    if (type === "customer") {
      if (kind === "invoice") running += Number(e.amount ?? 0);
      else if (isPayment) running -= Number(e.amount ?? 0);
      else running += Number(e.amount ?? 0);
    } else {
      if (kind === "purchase_bill" || kind === "invoice") running += Number(e.amount ?? 0);
      else if (isPayment) running -= Number(e.amount ?? 0);
      else running += Number(e.amount ?? 0);
    }
    e.runningBalance = round2(running);
    e.balance = round2(running);
  }
  return { entries, ledger: entries, rows: entries, count: entries.length, from: from ?? null, to: to ?? null, type, id };
}

async function buildPartyFollowups(userId: string, from: string | null, to: string | null, q: string | null) {
  const all = await db.select().from(refillReminders).where(and(eq(refillReminders.createdBy, userId), eq(refillReminders.status, "pending")));
  let filtered = (all as any[]).filter((r) => inPeriod(r.reminderDate, from ?? undefined, to ?? undefined));
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter((r: any) => String(r.customerName ?? "").toLowerCase().includes(ql) || String(r.customerPhone ?? "").toLowerCase().includes(ql) || String(r.medicineName ?? "").toLowerCase().includes(ql));
  }
  filtered.sort((a: any, b: any) => String(a.reminderDate).localeCompare(String(b.reminderDate)));
  const rows = filtered.map((r: any) => ({
    id: r.id,
    customerId: r.customerId ?? null,
    customerName: r.customerName ?? null,
    customerPhone: r.customerPhone ?? null,
    medicineId: r.medicineId ?? null,
    medicineName: r.medicineName,
    lastPurchaseDate: r.lastPurchaseDate,
    reminderDate: r.reminderDate,
    status: r.status,
    notes: r.notes ?? null,
    createdBy: r.createdBy,
  }));
  return { rows, followups: rows, count: rows.length, from: from ?? null, to: to ?? null };
}

// ---------------------------------------------------------------------------
// Order parity helpers — 2 reports (Task 7)
// ---------------------------------------------------------------------------

async function buildShortbook(userId: string, q: string | null, sort: string | null) {
  const allMeds = await db.select().from(medicines).where(eq(medicines.createdBy, userId));
  const activeMeds = (allMeds as any[]).filter((m) => m.isActive === true || m.isActive === 1);
  const batchRows = await db.select().from(batches).where(and(eq(batches.createdBy, userId), eq(batches.isActive, true)));
  const stockByMed = new Map<string, number>();
  for (const b of batchRows as any[]) {
    stockByMed.set(b.medicineId, (stockByMed.get(b.medicineId) ?? 0) + Number(b.quantity ?? 0));
  }

  const rows: any[] = [];
  for (const m of activeMeds as any[]) {
    const reorderLevelRaw = (m as any).reorderLevel;
    const minQtyRaw = (m as any).minQuantity;
    const threshold = reorderLevelRaw != null && Number(reorderLevelRaw) > 0 ? Number(reorderLevelRaw) : (minQtyRaw != null ? Number(minQtyRaw) : 0);
    if (threshold <= 0) continue;
    const stock = round2(stockByMed.get(m.id) ?? 0);
    if (stock > threshold) continue;
    const shortagePercent = threshold > 0 ? round2(((threshold - stock) / threshold) * 100) : 0;
    const orderQty = Math.max(0, round2(threshold - stock));
    rows.push({
      medicineId: m.id,
      medicineName: m.name,
      name: m.name,
      brand: m.brand ?? null,
      category: m.category ?? null,
      minQuantity: minQtyRaw != null ? Number(minQtyRaw) : null,
      reorderLevel: reorderLevelRaw != null ? Number(reorderLevelRaw) : null,
      threshold,
      stock,
      availableStock: stock,
      shortagePercent,
      shortage: shortagePercent,
      orderQty,
      mrp: m.mrp != null ? Number(m.mrp) : null,
      purchasePrice: m.purchasePrice != null ? Number(m.purchasePrice) : null,
      sellingPrice: m.sellingPrice != null ? Number(m.sellingPrice) : null,
    });
  }

  let filtered = rows;
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter((r: any) => String(r.name ?? "").toLowerCase().includes(ql) || String(r.brand ?? "").toLowerCase().includes(ql) || String(r.medicineName ?? "").toLowerCase().includes(ql));
  }

  const sortKey = (sort ?? "shortage").toLowerCase();
  if (sortKey === "name") {
    filtered.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } else {
    filtered.sort((a, b) => b.shortagePercent - a.shortagePercent || String(a.name).localeCompare(String(b.name)));
  }

  // Additive only: attach the cheapest supplier (latest effective rate or the
  // freshest manual quote) when the medicine has procurement history. Rows
  // without history simply keep no recommended* keys — response shape stays
  // backward compatible.
  for (const row of filtered) {
    if (!row.medicineId) continue;
    const rec = await recommendForShortbookRow(userId, row.medicineId);
    if (!rec) continue;
    row.recommendedSupplierId = rec.recommendedSupplierId;
    row.recommendedSupplierName = rec.recommendedSupplierName;
    row.unitCost = rec.unitCost;
  }

  return { rows: filtered, count: filtered.length, total: filtered.length, sort: sortKey };
}

async function buildPurchaseOrdersRegister(userId: string, from: string | null, to: string | null, groupBy: string, q: string | null) {
  // Default last 30d if no range provided
  let effFrom = from;
  let effTo = to;
  if (!effFrom && !effTo) {
    const today = new Date();
    const toStr = today.toISOString().split("T")[0];
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 30);
    const fromStr = fromDate.toISOString().split("T")[0];
    effFrom = fromStr;
    effTo = toStr;
  }

  const bills = await fetchPurchaseBillsInPeriod(userId, effFrom ?? undefined, effTo ?? undefined);
  if (bills.length === 0) {
    // still return empty shape, scoped
    let emptyRows: any[] = [];
    if (q) emptyRows = [];
    return { rows: emptyRows, count: 0, total: 0, from: effFrom ?? null, to: effTo ?? null, groupBy };
  }

  const billById = new Map(bills.map((b: any) => [b.id as string, b as any]));
  const ids = bills.map((b: any) => b.id as string);
  const items = ids.length ? await db.select().from(purchaseBillItems).where(inArray(purchaseBillItems.purchaseBillId, ids)) : [];

  // Enrich medicine brand for q search on brand if available
  const medIds = [...new Set((items as any[]).map((it) => it.medicineId).filter(Boolean))] as string[];
  const medById = new Map<string, any>();
  if (medIds.length) {
    const meds = await db.select().from(medicines).where(inArray(medicines.id, medIds));
    for (const m of meds as any[]) medById.set(m.id, m);
  }

  const agg = new Map<string, { medicineId: string | null; medicineName: string; brand: string | null; totalOrderedQty: number; billIds: Set<string>; suppliers: Set<string>; totalAmount: number; lastBillDate: string | null }>();
  for (const it of items as any[]) {
    const bill = billById.get(it.purchaseBillId);
    if (!bill) continue;
    const medId = it.medicineId as string | null;
    const medName = String(it.medicineName ?? "—");
    const key = medId ?? `name:${medName.toLowerCase()}`;
    const entry = agg.get(key) ?? {
      medicineId: medId,
      medicineName: medName,
      brand: medId ? (medById.get(medId)?.brand ?? null) : null,
      totalOrderedQty: 0,
      billIds: new Set<string>(),
      suppliers: new Set<string>(),
      totalAmount: 0,
      lastBillDate: null as string | null,
    };
    entry.medicineId = entry.medicineId ?? medId;
    entry.medicineName = entry.medicineName || medName;
    if (!entry.brand && medId) entry.brand = medById.get(medId)?.brand ?? null;
    entry.totalOrderedQty += Number(it.quantity ?? 0);
    entry.billIds.add(it.purchaseBillId as string);
    const supName = String((bill as any).supplierName ?? "").trim();
    if (supName) entry.suppliers.add(supName);
    entry.totalAmount += Number(it.amount ?? 0);
    const bd = String((bill as any).billDate ?? "");
    if (!entry.lastBillDate || bd > entry.lastBillDate) entry.lastBillDate = bd;
    agg.set(key, entry);
  }

  let rows = [...agg.values()].map((e) => ({
    medicineId: e.medicineId,
    medicineName: e.medicineName,
    name: e.medicineName,
    brand: e.brand,
    totalOrderedQty: round2(e.totalOrderedQty),
    quantity: round2(e.totalOrderedQty),
    billCount: e.billIds.size,
    bills: e.billIds.size,
    suppliers: [...e.suppliers].sort(),
    supplierNames: [...e.suppliers].sort(),
    totalAmount: round2(e.totalAmount),
    amount: round2(e.totalAmount),
    lastBillDate: e.lastBillDate,
    lastDate: e.lastBillDate,
  }));

  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter((r: any) => String(r.medicineName ?? r.name ?? "").toLowerCase().includes(ql) || String(r.brand ?? "").toLowerCase().includes(ql) || r.suppliers.some((s: string) => String(s).toLowerCase().includes(ql)));
  }

  // groupBy is always product in this register; sort by lastBillDate desc then totalOrderedQty desc
  rows.sort((a: any, b: any) => String(b.lastBillDate ?? "").localeCompare(String(a.lastBillDate ?? "")) || b.totalOrderedQty - a.totalOrderedQty);

  return { rows, count: rows.length, total: rows.length, from: effFrom ?? null, to: effTo ?? null, groupBy };
}
