# MediBill GST — Our Screens & Endpoints Inventory

*Inventory of `D:\Projects\MediBillGST` for feature-parity audit against the LocalWell reference app. Local source only; small `file://` refs point at implementation lines.*

## Overview (architecture / user-facing model)

- Vet Vite + React 19 SPA at the **repo root** (`src/` — there is no `apps/web/`; the server layout doc assumed was wrong). Router: **react-router v7** with a hand-written route table in `src/main.tsx:96-135`; all app pages lazy-loaded under a shared `DashboardLayout`.
- Backend: **Fastify** (apps/server) exposing ~230 REST endpoints under `/api/*` across 43 routers (`apps/server/src/index.ts:151-201`). Frontend client is a single typed module `src/lib/api.ts:1` (~2,700 lines, 39 `*Api` groups) calling `fetch` with `Authorization: Bearer` + `X-Device-Token` headers — no axios despite the dependency; axios is unused.
- **src/convex + Convex deps are legacy**: `src/lib/api.ts:3` states "Replaces Convex SDK with local REST API calls". `main.ts` at root is a Deno static file server for `dist`, not the API.
- Local-first / single-store desktop-ish model: server binds `127.0.0.1` by default (`apps/server/src/index.ts:251`), tailscale/cloudflared tunnel supported; data dir under `ProgramData\MediBill`; SQLite via Drizzle (`apps/server/src/db/`), 16+ migrations.
- Auth: identifier (email/phone) + password (`/api/auth/login|register`), session cookies + bearer token, plus a **device registry kill-switch** (`X-Device-Token`, revocation → global 401 logout, `src/lib/api.ts:35-68`, `src/hooks/use-auth.tsx:31`).
- Roles gate the UI **by capability strings** in the sidebar (`capability: "billing" | "orders" | "inventory" | "purchases" | "reports" | "compliance" | "messaging" | "campaigns" | "devices" | "settings"…`, `src/components/DashboardLayout.tsx:58-105`) and in pages by `role === "admin" || role === "pharmacist"` vs read-only (`src/pages/AccountingPage.tsx:92-93`, `src/pages/DevicesPage.tsx:86`). Server enforces `authGuard` + `requireRole("admin")` per route.
- Side nav groups: **Workspace** (bill/invoice/payments/order/returns/scan/refill…), **Manage** (inventory, procurement, suppliers, customers, reports, compliance, accounting…), **Account** (communications, campaigns, devices, integrations, migration, settings).
- Rich shared components: CommandPalette, ShortcutsDialog, StoreSwitcher, GST invoice template, barcode camera scanner, medicine row-search w/ batch pickers, expiry MM/YY input, money input.
- Public surface: `/order` customer self-order portal (by `storeId` query, no auth) backed by unauthenticated `/api/public/*` endpoints.
- Route count: **35 user-facing routes** (31 dashboard children incl. index + landing, auth, onboarding, public order portal) plus a `*` NotFound catch-all.

---

## Screens

### Workspace

#### `/` — Landing (Landing.tsx)
- Marketing/entry page; "Get started" CTA routes to `/auth`, "Go to dashboard" if authenticated (`src/pages/Landing.tsx:57`).
- No data calls. Fully public.

#### `/auth` — Auth (Auth.tsx)
- Single sign-in/sign-up form: identifier (email/phone) + password; toggles between login and register (`authApi.register`, `src/pages/Auth.tsx:42`).
- On success the AuthProvider registers this browser as a device (`devicesApi.register`) and redirects to `/dashboard` (`src/main.tsx:97`).
- Entities: users (id, name, email, phone, role). Endpoints: `/api/auth/login`, `/api/auth/register`, `/api/devices/register`.
- No role gate (pre-auth).

#### `/dashboard` (index) — Dashboard (DashboardPage.tsx)
- KPI cards over a date range (range picker) via `dashboardApi.kpis`, plus profit summary `reportsApi.profit`, fast/slow stock movers `reportsApi.stockFast/stockSlow` (`src/pages/DashboardPage.tsx:87-99`).
- Upcoming refills widget `refillsApi.upcoming(7)`.
- Tab strip for fast/slow segments (`fastSlowTab`, `src/pages/DashboardPage.tsx:445`); "visual review mode" with sample data (`src/pages/DashboardPage.tsx:173`).
- Interactions: navigate to reports via cards, toggle segment tabs, share date range.
- Entities: KPI totals, daily sales series, product/segment stats. Endpoints: `/api/dashboard/kpis`, `/api/reports/*` (profit, stock/fast, stock/slow), `/api/refills/upcoming`.
- Role: authenticated; no extra gate visible.

