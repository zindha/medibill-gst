# MediBill — API Reference

Base URL: `http://localhost:3000/api`

All endpoints return:
```json
{
  "success": true,
  "data": { ... }
}
```

On error:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "details": { ... }
}
```

Authentication: Pass `session_token` cookie OR `Authorization: Bearer <token>` header.

---

## Authentication

### POST `/api/auth/login`
Login with email/phone and password.
```json
{ "identifier": "user@example.com", "password": "secret" }
```

### POST `/api/auth/register`
Register first admin user.
```json
{ "name": "Admin", "email": "admin@example.com", "password": "secret" }
```

### GET `/api/auth/me`
Get current authenticated user.

### POST `/api/auth/logout`
Logout current session.

### POST `/api/auth/change-password`
```json
{ "currentPassword": "...", "newPassword": "..." }
```

---

## Medicines

All endpoints are tenant-scoped (`created_by`): list, detail, barcode lookup
and updates only ever touch the caller's own medicines — a foreign `:id` or
barcode returns `404`.

### GET `/api/medicines`
Search/list medicines.
- Query: `search`, `category`, `page`, `limit`

### GET `/api/medicines/:id`
Get medicine with all batches.

### GET `/api/medicines/barcode/:barcode`
Barcode lookup. Returns medicine with available batches (FEFO-ordered).

### POST `/api/medicines`
Create medicine.

### PUT `/api/medicines/:id`
Update medicine.

### DELETE `/api/medicines/:id`
Soft-delete medicine.

---

## Product Intelligence

Alternatives, salt search and explicit substitute links (Task 3). All endpoints tenant-scoped — only the caller's own active medicines are considered, and foreign/unknown `medicineId`s return 404. Service: `apps/server/src/services/productIntelligence.ts`; table `medicine_substitutes` (migration `0004`).

Matching is deterministic (no AI): compositions are normalized into sorted salt tokens (case/accent folded, strength numbers stripped, split on `+ , / &`, dosage stopwords dropped) and medicines are bucketed:

- `exactSalt` — same composition tokens, same strength, same dosage form.
- `sameComposition` — same tokens, strength/form differs or unknown.
- `substitutes` — explicit pharmacist links first (`explicit: true`), then ≥50% Jaccard token overlap or an identical `genericName` (`score` 0–1).

Ranking inside each bucket: explicit links → stock packs desc → selling price asc. Every candidate carries `stockPacks` (sum of active batch quantities), `nearestExpiry` and `marginPercent` (`(sellingPrice − purchasePrice) / sellingPrice × 100`).

### GET `/api/product-intelligence/alternatives?medicineId=`
Alternatives to one of your medicines.
- Query: `medicineId` (required), `inStock=true`, `maxPrice=<number>`, `sameSchedule=true` (defaults shown; `sameSchedule` defaults true).
- Response `data`: `{ source: { medicineId, name, brand, composition, compositionTokens[], strength, schedule, mrp, sellingPrice, purchasePrice, stockPacks, nearestExpiry, marginPercent, inStock }, buckets: { exactSalt: [], sameComposition: [], substitutes: [] } }`.
- 400 without `medicineId`, 404 for unknown/foreign medicines.

### GET `/api/product-intelligence/search?q=&composition=&limit=`
Salt search: your stock first, then the bundled 243k reference catalog as fallback.
- Query: `q`, `composition` (optional extra filter on your stock), `limit` (1–50, default 20).
- Response `data`: `{ stock: [{ ...annotation, source: "stock", compositionTokens[] }], catalog: [{ name, company, composition, packSize, form, unit, price, gstRate, source: "catalog", stockPacks: 0, inStock: false, compositionTokens[] }] }`.
- Empty `q` + `composition` → both arrays empty. Catalog failures degrade to `catalog: []` (stock results still return).

### POST `/api/product-intelligence/substitutes`
Store an explicit pharmacist-curated substitute link.
```json
{ "medicineId": "...", "substituteMedicineId": "...", "reason": "pharmacist reviewed" }
```
Response `data`: `{ created: boolean, link: { id, medicineId, substituteMedicineId, reason, createdAt } }`. Idempotent — the unique constraint makes duplicates `created: false` (still 201). 400 for self-links, 404 for foreign/unknown medicines.

### GET `/api/product-intelligence/links?medicineId=`
Explicit substitute links for a medicine (annotated substitute `medicine` included).
- 400 without `medicineId`.

---

## Inventory / Batches

### GET `/api/inventory/batches?medicineId=`
Get all batches for a medicine. Tenant-scoped (`created_by`) — a foreign
`medicineId` returns an empty list.

### GET `/api/inventory/batches/available?medicineId=`
Get non-expired, in-stock batches (FEFO-ordered). Tenant-scoped.

### POST `/api/inventory/batches`
Create a new batch. `404` when the `medicineId` is not the caller's medicine.

### PUT `/api/inventory/batches/:id`
Update batch (expiry, MRP, prices). `404` for a foreign batch.

### POST `/api/inventory/adjust`
Stock adjustment.
```json
{ "batchId": "...", "reason": "Stock count", "newQuantity": 95, "notes": "Physical count" }
```

### GET `/api/inventory/transactions`
Transaction history.
- Query: `medicineId`, `batchId`, `type`, `page`

### GET `/api/inventory/low-stock`
Medicines at or below minimum quantity.

### GET `/api/inventory/expiry?status=expired|30|60|90`
Batches expiring within timeframe. Tenant-scoped (`created_by`).

### GET `/api/inventory/stock`
Current stock report with valuations.

---

## Invoices

### GET `/api/invoices`
List/search invoices. Tenant-scoped (`created_by`) — only the caller's
invoices are ever returned.
- Query: `date`, `from`, `to`, `customerId`, `status`, `page`, `limit`

### GET `/api/invoices/:id`
Get invoice with items.

### GET `/api/invoices/number/:invoiceNo`
Get invoice by invoice number. Tenant-scoped: an invoice number owned by
another tenant returns `404` (invoice numbers are a globally sequential,
guessable series, so this lookup must never cross `created_by` — see the
Task 18 acceptance matrix).

### POST `/api/invoices`
**Create invoice (complete sale).**
```json
{
  "customerId": "...",
  "customerName": "...",
  "date": "2026-01-15",
  "items": [
    {
      "medicineId": "...",
      "medicineName": "Paracetamol 500mg",
      "batchId": "...",
      "batchNo": "A123",
      "quantity": 2,
      "rate": 25.00,
      "amount": 50.00,
      "gstRate": "12",
      "gstAmount": 6.00,
      "cgst": 3.00,
      "sgst": 3.00
    }
  ],
  "subtotal": 50.00,
  "totalGst": 6.00,
  "cgst": 3.00,
  "sgst": 3.00,
  "grandTotal": 56.00,
  "amountPaid": 56.00,
  "paymentMode": "cash"
}
```

### POST `/api/invoices/:id/cancel`
Cancel invoice (reverses stock, updates customer balance, records the refund
payout row). **Ledger (Fix 3)**: reverses every posted `payment` settlement
entry of this invoice first (`{ invoiceNo, kind: "settlement" }` audit), then
the sale entry (`kind: "invoice"`) — both idempotent; the refund payout row
itself stays unposted (its cash effect is modeled by those reversals).

### POST `/api/invoices/:id/hold`
Put invoice on hold. `404` for a foreign invoice.

### POST `/api/invoices/:id/recall`
Recall a held invoice. `404` for a foreign invoice.

---

## Purchases

### GET `/api/purchases`
List purchase bills. Tenant-scoped (`created_by`).
- Query: `supplierId`, `from`, `to`, `page`

### GET `/api/purchases/:id`
Get purchase bill with items. `404` for a foreign bill.

### POST `/api/purchases`
Create purchase bill (creates batches, increases stock). `medicineId` and
`supplierId` must belong to the caller (`400 Medicine not found` /
`400 Supplier not found`); a foreign `batchId` never restocks.

---

## Purchase Returns

Creation route for the pre-existing `purchase_returns` / `purchase_return_items`
tables (no new table or migration). Service seam:
`apps/server/src/routes/purchaseReturns.ts`, registered at
`/api/purchase-returns`. Responses use `{ success, data, error }`; every read
and write is tenant-scoped (`created_by`).

### POST `/api/purchase-returns` *(admin | pharmacist — cashier → 403)*
```json
{
  "purchaseBillId": "...optional...",
  "supplierId": "...optional...",
  "supplierName": "...optional...",
  "date": "2026-07-10",
  "reason": "...optional...",
  "refundAmount": 0,
  "refundMode": "cash",
  "items": [
    { "medicineId": "...", "batchId": "...optional...", "quantity": 2, "rate": 100,
      "gstRate": "5 optional", "hsnCode": "optional", "mrp": 0 }
  ]
}
```
- **Validation**: ≥1 item; medicine must be tenant-owned (`400 Medicine not
  found`); `supplierId` must exist in the tenant (`400 Supplier not found`);
  `purchaseBillId` must exist in the tenant (`404 Purchase bill not found`) and
  supplies the supplier when none is given; a `batchId` must belong to the
  tenant **and** to the medicine (`400 Batch does not belong to this medicine`).
- **Batch resolution**: purchase returns target a specific lot — an explicit
  `batchId` is required unless the medicine has exactly **one** active batch
  (auto-picked); zero batches → `400 No stock batch found for X`, multiple →
  `400 Multiple batches for X — batchId is required`.
- **Stock guard**: the batch quantity must cover the (cumulative) demand, else
  `400 Insufficient stock in batch <no>, available <n>` — nothing is written.
- **Money math** (server-computed, mirrors invoice create): `amount = rate ×
  quantity` (GST-inclusive), `gstRate` defaults to the medicine's rate,
  `gstAmount = round2(amount − amount/(1 + rate/100))`, cgst/sgst split;
  `subtotal = grandTotal − totalGst`, `grandTotal = Σ amount`, `refundAmount`
  defaults to `grandTotal`.
- **One transaction**: insert header (`PR-YYYY-NNNNNN` unique series) + items,
  deduct batch stock with an `inventory_transactions` row
  (`type = 'purchase_return'`, `quantity = −qty`, `balanceAfter`, `reference =
  returnNo`), adjust the supplier balance (see rule below), then post the
  journal (a ledger failure is caught + audited as `accounting.post_failed`,
  never blocks the return). Audit: `purchase_return.create`.
- **Supplier balance rule** (mirrors `purchases.ts`, which only adds the
  *unpaid* portion): `refundMode "credit"` → `balance −= refundAmount` (the
  refund settles against our dues, journal Dr `AP`); cash/card/upi/other →
  balance unchanged (money changed hands, journal Dr `CASH|BANK`).
- **Journal** (`source_type = "purchase_return"`, posted in the same
  transaction): Dr `AP` (credit mode, party = supplier) | Dr `CASH|BANK`
  `refundAmount`; Cr `PURCHASE_RETURNS` taxable portion; Cr `GST_INPUT`
  proportional GST share (`round2(refundAmount × totalGst / grandTotal)`) —
  zero legs omitted, idempotent per return id.

### GET `/api/purchase-returns`
List the tenant's purchase returns. Query: `date`, `from`, `to`, `supplierId`,
`page`, `limit` → `{ success, data, total, page, limit }`.

### GET `/api/purchase-returns/:id`
One return with its `items[]`; another tenant's id → `404`.

UI: `/dashboard/purchases` → **Purchase Returns** tab (`src/pages/PurchasesPage.tsx`)
— list + New Return dialog (supplier → optional bill → medicine rows with
batch select, qty, prefilled rate, auto-computed refund).

---

## Purchase CSV Imports

Review-to-post pipeline: upload CSV → auto-map columns → resolve medicines → validate rows → atomic commit into a purchase bill. Session tables `purchase_imports` / `purchase_import_rows` (migration `0002`). All endpoints tenant-scoped; other tenants' import IDs return 404.

Recognized header aliases (case-insensitive): `invoice no|bill no|billno`, `date|bill date|invoice date`, `supplier|vendor|distributor`, `product|item|medicine|description|name`, `barcode|ean|gtin`, `batch|lot`, `expiry|exp`, `qty|quantity|units`, `free|free qty`, `mrp`, `rate|purchase rate|purchase price|pp`, `gst|gst rate|tax rate`, `discount|disc`.

### POST `/api/purchase-imports`
Create import session from CSV text (JSON body; multipart comes with OCR task).
```json
{ "filename": "supplier-aug.csv", "csv": "header...\nrows..." }
```
Response `data`: `{ importId, columns, rows: [{ rowIndex, raw, normalized, medicineId, issues[], status }], warnings, errors }`. Expiry values like `12/27` normalize to `2027-12-31` (month precision → month end).

### PUT `/api/purchase-imports/:id/mappings`
Remap columns and defaults; recomputes all row issues.
```json
{ "mappings": { "0": "bill_no", "3": "" }, "defaults": { "supplierId": "...", "gstRate": "12" } }
```

### GET `/api/purchase-imports/:id`
Get import session (columns + rows + issues).

### POST `/api/purchase-imports/:id/commit`
Atomically create the purchase bill, batches and inventory transactions. 400 when any row has blocking errors (nothing persisted), 409 on duplicate commit.
```json
{ "billNo": "B-100", "billDate": "2026-09-26", "supplierId": "optional",
  "rows": [{ "rowIndex": 0, "medicineId": "...", "batchNo": "B1", "expiryDate": "2027-12-31",
             "quantity": 10, "freeQuantity": 0, "mrp": 45, "purchasePrice": 30, "sellingPrice": 40, "gstRate": "12" }] }
