-- Task 7: Physical Stock-Take and Variance Workflow
-- Audit sessions + per-batch physical count rows (expected frozen at first count).

CREATE TABLE IF NOT EXISTS stock_audits (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT,
  started_at INTEGER NOT NULL,
  approved_at INTEGER,
  approved_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS stock_audits_created_by_idx ON stock_audits(created_by);
CREATE INDEX IF NOT EXISTS stock_audits_status_idx ON stock_audits(status);

CREATE TABLE IF NOT EXISTS stock_audit_counts (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES stock_audits(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  medicine_id TEXT NOT NULL REFERENCES medicines(id),
  batch_id TEXT NOT NULL REFERENCES batches(id),
  expected_quantity REAL NOT NULL,
  counted_quantity REAL NOT NULL,
  recount REAL,
  counted_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(audit_id, batch_id)
);

CREATE INDEX IF NOT EXISTS stock_audit_counts_audit_idx ON stock_audit_counts(audit_id);
CREATE INDEX IF NOT EXISTS stock_audit_counts_created_by_idx ON stock_audit_counts(created_by);
