# MediBill — Database Schema

## Entity Relationship Diagram

```
users ───────────────────────────────────────────────────────────────────
  │                                                                       │
  │ 1:N                                                                  1:N
  │                                                                       │
stores ◄──── store_members ────► users                               invoices ◄── invoice_items
  │                                                                       │                    │
  │ N:1                                                              N:1   │
  │                                                                  │
suppliers ◄─── purchase_bills ◄─── purchase_bill_items            customers ◄─── payments
  │                                                                       │                    │
  │ N:1                                                              1:N   │
  │                                                                  │
batches ◄─────────────── medicines ◄──── inventory_transactions    doctors ◄── prescriptions
  │                        │
  │                        │ N:1
  │                        │
  │                   tax_config
  │
  ├── purchase_returns ◄── purchase_return_items
  │
  └── sales_returns ◄─── sales_return_items


users ──── sessions
users ──── activity_log
users ──── settings
users ──── backup_history
users ──── purchase_imports ──── purchase_import_rows
users ──── data_imports ──── data_import_rows
users ──── stock_audits ──── stock_audit_counts
users ──── message_deliveries
users ──── communication_preferences ──── customers
users ──── loyalty_ledger ──── customers
users ──── offers
users ──── campaigns
users ──── customer_orders ──── customer_order_items
users ──── user_devices
users ──── sync_operations (operation_id UNIQUE per user → idempotent push)
```

## Tables

### `users`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | nanoid |
| `email` | TEXT | Optional, unique |
| `phone` | TEXT | Optional, unique |
| `name` | TEXT | Display name |
| `password_hash` | TEXT | Argon2 hash |
| `role` | TEXT | admin/pharmacist/cashier |
| `is_active` | INTEGER | Soft delete flag |
| `created_at` | INTEGER | Unix timestamp |
| `updated_at` | INTEGER | Unix timestamp |

### `medicines`
Product master — holds product information, NOT batch-specific stock.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `name` | TEXT | Medicine name |
| `generic_name` | TEXT | Generic name |
| `brand` | TEXT | Manufacturer/brand |
| `category` | TEXT | Category (tablet, syrup, etc.) |
| `composition` | TEXT | Active ingredients |
| `hsn_code` | TEXT | HSN code for tax |
| `gst_rate` | TEXT | GST rate (0/5/12/18/28) |
| `schedule` | TEXT | Schedule (H, X, etc.) |
| `dosage_form` | TEXT | tablet/syrup/injection |
| `strength` | TEXT | e.g., "500mg" |
| `unit` | TEXT | unit/strip/bottle |
| `pack_size` | TEXT | e.g., "10's" |
| `barcode` | TEXT | Barcode/EAN |
| `rack_location` | TEXT | Storage location |
| `min_quantity` | INTEGER | Low stock threshold |
| `purchase_price` | REAL | Default purchase rate |
| `selling_price` | REAL | Default selling rate |
| `mrp` | REAL | Maximum retail price |
| `is_active` | INTEGER | Soft delete |
| `created_by` | TEXT (FK) | users.id |

### `batches`
**The core of pharmacy inventory.** One medicine can have many batches.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `medicine_id` | TEXT (FK) | medicines.id |
| `batch_no` | TEXT | Batch number |
| `expiry_date` | TEXT | ISO date (YYYY-MM-DD) |
| `mrp` | REAL | MRP for this batch |
| `purchase_price` | REAL | Purchase rate |
| `selling_price` | REAL | Selling rate |
| `quantity` | INTEGER | Current available stock |
| `initial_quantity` | INTEGER | Stock at purchase |
| `free_quantity` | INTEGER | Free stock |
| `supplier_id` | TEXT (FK) | suppliers.id |
| `purchase_bill_id` | TEXT (FK) | purchase_bills.id |
| `is_active` | INTEGER | Soft delete |

### `inventory_transactions`
Immutable audit trail of every stock movement.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `medicine_id` | TEXT (FK) | medicines.id |
| `batch_id` | TEXT (FK) | batches.id |
| `type` | TEXT | stock_in/stock_out/sales/purchase/return/adjustment |
| `quantity` | INTEGER | +ve for in, -ve for out |
| `balance_after` | INTEGER | Batch stock after this tx |
| `rate` | REAL | Rate at time of transaction |
| `invoice_id` | TEXT (FK) | invoices.id (for sales) |
| `reference` | TEXT | Invoice/purchase number |
| `reason` | TEXT | For adjustments/returns |
| `notes` | TEXT | Additional notes |
| `created_by` | TEXT (FK) | users.id |
| `created_at` | INTEGER | Unix timestamp |

### `invoices`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `invoice_no` | TEXT | Unique, format MB-YYYY-NNNNNN |
| `customer_id` | TEXT (FK) | customers.id |
| `customer_name` | TEXT | Snapshot at time of sale |
| `customer_phone` | TEXT | Snapshot |
| `customer_address` | TEXT | Snapshot |
| `customer_gstin` | TEXT | Snapshot |
| `doctor_id` | TEXT (FK) | doctors.id |
| `doctor_name` | TEXT | Snapshot |
| `date` | TEXT | ISO date |
| `subtotal` | REAL | Before tax |
| `total_gst` | REAL | Total GST amount |
| `cgst` | REAL | Central GST |
| `sgst` | REAL | State GST |
| `igst` | REAL | Integrated GST |
| `discount_amount` | REAL | Total discount |
| `grand_total` | REAL | Final amount |
| `amount_paid` | REAL | Amount paid now |
| `payment_mode` | TEXT | cash/card/upi/credit |
| `status` | TEXT | paid/unpaid/partial/cancelled |
| `prescription_id` | TEXT | prescriptions.id linked at sale (nullable) - migration `0006` |
| `prescription_status` | TEXT | pending/verified/dispensed snapshot at sale - migration `0006` |
| `hold` | INTEGER | Held bill flag |
| `cancelled_at` | INTEGER | Timestamp |
| `cancelled_by` | TEXT (FK) | users.id |
| `created_by` | TEXT (FK) | users.id |

