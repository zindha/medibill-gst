-- Task 12: Cash Book, Bank Book and Reconciliation
-- bank_statement_rows: one imported bank statement line. `amount` is SIGNED
--   (inflow +, outflow −) and `direction` is its normalized mirror (`in`/`out`);
--   `raw` keeps the original CSV cells as JSON and `sha256` hashes
--   date|reference|description|amount so re-importing the same file is a no-op.
-- reconciliation_matches: a 1:1 link between one statement row and one journal
--   line (both unique per tenant). Matching NEVER mutates the journal —
--   unmatching only deletes the link, so books stay equal to the trial balance.

CREATE TABLE IF NOT EXISTS bank_statement_rows (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  statement_date TEXT NOT NULL,
  reference TEXT,
  description TEXT,
  amount REAL NOT NULL,
  direction TEXT NOT NULL,
  raw TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  UNIQUE(created_by, sha256)
);

CREATE INDEX IF NOT EXISTS bank_statement_rows_date_idx ON bank_statement_rows(created_by, statement_date);

CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  bank_row_id TEXT NOT NULL REFERENCES bank_statement_rows(id),
  journal_line_id TEXT NOT NULL REFERENCES journal_lines(id),
  matched_at INTEGER NOT NULL,
  matched_by TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(created_by, bank_row_id),
  UNIQUE(created_by, journal_line_id)
);

CREATE INDEX IF NOT EXISTS reconciliation_matches_row_idx ON reconciliation_matches(bank_row_id);
CREATE INDEX IF NOT EXISTS reconciliation_matches_line_idx ON reconciliation_matches(journal_line_id);
