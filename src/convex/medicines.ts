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
      .query("medicines")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .collect();

    if (args.search) {
      const s = args.search.toLowerCase();
      items = items.filter(
        (m) =>
          m.name.toLowerCase().includes(s) ||
          (m.brand && m.brand.toLowerCase().includes(s)) ||
          (m.hsnCode && m.hsnCode.toLowerCase().includes(s)) ||
          (m.barcode && m.barcode.toLowerCase().includes(s)),
      );
    }
    return items;
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
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    const q = args.query.toLowerCase();
    if (!q) return [];
    const medicines = await ctx.db
      .query("medicines")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .collect();
    return medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.brand && m.brand.toLowerCase().includes(q)) ||
        (m.batchNo && m.batchNo.toLowerCase().includes(q)) ||
        (m.hsnCode && m.hsnCode.toLowerCase().includes(q)) ||
        (m.barcode && m.barcode.toLowerCase().includes(q)),
    );
  },
});

export const searchByBarcode = query({
  args: { barcode: v.string() },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    const trimmed = args.barcode.trim();
    if (!trimmed) return null;
    const med = await ctx.db
      .query("medicines")
      .withIndex("by_barcode", (q) => q.eq("barcode", trimmed))
      .first();
    if (med && med.userId === active.ownerId) return med;
    return null;
  },
});

export const getLowStock = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    const medicines = await ctx.db
      .query("medicines")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .collect();
    return medicines.filter((m) =>
      m.minQuantity ? m.quantity <= m.minQuantity : m.quantity <= 10,
    );
  },
});

export const getExpiringSoon = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    const days = args.days || 30;
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + days);
    const thresholdStr = threshold.toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    const medicines = await ctx.db
      .query("medicines")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .collect();
    return medicines.filter(
      (m) =>
        m.expiryDate &&
        m.expiryDate <= thresholdStr &&
        m.expiryDate >= today,
    );
  },
});

export const getSubstitutes = query({
  args: { id: v.id("medicines") },
  handler: async (ctx, args) => {
    const med = await ctx.db.get(args.id);
    if (!med || !med.substituteIds || med.substituteIds.length === 0) return [];
    const substitutes = await Promise.all(
      med.substituteIds.map((sid) => ctx.db.get(sid)),
    );
    return substitutes.filter(Boolean);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    category: v.optional(v.string()),
    composition: v.optional(v.string()),
    batchNo: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    quantity: v.number(),
    minQuantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    barcode: v.optional(v.string()),
    purchasePrice: v.number(),
    sellingPrice: v.number(),
    gstRate: gstRateValidator,
    hsnCode: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
  },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    return await ctx.db.insert("medicines", {
      ...args,
      userId: active.ownerId,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("medicines"),
    name: v.optional(v.string()),
    brand: v.optional(v.string()),
    category: v.optional(v.string()),
    composition: v.optional(v.string()),
    batchNo: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    quantity: v.optional(v.number()),
    minQuantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    barcode: v.optional(v.string()),
    purchasePrice: v.optional(v.number()),
    sellingPrice: v.optional(v.number()),
    gstRate: v.optional(gstRateValidator),
    hsnCode: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
  },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("medicines") },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    await ctx.db.delete(args.id);
  },
});
