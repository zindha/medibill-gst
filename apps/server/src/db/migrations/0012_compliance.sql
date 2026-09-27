-- Task 13: E-Invoice, E-Way Bill and GST Provider Integration
-- compliance_submissions: one provider submission attempt per
--   (tenant, invoice, kind). The UNIQUE(created_by, invoice_id, kind) rule is
--   the idempotency guard: an invoice has at most one live e-invoice row and
--   one live e-way bill row; rejected/cancelled rows are updated in place on
--   re-generate instead of duplicated. request_hash fingerprints the exact
--   payload sent, response_json keeps the raw provider reply (JSON), and
--   vehicle_json carries e-way specifics (transporter, distance, vehicle no).
--   Provider secrets are NEVER stored here — they live only in process env.

CREATE TABLE IF NOT EXISTS compliance_submissions (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  irn TEXT,
  ack_no TEXT,
  ack_date TEXT,
  qr_data TEXT,
  request_hash TEXT,
  response_json TEXT,
  error TEXT,
  vehicle_json TEXT,
  submitted_at INTEGER,
  cancelled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(created_by, invoice_id, kind)
);

CREATE INDEX IF NOT EXISTS compliance_submissions_invoice_idx ON compliance_submissions(created_by, invoice_id);
CREATE INDEX IF NOT EXISTS compliance_submissions_created_by_idx ON compliance_submissions(created_by, created_at);
CREATE INDEX IF NOT EXISTS compliance_submissions_status_idx ON compliance_submissions(created_by, status);
