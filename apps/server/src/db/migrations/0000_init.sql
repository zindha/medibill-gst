-- MediBill Initial Migration
-- Creates all core tables

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  phone TEXT,
  password_hash TEXT,
  role TEXT DEFAULT 'cashier',
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  address TEXT,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  drug_license_no TEXT,
  join_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS store_members (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT DEFAULT 'cashier',
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  payment_terms TEXT,
  credit_limit REAL,
  opening_balance REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  credit_limit REAL,
  opening_balance REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  notes TEXT,
  total_purchases REAL DEFAULT 0,
  last_purchase_date TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  clinic_name TEXT,
  clinic_address TEXT,
  specialization TEXT,
  registration_no TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  generic_name TEXT,
  brand TEXT,
  category TEXT,
  composition TEXT,
  hsn_code TEXT,
  gst_rate TEXT DEFAULT '12',
  schedule TEXT,
  dosage_form TEXT,
  strength TEXT,
  unit TEXT DEFAULT 'unit',
  pack_size TEXT,
  units_per_pack REAL DEFAULT 1,
  barcode TEXT,
  rack_location TEXT,
  min_quantity INTEGER DEFAULT 10,
  reorder_level INTEGER DEFAULT 20,
  purchase_price REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  mrp REAL,
  is_active INTEGER DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL REFERENCES medicines(id),
  batch_no TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  mrp REAL NOT NULL,
  purchase_price REAL NOT NULL,
  selling_price REAL NOT NULL,
  quantity REAL DEFAULT 0,
  initial_quantity REAL DEFAULT 0,
  free_quantity REAL DEFAULT 0,
  supplier_id TEXT REFERENCES suppliers(id),
  purchase_bill_id TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL REFERENCES medicines(id),
  batch_id TEXT REFERENCES batches(id),
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  balance_after REAL NOT NULL,
  rate REAL,
  invoice_id TEXT REFERENCES invoices(id),
  reference TEXT,
  reason TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_no TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_gstin TEXT,
  doctor_id TEXT REFERENCES doctors(id),
  doctor_name TEXT,
  date TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  total_gst REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  payment_mode TEXT,
  status TEXT DEFAULT 'paid',
  notes TEXT,
  hold INTEGER DEFAULT 0,
  cancelled_at INTEGER,
  cancelled_by TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  medicine_id TEXT REFERENCES medicines(id),
  medicine_name TEXT NOT NULL,
  batch_id TEXT REFERENCES batches(id),
  batch_no TEXT,
  expiry_date TEXT,
  hsn_code TEXT,
  quantity REAL NOT NULL,
  unit TEXT,
  mrp REAL DEFAULT 0,
  units_per_pack REAL DEFAULT 1,
  rate REAL NOT NULL,
  amount REAL NOT NULL,
  gst_rate TEXT DEFAULT '12',
  gst_amount REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_batch_allocations (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  invoice_item_id TEXT NOT NULL REFERENCES invoice_items(id),
  medicine_id TEXT NOT NULL REFERENCES medicines(id),
  batch_id TEXT NOT NULL REFERENCES batches(id),
  quantity REAL NOT NULL,
  rate REAL NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_returns (
  id TEXT PRIMARY KEY,
  return_no TEXT NOT NULL UNIQUE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  customer_name TEXT,
  date TEXT NOT NULL,
  reason TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  total_gst REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  refund_mode TEXT,
  status TEXT DEFAULT 'completed',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES sales_returns(id),
  medicine_id TEXT REFERENCES medicines(id),
  medicine_name TEXT NOT NULL,
  batch_id TEXT REFERENCES batches(id),
  batch_no TEXT,
  hsn_code TEXT,
  quantity INTEGER NOT NULL,
  unit TEXT,
  rate REAL NOT NULL,
  amount REAL NOT NULL,
  gst_rate TEXT DEFAULT '12',
  gst_amount REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_bills (
  id TEXT PRIMARY KEY,
  bill_no TEXT NOT NULL UNIQUE,
  supplier_id TEXT REFERENCES suppliers(id),
  supplier_name TEXT,
  bill_date TEXT NOT NULL,
  due_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  total_gst REAL NOT NULL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  payment_mode TEXT,
  payment_status TEXT DEFAULT 'unpaid',
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_bill_items (
  id TEXT PRIMARY KEY,
  purchase_bill_id TEXT NOT NULL REFERENCES purchase_bills(id),
  medicine_id TEXT REFERENCES medicines(id),
  medicine_name TEXT NOT NULL,
  batch_id TEXT REFERENCES batches(id),
  batch_no TEXT,
  expiry_date TEXT,
  hsn_code TEXT,
  quantity INTEGER NOT NULL,
  free_quantity INTEGER DEFAULT 0,
  unit TEXT,
  rate REAL NOT NULL,
  amount REAL NOT NULL,
  gst_rate TEXT DEFAULT '12',
  gst_amount REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  mrp REAL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id TEXT PRIMARY KEY,
  return_no TEXT NOT NULL UNIQUE,
  purchase_bill_id TEXT REFERENCES purchase_bills(id),
  supplier_id TEXT REFERENCES suppliers(id),
  supplier_name TEXT,
  date TEXT NOT NULL,
  reason TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  total_gst REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  refund_mode TEXT,
  status TEXT DEFAULT 'completed',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES purchase_returns(id),
  medicine_id TEXT REFERENCES medicines(id),
  medicine_name TEXT NOT NULL,
  batch_id TEXT REFERENCES batches(id),
  batch_no TEXT,
  hsn_code TEXT,
  quantity INTEGER NOT NULL,
  unit TEXT,
  rate REAL NOT NULL,
  amount REAL NOT NULL,
  gst_rate TEXT DEFAULT '12',
  gst_amount REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  patient_name TEXT NOT NULL,
  patient_age INTEGER,
  patient_gender TEXT,
  doctor_id TEXT REFERENCES doctors(id),
  doctor_name TEXT,
  date TEXT NOT NULL,
  notes TEXT,
  image_path TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT,
  amount REAL NOT NULL,
  reference TEXT,
  invoice_id TEXT REFERENCES invoices(id),
  customer_id TEXT REFERENCES customers(id),
  supplier_id TEXT REFERENCES suppliers(id),
  description TEXT,
  payment_mode TEXT,
  voided INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_accounts (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  supplier_id TEXT REFERENCES suppliers(id),
  type TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  last_transaction_date TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS refill_reminders (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  medicine_id TEXT REFERENCES medicines(id),
  medicine_name TEXT NOT NULL,
  last_purchase_date TEXT NOT NULL,
  reminder_date TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at INTEGER,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_config (
  id TEXT PRIMARY KEY,
  hsn_code TEXT UNIQUE,
  description TEXT,
  gst_rate TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_history (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  error_message TEXT,
  verified_at INTEGER,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_additions (
  id TEXT PRIMARY KEY,
  catalog_key TEXT NOT NULL,
  medicine_name TEXT NOT NULL,
  company TEXT,
  composition TEXT,
  form TEXT,
  unit TEXT,
  pack_size TEXT,
  price REAL DEFAULT 0,
  gst_rate TEXT DEFAULT '5',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS catalog_additions_user_key_idx ON catalog_additions(created_by, catalog_key);

-- Indexes
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);
CREATE INDEX IF NOT EXISTS store_members_store_idx ON store_members(store_id);
CREATE INDEX IF NOT EXISTS store_members_user_idx ON store_members(user_id);
CREATE INDEX IF NOT EXISTS suppliers_created_by_idx ON suppliers(created_by);
CREATE INDEX IF NOT EXISTS customers_created_by_idx ON customers(created_by);
CREATE INDEX IF NOT EXISTS doctors_created_by_idx ON doctors(created_by);
CREATE INDEX IF NOT EXISTS medicines_created_by_idx ON medicines(created_by);
CREATE INDEX IF NOT EXISTS medicines_barcode_idx ON medicines(barcode);
CREATE INDEX IF NOT EXISTS medicines_name_idx ON medicines(name);
CREATE INDEX IF NOT EXISTS batches_medicine_idx ON batches(medicine_id);
CREATE INDEX IF NOT EXISTS batches_expiry_idx ON batches(expiry_date);
CREATE INDEX IF NOT EXISTS batches_batch_no_idx ON batches(batch_no);
CREATE INDEX IF NOT EXISTS inv_tx_medicine_idx ON inventory_transactions(medicine_id);
CREATE INDEX IF NOT EXISTS inv_tx_batch_idx ON inventory_transactions(batch_id);
CREATE INDEX IF NOT EXISTS inv_tx_type_idx ON inventory_transactions(type);
CREATE INDEX IF NOT EXISTS inv_tx_created_idx ON inventory_transactions(created_at);
CREATE INDEX IF NOT EXISTS invoices_invoice_no_idx ON invoices(invoice_no);
CREATE INDEX IF NOT EXISTS invoices_date_idx ON invoices(date);
CREATE INDEX IF NOT EXISTS invoices_customer_idx ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS invoices_created_by_idx ON invoices(created_by);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_batch_allocations_invoice_idx ON invoice_batch_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_batch_allocations_item_idx ON invoice_batch_allocations(invoice_item_id);
CREATE INDEX IF NOT EXISTS invoice_batch_allocations_batch_idx ON invoice_batch_allocations(batch_id);
CREATE INDEX IF NOT EXISTS invoice_batch_allocations_invoice_idx ON invoice_batch_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_batch_allocations_item_idx ON invoice_batch_allocations(invoice_item_id);
CREATE INDEX IF NOT EXISTS invoice_batch_allocations_batch_idx ON invoice_batch_allocations(batch_id);
CREATE INDEX IF NOT EXISTS sales_returns_invoice_idx ON sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS sales_returns_date_idx ON sales_returns(date);
CREATE INDEX IF NOT EXISTS sales_returns_created_by_idx ON sales_returns(created_by);
CREATE INDEX IF NOT EXISTS sales_return_items_return_idx ON sales_return_items(return_id);
CREATE INDEX IF NOT EXISTS purchase_bills_bill_no_idx ON purchase_bills(bill_no);
CREATE INDEX IF NOT EXISTS purchase_bills_supplier_idx ON purchase_bills(supplier_id);
CREATE INDEX IF NOT EXISTS purchase_bills_date_idx ON purchase_bills(bill_date);
CREATE INDEX IF NOT EXISTS purchase_bills_created_by_idx ON purchase_bills(created_by);
CREATE INDEX IF NOT EXISTS purchase_bill_items_bill_idx ON purchase_bill_items(purchase_bill_id);
CREATE INDEX IF NOT EXISTS purchase_returns_supplier_idx ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS purchase_returns_date_idx ON purchase_returns(date);
CREATE INDEX IF NOT EXISTS purchase_returns_created_by_idx ON purchase_returns(created_by);
CREATE INDEX IF NOT EXISTS purchase_return_items_return_idx ON purchase_return_items(return_id);
CREATE INDEX IF NOT EXISTS prescriptions_created_by_idx ON prescriptions(created_by);
CREATE INDEX IF NOT EXISTS payments_date_idx ON payments(date);
CREATE INDEX IF NOT EXISTS payments_type_idx ON payments(type);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments(customer_id);
CREATE INDEX IF NOT EXISTS payments_supplier_idx ON payments(supplier_id);
CREATE INDEX IF NOT EXISTS payments_created_by_idx ON payments(created_by);
CREATE INDEX IF NOT EXISTS credit_accounts_customer_idx ON credit_accounts(customer_id);
CREATE INDEX IF NOT EXISTS credit_accounts_supplier_idx ON credit_accounts(supplier_id);
CREATE INDEX IF NOT EXISTS credit_accounts_type_idx ON credit_accounts(type);
CREATE INDEX IF NOT EXISTS refill_reminders_customer_idx ON refill_reminders(customer_id);
CREATE INDEX IF NOT EXISTS refill_reminders_status_idx ON refill_reminders(status);
CREATE INDEX IF NOT EXISTS refill_reminders_created_by_idx ON refill_reminders(created_by);
CREATE INDEX IF NOT EXISTS activity_log_user_idx ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON activity_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS tax_config_hsn_idx ON tax_config(hsn_code);
CREATE INDEX IF NOT EXISTS settings_key_idx ON settings(key);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS backup_history_type_idx ON backup_history(type);
CREATE INDEX IF NOT EXISTS backup_history_created_idx ON backup_history(created_at);
