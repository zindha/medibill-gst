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
      .query("medicines")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("medicines") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const medicines = await ctx.db
      .query("medicines")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const q = args.query.toLowerCase();
    return medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.brand && m.brand.toLowerCase().includes(q)) ||
        (m.batchNo && m.batchNo.toLowerCase().includes(q)) ||
        (m.hsnCode && m.hsnCode.toLowerCase().includes(q)),
    );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    category: v.optional(v.string()),
    batchNo: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    quantity: v.number(),
    unit: v.optional(v.string()),
    purchasePrice: v.number(),
    sellingPrice: v.number(),
    gstRate: gstRateValidator,
    hsnCode: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db.insert("medicines", {
      ...args,
      userId: user._id,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("medicines"),
    name: v.optional(v.string()),
    brand: v.optional(v.string()),
    category: v.optional(v.string()),
    batchNo: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    purchasePrice: v.optional(v.number()),
    sellingPrice: v.optional(v.number()),
    gstRate: v.optional(gstRateValidator),
    hsnCode: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("medicines") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await ctx.db.delete(args.id);
  },
});
