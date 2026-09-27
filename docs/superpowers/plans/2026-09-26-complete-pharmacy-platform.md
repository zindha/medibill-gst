# Complete Pharmacy Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every verified LocalWell/Gofrugal capability gap in MediBillGST, including partial features that currently exist only as data fields or dormant Convex modules.

**Architecture:** Keep the current Fastify + SQLite + Drizzle application as the active runtime. Add bounded modules for purchase ingestion, pharmacy intelligence, communications, accounting, ordering, integrations, and administration instead of extending `reports.ts` or `SettingsPage.tsx` indefinitely. All new records are tenant-scoped by `createdBy`; external providers are accessed through provider interfaces with a durable outbox so billing never fails because messaging or integrations are unavailable.

**Tech Stack:** React + Vite + TypeScript + Tailwind; Fastify + Zod + Drizzle ORM + better-sqlite3; existing OCR, barcode, backup, catalog and auth infrastructure; provider adapters for SMS/WhatsApp/email/payment/e-invoice services.

**Spec:** Competitor research from `https://localwell.in` and `https://www.gofrugal.com/retail/pharmacy-software/`, current implementation inventory in `docs/superpowers/plans/2026-09-25-localwell-parity.md`, and active source under `src/` and `apps/server/src/`.

## Global Constraints

- Preserve the current single-store scope; do not add Branch Transfer, Delivery Challan, Quotation, or Duplicate Medicines Across Branches unless separately approved.
- The active runtime is Fastify/SQLite. `src/convex/**` is reference/dormant code and must not become a second production backend.
- Every table, query, job, report, and provider event is scoped by `createdBy` or an explicit store owner.
- Invoice creation, stock deduction, returns, and accounting journal creation remain one database transaction.
- External calls are asynchronous through an outbox; WhatsApp/SMS/email/provider failures never roll back a completed sale.
- PII and prescription images require access control, retention settings, audit logging, and encrypted-at-rest storage.
- Existing public APIs remain backward-compatible; new APIs use `/api/...` and return `{ success, data, error }`.
- Every feature ships with server tests, empty-state handling, CSV export where applicable, typecheck, `graphify update .`, and browser verification for user-facing work.
- No feature may claim “AI” unless the implementation has a deterministic fallback and records whether the result was generated, reviewed, or manually overridden.

## Current Gaps

