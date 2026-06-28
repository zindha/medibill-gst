import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db
      .query("purchaseBills")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    supplierName: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
    billNo: v.optional(v.string()),
    billDate: v.optional(v.string()),
    amount: v.number(),
    gstAmount: v.optional(v.number()),
    imageStorageId: v.optional(v.id("_storage")),
    ocrText: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("processed")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db.insert("purchaseBills", {
      ...args,
      userId: user._id,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("purchaseBills"),
    supplierName: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
    billNo: v.optional(v.string()),
    billDate: v.optional(v.string()),
    amount: v.optional(v.number()),
    gstAmount: v.optional(v.number()),
    status: v.optional(v.union(v.literal("pending"), v.literal("processed"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("purchaseBills") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await ctx.db.delete(args.id);
  },
});
