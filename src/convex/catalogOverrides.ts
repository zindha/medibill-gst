import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./users";
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

/** All of the current user's catalog overrides. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db
      .query("catalogOverrides")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
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
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const existing = await getOverride(ctx, user._id, args.catalogKey);
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
        userId: user._id,
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
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const existing = await getOverride(ctx, user._id, args.catalogKey);
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
        userId: user._id,
      });
    }
  },
});

/** Remove all overrides for a catalog entry (revert to dataset defaults). */
export const remove = mutation({
  args: { catalogKey: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const existing = await getOverride(ctx, user._id, args.catalogKey);
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
