-- Task 1: Purchase CSV Import and Review-to-Post Pipeline

CREATE TABLE IF NOT EXISTS purchase_imports (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  mappings TEXT NOT NULL DEFAULT '{}',
  defaults TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_import_rows (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES purchase_imports(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  row_index INTEGER NOT NULL,
  raw TEXT NOT NULL,
  normalized TEXT,
  medicine_id TEXT REFERENCES medicines(id),
  issues TEXT NOT NULL DEFAULT '[]',
  row_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS purchase_imports_created_by_idx ON purchase_imports(created_by);
CREATE INDEX IF NOT EXISTS purchase_imports_status_idx ON purchase_imports(status);
CREATE INDEX IF NOT EXISTS purchase_import_rows_import_idx ON purchase_import_rows(import_id);
CREATE INDEX IF NOT EXISTS purchase_import_rows_created_by_idx ON purchase_import_rows(created_by);
