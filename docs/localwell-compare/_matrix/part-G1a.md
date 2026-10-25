## Slice G1a — parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/sale/add-sale` | `/dashboard/billing` | Partial | New-sale mode only: no backend-synced sale draft to resume, and the stock-transfer entry mode's intent is ambiguous (inter-branch move vs return-to-stock) so we defer it | M |
| `/sale/add-sale/[sale_id]` | `/dashboard/invoices` (detail dialog) + `/dashboard/billing` | Partial | No quotation document kind, no single-invoice line-edit composer (only bulk-bills edit), no per-sale follow-up/alternative suggestions | L |
| `/sale/customer-facing-screen` | `/order` (public customer portal) | Partial | No second-screen mirror of the live sale (lines, batch/expiry, totals) and no post-sale star/NPS capture; payment QR needs an external PSP | L |
| `/sale/return-sale` | `/dashboard/returns` | Partial | Return is list + create only: no settlement/credit-due fields, no refund capture on the return, no edit/delete, no warning gate, no return e-invoice/IRN, no credit-note preview | L |
| `/sale/view-sales` | `/dashboard/invoices` + `/dashboard/customers` + `/dashboard/reports` (Parties) + `/dashboard/payments` | Partial | No per-customer ledger panel (sales/returns/payments/quotations tabs), no customer merge/convert-to-patient, no statement download, no draft/quotation/proforma counters | L |
| `/sales-routes` | none — no equivalent route | Missing | No route or salesman entity, no customer-to-route mapping (map/unmap in bulk), no per-customer drug licence field | L |

## Slice G1a — our-side coverage notes

**Which of our routes serve these reference pages**

- `/dashboard/billing` is the counterpart of `/sale/add-sale`: full sale composition (customer/doctor lookup, prescription attach, line items, batch availability, expiry policy, payment method, invoice create) plus hold/recall of a parked bill.
- `/dashboard/invoices` carries the `/sale/add-sale/[sale_id]` read side (invoice detail + GST print view, payment history, cancel, share) and the sales table half of `/sale/view-sales`.
- `/dashboard/returns` is the `/sale/return-sale` counterpart: return-against-invoice via invoice search, returns list with totals, create-return modal.
- `/dashboard/customers` plus `/dashboard/reports` (Parties tab: customer RFM/balance sorting and per-party ledgers over a date range) plus `/dashboard/payments` (received/paid/expense register) together stand in for the CUSTOMERS half of `/sale/view-sales`.
- `/dashboard/reports` (Sales tab: sales register, summaries by product/company/category/customer, profit) and `/dashboard` KPIs stand in for the SALES BY DATE half of `/sale/view-sales`.
- `/dashboard/compliance` covers e-invoice generation for invoices (preflight, generate, cancel, submissions), which is the same mechanism the reference uses on returns.
- `/dashboard/settings` (invoice format prefix/pattern) and `/dashboard/billing` (next-number prefetch) are the closest analogue to the reference's prefix/sequence fetch for printed document numbers.
- `/dashboard/refills` and `/dashboard/communications` are the closest analogue to the reference's "send payment reminder" action (per-customer WhatsApp/SMS/email with templates and channel preferences).
- `/order` is our only customer-facing surface: public, no auth, store-scoped medicine search, cart, prescription upload for restricted meds, order status lookup — but it is a self-order portal, not a mirror of the cashier's live sale.

**Our routes with no reference counterpart in this slice**

- `/dashboard` (KPI dashboard with date range, fast/slow movers, upcoming refills) — the slice has no dashboard page.
- `/dashboard/orders` (staff queue: accept → pack → ready → deliver) and `/dashboard/bulk-bills` (bulk bill edit with preview diff) — no reference page here covers an order queue or bulk bill editing.
- `/dashboard/cash-bank` (cash/bank books, CSV statement import, suggested matches, match/unmatch), `/dashboard/accounting` (trial balance, P&L, balance sheet, journals, opening balances, period close).
- `/dashboard/inventory` (stock/expiry/low-stock/history, batch CRUD, adjustments with reason), `/dashboard/stock-audit` (count sessions → approve creates adjustments), `/dashboard/labels` (label templates, preview/print).
- `/dashboard/purchases`, `/dashboard/procurement` (supplier metrics, rate history, RFQ quotes, expiry-risk), `/dashboard/purchase-import` (CSV/OCR purchase-bill import with column mapping), `/dashboard/catalog` (catalog browse, alternatives, bulk CSV add), `/dashboard/suppliers`, `/dashboard/doctors`, `/dashboard/prescriptions`.
- `/dashboard/scan` (OCR of a supplier bill image), `/dashboard/scheduled-reports` (job list, run history, CSV download, email/SMS delivery), `/dashboard/refills`, `/dashboard/communications`, `/dashboard/campaigns` (campaigns + offers), `/dashboard/devices` (device registry, sessions, activity, sync), `/dashboard/integrations`, `/dashboard/migration`, `/dashboard/settings` (only the invoice-prefix part touches this slice).
- `/` (landing), `/auth`, `/onboarding`, `*` (404) — outside this slice.

