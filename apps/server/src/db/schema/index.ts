import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

// ---------------------------------------------------------------------------
// Helper to generate short IDs
// ---------------------------------------------------------------------------
export function generateId() {
  return nanoid(16);
}

// ---------------------------------------------------------------------------
// Enums as const objects
// ---------------------------------------------------------------------------
export const ROLES = {
  ADMIN: "admin",
  PHARMACIST: "pharmacist",
  CASHIER: "cashier",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const GST_RATES = ["0", "5", "12", "18", "28"] as const;
export type GstRate = (typeof GST_RATES)[number];

export const INVENTORY_TRANSACTION_TYPES = {
  STOCK_IN: "stock_in",
  STOCK_OUT: "stock_out",
  PURCHASE: "purchase",
  PURCHASE_RETURN: "purchase_return",
  SALES: "sales",
  SALES_RETURN: "sales_return",
  ADJUSTMENT: "adjustment",
  DAMAGE: "damage",
  EXPIRED: "expired",
  TRANSFER_IN: "transfer_in",
  TRANSFER_OUT: "transfer_out",
} as const;
export type InventoryTransactionType =
  (typeof INVENTORY_TRANSACTION_TYPES)[keyof typeof INVENTORY_TRANSACTION_TYPES];

export const PAYMENT_TYPES = {
  RECEIVED: "received",
  PAID: "paid",
  EXPENSE: "expense",
} as const;
export type PaymentType = (typeof PAYMENT_TYPES)[keyof typeof PAYMENT_TYPES];

export const PAYMENT_MODES = {
  CASH: "cash",
  CARD: "card",
  UPI: "upi",
  CREDIT: "credit",
  OTHER: "other",
  // Offered by the Payments UI; both settle through the BANK account.
  BANK_TRANSFER: "bank_transfer",
  CHEQUE: "cheque",
} as const;
export type PaymentMode = (typeof PAYMENT_MODES)[keyof typeof PAYMENT_MODES];

export const INVOICE_STATUS = {
  PAID: "paid",
  UNPAID: "unpaid",
  PARTIAL: "partial",
  CANCELLED: "cancelled",
} as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const MEMBER_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];

// Prescription workflow (Task 6): pending → verified → dispensed,
// rejected is a terminal-but-reversible state (can be re-verified).
export const PRESCRIPTION_STATUS = ["pending", "verified", "dispensed", "rejected"] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUS)[number];

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  email: text("email"),
  name: text("name"),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  role: text("role").$type<Role>().default(ROLES.CASHIER),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ---------------------------------------------------------------------------
// Stores (Pharmacy business unit)
// ---------------------------------------------------------------------------
export const stores = sqliteTable("stores", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  gstin: text("gstin"),
  drugLicenseNo: text("drug_license_no"),
  // Short code for staff to join
  joinCode: text("join_code"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;

// ---------------------------------------------------------------------------
// Store Members (User ↔ Store access)
// ---------------------------------------------------------------------------
export const storeMembers = sqliteTable(
  "store_members",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").$type<Role>().default(ROLES.CASHIER),
    status: text("status").$type<MemberStatus>().default(MEMBER_STATUS.ACTIVE),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("store_members_store_idx").on(table.storeId),
    index("store_members_user_idx").on(table.userId),
    uniqueIndex("store_members_unique").on(table.storeId, table.userId),
  ]
);

export type StoreMember = typeof storeMembers.$inferSelect;

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
export const suppliers = sqliteTable(
  "suppliers",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    name: text("name").notNull(),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    gstin: text("gstin"),
    paymentTerms: text("payment_terms"),
    creditLimit: real("credit_limit"),
    openingBalance: real("opening_balance").default(0),
    balance: real("balance").default(0), // positive = we owe supplier
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("suppliers_created_by_idx").on(table.createdBy)]
);

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    gstin: text("gstin"),
    creditLimit: real("credit_limit"),
    openingBalance: real("opening_balance").default(0),
    balance: real("balance").default(0), // positive = customer owes us
    notes: text("notes"),
    totalPurchases: real("total_purchases").default(0),
    lastPurchaseDate: text("last_purchase_date"),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("customers_created_by_idx").on(table.createdBy)]
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------
export const doctors = sqliteTable(
  "doctors",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    clinicName: text("clinic_name"),
    clinicAddress: text("clinic_address"),
    specialization: text("specialization"),
    registrationNo: text("registration_no"),
    notes: text("notes"),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("doctors_created_by_idx").on(table.createdBy)]
);

export type Doctor = typeof doctors.$inferSelect;
export type NewDoctor = typeof doctors.$inferInsert;

// ---------------------------------------------------------------------------
// Medicines (Product Master — holds product info, NOT batch-specific stock)
// ---------------------------------------------------------------------------
export const medicines = sqliteTable(
  "medicines",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    name: text("name").notNull(),
    genericName: text("generic_name"),
    brand: text("brand"),
    category: text("category"),
    composition: text("composition"),
    hsnCode: text("hsn_code"),
    gstRate: text("gst_rate").$type<GstRate>().default("12"),
    schedule: text("schedule"), // e.g., "H", "X", "Sch"
    dosageForm: text("dosage_form"), // tablet, syrup, etc.
    strength: text("strength"),
    unit: text("unit").default("unit"), // strip, bottle, etc.
    packSize: text("pack_size"),
    unitsPerPack: real("units_per_pack").default(1), // tablets/capsules per pack (e.g. 15 for a 15-tab Dolo strip)
    barcode: text("barcode"),
    rackLocation: text("rack_location"),
    minQuantity: integer("min_quantity").default(10),
    reorderLevel: integer("reorder_level").default(20),
    purchasePrice: real("purchase_price").default(0),
    sellingPrice: real("selling_price").default(0),
    mrp: real("mrp"),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("medicines_created_by_idx").on(table.createdBy),
    index("medicines_barcode_idx").on(table.barcode),
    index("medicines_name_idx").on(table.name),
  ]
);

export type Medicine = typeof medicines.$inferSelect;
export type NewMedicine = typeof medicines.$inferInsert;

// ---------------------------------------------------------------------------
// Batches (Batch-level inventory — the core of pharmacy stock management)
// ---------------------------------------------------------------------------
export const batches = sqliteTable(
  "batches",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    medicineId: text("medicine_id")
      .notNull()
      .references(() => medicines.id),
    batchNo: text("batch_no").notNull(),
    expiryDate: text("expiry_date").notNull(), // ISO date string YYYY-MM-DD
    mrp: real("mrp").notNull(),
    purchasePrice: real("purchase_price").notNull(),
    sellingPrice: real("selling_price").notNull(),
    quantity: real("quantity").default(0), // current available stock (packs; may be fractional when loose units are sold)
    initialQuantity: real("initial_quantity").default(0),
    freeQuantity: real("free_quantity").default(0),
    supplierId: text("supplier_id").references(() => suppliers.id),
    purchaseBillId: text("purchase_bill_id").references(() => purchaseBills.id),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("batches_medicine_idx").on(table.medicineId),
    index("batches_expiry_idx").on(table.expiryDate),
    index("batches_batch_no_idx").on(table.batchNo),
  ]
);