```

### DELETE `/api/purchase-imports/:id`
Delete a draft import (404 after commit).

### POST `/api/purchase-imports/ocr`
Create an import session from client-side OCR text (image scan flow). OCR runs in the browser (tesseract.js); the server re-parses the raw text with the same normalization, medicine matching and commit pipeline as a CSV session.
```json
{ "filename": "invoice.jpg", "text": "raw OCR text...", "fileId": "optional stored_files.id" }
```
Response `data`: identical session shape to `POST /api/purchase-imports` plus:
- `source: "ocr"` (`"csv"` for CSV sessions)
- `fileId` — stored source image id (when provided; 404 if it belongs to another tenant)
- `headerFields: { billNo: { value, confidence }, billDate: { value, confidence }, supplierName: { value, confidence } }`

Confidence scores: `≥ 0.9` strong labelled pattern (`Bill No: INV-123`), `0.6` weak id/date-like token, `0.3` absent. A bill no or bill date with confidence `≤ 0.5` also adds a warning issue to the first row. Rows where the OCR could not read product/quantity get confidence `0` and land as error rows for review. 400 when `text` is shorter than 10 characters or contains no detectable line items.

---

## Data Migration

Full CSV migration for `customers`, `suppliers`, `medicines` and opening `stock` (Task 16). Service: `apps/server/src/services/dataMigration.ts`; staged tables `data_imports` / `data_import_rows` (migration `0015_data_migration.sql`). Same shape as the purchase import pipeline: create → resolve → preview → atomic commit → optional rollback. All endpoints are tenant-scoped; another tenant's import id returns 404 on every endpoint.

Headers auto-map by alias per entity (`customer|party|name` → `name`, `mobile|phone` → `phone`, `opening|balance|opening balance` → `openingBalance`, `product|item|medicine` → `name`, `gst|gst rate` → `gstRate`, `hsn code` → `hsnCode`, `medicine|product` → `medicineName`, `lot|batch no` → `batchNo`, `exp|expiry` → `expiryDate`, `qty|quantity` → `quantity`, …). Unknown columns are ignored; there is no mapping endpoint (entity CSVs are self-describing).

Per-entity rules:
- **customers** — `name` required; phone is stripped to digits and warned when not 10 digits; GSTIN format warned (never blocking); `openingBalance` copied onto `balance`. Rows matching an existing tenant customer (same case-insensitive name **or** same phone) are `skipped` — existing rows are never updated.
- **suppliers** — same matching, plus `paymentTerms` and `creditLimit`.
- **medicines** — `name` required; a `gstRate` outside `0/5/12/18/28` falls back to `12` with a warning; existing `name + brand` (case-insensitive) matches are skipped; creates with `isActive` defaults.
- **stock** — `medicineName` must already exist in the tenant catalog (unknown → error row); `batchNo` required; expiry accepts `YYYY-MM-DD`, `MM/YYYY` / `MM/YY` (normalized to month end) and `DD/MM/YYYY`; `quantity ≥ 0`; blank `mrp/purchasePrice/sellingPrice` fall back to the medicine's own values; an existing medicine+batch pair is skipped. Commit inserts a batch **and** an `inventory_transactions` row (`type: stock_in`, `balanceAfter = quantity`, `reason: "Opening stock import"`, `reference = filename`).

Row lifecycle: `pending → ok | error | skipped → committed → rolled_back`. Session lifecycle: `draft → committed → rolled_back`.

### POST `/api/data-migrations`
Create a draft session from CSV text.
```json
{ "entityType": "customers", "filename": "customers.csv", "csv": "header...\nrows..." }
```
`entityType` ∈ `customers | suppliers | medicines | stock` (400 otherwise). Response `data`: `{ importId, entityType, filename, status, columns, mappings, rows: [{ rowIndex, raw, normalized, issues[], status, createdEntityId }], counts: { total, pending, ok, error, skipped, committed, rolledBack }, errors, warnings }`. `errors` counts error **rows** (the commit gate); `warnings` counts warning issues. 400 for an empty/header-only CSV.

### GET `/api/data-migrations`
List the tenant's sessions (newest first) with `counts` per session.

### GET `/api/data-migrations/:id`
Full session — drafts are recomputed (fresh normalization/matching), committed/rolled-back sessions return rows as stored.

### POST `/api/data-migrations/:id/preview`
Dry run: re-resolves and returns `{ counts, wouldCreate, wouldSkip, errors, warnings, rows (first 50), truncated, status }`. Writes no entities and never changes the session status — previews before commit come free here.

### POST `/api/data-migrations/:id/commit`
Atomic commit of every `ok` row in one transaction; sets the session `committed` and stamps `created_entity_id` per row. One `audit_events` row (`action: data_import.commit`) is written inside the transaction.
- **400** `{ details: { rows: [{ rowIndex, field, message }] } }` when ANY row has a blocking error — nothing is persisted.
- **409** on a second commit (or a non-draft session).
- Response `data`: `{ importId, entityType, status, created, skipped }` (`skipped` covers dedupe hits found in the file or by a race).

### POST `/api/data-migrations/:id/rollback`
All-or-nothing undo of a committed session. When every created record is removable it is deleted (customers/suppliers/medicines directly; stock batches plus their `stock_in` transactions), rows become `rolled_back`, the session becomes `rolled_back` and one `data_import.rollback` audit event is written.
- **409** `{ error: "Cannot roll back: N rows are referenced", details: { skipped: [{ rowIndex, createdEntityId, reason }] } }` when ANY created record is referenced (an invoice uses the customer, a batch's `quantity ≠ initialQuantity` → "stock moved", …) — nothing is deleted in that case.
- **409** for drafts and for a second rollback.

### DELETE `/api/data-migrations/:id`
Deletes a **draft** session and its rows (404 for committed/rolled-back sessions or other tenants).

---

## Bulk Bill Operations

Bulk edit of sales bills (Task 16): filter → preview with per-field diffs → confirmed commit with one audit event. Service: `apps/server/src/services/dataMigration.ts` (bulk-bills section); routes in `apps/server/src/routes/bulkBills.ts`.

Shared shapes:
- `filters` — `{ from?, to?, status?, customerId?, minAmount?, maxAmount?, q? }` (`q` matches invoice no or customer name, case-insensitive). **Empty filters intentionally match 0 invoices** — a bulk edit must always be scoped. Cancelled bills are never matched.
- `patch` — exactly these keys, all optional but at least one required (400 otherwise): `customerId` (tenant customer id, or `null` to clear → walk-in; unknown customer → 400), `date` (`YYYY-MM-DD`), `notes` (≤500 chars), `paymentMode` (one of `cash|card|upi|credit|other|bank_transfer|cheque`; unknown → 400).

### POST `/api/bulk-bills/preview`
Read-only. Body `{ filters, patch }` →
```json
{ "total": 3, "requiresConfirmation": true, "patch": { "notes": "…" },
  "invoices": [{ "id": "…", "invoiceNo": "MB-2026-000001", "date": "2026-01-10",
                 "customerName": "…", "grandTotal": 100, "status": "paid",
                 "diffs": { "notes": { "from": "old", "to": "new" } } }] }
```
`diffs` contains one `{ from, to }` entry per provided patch key. Writes nothing. Available to every authenticated role (it is read-only).

### POST `/api/bulk-bills/commit`
Requires **admin or pharmacist** (cashier → 403) and the literal confirmation `"CONFIRM"` (missing/wrong → 400). Body `{ filters, patch, confirm: "CONFIRM" }`.
- One transaction: each matched invoice gets only the provided patch fields (+ `updatedAt`); reassigning `customerId` also refreshes the denormalized `customerName` (or clears it for `null`); invoices cancelled mid-flight are skipped. Totals, subtotal and line items are never touched.
- Exactly **one** `audit_events` row per commit: `{ action: "invoice.bulk_patch", entity: "invoice", metadata: { count, patch, filters } }`.
- Response `data`: `{ updated, skipped, audit }`.

---

## Procurement

Supplier comparison and procurement intelligence (Task 4). Service: `apps/server/src/services/procurement.ts`; table `supplier_quotes` (migration `0005`). All endpoints tenant-scoped — foreign supplier ids return 404, unknown medicines return empty results.

Effective cost underpins everything: `totalCost = rate × quantity − discountAmount`, `unitCost = totalCost / (quantity + freeQuantity)` — free "scheme" units are spread across the paid units.

### GET `/api/procurement/compare?medicineId=&quantity=`
Rank every supplier that has quoted or supplied a medicine — cheapest effective unit cost first, unknown costs last.
- Query: `medicineId` (required, 400 without), `quantity` (default 1 — used for `estimatedCost`).
- Response `data`: `{ medicineId, quantity, quotes: [{ supplierId, supplierName, source: "purchase"|"quote", unitCost, lastDate, bills, terms, outstanding, creditLimit, estimatedCost, stockQuantity }] }`.
- `source: "purchase"` rows carry the LATEST effective unit cost from real bills; `source: "quote"` rows carry the most recent manual quote. Suppliers with no history for this medicine are excluded.

### GET `/api/procurement/recommendation?medicineId=&quantity=`
Wraps compare: `{ medicineId, quantity, cheapest, recommendation, suppliersConsidered, inStockSupplierIds[], notes[], quotes[] }`.

### GET `/api/procurement/rate-history?medicineId=&supplierId=&from=&to=`
Chronological rate records for one medicine.
- Query: `medicineId` (required, 400 without), `supplierId`, `from`, `to` (optional, ISO dates on `billDate` / `quote_date`).
- Response `data`: `{ rows: [{ date, billNo, supplierId, supplierName, rate, effectiveUnitCost, quantity, source: "purchase"|"quote", freeQuantity, discountAmount, notes }], count }` sorted ascending by date.

### GET `/api/procurement/suppliers/:id/metrics?from=&to=`
Supplier performance over a period (both bounds optional; empty periods return zeroed metrics).
- Response `data`: `{ supplierId, supplierName, from, to, totals: { totalPurchased, totalPaid, outstanding }, outstanding, paymentTerms, creditLimit, metrics: { billCount, returnCount, returnRatePct, fillRatePct, returnQtyPct, avgPaymentDays, expiryRiskValue }, bills: [{ billNo, billDate, grandTotal, amountPaid, paymentStatus, dueDate }] }`.
- `returnRatePct` = % of bills touched by a purchase return; `avgPaymentDays` = mean lag from `billDate` to matching `payments` rows (`type=paid`, `reference=billNo`); `expiryRiskValue` = `quantity × rate` for purchase lines whose batch (joined by medicine + batch number) expires within 365 days or already expired.
- 404 for unknown or foreign suppliers.

### GET `/api/procurement/suppliers/:id/expiry-items?from=&to=`
Supplier-wise expiry responsibility drill-down: `{ supplierId, supplierName, rows: [{ medicineId, medicineName, batchNo, expiryDate, daysToExpiry, quantity, rate, value, billNo }], totalValue }`. 404 for unknown/foreign suppliers.

### POST `/api/procurement/quotes`
Record a manual supplier quotation.
```json
{ "supplierId": "...", "medicineId": "...", "quotedRate": 100.5, "quoteDate": "2026-09-26", "notes": "WhatsApp quote" }
```
Response `data`: `{ id, supplierId, supplierName, medicineId, medicineName, quotedRate, quoteDate, notes, createdAt }` (201). 400 for `quotedRate < 0` or missing ids; 404 for foreign supplier/medicine.

### GET `/api/procurement/quotes?medicineId=&supplierId=`
List recorded quotes (newest first): `{ rows: [{ id, supplierId, supplierName, medicineId, medicineName, quotedRate, quoteDate, notes, createdAt }], count }`.

Shortbook integration: `GET /api/reports/order/shortbook` rows additionally carry `recommendedSupplierId`, `recommendedSupplierName` and `unitCost` **when** the medicine has purchase/quote history (additive fields only — rows without history keep the old shape).

---

## Files

Stored source images and attachments (`stored_files`, migration `0001`). All endpoints are tenant-scoped — another tenant's file id returns 404.

### POST `/api/files`
Upload a base64 file (a `data:...;base64,` prefix is accepted and stripped). Duplicate content is detected by sha256 per tenant and returns the existing file instead of storing it twice.
```json
{ "filename": "invoice.jpg", "contentType": "image/jpeg", "data": "<base64>" }
```
Response `data`: `{ id, sha256, size, duplicate }`. `201` for a new file, `200` with `duplicate: true` when the same content already exists. Max 10 MB per file (20 MB request body).

### GET `/api/files/:id`
Fetch a stored file as base64 (used for the side-by-side invoice preview).
Response `data`: `{ contentType, filename, data }`. 404 for unknown ids or other tenants' files.

---

## Customers

All endpoints tenant-scoped (`created_by`): list, detail, ledger and updates
only touch the caller's own customers — a foreign `:id` returns `404`.

### GET `/api/customers`
List/search customers.
- Query: `search`, `page`, `limit`

### GET `/api/customers/:id`
Get customer with ledger.

### GET `/api/customers/:id/ledger`
Payment history for customer.

### POST `/api/customers`
Create customer.

### PUT `/api/customers/:id`
Update customer.

---

## Suppliers

All endpoints tenant-scoped (`created_by`): list, detail, ledger and updates
only touch the caller's own suppliers — a foreign `:id` returns `404`.

### GET `/api/suppliers`
List/search suppliers.
- Query: `search`, `page`

### GET `/api/suppliers/:id`
Get supplier.

### GET `/api/suppliers/:id/ledger`
Payment history for supplier.

### POST `/api/suppliers`
Create supplier.

### PUT `/api/suppliers/:id`
Update supplier.

---

## Doctors

All endpoints tenant-scoped (`created_by`) — a foreign `:id` returns `404`.

### GET `/api/doctors`
List doctors.

### GET `/api/doctors/:id`
Get doctor.

### POST `/api/doctors`
Create doctor.

### PUT `/api/doctors/:id`
Update doctor.

---

## Prescriptions

Patient prescription workflow (Task 6): capture → verify → dispense. Status
machine: `pending → verified → dispensed`, with `rejected` reachable from
`pending|verified` and re-verifiable afterwards; `dispensed` is terminal and is
set only by the dispense endpoint. Service: `apps/server/src/services/prescriptions.ts`;
table `prescriptions` (migration `0006_prescriptions_workflow.sql`). Every
endpoint is tenant-scoped — foreign ids return 404.

### POST `/api/prescriptions`
Create a prescription (always starts as `pending`).
```json
{ "patientName": "Ramesh Kumar", "customerId": "...", "patientAge": 42,
  "patientGender": "male", "doctorId": "...", "date": "2026-09-20",
  "notes": "1 tab twice daily", "imageFileId": "stored_files.id" }
