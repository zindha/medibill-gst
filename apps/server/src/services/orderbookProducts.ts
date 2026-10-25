import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { foldText, searchPattern, MIN_SUBSEQUENCE_LEN } from "../lib/normalizeSearch.js";
import { medicines } from "../db/schema/index.js";
import { db } from "../db/index.js";
import type { ProductHit } from "./orderbook.js";

/**
 * Product search for the orderbook workspace: same folded / subsequence search
 * as the medicine master, restricted to the owner's active medicines.
 */
export async function searchMedicinesForOwner(
  ownerId: string,
  q: string,
  limit: number,
  _distributorId?: string
): Promise<ProductHit[]> {
  const conds = [eq(medicines.createdBy, ownerId), eq(medicines.isActive, true)];
  if (q) {
    const pat = searchPattern(q);
    const matches = [
      sql`fold(${medicines.name}) LIKE ${pat}`,
      sql`fold(${medicines.genericName}) LIKE ${pat}`,
      sql`fold(${medicines.brand}) LIKE ${pat}`,
      sql`fold(${medicines.composition}) LIKE ${pat}`,
    ];
    if (foldText(q).length >= MIN_SUBSEQUENCE_LEN) {
      matches.push(
        sql`is_subseq(${q}, ${medicines.name})`,
        sql`is_subseq(${q}, ${medicines.brand})`
      );
    }
    conds.push(or(...matches)!);
  }
  const rows = await db
    .select({
      id: medicines.id,
      name: medicines.name,
      packSize: medicines.packSize,
      purchasePrice: medicines.purchasePrice,
      sellingPrice: medicines.sellingPrice,
    })
    .from(medicines)
    .where(and(...conds))
    .orderBy(asc(medicines.name))
    .limit(Math.min(100, Math.max(1, limit)));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    packSize: r.packSize ?? null,
    manufacturerName: null,
    purchasePrice: r.purchasePrice ?? 0,
    sellingPrice: r.sellingPrice ?? 0,
  }));
}
