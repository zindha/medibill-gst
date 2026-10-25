-- Orderbook: distributor ordering workspace.
--
-- orderbook_distributors: distributors the pharmacy orders from. Optionally
-- linked to a supplier master row. `outstanding` is what we owe the
-- distributor (positive = payable).
--
-- orderbook_purchase_orders / orderbook_po_items: POs raised from the
-- orderbook, numbered OB-YYYYMM-NNNN per owner and month. Status lifecycle:
-- draft -> sent -> confirmed -> partial -> received, or cancelled. Per-item
-- `received_quantity` records receipts; demand short of receipts is logged to
-- the shortbook instead of being lost.
--
-- orderbook_shortbook_items: demanded-but-not-supplied items (open | carried |
-- supplied | cancelled).
--
-- orderbook_cart_items: active cart lines while `order_id` is NULL; after
-- checkout the row is never reused (checkout writes immutable snapshots to
-- orderbook_orders instead and clears the active lines).

CREATE TABLE IF NOT EXISTS orderbook_distributors (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  city TEXT,
  pincode TEXT,
  connection_status TEXT NOT NULL DEFAULT 'offline',
  credit_terms TEXT,
  credit_limit REAL DEFAULT 0,
  outstanding REAL DEFAULT 0,
  price_list_version TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orderbook_distributors_owner_idx
  ON orderbook_distributors (created_by);

CREATE TABLE IF NOT EXISTS orderbook_purchase_orders (
  id TEXT PRIMARY KEY,
  distributor_id TEXT NOT NULL REFERENCES orderbook_distributors(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  order_date TEXT NOT NULL,
  expected_date TEXT,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orderbook_po_owner_idx ON orderbook_purchase_orders (created_by);
CREATE INDEX IF NOT EXISTS orderbook_po_distributor_idx ON orderbook_purchase_orders (distributor_id);
CREATE INDEX IF NOT EXISTS orderbook_po_status_idx ON orderbook_purchase_orders (status);

CREATE TABLE IF NOT EXISTS orderbook_po_items (
  id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL REFERENCES orderbook_purchase_orders(id) ON DELETE CASCADE,
  medicine_id TEXT REFERENCES medicines(id),
  name TEXT NOT NULL,
  pack TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  free_quantity REAL NOT NULL DEFAULT 0,
  rate REAL NOT NULL DEFAULT 0,
  received_quantity REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS orderbook_po_items_po_idx ON orderbook_po_items (po_id);

CREATE TABLE IF NOT EXISTS orderbook_shortbook_items (
  id TEXT PRIMARY KEY,
  po_id TEXT REFERENCES orderbook_purchase_orders(id) ON DELETE SET NULL,
  po_item_id TEXT REFERENCES orderbook_po_items(id) ON DELETE SET NULL,
  medicine_id TEXT REFERENCES medicines(id),
  name TEXT NOT NULL,
  pack TEXT,
  demanded_quantity REAL NOT NULL DEFAULT 0,
  supplied_quantity REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orderbook_short_owner_idx ON orderbook_shortbook_items (created_by);
CREATE INDEX IF NOT EXISTS orderbook_short_status_idx ON orderbook_shortbook_items (status);

CREATE TABLE IF NOT EXISTS orderbook_cart_items (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  distributor_id TEXT NOT NULL REFERENCES orderbook_distributors(id) ON DELETE CASCADE,
  medicine_id TEXT REFERENCES medicines(id),
  name TEXT NOT NULL,
  pack TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orderbook_cart_owner_idx ON orderbook_cart_items (created_by);
CREATE INDEX IF NOT EXISTS orderbook_cart_order_idx ON orderbook_cart_items (order_id);

CREATE TABLE IF NOT EXISTS orderbook_orders (
  id TEXT PRIMARY KEY,
  distributor_id TEXT NOT NULL REFERENCES orderbook_distributors(id) ON DELETE CASCADE,
  po_id TEXT REFERENCES orderbook_purchase_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'placed',
  total REAL NOT NULL DEFAULT 0,
  snapshot TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orderbook_orders_owner_idx ON orderbook_orders (created_by);
CREATE INDEX IF NOT EXISTS orderbook_orders_distributor_idx ON orderbook_orders (distributor_id);
