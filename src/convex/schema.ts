import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const GST_RATES = [0, 5, 12, 18, 28] as const;
export const gstRateValidator = v.union(
  v.literal(0),
  v.literal(5),
  v.literal(12),
  v.literal(18),
  v.literal(28),
);
export type GstRate = Infer<typeof gstRateValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables,

    // the users table is the default users table
    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    // Suppliers / Distributors
    suppliers: defineTable({
      name: v.string(),
      contactPerson: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      address: v.optional(v.string()),
      gstin: v.optional(v.string()),
      userId: v.id("users"),
    }).index("by_user", ["userId"]),

    // Medicines / Products
    medicines: defineTable({
      name: v.string(),
      brand: v.optional(v.string()),
      category: v.optional(v.string()),
      batchNo: v.optional(v.string()),
      expiryDate: v.optional(v.string()),
      quantity: v.number(),
      unit: v.optional(v.string()),
      purchasePrice: v.number(),
      sellingPrice: v.number(),
      gstRate: gstRateValidator,
      hsnCode: v.optional(v.string()),
      supplierId: v.optional(v.id("suppliers")),
      userId: v.id("users"),
    }).index("by_user", ["userId"]),

    // Invoices (Sales Bills)
    invoices: defineTable({
      invoiceNo: v.string(),
      customerName: v.optional(v.string()),
      customerPhone: v.optional(v.string()),
      customerAddress: v.optional(v.string()),
      date: v.string(),
      subtotal: v.number(),
      totalGst: v.number(),
      cgst: v.number(),
      sgst: v.number(),
      igst: v.number(),
      discount: v.optional(v.number()),
      grandTotal: v.number(),
      paymentMode: v.optional(v.string()),
      notes: v.optional(v.string()),
      userId: v.id("users"),
    }).index("by_user", ["userId"]),

    // Invoice Line Items
    invoiceItems: defineTable({
      invoiceId: v.id("invoices"),
      medicineId: v.optional(v.id("medicines")),
      medicineName: v.string(),
      hsnCode: v.optional(v.string()),
      quantity: v.number(),
      unit: v.optional(v.string()),
      rate: v.number(),
      amount: v.number(),
      gstRate: gstRateValidator,
      gstAmount: v.number(),
      cgst: v.number(),
      sgst: v.number(),
    }).index("by_invoice", ["invoiceId"]),

    // Purchase Bills (scanned/imported)
    purchaseBills: defineTable({
      supplierId: v.optional(v.id("suppliers")),
      supplierName: v.optional(v.string()),
      billNo: v.optional(v.string()),
      billDate: v.optional(v.string()),
      amount: v.number(),
      gstAmount: v.optional(v.number()),
      imageStorageId: v.optional(v.id("_storage")),
      ocrText: v.optional(v.string()),
      status: v.union(v.literal("pending"), v.literal("processed")),
      userId: v.id("users"),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
