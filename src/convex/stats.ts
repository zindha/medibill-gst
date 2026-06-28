import { v } from "convex/values";
import { query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const medicines = await ctx.db
      .query("medicines")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const suppliers = await ctx.db
      .query("suppliers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const customers = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const lowStock = medicines.filter((m) => m.minQuantity ? m.quantity <= m.minQuantity : m.quantity <= 10);
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
    const totalMedicines = medicines.reduce((sum, m) => sum + m.quantity, 0);
    const totalGst = invoices.reduce((sum, inv) => sum + inv.totalGst, 0);

    // Expiring within 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiryThreshold = thirtyDaysFromNow.toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    const expiringSoon = medicines.filter(
      (m) => m.expiryDate && m.expiryDate <= expiryThreshold && m.expiryDate >= today,
    );

    // Pending payments / Udhar
    const unpaidTotal = invoices
      .filter((inv) => inv.status === "unpaid")
      .reduce((sum, inv) => sum + inv.grandTotal, 0);
    const partialTotal = invoices
      .filter((inv) => inv.status === "partial")
      .reduce((sum, inv) => sum + (inv.grandTotal - (inv.amountPaid || 0)), 0);
    const totalPending = unpaidTotal + partialTotal;

    // Recent invoices
    const recentInvoices = [...invoices]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 5);

    // Pending refill reminders
    const reminders = await ctx.db
      .query("refillReminders")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((r) => r.eq(r.field("status"), "pending"))
      .collect();
    const dueReminders = reminders.filter((r) => r.reminderDate <= today);

    // Purchase bills pending
    const pendingPurchaseBills = await ctx.db
      .query("purchaseBills")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((b) => b.eq(b.field("status"), "pending"))
      .collect();

    // Monthly revenue for chart (last 6 months)
    const monthlyRevenue: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
      const m = (d.getMonth() + 1).toString().padStart(2, "0");
      const y = d.getFullYear().toString();
      const revenue = invoices
        .filter((inv) => inv.date.startsWith(`${y}-${m}`))
        .reduce((sum, inv) => sum + inv.grandTotal, 0);
      monthlyRevenue.push({ month, revenue });
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
      pendingPurchaseBills: pendingPurchaseBills.length,
      monthlyRevenue,
      totalPaymentsReceived: payments.filter((p) => p.type === "received").reduce((s, p) => s + p.amount, 0),
      totalPaymentsMade: payments.filter((p) => p.type === "paid").reduce((s, p) => s + p.amount, 0),
    };
  },
});

export const gstRegister = query({
  args: { fromDate: v.optional(v.string()), toDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    let invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    if (args.fromDate) invoices = invoices.filter((i) => i.date >= args.fromDate!);
    if (args.toDate) invoices = invoices.filter((i) => i.date <= args.toDate!);
    invoices.sort((a, b) => a.date.localeCompare(b.date));

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
      totalTaxable: register.reduce((s, r) => s + r.taxableValue, 0),
      totalCGST: register.reduce((s, r) => s + r.cgst, 0),
      totalSGST: register.reduce((s, r) => s + r.sgst, 0),
      totalIGST: register.reduce((s, r) => s + r.igst, 0),
      totalGST: register.reduce((s, r) => s + r.totalGst, 0),
      totalAmount: register.reduce((s, r) => s + r.grandTotal, 0),
    };
  },
});

export const purchaseRegister = query({
  args: { fromDate: v.optional(v.string()), toDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    let bills = await ctx.db
      .query("purchaseBills")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    if (args.fromDate) bills = bills.filter((b) => b.billDate && b.billDate >= args.fromDate!);
    if (args.toDate) bills = bills.filter((b) => b.billDate && b.billDate <= args.toDate!);
    bills.sort((a, b) => (a.billDate || "").localeCompare(b.billDate || ""));
    return {
      entries: bills,
      totalAmount: bills.reduce((s, b) => s + b.amount, 0),
      totalGst: bills.reduce((s, b) => s + (b.gstAmount || 0), 0),
    };
  },
});
