-- Payment accounts (G4a-01): named money-in-hand masters.
--
-- The GL keeps two default money accounts (CASH, BANK); this register adds the
-- real-world pockets a pharmacy actually holds: a cash drawer, one or more bank
-- accounts, UPI handles and card settlements. Each account carries its own
-- opening balance and every movement posts to payment_account_transactions, so
-- an account statement is opening + in − out. Amounts are minor units (paise)
-- stored as integers to keep sums exact.
--
-- Tenant scoping follows the rest of the schema: created_by is the owner user.
-- account_number_masked stores a display form only (e.g. last four digits) —
-- full account numbers are deliberately never stored.
CREATE TABLE IF NOT EXISTS payment_accounts (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  bank_name TEXT,
  ifsc TEXT,
  account_number_masked TEXT,
  account_holder TEXT,
  upi_id TEXT,
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS payment_accounts_owner_idx ON payment_accounts(created_by);
CREATE INDEX IF NOT EXISTS payment_accounts_store_idx ON payment_accounts(store_id);

CREATE TABLE IF NOT EXISTS payment_account_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES payment_accounts(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  direction TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  reason TEXT,
  ref_type TEXT,
  ref_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS payment_account_tx_account_idx
  ON payment_account_transactions(account_id, created_at);
CREATE INDEX IF NOT EXISTS payment_account_tx_ref_idx
  ON payment_account_transactions(ref_type, ref_id);