export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;

// ---------------------------------------------------------------------------
// Inventory Transactions (Full audit trail of every stock movement)
// ---------------------------------------------------------------------------
export const inventoryTransactions = sqliteTable(
  "inventory_transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    medicineId: text("medicine_id")
      .notNull()
      .references(() => medicines.id),
    batchId: text("batch_id").references(() => batches.id),
    type: text("type").$type<InventoryTransactionType>().notNull(),
    quantity: real("quantity").notNull(), // positive for in, negative for out (packs; fractional for loose sales)
    balanceAfter: real("balance_after").notNull(), // batch stock after this tx
    rate: real("rate"), // purchase/selling rate at time of transaction
    invoiceId: text("invoice_id").references(() => invoices.id),
    reference: text("reference"), // invoice number, purchase bill number, etc.
    reason: text("reason"),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("inv_tx_medicine_idx").on(table.medicineId),
    index("inv_tx_batch_idx").on(table.batchId),
    index("inv_tx_type_idx").on(table.type),
    index("inv_tx_created_idx").on(table.createdAt),
  ]
);

export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;

// ---------------------------------------------------------------------------
// Invoices (Sales Bills)
// ---------------------------------------------------------------------------
export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    invoiceNo: text("invoice_no").notNull().unique(),
    customerId: text("customer_id").references(() => customers.id),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    customerAddress: text("customer_address"),
    customerGstin: text("customer_gstin"),
    doctorId: text("doctor_id").references(() => doctors.id),
    doctorName: text("doctor_name"),
    date: text("date").notNull(), // ISO date string
    subtotal: real("subtotal").notNull().default(0),
    totalGst: real("total_gst").notNull().default(0),
    cgst: real("cgst").notNull().default(0),
    sgst: real("sgst").notNull().default(0),
    igst: real("igst").notNull().default(0),
    discountAmount: real("discount_amount").default(0),
    grandTotal: real("grand_total").notNull().default(0),
    amountPaid: real("amount_paid").default(0),
    paymentMode: text("payment_mode").$type<PaymentMode>(),
    status: text("status").$type<InvoiceStatus>().default(INVOICE_STATUS.PAID),
    prescriptionId: text("prescription_id"),
    prescriptionStatus: text("prescription_status").$type<PrescriptionStatus>(),
    notes: text("notes"),
    hold: integer("hold", { mode: "boolean" }).default(false),
    cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
    cancelledBy: text("cancelled_by").references(() => users.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("invoices_invoice_no_idx").on(table.invoiceNo),
    index("invoices_date_idx").on(table.date),
    index("invoices_customer_idx").on(table.customerId),
    index("invoices_created_by_idx").on(table.createdBy),
    index("invoices_status_idx").on(table.status),
    index("invoices_prescription_id_idx").on(table.prescriptionId),
  ]
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

// ---------------------------------------------------------------------------
// Invoice Items
// ---------------------------------------------------------------------------
export const invoiceItems = sqliteTable(
  "invoice_items",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    medicineId: text("medicine_id").references(() => medicines.id),
    medicineName: text("medicine_name").notNull(),
    batchId: text("batch_id").references(() => batches.id),
    batchNo: text("batch_no"),
    expiryDate: text("expiry_date"),
    hsnCode: text("hsn_code"),
    quantity: real("quantity").notNull(),
    unit: text("unit"),
    unitsPerPack: real("units_per_pack").default(1), // tabs per strip — renders "N strips + M tabs" on bills
    mrp: real("mrp").default(0),           // MRP per unit at time of sale
    rate: real("rate").notNull(),          // selling price per unit
    amount: real("amount").notNull(),      // qty × sellingPrice
    gstRate: text("gst_rate").$type<GstRate>().default("12"),
    gstAmount: real("gst_amount").notNull().default(0),
    cgst: real("cgst").notNull().default(0),
    sgst: real("sgst").notNull().default(0),
    discountAmount: real("discount_amount").default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("invoice_items_invoice_idx").on(table.invoiceId)]
);

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;

export const invoiceBatchAllocations = sqliteTable(
  "invoice_batch_allocations",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id),
    invoiceItemId: text("invoice_item_id").notNull().references(() => invoiceItems.id),
    medicineId: text("medicine_id").notNull().references(() => medicines.id),
    batchId: text("batch_id").notNull().references(() => batches.id),
    quantity: real("quantity").notNull(),
    rate: real("rate").notNull(),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index("invoice_batch_allocations_invoice_idx").on(table.invoiceId),
    index("invoice_batch_allocations_item_idx").on(table.invoiceItemId),
    index("invoice_batch_allocations_batch_idx").on(table.batchId),
  ]
);

export type InvoiceBatchAllocation = typeof invoiceBatchAllocations.$inferSelect;

// ---------------------------------------------------------------------------
// Catalog Overrides (per-user medicine database corrections)
// ---------------------------------------------------------------------------
export const catalogOverrides = sqliteTable(
  "catalog_overrides",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    catalogKey: text("catalog_key").notNull(),
    medicineName: text("medicine_name").notNull(),
    company: text("company"),
    gstRate: text("gst_rate").$type<GstRate>(),
    hsnCode: text("hsn_code"),
    verified: integer("verified", { mode: "boolean" }).default(false),
    unavailable: integer("unavailable", { mode: "boolean" }).default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("catalog_overrides_user_key_idx").on(table.createdBy, table.catalogKey),
  ]
);

export type CatalogOverride = typeof catalogOverrides.$inferSelect;

// ---------------------------------------------------------------------------
// Catalog Additions (user-supplied medicines added to the searchable database)
// ---------------------------------------------------------------------------
export const catalogAdditions = sqliteTable(
  "catalog_additions",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    catalogKey: text("catalog_key").notNull(),
    medicineName: text("medicine_name").notNull(),
    company: text("company"),
    composition: text("composition"),
    form: text("form"),
    unit: text("unit"),
    packSize: text("pack_size"),
    price: real("price").default(0),
    gstRate: text("gst_rate").$type<GstRate>().default("5"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("catalog_additions_user_key_idx").on(table.createdBy, table.catalogKey),
  ]
);

export type CatalogAddition = typeof catalogAdditions.$inferSelect;
export type NewCatalogAddition = typeof catalogAdditions.$inferInsert;

