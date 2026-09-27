-- Task 3: Alternatives, Salt Search and Product Intelligence
-- Explicit pharmacist-curated substitute links between two of the tenant's
-- own medicines. The UNIQUE constraint makes POST /api/product-intelligence/
-- substitutes idempotent per (tenant, source, substitute).

CREATE TABLE IF NOT EXISTS medicine_substitutes (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  medicine_id TEXT NOT NULL REFERENCES medicines(id),
  substitute_medicine_id TEXT NOT NULL REFERENCES medicines(id),
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS medicine_substitutes_unique_idx ON medicine_substitutes(created_by, medicine_id, substitute_medicine_id);
CREATE INDEX IF NOT EXISTS medicine_substitutes_created_by_idx ON medicine_substitutes(created_by);
CREATE INDEX IF NOT EXISTS medicine_substitutes_medicine_idx ON medicine_substitutes(medicine_id);
