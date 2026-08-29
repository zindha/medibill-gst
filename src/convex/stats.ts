import { v } from "convex/values";
import { query } from "./_generated/server";
import { getActiveStore } from "./users";

/** Summary counts and key numbers — fast, no heavy array scans */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");

    const medicines = await ctx.db
      .query("medicines")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .collect();

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .collect();

    const suppliers = await ctx.db
      .query("suppliers")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .collect();

    const customers = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .collect();

    const totalRevenue = invoices.reduce(
      (sum, inv) => sum + inv.grandTotal,
      0,
    );
    const totalStock = medicines.reduce(
      (sum, m) => sum + m.quantity,
      0,
    );
    const totalGst = invoices.reduce(
      (sum, inv) => sum + inv.totalGst,
      0,
    );
    const lowStock = medicines.filter((m) =>
      m.minQuantity
        ? m.quantity <= m.minQuantity
        : m.quantity <= 10,
    );

    const today = new Date().toISOString().split("T")[0];
    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() + 30);
    const expiryStr = expiryThreshold
      .toISOString()
      .split("T")[0];
    const expiringSoon = medicines.filter(
      (m) =>
        m.expiryDate &&
        m.expiryDate <= expiryStr &&
        m.expiryDate >= today,
    );

    const unpaidTotal = invoices
      .filter((inv) => inv.status === "unpaid")
      .reduce((sum, inv) => sum + inv.grandTotal, 0);
    const partialTotal = invoices
      .filter((inv) => inv.status === "partial")
      .reduce(
        (sum, inv) =>
          sum + (inv.grandTotal - (inv.amountPaid || 0)),
        0,
      );

    return {
      totalMedicines: medicines.length,
      totalStock,
      totalInvoices: invoices.length,
      totalRevenue,
      totalGst,
      totalSuppliers: suppliers.length,
      totalCustomers: customers.length,
      lowStock,
      lowStockCount: lowStock.length,
      expiringSoon,
      expiringSoonCount: expiringSoon.length,
      totalPending: unpaidTotal + partialTotal,
    };
  },
});

/** Recent activity: recent invoices, monthly chart, daily strip */
export const activity = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .collect();

    // Recent invoices (top 5)
    const recentInvoices = [...invoices]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 5);

    // Monthly revenue (last 6 months)
    const monthlyRevenue: {
      month: string;
      revenue: number;
    }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = d.toLocaleString("en-US", {
        month: "short",
        year: "2-digit",
      });
      const m = (d.getMonth() + 1)
        .toString()
        .padStart(2, "0");
      const y = d.getFullYear().toString();
      const revenue = invoices
        .filter((inv) => inv.date.startsWith(`${y}-${m}`))
        .reduce((sum, inv) => sum + inv.grandTotal, 0);
      monthlyRevenue.push({ month, revenue });
    }

    // Daily activity (last 7 days)
    const dailyInvoices: {
      date: string;
      label: string;
      count: number;
      revenue: number;
    }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split("T")[0];
      const label =
        i === 0
          ? "Today"
          : d.toLocaleString("en-US", {
              weekday: "short",
            });
      const dayInvoices = invoices.filter(
        (inv) => inv.date === date,
      );
      dailyInvoices.push({
        date,
        label,
        count: dayInvoices.length,
        revenue: dayInvoices.reduce(
          (sum, inv) => sum + inv.grandTotal,
          0,
        ),
      });
    }

    // Pending refill reminders
    const reminders = await ctx.db
      .query("refillReminders")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .filter((r) =>
        r.eq(r.field("status"), "pending"),
      )
      .collect();
    const today = new Date().toISOString().split("T")[0];
    const dueReminders = reminders.filter(
      (r) => r.reminderDate <= today,
    );

    // Pending purchase bills
    const pendingPurchaseBills = await ctx.db
      .query("purchaseBills")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .filter((b) =>
        b.eq(b.field("status"), "pending"),
      )
      .collect();
    const pendingPurchaseBillsAmount =
      pendingPurchaseBills.reduce(
        (sum, b) => sum + b.amount,
        0,
      );

    return {
      recentInvoices,
      monthlyRevenue,
      dailyInvoices,
      dueReminders: dueReminders.length,
      pendingPurchaseBills: pendingPurchaseBills.length,
      pendingPurchaseBillsAmount,
    };
  },
});

/** Payment summaries — single query for all payment stats */
export const paymentsSummary = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .collect();

    const totalPaymentsReceived = payments
      .filter((p) => p.type === "received")
      .reduce((s, p) => s + p.amount, 0);
    const totalPaymentsMade = payments
      .filter((p) => p.type === "paid")
      .reduce((s, p) => s + p.amount, 0);

    // Pending amount from invoices
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .collect();
    let totalPending = 0;
    for (const inv of invoices) {
      if (inv.status === "unpaid")
        totalPending += inv.grandTotal;
      else if (inv.status === "partial")
        totalPending +=
          inv.grandTotal - (inv.amountPaid || 0);
    }

    return {
      totalPaymentsReceived,
      totalPaymentsMade,
      totalPending,
    };
  },
});

export const gstRegister = query({
  args: {
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    let invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .collect();
    if (args.fromDate)
      invoices = invoices.filter(
        (i) => i.date >= args.fromDate!,
      );
    if (args.toDate)
      invoices = invoices.filter(
        (i) => i.date <= args.toDate!,
      );
    invoices.sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const register = invoices.map((inv) => ({
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      customerName: inv.customerName || "Walk-in",
      taxableValue: inv.subtotal,
      cgst: inv.cgst,
      sgst: inv.sgst,
      igst: inv.igst,
      totalGst: inv.totalGst,
      grandTotal: inv.grandTotal,
    }));

    return {
      entries: register,
      totalTaxable: register.reduce(
        (s, r) => s + r.taxableValue,
        0,
      ),
      totalCGST: register.reduce(
        (s, r) => s + r.cgst,
        0,
      ),
      totalSGST: register.reduce(
        (s, r) => s + r.sgst,
        0,
      ),
      totalIGST: register.reduce(
        (s, r) => s + r.igst,
        0,
      ),
      totalGST: register.reduce(
        (s, r) => s + r.totalGst,
        0,
      ),
      totalAmount: register.reduce(
        (s, r) => s + r.grandTotal,
        0,
      ),
    };
  },
});

