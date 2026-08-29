import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getActiveStore } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    return await ctx.db
      .query("creditAccounts")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .order("desc")
      .collect();
  },
});

export const getByCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const acc = await ctx.db
      .query("creditAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .first();
    return acc;
  },
});

export const getBySupplier = query({
  args: { supplierId: v.id("suppliers") },
  handler: async (ctx, args) => {
    const acc = await ctx.db
      .query("creditAccounts")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
      .first();
    return acc;
  },
});

export const update = mutation({
  args: {
    id: v.id("creditAccounts"),
    balance: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      balance: args.balance,
      lastTransactionDate: new Date().toISOString().split("T")[0],
    });
  },
});
