import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getActiveStore, getCurrentUser } from "./users";
import { roleValidator } from "./schema";

/** Generate a short, human-friendly join code for a store. */
function generateJoinCode(): string {
  // Unambiguous, readable alphabet.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/** All stores the signed-in user can access (as owner or member). */
export const myStores = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Stores they own
    const owned = await ctx.db
      .query("stores")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    // Stores they're a member of
    const memberships = await ctx.db
      .query("storeMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const memberStores = (
      await Promise.all(
        memberships.map((m) => ctx.db.get(m.storeId)),
      )
    ).filter((s) => s !== null);

    const all = [...owned, ...memberStores];
    return all.map((s) => ({
      _id: s._id,
      name: s.name,
      isOwner: s.ownerId === user._id,
      active: user.activeStoreId === s._id,
    }));
  },
});

/** The user's currently active store + business details. */
export const activeStore = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) return null;
    const store = await ctx.db.get(active.storeId);
    if (!store) return null;
    return {
      _id: store._id,
      name: store.name,
      ownerId: store.ownerId,
      address: store.address,
      phone: store.phone,
      email: store.email,
      gstin: store.gstin,
      drugLicenseNo: store.drugLicenseNo,
      joinCode: store.joinCode,
      role: active.role,
      isOwner: active.isOwner,
    };
  },
});

/**
 * Ensure the signed-in user always has at least one store they own, then make
 * it active. Call this once after sign-in/login to bootstrap new accounts.
 */
export const ensureStore = mutation({
  args: {
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // If they already have an accessible active store, leave it.
    if (user.activeStoreId) {
      const existing = await ctx.db.get(user.activeStoreId);
      if (existing) {
        const role =
          existing.ownerId === user._id
            ? "admin"
            : await (async () => {
                const member = await ctx.db
                  .query("storeMembers")
                  .withIndex("by_store", (q) =>
                    q.eq("storeId", existing._id),
                  )
                  .filter((m) => m.eq(m.field("userId"), user._id))
                  .first();
                return member ? member.role : null;
              })();
        if (role) return existing._id;
      }
    }

    // Find or create their own store.
    const owned = await ctx.db
      .query("stores")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .first();
    let storeId = owned?._id;
    if (!storeId) {
      storeId = await ctx.db.insert("stores", {
        name: args.name?.trim() || `${user.name || "My"} Store`,
        ownerId: user._id,
        joinCode: generateJoinCode(),
      });
    }
    await ctx.db.patch(user._id, { activeStoreId: storeId });
    return storeId;
  },
});

/** Create a brand new store owned by the signed-in user and make it active. */
export const createStore = mutation({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    gstin: v.optional(v.string()),
    drugLicenseNo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const storeId = await ctx.db.insert("stores", {
      name: args.name.trim(),
      ownerId: user._id,
      address: args.address,
      phone: args.phone,
      email: args.email,
      gstin: args.gstin,
      drugLicenseNo: args.drugLicenseNo,
      joinCode: generateJoinCode(),
    });
    await ctx.db.patch(user._id, { activeStoreId: storeId });
    return storeId;
  },
});

/** Switch the signed-in user's active store. */
export const setActiveStore = mutation({
  args: { storeId: v.id("stores") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const store = await ctx.db.get(args.storeId);
    if (!store) throw new Error("Store not found");
    // Must be owner or member.
    if (store.ownerId !== user._id) {
      const member = await ctx.db
        .query("storeMembers")
        .withIndex("by_store", (q) => q.eq("storeId", args.storeId))
        .filter((m) => m.eq(m.field("userId"), user._id))
        .first();
      if (!member) throw new Error("Not a member of this store");
    }
    await ctx.db.patch(user._id, { activeStoreId: args.storeId });
  },
});

/** Update the active store's business details (owner/admin only). */
export const updateStore = mutation({
  args: {
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    gstin: v.optional(v.string()),
    drugLicenseNo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    if (active.role !== "admin")
      throw new Error("Only admins can edit store details");
    const patch: Record<string, string> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.address !== undefined)
      patch.address = args.address;
    if (args.phone !== undefined) patch.phone = args.phone;
    if (args.email !== undefined) patch.email = args.email;
    if (args.gstin !== undefined) patch.gstin = args.gstin;
    if (args.drugLicenseNo !== undefined)
      patch.drugLicenseNo = args.drugLicenseNo;
    await ctx.db.patch(active.storeId, patch);
  },
});

