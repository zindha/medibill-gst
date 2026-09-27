-- Task 15: Cloud sync operation log + device registry wiring.
-- Devices already exist (user_devices, Task 0). This migration adds the
-- append-only sync operation journal used by POST /api/sync/push and the
-- cursor feed of GET /api/sync/pull.
--
--   created_by + operation_id is UNIQUE: pushing the same operationId twice
--   is detected as a duplicate and never re-applied (idempotency).
--   status: applied | conflict | duplicate | error.
--   conflict_json holds the server-side row snapshot handed back to the
--   client on a stale base_version so it can resolve manually.
--   Invoices / journals / orders are NOT synced through this table — they are
--   server-authoritative and flow through their normal APIs (documented in
--   docs/API.md "Devices, Sync & Permissions").
CREATE TABLE IF NOT EXISTS sync_operations (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  operation_id TEXT NOT NULL,
  device_token TEXT,
  entity TEXT,
  action TEXT,
  payload TEXT,
  entity_id TEXT,
  base_version TEXT,
  applied_version TEXT,
  status TEXT NOT NULL,
  conflict_json TEXT,
  error TEXT,
  applied_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(created_by, operation_id)
);

CREATE INDEX IF NOT EXISTS sync_operations_created_by_applied_at_idx ON sync_operations(created_by, applied_at);