```
`doctorId`/`customerId` must belong to the caller (404 otherwise) and
`imageFileId` must be one of the caller's files from `POST /api/files` (400
otherwise). Response `201`.

### GET `/api/prescriptions`
- Query: `q` (patient/doctor/notes), `customerId`, `doctorId`, `status`
  (`pending|verified|dispensed|rejected`), `from`, `to`, `page`, `limit`
- Response: `{ success, data, total, pagination: { page, limit } }`

### GET `/api/prescriptions/:id`
Detail plus `invoices[]` — rows in `invoices` whose `prescription_id` matches.

### GET `/api/prescriptions/invoice/:invoiceId`
Prescriptions linked to one invoice (sale-time link or dispense record).

### PUT `/api/prescriptions/:id`
Patch patient/doctor/date/notes/image fields. `status` changes follow the
transition table: `pending→verified|rejected`, `verified→pending|rejected`,
`rejected→verified|pending`. Any other change (including anything leaving
`dispensed`) → **409** `{ error: "Cannot change prescription status from X to Y" }`.

### POST `/api/prescriptions/:id/verify`
`pending|rejected → verified` (already-verified is a no-op). Audited as
`prescription.verify`. Dispensed → **409**.

### POST `/api/prescriptions/:id/reject`
```json
{ "reason": "Blurred image" }
```
Audited as `prescription.reject` (reason stored in `metadata`).

### POST `/api/prescriptions/:id/dispense`
```json
{ "invoiceId": "..." }
```
Requires a `verified` prescription. The invoice must be the caller's and may
already reference this prescription (sale-time link) or be unlinked. Marks both
sides dispensed (`prescriptions.status/dispensed_at/dispensed_invoice_id` and
`invoices.prescription_status`). **409** when already dispensed, when the
prescription is not verified, or when the invoice is linked to a different
prescription. Audited as `prescription.dispense`.

### DELETE `/api/prescriptions/:id`
Soft-delete (`is_active = 0`). **409** for dispensed prescriptions (they are
legal records).

### Prescription enforcement on `POST /api/invoices`
- New optional body fields: `prescriptionId`, `prescriptionOverride`.
- Any line item whose medicine `schedule` is **H, H1 or X** requires a
  `prescriptionId`. Otherwise **400**:
  `{ "success": false, "error": "Prescription required for scheduled drugs (H/H1/X)", "items": ["Medicine Name"] }`
- Escape hatch: `prescriptionOverride: true` **and** caller role in
  `admin|pharmacist` → sale proceeds and is audited as
  `invoice.prescription_override` (cashiers cannot override).
- A supplied `prescriptionId` must be the caller's and `pending|verified`
  (400 `Prescription not verifiable or foreign` otherwise). It is stored on the
  invoice together with a `prescription_status` snapshot and audited as
  `invoice.link_prescription`. Dispensing later flips both sides to `dispensed`.

---

## Payments

### GET `/api/payments`
List payments.
- Query: `type` (received/paid/expense), `from`, `to`

### POST `/api/payments`
Record payment. `paymentMode` accepts `cash`, `card`, `upi`, `credit`, `other`,
`bank_transfer` and `cheque` — everything except `cash` settles through the
`BANK` account, `credit` posts no journal entry. Cash/bank books read the
resulting journal legs (see *Cash & Bank / Reconciliation*), not these rows.
```json
{
  "date": "2026-01-15",
  "type": "received",
  "amount": 500.00,
  "customerId": "...",
  "paymentMode": "cash",
  "description": "Against invoice MB-2026-000001"
}
```

---

## Reports

### GET `/api/reports/sales`
Sales report with date range.
- Query: `from`, `to`, `customerId`

### GET `/api/reports/purchase`
Purchase report.
- Query: `from`, `to`, `supplierId`

### GET `/api/reports/profit`
Profit & loss report.
- Query: `from`, `to`

### GET `/api/reports/inventory`
Inventory report.
- Query: `status` (low/out/expired/near)

### GET `/api/reports/tax`
GST tax report — rate-accurate from invoice line-item `gstRate` snapshots (never hardcoded), with credit-note (sales return) netting.
- Query: `from`, `to`
- Returns: `totalTaxable`, `totalGst`, `totalCgst/Sgst/Igst`, `netTaxable/Gst` (after credit notes), `breakdown` by rate.

### GET `/api/reports/gstr1`
GSTR-1 outward supplies: B2B invoices (with customer GSTIN, Table 4), B2C invoices (Table 7), and credit notes with original-invoice linkage (Table 9B/CDNR).
- Query: `from`, `to`

### GET `/api/reports/gstr3b`
GSTR-3B summary: outward liability by rate (Table 3.1), ITC from purchase bills by rate (Table 4), nil-rated inward, and net payable per head (output − ITC, floored at 0).
- Query: `from`, `to`

### GET `/api/reports/hsn`
HSN-wise summary (GSTR-1 Table 12): sales + purchase lines rolled up by HSN × GST rate with taxable/CGST/SGST totals.
- Query: `from`, `to`

### GET `/api/reports/itc`
ITC ledger: purchase-bill-wise input credit with supplier GSTIN lookup; bills without a supplier GSTIN are flagged `verify-supplier-gstin` for GSTR-2B matching.
- Query: `from`, `to`

---

## Dashboard

### GET `/api/dashboard/kpis`
Dashboard key performance indicators (tenant-scoped by `request.userId`).
- Query: `date` (optional, single day; defaults to today) OR `from` & `to` (inclusive `YYYY-MM-DD` range). When `from`/`to` is present the sales/purchase/collections tiles are range-aggregated; single-day `?date=` is back-compatible.
- Range aliases: `netSales`/`netSalesPrev`/`netSalesChangePct`, `netPurchase`/`netPurchasePrev`/`netPurchaseChangePct`, `grossProfit`/`grossProfitPrev`/`grossProfitChangePct`, `dateRange: {from,to}`, `customers: {total, avgOrderValue, new, repeat}`, `collections.totalIn`/`totalOut` (for the screenshot-aligned grid).

Also returns: `outstandingCredit` (sum of positive customer balances — what customers owe us), `stockValue` (`packs`, `mrpValue`, `saleValue`, `costValue` from active in-stock batches), `collections` (`received`/`paid`/`expenses`, voided rows excluded), and `dues` (top-5 `customers` + `suppliers` by positive balance with totals). All aggregates are tenant-scoped; GST `tax`/`gstr1`/`gstr3b`/`hsn`/`itc` were also tightened to `createdBy`.

### GET `/api/refills/upcoming?days=7`
Pending refill reminders due within N days (overdue included), oldest first, max 25. Used for the dashboard refill strip.

---

## Settings

### GET `/api/settings`
Get all settings.

### GET `/api/settings/:key`
Get specific setting.

### PUT `/api/settings/:key`
Update setting.
```json
{ "value": "..." }
```

### GET `/api/settings/invoice-format`
Get invoice numbering format.

### PUT `/api/settings/invoice-format`
Set invoice numbering format.

---

## Expiry Safety Policy

Install-wide safety controls for expired / near-expiry stock. The policy is stored as JSON under the singleton settings key `expiry_policy` (one policy per install — the `settings` table has a unique `key` and no tenant column).

Policy shape (defaults shown):
```json
{
  "blockExpiredSale": true,
  "blockExpiredPurchase": true,
  "warningDays": 90,
  "blockWithinDays": 0,
  "allowOverrideRoles": ["admin", "pharmacist"]
}
```
- `blockExpiredSale` — `expiryDate < today` → severity `blocked` for sales.
- `blockExpiredPurchase` — incoming batch expiry `< today` → blocked (expired stock is refused).
- `warningDays` — expiry within N days → severity `warning` (never blocks; surfaces as `warnings[]` on invoice/purchase creation).
- `blockWithinDays` — expiry within N days → severity `blocked` (separate from expired; `0` = disabled).
- `allowOverrideRoles` — roles that may lift a `blocked` result with `overrideExpiry` + `overrideReason`. Overrides apply to `blocked` rows only; warnings never block, and an expired row is always `blocked` when its flag is on.

Blocked responses use a stable shape for frontend parsing:
```json
{ "success": false, "error": "Expired/near-expiry batch blocked by policy",
  "blocked": [ { "batchNo": "B1", "expiryDate": "2026-01-01", "daysToExpiry": -268, "severity": "blocked", "reason": "Expired on ..." } ] }
```

### GET `/api/expiry-policy`
Get the effective policy (merged over defaults).

### PUT `/api/expiry-policy`
Update the policy (zod-validated: `warningDays`/`blockWithinDays` 0–3650, roles ⊆ `admin|pharmacist|cashier`).

### POST `/api/expiry-policy/evaluate`
Pre-check one date with the caller's role.
```json
{ "expiryDate": "2026-12-01", "operation": "sale" }
```
`operation`: `sale` | `purchase` | `batch_edit`. Returns `{ allowed, severity, reason, expiryDate, daysToExpiry, requiresOverride }`.

### Policy enforcement points
- `POST /api/invoices` — evaluates the batches FEFO/FIFO will deduct from plus any client-declared line expiry. Optional body fields `overrideExpiry: boolean` + `overrideReason: string` (reason required when overriding); successful overrides write an `invoice.expiry_override` audit event. Success may include `warnings[]`.
- `POST /api/purchases` — evaluates incoming line expiry before writing; same override fields; audit action `purchase.expiry_override`.
- `PUT /api/inventory/batches/:id` — an expiry change is evaluated as `batch_edit` (no override; 400 when blocked).
- Sales returns are intentionally NOT evaluated — returning stock into its original (even expired) batch stays allowed.

---

## Backup

### GET `/api/backup/status`
Get backup health status.

### GET `/api/backup/history`
Get backup history.
- Query: `type`, `limit`

### POST `/api/backup/create`
Create manual backup.
```json
{ "type": "manual" }
```

### POST `/api/backup/restore`
Restore from backup.
```json
{ "filePath": "C:\\ProgramData\\MediBill\\backups\\daily\\2026-01-15\\medibill.db" }
```
**WARNING**: Creates safety backup before restoring.

---

## Outbox (async work queue)

Tenant-scoped durable queue for messaging, provider calls and report jobs. All responses wrap in `{ success, data, error }`. `X-Request-Id` is echoed (or generated) on every response.

### GET `/api/outbox/pending`
Returns up to 100 `pending` events for the authenticated user whose `available_at` has elapsed.

### POST `/api/outbox/:id/ack`
Mark an event as finished or for retry. 404 for other tenants' events.
```json
{ "status": "done" }
```
`status`: `done` | `failed` (increments `attempts`) | `pending` (requeue). Invalid values return 400.

---

## Stock Audits

Physical stock-take workflow (Task 7): open a session, scan batches and record
physical counts, review variances, then approve — which posts `adjustment`
transactions atomically (so approvals show up in
`GET /api/reports/stock/adjustments`). Service:
`apps/server/src/services/stockAudit.ts`; tables `stock_audits` +
`stock_audit_counts` (migration `0007_stock_audits.sql`). Every endpoint is
tenant-scoped — foreign ids return 404 (400 for a foreign batch on a count).
Approve/cancel require the `admin` or `pharmacist` role (cashier → 403).

Semantics: `expected_quantity` is frozen at `batches.quantity` when a batch is
**first** counted; repeats update `counted_quantity`/`recount`/`counted_at` on
the same row (`UNIQUE(audit_id, batch_id)`). Variance per row =
`counted_quantity - expected_quantity`. Approval computes, per count row,
`delta = counted - expected`, sets `newQty = MAX(0, currentQty + delta)` and
writes `{ type: "adjustment", quantity: delta, balanceAfter: newQty, reason:
"Stock audit <id>" }` only when `delta !== 0`. Batches created after the
session opened but never counted are **not** part of the variance. Counts are
immutable once the audit is approved or cancelled (409).

### POST `/api/stock-audits`
Start an open session.
```json
{ "note": "Month-end count — shelf A to D" }
```
Response `201` — `{ id, status: "open", note, startedAt, ... }`.

### GET `/api/stock-audits`
List sessions with a per-audit counts summary.
- Query: `status` (`open|approved|cancelled`), `page`, `limit`
- Response: `{ success, data, total, pagination }` where each row carries
  `summary: { totalRows, counted, varianceRows, totalVarianceValue }` —
  `totalRows` = active batches in inventory (progress denominator, e.g. "12/40"),
  `counted` = batches counted in this session, `varianceRows` = rows with a
  non-zero variance, `totalVarianceValue` = signed Σ(delta × batch purchase price).

### GET `/api/stock-audits/:id`
Detail — `{ audit, rows, uncounted, summary }`. `rows` join medicine
name/brand, batch no/expiry, frozen `expectedQuantity`, `countedQuantity`,
`variance` and the **live** `currentBatchQuantity`; `uncounted` lists active
batches not yet counted (excluded from variance).

### POST `/api/stock-audits/:id/counts`
Upsert a count (open sessions only, otherwise 409).
```json
{ "medicineId": "...", "batchId": "...", "countedQuantity": 8 }
```
First insert freezes `expectedQuantity` at the current batch quantity and
returns `created: true`; a repeat for the same batch updates the same row
(`created: false`). Foreign batch or `medicineId` mismatch → 400;
`countedQuantity < 0` → 400.

### PUT `/api/stock-audits/counts/:countId`
Alternative to the session upsert — updates `countedQuantity`/`recount`/
`countedAt` on one count row (409 after approval/cancellation).

### POST `/api/stock-audits/:id/approve`
Approve the session and post adjustments in one transaction. Requires a
reason; admin/pharmacist only (403), already-approved/non-open → 409.
```json
{ "reason": "September month-end physical count reviewed" }
```
Response: `{ audit, adjustments: [{ batchId, medicineId, delta, previousQuantity, newQuantity }] }`.
Audited as `stock_audit.approve` with metadata
`{ auditId, adjustments, deltas, reason }`.

### POST `/api/stock-audits/:id/cancel`
Close an open session without touching stock; counts are kept for history.
```json
{ "reason": "Counted on the wrong day" }
```
`reason` optional. Non-open session → 409; cashier → 403.

---

## Barcode Labels

Shelf-label generation (Task 8): the server prepares label **data**, the browser
renders the barcode (JsBarcode → SVG) and prints via the browser's print dialog —
there is no proprietary printer SDK and nothing is persisted (no table, no
migration). Service: `apps/server/src/services/labels.ts`; UI:
`src/pages/LabelsPage.tsx` + `src/components/labels/LabelPreview.tsx`; print CSS
`.label-sheet` in `src/index.css` (extends the `.stock-audit-print` approach: the
global `@media print` rule hides `body *`, the sheet opts itself back in and is
anchored to the page origin).

Built-in templates (each fits the printable A4 area — 180 × 273 mm after the
app-wide `@page` margin — with 2 mm gutters):

| id | label size | grid | labels/sheet |
|---|---|---|---|
| `40x25mm` | 40 × 25 mm | 4 × 10 | 40 |
| `50x30mm` | 50 × 30 mm | 3 × 8 | 24 |
| `A4-24` | 58 × 32 mm | 3 × 8 | 24 |

Per label: `barcode` (string or `null`), `needsBarcode` (true when the medicine
has no stored barcode — the client then prints a name-only label instead of
inventing an EAN), `name` (truncated to 28 chars), `fullName`, `brand`, `pack`
(`packSize` or `unitsPerPack + unit`), `batchNo`, `expiry` (`MM/YY`,
e.g. `2027-12-31` → `12/27`), `mrp` (batch MRP when a batch is included,
otherwise the medicine MRP) and `storeName` (settings key `store_name`).

### GET `/api/labels/templates`
The template list: `[{ id, widthMm, heightMm, cols, rows, perSheet }]`.

### POST `/api/labels/preview`
Build print-ready label data (pure read — nothing is written).
```json
{
  "items": [
    { "medicineId": "...", "batchId": "…optional…", "quantity": 12, "template": "40x25mm" }
  ],
  "includeBatch": true
}
```
- `quantity` — integer 1–500 per item (400 outside that range or non-integer).
- `template` — one of the ids above; unknown id → 400, and **all items in one
  request must share the same template** (the response carries a single
  `template`).
- `includeBatch` — default `true`; `false` makes labels batch-agnostic (no
  `batchNo`/`expiry`, medicine MRP used).
- Response: `{ template, labels: [...], totalLabels }` where `totalLabels` is
  the sum of the item quantities and `labels` has one entry per label.
- Ownership: foreign `medicineId` → 404, foreign `batchId` → 404, a batch that
  belongs to a different medicine → 400.

Printing is browser-only (`window.print()` from the Labels page) — labels are
laid out at true mm sizes and the `.label-sheet` print CSS isolates the sheet.

---

## Messaging & Sharing

Outbound WhatsApp/SMS/email (Task 9). Service: `apps/server/src/services/messaging.ts`,
providers in `apps/server/src/providers/`, tables `message_deliveries` +
`communication_preferences` (migration `0008_messaging.sql`). Every endpoint is
tenant-scoped (foreign ids → 404) and wraps responses in `{ success, data, error }`.

### Environment variables (server `.env` only — never stored in settings, never returned by the API)

| Channel | Required env | Optional env |
|---------|--------------|--------------|
| `whatsapp` | `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (WhatsApp Cloud API) | — |
| `sms` | `SMS_WEBHOOK_URL` (generic POST `{ to, text, sender }`) | `SMS_API_KEY`, `SMS_SENDER` |
| `email` | `EMAIL_WEBHOOK_URL` (generic POST `{ to, subject, body }`) | — |