// ---------------------------------------------------------------------------
// Sales Returns
// ---------------------------------------------------------------------------
export const salesReturns = sqliteTable(
  "sales_returns",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    returnNo: text("return_no").notNull().unique(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    customerName: text("customer_name"),
    date: text("date").notNull(),
    reason: text("reason"),
    subtotal: real("subtotal").notNull().default(0),
    totalGst: real("total_gst").notNull().default(0),
    cgst: real("cgst").notNull().default(0),
    sgst: real("sgst").notNull().default(0),
    igst: real("igst").notNull().default(0),
    grandTotal: real("grand_total").notNull().default(0),
    refundAmount: real("refund_amount").notNull().default(0),
    refundMode: text("refund_mode").$type<PaymentMode>(),
    status: text("status").default("completed"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("sales_returns_invoice_idx").on(table.invoiceId),
    index("sales_returns_date_idx").on(table.date),
    index("sales_returns_created_by_idx").on(table.createdBy),
  ]
);

export type SalesReturn = typeof salesReturns.$inferSelect;

export const salesReturnItems = sqliteTable(
  "sales_return_items",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    returnId: text("return_id")
      .notNull()
      .references(() => salesReturns.id),
    medicineId: text("medicine_id").references(() => medicines.id),
    medicineName: text("medicine_name").notNull(),
    batchId: text("batch_id").references(() => batches.id),
    batchNo: text("batch_no"),
    hsnCode: text("hsn_code"),
    quantity: integer("quantity").notNull(),
    unit: text("unit"),
    rate: real("rate").notNull(),
    amount: real("amount").notNull(),
    gstRate: text("gst_rate").$type<GstRate>().default("12"),
    gstAmount: real("gst_amount").notNull().default(0),
    cgst: real("cgst").notNull().default(0),
    sgst: real("sgst").notNull().default(0),
    refundAmount: real("refund_amount").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("sales_return_items_return_idx").on(table.returnId)]
);

export type SalesReturnItem = typeof salesReturnItems.$inferSelect;

// ---------------------------------------------------------------------------
// Purchase Bills
// ---------------------------------------------------------------------------
export const purchaseBills = sqliteTable(
  "purchase_bills",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    billNo: text("bill_no").notNull().unique(),
    supplierId: text("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name"),
    billDate: text("bill_date").notNull(),
    dueDate: text("due_date"),
    subtotal: real("subtotal").notNull().default(0),
    totalGst: real("total_gst").notNull().default(0),
    discountAmount: real("discount_amount").default(0),
    grandTotal: real("grand_total").notNull().default(0),
    amountPaid: real("amount_paid").default(0),
    paymentMode: text("payment_mode").$type<PaymentMode>(),
    paymentStatus: text("payment_status")
      .$type<"paid" | "unpaid" | "partial">()
      .default("unpaid"),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("purchase_bills_bill_no_idx").on(table.billNo),
    index("purchase_bills_supplier_idx").on(table.supplierId),
    index("purchase_bills_date_idx").on(table.billDate),
    index("purchase_bills_created_by_idx").on(table.createdBy),
  ]
);

export type PurchaseBill = typeof purchaseBills.$inferSelect;
export type NewPurchaseBill = typeof purchaseBills.$inferInsert;

export const purchaseBillItems = sqliteTable(
  "purchase_bill_items",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    purchaseBillId: text("purchase_bill_id")
      .notNull()
      .references(() => purchaseBills.id),
    medicineId: text("medicine_id").references(() => medicines.id),
    medicineName: text("medicine_name").notNull(),
    batchId: text("batch_id").references(() => batches.id),
    batchNo: text("batch_no"),
    expiryDate: text("expiry_date"),
    hsnCode: text("hsn_code"),
    quantity: integer("quantity").notNull(),
    freeQuantity: integer("free_quantity").default(0),
    unit: text("unit"),
    rate: real("rate").notNull(),
    amount: real("amount").notNull(),
    gstRate: text("gst_rate").$type<GstRate>().default("12"),
    gstAmount: real("gst_amount").notNull().default(0),
    cgst: real("cgst").notNull().default(0),
    sgst: real("sgst").notNull().default(0),
    discountAmount: real("discount_amount").default(0),
    mrp: real("mrp"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("purchase_bill_items_bill_idx").on(table.purchaseBillId),
  ]
);

export type PurchaseBillItem = typeof purchaseBillItems.$inferSelect;

// ---------------------------------------------------------------------------
// Purchase Returns
// ---------------------------------------------------------------------------
export const purchaseReturns = sqliteTable(
  "purchase_returns",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    returnNo: text("return_no").notNull().unique(),
    purchaseBillId: text("purchase_bill_id").references(() => purchaseBills.id),
    supplierId: text("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name"),
    date: text("date").notNull(),
    reason: text("reason"),
    subtotal: real("subtotal").notNull().default(0),
    totalGst: real("total_gst").notNull().default(0),
    grandTotal: real("grand_total").notNull().default(0),
    refundAmount: real("refund_amount").notNull().default(0),
    refundMode: text("refund_mode").$type<PaymentMode>(),
    status: text("status").default("completed"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("purchase_returns_supplier_idx").on(table.supplierId),
    index("purchase_returns_date_idx").on(table.date),
    index("purchase_returns_created_by_idx").on(table.createdBy),
  ]
);

export type PurchaseReturn = typeof purchaseReturns.$inferSelect;

export const purchaseReturnItems = sqliteTable(
  "purchase_return_items",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    returnId: text("return_id")
      .notNull()
      .references(() => purchaseReturns.id),
    medicineId: text("medicine_id").references(() => medicines.id),
    medicineName: text("medicine_name").notNull(),
    batchId: text("batch_id").references(() => batches.id),
    batchNo: text("batch_no"),
    hsnCode: text("hsn_code"),
    quantity: integer("quantity").notNull(),
    unit: text("unit"),
    rate: real("rate").notNull(),
    amount: real("amount").notNull(),
    gstRate: text("gst_rate").$type<GstRate>().default("12"),
    gstAmount: real("gst_amount").notNull().default(0),
    cgst: real("cgst").notNull().default(0),
    sgst: real("sgst").notNull().default(0),
    refundAmount: real("refund_amount").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("purchase_return_items_return_idx").on(table.returnId)]
);

export type PurchaseReturnItem = typeof purchaseReturnItems.$inferSelect;

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------
export const prescriptions = sqliteTable(
  "prescriptions",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    patientName: text("patient_name").notNull(),
    patientAge: integer("patient_age"),
    patientGender: text("patient_gender"),
    customerId: text("customer_id"),
    doctorId: text("doctor_id").references(() => doctors.id),
    doctorName: text("doctor_name"),
    date: text("date").notNull(),
    notes: text("notes"),
    imagePath: text("image_path"),
    status: text("status").$type<PrescriptionStatus>().default("pending"),
    dispensedAt: integer("dispensed_at", { mode: "timestamp" }),
    dispensedInvoiceId: text("dispensed_invoice_id"),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("prescriptions_created_by_idx").on(table.createdBy),
    index("prescriptions_customer_id_idx").on(table.customerId),
    index("prescriptions_status_idx").on(table.status),
  ]
);

export type Prescription = typeof prescriptions.$inferSelect;
export type NewPrescription = typeof prescriptions.$inferInsert;

