# LocalWell Pharmacy (pharmacy.localwell.in) → MediBillGST Parity Matrix

Reference: full route list extracted from the target app's Next.js build manifest (85 routes, pages router).
Scope note: this is a **functional replica** built with original code in MediBillGST's stack (React 19 + Vite + Tailwind v4 + shadcn/ui + Fastify/SQLite). Target's proprietary code, assets, and copy are not copied.

Legend: ✅ covered · 🟡 partial (gap noted) · ❌ missing

## 1. Auth & session

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/login` (mobile OTP login) | `/auth` | ✅ |
| `/login/login` | `/auth` | ✅ |
| `/login/register` | `/auth` (sign-up) | ✅ |
| `/login/create-password` | — | ❌ → add create-password step after OTP |
| `/login/login-exhausted` | — | ❌ → OTP attempt-limit state |
| `/login/subscription-expired` | — | ❌ → expired-subscription gate |
| `/login/support/[...params]` | — | 🟡 generic support contact missing |
| `/login/switch-business` | `StoreSwitcher` in DashboardLayout | ✅ |

## 2. Dashboard

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/dashboard/view-dashboard` | `/dashboard` | ✅ |

## 3. Sale (POS)

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/sale/add-sale` | `/dashboard/billing` | ✅ |
| `/sale/add-sale/[sale_id]` (edit sale) | billing edit/draft support | 🟡 verify draft/edit parity |
| `/sale/view-sales`, `/transactions/sales` | `/dashboard/invoices` | ✅ |
| `/sale/return-sale`, `/transactions/sale-returns` | `/dashboard/returns` | ✅ |
| `/sale/customer-facing-screen` (2nd display) | — | ❌ → new full-screen customer display route |
| `/transactions/purchase-returns` | Purchases → New purchase return tab | ✅ |

## 4. Invoices & compliance

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/invoices/sale-invoice-new` | GSTInvoiceTemplate + print | ✅ |
| `/invoices/credit-note` | — | ❌ → credit note issue flow |
| `/invoices/debit-note` | — | ❌ → debit note flow |
| `/invoices/e-way-bill-view` | Compliance page generates e-Way bill | 🟡 dedicated print/parcel view missing |
| e-invoice/e-invoice cancel | Compliance page | ✅ |

## 5. Stocks & inventory

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/stocks/view-stocks` | `/dashboard/inventory` (Scan, DB, Adjust) | ✅ |
| `/stocks/adjust-stocks` | Inventory → Adjust Stock | ✅ |
| `/stocks/update-stock-info` | Inventory row edit | ✅ |
| `/stocks/upload-stocks` (bulk CSV stock upload) | — | 🟡 purchase-import ≠ stock upload; add stock CSV upload |
| `/stocks/bulk-update-settings` | — | ❌ |
| `/stocks/print-barcode-labels` | `/dashboard/labels` | ✅ |
| `/stocks/print-barcode-labels/stock-scan-qr` | BarcodeCameraScanner | ✅ |
| `/stocks/stock-picklist` | — | ❌ → picklist generation for bills |
| `/stocks/stock-transfer/view-transfers` | — | ❌ → inter-store transfers |
| `/stock-audit` (+ view-audit/batches/products) | `/dashboard/stock-audit` | ✅ |

## 6. Purchases

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/purchase/add-purchase` | `/dashboard/purchases` | ✅ |
| `/purchase/view-purchases` | Purchases list | ✅ |
| `/purchase/return-purchase` | Purchases → New purchase return | ✅ |
| `/purchase/return-expired-products` | expiry items in procurement | 🟡 dedicated expired-return flow |
| `/purchase/import-csv` | `/dashboard/purchase-import` | ✅ |
| `/purchase/banner/b2connectbanner` | — | 🟡 B2B Connect promo/entry point |

