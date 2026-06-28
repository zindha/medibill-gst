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
      .query("salesReturns")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("salesReturns") },
  handler: async (ctx, args) => {
    const ret = await ctx.db.get(args.id);
    if (!ret) return null;
    const items = await ctx.db
      .query("salesReturnItems")
      .withIndex("by_return", (q) => q.eq("returnId", args.id))
      .collect();
    return { return: ret, items };
  },
});

function generateReturnNo(userId: string, index: number): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  return `SR-${y}${m}-${(index + 1).toString().padStart(4, "0")}`;
}

export const create = mutation({
  args: {
    invoiceId: v.id("invoices"),
    customerName: v.optional(v.string()),
    date: v.string(),
    reason: v.optional(v.string()),
    subtotal: v.number(),
    totalGst: v.number(),
    cgst: v.number(),
    sgst: v.number(),
    igst: v.number(),
    grandTotal: v.number(),
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
    const returns = await ctx.db
      .query("salesReturns")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const returnNo = generateReturnNo(user._id, returns.length);
    const { items, ...data } = args;
    const returnId = await ctx.db.insert("salesReturns", {
      ...data,
      returnNo,
      userId: user._id,
    });
    for (const item of items) {
      await ctx.db.insert("salesReturnItems", { ...item, returnId });
      // Restore stock
      if (item.medicineId) {
        const med = await ctx.db.get(item.medicineId);
        if (med) {
          await ctx.db.patch(item.medicineId, { quantity: med.quantity + item.quantity });
        }
      }
    }
    return returnId;
  },
});
