import { v } from "convex/values";
import { query } from "./_generated/server";
import { MEDICINE_CATALOG } from "../data/medicineCatalog";

/**
 * Search the built-in Medicine Database (static curated catalog).
 * Returns popular entries when the query is empty so the UI has a useful
 * starting point.
 */
export const search = query({
  args: { query: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const q = (args.query || "").trim().toLowerCase();
    if (!q) {
      return MEDICINE_CATALOG.slice(0, 40);
    }
    return MEDICINE_CATALOG.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.company.toLowerCase().includes(q) ||
        m.composition.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q),
    ).slice(0, 25);
  },
});
