import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db
      .query("doctors")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    clinicName: v.optional(v.string()),
    clinicAddress: v.optional(v.string()),
    specialization: v.optional(v.string()),
    registrationNo: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db.insert("doctors", { ...args, userId: user._id });
  },
});

export const update = mutation({
  args: {
    id: v.id("doctors"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    clinicName: v.optional(v.string()),
    clinicAddress: v.optional(v.string()),
    specialization: v.optional(v.string()),
    registrationNo: v.optional(v.string()),
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
  args: { id: v.id("doctors") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
