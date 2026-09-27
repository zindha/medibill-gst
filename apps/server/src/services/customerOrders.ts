/**
 * Customer ordering service (Task 14) — public order intake + staff queue.
 *
 * Single-store convention (documented): the install is single-store, so the
 * public endpoints take `storeId` = the install owner's user id. Every
 * medicine/file/customer reference is scoped `createdBy/owner = storeId`, so a
 * caller can never touch another tenant's rows even with a guessed id.
 *
 * Staff side (`actorId` = the logged-in user): list/get/transition are
 * deliberately NOT tenant-filtered — the order queue is install-shared (any
 * authenticated staff member sees and moves every order of this install).
 * Mutations are audited with the actor's id. No role gates: any authed staff
 * may transition (documented decision — the queue is a shared counter task).
 *
 * Stock policy: `accept` performs a SOFT reservation — it verifies current
 * availability (Σ active batches.quantity per medicine, scoped to storeId) but
 * never deducts. Deduction happens only through the existing invoice create
 * path (FEFO/expiry policy included) — this service never touches stock.
 */

import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  batches,
  customers,
  customerOrderItems,
  customerOrders,
  generateId,
  invoices,
  medicines,
  settings,
  storedFiles,
  users,
  type CustomerOrder,
  type CustomerOrderItem,
  type CustomerOrderStatus,
} from "../db/schema/index.js";
import { auditEvents } from "./audit.js";
import { fileStorage } from "./fileStorage.js";
import { queueMessage } from "./messaging.js";
import { searchPattern } from "../lib/normalizeSearch.js";

/** Domain error with an HTTP status the route layer maps straight to a reply. */
export class OrderError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "OrderError";
    this.status = status;
    this.details = details;
  }
}

export type OrderAction = "accept" | "pack" | "ready" | "deliver" | "reject" | "cancel";

export interface CreateOrderInput {
  storeId: string;
  customerId?: string;
  customerName: string;
  phone: string;
  deliveryAddress?: string;
  notes?: string;
  prescriptionFileId?: string;
  items: Array<{ medicineId: string; quantity: number }>;
}

export interface CustomerOrderDetail extends CustomerOrder {
  items: CustomerOrderItem[];
  /** Inline prescription image (single getOrder only — never in list rows). */
  prescriptionFile?: { filename: string; contentType: string; data: string };
}

export interface ListOrdersOptions {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PublicCatalogItem {
  medicineId: string;
  name: string;
  brand?: string;
  packSize?: string;
  sellingPrice: number;
  mrp?: number;
  inStock: boolean;
}

// ---------------------------------------------------------------------------
// Settings singleton (pattern follows expiryPolicy.getPolicy/setPolicy)
// ---------------------------------------------------------------------------

export const ONLINE_ORDERS_KEY = "online_orders";

/**
 * Read the install-wide online-ordering flag. Missing row or unparsable JSON
 * defaults to ENABLED (documented — new installs work out of the box and
 * tests do not need a seed row).
 */
export async function getOnlineOrdersEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, ONLINE_ORDERS_KEY))
      .limit(1);
    if (!row) return true;
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return true;
    return parsed.enabled !== false;
  } catch {
    return true;
  }
}

/** Upsert the singleton `online_orders` settings row. */
export async function setOnlineOrdersEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
  const now = new Date();
  const value = JSON.stringify({ enabled: !!enabled });
  const [existing] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, ONLINE_ORDERS_KEY))
    .limit(1);
  if (existing) {
    await db.update(settings).set({ value, updatedAt: now }).where(eq(settings.key, ONLINE_ORDERS_KEY));
  } else {
    await db.insert(settings).values({ id: generateId(), key: ONLINE_ORDERS_KEY, value, updatedAt: now });
  }
  return { enabled: !!enabled };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function loadOrderItems(orderId: string): Promise<CustomerOrderItem[]>;
