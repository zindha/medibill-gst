-- Cheque register: post-dated cheques the pharmacy issues and receives.
--
-- A cheque lives in one of four states: pending → cleared | bounced |
-- cancelled. Clearing a cheque that is linked to a payment account posts one
-- payment_account_transactions row (issued = money leaves the account,
-- received = money enters it); bounced and cancelled never touch the account.
--
-- issue_date / due_date are plain YYYY-MM-DD strings compared as strings;
-- cleared_at is an epoch timestamp like the rest of the schema.
CREATE TABLE IF NOT EXISTS cheques (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  direction TEXT NOT NULL,
  party_type TEXT NOT NULL,
  party_name TEXT NOT NULL,
  account_id TEXT REFERENCES payment_accounts(id),
  cheque_no TEXT NOT NULL,
  bank_name TEXT,
  amount_minor INTEGER NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  cleared_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS cheques_owner_idx ON cheques(created_by);
CREATE INDEX IF NOT EXISTS cheques_owner_status_idx ON cheques(created_by, status);
CREATE INDEX IF NOT EXISTS cheques_owner_due_date_idx ON cheques(created_by, due_date);
CREATE INDEX IF NOT EXISTS cheques_account_idx ON cheques(account_id);