// ---------------------------------------------------------------------------
// Payments (Cash book / ledger entries)
// ---------------------------------------------------------------------------
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    date: text("date").notNull(),
    type: text("type").$type<PaymentType>().notNull(),
    category: text("category"),
    amount: real("amount").notNull(),
    reference: text("reference"),
    invoiceId: text("invoice_id").references(() => invoices.id),
    customerId: text("customer_id").references(() => customers.id),
    supplierId: text("supplier_id").references(() => suppliers.id),
    description: text("description"),
    paymentMode: text("payment_mode").$type<PaymentMode>(),
    voided: integer("voided", { mode: "boolean" }).default(false), // true when its invoice is cancelled/refunded
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("payments_date_idx").on(table.date),
    index("payments_type_idx").on(table.type),
    index("payments_invoice_idx").on(table.invoiceId),
    index("payments_customer_idx").on(table.customerId),
    index("payments_supplier_idx").on(table.supplierId),
    index("payments_created_by_idx").on(table.createdBy),
  ]
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// ---------------------------------------------------------------------------
// Credit Accounts (Customer/Supplier balance tracking)
// ---------------------------------------------------------------------------
export const creditAccounts = sqliteTable(
  "credit_accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    customerId: text("customer_id").references(() => customers.id),
    supplierId: text("supplier_id").references(() => suppliers.id),
    type: text("type").$type<"customer" | "supplier">().notNull(),
    balance: real("balance").notNull().default(0),
    lastTransactionDate: text("last_transaction_date"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("credit_accounts_customer_idx").on(table.customerId),
    index("credit_accounts_supplier_idx").on(table.supplierId),
    index("credit_accounts_type_idx").on(table.type),
  ]
);

export type CreditAccount = typeof creditAccounts.$inferSelect;

// ---------------------------------------------------------------------------
// Refill Reminders
// ---------------------------------------------------------------------------
export const refillReminders = sqliteTable(
  "refill_reminders",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    customerId: text("customer_id").references(() => customers.id),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    medicineId: text("medicine_id").references(() => medicines.id),
    medicineName: text("medicine_name").notNull(),
    lastPurchaseDate: text("last_purchase_date").notNull(),
    reminderDate: text("reminder_date").notNull(),
    status: text("status")
      .$type<"pending" | "sent" | "completed">()
      .default("pending"),
    sentAt: integer("sent_at", { mode: "timestamp" }),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("refill_reminders_customer_idx").on(table.customerId),
    index("refill_reminders_status_idx").on(table.status),
    index("refill_reminders_created_by_idx").on(table.createdBy),
  ]
);

export type RefillReminder = typeof refillReminders.$inferSelect;

// ---------------------------------------------------------------------------
// Activity Log (Audit Trail)
// ---------------------------------------------------------------------------
export const activityLog = sqliteTable(
  "activity_log",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: text("details"),
    ipAddress: text("ip_address"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("activity_log_user_idx").on(table.userId),
    index("activity_log_entity_idx").on(table.entity, table.entityId),
    index("activity_log_created_idx").on(table.createdAt),
  ]
);

export type ActivityLog = typeof activityLog.$inferSelect;

// ---------------------------------------------------------------------------
// Tax Configuration
// ---------------------------------------------------------------------------
export const taxConfig = sqliteTable(
  "tax_config",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    hsnCode: text("hsn_code").unique(),
    description: text("description"),
    gstRate: text("gst_rate").$type<GstRate>().notNull(),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("tax_config_hsn_idx").on(table.hsnCode)]
);

export type TaxConfig = typeof taxConfig.$inferSelect;

// ---------------------------------------------------------------------------
// Settings (Key-Value store for app configuration)
// ---------------------------------------------------------------------------
export const settings = sqliteTable(
  "settings",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    key: text("key").notNull().unique(),
    value: text("value").notNull(), // JSON string
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("settings_key_idx").on(table.key)]
);

export type Setting = typeof settings.$inferSelect;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("sessions_token_idx").on(table.token),
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_idx").on(table.expiresAt),
  ]
);

export type Session = typeof sessions.$inferSelect;

// ---------------------------------------------------------------------------
// Backup History
// ---------------------------------------------------------------------------
export const backupHistory = sqliteTable(
  "backup_history",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    type: text("type").$type<"daily" | "weekly" | "manual">().notNull(),
    status: text("status").$type<"success" | "failed" | "in_progress">().notNull(),
    filePath: text("file_path"),
    fileSize: integer("file_size"),
    errorMessage: text("error_message"),
    verifiedAt: integer("verified_at", { mode: "timestamp" }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("backup_history_type_idx").on(table.type),
    index("backup_history_created_idx").on(table.createdAt),
  ]
);

export type BackupHistory = typeof backupHistory.$inferSelect;

// ---------------------------------------------------------------------------
// Outbox Events (durable async work: messaging, provider calls, report jobs)
// ---------------------------------------------------------------------------
export const OUTBOX_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  DONE: "done",
  FAILED: "failed",
} as const;
export type OutboxStatus = (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];

export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payload: text("payload").notNull(), // JSON string
    status: text("status").$type<OutboxStatus>().default(OUTBOX_STATUS.PENDING),
    attempts: integer("attempts").default(0),
    availableAt: integer("available_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("outbox_events_created_by_idx").on(table.createdBy),
    index("outbox_events_status_idx").on(table.status),
    index("outbox_events_available_idx").on(table.status, table.availableAt),
    index("outbox_events_aggregate_idx").on(table.aggregateType, table.aggregateId),
    uniqueIndex("outbox_events_idempotency_idx").on(table.idempotencyKey),
  ]
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;

// ---------------------------------------------------------------------------
// Stored Files (prescription images, OCR sources, import attachments)
// ---------------------------------------------------------------------------
export const storedFiles = sqliteTable(
  "stored_files",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    purpose: text("purpose").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    size: integer("size").default(0),
    sha256: text("sha256").notNull(),
    path: text("path").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("stored_files_owner_idx").on(table.ownerId)]
);

export type StoredFile = typeof storedFiles.$inferSelect;

// ---------------------------------------------------------------------------
// Audit Events (append-only trail of sensitive mutations)
// ---------------------------------------------------------------------------
export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    metadata: text("metadata"), // JSON string
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("audit_events_actor_idx").on(table.actorId),
    index("audit_events_entity_idx").on(table.entity, table.entityId),
    index("audit_events_created_idx").on(table.createdAt),
  ]
);

export type AuditEvent = typeof auditEvents.$inferSelect;

// ---------------------------------------------------------------------------
// User Devices (device registry for sync + remote session control)
// ---------------------------------------------------------------------------
export const userDevices = sqliteTable(
  "user_devices",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    deviceName: text("device_name"),
    platform: text("platform"),
    appVersion: text("app_version"),
    deviceToken: text("device_token").unique(),
    revoked: integer("revoked", { mode: "boolean" }).default(false),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("user_devices_user_idx").on(table.userId)]
);

export type UserDevice = typeof userDevices.$inferSelect;

