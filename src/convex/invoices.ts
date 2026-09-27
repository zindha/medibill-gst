import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getActiveStore } from "./users";
import { gstRateValidator } from "./schema";

export const list = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");

    let items = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .order("desc")
      .collect();

    if (args.search) {
      const s = args.search.toLowerCase();
      items = items.filter(
        (inv) =>
          inv.invoiceNo.toLowerCase().includes(s) ||
          (inv.customerName &&
            inv.customerName.toLowerCase().includes(s)),
      );
    }
    return items;
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
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
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
    customerId: v.optional(v.id("customers")),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerAddress: v.optional(v.string()),
    doctorId: v.optional(v.id("doctors")),
    prescriptionId: v.optional(v.id("prescriptions")),
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
    status: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("unpaid"),
        v.literal("partial"),
      ),
    ),
    amountPaid: v.optional(v.number()),
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
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    const { items, ...invoiceData } = args;
    const invoiceId = await ctx.db.insert("invoices", {
      ...invoiceData,
      userId: active.ownerId,
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
    // Update customer purchase stats
    if (invoiceData.customerId) {
      const customer = await ctx.db.get(invoiceData.customerId);
      if (customer) {
        await ctx.db.patch(invoiceData.customerId, {
          totalPurchases: (customer.totalPurchases || 0) + 1,
          lastPurchaseDate: invoiceData.date,
        });
      }
    }
    return invoiceId;
  },
});

export const remove = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
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