async function loadOrderItems(orderIds: string[]): Promise<Map<string, CustomerOrderItem[]>>;
async function loadOrderItems(orderIdOrIds: string | string[]): Promise<any> {
  const ids = Array.isArray(orderIdOrIds) ? orderIdOrIds : [orderIdOrIds];
  if (ids.length === 0) {
    return Array.isArray(orderIdOrIds) ? new Map() : [];
  }
  const rows = await db
    .select()
    .from(customerOrderItems)
    .where(inArray(customerOrderItems.orderId, ids))
    .orderBy(customerOrderItems.createdAt);
  if (Array.isArray(orderIdOrIds)) {
    const map = new Map<string, CustomerOrderItem[]>();
    for (const row of rows) {
      const list = map.get(row.orderId) ?? [];
      list.push(row);
      map.set(row.orderId, list);
    }
    return map;
  }
  return rows.filter((r) => r.orderId === orderIdOrIds);
}

async function assertStoreActive(storeId: string): Promise<void> {
  const [store] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, storeId), eq(users.isActive, true)))
    .limit(1);
  if (!store) throw new OrderError("Store not found", 404);
}

function requireReason(reason?: string): string {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 3) {
    throw new OrderError("reason must be at least 3 characters", 400);
  }
  return trimmed;
}

/**
 * Best-effort WhatsApp notify (Task 9 messaging). Opt-out is respected inside
 * queueMessage; ANY failure is swallowed — order operations must never fail
 * because messaging is unconfigured.
 */
async function notifyOrder(
  order: Pick<CustomerOrder, "id" | "storeId" | "phone" | "customerName">,
  action: OrderAction,
  extra: { reason?: string; invoiceNo?: string } = {}
): Promise<void> {
  try {
    const phone = (order.phone ?? "").trim();
    if (!phone) return;
    const name = (order.customerName ?? "").trim();
    const id8 = order.id.slice(0, 8);
    let body: string;
    switch (action) {
      case "accept":
        body = `Hi ${name}, your order ${id8} is accepted.`;
        break;
      case "ready":
        body = `Hi ${name}, your order ${id8} is ready for delivery.`;
        break;
      case "deliver":
        body = `Hi ${name}, your order ${id8} has been delivered${
          extra.invoiceNo ? `. Invoice ${extra.invoiceNo}` : ""
        }.`;
        break;
      case "reject":
        body = `Hi ${name}, your order ${id8} was rejected: ${extra.reason ?? ""}`;
        break;
      case "cancel":
        body = `Hi ${name}, your order ${id8} was cancelled: ${extra.reason ?? ""}`;
        break;
      default:
        return; // pack has no customer-facing notification
    }
    await queueMessage(order.storeId, {
      channel: "whatsapp",
      recipient: phone,
      template: "custom",
      variables: { body, customerName: name },
      aggregateType: "order",
      aggregateId: order.id,
      idempotencyKey: `order:${order.id}:${action}`,
    });
  } catch (err) {
    console.error("[customerOrders] notify failed (best-effort):", err);
  }
}

// ---------------------------------------------------------------------------
// Public: create an order
// ---------------------------------------------------------------------------