### `invoice_items`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `invoice_id` | TEXT (FK) | invoices.id |
| `medicine_id` | TEXT (FK) | medicines.id |
| `medicine_name` | TEXT | Snapshot |
| `batch_id` | TEXT (FK) | batches.id |
| `batch_no` | TEXT | Snapshot |
| `expiry_date` | TEXT | Snapshot |
| `hsn_code` | TEXT | Snapshot |
| `quantity` | INTEGER | Quantity sold |
| `unit` | TEXT | Snapshot |
| `rate` | REAL | Unit rate |
| `amount` | REAL | quantity × rate |
| `gst_rate` | TEXT | Snapshot |
| `gst_amount` | REAL | Snapshot |
| `cgst` | REAL | Snapshot |
| `sgst` | REAL | Snapshot |
| `discount_amount` | REAL | Per-item discount |

### `prescriptions`
Migration `0000_init.sql` (base table) + `0006_prescriptions_workflow.sql`
(workflow columns). Patient prescriptions: capture once, verify, then dispense
against a bill. Tenant-scoped by `created_by`; `status` drives the workflow
(`pending|verified|dispensed|rejected`, default `pending`) and the dispensed
invoice is recorded on both sides.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `patient_name` | TEXT | Required |
| `patient_age` | INTEGER | Optional |
| `patient_gender` | TEXT | Optional |
| `customer_id` | TEXT | customers.id (nullable) - migration `0006` |
| `doctor_id` | TEXT (FK) | doctors.id |
| `doctor_name` | TEXT | Snapshot |
| `date` | TEXT | ISO date of the prescription |
| `notes` | TEXT | Medicine/dosage hint |
| `image_path` | TEXT | stored_files.id of the uploaded image (filesApi) |
| `status` | TEXT | pending/verified/dispensed/rejected - migration `0006` |
| `dispensed_at` | INTEGER | Timestamp - migration `0006` |
| `dispensed_invoice_id` | TEXT | invoices.id it was dispensed against - migration `0006` |
| `is_active` | INTEGER | Soft-delete flag (1 = active) |
| `created_by` | TEXT (FK) | users.id — tenant scope |

### `customers`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `name` | TEXT | |
| `phone` | TEXT | |
| `email` | TEXT | |
| `address` | TEXT | |
| `gstin` | TEXT | |
| `credit_limit` | REAL | Max credit allowed |
| `balance` | REAL | Current outstanding (positive = customer owes) |
| `total_purchases` | REAL | Lifetime purchases |
| `last_purchase_date` | TEXT | ISO date |
| `is_active` | INTEGER | |
| `created_by` | TEXT (FK) | users.id |

### `suppliers`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `name` | TEXT | |
| `contact_person` | TEXT | |
| `phone` | TEXT | |
| `email` | TEXT | |
| `address` | TEXT | |
| `gstin` | TEXT | |
| `payment_terms` | TEXT | e.g., "Net 30" |
| `credit_limit` | REAL | Max credit |
| `balance` | REAL | Current outstanding (positive = we owe) |
| `is_active` | INTEGER | |
| `created_by` | TEXT (FK) | users.id |

### `sessions`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `user_id` | TEXT (FK) | users.id |
| `token` | TEXT | 32-char nanoid |
| `expires_at` | INTEGER | Unix timestamp |
| `ip_address` | TEXT | |
| `user_agent` | TEXT | |
| `created_at` | INTEGER | |

### `activity_log`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `user_id` | TEXT (FK) | users.id |
| `action` | TEXT | CREATE/UPDATE/DELETE/CANCEL |
| `entity` | TEXT | invoice/medicine/customer |
| `entity_id` | TEXT | |
| `details` | TEXT | Human-readable description |
| `ip_address` | TEXT | |
| `created_at` | INTEGER | |

### `settings`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `key` | TEXT | Unique key |
| `value` | TEXT | JSON string |
| `updated_at` | INTEGER | |

> **Expiry Safety Policy (Task 5)** — stored under the settings key `expiry_policy`
> (JSON: `{ blockExpiredSale, blockExpiredPurchase, warningDays, blockWithinDays, allowOverrideRoles }`).
> The table is a global singleton (`key` UNIQUE, no `created_by`/tenant column), so the
> policy is per-install and shared by every user. **No new table or migration is required.**

> **Loyalty (Task 10)** — stored under the settings key `loyalty`
> (JSON: `{ enabled: false, pointsPer100Rupee: 1, rupeePerPoint: 1 }`).
> **Disabled by default** so existing installs/tests are unaffected: sales only
> *earn* points when `enabled = true` (redemption is always allowed once a
> balance exists). `pointsPer100Rupee` is the earn rate per ₹100 of grand total;
> `rupeePerPoint` converts redeemed points into a rupee discount at billing.
> Same install-wide singleton semantics as `expiry_policy` — read by
> `services/customerEngagement.ts getLoyaltySettings()`.

### `backup_history`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `type` | TEXT | daily/weekly/manual |
| `status` | TEXT | success/failed/in_progress |
| `file_path` | TEXT | |
| `file_size` | INTEGER | Bytes |
| `error_message` | TEXT | |
| `verified_at` | INTEGER | |
| `created_by` | TEXT (FK) | users.id |
| `created_at` | INTEGER | |

