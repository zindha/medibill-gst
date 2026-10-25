-- Picklists + stock transfers (G3a-07 picklist workspace, inter-store moves).
--
-- A picklist is a picking worksheet generated from a pending invoice, a pending
-- customer order, or entered by hand. Items carry the rack location so the
-- picker walks the shelf in order; `picked_qty`/`picked` progress per line.
--
-- A transfer moves stock between two stores the caller controls. Stores are
-- validated as owner/member on create and complete; completion is what moves
-- quantities (source batch down, matching destination batch up) — a transfer in
-- `pending` never touched stock.

CREATE TABLE IF NOT EXISTS stock_picklists (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS stock_picklists_created_by_idx ON stock_picklists(created_by);
CREATE INDEX IF NOT EXISTS stock_picklists_status_idx ON stock_picklists(status);

CREATE TABLE IF NOT EXISTS stock_picklist_items (
  id TEXT PRIMARY KEY,
  picklist_id TEXT NOT NULL REFERENCES stock_picklists(id),
  medicine_id TEXT NOT NULL REFERENCES medicines(id),
  batch_id TEXT REFERENCES batches(id),
  qty REAL NOT NULL,
  picked_qty REAL NOT NULL DEFAULT 0,
  rack TEXT,
  picked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS stock_picklist_items_picklist_idx ON stock_picklist_items(picklist_id);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  from_store_id TEXT NOT NULL REFERENCES stores(id),
  to_store_id TEXT NOT NULL REFERENCES stores(id),
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS stock_transfers_from_store_idx ON stock_transfers(from_store_id);
CREATE INDEX IF NOT EXISTS stock_transfers_to_store_idx ON stock_transfers(to_store_id);
CREATE INDEX IF NOT EXISTS stock_transfers_status_idx ON stock_transfers(status);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES stock_transfers(id),
  medicine_id TEXT NOT NULL REFERENCES medicines(id),
  batch_id TEXT NOT NULL REFERENCES batches(id),
  qty REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx ON stock_transfer_items(transfer_id);
