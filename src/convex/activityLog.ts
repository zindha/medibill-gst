import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getActiveStore } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    return await ctx.db
      .query("activityLog")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .order("desc")
      .take(100);
  },
});

export const getByEntity = query({
  args: { entity: v.string(), entityId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activityLog")
      .withIndex("by_entity", (q) => q.eq("entity", args.entity).eq("entityId", args.entityId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    action: v.string(),
    entity: v.string(),
    entityId: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) return;
    await ctx.db.insert("activityLog", {
      userId: active.ownerId,
      action: args.action,
      entity: args.entity,
      entityId: args.entityId,
      details: args.details,
      timestamp: Date.now(),
    });
  },
});
