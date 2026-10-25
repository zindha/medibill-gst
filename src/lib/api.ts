/**
 * MediBill API Client
 * Replaces Convex SDK with local REST API calls
 */

// Relative by default so the SPA works same-origin (local :3000 and any tunnel).
// Local Vite dev (:5173) proxies /api -> :3000 (see vite.config.ts).
// `||` (not `??`) so an empty VITE_API_URL also falls back to relative.
const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface ApiOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function requestFull<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  body?: unknown,
  options?: ApiOptions
): Promise<{ data: T; warnings: any[]; body: any }> {
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options?.headers,
  };

  // Add auth token if available
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Task 15 — device token (set by use-auth after POST /devices/register).
  // The server's checkDeviceToken() uses it as a kill-switch: a revoked device
  // gets 401 "This device has been revoked" on every guarded request.
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (deviceToken) {
    headers["X-Device-Token"] = deviceToken;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: options?.signal,
    credentials: "include",
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    const error = new ApiError(
      data.error ?? "Request failed",
      response.status,
      data.details,
      data
    );
    // Task 15 — 401 interceptor. use-auth registers the handler that shows the
    // toast and logs out when the message says the device was revoked.
    if (response.status === 401 && unauthorizedHandler) {
      try {
        unauthorizedHandler(error);
      } catch {
        // A failing handler must never break the request that triggered it.
      }
    }
    throw error;
  }

  return {
    data: data.data as T,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    body: data,
  };
}

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  body?: unknown,
  options?: ApiOptions
): Promise<T> {
  const { data } = await requestFull<T>(path, method, body, options);
  return data;
}

/** Lower-level typed request for modules that need verbs beyond the `api` helper. */
export { request };

export class ApiError extends Error {
  status: number;
  details?: any;
  /** Full response body — e.g. `{ blocked: [...] }` from the expiry policy 400. */
  payload?: any;

  constructor(message: string, status: number, details?: any, payload?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.payload = payload;
  }
}

// ---------------------------------------------------------------------------
// 401 interceptor — the auth hook registers a handler that reacts to
// "This device has been revoked" (toast + logout). See use-auth.tsx.
// ---------------------------------------------------------------------------
type UnauthorizedHandler = (error: ApiError) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}


// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const authApi = {
  login: (identifier: string, password: string) =>
    request<{ user: any; token: string }>("/auth/login", "POST", {
      identifier,
      password,
    }),

  register: (data: { name: string; email?: string; phone?: string; password: string }) =>
    request<{ user: any; token: string }>("/auth/register", "POST", data),

  logout: () => request<void>("/auth/logout", "POST"),

  me: () => request<any>("/auth/me", "GET"),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/auth/change-password", "POST", { currentPassword, newPassword }),
};

// ---------------------------------------------------------------------------
// Medicines
// ---------------------------------------------------------------------------
export const medicinesApi = {
  list: (params?: { search?: string; category?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.category) query.set("category", params.category);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    return request<any>(`/medicines?${query}`, "GET");
  },

  get: (id: string) => request<any>(`/medicines/${id}`, "GET"),

  getByBarcode: (barcode: string) => request<any>(`/medicines/barcode/${barcode}`, "GET"),

  create: (data: any) => request<any>("/medicines", "POST", data),

  update: (id: string, data: any) => request<any>(`/medicines/${id}`, "PUT", data),

  delete: (id: string) => request<void>(`/medicines/${id}`, "DELETE"),
};

// ---------------------------------------------------------------------------
// Inventory / Batches
// ---------------------------------------------------------------------------
export const inventoryApi = {
  // Batches
  getBatches: (medicineId: string) =>
    request<any[]>(`/inventory/batches?medicineId=${medicineId}`, "GET"),

  getAvailableBatches: (medicineId: string, order?: "fefo" | "fifo") =>
    request<any[]>(`/inventory/batches/available?medicineId=${medicineId}${order ? `&order=${order}` : ""}`, "GET"),

  createBatch: (data: any) => request<any>("/inventory/batches", "POST", data),

  updateBatch: (id: string, data: any) => request<any>(`/inventory/batches/${id}`, "PUT", data),

  // Stock operations
  adjust: (data: { batchId: string; newQuantity: number; reason: string; notes?: string }) =>
    request<any>("/inventory/adjust", "POST", data),

  // Full stock list with batch data (optional server-side search)
  stock: (search?: string) =>
    request<any[]>(`/inventory/stock${search ? `?search=${encodeURIComponent(search)}` : ""}`, "GET"),

  // Low stock medicines
  lowStock: () => request<any[]>("/inventory/low-stock", "GET"),

  // Expiry batches
  expiry: (status?: "expired" | "30" | "60" | "90") =>
    request<any[]>(`/inventory/expiry${status ? `?status=${status}` : ""}`, "GET"),

  // Transaction history
  transactions: (params?: { medicineId?: string; batchId?: string; type?: string; page?: string; limit?: string }) => {
    const query = new URLSearchParams();
    if (params?.medicineId) query.set("medicineId", params.medicineId);
    if (params?.batchId) query.set("batchId", params.batchId);
    if (params?.type) query.set("type", params.type);
    if (params?.page) query.set("page", params.page);
    if (params?.limit) query.set("limit", params.limit);
    return request<any>(`/inventory/transactions?${query}`, "GET");
  },
};

// ---------------------------------------------------------------------------
// Catalog Overrides
// ---------------------------------------------------------------------------
export interface CatalogOverride {
  id: string;
  catalogKey: string;
  medicineName: string;
  company?: string;
  gstRate?: "0" | "5" | "12" | "18" | "28";
  hsnCode?: string;
  verified?: boolean;
  unavailable?: boolean;
}

export interface CatalogAddition {
  id: string;
  catalogKey: string;
  medicineName: string;
  company?: string;
  composition?: string;
  form?: string;
  unit?: string;
  packSize?: string;
  price?: number;
  gstRate?: "0" | "5" | "12" | "18" | "28";
  createdAt?: string | number | Date;
}

export interface CatalogAdditionInput {
  catalogKey: string;
  name: string;
  company?: string;
  composition?: string;
  form?: string;
  unit?: string;
  packSize?: string;
  price: number;
  gstRate: number | string;
}

export const catalogAdditionsApi = {
  list: () => request<CatalogAddition[]>("/catalog-additions", "GET"),

  import: (additions: CatalogAdditionInput[]) =>
    request<{ count: number; duplicates: number; added: CatalogAddition[] }>(
      "/catalog-additions/import",
      "POST",
      { additions }
    ),

  remove: (id: string) =>
    request<{ removed: boolean }>(`/catalog-additions/${encodeURIComponent(id)}`, "DELETE"),
};

export const catalogApi = {
  list: () => request<CatalogOverride[]>("/catalog-overrides", "GET"),

  /**
   * Search the 2.4 lakh-row medicine database on the server.
   * Only the matching rows cross the wire — the full 37 MB dataset is never
   * downloaded by the browser.
   */
  search: (q: string, limit = 25) => {
    const query = new URLSearchParams({ q, limit: String(limit) });
    return request<{
      results: Array<{
        name: string;
        company: string;
        composition: string;
        packSize: string;
        category: string;
        unit: string;
        price?: number;
        gstRate: number;
        catalogKey: string;
      }>;
      total: number;
      strategy?: string;
    }>(`/catalog/search?${query}`, "GET");
  },

  stats: () =>
    request<{ total: number; builtAt: number | null; strategy: string }>("/catalog/stats", "GET"),

  saveGst: (data: { catalogKey: string; medicineName: string; company?: string; gstRate: "0" | "5" | "12" | "18" | "28"; hsnCode?: string }) =>
    request<{ saved: boolean }>("/catalog-overrides/gst", "POST", data),

  setUnavailable: (data: { catalogKey: string; medicineName: string; company?: string; unavailable: boolean }) =>
    request<{ removed?: boolean }>("/catalog-overrides/unavailable", "POST", data),

  remove: (catalogKey: string) =>
    request<{ removed: boolean }>(`/catalog-overrides/${encodeURIComponent(catalogKey)}`, "DELETE"),
};

// ---------------------------------------------------------------------------
// Product Intelligence (alternatives, salt search, substitute links)
// ---------------------------------------------------------------------------
export interface MedicineAlternative {
  medicineId: string;
  name: string;
  brand?: string | null;
  genericName?: string | null;
  composition?: string | null;
  compositionTokens?: string[];
  strength?: string | null;
  dosageForm?: string | null;
  schedule?: string | null;
  hsnCode?: string | null;
  gstRate?: string | null;
  unit?: string | null;
  packSize?: string | null;
  unitsPerPack?: number | null;
  mrp?: number | null;
  sellingPrice: number;
  purchasePrice: number;
  stockPacks: number;
  nearestExpiry?: string | null;
  marginPercent: number;
  inStock: boolean;
  /** Similarity score (0–1) — substitutes bucket only. */
  score?: number;
  /** True when a pharmacist linked this substitute explicitly. */
  explicit?: boolean;
  reason?: string | null;
  source?: "stock" | "catalog";
}

export interface AlternativesResult {
  source: MedicineAlternative;
  buckets: {
    exactSalt: MedicineAlternative[];
    sameComposition: MedicineAlternative[];
    substitutes: MedicineAlternative[];
  };
}

export interface CatalogSearchHit {
  name: string;
  company: string;
  composition: string;
  packSize: string;
  form: string;
  unit: string;
  price: number;
  gstRate: number;
  source: "catalog";
  stockPacks: number;
  inStock: boolean;
  compositionTokens: string[];
}

export interface ProductSearchResult {
  stock: MedicineAlternative[];
  catalog: CatalogSearchHit[];
}

