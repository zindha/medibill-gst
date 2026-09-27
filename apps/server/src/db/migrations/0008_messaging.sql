-- Task 9: Messaging Providers, Invoice Sharing and Refill Automation
-- message_deliveries: one row per outbound message attempt (opt-outs included).
-- communication_preferences: per-customer channel consent (opt-out flag).

CREATE TABLE IF NOT EXISTS message_deliveries (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  template TEXT NOT NULL,
  variables TEXT,
  aggregate_type TEXT,
  aggregate_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  outbox_event_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS message_deliveries_created_by_idx ON message_deliveries(created_by, created_at);
CREATE INDEX IF NOT EXISTS message_deliveries_aggregate_idx ON message_deliveries(created_by, aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS message_deliveries_status_idx ON message_deliveries(status);

-- SQLite UNIQUE treats NULLs as distinct, so rows with a NULL customer_id can
-- duplicate; the messaging service enforces select-then-update for that case.
CREATE TABLE IF NOT EXISTS communication_preferences (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  customer_id TEXT REFERENCES customers(id),
  channel TEXT NOT NULL,
  opted_out INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(created_by, customer_id, channel)
);

CREATE INDEX IF NOT EXISTS communication_preferences_created_by_idx ON communication_preferences(created_by);
CREATE INDEX IF NOT EXISTS communication_preferences_customer_idx ON communication_preferences(customer_id);