// ---------------------------------------------------------------------------
// Sync Operations (Task 15 — append-only journal of pushed sync operations)
// ---------------------------------------------------------------------------
export const SYNC_OPERATION_STATUSES = ["applied", "conflict", "duplicate", "error"] as const;
export type SyncOperationStatus = (typeof SYNC_OPERATION_STATUSES)[number];

export const SYNC_ENTITIES = ["medicine", "customer", "supplier", "setting"] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const syncOperations = sqliteTable(
  "sync_operations",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    operationId: text("operation_id").notNull(),
    deviceToken: text("device_token"),
    entity: text("entity"),
    action: text("action"),
    payload: text("payload"),
    entityId: text("entity_id"),
    baseVersion: text("base_version"),
    appliedVersion: text("applied_version"),
    status: text("status").$type<SyncOperationStatus>().notNull(),
    conflictJson: text("conflict_json"),
    error: text("error"),
    // timestamp_ms (not the default seconds-granularity `timestamp`): pull
    // ordering and cursor comparisons need millisecond precision.
    appliedAt: integer("applied_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("sync_operations_created_by_operation_id_uq").on(table.createdBy, table.operationId),
    index("sync_operations_created_by_applied_at_idx").on(table.createdBy, table.appliedAt),
  ]
);

export type SyncOperation = typeof syncOperations.$inferSelect;

// ---------------------------------------------------------------------------
// Feature Flags (gradual rollout of new platform modules)
// ---------------------------------------------------------------------------
export const featureFlags = sqliteTable("feature_flags", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  key: text("key").notNull().unique(),
  value: text("value").notNull(), // JSON string
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;

// ---------------------------------------------------------------------------
// Purchase Imports (CSV review-to-post sessions)
// ---------------------------------------------------------------------------
export const PURCHASE_IMPORT_STATUSES = {
  DRAFT: "draft",
  COMMITTED: "committed",
} as const;
export type PurchaseImportStatus =
  (typeof PURCHASE_IMPORT_STATUSES)[keyof typeof PURCHASE_IMPORT_STATUSES];

export const PURCHASE_IMPORT_ROW_STATUSES = {
  PENDING: "pending",
  MAPPED: "mapped",
  ERROR: "error",
  COMMITTED: "committed",
} as const;
export type PurchaseImportRowStatus =
  (typeof PURCHASE_IMPORT_ROW_STATUSES)[keyof typeof PURCHASE_IMPORT_ROW_STATUSES];

export const PURCHASE_IMPORT_SOURCES = {
  CSV: "csv",
  OCR: "ocr",
} as const;
export type PurchaseImportSource =
  (typeof PURCHASE_IMPORT_SOURCES)[keyof typeof PURCHASE_IMPORT_SOURCES];

export const purchaseImports = sqliteTable(
  "purchase_imports",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    filename: text("filename").notNull(),
    status: text("status").$type<PurchaseImportStatus>().default(PURCHASE_IMPORT_STATUSES.DRAFT),
    mappings: text("mappings").notNull().default("{}"), // JSON: column name -> target field
    defaults: text("defaults").notNull().default("{}"), // JSON: { supplierId?, gstRate? }
    source: text("source").$type<PurchaseImportSource>().notNull().default(PURCHASE_IMPORT_SOURCES.CSV),
    fileId: text("file_id"), // stored_files.id of the OCR source image
    headerFields: text("header_fields"), // JSON: { billNo: {value, confidence}, ... }
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("purchase_imports_created_by_idx").on(table.createdBy),
    index("purchase_imports_status_idx").on(table.status),
  ]
);

export type PurchaseImport = typeof purchaseImports.$inferSelect;
export type NewPurchaseImport = typeof purchaseImports.$inferInsert;

export const purchaseImportRows = sqliteTable(
  "purchase_import_rows",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    importId: text("import_id")
      .notNull()
      .references(() => purchaseImports.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    rowIndex: integer("row_index").notNull(),
    raw: text("raw").notNull(), // JSON object: column name -> cell value
    normalized: text("normalized"), // JSON object produced by normalizeRow
    medicineId: text("medicine_id").references(() => medicines.id),
    issues: text("issues").notNull().default("[]"), // JSON array of {field, message, severity}
    rowStatus: text("row_status")
      .$type<PurchaseImportRowStatus>()
      .default(PURCHASE_IMPORT_ROW_STATUSES.PENDING),
  },
  (table) => [
    index("purchase_import_rows_import_idx").on(table.importId),
    index("purchase_import_rows_created_by_idx").on(table.createdBy),
  ]
);

export type PurchaseImportRow = typeof purchaseImportRows.$inferSelect;
export type NewPurchaseImportRow = typeof purchaseImportRows.$inferInsert;

// ---------------------------------------------------------------------------
// Medicine Substitutes (explicit pharmacist-curated alternative links)
// ---------------------------------------------------------------------------
export const medicineSubstitutes = sqliteTable(
  "medicine_substitutes",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    medicineId: text("medicine_id")
      .notNull()
      .references(() => medicines.id),
    substituteMedicineId: text("substitute_medicine_id")
      .notNull()
      .references(() => medicines.id),
    reason: text("reason"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("medicine_substitutes_unique_idx").on(
      table.createdBy,
      table.medicineId,
      table.substituteMedicineId
    ),
    index("medicine_substitutes_created_by_idx").on(table.createdBy),
    index("medicine_substitutes_medicine_idx").on(table.medicineId),
  ]
);

export type MedicineSubstitute = typeof medicineSubstitutes.$inferSelect;
export type NewMedicineSubstitute = typeof medicineSubstitutes.$inferInsert;

// ---------------------------------------------------------------------------
// Supplier Quotes (manual rate quotations used for supplier comparison)
// ---------------------------------------------------------------------------
export const supplierQuotes = sqliteTable(
  "supplier_quotes",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    medicineId: text("medicine_id")
      .notNull()
      .references(() => medicines.id),
    quotedRate: real("quoted_rate").notNull(),
    quoteDate: text("quote_date"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("supplier_quotes_created_by_medicine_idx").on(table.createdBy, table.medicineId),
    index("supplier_quotes_created_by_supplier_idx").on(table.createdBy, table.supplierId),
  ]
);

export type SupplierQuote = typeof supplierQuotes.$inferSelect;
export type NewSupplierQuote = typeof supplierQuotes.$inferInsert;

// ---------------------------------------------------------------------------
// Stock Audits (physical stock-take sessions — Task 7)
// ---------------------------------------------------------------------------
export const STOCK_AUDIT_STATUSES = {
  OPEN: "open",
  APPROVED: "approved",
  CANCELLED: "cancelled",
} as const;
export type StockAuditStatus = (typeof STOCK_AUDIT_STATUSES)[keyof typeof STOCK_AUDIT_STATUSES];

export const stockAudits = sqliteTable(
  "stock_audits",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    status: text("status").$type<StockAuditStatus>().notNull().default(STOCK_AUDIT_STATUSES.OPEN),
    note: text("note"),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    approvedAt: integer("approved_at", { mode: "timestamp" }),
    approvedBy: text("approved_by"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("stock_audits_created_by_idx").on(table.createdBy),
    index("stock_audits_status_idx").on(table.status),
  ]
);

