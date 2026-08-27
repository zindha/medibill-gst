import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./users";

export const list = query({
  args: {
    type: v.optional(
      v.union(
        v.literal("received"),
        v.literal("paid"),
        v.literal("expense"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    let q = ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc");

    if (args.type) {
      q = q.filter((p) => p.eq(p.field("type"), args.type!));
    }

    return await q.collect();
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
      if (inv.status === "unpaid")
        totalPending += inv.grandTotal;
      else if (inv.status === "partial")
        totalPending += inv.grandTotal - (inv.amountPaid || 0);
    }
    return totalPending;
  },
});

export const getTotals = query({
  args: {
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    let q = ctx.db
      .query("payments")
      .withIndex("by_user", (q) => q.eq("userId", user._id));
    if (args.fromDate) {
      q = q.filter((p) => p.gte(p.field("date"), args.fromDate!));
    }
    if (args.toDate) {
      q = q.filter((p) => p.lte(p.field("date"), args.toDate!));
    }
    const payments = await q.collect();
    const received = payments
      .filter((p) => p.type === "received")
      .reduce((s, p) => s + p.amount, 0);
    const paid = payments
      .filter((p) => p.type === "paid")
      .reduce((s, p) => s + p.amount, 0);
    const expenses = payments
      .filter((p) => p.type === "expense")
      .reduce((s, p) => s + p.amount, 0);
    return {
      received,
      paid,
      expenses,
      net: received - paid - expenses,
    };
  },
});

export const listByInvoice = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db
      .query("payments")
      .withIndex("by_invoice", (q) =>
        q.eq("invoiceId", args.invoiceId),
      )
      .order("desc")
      .collect();
  },
});

async function recomputeInvoiceStatus(
  ctx: MutationCtx,
  userId: Id<"users">,
  invoiceId: Id<"invoices">,
  invoiceMode?: string | null,
) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) return;
  const payments = await ctx.db
    .query("payments")
    .withIndex("by_invoice", (q) =>
      q.eq("invoiceId", invoiceId),
    )
    .collect();
  const received = payments
    .filter((p) => p.type === "received")
    .reduce((s, p) => s + p.amount, 0);
  const amountPaid = Math.min(received, invoice.grandTotal);
  let status: "paid" | "unpaid" | "partial";
  if (received <= 0) {
    status = invoiceMode === "Credit" ? "unpaid" : "paid";
  } else if (amountPaid >= invoice.grandTotal) {
    status = "paid";
  } else {
    status = "partial";
  }
  await ctx.db.patch(invoiceId, { amountPaid, status });
}

export const create = mutation({
  args: {
    date: v.string(),
    type: v.union(
      v.literal("received"),
      v.literal("paid"),
      v.literal("expense"),
    ),
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
    const paymentId = await ctx.db.insert("payments", {
      ...args,
      userId: user._id,
    });
    if (args.invoiceId && args.type === "received") {
      const invoice = await ctx.db.get(args.invoiceId);
      await recomputeInvoiceStatus(
        ctx,
        user._id,
        args.invoiceId,
        invoice?.paymentMode,
      );
    }
    return paymentId;
  },
});

export const remove = mutation({
  args: { id: v.id("payments") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const payment = await ctx.db.get(args.id);
    if (!payment) return;
    const { invoiceId, type } = payment;
    await ctx.db.delete(args.id);
    if (invoiceId && type === "received") {
      const invoice = await ctx.db.get(invoiceId);
      await recomputeInvoiceStatus(
        ctx,
        user._id,
        invoiceId,
        invoice?.paymentMode,
      );
    }
  },
});
