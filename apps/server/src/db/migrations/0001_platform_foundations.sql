-- Task 0: Tenant, Audit, Outbox and File Storage Foundations

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stored_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_name TEXT,
  platform TEXT,
  app_version TEXT,
  device_token TEXT UNIQUE,
  revoked INTEGER DEFAULT 0,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS outbox_events_created_by_idx ON outbox_events(created_by);
CREATE INDEX IF NOT EXISTS outbox_events_status_idx ON outbox_events(status);
CREATE INDEX IF NOT EXISTS outbox_events_available_idx ON outbox_events(status, available_at);
CREATE INDEX IF NOT EXISTS outbox_events_aggregate_idx ON outbox_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS outbox_events_idempotency_idx ON outbox_events(idempotency_key);
CREATE INDEX IF NOT EXISTS stored_files_owner_idx ON stored_files(owner_id);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS user_devices_user_idx ON user_devices(user_id);
