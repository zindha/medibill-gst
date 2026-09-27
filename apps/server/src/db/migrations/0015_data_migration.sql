-- Task 16: Full data migration (customers / suppliers / medicines / opening stock)
-- + bulk bill operations.
--
-- Staged import sessions, shaped like purchase_imports but entity-agnostic:
-- one `data_imports` session per uploaded CSV, one `data_import_rows` per data
-- row with raw cells, normalized JSON, issues JSON and a row_status lifecycle
-- (pending -> ok | error | skipped -> committed -> rolled_back).
--   entity_type: customers | suppliers | medicines | stock
--   status:      draft | committed | rolled_back
--   created_entity_id records what commit created so rollback can find it.
CREATE TABLE IF NOT EXISTS data_imports (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS data_import_rows (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES data_imports(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  row_index INTEGER NOT NULL,
  raw TEXT NOT NULL,
  normalized TEXT,
  issues TEXT NOT NULL DEFAULT '[]',
  row_status TEXT NOT NULL DEFAULT 'pending',
  created_entity_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS data_imports_created_by_idx ON data_imports(created_by);
CREATE INDEX IF NOT EXISTS data_imports_status_idx ON data_imports(status);
CREATE INDEX IF NOT EXISTS data_import_rows_import_idx ON data_import_rows(import_id);
CREATE INDEX IF NOT EXISTS data_import_rows_created_by_idx ON data_import_rows(created_by);
