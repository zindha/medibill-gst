import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getActiveStore } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    return await ctx.db
      .query("prescriptions")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
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
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    return await ctx.db.insert("prescriptions", { ...args, userId: active.ownerId });
  },
});

export const remove = mutation({
  args: { id: v.id("prescriptions") },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    await ctx.db.delete(args.id);
  },
});