### `outbox_events`
Migration `0001_platform_foundations.sql`.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `type` | TEXT | e.g. `message.send`, `report.ready` |
| `aggregate_type` / `aggregate_id` | TEXT | Source record |
| `payload` | TEXT | JSON |
| `status` | TEXT | pending/processing/done/failed |
| `attempts` | INTEGER | Incremented on `failed` ack |
| `available_at` | INTEGER | Earliest processing time |
| `idempotency_key` | TEXT (UNIQUE) | Same key = same row |

### `stored_files`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `owner_id` | TEXT (FK) | users.id — read requires owner |
| `purpose` | TEXT | prescription/ocr/attachment |
| `filename` / `content_type` / `size` | | |
| `sha256` | TEXT | Integrity hash |
| `path` | TEXT | `DATA_DIR/files/<ownerId>/...` |

### `audit_events` (append-only)
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `actor_id` | TEXT (FK) | users.id |
| `action` / `entity` | TEXT | e.g. `invoice.cancel` / `invoice` |
| `entity_id` | TEXT | |
| `metadata` | TEXT | JSON |

### `user_devices`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `user_id` | TEXT (FK) | users.id |
| `device_name` / `platform` / `app_version` | TEXT | |
| `device_token` | TEXT (UNIQUE) | Returned ONLY by POST /api/devices/register |
| `revoked` | INTEGER | 0/1 — flag, never a delete (revoked = 401 kill-switch) |
| `last_seen_at` | INTEGER | Heartbeat on every guarded request with the header |

### `sync_operations`
Migration `0014_sync_devices.sql`. Append-only offline sync journal backing
`POST /api/sync/push` and the cursor feed of `GET /api/sync/pull`
(docs/API.md "Devices, Sync & Permissions"). Invoices/journals/orders are
server-authoritative and never recorded here.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `operation_id` | TEXT | Client idempotency key — UNIQUE(created_by, operation_id) |
| `device_token` | TEXT | Optional X-Device-Token that pushed the op |
| `entity` / `action` | TEXT | medicine/customer/supplier/setting + create/update |
| `payload` | TEXT | JSON operation payload (as pushed) |
| `entity_id` | TEXT | Row the operation touched |
| `base_version` | TEXT | Client's last-seen `updatedAt` (stale ⇒ conflict) |
| `applied_version` | TEXT | New `updatedAt` after an applied write |
| `status` | TEXT | applied / conflict / duplicate / error |
| `conflict_json` | TEXT | Server row snapshot handed back on conflict |
| `error` | TEXT | Per-op error message (`unsupported entity`, validation, …) |
| `applied_at` / `created_at` | INTEGER | Unix **milliseconds** (`timestamp_ms`); `applied_at` drives the pull cursor |

### `feature_flags`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `key` | TEXT (UNIQUE) | |
| `value` | TEXT | JSON |
| `updated_at` | INTEGER | |

### `purchase_imports`
Migration `0002_purchase_imports.sql` (+ `0003_purchase_import_source.sql` for OCR source tracking). Draft CSV/OCR purchase import sessions (review-to-post).
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `filename` | TEXT | Uploaded CSV / invoice image filename |
| `status` | TEXT | draft / committed |
| `mappings` | TEXT | JSON `{ "Column Name": "target_field" }` |
| `defaults` | TEXT | JSON `{ supplierId?, gstRate? }` |
| `source` | TEXT | `csv` (default) / `ocr` — migration `0003` |
| `file_id` | TEXT | stored_files.id of the OCR source image — migration `0003` |
| `header_fields` | TEXT | JSON `{ billNo/billDate/supplierName: { value, confidence } }` from OCR — migration `0003` |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

### `purchase_import_rows`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `import_id` | TEXT (FK) | purchase_imports.id (ON DELETE CASCADE) |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `row_index` | INTEGER | 0-based data row index |
| `raw` | TEXT | JSON `{ column: value }`, header order preserved |
| `normalized` | TEXT | JSON produced by `normalizeRow` |
| `medicine_id` | TEXT (FK) | medicines.id — nullable until matched |
| `issues` | TEXT | JSON `[{ field, message, severity }]` |
| `row_status` | TEXT | pending / mapped / error / committed |

### `medicine_substitutes`
Migration `0004_medicine_substitutes.sql`. Explicit pharmacist-curated substitute links between two medicines of the same tenant (Product Intelligence). The unique index on `(created_by, medicine_id, substitute_medicine_id)` makes link creation idempotent.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `medicine_id` | TEXT (FK) | medicines.id — the source medicine |
| `substitute_medicine_id` | TEXT (FK) | medicines.id — the suggested substitute |
| `reason` | TEXT | Optional pharmacist note |
| `created_at` | INTEGER | |

### `supplier_quotes`
Migration `0005_procurement.sql`. Manually recorded supplier quotations for a medicine (phone/WhatsApp offers) used by supplier comparison and the shortbook "recommended supplier". Tenant-scoped by `created_by`; one row per recorded quote (the latest per supplier wins in comparisons).
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `supplier_id` | TEXT (FK) | suppliers.id |
| `medicine_id` | TEXT (FK) | medicines.id |
| `quoted_rate` | REAL | Quoted rate per unit (≥ 0) |
| `quote_date` | TEXT | ISO date the quote was given |
| `notes` | TEXT | Optional context (channel, validity) |
| `created_at` | INTEGER | |

### `stock_audits`
Migration `0007_stock_audits.sql`. Physical stock-take sessions (Task 7). One row per audit run; `status` moves `open → approved` (approval posts `adjustment` inventory transactions) or `open → cancelled`. Tenant-scoped by `created_by`; approval stamps `approved_by`/`approved_at`.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `status` | TEXT | `open` (default) / `approved` / `cancelled` |
| `note` | TEXT | Optional session note |
| `started_at` | INTEGER | When the session was opened |
| `approved_at` | INTEGER | Approval timestamp (nullable) |
| `approved_by` | TEXT | users.id of the approver (nullable) |
| `created_at` | INTEGER | |

