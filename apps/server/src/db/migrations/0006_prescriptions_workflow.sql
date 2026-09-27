-- Task 6: Prescription Management and Dispensing
-- Workflow columns on the existing prescriptions table + invoice linkage.

ALTER TABLE prescriptions ADD COLUMN customer_id TEXT;
ALTER TABLE prescriptions ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE prescriptions ADD COLUMN dispensed_at INTEGER;
ALTER TABLE prescriptions ADD COLUMN dispensed_invoice_id TEXT;

ALTER TABLE invoices ADD COLUMN prescription_id TEXT;
ALTER TABLE invoices ADD COLUMN prescription_status TEXT;

CREATE INDEX IF NOT EXISTS prescriptions_customer_id_idx ON prescriptions(customer_id);
CREATE INDEX IF NOT EXISTS prescriptions_status_idx ON prescriptions(status);
CREATE INDEX IF NOT EXISTS invoices_prescription_id_idx ON invoices(prescription_id);
