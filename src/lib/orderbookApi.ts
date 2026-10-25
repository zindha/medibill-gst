/**
 * Orderbook API client — distributor ordering workspace.
 * Uses the shared helpers from "@/lib/api".
 */
import { api, request } from "@/lib/api";

export interface OrderbookDistributor {
  id: string;
  supplierId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  pincode: string | null;
  connectionStatus: "connected" | "pending" | "offline";
  creditTerms: string | null;
  creditLimit: number | null;
  outstanding: number | null;
  priceListVersion: string | null;
  createdAt: string;
}

export interface ProductHit {
  id: string;
  name: string;
  packSize: string | null;
  manufacturerName: string | null;
  purchasePrice: number;
  sellingPrice: number;
}

export interface OrderbookPoItem {
  id: string;
  poId: string;
  medicineId: string | null;
  name: string;
  pack: string | null;
  quantity: number;
  freeQuantity: number;
  rate: number;
  receivedQuantity: number;
  sortOrder: number;
}

export interface OrderbookPo {
  id: string;
  distributorId: string;
  number: string;
  status: "draft" | "sent" | "confirmed" | "partial" | "received" | "cancelled";
  orderDate: string;
  expectedDate: string | null;
  total: number;
  notes: string | null;
  createdAt: string;
}

export interface PoListRow {
  po: OrderbookPo;
  distributorName: string;
  itemCount: number;
}

export interface ShortbookItem {
  id: string;
  poId: string | null;
  medicineId: string | null;
  name: string;
  pack: string | null;
  demandedQuantity: number;
  suppliedQuantity: number;
  status: "open" | "carried" | "supplied" | "cancelled";
  createdAt: string;
}

export interface CartItem {
  id: string;
  orderId: string | null;
  distributorId: string;
  medicineId: string | null;
  name: string;
  pack: string | null;
  quantity: number;
  rate: number;
  createdAt: string;
}

export interface CartGroup {
  distributor: { id: string; name: string; connectionStatus: string };
  items: CartItem[];
  subtotal: number;
  lineCount: number;
}

export interface CartView {
  groups: CartGroup[];
  total: number;
}

export interface OrderbookOrder {
  id: string;
  distributorId: string;
  poId: string | null;
  status: string;
  total: number;
  snapshot: string;
  createdAt: string;
}

export interface OrderDetail {
  order: OrderbookOrder;
  distributor: { id: string; name: string };
  snapshot: {
    number: string;
    placedAt: string;
    items: { id: string; name: string; pack: string | null; quantity: number; rate: number }[];
    subtotal: number;
  };
}

export interface Analysis {
  spendByMonth: { month: string; total: number; orderCount: number }[];
  topProducts: { name: string; quantity: number; received: number; amount: number }[];
  statusCounts: { status: string; count: number }[];
  fillRate: number;
  openShortbook: number;
}

export interface AlreadyToOrder {
  pending: {
    medicineId: string | null;
    name: string;
    pack: string | null;
    quantity: number;
    receivedQuantity: number;
    status: string;
    orderDate: string;
    distributorName: string;
  }[];
  shorts: ShortbookItem[];
}

export interface CheckoutResult {
  orders: {
    orderId: string;
    poId: string;
    distributorId: string;
    number: string;
    total: number;
  }[];
}

export interface PoDetail {
  po: OrderbookPo;
  items: OrderbookPoItem[];
  distributor: OrderbookDistributor | null;
}

export interface DistributorDetail {
  distributor: OrderbookDistributor;
  recentOrders: OrderbookOrder[];
  openPos: OrderbookPo[];
}

export type PoItemInput = {
  medicineId?: string | null;
  name: string;
  pack?: string;
  quantity: number;
  freeQuantity?: number;
  rate: number;
};

export const orderbookApi = {
  // Distributors
  listDistributors: (q?: string) =>
    api.get<OrderbookDistributor[]>("/api/orderbook/distributors", { q }),
  createDistributor: (body: Partial<OrderbookDistributor> & { name: string }) =>
    api.post<OrderbookDistributor>("/api/orderbook/distributors", body),
  getDistributor: (id: string) =>
    api.get<DistributorDetail>(`/api/orderbook/distributors/${id}`),
  updateDistributor: (id: string, body: Partial<OrderbookDistributor>) =>
    request<OrderbookDistributor>(`/api/orderbook/distributors/${id}`, "PATCH", body),

  // Products / already-to-order
  searchProducts: (q: string, distributorId?: string, limit?: number) =>
    api.get<ProductHit[]>("/api/orderbook/products", { q, distributorId, limit }),
  alreadyToOrder: () => api.get<AlreadyToOrder>("/api/orderbook/already-to-order"),

  // Purchase orders
  listPos: (params: { status?: string; from?: string; to?: string }) =>
    api.get<PoListRow[]>("/api/orderbook/pos", params),
  createPo: (body: { distributorId: string; expectedDate?: string; notes?: string; items: PoItemInput[] }) =>
    api.post<OrderbookPo>("/api/orderbook/pos", body),
  getPo: (id: string) => api.get<PoDetail>(`/api/orderbook/pos/${id}`),
  sendPo: (id: string) => api.post<OrderbookPo>(`/api/orderbook/pos/${id}/send`),
  confirmPo: (id: string) => api.post<OrderbookPo>(`/api/orderbook/pos/${id}/confirm`),
  receivePo: (id: string, receipts: { itemId: string; receivedQuantity: number }[]) =>
    api.post<{ po: OrderbookPo; shortbooked: number }>(`/api/orderbook/pos/${id}/receive`, {
      receipts,
    }),
  cancelPo: (id: string) => api.post<OrderbookPo>(`/api/orderbook/pos/${id}/cancel`),

  // Shortbook
  listShortbook: (status?: string) =>
    api.get<ShortbookItem[]>("/api/orderbook/shortbook", { status }),
  resolveShortbook: (
    id: string,
    action: "carried" | "supplied" | "cancelled",
    suppliedQuantity?: number
  ) =>
    api.post<ShortbookItem>(`/api/orderbook/shortbook/${id}/resolve`, {
      action,
      suppliedQuantity,
    }),

  // Cart
  getCart: () => api.get<CartView>("/api/orderbook/cart"),
  addCartItem: (body: {
    distributorId: string;
    medicineId?: string | null;
    name: string;
    pack?: string;
    quantity: number;
    rate: number;
  }) => api.post<CartItem>("/api/orderbook/cart/items", body),
  updateCartItem: (id: string, quantity: number, rate?: number) =>
    request<CartItem>(`/api/orderbook/cart/items/${id}`, "PATCH", { quantity, rate }),
  deleteCartItem: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/orderbook/cart/items/${id}`),
  checkout: () => api.post<CheckoutResult>("/api/orderbook/cart/checkout"),

  // Orders + analysis
  getOrder: (id: string) => api.get<OrderDetail>(`/api/orderbook/orders/${id}`),
  analysis: () => api.get<Analysis>("/api/orderbook/analysis"),
};