export const productIntelApi = {
  /** Alternatives to a medicine within your own stock. 404s on foreign ids. */
  alternatives: (
    medicineId: string,
    opts?: { inStock?: boolean; maxPrice?: number; sameSchedule?: boolean },
  ) => {
    const query = new URLSearchParams({ medicineId });
    if (opts?.inStock !== undefined) query.set("inStock", String(opts.inStock));
    if (opts?.maxPrice !== undefined) query.set("maxPrice", String(opts.maxPrice));
    if (opts?.sameSchedule !== undefined) query.set("sameSchedule", String(opts.sameSchedule));
    return request<AlternativesResult>(`/product-intelligence/alternatives?${query}`, "GET");
  },

  /** Salt search: tenant stock first, bundled medicine database as fallback. */
  search: (q: string, opts?: { composition?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (opts?.composition) query.set("composition", opts.composition);
    if (opts?.limit) query.set("limit", String(opts.limit));
    return request<ProductSearchResult>(`/product-intelligence/search?${query}`, "GET");
  },

  /** Store an explicit pharmacist-curated substitute link (idempotent). */
  addSubstitute: (data: {
    medicineId: string;
    substituteMedicineId: string;
    reason?: string;
  }) =>
    request<{ created: boolean; link: { id: string } }>(
      "/product-intelligence/substitutes",
      "POST",
      data,
    ),

  /** Explicit substitute links for a medicine. */
  links: (medicineId: string) =>
    request<
      Array<{
        id: string;
        medicineId: string;
        substituteMedicineId: string;
        reason?: string | null;
        medicine?: MedicineAlternative | null;
      }>
    >(`/product-intelligence/links?medicineId=${encodeURIComponent(medicineId)}`, "GET"),
};

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
export const invoicesApi = {
  list: (params?: { date?: string; from?: string; to?: string; customerId?: string; status?: string; search?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.date) query.set("date", params.date);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.customerId) query.set("customerId", params.customerId);
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    return request<any>(`/invoices?${query}`, "GET");
  },

  get: (id: string) => request<any>(`/invoices/${id}`, "GET"),

  getByNumber: (invoiceNo: string) => request<any>(`/invoices/number/${invoiceNo}`, "GET"),
  nextNumber: () => request<{ invoiceNo: string }>("/invoices/next-number", "GET"),

  // Full body on success: `{ data, warnings }` — warnings carry near-expiry
  // notices from the Expiry Safety Policy (non-blocking).
  create: (data: any) => requestFull<any>("/invoices", "POST", data),

  cancel: (id: string) => request<any>(`/invoices/${id}/cancel`, "POST"),

  hold: (id: string) => request<any>(`/invoices/${id}/hold`, "POST"),

  recall: (id: string) => request<any>(`/invoices/${id}/recall`, "POST"),
};

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export const customersApi = {
  list: (params?: { search?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.page) query.set("page", String(params.page ?? 1));
    if (params?.limit) query.set("limit", String(params.limit));
    return request<any>(`/customers?${query}`, "GET");
  },

  get: (id: string) => request<any>(`/customers/${id}`, "GET"),

  getLedger: (id: string, params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any[]>(`/customers/${id}/ledger?${query}`, "GET");
  },  create: (data: any) => request<any>("/customers", "POST", data),

  delete: (id: string) => request<any>(`/customers/${id}`, "DELETE"),




  update: (id: string, data: any) => request<any>(`/customers/${id}`, "PUT", data),
};

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
export const suppliersApi = {
  list: (params?: { search?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.page) query.set("page", String(params.page ?? 1));
    if (params?.limit) query.set("limit", String(params.limit));
    return request<any>(`/suppliers?${query}`, "GET");
  },

  get: (id: string) => request<any>(`/suppliers/${id}`, "GET"),

  getLedger: (id: string) => request<any[]>(`/suppliers/${id}/ledger`, "GET"),

  create: (data: any) => request<any>("/suppliers", "POST", data),

  update: (id: string, data: any) => request<any>(`/suppliers/${id}`, "PUT", data),

  delete: (id: string) => request<any>(`/suppliers/${id}`, "DELETE"),
};

// ---------------------------------------------------------------------------
// Business Expenses
// ---------------------------------------------------------------------------
export const expensesApi = {
  list: (params?: {
    q?: string;
    from?: string;
    to?: string;
    gstOnly?: boolean;
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.gstOnly) query.set("gstOnly", "true");
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    return request<any>(`/expenses?${query}`, "GET");
  },

  get: (id: string) => request<any>(`/expenses/${id}`, "GET"),

  create: (data: any) => request<any>("/expenses", "POST", data),

  update: (id: string, data: any) => request<any>(`/expenses/${id}`, "PUT", data),

  delete: (id: string) => request<any>(`/expenses/${id}`, "DELETE"),

  metadata: () => request<any>("/expenses/metadata", "GET"),

  products: (q?: string) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    return request<any[]>(`/expenses/products?${query}`, "GET");
  },

  parties: (q?: string) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    return request<any[]>(`/expenses/parties?${query}`, "GET");
  },

  createParty: (data: any) => request<any>("/expenses/parties", "POST", data),

  updateParty: (id: string, data: any) => request<any>(`/expenses/parties/${id}`, "PUT", data),

  deleteParty: (id: string) => request<any>(`/expenses/parties/${id}`, "DELETE"),
};

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------
export const doctorsApi = {
  list: (params?: { search?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.limit) query.set("limit", String(params.limit));
    return request<any>(`/doctors?${query}`, "GET");
  },

  get: (id: string) => request<any>(`/doctors/${id}`, "GET"),

  create: (data: any) => request<any>("/doctors", "POST", data),

  update: (id: string, data: any) => request<any>(`/doctors/${id}`, "PUT", data),

  delete: (id: string) => request<any>(`/doctors/${id}`, "DELETE"),
};

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------
export const purchasesApi = {
  list: (params?: { supplierId?: string; from?: string; to?: string; search?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.supplierId) query.set("supplierId", params.supplierId);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.search) query.set("search", params.search);
    if (params?.page) query.set("page", String(params.page ?? 1));
    if (params?.limit) query.set("limit", String(params.limit));
    return request<any>(`/purchases?${query}`, "GET");
  },

  get: (id: string) => request<any>(`/purchases/${id}`, "GET"),

  // Full body on success: `{ data, warnings }` — warnings carry near-expiry
  // notices from the Expiry Safety Policy (non-blocking).
  create: (data: any) => requestFull<any>("/purchases", "POST", data),
};

// ---------------------------------------------------------------------------
// Purchase Returns (goods going back to the supplier)
// ---------------------------------------------------------------------------
export const purchaseReturnsApi = {
  list: (params?: { date?: string; from?: string; to?: string; supplierId?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.date) query.set("date", params.date);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.supplierId) query.set("supplierId", params.supplierId);
    if (params?.page) query.set("page", String(params.page ?? 1));
    if (params?.limit) query.set("limit", String(params.limit ?? 50));
    return request<any>(`/purchase-returns?${query}`, "GET");
  },

  get: (id: string) => request<any>(`/purchase-returns/${id}`, "GET"),

  create: (data: {
    date: string;
    purchaseBillId?: string;
    supplierId?: string;
    supplierName?: string;
    reason?: string;
    refundAmount?: number;
    refundMode?: "cash" | "card" | "upi" | "credit" | "other";
    items: Array<{
      medicineId: string;
      batchId?: string;
      quantity: number;
      rate: number;
      gstRate?: string;
      reason?: string;
    }>;
  }) => request<any>("/purchase-returns", "POST", data),
};

// ---------------------------------------------------------------------------
// Purchase Imports (CSV review-to-post)
// ---------------------------------------------------------------------------
export type PurchaseImportStatus = "draft" | "committed";
export type PurchaseImportRowStatus = "pending" | "mapped" | "error" | "committed";

export interface PurchaseImportIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface PurchaseImportNormalizedRow {
  billNo?: string;
  billDate?: string;
  supplier?: string;
  product?: string;
  barcode?: string;
  batch?: string;
  expiryDate?: string;
  quantity?: number;
  freeQuantity?: number;
  mrp?: number;
  purchaseRate?: number;
  gstRate?: string;
  discount?: number;
}

export interface PurchaseImportRow {
  id: string;
  rowIndex: number;
  raw: Record<string, string>;
  normalized: PurchaseImportNormalizedRow | null;
  issues: PurchaseImportIssue[];
  medicineId: string | null;
  status: PurchaseImportRowStatus;
}

/** An extracted invoice header value plus its OCR confidence (0..1). */
export interface OcrConfidenceField {
  value: string | null;
  confidence: number;
}

export interface PurchaseImportHeaderFields {
  billNo: OcrConfidenceField;
  billDate: OcrConfidenceField;
  supplierName: OcrConfidenceField;
}

export interface PurchaseImportSession {
  importId: string;
  filename: string;
  status: PurchaseImportStatus;
  source?: "csv" | "ocr";
  columns: string[];
  mappings: Record<string, string>;
  defaults: { supplierId?: string; gstRate?: string };
  rows: PurchaseImportRow[];
  warnings: number;
  errors: number;
  /** Stored source image id (OCR sessions only). */
  fileId?: string;
  /** Extracted header values with confidence (OCR sessions only). */
  headerFields?: PurchaseImportHeaderFields;
}

export interface PurchaseImportCommitRow {
  rowIndex: number;
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  freeQuantity?: number;
  mrp?: number;
  purchasePrice: number;
  sellingPrice?: number;
  gstRate?: string;
}

export const PURCHASE_IMPORT_FIELDS = [
  "bill_no",
  "bill_date",
  "supplier",
  "product",
  "barcode",
  "batch",
  "expiry",
  "quantity",
  "free_quantity",
  "mrp",
  "purchase_rate",
  "gst_rate",
  "discount",
] as const;

