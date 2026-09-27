-- Task 4: Supplier Comparison and Procurement Intelligence
-- Manually recorded supplier quotes for a medicine (phone/WhatsApp quotations)
-- so procurement comparison can rank quoted rates against real purchase history.

CREATE TABLE IF NOT EXISTS supplier_quotes (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  medicine_id TEXT NOT NULL REFERENCES medicines(id),
  quoted_rate REAL NOT NULL,
  quote_date TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS supplier_quotes_created_by_medicine_idx ON supplier_quotes(created_by, medicine_id);
CREATE INDEX IF NOT EXISTS supplier_quotes_created_by_supplier_idx ON supplier_quotes(created_by, supplier_id);