Unconfigured channels fail fast with `"<Channel> provider not configured — set <ENV>"`
(a permanent failure — no network call is attempted).

### Templates

Built-ins (settings key `message_templates`, a JSON object of
`{ "<template>": "<body override>" }`, merges over the defaults):
- `invoice_share` → `Hi {customerName}! Invoice {invoiceNo} (₹{amount}) from {storeName}. {invoiceUrl} — thank you!`
- `refill_reminder` → `Hi {customerName}, it's time to refill {medicineName}. Reply or visit us for the next pack.`
- `payment_due` → `Hi {customerName}, ₹{amount} is due on your account at {storeName}.`
- `custom` → uses `variables.body` verbatim.

`{tokens}` are replaced at send time; a missing token renders as an empty string
(never throws). `{storeName}` defaults from the `store_name` setting.

**Overrides UI + merge semantics.** Communications → **Templates** tab edits
one template at a time: it shows the effective body (`override ?? default`), a
"Reset to default" action and the tokens available for that template.
`PUT /api/settings/message_templates` accepts a PARTIAL object and **merges**
it into the stored JSON — saving `{ invoice_share: "…" }` never touches
`payment_due`, and `{ invoice_share: null }` (or `""`) deletes that override
so the built-in default takes over again.

### Consent rules

- `communication_preferences (created_by, customer_id, channel, opted_out)` is
  checked at queue time. Opted-out customers get an `opted_out` delivery row and
  **no** outbox event — nothing is ever sent, and `POST /:id/retry` refuses (400).
- Missing phone/email → the row is skipped (`skipped_nophone`) rather than queued.
- Preferences are upserted select-then-update (SQLite's UNIQUE treats NULL
  `customer_id` as distinct).

### Outbox retry semantics

`queueMessage` inserts a delivery + enqueues a `message.send` outbox event
(idempotency key `msg:<deliveryId>`, or an explicit caller key — replaying the
same key returns the original delivery instead of duplicating). A system-level
worker (`messagingWorker`, every 2 minutes, started from `index.ts`, no-op under
Vitest) drains pending events globally:
1. Claim: event → `processing`, `attempts + 1`.
2. Success → delivery `sent` (+ `provider_id`), event acked `done`.
3. `NotConfiguredError` → delivery `failed` (permanent), event acked `done`.
4. Transient error → delivery back to `queued` with `attempts + 1`; the current
   event is acked `failed` (terminal for that event) and a **new** event is
   enqueued with `availableAt = now + min(2^attempts, 60) minutes` and key
   `msg-retry:<deliveryId>:<attempt>`. After 5 attempts the delivery fails
   permanently (event acked `done`).
5. After a confirmed send of an `aggregate_type = "refill"` delivery, the linked
   `refill_reminders` row is reconciled to `status = "sent"` + `sentAt`.

Settings key `refill_automation` (`{ "mode": "off" | "queue" }`, default `off`)
additionally gates a cron scan of due refill reminders (queued with idempotency
key `refill:<reminderId>`); the explicit bulk endpoint works regardless.

### POST `/api/messages/send`
```json
{ "channel": "whatsapp", "recipient": "+91…", "customerId": "…optional…",
  "template": "invoice_share", "variables": { },
  "aggregateType": "invoice", "aggregateId": "…", "idempotencyKey": "…optional…" }
```
`recipient` resolves from `customerId → customers.phone` when omitted; 400 when
neither yields a destination. Response `201` — the delivery row.

### GET `/api/messages`
History — query: `aggregateType`, `aggregateId`, `channel`, `status`, `from`, `to`
(ISO dates; `to` is inclusive end-of-day when date-only), `page`, `limit`.
Response: `{ data, total, pagination }`.

### GET `/api/messages/providers`
Provider health: `{ "whatsapp": false, "sms": false, "email": false }` — env
presence booleans only, never values.

### GET `/api/messages/preferences` / PUT `/api/messages/preferences`
List consent rows (joined customer name/phone) / upsert one:
```json
{ "customerId": "…", "channel": "whatsapp", "optedOut": true }
```
404 when the customer belongs to another tenant.

### GET `/api/messages/templates`
The template ids: `["invoice_share", "refill_reminder", "payment_due", "custom"]`.

### POST `/api/messages/:id/retry`
Re-queue a **failed** delivery with a fresh outbox event (400 for `opted_out`,
`queued` or `sent`; 404 for foreign deliveries).

### POST `/api/invoices/:id/share`
```json
{ "channels": ["whatsapp", "sms", "email"], "customerId": "…optional…" }
```
Queues one `invoice_share` delivery per channel (recipient: customer email for
`email`, customer phone → invoice `customerPhone` for whatsapp/sms). Invoice
ownership is enforced (404); no destination for any channel → 400. Response:
`{ deliveries: [...], skipped: [{ channel, reason }] }`. `invoiceUrl` is built
from the `app_base_url` setting (default `http://localhost:5173`).

### POST `/api/refills/:id/send`
```json
{ "channel": "whatsapp" }
```
Queues one `refill_reminder` for a reviewed row (400 without a phone). The
reminder is **not** marked sent — that happens only when the delivery sends.

### POST `/api/refills/send-due`
```json
{ "channel": "whatsapp" }
```
Bulk-queues every due row (`status = pending`, `reminderDate <= today`).
Response: `{ queued, already_queued, skipped_optout, skipped_nophone, deliveryIds }`.
Setting `refill_automation.mode = "queue"` only gates the cron; this endpoint
always works.

---

## Customer Growth (Insights/Loyalty/Offers/Campaigns)

Customer analytics, points ledger, discounts and audience blasts (Task 10).
Service: `apps/server/src/services/customerEngagement.ts`, tables
`loyalty_ledger` + `offers` + `campaigns` (migration `0009_customer_growth.sql`,
settings key `loyalty`). Every endpoint lives under
`/api/customer-engagement`, is tenant-scoped (foreign customer/offer/campaign →
404) and wraps responses in `{ success, data, error }`.

### Insights (RFM, churn, refills)

**GET `/api/customer-engagement/insights/:customerId`**
```json
{ "customer": { "id", "name", "phone", "email" },
  "rfm": { "recencyDays", "frequency", "monetary", "rScore", "fScore", "mScore", "rfmScore" },
  "ltv": 1234.5, "invoiceCount": 7,
  "avgIntervalDays": 35, "churnRisk": "low", "daysIdle": 30, "lastPurchaseAt": "YYYY-MM-DD",
  "frequentMedicines": [{ "medicineId", "name", "brand", "qty", "lastBought", "avgGapDays", "dueDate" }],
  "refillCandidates": [ ... ], "balance": 0 }
```
- Invoices counted: `status != cancelled`, not on hold.
- `avgIntervalDays` = **median** of the gaps between consecutive invoices
  (null with fewer than 2 invoices).
- `frequentMedicines`: invoice items joined to invoices, last 180 days, ranked
  by quantity (top 10); `avgGapDays` is the median gap between repeat purchases
  of the same medicine.
- `refillCandidates`: frequent medicines whose `dueDate = lastBought + avgGap`
  falls within the next 7 days.
- `churnRisk`: `high` when `daysIdle > 2 × avgInterval`, `medium` when
  `> 1.5 × avgInterval` or idle > 90 days, otherwise `low`;
  `unknown` when the customer has no invoices.
- RFM mirrors the party report algorithm (`reports.ts buildPartyCustomers`):
  R/F/M each normalized 1–5 across the tenant's customers,
  `rfmScore = R + F + M` (0 when the customer has no purchase history).

### Loyalty (immutable ledger)

The balance is always `SUM(points)` — there is no balance column to edit.
Settings key `loyalty` = `{ enabled, pointsPer100Rupee, rupeePerPoint }`
(**disabled by default**; only *earning* is gated by `enabled`).

**GET `/api/customer-engagement/loyalty?customerId=…`** →
`{ customerId, balance, entries }` — entries newest first.

**POST `/api/customer-engagement/loyalty/earn`** / **`…/loyalty/redeem`**
```json
{ "customerId": "…", "points": 10, "reason": "…optional…",
  "invoiceId": "…optional…", "idempotencyKey": "…optional…" }
```
`201` with the ledger row (`points` negative on redeem). Replaying an
`idempotencyKey` returns the original row; redeeming more than the balance →
`400 insufficient balance`; foreign customer → 404.

### Offers

- **GET `/api/customer-engagement/offers?activeOnly=1&q=…`** → list (newest first).
- **POST `/api/customer-engagement/offers`**
  ```json
  { "name": "Festive ₹50 off", "type": "fixed", "value": 50,
    "medicineId": "…optional — NULL = whole bill…", "minAmount": 0,
    "startsOn": "YYYY-MM-DD", "endsOn": "YYYY-MM-DD", "isActive": true }
  ```
  `endsOn < startsOn` → 400.
- **PUT `/api/customer-engagement/offers/:id`** — partial update, including
  `{ "isActive": false }` to deactivate (offers are never hard-deleted;
  `POST /offers/:id/deactivate` does the same).
- **POST `/api/customer-engagement/offers/:id/evaluate`**
  ```json
  { "subtotal": 90.7, "medicineIds": ["…"] }
  ```
  → `{ applies, discount, reason }`. Checks in order: active flag → inclusive
  date window (`startsOn <= today <= endsOn`) → `min_amount` → medicine
  membership (medicine-specific offers); `fixed` discounts clamp to the
  subtotal, `percent` computes `subtotal × value / 100` clamped to the subtotal.
  404 for foreign offers.

### Campaigns

Audience JSON (`audience` column) — one of:
```json
{ "type": "all" }
{ "type": "rfm", "minScore": 9 }
{ "type": "medicine", "medicineId": "…", "withinDays": 30 }
{ "type": "balance", "minAmount": 500 }
{ "type": "refill", "withinDays": 7 }
```

- **GET `/api/customer-engagement/campaigns`** → list (newest first).
- **POST `/api/customer-engagement/campaigns`**
  ```json
  { "name": "Monsoon tips", "channel": "whatsapp", "template": "custom",
    "body": "Hi {customerName} … {storeName} …", "audience": { "type": "all" },
    "scheduleAt": "ISO datetime or null" }
  ```
  Creates a `draft`.
- **GET `/api/customer-engagement/campaigns/:id`** → one campaign (404 foreign).
- **POST `/api/customer-engagement/campaigns/:id/send`** — resolves the
  audience, then queues one `custom` message per recipient through the Task 9
  outbox (idempotency key `camp:<campaignId>:<customerId>` — a double send
  replays, never duplicates). Opted-out customers on the campaign channel and
  customers without a reachable contact (phone for whatsapp/sms, email for
  email) are skipped **and counted**. A future `scheduleAt` becomes the outbox
  `availableAt` and leaves the campaign `scheduled`; immediate sends finish
  `done`. Response + persisted `stats`:
  ```json
  { "id", "status", "audience", "queued", "skippedOptOut", "skippedNoContact" }
  ```
- **POST `/api/customer-engagement/campaigns/:id/cancel`** — `draft` or
  `scheduled` → `cancelled` (400 for `done`/`cancelled`).

### Invoice integration (POST `/api/invoices`)

Two optional fields fold into the bill-level `discountAmount`:
```json
{ "offerId": "…optional…", "loyaltyRedeemPoints": 0 }
```
- `offerId` is evaluated server-side against the computed pre-GST subtotal
  **before** any bill-level discount; a non-applicable offer fails the sale with
  `400 { error: <reason> }` and writes nothing. Applied offers record audit
  event `invoice.offer_applied { offerId, discount }`.
- `loyaltyRedeemPoints` requires a customer on the bill and is validated against
  `SUM(points)` **before** the sale transaction; the negative ledger row
  (idempotency key `redeem:<invoiceId>`) and any earned points
  (`sale:<invoiceId>`, when `loyalty.enabled`) are written **after commit** —
  documented eventual consistency: a post-commit ledger failure logs +
  audits `loyalty.post_failed` and never rolls back a completed sale.
- Combined discount is clamped to the bill (subtotal + GST) whenever an
  offer/loyalty discount is present; without them legacy totals are untouched.

---

## Accounting

Double-entry ledger (Task 11). Service `apps/server/src/services/accounting.ts`,
tables `accounts` + `journal_entries` + `journal_lines` + `accounting_periods`
(migration `0010_accounting.sql`). Every endpoint lives under
`/api/accounting`, is tenant-scoped and wraps responses in
`{ success, data, error }`. Amounts are rupees rounded to 2 decimals; a manual
entry must balance within ₹0.01 and every line must carry exactly one of
debit/credit.

**Default chart** (seeded lazily by `ensureChart` before every export/post):
`CASH`, `BANK`, `AR`, `AP`, `INVENTORY`, `SALES`, `PURCHASES`, `SALES_RETURNS`,
`PURCHASE_RETURNS`, `GST_OUTPUT`, `GST_INPUT`, `DISCOUNT`, `EXPENSE`, `CAPITAL`.

