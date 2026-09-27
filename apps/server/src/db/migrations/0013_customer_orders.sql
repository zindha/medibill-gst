-- Task 14: Customer ordering, prescription upload and delivery.
-- customer_orders: one online order placed against this install's store.
--   created_by AND store_id both hold the install owner's user id (single-store
--   convention: public endpoints take storeId = the owner user id). customer_id
--   is optional (ad-hoc walk-in orders skip it). prescription_file_id points at
--   stored_files uploaded through the public /api/public/files route (owner =
--   storeId, purpose "order-prescription"). invoice_id is set by the deliver
--   transition — billing stays on the existing invoice create path (stock
--   deduction/FEFO/expiry policy happen there, never here). status follows
--   pending -> accepted -> packed -> ready -> delivered, with rejected/cancelled
--   as terminal states carrying `reason`.
CREATE TABLE IF NOT EXISTS customer_orders (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  store_id TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  delivery_address TEXT,
  notes TEXT,
  prescription_file_id TEXT REFERENCES stored_files(id),
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  invoice_id TEXT REFERENCES invoices(id),
  subtotal REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS customer_orders_created_by_status_idx ON customer_orders(created_by, status);
CREATE INDEX IF NOT EXISTS customer_orders_created_by_created_at_idx ON customer_orders(created_by, created_at);

-- customer_order_items: one row per requested medicine. medicine_name and
--   unit_price are snapshots taken at submit time so later catalog edits never
--   rewrite order history.
CREATE TABLE IF NOT EXISTS customer_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  medicine_id TEXT NOT NULL REFERENCES medicines(id),
  medicine_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS customer_order_items_order_idx ON customer_order_items(order_id);
