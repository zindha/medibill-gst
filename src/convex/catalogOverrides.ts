import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getActiveStore } from "./users";
import { gstRateValidator } from "./schema";

async function getOverride(
  ctx: MutationCtx,
  userId: Id<"users">,
  catalogKey: string,
) {
  return await ctx.db
    .query("catalogOverrides")
    .withIndex("by_key", (q) =>
      q.eq("userId", userId).eq("catalogKey", catalogKey),
    )
    .first();
}

/** All of the active store's catalog overrides. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    return await ctx.db
      .query("catalogOverrides")
      .withIndex("by_user", (q) => q.eq("userId", active.ownerId))
      .collect();
  },
});

/** Flag a catalog entry as unavailable (or available) in the user's region. */
export const setUnavailable = mutation({
  args: {
    catalogKey: v.string(),
    medicineName: v.string(),
    company: v.optional(v.string()),
    unavailable: v.boolean(),
  },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    const existing = await getOverride(ctx, active.ownerId, args.catalogKey);
    if (existing) {
      if (
        !args.unavailable &&
        existing.gstRate === undefined &&
        existing.hsnCode === undefined
      ) {
        // Nothing left to override — clean up the doc
        await ctx.db.delete(existing._id);
      } else {
        await ctx.db.patch(existing._id, { unavailable: args.unavailable });
      }
    } else if (args.unavailable) {
      await ctx.db.insert("catalogOverrides", {
        catalogKey: args.catalogKey,
        medicineName: args.medicineName,
        company: args.company,
        unavailable: true,
        userId: active.ownerId,
      });
    }
  },
});

/** Save a verified GST rate (and optional HSN) for a catalog entry. */
export const saveGst = mutation({
  args: {
    catalogKey: v.string(),
    medicineName: v.string(),
    company: v.optional(v.string()),
    gstRate: gstRateValidator,
    hsnCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    const existing = await getOverride(ctx, active.ownerId, args.catalogKey);
    if (existing) {
      await ctx.db.patch(existing._id, {
        gstRate: args.gstRate,
        hsnCode: args.hsnCode || undefined,
        verified: true,
      });
    } else {
      await ctx.db.insert("catalogOverrides", {
        catalogKey: args.catalogKey,
        medicineName: args.medicineName,
        company: args.company,
        gstRate: args.gstRate,
        hsnCode: args.hsnCode || undefined,
        verified: true,
        userId: active.ownerId,
      });
    }
  },
});

/** Remove all overrides for a catalog entry (revert to dataset defaults). */
export const remove = mutation({
  args: { catalogKey: v.string() },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    const existing = await getOverride(ctx, active.ownerId, args.catalogKey);
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