### Endpoints

- **GET `/api/accounting/accounts`** → the tenant's chart (system + manual),
  ordered by code.
- **POST `/api/accounting/accounts`**
  ```json
  { "code": "PETTY", "name": "Petty Cash", "type": "asset" }
  ```
  Creates a manual account (`is_system = 0`, code upper-cased); duplicate code
  (including a system code such as `CASH`) → `409 Account code already exists`.
- **POST `/api/accounting/post`** *(admin | pharmacist — cashier → 403)*
  ```json
  { "date": "YYYY-MM-DD", "description": "optional",
    "lines": [ { "code": "CASH", "debit": 500, "partyType": "customer",
                 "partyId": "…optional…", "memo": "…optional…" },
               { "code": "CAPITAL", "credit": 500 } ] }
  ```
  Manual entry (`source_type = "manual"`). `400` for unknown code
  (`Unknown account code: X`), both/zero-sided lines, negative amounts,
  `Journal entry not balanced`, or a date inside a closed period
  (`Period closed`).
- **GET `/api/accounting/trial-balance?from&to`** →
  `{ from, to, rows: [{ accountId, code, name, type, debit, credit, balance,
  openingDebit, openingCredit, closing }], totals: { totalDebit, totalCredit,
  totalOpeningDebit, totalOpeningCredit, totalClosingDebit, totalClosingCredit,
  netIncome } }`. `balance` is signed by nature **over the range** (asset/expense
  → debit−credit; income/liability/equity → credit−debit) — unchanged for
  backward compatibility. The additive carry-forward columns:
  `openingDebit`/`openingCredit` = one-sided opening from **all** entries dated
  before `from` (signed by account nature), `closing` = signed-by-nature
  opening + movement (positive = the account's natural side), and the matching
  totals. Ranges without `from` start from zero opening. P&L / balance sheet
  rows are unchanged (they never carry these keys).
- **POST `/api/accounting/opening`** *(admin | pharmacist — cashier → 403)*
  ```json
  { "date": "YYYY-MM-DD", "description": "optional",
    "lines": [ { "code": "INVENTORY", "debit": 1000 },
               { "code": "CAPITAL", "credit": 1000 } ] }
  ```
  Guarded opening-balance batch: posts `source_type = "opening"` with
  `source_id = opening:<date>`, so **one batch per tenant per date** — a repeat
  for the same date → `400 Opening balances already posted for <date>` (the
  source key also makes the raw post idempotent). A date inside a closed period
  → `400 Period closed`; unbalanced/unknown-code/negative lines reuse the
  standard manual-post validation (`201`, `alreadyPosted` → `200`).
- **GET `/api/accounting/opening/suggest`** → `{ lines: [{ code, debit,
  credit }] }` prefilled from the tenant's current state:
  `INVENTORY` = Σ batches `purchasePrice × quantity`, `AR` = Σ customer
  balances > 0, `AP` = Σ supplier balances > 0, `CASH` = 0 (cannot be inferred
  — the UI leaves it editable) and `CAPITAL` = balancing figure
  `(INVENTORY + AR + CASH − AP)` so the suggestion is balanced as returned.
  Every row is one-sided (exactly one of debit/credit set); zero-amount rows
  are still returned for display and are filtered before posting.
- **GET `/api/accounting/profit-loss?from&to`** →
  `{ income[], expense[], incomeTotal, expenseTotal, net }`
  (`net = income − expense`).
- **GET `/api/accounting/balance-sheet?asOf=YYYY-MM-DD`** (`asOf` required) →
  `{ assets[], liabilities[], equity[],
  totals: { assets, liabilities, equity, retainedEarnings, imbalance } }`.
  `retainedEarnings` = cumulative income − expenses up to `asOf` ("Current
  Earnings"); with balanced entries `assets = liabilities + equity +
  retainedEarnings` (`imbalance ≈ 0`).
- **GET `/api/accounting/day-book?from&to&page&limit`** →
  `{ entries: [{ id, date, sourceType, sourceId, description, isReversal,
  reversedBy, lines: [{ code, name, debit, credit, partyType, partyId, memo }] }],
  total, page, limit }`, newest date first.
- **GET `/api/accounting/entries?sourceType&sourceId`** → every entry posted
  for a business source (trace; `sourceId` optional). **GET
  `/api/accounting/entries/:id`** → one entry with lines (404 foreign).
- **POST `/api/accounting/entries/:id/reverse`** *(admin | pharmacist)*
  `{ "reason": "…" }` → mirrors the entry's lines (debit ↔ credit) as a new
  `reversal` entry and stamps `reversed_by` on the original. Idempotent — a
  second call returns `{ alreadyReversed: true }`; reversal entries and
  source-less (manual) entries cannot be reversed (`400`).
- **POST `/api/accounting/periods/close`** *(admin | pharmacist)*
  `{ "fromDate", "toDate" }` → `201`; duplicate range → `409`; audit
  `accounting.period_closed`.
- **POST `/api/accounting/periods/:id/reopen`** *(admin | pharmacist)* →
  deletes the lock (audit `accounting.period_reopened`); **GET
  `/api/accounting/periods`** → the tenant's closed ranges.

### Automatic posting rules per flow

Postings are idempotent per source (`UNIQUE(created_by, source_type,
source_id)`) and **best-effort**: a ledger failure is logged, audited as
`accounting.post_failed` and never blocks the business flow.

- **Invoice create** (`source_type = "invoice"`, posted inside the sale
  transaction): the debit side is split by what was actually collected —
  Dr `CASH` (cash) | `BANK` (card/upi/other/bank_transfer) `amountPaid` (only
  when > 0) **plus** Dr `AR` (party = customer) `grandTotal − amountPaid` (only
  when a remainder > 0; credit mode always bills the full `grandTotal` to `AR`);
  Cr `SALES` (`grandTotal − totalGst`); Cr `GST_OUTPUT` `totalGst` (zero legs
  omitted). So a cash sale with `amountPaid = 0` posts entirely to `AR` —
  partial cash/card sales never overstate cash. Invoice-created receipt rows
  are written directly inside the sale transaction and are deliberately **not**
  journal-posted (`payment` entries only come from `POST /api/payments`), so
  there is no double-count between the sale's cash leg and the payments route.
- **Invoice cancel/delete**: reverses every posted `payment` settlement entry
  of this invoice FIRST (audit `{ invoiceNo, kind: "settlement" }`), then the
  invoice entry (`{ invoiceNo, kind: "invoice" }`) — both dated today, both
  idempotent, no-op when never posted. The refund payout row stays unposted:
  its cash effect is already modeled by those reversals (documented netting).
- **Purchase create** (`source_type = "purchase"`): Dr `INVENTORY`
  (`grandTotal − totalGst`); Dr `GST_INPUT` `totalGst`; Cr `AP` (credit mode,
  party = supplier) | `CASH` | `BANK` `grandTotal`.
- **Payment record** (`source_type = "payment"`): `received` → Dr `CASH|BANK`
  / Cr `AR` (party = customer; requires a resolvable `customerId` or
  invoice→customer — otherwise skipped + audit `accounting.skipped_no_party`);
  `paid` → Dr `AP` (party = supplier) or Dr `EXPENSE` (no supplier; memo =
  category) / Cr `CASH|BANK`; `expense` → Dr `EXPENSE` (memo = category) /
  Cr `CASH|BANK`. Credit-mode payments skip posting entirely (audit
  `accounting.skipped_credit_mode`). Deleting a payment reverses its entry.
- **Sales return** (`source_type = "sales_return"`): GST share =
  `round(refundAmount × totalGst / grandTotal, 2)`, taxable =
  `refundAmount − GST share`; Dr `SALES_RETURNS` taxable + Dr `GST_OUTPUT`
  share / Cr `CASH|BANK` (`refundMode: "credit"` → `AR`) `refundAmount`.
- **Purchase return** (`source_type = "purchase_return"`, posted inside the
  create transaction): GST share = `round(refundAmount × totalGst / grandTotal,
  2)`, taxable = `refundAmount − GST share`; Dr `AP` (refundMode `"credit"`,
  party = supplier) | `CASH`/`BANK` `refundAmount` + Cr `PURCHASE_RETURNS`
  taxable + Cr `GST_INPUT` share.

UI: `/dashboard/accounting` (AccountingPage — Trial Balance (Opening /
Movement / Closing columns + CSV), P&L, Balance Sheet, Day Book, Journals,
Opening (suggest + post, role-gated) and Periods tabs with CSV export).

---

## Cash & Bank / Reconciliation

Cash Book, Bank Book and bank-statement reconciliation (Task 12). Service
`apps/server/src/services/reconciliation.ts`, tables `bank_statement_rows` +
`reconciliation_matches` (migration `0011_reconciliation.sql`), routes under
`/api/reconciliation` with the same `{ success, data, error }` envelope as the
accounting routes.

**Decision — the books are built from the journal, not from payments.**
`GET /cash` and `GET /bank` aggregate `journal_lines` posted on the `CASH` /
`BANK` accounts (join `journal_entries` for date/source, grouped per line with
the entry's counterpart legs as `accountParties`). Because the books and the
trial balance read the same rows, the books always balance with the trial
balance; the `payments` table stays a business-event log and the Payments UI
is unchanged. Cash/bank books never write to the journal.

**Decision — reconciliation status is bank-only.** A cash row cannot be
reconciled against a bank statement, so the Cash tab is view/export only:
statement rows, matches, `suggest`, `match`/`unmatch` and the `status` counts
all scope to the `BANK` account. Closing/`opening` math:
`opening` = Σ(debit − credit) of lines dated **before** `from` (0 without
`from`), `closing` = `opening + inflow − outflow`.

**Decision — match rules.** One statement row ↔ one journal line, both unique
per tenant (`UNIQUE(created_by, bank_row_id)` and
`UNIQUE(created_by, journal_line_id)`). Amounts must agree within ₹0.01 on an
absolute basis, unless `force: true` (which requires `notes`). Matching is
append-only bookkeeping: `unmatch` deletes the link and **never** mutates the
journal, so books stay equal to the trial balance.

**Roles:** reading (books, rows, suggest, status) is open to every role;
`POST /import`, `POST /match` and `POST /unmatch` are **admin | pharmacist**
only — cashiers get `403 Insufficient permissions` (read-only). Because every
match is admin|pharmacist, `force` is too.

### Endpoints

- **GET `/api/reconciliation/cash?from&to`** / **GET
  `/api/reconciliation/bank?from&to`** →
  `{ book: "cash"|"bank", from, to, opening, inflow, outflow, closing,
  rows: [{ lineId, entryId, date, sourceType, sourceId, description,
  accountParties: [{ code, partyType, partyId, memo }], debit, credit,
  runningBalance }], summary: { rowCount, inCount, outCount, net } }`,
  ordered by date ascending; `runningBalance` starts at `opening`.
- **POST `/api/reconciliation/import`** *(admin | pharmacist)*
  `{ "csv": "…" }` → `201 { imported, duplicates,
  skipped: [{ line, reason }] }`. Columns are detected from a header row
  (`date`, `reference`, `description`, `amount`, `debit`/`credit`, `direction`
  plus common aliases such as `narration`, `withdrawal`, `deposit`, `utr`);
  without a header the parser falls back to positional
  `date,reference,description,amount`. Dates accept `YYYY-MM-DD`,
  `DD/MM/YYYY`, `DD-MM-YYYY` and `DD/MM/YY`; `amount = credit − debit` when
  either money column is present, else the signed amount column, and an
  explicit `direction` column (`in`/`out`/`dr`/`cr`/…) forces the sign. The
  header line, unparseable dates (`Invalid date "…"`), unparseable amounts
  (`Invalid amount "…"`) and zero-value rows are reported in `skipped`. Rows
  are de-duplicated per tenant with `sha256(date|reference|description|
  amount)` against `UNIQUE(created_by, sha256)` — re-importing a file returns
  `duplicates = n, imported = 0`.
- **GET `/api/reconciliation/rows?from&to&unreconciledOnly&q`** → statement
  rows (date-ascending) with `matched: boolean` and
  `match: { id, journalLineId, matchedAt, matchedBy, notes } | null`;
  `q` searches reference/description, `unreconciledOnly=true` hides matched
  rows.
- **GET `/api/reconciliation/suggest?bankRowId=`** → `404 Statement row
  not found` for foreign/unknown ids, else
  `{ rowId, statementDate, amount, candidates: [{ journalLineId, date,
  description, sourceType, lineAmount, confidence }] }` — top 5 BANK lines
  dated within ±5 days of the statement row with the same absolute amount
  (± ₹0.01) and the same sign (an outflow never suggests a debit line).
  Already-matched lines are excluded. `confidence` = `0.9` for an exact
  amount + same direction, `0.6` otherwise (tolerance-only hits).
- **POST `/api/reconciliation/match`** *(admin | pharmacist)*
  `{ "bankRowId", "journalLineId", "notes?", "force?" }` → `200` with the
  match row. Errors: `404 Statement row not found` / `404 Journal line
  not found` (either side foreign), `409 Statement row already matched` /
  `409 Journal line already matched`, `400 Amount mismatch` (differs by more
  than ₹0.01 without `force`), `400 Force match requires notes`. Audit
  `reconciliation.match`.
- **POST `/api/reconciliation/unmatch`** *(admin | pharmacist)*
  `{ "matchId" }` → `200 { id, bankRowId, journalLineId, unmatch: true }`,
  `404 Match not found` for foreign ids; audit `reconciliation.unmatch`. The
  journal line itself is never modified, so a rematch is always possible.
- **GET `/api/reconciliation/status?from&to`** → bank-only status
  `{ from, to, totals: { statementRows, matched, unmatchedRows,
  unmatchedJournalLines }, unmatchedRows: [statement row views],
  unmatchedJournalLines: [{ journalLineId, date, sourceType, description,
  memo, lineAmount }] }`. `unmatchedJournalLines` = BANK lines in range with
  no match (matched lines are excluded tenant-wide).

UI: `/dashboard/cash-bank` (CashBankPage — Cash Book / Bank Book tabs, date
range, totals cards, CSV export; the Bank tab adds statement import, status
cards, statement-row table, match dialog with suggestions/manual picker/force
toggle, unreconciled-only filter and search). A "Cash & Bank" shortcut sits
in the Payments header.

---

## Compliance (E-Invoice / E-Way)

E-invoice (IRN) and e-way bill submission to a GST provider (Task 13). Service
`apps/server/src/services/compliance.ts`, provider adapters in
`apps/server/src/providers/gst.ts`, table `compliance_submissions` (migration
`0012_compliance.sql`), routes under `/api/compliance` with the usual
`{ success, data, error }` envelope.

**Decision — submission is synchronous, no outbox.** `POST .../generate` blocks
the HTTP request until the provider answers. This is deliberate: generation is
idempotent per invoice (`UNIQUE(created_by, invoice_id, kind)` = one live row
per invoice per kind), a rejected/cancelled row is retried by re-generating
(the same row is updated in place, never duplicated), and the row is persisted
as `pending` **before** the provider call so a crash is always traceable.
Retries are "re-generate on rejected" rather than an async worker.

**Decision — strict B2B.** A customer GSTIN is required (B2C e-invoice without
`buyerDtls.gstin` is out of scope → stable 400 `Customer GSTIN required for
e-invoice`), as is the store GSTIN (`Set store GSTIN in Settings →
Taxation`, settings key `store_gstin`) and an HSN code on every line (missing
lines are listed by name). Invoice date is sent as `DD-MM-YYYY`, `Pos`/`Std`
are the GSTIN's leading 2-digit state code, and `request_hash` is
`sha256(JSON.stringify(payload))`.

**Decision — 24h cancellation window is a hard local constant**
(`CANCEL_WINDOW_MS = 24h`, not configurable) checked against `submitted_at`
**before** any provider call, so an expired cancel never reaches the network
(`400 Cancellation window exceeded (24h)`).

**Providers — FAKE ONLY (removed by decision: no live NIC e-invoice).** This
build never submits to the GSTN portal. `providers/gst.ts` exposes a single
adapter, `fakeGstProvider`, and `getGstProvider()` returns it on every call —
there is no `EINVOICE_PROVIDER` switch, no `EINVOICE_*`/`EWAY_*` env vars and
no settings-backed credential path. The fake provider needs **zero**
configuration: it issues `FAKE…` IRNs (NOT government-issued), `ACK…` ack
numbers, base64 QR data, unconditional cancels and `EWB…` e-way bills valid
for 24h — so the whole workflow is exercisable out of the box. Because the
fake provider cannot fail for lack of credentials, there is no
`503 E-invoice provider not configured` path anywhere: the only provider
failure mode is a rejection → `422`.

**Roles:** reading (status, providers, submissions) is open to every role;
`POST .../generate`, `POST .../cancel` and `POST .../eway` are **admin |
pharmacist** only — cashiers get `403 Insufficient permissions`.

### Payload fields (documented, simplified IRN-ready structure)

```json
{
  "version": "1.1",
  "TranDtls": { "TaxSch": "GST", "SupTyp": "B2B" },
  "DocDtls": { "Typ": "INV", "No": "<invoiceNo>", "Dt": "DD-MM-YYYY" },
  "SellerDtls": { "Gstin": "<store_gstin>", "LglNm": "<store name>", "Std": "27" },
  "BuyerDtls": { "Gstin": "<customerGstin>", "LglNm": "<customer>", "Pos": "27" },
  "ItemList": [{ "SlNo", "PrdDesc", "HsnCd", "Qty", "UnitPrice", "TotAmt",
                 "AssAmt", "GstRt", "CgstAmt", "SgstAmt", "IgstAmt", "TotItemVal" }],
  "ValDtls": { "AssVal", "CgstVal", "SgstVal", "IgstVal", "TotInvVal" }
}
```

`AssAmt = line amount − line gstAmount`, `TotInvVal = grandTotal`. E-way
payload is `{ Irn, Distance, TransName?, VehNo? }` with transporter GSTIN,
distance, vehicle and reason kept on the row's `vehicle_json`.

### Endpoints

- **GET `/api/compliance/invoices/:invoiceId`** → `{ invoiceId, invoiceNo,
  state: "none"|"pending"|"accepted"|"rejected"|"cancelled", submission,
  ewaybill, payloadReady: { ok, issues[] } }`. Validation runs in
  **validate-only** mode (issues are collected, never thrown) so the UI can
  preflight; only a foreign/unknown invoice returns `404 Invoice not found`.
- **POST `/api/compliance/invoices/:invoiceId/generate`** *(admin |
  pharmacist)* → `201` (new row) / `200` (re-generated after rejection or
  cancellation) with the submission row. Errors: `400` validation (cancelled
  invoice, missing customer GSTIN, missing store GSTIN, missing HSN — item
  names listed, invalid GST rate), `404` foreign invoice, `409 E-invoice
  already generated`, `422 <provider message>` (row → `rejected` + error
  recorded). Audit `compliance.einvoice_generated`.
- **POST `/api/compliance/invoices/:invoiceId/cancel`** *(admin |
  pharmacist)* `{ "reason" }` (required) → `200` (row → `cancelled`,
  `cancelled_at` set; audit `compliance.einvoice_cancelled`). Errors: `404`
  foreign invoice, `409 No accepted e-invoice to cancel`, `400 Cancellation
  window exceeded (24h)`, `422 <provider message>` (row stays `accepted`).
- **POST `/api/compliance/invoices/:invoiceId/eway`** *(admin | pharmacist)*
  `{ "distanceKm", "transporterName"?, "transporterGstin"?, "vehicleNo"?,
  "reason"? }` → `201` / `200` with the `ewaybill` row (`ackNo` = e-way bill
  no, `ackDate` = valid upto, `vehicleJson` = the details above). Errors:
  `400 Generate e-invoice first`, `409 E-way bill already generated`, `400`
  validation (`distanceKm` must be positive), `422`. Audit
  `compliance.ewaybill_generated`.
- **GET `/api/compliance/providers`** → static fake-only health:
  `{ provider: "fake", einvoice: true, eway: true, live: false, note:
  "Fake provider — IRNs are generated locally and are not government-issued." }`.
  There is no env surface at all (no `missingEnv*`, no `baseUrlsConfigured`)
  and the endpoint never contains a field matching
  `token|key|secret|password`.
- **GET `/api/compliance/submissions?from&to&status`** → tenant-scoped list
  (newest first) with `invoiceNo`, `invoiceDate`, `customerName`, `grandTotal`
  and parsed `vehicle`; `status` must be one of
  `pending|submitted|accepted|rejected|cancelled` (else `400`).

UI: `/dashboard/compliance` (CompliancePage — a single honest banner
"Fake provider — IRNs are generated locally and are not government-issued.
This build does not submit to the GSTN portal.", preflight/generate panel with
invoice picker, submissions table with IRN copy/cancel/e-way actions).
InvoicesPage shows the compliance state inside a row's expanded detail
(fetched only on expand).

---

## Online Orders

Customer ordering, prescription upload and delivery (Task 14). Service
`apps/server/src/services/customerOrders.ts`, tables `customer_orders` /
`customer_order_items` (migration `0013_customer_orders.sql`), staff routes
under `/api/orders` (authGuard) and public routes under `/api/public` (NO
auth). The whole workflow is toggleable by the install-wide settings singleton
`online_orders` = `{ "enabled": true|false }` — **enabled by default** (a
missing/invalid row reads as enabled so new installs work out of the box).
When disabled, `POST /api/public/orders` returns `403 Online ordering is
disabled`; staff routes and existing orders keep working.

**storeId convention (single-store install).** Public endpoints take `storeId`
= the install owner's user id — it is what Settings → Online Ordering copies
into the shareable link `/order?storeId=<ownerId>`. Every public write validates
its references against `storeId` (medicines `created_by`, files `owner_id`,
customers `created_by`), so a caller can never touch another tenant's rows.
The public catalog filters `medicines.created_by = storeId` and exposes only
`medicineId, name, brand, packSize, sellingPrice, mrp, inStock` — no purchase
price, no internal ids beyond `medicineId`.

### State machine

```
pending ──accept──► accepted ──pack──► packed ──ready──► ready ──deliver──► delivered
   │                   │                  │
   ├──reject──► rejected (terminal) ◄─────┘ (reject allowed from pending|accepted only)
   └──cancel──► cancelled (terminal)        cancel allowed from pending|accepted|packed
```

- Every illegal move returns `409 { error: "Cannot <action> order in <status>" }`.
- `deliver` accepts `ready | accepted | packed` (packed/accepted may skip ahead)
  and **requires `invoiceId`**.
- **Soft reservation decision:** `accept` verifies availability *now* —
  Σ `batches.quantity` (active, `created_by = storeId`) per medicine ≥ ordered
  qty — but **never deducts stock**. A shortfall returns
  `409 { error: "Insufficient stock", details: { items: [{ medicineName,
  available, requested }] } }`. Actual deduction happens only on the existing
  invoice create path (FEFO, expiry policy, accounting), which keeps one single
  stock-mutation code path in the app.
- **Billing conversion is UI-driven:** Orders → *Bill this order* opens
  `/dashboard/billing?orderId=<id>`; BillingPage prefills customer/address/rows
  (+ auto-creates a pending prescription from the uploaded image), the normal
  *Save Invoice* creates the bill, and the frontend then calls
  `POST /api/orders/:id/deliver { invoiceId }` best-effort (a failed transition
  only toasts — the invoice already exists).

**Staff queue is install-shared (documented).** `/api/orders` requires
authentication but is deliberately **NOT tenant-filtered**: every staff user of
this single-store install sees and moves every order. A missing id is a plain
`404` (no cross-tenant hiding). There are **no role gates** — any authed staff
member may run the queue; every mutation is audited with the actor's id
(`order.created`, `order.accepted`, `order.packed`, `order.ready`,
`order.delivered`, `order.rejected`, `order.cancelled`).

**Messaging is best-effort.** Accept/ready/deliver/reject/cancel queue a
WhatsApp message (`template: "custom"`, `aggregateType: "order"`,
idempotency `order:<id8>:<action>`) to the customer's phone; opt-out is
respected and any failure is swallowed — an unconfigured provider never fails
an order operation.

### Public endpoints (no auth — rate-limited by the global limiter, strict zod caps)

- **POST `/api/public/orders`** — `{ storeId, customerName (≤120, required),
  phone (7–20, required), deliveryAddress? (≤300), notes? (≤500),
  customerId?, prescriptionFileId?, items: [{ medicineId, quantity>0 }] (1–50) }`
  → `201` with the `pending` order + items (unit prices snapshotted from
  `medicines.selling_price`, `subtotal` = Σ price×qty). Errors: `400` zod
  validation / unknown-or-inactive medicine (owned inactive names are listed;
  foreign ids are only echoed as ids — never their names), invalid
  customer/prescription file; `403` when disabled; `404` unknown/inactive
  storeId.
- **GET `/api/public/medicines?storeId&q&limit`** — catalog search, `q` ≥ 2
  chars (400 otherwise — prevents catalog dumps), `limit` ≤ 50; name/brand LIKE
  (folded) or barcode exact, active medicines of `storeId` only, with
  `inStock` = Σ active batch qty > 0.
- **GET `/api/public/store?storeId`** → `{ name }` — portal title
  (`store_name` setting, falling back to the owner's display name).
- **POST `/api/public/files`** — `{ storeId, filename, contentType, data
  (base64) }`, 10MB cap, sha256 de-dupe per store → `{ id, duplicate }`.
  Stored with `owner_id = storeId`, purpose `order-prescription`.
- **GET `/api/public/orders/:id?storeId=`** — customer status view; only
  `{ id, status, createdAt, updatedAt, items: [{ medicineName, quantity }] }`.
  Wrong `storeId` and unknown id return the same `404` (no existence leak).

### Staff endpoints (`/api/orders`, authGuard)

- **GET `/api/orders?status&q&from&to&page&limit`** — install-shared queue,
  newest first; `q` matches customer name / phone / order id; returns `data`
  + `total` + `pagination` + `counts` (`{ all, pending, accepted, packed,
  ready, delivered, rejected, cancelled }` — one GROUP BY over the same
  search scope, deliberately EXCLUDING the `status` filter so the UI pills
  keep their totals while the rows narrow). `limit` caps at 100; the UI pages
  with *Load more*.
- **GET `/api/orders/:id`** — order + items (+ `invoiceId`,
  `prescriptionFileId`); when a prescription is attached, `prescriptionFile`
  `{ filename, contentType, data (base64) }` is **inlined** so staff users who
  don't own the file can still preview it (single-order fetch only).
- **POST `/api/orders/:id/accept`** — pending → accepted, soft stock check.
- **POST `/api/orders/:id/pack`**, **POST `/api/orders/:id/ready`** — linear
  accepted → packed → ready.
- **POST `/api/orders/:id/deliver`** `{ invoiceId }` — invoice must exist
  (`404`), belong to the order's store (`400`), and not already be linked to
  another order (`409`); sets `status = delivered` + `invoice_id`.
- **POST `/api/orders/:id/reject`** / **`/cancel`** `{ reason }` (≥3 chars,
  ≤500) — terminal states with reason.

UI: `/dashboard/orders` (OrdersPage — status filter pills with **server**
counts, debounced server-side search, *Load more* paging until `total`, order
rows with per-state actions, 409 stock shortfalls shown inline, detail dialog
with prescription preview, *Bill this order* → billing), the public portal at
`/order?storeId=…` (OrderPortalPage — search, cart, details, prescription
upload, tracking), and Settings → Online Ordering (enable toggle + copyable
public link).

---

## Devices, Sync & Permissions

Task 15 — device registry, remote monitoring, staff capability map and the
offline sync journal. Service code in `apps/server/src/services/devices.ts` +
`apps/server/src/services/sync.ts`, routes under `/api/devices` and `/api/sync`
(both `authGuard` unless noted), tables `user_devices` (migration `0000`) and
`sync_operations` (migration `0014_sync_devices.sql`), UI at
`/dashboard/devices` (DevicesPage). Envelope is the usual
`{ success, data, error }`.

### Device tokens — register / header flow

1. After a successful login (or a token restore on boot) the client calls
   **POST `/api/devices/register`** once per login session with
   `{ deviceName, platform, appVersion }` → `201 { id, deviceToken }`
   (`deviceToken` = `nanoid(32)`).
2. The browser stores it as `localStorage.medibill_device_token` and sends it
   on **every** request as the `X-Device-Token` header (api.ts request
   interceptor). Requests without the header behave exactly as before.
3. `checkDeviceToken` (in `plugins/auth.ts`) runs inside **both** `authGuard`
   and `requireRole`:
   - no header → allowed (unchanged behaviour)
   - unknown token / token of another user → `401 Device token mismatch`
     (session–device mismatch)
   - revoked device → `401 This device has been revoked` — it **outranks** the
     role check, so a revoked device gets `401` (never `403`) on every guarded
     route
   - valid → allowed + a fire-and-forget `lastSeenAt` heartbeat
   The frontend reacts to the revoked `401` with a toast and an automatic
   logout (use-auth 401 interceptor).
4. Revocation is a flag, never a delete — the row stays for audit/monitoring;
   restoring clears the flag and the token works again. Per-user cap: 10
   active devices; registering beyond it auto-revokes the **oldest** rows.

**Device tokens are returned only by `POST /register`** — every list/monitoring
shape is built without the token column.

### Endpoints — devices & monitoring

- **POST `/api/devices/register`** *(any role)* `{ deviceName, platform,
  appVersion }` → `201 { id, deviceToken }`. `400` on missing/empty fields.
- **GET `/api/devices`** → `DeviceView[]`
  `{ id, userId, userName?, deviceName, platform, appVersion, revoked,
  lastSeenAt, createdAt }`. Admin sees every user's devices (single-install
  monitoring); everyone else sees only their own.
- **POST `/api/devices/:id/revoke`** *(admin)* / **POST
  `/api/devices/:id/restore`** *(admin)* → the updated device row. Both are
  audited (`device.revoked` / `device.restored`), `404` for unknown ids.
- **GET `/api/devices/sessions`** *(admin)* → every session on the install:
  `{ id, userId, userName, ipAddress, userAgent, createdAt, expiresAt }` — the
  session token itself is never exposed (the id is shown as a prefix in the UI).
- **POST `/api/devices/sessions/:tokenId/revoke`** *(admin)* →
  `{ id, revoked: true }`; `deleteSession()` kills the token, so its
  Bearer/cookie dies on the very next request. `404` for unknown ids.
- **GET `/api/devices/activity`** *(admin)* → `{ events: [last 50 audit events
  `{ id, action, entity, entityId, actorId, actorName, metadata, createdAt }`],
  counts: { devicesActive, devicesRevoked, sessions } }`.

`requireRole` also runs the device check first, so a revoked device is rejected
with `401` **before** the role `403` — revocation is a kill-switch that
outranks permissions.

### GET `/api/devices/me` — staff permissions (capabilities)

Any authenticated role → `{ userId, role, capabilities }`, where
`capabilities` comes from `CAPABILITY_MAP` (`services/devices.ts`), the honest
map built by grepping the real role gates:

- `admin` → `["*"]` (wildcard = everything)
- `pharmacist` / `cashier` → the explicit list; every route that is **not**
  role-gated is reachable by all roles, so those capabilities are present for
  both (e.g. `purchases`, `inventory`, `reports`, `orders`, `messaging`,
  `devices`, …).
- Only admin|pharmacist gates are absent for cashiers: `compliance`,
  `accounting_manual`, `reconciliation_manage`, `stock_audit_approve`,
  `billing_prescription_override`; device/session/activity management is admin
  only (`*`).

The frontend uses this endpoint twice: DashboardLayout hides nav items whose
capability the role lacks (fail-open — if the request fails, everything stays
visible), and the Devices page shows the *My Role* tab / admin-only tabs.

### Sync push — `POST /api/sync/push`

`{ operations: [ … ] }` — **1..100 operations**, each:

```json
{ "operationId": "<≤64 chars, unique per user>", "entity": "medicine|customer|supplier|setting",
  "action": "create|update", "payload": { … }, "baseVersion": "<ISO updatedAt you last saw>" }
```

Response `data` = `{ results: [ per-op … ], applied, conflicts, duplicates, errors }`
where each result is `{ operationId, status, entityId?, appliedVersion?,
conflict?, error? }` with `status ∈ applied | conflict | duplicate | error`.

Rules:

- **Idempotency** — `UNIQUE(created_by, operation_id)`; replaying an
  `operationId` (even inside one batch) returns `status: "duplicate"` and never
  touches data.
- **Conflict** — a stale `baseVersion` (≠ the row's current `updatedAt`) yields
  `status: "conflict"` with `conflict` = the **server row snapshot**; the row is
  **not** modified. Resolution is manual and deliberate: re-push the same
  operation **without `baseVersion`** to force-overwrite.
- **Versions** — `updatedAt` is stored at second granularity, so an applied
  write bumps it to *at least one second past* the previous value
  (`nextVersion()`); `appliedVersion` in the result is the row's new
  `updatedAt` ISO string — feed it back as the next `baseVersion`.
- **Validation** — payload problems are per-op `status: "error"` with
  `Validation error: field: message; …` (the batch itself still returns `200`).
  Only a malformed envelope (missing/empty `operationId`, batch > 100, …)
  returns `400`.
- **Tenant safety** — updates only see rows the pushing user created; a foreign
  id yields `status: "error"` / `"Medicine not found"`.
- **Entities** — only `medicine | customer | supplier | setting` are sync
  entities. Anything else (including `invoice`) → `status: "error"` /
  `"unsupported entity"`.

**Invoice limitation (server-authoritative).** Invoices, journals, orders and
other transactional documents are **never** sync entities: they flow through
their normal APIs at all times and must be created while online. This is why
the UI text says invoices are pushed live, masters sync via push/pull.

### Sync pull — `GET /api/sync/pull?cursor=&limit=`

Cursor feed of the **caller's own** `applied` + `conflict` operations
(duplicates/errors are omitted — clients need conflicts to reconcile), ordered
by `(applied_at, id)` ascending:

`{ ops: [{ operationId, entity, action, payload, entityId, appliedVersion,
appliedAt, status }], nextCursor: "<ISO ts>|<row id>" | null, hasMore }`

- `cursor` — opaque `"<ISO ts>|<id>"` from a previous `nextCursor`; invalid
  shape → `400 Invalid cursor`.
- `limit` — 1..500, default 100. `nextCursor` is only set while `hasMore`.

### Sync status — `GET /api/sync/status`

`{ opsCount, dbSizeBytes, lastBackupAt, serverTime }` — journal size for the
caller, database file size, newest **successful** backup and the server clock.



### GET `/api/health`
```json
{ "status": "ok", "timestamp": "...", "version": "1.0.0" }
```

## Integrations Center

Task 17 — one registry of external providers with encrypted, settings-backed
configuration and honest health reporting. Service code in
`apps/server/src/services/integrations.ts`, routes in
`apps/server/src/routes/integrations.ts`, UI at
`/dashboard/integrations`. All routes require `authGuard`;
`connect` / `disconnect` are **admin | pharmacist** (cashier → 403).

**The consolidated integration reference (registry, env vars, encryption,
connect/disconnect semantics, health precedence, delivery behaviour) lives in
[docs/INTEGRATIONS.md](./INTEGRATIONS.md)** — this section only lists the
endpoints.

**Registry** (`PROVIDERS`, returned by every list response):

| id | Name | Category | Fields (secret in parentheses) |
|----|------|----------|-------------------------------|
| `whatsapp` | WhatsApp (Cloud API) | Messaging | `apiToken` (secret), `phoneNumberId` |
| `sms` | SMS Gateway | Messaging | `webhookUrl` (secret), `sender` |
| `email` | Email | Messaging | `webhookUrl` (secret) |
| `einvoice` | E-Invoice (fake IRN generator) | Compliance | none — informational card, fake-only build |
| `google_drive` | Google Drive Backup | Backup | none — existing OAuth flow in Settings → Backup |
| `online_orders` | Online Ordering | Storefront | none — toggle mirrored to the `online_orders` setting |
| `payment_collect` | Payment Collection (UPI QR) | Payments | `upiId` — informational only (QR display, no gateway) |

**Storage & encryption.** Each provider owns one `settings` row
`integration:<id>`:
`{ enabled, config: {plain}, secrets: {field: "enc:v1:..."}, connectedAt, updatedBy }`.
Secrets are AES-256-GCM encrypted exactly like backups
(`[IV 16][AuthTag 16][Ciphertext]`, base64) with a dedicated auto-generated
32-byte key file `DATA_DIR/integration.key` — the key is never logged,
exported or returned. The `enc:v1:` prefix makes ciphertext obvious in raw
rows. Settings is a per-install singleton (no tenant column), so integrations
are shared by every user of the install.

**Health precedence** (per `mode`):
- messaging channels: enabled settings record with complete, decryptable
  credentials → `mode: "settings"`; else env (`WHATSAPP_API_TOKEN` /
  `WHATSAPP_PHONE_NUMBER_ID`, `SMS_WEBHOOK_URL`, `EMAIL_WEBHOOK_URL`) →
  `mode: "env"`; else `mode: null` + `missingEnv` lists the missing env var
  NAMES (values are never read into a response).
- `einvoice`: ALWAYS `mode: "fake"`, `connected: true` — the fake-only build
  has no settings path and no env path (see the compliance section).
- `google_drive`: live status from `getDriveStatus()` (connected + account
  email only). `online_orders`: the existing settings toggle.
  `payment_collect`: configured when a `upiId` is stored.
- `connected` folds in the user toggle for settings-backed providers; env and
  fake paths report connected on their own (the operator enabled them
  out-of-band).

**Adapter fallbacks.** `providers/messaging.getProvider()` first calls
`integrations.getResolvedCredentials(id)` — when an enabled settings record
holds complete credentials, an adapter is built with those (decrypted) values;
otherwise the historical env path runs unchanged (so an install with no
settings rows behaves exactly like Task 9). Decryption failures (e.g. a
replaced key file) safely resolve to "not configured". The GST provider does
not participate: it is fake-only (`providers/gst.ts`).

**Endpoints**

- `GET /api/integrations` → `{ providers: [health…], summary: {connected,total} }`.
- `GET /api/integrations/:id` → health + `config` (plain values) + `secrets`
  (each stored value redacted to `"•••"`) + `updatedBy`. Decrypted secrets
  are NEVER returned.
- `POST /api/integrations/:id/connect` `{config?, secrets?, enabled?}` →
  200 health. A value may be sent in either bucket (it is routed to the right
  one). Enabling requires EVERY registry field to have a value → otherwise
  `400 Missing required fields for <id>: …`. Unknown id → 404.
  Audit `integration.connected` records field NAMES only.
- `POST /api/integrations/:id/disconnect` → disables AND forgets the
  configuration (config + secrets wiped, settings row deleted; documented:
  disconnect is not a soft disable). Audit `integration.disconnected`.
  For `online_orders` it also flips the shared toggle off.
- `GET /api/integrations/registry` → raw registry metadata (no state).

## Scheduled Reports

Task 17 — CSV **and PDF** reports generated on a schedule and delivered
through the existing messaging outbox. Service in
`apps/server/src/services/reportsDelivery.ts`, routes in
`apps/server/src/routes/scheduledReports.ts` (tables in migration
`0016_integrations_reports.sql`, see docs/DATABASE.md), UI at
`/dashboard/scheduled-reports`. Reads need `authGuard`; create / update /
delete / run are **admin | pharmacist** (cashier → 403). Every loader filters
by `created_by` → cross-tenant ids 404.

**Report types & periods.** `sales` (invoices), `stock` (current batches),
`purchase` (purchase bills), `payments` (payment rows), `party` (customers
with `balance > 0`). Periods are period-relative: `filters.daysBack`
(default 30, clamped 1..365) counted back from the run date — one definition
produces a rolling window on every run. Stock and party are point-in-time.

**Schedule presets** (`schedule`): `{kind:"daily",time:"HH:mm"}` ·
`{kind:"weekly",day:0-6,time}` (0 = Sunday) · `{kind:"monthly",day:1-28,time}`
(day capped at 28 so every month has that date). Invalid presets → 400.
`next_run_at` is a SERVER-LOCAL wall-clock string `YYYY-MM-DDTHH:mm` (no
zone) computed by `computeNextRun(after, schedule)` — the install is
single-store and runs in the pharmacy's timezone; the worker compares it as a
plain string against the server clock.

**Formats.** `format: "csv" | "pdf"` (created once, immutable on update):
- **CSV** — UTF-8 with a BOM (Excel), CRLF rows, RFC 4180 quoting; ≤ 100 KB
  is inlined in the delivery message body (larger bodies say "(CSV saved …)").
- **PDF** — server-rendered A4 portrait via **pdfkit** (`buildPdf`): title,
  generated date, report type and period block; gray header row; equal column
  widths capped to the printable width with ellipsis-truncated cells;
  right-aligned numeric cells; automatic row pagination; centered
  "Page N of M" footer. Stored as a `stored_files` row (`application/pdf`,
  filename `<name>_<date>.pdf`) and **downloaded from the run** — channel
  messages cannot carry attachments, so the delivery body only carries the
  summary counts plus "PDF available in Scheduled Reports".

**Run + delivery semantics.**
`POST /api/scheduled-reports/:id/run` (manual, does NOT advance the schedule)
or the worker tick (messaging cron, every 2 min, limit 50 due reports):
insert `running` run → build rows + CSV/PDF → store via `fileStorage`
(purpose `scheduled-report`) → queue ONE `custom` message per recipient
(`aggregateType: scheduled_report`, idempotency `sr:<runId>:<channel>:<i>`)
whose body carries the summary counts (+ inline CSV / PDF note) →
update run `done` (`row_count`, `file_id`, `message_status`) → set
`last_run_at` (and `next_run_at` on schedule-triggered runs, even after a
failure so a bad report never hot-loops) → audit `report.scheduled_run`.
Queueing is provider-agnostic: delivery + outbox rows are created even with
no messaging provider configured; a messaging failure NEVER fails the run
(`message_status` records `queued` / `partial` / `failed` / `none`).
Generation failures store `failed` + `error` and rethrow with the HTTP status.

**Endpoints**

- `POST /api/scheduled-reports` `{name, reportType, schedule, recipients, format, filters}`
  → 201 with the row incl. computed `next_run_at`. `format` accepts `"csv"`
  (default) and `"pdf"`; `recipients` is
  `[{channel:"email"|"sms", address}]` (may be empty = file-only report).
- `GET /api/scheduled-reports` → my reports (newest first).
- `GET /api/scheduled-reports/:id` → `{ report, runs }` (10 most recent runs).
- `GET /api/scheduled-reports/:id/runs` → run history (≤50).
- `PUT /api/scheduled-reports/:id` `{name?, schedule?, recipients?, filters?, enabled?}`
  — changing `schedule` restarts the countdown from now; toggling `enabled`
  recomputes `next_run_at` when it was empty.
- `DELETE /api/scheduled-reports/:id` → removes the report; its runs cascade
  (`ON DELETE CASCADE`).
- `POST /api/scheduled-reports/:id/run` → `{run, rows, delivered, deliveryFailed}`.
- Worker: `tickDueScheduledReports()` runs inside the existing messaging cron
  (no-op under Vitest / `NODE_ENV=test`), catching per-report errors.

---

## Feature Acceptance Matrix

Task 18 acceptance review of every gap in the plan's **Current Gaps** table
(`docs/superpowers/plans/2026-09-26-complete-pharmacy-platform.md`). A gap is
marked **Implemented** only when the active Fastify route, the UI workflow, the
server tests and the docs all exist. **Partial** and **Deferred** rows state
exactly what is still missing — nothing is rounded up.

### Gaps

| Gap | Status | Where (route / page / test) |
|---|---|---|
| Purchase ingestion — review-to-post pipeline | Implemented | `POST/GET/PUT/DELETE /api/purchase-imports`, `POST /api/purchase-imports/ocr`; `src/pages/PurchaseImportPage.tsx`, `src/components/purchase/PurchaseImportReview.tsx`; `apps/server/test/purchase-import.test.ts`, `purchase-ocr.test.ts` (5,000-row load: `performance-load.test.ts`) |
| Alternatives and product intelligence | Implemented | `GET /api/product-intelligence/{alternatives,search,links}`, `POST /api/product-intelligence/substitutes`; `src/components/MedicineAlternatives.tsx` (embedded in Billing + Catalog); `apps/server/test/product-intelligence.test.ts` |
| Distributor procurement (rate comparison, supplier performance) | Implemented | `GET /api/procurement/{compare,recommendation,rate-history,quotes,suppliers/:id/metrics,suppliers/:id/expiry-items}`, `POST /api/procurement/quotes`; `src/pages/ProcurementPage.tsx`; `apps/server/test/procurement.test.ts` |
| Safety controls (expiry hard-block + short-expiry policy) | Implemented | `GET/PUT /api/expiry-policy`, `POST /api/expiry-policy/evaluate`; enforced in `POST /api/invoices`, `POST /api/purchases`, purchase-import commit and manual batch create; `src/pages/SettingsPage.tsx` (expiry policy panel); `apps/server/test/expiry-safety.test.ts` |
| Prescriptions (full workflow) | Implemented | `POST/GET/PUT/DELETE /api/prescriptions`, `POST /api/prescriptions/:id/{verify,reject,dispense}`, `GET /api/prescriptions/invoice/:invoiceId`; schedule H/H1/X enforcement inside `POST /api/invoices`; `src/pages/PrescriptionsPage.tsx`; `apps/server/test/prescriptions.test.ts` |
| Audit — stock-take sessions | Implemented | `POST/GET /api/stock-audits`, `POST /api/stock-audits/:id/{counts,approve,cancel}`, `PUT /api/stock-audits/counts/:countId`; `src/pages/StockAuditPage.tsx`; `apps/server/test/stock-audits.test.ts` |
| Labels — barcode label printing | Implemented | `GET /api/labels/templates`, `POST /api/labels/preview`; `src/pages/LabelsPage.tsx`; `apps/server/test/labels.test.ts` (500-label load: `performance-load.test.ts`) |
| Messaging — WhatsApp/SMS/email delivery | Implemented — queueing, outbox, consent and retry work with zero configuration; **live send additionally needs provider credentials** (env vars or Integrations Center) | `POST/GET /api/messages`, `PUT/GET /api/messages/preferences`, `POST /api/messages/:id/retry`, `/api/refills/*`, `POST /api/invoices/:id/share`; `src/pages/CommunicationsPage.tsx`, `src/pages/RefillsPage.tsx`; `apps/server/test/messaging.test.ts` |
| Customer growth — loyalty, offers, campaigns, consent, patient analytics | Implemented | `GET /api/customer-engagement/{insights/:customerId,loyalty,offers,campaigns}`, `POST .../{loyalty/earn,loyalty/redeem,offers,campaigns,campaigns/:id/send}`; `src/pages/CampaignsPage.tsx`; `apps/server/test/customer-engagement.test.ts` |
| Accounting — double-entry ledger | Implemented | `GET/POST /api/accounting/{accounts,post,trial-balance,profit-loss,balance-sheet,day-book,entries,periods}`; `src/pages/AccountingPage.tsx`; `apps/server/test/accounting.test.ts`, `regression-workflows.test.ts` |
| Purchase returns — creation workflow | Implemented | `POST/GET /api/purchase-returns` (admin\|pharmacist, tenant-scoped batch + stock guard, `PR-` series, documented supplier-balance rule, `purchase_return` journal posted in the create transaction); `src/pages/PurchasesPage.tsx` (Purchase Returns tab + New Return dialog); `apps/server/test/purchase-returns.test.ts` |
| Accounting — opening balances + trial-balance carry-forward | Implemented | `POST /api/accounting/opening`, `GET /api/accounting/opening/suggest` (date-keyed `opening:<date>` idempotency, closed-period guard, admin\|pharmacist); trial-balance `openingDebit/openingCredit/closing` columns (+ totals) carried forward across ranges; `src/pages/AccountingPage.tsx` (Opening tab + TB columns); `apps/server/test/opening-balances.test.ts` |
| Reconciliation — cash/bank books + statement matching | Implemented | `GET /api/reconciliation/{cash,bank,rows,suggest,status}`, `POST /api/reconciliation/{import,match,unmatch}`; `src/pages/CashBankPage.tsx`; `apps/server/test/reconciliation.test.ts` |
| Compliance — e-invoice / e-way bills | **Implemented (fake-only)** — the whole generate → accept → cancel → e-way workflow runs on the zero-config **fake** provider, clearly labelled in the UI; **NIC live e-invoice: Out of scope (removed by decision)** — the live adapter, its `EINVOICE_*`/`EWAY_*` env vars and the "not configured" 503 path were deleted; `GET /api/compliance/providers` reports `{provider:"fake", live:false}` | `GET/POST /api/compliance/invoices/:invoiceId/{,generate,cancel,eway}`, `GET /api/compliance/{providers,submissions}`; `src/pages/CompliancePage.tsx`; `apps/server/test/compliance.test.ts` |
| Online orders — customer order channel + delivery workflow | **Partial — soft reservation**: `POST /api/orders/accept` verifies current availability but never deducts; stock deduction happens only through the invoice path (FEFO + expiry policy included) | `GET /api/orders`, `POST /api/orders/:id/{accept,pack,ready,deliver,reject,cancel}`, public `POST/GET /api/public/{orders,medicines,store,files}`; `src/pages/OrdersPage.tsx`, `src/pages/OrderPortalPage.tsx`; `apps/server/test/customer-orders.test.ts` |
| Cloud/device operations — device registry, staff permissions, remote monitoring | Implemented | `POST/GET /api/devices`, `POST /api/devices/:id/{revoke,restore}`, `GET /api/devices/{sessions,activity,me}`; `src/pages/DevicesPage.tsx`; `apps/server/test/devices-sync.test.ts` |
| Cloud/device operations — offline sync / "cloud sync" | **Partial — master-data propagation only** (medicine, setting, customer, supplier). Invoices are **live** server reads and are deliberately rejected by push with `unsupported entity` — there is no invoice replication | `POST /api/sync/push`, `GET /api/sync/{pull,status}`; `src/pages/DevicesPage.tsx`; `apps/server/test/devices-sync.test.ts` |
| Migration/admin — full data migration (customers/suppliers/medicines/opening stock) | Implemented | `POST/GET/DELETE /api/data-migrations`, `POST /api/data-migrations/:id/{preview,commit,rollback}`; `src/pages/MigrationPage.tsx`; `apps/server/test/data-migration.test.ts` |
| Migration/admin — bulk bill edits | Implemented | `POST /api/bulk-bills/{preview,commit}` (admin\|pharmacist, `confirm:"CONFIRM"`); `src/pages/BulkBillsPage.tsx`; `apps/server/test/data-migration.test.ts` |
| Migration/admin — scheduled reports | **Implemented** — CSV **and** server-rendered A4 PDF (`pdfkit`): PDF runs store an `application/pdf` file on the run, delivery bodies carry summary counts + a "PDF available" note (channel messages cannot attach files — download from the run) | `POST/GET/PUT/DELETE /api/scheduled-reports`, `POST /api/scheduled-reports/:id/run`; `src/pages/ScheduledReportsPage.tsx`; `apps/server/test/integrations.test.ts` (`buildPdf`, PDF run) |
| Migration/admin — integrations center | Implemented (per-install registry, AES-256-GCM secrets never returned, redacted to `•••`; the e-invoice card is an informational **fake IRN generator** with no credential fields — see the compliance row) | `GET/POST /api/integrations/{,/:id,/:id/connect,/:id/disconnect,registry}`; `src/pages/IntegrationsPage.tsx`; `apps/server/test/integrations.test.ts` |
| Multi-branch: Branch Transfer, Delivery Challan, Quotation, duplicate medicines across branches | **Out of scope (single-store)** — excluded by the plan's Global Constraints; no route, page or table exists by design | — |
| Cross-tenant security sweep (Task 18) | **Implemented — 1 real leak found and fixed**: `GET /api/invoices/number/:invoiceNo` returned any tenant's invoice + items for a guessable number; it now requires `created_by`. Everything else tested clean | every new route surface (outbox, files, purchase-imports, product-intelligence, procurement, expiry-policy, prescriptions, stock-audits, labels, messages, refills, invoices/share, customer-engagement, accounting, reconciliation, compliance, orders + public catalog, devices, sync, data-migrations, bulk-bills, scheduled-reports, integrations) | `apps/server/test/tenant-isolation.test.ts` (39 tests) |
| Invoice lifecycle regression (Task 18) | Implemented — sale / schedule-H block / cancel-reversal / purchase + expiry block / payment + return / admin expiry override each asserted end to end, closing with **trial-balance debit == credit** over the whole story; plus the partial-payment chain (Fix 3): partial cash sale split → settlement → cancel reverses settlement + sale → exact zeroed balances, double-cancel safety and the no-double-post guard | invoice, purchase, payment, return, accounting and expiry-policy routes | `apps/server/test/regression-workflows.test.ts` (12 tests) |
| Performance budgets (Task 18) | Implemented — measured on this machine: purchase import 5,000 rows **5.7 s** (budget 15 s), 100k inventory transactions seeded in **0.96 s**, opening-closing **456 ms** (budget 5 s), stock statement **75 ms** (budget 2 s), stock adjustments **475 ms** (budget 2 s), 500-label preview **7 ms** (budget 2 s) | purchase-import, reports and labels routes | `apps/server/test/performance-load.test.ts` (6 tests) |
| Legacy CRUD cross-tenant hardening (Task 18 follow-up sweep) | **Implemented — every legacy route predating Task 18 was unscoped**: list + detail + mutations for purchases, suppliers, customers, doctors, medicines (incl. barcode lookup), returns, invoices, inventory (batch update, expiry report, batch create) now filter on `created_by` and return `404` for foreign ids; purchase/invoice/return creates reject foreign medicine/supplier/invoice/batch references; FEFO/FIFO batch selection is tenant-scoped. Fixture pollution purged from the live DB (9 orphan rows) with backup `C:\ProgramData\MediBill\backups\pre-cleanup-2026-09-27T03-10-47-778Z.db` | `purchases`, `suppliers`, `customers`, `doctors`, `medicines`, `payments`, `returns`, `invoices`, `inventory`, `catalog` (global by design), `settings` (install singleton) routes | `apps/server/test/tenant-isolation.test.ts` — `legacy CRUD tenant isolation` (6 tests) |

**Honest-status summary:** of the 23 gap rows — **20 Implemented**, **2
Partial** (online-order soft reservation, master-data-only sync), **1 Out of
scope (single-store)**. The live NIC e-invoice sub-gap inside the compliance
row is now **Out of scope (removed by decision)** rather than deferred. The
remaining 4 rows are the cross-tenant/lifecycle verification sweeps (tenant
isolation, legacy CRUD hardening, invoice lifecycle regression, performance
budgets) and are all implemented.

### Migrations applied to the live database (Tasks 0-17)

16 additive migrations, applied in order on top of the base `0000_init.sql`:

| # | Migration | Adds |
|---|---|---|
| 1 | `0001_platform_foundations.sql` | `outbox_events`, `stored_files`, `audit_events`, `user_devices`, `feature_flags` |
| 2 | `0002_purchase_imports.sql` | `purchase_imports`, `purchase_import_rows` |
| 3 | `0003_purchase_import_source.sql` | OCR source columns on purchase imports |
| 4 | `0004_medicine_substitutes.sql` | `medicine_substitutes` |
| 5 | `0005_procurement.sql` | `supplier_quotes` |
| 6 | `0006_prescriptions_workflow.sql` | prescription workflow columns + indexes |
| 7 | `0007_stock_audits.sql` | `stock_audits`, `stock_audit_counts` |
| 8 | `0008_messaging.sql` | `message_deliveries`, `communication_preferences` |
| 9 | `0009_customer_growth.sql` | `loyalty_ledger`, `offers`, `campaigns` |
| 10 | `0010_accounting.sql` | `accounts`, `journal_entries`, `journal_lines`, `accounting_periods` |
| 11 | `0011_reconciliation.sql` | `bank_statement_rows`, `reconciliation_matches` |
| 12 | `0012_compliance.sql` | `compliance_submissions` |
| 13 | `0013_customer_orders.sql` | `customer_orders`, `customer_order_items` |
| 14 | `0014_sync_devices.sql` | `sync_operations` (+ device registry columns) |
| 15 | `0015_data_migration.sql` | `data_imports`, `data_import_rows` |
| 16 | `0016_integrations_reports.sql` | `scheduled_reports`, `scheduled_report_runs` |

### Verification gates

- `cd apps/server && npx vitest run` → **36 files, 767 tests, all green**
  (baseline 36/760 + `customer-orders` counts (+1) + `messaging`
  template-override merge tests (+3) + `integrations` PDF tests (+3)).
- `cd apps/server && npx tsc --noEmit -p tsconfig.json` → **zero errors**
  (the 3 pre-existing `src/plugins/auth.ts` fastify-cookie declaration
  conflicts were fixed by removing our duplicated `cookies` / `setCookie` /
  `clearCookie` / `sendFile` declarations — `@fastify/cookie` and
  `@fastify/static` already augment them).
- `npx tsc --noEmit -p tsconfig.app.json` (repository root) → clean.
- `npx vite build` → success.
- New runtime dependency: **`pdfkit`** (+ `@types/pdfkit`) in the root and
  `apps/server` `package.json` for scheduled-report PDF export.
- Lint sweep over the session-touched `src/` files → errors 538 → 517 and
  warnings 9 → 7 (all unused-vars / empty-block / render-time-ref errors
  fixed; the remainder are the repo's pre-existing `no-explicit-any` style
  and the pervasive `set-state-in-effect` pattern, deliberately not
  mass-refactored).
- Browser verification of the new surfaces is tracked separately by the
  orchestrator (Task 18, Step 5) and is NOT claimed here.