#### `/dashboard/billing` — New Bill (BillingPage.tsx, ~3,000 lines — POS)
- Full sale flow: patient/customer lookup (`customersApi.list` debounced search), doctor lookup, prescription picker or upload (photo → `filesApi.upload` + `prescriptionsApi.create/verify/dispense`, `src/pages/BillingPage.tsx:575-906`).
- Line-item entry with medicine search, **batch availability + batch issue order** selection (`inventoryApi.getAvailableBatches`, batch order dropdown `src/pages/BillingPage.tsx:1797`), expiry policy block, below-MRP margin warning (`src/pages/BillingPage.tsx:2434`).
-:inline New-medicine quick-create dialog (`medicinesApi.create`, `src/pages/BillingPage.tsx:1129`) and barcode lookup via camera (`medicinesApi.getByBarcode`, `src/pages/BillingPage.tsx:1165-1202`).
- Inline batch-create (`inventoryApi.createBatch`, `src/pages/BillingPage.tsx:1026`).
- Offer/loyalty integration: customer loyalty view (`engagementApi.loyalty`), active offers, offer evaluation (`src/pages/BillingPage.tsx:1288`).
- Payment method select Cash/Card/UPI/Credit (udhar) (`src/pages/BillingPage.tsx:1781-1784`); invoice create (`invoicesApi.create`, next-number prefetch `src/pages/BillingPage.tsx:282`); GST invoice print link.
- Admin/pharmacist-only price/NPR overrides (`src/pages/BillingPage.tsx:1736, 2998`).
- Bill hold/recall support listed for roles; order-driven billing: pull accepted customer order into billing (`ordersApi.get/deliver`, `src/pages/BillingPage.tsx:850-1563`).
- Endpoints: `/api/medicines* (/api/customers*, /api/doctors*, /api/prescriptions*`, `/api/investments`... precisely: medicines, customers, doctors, files, prescriptions, inventory batches, invoices next-number/create, orders, loyalty/offers, settings.loyalty.
- Entities: invoice, invoice item, batch, prescription, offer, customer, doctor, medicine.

#### `/dashboard/invoices` — Invoices (InvoicesPage)
- Invoice table with search, status filter (all/paid/due/partial/unpaid/hold/cancelled), sort by date/amount/customer (`src/pages/InvoicesPage.tsx:382-398`).
- Invoice detail dialog: full GST print view + payment history (`invoicesApi.get`, `paymentsApi.list({invoiceId})`, `src/pages/InvoicesPage.tsx:172-173`).
- Records payment directly (`paymentsApi.create`, `src/pages/InvoicesPage.tsx:255`) with mode select cash/card/UPI/bank transfer (`src/pages/InvoicesPage.tsx:703-706`).
- Cancel invoice (`invoicesApi.cancel`, `src/pages/InvoicesPage.tsx:185`); hold list surfaced in filters.
- e-Invoice status per row — preflight status via `complianceApi.status`, generate/cancel from Compliance page (`src/pages/InvoicesPage.tsx:96`).
- Share invoice to WhatsApp/SMS/email (`messagesApi.invoiceShare`, `src/pages/InvoicesPage.tsx:212`) — customer list picker (`customersApi.list`).
- Sales register aggregation chart `reportsApi.salesRegister` with from/to filter (`src/pages/InvoicesPage.tsx:125`).
- Entities: invoice, payment, e-invoice submission. Endpoints: invoices, payments, compliance.status, messages.invoiceShare, reports.salesRegister, customers.
- Role: auth-guarded; create/cancel server-validated via `authGuard`.

#### `/dashboard/orders` — Orders (OrdersPage)
- Staff working queue for **online customer orders**: list with status filter tabs (`ordersApi.list`, status param filters, `src/pages/OrdersPage.tsx:140-164`).
- Click-through lifecycle: accept → pack → ready → deliver (deliver ties an invoice id from billing) (`ordersApi.accept/pack/ready/deliver`, `src/pages/OrdersPage.tsx:247-269`).
- Order detail: full line items fetched per order (`ordersApi.get`, `src/pages/OrdersPage.tsx:255`).
- Reject/cancel with reason modals (`ordersApi.reject/cancel`, `src/pages/OrdersPage.tsx:287`).
- Entities: customer_order (status, customer, lines, invoice_id). Endpoints: `/api/orders` (GET list/detail) + lifecycle actions.
- Role: sidebar shows under `capability: "orders"`; API is `authGuard`-protected (queue is staff-facing).

#### `/dashboard/returns` — Sales Returns (SalesReturnsPage)
- Return-against-invoice: fetch invoices via search (`invoicesApi.list`, `invoicesApi.get`, `src/pages/SalesReturnsPage.tsx:120-131`).
- Returns list with totals (`returnsApi.list`, `src/pages/SalesReturnsPage.tsx:102`).
- Create return modal (`returnsApi.create`, `src/pages/SalesReturnsPage.tsx:202`).
- Entities: sale return + line items, refund basis. Endpoints: `/api/returns*`, `/api/invoices*`.

#### `/dashboard/payments` — Payments (PaymentsPage)
- Register with type filter received/paid/expense (`src/pages/PaymentsPage.tsx:168-170`), mode select cash/card/UPI/bank_transfer/cheque (`src/pages/PaymentsPage.tsx:187-191`).
- List all payments (`paymentsApi.list`), create payment form (`paymentsApi.create`, `src/pages/PaymentsPage.tsx:74-100`).
- Note: delete payment (endpoint exists `/api/payments/:id delete`) is server-side; UI usage limited here — page is list + create form.
- Entities: payment (type, mode, amount, party). Endpoints: `/api/payments` (list/create/delete/summary).