export type StockAudit = typeof stockAudits.$inferSelect;
export type NewStockAudit = typeof stockAudits.$inferInsert;

// Per-batch count rows (expected frozen at first insert, recount = latest).
export const stockAuditCounts = sqliteTable(
  "stock_audit_counts",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    auditId: text("audit_id")
      .notNull()
      .references(() => stockAudits.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    medicineId: text("medicine_id")
      .notNull()
      .references(() => medicines.id),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id),
    expectedQuantity: real("expected_quantity").notNull(),
    countedQuantity: real("counted_quantity").notNull(),
    recount: real("recount"),
    countedAt: integer("counted_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("stock_audit_counts_audit_idx").on(table.auditId),
    index("stock_audit_counts_created_by_idx").on(table.createdBy),
    uniqueIndex("stock_audit_counts_audit_batch_unique").on(table.auditId, table.batchId),
  ]
);

export type StockAuditCount = typeof stockAuditCounts.$inferSelect;
export type NewStockAuditCount = typeof stockAuditCounts.$inferInsert;

// ---------------------------------------------------------------------------
// Messaging (Task 9) — outbound deliveries + channel consent
// ---------------------------------------------------------------------------
export const MESSAGE_CHANNELS = ["whatsapp", "sms", "email"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_DELIVERY_STATUSES = ["queued", "sending", "sent", "failed", "opted_out"] as const;
export type MessageDeliveryStatus = (typeof MESSAGE_DELIVERY_STATUSES)[number];

export const messageDeliveries = sqliteTable(
  "message_deliveries",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    channel: text("channel").$type<MessageChannel>().notNull(),
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    variables: text("variables"), // JSON string of template variables
    aggregateType: text("aggregate_type"),
    aggregateId: text("aggregate_id"),
    status: text("status").$type<MessageDeliveryStatus>().default("queued"),
    providerId: text("provider_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    outboxEventId: text("outbox_event_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("message_deliveries_created_by_idx").on(table.createdBy, table.createdAt),
    index("message_deliveries_aggregate_idx").on(table.createdBy, table.aggregateType, table.aggregateId),
    index("message_deliveries_status_idx").on(table.status),
  ]
);

export type MessageDelivery = typeof messageDeliveries.$inferSelect;
export type NewMessageDelivery = typeof messageDeliveries.$inferInsert;

export const communicationPreferences = sqliteTable(
  "communication_preferences",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    customerId: text("customer_id").references(() => customers.id),
    channel: text("channel").$type<MessageChannel>().notNull(),
    optedOut: integer("opted_out", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("communication_preferences_uniq_idx").on(table.createdBy, table.customerId, table.channel),
    index("communication_preferences_created_by_idx").on(table.createdBy),
  ]
);

export type CommunicationPreference = typeof communicationPreferences.$inferSelect;
export type NewCommunicationPreference = typeof communicationPreferences.$inferInsert;

// ---------------------------------------------------------------------------
// Customer Growth (Task 10) — loyalty ledger, offers, campaigns
// ---------------------------------------------------------------------------
export const LOYALTY_ENTRY_TYPES = ["earn", "redeem", "adjust"] as const;
export type LoyaltyEntryType = (typeof LOYALTY_ENTRY_TYPES)[number];

/**
 * Immutable points ledger — balances are ALWAYS SUM(points); there is no
 * balance column to edit. Redeems are negative entries. SQLite UNIQUE treats
 * NULLs as distinct, so a NULL idempotency_key may repeat (by design: only
 * explicit keys dedupe).
 */
export const loyaltyLedger = sqliteTable(
  "loyalty_ledger",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by").notNull().references(() => users.id),
    customerId: text("customer_id").notNull().references(() => customers.id),
    points: real("points").notNull(), // negative = redeem
    type: text("type").$type<LoyaltyEntryType>().notNull(),
    reason: text("reason"),
    invoiceId: text("invoice_id"),
    idempotencyKey: text("idempotency_key"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("loyalty_ledger_customer_idx").on(table.createdBy, table.customerId),
    uniqueIndex("loyalty_ledger_idem_idx").on(table.createdBy, table.idempotencyKey),
  ]
);

export type LoyaltyLedgerEntry = typeof loyaltyLedger.$inferSelect;
export type NewLoyaltyLedgerEntry = typeof loyaltyLedger.$inferInsert;

export const OFFER_TYPES = ["fixed", "percent"] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

/** Bill or product discount with a validity window. Deactivated, never deleted. */
export const offers = sqliteTable(
  "offers",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by").notNull().references(() => users.id),
    name: text("name").notNull(),
    type: text("type").$type<OfferType>().notNull(),
    value: real("value").notNull().default(0),
    // NULL = applies to the whole bill; otherwise the bill must contain it.
    medicineId: text("medicine_id"),
    minAmount: real("min_amount").notNull().default(0),
    startsOn: text("starts_on").notNull(), // YYYY-MM-DD (inclusive)
    endsOn: text("ends_on").notNull(), // YYYY-MM-DD (inclusive)
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("offers_created_by_idx").on(table.createdBy),
    index("offers_active_idx").on(table.createdBy, table.isActive),
  ]
);

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;

export const CAMPAIGN_STATUSES = ["draft", "scheduled", "done", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * One audience-targeted message blast. `audience` and `stats` are JSON
 * strings; delivery goes through the Task 9 messaging outbox (idempotency key
 * `camp:<campaignId>:<customerId>` per recipient).
 */
export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by").notNull().references(() => users.id),
    name: text("name").notNull(),
    channel: text("channel").$type<MessageChannel>().notNull(),
    template: text("template").notNull().default("custom"),
    body: text("body"),
    audience: text("audience").notNull().default("{}"), // JSON {type: ...}
    scheduleAt: text("schedule_at"), // ISO datetime; null = send immediately
    status: text("status").$type<CampaignStatus>().default("draft"),
    stats: text("stats").default("{}"), // JSON {audience, queued, skippedOptOut, skippedNoContact}
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("campaigns_created_by_idx").on(table.createdBy),
    index("campaigns_status_idx").on(table.status),
  ]
);

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

// ---------------------------------------------------------------------------
// Accounting (Task 11) — double-entry ledger
// ---------------------------------------------------------------------------
export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const JOURNAL_PARTY_TYPES = ["customer", "supplier"] as const;
export type JournalPartyType = (typeof JOURNAL_PARTY_TYPES)[number];

/** Chart of accounts row. `is_system` rows (the 14 defaults) can never be deleted. */
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by").notNull().references(() => users.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").$type<AccountType>().notNull(),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("accounts_code_uniq").on(table.createdBy, table.code)]
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

/**
 * One journal entry. UNIQUE(created_by, source_type, source_id) makes posting
 * idempotent per source (SQLite NULLs are distinct, so manual entries with a
 * NULL source_id are exempt by design).
 */
