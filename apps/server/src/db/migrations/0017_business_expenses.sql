-- Business Expenses (expense register).
--
-- A business expense is its own record: it is not a payment row. It carries a
-- generated expense number, the spend date, a category, the payee (party), an
-- optional supplier invoice number, one or more item lines with their own GST
-- treatment, and an optional payment reference for what was actually paid.
--
-- Parties are reusable: a payee keeps its GSTIN, address, district and state
-- so the GST split (CGST+SGST intra-state, IGST inter-state) can be derived
-- from the party's state code instead of being re-typed on every expense.
--
-- Timezone note: `date` / `payment_date` are plain ISO date strings
-- (YYYY-MM-DD) and are compared as strings; created_at / updated_at are epoch
-- timestamps like the rest of the schema.
CREATE TABLE IF NOT EXISTS expense_parties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gstin TEXT,
  address TEXT,
  district TEXT,
  state TEXT,
  state_code TEXT,
  phone TEXT,
  email TEXT,
  is_composition_dealer INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS expense_parties_owner_idx ON expense_parties(created_by, is_active);
CREATE INDEX IF NOT EXISTS expense_parties_name_idx ON expense_parties(name);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  party_id TEXT REFERENCES expense_parties(id),
  invoice_no TEXT,
  is_gst INTEGER NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  round_off REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_mode TEXT,
  payment_ref TEXT,
  payment_date TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(date);
CREATE INDEX IF NOT EXISTS expenses_owner_idx ON expenses(created_by);
CREATE INDEX IF NOT EXISTS expenses_party_idx ON expenses(party_id);

CREATE TABLE IF NOT EXISTS expense_items (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hsn TEXT,
  gst_rate REAL NOT NULL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT,
  unit_rate REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS expense_items_expense_idx ON expense_items(expense_id);
