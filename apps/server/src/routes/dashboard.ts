import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  invoices, invoiceItems, batches, medicines, customers, suppliers, payments, refillReminders, inventoryTransactions, backupHistory, purchaseBills,
} from "../db/schema/index.js";
import { eq, and, desc, sql, gt, asc, lt, lte, gte } from "drizzle-orm";
import { authGuard } from "../plugins/auth.js";

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get("/kpis", { preHandler: [authGuard] }, async (request, reply) => {
    const q = (request.query as Record<string, string | undefined>) ?? {};
    const uid = (request as any).userId as string;
    const today = new Date().toISOString().split("T")[0];
    const effectiveDate = q.date ?? q.from ?? today;
    // Range support: ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive). Falls back to single-day ?date= or today.
    const rangeFrom = q.from ?? q.date ?? today;
    const rangeTo = q.to ?? q.date ?? today;
    const useRange = Boolean(q.from || q.to);
    const salesDateFilter = useRange ? { from: rangeFrom, to: rangeTo } : { date: effectiveDate };
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Sales KPIs — range-aware when ?from&to supplied, else single-day ?date= or today (tenant-scoped)
    const todayResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${invoices.grandTotal}), 0)`,
        count: sql<number>`COUNT(*)`,
        gst: sql<number>`COALESCE(SUM(${invoices.totalGst}), 0)`,
      })
      .from(invoices)
      .where(
        useRange
          ? and(eq(invoices.createdBy, uid), eq(invoices.status, "paid"), gte(invoices.date, rangeFrom), lte(invoices.date, rangeTo))
          : and(eq(invoices.createdBy, uid), eq(invoices.date, effectiveDate), eq(invoices.status, "paid"))
      );

    // Previous period for delta (same duration, immediately preceding range) — only when range supplied
    let prevSalesTotal = 0;
    let prevProfit = 0;
    if (useRange) {
      const fromD = new Date(rangeFrom);
      const toD = new Date(rangeTo);
      const days = Math.max(1, Math.ceil((toD.getTime() - fromD.getTime()) / 86400000) + 1);
      const prevTo = new Date(fromD.getTime() - 86400000).toISOString().split("T")[0];
      const prevFrom = new Date(fromD.getTime() - days * 86400000).toISOString().split("T")[0];
      const [prevRes] = await db
        .select({ total: sql<number>`COALESCE(SUM(${invoices.grandTotal}), 0)` })
        .from(invoices)
        .where(and(eq(invoices.createdBy, uid), eq(invoices.status, "paid"), gte(invoices.date, prevFrom), lte(invoices.date, prevTo)));
      prevSalesTotal = Number(prevRes?.total ?? 0);
      // prev profit not yet computed — filled after cost lookup below
    }

    // Range purchase total (for Net Purchase card) — tenant-scoped
    let rangePurchaseTotal = 0;
    let rangePurchaseCount = 0;
    let prevPurchaseTotal = 0;
    if (useRange) {
      const [pur] = await db
        .select({ total: sql<number>`COALESCE(SUM(${purchaseBills.grandTotal}), 0)`, count: sql<number>`COUNT(*)` })
        .from(purchaseBills)
        .where(and(eq(purchaseBills.createdBy, uid), gte(purchaseBills.billDate, rangeFrom), lte(purchaseBills.billDate, rangeTo)));
      rangePurchaseTotal = Number(pur?.total ?? 0);
      rangePurchaseCount = Number(pur?.count ?? 0);
      const fromD = new Date(rangeFrom);
      const toD = new Date(rangeTo);
      const days = Math.max(1, Math.ceil((toD.getTime() - fromD.getTime()) / 86400000) + 1);
      const prevTo = new Date(fromD.getTime() - 86400000).toISOString().split("T")[0];
      const prevFrom = new Date(fromD.getTime() - days * 86400000).toISOString().split("T")[0];
      const [prevPur] = await db
        .select({ total: sql<number>`COALESCE(SUM(${purchaseBills.grandTotal}), 0)` })
        .from(purchaseBills)
        .where(and(eq(purchaseBills.createdBy, uid), gte(purchaseBills.billDate, prevFrom), lte(purchaseBills.billDate, prevTo)));
      prevPurchaseTotal = Number(prevPur?.total ?? 0);
    } else {
      const [purToday] = await db
        .select({ total: sql<number>`COALESCE(SUM(${purchaseBills.grandTotal}), 0)`, count: sql<number>`COUNT(*)` })
        .from(purchaseBills)
        .where(and(eq(purchaseBills.createdBy, uid), eq(purchaseBills.billDate, effectiveDate)));
      rangePurchaseTotal = Number(purToday?.total ?? 0);
      rangePurchaseCount = Number(purToday?.count ?? 0);
    }

    // All active medicines — tenant-scoped
    const allMedicines = await db.select().from(medicines).where(and(eq(medicines.isActive, true), eq(medicines.createdBy, uid)));

    // Customer dues: positive balance = customer owes us (see schema comment +
    // invoice flow, which adds grandTotal - amountPaid). Sum positives only — tenant-scoped.
    const [custDueTotal] = await db
      .select({ total: sql<number>`COALESCE(SUM(${customers.balance}), 0)` })
      .from(customers)
      .where(and(eq(customers.createdBy, uid), eq(customers.isActive, true), gt(customers.balance, 0)));

    const customerDues = await db
      .select({ id: customers.id, name: customers.name, phone: customers.phone, balance: customers.balance })
      .from(customers)
      .where(and(eq(customers.createdBy, uid), eq(customers.isActive, true), gt(customers.balance, 0)))
      .orderBy(desc(customers.balance))
      .limit(5);

    // Supplier dues: positive balance = we owe the supplier — tenant-scoped.
    const [suppDueTotal] = await db
      .select({ total: sql<number>`COALESCE(SUM(${suppliers.balance}), 0)` })
      .from(suppliers)
      .where(and(eq(suppliers.createdBy, uid), eq(suppliers.isActive, true), gt(suppliers.balance, 0)));

    const supplierDues = await db
      .select({ id: suppliers.id, name: suppliers.name, phone: suppliers.phone, balance: suppliers.balance })
      .from(suppliers)
      .where(and(eq(suppliers.createdBy, uid), eq(suppliers.isActive, true), gt(suppliers.balance, 0)))
      .orderBy(desc(suppliers.balance))
      .limit(5);

    // Stock valuation from active batches (shelf value, incl. expired lots) — tenant-scoped.
    const [stockValue] = await db
      .select({
        packs: sql<number>`COALESCE(SUM(${batches.quantity}), 0)`,
        mrpValue: sql<number>`COALESCE(SUM(${batches.quantity} * ${batches.mrp}), 0)`,
        saleValue: sql<number>`COALESCE(SUM(${batches.quantity} * ${batches.sellingPrice}), 0)`,
        costValue: sql<number>`COALESCE(SUM(${batches.quantity} * ${batches.purchasePrice}), 0)`,
      })
      .from(batches)
      .where(and(eq(batches.createdBy, uid), eq(batches.isActive, true), gt(batches.quantity, 0)));

    // Collections — range-aware (voided excluded) — tenant-scoped.
    const collectionRows = await db
      .select({ type: payments.type, total: sql<number>`COALESCE(SUM(${payments.amount}), 0)` })
      .from(payments)
      .where(
        useRange
          ? and(eq(payments.createdBy, uid), eq(payments.voided, false), gte(payments.date, rangeFrom), lte(payments.date, rangeTo))
          : and(eq(payments.createdBy, uid), eq(payments.date, effectiveDate), eq(payments.voided, false))
      )
      .groupBy(payments.type);
    const sumByType = (t: string) => collectionRows.find((r) => r.type === t)?.total ?? 0;

    // Customers tile metrics — tenant-scoped
    const [custCountRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(customers)
      .where(and(eq(customers.createdBy, uid), eq(customers.isActive, true)));
    const customersTotal = Number(custCountRow?.count ?? 0);
    const salesTotalForAvg = Number(todayResult[0]?.total ?? 0);
    const salesCountForAvg = Number(todayResult[0]?.count ?? 0);
    const customersAvgOrder = salesCountForAvg > 0 ? salesTotalForAvg / salesCountForAvg : 0;

    // New vs repeat — derived from invoices in the active period — tenant-scoped
    let customersNew = 0;
    let customersRepeat = 0;
    try {
      const periodInvoices = await db
        .select({ customerId: invoices.customerId })
        .from(invoices)
        .where(
          useRange
            ? and(eq(invoices.createdBy, uid), eq(invoices.status, "paid"), gte(invoices.date, rangeFrom), lte(invoices.date, rangeTo))
            : and(eq(invoices.createdBy, uid), eq(invoices.status, "paid"), eq(invoices.date, effectiveDate))
        );
      const freq = new Map<string, number>();
      for (const r of periodInvoices as any[]) {
        if (!r.customerId) continue;
        freq.set(r.customerId, (freq.get(r.customerId) ?? 0) + 1);
      }
      customersRepeat = [...freq.values()].filter((c) => c > 1).length;
      // New customers = createdAt in period (active only) — tenant-scoped
      const activeCustomers = await db
        .select({ createdAt: customers.createdAt })
        .from(customers)
        .where(and(eq(customers.createdBy, uid), eq(customers.isActive, true)));
      const inPeriodCreated = (d: any) => {
        if (!d) return false;
        const ds = new Date(d as any).toISOString().split("T")[0];
        if (useRange) return ds >= rangeFrom && ds <= rangeTo;
        return ds === effectiveDate;
      };
      customersNew = (activeCustomers as any[]).filter((c) => inPeriodCreated(c.createdAt)).length;
    } catch {
      // non-fatal — keep 0
    }

    // Gross profit for the active period (mirrors /reports/profit) — tenant-scoped
    let grossProfit = 0;
    let profitPrev = 0;
    try {
      const fromDt = new Date(useRange ? rangeFrom : effectiveDate);
      const toDt = new Date(useRange ? rangeTo : effectiveDate);
      // inclusive end-of-day
      toDt.setHours(23, 59, 59, 999);
      const [costRow] = await db
        .select({ totalCost: sql<number>`SUM(${inventoryTransactions.rate} * ABS(${inventoryTransactions.quantity}))` })
        .from(inventoryTransactions)
        .where(and(eq(inventoryTransactions.createdBy, uid), eq(inventoryTransactions.type, "sales"), gte(inventoryTransactions.createdAt, fromDt), lte(inventoryTransactions.createdAt, toDt)));
      const cost = Number(costRow?.totalCost ?? 0);
      const totalGst = Number(todayResult[0]?.gst ?? 0);
      grossProfit = salesTotalForAvg - totalGst - cost;
      if (useRange) {
        const fromD = new Date(rangeFrom);
        const toD = new Date(rangeTo);
        const days = Math.max(1, Math.ceil((toD.getTime() - fromD.getTime()) / 86400000) + 1);
        const prevToStr = new Date(fromD.getTime() - 86400000).toISOString().split("T")[0];
        const prevFromStr = new Date(fromD.getTime() - days * 86400000).toISOString().split("T")[0];
        const [prevRes2] = await db
          .select({ total: sql<number>`COALESCE(SUM(${invoices.grandTotal}), 0)`, gst: sql<number>`COALESCE(SUM(${invoices.totalGst}), 0)` })
          .from(invoices)
          .where(and(eq(invoices.createdBy, uid), eq(invoices.status, "paid"), gte(invoices.date, prevFromStr), lte(invoices.date, prevToStr)));
        const prevTotal = Number((prevRes2 as any)?.total ?? 0);
        const prevGst = Number((prevRes2 as any)?.gst ?? 0);
        prevSalesTotal = prevTotal;
        const prevFromDt = new Date(prevFromStr);
        const prevToDt = new Date(prevToStr);
        prevToDt.setHours(23, 59, 59, 999);
        const [prevCostRow] = await db
          .select({ totalCost: sql<number>`SUM(${inventoryTransactions.rate} * ABS(${inventoryTransactions.quantity}))` })
          .from(inventoryTransactions)
          .where(and(eq(inventoryTransactions.createdBy, uid), eq(inventoryTransactions.type, "sales"), gte(inventoryTransactions.createdAt, prevFromDt), lte(inventoryTransactions.createdAt, prevToDt)));
        const prevCost = Number(prevCostRow?.totalCost ?? 0);
        profitPrev = prevTotal - prevGst - prevCost;
        prevProfit = profitPrev;
      }
    } catch {
      // keep 0
    }

    // Recent invoices (all statuses, for display) — tenant-scoped
    const recentInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.createdBy, uid))
      .orderBy(desc(invoices.createdAt))
      .limit(10);

    // Unpaid invoice count — tenant-scoped
    const unpaidResult = await db
      .select({ count: sql<number>`COUNT(*)`, total: sql<number>`COALESCE(SUM(${invoices.grandTotal}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.createdBy, uid), eq(invoices.status, "unpaid")));

    // Active billing days in last 7 — tenant-scoped
    const sevenDayInvoices = await db
      .select({ date: invoices.date, total: invoices.grandTotal })
      .from(invoices)
      .where(and(eq(invoices.createdBy, uid), gt(invoices.date, sevenDaysAgo), eq(invoices.status, "paid")));

    const activeDaysSet = new Set(sevenDayInvoices.map(i => i.date));
    const activeBillingDays = activeDaysSet.size;

    // Low stock medicines
    const lowStock: any[] = [];
    const expiringBatches: any[] = [];

    for (const med of allMedicines) {
      const [stockResult] = await db
        .select({ qty: sql<number>`COALESCE(SUM(${batches.quantity}), 0)` })
        .from(batches)
        .where(and(eq(batches.medicineId, med.id), eq(batches.isActive, true), gt(batches.expiryDate, today)));

      const available = stockResult?.qty ?? 0;
      if (available <= (med.minQuantity ?? 10)) {
        lowStock.push({ ...med, availableStock: available });
      }

      // Near-expiry batches
      const expiring = await db
        .select()
        .from(batches)
        .where(and(
          eq(batches.medicineId, med.id),
          eq(batches.isActive, true),
          gt(batches.quantity, 0),
          lt(batches.expiryDate, thirtyDaysLater),
          gt(batches.expiryDate, today),
        ))
        .orderBy(asc(batches.expiryDate));

      for (const b of expiring) {
        expiringBatches.push({ ...b, medicineName: med.name });
      }
    }

    const lowStockCount = lowStock.length;
    const expiringCount = expiringBatches.length;

    // Last successful backup
    const [lastBackup] = await db
      .select()
      .from(backupHistory)
      .where(eq(backupHistory.status, "success"))
      .orderBy(desc(backupHistory.createdAt))
      .limit(1);

    const pctChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    return reply.send({
      success: true,
      data: {
        todaySales: todayResult[0]?.total ?? 0,
        todayGst: todayResult[0]?.gst ?? 0,
        todayInvoices: Number(todayResult[0]?.count ?? 0),
        // Range-aware aliases used by screenshot-aligned frontend: Net Sales / Net Purchase / Profit tiles
        netSales: Number(todayResult[0]?.total ?? 0),
        netSalesCount: Number(todayResult[0]?.count ?? 0),
        netSalesPrev: prevSalesTotal,
        netSalesChangePct: useRange ? pctChange(Number(todayResult[0]?.total ?? 0), prevSalesTotal) : null,
        netPurchase: rangePurchaseTotal,
        netPurchaseCount: rangePurchaseCount,
        netPurchasePrev: prevPurchaseTotal,
        netPurchaseChangePct: useRange && prevPurchaseTotal !== undefined ? pctChange(rangePurchaseTotal, prevPurchaseTotal) : null,
        grossProfit,
        grossProfitPrev: useRange ? prevProfit : null,
        grossProfitChangePct: useRange ? pctChange(grossProfit, prevProfit) : null,
        dateRange: useRange ? { from: rangeFrom, to: rangeTo } : { from: effectiveDate, to: effectiveDate },
        lowStockCount,
        expiringCount,
        outstandingCredit: custDueTotal?.total ?? 0,
        unpaidInvoices: Number(unpaidResult[0]?.count ?? 0),
        unpaidTotal: unpaidResult[0]?.total ?? 0,
        activeBillingDays,
        totalInvoices: recentInvoices.length,
        recentInvoices,
        lowStock: lowStock.slice(0, 10),
        expiringBatches: expiringBatches.slice(0, 10),
        lastBackup: lastBackup ? { type: lastBackup.type, createdAt: lastBackup.createdAt } : null,
        stockValue: {
          packs: stockValue?.packs ?? 0,
          mrpValue: stockValue?.mrpValue ?? 0,
          saleValue: stockValue?.saleValue ?? 0,
          costValue: stockValue?.costValue ?? 0,
        },
        collections: {
          received: sumByType("received"),
          paid: sumByType("paid"),
          expenses: sumByType("expense"),
          // aliases for screenshot card
          totalIn: sumByType("received"),
          totalOut: sumByType("paid") + sumByType("expense"),
        },
        dues: {
          customerTotal: custDueTotal?.total ?? 0,
          customers: customerDues,
          supplierTotal: suppDueTotal?.total ?? 0,
          suppliers: supplierDues,
        },
        customers: {
          total: customersTotal,
          avgOrderValue: customersAvgOrder,
          new: customersNew,
          repeat: customersRepeat,
        },
      },
    });
  });
}
