import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { type Role } from "./schema";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

/** The result of resolving a user's currently active store. */
export type ActiveStore = {
  /** The store the user is currently working in. */
  storeId: Id<"stores">;
  /** The userId all business data is scoped to (the store's owner). */
  ownerId: Id<"users">;
  /** The user's role within the active store. */
  role: Role;
  /** True if the logged-in user is the owner of the store (vs a member). */
  isOwner: boolean;
};

type AnyCtx = QueryCtx | MutationCtx;

/**
 * Resolve the active store for the signed-in user.
 *
 * Every business query/mutation should scope data by the returned `ownerId`
 * (which equals the store's owner's userId), so owners AND members all read and
 * write the same store-wide data. Existing single-user data keeps working
 * because an owner operating alone is simply their own store's owner.
 *
 * Returns null when there's no authenticated user or no accessible store yet.
 */
export async function getActiveStore(
  ctx: AnyCtx,
): Promise<ActiveStore | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const user = await ctx.db.get(userId);
  if (!user) return null;

  // Determine which store this user can access. Prefer the explicitly selected
  // activeStoreId; fall back to a store they own (their own pharmacy).
  let storeId: Id<"stores"> | null = null;

  if (user.activeStoreId) {
    const role = await getRoleInStore(ctx, user.activeStoreId, userId);
    if (role) storeId = user.activeStoreId;
  }

  if (storeId === null) {
    // Fall back to the user's own store (owner).
    const owned = await ctx.db
      .query("stores")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (owned) {
      return {
        storeId: owned._id,
        ownerId: owned.ownerId,
        role: "admin",
        isOwner: true,
      };
    }
    return null;
  }

  // Reload store to read its owner.
  const store = await ctx.db.get(storeId);
  if (!store) return null;
  const membership = await ctx.db
    .query("storeMembers")
    .withIndex("by_store", (q) => q.eq("storeId", storeId))
    .filter((m) => m.eq(m.field("userId"), userId))
    .first();

  const role: Role =
    store.ownerId === userId ? "admin" : (membership?.role ?? "user");

  return {
    storeId,
    ownerId: store.ownerId,
    role,
    isOwner: store.ownerId === userId,
  };
}

/** Resolve a user's role in a store: owner -> admin, else membership. */
export async function getRoleInStore(
  ctx: AnyCtx,
  storeId: Id<"stores">,
  userId: Id<"users">,
): Promise<Role | null> {
  const store = await ctx.db.get(storeId);
  if (!store) return null;
  if (store.ownerId === userId) return "admin";
  const member = await ctx.db
    .query("storeMembers")
    .withIndex("by_store", (q) => q.eq("storeId", storeId))
    .filter((m) => m.eq(m.field("userId"), userId))
    .first();
  // Pending members haven't been approved yet — no access until active.
  if (!member || member.status === "pending") return null;
  return member.role;
}

/** Get the current user document, or null if signed out. */
export const getCurrentUser = async (
  ctx: AnyCtx,
): Promise<Doc<"users"> | null> => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
};