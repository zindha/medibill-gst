import { query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const medicines = await ctx.db
      .query("medicines")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const suppliers = await ctx.db
      .query("suppliers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const lowStock = medicines.filter((m) => m.quantity <= 10);
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
    const totalMedicines = medicines.reduce((sum, m) => sum + m.quantity, 0);
    const totalGst = invoices.reduce((sum, inv) => sum + inv.totalGst, 0);

    // Recent invoices
    const recentInvoices = [...invoices]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 5);

    return {
      totalMedicines: medicines.length,
      totalStock: totalMedicines,
      totalInvoices: invoices.length,
      totalRevenue,
      totalGst,
      totalSuppliers: suppliers.length,
      lowStock,
      lowStockCount: lowStock.length,
      recentInvoices,
    };
  },
});