### `stock_audit_counts`
Migration `0007_stock_audits.sql`. Per-batch physical counts for a session.
`UNIQUE(audit_id, batch_id)` makes counting an upsert: the first insert freezes
`expected_quantity` at the batch's quantity at that moment; later counts update
`counted_quantity`, `recount` (latest wins) and `counted_at` on the same row.
Variance = `counted_quantity - expected_quantity`; approval writes
`inventory_transactions` rows of type `adjustment` for non-zero variances only.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `audit_id` | TEXT (FK) | stock_audits.id |
| `created_by` | TEXT (FK) | users.id — who recorded the count |
| `medicine_id` | TEXT (FK) | medicines.id |
| `batch_id` | TEXT (FK) | batches.id (unique per audit) |
| `expected_quantity` | REAL | Frozen snapshot at first count |
| `counted_quantity` | REAL | Physical count (≥ 0) |
| `recount` | REAL | Latest re-count (nullable) |
| `counted_at` | INTEGER | Last time this batch was counted |
| `created_at` | INTEGER | |

### `message_deliveries`
Migration `0008_messaging.sql`. One row per outbound WhatsApp/SMS/email message (Task 9).
`status` moves `queued → sending → sent` (or `failed`, or `opted_out` when the
customer consented out — that row never gets an outbox event). `attempts` is the
source of truth for retries: transient failures schedule a fresh `message.send`
outbox event with an exponential backoff (2^attempts minutes, cap 60) and gives
up permanently after 5 attempts. `refill`-aggregate sends reconcile the
linked `refill_reminders` row to `sent` only after a confirmed send.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `channel` | TEXT | `whatsapp` / `sms` / `email` |
| `recipient` | TEXT | Phone number or email address |
| `template` | TEXT | `invoice_share` / `refill_reminder` / `payment_due` / `custom` |
| `variables` | TEXT | JSON template variables |
| `aggregate_type` | TEXT | `invoice` / `refill` / `message` (nullable) |
| `aggregate_id` | TEXT | Related row id (nullable) |
| `status` | TEXT | `queued` (default) / `sending` / `sent` / `failed` / `opted_out` |
| `provider_id` | TEXT | Provider message id after a successful send (nullable) |
| `error` | TEXT | Last error message (nullable) |
| `attempts` | INTEGER | Send attempts (default 0) |
| `outbox_event_id` | TEXT | Current `outbox_events.id` driving this delivery (nullable) |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

### `communication_preferences`
Migration `0008_messaging.sql`. Per-customer channel consent (Task 9). Opted-out
customers are skipped at queue time (`queueMessage` / `sendRefillDue`) and
`opted_out` deliveries can never be retried. SQLite treats NULLs as distinct in
UNIQUE constraints, so rows with a `customer_id = NULL` are enforced
select-then-update in the messaging service.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `customer_id` | TEXT (FK) | customers.id (nullable) |
| `channel` | TEXT | `whatsapp` / `sms` / `email` |
| `opted_out` | INTEGER | 1 = opted out (default 0) |
| `updated_at` | INTEGER | |
| | | `UNIQUE(created_by, customer_id, channel)` |

### `loyalty_ledger`
Migration `0009_customer_growth.sql`. Immutable customer points ledger (Task 10).
The balance is **always `SUM(points)`** — there is no balance column and no direct
edits. Redeems are negative entries; invoice creation writes `earn`/`redeem` rows
POST-COMMIT with idempotency keys `sale:<invoiceId>` / `redeem:<invoiceId>` (a
post-commit failure is audited as `loyalty.post_failed`, never rolled back).
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `customer_id` | TEXT (FK) | customers.id |
| `points` | REAL | positive = earn, negative = redeem |
| `type` | TEXT | `earn` / `redeem` / `adjust` |
| `reason` | TEXT | |
| `invoice_id` | TEXT | originating invoice (nullable) |
| `idempotency_key` | TEXT | replay guard (nullable — NULLs may repeat) |
| `created_at` | INTEGER | |
| | | `UNIQUE(created_by, idempotency_key)` |

### `offers`
Migration `0009_customer_growth.sql`. Bill/product discounts with a validity
window (Task 10). Offers are **never hard-deleted** — deactivate with
`is_active = 0`. Evaluated server-side at invoice creation against the computed
pre-GST subtotal (`evaluateOffer`); a non-applicable offer fails the sale 400.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `name` | TEXT | |
| `type` | TEXT | `fixed` (₹) / `percent` (%) |
| `value` | REAL | discount amount or percentage |
| `medicine_id` | TEXT | NULL = whole bill; otherwise the bill must contain it |
| `min_amount` | REAL | minimum bill subtotal (default 0) |
| `starts_on` | TEXT | YYYY-MM-DD, inclusive |
| `ends_on` | TEXT | YYYY-MM-DD, inclusive |
| `is_active` | INTEGER | 1 = active (default 1) |
| `created_at` / `updated_at` | INTEGER | |

### `campaigns`
Migration `0009_customer_growth.sql`. Audience-targeted message blasts (Task 10)
delivered through the Task 9 messaging outbox — idempotency key
`camp:<campaignId>:<customerId>` per recipient, so a double send replays instead
of duplicating. Consent is re-checked per recipient (`skippedOptOut`), and a
customer without a phone (whatsapp/sms) or email (email) is `skippedNoContact`.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `name` | TEXT | |
| `channel` | TEXT | `whatsapp` / `sms` / `email` |
| `template` | TEXT | default `custom` (body rendered per recipient) |
| `body` | TEXT | message body with `{customerName}` / `{storeName}` tokens |
| `audience` | TEXT | JSON `{ type: "all" \| "rfm" \| "medicine" \| "balance" \| "refill", ... }` |
| `schedule_at` | TEXT | ISO datetime; null = send immediately |
| `status` | TEXT | `draft` / `scheduled` / `done` / `cancelled` (default `draft`) |
| `stats` | TEXT | JSON `{ audience, queued, skippedOptOut, skippedNoContact }` |
| `created_at` / `updated_at` | INTEGER | |