**Where our route already exceeds the reference (supported by our-screens.md)**

- `/dashboard/billing` exceeds the reference sale composer: prescription image upload with verify/reject/dispense, inline medicine and batch creation, offer evaluation plus loyalty view, below-MRP margin warning, configurable expiry-policy block, hold/recall, and pulling an accepted customer order into the bill.
- `/dashboard/invoices` exceeds the reference transaction table: WhatsApp/SMS/email invoice share, cancel with status change, inline payment recording, and an on-page sales-register chart with a from/to filter.
- `/dashboard/reports` exceeds the reference sales master screen entirely: nine tabs (sales/stock/purchase/payments & expenses/profitability/inventory valuation/GST/parties/ordering), CSV export, doctor-wise sales, H/H1/X/G schedule filters, customer RFM/balance sorting, and GSTR-1/2/3B + ITC.
- `/dashboard/orders` + `/order` have no counterpart in this slice: staff order lifecycle and a public self-order portal with prescription upload for restricted medicines.
- `/dashboard/compliance` adds e-way bill generation with transport fields on top of e-invoice, which the reference slice only reaches on returns.
- `/dashboard/cash-bank` adds bank-statement CSV import with suggested match and match/unmatch; `/dashboard/accounting` adds double-entry books and period close — neither has a slice counterpart.
- `/dashboard/stock-audit` (session counts → approve → adjustments) and `/dashboard/procurement` (RFQ quotes, supplier metrics, rate history, expiry-risk) also exceed anything in this slice.
- `/dashboard/settings` adds expiry policy, price-override role policy, scheduled and manual backups plus cloud backup to Drive/R2/S3 — the reference slice has none of these.
- `/dashboard/refills`, `/dashboard/communications` and `/dashboard/campaigns` add refill reminders, message templates plus per-customer channel preferences, and campaigns/offers, none of which the reference slice models.

## Slice G1a — backlog

### G1a-01 — Quotation document type
- Reference pages: `/sale/add-sale/[sale_id]`, `/sale/view-sales`
- Description: the reference treats a quotation as a first-class sale document with its own loader, read-only view, validity date and counters; our model has no quotation at all.
- Acceptance criteria:
  - A quotation can be created from the billing composer (same lines/batches as a sale) and stored as its own document kind with a quotation number and valid-till date.
  - Opening a quotation loads its own payload read-only, with no invoice number or payment fields.
  - Quotations appear in the customer ledger panel under QUOTATION and are counted separately from sales.
- Size: L
- Dependency: backend data model
- Priority: P2

### G1a-02 — Backend-synced sale drafts and a drafts list
- Reference pages: `/sale/add-sale`
- Description: the reference carries a draft id in session state and pushes it to the backend on mount so a partially built sale resumes; our only parked-sale mechanism is hold/recall on a single bill.
- Acceptance criteria:
  - A partially built sale can be saved as a named draft and a stable draft id is returned.
  - Resuming a draft by id restores customer, lines, batch selections and payment mode; no stale customer or line survives into a new sale.
  - A drafts list shows each draft's id, customer and last update, and offers resume and delete.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1a-03 — Open an existing sale in the billing composer
- Reference pages: `/sale/add-sale/[sale_id]`
- Description: the reference reuses the same composer for an existing sale, while our invoice detail is read/print/cancel only and line editing exists only in bulk form.
- Acceptance criteria:
  - From the invoice list, an eligible invoice (unpaid, not e-invoiced, no return) opens in the billing composer with customer, lines and batches preloaded.
  - Edits show a before/after diff and require admin or pharmacist.
  - A saved edit reprints to the same invoice number with a revision stamp.
- Size: M
- Dependency: existing page extension
- Priority: P2

### G1a-04 — Settlement and credit tracking on sale returns
- Reference pages: `/sale/return-sale`
- Description: the reference records amount to refund, amount settled, balance due, credit due, custom charges, bill discount and an input-tax-credit claim toggle; our return captures only a refund basis.
- Acceptance criteria:
  - A return stores amount settled, balance due, credit due, custom charges and bill discount.
  - Partial settlement is recorded against the return and the remaining due is recomputed and shown on the returns list.
  - A report-GST-for-return flag and an input-tax-credit claim toggle exist on the return and are reflected in GST outputs.