#### `/dashboard/cash-bank` — Cash & Bank (CashBankPage)
- Tabs: Cash Book / Bank Book (`src/components/...` `src/pages/CashBankPage.tsx:516-553`) with date range.
- Reconciliation status summary (`reconciliationApi.cashBook/bankBook/status`, `src/pages/CashBankPage.tsx:124-129`).
- Import bank statement CSV (`reconciliationApi.importCsv`, `src/pages/CashBankPage.tsx:164`).
- Suggested matches per imported row (`reconciliationApi.suggest`, `src/pages/CashBankPage.tsx:197`), one-click match / unmatch (`reconciliationApi.match/unmatch`, `src/pages/CashBankPage.tsx:214-233`).
- Rows table with match state (`reconciliationApi.rows`).
- Role gate similar to Accounting: `canManage = admin|pharmacist` else read-only lock (`src/pages/CashBankPage.tsx:87-88`).
- Entities: recon_row, match. Endpoints: `/api/reconciliation/cash`, `/bank`, `/import`, `/rows`, `/suggest`, `/match`, `/unmatch`, `/status`.

#### `/dashboard/refills` — Refills (RefillsPage)
- Refill reminder list (`refillsApi.list`), create reminder form (`refillsApi.create`) including patient medicine/interval info (`src/pages/RefillsPage.tsx:57-121`).
- Status update, delete (`refillsApi.update/remove`).
- Provider health check (`messagesApi.providers`, `src/pages/RefillsPage.tsx:145`) — WhatsApp/SMS/email channels (`src/pages/RefillsPage.tsx:213-215`).
- Send one reminder (`refillsApi.send`) or send-all-due batch (`refillsApi.sendDue`, `src/pages/RefillsPage.tsx:159-177`).
- Due-count badge `refillsApi.due-count` also used on dashboard widgets.
- Entities: refill_reminder (patient, medicine, cycle, status. Endpoints: `/api/refills*`.

#### `/dashboard/scan` — Scan Bill (ScanBillPage)
- Camera / file-upload of a purchase bill image; OCR (Tesseract in-browser) extracts supplier name, bill no, GST rate, batch no, expiry, MRP, qty, rate (`src/pages/ScanBillPage.tsx:18-28`).
- Editable reviewed line items table with delete (`src/pages/ScanBillPage.tsx:45-51`).
- Match each item against medicine DB (`medicinesApi.list(search)`, `src/pages/ScanBillPage.tsx:146`) then **update** existing medicine batch fields or **create** new medicine (`medicinesApi.update/create`, `src/pages/ScanBillPage.tsx:153-161`).
- Confirms with import summary toast; then navigates back.
- Entities: scanned line item, medicine. Endpoints: medicines list/update/create.

### Manage

#### `/dashboard/inventory` — Inventory (InventoryPage, large)
- Tabs: Stock / Expiry / Low Stock / History (`src/pages/InventoryPage.tsx:769-776`).
- Stock table with search (`inventoryApi.stock(search)`), supplier enrichment (`inventoryApi.stock`, `suppliersApi.list`, `src/pages/InventoryPage.tsx:223-302`).
- Add stock batch form (`inventoryApi.createBatch`, `src/pages/InventoryPage.tsx:475-483`), edit batch (`inventoryApi.updateBatch`).
- Stock adjust entry with reason select — Breakage/Found/Expired/Sample/Correction (`inventoryApi.adjust`, `src/pages/InventoryPage.tsx:510-538`, selections at `src/pages/InventoryPage.tsx:1300-1304`).
- Expiry view with status buckets (`inventoryApi.expiry(status)`), low stock list (`inventoryApi.lowStock`), movement history with pagination (`inventoryApi.transactions`).
- Medicine create/update/delete dialogs (`medicinesApi.update/create/delete`, `src/pages/InventoryPage.tsx:357-406`); barcode lookup (`medicinesApi.getByBarcode`).
- Catalog medicine search listbox for adding unknown items (`src/pages/InventoryPage.tsx:1164-1172`).
- Entities: batch, transaction, medicine. Endpoints: `/api/inventory/*`, `/api/medicines*`.

#### `/dashboard/labels` — Labels (LabelsPage)
- Label template picker (shelf/round/small…) loaded from server (`labelsApi.templates`, `src/pages/LabelsPage.tsx:88`).
- Preview rendering and print of labels per medicine/batch (`labelsApi.preview` server-side).
- Entities: label_template. Endpoints: `/api/labels/templates`, `/api/labels/preview`.

#### `/dashboard/purchases` — Purchases (PurchasesPage, big)
- Tabs: Bills / New Purchase / Purchase Returns (`src/pages/PurchasesPage.tsx:610-612`).
- Bills table with search + pagination (`purchasesApi.list`), bill detail (`purchasesApi.get`, `src/pages/PurchasesPage.tsx:399`).
- New purchase bill entry: supplier select, medicine lines with batch info, payment method (cash/card/UPI/credit->supplier balance/other) (`src/pages/PurchasesPage.tsx:1191-1195`).
- Rate override allowed for admin/pharmacist only (`src/pages/PurchasesPage.tsx:559, 889`).
- Return-against-bill creation modal (`purchaseReturnsApi.create`, `src/pages/PurchasesPage.tsx:463`), returns list (`purchaseReturnsApi.list`).
- Batch history for returned item (`inventoryApi.getBatches`, `src/pages/PurchasesPage.tsx:370`) and supplier prior-bill lookup (`purchasesApi.list({supplierId})`).
- Supplier price comparison dialog (`procurementApi.compare`, `src/pages/PurchasesPage.tsx:335`).
- Entities: purchase bill, item, purchase_return. Endpoints: `/api/purchases*`, `/api/purchase-returns*`, `/api/inventory/batches`, `/api/procurement/compare`.

#### `/dashboard/procurement` — Procurement (ProcurementPage)
- Tabs: Supplier Metrics / Rates / Quotes / Expiry (`src/pages/ProcurementPage.tsx:267-283`).
- Supplier purchase history & spend metrics card (`procurementApi.supplierMetrics(sid, …)`, `src/pages/ProcurementPage.tsx:107-130`).
- Expiry-risk item list per supplier (`procurementApi.expiryItems`, `src/pages/ProcurementPage.tsx:156`).
- Rate history chart per medicine (`procurementApi.rateHistory`, `src/pages/ProcurementPage.tsx:186`).
- RFQ: create supplier quote requests (`procurementApi.createQuote`), list quotes (`procurementApi.quotes`, `src/pages/ProcurementPage.tsx:185-209`).
- Entities: quote, rate history, expiry item. Endpoints: `/api/procurement/*`.

#### `/dashboard/purchase-import` — Import CSV (PurchaseImportPage)
- Two paths: CSV paste/upload (`purchaseImportsApi.create({filename, csv})`, `src/pages/PurchaseImportPage.tsx:279`) or OCR bill image (upload → OCR session, supplier/medication long path; `filesApi.upload` + `purchaseImportsApi.ocr`, `src/pages/PurchaseImportPage.tsx:310-330`).
- Column mapping editing + per-row medicine/supplier matching suggestions (`purchaseImportsApi.updateMappings`, `src/pages/PurchaseImportPage.tsx:388`; `medicinesApi.list(search)` inline).
- Session detail view (`purchaseImportsApi.get`), re-download original (`filesApi.get`, `src/pages/PurchaseImportPage.tsx:353`).
- Delete session (`purchaseImportsApi.remove`) and commit → creates purchase bill (`purchaseImportsApi.commit`, `src/pages/PurchaseImportPage.tsx:473-534`).
- Provides preview figures on commit.
- Entities: purchase_import session, rows, mapping. Endpoints: `/api/purchase-imports*`, `/api/files*`.

#### `/dashboard/customers` — Customers (CustomersPage)
- List + search table (`customersApi.list`), create/edit/delete modal (`customersApi.update/create/delete`, `src/pages/CustomersPage.tsx:171-179`).
- Per-customer engagement insights panel (`engagementApi.insights`, `src/pages/CustomersPage.tsx:103`) plus loyalty points balance (`engagementApi.loyalty`).
- Loyalty earn/redeem actions (`engagementApi.earn / redeem`, `src/pages/CustomersPage.tsx:131-136`).
- Quick "create refill reminder" action from the row (`refillsApi.create`, `src/pages/CustomersPage.tsx:150`).
- Entities: customer (name, phone, email, address), loyalty, insight. Endpoints: `/api/customers*`, `/api/customer-engagement/*`, `/api/refills`.

#### `/dashboard/doctors` — Doctors (DoctorsPage)
- Doctors list, create/edit/delete modals (`doctorsApi.list/update/create/delete`, `src/pages/DoctorsPage.tsx:33-71`).
- Entities: doctor (name, specialty, contact). Endpoints: `/api/doctors*`.

#### `/dashboard/prescriptions` — Prescriptions (PrescriptionsPage)
- Prescription list with doctor/customer filter selects (`prescriptionsApi.list`, filters `src/pages/PrescriptionsPage.tsx:474-481`).
- Upload / attach prescription image (`filesApi.upload/get`, `src/pages/PrescriptionsPage.tsx:169, 268-275`).
- Workflow buttons: verify / reject(reason) / dispense (links to an invoice id) / delete (`src/pages/PrescriptionsPage.tsx:188-239`).
- Create manually with doctor + customer pickers, gender select, note (`src/pages/PrescriptionsPage.tsx:367-413`).
- Entities: prescription (status pending/verified/rejected/dispensed, image, patient info). Endpoints: `/api/prescriptions*`, `/api/files*`.

#### `/dashboard/suppliers` — Suppliers (SuppliersPage)
- Supplier list + create/edit/delete modals (`suppliersApi.list/update/create/delete`, `src/pages/SuppliersPage.tsx:31-66`).
- Entities: supplier (name, contact, gstin). Endpoints: `/api/suppliers*` (+ `/ledger` endpoint available server-side).

#### `/dashboard/reports` — Reports (ReportsPage, ~2,300 lines — biggest analytics screen)
- Tabs: Sales / Stock / Purchase / Payments & Expenses / Profitability / Inventory Valuation / GST (Tax) / Parties / Ordering (`src/pages/ReportsPage.tsx:414-2416`).
- **Sales**: register (invoice/receipt views), detail, summary grouped by product/company/category/customer/supplier/user (`src/pages/ReportsPage.tsx:533-538`), doctor-wise, schedule filter H/H1/X/G (`src/pages/ReportsPage.tsx:592-595`), party sales, CSV export (`reportsApi.sales*`, `src/pages/ReportsPage.tsx:220-225`).
- **Stock**: fast/slow movers, current stock, expired, opening-closing, statements (pick medicine), adjustments (`src/pages/ReportsPage.tsx:235-249`).
- **Purchase**: register/detail/summary/schedule, group by product/supplier/company (`src/pages/ReportsPage.tsx:257-303`).
- **Payments & Expenses**: pending customers/distributors lists (view modes), payments register (type + mode filters), expense register grouped by category/name (`src/pages/ReportsPage.tsx:268-276`).
- **Parties**: customer RFM/balance sorting, distributor list, ledgers per party with date range (`src/pages/ReportsPage.tsx:284-297`).
- **Ordering (shortbook)**: shortage % sorted book and purchase-order grouping by product (`src/pages/ReportsPage.tsx:302-317`).
- Profit and inventory valuation tabs; GST tax suite: tax summary, GSTR-1, GSTR-2, GSTR-3B, HSN, ITC (`src/pages/ReportsPage.tsx:308-325`).
- Global from/to date range + export buttons throughout.
- Role: sidebar gated by `capability: "reports"`.
- Endpoints under `/api/reports/*` (25+ report routes, `apps/server/src/routes/reports.ts:363-583`).

#### `/dashboard/scheduled-reports` — Scheduled Reports (ScheduledReportsPage)
- List, create, edit scheduled report jobs (daily/weekly/monthly frequency, `src/pages/ScheduledReportsPage.tsx:171-252`), enable/disable toggle, manual "Run now", delete (`src/pages/ScheduledReportsPage.tsx:267-297`).
- Run history per job (`scheduledReportsApi.runs`), download generated CSV via files (`filesApi.get(run.fileId)`, `src/pages/ScheduledReportsPage.tsx:312-324`).
- Delivery channels include email / SMS (`src/pages/ScheduledReportsPage.tsx:585-586`).
- Entities: scheduled_report + run history. Endpoints: `/api/scheduled-reports*`.

#### `/dashboard/stock-audit` — Stock Audit (StockAuditPage)
- Create audit session (`stockAuditsApi.create({note})`, `src/pages/StockAuditPage.tsx:285`), list audits with status filter (`src/pages/StockAuditPage.tsx:161-177`).
- Count entry against batches: barcode lookup (`medicinesApi.getByBarcode`) or batch pick (`inventoryApi.getBatches`) (`src/pages/StockAuditPage.tsx:241-266`), submit counts (`stockAuditsApi.count`, update existing count row).
- Approve (creates adjustments) with reason, cancel ("cancel discrete" style with reason) (`stockAuditsApi.approve/cancel`, `src/pages/StockAuditPage.tsx:307-324`).
- Entities: stock_audit, count rows. Endpoints: `/api/stock-audits*`.
- Role: `canApprove = admin|pharmacist` (`src/pages/StockAuditPage.tsx:120`); sidebar gated `capability: "stock_audit"`.

#### `/dashboard/catalog` — Medicine DB (CatalogPage)
- Browse/search pharmacy-wide medicine catalog (independent `useMedicineCatalog` hook; fuzzy search + medicine alternatives lookup for stock items).
- CSV bulk-add of catalog rows into the store's medicine list with preview/dedupe (parseMedicineCsv; commit `catalogAdditionsApi.import(preview.additions)`, `src/pages/CatalogPage.tsx:146`).
- Per-row "add to store" single creation; delete store row (`medicinesApi.delete` presumably used through the catalog piece).
- Product intelligence: search stock equivalents and alternatives (`productIntelApi.search`, `src/pages/CatalogPage.tsx:46-61`). Show composition tokens.
- Entities: catalog medicine (no id/stock), store medicine. Endpoints: `/api/catalog/*`, `/api/catalog-additions`, `/api/product-intelligence/search`.

#### `/dashboard/compliance` — e-Invoice (CompliancePage)
- Pick invoice → generate e-invoice (`complianceApi.generate`, `src/pages/CompliancePage.tsx:182`), preflight validation check (`complianceApi.status`, `src/pages/CompliancePage.tsx:184-188`).
- Cancel with reason (`complianceApi.cancel(cancelTarget.invoiceId, cancelReason)` `src/pages/CompliancePage.tsx:202`).
- E-way bill generation modal (`complianceApi.eway` with transport fields, `src/pages/CompliancePage.tsx:224`).
- Provider status + submissions list feed (`complianceApi.providers`, `complianceApi.submissions`, `src/pages/CompliancePage.tsx:113-114`).
- Invoice selection dropdown fed by `invoicesApi.list` (status filter: all/pending/accepted/rejected/cancelled, `src/pages/CompliancePage.tsx:595-599`).
- Role: `canManage = admin|pharmacist` else read-only banner ("generation is limited to admin and…", `src/pages/CompliancePage.tsx:77-78, 325`). Sidebar gated `capability: "compliance"`.
- Endpoints: `/api/compliance/*` (providers, submissions, invoices/:id, generate, cancel, eway).

#### `/dashboard/accounting` — Accounting (AccountingPage)
- Tabs: Trial Balance / P&L / Balance Sheet / Day Book / Journals / Opening / Periods (`src/pages/AccountingPage.tsx:437-443`).
- Journal entry form (`accountingApi.post`, `src/pages/AccountingPage.tsx:220`), manual account create (`accountingApi.accounts/create`).
- Day book with pagination (`accountingApi.dayBook(page, limit:25)`, `src/pages/AccountingPage.tsx:149`).
- Chart-of-accounts list + entries (`accountingApi.entries({sourceType})`, `src/pages/AccountingPage.tsx:152-156`).
- Opening balance wizard from stock ("suggest opening" `accountingApi.suggestOpening`, commit `postOpening`, `src/pages/AccountingPage.tsx:303-349`).
- Period close/reopen with lock indicator (`accountingApi.closePeriod/reopenPeriod`, `src/pages/AccountingPage.tsx:249-263`).
- Role: `canPost = admin|pharmacist`; non-privileged roles see read-only lock (`src/pages/AccountingPage.tsx:90-93, 430`). Sidebar gated `capability: "accounting_view"`.
- Endpoints: `/api/accounting/*` (accounts, entry create/list, opening, trial-balance, p/l, balance-sheet, day-book, periods close/reopen).

### Account

#### `/dashboard/communications` — Communications (CommunicationsPage)
- Tabs: History / Compose / Templates / Preferences (`src/pages/CommunicationsPage.tsx:400-403`).
- Provider status pills (whatsapp/sms/email enabled flags, `src/pages/CommunicationsPage.tsx:165`).
- Delivery history table with channel + status filters (queued/sent/failed/opted_out, all channels, `src/pages/CommunicationsPage.tsx:412-425`), retry failed (`messagesApi.retry`, `src/pages/CommunicationsPage.tsx:276`).
- Compose message to customer or manual recipient (phone number), pick channel (`messagesApi.send`, `src/pages/CommunicationsPage.tsx:304`).
- Message templates stored in settings (`settingsApi.get/set("message_templates", …)`, `src/pages/CommunicationsPage.tsx:195-236`).
- Customer opt-in / channel preference editor (`messagesApi.preferences` / `setPreference`, `src/pages/CommunicationsPage.tsx:183, 330`).
- Entities: message_delivery, preference, template. Endpoints: `/api/messages/*`, `/api/settings`, `/api/customers`.

#### `/dashboard/campaigns` — Campaigns (CampaignsPage)
- Tabs: Campaigns / Offers (`src/pages/CampaignsPage.tsx:403-404`).
- Create campaign: channel (whatsapp/sms/email), target segment, message body (`engagementApi.createCampaign`, `src/pages/CampaignsPage.tsx:284`).
- Send campaign (stats returned) / cancel (`engagementApi.sendCampaign/cancelCampaign`, `src/pages/CampaignsPage.tsx:305-324`).
- Offers tab: create offer with fixed ₹ or % discount (`src/pages/CampaignsPage.tsx:339, 672-673`), activate/deactivate toggle (`engagementApi.updateOffer`), evaluate offer preview (`src/pages/... uses engagementApi.evaluateOffer from Billing page too`).
- Medicine search to derive campaign audience (`medicinesApi.list(search)`, `src/pages/CampaignsPage.tsx:143`).
- Entities: campaign, offer. Endpoints: `/api/customer-engagement/campaigns*`, `/offers*`.

#### `/dashboard/devices` — Devices & Sync (DevicesPage)
- Tabs: Devices / Sessions / Activity / Sync / Role (`src/pages/DevicesPage.tsx:257-273`).
- Current user's role + capability chips (`devicesApi.me`, `src/pages/DevicesPage.tsx:93`); admin check `role === "admin" || capabilities.includes("*")` (`src/pages/DevicesPage.tsx:86`).
- Registered devices list with **revoke (admin-only)** / restore (`devicesApi.revoke/restore`, `src/pages/DevicesPage.tsx:181-184`).
- Active sessions feed with kill action (`devicesApi.sessions/revokeSession`, `src/pages/DevicesPage.tsx:117-198`).
- Activity audit feed and offline sync journal status (`devicesApi.activity`, `syncApi.status / syncApi.pull(cursor)`, `src/pages/DevicesPage.tsx:129-211`).
- Role tab explains that the server "role map" hides nav only where "the API itself enforces a role gate" (`src/pages/DevicesPage.tsx:606-607`).
- Admin-only feeds load when admin (`src/pages/DevicesPage.tsx:154`).
- Endpoints: `/api/devices/*`, `/api/sync/*`.

#### `/dashboard/integrations` — Integrations (IntegrationsPage)
- Registry list of providers (`integrationsApi.list`, `src/pages/IntegrationsPage.tsx:71`) with config detail (`integrationsApi.get(id)`).
- Connect / disconnect with config + secrets inputs (`integrationsApi.connect/disconnect`, `src/pages/IntegrationsPage.tsx:120-135`).
- Toggle online_orders integration availability (`integrationsApi.connect("online_orders", …)`, `src/pages/IntegrationsPage.tsx:149`).
- Entities: integration provider + encrypted config. Endpoints: `/api/integrations`, `/registry`, `/connect`, `/disconnect`.

#### `/dashboard/stock-audit` is above; `migration` here:#### `/dashboard/migration` — Data Migration (MigrationPage)
- Bulk import of customers/suppliers/medicines/opening stock via step wizard: create session (`dataMigrationsApi.create`, `src/pages/MigrationPage.tsx:249`) → preview diff (`preview`, `src/pages/MigrationPage.tsx:270`) → commit (`commit`, `src/pages/MigrationPage.tsx:290`) → rollback (`rollback`, `src/pages/MigrationPage.tsx:313`).
- Recent migrations list with status (`dataMigrationsApi.list / get / remove`, `src/pages/MigrationPage.tsx:223-368`).
- Entities: data_migration session + plans. Endpoints: `/api/data-migrations*`.

#### `dashboard/settings` — Settings (SettingsPage)
- Card sections (h1 "Settings" `src/pages/SettingsPage.tsx:499`): store profile (name/GSTIN/drug license/phone/email/address/location, timings, storefront picture, ayushman HFR id — saved via `settingsApi.set(…)` `src/pages/SettingsPage.tsx:196-205`).
- Invoice format: prefix/pattern + format select A4/thermal 80/58, detailed vs compact columns (`settingsApi.getInvoiceFormat/setInvoiceFormat`, `src/pages/SettingsPage.tsx:253, 786-805`).
- Price override policy roles (which roles may override, mitigate marquée `src/pages/SettingsPage.tsx:658-666`).
- Expiry policy config (`expiryPolicyApi.get/put`, `src/pages/SettingsPage.tsx:95, 219`).
- Backup scheduler (daily/weekly times `backupApi.updateSchedule`) + manual backup (`backupApi.create("manual")`, uploadLatest) (`src/pages/SettingsPage.tsx:357-368, 479`).
- Cloud backup (Google Drive / Cloudflare R2 / S3 with credentials + encryption key; drive OAuth via `backupApi.driveAuthUrl/driveCallback/driveDisconnect`, restore from drive file list `driveRestore/driveFiles`, `src/pages/SettingsPage.tsx:390-466`).
- Online orders toggle (`settingsApi.set("online_orders", {enabled})`, `src/pages/SettingsPage.tsx:271`) and refill automation mode (off/queue cron, `src/pages/SettingsPage.tsx:299, 1132-1133`) + app base URL.
- Entities: many settings rows, backup schedule/config. Endpoints: `/api/settings*`, `/api/expiry-policy`, `/api/backup/*`.

### Public / Onboarding

#### `/onboarding` — OnboardingPage
- Store setup wizard after signup: store basics saved straight to setting keys (`settingsApi.set("store_*")`, `src/pages/OnboardingPage.tsx:47-52`).
- No data model beyond settings; redirects into dashboard.
- Public pre-auth.

#### `/order` — Order Portal (OrderPortalPage) — public, no login
- Customer self-ordering page keyed by `storeId` query param; store identity + status check (`publicApi.store`, `src/pages/OrderPortalPage.tsx:104`).
- Medicine search from catalog available for order (`publicApi.searchMedicines`, `src/pages/OrderPortalPage.tsx:127`).
- Cart + upload prescription file for restricted meds (`publicApi.uploadFile`, `src/pages/OrderPortalPage.tsx:191`).
- Create order without auth (`publicApi.createOrder`, `src/pages/OrderPortalPage.tsx:199`), then status lookup by id (`publicApi.status(storeId, id)`, `src/pages/OrderPortalPage.tsx:239`).
- Entities: public order, prescription file. Endpoints: `/api/public/orders`, `/medicines`, `/store`, `/files`, `/orders/:id` (deliberately unauthenticated; global rate limit only, `apps/server/src/index.ts:185-189`).

#### `*` — NotFound (NotFound.tsx)
- Catch-all 404 page.

---

## Route → one-line table

| Route | Description |
|---|---|
| `/` | Public landing page with auth CTAs |
| `/auth` | Login and sign-up with password; device registration on success |
| `/onboarding` | Post-signup store setup wizard (writes settings) |
| `/order` | Public customer order portal by storeId; medicine search, prescription upload, order status |
| `/dashboard` | KPI dashboard: sales trend, fast/slow stock, upcoming refills |
| `/dashboard/billing` | POS billing: customer/doctor/Rx, batch selection, offers, payment modes, invoice create |
| `/dashboard/invoices` | Invoice register w/ filters; detail/print; payment record; cancel; share; e-invoice status |
| `/dashboard/bulk-bills` | Bulk edit bills: filter, preview diff, commit (admin/pharmacist only) |
| `/dashboard/orders` | Online customer-order staff queue: accept/pack/ready/deliver/reject |
| `/dashboard/returns` | Sales returns against invoices |
| `/dashboard/payments` | Payment register (received/paid/expense) + create |
| `/dashboard/cash-bank` | Cash/bank books + statement import and reconciliation (match/unmatch) |
| `/dashboard/scan` | OCR scan of supplier bill image → create/update medicines |
| `/dashboard/refills` | Refill reminders CRUD + manual/broadcast send |
| `/dashboard/inventory` | Stock, expiry, low stock, movement history; batch CRUD & adjustments |
| `/dashboard/labels` | Label templates & preview/print |
| `/dashboard/stock-audit` | Stock audit sessions: counts, approve/cancel |
| `/dashboard/purchases` | Purchase bills, new purchase entry, purchase returns, rate compare |
| `/dashboard/procurement` | Supplier metrics, rate history, RFQ quotes, expiry-risk items |
| `/dashboard/purchase-import` | CSV/OCR purchase-bill import flows + column mapping + commit |
| `/dashboard/customers` | Customers CRUD + loyalty/insights + quick refill create |
| `/dashboard/doctors` | Doctors CRUD |
| `/dashboard/prescriptions` | Prescription upload & workflow (verify/reject/dispense) |
| `/dashboard/suppliers` | Suppliers CRUD |
| `/dashboard/reports` | 9-tab analytics: sales/stock/purchase/payments/profit/inventory/tax/parties/order |
| `/dashboard/scheduled-reports` | Scheduled report jobs + run history/download |
| `/dashboard/compliance` | e-Invoice + e-way bill generation, cancel, preflight, submissions |
| `/dashboard/accounting` | Double-entry books: TB/P&L/BS/daybook/journals/opening/period close |
| `/dashboard/catalog` | Medicine catalog browse/search, alternatives, bulk CSV add |
| `/dashboard/settings` | Store profile, invoice format, expiry policy, backups/cloud, orders/refill automation |
| `/dashboard/communications` | Messaging: history/retry, compose, templates, channel preferences |
| `/dashboard/campaigns` | Campaign & offer management (segments, send/cancel) |
| `/dashboard/devices` | Device registry, sessions, activity, sync status, role/capabilities |
| `/dashboard/integrations` | Integration provider connect/disconnect and online-orders toggle |
| `/dashboard/migration` | Bulk data migration wizard (preview/commit/rollback) |
| `*` | 404 NotFound |

(Full route table count: 35 user-facing routes + 1 catch-all.)

---

## Server endpoints (summary)

- Fastify server registers **43 routers** under `/api/*` (`apps/server/src/index.ts:151-201`) plus `/api/health` (`apps/server/src/index.ts:148`).
- Roughly **217 route handlers** found by simple grep; a few routers (payments, procurement, productIntelligence, backup) register with different variable names or multi-line registrations, so the true total is slightly higher — **approximately 235 endpoints**.
- Endpoint groups mirror screen sections: auth(2), medicines(6), customers(6), suppliers(6), invoices(10), purchases(3), purchase-returns(3), inventory(9), payments(≥4), reports(25+), dashboard(1), settings(5), expiry-policy(3), backup(10+), doctors(5), returns(3), refills(8), catalog-overrides(1), catalog-additions(1), catalog, outbox(2), purchase-imports(6), product-intelligence, procurement, files(1), prescriptions(8), stock-audits(7), labels(2), messages(7), customer-engagement(14), accounting(15), reconciliation(8), compliance(6), orders(2), public(5), devices(7), sync(3), data-migrations(7), bulk-bills(2), integrations(5), scheduled-reports(7).
- All non-public routes wrap `authGuard` preHandler; device revocation enforced globally via `X-Device-Token`.

Admin-only (requireRole("admin")) endpoints observed: `/api/devices/:id/revoke`, `/restore`, `/sessions`, `/activity` (`apps/server/src/routes/devices.ts:61-127`); the client hides the equivalent UI via capabilities.

---

## Known gaps / TODO in our app

- **No TODO/FIXME markers anywhere**: grep over `src/**` and `docs/**` for TODO/FIXME/"not implemented" found zero matches. Nothing explicitly flagged as unbuilt in the code.
- Inferred gaps (not commented, but absent from the codebase to replicate against reference):
  - **No dedicated Expenses screen** — expenses only exist as a payment type & reports tab (`src/pages/ReportsPage.tsx:276`, `payments/paid` select `src/pages/PaymentsPage.tsx:170`).
  - **No user/role management UI** — Devices page only shows *your* role & capabilities; no invite-user, password reset, or role assignment screen. Deletion of this wlll likely be needed if reference app has staff management.
  - No standalone **Integrations delivery channel setup** for scheduled-report destinations — that lives via messaging settings only.
  - No separate **scanner screen for stock counting** (barcode camera scanner component exists but stock-audit uses text entry path, not camera).
  - Landing page is thin (no pricing/blog); no public docs/help center.
  - Convex layer (`src/convex/*`, `convex.json`) is legacy-looking but still in repo — dead code if REST is the contract (`src/lib/api.ts:3`).