export const purchaseImportsApi = {
  create: (data: { filename: string; csv: string }) =>
    request<PurchaseImportSession>("/purchase-imports", "POST", data),

  /** Create an import session from client-side OCR text (image scan flow). */
  ocr: (data: { filename: string; text: string; fileId?: string }) =>
    request<PurchaseImportSession>("/purchase-imports/ocr", "POST", data),

  get: (id: string) => request<PurchaseImportSession>(`/purchase-imports/${id}`, "GET"),

  updateMappings: (
    id: string,
    data: {
      mappings: Record<string, string>;
      defaults?: { supplierId?: string; gstRate?: string };
    }
  ) => request<PurchaseImportSession>(`/purchase-imports/${id}/mappings`, "PUT", data),

  commit: (
    id: string,
    data: {
      billNo: string;
      billDate?: string;
      supplierId?: string;
      rows: PurchaseImportCommitRow[];
    }
  ) => request<any>(`/purchase-imports/${id}/commit`, "POST", data),

  remove: (id: string) => request<{ message: string }>(`/purchase-imports/${id}`, "DELETE"),
};

// ---------------------------------------------------------------------------
// Data Migration (Task 16 — bulk CSV import for customers/suppliers/medicines/
// opening stock, with preview + commit + rollback)
// ---------------------------------------------------------------------------
export type DataImportEntityType = "customers" | "suppliers" | "medicines" | "stock";

export const DATA_IMPORT_ENTITY_TYPES = [
  "customers",
  "suppliers",
  "medicines",
  "stock",
] as const;

/** Target CSV fields per entity — drives column hints and template downloads. */
export const DATA_IMPORT_FIELDS: Record<DataImportEntityType, string[]> = {
  customers: ["name", "phone", "email", "address", "gstin", "creditLimit", "openingBalance"],
  suppliers: [
    "name",
    "phone",
    "email",
    "address",
    "gstin",
    "paymentTerms",
    "creditLimit",
    "openingBalance",
  ],
  medicines: [
    "name",
    "genericName",
    "brand",
    "category",
    "composition",
    "hsnCode",
    "gstRate",
    "schedule",
    "dosageForm",
    "strength",
    "unit",
    "packSize",
    "unitsPerPack",
    "barcode",
    "rackLocation",
    "minQuantity",
    "reorderLevel",
    "purchasePrice",
    "sellingPrice",
    "mrp",
  ],
  stock: [
    "medicineName",
    "batchNo",
    "expiryDate",
    "quantity",
    "mrp",
    "purchasePrice",
    "sellingPrice",
  ],
};

export interface DataImportIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface DataImportRow {
  id: string;
  rowIndex: number;
  raw: Record<string, string>;
  normalized: Record<string, any> | null;
  issues: DataImportIssue[];
  status: "pending" | "ok" | "error" | "skipped" | "committed" | "rolled_back";
  createdEntityId: string | null;
}

export interface DataImportCounts {
  total: number;
  pending: number;
  ok: number;
  error: number;
  skipped: number;
  committed: number;
  rolledBack: number;
}

export interface DataImportSession {
  importId: string;
  entityType: DataImportEntityType;
  filename: string;
  status: "draft" | "committed" | "rolled_back";
  columns: string[];
  mappings: Record<string, string>;
  rows: DataImportRow[];
  counts: DataImportCounts;
  errors: number;
  warnings: number;
}

export interface DataImportPreview {
  importId: string;
  entityType: DataImportEntityType;
  status: "draft" | "committed" | "rolled_back";
  counts: DataImportCounts;
  wouldCreate: number;
  wouldSkip: number;
  errors: number;
  warnings: number;
  rows: DataImportRow[];
  truncated: boolean;
}

export const dataMigrationsApi = {
  create: (data: { entityType: DataImportEntityType; filename: string; csv: string }) =>
    request<DataImportSession>("/data-migrations", "POST", data),

  list: () =>
    request<
      Array<{
        id: string;
        entityType: DataImportEntityType;
        filename: string;
        status: "draft" | "committed" | "rolled_back";
        counts: DataImportCounts;
        createdAt: string;
        updatedAt: string;
      }>
    >("/data-migrations", "GET"),

  get: (id: string) => request<DataImportSession>(`/data-migrations/${id}`, "GET"),

  preview: (id: string) =>
    request<DataImportPreview>(`/data-migrations/${id}/preview`, "POST", {}),

  commit: (id: string) =>
    request<{
      importId: string;
      entityType: DataImportEntityType;
      status: string;
      created: number;
      skipped: number;
    }>(`/data-migrations/${id}/commit`, "POST", {}),

  rollback: (id: string) =>
    request<{
      importId: string;
      entityType: DataImportEntityType;
      status: string;
      deleted: number;
    }>(`/data-migrations/${id}/rollback`, "POST", {}),

  remove: (id: string) => request<{ message: string }>(`/data-migrations/${id}`, "DELETE"),
};

// ---------------------------------------------------------------------------
// Bulk Bill Operations (Task 16 — filter + preview diff + confirmed commit)
// ---------------------------------------------------------------------------
export interface BulkBillFilters {
  from?: string;
  to?: string;
  status?: string;
  customerId?: string;
  minAmount?: number;
  maxAmount?: number;
  q?: string;
}

export interface BulkBillPatch {
  customerId?: string | null;
  date?: string;
  notes?: string;
  paymentMode?: string;
}

export interface BulkBillPreviewRow {
  id: string;
  invoiceNo: string;
  date: string;
  customerId: string | null;
  customerName: string | null;
  status: string | null;
  paymentMode: string | null;
  notes: string | null;
  subtotal: number;
  grandTotal: number;
  diffs: Record<string, { from: unknown; to: unknown }>;
}

export interface BulkBillPreviewResult {
  total: number;
  invoices: BulkBillPreviewRow[];
  patch: BulkBillPatch;
  requiresConfirmation: true;
}

export const bulkBillsApi = {
  preview: (data: { filters: BulkBillFilters; patch: BulkBillPatch }) =>
    request<BulkBillPreviewResult>("/bulk-bills/preview", "POST", data),

  commit: (data: { filters: BulkBillFilters; patch: BulkBillPatch; confirm?: string }) =>
    request<{
      updated: number;
      skipped: number;
      audit: { action: string; metadata: { count: number } };
    }>("/bulk-bills/commit", "POST", data),
};

// ---------------------------------------------------------------------------
// Files (stored source images / attachments, sha256 duplicate detection)
// ---------------------------------------------------------------------------
export interface StoredFileInfo {
  id: string;
  sha256: string;
  size: number;
  duplicate: boolean;
}

export const filesApi = {
  /** Upload a base64 file (data: URL prefixes are stripped automatically). */
  upload: (data: { filename: string; contentType: string; data: string }) =>
    request<StoredFileInfo>("/files", "POST", {
      filename: data.filename,
      contentType: data.contentType,
      data: data.data.replace(/^data:[^,]*,/, ""),
    }),

  /** Fetch a stored file back as base64 for side-by-side review. */
  get: (id: string) =>
    request<{ contentType: string; filename: string; data: string }>(`/files/${id}`, "GET"),
};

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export const paymentsApi = {
  list: (params?: { type?: string; from?: string; to?: string; invoiceId?: string }) => {
    const query = new URLSearchParams();
    if (params?.type) query.set("type", params.type);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.invoiceId) query.set("invoiceId", params.invoiceId);
    return request<any>(`/payments?${query}`, "GET");
  },

  create: (data: any) => request<any>("/payments", "POST", data),
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
// Sales Returns
// ---------------------------------------------------------------------------
export const returnsApi = {
  list: (params?: { invoiceId?: string; from?: string; to?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params?.invoiceId) query.set("invoiceId", params.invoiceId);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.page) query.set("page", String(params.page));
    return request<any>(`/returns?${query}`, "GET");
  },

  get: (id: string) => request<any>(`/returns/${id}`, "GET"),

  create: (data: any) => request<any>("/returns", "POST", data),
};