- Size: M
- Dependency: backend data model
- Priority: P1

### G1a-05 — Refund capture and settlement history on a return
- Reference pages: `/sale/return-sale`
- Description: the reference captures payment against a business payment account with mode, reference/UTR, date and cheque number/MICR, and lists prior settlement rows; our payments register is a separate screen with no link to a return.
- Acceptance criteria:
  - A refund can be recorded on a return with mode (cash/cheque/other account), reference or UTR number, date and cheque number/MICR where applicable.
  - Recording a refund reduces the return's balance due and shows in the payments register with the return as party.
  - A VIEW PAYMENTS panel on the return lists prior settlement rows for that return.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1a-06 — Return editing, deletion and a validation-warning gate
- Reference pages: `/sale/return-sale`
- Description: the reference lets a saved return be reloaded, edited and deleted, and blocks saving until outstanding validation warnings are cleared.
- Acceptance criteria:
  - A saved return can be reopened for editing and saved again with a new revision.
  - Deleting a return requires confirmation and reports a specific failure message on error.
  - A warning panel lists blocking problems (missing customer, no product, expiry mismatch) and saving is refused while any remains.
- Size: M
- Dependency: existing page extension
- Priority: P2

### G1a-07 — Return line-grid parity
- Reference pages: `/sale/return-sale`
- Description: the reference grid shows medicine, batch, expiry, pack, quantity, MRP, rate, sale rate, GST and HSN plus free quantity and amount, with expiry filtering and a recently-sold shortcut list.
- Acceptance criteria:
  - Each return line exposes batch, expiry, pack, quantity in units or packs, free quantity, MRP, rate, GST rate and HSN.
  - Selecting a product lists only batches that can be returned, with expiring and expired batches flagged.
  - A recently-sold-products shortcut list offers products from recent invoices for quick addition.
- Size: M
- Dependency: existing page extension
- Priority: P1

### G1a-08 — Return numbering with configurable prefix/sequence
- Reference pages: `/sale/return-sale`
- Description: the reference fetches a per-document prefix/sequence so the printed return number matches the configured numbering scheme; our settings only carry an invoice prefix/pattern.
- Acceptance criteria:
  - A return-number prefix and sequence pattern is configurable in settings and applied when a return number is issued.
  - The issued number is shown on the return and on its printed/credit-note output and cannot be duplicated.
  - The same prefix configuration can be reused for credit notes.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1a-09 — e-Invoice (IRN) for sale returns
- Reference pages: `/sale/return-sale`
- Description: the reference generates an IRN for a return and updates the return's e-invoice status; our compliance page generates e-invoices for invoices only.
- Acceptance criteria:
  - A return can be submitted for e-invoice from the return screen and the IRN plus e-invoice status is stored on the return.
  - The status is visible on the returns list and can be cancelled with a reason.
  - A generation failure surfaces the provider message instead of silently leaving the return unflagged.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1a-10 — Customer ledger panel with SALES/RETURNS/PAYMENTS/QUOTATION tabs
- Reference pages: `/sale/view-sales`
- Description: the reference opens a customer detail panel with those four tabs and a card summary of gross sales, net sales, paid, due, customer returns due, customer age and customer-since; we spread this across the invoice table, the Parties report and the payments register.
- Acceptance criteria:
  - Opening a customer shows tabs for sales, returns, payments and quotations, each listing that party's documents with amount, paid and due.
  - A summary header shows gross sales, net sales, paid, outstanding due and customer returns due for the selected customer.
  - Figures reconcile with the invoice, return and payment records for the same customer and period.
- Size: M
- Dependency: existing page extension
- Priority: P1

### G1a-11 — Customer profile fields for parity
- Reference pages: `/sale/view-sales`, `/sales-routes`
- Description: the reference customer record carries GSTIN, age, gender, address lines, mobile, email and drug licence number, plus customer-since, first-sale and last-transaction stamps; ours stores name, phone, email and address.
- Acceptance criteria:
  - Customer records store GSTIN, age, gender, address lines and drug licence number alongside the existing fields.
  - Customer-since, first-sale date and last-transaction date are derived and shown in the customer detail panel.
  - Existing customers keep working with blank values for the new fields.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1a-12 — Merge customer and convert customer to patient
- Reference pages: `/sale/view-sales`
- Description: the reference offers merge customer and convert customer into patient from the customer actions menu, with confirmation prompts.
- Acceptance criteria:
  - Merge combines two customers into a surviving record, moving their invoices, returns and payments, and reports the result with a success toast.
  - Convert to patient creates the patient link used by prescriptions and requires an explicit confirmation.
  - Both actions are admin or pharmacist only.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1a-13 — Due-status vocabulary, refundable amount and date presets on the sales register
