-- Task 2: Purchase OCR Completion and Reconciliation
-- Adds source tracking to purchase import sessions so CSV and OCR sessions
-- share one table. `file_id` links an OCR session back to the stored source
-- image (stored_files) and `header_fields` keeps the extracted header values
-- with their OCR confidence scores.

ALTER TABLE purchase_imports ADD COLUMN source TEXT NOT NULL DEFAULT 'csv';
ALTER TABLE purchase_imports ADD COLUMN file_id TEXT;
ALTER TABLE purchase_imports ADD COLUMN header_fields TEXT;