| Area | Current state | Planned closure |
|---|---|---|
| Purchase ingestion | Manual purchase entry, catalog CSV and OCR utility; no reliable review-to-post pipeline | Tasks 1-2 |
| Alternatives and product intelligence | Catalog has composition; active app has no substitute workflow | Task 3 |
| Distributor procurement | Basic purchase/order reports; no rate comparison or supplier performance | Task 4 |
| Safety controls | Expiry report exists; no hard sale/purchase blocking or short-expiry policy | Task 5 |
| Prescriptions | Schema and dormant Convex functions; no complete Fastify/UI workflow | Task 6 |
| Audit and labels | Adjustments and barcode scanning exist; no stock-take sessions or label printing | Tasks 7-8 |
| Messaging | Refill records exist; no WhatsApp/SMS/email delivery | Task 9 |
| Customer growth | RFM exists; no loyalty, offers, campaigns, consent, or patient analytics | Task 10 |
| Accounting | Payments/expenses/P&L exist; no double-entry ledger or reconciliation | Tasks 11-12 |
| Compliance | GST reports exist; no e-invoice/e-way integration | Task 13 |
| Online orders | No customer order channel or delivery workflow | Task 14 |
| Cloud/device operations | Auth/backups exist; no device registry, sync, or admin controls | Task 15 |
| Migration/admin | Medicine CSV exists; no full migration, bulk bills, scheduled reports, or integrations center | Tasks 16-17 |

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/server/src/db/schema/index.ts` | Add ingestion, messaging, loyalty, accounting, prescription, audit, order, device and integration tables. |
| `apps/server/src/db/migrations/` | Add additive migrations for every schema change; never edit an applied migration. |
| `apps/server/src/services/` | Create `purchaseImport.ts`, `productIntelligence.ts`, `messaging.ts`, `accounting.ts`, `prescriptions.ts`, `stockAudit.ts`, `labels.ts`, `orders.ts`, `integrations.ts`, `migration.ts`, `reportsDelivery.ts`. |
| `apps/server/src/providers/` | Provider interfaces and adapters for WhatsApp, SMS, email, storage, payments and GST services. |
| `apps/server/src/routes/` | Add focused route modules instead of adding unrelated handlers to `reports.ts`. |
| `src/pages/` | Add `PurchaseImportPage`, `AlternativesPage`, `PrescriptionsPage`, `StockAuditPage`, `LabelsPage`, `CampaignsPage`, `AccountingPage`, `OrdersPage`, `IntegrationsPage`, `MigrationPage`, `DevicesPage`. |
| `src/components/` | Reusable import review grid, medicine alternative picker, prescription viewer, message status, accounting ledger, audit variance and print-label components. |
| `src/lib/api.ts` | Typed clients for every new route. |
| `docs/API.md`, `docs/DATABASE.md`, `docs/INTEGRATIONS.md` | Public contracts, schema and provider setup. |
| `apps/server/test/` | One focused test file per subsystem plus regression tests for invoice/stock/accounting atomicity. |

---

## Phase 0: Shared Foundations

### Task 0: Tenant, Audit, Outbox and File Storage Foundations

**Files:**
- Modify: `apps/server/src/db/schema/index.ts`
- Create: `apps/server/src/services/outbox.ts`, `apps/server/src/services/fileStorage.ts`, `apps/server/src/routes/outbox.ts`
- Modify: `apps/server/src/index.ts`, `apps/server/src/plugins/auth.ts`
- Test: `apps/server/test/platform-foundations.test.ts`

**Interfaces:**
- Produces `enqueueOutbox(input: { createdBy: string; type: string; aggregateType: string; aggregateId: string; payload: unknown; availableAt?: Date }): Promise<{ id: string }>`.
- Produces `fileStorage.put(input: { ownerId: string; purpose: string; filename: string; contentType: string; bytes: Buffer }): Promise<{ id: string; path: string; sha256: string }>` and `fileStorage.get(ownerId, id)`.
- Adds `outbox_events`, `stored_files`, `audit_events`, `user_devices`, and `feature_flags` tables.

- [x] **Step 1: Write failing tests** for tenant isolation, idempotent outbox keys, file ownership, and audit event creation.
- [x] **Step 2: Run** `npx vitest run test/platform-foundations.test.ts -v`; expect missing tables/functions.
- [x] **Step 3: Implement** migrations, typed services, `X-Request-Id` propagation, and `auditEvents.record({ actorId, action, entity, entityId, metadata })`.
- [x] **Step 4: Run** the focused test and existing invoice tests; expect all pass.
- [x] **Step 5: Document** retention and ownership rules in `docs/API.md` and `docs/DATABASE.md`.

## Phase 1: Purchase and Product Intelligence

### Task 1: Purchase CSV Import and Review-to-Post Pipeline

**Files:**
- Create: `apps/server/src/services/purchaseImport.ts`, `apps/server/src/routes/purchaseImports.ts`
- Create: `src/pages/PurchaseImportPage.tsx`, `src/components/purchase/PurchaseImportReview.tsx`
- Modify: `src/lib/api.ts`, `apps/server/src/index.ts`
- Test: `apps/server/test/purchase-import.test.ts`

**Interfaces:**
- `POST /api/purchase-imports` multipart CSV returns `{ importId, columns, rows, unresolved, warnings }`.
- `PUT /api/purchase-imports/:id/mappings` accepts `{ mappings: Record<string, string>; defaults: { supplierId?: string; gstRate?: string } }`.
- `POST /api/purchase-imports/:id/commit` accepts `{ rows: Array<{ rowId: string; medicineId: string; batchNo: string; expiryDate: string; quantity: number; freeQuantity: number; mrp: number; purchasePrice: number; sellingPrice: number; gstRate: string }>; billNo: string; billDate: string; supplierId?: string }` and returns the created purchase bill.
- Supported source columns: `bill_no`, `bill_date`, `supplier`, `product`, `barcode`, `batch`, `expiry`, `quantity`, `free_quantity`, `mrp`, `purchase_rate`, `gst_rate`, `discount`.

- [x] **Step 1: Write failing tests** for header aliases, malformed rows, duplicate batches, unresolved medicines, preview-only behavior, atomic commit, and tenant isolation.
- [x] **Step 2: Run** `npx vitest run test/purchase-import.test.ts -v`; expect failure.
- [x] **Step 3: Implement** streaming parser, normalized row model, catalog matching by barcode/name/composition, review status, and transactionally call the existing purchase creation service.
- [x] **Step 4: Build UI** with upload, column mapping, unresolved-product combobox, per-row validation, duplicate detection, preview totals, and explicit Commit button.
- [x] **Step 5: Verify** a 5,000-row CSV stays responsive and commit failures leave no partial batches/bill/items.

### Task 2: Purchase OCR Completion and Reconciliation

**Files:**
- Modify: `src/utils/billOcr.ts`, `src/pages/ScanBillPage.tsx`, `apps/server/src/services/purchaseImport.ts`
- Create: `src/components/purchase/OcrCorrectionGrid.tsx`
- Test: `apps/server/test/purchase-ocr.test.ts`

**Interfaces:**
- `POST /api/purchase-imports/ocr` accepts image/PDF and returns the same normalized import session as CSV.
- Each extracted field carries `{ value, confidence, source: "ocr" | "manual" }`.

- [x] **Step 1: Test** low-confidence batch, expiry, rate, GST and quantity fields require review.
- [x] **Step 2: Implement** OCR-to-import adapter, image storage from Task 0, correction tracking, and side-by-side source preview.
- [x] **Step 3: Add** “Create purchase bill” only after all blocking fields are resolved.
- [x] **Step 4: Verify** duplicate upload detection by file hash and idempotent commit.

### Task 3: Alternatives, Salt Search and Product Intelligence

**Files:**
- Create: `apps/server/src/services/productIntelligence.ts`, `apps/server/src/routes/productIntelligence.ts`
- Modify: `apps/server/src/routes/catalog.ts`, `src/hooks/useMedicineCatalog.ts`, `src/pages/CatalogPage.tsx`, `src/pages/BillingPage.tsx`, `src/lib/api.ts`
- Test: `apps/server/test/product-intelligence.test.ts`

**Interfaces:**
- `GET /api/medicines/:id/alternatives?inStock=true&maxPrice=&sameSchedule=true` returns `{ exactSalt: [], sameComposition: [], substitutes: [] }` with stock, batch, MRP, sale rate and margin.
- `GET /api/product-intelligence/search?q=&composition=&barcode=` returns normalized product facts and availability.
- `POST /api/medicines/:id/substitutes` accepts `{ substituteMedicineId, reason }`.

- [x] **Step 1: Test** exact composition matching, strength/form mismatch exclusion, schedule mismatch exclusion, in-stock ordering, and tenant overrides.
- [x] **Step 2: Implement** normalized composition tokens, strength/dosage-form comparison, explicit substitution links, and catalog fallback.
- [x] **Step 3: Add** alternative picker to the billing medicine dialog; pharmacist confirmation is required before replacing a line.
- [x] **Step 4: Add** catalog detail with company, composition, HSN, GST, pack and current stock.

### Task 4: Supplier Comparison and Procurement Intelligence

**Files:**
- Create: `apps/server/src/services/procurement.ts`, `apps/server/src/routes/procurement.ts`, `src/pages/ProcurementPage.tsx`
- Modify: `src/lib/api.ts`, `src/pages/PurchasesPage.tsx`, `src/pages/ReportsPage.tsx`
- Test: `apps/server/test/procurement.test.ts`

**Interfaces:**
- `GET /api/procurement/compare?medicineId=&quantity=` returns supplier quotes, last purchase rate, effective rate after discount/free quantity, credit terms and availability.
- `GET /api/procurement/rate-history?medicineId=&supplierId=&from=&to=` returns chronological rate records.
- `GET /api/procurement/suppliers/:id/metrics` returns fill rate, return rate, average delay, expiry value and outstanding balance.

- [x] **Step 1: Test** effective-cost calculations, supplier filtering, rate trend and missing supplier data.
- [x] **Step 2: Implement** purchase-rate history from bills and optional manual quote records.
- [x] **Step 3: Add** comparison panel in purchase entry and shortbook “recommended supplier”.
- [x] **Step 4: Add** supplier/manufacturer expiry responsibility reports.

## Phase 2: Safety, Prescriptions and Operations

### Task 5: Expiry Safety Policy and Batch Blocking

**Files:**
- Create: `apps/server/src/services/expiryPolicy.ts`, `apps/server/src/routes/expiryPolicies.ts`
- Modify: `apps/server/src/routes/invoices.ts`, `apps/server/src/routes/purchases.ts`, `src/pages/SettingsPage.tsx`, `src/pages/BillingPage.tsx`, `src/pages/PurchasesPage.tsx`
- Test: `apps/server/test/expiry-safety.test.ts`

**Interfaces:**
- Settings key `expiry_policy` stores `{ blockExpiredSale: boolean; blockExpiredPurchase: boolean; warningDays: number; blockWithinDays: number; allowOverrideRoles: string[] }`.
- `expiryPolicy.evaluate({ expiryDate, operation, userRole })` returns `{ allowed, severity, reason, requiresOverride }`.

- [x] **Step 1: Test** expired sale blocked, warning threshold shown, authorized override audited, and purchase expiry validation.
- [x] **Step 2: Implement** one service used by invoice creation, purchase creation, returns and batch edits.
- [x] **Step 3: Add** settings UI and clear override confirmation with reason.
- [x] **Step 4: Verify** FEFO never selects blocked batches.

### Task 6: Prescription Management and Dispensing

**Files:**
- Create: `apps/server/src/routes/prescriptions.ts`, `apps/server/src/services/prescriptions.ts`, `src/pages/PrescriptionsPage.tsx`, `src/components/prescriptions/PrescriptionViewer.tsx`
- Modify: `apps/server/src/db/schema/index.ts`, migrations, `apps/server/src/routes/invoices.ts`, `src/pages/BillingPage.tsx`, `src/lib/api.ts`
- Test: `apps/server/test/prescriptions.test.ts`

**Interfaces:**
- `POST /api/prescriptions` accepts `{ patientName, customerId?, patientAge?, patientGender?, doctorId?, date, notes, imageFile? }`.
- `GET /api/prescriptions?customerId=&doctorId=&status=` and `GET /api/prescriptions/:id`.
- `POST /api/prescriptions/:id/dispense` accepts `{ invoiceId, itemIds }` and records dispensing.
- Add `prescriptionId` and `prescriptionStatus` to invoices/items; status values `pending|verified|dispensed|rejected`.

- [x] **Step 1: Test** patient/customer linking, image ownership, doctor linkage, scheduled-drug warning, duplicate dispensing prevention and audit trail.
- [x] **Step 2: Implement** Fastify routes and migrate the existing schema fields into the active backend.
- [x] **Step 3: Add** billing prescription picker/upload, prescription-required warning for H/H1/X, and dispense action.
- [x] **Step 4: Add** searchable history and secure image viewer with retention control.

### Task 7: Physical Stock-Take and Variance Workflow

**Files:**
- Create: `apps/server/src/services/stockAudit.ts`, `apps/server/src/routes/stockAudits.ts`, `src/pages/StockAuditPage.tsx`
- Modify: `apps/server/src/db/schema/index.ts`, migrations, `src/pages/InventoryPage.tsx`, `src/lib/api.ts`
- Test: `apps/server/test/stock-audits.test.ts`

**Interfaces:**
- `POST /api/stock-audits` creates `{ id, status: "open", startedAt }`.
- `POST /api/stock-audits/:id/counts` accepts `{ medicineId, batchId, countedQuantity }`.
- `GET /api/stock-audits/:id` returns expected/count/variance rows.
- `POST /api/stock-audits/:id/approve` accepts `{ reason }` and writes adjustment transactions atomically.

- [x] **Step 1: Test** snapshot isolation, repeated counts, negative variance, approval permissions, and no edits after approval.
- [x] **Step 2: Implement** audit tables and variance computation from batch quantities.
- [x] **Step 3: Add** scan-first count UI, variance filters, approval dialog and printable audit report.

### Task 8: Barcode Label Generation and Printing

**Files:**
- Create: `apps/server/src/services/labels.ts`, `apps/server/src/routes/labels.ts`, `src/pages/LabelsPage.tsx`, `src/components/labels/LabelPreview.tsx`
- Modify: `src/lib/api.ts`, `src/pages/InventoryPage.tsx`, `apps/server/src/index.ts`
- Test: `apps/server/test/labels.test.ts`

**Interfaces:**
- `POST /api/labels/preview` accepts `{ items: Array<{ medicineId; batchId?; quantity; template }> }` and returns print-ready label data.
- Label data includes medicine name, pack, batch, expiry, MRP, barcode and optional store name.
- `GET /api/labels/templates` returns supported sizes `40x25mm`, `50x30mm`, `A4-24`.

- [x] **Step 1: Test** barcode generation, escaping, batch fields, quantity limits and template dimensions.
- [x] **Step 2: Implement** server data preparation and browser print CSS; do not require a proprietary printer SDK.
- [x] **Step 3: Add** label selection from inventory/purchase import and print preview.

## Phase 3: Communication and Customer Growth

### Task 9: Messaging Providers, Invoice Sharing and Refill Automation

**Files:**
- Create: `apps/server/src/providers/messaging.ts`, `apps/server/src/providers/whatsapp.ts`, `apps/server/src/providers/sms.ts`, `apps/server/src/providers/email.ts`, `apps/server/src/services/messaging.ts`, `apps/server/src/routes/messages.ts`, `src/pages/CommunicationsPage.tsx`
- Modify: schema/migrations, `apps/server/src/routes/invoices.ts`, `apps/server/src/routes/refills.ts`, `src/lib/api.ts`, `src/pages/InvoicesPage.tsx`, `src/pages/RefillsPage.tsx`, `src/pages/SettingsPage.tsx`
- Test: `apps/server/test/messaging.test.ts`

**Interfaces:**
- `POST /api/messages/send` accepts `{ channel: "whatsapp"|"sms"|"email"; recipient; template; variables; aggregateType; aggregateId }` and enqueues an outbox event.
- `POST /api/invoices/:id/share` accepts `{ channels: string[] }` and returns message IDs.
- `POST /api/refills/:id/send` sends a reviewed reminder; scheduled jobs process due reminders.
- Add `communication_preferences` and `message_deliveries` tables with consent, opt-out, provider message ID, status and error.

- [x] **Step 1: Test** provider abstraction with fake adapter, idempotency, opt-out, retry/backoff, rate limit and invoice link authorization.
- [x] **Step 2: Implement** fake provider plus environment-configured adapters; no credentials in source.
- [x] **Step 3: Add** invoice WhatsApp/SMS/email buttons, delivery status and retry controls.
- [x] **Step 4: Add** customer consent and communication preference UI.
- [x] **Step 5: Add** refill job with human review mode and configurable automatic mode.

### Task 10: Customer Analytics, Loyalty, Offers and Campaigns

**Files:**
- Create: `apps/server/src/services/customerEngagement.ts`, `apps/server/src/routes/customerEngagement.ts`, `src/pages/CampaignsPage.tsx`, `src/pages/CustomerInsightsPage.tsx`
- Modify: schema/migrations, `src/pages/CustomersPage.tsx`, `src/pages/DashboardPage.tsx`, `src/lib/api.ts`
- Test: `apps/server/test/customer-engagement.test.ts`

**Interfaces:**
- `GET /api/customer-insights/:id` returns purchase intervals, frequent medicines, last purchase, lifetime value, RFM, churn risk and refill candidates.
- `POST /api/loyalty/earn` and `POST /api/loyalty/redeem` use immutable ledger entries; no direct balance edits.
- `POST /api/campaigns` accepts `{ name, audience, channel, template, scheduleAt }`.
- Audience filters: RFM score, medicine/composition history, due balance, refill window, opt-in status.

- [x] **Step 1: Test** interval calculation, RFM/churn determinism, loyalty earn/redeem idempotency, campaign audience and opt-out exclusion.
- [x] **Step 2: Implement** insight queries and loyalty ledger.
- [x] **Step 3: Implement** offers with fixed amount, percentage, product and date constraints; validate at invoice creation.
- [x] **Step 4: Add** campaign preview, consent gate, scheduled outbox delivery and analytics.

## Phase 4: Accounting and Compliance

### Task 11: Double-Entry Accounting Core

**Files:**
- Create: `apps/server/src/services/accounting.ts`, `apps/server/src/routes/accounting.ts`, `src/pages/AccountingPage.tsx`
- Modify: schema/migrations, invoice/purchase/payment/return routes, `src/lib/api.ts`
- Test: `apps/server/test/accounting.test.ts`

**Interfaces:**
- Tables: `accounts`, `journal_entries`, `journal_lines`, `accounting_periods`.
- `accounting.post(entry: { date; sourceType; sourceId; lines: Array<{ accountCode; debit; credit; partyId? }> })` enforces balanced debits/credits and idempotent source IDs.
- `GET /api/accounting/trial-balance?from&to`, `/profit-loss`, `/balance-sheet`, `/day-book`.
- Default chart: Cash, Bank, Receivables, Payables, Inventory, Sales, Purchases, Sales Returns, Purchase Returns, Output GST, Input GST, Discounts, Expenses, Capital.

- [x] **Step 1: Test** balanced entry enforcement, duplicate source rejection, invoice/purchase/payment/return postings and tenant isolation.
- [x] **Step 2: Implement** chart and journal service.
- [x] **Step 3: Add** journal posting to existing transactional workflows without double-posting old records.
- [x] **Step 4: Add** trial balance, P&L, balance sheet and day-book UI with date filters/export.
- [x] **Step 5: Add** opening balance migration tool and period close lock.

### Task 12: Cash Book, Bank Book and Reconciliation

**Files:**
- Create: `apps/server/src/services/reconciliation.ts`, `apps/server/src/routes/reconciliation.ts`, `src/pages/CashBankPage.tsx`
- Modify: `src/pages/PaymentsPage.tsx`, `src/lib/api.ts`, schema/migrations
- Test: `apps/server/test/reconciliation.test.ts`

**Interfaces:**
- `GET /api/reconciliation/cash?from&to`, `/bank?from&to` returns opening, inflow, outflow, closing and unreconciled items.
- `POST /api/reconciliation/import` accepts CSV bank rows `{ date, reference, description, amount, direction }`.
- `POST /api/reconciliation/match` accepts `{ bankRowId, journalLineId }`; `POST /api/reconciliation/unmatch` reverses only the match.

- [x] **Step 1: Test** cash closing, bank import mapping, exact/partial matching, duplicate bank rows and reconciliation audit.
- [x] **Step 2: Implement** bank statement tables and matching service.
- [x] **Step 3: Add** Cash/Bank tabs, reconciliation status and export.

### Task 13: E-Invoice, E-Way Bill and GST Provider Integration

**Files:**
- Create: `apps/server/src/providers/gst.ts`, `apps/server/src/services/compliance.ts`, `apps/server/src/routes/compliance.ts`, `src/pages/CompliancePage.tsx`
- Modify: schema/migrations, invoice routes/UI, `src/lib/api.ts`, `docs/INTEGRATIONS.md`
- Test: `apps/server/test/compliance.test.ts`

**Interfaces:**
- `POST /api/compliance/invoices/:id/generate` validates GSTIN, HSN, tax totals and returns provider submission status.
- `POST /api/compliance/invoices/:id/cancel` and `GET /api/compliance/invoices/:id`.
- `POST /api/compliance/eway-bills` accepts transporter, distance, vehicle and invoice references.
- Store provider request/response hashes and IRN/ack/QR fields; never store provider secrets in the database unencrypted.

- [x] **Step 1: Test** GST validation, payload construction, fake-provider success/error, retry and cancellation window.
- [x] **Step 2: Implement** provider interface and fake adapter.
- [x] **Step 3: Add** credentials/settings UI and invoice compliance status.
- [x] **Step 4: Add** live adapter only after provider credentials and API contract are approved.

## Phase 5: Online Ordering and Operations

### Task 14: Customer Ordering, Prescription Upload and Delivery

**Files:**
- Create: `apps/server/src/routes/customerOrders.ts`, `apps/server/src/services/customerOrders.ts`, `src/pages/OrdersPage.tsx`, `src/pages/OnlineOrderSettingsPage.tsx`
- Modify: schema/migrations, `src/lib/api.ts`, messaging and prescription services
- Test: `apps/server/test/customer-orders.test.ts`

**Interfaces:**
- Public `POST /api/public/orders` accepts `{ storeId, customer, items, prescriptionFileId?, deliveryAddress, notes }` and creates `pending` order.
- Authenticated `GET /api/orders?status=` and `POST /api/orders/:id/accept|reject|pack|ready|deliver|cancel`.
- State machine: `pending -> accepted -> packed -> ready -> delivered`; rejection/cancel are terminal with reason.
- Stock is reserved on acceptance and deducted only at invoice/delivery completion.

- [x] **Step 1: Test** public order validation, prescription requirement, state transitions, stock reservation/release, duplicate delivery and tenant isolation.
- [x] **Step 2: Implement** order tables and service.
- [x] **Step 3: Add** staff order queue and customer-facing branded order form.
- [x] **Step 4: Add** delivery status, messaging events and invoice conversion.

### Task 15: Cloud Sync, Devices, Staff Permissions and Remote Monitoring

**Files:**
- Create: `apps/server/src/services/sync.ts`, `apps/server/src/routes/devices.ts`, `src/pages/DevicesPage.tsx`, `src/pages/SyncStatusPage.tsx`
- Modify: schema/migrations, auth routes, `src/lib/api.ts`, `src/hooks/use-auth.tsx`
- Test: `apps/server/test/devices-sync.test.ts`

**Interfaces:**
- `POST /api/devices/register` accepts `{ deviceName, platform, appVersion }` and returns device token.
- `GET /api/devices`, `POST /api/devices/:id/revoke`, `POST /api/devices/:id/lock`.
- `GET /api/sync/pull?cursor=` and `POST /api/sync/push` use operation IDs and conflict versions.
- Conflict policy: invoices and journal entries are append-only; medicine/settings use latest approved version; batch quantity changes require server transaction/retry.

- [x] **Step 1: Test** device revocation, role permissions, idempotent push, cursor pull, conflict handling and offline sale replay.
- [x] **Step 2: Implement** device registry and operation log; keep current SQLite local mode working.
- [x] **Step 3: Add** sync status, pending operations and remote session management.
- [x] **Step 4: Add** periodic backup/sync health to dashboard.

## Phase 6: Migration, Integrations and Administration

### Task 16: Full Data Migration and Bulk Bill Operations

**Files:**
- Create: `apps/server/src/services/migration.ts`, `apps/server/src/routes/migration.ts`, `src/pages/MigrationPage.tsx`, `src/pages/BulkBillsPage.tsx`
- Modify: `src/lib/api.ts`, schema/migrations, `src/pages/SettingsPage.tsx`
- Test: `apps/server/test/migration.test.ts`

**Interfaces:**
- `POST /api/migrations` creates a session for customers, suppliers, medicines, opening stock, batches and balances.
- `POST /api/migrations/:id/preview`, `/commit`, `/rollback`; preview reports created/updated/skipped/errors.
- `POST /api/bulk-bills/preview` accepts filters and patch `{ customerId?, date?, notes?, paymentMode? }`; `/commit` requires confirmation and writes audit events.

- [x] **Step 1: Test** import validation, duplicate matching, rollback, opening balance preservation and bulk permission checks.
- [x] **Step 2: Implement** staged import tables and transaction-safe commit.
- [x] **Step 3: Add** downloadable error rows and migration progress UI.
- [x] **Step 4: Add** bulk bill filters, preview diff, approval and audit history.

### Task 17: Integrations Center and Scheduled Reports

**Files:**
- Create: `apps/server/src/routes/integrations.ts`, `apps/server/src/services/reportsDelivery.ts`, `src/pages/IntegrationsPage.tsx`, `src/pages/ScheduledReportsPage.tsx`
- Modify: schema/migrations, `src/lib/api.ts`, `apps/server/src/index.ts`, `docs/INTEGRATIONS.md`
- Test: `apps/server/test/integrations.test.ts`, `apps/server/test/scheduled-reports.test.ts`

**Interfaces:**
- `GET /api/integrations`, `POST /api/integrations/:provider/connect`, `POST /api/integrations/:provider/disconnect`, `GET /api/integrations/:provider/health`.
- Providers: WhatsApp, SMS, email, Google Drive backup, cloud storage, payment collection, GST compliance, online ordering.
- `POST /api/scheduled-reports` accepts `{ reportType, schedule, recipients, format: "csv"|"pdf", filters }`.
- Report jobs create outbox events and delivery records; no credentials are returned to the browser.

- [x] **Step 1: Test** provider registration, encrypted config, health failures, disconnect cleanup and scheduled report idempotency.
- [x] **Step 2: Implement** provider registry and settings UI.
- [x] **Step 3: Add** scheduled report worker for Sales, Stock, Purchase, Payments, GST and Party reports.
- [x] **Step 4: Add** delivery history, retry and disable controls.

## Cross-Cutting Verification

### Task 18: Security, Performance and Product Acceptance Sweep

**Files:**
- Modify: all touched modules; `docs/API.md`, `docs/DATABASE.md`, `docs/INTEGRATIONS.md`
- Test: `apps/server/test/tenant-isolation.test.ts`, `apps/server/test/regression-workflows.test.ts`

- [x] **Step 1: Run** tenant-isolation tests against every new route and verify no response contains another user's medicine, customer, invoice, file, prescription, message or accounting record.
- [x] **Step 2: Run** invoice lifecycle tests: sale, return, expiry block, journal posting, message enqueue, refill creation, cancellation and backup.
- [x] **Step 3: Run** `npx vitest run` from `apps/server` and `npm run typecheck` from the repository root.
- [x] **Step 4: Run** import load test with 5,000 rows, report load test with 100,000 inventory transactions, and label preview test with 500 labels.
- [x] **Step 5: Use browser verification** for purchase import, billing alternative selection, prescription upload, stock audit, labels, messaging status, accounting reports, online orders, device management and integrations settings at desktop and mobile widths.
- [x] **Step 6: Run** `graphify update .` after code changes and update the feature matrix in `docs/API.md`.
- [x] **Step 7: Perform acceptance review** for each competitor claim in the Current Gaps table; mark it implemented only when the active Fastify route, UI workflow, tests and docs all exist.

## Dependency and Delivery Order

1. Task 0: shared outbox, files, audit, devices and feature flags.
2. Tasks 1-2: purchase ingestion and OCR.
3. Tasks 3-5: product intelligence, procurement and safety controls.
4. Tasks 6-8: prescriptions, stock audit and barcode labels.
5. Tasks 9-10: communications and customer growth.
6. Tasks 11-13: accounting, reconciliation and compliance.
7. Tasks 14-15: online ordering and cloud/device operations.
8. Tasks 16-17: migration, integrations and scheduled reports.
9. Task 18: cross-cutting acceptance gate.

## Definition of Done

A feature is complete only when all of the following are true:

- Active Fastify route and typed client exist.
- UI has loading, empty, validation, error, retry and success states.
- Database migration and tenant indexes exist.
- Server tests cover normal, empty, invalid, duplicate, authorization and cross-tenant cases.
- External provider calls are idempotent and outbox-backed.
- Audit event exists for sensitive mutations.
- User-visible behavior is browser-verified at desktop and mobile widths.
- API/database/integration documentation is updated.
- `npx vitest run`, `npm run typecheck`, and `graphify update .` complete successfully.