## 7. Orderbook (distributor ordering) — biggest gap

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/orderbook/dashboard` | — | ❌ |
| `/orderbook/distributors` + `[distributor_id]` | — | ❌ |
| `/orderbook/product-list` | — | ❌ |
| `/orderbook/products-already-to-order` | — | ❌ |
| `/orderbook/purchase-orders` + `view-po-detail` | — | ❌ |
| `/orderbook/shortbook` | — | ❌ |
| `/orderbook/view-cart` + `[order_id]` | — | ❌ |
| `/orderbook/order-analysis` | — | ❌ |
| procurement compare/quotes (existing MediBill extra) | `/dashboard/procurement` | ✅ extra |

## 8. Customer orders (MedCart-style B2C)

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/customer-orders` | `/dashboard/orders` | ✅ |
| `/customer-orders/order-detail` | Orders deliver dialog | 🟡 dedicated detail view |
| `/customer-orders/business-kyc` | Compliance KYC partial | 🟡 |
| `/customer-orders/promote-medcart` | campaigns page exists | 🟡 promotion screen for online store |
| `/order` public portal | `/order` OrderPortalPage | ✅ extra |

## 9. Cash, bank & expenses

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/cash-and-bank` | `/dashboard/cash-bank` (cash/bank books, statement) | ✅ |
| `/cash-and-bank/cheque-management` | — | ❌ → cheque register (issued/received/bounced/cleared) |
| `/expenses/view-expenses`, `/expenses/add-expense/[id]` | `/dashboard/expenses` + form | ✅ |

## 10. Reports

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/reports/business-reports` | `/dashboard/reports` | ✅ |
| `/reports/business-report-view/[report_id]` | report detail | ✅ |
| — (MediBill extra) | `/dashboard/scheduled-reports` | ✅ extra |
| — (MediBill extra) | `/dashboard/accounting` (TB/P&L/BS/daybook/journals) | ✅ extra |

## 11. Reminders & routes

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/reminders/view-reminders` | `/dashboard/refills` | ✅ |
| `/sales-routes` (delivery routes) | — | ❌ → route planning for deliveries |

## 12. Control center & settings

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/control-center/bulk-edit-bills` | `/dashboard/bulk-bills` | ✅ |
| `/control-center/business-profile` | `/dashboard/settings` | ✅ |
| `/control-center/sale-settings` | Settings (invoice format) | 🟡 full sale settings |
| `/control-center/prefix-sequences` | Settings prefix keyword only | 🟡 full numbering config UI |
| `/control-center/picklist-settings` | — | ❌ (pairs with stock picklist) |
| `/control-center/plans-pricing` | — | ❌ |
| `/control-center/refer-earn` | — | ❌ |
| `/control-center/integrations` | `/dashboard/integrations` | ✅ |
| `/control-center/migration`, `/upload-migration-data` | `/dashboard/migration` | ✅ |
| `/settings/subscriptions` | — | ❌ → subscription state + renew |
| `/subscriptions/checkout` | — | ❌ → plan checkout |
| `/settings/users-devices` | `/dashboard/staff` + `/dashboard/devices` | ✅ |

## 13. Support

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/support/tickets` + create + `[id]` | — | ❌ → ticketing module (list/create/detail) |
| `/support/account-manager` | — | ❌ → assigned account manager card |
| `/support/reset-account` | — | ❌ |
| `/support/videos-resources` | — | ❌ → help center (videos/docs links) |

## 14. Integrations

| LocalWell | MediBillGST | Status |
|---|---|---|
| `/integrations` + partner_integrations | `/dashboard/integrations` | ✅ |
| `/integrations/aadhar-kyc`, `/integrations/kyc-docs` | `/dashboard/compliance` | 🟡 consolidate |
| `/integrations/verify-email` | Auth flow | 🟡 |
| `/integrations/business-detail` | — | ❌ |

## Summary

- ✅ covered: 45 screens
- 🟡 partial: 13 (detail/policy gaps listed above)
- ❌ missing: 27 screens across 7 modules: **Orderbook (11)**, Support (5), Subscriptions/plans (3), Stocks ops (4: picklist, transfer, bulk settings, stock upload), Cheque management (1), Sales routes (1), Customer-facing sale screen (1), Credit/Debit notes (2)

Implementation plan: `docs/replication-plan.md`.
Deeper per-gap audit from the prior session: `docs/localwell-compare/parity-summary.md` (93 reference pages, 552 API operations, code-verified P1 gaps) — the depth gaps listed there (batches C–I) complement the module gaps in the matrix above; both backlogs are being executed together (see `docs/replication-plan.md` execution order).
