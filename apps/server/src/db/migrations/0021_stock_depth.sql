-- Stock operations depth (Batch E — G3b-01/02/03):
-- `batches.barcode` lets the camera scanner look a batch up directly during a
-- physical count (scan-to-increment). Nullable: batches created before the
-- column existed simply have no barcode and stay reachable through the
-- medicine barcode.
--
-- `stock_audit_counts.reason` keeps the per-batch remark a counter records with
-- the count (damaged, expired on shelf, miscounted earlier…) so the variance
-- review shows *why*, not just *how much*.

ALTER TABLE batches ADD COLUMN barcode TEXT;
ALTER TABLE stock_audit_counts ADD COLUMN reason TEXT;

CREATE INDEX IF NOT EXISTS batches_barcode_idx ON batches(barcode);
