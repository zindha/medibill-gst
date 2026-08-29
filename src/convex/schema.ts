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
      phone: v.optional(v.string()),
      // currently selected pharmacy/store for this user; a user may belong to
      // multiple stores and switch between them (activeStoreId -> stores._id)
      activeStoreId: v.optional(v.id("stores")),
    }).index("email", ["email"]).index("phone", ["phone"]),

    // Pharmacies / Medical stores. A store's owner is the user who created it;
    // all business data (medicines, invoices, etc.) is keyed by the owner's
    // userId. Members (see storeMembers) work in that store's data.
    stores: defineTable({
      name: v.string(),
      ownerId: v.id("users"),
      address: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      gstin: v.optional(v.string()),
      drugLicenseNo: v.optional(v.string()),
      // Short, shareable code admins give out so others can join this store.
      joinCode: v.optional(v.string()),
    })
      .index("by_owner", ["ownerId"])
      .index("by_joinCode", ["joinCode"]),

    // Membership: links a user to a store they can access, with a role.
    // The owner row is implicit (stores.ownerId acts as admin); additional
    // members are recorded here so the same email/mobile can join many stores.
    storeMembers: defineTable({
      storeId: v.id("stores"),
      userId: v.id("users"),
      role: roleValidator,
    })
      .index("by_store", ["storeId"])
      .index("by_user", ["userId"]),


    // Suppliers / Distributors
    suppliers: defineTable({
      name: v.string(),
      contactPerson: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      address: v.optional(v.string()),
      gstin: v.optional(v.string()),
      paymentTerms: v.optional(v.string()),
      creditLimit: v.optional(v.number()),
      openingBalance: v.optional(v.number()),
      userId: v.id("users"),
    }).index("by_user", ["userId"]),

    // Customers
    customers: defineTable({
      name: v.string(),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      address: v.optional(v.string()),
      gstin: v.optional(v.string()),
      creditLimit: v.optional(v.number()),
      openingBalance: v.optional(v.number()),
      notes: v.optional(v.string()),
      totalPurchases: v.optional(v.number()),
      lastPurchaseDate: v.optional(v.string()),
      userId: v.id("users"),
    }).index("by_user", ["userId"]),

    // Doctors / Clinics
    doctors: defineTable({
      name: v.string(),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      clinicName: v.optional(v.string()),
      clinicAddress: v.optional(v.string()),
      specialization: v.optional(v.string()),
      registrationNo: v.optional(v.string()),
      notes: v.optional(v.string()),
      userId: v.id("users"),
    }).index("by_user", ["userId"]),

    // Medicines / Products
    medicines: defineTable({
      name: v.string(),
      brand: v.optional(v.string()),
      category: v.optional(v.string()),
      composition: v.optional(v.string()),
      batchNo: v.optional(v.string()),
      expiryDate: v.optional(v.string()),
      quantity: v.number(),
      minQuantity: v.optional(v.number()),
      unit: v.optional(v.string()),
      barcode: v.optional(v.string()),
      purchasePrice: v.number(),
      sellingPrice: v.number(),
      gstRate: gstRateValidator,
      hsnCode: v.optional(v.string()),
      substituteIds: v.optional(v.array(v.id("medicines"))),
      supplierId: v.optional(v.id("suppliers")),
      userId: v.id("users"),
    }).index("by_user", ["userId"]).index("by_barcode", ["barcode"]).index("by_name", ["name"]),

    // Invoices (Sales Bills)
    invoices: defineTable({
      invoiceNo: v.string(),
      customerId: v.optional(v.id("customers")),
      customerName: v.optional(v.string()),
      customerPhone: v.optional(v.string()),
      customerAddress: v.optional(v.string()),
      doctorId: v.optional(v.id("doctors")),
      prescriptionId: v.optional(v.id("prescriptions")),
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
      status: v.optional(v.union(v.literal("paid"), v.literal("unpaid"), v.literal("partial"))),
      amountPaid: v.optional(v.number()),
      userId: v.id("users"),
    }).index("by_user", ["userId"]).index("by_customer", ["customerId"]).index("by_date", ["date"]),

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

    // Sales Returns
    salesReturns: defineTable({
      returnNo: v.string(),
      invoiceId: v.id("invoices"),
      customerName: v.optional(v.string()),
      date: v.string(),
      reason: v.optional(v.string()),
      subtotal: v.number(),
      totalGst: v.number(),
      cgst: v.number(),
      sgst: v.number(),
      igst: v.number(),
      grandTotal: v.number(),
      userId: v.id("users"),
    }).index("by_user", ["userId"]).index("by_invoice", ["invoiceId"]),

    salesReturnItems: defineTable({
      returnId: v.id("salesReturns"),
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
    }).index("by_return", ["returnId"]),

    // Purchase Returns
    purchaseReturns: defineTable({
      returnNo: v.string(),
      supplierId: v.optional(v.id("suppliers")),
      supplierName: v.optional(v.string()),
      date: v.string(),
      reason: v.optional(v.string()),
      subtotal: v.number(),
      totalGst: v.number(),
      grandTotal: v.number(),
      userId: v.id("users"),
    }).index("by_user", ["userId"]),

    purchaseReturnItems: defineTable({
      returnId: v.id("purchaseReturns"),
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
    }).index("by_return", ["returnId"]),

    // Prescriptions
    prescriptions: defineTable({
      patientName: v.string(),
      patientAge: v.optional(v.number()),
      patientGender: v.optional(v.string()),
      doctorId: v.optional(v.id("doctors")),
      doctorName: v.optional(v.string()),
      date: v.string(),
      notes: v.optional(v.string()),
      imageStorageId: v.optional(v.id("_storage")),
      userId: v.id("users"),
    }).index("by_user", ["userId"]),

    // Payments / Accounting
    payments: defineTable({
      date: v.string(),
      type: v.union(v.literal("received"), v.literal("paid"), v.literal("expense")),
      category: v.optional(v.string()),
      amount: v.number(),
      reference: v.optional(v.string()),
      invoiceId: v.optional(v.id("invoices")),
      customerId: v.optional(v.id("customers")),
      supplierId: v.optional(v.id("suppliers")),
      description: v.optional(v.string()),
      paymentMode: v.optional(v.string()),
      userId: v.id("users"),
    }).index("by_user", ["userId"]).index("by_type", ["type"]).index("by_invoice", ["invoiceId"]).index("by_date", ["date"]),

    // Credit Accounts (Udhar/Khata)
    creditAccounts: defineTable({
      customerId: v.optional(v.id("customers")),
      customerName: v.optional(v.string()),
      supplierId: v.optional(v.id("suppliers")),
      supplierName: v.optional(v.string()),
      type: v.union(v.literal("customer"), v.literal("supplier")),
      balance: v.number(),
      lastTransactionDate: v.optional(v.string()),
      userId: v.id("users"),
    }).index("by_user", ["userId"]).index("by_customer", ["customerId"]).index("by_supplier", ["supplierId"]),

    // Refill Reminders
    refillReminders: defineTable({
      customerId: v.optional(v.id("customers")),
      customerName: v.optional(v.string()),
      customerPhone: v.optional(v.string()),
      medicineId: v.optional(v.id("medicines")),
      medicineName: v.string(),
      lastPurchaseDate: v.string(),
      reminderDate: v.string(),
      status: v.union(v.literal("pending"), v.literal("sent"), v.literal("completed")),
      sentAt: v.optional(v.number()),
      notes: v.optional(v.string()),
      userId: v.id("users"),
    }).index("by_user", ["userId"]).index("by_status", ["status"]),

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
      lineItems: v.optional(
        v.array(
          v.object({
            name: v.string(),
            quantity: v.number(),
            rate: v.number(),
            gstRate: gstRateValidator,
            hsnCode: v.optional(v.string()),
          }),
        ),
      ),
      status: v.union(v.literal("pending"), v.literal("processed")),
      userId: v.id("users"),
    }).index("by_user", ["userId"]).index("by_status", ["status"]),

    // Activity Log / Audit Trail
    activityLog: defineTable({
      userId: v.id("users"),
      action: v.string(),
      entity: v.string(),
      entityId: v.optional(v.string()),
      details: v.optional(v.string()),
      timestamp: v.number(),
    }).index("by_user", ["userId"]).index("by_entity", ["entity", "entityId"]),

    // Per-user overrides for medicine catalog entries (region availability
    // flags and verified GST/HSN values). catalogKey is `${name}::${company}`.
    catalogOverrides: defineTable({
      catalogKey: v.string(),
      medicineName: v.string(),
      company: v.optional(v.string()),
      unavailable: v.optional(v.boolean()),
      gstRate: v.optional(gstRateValidator),
      hsnCode: v.optional(v.string()),
      verified: v.optional(v.boolean()),
      userId: v.id("users"),
    }).index("by_user", ["userId"]).index("by_key", ["userId", "catalogKey"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