- Reference pages: `/sale/view-sales`
- Description: the reference status vocabulary is Paid / Due / Due Cleared / Overdue / Expired / Converted with a refundable amount column, and the date filter offers Today, Yesterday, Last 7 Days, Last 30 Days, Last Month, This Month plus custom from/to.
- Acceptance criteria:
  - The invoice register exposes the Paid / Due / Due Cleared / Overdue / Expired / Converted statuses derived from amounts and due dates.
  - A refundable-amount column is shown per row.
  - Date presets plus a custom from/to range can be selected and the applied range is displayed with a reset control.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1a-14 — Customer statement download
- Reference pages: `/sale/view-sales`
- Description: the reference offers a per-customer statement download for the selected period; our CSV export exists only inside the reports tabs.
- Acceptance criteria:
  - A statement for one customer and a date range can be downloaded from the customer detail panel.
  - The statement lists invoices, returns, payments and the closing balance for that customer.
  - The file is generated by the server and downloaded through the existing files mechanism.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1a-15 — Send payment reminder for a due invoice
- Reference pages: `/sale/view-sales`
- Description: the reference sends a payment reminder from the sales side; we can message a customer but only through refills or the communications composer.
- Acceptance criteria:
  - A due invoice offers a Send payment reminder action that pre-fills a message with the customer, invoice number and amount.
  - The action uses the existing message channel settings (WhatsApp/SMS/email) and records the delivery in communications history.
  - The reminder action is hidden for invoices with no outstanding due.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1a-16 — Customer-facing second screen for the live sale
- Reference pages: `/sale/customer-facing-screen`
- Description: the reference runs a shopper-facing display of the current sale (lines with quantity, pack, rate, MRP, batch, expiry; totals; amount to pay) with star rating and a 0–10 NPS capture written back to the sale.
- Acceptance criteria:
  - A public, no-auth page shows the in-progress sale for a given sale or invoice id: each line with quantity, pack, rate, MRP, batch number and expiry, plus product count, quantity, MRP total, discount, round-off and amount to pay.
  - A star rating and a 0–10 scale can be submitted for that sale and are stored against it.
  - Totals recompute when the invoice details are refreshed; nothing but the sale's own data is exposed.
- Size: L
- Dependency: new route
- Priority: P3

### G1a-17 — Per-sale alternative and follow-up suggestions in the composer
- Reference pages: `/sale/add-sale/[sale_id]`
- Description: the reference tracks follow-ups to show, follow-ups to suggest and non-composition products/follow-ups per sale; we have product-intelligence alternatives and prescriptions but no per-sale suggestion layer.
- Acceptance criteria:
  - When a prescription is attached, the composer surfaces non-composition alternatives from product intelligence for the current lines.
  - A suggestion can be accepted as a new line or dismissed, and dismissed items do not return for that sale.
  - Suggestions never alter price or stock without an explicit user action.
- Size: M
- Dependency: existing page extension
- Priority: P3

### G1a-18 — Salesman route planning
- Reference pages: `/sales-routes`
- Description: the reference manages routes, the customers mapped to each route and the responsible salesman, with bulk map/unmap; we have no route or salesperson concept (roles are admin, pharmacist, cashier).
- Acceptance criteria:
  - A route can be created and edited with name and area, and a salesman can be assigned or cleared.
  - Mapped and pending customers are listed per route, and unmapped customers can be mapped in bulk or removed.
  - A salesperson user type exists, since our role set currently stops at admin, pharmacist and cashier.
- Size: L
- Dependency: new page
- Priority: P3

## Slice G1a — deviations to document

- Multi-branch stock-transfer sale and stock-return transfer documents are not replicated — our app is single-store local-first and has no branch or location entity.
- B2B Connect import of candidate sale returns, and the duplicate debit-note check that depends on it, are not replicated — they need a third-party marketplace connector we do not have.
- The customer-facing payment QR image is not replicated — it requires an external UPI/PSP provider, while our flow takes payment at the counter and shares the invoice digitally.
- The "Recommend Us" referral carousel and the standalone welcome/dashboard screen mode are not replicated — those are storefront marketing features; our customer-facing surface is the public `/order` portal.
- Quick-scan gating on a single business type and the multi-tenant business switch in the sale header are not replicated — our app runs one business context per store.
- The return screen's bespoke F2 settings drawer and Space/Escape keybinding model are not replicated — our screens use standard dialogs plus the global shortcut dialog.