export const journalEntries = sqliteTable(
  "journal_entries",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by").notNull().references(() => users.id),
    date: text("date").notNull(), // YYYY-MM-DD
    sourceType: text("source_type").notNull(), // invoice|purchase|payment|sales_return|manual|reversal
    sourceId: text("source_id"),
    description: text("description"),
    isReversal: integer("is_reversal", { mode: "boolean" }).notNull().default(false),
    reversedBy: text("reversed_by"), // journal_entries.id of the reversing entry
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("journal_entries_source_uniq").on(table.createdBy, table.sourceType, table.sourceId),
    index("journal_entries_date_idx").on(table.createdBy, table.date),
  ]
);

export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;

/** One debit/credit leg. Exactly one of debit/credit is > 0 (enforced in the service). */
export const journalLines = sqliteTable(
  "journal_lines",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    entryId: text("entry_id")
      .notNull()
      .references(() => journalEntries.id),
    createdBy: text("created_by").notNull().references(() => users.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    debit: real("debit").notNull().default(0),
    credit: real("credit").notNull().default(0),
    partyType: text("party_type").$type<JournalPartyType>(),
    partyId: text("party_id"),
    memo: text("memo"),
  },
  (table) => [
    index("journal_lines_entry_idx").on(table.entryId),
    index("journal_lines_account_idx").on(table.createdBy, table.accountId),
  ]
);

export type JournalLine = typeof journalLines.$inferSelect;
export type NewJournalLine = typeof journalLines.$inferInsert;

/** Closed date range — `post` refuses any entry dated inside one. */
export const accountingPeriods = sqliteTable(
  "accounting_periods",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by").notNull().references(() => users.id),
    fromDate: text("from_date").notNull(),
    toDate: text("to_date").notNull(),
    closedAt: integer("closed_at", { mode: "timestamp" }),
    closedBy: text("closed_by"),
  },
  (table) => [uniqueIndex("accounting_periods_range_uniq").on(table.createdBy, table.fromDate, table.toDate)]
);

export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type NewAccountingPeriod = typeof accountingPeriods.$inferInsert;

// ---------------------------------------------------------------------------
// Reconciliation (Task 12) — cash/bank books + bank statement matching
// ---------------------------------------------------------------------------

export const BANK_ROW_DIRECTIONS = ["in", "out"] as const;
export type BankRowDirection = (typeof BANK_ROW_DIRECTIONS)[number];

/**
 * One imported bank statement line. `amount` is signed (inflow +, outflow −),
 * `direction` mirrors its sign, `sha256` de-duplicates re-imports per tenant.
 */
export const bankStatementRows = sqliteTable(
  "bank_statement_rows",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by").notNull().references(() => users.id),
    statementDate: text("statement_date").notNull(), // YYYY-MM-DD
    reference: text("reference"),
    description: text("description"),
    amount: real("amount").notNull(), // signed: inflow +, outflow −
    direction: text("direction").$type<BankRowDirection>().notNull(),
    raw: text("raw").notNull(), // JSON of the original CSV cells
    sha256: text("sha256").notNull(),
    importedAt: integer("imported_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("bank_statement_rows_sha_uniq").on(table.createdBy, table.sha256),
    index("bank_statement_rows_date_idx").on(table.createdBy, table.statementDate),
  ]
);

export type BankStatementRow = typeof bankStatementRows.$inferSelect;
export type NewBankStatementRow = typeof bankStatementRows.$inferInsert;

/**
 * A 1:1 link between a statement row and a journal line (both unique per
 * tenant) — a statement row reconciles to at most one journal line and a
 * manual/automatic journal line is claimed at most once.
 */
export const reconciliationMatches = sqliteTable(
  "reconciliation_matches",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by").notNull().references(() => users.id),
    bankRowId: text("bank_row_id")
      .notNull()
      .references(() => bankStatementRows.id),
    journalLineId: text("journal_line_id")
      .notNull()
      .references(() => journalLines.id),
    matchedAt: integer("matched_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    matchedBy: text("matched_by")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("reconciliation_matches_row_uniq").on(table.createdBy, table.bankRowId),
    uniqueIndex("reconciliation_matches_line_uniq").on(table.createdBy, table.journalLineId),
    index("reconciliation_matches_bank_row_idx").on(table.bankRowId),
    index("reconciliation_matches_journal_line_idx").on(table.journalLineId),
  ]
);

export type ReconciliationMatch = typeof reconciliationMatches.$inferSelect;
export type NewReconciliationMatch = typeof reconciliationMatches.$inferInsert;

// ---------------------------------------------------------------------------
// Compliance (Task 13) — e-invoice / e-way submissions to a GST provider
// ---------------------------------------------------------------------------

export const COMPLIANCE_KINDS = ["einvoice", "ewaybill"] as const;
export type ComplianceKind = (typeof COMPLIANCE_KINDS)[number];

export const COMPLIANCE_STATUSES = ["pending", "submitted", "accepted", "rejected", "cancelled"] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

/**
 * One provider submission per (tenant, invoice, kind) — enforced by
 * UNIQUE(created_by, invoice_id, kind). Rejected/cancelled rows are updated in
 * place when the operator re-generates, so the constraint doubles as the
 * idempotency guard. Secrets are env-only and never stored on the row.
 */
export const complianceSubmissions = sqliteTable(
  "compliance_submissions",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by").notNull().references(() => users.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    kind: text("kind").$type<ComplianceKind>().notNull(),
    status: text("status").$type<ComplianceStatus>().notNull(),
    provider: text("provider"),
    irn: text("irn"),
    ackNo: text("ack_no"),
    ackDate: text("ack_date"),
    qrData: text("qr_data"),
    requestHash: text("request_hash"),
    responseJson: text("response_json"),
    error: text("error"),
    vehicleJson: text("vehicle_json"),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("compliance_submissions_uniq").on(table.createdBy, table.invoiceId, table.kind),
    index("compliance_submissions_invoice_idx").on(table.invoiceId),
    index("compliance_submissions_created_by_idx").on(table.createdBy, table.createdAt),
    index("compliance_submissions_status_idx").on(table.createdBy, table.status),
  ]
);

export type ComplianceSubmission = typeof complianceSubmissions.$inferSelect;
export type NewComplianceSubmission = typeof complianceSubmissions.$inferInsert;

// ---------------------------------------------------------------------------
// Customer Orders (Task 14) — public online ordering queue
// ---------------------------------------------------------------------------

/**
 * Order lifecycle. pending → accepted → packed → ready → delivered is linear;
 * `rejected` (pending|accepted) and `cancelled` (pending|accepted|packed) are
 * terminal states that carry `reason`.
 */
export const CUSTOMER_ORDER_STATUSES = [
  "pending",
  "accepted",
  "packed",
  "ready",
  "delivered",
  "rejected",
  "cancelled",
] as const;
export type CustomerOrderStatus = (typeof CUSTOMER_ORDER_STATUSES)[number];

