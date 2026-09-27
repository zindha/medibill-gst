// Shared types between server and client

export type Role = "admin" | "pharmacist" | "cashier";
export type GstRate = 0 | 5 | 12 | 18 | 28;
export type PaymentMode = "cash" | "card" | "upi" | "credit" | "other";
export type InvoiceStatus = "paid" | "unpaid" | "partial" | "cancelled";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
  pagination?: {
    page: number;
    limit: number;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
  };
}

// User types
export interface User {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role: Role;
  createdAt: Date;
}

// Medicine types
export interface Medicine {
  id: string;
  name: string;
  genericName?: string;
  brand?: string;
  category?: string;
  composition?: string;
  hsnCode?: string;
  gstRate: GstRate;
  schedule?: string;
  dosageForm?: string;
  strength?: string;
  unit?: string;
  packSize?: string;
  barcode?: string;
  rackLocation?: string;
  minQuantity?: number;
  reorderLevel?: number;
  purchasePrice: number;
  sellingPrice: number;
  mrp?: number;
  isActive: boolean;
  availableStock?: number;
  batches?: Batch[];
}

// Batch types
export interface Batch {
  id: string;
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  mrp: number;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  initialQuantity?: number;
  freeQuantity?: number;
  supplierId?: string;
  isActive: boolean;
}

// Invoice types
export interface Invoice {
  id: string;
  invoiceNo: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  doctorId?: string;
  doctorName?: string;
  date: string;
  subtotal: number;
  totalGst: number;
  cgst: number;
  sgst: number;
  igst: number;
  discountAmount?: number;
  grandTotal: number;
  amountPaid?: number;
  paymentMode?: PaymentMode;
  status: InvoiceStatus;
  notes?: string;
  hold?: boolean;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  medicineId?: string;
  medicineName: string;
  batchId?: string;
  batchNo?: string;
  expiryDate?: string;
  hsnCode?: string;
  quantity: number;
  unit?: string;
  rate: number;
  amount: number;
  gstRate: GstRate;
  gstAmount: number;
  cgst: number;
  sgst: number;
  discountAmount?: number;
}

// Customer types
export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  creditLimit?: number;
  balance?: number;
  notes?: string;
  totalPurchases?: number;
  lastPurchaseDate?: string;
  isActive: boolean;
}

// Supplier types
export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  paymentTerms?: string;
  creditLimit?: number;
  balance?: number;
  isActive: boolean;
}

// Dashboard KPIs
export interface DashboardKPIs {
  today: {
    totalSales: number;
    invoiceCount: number;
  };
  inventory: {
    lowStock: number;
    expired: number;
    nearExpiry: number;
  };
  outstanding: {
    customerCredit: number;
  };
  recentInvoices: Invoice[];
  lastBackup: {
    type: string;
    createdAt: Date;
  } | null;
}