export async function createOrder(input: CreateOrderInput): Promise<CustomerOrderDetail> {
  if (!(await getOnlineOrdersEnabled())) {
    throw new OrderError("Online ordering is disabled", 403);
  }

  const storeId = (input.storeId ?? "").trim();
  await assertStoreActive(storeId);

  const customerName = (input.customerName ?? "").trim();
  const phone = (input.phone ?? "").trim();
  if (!customerName) throw new OrderError("customerName is required", 400);
  if (!phone) throw new OrderError("phone is required", 400);

  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) throw new OrderError("At least one medicine is required", 400);
  if (items.length > 50) throw new OrderError("A maximum of 50 items per order", 400);
  for (const item of items) {
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      throw new OrderError("Item quantities must be greater than zero", 400);
    }
  }

  // Medicines must exist AND belong to storeId — a foreign tenant's id is
  // reported as unknown (its name is never echoed back: no cross-tenant leak).
  const ids = [...new Set(items.map((i) => i.medicineId))];
  const owned = await db
    .select()
    .from(medicines)
    .where(and(inArray(medicines.id, ids), eq(medicines.createdBy, storeId)));
  const byId = new Map(owned.map((m) => [m.id, m]));
  const unknown = ids.filter((id) => !byId.has(id));
  const inactive = owned.filter((m) => !m.isActive).map((m) => m.name);
  if (unknown.length > 0 || inactive.length > 0) {
    throw new OrderError(
      `Unknown or unavailable medicines: ${[...unknown, ...inactive].join(", ")}`,
      400,
      { unknown, inactive }
    );
  }

  if (input.customerId) {
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.createdBy, storeId)))
      .limit(1);
    if (!customer) throw new OrderError("Invalid customer", 400);
  }

  if (input.prescriptionFileId) {
    const [file] = await db
      .select({ id: storedFiles.id })
      .from(storedFiles)
      .where(and(eq(storedFiles.id, input.prescriptionFileId), eq(storedFiles.ownerId, storeId)))
      .limit(1);
    if (!file) throw new OrderError("Invalid prescription file", 400);
  }

  // Snapshot unit prices from the catalog at submit time.
  let subtotal = 0;
  const lines = items.map((item) => {
    const med = byId.get(item.medicineId)!;
    const unitPrice = Number(med.sellingPrice ?? 0);
    const quantity = Number(item.quantity);
    subtotal += unitPrice * quantity;
    return {
      medicineId: item.medicineId,
      medicineName: med.name,
      quantity,
      unitPrice,
    };
  });
  subtotal = Math.round(subtotal * 100) / 100;

  const now = new Date();
  // better-sqlite3 transactions reject async callbacks — keep it synchronous.
  const created = db.transaction((tx) => {
    const [order] = tx
      .insert(customerOrders)
      .values({
        createdBy: storeId,
        storeId,
        customerId: input.customerId,
        customerName,
        phone,
        deliveryAddress: (input.deliveryAddress ?? "").trim() || null,
        notes: (input.notes ?? "").trim() || null,
        prescriptionFileId: input.prescriptionFileId ?? null,
        status: "pending",
        subtotal,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
    const itemRows = lines.map((line) => ({
      id: generateId(),
      orderId: order.id,
      createdAt: now,
      ...line,
    }));
    tx.insert(customerOrderItems).values(itemRows).run();
    return { order, items: itemRows };
  });

  await auditEvents.record({
    actorId: storeId,
    action: "order.created",
    entity: "customer_order",
    entityId: created.order.id,
    metadata: { items: lines.length, subtotal },
  });

  return { ...created.order, items: created.items };
}

// ---------------------------------------------------------------------------
// Public: catalog search
// ---------------------------------------------------------------------------

export async function publicCatalog(
  storeId: string,
  q: string,
  limit = 20
): Promise<PublicCatalogItem[]> {
  const trimmedStore = (storeId ?? "").trim();
  await assertStoreActive(trimmedStore);

  const query = (q ?? "").trim();
  if (query.length < 2) {
    throw new OrderError("Search must be at least 2 characters", 400);
  }
  const capped = Math.min(50, Math.max(1, Number(limit) || 20));
  const pat = searchPattern(query);

  const rows = await db
    .select({
      id: medicines.id,
      name: medicines.name,
      brand: medicines.brand,
      packSize: medicines.packSize,
      sellingPrice: medicines.sellingPrice,
      mrp: medicines.mrp,
    })
    .from(medicines)
    .where(
      and(
        eq(medicines.createdBy, trimmedStore),
        eq(medicines.isActive, true),
        or(
          sql`fold(${medicines.name}) LIKE ${pat}`,
          sql`fold(${medicines.brand}) LIKE ${pat}`,
          eq(medicines.barcode, query)
        )
      )
    )
    .orderBy(medicines.name)
    .limit(capped);

  const ids = rows.map((r) => r.id);
  const stockMap = new Map<string, number>();
  if (ids.length > 0) {
    const stockRows = await db
      .select({
        medicineId: batches.medicineId,
        total: sql<number>`coalesce(sum(${batches.quantity}), 0)`,
      })
      .from(batches)
      .where(
        and(
          inArray(batches.medicineId, ids),
          eq(batches.isActive, true),
          eq(batches.createdBy, trimmedStore)
        )
      )
      .groupBy(batches.medicineId);
    for (const row of stockRows) stockMap.set(row.medicineId, Number(row.total) || 0);
  }

  return rows.map((r) => ({
    medicineId: r.id,
    name: r.name,
    brand: r.brand ?? undefined,
    packSize: r.packSize ?? undefined,
    sellingPrice: Number(r.sellingPrice ?? 0),
    mrp: r.mrp ?? undefined,
    inStock: (stockMap.get(r.id) ?? 0) > 0,
  }));
}

// ---------------------------------------------------------------------------
// Staff: queue list / detail
// ---------------------------------------------------------------------------

function parseDate(raw?: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * List orders — deliberately NOT tenant-filtered: the queue is install-shared
 * for every authenticated staff member (documented in API.md). `actorId` is
 * kept for call-site symmetry/audit only.
 */
export async function listOrders(
  _actorId: string,
  opts: ListOrdersOptions = {}
): Promise<{ rows: CustomerOrderDetail[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

  const conds: any[] = [];
  if (opts.status) conds.push(eq(customerOrders.status, opts.status as CustomerOrderStatus));
  const from = parseDate(opts.from);
  if (from) conds.push(gte(customerOrders.createdAt, from));
  const to = parseDate(opts.to);
  if (to) conds.push(lte(customerOrders.createdAt, to));
  const q = (opts.q ?? "").trim();
  if (q) {
    const pat = searchPattern(q);
    conds.push(
      or(
        sql`fold(${customerOrders.customerName}) LIKE ${pat}`,
        sql`${customerOrders.phone} LIKE ${`%${q}%`}`,
        sql`fold(${customerOrders.id}) LIKE ${pat}`
      )
    );
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [totalRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(customerOrders)
    .where(where);
  const total = Number(totalRow?.c ?? 0);

  const rows = await db
    .select()
    .from(customerOrders)
    .where(where)
    .orderBy(desc(customerOrders.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const itemsMap = await loadOrderItems(rows.map((r) => r.id));
  return {
    rows: rows.map((r) => ({ ...r, items: itemsMap.get(r.id) ?? [] })),
    total,
    page,
    limit,
  };
}

/**
 * Single order detail. Install-shared like listOrders — a missing id is 404,
 * there is no cross-tenant hiding (documented). When a prescription file is
 * attached its bytes are inlined as base64 (staff users that are not the file
 * owner cannot read stored_files directly through /api/files/:id).
 */
export async function getOrder(_actorId: string, id: string): Promise<CustomerOrderDetail> {
  const [order] = await db.select().from(customerOrders).where(eq(customerOrders.id, id)).limit(1);
  if (!order) throw new OrderError("Order not found", 404);

  const items = await loadOrderItems(order.id);
  let prescriptionFile: CustomerOrderDetail["prescriptionFile"];
  if (order.prescriptionFileId) {
    try {
      const { row, bytes } = await fileStorage.get(order.storeId, order.prescriptionFileId);
      prescriptionFile = {
        filename: row.filename,
        contentType: row.contentType ?? "application/octet-stream",
        data: bytes.toString("base64"),
      };
    } catch {
      prescriptionFile = undefined; // file removed on disk — detail still loads
    }
  }
  return prescriptionFile ? { ...order, items, prescriptionFile } : { ...order, items };
}

// ---------------------------------------------------------------------------
// Staff: state machine
// ---------------------------------------------------------------------------

const ACCEPT_FROM = ["pending"] as const;
const REJECT_FROM = ["pending", "accepted"] as const;
const CANCEL_FROM = ["pending", "accepted", "packed"] as const;
const DELIVER_FROM = ["ready", "accepted", "packed"] as const;

/** Soft reservation check — Σ active batch qty (scoped to the order's store). */
async function stockShortfalls(
  order: CustomerOrder,
  items: CustomerOrderItem[]
): Promise<Array<{ medicineName: string; available: number; requested: number }>> {
  if (items.length === 0) return [];
  const medIds = [...new Set(items.map((i) => i.medicineId))];
  const stockRows = await db
    .select({
      medicineId: batches.medicineId,
      total: sql<number>`coalesce(sum(${batches.quantity}), 0)`,
    })
    .from(batches)
    .where(
      and(
        inArray(batches.medicineId, medIds),
        eq(batches.isActive, true),
        eq(batches.createdBy, order.storeId)
      )
    )
    .groupBy(batches.medicineId);
  const stock = new Map(stockRows.map((r) => [r.medicineId, Number(r.total) || 0]));

  const shortages: Array<{ medicineName: string; available: number; requested: number }> = [];
  for (const item of items) {
    const available = stock.get(item.medicineId) ?? 0;
    if (available < item.quantity) {
      shortages.push({
        medicineName: item.medicineName,
        available,
        requested: item.quantity,
      });
    }
  }
  return shortages;
}

function assertFrom(status: string, allowed: readonly string[], action: OrderAction): void {
  if (!allowed.includes(status)) {
    throw new OrderError(`Cannot ${action} order in ${status}`, 409);
  }
}

/** Past-tense audit trail names: order.created / order.accepted / order.packed … */
const AUDIT_ACTION: Record<OrderAction, string> = {
  accept: "order.accepted",
  pack: "order.packed",
  ready: "order.ready",
  deliver: "order.delivered",
  reject: "order.rejected",
  cancel: "order.cancelled",
};

export interface TransitionPayload {
  invoiceId?: string;
  reason?: string;
}

/**
 * Run one state transition. Audits `order.<action>` with the acting staff id,
 * notifies the customer best-effort (whatsapp/custom template), and returns
 * the refreshed order + items.
 */
export async function transition(
  actorId: string,
  orderId: string,
  action: OrderAction,
  payload: TransitionPayload = {}
): Promise<CustomerOrderDetail> {
  const [order] = await db.select().from(customerOrders).where(eq(customerOrders.id, orderId)).limit(1);
  if (!order) throw new OrderError("Order not found", 404);

  const status = order.status ?? "pending";
  const items = await loadOrderItems(order.id);
  const now = new Date();

  let nextStatus: CustomerOrderStatus;
  let reason: string | null = null;
  let invoiceId: string | null = null;
  let invoiceNo: string | undefined;

  switch (action) {
    case "accept": {
      assertFrom(status, ACCEPT_FROM, action);
      const short = await stockShortfalls(order, items);
      if (short.length > 0) {
        throw new OrderError("Insufficient stock", 409, { items: short });
      }
      nextStatus = "accepted";
      break;
    }
    case "pack": {
      assertFrom(status, ["accepted"], action);
      nextStatus = "packed";
      break;
    }
    case "ready": {
      assertFrom(status, ["packed"], action);
      nextStatus = "ready";
      break;
    }
    case "deliver": {
      assertFrom(status, DELIVER_FROM, action);
      const invoiceIdInput = (payload.invoiceId ?? "").trim();
      if (!invoiceIdInput) throw new OrderError("invoiceId is required", 400);
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceIdInput))
        .limit(1);
      if (!invoice) throw new OrderError("Invoice not found", 404);
      if (invoice.createdBy !== order.storeId) {
        throw new OrderError("Invoice does not belong to this store", 400);
      }
      const [other] = await db
        .select({ id: customerOrders.id })
        .from(customerOrders)
        .where(
          and(eq(customerOrders.invoiceId, invoiceIdInput), sql`${customerOrders.id} != ${orderId}`)
        )
        .limit(1);
      if (other) {
        throw new OrderError("Invoice already linked to another order", 409);
      }
      invoiceId = invoice.id;
      invoiceNo = invoice.invoiceNo;
      nextStatus = "delivered";
      break;
    }
    case "reject": {
      assertFrom(status, REJECT_FROM, action);
      reason = requireReason(payload.reason);
      nextStatus = "rejected";
      break;
    }
    case "cancel": {
      assertFrom(status, CANCEL_FROM, action);
      reason = requireReason(payload.reason);
      nextStatus = "cancelled";
      break;
    }
    default:
      throw new OrderError("Unknown action", 400);
  }

  const updated = db.transaction((tx) => {
    const [row] = tx
      .update(customerOrders)
      .set({
        status: nextStatus,
        reason,
        invoiceId,
        updatedAt: now,
      })
      .where(eq(customerOrders.id, orderId))
      .returning()
      .all();
    return row;
  });

  await auditEvents.record({
    actorId,
    action: AUDIT_ACTION[action],
    entity: "customer_order",
    entityId: orderId,
    metadata: {
      from: status,
      to: nextStatus,
      ...(reason ? { reason } : {}),
      ...(invoiceId ? { invoiceId } : {}),
    },
  });

  if (action !== "pack") {
    await notifyOrder({ ...order, ...updated }, action, {
      reason: reason ?? undefined,
      invoiceNo,
    });
  }

  return { ...updated, items };
}