### `accounts`
Migration `0010_accounting.sql`. Per-tenant chart of accounts (Task 11).
The 14 **system** rows (seeded lazily by `ensureChart` at the top of every
ledger export) are `CASH, BANK, AR, AP, INVENTORY, SALES, PURCHASES,
SALES_RETURNS, PURCHASE_RETURNS, GST_OUTPUT, GST_INPUT, DISCOUNT, EXPENSE,
CAPITAL`; manual accounts are created with `is_system = 0`. Codes are
upper-case and unique per tenant.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `code` | TEXT | e.g. `CASH` (upper-cased on create) |
| `name` | TEXT | display name |
| `type` | TEXT | `asset` / `liability` / `equity` / `income` / `expense` |
| `is_system` | INTEGER | 1 = seeded system account (default 1), never deleted |
| `created_at` | INTEGER | |
| | | `UNIQUE(created_by, code)` |

### `journal_entries`
Migration `0010_accounting.sql`. One balanced double-entry posting (Task 11).
Entries are **append-only**: cancelling a source inserts a mirrored reversal
entry (`is_reversal = 1`, `source_type = 'reversal'`, `source_id` = original
entry id) and stamps `reversed_by` on the original — never a delete.
`UNIQUE(created_by, source_type, source_id)` makes `post` idempotent per
business source (invoice/purchase/payment/sales_return); manual entries carry
`source_id = NULL`, which SQLite UNIQUE treats as distinct by design.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `date` | TEXT | YYYY-MM-DD posting date (checked against closed periods) |
| `source_type` | TEXT | `invoice` / `purchase` / `payment` / `sales_return` / `manual` / `reversal` |
| `source_id` | TEXT | originating row id (nullable for manual) |
| `description` | TEXT | e.g. the invoice/bill number |
| `is_reversal` | INTEGER | 1 = mirrored cancellation entry (default 0) |
| `reversed_by` | TEXT | `journal_entries.id` of the reversal (nullable) |
| `created_at` | INTEGER | |
| | | `UNIQUE(created_by, source_type, source_id)` |

### `journal_lines`
Migration `0010_accounting.sql`. Debit/credit legs of a journal entry (Task 11).
Exactly one side is > 0 per line and `SUM(debit) ≈ SUM(credit)` (₹0.01
tolerance) — enforced by `services/accounting.ts post`. `party_type`/`party_id`
tag the customer/supplier a leg settles.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `entry_id` | TEXT (FK) | journal_entries.id |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `account_id` | TEXT (FK) | accounts.id |
| `debit` | REAL | ≥ 0 (default 0) |
| `credit` | REAL | ≥ 0 (default 0) |
| `party_type` | TEXT | `customer` / `supplier` (nullable) |
| `party_id` | TEXT | party row id (nullable) |
| `memo` | TEXT | e.g. expense category |

### `accounting_periods`
Migration `0010_accounting.sql`. Closed date ranges (Task 11) — `post` refuses
any entry whose `date` falls inside `from_date..to_date` for the tenant
(400 `Period closed`). Closing writes an `accounting.period_closed` audit
event; reopening deletes the row (`accounting.period_reopened`).
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `from_date` | TEXT | YYYY-MM-DD, inclusive |
| `to_date` | TEXT | YYYY-MM-DD, inclusive |
| `closed_at` | INTEGER | timestamp when closed |
| `closed_by` | TEXT | users.id of the closer |
| | | `UNIQUE(created_by, from_date, to_date)` |

### `bank_statement_rows`
Migration `0011_reconciliation.sql`. One imported bank statement line (Task
12). `amount` is **signed** (inflow `+`, outflow `−`) and `direction` mirrors
its sign (`in` / `out`). `raw` keeps the original CSV cells as JSON and
`sha256` hashes `date|reference|description|amount`, so re-importing the same
file is a no-op. These rows are matched against `journal_lines` on the `BANK`
account — they are NOT journal entries and never affect the trial balance.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `statement_date` | TEXT | YYYY-MM-DD (normalized from `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD/MM/YY`) |
| `reference` | TEXT | UTR / cheque no / ref (nullable) |
| `description` | TEXT | narration / particulars (nullable) |
| `amount` | REAL | signed: inflow `+`, outflow `−` |
| `direction` | TEXT | `in` / `out` (normalized from the amount sign or a direction column) |
| `raw` | TEXT | JSON array of the original CSV cells |
| `sha256` | TEXT | row fingerprint for import de-duplication |
| `imported_at` | INTEGER | timestamp |
| | | `UNIQUE(created_by, sha256)` |

### `reconciliation_matches`
Migration `0011_reconciliation.sql`. A 1:1 link between one statement row and
one journal line (Task 12) — a row reconciles to at most one line and a line
is claimed at most once. Match/unmatch only inserts/deletes this table: **the
journal is never mutated**, so the cash/bank books always agree with the trial
balance.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `bank_row_id` | TEXT (FK) | bank_statement_rows.id |
| `journal_line_id` | TEXT (FK) | journal_lines.id |
| `matched_at` | INTEGER | timestamp |
| `matched_by` | TEXT (FK) | users.id of the matcher |
| `notes` | TEXT | free text; required when `force` is used |
| `created_at` | INTEGER | |
| | | `UNIQUE(created_by, bank_row_id)` |
| | | `UNIQUE(created_by, journal_line_id)` |

