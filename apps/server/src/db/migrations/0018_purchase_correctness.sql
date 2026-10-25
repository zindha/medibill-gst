-- Purchase correctness: supplier invoice identity, GST-free purchases,
-- per-line markup, supplier credit/licence fields and reorder policy.
--
-- A purchase bill may carry the supplier's own invoice number (the number
-- printed on the supplier's paper bill). The pair (supplier_id,
-- supplier_invoice_no) is unique so the same supplier invoice cannot be
-- booked twice. The index is PARTIAL: legacy rows have a NULL
-- supplier_invoice_no and stay valid (SQLite treats NULLs as distinct).
--
-- `outside_gst` marks a bill whose goods sit outside the GST regime
-- (exempt / non-GST supply): every line's tax is zeroed and the bill total
-- carries no tax.
--
-- `markup` is a per-line percentage uplift on the purchase rate; the line
-- amount is quantity * rate * (1 + markup/100) minus the line discount.
--
-- Supplier credit fields: `drug_license_no` (the supplier's drug licence
-- number) and `gstin_verified` (the supplier's GSTIN was checked).
--
-- Reorder policy: `max_quantity` (stock ceiling), `reorder_point_days` (lead
-- time in days used to derive the reorder point), `demand_period_days` (the
-- window used to average consumption) and `seasonal` (the item fluctuates
-- seasonally, so a flat average is not enough).

ALTER TABLE suppliers ADD COLUMN drug_license_no TEXT;
ALTER TABLE suppliers ADD COLUMN gstin_verified INTEGER NOT NULL DEFAULT 0;

ALTER TABLE purchase_bills ADD COLUMN supplier_invoice_no TEXT;
ALTER TABLE purchase_bills ADD COLUMN outside_gst INTEGER NOT NULL DEFAULT 0;

ALTER TABLE purchase_bill_items ADD COLUMN markup REAL NOT NULL DEFAULT 0;

ALTER TABLE medicines ADD COLUMN max_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE medicines ADD COLUMN reorder_point_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE medicines ADD COLUMN demand_period_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE medicines ADD COLUMN seasonal INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_bills_supplier_invoice_unique
  ON purchase_bills (supplier_id, supplier_invoice_no)
  WHERE supplier_invoice_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_bills_supplier_invoice_idx
  ON purchase_bills (supplier_id, supplier_invoice_no);
