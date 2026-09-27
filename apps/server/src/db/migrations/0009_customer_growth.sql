-- Task 10: Customer Analytics, Loyalty, Offers and Campaigns
-- loyalty_ledger: immutable points ledger (negative = redeem); balance = SUM(points).
-- offers: bill/product discounts with a validity window (deactivate, never delete).
-- campaigns: audience-targeted blasts delivered through the messaging outbox.

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  points REAL NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  invoice_id TEXT,
  idempotency_key TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(created_by, idempotency_key)
);

CREATE INDEX IF NOT EXISTS loyalty_ledger_customer_idx ON loyalty_ledger(created_by, customer_id);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  medicine_id TEXT,
  min_amount REAL NOT NULL DEFAULT 0,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS offers_created_by_idx ON offers(created_by);
CREATE INDEX IF NOT EXISTS offers_active_idx ON offers(created_by, is_active);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'custom',
  body TEXT,
  audience TEXT NOT NULL DEFAULT '{}',
  schedule_at TEXT,
  status TEXT DEFAULT 'draft',
  stats TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS campaigns_created_by_idx ON campaigns(created_by);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);
