-- Task 11: Double-Entry Accounting Core
-- accounts: per-tenant chart of accounts (14 seeded system accounts + manual).
-- journal_entries: one balanced entry per (tenant, source_type, source_id);
--   NULL source_id (manual entries) repeats freely because SQLite UNIQUE treats
--   NULLs as distinct.
-- journal_lines: debit/credit legs; exactly one side is > 0 per line.
-- accounting_periods: closed date ranges that block new postings.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(created_by, code)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  description TEXT,
  is_reversal INTEGER NOT NULL DEFAULT 0,
  reversed_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(created_by, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON journal_entries(created_by, date);
CREATE INDEX IF NOT EXISTS journal_entries_source_idx ON journal_entries(created_by, source_type);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES journal_entries(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  party_type TEXT,
  party_id TEXT,
  memo TEXT
);

CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines(created_by, account_id);

CREATE TABLE IF NOT EXISTS accounting_periods (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  closed_at INTEGER,
  closed_by TEXT,
  UNIQUE(created_by, from_date, to_date)
);