/**
 * One customer order. Single-store convention: `createdBy` AND `store_id` both
 * hold the install owner's user id (public endpoints take storeId = owner id).
 * `invoiceId` is stamped by the deliver transition — stock deduction stays on
 * the invoice create path. `prescriptionFileId` references a stored_files row
 * uploaded through the public files route (owner = storeId).
 */
export const customerOrders = sqliteTable(
  "customer_orders",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    storeId: text("store_id").notNull(),
    customerId: text("customer_id").references(() => customers.id),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    deliveryAddress: text("delivery_address"),
    notes: text("notes"),
    prescriptionFileId: text("prescription_file_id").references(() => storedFiles.id),
    status: text("status").$type<CustomerOrderStatus>().default("pending"),
    reason: text("reason"),
    invoiceId: text("invoice_id").references(() => invoices.id),
    subtotal: real("subtotal").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("customer_orders_created_by_status_idx").on(table.createdBy, table.status),
    index("customer_orders_created_by_created_at_idx").on(table.createdBy, table.createdAt),
  ]
);

export type CustomerOrder = typeof customerOrders.$inferSelect;
export type NewCustomerOrder = typeof customerOrders.$inferInsert;

/** One requested medicine. `unitPrice` is the selling-price snapshot at submit. */
export const customerOrderItems = sqliteTable(
  "customer_order_items",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    orderId: text("order_id")
      .notNull()
      .references(() => customerOrders.id),
    medicineId: text("medicine_id")
      .notNull()
      .references(() => medicines.id),
    medicineName: text("medicine_name").notNull(),
    quantity: real("quantity").notNull(),
    unitPrice: real("unit_price").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("customer_order_items_order_idx").on(table.orderId)]
);

export type CustomerOrderItem = typeof customerOrderItems.$inferSelect;
export type NewCustomerOrderItem = typeof customerOrderItems.$inferInsert;

// ---------------------------------------------------------------------------
// Data Migration (Task 16 — bulk CSV import for customers/suppliers/medicines/
// opening stock, plus rollback)
// ---------------------------------------------------------------------------
export const DATA_IMPORT_ENTITY_TYPES = ["customers", "suppliers", "medicines", "stock"] as const;
export type DataImportEntityType = (typeof DATA_IMPORT_ENTITY_TYPES)[number];

export const DATA_IMPORT_STATUSES = {
  DRAFT: "draft",
  COMMITTED: "committed",
  ROLLED_BACK: "rolled_back",
} as const;
export type DataImportStatus = (typeof DATA_IMPORT_STATUSES)[keyof typeof DATA_IMPORT_STATUSES];

export const DATA_IMPORT_ROW_STATUSES = {
  PENDING: "pending",
  OK: "ok",
  ERROR: "error",
  SKIPPED: "skipped",
  COMMITTED: "committed",
  ROLLED_BACK: "rolled_back",
} as const;
export type DataImportRowStatus =
  (typeof DATA_IMPORT_ROW_STATUSES)[keyof typeof DATA_IMPORT_ROW_STATUSES];

export const dataImports = sqliteTable(
  "data_imports",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    entityType: text("entity_type").$type<DataImportEntityType>().notNull(),
    filename: text("filename").notNull(),
    status: text("status").$type<DataImportStatus>().default(DATA_IMPORT_STATUSES.DRAFT),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("data_imports_created_by_idx").on(table.createdBy),
    index("data_imports_status_idx").on(table.status),
  ]
);

export type DataImport = typeof dataImports.$inferSelect;
export type NewDataImport = typeof dataImports.$inferInsert;

export const dataImportRows = sqliteTable(
  "data_import_rows",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    importId: text("import_id")
      .notNull()
      .references(() => dataImports.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    rowIndex: integer("row_index").notNull(),
    raw: text("raw").notNull(), // JSON: source column -> cell value
    normalized: text("normalized"), // JSON produced by normalizeEntityRow
    issues: text("issues").notNull().default("[]"), // JSON [{field, message, severity}]
    rowStatus: text("row_status").$type<DataImportRowStatus>().default(DATA_IMPORT_ROW_STATUSES.PENDING),
    createdEntityId: text("created_entity_id"), // entity id created by commit (rollback target)
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("data_import_rows_import_idx").on(table.importId),
    index("data_import_rows_created_by_idx").on(table.createdBy),
  ]
);

export type DataImportRow = typeof dataImportRows.$inferSelect;
export type NewDataImportRow = typeof dataImportRows.$inferInsert;

// ---------------------------------------------------------------------------
// Scheduled Reports (Task 17)
// ---------------------------------------------------------------------------
export const SCHEDULED_REPORT_TYPES = [
  "sales",
  "stock",
  "purchase",
  "payments",
  "party",
] as const;
export type ScheduledReportType = (typeof SCHEDULED_REPORT_TYPES)[number];

export const SCHEDULED_REPORT_RUN_STATUSES = ["running", "done", "failed"] as const;
export type ScheduledReportRunStatus = (typeof SCHEDULED_REPORT_RUN_STATUSES)[number];

export const scheduledReports = sqliteTable(
  "scheduled_reports",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    reportType: text("report_type").$type<ScheduledReportType>().notNull(),
    // JSON: {kind:"daily",time} | {kind:"weekly",day,time} | {kind:"monthly",day,time}
    schedule: text("schedule").notNull(),
    // JSON: [{channel:"email"|"sms", address}]
    recipients: text("recipients").notNull().default("[]"),
    format: text("format").notNull().default("csv"),
    // JSON: {daysBack} — period-relative window ending at run time.
    filters: text("filters").notNull().default("{}"),
    // Server-local wall clock `YYYY-MM-DDTHH:mm` (no zone) — string-compared.
    nextRunAt: text("next_run_at"),
    lastRunAt: text("last_run_at"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("scheduled_reports_owner_idx").on(table.createdBy, table.enabled, table.nextRunAt),
  ]
);

export type ScheduledReport = typeof scheduledReports.$inferSelect;
export type NewScheduledReport = typeof scheduledReports.$inferInsert;

export const scheduledReportRuns = sqliteTable(
  "scheduled_report_runs",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    scheduledReportId: text("scheduled_report_id")
      .notNull()
      .references(() => scheduledReports.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    status: text("status").$type<ScheduledReportRunStatus>().notNull().default("running"),
    error: text("error"),
    rowCount: integer("row_count"),
    // stored_files.id via fileStorage (purpose "scheduled-report") — NOT an FK.
    fileId: text("file_id"),
    outboxEventId: text("outbox_event_id"),
    messageStatus: text("message_status"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("scheduled_report_runs_owner_idx").on(table.createdBy, table.startedAt),
    index("scheduled_report_runs_report_idx").on(table.scheduledReportId),
  ]
);

export type ScheduledReportRun = typeof scheduledReportRuns.$inferSelect;
export type NewScheduledReportRun = typeof scheduledReportRuns.$inferInsert;