### `compliance_submissions`
Migration `0012_compliance.sql`. One e-invoice / e-way bill provider
submission (Task 13). `UNIQUE(created_by, invoice_id, kind)` is the
idempotency guard — an invoice has at most one live `einvoice` row and one
live `ewaybill` row; rejected/cancelled rows are updated in place on
re-generate. `request_hash` fingerprints the payload sent, `response_json`
keeps the raw provider reply, `vehicle_json` carries e-way specifics
(transporter, distance, vehicle). **Provider secrets are never stored here**
— they live only in process env (`EINVOICE_*`, `EWAY_*`).
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `invoice_id` | TEXT (FK) | invoices.id |
| `kind` | TEXT | `einvoice` / `ewaybill` |
| `status` | TEXT | `pending` / `submitted` / `accepted` / `rejected` / `cancelled` |
| `provider` | TEXT | `fake` / `nic` (name only, no credentials) |
| `irn` | TEXT | Invoice Reference Number (nullable) |
| `ack_no` | TEXT | Ack no (e-way: e-way bill number) |
| `ack_date` | TEXT | Ack date (e-way: valid upto) |
| `qr_data` | TEXT | Base64 QR payload from the provider |
| `request_hash` | TEXT | sha256 of the exact request payload |
| `response_json` | TEXT | Raw provider response (JSON) |
| `error` | TEXT | Last failure message / missing env names |
| `vehicle_json` | TEXT | e-way: transporter, distance, vehicle, reason |
| `submitted_at` | INTEGER | timestamp — anchors the 24h cancel window |
| `cancelled_at` | INTEGER | timestamp (nullable) |
| `created_at` | INTEGER | timestamp |
| `updated_at` | INTEGER | timestamp |
| | | `UNIQUE(created_by, invoice_id, kind)` |

### `customer_orders`
Migration `0013_customer_orders.sql`. One customer order placed through the
public ordering portal (Task 14). **Single-store convention:** `created_by` AND
`store_id` both hold the install owner's user id (public endpoints take
`storeId` = the owner id), so the denormalized `store_id` lets the public status
view validate ownership without a join. `status` follows
`pending → accepted → packed → ready → delivered`; `rejected` (from
pending/accepted) and `cancelled` (from pending/accepted/packed) are terminal
and carry `reason`. `invoice_id` is stamped by the deliver transition — **stock
is never touched here**: deduction happens on the existing invoice create path
(FEFO/expiry policy included). `prescription_file_id` points at a
`stored_files` row uploaded through `POST /api/public/files` (owner =
`store_id`, purpose `order-prescription`).
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — install owner (= storeId) |
| `store_id` | TEXT | denormalized owner user id (public status-view check) |
| `customer_id` | TEXT (FK) | customers.id (nullable — ad-hoc orders) |
| `customer_name` | TEXT | required, trimmed |
| `phone` | TEXT | required, trimmed — WhatsApp notify target |
| `delivery_address` | TEXT | ≤300 chars (nullable) |
| `notes` | TEXT | ≤500 chars (nullable) |
| `prescription_file_id` | TEXT (FK) | stored_files.id (nullable) |
| `status` | TEXT | `pending` / `accepted` / `packed` / `ready` / `delivered` / `rejected` / `cancelled` |
| `reason` | TEXT | reject/cancel reason (≥3 chars, nullable) |
| `invoice_id` | TEXT (FK) | invoices.id — set by `deliver` (nullable) |
| `subtotal` | REAL | Σ(unit_price × quantity) snapshot at submit |
| `created_at` | INTEGER | timestamp |
| `updated_at` | INTEGER | timestamp |

### `customer_order_items`
Migration `0013_customer_orders.sql`. One requested medicine per row.
`medicine_name` and `unit_price` are snapshots taken at submit time, so later
catalog edits never rewrite order history.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `order_id` | TEXT (FK) | customer_orders.id (`ON DELETE CASCADE`) |
| `medicine_id` | TEXT (FK) | medicines.id — must be `created_by = store_id` at submit |
| `medicine_name` | TEXT | snapshot of medicines.name |
| `quantity` | REAL | > 0 |
| `unit_price` | REAL | snapshot of medicines.selling_price |
| `created_at` | INTEGER | timestamp |

### `data_imports`
Migration `0015_data_migration.sql`. Staged sessions for the full data
migration pipeline (Task 16 — customers / suppliers / medicines / opening
stock), mirroring `purchase_imports` but entity-agnostic. Lifecycle:
`draft → committed → rolled_back` (rollback is all-or-nothing and only runs
once). See docs/API.md "Data Migration".
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id — tenant scope |
| `entity_type` | TEXT | `customers` / `suppliers` / `medicines` / `stock` |
| `filename` | TEXT | uploaded CSV name (also the stock transaction reference) |
| `status` | TEXT | `draft` (default) / `committed` / `rolled_back` |
| `created_at` | INTEGER | timestamp |
| `updated_at` | INTEGER | timestamp |

### `data_import_rows`
One staged CSV row: raw cells, the normalized JSON, per-row issues and the
row status lifecycle (`pending → ok | error | skipped → committed →
rolled_back`). `created_entity_id` records what commit created (customer /
supplier / medicine / batch id) so rollback can find and remove it — NULL for
skipped rows.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `import_id` | TEXT (FK) | data_imports.id (`ON DELETE CASCADE`) |
| `created_by` | TEXT (FK) | users.id |
| `row_index` | INTEGER | 0-based data-row position in the CSV |
| `raw` | TEXT | JSON: source column → cell value |
| `normalized` | TEXT | JSON produced by `normalizeEntityRow` (+ resolved ids/prices) |
| `issues` | TEXT | JSON `[{ field, message, severity: error\|warning }]` |
| `row_status` | TEXT | `pending` / `ok` / `error` / `skipped` / `committed` / `rolled_back` |
| `created_entity_id` | TEXT | entity id created at commit (rollback target; nullable) |
| `created_at` | INTEGER | timestamp |