// ---------------------------------------------------------------------------
export const reportsApi = {
  sales: (params?: { from?: string; to?: string; customerId?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.customerId) query.set("customerId", params.customerId);
    return request<any>(`/reports/sales?${query}`, "GET");
  },

  purchase: (params?: { from?: string; to?: string; supplierId?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.supplierId) query.set("supplierId", params.supplierId);
    return request<any>(`/reports/purchase?${query}`, "GET");
  },

  profit: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/profit?${query}`, "GET");
  },

  inventory: (params?: { status?: "low" | "out" | "expired" | "near" }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    return request<any[]>(`/reports/inventory?${query}`, "GET");
  },

  tax: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/tax?${query}`, "GET");
  },

  gstr1: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/gstr1?${query}`, "GET");
  },

  gstr3b: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/gstr3b?${query}`, "GET");
  },

  hsn: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/hsn?${query}`, "GET");
  },

  itc: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/itc?${query}`, "GET");
  },

  gstr2: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/gstr2?${query}`, "GET");
  },

  salesRegister: (params?: { from?: string; to?: string; view?: "invoice" | "date"; customer?: string; doctor?: string; schedule?: string; q?: string; customerId?: string; doctorId?: string; party?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.view) query.set("view", params.view);
    if (params?.customer) query.set("customer", params.customer);
    if (params?.customerId) query.set("customerId", params.customerId);
    if (params?.doctor) query.set("doctor", params.doctor);
    if (params?.doctorId) query.set("doctorId", params.doctorId);
    if (params?.schedule) query.set("schedule", params.schedule);
    if (params?.q) query.set("q", params.q);
    if (params?.party) query.set("party", params.party);
    return request<any>(`/reports/sales/register?${query}`, "GET");
  },

  salesDetail: (params?: { from?: string; to?: string; customer?: string; customerId?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.customer) query.set("customer", params.customer);
    if (params?.customerId) query.set("customerId", params.customerId);
    if (params?.q) query.set("q", params.q);
    return request<any>(`/reports/sales/detail?${query}`, "GET");
  },

  salesSummary: (params?: { from?: string; to?: string; groupBy?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.groupBy) query.set("groupBy", params.groupBy);
    return request<any>(`/reports/sales/summary?${query}`, "GET");
  },

  salesDoctor: (params?: { from?: string; to?: string; doctorId?: string; doctor?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.doctorId) query.set("doctorId", params.doctorId);
    if (params?.doctor) query.set("doctor", params.doctor);
    return request<any>(`/reports/sales/doctor?${query}`, "GET");
  },

  salesSchedule: (params?: { from?: string; to?: string; schedule?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.schedule) query.set("schedule", params.schedule);
    return request<any>(`/reports/sales/schedule?${query}`, "GET");
  },

  salesParty: (params?: { from?: string; to?: string; customerId?: string; customer?: string; party?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.customerId) query.set("customerId", params.customerId);
    if (params?.customer) query.set("customer", params.customer);
    if (params?.party) query.set("party", params.party);
    return request<any>(`/reports/sales/party?${query}`, "GET");
  },

  stockFast: (params?: { from?: string; to?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.limit) query.set("limit", String(params.limit));
    return request<any>(`/reports/stock/fast?${query}`, "GET");
  },

  stockSlow: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/stock/slow?${query}`, "GET");
  },

  stockCurrent: () => request<any>(`/reports/stock/current`, "GET"),

  stockExpired: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/stock/expired?${query}`, "GET");
  },

  stockOpeningClosing: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/stock/opening-closing?${query}`, "GET");
  },

  stockStatement: (params: { medicineId: string; from?: string; to?: string }) => {
    const query = new URLSearchParams();
    query.set("medicineId", params.medicineId);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/stock/statement?${query}`, "GET");
  },

  stockAdjustments: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<any>(`/reports/stock/adjustments?${query}`, "GET");
  },

  purchaseRegister: (params?: { from?: string; to?: string; view?: "invoice" | "date"; distributor?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.view) query.set("view", params.view);
    if (params?.distributor) query.set("distributor", params.distributor);
    if (params?.q) query.set("q", params.q);
    return request<any>(`/reports/purchase/register?${query}`, "GET");
  },

  purchaseDetail: (params?: { from?: string; to?: string; distributor?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.distributor) query.set("distributor", params.distributor);
    if (params?.q) query.set("q", params.q);
    return request<any>(`/reports/purchase/detail?${query}`, "GET");
  },

  purchaseSummary: (params?: { from?: string; to?: string; groupBy?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.groupBy) query.set("groupBy", params.groupBy);
    return request<any>(`/reports/purchase/summary?${query}`, "GET");
  },

  purchaseSchedule: (params?: { from?: string; to?: string; schedule?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.schedule) query.set("schedule", params.schedule);
    return request<any>(`/reports/purchase/schedule?${query}`, "GET");
  },

  // ── Payments Reports Family (Task 4) ──
  pendingCustomers: (params?: { view?: "summary" | "detail"; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.view) query.set("view", params.view);
    if (params?.q) query.set("q", params.q);
    return request<any>(`/reports/payments/pending-customers?${query}`, "GET");
  },

  pendingDistributors: (params?: { view?: "summary" | "detail"; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.view) query.set("view", params.view);
    if (params?.q) query.set("q", params.q);
    return request<any>(`/reports/payments/pending-distributors?${query}`, "GET");
  },

  paymentsRegister: (params?: { from?: string; to?: string; type?: string; mode?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.type) query.set("type", params.type);
    if (params?.mode) query.set("mode", params.mode);
    if (params?.q) query.set("q", params.q);
    return request<any>(`/reports/payments/register?${query}`, "GET");
  },

  expenseRegister: (params?: { from?: string; to?: string; groupBy?: "category" | "name"; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.groupBy) query.set("groupBy", params.groupBy);
    if (params?.q) query.set("q", params.q);
    return request<any>(`/reports/payments/expense?${query}`, "GET");
  },

  // ── Party Reports Family (Task 6) ──
  partyCustomers: (params?: { q?: string; sort?: "rfm" | "balance" }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.sort) query.set("sort", params.sort);
    return request<any>(`/reports/party/customers?${query}`, "GET");
  },

  partyDistributors: (params?: { q?: string }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    return request<any>(`/reports/party/distributors?${query}`, "GET");
  },

  partyLedger: (params: { type: "customer" | "supplier"; id: string; from?: string; to?: string }) => {
    const query = new URLSearchParams();
    query.set("type", params.type);
    query.set("id", params.id);
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    return request<any>(`/reports/party/ledger?${query}`, "GET");
  },

  partyFollowups: (params?: { from?: string; to?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.q) query.set("q", params.q);
    return request<any>(`/reports/party/followups?${query}`, "GET");
  },

  // ── Order Reports Family (Task 7) ──
  shortbook: (params?: { q?: string; sort?: string }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.sort) query.set("sort", params.sort);
    return request<any>(`/reports/order/shortbook?${query}`, "GET");
  },

  purchaseOrders: (params?: { from?: string; to?: string; groupBy?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.groupBy) query.set("groupBy", params.groupBy);
    if (params?.q) query.set("q", params.q);
    return request<any>(`/reports/order/purchase-orders?${query}`, "GET");
  },
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export interface DashboardInvoice {
  id: string;
  invoiceNo: string;
  customerName?: string | null;
  grandTotal: number;
  amountPaid?: number | null;
  status?: "paid" | "unpaid" | "partial" | "hold" | "cancelled" | null;
  date: string;
}

export interface DashboardLowStockMedicine {
  id: string;
  name: string;
  unit?: string | null;
  minQuantity?: number | null;
  availableStock: number;
}

export interface DashboardExpiringBatch {
  id: string;
  medicineName: string;
  batchNo?: string | null;
  expiryDate: string;
  quantity: number;
  unit?: string | null;
}

export interface DashboardDueParty {
  id: string;
  name: string;
  phone?: string | null;
  balance: number;
}

export interface DashboardKpis {
  todaySales: number;
  todayGst: number;
  todayInvoices: number;
  lowStockCount: number;
  expiringCount: number;
  outstandingCredit: number;
  unpaidInvoices: number;
  unpaidTotal: number;
  activeBillingDays: number;
  totalInvoices: number;
  recentInvoices: DashboardInvoice[];
  lowStock: DashboardLowStockMedicine[];
  expiringBatches: DashboardExpiringBatch[];
  lastBackup: { type: string; createdAt: string | number | Date } | null;
  stockValue?: { packs: number; mrpValue: number; saleValue: number; costValue: number };
  collections?: { received: number; paid: number; expenses: number; totalIn?: number; totalOut?: number };
  dues?: {
    customerTotal: number;
    customers: DashboardDueParty[];
    supplierTotal: number;
    suppliers: DashboardDueParty[];
  };
  // Task 9 — screenshot parity (range-aware)
  dateRange?: { from: string; to: string };
  netSales?: number;
  netSalesCount?: number;
  netSalesPrev?: number;
  netSalesChangePct?: number | null;
  netPurchase?: number;
  netPurchaseCount?: number;
  netPurchasePrev?: number;
  netPurchaseChangePct?: number | null;
  grossProfit?: number;
  grossProfitPrev?: number | null;
  grossProfitChangePct?: number | null;
  customers?: { total: number; avgOrderValue: number; new: number; repeat: number };
}

export const dashboardApi = {
  kpis: (params?: string | { date?: string; from?: string; to?: string }) => {
    let query = "";
    if (typeof params === "string") {
      query = params ? `?date=${encodeURIComponent(params)}` : "";
    } else if (params) {
      const qs = new URLSearchParams();
      if (params.date) qs.set("date", params.date);
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
      const s = qs.toString();
      if (s) query = `?${s}`;
    }
    return request<DashboardKpis>(`/dashboard/kpis${query}`, "GET");
  },

  getKPIs: (date?: string) => {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<DashboardKpis>(`/dashboard/kpis${query}`, "GET");
  },
};

// ---------------------------------------------------------------------------
// Refill reminders
// ---------------------------------------------------------------------------
export interface RefillReminder {
  id: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  medicineId?: string | null;
  medicineName: string;
  lastPurchaseDate: string;
  reminderDate: string;
  status: "pending" | "sent" | "completed";
  notes?: string | null;
}

export const refillsApi = {
  list: (params?: { status?: string; dueOnly?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.dueOnly) query.set("dueOnly", "1");
    const qs = query.toString();
    return request<RefillReminder[]>(`/refills${qs ? `?${qs}` : ""}`, "GET");
  },

  dueCount: () => request<{ count: number }>("/refills/due-count", "GET"),

  upcoming: (days = 7) => request<RefillReminder[]>(`/refills/upcoming?days=${days}`, "GET"),

  create: (data: {
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    medicineId?: string;
    medicineName: string;
    lastPurchaseDate: string;
    daysAfter?: number;
    reminderDate?: string;
    notes?: string;
  }) => request<RefillReminder>("/refills", "POST", data),

  update: (id: string, data: { reminderDate?: string; status?: "pending" | "sent" | "completed"; notes?: string }) =>
    request<RefillReminder>(`/refills/${id}`, "PUT", data),

  remove: (id: string) =>
    request<{ removed: boolean }>(`/refills/${id}`, "DELETE"),

  /** Queue one reviewed reminder for a single row. */
  send: (id: string, channel: MessageChannel) =>
    request<MessageDelivery>(`/refills/${id}/send`, "POST", { channel }),

  /** Bulk-queue reminders for every due row; returns queued/skip counts. */
  sendDue: (channel: MessageChannel) =>
    request<{ queued: number; already_queued: number; skipped_optout: number; skipped_nophone: number; deliveryIds: string[] }>(
      "/refills/send-due",
      "POST",
      { channel }
    ),
};

// ---------------------------------------------------------------------------
// Messaging (Task 9) — deliveries, consent, invoice sharing
// ---------------------------------------------------------------------------
export type MessageChannel = "whatsapp" | "sms" | "email";
export type MessageDeliveryStatus = "queued" | "sending" | "sent" | "failed" | "opted_out";

export interface MessageDelivery {
  id: string;
  channel: MessageChannel;
  recipient: string;
  template: string;
  variables?: Record<string, unknown> | null;
  aggregateType?: string | null;
  aggregateId?: string | null;
  status: MessageDeliveryStatus;
  providerId?: string | null;
  error?: string | null;
  attempts?: number;
  outboxEventId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationPreference {
  id: string;
  customerId: string | null;
  channel: MessageChannel;
  optedOut: boolean;
  updatedAt: string;
  customerName?: string | null;
  customerPhone?: string | null;
}

export const messagesApi = {
  send: (data: {
    channel: MessageChannel;
    recipient?: string;
    customerId?: string;
    template: string;
    variables?: Record<string, unknown>;
    aggregateType?: string;
    aggregateId?: string;
  }) => request<MessageDelivery>("/messages/send", "POST", data),

  /** `{ data, body }` — body carries `total` + `pagination`. */
  history: (params?: {
    aggregateType?: string;
    aggregateId?: string;
    channel?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.aggregateType) query.set("aggregateType", params.aggregateType);
    if (params?.aggregateId) query.set("aggregateId", params.aggregateId);
    if (params?.channel) query.set("channel", params.channel);
    if (params?.status) query.set("status", params.status);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return requestFull<MessageDelivery[]>(`/messages${qs ? `?${qs}` : ""}`, "GET");
  },

  retry: (id: string) => request<MessageDelivery>(`/messages/${id}/retry`, "POST"),

  preferences: () => request<CommunicationPreference[]>("/messages/preferences", "GET"),

  setPreference: (data: { customerId?: string | null; channel: MessageChannel; optedOut: boolean }) =>
    request<CommunicationPreference>("/messages/preferences", "PUT", data),

  /** Env presence booleans only — never secret values. */
  providers: () => request<{ whatsapp: boolean; sms: boolean; email: boolean }>("/messages/providers", "GET"),

  invoiceShare: (invoiceId: string, data: { channels: MessageChannel[]; customerId?: string }) =>
    request<{ deliveries: MessageDelivery[]; skipped: Array<{ channel: string; reason: string }> }>(
      `/invoices/${invoiceId}/share`,
      "POST",
      data
    ),
};

// ---------------------------------------------------------------------------
// Prescriptions (Task 6)
// ---------------------------------------------------------------------------
export type PrescriptionStatus = "pending" | "verified" | "dispensed" | "rejected";

export interface Prescription {
  id: string;
  patientName: string;
  patientAge?: number | null;
  patientGender?: string | null;
  customerId?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  date: string;
  notes?: string | null;
  /** stored_files.id of the uploaded prescription image. */
  imagePath?: string | null;
  status: PrescriptionStatus;
  dispensedAt?: string | null;
  dispensedInvoiceId?: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Only present on get() — invoices referencing this prescription. */
  invoices?: any[];
}

export const prescriptionsApi = {
  list: async (params?: {
    q?: string;
    customerId?: string;
    doctorId?: string;
    status?: PrescriptionStatus;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.customerId) query.set("customerId", params.customerId);
    if (params?.doctorId) query.set("doctorId", params.doctorId);
    if (params?.status) query.set("status", params.status);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const { data, body } = await requestFull<Prescription[]>(`/prescriptions?${query}`, "GET");
    return {
      data,
      total: (body?.total as number) ?? data.length,
      pagination: body?.pagination as { page: number; limit: number } | undefined,
    };
  },

  get: (id: string) => request<Prescription>(`/prescriptions/${id}`, "GET"),

  create: (data: {
    patientName: string;
    customerId?: string;
    patientAge?: number;
    patientGender?: string;
    doctorId?: string;
    date: string;
    notes?: string;
    imageFileId?: string;
  }) => request<Prescription>("/prescriptions", "POST", data),

  update: (id: string, data: Partial<{
    patientName: string;
    customerId: string;
    patientAge: number;
    patientGender: string;
    doctorId: string;
    date: string;
    notes: string;
    imageFileId: string;
    status: PrescriptionStatus;
  }>) => request<Prescription>(`/prescriptions/${id}`, "PUT", data),

  verify: (id: string) => request<Prescription>(`/prescriptions/${id}/verify`, "POST", {}),

  reject: (id: string, reason: string) =>
    request<Prescription>(`/prescriptions/${id}/reject`, "POST", { reason }),

  dispense: (id: string, invoiceId: string) =>
    request<{ prescription: Prescription; invoice: any }>(`/prescriptions/${id}/dispense`, "POST", { invoiceId }),

  /** Prescriptions linked to one invoice (sale-time link or dispense record). */
  forInvoice: (invoiceId: string) => request<Prescription[]>(`/prescriptions/invoice/${invoiceId}`, "GET"),

  remove: (id: string) => request<{ removed: boolean }>(`/prescriptions/${id}`, "DELETE"),
};

// ---------------------------------------------------------------------------
// Stock Audits (physical stock-take sessions)
// ---------------------------------------------------------------------------
export type StockAuditStatus = "open" | "approved" | "cancelled";

export interface StockAuditSummary {
  totalRows: number;
  counted: number;
  varianceRows: number;
  totalVarianceValue?: number;
}

export interface StockAudit {
  id: string;
  status: StockAuditStatus;
  note?: string | null;
  startedAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  createdAt: string;
  summary?: StockAuditSummary;
}

export interface StockAuditCountRow {
  id: string;
  auditId: string;
  medicineId: string;
  batchId: string;
  medicineName: string;
  medicineBrand?: string | null;
  batchNo: string;
  expiryDate: string;
  expectedQuantity: number;
  countedQuantity: number;
  variance: number;
  currentBatchQuantity: number;
  purchasePrice: number;
  countedAt: string;
}

export interface StockAuditUncountedRow {
  id: string;
  medicineId: string;
  medicineName: string;
  medicineBrand?: string | null;
  batchNo: string;
  expiryDate: string;
  currentQuantity: number;
  purchasePrice: number;
}

export interface StockAuditDetail {
  audit: StockAudit;
  rows: StockAuditCountRow[];
  uncounted: StockAuditUncountedRow[];
  summary: StockAuditSummary;
}

export const stockAuditsApi = {
  create: (data: { note?: string }) => request<StockAudit>("/stock-audits", "POST", data),

  list: async (params?: { status?: StockAuditStatus; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const { data, body } = await requestFull<StockAudit[]>(`/stock-audits?${query}`, "GET");
    return {
      data,
      total: (body?.total as number) ?? data.length,
      pagination: body?.pagination as { page: number; limit: number } | undefined,
    };
  },

  get: (id: string) => request<StockAuditDetail>(`/stock-audits/${id}`, "GET"),

  count: (auditId: string, data: { medicineId: string; batchId: string; countedQuantity: number }) =>
    request<StockAuditCountRow & { created: boolean }>(`/stock-audits/${auditId}/counts`, "POST", data),

  updateCount: (countId: string, countedQuantity: number) =>
    request<StockAuditCountRow>(`/stock-audits/counts/${countId}`, "PUT", { countedQuantity }),

  approve: (id: string, reason: string) =>
    request<{ audit: StockAudit; adjustments: any[] }>(`/stock-audits/${id}/approve`, "POST", { reason }),

  cancel: (id: string, reason?: string) =>
    request<StockAudit>(`/stock-audits/${id}/cancel`, "POST", reason ? { reason } : {}),
};

// ---------------------------------------------------------------------------
// Barcode Labels (Task 8)
// ---------------------------------------------------------------------------
export interface LabelTemplate {
  id: string;
  widthMm: number;
  heightMm: number;
  cols: number;
  rows: number;
  /** cols x rows — labels per A4 sheet. */
  perSheet: number;
}

export interface LabelData {
  barcode: string | null;
  /** true when the medicine has no barcode — render a name-only label. */
  needsBarcode: boolean;
  name: string;
  fullName: string;
  brand: string | null;
  pack: string;
  batchNo: string | null;
  /** Batch expiry as MM/YY (e.g. 12/27), or null without a batch. */
  expiry: string | null;
  mrp: number | null;
  storeName: string | null;
}

export interface LabelPreview {
  template: LabelTemplate;
  labels: LabelData[];
  totalLabels: number;
}

export interface LabelPreviewItem {
  medicineId: string;
  batchId?: string;
  quantity: number;
  template: string;
}

export const labelsApi = {
  templates: () => request<LabelTemplate[]>("/labels/templates", "GET"),

  preview: (data: { items: LabelPreviewItem[]; includeBatch?: boolean }) =>
    request<LabelPreview>("/labels/preview", "POST", data),
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const settingsApi = {
  getAll: () => request<Record<string, any>>("/settings", "GET"),

  get: (key: string) => request<any>(`/settings/${key}`, "GET"),

  set: (key: string, value: any) => request<any>(`/settings/${key}`, "PUT", { value }),

  getInvoiceFormat: () => request<any>("/settings/invoice-format", "GET"),

  setInvoiceFormat: (format: any) =>
    request<any>("/settings/invoice-format", "PUT", { format }),
};

// ---------------------------------------------------------------------------
// Expiry Safety Policy (Task 5)
// ---------------------------------------------------------------------------
export const expiryPolicyApi = {
  /** `{ policy }` — install-wide policy merged over server defaults. */
  get: () => request<any>("/expiry-policy", "GET"),

  put: (policy: {
    blockExpiredSale: boolean;
    blockExpiredPurchase: boolean;
    warningDays: number;
    blockWithinDays: number;
    allowOverrideRoles: string[];
  }) => request<any>("/expiry-policy", "PUT", policy),

  /** Server-side pre-check with the caller's role. */
  evaluate: (data: { expiryDate: string; operation: "sale" | "purchase" | "batch_edit" }) =>
    request<any>("/expiry-policy/evaluate", "POST", data),
};

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------
export const backupApi = {
  getStatus: () => request<any>("/backup/status", "GET"),

  getHistory: (params?: { type?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.type) query.set("type", params.type);
    if (params?.limit) query.set("limit", String(params.limit));
    return request<any[]>(`/backup/history?${query}`, "GET");
  },

  create: (type?: "daily" | "weekly" | "manual") =>
    request<any>("/backup/create", "POST", { type: type ?? "manual" }),

  restore: (filePath: string) =>
    request<any>("/backup/restore", "POST", { filePath }),

  getCloudStatus: () => request<any>("/backup/cloud-status", "GET"),

  setCloudStatus: (data: {
    provider: "s3" | "r2" | "gdrive";
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    folder: string;
    encryptionKey: string;
  }) => request<any>("/backup/cloud-status", "PUT", data),

  uploadLatest: () => request<any>("/backup/upload-latest", "POST"),

  driveAuthUrl: () => request<{ url: string }>("/backup/drive/auth-url", "GET"),

  driveCallback: (code: string) =>
    request<{ email: string }>("/backup/drive/callback", "POST", { code }),

  driveDisconnect: () =>
    request<{ message: string }>("/backup/drive/disconnect", "POST"),

  driveFiles: () =>
    request<Array<{ id: string; name: string; size: number; createdAt: string }>>(
      "/backup/drive/files",
      "GET"
    ),

  driveRestore: (fileId: string) =>
    request<any>("/backup/drive/restore", "POST", { fileId }),

  getSchedule: () => request<any>("/backup/schedule", "GET"),

  updateSchedule: (data: { dailyHour: number; weeklyDay: number; weeklyHour: number }) =>
    request<any>("/backup/schedule", "POST", data),
};

// ---------------------------------------------------------------------------
// Procurement (supplier comparison, rate history, metrics, quotes)
// ---------------------------------------------------------------------------
export const procurementApi = {
  compare: (medicineId: string, quantity?: number) => {
    const query = new URLSearchParams({ medicineId });
    if (quantity != null) query.set("quantity", String(quantity));
    return request<{ medicineId: string; quantity: number; quotes: any[] }>(
      `/procurement/compare?${query}`,
      "GET"
    );
  },

  recommendation: (medicineId: string, quantity?: number) => {
    const query = new URLSearchParams({ medicineId });
    if (quantity != null) query.set("quantity", String(quantity));
    return request<any>(`/procurement/recommendation?${query}`, "GET");
  },

  rateHistory: (params: { medicineId: string; supplierId?: string; from?: string; to?: string }) => {
    const query = new URLSearchParams({ medicineId: params.medicineId });
    if (params.supplierId) query.set("supplierId", params.supplierId);
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    return request<{ rows: any[]; count: number }>(`/procurement/rate-history?${query}`, "GET");
  },

  supplierMetrics: (supplierId: string, params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return request<any>(`/procurement/suppliers/${supplierId}/metrics${qs ? `?${qs}` : ""}`, "GET");
  },

  expiryItems: (supplierId: string, params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return request<{ supplierId: string; supplierName: string; rows: any[]; totalValue: number }>(
      `/procurement/suppliers/${supplierId}/expiry-items${qs ? `?${qs}` : ""}`,
      "GET"
    );
  },

  createQuote: (data: {
    supplierId: string;
    medicineId: string;
    quotedRate: number;
    quoteDate?: string;
    notes?: string;
  }) => request<any>("/procurement/quotes", "POST", data),

  quotes: (params?: { medicineId?: string; supplierId?: string }) => {
    const query = new URLSearchParams();
    if (params?.medicineId) query.set("medicineId", params.medicineId);
    if (params?.supplierId) query.set("supplierId", params.supplierId);
    const qs = query.toString();
    return request<{ rows: any[]; count: number }>(`/procurement/quotes${qs ? `?${qs}` : ""}`, "GET");
  },
};

// ---------------------------------------------------------------------------
// Customer Growth (Task 10) — insights, loyalty, offers, campaigns
// ---------------------------------------------------------------------------
export interface CustomerRfm {
  recencyDays: number | null;
  frequency: number;
  monetary: number;
  rScore: number;
  fScore: number;
  mScore: number;
  rfmScore: number;
}

export interface FrequentMedicine {
  medicineId: string;
  name: string;
  brand?: string | null;
  qty: number;
  lastBought: string;
  avgGapDays: number | null;
  dueDate: string | null;
}

export interface CustomerInsights {
  customer: { id: string; name: string; phone?: string | null; email?: string | null };
  rfm: CustomerRfm;
  ltv: number;
  invoiceCount: number;
  avgIntervalDays: number | null;
  churnRisk: "unknown" | "low" | "medium" | "high";
  daysIdle: number | null;
  lastPurchaseAt: string | null;
  frequentMedicines: FrequentMedicine[];
  refillCandidates: FrequentMedicine[];
  balance: number;
}

export interface LoyaltyEntry {
  id: string;
  customerId: string;
  points: number;
  type: "earn" | "redeem" | "adjust";
  reason?: string | null;
  invoiceId?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
}

export interface LoyaltyView {
  customerId: string;
  balance: number;
  entries: LoyaltyEntry[];
}

export interface Offer {
  id: string;
  name: string;
  type: "fixed" | "percent";
  value: number;
  medicineId?: string | null;
  minAmount: number;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OfferEvaluation {
  applies: boolean;
  discount: number;
  reason: string | null;
}

export type CampaignAudience =
  | { type: "all" }
  | { type: "rfm"; minScore: number }
  | { type: "medicine"; medicineId: string; withinDays?: number }
  | { type: "balance"; minAmount: number }
  | { type: "refill"; withinDays: number };

export interface Campaign {
  id: string;
  name: string;
  channel: MessageChannel;
  template: string;
  body?: string | null;
  audience: string;
  scheduleAt?: string | null;
  status: "draft" | "scheduled" | "done" | "cancelled";
  stats?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CampaignStats {
  id?: string;
  status?: Campaign["status"];
  audience: number;
  queued: number;
  skippedOptOut: number;
  skippedNoContact: number;
}

export const engagementApi = {
  insights: (customerId: string) =>
    request<CustomerInsights>(`/customer-engagement/insights/${encodeURIComponent(customerId)}`, "GET"),

  loyalty: (customerId: string) =>
    request<LoyaltyView>(`/customer-engagement/loyalty?customerId=${encodeURIComponent(customerId)}`, "GET"),

  earn: (data: { customerId: string; points: number; reason?: string; idempotencyKey?: string }) =>
    request<LoyaltyEntry>("/customer-engagement/loyalty/earn", "POST", data),

  redeem: (data: { customerId: string; points: number; reason?: string; idempotencyKey?: string }) =>
    request<LoyaltyEntry>("/customer-engagement/loyalty/redeem", "POST", data),

  listOffers: (params?: { activeOnly?: boolean; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.activeOnly) query.set("activeOnly", "1");
    if (params?.q) query.set("q", params.q);
    const qs = query.toString();
    return request<Offer[]>(`/customer-engagement/offers${qs ? `?${qs}` : ""}`, "GET");
  },

  createOffer: (data: {
    name: string;
    type: "fixed" | "percent";
    value: number;
    medicineId?: string | null;
    minAmount?: number;
    startsOn: string;
    endsOn: string;
    isActive?: boolean;
  }) => request<Offer>("/customer-engagement/offers", "POST", data),

  updateOffer: (id: string, data: Partial<{
    name: string;
    type: "fixed" | "percent";
    value: number;
    medicineId: string | null;
    minAmount: number;
    startsOn: string;
    endsOn: string;
    isActive: boolean;
  }>) => request<Offer>(`/customer-engagement/offers/${encodeURIComponent(id)}`, "PUT", data),

  /** Server-side preview of an offer against a bill subtotal. */
  evaluateOffer: (id: string, data: { subtotal: number; medicineIds?: string[] }) =>
    request<OfferEvaluation>(`/customer-engagement/offers/${encodeURIComponent(id)}/evaluate`, "POST", data),

  listCampaigns: () => request<Campaign[]>("/customer-engagement/campaigns", "GET"),

  createCampaign: (data: {
    name: string;
    channel: MessageChannel;
    template?: string;
    body?: string;
    audience: CampaignAudience | string;
    scheduleAt?: string | null;
  }) => request<Campaign>("/customer-engagement/campaigns", "POST", data),

  getCampaign: (id: string) => request<Campaign>(`/customer-engagement/campaigns/${encodeURIComponent(id)}`, "GET"),

  sendCampaign: (id: string) =>
    request<CampaignStats>(`/customer-engagement/campaigns/${encodeURIComponent(id)}/send`, "POST"),

  cancelCampaign: (id: string) =>
    request<Campaign>(`/customer-engagement/campaigns/${encodeURIComponent(id)}/cancel`, "POST"),
};

// ---------------------------------------------------------------------------
// Accounting (Task 11) — double-entry ledger + financial reports
// ---------------------------------------------------------------------------
export const accountingApi = {
  accounts: () => request<any[]>("/accounting/accounts", "GET"),

  createAccount: (data: { code: string; name: string; type: string }) =>
    request<any>("/accounting/accounts", "POST", data),

  /** Manual journal post (admin|pharmacist only). */
  post: (data: { date: string; description?: string; lines: Array<{ code: string; debit?: number; credit?: number; partyType?: string; partyId?: string; memo?: string }> }) =>
    request<any>("/accounting/post", "POST", data),

  /**
   * Opening balances (admin|pharmacist only). One batch per date — a repeat
   * POST for the same date → 400 "Opening balances already posted for <date>".
   */
  postOpening: (data: { date: string; description?: string; lines: Array<{ code: string; debit?: number; credit?: number }> }) =>
    request<any>("/accounting/opening", "POST", data),

  /** Prefill: INVENTORY/AR/AP from current stock + ledgers, CAPITAL balancing. */
  suggestOpening: () =>
    request<{ lines: Array<{ code: string; debit: number; credit: number }> }>(
      "/accounting/opening/suggest",
      "GET"
    ),

  trialBalance: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return request<any>(`/accounting/trial-balance${qs ? `?${qs}` : ""}`, "GET");
  },

  profitLoss: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return request<any>(`/accounting/profit-loss${qs ? `?${qs}` : ""}`, "GET");
  },

  balanceSheet: (asOf: string) =>
    request<any>(`/accounting/balance-sheet?asOf=${encodeURIComponent(asOf)}`, "GET"),

  dayBook: (params?: { from?: string; to?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return request<any>(`/accounting/day-book${qs ? `?${qs}` : ""}`, "GET");
  },

  /** Trace every journal entry posted for a business source. */
  entries: (params: { sourceType: string; sourceId?: string }) => {
    const query = new URLSearchParams();
    query.set("sourceType", params.sourceType);
    if (params.sourceId) query.set("sourceId", params.sourceId);
    return request<any[]>(`/accounting/entries?${query}`, "GET");
  },

  entry: (id: string) => request<any>(`/accounting/entries/${encodeURIComponent(id)}`, "GET"),

  reverse: (id: string, reason?: string) =>
    request<any>(`/accounting/entries/${encodeURIComponent(id)}/reverse`, "POST", { reason }),

  periods: () => request<any[]>("/accounting/periods", "GET"),

  closePeriod: (data: { fromDate: string; toDate: string }) =>
    request<any>("/accounting/periods/close", "POST", data),

  reopenPeriod: (id: string) =>
    request<any>(`/accounting/periods/${encodeURIComponent(id)}/reopen`, "POST", {}),
};

// ---------------------------------------------------------------------------
// Cash & Bank (Task 12) — cash/bank books + bank-statement reconciliation
// ---------------------------------------------------------------------------
export const reconciliationApi = {
  /** Cash Book — built from journal lines on the CASH account. */
  cashBook: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return request<any>(`/reconciliation/cash${qs ? `?${qs}` : ""}`, "GET");
  },

  /** Bank Book — built from journal lines on the BANK account. */
  bankBook: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return request<any>(`/reconciliation/bank${qs ? `?${qs}` : ""}`, "GET");
  },

  /** Import a bank statement CSV (admin|pharmacist). */
  importCsv: (csv: string) =>
    request<{ imported: number; duplicates: number; skipped: Array<{ line: number; reason: string }> }>(
      "/reconciliation/import",
      "POST",
      { csv }
    ),

  rows: (params?: { from?: string; to?: string; unreconciledOnly?: boolean; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.unreconciledOnly) query.set("unreconciledOnly", "true");
    if (params?.q) query.set("q", params.q);
    const qs = query.toString();
    return request<any[]>(`/reconciliation/rows${qs ? `?${qs}` : ""}`, "GET");
  },

  /** Candidate BANK journal lines for one statement row. */
  suggest: (bankRowId: string) =>
    request<any>(`/reconciliation/suggest?bankRowId=${encodeURIComponent(bankRowId)}`, "GET"),

  /** Match a statement row to a journal line (admin|pharmacist). */
  match: (data: { bankRowId: string; journalLineId: string; notes?: string; force?: boolean }) =>
    request<any>("/reconciliation/match", "POST", data),

  /** Remove a match link only — the journal is never touched. */
  unmatch: (matchId: string) => request<any>("/reconciliation/unmatch", "POST", { matchId }),

  /** Bank-only reconciliation status: totals + unmatched lists both sides. */
  status: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return request<any>(`/reconciliation/status${qs ? `?${qs}` : ""}`, "GET");
  },
};

// ---------------------------------------------------------------------------
// Compliance (Task 13) — e-invoice / e-way submissions to a GST provider
// ---------------------------------------------------------------------------
export const complianceApi = {
  /** Submission state + payload preflight issues for one invoice. */
  status: (invoiceId: string) =>
    request<any>(`/compliance/invoices/${encodeURIComponent(invoiceId)}`, "GET"),

  /** Generate an e-invoice (admin | pharmacist). */
  generate: (invoiceId: string) =>
    request<any>(`/compliance/invoices/${encodeURIComponent(invoiceId)}/generate`, "POST", {}),

  /** Cancel an accepted e-invoice within the 24h window (admin | pharmacist). */
  cancel: (invoiceId: string, reason: string) =>
    request<any>(`/compliance/invoices/${encodeURIComponent(invoiceId)}/cancel`, "POST", { reason }),

  /** E-way bill for an accepted e-invoice (admin | pharmacist). */
  eway: (
    invoiceId: string,
    data: {
      distanceKm: number;
      transporterName?: string;
      transporterGstin?: string;
      vehicleNo?: string;
      reason?: string;
    }
  ) => request<any>(`/compliance/invoices/${encodeURIComponent(invoiceId)}/eway`, "POST", data),

  /** Provider health — booleans + provider name, never secrets. */
  providers: () => request<any>("/compliance/providers", "GET"),

  /** Compliance center listing (tenant-scoped). */
  submissions: (params?: { from?: string; to?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.status) query.set("status", params.status);
    const qs = query.toString();
    return request<any[]>(`/compliance/submissions${qs ? `?${qs}` : ""}`, "GET");
  },
};

// ---------------------------------------------------------------------------
// Customer Orders (Task 14)
// ---------------------------------------------------------------------------
export type CustomerOrderStatus =
  | "pending"
  | "accepted"
  | "packed"
  | "ready"
  | "delivered"
  | "rejected"
  | "cancelled";

export interface CustomerOrderItem {
  id: string;
  orderId: string;
  medicineId: string;
  medicineName: string;
  quantity: number;
  unitPrice: number;
}

export interface CustomerOrder {
  id: string;
  createdBy: string;
  storeId: string;
  customerId?: string | null;
  customerName: string;
  phone: string;
  deliveryAddress?: string | null;
  notes?: string | null;
  prescriptionFileId?: string | null;
  status: CustomerOrderStatus;
  reason?: string | null;
  invoiceId?: string | null;
  subtotal: number;
  createdAt: string;
  updatedAt: string;
  items: CustomerOrderItem[];
  /** Inline prescription image — only present on single-order fetch. */
  prescriptionFile?: { filename: string; contentType: string; data: string };
}

export interface OrderStatusCounts {
  all: number;
  pending: number;
  accepted: number;
  packed: number;
  ready: number;
  delivered: number;
  rejected: number;
  cancelled: number;
}

export const ordersApi = {
  /** Install-shared queue (authed, NOT tenant-filtered — see API.md). */
  list: async (params?: {
    status?: CustomerOrderStatus | "all";
    q?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.status && params.status !== "all") query.set("status", params.status);
    if (params?.q) query.set("q", params.q);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    const { data, body } = await requestFull<CustomerOrder[]>(`/orders${qs ? `?${qs}` : ""}`, "GET");
    return {
      data,
      total: (body?.total as number) ?? data.length,
      /** Server-computed per-status totals for the search scope. */
      counts: body?.counts as OrderStatusCounts | undefined,
      pagination: body?.pagination as { page: number; limit: number } | undefined,
    };
  },

  /** Detail with items + inlined prescription file (when attached). */
  get: (id: string) => request<CustomerOrder>(`/orders/${id}`, "GET"),

  accept: (id: string) => request<CustomerOrder>(`/orders/${id}/accept`, "POST", {}),
  pack: (id: string) => request<CustomerOrder>(`/orders/${id}/pack`, "POST", {}),
  ready: (id: string) => request<CustomerOrder>(`/orders/${id}/ready`, "POST", {}),
  deliver: (id: string, invoiceId: string) =>
    request<CustomerOrder>(`/orders/${id}/deliver`, "POST", { invoiceId }),
  reject: (id: string, reason: string) =>
    request<CustomerOrder>(`/orders/${id}/reject`, "POST", { reason }),
  cancel: (id: string, reason: string) =>
    request<CustomerOrder>(`/orders/${id}/cancel`, "POST", { reason }),
};

// ---------------------------------------------------------------------------
// Public ordering API (Task 14) — unauthenticated customer portal
// ---------------------------------------------------------------------------
export interface PublicCatalogMedicine {
  medicineId: string;
  name: string;
  brand?: string;
  packSize?: string;
  sellingPrice: number;
  mrp?: number;
  inStock: boolean;
}

export interface PublicOrderStatusView {
  id: string;
  status: CustomerOrderStatus;
  createdAt: string;
  updatedAt: string;
  items: Array<{ medicineName: string; quantity: number }>;
}

export const publicApi = {
  createOrder: (data: {
    storeId: string;
    customerName: string;
    phone: string;
    deliveryAddress?: string;
    notes?: string;
    prescriptionFileId?: string;
    items: Array<{ medicineId: string; quantity: number }>;
  }) => request<CustomerOrder>("/public/orders", "POST", data),

  searchMedicines: (storeId: string, q: string, limit = 20) =>
    request<PublicCatalogMedicine[]>(
      `/public/medicines?storeId=${encodeURIComponent(storeId)}&q=${encodeURIComponent(q)}&limit=${limit}`,
      "GET"
    ),

  /** Owner-scoped prescription upload (purpose order-prescription). */
  uploadFile: (data: { storeId: string; filename: string; contentType: string; data: string }) =>
    request<{ id: string; duplicate: boolean }>("/public/files", "POST", {
      storeId: data.storeId,
      filename: data.filename,
      contentType: data.contentType,
      data: data.data.replace(/^data:[^,]*,/, ""),
    }),

  /** Minimal customer-facing status view. */
  status: (storeId: string, orderId: string) =>
    request<PublicOrderStatusView>(
      `/public/orders/${encodeURIComponent(orderId)}?storeId=${encodeURIComponent(storeId)}`,
      "GET"
    ),

  /** Public store header for the portal title. */
  store: (storeId: string) =>
    request<{ name: string }>(`/public/store?storeId=${encodeURIComponent(storeId)}`, "GET"),
};

// ---------------------------------------------------------------------------
// Devices, sync & staff permissions (Task 15)
// ---------------------------------------------------------------------------
/** localStorage key holding the token returned by POST /devices/register. */
export const DEVICE_TOKEN_KEY = "medibill_device_token";

export interface DeviceView {
  id: string;
  userId: string;
  userName?: string;
  deviceName: string | null;
  platform: string | null;
  appVersion: string | null;
  revoked: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface DeviceSessionView {
  id: string;
  userId: string;
  userName?: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface DeviceActivityEvent {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: string;
  actorName: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface DeviceActivityFeed {
  events: DeviceActivityEvent[];
  counts: { devicesActive: number; devicesRevoked: number; sessions: number };
}

/** `{ userId, role, capabilities }` — drives nav hiding + the My Role tab. */
export interface DeviceCapabilities {
  userId: string;
  role: string;
  capabilities: string[];
}

export const devicesApi = {
  /** Returns `{ id, deviceToken }` — the client persists the token (register once per login). */
  register: (data: { deviceName: string; platform: string; appVersion: string }) =>
    request<{ id: string; deviceToken: string }>("/devices/register", "POST", data),

  /** Admin sees every user's devices; everyone else sees their own. */
  list: () => request<DeviceView[]>("/devices", "GET"),

  /** Capability set for the caller's role (any authenticated user). */
  me: () => request<DeviceCapabilities>("/devices/me", "GET"),

  /** Admin — the device's token starts failing every guarded request with 401. */
  revoke: (id: string) => request<DeviceView>(`/devices/${id}/revoke`, "POST", {}),

  /** Admin — clears the revoked flag. */
  restore: (id: string) => request<DeviceView>(`/devices/${id}/restore`, "POST", {}),

  /** Admin — kills every device + session of one user in one shot. */
  revokeAll: (userId: string) =>
    request<{ devicesRevoked: number; sessionsRevoked: number }>(
      `/devices/users/${userId}/revoke-all`,
      "POST",
      {}
    ),

  /** Admin — every active session on this install (tokens never exposed). */
  sessions: () => request<DeviceSessionView[]>("/devices/sessions", "GET"),

  /** Admin — kills one session immediately (its Bearer/cookie token dies). */
  revokeSession: (tokenId: string) =>
    request<{ id: string; revoked: boolean }>(`/devices/sessions/${tokenId}/revoke`, "POST", {}),

  /** Admin — last 50 audit events + registry counters. */
  activity: () => request<DeviceActivityFeed>("/devices/activity", "GET"),
};

export interface SyncPushOperation {
  operationId: string;
  entity: string;
  action: string;
  payload?: unknown;
  baseVersion?: string;
}

export interface SyncPushResult {
  operationId: string;
  status: "applied" | "conflict" | "duplicate" | "error";
  entityId?: string;
  appliedVersion?: string;
  conflict?: unknown;
  error?: string;
}

export interface SyncPushOutcome {
  results: SyncPushResult[];
  applied: number;
  conflicts: number;
  duplicates: number;
  errors: number;
}

export interface SyncPullOp {
  operationId: string;
  entity: string | null;
  action: string | null;
  payload: unknown;
  entityId: string | null;
  appliedVersion: string | null;
  appliedAt: string;
  status: "applied" | "conflict" | "duplicate" | "error";
}

export interface SyncPullOutcome {
  ops: SyncPullOp[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SyncStatusInfo {
  opsCount: number;
  dbSizeBytes: number;
  lastBackupAt: string | null;
  serverTime: string;
}

export const syncApi = {
  /** Idempotent batch apply (≤100 ops) — see docs/API.md for the conflict policy. */
  push: (operations: SyncPushOperation[]) =>
    request<SyncPushOutcome>("/sync/push", "POST", { operations }),

  /** Cursor feed of the caller's own applied + conflict operations. */
  pull: (params?: { cursor?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit != null) query.set("limit", String(params.limit));
    const qs = query.toString();
    return request<SyncPullOutcome>(`/sync/pull${qs ? `?${qs}` : ""}`, "GET");
  },

  /** Ops journal size + db size + newest backup + server time. */
  status: () => request<SyncStatusInfo>("/sync/status", "GET"),
};

// ---------------------------------------------------------------------------
// Staff & Access — roster management (admin only)
// ---------------------------------------------------------------------------
export type StaffRole = "admin" | "pharmacist" | "cashier";

/**
 * Roster row. `status` is the member status ("active" | "inactive"),
 * `isActive` the account flag the login check reads.
 */
export interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  status: string;
  isActive: boolean;
  createdAt: string;
  deviceCount: number;
  sessionCount: number;
}

export const staffApi = {
  /** Admin — the roster with device/session counts per member. */
  list: () => request<{ items: StaffMember[] }>("/staff", "GET"),

  /** Admin — creates a login with a temporary password. */
  create: (data: { name: string; email: string; phone: string; password: string; role: StaffRole }) =>
    request<{ user: StaffMember }>("/staff", "POST", data),

  /** Admin — role and/or status change. */
  update: (id: string, data: { role?: StaffRole; status?: string }) =>
    request<{ ok: true }>(`/staff/${id}`, "PATCH", data),

  /** Admin — sets a new password for a member. */
  resetPassword: (id: string, newPassword: string) =>
    request<{ ok: true }>(`/staff/${id}/reset-password`, "POST", { newPassword }),

  /** Admin — signs a member out everywhere (every device + session). */
  revokeAllDevices: (userId: string) => devicesApi.revokeAll(userId),
};

// ---------------------------------------------------------------------------
// Integrations Center (Task 17)
// ---------------------------------------------------------------------------
export interface IntegrationFieldDef {
  key: string;
  secret: boolean;
}

export interface IntegrationHealth {
  id: string;
  name: string;
  category: string;
  fields: IntegrationFieldDef[];
  enabled: boolean;
  connected: boolean;
  mode: "settings" | "env" | "fake" | null;
  /** Missing ENV var names only — never values. */
  missingEnv: string[];
  connectedAt: string | null;
  detail?: Record<string, string | null>;
}

export interface IntegrationDetail extends IntegrationHealth {
  /** Plain (non-secret) saved config. */
  config: Record<string, string>;
  /** Secret fields, each redacted to "•••" — the server never returns values. */
  secrets: Record<string, string>;
  updatedBy: string | null;
}

export interface IntegrationsSummary {
  providers: IntegrationHealth[];
  summary: { connected: number; total: number };
}

export interface IntegrationConnectInput {
  config?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  enabled?: boolean;
}

export const integrationsApi = {
  /** Registry + health for every provider + connected/total summary. */
  list: () => request<IntegrationsSummary>("/integrations", "GET"),

  /** One provider: health + saved config (secrets redacted to •••). */
  get: (id: string) => request<IntegrationDetail>(`/integrations/${id}`, "GET"),

  /** Admin | pharmacist — upsert config (secrets encrypted server-side). */
  connect: (id: string, data: IntegrationConnectInput) =>
    request<IntegrationHealth>(`/integrations/${id}/connect`, "POST", data),

  /** Admin | pharmacist — disable AND forget the stored configuration. */
  disconnect: (id: string) => request<IntegrationHealth>(`/integrations/${id}/disconnect`, "POST", {}),
};

// ---------------------------------------------------------------------------
// Scheduled Reports (Task 17)
// ---------------------------------------------------------------------------
export type ScheduledReportType = "sales" | "stock" | "purchase" | "payments" | "party";

export type SchedulePreset =
  | { kind: "daily"; time: string }
  | { kind: "weekly"; day: number; time: string }
  | { kind: "monthly"; day: number; time: string };

export interface ScheduledReportRecipient {
  channel: "email" | "sms";
  address: string;
}

export interface ScheduledReportRow {
  id: string;
  name: string;
  reportType: ScheduledReportType;
  schedule: string; // JSON string — parse with parseSchedule()
  recipients: string; // JSON string
  format: "csv" | "pdf";
  filters: string; // JSON string { daysBack }
  nextRunAt: string | null;
  lastRunAt: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledReportRunRow {
  id: string;
  scheduledReportId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "done" | "failed";
  error: string | null;
  rowCount: number | null;
  fileId: string | null;
  outboxEventId: string | null;
  messageStatus: string | null;
}

export interface ScheduledReportDetail {
  report: ScheduledReportRow;
  runs: ScheduledReportRunRow[];
}

export interface ScheduledReportRunResult {
  run: ScheduledReportRunRow;
  rows: number;
  delivered: number;
  deliveryFailed: number;
}

export interface CreateScheduledReportInput {
  name: string;
  reportType: ScheduledReportType;
  schedule: SchedulePreset;
  recipients: ScheduledReportRecipient[];
  format: "csv" | "pdf";
  filters?: { daysBack: number };
}

export interface UpdateScheduledReportInput {
  name?: string;
  schedule?: SchedulePreset;
  recipients?: ScheduledReportRecipient[];
  filters?: { daysBack: number };
  enabled?: boolean;
}

export const scheduledReportsApi = {
  create: (data: CreateScheduledReportInput) =>
    request<ScheduledReportRow>("/scheduled-reports", "POST", data),

  list: () => request<ScheduledReportRow[]>("/scheduled-reports", "GET"),

  get: (id: string) => request<ScheduledReportDetail>(`/scheduled-reports/${id}`, "GET"),

  update: (id: string, data: UpdateScheduledReportInput) =>
    request<ScheduledReportRow>(`/scheduled-reports/${id}`, "PUT", data),

  remove: (id: string) => request<{ deleted: boolean }>(`/scheduled-reports/${id}`, "DELETE"),

  /** Manual run — generates the CSV, stores the file, queues deliveries. */
  run: (id: string) => request<ScheduledReportRunResult>(`/scheduled-reports/${id}/run`, "POST", {}),

  /** Run history (newest first, ≤50). */
  runs: (id: string) => request<ScheduledReportRunRow[]>(`/scheduled-reports/${id}/runs`, "GET"),
};

// ---------------------------------------------------------------------------
// Auth token management
// ---------------------------------------------------------------------------
const AUTH_TOKEN_KEY = "medibill_auth_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Generic request helpers
// ---------------------------------------------------------------------------
export const api = {
  get<T>(path: string, params?: Record<string, string | number | undefined>) {
    const query = params
      ? "?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
        )
      : "";
    return request<T>(`${path}${query}`, "GET");
  },

  post<T>(path: string, body?: unknown) {
    return request<T>(path, "POST", body);
  },

  put<T>(path: string, body?: unknown) {
    return request<T>(path, "PUT", body);
  },

  delete<T>(path: string) {
    return request<T>(path, "DELETE");
  },
};
