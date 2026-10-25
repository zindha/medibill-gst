# LocalWell full-parity implementation plan

Goal: bring MediBill to functional parity with the 93 reference pages of `pharmacy.localwell.in`
(inventory + per-gap audit in `docs/localwell-compare/`), without copying any of the reference code,
strings or branding. All wording and implementation is original.

Status: audit complete (93 reference pages documented, 28 P1 gaps re-verified against the code).
Build order and rationale: `docs/localwell-compare/parity-summary.md`.

## Rules for every batch

- Server and frontend halves run as two parallel agents with **disjoint file scopes**; the Lead owns
  `apps/server/src/index.ts` (router registration) and the final verification.
- Ship with server tests (`apps/server/test/*.test.ts`), a green `npm run typecheck` at the repo root,
  a green `npx vitest run` in `apps/server`, and a green `npx vite build`.
- No new npm dependencies (pdfkit, zod, drizzle are already installed).
- No copied reference text: write our own labels, field names and help text.

## Batch A — Staff & access (running)

G4b1-01/02/03, G4b2-02.
Server: `routes/staff.ts` (roster, create with role, patch role/status, admin password reset),
`routes/devices.ts` (+ `POST /devices/users/:userId/revoke-all`), registration in `src/index.ts`.
Frontend: `pages/StaffPage.tsx`, nav entry (admin-gated) in `components/DashboardLayout.tsx`,
per-owner revoke-all in `pages/DevicesPage.tsx`, "Change password" card in `pages/SettingsPage.tsx`
(the `changePassword` client already exists but had **zero** callers).
Acceptance: admin manages staff; last admin cannot be demoted; reset kills that user's sessions;
non-admin sees read-only staff list; a user can change their own password.

## Batch B — Purchase correctness (running)

G2-01..G2-07.
Schema (migration `0018_purchase_correctness.sql`): `suppliers.drugLicenseNo`, `suppliers.gstinVerified`,
`purchase_bills.supplierInvoiceNo` (+ partial unique index), `purchase_bills.outsideGst`,
`purchase_bill_items.markup`, `medicines.maxQuantity/reorderPointDays/demandPeriodDays/seasonal`.
Server: duplicate-bill 409 guard, full payment-mode enum, `POST /purchases/:id/settle`, HSN/GST from the
medicine master, outside-GST forcing zero tax, per-line discount + markup math, supplier credit fields
accepted by the API, reorder-policy fields persisted.
Frontend: fix the dead medicine picker, add supplier-invoice-no / amount-paid / payment-mode /
outside-GST / per-line discount + markup inputs, supplier credit fields, medicine reorder inputs,
shortbook supplier column + "add to purchase" prefill.
Acceptance: a duplicate supplier invoice is rejected; a bill can be paid and settled; HSN and GST come
from the master; outside-GST bills carry no tax; supplier credit terms are editable.

## Batch C — Payment accounts & cash/bank (next)

G4a-01. New `payment_accounts` table (name, type cash/bank/upi, ifsc, accountHolder, upiId, openingBalance),
`payment_account_transactions` for add/reduce adjustments, `payments.accountId`.
Server: `routes/paymentAccounts.ts` (CRUD, `GET /:id/statement`, `POST /:id/adjust`).
Frontend: `pages/PaymentAccountsPage.tsx` + link from `pages/CashBankPage.tsx`; statement with running
balance and CSV/PDF export.
Acceptance: three or more accounts can coexist, each with its own statement and balance; adjustments
post to the ledger.

## Batch D — Configurable numbering (running, server)

G4a-02. `services/numbering.ts` owning prefix/pad/startAt/scope per document type; the invoice
generator stops hardcoding `MB-`; expense/sale-return/purchase-return generators use their own
prefixes; `settings.ts` exposes GET/PUT for `numberingFormats`.
Frontend follow-up: a per-type grid in `pages/SettingsPage.tsx`.
Acceptance: changing the prefix changes the next document number; default output unchanged.

## Batch E — Stock operations depth (next)

G3a-07/08/10, G3b-01/02/03.
Schema: `batches.barcode`, `stock_audit_counts.reason`.
Server: batch-barcode lookup, audit count `mode: set|increment`, per-count reason, summary in units
(short/excess SKU counts, net adjustment quantity).
Frontend: `pages/StockAuditPage.tsx` — editable counted cell, per-batch reason, sortable headers, scan
mode with `components/BarcodeCameraScanner.tsx`; new `pages/PicklistPage.tsx` with pending/picked panels
and a print sheet (pdfkit is already a dependency).
Acceptance: counting by camera works; the audit result shows units; a picklist can be printed.

## Batch F — Documents & ledgers (next)

G1a-04/07/10, G1b-01/02/05/09.
Server: `sales_return_items.discountAmount`; return line editing with rate/discount; credit refunds
write a `credit_accounts` row and a `payments` row and **stop increasing the customer balance** (sign
fix vs `services/accounting.ts`); customer ledger joins invoices, returns and quotations.
Frontend: printable credit note (sale return) and debit note (purchase return); invoice preview with
zoom, page selection and PDF export; pagination + row count + keyboard row selection on the invoice,
sales-return and purchase-return registers; customer ledger panel with SALES/RETURNS/PAYMENTS/QUOTATION
tabs.
Acceptance: a credit note prints; registers page; the customer page shows the full ledger; a credit
return leaves a credit that can be applied to a later invoice.

## Batch G — Patient follow-ups (next)

G1b-11. Patient-centric worklist: type (refill/visit), per-patient history, remark log, bulk actions.
Reuse `refill_reminders` plus a small follow-up type/remark extension.

## Batch H — Report depth (next)

Filter builder, column chooser, Excel/PDF/HTML/email export over the server's report catalogue.
pdfkit is already installed; no new dependency.

## Batch I — Dashboard cards (next)

Stock value, cash in hand, new vs repeat customers, due payments.

## Verification protocol (Lead, after each batch)

```
cd D:\Projects\MediBillGST\apps\server && npx vitest run
cd D:\Projects\MediBillGST && npm run typecheck
cd D:\Projects\MediBillGST && npx vite build
```

Then update `docs/localwell-compare/parity-summary.md` (status column per gap) and
`docs/localwell-compare/parity-matrix.md` (status column per reference page).
