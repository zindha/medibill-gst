import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const list = query({
  args: { status: v.optional(v.union(v.literal("pending"), v.literal("sent"), v.literal("completed"))) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    let q = ctx.db.query("refillReminders").withIndex("by_user", (q) => q.eq("userId", user._id));
    if (args.status) {
      q = q.filter((r) => r.eq(r.field("status"), args.status!));
    }
    return await q.order("desc").collect();
  },
});

export const getDueReminders = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const today = new Date().toISOString().split("T")[0];
    return await ctx.db
      .query("refillReminders")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((r) => r.lte(r.field("reminderDate"), today))
      .filter((r) => r.eq(r.field("status"), "pending"))
      .collect();
  },
});

export const create = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    medicineId: v.optional(v.id("medicines")),
    medicineName: v.string(),
    lastPurchaseDate: v.string(),
    reminderDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db.insert("refillReminders", {
      ...args,
      status: "pending",
      userId: user._id,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("refillReminders"),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("completed")),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = { status: args.status };
    if (args.status === "sent") {
      patch.sentAt = Date.now();
    }
    await ctx.db.patch(args.id, patch);
  },
});
