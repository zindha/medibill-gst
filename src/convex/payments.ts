import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const list = query({
  args: {
    type: v.optional(v.union(v.literal("received"), v.literal("paid"), v.literal("expense"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    let q = ctx.db.query("payments").withIndex("by_user", (q) => q.eq("userId", user._id));
    if (args.type) {
      q = q.filter((p) => p.eq(p.field("type"), args.type!));
    }
    return await q.order("desc").collect();
  },
});

export const getPendingAmount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    let totalPending = 0;
    for (const inv of invoices) {
      if (inv.status === "unpaid") totalPending += inv.grandTotal;
      else if (inv.status === "partial") totalPending += (inv.grandTotal - (inv.amountPaid || 0));
    }
    return totalPending;
  },
});

export const getTotals = query({
  args: { fromDate: v.optional(v.string()), toDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    let filtered = payments;
    if (args.fromDate) {
      filtered = filtered.filter((p) => p.date >= args.fromDate!);
    }
    if (args.toDate) {
      filtered = filtered.filter((p) => p.date <= args.toDate!);
    }
    const received = filtered.filter((p) => p.type === "received").reduce((s, p) => s + p.amount, 0);
    const paid = filtered.filter((p) => p.type === "paid").reduce((s, p) => s + p.amount, 0);
    const expenses = filtered.filter((p) => p.type === "expense").reduce((s, p) => s + p.amount, 0);
    return { received, paid, expenses, net: received - paid - expenses };
  },
});

export const create = mutation({
  args: {
    date: v.string(),
    type: v.union(v.literal("received"), v.literal("paid"), v.literal("expense")),
    category: v.optional(v.string()),
    amount: v.number(),
    reference: v.optional(v.string()),
    invoiceId: v.optional(v.id("invoices")),
    customerId: v.optional(v.id("customers")),
    supplierId: v.optional(v.id("suppliers")),
    description: v.optional(v.string()),
    paymentMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db.insert("payments", { ...args, userId: user._id });
  },
});
