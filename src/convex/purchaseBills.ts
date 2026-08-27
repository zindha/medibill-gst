import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db
      .query("purchaseBills")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    supplierName: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
    billNo: v.optional(v.string()),
    billDate: v.optional(v.string()),
    amount: v.number(),
    gstAmount: v.optional(v.number()),
    imageStorageId: v.optional(v.id("_storage")),
    ocrText: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("processed"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.db.insert("purchaseBills", {
      ...args,
      userId: user._id,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("purchaseBills"),
    supplierName: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
    billNo: v.optional(v.string()),
    billDate: v.optional(v.string()),
    amount: v.optional(v.number()),
    gstAmount: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("purchaseBills") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await ctx.db.delete(args.id);
  },
});

const GST_RATES = [0, 5, 12, 18, 28] as const;

export const importLineItems = mutation({
  args: {
    billId: v.id("purchaseBills"),
    items: v.array(
      v.object({
        name: v.string(),
        quantity: v.number(),
        rate: v.number(),
        gstRate: v.number(),
        hsnCode: v.optional(v.string()),
        unit: v.optional(v.string()),
        category: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const bill = await ctx.db.get(args.billId);
    if (!bill || bill.userId !== user._id) {
      throw new Error("Bill not found");
    }

    const sanitizeGst = (rate: number): 0 | 5 | 12 | 18 | 28 =>
      GST_RATES.includes(rate as (typeof GST_RATES)[number])
        ? (rate as 0 | 5 | 12 | 18 | 28)
        : 5;

    const merged = new Map<
      string,
      {
        name: string;
        quantity: number;
        rate: number;
        gstRate: number;
        hsnCode?: string;
        unit?: string;
        category?: string;
      }
    >();
    for (const item of args.items) {
      const name = item.name.trim();
      if (!name || item.quantity <= 0) continue;
      const key = name.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        merged.set(key, { ...item, name });
      }
    }

    const medicines = await ctx.db
      .query("medicines")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const byName = new Map(
      medicines.map((m) => [m.name.toLowerCase(), m]),
    );

    let created = 0;
    let updated = 0;

    for (const item of merged.values()) {
      const existing = byName.get(item.name.toLowerCase());
      if (existing) {
        await ctx.db.patch(existing._id, {
          quantity: existing.quantity + item.quantity,
          purchasePrice: item.rate,
          gstRate: sanitizeGst(item.gstRate),
          ...(item.hsnCode ? { hsnCode: item.hsnCode } : {}),
          ...(existing.sellingPrice === 0
            ? { sellingPrice: item.rate }
            : {}),
        });
        updated++;
      } else {
        await ctx.db.insert("medicines", {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit || "Nos",
          category: item.category || undefined,
          purchasePrice: item.rate,
          sellingPrice: item.rate,
          gstRate: sanitizeGst(item.gstRate),
          hsnCode: item.hsnCode || undefined,
          userId: user._id,
        });
        created++;
      }
    }

    await ctx.db.patch(args.billId, {
      lineItems: [...merged.values()].map((i) => ({
        name: i.name,
        quantity: i.quantity,
        rate: i.rate,
        gstRate: sanitizeGst(i.gstRate),
        hsnCode: i.hsnCode || undefined,
      })),
      status: "processed",
    });

    return { created, updated };
  },
});