/** List members of the active store (owner/admin only). */
export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) return [];
    if (active.role !== "admin") return [];

    const members = await ctx.db
      .query("storeMembers")
      .withIndex("by_store", (q) => q.eq("storeId", active.storeId))
      .collect();
    const rows = [];
    for (const m of members) {
      const memberUser = await ctx.db.get(m.userId);
      rows.push({
        _id: m._id,
        userId: m.userId,
        role: m.role,
        name: memberUser?.name ?? "Unknown",
        email: memberUser?.email ?? null,
        phone: memberUser?.phone ?? null,
        isOwner: false,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

/**
 * Add a user to the active store by their email or phone. If the user hasn't
 * signed up yet, we can't add them (invite requires an existing account for this
 * v1, since auth uses email OTP). Returns the membership id.
 */
export const addMember = mutation({
  args: {
    identifier: v.string(),
    role: v.optional(roleValidator),
  },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    if (active.role !== "admin")
      throw new Error("Only admins can add members");
    const id = args.identifier.trim().toLowerCase();
    // Look up by email first, then normalized phone.
    let target: Doc<"users"> | null = null;
    if (id.includes("@")) {
      const emailUsers = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", id))
        .collect();
      target = emailUsers[0] ?? null;
    } else {
      const normalized = id.replace(/\D/g, "");
      const phoneUsers = await ctx.db
        .query("users")
        .withIndex("phone", (q) => q.eq("phone", id))
        .collect();
      target =
        phoneUsers[0] ??
        (
          await ctx.db
            .query("users")
            .withIndex("phone", (q) => q.eq("phone", normalized))
            .collect()
        )[0] ??
        null;
    }

    if (!target) throw new Error("No account found with that email/phone");

    // Already a member?
    const existing = await ctx.db
      .query("storeMembers")
      .withIndex("by_store", (q) => q.eq("storeId", active.storeId))
      .filter((m) => m.eq(m.field("userId"), target._id))
      .first();
    if (existing) throw new Error("Already a member");

    // Owner can't be added as a member of their own store.
    if (target._id === active.ownerId)
      throw new Error("This account owns the store");

    const role = args.role ?? "user";
    await ctx.db.insert("storeMembers", {
      storeId: active.storeId,
      userId: target._id,
      role,
    });
    // Give the new member a working active store if they have none.
    const targetUser = await ctx.db.get(target._id);
    if (
      targetUser &&
      !targetUser.activeStoreId
    ) {
      const accessible = await ctx.db
        .query("storeMembers")
        .withIndex("by_user", (q) => q.eq("userId", target._id))
        .collect();
      if (accessible.length === 0) {
        await ctx.db.patch(target._id, { activeStoreId: active.storeId });
      }
    }
  },
});

/** Remove a member from the active store (owner/admin only). */
export const removeMember = mutation({
  args: { memberId: v.id("storeMembers") },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    if (active.role !== "admin")
      throw new Error("Only admins can remove members");
    const member = await ctx.db.get(args.memberId);
    if (!member) return;
    if (member.storeId !== active.storeId)
      throw new Error("Not a member of this store");
    await ctx.db.delete(args.memberId);
  },
});

/** Change a member's role in the active store (owner/admin only). */
export const setMemberRole = mutation({
  args: { memberId: v.id("storeMembers"), role: roleValidator },
  handler: async (ctx, args) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    if (active.role !== "admin")
      throw new Error("Only admins can change roles");
    const member = await ctx.db.get(args.memberId);
    if (!member || member.storeId !== active.storeId)
      throw new Error("Member not found");
    await ctx.db.patch(args.memberId, { role: args.role });
  },
});

/** Generate a fresh join code for the active store (owner/admin only). */
export const regenerateJoinCode = mutation({
  args: {},
  handler: async (ctx) => {
    const active = await getActiveStore(ctx);
    if (!active) throw new Error("Not authenticated");
    if (active.role !== "admin")
      throw new Error("Only admins can reset the join code");
    const code = generateJoinCode();
    await ctx.db.patch(active.storeId, { joinCode: code });
    return code;
  },
});

/**
 * Join an existing store by its join code. The signed-in user becomes a member
 * (role "member") of the store and it is made their active store.
 */
export const joinStoreByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const code = args.code.trim().toUpperCase();
    if (!code) throw new Error("Please enter a join code");

    const store = await ctx.db
      .query("stores")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", code))
      .first();
    if (!store) throw new Error("No store found with that join code");

    // Owner doesn't need a membership row.
    if (store.ownerId !== user._id) {
      const existing = await ctx.db
        .query("storeMembers")
        .withIndex("by_store", (q) => q.eq("storeId", store._id))
        .filter((m) => m.eq(m.field("userId"), user._id))
        .first();
      if (!existing) {
        await ctx.db.insert("storeMembers", {
          storeId: store._id,
          userId: user._id,
          role: "member",
        });
      }
    }

    await ctx.db.patch(user._id, { activeStoreId: store._id });
    return { storeId: store._id, name: store.name };
  },
});