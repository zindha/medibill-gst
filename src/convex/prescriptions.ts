import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db
      .query("prescriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    patientName: v.string(),
    patientAge: v.optional(v.number()),
    patientGender: v.optional(v.string()),
    doctorId: v.optional(v.id("doctors")),
    doctorName: v.optional(v.string()),
    date: v.string(),
    notes: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db.insert("prescriptions", { ...args, userId: user._id });
  },
});

export const remove = mutation({
  args: { id: v.id("prescriptions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
