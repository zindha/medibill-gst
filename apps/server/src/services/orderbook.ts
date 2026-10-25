import { and, asc, desc, eq, gte, inArray, like, sql } from "drizzle-orm";
import {
  orderbookCartItems,
  orderbookDistributors,
  orderbookOrders,
  orderbookPoItems,
  orderbookPurchaseOrders,
  orderbookShortbookItems,
  ORDERBOOK_PO_STATUSES,
  type OrderbookPoStatus,
} from "../db/schema/index.js";
import { db, withTransaction } from "../db/index.js";

/**
 * Orderbook service — distributor ordering workspace. Every query is scoped to
 * the owner (`createdBy`) so tenant isolation holds across all modules.
 */

function nowIsoDate(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** OB-YYYYMM-NNNN per owner and month (mirrors the expense series style). */
async function nextPoNumber(ownerId: string, date: string): Promise<string> {
  const period = date.slice(0, 4) + date.slice(5, 7);
  const pattern = `OB-${period}-%`;
  const rows = await db
    .select({ number: orderbookPurchaseOrders.number })
    .from(orderbookPurchaseOrders)
    .where(
      and(
        eq(orderbookPurchaseOrders.createdBy, ownerId),
        like(orderbookPurchaseOrders.number, pattern)
      )
    );
  let highest = 0;
  for (const row of rows) {
    const seq = Number(row.number.split("-")[2] ?? 0);
    if (Number.isFinite(seq) && seq > highest) highest = seq;
  }
  return `OB-${period}-${String(highest + 1).padStart(4, "0")}`;
}

function assertOwned<T extends { createdBy: string }>(
  row: T | undefined,
  ownerId: string
): T {
  if (!row || row.createdBy !== ownerId) {
    const err = new Error("Not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  return row;
}

// ---------------------------------------------------------------------------
// Distributors
// ---------------------------------------------------------------------------

export async function listDistributors(ownerId: string, q?: string) {
  const where = q
    ? and(
        eq(orderbookDistributors.createdBy, ownerId),
        like(sql`lower(${orderbookDistributors.name})`, `%${q.toLowerCase()}%`)
      )
    : eq(orderbookDistributors.createdBy, ownerId);
  return db
    .select()
    .from(orderbookDistributors)
    .where(where)
    .orderBy(asc(orderbookDistributors.name));
}

export interface DistributorInput {
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  pincode?: string;
  supplierId?: string | null;
  connectionStatus?: "connected" | "pending" | "offline";
  creditTerms?: string;
  creditLimit?: number;
}

export async function createDistributor(ownerId: string, input: DistributorInput) {
  const [row] = await db
    .insert(orderbookDistributors)
    .values({
      createdBy: ownerId,
      supplierId: input.supplierId ?? null,
      name: input.name,
      phone: input.phone,
      email: input.email,
      city: input.city,
      pincode: input.pincode,
      connectionStatus: input.connectionStatus ?? "offline",
      creditTerms: input.creditTerms,
      creditLimit: input.creditLimit ?? 0,
    })
    .returning();
  return row;
}

export async function getDistributor(ownerId: string, id: string) {
  const row = await db
    .select()
    .from(orderbookDistributors)
    .where(eq(orderbookDistributors.id, id))
    .get();
  assertOwned(row, ownerId);
  const recentOrders = await db
    .select()
    .from(orderbookOrders)
    .where(
      and(
        eq(orderbookOrders.createdBy, ownerId),
        eq(orderbookOrders.distributorId, id)
      )
    )
    .orderBy(desc(orderbookOrders.createdAt))
    .limit(10);
  const openPos = await db
    .select()
    .from(orderbookPurchaseOrders)
    .where(
      and(
        eq(orderbookPurchaseOrders.createdBy, ownerId),
        eq(orderbookPurchaseOrders.distributorId, id),
        inArray(orderbookPurchaseOrders.status, [
          ORDERBOOK_PO_STATUSES.DRAFT,
          ORDERBOOK_PO_STATUSES.SENT,
          ORDERBOOK_PO_STATUSES.CONFIRMED,
          ORDERBOOK_PO_STATUSES.PARTIAL,
        ])
      )
    )
    .orderBy(desc(orderbookPurchaseOrders.orderDate))
    .limit(10);
  return { distributor: row, recentOrders, openPos };
}

export async function updateDistributor(
  ownerId: string,
  id: string,
  patch: Partial<DistributorInput>
) {
  const row = await db
    .select()
    .from(orderbookDistributors)
    .where(eq(orderbookDistributors.id, id))
    .get();
  assertOwned(row, ownerId);
  const [updated] = await db
    .update(orderbookDistributors)
    .set({
      name: patch.name ?? row.name,
      phone: patch.phone ?? row.phone,
      email: patch.email ?? row.email,
      city: patch.city ?? row.city,
      pincode: patch.pincode ?? row.pincode,
      supplierId: patch.supplierId === undefined ? row.supplierId : patch.supplierId,
      connectionStatus: patch.connectionStatus ?? row.connectionStatus,
      creditTerms: patch.creditTerms ?? row.creditTerms,
      creditLimit: patch.creditLimit ?? row.creditLimit,
      updatedAt: new Date(),
    })
    .where(eq(orderbookDistributors.id, id))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Product search (reuse the pharmacy's own medicine master)
// ---------------------------------------------------------------------------

export interface ProductHit {
  id: string;
  name: string;
  packSize: string | null;
  manufacturerName: string | null;
  purchasePrice: number;
  sellingPrice: number;
}

export async function searchProducts(
  ownerId: string,
  q: string,
  distributorId: string | undefined,
  limit = 50
): Promise<ProductHit[]> {
  // Lazy import avoids a cycle with the catalog module at load time.
  const { searchMedicinesForOwner } = await import("./orderbookProducts.js");
  return searchMedicinesForOwner(ownerId, q, limit, distributorId);
}

// ---------------------------------------------------------------------------
// Already-to-order: items recently ordered or pending, plus open shortbook
// ---------------------------------------------------------------------------

export async function listAlreadyToOrder(ownerId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const pending = await db
    .select({
      medicineId: orderbookPoItems.medicineId,
      name: orderbookPoItems.name,
      pack: orderbookPoItems.pack,
      quantity: orderbookPoItems.quantity,
      receivedQuantity: orderbookPoItems.receivedQuantity,
      status: orderbookPurchaseOrders.status,
      orderDate: orderbookPurchaseOrders.orderDate,
      distributorName: orderbookDistributors.name,
    })
    .from(orderbookPoItems)
    .innerJoin(
      orderbookPurchaseOrders,
      eq(orderbookPoItems.poId, orderbookPurchaseOrders.id)
    )
    .innerJoin(
      orderbookDistributors,
      eq(orderbookPurchaseOrders.distributorId, orderbookDistributors.id)
    )
    .where(
      and(
        eq(orderbookPurchaseOrders.createdBy, ownerId),
        inArray(orderbookPurchaseOrders.status, [
          ORDERBOOK_PO_STATUSES.SENT,
          ORDERBOOK_PO_STATUSES.CONFIRMED,
          ORDERBOOK_PO_STATUSES.PARTIAL,
        ])
      )
    )
    .orderBy(desc(orderbookPurchaseOrders.orderDate))
    .limit(100);

  const shorts = await db
    .select()
    .from(orderbookShortbookItems)
    .where(
      and(
        eq(orderbookShortbookItems.createdBy, ownerId),
        eq(orderbookShortbookItems.status, "open")
      )
    )
    .orderBy(desc(orderbookShortbookItems.createdAt))
    .limit(100);

  return { pending, shorts };
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

export interface PoItemInput {
  medicineId?: string | null;
  name: string;
  pack?: string;
  quantity: number;
  freeQuantity?: number;
  rate: number;
}

export async function createPo(
  ownerId: string,
  distributorId: string,
  items: PoItemInput[],
  opts: { expectedDate?: string; notes?: string; status?: OrderbookPoStatus } = {}
) {
  const distributor = await db
    .select()
    .from(orderbookDistributors)
    .where(eq(orderbookDistributors.id, distributorId))
    .get();
  assertOwned(distributor, ownerId);
  if (!items.length) {
    const err = new Error("At least one item is required") as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }
  const total = items.reduce(
    (sum, it) => sum + it.quantity * it.rate,
    0
  );
  const orderDate = nowIsoDate();
  const number = await nextPoNumber(ownerId, orderDate);
  // Synchronous transaction body (better-sqlite3): terminate builders with
  // .all()/.run() — they are only awaitable outside the transaction.
  const created = withTransaction((tx) => {
    const [po] = (tx as typeof db)
      .insert(orderbookPurchaseOrders)
      .values({
        createdBy: ownerId,
        distributorId,
        number,
        status: opts.status ?? ORDERBOOK_PO_STATUSES.DRAFT,
        orderDate,
        expectedDate: opts.expectedDate,
        total,
        notes: opts.notes,
      })
      .returning()
      .all();
    (tx as typeof db)
      .insert(orderbookPoItems)
      .values(
        items.map((it, index) => ({
          poId: po.id,
          medicineId: it.medicineId ?? null,
          name: it.name,
          pack: it.pack,
          quantity: it.quantity,
          freeQuantity: it.freeQuantity ?? 0,
          rate: it.rate,
          sortOrder: index,
        }))
      )
      .run();
    return po;
  });
  return created;
}

async function getPoOwned(ownerId: string, poId: string) {
  const po = await db
    .select()
    .from(orderbookPurchaseOrders)
    .where(eq(orderbookPurchaseOrders.id, poId))
    .get();
  return assertOwned(po, ownerId);
}

export async function listPos(
  ownerId: string,
  filter: { status?: string; from?: string; to?: string } = {}
) {
  const clauses = [eq(orderbookPurchaseOrders.createdBy, ownerId)];
  if (filter.status) {
    clauses.push(eq(orderbookPurchaseOrders.status, filter.status as OrderbookPoStatus));
  }
  if (filter.from) clauses.push(gte(orderbookPurchaseOrders.orderDate, filter.from));
  if (filter.to) {
    clauses.push(
      sql`${orderbookPurchaseOrders.orderDate} <= ${filter.to}`
    );
  }
  return db
    .select({
      po: orderbookPurchaseOrders,
      distributorName: orderbookDistributors.name,
      itemCount: sql<number>`(select count(*) from orderbook_po_items i where i.po_id = ${orderbookPurchaseOrders.id})`,
    })
    .from(orderbookPurchaseOrders)
    .innerJoin(
      orderbookDistributors,
      eq(orderbookPurchaseOrders.distributorId, orderbookDistributors.id)
    )
    .where(and(...clauses))
    .orderBy(desc(orderbookPurchaseOrders.orderDate), desc(orderbookPurchaseOrders.createdAt));
}

export async function getPo(ownerId: string, poId: string) {
  const po = await getPoOwned(ownerId, poId);
  const items = await db
    .select()
    .from(orderbookPoItems)
    .where(eq(orderbookPoItems.poId, poId))
    .orderBy(asc(orderbookPoItems.sortOrder));
  const distributor = await db
    .select()
    .from(orderbookDistributors)
    .where(eq(orderbookDistributors.id, po.distributorId))
    .get();
  return { po, items, distributor };
}

async function transitionPo(
  ownerId: string,
  poId: string,
  from: OrderbookPoStatus[],
  to: OrderbookPoStatus
) {
  const po = await getPoOwned(ownerId, poId);
  if (!from.includes(po.status)) {
    const err = new Error(`Cannot move a ${po.status} order to ${to}`) as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }
  const [updated] = await db
    .update(orderbookPurchaseOrders)
    .set({ status: to, updatedAt: new Date() })
    .where(eq(orderbookPurchaseOrders.id, poId))
    .returning();
  return updated;
}

export const sendPo = (ownerId: string, poId: string) =>
  transitionPo(ownerId, poId, [ORDERBOOK_PO_STATUSES.DRAFT], ORDERBOOK_PO_STATUSES.SENT);
export const confirmPo = (ownerId: string, poId: string) =>
  transitionPo(ownerId, poId, [ORDERBOOK_PO_STATUSES.SENT], ORDERBOOK_PO_STATUSES.CONFIRMED);
export const cancelPo = (ownerId: string, poId: string) =>
  transitionPo(
    ownerId,
    poId,
    [
      ORDERBOOK_PO_STATUSES.DRAFT,
      ORDERBOOK_PO_STATUSES.SENT,
      ORDERBOOK_PO_STATUSES.CONFIRMED,
      ORDERBOOK_PO_STATUSES.PARTIAL,
    ],
    ORDERBOOK_PO_STATUSES.CANCELLED
  );

export interface ReceiveEntry {
  itemId: string;
  receivedQuantity: number;
}

/**
 * Record receipts against a PO. Quantities short of the demanded amount are
 * logged to the shortbook (status open) so the buyer can chase or carry them.
 * Fully received POs close as `received`; partial receipts set `partial`.
 */
export async function receivePo(ownerId: string, poId: string, receipts: ReceiveEntry[]) {
  const po = await getPoOwned(ownerId, poId);
  if (
    ![ORDERBOOK_PO_STATUSES.SENT, ORDERBOOK_PO_STATUSES.CONFIRMED, ORDERBOOK_PO_STATUSES.PARTIAL].includes(
      po.status
    )
  ) {
    const err = new Error(`Cannot receive against a ${po.status} order`) as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }
  const items = await db
    .select()
    .from(orderbookPoItems)
    .where(eq(orderbookPoItems.poId, poId));
  const byId = new Map(receipts.map((r) => [r.itemId, r.receivedQuantity]));

  const shorts: { name: string; pack: string | null; demanded: number; supplied: number; medicineId: string | null }[] = [];
  let fullyReceived = true;

  for (const item of items) {
    const received = Math.max(0, byId.get(item.id) ?? 0);
    const newReceived = item.receivedQuantity + received;
    const capped = Math.min(newReceived, item.quantity);
    await db
      .update(orderbookPoItems)
      .set({ receivedQuantity: capped })
      .where(eq(orderbookPoItems.id, item.id));
    if (capped < item.quantity) {
      fullyReceived = false;
      const missing = item.quantity - capped;
      // Only log the newly-short portion (previous receipts already counted).
      shorts.push({
        name: item.name,
        pack: item.pack,
        demanded: missing,
        supplied: newReceived > item.quantity ? item.quantity - item.receivedQuantity : received,
        medicineId: item.medicineId,
      });
    }
  }

  const status = fullyReceived ? ORDERBOOK_PO_STATUSES.RECEIVED : ORDERBOOK_PO_STATUSES.PARTIAL;
  const [updated] = await db
    .update(orderbookPurchaseOrders)
    .set({ status, updatedAt: new Date() })
    .where(eq(orderbookPurchaseOrders.id, poId))
    .returning();

  if (shorts.length) {
    await db.insert(orderbookShortbookItems).values(
      shorts.map((s) => ({
        createdBy: ownerId,
        poId,
        medicineId: s.medicineId,
        name: s.name,
        pack: s.pack,
        demandedQuantity: s.demanded,
        suppliedQuantity: Math.max(0, s.supplied),
        status: "open",
      }))
    );
  }
  return { po: updated, shortbooked: shorts.length };
}

// ---------------------------------------------------------------------------
// Shortbook
// ---------------------------------------------------------------------------

export async function listShortbook(ownerId: string, status?: string) {
  const where = status
    ? and(
        eq(orderbookShortbookItems.createdBy, ownerId),
        eq(orderbookShortbookItems.status, status)
      )
    : eq(orderbookShortbookItems.createdBy, ownerId);
  return db
    .select()
    .from(orderbookShortbookItems)
    .where(where)
    .orderBy(desc(orderbookShortbookItems.createdAt));
}

export async function resolveShortbook(
  ownerId: string,
  id: string,
  action: "carried" | "supplied" | "cancelled",
  suppliedQuantity = 0
) {
  const row = await db
    .select()
    .from(orderbookShortbookItems)
    .where(eq(orderbookShortbookItems.id, id))
    .get();
  assertOwned(row, ownerId);
  const [updated] = await db
    .update(orderbookShortbookItems)
    .set({
      status: action,
      suppliedQuantity:
        action === "supplied"
          ? Math.max(row.suppliedQuantity, Math.min(suppliedQuantity, row.demandedQuantity))
          : row.suppliedQuantity,
      updatedAt: new Date(),
    })
    .where(eq(orderbookShortbookItems.id, id))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export async function getCart(ownerId: string) {
  const items = await db
    .select()
    .from(orderbookCartItems)
    .where(
      and(
        eq(orderbookCartItems.createdBy, ownerId),
        sql`${orderbookCartItems.orderId} is null`
      )
    )
    .orderBy(asc(orderbookCartItems.createdAt));
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const list = groups.get(item.distributorId) ?? [];
    list.push(item);
    groups.set(item.distributorId, list);
  }
  const distributors = await listDistributors(ownerId);
  const byId = new Map(distributors.map((d) => [d.id, d]));
  const groupsOut = [...groups.entries()].map(([distributorId, lines]) => {
    const distributor = byId.get(distributorId);
    const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.rate, 0);
    return {
      distributor: distributor
        ? { id: distributor.id, name: distributor.name, connectionStatus: distributor.connectionStatus }
        : { id: distributorId, name: "Unknown distributor", connectionStatus: "offline" },
      items: lines,
      subtotal,
      lineCount: lines.length,
    };
  });
  return { groups: groupsOut, total: groupsOut.reduce((s, g) => s + g.subtotal, 0) };
}

export async function addCartItem(
  ownerId: string,
  input: {
    distributorId: string;
    medicineId?: string | null;
    name: string;
    pack?: string;
    quantity: number;
    rate: number;
  }
) {
  const distributor = await db
    .select()
    .from(orderbookDistributors)
    .where(eq(orderbookDistributors.id, input.distributorId))
    .get();
  assertOwned(distributor, ownerId);
  // Same distributor + medicine + rate → merge quantities.
  const existing = input.medicineId
    ? await db
        .select()
        .from(orderbookCartItems)
        .where(
          and(
            eq(orderbookCartItems.createdBy, ownerId),
            sql`${orderbookCartItems.orderId} is null`,
            eq(orderbookCartItems.distributorId, input.distributorId),
            eq(orderbookCartItems.medicineId, input.medicineId)
          )
        )
        .get()
    : undefined;
  if (existing) {
    const [updated] = await db
      .update(orderbookCartItems)
      .set({ quantity: existing.quantity + input.quantity })
      .where(eq(orderbookCartItems.id, existing.id))
      .returning();
    return updated;
  }
  const [row] = await db
    .insert(orderbookCartItems)
    .values({
      createdBy: ownerId,
      distributorId: input.distributorId,
      medicineId: input.medicineId ?? null,
      name: input.name,
      pack: input.pack,
      quantity: input.quantity,
      rate: input.rate,
    })
    .returning();
  return row;
}

export async function updateCartItem(ownerId: string, id: string, quantity: number, rate?: number) {
  const row = await db
    .select()
    .from(orderbookCartItems)
    .where(eq(orderbookCartItems.id, id))
    .get();
  assertOwned(row, ownerId);
  const [updated] = await db
    .update(orderbookCartItems)
    .set({ quantity, ...(rate !== undefined ? { rate } : {}) })
    .where(eq(orderbookCartItems.id, id))
    .returning();
  return updated;
}

export async function deleteCartItem(ownerId: string, id: string) {
  const row = await db
    .select()
    .from(orderbookCartItems)
    .where(eq(orderbookCartItems.id, id))
    .get();
  assertOwned(row, ownerId);
  await db.delete(orderbookCartItems).where(eq(orderbookCartItems.id, id));
  return { ok: true };
}

export interface CheckoutResult {
  orders: { orderId: string; poId: string; distributorId: string; number: string; total: number }[];
}

/**
 * Place the cart: one PO (status sent) + one immutable order snapshot per
 * distributor group, then clear the active cart lines.
 */
export async function checkout(ownerId: string): Promise<CheckoutResult> {
  const cart = await getCart(ownerId);
  if (!cart.groups.length) {
    const err = new Error("Cart is empty") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  const results: CheckoutResult["orders"] = [];
  for (const group of cart.groups) {
    const items = group.items.map((l) => ({
      medicineId: l.medicineId,
      name: l.name,
      pack: l.pack ?? undefined,
      quantity: l.quantity,
      rate: l.rate,
    }));
    const po = await createPo(ownerId, group.distributor.id, items, {
      status: ORDERBOOK_PO_STATUSES.SENT,
    });
    const fullPo = await getPo(ownerId, po.id);
    const [order] = await db
      .insert(orderbookOrders)
      .values({
        createdBy: ownerId,
        distributorId: group.distributor.id,
        poId: po.id,
        status: "placed",
        total: po.total,
        snapshot: JSON.stringify({
          number: po.number,
          placedAt: new Date().toISOString(),
          items: fullPo.items,
          subtotal: po.total,
        }),
      })
      .returning();
    results.push({
      orderId: order.id,
      poId: po.id,
      distributorId: group.distributor.id,
      number: po.number,
      total: po.total,
    });
  }
  await db
    .delete(orderbookCartItems)
    .where(
      and(
        eq(orderbookCartItems.createdBy, ownerId),
        sql`${orderbookCartItems.orderId} is null`
      )
    );
  return { orders: results };
}

export async function getOrder(ownerId: string, orderId: string) {
  const order = await db
    .select()
    .from(orderbookOrders)
    .where(eq(orderbookOrders.id, orderId))
    .get();
  assertOwned(order, ownerId);
  const distributor = await db
    .select()
    .from(orderbookDistributors)
    .where(eq(orderbookDistributors.id, order.distributorId))
    .get();
  return {
    order,
    distributor: distributor
      ? { id: distributor.id, name: distributor.name }
      : { id: order.distributorId, name: "Unknown distributor" },
    snapshot: JSON.parse(order.snapshot) as {
      number: string;
      placedAt: string;
      items: {
        id: string;
        name: string;
        pack: string | null;
        quantity: number;
        rate: number;
      }[];
      subtotal: number;
    },
  };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export async function analysis(ownerId: string) {
  const monthStart = (offset: number) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const sixMonthsAgo = `${monthStart(5)}-01`;

  const spendByMonth = await db
    .select({
      month: sql<string>`substr(${orderbookPurchaseOrders.orderDate}, 1, 7)`,
      total: sql<number>`coalesce(sum(${orderbookPurchaseOrders.total}), 0)`,
      orderCount: sql<number>`count(*)`,
    })
    .from(orderbookPurchaseOrders)
    .where(
      and(
        eq(orderbookPurchaseOrders.createdBy, ownerId),
        gte(orderbookPurchaseOrders.orderDate, sixMonthsAgo),
        sql`${orderbookPurchaseOrders.status} != ${ORDERBOOK_PO_STATUSES.CANCELLED}`
      )
    )
    .groupBy(sql`substr(${orderbookPurchaseOrders.orderDate}, 1, 7)`)
    .orderBy(sql`substr(${orderbookPurchaseOrders.orderDate}, 1, 7)`);

  const topProducts = await db
    .select({
      name: orderbookPoItems.name,
      quantity: sql<number>`coalesce(sum(${orderbookPoItems.quantity}), 0)`,
      received: sql<number>`coalesce(sum(${orderbookPoItems.receivedQuantity}), 0)`,
      amount: sql<number>`coalesce(sum(${orderbookPoItems.quantity} * ${orderbookPoItems.rate}), 0)`,
    })
    .from(orderbookPoItems)
    .innerJoin(
      orderbookPurchaseOrders,
      eq(orderbookPoItems.poId, orderbookPurchaseOrders.id)
    )
    .where(
      and(
        eq(orderbookPurchaseOrders.createdBy, ownerId),
        sql`${orderbookPurchaseOrders.status} != ${ORDERBOOK_PO_STATUSES.CANCELLED}`
      )
    )
    .groupBy(orderbookPoItems.name)
    .orderBy(desc(sql`coalesce(sum(${orderbookPoItems.quantity} * ${orderbookPoItems.rate}), 0)`))
    .limit(10);

  const statusCounts = await db
    .select({
      status: orderbookPurchaseOrders.status,
      count: sql<number>`count(*)`,
    })
    .from(orderbookPurchaseOrders)
    .where(eq(orderbookPurchaseOrders.createdBy, ownerId))
    .groupBy(orderbookPurchaseOrders.status);

  const fill =
    topProducts.length > 0
      ? topProducts.reduce((s, p) => s + p.received, 0) /
        Math.max(1, topProducts.reduce((s, p) => s + p.quantity, 0))
      : 0;

  return {
    spendByMonth,
    topProducts,
    statusCounts,
    fillRate: Math.round(fill * 1000) / 1000,
    openShortbook: (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(orderbookShortbookItems)
        .where(
          and(
            eq(orderbookShortbookItems.createdBy, ownerId),
            eq(orderbookShortbookItems.status, "open")
          )
        )
    )[0]?.count ?? 0,
  };
}
