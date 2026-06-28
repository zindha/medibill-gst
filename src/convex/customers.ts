import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const customers = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const q = args.query.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)),
    );
  },
});

export const getPurchaseHistory = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .collect();
    return invoices;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    gstin: v.optional(v.string()),
    creditLimit: v.optional(v.number()),
    openingBalance: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const id = await ctx.db.insert("customers", {
      ...args,
      totalPurchases: 0,
      userId: user._id,
    });
    // Create credit account if opening balance
    if (args.openingBalance && args.openingBalance !== 0) {
      await ctx.db.insert("creditAccounts", {
        customerId: id,
        customerName: args.name,
        type: "customer",
        balance: args.openingBalance,
        userId: user._id,
      });
    }
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("customers"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    gstin: v.optional(v.string()),
    creditLimit: v.optional(v.number()),
    openingBalance: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await ctx.db.delete(args.id);
  },
});