### `scheduled_reports`
Migration `0016_integrations_reports.sql`. One scheduled report definition
(Task 17). `schedule` is a JSON preset (`{kind:"daily",time}` /
`{kind:"weekly",day,time}` with day 0-6 Sun-Sat / `{kind:"monthly",day,time}`
with day 1-28), `recipients` is `[{channel:"email"|"sms", address}]` and
`filters` is `{daysBack}` (period-relative window ending at run time).
`next_run_at` / `last_run_at` are SERVER-LOCAL wall-clock strings
`YYYY-MM-DDTHH:mm` (no zone suffix) — they are string-compared against the
server's local clock by the worker tick. `format` is `csv` only (PDF is
rejected at the API with "PDF export not supported yet"). Tenant-scoped by
`created_by`.
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `created_by` | TEXT (FK) | users.id |
| `name` | TEXT | display name (also part of the CSV filename) |
| `report_type` | TEXT | `sales` / `stock` / `purchase` / `payments` / `party` |
| `schedule` | TEXT | JSON schedule preset (see above) |
| `recipients` | TEXT | JSON `[{ channel, address }]` (may be empty = file-only) |
| `format` | TEXT | `csv` (default) |
| `filters` | TEXT | JSON `{ daysBack }` — default 30, clamped 1..365 |
| `next_run_at` | TEXT | local `YYYY-MM-DDTHH:mm` of the next automatic run |
| `last_run_at` | TEXT | ISO timestamp of the most recent run |
| `enabled` | INTEGER | 1 (default) / 0 — disabled reports are never ticked |
| `created_at` | INTEGER | timestamp |
| `updated_at` | INTEGER | timestamp |

NOTE: integrations do NOT get their own table — each provider's configuration
lives in the `settings` singleton under `integration:<providerId>` (JSON with
`enc:v1:` AES-256-GCM encrypted secrets; key file `DATA_DIR/integration.key`).

### `scheduled_report_runs`
Migration `0016_integrations_reports.sql`. One row per execution, appended by
the manual `POST /:id/run` endpoint and the worker tick. Lifecycle
`running → done | failed`. `file_id` references the `stored_files` row
(purpose `scheduled-report`) but is deliberately NOT a foreign key (file
retention may remove the file; a dangling id must not block a run). Deleting
the parent report cascades its runs (`ON DELETE CASCADE`, enforced by
`foreign_keys = ON` on the app connection).
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | |
| `scheduled_report_id` | TEXT (FK) | scheduled_reports.id (`ON DELETE CASCADE`) |
| `created_by` | TEXT (FK) | users.id |
| `started_at` | INTEGER | timestamp |
| `finished_at` | INTEGER | timestamp (NULL while `running`) |
| `status` | TEXT | `running` (default) / `done` / `failed` |
| `error` | TEXT | failure message when `failed` |
| `row_count` | INTEGER | CSV data rows produced |
| `file_id` | TEXT | stored_files.id (purpose `scheduled-report`; nullable) |
| `outbox_event_id` | TEXT | first queued `message.send` event (nullable) |
| `message_status` | TEXT | `queued` / `partial` / `failed` / `none` (best effort) |
| `created_at` | INTEGER | timestamp |

## Key Indexes

