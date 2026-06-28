import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";
import { gstRateValidator } from "./schema";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.id);
    if (!invoice) return null;
    const items = await ctx.db
      .query("invoiceItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.id))
      .collect();
    return { invoice, items };
  },
});

export const getNextInvoiceNo = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const count = invoices.length + 1;
    const date = new Date();
    const y = date.getFullYear().toString().slice(-2);
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    return `INV-${y}${m}-${count.toString().padStart(4, "0")}`;
  },
});

export const create = mutation({
  args: {
    invoiceNo: v.string(),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerAddress: v.optional(v.string()),
    date: v.string(),
    subtotal: v.number(),
    totalGst: v.number(),
    cgst: v.number(),
    sgst: v.number(),
    igst: v.number(),
    discount: v.optional(v.number()),
    grandTotal: v.number(),
    paymentMode: v.optional(v.string()),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        medicineId: v.optional(v.id("medicines")),
        medicineName: v.string(),
        hsnCode: v.optional(v.string()),
        quantity: v.number(),
        unit: v.optional(v.string()),
        rate: v.number(),
        amount: v.number(),
        gstRate: gstRateValidator,
        gstAmount: v.number(),
        cgst: v.number(),
        sgst: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const { items, ...invoiceData } = args;
    const invoiceId = await ctx.db.insert("invoices", {
      ...invoiceData,
      userId: user._id,
    });
    for (const item of items) {
      await ctx.db.insert("invoiceItems", {
        ...item,
        invoiceId,
      });
    }
    // Update medicine stock
    for (const item of items) {
      if (item.medicineId) {
        const med = await ctx.db.get(item.medicineId);
        if (med) {
          await ctx.db.patch(item.medicineId, {
            quantity: med.quantity - item.quantity,
          });
        }
      }
    }
    return invoiceId;
  },
});

export const remove = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const items = await ctx.db
      .query("invoiceItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.id))
      .collect();
    // Restore stock
    for (const item of items) {
      if (item.medicineId) {
        const med = await ctx.db.get(item.medicineId);
        if (med) {
          await ctx.db.patch(item.medicineId, {
            quantity: med.quantity + item.quantity,
          });
        }
      }
    }
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(args.id);
  },
});