export const purchaseRegister = query({
  args: {
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    let bills = await ctx.db
      .query("purchaseBills")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .collect();
    // Bills without a date stay visible in any range
    if (args.fromDate)
      bills = bills.filter(
        (b) =>
          !b.billDate || b.billDate >= args.fromDate!,
      );
    if (args.toDate)
      bills = bills.filter(
        (b) =>
          !b.billDate || b.billDate <= args.toDate!,
      );
    bills.sort((a, b) =>
      (a.billDate || "").localeCompare(b.billDate || ""),
    );
    return {
      entries: bills,
      totalAmount: bills.reduce(
        (s, b) => s + b.amount,
        0,
      ),
      totalGst: bills.reduce(
        (s, b) => s + (b.gstAmount || 0),
        0,
      ),
    };
  },
});

/** Legacy alias — keeps old code working during migration */
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");

    const medicines = await ctx.db
      .query("medicines")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .collect();
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .collect();
    const suppliers = await ctx.db
      .query("suppliers")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .collect();
    const customers = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .collect();
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .collect();

    const lowStock = medicines.filter((m) =>
      m.minQuantity
        ? m.quantity <= m.minQuantity
        : m.quantity <= 10,
    );
    const totalRevenue = invoices.reduce(
      (sum, inv) => sum + inv.grandTotal,
      0,
    );
    const totalMedicines = medicines.reduce(
      (sum, m) => sum + m.quantity,
      0,
    );
    const totalGst = invoices.reduce(
      (sum, inv) => sum + inv.totalGst,
      0,
    );

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(
      thirtyDaysFromNow.getDate() + 30,
    );
    const expiryThreshold = thirtyDaysFromNow
      .toISOString()
      .split("T")[0];
    const today = new Date()
      .toISOString()
      .split("T")[0];
    const expiringSoon = medicines.filter(
      (m) =>
        m.expiryDate &&
        m.expiryDate <= expiryThreshold &&
        m.expiryDate >= today,
    );

    const unpaidTotal = invoices
      .filter((inv) => inv.status === "unpaid")
      .reduce((sum, inv) => sum + inv.grandTotal, 0);
    const partialTotal = invoices
      .filter((inv) => inv.status === "partial")
      .reduce(
        (sum, inv) =>
          sum +
          (inv.grandTotal - (inv.amountPaid || 0)),
        0,
      );
    const totalPending = unpaidTotal + partialTotal;

    const recentInvoices = [...invoices]
      .sort(
        (a, b) =>
          b._creationTime - a._creationTime,
      )
      .slice(0, 5);

    const reminders = await ctx.db
      .query("refillReminders")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .filter((r) =>
        r.eq(r.field("status"), "pending"),
      )
      .collect();
    const dueReminders = reminders.filter(
      (r) => r.reminderDate <= today,
    );

    const pendingPurchaseBills = await ctx.db
      .query("purchaseBills")
      .withIndex("by_user", (q) =>
        q.eq("userId", active.ownerId),
      )
      .filter((b) =>
        b.eq(b.field("status"), "pending"),
      )
      .collect();
    const pendingPurchaseBillsAmount =
      pendingPurchaseBills.reduce(
        (sum, b) => sum + b.amount,
        0,
      );

    const monthlyRevenue: {
      month: string;
      revenue: number;
    }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = d.toLocaleString("en-US", {
        month: "short",
        year: "2-digit",
      });
      const m = (d.getMonth() + 1)
        .toString()
        .padStart(2, "0");
      const y = d.getFullYear().toString();
      const revenue = invoices
        .filter((inv) => inv.date.startsWith(`${y}-${m}`))
        .reduce((sum, inv) => sum + inv.grandTotal, 0);
      monthlyRevenue.push({ month, revenue });
    }

    const dailyInvoices: {
      date: string;
      label: string;
      count: number;
      revenue: number;
    }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split("T")[0];
      const label =
        i === 0
          ? "Today"
          : d.toLocaleString("en-US", {
              weekday: "short",
            });
      const dayInvoices = invoices.filter(
        (inv) => inv.date === date,
      );
      dailyInvoices.push({
        date,
        label,
        count: dayInvoices.length,
        revenue: dayInvoices.reduce(
          (sum, inv) => sum + inv.grandTotal,
          0,
        ),
      });
    }

    return {
      totalMedicines: medicines.length,
      totalStock: totalMedicines,
      totalInvoices: invoices.length,
      totalRevenue,
      totalGst,
      totalSuppliers: suppliers.length,
      totalCustomers: customers.length,
      lowStock,
      lowStockCount: lowStock.length,
      expiringSoon,
      expiringSoonCount: expiringSoon.length,
      totalPending,
      recentInvoices,
      dueReminders: dueReminders.length,
      pendingPurchaseBills:
        pendingPurchaseBills.length,
      pendingPurchaseBillsAmount,
      monthlyRevenue,
      dailyInvoices,
      totalPaymentsReceived: payments
        .filter((p) => p.type === "received")
        .reduce((s, p) => s + p.amount, 0),
      totalPaymentsMade: payments
        .filter((p) => p.type === "paid")
        .reduce((s, p) => s + p.amount, 0),
    };
  },
});