```sql
-- Medicine barcode search (critical for POS)
CREATE INDEX medicines_barcode_idx ON medicines(barcode);
CREATE INDEX medicines_name_idx ON medicines(name);

-- Batch FEFO queries
CREATE INDEX batches_expiry_idx ON batches(expiry_date);
CREATE INDEX batches_medicine_idx ON batches(medicine_id);

-- Invoice queries
CREATE INDEX invoices_date_idx ON invoices(date);
CREATE INDEX invoices_customer_idx ON invoices(customer_id);
CREATE INDEX invoices_invoice_no_idx ON invoices(invoice_no);

-- Inventory transactions
CREATE INDEX inv_tx_medicine_idx ON inventory_transactions(medicine_id);
CREATE INDEX inv_tx_batch_idx ON inventory_transactions(batch_id);
CREATE INDEX inv_tx_created_idx ON inventory_transactions(created_at);

-- Purchase CSV imports (tenant + session lookups)
CREATE INDEX purchase_imports_created_by_idx ON purchase_imports(created_by);
CREATE INDEX purchase_imports_status_idx ON purchase_imports(status);
CREATE INDEX purchase_import_rows_import_idx ON purchase_import_rows(import_id);
CREATE INDEX purchase_import_rows_created_by_idx ON purchase_import_rows(created_by);

-- Medicine substitutes (explicit alternative links)
CREATE UNIQUE INDEX medicine_substitutes_unique_idx ON medicine_substitutes(created_by, medicine_id, substitute_medicine_id);
CREATE INDEX medicine_substitutes_created_by_idx ON medicine_substitutes(created_by);
CREATE INDEX medicine_substitutes_medicine_idx ON medicine_substitutes(medicine_id);

-- Supplier quotes (procurement comparison)
CREATE INDEX supplier_quotes_created_by_medicine_idx ON supplier_quotes(created_by, medicine_id);
CREATE INDEX supplier_quotes_created_by_supplier_idx ON supplier_quotes(created_by, supplier_id);

-- Stock audits (tenant + status lookups; counts by session)
CREATE INDEX stock_audits_created_by_idx ON stock_audits(created_by);
CREATE INDEX stock_audits_status_idx ON stock_audits(status);
CREATE INDEX stock_audit_counts_audit_idx ON stock_audit_counts(audit_id);
CREATE INDEX stock_audit_counts_created_by_idx ON stock_audit_counts(created_by);
CREATE UNIQUE INDEX stock_audit_counts_audit_batch_unique ON stock_audit_counts(audit_id, batch_id);

-- Prescriptions (workflow + invoice linkage, migration 0006)
CREATE INDEX prescriptions_customer_id_idx ON prescriptions(customer_id);
CREATE INDEX prescriptions_status_idx ON prescriptions(status);
CREATE INDEX invoices_prescription_id_idx ON invoices(prescription_id);

-- Messaging (migration 0008: deliveries history + consent lookups)
CREATE INDEX message_deliveries_created_by_idx ON message_deliveries(created_by, created_at);
CREATE INDEX message_deliveries_aggregate_idx ON message_deliveries(created_by, aggregate_type, aggregate_id);
CREATE INDEX message_deliveries_status_idx ON message_deliveries(status);
CREATE UNIQUE INDEX communication_preferences_uniq_idx ON communication_preferences(created_by, customer_id, channel);
CREATE INDEX communication_preferences_created_by_idx ON communication_preferences(created_by);
CREATE INDEX communication_preferences_customer_idx ON communication_preferences(customer_id);

-- Customer growth (migration 0009: loyalty balance, offer lookup, campaign list)
CREATE INDEX loyalty_ledger_customer_idx ON loyalty_ledger(created_by, customer_id);
-- loyalty_ledger also carries the table constraint UNIQUE(created_by, idempotency_key)
CREATE INDEX offers_created_by_idx ON offers(created_by);
CREATE INDEX offers_active_idx ON offers(created_by, is_active);
CREATE INDEX campaigns_created_by_idx ON campaigns(created_by);
CREATE INDEX campaigns_status_idx ON campaigns(status);

-- Accounting (migration 0010: entry lookup by date/source, lines by entry/account)
-- journal_entries also carries UNIQUE(created_by, source_type, source_id)
CREATE INDEX journal_entries_date_idx ON journal_entries(created_by, date);
CREATE INDEX journal_entries_source_idx ON journal_entries(created_by, source_type);
CREATE INDEX journal_lines_entry_idx ON journal_lines(entry_id);
CREATE INDEX journal_lines_account_idx ON journal_lines(created_by, account_id);
-- accounts: UNIQUE(created_by, code); accounting_periods: UNIQUE(created_by, from_date, to_date)

-- Reconciliation (migration 0011: statement rows by tenant/date, match lookup)
-- bank_statement_rows: UNIQUE(created_by, sha256)
-- reconciliation_matches: UNIQUE(created_by, bank_row_id) + UNIQUE(created_by, journal_line_id)
CREATE INDEX bank_statement_rows_date_idx ON bank_statement_rows(created_by, statement_date);
CREATE INDEX reconciliation_matches_row_idx ON reconciliation_matches(bank_row_id);
CREATE INDEX reconciliation_matches_line_idx ON reconciliation_matches(journal_line_id);

-- Compliance (migration 0012: e-invoice/e-way submissions by tenant/kind)
-- compliance_submissions: UNIQUE(created_by, invoice_id, kind)
CREATE INDEX compliance_submissions_invoice_idx ON compliance_submissions(created_by, invoice_id);
CREATE INDEX compliance_submissions_created_by_idx ON compliance_submissions(created_by, created_at);
CREATE INDEX compliance_submissions_status_idx ON compliance_submissions(created_by, status);

-- Online orders (migration 0013: staff queue by status/recency, items by order)
CREATE INDEX customer_orders_created_by_status_idx ON customer_orders(created_by, status);
CREATE INDEX customer_orders_created_by_created_at_idx ON customer_orders(created_by, created_at);
CREATE INDEX customer_order_items_order_idx ON customer_order_items(order_id);

-- Sync journal (migration 0014: cursor pull by tenant/time; idempotency comes
-- from UNIQUE(created_by, operation_id))
CREATE UNIQUE INDEX sync_operations_created_by_operation_id_uq ON sync_operations(created_by, operation_id);
CREATE INDEX sync_operations_created_by_applied_at_idx ON sync_operations(created_by, applied_at);

-- Data migration sessions (migration 0015: tenant list + row lookup)
CREATE INDEX data_imports_created_by_idx ON data_imports(created_by);
CREATE INDEX data_imports_status_idx ON data_imports(status);
CREATE INDEX data_import_rows_import_idx ON data_import_rows(import_id);
CREATE INDEX data_import_rows_created_by_idx ON data_import_rows(created_by);

-- Scheduled reports (migration 0016: worker due-scan + tenant run history)
CREATE INDEX scheduled_reports_owner_idx ON scheduled_reports(created_by, enabled, next_run_at);
CREATE INDEX scheduled_report_runs_owner_idx ON scheduled_report_runs(created_by, started_at);
CREATE INDEX scheduled_report_runs_report_idx ON scheduled_report_runs(scheduled_report_id);
```

## Tax Snapshot Pattern

Every invoice line item snapshots the GST rate used at time of sale. Even if the medicine's `gst_rate` is later changed, all historical invoice calculations remain correct because the tax values are stored directly on `invoice_items`.

## Inventory Transaction Pattern

Never mutate `batches.quantity` directly. Always create an `inventory_transactions` row first:

```ts
// WRONG
await db.update(batches).set({ quantity: qty - sold }).where(eq(batches.id, id));

// CORRECT
await db.insert(inventoryTransactions).values({
  id: generateId(),
  medicineId,
  batchId: id,
  type: "sales",
  quantity: -sold,
  balanceAfter: qty - sold,
  rate: sellingPrice,
  invoiceId,
  reference: invoiceNo,
  createdBy: userId,
  createdAt: now,
});
await db.update(batches).set({ quantity: qty - sold }).where(eq(batches.id, id));
```
