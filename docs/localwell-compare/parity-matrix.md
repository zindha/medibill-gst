# LocalWell reference vs MediBill — parity matrix

## Method

Reference: 93 client-side pages of pharmacy.localwell.in recovered from the public `_buildManifest.js` + page chunks (reference inventory: `docs/localwell-compare/ref-screens.md`; backend operation catalogue: `docs/localwell-compare/ref-api-operations.md`).
Ours: 35 routes of the MediBill SPA (inventory: `docs/localwell-compare/our-screens.md`).

Each reference page was compared against our nearest route by feature (workflows, fields, operations, states), not by URL or wording.

### Status vocabulary

| Status | Meaning |
| --- | --- |
| Covered | We provide the same capability. |
| Partial | We have it but materially narrower — the gap cell names what is missing. |
| Missing | We have no equivalent. |
| In progress | Being implemented now. |
| N/A | Depends on cloud, subscription, partner or marketplace behaviour a local-first single-pharmacy app does not replicate; justified per row. |

### Roll-up

| Status | Reference pages |
| --- | --- |
| Covered | 2 |
| Partial | 52 |
| Missing | 9 |
| In progress | 2 |
| N/A | 28 |
| **Total** | **93** |

Per-slice matrices and backlogs follow. Sizes: S < 1 day, M 1-3 days, L > 3 days. Priorities: P1 core pharmacy workflow, P2 significant workflow, P3 nice-to-have.

---

## Slice G1a â€” parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/sale/add-sale` | `/dashboard/billing` | Partial | New-sale mode only: no backend-synced sale draft to resume, and the stock-transfer entry mode's intent is ambiguous (inter-branch move vs return-to-stock) so we defer it | M |
| `/sale/add-sale/[sale_id]` | `/dashboard/invoices` (detail dialog) + `/dashboard/billing` | Partial | No quotation document kind, no single-invoice line-edit composer (only bulk-bills edit), no per-sale follow-up/alternative suggestions | L |
| `/sale/customer-facing-screen` | `/order` (public customer portal) | Partial | No second-screen mirror of the live sale (lines, batch/expiry, totals) and no post-sale star/NPS capture; payment QR needs an external PSP | L |
| `/sale/return-sale` | `/dashboard/returns` | Partial | Return is list + create only: no settlement/credit-due fields, no refund capture on the return, no edit/delete, no warning gate, no return e-invoice/IRN, no credit-note preview | L |
| `/sale/view-sales` | `/dashboard/invoices` + `/dashboard/customers` + `/dashboard/reports` (Parties) + `/dashboard/payments` | Partial | No per-customer ledger panel (sales/returns/payments/quotations tabs), no customer merge/convert-to-patient, no statement download, no draft/quotation/proforma counters | L |
| `/sales-routes` | none â€” no equivalent route | Missing | No route or salesman entity, no customer-to-route mapping (map/unmap in bulk), no per-customer drug licence field | L |

## Slice G1a â€” our-side coverage notes

**Which of our routes serve these reference pages**

- `/dashboard/billing` is the counterpart of `/sale/add-sale`: full sale composition (customer/doctor lookup, prescription attach, line items, batch availability, expiry policy, payment method, invoice create) plus hold/recall of a parked bill.
- `/dashboard/invoices` carries the `/sale/add-sale/[sale_id]` read side (invoice detail + GST print view, payment history, cancel, share) and the sales table half of `/sale/view-sales`.
- `/dashboard/returns` is the `/sale/return-sale` counterpart: return-against-invoice via invoice search, returns list with totals, create-return modal.
- `/dashboard/customers` plus `/dashboard/reports` (Parties tab: customer RFM/balance sorting and per-party ledgers over a date range) plus `/dashboard/payments` (received/paid/expense register) together stand in for the CUSTOMERS half of `/sale/view-sales`.
- `/dashboard/reports` (Sales tab: sales register, summaries by product/company/category/customer, profit) and `/dashboard` KPIs stand in for the SALES BY DATE half of `/sale/view-sales`.
- `/dashboard/compliance` covers e-invoice generation for invoices (preflight, generate, cancel, submissions), which is the same mechanism the reference uses on returns.
- `/dashboard/settings` (invoice format prefix/pattern) and `/dashboard/billing` (next-number prefetch) are the closest analogue to the reference's prefix/sequence fetch for printed document numbers.
- `/dashboard/refills` and `/dashboard/communications` are the closest analogue to the reference's "send payment reminder" action (per-customer WhatsApp/SMS/email with templates and channel preferences).
- `/order` is our only customer-facing surface: public, no auth, store-scoped medicine search, cart, prescription upload for restricted meds, order status lookup â€” but it is a self-order portal, not a mirror of the cashier's live sale.

**Our routes with no reference counterpart in this slice**

- `/dashboard` (KPI dashboard with date range, fast/slow movers, upcoming refills) â€” the slice has no dashboard page.
- `/dashboard/orders` (staff queue: accept â†’ pack â†’ ready â†’ deliver) and `/dashboard/bulk-bills` (bulk bill edit with preview diff) â€” no reference page here covers an order queue or bulk bill editing.
- `/dashboard/cash-bank` (cash/bank books, CSV statement import, suggested matches, match/unmatch), `/dashboard/accounting` (trial balance, P&L, balance sheet, journals, opening balances, period close).
- `/dashboard/inventory` (stock/expiry/low-stock/history, batch CRUD, adjustments with reason), `/dashboard/stock-audit` (count sessions â†’ approve creates adjustments), `/dashboard/labels` (label templates, preview/print).
- `/dashboard/purchases`, `/dashboard/procurement` (supplier metrics, rate history, RFQ quotes, expiry-risk), `/dashboard/purchase-import` (CSV/OCR purchase-bill import with column mapping), `/dashboard/catalog` (catalog browse, alternatives, bulk CSV add), `/dashboard/suppliers`, `/dashboard/doctors`, `/dashboard/prescriptions`.
- `/dashboard/scan` (OCR of a supplier bill image), `/dashboard/scheduled-reports` (job list, run history, CSV download, email/SMS delivery), `/dashboard/refills`, `/dashboard/communications`, `/dashboard/campaigns` (campaigns + offers), `/dashboard/devices` (device registry, sessions, activity, sync), `/dashboard/integrations`, `/dashboard/migration`, `/dashboard/settings` (only the invoice-prefix part touches this slice).
- `/` (landing), `/auth`, `/onboarding`, `*` (404) â€” outside this slice.

**Where our route already exceeds the reference (supported by our-screens.md)**

- `/dashboard/billing` exceeds the reference sale composer: prescription image upload with verify/reject/dispense, inline medicine and batch creation, offer evaluation plus loyalty view, below-MRP margin warning, configurable expiry-policy block, hold/recall, and pulling an accepted customer order into the bill.
- `/dashboard/invoices` exceeds the reference transaction table: WhatsApp/SMS/email invoice share, cancel with status change, inline payment recording, and an on-page sales-register chart with a from/to filter.
- `/dashboard/reports` exceeds the reference sales master screen entirely: nine tabs (sales/stock/purchase/payments & expenses/profitability/inventory valuation/GST/parties/ordering), CSV export, doctor-wise sales, H/H1/X/G schedule filters, customer RFM/balance sorting, and GSTR-1/2/3B + ITC.
- `/dashboard/orders` + `/order` have no counterpart in this slice: staff order lifecycle and a public self-order portal with prescription upload for restricted medicines.
- `/dashboard/compliance` adds e-way bill generation with transport fields on top of e-invoice, which the reference slice only reaches on returns.
- `/dashboard/cash-bank` adds bank-statement CSV import with suggested match and match/unmatch; `/dashboard/accounting` adds double-entry books and period close â€” neither has a slice counterpart.
- `/dashboard/stock-audit` (session counts â†’ approve â†’ adjustments) and `/dashboard/procurement` (RFQ quotes, supplier metrics, rate history, expiry-risk) also exceed anything in this slice.
- `/dashboard/settings` adds expiry policy, price-override role policy, scheduled and manual backups plus cloud backup to Drive/R2/S3 â€” the reference slice has none of these.
- `/dashboard/refills`, `/dashboard/communications` and `/dashboard/campaigns` add refill reminders, message templates plus per-customer channel preferences, and campaigns/offers, none of which the reference slice models.

## Slice G1a â€” backlog

### G1a-01 â€” Quotation document type
- Reference pages: `/sale/add-sale/[sale_id]`, `/sale/view-sales`
- Description: the reference treats a quotation as a first-class sale document with its own loader, read-only view, validity date and counters; our model has no quotation at all.
- Acceptance criteria:
  - A quotation can be created from the billing composer (same lines/batches as a sale) and stored as its own document kind with a quotation number and valid-till date.
  - Opening a quotation loads its own payload read-only, with no invoice number or payment fields.
  - Quotations appear in the customer ledger panel under QUOTATION and are counted separately from sales.
- Size: L
- Dependency: backend data model
- Priority: P2

### G1a-02 â€” Backend-synced sale drafts and a drafts list
- Reference pages: `/sale/add-sale`
- Description: the reference carries a draft id in session state and pushes it to the backend on mount so a partially built sale resumes; our only parked-sale mechanism is hold/recall on a single bill.
- Acceptance criteria:
  - A partially built sale can be saved as a named draft and a stable draft id is returned.
  - Resuming a draft by id restores customer, lines, batch selections and payment mode; no stale customer or line survives into a new sale.
  - A drafts list shows each draft's id, customer and last update, and offers resume and delete.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1a-03 â€” Open an existing sale in the billing composer
- Reference pages: `/sale/add-sale/[sale_id]`
- Description: the reference reuses the same composer for an existing sale, while our invoice detail is read/print/cancel only and line editing exists only in bulk form.
- Acceptance criteria:
  - From the invoice list, an eligible invoice (unpaid, not e-invoiced, no return) opens in the billing composer with customer, lines and batches preloaded.
  - Edits show a before/after diff and require admin or pharmacist.
  - A saved edit reprints to the same invoice number with a revision stamp.
- Size: M
- Dependency: existing page extension
- Priority: P2

### G1a-04 â€” Settlement and credit tracking on sale returns
- Reference pages: `/sale/return-sale`
- Description: the reference records amount to refund, amount settled, balance due, credit due, custom charges, bill discount and an input-tax-credit claim toggle; our return captures only a refund basis.
- Acceptance criteria:
  - A return stores amount settled, balance due, credit due, custom charges and bill discount.
  - Partial settlement is recorded against the return and the remaining due is recomputed and shown on the returns list.
  - A report-GST-for-return flag and an input-tax-credit claim toggle exist on the return and are reflected in GST outputs.
- Size: M
- Dependency: backend data model
- Priority: P1

### G1a-05 â€” Refund capture and settlement history on a return
- Reference pages: `/sale/return-sale`
- Description: the reference captures payment against a business payment account with mode, reference/UTR, date and cheque number/MICR, and lists prior settlement rows; our payments register is a separate screen with no link to a return.
- Acceptance criteria:
  - A refund can be recorded on a return with mode (cash/cheque/other account), reference or UTR number, date and cheque number/MICR where applicable.
  - Recording a refund reduces the return's balance due and shows in the payments register with the return as party.
  - A VIEW PAYMENTS panel on the return lists prior settlement rows for that return.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1a-06 â€” Return editing, deletion and a validation-warning gate
- Reference pages: `/sale/return-sale`
- Description: the reference lets a saved return be reloaded, edited and deleted, and blocks saving until outstanding validation warnings are cleared.
- Acceptance criteria:
  - A saved return can be reopened for editing and saved again with a new revision.
  - Deleting a return requires confirmation and reports a specific failure message on error.
  - A warning panel lists blocking problems (missing customer, no product, expiry mismatch) and saving is refused while any remains.
- Size: M
- Dependency: existing page extension
- Priority: P2

### G1a-07 â€” Return line-grid parity
- Reference pages: `/sale/return-sale`
- Description: the reference grid shows medicine, batch, expiry, pack, quantity, MRP, rate, sale rate, GST and HSN plus free quantity and amount, with expiry filtering and a recently-sold shortcut list.
- Acceptance criteria:
  - Each return line exposes batch, expiry, pack, quantity in units or packs, free quantity, MRP, rate, GST rate and HSN.
  - Selecting a product lists only batches that can be returned, with expiring and expired batches flagged.
  - A recently-sold-products shortcut list offers products from recent invoices for quick addition.
- Size: M
- Dependency: existing page extension
- Priority: P1

### G1a-08 â€” Return numbering with configurable prefix/sequence
- Reference pages: `/sale/return-sale`
- Description: the reference fetches a per-document prefix/sequence so the printed return number matches the configured numbering scheme; our settings only carry an invoice prefix/pattern.
- Acceptance criteria:
  - A return-number prefix and sequence pattern is configurable in settings and applied when a return number is issued.
  - The issued number is shown on the return and on its printed/credit-note output and cannot be duplicated.
  - The same prefix configuration can be reused for credit notes.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1a-09 â€” e-Invoice (IRN) for sale returns
- Reference pages: `/sale/return-sale`
- Description: the reference generates an IRN for a return and updates the return's e-invoice status; our compliance page generates e-invoices for invoices only.
- Acceptance criteria:
  - A return can be submitted for e-invoice from the return screen and the IRN plus e-invoice status is stored on the return.
  - The status is visible on the returns list and can be cancelled with a reason.
  - A generation failure surfaces the provider message instead of silently leaving the return unflagged.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1a-10 â€” Customer ledger panel with SALES/RETURNS/PAYMENTS/QUOTATION tabs
- Reference pages: `/sale/view-sales`
- Description: the reference opens a customer detail panel with those four tabs and a card summary of gross sales, net sales, paid, due, customer returns due, customer age and customer-since; we spread this across the invoice table, the Parties report and the payments register.
- Acceptance criteria:
  - Opening a customer shows tabs for sales, returns, payments and quotations, each listing that party's documents with amount, paid and due.
  - A summary header shows gross sales, net sales, paid, outstanding due and customer returns due for the selected customer.
  - Figures reconcile with the invoice, return and payment records for the same customer and period.
- Size: M
- Dependency: existing page extension
- Priority: P1

### G1a-11 â€” Customer profile fields for parity
- Reference pages: `/sale/view-sales`, `/sales-routes`
- Description: the reference customer record carries GSTIN, age, gender, address lines, mobile, email and drug licence number, plus customer-since, first-sale and last-transaction stamps; ours stores name, phone, email and address.
- Acceptance criteria:
  - Customer records store GSTIN, age, gender, address lines and drug licence number alongside the existing fields.
  - Customer-since, first-sale date and last-transaction date are derived and shown in the customer detail panel.
  - Existing customers keep working with blank values for the new fields.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1a-12 â€” Merge customer and convert customer to patient
- Reference pages: `/sale/view-sales`
- Description: the reference offers merge customer and convert customer into patient from the customer actions menu, with confirmation prompts.
- Acceptance criteria:
  - Merge combines two customers into a surviving record, moving their invoices, returns and payments, and reports the result with a success toast.
  - Convert to patient creates the patient link used by prescriptions and requires an explicit confirmation.
  - Both actions are admin or pharmacist only.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1a-13 â€” Due-status vocabulary, refundable amount and date presets on the sales register
- Reference pages: `/sale/view-sales`
- Description: the reference status vocabulary is Paid / Due / Due Cleared / Overdue / Expired / Converted with a refundable amount column, and the date filter offers Today, Yesterday, Last 7 Days, Last 30 Days, Last Month, This Month plus custom from/to.
- Acceptance criteria:
  - The invoice register exposes the Paid / Due / Due Cleared / Overdue / Expired / Converted statuses derived from amounts and due dates.
  - A refundable-amount column is shown per row.
  - Date presets plus a custom from/to range can be selected and the applied range is displayed with a reset control.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1a-14 â€” Customer statement download
- Reference pages: `/sale/view-sales`
- Description: the reference offers a per-customer statement download for the selected period; our CSV export exists only inside the reports tabs.
- Acceptance criteria:
  - A statement for one customer and a date range can be downloaded from the customer detail panel.
  - The statement lists invoices, returns, payments and the closing balance for that customer.
  - The file is generated by the server and downloaded through the existing files mechanism.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1a-15 â€” Send payment reminder for a due invoice
- Reference pages: `/sale/view-sales`
- Description: the reference sends a payment reminder from the sales side; we can message a customer but only through refills or the communications composer.
- Acceptance criteria:
  - A due invoice offers a Send payment reminder action that pre-fills a message with the customer, invoice number and amount.
  - The action uses the existing message channel settings (WhatsApp/SMS/email) and records the delivery in communications history.
  - The reminder action is hidden for invoices with no outstanding due.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1a-16 â€” Customer-facing second screen for the live sale
- Reference pages: `/sale/customer-facing-screen`
- Description: the reference runs a shopper-facing display of the current sale (lines with quantity, pack, rate, MRP, batch, expiry; totals; amount to pay) with star rating and a 0â€“10 NPS capture written back to the sale.
- Acceptance criteria:
  - A public, no-auth page shows the in-progress sale for a given sale or invoice id: each line with quantity, pack, rate, MRP, batch number and expiry, plus product count, quantity, MRP total, discount, round-off and amount to pay.
  - A star rating and a 0â€“10 scale can be submitted for that sale and are stored against it.
  - Totals recompute when the invoice details are refreshed; nothing but the sale's own data is exposed.
- Size: L
- Dependency: new route
- Priority: P3

### G1a-17 â€” Per-sale alternative and follow-up suggestions in the composer
- Reference pages: `/sale/add-sale/[sale_id]`
- Description: the reference tracks follow-ups to show, follow-ups to suggest and non-composition products/follow-ups per sale; we have product-intelligence alternatives and prescriptions but no per-sale suggestion layer.
- Acceptance criteria:
  - When a prescription is attached, the composer surfaces non-composition alternatives from product intelligence for the current lines.
  - A suggestion can be accepted as a new line or dismissed, and dismissed items do not return for that sale.
  - Suggestions never alter price or stock without an explicit user action.
- Size: M
- Dependency: existing page extension
- Priority: P3

### G1a-18 â€” Salesman route planning
- Reference pages: `/sales-routes`
- Description: the reference manages routes, the customers mapped to each route and the responsible salesman, with bulk map/unmap; we have no route or salesperson concept (roles are admin, pharmacist, cashier).
- Acceptance criteria:
  - A route can be created and edited with name and area, and a salesman can be assigned or cleared.
  - Mapped and pending customers are listed per route, and unmapped customers can be mapped in bulk or removed.
  - A salesperson user type exists, since our role set currently stops at admin, pharmacist and cashier.
- Size: L
- Dependency: new page
- Priority: P3

## Slice G1a â€” deviations to document

- Multi-branch stock-transfer sale and stock-return transfer documents are not replicated â€” our app is single-store local-first and has no branch or location entity.
- B2B Connect import of candidate sale returns, and the duplicate debit-note check that depends on it, are not replicated â€” they need a third-party marketplace connector we do not have.
- The customer-facing payment QR image is not replicated â€” it requires an external UPI/PSP provider, while our flow takes payment at the counter and shares the invoice digitally.
- The "Recommend Us" referral carousel and the standalone welcome/dashboard screen mode are not replicated â€” those are storefront marketing features; our customer-facing surface is the public `/order` portal.
- Quick-scan gating on a single business type and the multi-tenant business switch in the sale header are not replicated â€” our app runs one business context per store.
- The return screen's bespoke F2 settings drawer and Space/Escape keybinding model are not replicated â€” our screens use standard dialogs plus the global shortcut dialog.


---

## Slice G1b â€” parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/invoices/credit-note` | `/dashboard/returns` | Partial | No printable credit note at all â€” no document preview with zoom and page selection, no thermal vs laser layout choice, no PDF export, no email/SMS/WhatsApp send of the note, no jump back to the originating sale | M |
| `/invoices/debit-note` | `/dashboard/purchases` (Purchase Returns tab) | Partial | Purchase returns exist as records but never as a document â€” no debit-note preview with zoom and page selection, no print-layout choice, no PDF export, no send-by-channel modal, no link back to the source purchase | M |
| `/invoices/e-way-bill-view` | `/dashboard/compliance` | Partial | We generate e-way bills and list submissions, but a per-invoice read-only bill view is missing â€” no e-way bill number and valid-until dates, no document preview with zoom and page selection, no bill PDF export, no back-to-invoice action | M |
| `/invoices/sale-invoice-new` | `/dashboard/invoices` | Partial | We print a GST invoice and share it by WhatsApp/SMS/email, but lack the preview pane with zoom and page selection, PDF export, laser/inkjet vs dot-matrix A5/A6 layouts, previous/next invoice navigation, invoice language switcher with tutorial modal, customer summary panel (age, first-sale date, net value, edit link), inline quotation details and websocket connectivity status | L |
| `/transactions/sales` | `/dashboard/invoices` | Partial | The invoice register searches, filters and sorts, but has no pagination, no always-on row count and no keyboard row selection | S |
| `/transactions/purchases` | `/dashboard/purchases` (Bills tab) | Partial | The purchase-bill list has search and pagination but no sort control, no always-on row count and no keyboard row selection | S |
| `/transactions/sale-returns` | `/dashboard/returns` | Partial | Our returns list carries totals only â€” no status filter, no sort, no pagination, no always-on row count, no keyboard row selection | S |
| `/transactions/purchase-returns` | `/dashboard/purchases` (Purchase Returns tab) | Partial | The purchase-returns list has no filters, no sorting, no pagination, no always-on row count and no keyboard row selection | S |
| `/reminders/view-reminders` | `/dashboard/refills` (+ `/dashboard/customers`) | Partial | Refill reminders exist with CRUD and sending, but there is no follow-up list/patient-detail split, no follow-up-type, date-range, status, search and sort filters with an applied summary and reset, no bulk selection, no helpful/not-helpful marking, no patient analytics strip, no sales-history panel, no follow-up remarks composer, no check-current-stock action and no dropped-off flag | L |

## Slice G1b â€” our-side coverage notes

**Which of our routes serve these reference pages**

- `/dashboard/invoices` serves `/transactions/sales` (invoice register with search, status filter and sort by date/amount/customer) and most of `/invoices/sale-invoice-new` (GST print view, payment history, cancel, e-invoice status per row, WhatsApp/SMS/email share).
- `/dashboard/returns` serves `/transactions/sale-returns` (returns list with totals plus a create-against-invoice modal) and is the data source for `/invoices/credit-note`.
- `/dashboard/purchases` serves `/transactions/purchases` (Bills tab) and `/transactions/purchase-returns` (Purchase Returns tab), and is the data source for `/invoices/debit-note`.
- `/dashboard/compliance` serves `/invoices/e-way-bill-view`: e-way bill generation with transport fields, plus provider status and a submissions list.
- `/dashboard/refills` serves `/reminders/view-reminders`: refill reminder list, create form with patient medicine and interval info, status update, delete, send-one and send-all-due.
- `/dashboard/customers` backs the patient half of `/reminders/view-reminders`: customer list with edit, engagement insights, loyalty and a quick "create refill reminder" action.
- `/dashboard/reports` (Sales tab for the sales register, Parties tab for customer RFM and per-party ledgers) supplies the aggregates the reference shows on its patient analytics strip and sales-history panel.

**Our routes with no reference counterpart in this slice**

- Sale and order surfaces: `/dashboard/billing`, `/dashboard/orders`, `/dashboard/bulk-bills`, `/order` (public customer portal).
- Money and books: `/dashboard/payments`, `/dashboard/cash-bank`, `/dashboard/accounting`.
- Stock and procurement: `/dashboard/inventory`, `/dashboard/labels`, `/dashboard/procurement`, `/dashboard/purchase-import`, `/dashboard/scan`, `/dashboard/stock-audit`, `/dashboard/catalog`, `/dashboard/suppliers`.
- Clinical records: `/dashboard/prescriptions`, `/dashboard/doctors`.
- Engagement and messaging: `/dashboard/communications`, `/dashboard/campaigns`, `/dashboard/scheduled-reports`.
- Platform and configuration: `/dashboard/devices`, `/dashboard/integrations`, `/dashboard/migration`, `/dashboard/settings`, `/dashboard` (KPI dashboard), plus `/`, `/auth`, `/onboarding` and `*`.

**Where our route already exceeds the reference (supported by our-screens.md)**

- Invoice lifecycle: our invoice detail records payments in cash/card/UPI/bank-transfer mode, cancels the invoice, surfaces a hold list in the filters and shows per-row e-invoice status; the reference invoice screens are read, print and share only.
- Sales reporting on the list itself: `/dashboard/invoices` embeds a sales-register aggregation chart with a from/to filter; the reference transaction screens are plain lists.
- Purchase side: `/dashboard/purchases` adds a supplier price-comparison dialog, supplier prior-bill lookup, batch history for a returned item and role-gated rate override; the reference purchase screen is a category wrapper.
- Returns: our returns list carries totals and a create-against-invoice modal, while the reference sale-returns tab is a category switch with no totals.
- Refill dispatch: `/dashboard/refills` adds send-all-due batch dispatch and a messaging-provider health check; the reference follow-up composer posts a remark manually.
- Customer side: `/dashboard/customers` adds loyalty earn/redeem, engagement insights and a one-click refill reminder from the customer row.
- Reporting depth: `/dashboard/reports` spans nine tabs including GSTR-1/2/3B, HSN and ITC, inventory valuation and party ledgers; the reference slice offers lists plus a single patient metric strip.
- Online store: the reference's invoice WhatsApp share only links to a hosted store, while our `/order` portal is a working public self-order surface with medicine search, cart, prescription upload and order status.
- Compliance: our compliance page adds e-invoice preflight validation, cancel-with-reason and a submissions list, none of which appear on the reference invoice screens.

## Slice G1b â€” backlog

### G1b-01 â€” Printable credit note for sale returns
- Reference pages: `/invoices/credit-note`
- Description: the reference prints a sale-return credit note as a document; our returns screen produces a record only.
- Acceptance criteria:
  - A sale return opens a credit-note view showing the note number, the creation date and the invoice it belongs to.
  - The document renders in a preview pane that supports zoom in/out and page selection.
  - A print section switches between laser/inkjet and thermal receipt layouts, and an export-as-PDF action downloads the note as a PDF file.
  - The note body lists the returned line items and the return details.
- Size: M
- Dependency: new route
- Priority: P1

### G1b-02 â€” Printable debit note for purchase returns
- Reference pages: `/invoices/debit-note`
- Description: the reference prints the purchase-side mirror of the credit note; our Purchase Returns tab lists returns without a document.
- Acceptance criteria:
  - A purchase return opens a debit-note view showing the debit note number, the creation date and the source purchase.
  - The document renders in a preview pane with zoom in/out and page selection, and the body lists the returned products and the purchase-return details.
  - A print section switches between laser/inkjet and thermal receipt layouts, with an export-as-PDF action.
  - A header action returns to the originating purchase.
- Size: M
- Dependency: new route
- Priority: P1

### G1b-03 â€” Send credit and debit notes over email, SMS and WhatsApp
- Reference pages: `/invoices/credit-note`, `/invoices/debit-note`
- Description: the reference offers a send modal with three channels on both note types; our invoice share does not cover return or purchase-return documents.
- Acceptance criteria:
  - The credit-note and debit-note views expose a send action offering email, SMS and WhatsApp.
  - Choosing a channel posts the document for that channel and reports success or failure with a snackbar.
  - A WhatsApp send targets the customer's mobile number with a pre-formatted message body.
  - Each send is recorded in the communications delivery history.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1b-04 â€” Per-invoice e-way bill viewer
- Reference pages: `/invoices/e-way-bill-view`
- Description: the reference reads back the e-way bill attached to a sale invoice; our compliance page only issues and lists bills.
- Acceptance criteria:
  - An invoice with an issued e-way bill opens a read-only bill view showing the e-way bill number, the date it was generated and the date it stays valid until, alongside the invoice number and date.
  - The bill renders as a document preview with zoom and page selection, and an export-as-PDF action downloads it.
  - A back action returns to the previous screen, and a missing or failed bill shows an explicit failure message.
- Size: M
- Dependency: new route
- Priority: P2

### G1b-05 â€” Invoice preview pane with zoom, page selection and PDF export
- Reference pages: `/invoices/sale-invoice-new`, `/invoices/credit-note`, `/invoices/debit-note`, `/invoices/e-way-bill-view`
- Description: every reference document screen is built around a zoomable preview pane and an export-as-PDF action; ours prints a static GST view with no PDF export.
- Acceptance criteria:
  - The invoice detail view renders the invoice in a preview pane with zoom in/out and page selection.
  - An export-as-PDF action downloads the invoice as a PDF file from the currently loaded document.
  - A busy state is shown while the document loads, and an error state replaces the pane when it cannot be loaded.
  - The same preview and export behaviour is reused by the credit-note, debit-note and e-way bill views.
- Size: M
- Dependency: existing page extension
- Priority: P1

### G1b-06 â€” Previous/next document navigation in the print view
- Reference pages: `/invoices/sale-invoice-new`, `/invoices/credit-note`, `/invoices/debit-note`
- Description: the reference steps through neighbouring documents from the viewer; our invoice detail is a single-record dialog.
- Acceptance criteria:
  - The print view resolves the previous and next document of the same kind relative to the one on screen.
  - Navigating loads the neighbour in place with a busy state during the fetch.
  - The controls are hidden or disabled at the ends of the list rather than failing silently.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1b-07 â€” Customer summary panel on the invoice view
- Reference pages: `/invoices/sale-invoice-new`
- Description: the reference shows a customer panel beside the invoice; our customer record stores name, phone, email and address, so age and first-sale date are not yet available.
- Acceptance criteria:
  - The invoice view shows the customer name, mobile number, age, first-sale date and total customer net value.
  - The panel links to the customer record so it can be edited.
  - Customer age and first-sale date are stored or derived and are not blank for existing customers.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1b-08 â€” Customer quotation as a proforma document
- Reference pages: `/invoices/sale-invoice-new`
- Description: the reference treats a quotation as a source document whose number and validity date are shown inline on the invoice view; our invoice statuses have no proforma state and our inventory lists no customer-quotation screen.
- Acceptance criteria:
  - A customer quotation can be issued as its own document with a quotation number and validity date.
  - When an invoice originates from a quotation, the quotation number and validity date are shown inline on the invoice view.
  - Quotations are listed and counted separately from sales.
- Size: L
- Dependency: backend data model
- Priority: P2

### G1b-09 â€” Transaction list parity: pagination, row count and keyboard selection
- Reference pages: `/transactions/sales`, `/transactions/purchases`, `/transactions/sale-returns`, `/transactions/purchase-returns`
- Description: the reference drives all four transaction categories from one shared list widget with filtering, sorting, keyboard row selection, pagination and an always-on count; our four lists each miss part of that set.
- Acceptance criteria:
  - The invoice, purchase-bill, sale-return and purchase-return lists all paginate their rows.
  - Each list shows its total row count next to the category label.
  - Rows can be selected with the keyboard and the selection survives sorting and paging.
  - Purchase-bill, sale-return and purchase-return lists gain the sort controls they lack.
- Size: M
- Dependency: existing page extension
- Priority: P1

### G1b-10 â€” Unified transaction category switcher
- Reference pages: `/transactions/sales`, `/transactions/purchases`, `/transactions/sale-returns`, `/transactions/purchase-returns`
- Description: the reference switches between the four transaction categories inside one screen; ours splits them across separate dashboard routes.
- Acceptance criteria:
  - A category control switches between sales, purchases, sale returns and purchase returns and shows each category's row count.
  - Switching categories clears the previously selected document so no stale selection persists.
  - The active category survives a page reload through the route.
- Size: M
- Dependency: existing page extension
- Priority: P2

### G1b-11 â€” Patient follow-ups screen with list, filters and patient detail
- Reference pages: `/reminders/view-reminders`
- Description: the reference turns follow-ups into a two-panel clinical worklist; our refills screen is a flat reminder list without follow-up types, status or a patient panel.
- Acceptance criteria:
  - The screen splits into a reminders list and a patient-detail panel.
  - Rows show patient identity, follow-up type, follow-up date, medicine and brand/generic names, and a pending versus followed-up badge.
  - Filters cover follow-up type, date range including a minimum follow-up date, status, search text and sort order, with an applied-filters summary and a reset action.
  - Selecting a row loads that patient's details and follow-up history; changing a filter or sort re-queries the list from the first page.
- Size: L
- Dependency: backend data model
- Priority: P1

### G1b-12 â€” Follow-up classification, bulk selection, editing and remarks
- Reference pages: `/reminders/view-reminders`
- Description: the reference allows marking a follow-up helpful or not helpful, bulk-selecting rows, editing and deleting a follow-up, and posting a remark against it; we have status update and delete only.
- Acceptance criteria:
  - A follow-up can be marked helpful or not helpful, and the row restyles to show the classification.
  - Rows can be bulk-selected with a select-all control, and a per-row menu offers edit, delete and the two classifications.
  - Deleting a follow-up requires confirmation.
  - A remarks composer posts an update against the selected follow-up and the update is listed with it.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1b-13 â€” Patient analytics strip and sales-history panel
- Reference pages: `/reminders/view-reminders`
- Description: the reference gives each patient a metrics strip and a list of prior invoices; our parties report already computes RFM per customer but nothing is surfaced inside the follow-up worklist.
- Acceptance criteria:
  - The patient panel shows sales count, total sales, average order value, average revisit frequency, first-sale date and last-sale date.
  - A sales-history panel lists the patient's prior invoices with their amounts.
  - The figures agree with the same customer's entries in the Parties report for the same period.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1b-14 â€” Patient stock check and dropped-off flag
- Reference pages: `/reminders/view-reminders`
- Description: the reference offers a current-stock check for the patient's medicine and flags customers who have stopped buying; our batches live in inventory and our party view exposes RFM but no churn flag.
- Acceptance criteria:
  - The patient panel shows the current stock of the medicine in the follow-up, with an action that refreshes it.
  - The panel shows the last-bought and next-refill quantities with their dates and the remaining units.
  - Customers whose last purchase falls outside the active window are flagged as dropped off, derived from existing party data.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1b-15 â€” Invoice language switcher and tutorial modal
- Reference pages: `/invoices/sale-invoice-new`
- Description: the reference switches the invoice language between English and three regional languages and plays a tutorial video chosen by that language.
- Acceptance criteria:
  - The invoice view offers an invoice-language selector that re-renders the document in the chosen language.
  - A tutorial action opens a modal with a guidance video matching the selected language.
  - Language choices persist per user rather than resetting on every open.
- Size: M
- Dependency: existing page extension
- Priority: P3

## Slice G1b â€” deviations to document

- Server-rendered document HTML is not replicated â€” the reference previews come from backend templates, while we render invoice, credit-note and debit-note documents from our own client-side template.
- Base64 data-URL PDF delivery is not replicated â€” we export a real PDF file download instead of handing the browser an inline data URL.
- Provider-less WhatsApp web links are not replicated â€” our sends run through the configured messaging pipeline with delivery history and per-customer channel preferences.
- Regional-language invoice templates and the tutorial video player are not replicated in this slice â€” invoices stay in English and the guidance video is deferred.
- A separate template per printer and paper size is not replicated â€” we keep the A4 and thermal 80/58 formats already offered in Settings rather than adding dot-matrix A5/A6 layouts.
- The F2/F4 invoice hotkeys and arrow-key note navigation are not replicated â€” we rely on the existing CommandPalette and ShortcutsDialog.
- The websocket connectivity indicator on the invoice screen is not replicated â€” our local-first client refreshes state instead of holding a live socket channel open.
- The hosted online-store link inside the invoice WhatsApp share is not replicated â€” our public `/order` portal is the equivalent customer-facing surface.


---

# Slice G2 â€” parity matrix

Comparison of the LocalWell reference slice **G2** ("Purchase" + "Orderbook (procurement workspace)", 17 reference pages) against the MediBill GST app as inventoried in `docs/localwell-compare/our-screens.md`.

## Slice G2 â€” parity matrix

| Reference route | Our route | Status | Gap (concrete: name the capability, the field, or the workflow that differs) | Size |
|---|---|---|---|---|
| `/purchase/add-purchase` | `/dashboard/purchases` (New Purchase tab), `/dashboard/purchase-import`, `/dashboard/scan` | Partial | Manual purchase bill exists (supplier, lines with batch, payment method) but there is no challan merge/split mode, no free-qty / per-line discount / markup / overall bill discount, no per-line HSN+GST rate with GST-in vs outside-GST toggle, no margin/markup basis (MRP/PTR/purchase rate/net rate), no custom charge lines, no cheque + credit-period + available-credit payment block, no duplicate-bill guard, no per-purchase PDF/CSV export, no per-user purchase column settings | L |
| `/purchase/banner/b2connectbanner` | â€” | N/A | It is a presentational strip promoting the B2B Connect partner marketplace ("See Video" CTA); a local-first single-pharmacy app has no partner marketplace to promote, so the banner component is not replicated | â€” |
| `/purchase/import-csv` | `/dashboard/purchase-import` | Partial | CSV import with column mapping, per-row medicine/supplier match suggestions, session detail and commit-to-bill exists, but there is no fuzzy match score, no create-medicine inline, no verify-all-mappings gate before commit, no in-stock quantity per mapped row, no per-step import/cancel progress state, and the session carries no distributor / district / invoice-number / invoice-date / GST-flag draft context | M |
| `/purchase/return-expired-products` | `/dashboard/purchases` (Purchase Returns tab), `/dashboard/procurement` (Expiry tab), `/dashboard/inventory` (Expiry tab) | Partial | Purchase returns exist (return-against-bill modal) and expiry lists exist, but there is no expiry-driven return: no expiry-age filter in days with date presets, no expired / near-expiry / slow-moving / expired-with-purchase-history tabs, no "Proceed to Load" stock loader, no invoice-date column per stock row, no cash-settlement hint on the return | L |
| `/purchase/return-purchase` | `/dashboard/purchases` (Purchase Returns tab) | Partial | Only the return-against-bill mode exists: no stock-return-transfer mode (sync, transfer detail view, invoice export), no debit-note "Claim GST in Debit Note" choice, no supplier GSTIN / drug-licence fields, no product-age window or goods-returned-on date, no per-row scheme / free quantity, no refundable-amount / amount-refunded block against a payment account, no expired/near-expiry/slow-moving loaders, no "Show Invoice" link back to the source purchase bill | L |
| `/purchase/view-purchases` | `/dashboard/purchases` (Bills tab), `/dashboard/reports` (Purchase + Parties tabs), `/dashboard/suppliers`, `/dashboard/payments` | Partial | A purchase register, party ledgers and supplier CRUD exist but there is no single 4-tab ledger (purchases / returns / payments / distributors), no per-supplier credit period / balance due / opening balance / total returns, no supplier merge, no "verified from GSTIN records" marker, no per-supplier statement download | L |
| `/orderbook/dashboard` | `/dashboard` (KPI cards), `/dashboard/reports` (Ordering tab) | Partial | Shortage and ordering analytics exist, but there is no shortbook settings model (min stock, max stock, reorder point in days, demand-calculation period, seasonality, previous-year-demand toggle) and no cart / in-order / finalized / shortage card set, no pending-order list, no popular-brand panel, no stock-category or distributor-locality filter | L |
| `/orderbook/distributors` | `/dashboard/suppliers` | N/A | The page exists to bind a distributor into the LocalWell network â€” entering the customer code from that distributor's bill or sending them a mapping request â€” and a local-first app owns its supplier master locally, so there is no counterparty platform to map against | â€” |
| `/orderbook/distributors/[distributor_id]` | â€” | N/A | It is a distributor's network catalogue with add-to-cart plus an "invite this distributor to LocalWell" banner; we hold no supplier catalogue and no marketplace cart, so neither the catalogue nor the platform invite is replicated | â€” |
| `/orderbook/order-analysis` | none (nearest: `/dashboard/reports` Ordering tab) | Missing | No order-fulfilment analysis at all: no ordered / arrived / shortage / pending per product, no order count or last-order column, no company / category / location / stock-type filter set, no bulk add-to-order, no XLS export â€” and we hold no purchase-order record to analyse | L |
| `/orderbook/product-list` | â€” | N/A | The reference chunk is a dead placeholder route â€” route registration, a font module and a placeholder class, with no screen logic, data fetching or components â€” so there is no capability to replicate | â€” |
| `/orderbook/products-already-to-order` | â€” | N/A | It is conflict review plus checkout validation for a marketplace cart before a network purchase order is placed; our local flow records a purchase bill directly and has neither a cart nor an order status to conflict over | â€” |
| `/orderbook/purchase-orders` | â€” | N/A | A purchase-order register against platform distributors with order number, status, age, created-by and Excel export; we never place orders on a third-party distributor network, so no PO register is replicated | â€” |
| `/orderbook/purchase-orders/view-po-detail` | â€” | N/A | The PO lifecycle screen (timeline, document versions, mark-as-delivered, edit/cancel, send document, return products to cart) is bound to network PO status; our equivalent artefact is a locally recorded purchase bill, so this screen is not replicated | â€” |
| `/orderbook/shortbook` | `/dashboard/reports` (Ordering tab), `/dashboard/inventory` (Low Stock tab) | Partial | A shortage-sorted book exists but it is not configurable: no min stock / max stock / reorder point in days / demand period / seasonality / previous-year-demand settings, no editable per-row order quantity, no shortage value expressed in days, and no bulk order push | M |
| `/orderbook/view-cart` | none (nearest: `/dashboard/reports` Ordering tab, `/dashboard/procurement`) | Missing | No order cart exists: no saved order with order quantity vs required quantity, no per-product distributor assignment showing GSTIN / margin / balance / available credit, no ABC-XYZ ordering priority, no company / category / location / distributor filter drawer, no "remove products above max stock" option, no preferred vs last-ordered distributor conflict warning | L |
| `/orderbook/view-cart/[order_id]` | none (nearest: `/dashboard/purchases` bill detail) | Missing | No saved-order detail screen: no per-product remove / reset-order-quantity menu, no out-of-sync order-quantity warning, no above-max-stock flagging, no checkout validation step before the order is placed | M |

**Status counts:** Covered 0 Â· Partial 7 Â· Missing 3 Â· N/A 7 (17 reference pages).

## Slice G2 â€” our-side coverage notes

### Our routes that serve these reference pages

- `/dashboard/purchases` â€” serves `/purchase/add-purchase` (Bills tab + New Purchase entry), `/purchase/return-purchase` (Purchase Returns tab + return-against-bill modal) and part of `/purchase/view-purchases` (Bills tab with search, pagination and bill detail).
- `/dashboard/purchase-import` â€” serves `/purchase/import-csv` (CSV paste/upload, column-mapping editor, per-row match suggestions, commit â†’ purchase bill) and the CSV import entry point inside `/purchase/add-purchase`.
- `/dashboard/scan` â€” serves the bill-image ingestion part of `/purchase/add-purchase`: in-browser OCR of a supplier bill (supplier, bill no, GST rate, batch, expiry, MRP, qty, rate) that upserts medicines.
- `/dashboard/reports` â€” serves `/purchase/view-purchases` (Purchase tab: register, detail, summary, schedule, grouped by product/supplier/company; Parties tab: distributor list and per-party ledgers) and the shortage book behind `/orderbook/shortbook` and `/orderbook/dashboard` (Ordering tab: shortage % sorted book, purchase-order grouping by product).
- `/dashboard/procurement` â€” serves the supplier-facing half of `/purchase/view-purchases` and `/orderbook/view-cart`: supplier purchase history and spend metrics, expiry-risk items per supplier, rate history per medicine, RFQ quote requests.
- `/dashboard/suppliers` â€” serves the distributor-master list inside `/purchase/view-purchases` and the distributor list of `/orderbook/distributors` (name, contact, GSTIN only).
- `/dashboard/inventory` â€” serves `/purchase/return-expired-products` (Expiry tab, expiry status buckets) and the low-stock list feeding `/orderbook/shortbook`.
- `/dashboard/payments` â€” serves the payments tab of `/purchase/view-purchases` (payment register, create, cheque mode).
- `/dashboard` â€” serves the KPI/summary part of `/orderbook/dashboard` (KPI cards over a date range, profit summary, fast/slow stock movers).

### Our routes in this area with no reference counterpart in G2

- `/dashboard/purchase-import` â€” the import is a persistent session with detail view, re-download of the original file, delete session and preview figures on commit; the reference has no session-management screen of this kind.
- `/dashboard/procurement` â€” RFQ / supplier quote requests, rate-history charts and per-supplier expiry-risk lists have no counterpart page in the G2 reference set.
- `/dashboard/scan` â€” a standalone OCR screen that upserts medicines; in the reference, bill-image handling only exists inside `/purchase/add-purchase`.
- `/dashboard/stock-audit` â€” count sessions with approve/cancel; the reference has no stock-audit screen.
- `/dashboard/scheduled-reports` â€” scheduled report jobs with run history and CSV download; no reference counterpart (the reference exports are per-screen buttons).

### Reference features our routes already exceed

- `/dashboard/purchases` adds cross-supplier price comparison (`procurementApi.compare`), supplier prior-bill lookup, batch history for a returned item, and a rate-override permission gate (admin/pharmacist only) â€” none of which the reference `/purchase/add-purchase` provides.
- `/dashboard/reports` adds nine analytic tabs including profit, inventory valuation and a full GST suite (tax summary, GSTR-1, GSTR-2, GSTR-3B, HSN, ITC) plus party RFM/balance sorting â€” the reference slice exposes no comparable reporting layer for procurement.
- `/dashboard/procurement` adds RFQ quote requests to suppliers and per-medicine rate history; the reference orderbook has no quote/request concept.
- `/dashboard/inventory` adds movement history, batch edit, and stock adjustment with explicit reasons (Breakage / Found / Expired / Sample / Correction); the reference purchase screens expose no stock-adjustment reason vocabulary.
- `/dashboard/purchase-import` adds session-level review, original-file re-download and pre-commit preview figures; the reference `/purchase/import-csv` only maps, verifies and commits.
- `/dashboard/reports` (Ordering tab) already produces a shortage-sorted book with shortage percentage, which is the base the reference shortbook builds on top of.
- `/dashboard/dashboard` provides date-ranged KPI and profit summaries for procurement decisions; the reference orderbook dashboard covers only orderbook counts.

## Slice G2 â€” backlog

1. **G2-01 â€” Supplier master carries credit terms, dues and licence fields**
   Reference pages: `/purchase/view-purchases`, `/purchase/add-purchase`, `/purchase/return-purchase`
   Description: extend the supplier record beyond name/contact/GSTIN so purchase entry can show credit period, available credit and balance due, and returns can carry licence numbers.
   Acceptance criteria: supplier record gains `credit_period_days`, `credit_limit`, `opening_balance`, `drug_licence`, `gstin_verified_at`; `GET /api/suppliers` and `GET /api/suppliers/:id` return them; the supplier list shows balance due (opening balance + purchases âˆ’ returns âˆ’ payments); purchase entry shows available credit = credit limit âˆ’ outstanding balance; a supplier with no GSTIN is flagged in the UI.
   Size: M Â· Dependency: backend data model Â· Priority: P1

2. **G2-02 â€” Complete purchase-bill payment block**
   Reference pages: `/purchase/add-purchase`
   Description: the purchase entry records only a payment method; it needs the full payable/paid/credit block the reference exposes.
   Acceptance criteria: purchase bill stores `total_payable`, `amount_paid`, `payment_mode` (cash/card/UPI/cheque/credit), `cheque_no`, `cheque_date` and `credit_period_days_applied`; the form shows total payable vs amount paid and the remaining credit balance; the credit option is disabled with a reason when available credit (from G2-01) is insufficient.
   Size: M Â· Dependency: backend data model Â· Priority: P1

3. **G2-03 â€” Duplicate purchase-bill guard**
   Reference pages: `/purchase/add-purchase`
   Description: re-entering the same bill number for the same supplier must be detected before it double-counts stock and cost.
   Acceptance criteria: the server rejects a purchase bill whose `(supplier_id, invoice_number)` already exists on another non-cancelled bill; the purchase form shows a "This Bill is Duplicate" warning naming the existing bill and blocks save until the user resolves it; the guard is enforced server-side, not only in the UI.
   Size: S Â· Dependency: backend data model Â· Priority: P1

4. **G2-04 â€” Purchase line pricing fields: free quantity, discount, markup, bill discount**
   Reference pages: `/purchase/add-purchase`
   Description: purchase lines need free quantity, per-line discount and markup, and the bill needs an overall discount.
   Acceptance criteria: purchase item stores `free_qty`, `discount_pct`, `markup_pct`; the bill stores an overall `discount_amount`; the grid exposes free-qty, discount and markup columns; line amount and bill totals recompute from rate, discount and free quantity; a "More Settings" panel groups the bill-level discount/rounding/tax options.
   Size: M Â· Dependency: backend data model Â· Priority: P1

5. **G2-05 â€” Per-medicine HSN and GST rate on purchase lines, with a GST-in / outside-GST bill toggle**
   Reference pages: `/purchase/add-purchase`
   Description: purchase input needs HSN code and GST rate per medicine and a bill-level switch for bills outside GST.
   Acceptance criteria: medicine record carries `hsn_code` and `gst_rate`; the purchase medicine picker shows both; the purchase line stores the HSN and GST rate used plus computed tax; the bill header has a GST-in / outside-GST toggle that switches tax display on all lines; purchase tax values are readable by the existing GST/ITC report endpoints.
   Size: M Â· Dependency: backend data model Â· Priority: P1

6. **G2-06 â€” Shortbook reorder settings shared by the dashboard and the shortage book**
   Reference pages: `/orderbook/dashboard`, `/orderbook/shortbook`
   Description: the shortage book must be driven by configurable reorder parameters rather than a fixed rule.
   Acceptance criteria: a reorder-settings record (per product with global defaults) stores `min_stock`, `max_stock`, `reorder_point_days`, `demand_period_days`, `seasonality_enabled` and `use_previous_year_demand`; a settings dialog edits and persists them through a new endpoint and reloads them for verification; the shortage book reads the same settings; when `use_previous_year_demand` is on, demand for the current period is compared with the same period one year earlier; the shortage list reports the shortage as a number of days.
   Size: L Â· Dependency: backend data model Â· Priority: P1

7. **G2-07 â€” Reorder sheet with per-item supplier assignment**
   Reference pages: `/orderbook/view-cart`, `/orderbook/view-cart/[order_id]`
   Description: replace the marketplace cart with a local reorder sheet that holds shortage lines, order quantities and the supplier each line is bought from.
   Acceptance criteria: a saved order holds lines of `(product, required_qty, order_qty, supplier_id)`; a row menu offers remove and "reset order quantity to required quantity"; a supplier picker shows supplier name/address, GSTIN, margin, balance and available credit per candidate; a bulk "assign distributor" action applies one supplier to many lines; lines whose stock exceeds max stock are flagged and can be removed in bulk; the sheet shows filters by company, category, location and distributor plus a product search; "apply to purchase" creates a draft purchase bill pre-filled with the lines, quantities and suppliers.
   Size: L Â· Dependency: new page Â· Priority: P1

8. **G2-08 â€” Delivery-challan purchase flow (challan merge and split)**
   Reference pages: `/purchase/add-purchase`
   Description: purchase entry must support bills that arrive as delivery challans, and consolidate or split them into invoices.
   Acceptance criteria: the purchase header carries `document_type` (invoice | challan); a challan picker lists a supplier's open challans with their lines; "merge" consolidates selected challans into one bill; "split" creates a separate invoice from their products while the challans stay linked; challan lines carry their own batch, quantity and expiry and the resulting bill prints the source challan references.
   Size: L Â· Dependency: backend data model Â· Priority: P2

9. **G2-09 â€” Margin/markup reference basis per supplier and per item**
   Reference pages: `/purchase/add-purchase`
   Description: margin and markup must be computed against a chosen base price, not a single implicit rate.
   Acceptance criteria: supplier carries a default `margin_basis` of MRP, PTR, purchase rate or net purchase rate; the purchase line editor allows overriding the basis per item; the margin/markup preview recomputes from the selected basis; the chosen basis is stored on the line so later reports can reproduce it.
   Size: M Â· Dependency: backend data model Â· Priority: P2

10. **G2-10 â€” Custom charges on purchase bills**
    Reference pages: `/purchase/add-purchase`
    Description: freight and other charges must be entered as their own lines so they do not distort product pricing.
    Acceptance criteria: a charge-type list defines named charges (freight, delivery, handling); the purchase bill supports charge lines with amount and a taxable flag; charge lines add to the bill total and appear on the bill print/export; the charge types are editable in settings.
    Size: S Â· Dependency: backend data model Â· Priority: P2

11. **G2-11 â€” Expiry-driven purchase return**
    Reference pages: `/purchase/return-expired-products`
    Description: let the pharmacy send expired or slow-moving stock back to a supplier by expiry age, not only by referencing an existing bill.
    Acceptance criteria: the Purchases returns tab gains an "expiry return" mode; the distributor picker searches name or GSTIN and filters by district; tabs classify expired, near-expiry, slow-moving and expired-with-purchase-history stock; an expiry-age filter in days with presets (today, yesterday, last 7/30 days, this month) drives one stock query; loaded rows show batch, pack, stock, MRP, expiry date and invoice date; rows are editable/deletable before submit; the submit shows the cash-settlement amount for the return.
    Size: L Â· Dependency: existing page extension Â· Priority: P2

12. **G2-12 â€” Purchase return as a debit note with refund settlement**
    Reference pages: `/purchase/return-purchase`
    Description: the return must carry the tax, licence and settlement fields a debit note needs.
    Acceptance criteria: the return header stores invoice number, return date, goods-returned-on date, distributor reference, product-age window in days, `claim_gst_in_debit_note` flag, supplier GSTIN and drug licence; return lines store scheme quantity and free quantity; a payment block shows refundable amount and amount-refunded and records the refund against an existing payment account; the grid exposes purchase rate, effective purchase rate, MRP, net rate, tax, discount, amount, taxable amount, GST and balance; a per-row "show invoice" action opens the source purchase bill.
    Size: L Â· Dependency: backend data model Â· Priority: P2

13. **G2-13 â€” Stock return transfer to supplier**
    Reference pages: `/purchase/return-purchase`
    Description: support the second reference return mode â€” sending stock back without a refund â€” as a transfer record.
    Acceptance criteria: a return can be created as a stock transfer to a supplier instead of a debit note; the transfer stores its lines and can be synced to the server; a transfer can be reopened by id to view its detail and exported as an invoice file; confirming the transfer decrements stock and records the movement in inventory history.
    Size: M Â· Dependency: backend data model Â· Priority: P2

14. **G2-14 â€” Purchase import: match score, verification gate, inline medicine creation, stock context**
    Reference pages: `/purchase/import-csv`
    Description: the import screen needs confidence scoring and a hard verification step before a bill can be created.
    Acceptance criteria: the mapping endpoint returns candidate medicines with a match score; the row editor shows the score, allows picking a different existing medicine, and allows creating a medicine inline; a verify step lists unmapped/unverified rows and blocks commit until every row is mapped; each mapped row displays current in-stock quantity; importing and cancelling expose a per-step progress state; navigating away or cancelling mid-import warns that progress is lost.
    Size: M Â· Dependency: existing page extension Â· Priority: P2

15. **G2-15 â€” OCR-scanned supplier bill produces a draft purchase bill**
    Reference pages: `/purchase/add-purchase`
    Description: today a scanned bill only upserts medicines; it should also pre-fill a purchase bill with the detected invoice number and date.
    Acceptance criteria: after OCR the scan session creates a draft purchase bill with supplier, detected invoice number and invoice date, and lines carrying batch, expiry, MRP, quantity and rate; the operator reviews the extracted lines and commits the bill; committing creates exactly one purchase bill and does not double-create medicines that already exist.
    Size: M Â· Dependency: existing page extension Â· Priority: P2

16. **G2-16 â€” Unified purchase ledger screen**
    Reference pages: `/purchase/view-purchases`
    Description: purchases, returns, payments and distributors are currently split across four routes; the reference keeps them in one tabbed ledger.
    Acceptance criteria: one screen exposes tabs for purchases, returns, payments and distributors; the purchases tab lists transactions for a selected date; the distributors tab lists suppliers with contact, GSTIN, drug licence, credit period and balance due plus total purchase, total returns, purchase due, return due and opening balance; per-tab view state is remembered; shortcuts create a new purchase, a purchase return, and a payment against a supplier.
    Size: L Â· Dependency: existing page extension Â· Priority: P2

17. **G2-17 â€” Supplier merge with confirmation**
    Reference pages: `/purchase/view-purchases`
    Description: duplicate supplier records created by data entry must be mergeable.
    Acceptance criteria: an option menu on a supplier offers "merge" alongside edit and delete; merging takes a target supplier, moves all purchases, returns and payments of the source supplier to the target, keeps the source as an inactive record, and requires an explicit confirmation naming both suppliers; the server rejects a merge that would cross GSTIN or credit-limit records without a forced override.
    Size: M Â· Dependency: backend data model Â· Priority: P2

18. **G2-18 â€” Approve/reject for purchase-raised stock transfers**
    Reference pages: `/purchase/add-purchase`
    Description: stock transfers raised from a purchase need a review step before they move stock.
    Acceptance criteria: a purchase can raise a stock transfer; transfers appear in a pending list with their lines; an admin or pharmacist can approve (which applies the stock movement) or reject with a reason (which leaves stock unchanged); both actions are recorded with actor and timestamp.
    Size: M Â· Dependency: backend data model Â· Priority: P2

19. **G2-19 â€” Order-fulfilment analysis screen**
    Reference pages: `/orderbook/order-analysis`
    Description: an analysis of ordered vs arrived vs pending stock, with the shared stock filter set and spreadsheet export.
    Acceptance criteria: an analysis query returns, per product and for a chosen date range, ordered, arrived, shortage, pending, order count, min/max stock, location and last-order date; the screen offers filters for company, category, location, stock type and a free-text product search plus date-range presets and a calendar picker; selected rows can be pushed into the reorder sheet from G2-07; export produces an XLS file of the analysis.
    Size: L Â· Dependency: new page Â· Priority: P2

20. **G2-20 â€” Per-supplier statement download**
    Reference pages: `/purchase/view-purchases`
    Description: from the supplier ledger the user can download a statement.
    Acceptance criteria: a statement action on a supplier downloads a CSV/PDF for the selected date range containing opening balance, dated purchase/return/payment rows and closing balance; the file uses the same figures shown on screen.
    Size: S Â· Dependency: existing page extension Â· Priority: P3

21. **G2-21 â€” Export a finished purchase bill to PDF and CSV**
    Reference pages: `/purchase/add-purchase`
    Description: the completed purchase must be exportable on its own, not only through reports.
    Acceptance criteria: the purchase bill detail offers PDF and CSV export; the PDF reproduces the bill as printed (supplier, invoice number/date, lines with batch, expiry, qty, rate, discount, tax, totals); the CSV contains one row per line with the same values.
    Size: S Â· Dependency: existing page extension Â· Priority: P3

22. **G2-22 â€” Purchase-entry expiry buckets and per-user column settings**
    Reference pages: `/purchase/add-purchase`
    Description: the purchase grid needs expiry-aware filtering and user-specific column layout.
    Acceptance criteria: the purchase line grid can filter to expiry buckets of under 3, 6, 9 and 12 months and has a near-expiry toggle; column visibility and order are stored per user in settings and restored on the next visit; expired batches are visually flagged in the grid.
    Size: S Â· Dependency: existing page extension Â· Priority: P3

23. **G2-23 â€” Settlement of unpaid purchase returns**
    Reference pages: `/purchase/add-purchase`
    Description: purchase returns that are not yet settled must be visible and closable.
    Acceptance criteria: an endpoint lists unpaid purchase returns with supplier, amount and age in days; the purchase screen shows them and the amount outstanding; settling a return records a payment against the supplier and clears the outstanding amount.
    Size: S Â· Dependency: backend data model Â· Priority: P3

24. **G2-24 â€” Batch picker with prior sale history on purchase entry**
    Reference pages: `/purchase/add-purchase`
    Description: when a batch is chosen during purchase entry, the user needs the batch's selling history.
    Acceptance criteria: selecting a batch opens a drawer listing batch number, pack, expiry, MRP and that batch's prior sale quantities/dates; the data comes from existing batch movement data, with no new stock history source.
    Size: S Â· Dependency: existing page extension Â· Priority: P3

**Backlog counts:** 24 items â€” P1: 7 Â· P2: 12 Â· P3: 5.

## Slice G2 â€” deviations to document

- **Partner / distributor marketplace (including "powerhouse" supplier sections, marketplace-wide popular brands, and distributor catalogues with add-to-cart):** we source from our own supplier master and record purchase bills locally; there is no third-party marketplace for us to broker orders through, so no marketplace catalogue, cart or brand-ranking layer is replicated.
- **Distributor onboarding by customer code or mapping request (the `/orderbook/distributors` add-new-distributor flow, and the "invite this distributor to join" banner):** our suppliers are created and owned by the pharmacy itself; there is no counterparty platform to send a mapping request to, so distributor onboarding and invitation are deliberately not implemented.
- **Hosted promotional banner (`/purchase/banner/b2connectbanner`):** it is a partner cross-sell strip with a video CTA, which a local-first app has no reason to host; no in-app promotional banner surface is added.
- **Platform purchase-order lifecycle (PO register, PO detail timeline, order-status advance / mark-as-delivered, document versions Original/Recommended, PO-level Excel export and "return products to cart"):** our procurement record is a locally entered purchase bill; we deliberately do not implement a server-side order-placement and fulfilment service for third-party suppliers.
- **Messaging-gateway document delivery (sending purchase-order documents by email or WhatsApp, and the generic "send document" action):** our Communications page is for customer-facing messages and templates, not for third-party document fulfilment; platform-mediated document sending to suppliers is not replicated.
- **Subscription and premium-tier affordances (the reference's premium badge and premium-badged actions):** we run a single local store with no paid tiers, so premium indicators are deliberately omitted.
- **Reference placeholder and dead routes (`/orderbook/product-list`):** the reference route has no screen logic, so no corresponding route is created in our app.


---

## Slice G3a â€” parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/stocks/adjust-stocks` | `/dashboard/inventory` (Stock tab) | Partial | We adjust one batch at a time with a reason code; no spreadsheet template â†’ upload â†’ multi-row units-per-pack/packs/loose-unit edit, no chunked 50-row commit | M |
| `/stocks/bulk-update-settings` | `/dashboard/inventory`, `/dashboard/catalog` | Partial | No upload â†’ column-match â†’ validated/invalid preview â†’ invalid-row export flow for master fields; we only have per-medicine dialogs plus a catalog CSV add with preview/dedupe | L |
| `/stocks/stock-transfer/view-transfers` | â€” | N/A | Branch-to-branch transfer register with multi-branch filters has no meaning for our single-store local-first deployment | â€” |
| `/stocks/update-stock-info` | `/dashboard/inventory` | Partial | No per-product master settings (stock location, min/max and online discount, discount-lock, ignore-for-shortage, online-listing, loose-billing, preferred distributor), no bulk-edit modal, no droplist PDF, no create-barcodes shortcut | L |
| `/stocks/upload-stocks` | `/dashboard/purchase-import`, `/dashboard/catalog` | Partial | Our import maps rows to medicines/suppliers and commits a purchase bill; missing fuzzy match scores with alternatives, inline create-medicine during mapping, a batch-level qty/price/HSN/GST entry stage, and a direct-to-stock commit | L |
| `/stocks/view-stocks` | `/dashboard/inventory`, `/dashboard/reports` | Partial | No stock-on-hand summary (SKU count + value), no costed detail panel, no Rx/OTC badge, composition or product images, no possible-duplicates merge, no push-to-cart from a stock row | L |
| `/stocks/stock-picklist` | `/dashboard/orders`, `/dashboard/billing` | Partial | Our order queue has a pack step; missing a two-panel pending/picked workspace with batch barcode scan, adequacy colour coding, fulfilled/remaining arithmetic, picklist print and picklist-to-sale flow | L |
| `/stocks/print-barcode-labels` | `/dashboard/labels` | Partial | Our labels page picks a template and previews per medicine/batch; missing filterable product list with batch expansion, per-batch label-count stepper, scan-to-add/edit barcode, per-store label content toggles, A4/thermal geometry and barcode-vs-QR toggle | L |
| `/stocks/print-barcode-labels/stock-scan-qr` | `/dashboard/billing` (shared barcode camera scanner) | Partial | Camera capture exists as a shared component but nothing stock-facing uses it: no scan-to-add/edit barcode on a stock item, no typed 13-character auto-submit fallback, no dismiss/Escape modal | S |

## Slice G3a â€” our-side coverage notes

**Our routes that serve these reference pages**

- `/dashboard/inventory` â€” Stock tab with batch add/edit, adjust-with-reason, expiry buckets, low stock and movement history; medicine create/update/delete dialogs. Serves adjust-stocks, update-stock-info, view-stocks.
- `/dashboard/catalog` â€” catalogue browse, CSV bulk-add with preview and dedupe, per-row "add to store", product-intelligence alternatives. Serves bulk-update-settings, upload-stocks.
- `/dashboard/purchase-import` â€” CSV or OCR import, column mapping, per-row medicine/supplier matching, commit to a purchase bill. Serves upload-stocks.
- `/dashboard/labels` â€” template picker plus server-side label preview/print per medicine and batch. Serves print-barcode-labels.
- `/dashboard/orders` and `/dashboard/billing` â€” order queue with accept â†’ pack â†’ ready â†’ deliver, and batch availability with batch issue order at billing. Serve stock-picklist.
- `/dashboard/stock-audit` â€” count sessions, counts against batches by barcode lookup or batch pick, approve/cancel with reasons. Serves the counting intent behind stock-picklist.
- `/dashboard/reports` â€” Stock (current stock, fast/slow movers, opening-closing, adjustments), Inventory Valuation, GST (HSN, GSTR-1/3B) and Ordering (shortage %) tabs. Serve view-stocks and upload-stocks context.
- `/dashboard/scan` and `/dashboard/purchases` â€” OCR bill capture and purchase-bill entry. Serve upload-stocks (batch and invoice capture).
- `/dashboard/settings` â€” store profile, invoice format, expiry policy, price-override policy. Partly serves update-stock-info (the reference's droplist filename and settings scoping are store-level, like ours).

**Our routes with no reference counterpart in this slice**

- `/dashboard/invoices`, `/dashboard/returns`, `/dashboard/payments`, `/dashboard/cash-bank` â€” sales-side finance registers the reference expresses outside the Stocks area.
- `/dashboard/refills`, `/dashboard/communications`, `/dashboard/campaigns` â€” patient messaging, offers and refill automation.
- `/dashboard/customers`, `/dashboard/doctors`, `/dashboard/prescriptions`, `/dashboard/suppliers`, `/dashboard/procurement` â€” party and procurement master data.
- `/dashboard/accounting`, `/dashboard/compliance`, `/dashboard/scheduled-reports`, `/dashboard/devices`, `/dashboard/integrations`, `/dashboard/bulk-bills`, `/dashboard/migration` â€” back-office, platform and compliance screens.
- `/dashboard` (KPI), `/onboarding`, `/auth`, `/order` (public portal), `*` (404) â€” entry, setup and public surfaces.

**Where our route already exceeds the reference**

- `/dashboard/inventory` â€” movement history with pagination, a low-stock list and supplier enrichment on the stock table; the reference stock list has no movement or low-stock view.
- `/dashboard/purchase-import` â€” in-browser OCR of a supplier bill image alongside CSV, persisted import sessions with original re-download, and preview figures on commit; the reference spreadsheet flows are file-only with no OCR path.
- `/dashboard/stock-audit` â€” countable audit sessions with approve/cancel reasons and an admin/pharmacist approval gate; the reference expresses counting only as a picklist screen with no session lifecycle.
- `/dashboard/reports` â€” nine-tab analytics including GSTR-1/3B, HSN, ITC, party ledgers and RFM; the reference slice has no reporting suite.
- `/dashboard/billing` â€” camera barcode lookup, batch availability with issue-order selection, offer and loyalty evaluation, and a below-MRP margin warning; the reference "Order Now" is a plain cart push.
- `/dashboard/labels` â€” server-rendered template preview and print; the reference draws its label layout client-side.
- `/dashboard/settings` â€” per-store price-override policy roles and expiry policy config; the reference keeps discount control per product and offers no central policy.

## Slice G3a â€” backlog

### G3a-01 â€” Spreadsheet bulk quantity correction
- **Reference pages:** `/stocks/adjust-stocks`
- **Description:** Let a user correct on-hand packs and units for many existing batches at once from a filled spreadsheet instead of editing each batch in the inventory stock tab.
- **Acceptance criteria:** Inventory Stock tab offers "Adjust via spreadsheet" with a template download carrying product, company, batch, expiry, MRP and current on-hand figures; upload accepts `.xlsx` only, rejects other types with "File must be of type Excel" and refuses files above 10 MB; parsed rows show in an editable grid where only units-per-pack, packs and loose units are writable; rows can be deleted before commit; "Continue" persists in chunks of 50 with an "Updating N of M" counter; every changed row writes an inventory adjustment with the reason codes already used by `inventoryApi.adjust`; no new medicines are created by this flow.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P2

### G3a-02 â€” Spreadsheet bulk product-master editor
- **Reference pages:** `/stocks/bulk-update-settings`
- **Description:** A three-step wizard (upload template â†’ choose columns â†’ preview) for editing master fields on many products in one pass, with a workbook of the failing rows handed back.
- **Acceptance criteria:** The bulk-edit entry point downloads a spreadsheet skeleton and accepts a filled `.xlsx`, validated in the browser before parsing; the column-match table lists each sheet column with its header, first and last data row, affected row count and a "To Be Updated or Not?" switch, with identifier and product-name columns not editable; preview splits rows into a VALIDATED DATA and an INVALID DATA section with per-row changed values highlighted; server-side validation enforces mandatory product name, blank cells leaving existing values untouched, company/composition/form/category matching existing masters, barcode unique per product, a location length limit and a loose-billing flag accepting only Yes/No or TRUE/FALSE; "Download all invalid rows" exports the failing rows as a separate workbook and invalid rows are never written.
- **Size:** L
- **Dependency:** existing page extension
- **Priority:** P2

### G3a-03 â€” Per-product stock settings and flags
- **Reference pages:** `/stocks/update-stock-info`
- **Description:** Give each stocked product a settings record covering location, discount bands, listing flags and a preferred supplier, editable from the inventory screen.
- **Acceptance criteria:** The medicine/stock settings form exposes product category, product form, company, stock location, minimum sale discount, maximum sale discount, online discount, a lock-product-discount switch, an ignore-for-shortage switch, an online-store-listing switch, an enable-loose-billing switch and a preferred supplier drawn from our existing supplier master; the form flags "Max Sale Discount < Min Sale Discount" when the maximum sits below the minimum; saving sends only the fields actually changed together with the affected stock ids; values persist on the record and are returned by the stock read endpoints; the ignore-for-shortage flag feeds the `/dashboard/reports` Ordering (shortage) tab.
- **Size:** L
- **Dependency:** backend data model
- **Priority:** P2

### G3a-04 â€” Stock-on-hand summary and costed product detail panel
- **Reference pages:** `/stocks/view-stocks`
- **Description:** Add the reference's stock summary strip and a detail panel that exposes costing, prescription type and composition for the selected stock item.
- **Acceptance criteria:** The stock tab shows a "Stock on hand" summary with SKU count and total stock value; clicking a stock row opens a detail panel showing pack size, expiry as MM/YY in red once expired, stock location and MRP; purchase rate, net rate, sale rate and margin render for admin and pharmacist only, while a cashier sees pack, expiry, location and MRP alone, and the server withholds cost fields for unprivileged roles as well; the panel shows an OTC/Rx badge, composition text and product images where recorded.
- **Size:** L
- **Dependency:** existing page extension
- **Priority:** P2

### G3a-05 â€” Possible-duplicate detection and merge
- **Reference pages:** `/stocks/view-stocks`
- **Description:** Detect near-duplicate stock entries for a product and let an authorised user consolidate them from the stock screen.
- **Acceptance criteria:** The stock detail panel lists possible duplicates with a verified badge; entries are multi-selectable and clicking a card toggles selection without disturbing list scrolling; merging with no selection shows "Please select atleast one duplicate"; a successful merge reports "Stocks merged" and the merged rows disappear from the panel; merge is restricted to admin and pharmacist, enforced on the server.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3a-06 â€” Stock sheet import with fuzzy product matching and a batch-entry stage
- **Reference pages:** `/stocks/upload-stocks`
- **Description:** Import a supplier stock sheet in two stages â€” map every line to a product, then enter batch quantities, prices and expiry â€” committing straight to stock.
- **Acceptance criteria:** The import session accepts a stock sheet and opens a mapping stage listing line number, source product name, pack, suggested match with a match percentage, units per pack, company, verified badge and stock location; a line can be remapped from alternative suggestions, searched manually, or created as a new medicine inline; mapping pages 50 lines at a time with a "Loading X of Y page(s)" indicator and a "Save & Load Next" that persists confirmed mappings; the second stage captures batch, expiry as MM/YY, packs, units, MRP, rate, sale rate, HSN and GST percent, with expired rows flagged red and rows expiring within roughly six months flagged near-expiry; rows can be deleted before commit; "Add to Stock" writes batches one at a time with a "Saving N of M items" counter and names the failing row number on error; "Cancel Mapping" abandons the upload without touching stock.
- **Size:** L
- **Dependency:** existing page extension
- **Priority:** P2

### G3a-07 â€” Batch picklist workspace for order fulfilment
- **Reference pages:** `/stocks/stock-picklist`
- **Description:** A new `/dashboard/picklist` screen with two panels â€” stock still to be picked grouped by location, and what has been picked â€” driven by batch barcode scans and per-medicine fulfilled/remaining quantities.
- **Acceptance criteria:** The left panel groups pending stock by location with ADEQUATE, PARTIAL and BATCHES NOT IN PICKLIST colouring; the right panel lists picked rows with product, company, batch no, pack, packs and units, expiry as MM/YY and MRP, plus a remove action; a scan field accepts 10- and 13-digit batch barcodes after roughly 400 ms of debounce and rejects 11-12 digit and over-13-digit codes, and a valid scan adds that batch to the picked panel under its location; removing a picked row immediately recomputes that medicine's adequate/partial state; required quantity derives from available packs and picked quantities are consumed batch by batch into fulfilled and remaining quantities; a picklist can be started from a customer order, quotation, sale or stock transfer; the half-finished picklist survives navigation and reload.
- **Size:** L
- **Dependency:** new page
- **Priority:** P1

### G3a-08 â€” Picklist print preview and PDF download
- **Reference pages:** `/stocks/stock-picklist`
- **Description:** Render the picked list for the printer and for paper, without depending on a browser extension.
- **Acceptance criteria:** The preview renders a thermal 80 mm template and an A5 HTML sheet for the chosen order; printer type (laser/inkjet vs thermal), page size (A5 vs 80 mm) and orientation can be switched and re-render the preview; zoom in/out and fit-to-content work on the preview; a PDF download produces the same picklist as a file; printing uses the browser print dialog only; Ctrl+P prints, F4 downloads the PDF and Escape closes the preview; marking the picklist printed updates the source order.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P1

### G3a-09 â€” Barcode and QR label printing with batch counts, layout control and barcode editing
- **Reference pages:** `/stocks/print-barcode-labels`
- **Description:** Upgrade label printing from a template preview into a filterable stock list with per-batch label counts, configurable page geometry, thermal output and inline barcode editing.
- **Acceptance criteria:** The label screen lists stock products with filters for category, company, product form, initials, location and free text plus a Stock In / Stock Out direction, and each row expands to its batches; every batch carries a label-count stepper bounded by the packs actually in stock, rejecting negative counts and warning that only N labels are available; rows without a barcode offer "Scan to Add" and rows with one offer "Scan to Edit", and a scan can be persisted onto the stock item with a "Barcode Added" confirmation; label content toggles (product name, MRP, sale rate, expiry date, store name, batch no, location, distributor, invoice date) persist as per-store settings; A4 layout exposes labels per sheet, labels per row, label width and height in mm and left-right/top-bottom gaps in mm, while thermal mode fixes a 35 x 15 mm label and emits ZPL for Zebra printers; the preview toggles between CODE128C item and batch barcodes and a QR layout carrying store name, medicine name, MRP, location and barcode, with zoom in/out and Save-as-default / Reset.
- **Size:** L
- **Dependency:** existing page extension
- **Priority:** P2

### G3a-10 â€” Camera-based stock counting
- **Reference pages:** `/stocks/stock-picklist`, `/stocks/print-barcode-labels/stock-scan-qr`
- **Description:** Count stock with the device camera or a hardware scanner during a stock audit, instead of typing every code by hand.
- **Acceptance criteria:** The existing barcode camera scanner component is mounted in the stock-audit count entry and a captured code looks up the medicine and prefills the count row; typed input stays supported and auto-submits at 13 characters, with the field re-focused so scanner keystrokes always land in it; the capture modal offers Dismiss and closes on Escape, returning the value to the calling screen; the audit session, approve-with-reason and cancel-with-reason flow are unchanged when scanning is used; a count row can still be edited or replaced by the existing batch picker.
- **Size:** S
- **Dependency:** existing page extension
- **Priority:** P1

### G3a-11 â€” Stock droplist PDF and barcode creation from a purchase
- **Reference pages:** `/stocks/update-stock-info`
- **Description:** Provide the reference's two stock-level output shortcuts: a stock droplist document and barcode generation for a purchase.
- **Acceptance criteria:** A "Stock Droplist" action downloads a PDF listing stocked products with its own search box and a filename that identifies the store; a "Create Barcodes" action opens barcode generation for a chosen purchase and produces printable codes for its batches; both are reachable from the stock screen header.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P3

### G3a-12 â€” Stock list filter, sort and paging
- **Reference pages:** `/stocks/view-stocks`
- **Description:** Give the stock list the same narrowing controls the reference offers, rather than a search box alone.
- **Acceptance criteria:** The stock table exposes a combined search, filter and sort strip with a Reset action that clears search text, active filters and sort in one step; filters cover category, company, location, expiry state and stock direction; sorting is available on product name, expiry and stock quantity; the list pages 20 rows at a time with a "Load More" continuation.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P2

## Slice G3a â€” deviations to document

- Branch-to-branch transfer register, branch filters and branch-scoped stock â€” our deployment is a single store, so there is no second branch to transfer to.
- Retailer-vs-distributor dual business type, including the price-to-retailer column and the retailer-only sale-scheme quantities â€” one store, one pricing model.
- Announcement-service dialog with once-per-browser-profile memory â€” no remote announcement feed to poll in a local-first app.
- Hosted "Watch Tutorial" video embed in the stock header â€” guidance stays as in-page text rather than an embedded video panel.
- Browser-extension print-manager client for thermal output â€” we print through the browser dialog and server-rendered preview/PDF only.
- "Order Now" push into the reference's shared order cart â€” our equivalent is the public `/order` portal plus the staff order queue, not a cart handoff from a stock row.
- Reference stock settings loaded per purchase id rather than per stock id â€” our records are keyed per medicine/batch, so we do not inherit the purchase-scoped settings model.


---

## Slice G3b â€” parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/stock-audit/view-audit/[stock_audit_id]` | `/dashboard/stock-audit` | Partial | No result screen for a finished audit: missing audited/short/excess/adjusted SKU counts, short and excess adjustment values, net adjustment, per-batch physical-count and reason editing, batch-number search and audit deletion | M |
| `/stock-audit/view-batches/[stock_audit_id]` | `/dashboard/stock-audit` | Partial | Our count entry lacks barcode-scan mode, row search/filter/sort, per-row mismatch reason, expiry-range filtering, discard-audit and per-row delete; we approve with one audit-level reason instead of finishing a synced count step | L |
| `/stock-audit/view-products` | `/dashboard/stock-audit` | Partial | No "Select SKUs to Audit" step: we enter counts straight after creating a session, with no company/form/location/category/initials/in-stock filter grid and no multi-select of stock ids carried into the count | M |
| `/stock-audit` | `/dashboard/stock-audit` | Partial | Our hub creates a session with a note only; missing the audit-type chooser, expiry-range dialog, audit number/type/created/ended/progress/adjusted-value/adjusted-by columns, date-range presets, sort and the running elapsed-time status | M |
| `/dashboard/view-dashboard` | `/dashboard` | Partial | Our dashboard has KPI cards, profit, fast/slow movers and refills; missing stock-value tiles (MRP, sale and purchase incl GST), cash-in-hand per payment mode, new-vs-repeat customers with average order value, and the due-payments card with payment and reminder actions | M |
| `/customer-orders` | `/dashboard/orders`, `/order`, `/dashboard/customers` | N/A | Distributor-customer mapping, mapping-request inbox, distributor invites, ZennX account creation and MedCart promotion belong to a hosted marketplace network we do not run; our local equivalent is the staff order queue plus the public `/order` portal | â€” |
| `/customer-orders/business-kyc` | `/dashboard/settings` | Partial | Our store profile holds GSTIN, drug licence and storefront picture; missing business-entity choice (PAN/LLPIN/CIN), server-side GSTIN validation with address and composition-dealer back-fill, Form 20/21 numbers with licence images, GST certificate upload and the self-declaration gate | M |
| `/customer-orders/order-detail` | `/dashboard/orders`, `/dashboard/billing` | Partial | Our order detail lists lines and runs accept â†’ pack â†’ ready â†’ deliver; missing 6-digit customer delivery-code confirmation, AWB last-four capture, delivery/refused/pickup actions, editable billing and shipping addresses, bounced-order conversion and a status timeline | M |
| `/customer-orders/promote-medcart` | `/dashboard/campaigns` (nearest local analogue) | N/A | MedCart store links, referral QR stickers and app-install/order/revenue tiles promote a third-party marketplace we neither host nor integrate; our campaigns channel serves direct customer messaging instead | â€” |

## Slice G3b â€” our-side coverage notes

**Our routes that serve these reference pages**

- `/dashboard/stock-audit` â€” one session-based screen: create a session with a note, count against batches via barcode lookup or batch picker, submit or update a count row, then approve (which creates adjustments) or cancel with a reason; approval is gated to admin/pharmacist. Serves all four stock-audit reference pages at their narrowest.
- `/dashboard/inventory` â€” Stock, Expiry, Low Stock and History tabs with batch CRUD, adjust-with-reason and expiry buckets; supplies the stock and expiry figures the audit is compared against, and is the closest thing we have to the reference's filterable candidate grid.
- `/dashboard` (index) â€” KPI cards over a shared date range plus profit summary, fast/slow stock movers on a tab strip and an upcoming-refills widget. Serves the reference dashboard.
- `/dashboard/reports` â€” Sales, Stock, Purchase, Payments & Expenses, Profitability, Inventory Valuation, GST, Parties and Ordering tabs; it is where our dashboard cards can drill down (fast/slow movers, profit, pending parties).
- `/dashboard/payments` and `/dashboard/cash-bank` â€” payment register with cash/card/UPI/bank/cheque modes plus cash and bank books with statement import and reconciliation; these are our counterparts to the reference dashboard's cash-in-hand and due-payment cards.
- `/dashboard/refills` â€” refill reminder list, create, status update, delete, single send and send-all-due; the counterpart to the reference dashboard's refill reminders card.
- `/dashboard/orders` â€” staff queue for our own online customer orders: list with status tabs, order detail with line items, accept â†’ pack â†’ ready â†’ deliver, reject/cancel with reason; deliver ties an invoice id.
- `/order` â€” public customer self-ordering page keyed by `storeId`, with medicine search, prescription upload, cart and unauthenticated status lookup; our counterpart to the reference's customer-side ordering entry point.
- `/dashboard/customers` â€” customer list, create/edit/delete, engagement insights, loyalty balance and a quick refill-reminder action; the closest local surface to the reference's customer record.
- `/dashboard/billing` â€” POS where an accepted customer order can be pulled in and billed; our counterpart to the reference's order-to-sale-bill path.
- `/dashboard/settings` and `/onboarding` â€” store profile (name, GSTIN, drug licence, phone, address, storefront picture, Ayushman HFR id) and post-signup store setup; the only local surfaces for business KYC data.
- `/dashboard/campaigns` â€” campaigns and offers over WhatsApp/SMS/email; the nearest local analogue to the reference's MedCart promotion page, without any marketplace install or revenue reporting.

**Our routes with no reference counterpart in this slice**

- `/dashboard/invoices`, `/dashboard/returns`, `/dashboard/billing`, `/dashboard/purchases`, `/dashboard/procurement`, `/dashboard/purchase-import`, `/dashboard/cash-bank`, `/dashboard/accounting`, `/dashboard/compliance` â€” sales, purchase, finance and compliance registers the three reference areas do not cover.
- `/dashboard/scan`, `/dashboard/labels`, `/dashboard/catalog` â€” OCR bill capture, label printing and the medicine catalogue.
- `/dashboard/doctors`, `/dashboard/prescriptions`, `/dashboard/suppliers` â€” party and prescription masters.
- `/dashboard/communications`, `/dashboard/scheduled-reports`, `/dashboard/devices`, `/dashboard/integrations`, `/dashboard/migration`, `/dashboard/bulk-bills` â€” messaging, scheduled jobs, device registry, provider registry, migration wizard and bulk bill editing.
- `/`, `/auth`, `/onboarding`, `*` â€” landing, sign-in, setup wizard and the 404 catch-all.
- Note: `/dashboard/payments`, `/dashboard/refills` and `/dashboard/reports` are counterparts for the reference dashboard's due-payment, refill and stock-mover cards rather than separate pages in this slice.

**Where our route already exceeds the reference**

- `/dashboard/reports` â€” nine-tab analytics with CSV export, party ledgers and RFM, GST suite (GSTR-1/2/3B, HSN, ITC), inventory valuation and a shortbook ordering tab; the reference dashboard offers summary cards only.
- `/dashboard/compliance` â€” e-Invoice generation with preflight validation, e-way bill creation and a submissions list; nothing in this slice covers statutory filing.
- `/dashboard/cash-bank` â€” bank-statement CSV import with suggested matches and one-click match/unmatch plus reconciliation status; the reference dashboard only charts cash in hand.
- `/dashboard/accounting` â€” double-entry trial balance, P&L, balance sheet, day book, journals, opening-balance wizard and period close/reopen; no counterpart in the reference slice.
- `/dashboard/purchase-import` and `/dashboard/scan` â€” CSV or in-browser OCR import of supplier bills with column mapping, medicine matching, session history and commit to a purchase bill.
- `/dashboard/devices` â€” device registry with admin revoke/restore, session kill switch, activity feed and offline sync journal.
- `/dashboard/scheduled-reports` â€” scheduled report jobs with daily/weekly/monthly cadence, run history, CSV download and email/SMS delivery.
- `/dashboard/stock-audit` â€” countable sessions that persist a count per batch, resolve into stock adjustments on approval with a reason, cancel with a reason, and keep approval behind an admin/pharmacist gate; the reference expresses audit outcome only as summary values.
- Reference drug-code and PMBJAY columns appear only for PMBJAY-enabled businesses; our settings store an Ayushman HFR id, but our medicine and audit records carry no drug-code field, so that column pair has no local counterpart either way.

## Slice G3b â€” backlog

### G3b-01 â€” Finished-audit result summary
- **Reference pages:** `/stock-audit/view-audit/[stock_audit_id]`
- **Description:** Give a finished audit its own result screen with a signed summary strip, instead of leaving the outcome in a list row.
- **Acceptance criteria:** Opening a finished audit shows audit number, audit date as day/month/year, audited SKU count, short SKU count with its adjustment value in red, excess SKU count with its adjustment value in green, adjusted SKU count and the net adjustment, every value signed from the saved counts; the batch table below lists batch number, physical packs and units and the mismatch reason for every row; a local search narrows rows by batch number; a delete action behind a confirmation dialog removes the audit and returns to the list.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P1

### G3b-02 â€” Editable physical count and per-batch mismatch reason
- **Reference pages:** `/stock-audit/view-batches/[stock_audit_id]`, `/stock-audit/view-audit/[stock_audit_id]`
- **Description:** Let a counter attach a reason to each mismatching batch and let a reviewer correct the physical count in place, instead of recording one reason for the whole audit.
- **Acceptance criteria:** The count row opens a reason picker listing reasons served by the backend and stores the chosen reason against that batch's count; software pack size, stock packs and stock units stay read-only while physical packs and physical units are editable in the result table; saving a row recomputes that batch's short or excess and the audit's net adjustment; approval writes the stock adjustment using the row reason; a batch whose physical count equals the software count needs no reason.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P1

### G3b-03 â€” Barcode-scan counting with scan feedback
- **Reference pages:** `/stock-audit/view-batches/[stock_audit_id]`
- **Description:** Count batches by scanning their barcodes with the camera instead of picking every batch by hand, extending the camera mount planned in G3a-10.
- **Acceptance criteria:** The count screen keeps a barcode field focused so a hardware scanner or the camera component can fill it; a scanned code that matches a stock batch increments that batch's physical count and the field re-focuses for the next scan; a code that matches nothing reports a product-not-found message and a malformed code reports an invalid-barcode message, neither changing any count; typed entry stays supported; the count is persisted per batch so a reload keeps it.
- **Size:** S
- **Dependency:** existing page extension
- **Priority:** P1

### G3b-04 â€” Counting-row search, sort and save state
- **Reference pages:** `/stock-audit/view-batches/[stock_audit_id]`
- **Description:** Make a long count grid navigable and show that each count has reached the server.
- **Acceptance criteria:** Rows can be searched by product, location or batch number and sorted by the options the audit filter service returns; the header shows a saving-in-progress then saved state as counts are submitted; each count edit is sent immediately with no separate save step; the search and sort cover counted rows as well as uncounted ones.
- **Size:** S
- **Dependency:** existing page extension
- **Priority:** P2

### G3b-05 â€” Audit types and expiry-range audit
- **Reference pages:** `/stock-audit`, `/stock-audit/view-batches/[stock_audit_id]`
- **Description:** Let the user choose what kind of audit to run and, for an expiry audit, bound it by an expiry date range.
- **Acceptance criteria:** The audit hub opens a type chooser listing the audit types the backend returns and stores the chosen type; choosing the expiry type opens a date-range dialog whose range is sent with the audit-creation request and stored on the audit record; the expiry range narrows the candidate products and the counting rows; the audit list shows the type of each audit.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3b-06 â€” Select-SKUs step with filters
- **Reference pages:** `/stock-audit/view-products`
- **Description:** Add a first step that filters candidate stock and multi-selects the SKUs to audit before any counting starts.
- **Acceptance criteria:** A candidate grid lists category, company, form, initials, location, expiry as month/year, MRP, rate, pack, product name and a product search; filters cover company, product form, stock location, product category, initials and an in-stock toggle; selected rows are stored with the audit as stock ids and survive a reload; continuing to counting stays disabled until at least one product is selected.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3b-07 â€” Audit list columns, date presets and sort
- **Reference pages:** `/stock-audit`
- **Description:** Give the audit hub the reference's progress columns and filter strip.
- **Acceptance criteria:** Each row shows audit number, status, audit type, created and ended timestamps, audited versus to-be-audited SKU counts that switch to adjusted versus audited once the audit is finished, a signed adjusted value and the adjusting user; the filter strip offers a search by audit number, a date range with Today, Yesterday, Last 7 Days, Last 30 Days, This Month and Last Month presets, plus filter and sort pickers; a running audit shows an elapsed-time indicator.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3b-08 â€” Dashboard stock-value and cash-in-hand cards
- **Reference pages:** `/dashboard/view-dashboard`
- **Description:** Add the two summary cards our dashboard is missing: what the stock is worth and how much cash the shop is holding.
- **Acceptance criteria:** A Stock Value card shows MRP-incl-GST, sale-rate-incl-GST and purchase-rate-incl-GST totals for the selected range; a Net Payment Collection card splits cash in hand by payment mode, charts payment in against payment out and shows the net with a prior-period delta; both cards reload when the shared range changes and show an empty state when there is nothing to report.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P2

### G3b-09 â€” Dashboard customers card
- **Reference pages:** `/dashboard/view-dashboard`
- **Description:** Show who is buying â€” new versus repeat customers and the average order value â€” on the dashboard.
- **Acceptance criteria:** A Customers card shows a new-versus-repeat split, total customers and average order value for the selected range, with a link into the customer list; the card shows an empty state when the range holds no sales.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P2

### G3b-10 â€” Dashboard due-payments card with reminder actions
- **Reference pages:** `/dashboard/view-dashboard`
- **Description:** Surface outstanding balances on the dashboard and let staff chase or settle them from the card.
- **Acceptance criteria:** A Due Payments card toggles between customer and supplier balances (our counterpart to the reference's distributor filter), shows the total due and a list of parties with balances; clicking a party opens the payment form pre-filled with that party and the amount due; a reminder action sends a settlement message through the existing messaging channel.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P2

### G3b-11 â€” Delivery confirmation code and AWB capture
- **Reference pages:** `/customer-orders/order-detail`
- **Description:** Require proof of delivery from the customer before an order is closed.
- **Acceptance criteria:** Delivering an order sends a 6-digit code to the customer's mobile and keeps the order undelivered until the code is entered; the entered code must be exactly six digits; the last four digits of the AWB are recorded with the delivery and shown on the order; a wrong customer number offers a resend of the code.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3b-12 â€” Order detail addresses, bounced handling and status timeline
- **Reference pages:** `/customer-orders/order-detail`
- **Description:** Enrich our order detail with editable addresses, a choice of what to do with a bounced order and a visible status history.
- **Acceptance criteria:** The order detail shows a timeline of accepted, packed, ready and delivered stages with their timestamps; billing and shipping addresses are editable on orders that are not partner orders; a bounced order can be deleted or converted into a new order after a confirmation that names the outcome.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P3

### G3b-13 â€” Business KYC profile with licence and certificate uploads
- **Reference pages:** `/customer-orders/business-kyc`
- **Description:** Turn the settings store profile into a KYC form collecting the evidence a business needs to transact digitally.
- **Acceptance criteria:** A business-entity selector switches the identifier between PAN, LLPIN and CIN and clears the inapplicable fields; a GSTIN change triggers server validation that back-fills the registered address and the composition-dealer flag, and an invalid value reports "INVALID GSTIN" and blocks saving; Form 20 and Form 21 numbers each accept an image upload with preview and re-upload, as do the storefront image and the GST certificate; a self-declaration switch must be ticked before the profile saves.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3b-14 â€” In-app stock-audit guidance
- **Reference pages:** `/stock-audit`
- **Description:** Offer guidance for running an audit without depending on a hosted tutorial video.
- **Acceptance criteria:** The audit hub exposes a "How audit works?" entry that opens in-page guidance covering type choice, counting, reasons and approval; the guidance is served from the app so it is available with no network.
- **Size:** S
- **Dependency:** none
- **Priority:** P3

## Slice G3b â€” deviations to document

- B2B marketplace ordering â€” distributor-customer mapping, the mapping-request inbox, distributor invites and ZennX account creation assume a hosted network of other pharmacies to trade with; our customer orders run against our own storefront through `/order` and the staff queue.
- MedCart promotion â€” referral store links, generated QR stickers and app-install, app-order and revenue tiles promote a third-party marketplace we neither host nor integrate; our campaigns channel is used for direct customer messaging instead.
- Distributor-side workflows â€” the Orderbook cart handoff, distributor integration call and the retailer-versus-distributor business-type branches describe the counterparty side of a B2B exchange, not a single-store pharmacy workflow.
- Hosted banners and partner surfaces â€” the MedCart banner, the "What is Medcart?" outbound link and the partner-integrations landing page belong to a hosted marketing shell; our `/dashboard/integrations` is a provider registry with no campaign banners.
- Business KYC as a separate step that redirects into partner integrations â€” our GSTIN, drug-licence and storefront evidence stays inside the settings store profile, with no redirect to a partner area that does not exist for us.
- PMBJAY-only drug-code column and search â€” we keep no drug-code field per medicine, so the reference's PMBJAY-gated drug code is left out of the audit screens entirely rather than partially implemented.
- Hosted "How Audit Works?" tutorial video on the audit hub â€” guidance stays as in-app help so it is available with no network.


---

## Slice G4a â€” parity matrix

| Reference route | Our route | Status | Gap (concrete: name the capability, the field, or the workflow that differs) | Size |
|---|---|---|---|---|
| `/reports/business-reports` | `/dashboard/reports` | Partial | No server-driven report catalogue: we hard-code a 9-tab page instead of a report table (report_id, report_name, report_name_footer, report_desc, category chip) with category tabs, a persisted star/favourite toggle, remembered active tab, per-business column visibility and a tutorial panel. | M |
| `/reports/business-report-view/[report_id]` | `/dashboard/reports` | Partial | No generic per-report run page: we lack the filter builder (single/multi-select, boolean, dropdown, radio, input, clearable + remote branch/customer/medicine lookups capped at 25), the "Filter Report Columns" chooser, view-by (business/branch/customer), date-range cap per report, and Excel/PDF/HTML/email export + print preview (we only export CSV on the sales tab). | L |
| `/cash-and-bank` | `/dashboard/cash-bank` | Partial | We show Cash Book / Bank Book ledgers, not a payment-account registry: no account master rows (display name, branch, holder, IFSC, account balance, last transaction date, bank brand image, UPI), no cash-in-hand total, no "Search Accounts" by acc no/holder/IFSC, no server-defined SORT BY / FILTER BY panels with Reset Filter. | M |
| `/cash-and-bank/account-statement` | `/dashboard/cash-bank` (nearest: reconciliation rows only) | Missing | No per-account statement: no TXN UTR/date, txn type/user, narration, coloured in/out amount chip, opening/closing balance rows, add-or-reduce balance adjustment (type, amount, date, remark/UTR, oldâ†’new balance preview), transaction edit/delete, account delete, or PDF/CSV statement export. | L |
| `/cash-and-bank/cheque-management` | `/dashboard/payments` (cheque mode only) | Missing | No cheque lifecycle: we only accept `cheque` as a payment mode on the payment register; there is no open/cleared tab split, cheque_no/MICR/amount/date/party capture, pay-in/pay-out count and amount stats, deposit-to-bank / withdraw / settle-bearer-to-cash actions with UTR+invoice no, revert-to-open, or cheque search by no/MICR/amount. | L |
| `/expenses/add-expense/[expense_id]` | `/dashboard/expenses` (in progress) | In progress | Dedicated Expenses module (schema + router + add/edit/view screen) in flight â€” must carry: NATURE plain vs GST toggle forcing invoice number, backend-loaded expense category, searchable party with create-new (GSTIN, address, district, state, mobile, email, composition flag), HSN-coded item rows with per-row tax/taxable/amount, CGST+SGST vs IGST by party state, round-off, shared payment dialog (account, UTR, cheque) and save gating (item + party + category present, GST mode invoice number, valid HSN per row). | L |
| `/expenses/view-expenses` | `/dashboard/expenses` (in progress) | In progress | Same in-flight module â€” list half must carry: search on expense_no or party name, ADDED BETWEEN presets (Today, Yesterday, Last 7/30 Days, This Month, Last Month) defaulting to last 7 days, GST-expenses-only toggle, paginated selectable table, and an Add New Expense action that opens the add screen. | M |
| `/control-center/business-profile` | `/dashboard/settings` (store profile card) | Partial | Our store profile lacks PAN, CIN/LLPIN, owner name, owner PAN, trade name from GST records, Form-20 and Form-21 numbers with expiry dates and one image each, FSSAI licence number + expiry, entity type and taxation type (registered vs non-registered); address detail is one block rather than 3 lines + district + pincode with map pin/place autocomplete/Get My Location; GSTIN validation and the per-weekday two-shift timings with an Open 24x7 lock are ambiguous in our-screens.md. | L |
| `/control-center/bulk-edit-bills` | `/dashboard/bulk-bills` | Partial | We have filter â†’ preview diff â†’ commit; missing bulk delete (password re-entry confirmation) and bulk recovery (is_bulk_recovery reuse of the delete payload), bill CSV import (base64 upload), bill-level special discount %, job progress polling on job_id, downloadable bulk action report, and the reference filter set (bill sequence range, bill value range, bill profit range, bill status, customer type, customer/doctor/operator). | L |
| `/control-center/migration` | `/dashboard/migration` | Partial | We migrate via a generic session wizard (create â†’ preview â†’ commit â†’ rollback); missing a source-software catalogue with template downloads, data-scope selection (customers, sales history, stock + batches, backup collection time, expiry cut-off), branch mapping (copy item mapping from a branch, copy MRP as sale rate), Excel upload with per-file validation/state/removal, unmapped-stock mapping rows, and downloadable per-request success/failure/excluded/mapping reports. | L |
| `/control-center/integrations` | `/dashboard/integrations` | Partial | We list provider rows and connect/disconnect with config + secrets; missing master partner-type grouping, per-row status label/colour and last-updated date, and a per-partner onboarding route beyond our config detail dialog. | S |
| `/control-centre/layout` (control-centre shell) | `/dashboard/*` shared shell | Covered | Reference page is a pass-through layout wrapper with no behaviour of its own; our shared DashboardLayout already nests every dashboard page, so nothing to build. | â€” |
| `/control-center/picklist-settings` | none | Missing | No customer-order picklist settings: no template-driven key/value binding rows (is_required, is_drop_down, is_clearable), no drawer editor with dropdown + space-to-search, no save that syncs the whole settings set with a sync confirmation, and no order-intake setting that our `/dashboard/orders` queue could honour. | S |
| `/control-center/plans-pricing` | none | N/A | Subscription state, SMS/e-invoice credit balances, billing history and upgrade checkout all require a cloud billing backend and payment gateway; a local-first single-pharmacy app has no plan to sell or credits to meter. | â€” |
| `/control-center/prefix-sequences` | `/dashboard/settings` (invoice format) + `/dashboard/billing` (next-number prefetch) | Partial | We store one invoice prefix/pattern + print format and prefetch the next number, but have no editor mapping transaction type â†’ prefix + running sequence (seq_value, multi-row select, inline single-cell edit), no financial-year closing/reset flags per row, and no shared prefix-sequence source for expense_no. | M |
| `/control-center/refer-earn` | none | N/A | A referral wallet that pays cash rewards, tracks referred pharmacies' subscription state and offers social share needs a multi-tenant cloud programme; a single-pharmacy local install has no referrer network to reward. | â€” |
| `/control-center/sale-settings` | none | Missing | No sale-time settings store: no template-driven setting rows (binding_key/value, is_required, is_drop_down, default_doctor, visible-for-retailer/distributor flags), none of the sale rules ("Autofill Scheme wrt Sale Qty", "Doctor must for X Drugs", sale scheme format), no drawer editor with type-ahead, and no save that syncs the set with a sync confirmation. | M |

## Slice G4a â€” our-side coverage notes

**Our routes that serve this slice**

- `/dashboard/reports` â†’ `/reports/business-reports` and `/reports/business-report-view` (fixed 9-tab analytics page; 25+ `/api/reports/*` routes, global from/to range, CSV export).
- `/dashboard/cash-bank` â†’ `/cash-and-bank` only in spirit (Cash Book / Bank Book + reconciliation); it has no payment-account registry, so the reference landing and its statement page are unhosted.
- `/dashboard/payments` â†’ the only place cheque appears on our side, as a payment *mode* on the register; no cheque document or lifecycle.
- `/dashboard/settings` â†’ `/control-center/business-profile` (store profile card: name, GSTIN, drug license, phone/email, address, location, timings, storefront picture, ayushman HFR id) and `/control-center/prefix-sequences` (invoice format prefix/pattern + A4/thermal 80/58 + detailed/compact columns only).
- `/dashboard/bulk-bills` â†’ `/control-center/bulk-edit-bills` (filter, preview diff, commit; admin/pharmacist only).
- `/dashboard/migration` â†’ `/control-center/migration` (session wizard over customers/suppliers/medicines/opening stock, preview, commit, rollback, recent list).
- `/dashboard/integrations` â†’ `/control-center/integrations` (provider registry, config detail, connect/disconnect).
- `/dashboard/invoices` + `/dashboard/billing` â†’ the numbering half of `/control-center/prefix-sequences` (invoice create with next-number prefetch, invoice print template).
- `/dashboard/accounting` â†’ closest host for the reference's cash/bank money movement (chart of accounts, journal entry form, day book, opening balances, period close/reopen); the reference expresses this as per-account statements instead.

**Our routes in this area with no reference counterpart in the slice**

- `/dashboard/accounting` (trial balance, P&L, balance sheet, day book, journals, opening wizard, period lock).
- `/dashboard/scheduled-reports` (recurring jobs, run history, CSV download, email/SMS delivery).
- `/dashboard/compliance` (e-Invoice preflight/generate/cancel, e-way bill, submissions) â€” no reference page in this slice covers it.
- `/dashboard/invoices` (invoice register, detail/print, record payment, cancel, per-row e-invoice status, WhatsApp/SMS/email share).
- `/dashboard/orders` (staff queue acceptâ†’packâ†’readyâ†’deliver); the reference's picklist settings are configuration for order intake, not an equivalent screen.
- `/dashboard/settings` blocks with no counterpart here: expiry policy, price-override role policy, backup scheduler, cloud backup (Drive/R2/S3), online-orders toggle, refill automation mode.
- `/dashboard/payments` as a *payment register* (received/paid/expense types) â€” the reference records money movement inside a bank-account statement, not a standalone register.

**Reference features our routes already exceed** (supported by our-screens.md)

- `/dashboard/cash-bank` adds bank-statement CSV import, suggested per-row matches and one-click match/unmatch on top of the reconciliation status summary; the reference cash-and-bank landing only lists accounts and fetches a summary.
- `/dashboard/scheduled-reports` adds recurring daily/weekly/monthly report jobs with enable/disable, run-now, run history, generated-CSV download and email/SMS delivery; the reference report view offers only one-off export formats.
- `/dashboard/accounting` adds double-entry journals, trial balance, P&L, balance sheet, an opening-balance wizard and period close/reopen; the reference account statement only performs single-sided add/reduce balance edits.
- `/dashboard/reports` includes a GST suite (tax summary, GSTR-1, GSTR-2, GSTR-3B, HSN, ITC), party RFM sorting and a shortbook/ordering view, plus global from/to range and export across tabs; the reference catalogue's report set is server-defined and not enumerated in the slice, so no per-report parity or exceedance claim is possible there.
- `/dashboard/invoices` adds per-row e-invoice status, invoice cancellation and WhatsApp/SMS/email invoice sharing; the reference's email capability in this slice is report-export-only.
- `/dashboard/payments` records cash/card/UPI/bank-transfer/cheque as typed payment entries with a payment type (received/paid/expense) filter; the reference keeps money movement inside a bank-account statement.

## Slice G4a â€” backlog

1. **G4a-01 â€” Payment accounts master and per-account statement**
   - Reference pages: `/cash-and-bank`, `/cash-and-bank/account-statement`
   - Description: Introduce a payment-account master and a statement screen so cash/bank balances, adjustments and statement export are first-class instead of reconciliation rows only.
   - Acceptance criteria: table `payment_accounts` (display name, payment_account_type_id, bank branch name, IFSC, account number, holder name, UPI address, merchant id/key, terminal id, balance, last transaction date); accounts list with search across account no / holder name / IFSC, server-defined SORT BY and FILTER BY with Reset Filter, cash-in-hand total on the summary response, result count in the footer; statement grid with TXN UTR/date, txn type/user, narration, coloured in/out amount chip, opening and closing balance rows, transaction search by UTR or amount, date-range control and paginated scroll loading with skeleton; "Add or Reduce Balance" modal (ADD MONEY / REDUCE MONEY, adjustment type, amount, date, remark or UTR) validating "Please Enter Adjustment Amount", "Please Enter Adjustment Name", "Please Select Adjustment Date" and previewing old vs new balance; transaction edit and delete behind "You want to Delete this Transaction!", account delete behind "Are you sure you want to delete this account?"; statement export as PDF and CSV with "Downloading statement..." progress and "Failed to download statement" on error.
   - Size: L Â· Dependency: new route Â· Priority: P1

2. **G4a-02 â€” Invoice-number prefix and sequence sequences**
   - Reference pages: `/control-center/prefix-sequences` (also drives `expense_no`)
   - Description: Replace the single invoice prefix/pattern setting with a per-transaction-type prefix + running-sequence editor shared by invoice and expense numbering.
   - Acceptance criteria: table keyed by prefix_key with prefix_value and seq_value; editor listing transaction type, prefix and current sequence value with the hint "Prefix & Sequence together will form Invoice No"; multi-row selection and inline edit of one prefix/sequence cell; save (F2) persists only the changed rows; per-row financial-year closing and reset flags; the same prefix source is read when creating an invoice and when generating an expense reference number.
   - Size: M Â· Dependency: backend data model Â· Priority: P1

3. **G4a-03 â€” Expenses module: add/edit/view screens (in flight)**
   - Reference pages: `/expenses/add-expense/[expense_id]`, `/expenses/view-expenses`
   - Description: Dedicated Expenses module being implemented in parallel â€” verify the finished screens against the reference acceptance criteria below rather than scoping new work.
   - Acceptance criteria: one route serving add, edit and read-only view; NATURE toggle plain vs GST where GST mode demands an invoice number and drives the tax breakdown; expense category loaded from the backend; searchable party picker with create/edit party (name, GSTIN, address, district, state, mobile, email, composition-dealer flag) and GSTIN auto-validation at 15 characters; item rows with product/service search-or-create, HSN code and rate, quantity and unit rate, per-row tax/taxable/amount; totals with taxable amount, CGST+SGST or IGST by party state, round-off and final amount; shared initial-payment dialog (amount, payment date, transaction records, payment account, UTR, cheque details) plus a payments summary and View Payments; header actions save, save-now, edit, delete expense, delete party, back; save gated on item + party + category, invoice number in GST mode and a valid HSN on every GST row; list screen with search on expense_no/party name, ADDED BETWEEN presets (Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Last Month) defaulting to last 7 days, GST-only toggle, paginated selectable table and an Add New Expense action.
   - Size: L Â· Dependency: backend data model Â· Priority: P1

4. **G4a-04 â€” Report filter builder, column chooser and export formats**
   - Reference pages: `/reports/business-report-view/[report_id]`
   - Description: Make report runs configurable and exportable beyond a fixed grid with CSV-only export.
   - Acceptance criteria: per-report filter definitions rendered from server metadata supporting single-select, multi-select, boolean, dropdown, radio, input and clearable types with a searchable option list; remote lookups for branch, customer and medicine capped at 25 hits; "Filter Report Columns" modal choosing data columns and secondary label columns; view-by selector (business, branch, customer) with a date-driven secondary filter row; date range presets (Last 7 Days, Last 30 Days, Last Month, This Month) clamped by a per-report maximum selectable days and per-report date-range type; export in Excel, CSV, PDF, HTML and email, with a dedicated excel endpoint used when the report declares one; print modal with HTML preview, print, email and PDF download; export blocked by a required column-selection modal; abort and load failures surface "Request was cancelled by user" and "An error occurred while loading the report."
   - Size: L Â· Dependency: backend data model Â· Priority: P2

5. **G4a-05 â€” Cheque register with open/cleared lifecycle**
   - Reference pages: `/cash-and-bank/cheque-management`
   - Description: Promote cheques from a payment mode to a tracked instrument with issue, clearing and reversal states.
   - Acceptance criteria: table storing cheque_no, MICR code, amount, cheque_date, issuing party (customer or distributor), credit/bearer/external flags and open/cleared state; list split into OPEN CHEQUES and CLEARED CHEQUES tabs with header stats for paid-in and paid-out counts plus Amount Paid and Amount Received; add form capturing cheque number, MICR, amount, date and party, validating "Cheque No is Required", "Cheque Amount is Required", "Cheque date is Required" and "Customer is Required", and blocking "Cannot Open Source of an External Cheque"; action modal to deposit an A/c payee cheque to a bank account, withdraw one from a bank account, or settle a bearer cheque to cash, capturing amount, payment date, UTR and invoice number and stating the effect on cash in hand; revert a cleared cheque to open state; delete behind a confirmation prompt; search by cheque number, MICR or amount plus SORT BY / FILTER BY panels with Reset Filter; cheque rows also reachable as payment entries.
   - Size: L Â· Dependency: backend data model Â· Priority: P2

6. **G4a-06 â€” Extend bulk bill operations with delete, recovery, import, discount and job reporting**
   - Reference pages: `/control-center/bulk-edit-bills`
   - Description: Extend the existing filterâ†’previewâ†’commit bulk screen with the reference's destructive and bulk-operations arms.
   - Acceptance criteria: filters extended to sale date range, bill sequence range, bill value range, bill profit range, bill status, customer type and customer/doctor/operator with searchable pickers that remember the logged-in operator; validation "From Bill Sequence No cannot be greater than To Bill Sequence No", "Min Bill Value cannot be greater than Max Bill Value" and "Please select From Sale Date and To Sale Date"; bulk delete requiring the password re-entered to confirm, reporting "Deleting Bills..." and the deletion progress; bulk recovery reusing the same delete payload with an is_bulk_recovery flag; bill-level special discount as a percentage applied to the selected bills; CSV bill import stored base64-encoded; progress polling on job_id with success/failure outcomes and a downloadable bulk action report that surfaces "Unable to download report" on failure.
   - Size: L Â· Dependency: existing page extension Â· Priority: P2

7. **G4a-07 â€” Report catalogue with categories, favourites and help panel**
   - Reference pages: `/reports/business-reports`
   - Description: Replace the hard-coded report tab set with a server-driven report catalogue users can pin.
   - Acceptance criteria: report table with report_id, report_name, report_name_footer, report_desc and report_category (chip + colour); category tab bar that remembers the active tab across visits; per-row star control with tooltip "Star / UnStar Report" that favourites without triggering row navigation, persists server-side and confirms "Added to" / "Removed from"; rows selectable to open the report view for that report id; per-business column visibility so the category column can be hidden; distributor-only report rows appended only for distributor businesses; a "How to View Reports?" help panel beside the catalogue.
   - Size: M Â· Dependency: backend data model Â· Priority: P2

8. **G4a-08 â€” Sale settings store**
   - Reference pages: `/control-center/sale-settings`
   - Description: Add sale-time behaviour settings so sale rules are configured, not hard-coded in the POS.
   - Acceptance criteria: template-driven sale_settings rows loaded from the server (binding_key/value, is_required, is_drop_down, default_doctor with doctor name, visible-for-retailer and visible-for-distributor flags); ship at least "Autofill Scheme wrt Sale Qty", "Doctor must for X Drugs" and a sale scheme format option; drawer editor with dropdown selector and type-ahead ("Type or Press Space Bar") plus a mobile section and setting search; save (F2) syncs the edited set and confirms "Sale Settings Synced"; a doctor-mandatory rule for a drug actually blocks saving a bill that omits the doctor.
   - Size: M Â· Dependency: backend data model Â· Priority: P2

9. **G4a-09 â€” Business profile field and validation completion**
   - Reference pages: `/control-center/business-profile`
   - Description: Complete the store profile so compliance identifiers and licences are captured like the reference.
   - Acceptance criteria: profile fields for PAN, CIN or LLPIN, owner name, owner PAN, trade name, entity type, taxation type (GST registered vs non-registered), FSSAI licence number with expiry, and AYUSHMAN HFR id; drug licence split into Form-20 and Form-21 numbers each with expiry date and a single uploaded image; address captured as three lines plus district and pincode with latitude/longitude pin, place autocomplete and a "Get My Location" action with distinct messages for denied permission and unsupported browser; per-weekday timings with two shifts and an Open 24x7 flag that blocks timing edits ("Please disable 24x7 access to update timings."); GSTIN validated before save and rejected as "INVALID GSTIN"; success confirmation "Business Profile Updated Successfully"; switching the selected business entity reloads entity-scoped fields.
   - Size: L Â· Dependency: backend data model Â· Priority: P2

10. **G4a-10 â€” Customer-order picklist settings**
    - Reference pages: `/control-center/picklist-settings`
    - Description: Configure the customer order intake fields via template-driven picklist settings.
    - Acceptance criteria: picklist_settings rows for customer_order_settings loaded from a server template with binding_key/value, is_required, is_drop_down and is_clearable flags so new keys appear without page changes; drawer editor with a dropdown-style selector and search-on-space; save (F2) submits the whole settings set and confirms "Picklist Settings Synced"; settings reload on mount with a loading state; the configured values are actually consumed by the order intake path rather than stored alone.
    - Size: S Â· Dependency: backend data model Â· Priority: P2

11. **G4a-11 â€” Migration from other pharmacy software with branch mapping**
    - Reference pages: `/control-center/migration`
    - Description: Extend the generic migration wizard with source-software onboarding and branch/stock mapping.
    - Acceptance criteria: software catalogue of supported old systems, each with downloadable sample file templates; data-scope selection covering customers, sales history, stock and stock batches, with backup collection time and expiry cut-off date; a request cannot be created until software and at least one date type are chosen; branch mapping that can copy item mapping from another branch and optionally copy MRP as the sale rate, with "Failed to load branches" and "Failed to load unmapped stocks" reported per stage; Excel upload validated before transfer (wrong file type and duplicate files rejected explicitly), failed uploads removable before retry, upload state tracked per file, and unmapped stock loaded afterwards with per-item mapping rows and pending-to-map indicators; migration request list with status and downloadable success, failure, excluded-row and mapping reports.
    - Size: L Â· Dependency: backend data model Â· Priority: P3

12. **G4a-12 â€” Integration partner status metadata**
    - Reference pages: `/control-center/integrations`
    - Description: Enrich the provider registry with partner grouping, status and freshness so admins can see integration health.
    - Acceptance criteria: integration rows carry partner_type grouping, partner description, icon/image, a status label with colour (e.g. "ACTIVE NOW") and last-updated date derived from the server response; list loads asynchronously with a loading flag and a re-fetch action; selecting a row opens that partner's detail/configuration view; per-partner onboarding steps beyond connect/disconnect remain out of scope for this item.
    - Size: S Â· Dependency: existing page extension Â· Priority: P3

## Slice G4a â€” deviations to document

- **Plan pricing / subscription & credits** (`/control-center/plans-pricing`): no cloud billing backend, no subscriptions and no payment gateway exist in a local-first single-pharmacy app, so plan state, SMS/e-invoice credit balances, billing history and upgrade checkout are deliberately absent.
- **Referral rewards** (`/control-center/refer-earn`): a referral code, earnings wallet and cash redemption depend on a multi-tenant cloud programme and paying referred businesses, which a single local install cannot operate.
- **Hosted tutorial videos, language switchers and hosted banners** (business-reports help video, cash-and-bank "Watch Tutorial" with language selector, expense tutorial link): the reference streams hosted content with a language picker; our local SPA ships no hosted content pipeline, so in-app help text and the existing shortcuts dialog replace it.
- **Layout customisation** (`/control-centre/layout`): the reference exposes a configurable per-section shell; our app uses one fixed DashboardLayout for every screen, and letting a single operator rearrange chrome adds no pharmacy workflow value.
- **Distributor-only report and party variants** (business-reports distributor append, cheque/distributor party fields): reference rows appear only for businesses flagged `business_type_id 2` + `is_distributor`; our app serves one pharmacy store, so the distributor branches stay unimplemented rather than faked.
- **Third-party marketplace partner onboarding** (`/control-center/integrations`): the reference rows open external partner onboarding flows; we keep a registry of self-hosted providers and connect/disconnect only, and do not replicate marketplace onboarding.


---

## Slice G4b1 â€” parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/integrations` | `/dashboard/integrations` | Partial | We list connectable providers with connect/disconnect and encrypted config; no partner-type grouping, per-partner status/last-updated columns, or rowâ†’onboarding hand-off (the hand-off itself is N/A) | S |
| `/integrations/aadhar-kyc` | â€” | N/A | Aadhaar-based partner KYC needs an external partner onboarding portal that a local-first app should not operate | â€” |
| `/integrations/business-detail` | `/dashboard/settings` (store profile card) | Partial | We keep name/GSTIN/drug licence/phone/email/address/timings/storefront picture; missing entity type, owner name/PAN/mobile, PAN/CIN/LLPIN, licence image slots, bank accounts, enrolment id/UIN (we store an ayushman HFR id â€” mapping ambiguous) and any verification submit | M |
| `/integrations/kyc-docs` | â€” | N/A | Partner KYC document upload plus "send for review" hand-off is marketplace onboarding behaviour a local pharmacy should not replicate | â€” |
| `/integrations/partner_integrations` | â€” | N/A | Partner onboarding hub (getting-started checklist, partner warnings, Cashfree redirect, plan upgrade) is marketplace behaviour with no local equivalent | â€” |
| `/integrations/verify-email` | â€” | N/A | The invoice-email OTP is a partner-onboarding step; our staff auth is identifier + password with no onboarding verification flow | â€” |
| `/settings/subscriptions` | â€” | N/A | Plan state, billing history, SMS/e-invoice credit balances and sales-call requests all belong to a cloud subscription model we do not have | â€” |
| `/settings/users-devices` | `/dashboard/devices` | Partial | We list registered devices, sessions and activity with revoke/restore; no staff roster, no add-user flow, no deviceâ†’user ownership, and no plan-based login counters (counters N/A) | M |
| `/subscriptions/checkout` | â€” | N/A | Plan picker, add-ons, coupons, GST-on-checkout and a Razorpay transaction are e-commerce/subscription flows a local-first app should not replicate | â€” |

## Slice G4b1 â€” our-side coverage notes

**Our routes that serve these reference pages**

- `/dashboard/integrations` â†’ serves `/integrations`; it is a provider registry (list, config detail, connect/disconnect with secrets) rather than a browsable partner catalogue.
- `/dashboard/settings` â†’ serves `/integrations/business-detail` through its store profile card (name, GSTIN, drug licence, phone, email, address/location, timings, storefront picture, ayushman HFR id).
- `/dashboard/devices` â†’ serves `/settings/users-devices`; tabs are Devices / Sessions / Activity / Sync / Role, with admin-only device revoke/restore.
- No route of ours maps to `/settings/subscriptions` or `/subscriptions/checkout`; the shared "settings" name is the only overlap.

**Our routes with no reference counterpart in this slice**

- `/dashboard/compliance` (e-invoice + e-way bill generation, preflight status, submissions) â€” GST compliance work this reference slice never touches.
- `/dashboard/communications` (delivery history, retry, compose, templates, per-customer channel preferences) â€” no messaging page in the slice.
- `/dashboard/campaigns` (campaigns and offers, segment targeting) â€” no counterpart here.
- `/dashboard/migration` (bulk import wizard with preview/commit/rollback) â€” no counterpart here.
- `/dashboard/scheduled-reports` (scheduled jobs, run history, download) â€” no counterpart here.
- `/dashboard/bulk-bills`, `/dashboard/accounting`, `/onboarding` (store setup wizard), `/order` (public customer order portal) â€” no counterpart in this slice.
- We deliberately have no partner-onboarding, plan-billing or checkout route; those capabilities do not exist locally.

**Where our route already exceeds the reference**

- `/dashboard/devices` vs `/settings/users-devices`: we add a session kill action, an activity audit feed, offline-sync journal status, admin-only device revoke/restore, and role/capability chips; the reference page only lists users, the devices they sit on, and plan-based login counters.
- `/dashboard/settings` vs `/integrations/business-detail`: we add invoice format/pattern with thermal 80/58 and detailed-vs-compact columns, price-override role policy, expiry policy, a backup scheduler plus cloud backup (Google Drive / Cloudflare R2 / S3) with an encryption key, an online-orders toggle, and refill-automation mode with app base URL.
- `/dashboard/integrations` vs `/integrations`: ours is a connect/disconnect registry with config + secrets inputs and encrypted config storage; the reference page is a read-only catalogue that hands off into partner onboarding.
- `/dashboard/compliance` covers e-invoice/e-way bill generation and submission history, an area absent from the whole reference slice.

## Slice G4b1 â€” backlog

**G4b1-01 â€” Staff roster on the Devices & Sync page**
- Reference pages: `/settings/users-devices`
- Description: our Devices page never names the staff account behind a device or session, and no staff list exists anywhere in the app.
- Acceptance criteria:
  - a "Users" tab lists every staff account with name, identifier, role (admin|pharmacist|cashier), device count and last activity;
  - each device and session row shows its owning staff user;
  - the roster and the admin-only feeds load behind a visible loading state and an error state, mirroring the reference "Fetching Users" behaviour;
  - the roster endpoint is admin-gated server-side (`requireRole("admin")`), and non-admin roles see the roster read-only.
- Size: M (1-3 days)
- Dependency: backend data model
- Priority: P1

**G4b1-02 â€” Add staff user with a role**
- Reference pages: `/settings/users-devices` ("Add New User (F2)")
- Description: there is no way to create a second staff account; the reference page starts adding a user to the business from its Users & Devices screen.
- Acceptance criteria:
  - an admin-only "Add User" action creates a staff account with name, identifier (email or phone) and role chosen from admin|pharmacist|cashier;
  - the new account is listed in the G4b1-01 roster and can log in through the existing identifier+password flow and register its own device;
  - a duplicate identifier is rejected with a visible, field-level error;
  - non-admin roles cannot see the action and the create endpoint rejects their calls.
- Size: M (1-3 days)
- Dependency: backend data model
- Priority: P1

**G4b1-03 â€” Revoke every device of one staff user**
- Reference pages: `/settings/users-devices`
- Description: today a device is revoked one row at a time; the reference presents devices grouped per user, which implies a per-user offboarding action we lack.
- Acceptance criteria:
  - from a roster row an admin can revoke all devices and sessions of that staff user in one action, with a confirmation dialog naming the user;
  - affected sessions end with the same global 401 behaviour as the existing device kill-switch;
  - the roster row then shows the user as having no active device;
  - the action appears in the existing activity audit feed.
- Size: S (<1 day)
- Dependency: backend data model
- Priority: P1

**G4b1-04 â€” Change the role of an existing staff user**
- Reference pages: `/settings/users-devices`
- Description: our three roles are fixed when a user signs up, so a staff roster built in G4b1-01 could not be managed afterwards.
- Acceptance criteria:
  - an admin can change a staff user's role between admin|pharmacist|cashier from the roster;
  - the change takes effect on the user's next request (server-side capability check, not only sidebar hiding);
  - an admin cannot demote the last remaining admin account;
  - the change is recorded in the activity audit feed.
- Size: S (<1 day)
- Dependency: backend data model
- Priority: P2

**G4b1-05 â€” Business profile: entity type and owner identity**
- Reference pages: `/integrations/business-detail`
- Description: our store profile captures the business name and GSTIN but not who the business is and who owns it.
- Acceptance criteria:
  - the store profile card gains entity type, owner name, owner PAN and owner mobile fields, and business PAN/CIN/LLPIN fields;
  - values persist through the existing settings API and reappear on reload;
  - an optional GSTIN format check runs on blur and blocks only the GSTIN field, matching the reference validation style;
  - the onboarding wizard writes the same keys so a store configured at signup is not re-entered.
- Size: S (<1 day)
- Dependency: existing page extension
- Priority: P2

**G4b1-06 â€” Business profile document slots (drug licence, GSTIN certificate)**
- Reference pages: `/integrations/business-detail`
- Description: we hold a drug licence number and one storefront picture as plain settings values; the reference keeps per-document image slots with one image per slot.
- Acceptance criteria:
  - the store profile card offers separate slots for the drug-licence Form 20 image, the Form 21 image and the GSTIN certificate image, each holding exactly one file;
  - each slot can be replaced or cleared and shows a preview with the file name and size;
  - uploads reuse the existing files API, and the stored file id is written back to the store profile settings;
  - a slot shows an explicit "missing" state when empty.
- Size: M (1-3 days)
- Dependency: existing page extension
- Priority: P2

**G4b1-07 â€” Address picker with map pin**
- Reference pages: `/integrations/business-detail`
- Description: the reference fills address and map pin through a place-search / geolocation picker; our inventory lists only plain address and location fields on the store profile.
- Acceptance criteria:
  - the store address can be picked from a place search or the device geolocation, storing latitude and longitude alongside the address text;
  - the picked location is shown as a pin preview on the profile card;
  - a store profile saved without coordinates still loads and displays its address text unchanged.
- Size: M (1-3 days)
- Dependency: existing page extension
- Priority: P3

**G4b1-08 â€” Record our own bank accounts**
- Reference pages: `/integrations/business-detail`
- Description: the reference page manages the business's own bank accounts and marks one for settlement; we record payments at the till but keep no bank-account list.
- Acceptance criteria:
  - the store profile card lists bank accounts with holder name, account number, IFSC and branch, and supports add, edit and delete;
  - exactly one account can be marked as the settlement account;
  - accounts are visible only to admin and pharmacist roles;
  - no account detail is ever sent to an external partner (local-only storage).
- Size: M (1-3 days)
- Dependency: backend data model
- Priority: P3

**G4b1-09 â€” Self-test order drill for online orders**
- Reference pages: `/integrations/business-detail` ("Send test order notification", at most five test notifications)
- Description: the reference sends a sample order to the operator's device so the order path can be proven end to end; our online-orders toggle and staff order queue have no such drill.
- Acceptance criteria:
  - the online-orders card in Settings offers "Send test order", creating an order flagged as a test in the existing staff order queue;
  - the test order can be accepted and dismissed through the normal accept â†’ pack â†’ ready â†’ deliver path, and the resulting test invoice is marked as a test;
  - at most five test orders can be sent, after which the action is disabled with a visible reason;
  - the action is admin-only and writes to the activity audit feed.
- Size: S (<1 day)
- Dependency: backend data model
- Priority: P2

## Slice G4b1 â€” deviations to document

- Subscription checkout (plan picker, add-ons, draft order resume): we ship no plan or billing entity, so there is nothing to check out locally.
- Coupons and wallet credits ("Use Localwell Credits", referral coupon removal): a local install has no promotional pricing layer or shared wallet to discount against.
- Payment gateway (Razorpay "Initiating/Completing Transaction" states): the app itself is not sold online; customer payments are recorded at the till instead.
- Aadhaar/partner KYC (Aadhaar onboarding link, KYC document upload, "Send for Review"): partner onboarding is marketplace behaviour we do not run.
- Partner settlement-account sync and the Cashfree onboarding redirect: we never push bank details to, or start an onboarding with, an external partner.
- Partner-onboarding email OTP on the invoice email: our staff accounts are created by an admin and sign in with identifier + password, so no delivery-code step exists.
- Subscription-gated login allowances ("No More Logins Available", buy more desktop/mobile logins): our devices are revoked by an admin, not capped by a plan.
- Displaying each device's session auth token: the reference shows it in the device list; we never render session tokens in the UI and revoke sessions instead.


---

## Slice G4b2 â€” parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/support/account-manager` | â€” | N/A | A per-business human account manager assigned by the vendor backend presumes a hosted vendor relationship; a local-first install has no vendor to assign one. | â€” |
| `/support/reset-account` | â€” | Missing | We have no password/account reset screen at all; the reference prefills the signed-in business user's name and email so a reset lands on the right account. | M |
| `/support/tickets/[ticket_id]` | â€” | N/A | Ticket threads, internal notes, attachments and assignee editing are support-desk features of a hosted desk, not of an offline product. | â€” |
| `/support/tickets/create-new-ticket` | â€” | N/A | Raising tickets with server categories, priorities and file uploads belongs to the hosted support desk we do not replicate. | â€” |
| `/support/tickets` | â€” | N/A | A support ticket list with status tabs, per-tab counts and paging is part of that hosted support desk. | â€” |
| `/support/videos-resources` | â€” | N/A | The tutorial library is YouTube-hosted content fetched through the vendor video service; a local-first app should ship local help, not a video portal. | â€” |
| `/login` | `/auth` | Partial | We have identifier+password sign-in/register with device registration, but no SMS/WhatsApp OTP branch, no FCM-token/installation-fingerprint sync, and no Terms/Privacy links. | M |
| `/login/create-password` | `/auth` (register mode) | Partial | Our register sets the password inline; there is no separate set-password step with a confirm-password match check and a "Password Created Successfully" confirmation. | S |
| `/login/login` | â€” | N/A | Legacy redirect alias for a login URL we never shipped; our router exposes no legacy login path that would need forwarding. | â€” |
| `/login/login-exhausted` | â€” | N/A | Blocking on an exhausted device allowance presumes a seat/subscription licence model; a single local install has no billable logins to exhaust. | â€” |
| `/login/register` | `/auth` + `/onboarding` | Partial | We register only the user; business name, owner name, business type, GST-registered flag and pincodeâ†’district validation are absent from registration and only appear later as free-form onboarding settings. | M |
| `/login/subscription-expired` | â€” | N/A | A premium-lapse blocking screen presumes a subscription service; our local build has no plan that can expire. | â€” |
| `/login/support/[...params]` | â€” | N/A | Support-assisted sign-in carrying a vendor-issued support token has no local counterpart; our sign-in is identifier+password only. | â€” |
| `/login/switch-business` | â€” | N/A | Picking and switching among many cloud businesses assumes one user with many tenants; our app is one store per local installation. | â€” |
| `/upload-migration-data` | `/dashboard/migration` | Partial | Our wizard starts from our own entity sets; there is no "previous software" catalogue, no searchable source picker and no single-database-file upload path. | M |
| `/` | `/` | Covered | â€” | â€” |
| `/_error` | `*` (NotFound) | Partial | We ship a 404 catch-all page but no dedicated error route/boundary for unhandled route or render failures. | S |

Size is the build estimate for rows we intend to act on (Partial/Missing); `â€”` means no work is planned (Covered/N/A).

## Slice G4b2 â€” our-side coverage notes

**Our routes that serve this slice**

- `/auth` carries the reference's `/login`, `/login/create-password` and the user half of `/login/register`: one identifier+password form that toggles between login and register, registers the browser as a device on success, and redirects into the app.
- `/onboarding` carries the business half of `/login/register` â€” the store-setup wizard that writes store basics straight into settings keys.
- `/dashboard/migration` carries `/upload-migration-data`, and goes further than it (see below).
- `/` carries the reference's `/` entry point into the auth flow, as a landing page rather than a bare redirect.
- `*` (NotFound) is the closest thing we have to the reference's `/_error` route registration.
- `/dashboard/devices` is where our own version of the reference's device/session views lives (no reference counterpart in this slice).

**Our routes with no reference counterpart in this slice**

- `/dashboard/orders`, `/order` (public customer self-order portal), `/dashboard/billing`, `/dashboard/invoices`, `/dashboard/inventory`, `/dashboard/purchases`, `/dashboard/reports`, `/dashboard/accounting` and the other pharmacy-workflow screens.
- `/dashboard/devices` (device registry, sessions, activity, sync), `/dashboard/settings`, `/dashboard/integrations`, `/dashboard/communications`, `/dashboard/campaigns`, `/dashboard/scheduled-reports`, `/dashboard/compliance`.

**Where our side already exceeds the reference**

- `/dashboard/migration` exceeds `/upload-migration-data`: the reference page stops at choosing a previous software and showing an upload area (its real migration work lives in a separate control-center chunk), while ours runs the whole session lifecycle â€” create, preview diff, commit, rollback â€” and lists recent migration sessions with status.
- `/dashboard/devices` exceeds every device view in the reference: we expose registered devices with admin revoke/restore, an active-session feed with a per-session kill, an activity audit feed and offline sync journal status, where the reference only shows a read-only device list on its blocking screens.
- `/` exceeds the reference's bare redirect: our landing is a public entry page with a "Get started" CTA to `/auth` and a "Go to dashboard" shortcut when already authenticated, while the reference root only pushes the router to `/login`.
- `/auth` accepts an email *or* phone identifier, where the reference's sign-in entry is a mobile number only.

## Slice G4b2 â€” backlog

**G4b2-01 â€” Confirm-password check and a separate set-password step on register**
- Reference pages: `/login/create-password`, `/login`
- Our register asks for a password inline; the reference asks for it again after account creation with a confirmation field, a mismatch rejection and an explicit success message.
- Acceptance: the register flow shows a confirm-password field; saving is rejected while the two fields differ; a successful set reports the password-created confirmation before entering the app; existing identifier+password login is unaffected.
- Size: S Â· Dependency: existing page extension Â· Priority: P2

**G4b2-02 â€” Password reset for the signed-in user and for local staff**
- Reference pages: `/support/reset-account`
- Our app has no password-reset path at all, and with no support desk to call a locked-out user cannot be recovered locally.
- Acceptance: a reset entry point exists for the signed-in user, prefilled with that account's name and email; an admin can reset a staff account's password; a reset password takes effect on the next login and invalidates the previous session; no role can reset another user's password without admin rights.
- Size: M Â· Dependency: backend data model Â· Priority: P1

**G4b2-03 â€” Business profile with pincodeâ†’district validation during registration/onboarding**
- Reference pages: `/login/register`
- The reference captures business name, owner name, business type, email, mobile, pincode with resolved district, GST-registered flag and optional referral code during registration; ours captures only a user, then writes free-form store basics into settings.
- Acceptance: registration or onboarding captures business name, owner name, business type, email, mobile, pincode and the GST-registered flag; a valid pincode resolves and displays a district name and an invalid one is rejected with a field-level message; every captured value persists into the store profile and is shown in Settings; the store still completes onboarding without a pincode.
- Size: M Â· Dependency: backend data model Â· Priority: P2

**G4b2-04 â€” Terms of Service and Privacy Policy links on the auth screen**
- Reference pages: `/login`
- The reference shows both policy links beside the sign-in form; our `/auth` documents no such links.
- Acceptance: both links render on `/auth` in both login and register modes and on the landing page's registration path; each link opens a locally shipped document without a network call.
- Size: S Â· Dependency: existing page extension Â· Priority: P3

**G4b2-05 â€” "Previous software" source picker for the migration wizard**
- Reference pages: `/upload-migration-data`
- The reference migration entry begins by choosing the source software from a searchable catalogue, then uploading that software's single database file; our wizard begins directly from our own entity sets.
- Acceptance: `/dashboard/migration` opens with a searchable source-software selector whose choice is stored on the session; the selection drives the upload step; an unsupported or skipped source still allows the existing customer/supplier/medicine/opening-stock path; the preview â†’ commit â†’ rollback flow is unchanged.
- Size: M Â· Dependency: backend data model Â· Priority: P2

**G4b2-06 â€” Device name/type and installation fingerprint recorded at sign-in**
- Reference pages: `/login`
- The reference syncs device name, device type, device token, FCM token and an installation fingerprint after sign-in; our register records a device but these named attributes are not documented on our side.
- Acceptance: the device registration issued at login records a device label and type and a stable installation fingerprint; the record is visible on `/dashboard/devices`; repeated logins from the same installation reuse the fingerprint instead of creating a second device row.
- Size: S Â· Dependency: backend data model Â· Priority: P2

**G4b2-07 â€” Top-level error boundary alongside the 404 catch-all**
- Reference pages: `/_error`
- The reference registers a framework error route; our router documents only a `*` NotFound page.
- Acceptance: an unhandled route or render error shows a dedicated error screen with a retry action and a link back to `/dashboard`; unknown paths still render the existing 404 page.
- Size: S Â· Dependency: none Â· Priority: P3

## Slice G4b2 â€” deviations to document

- Phone-OTP login: the reference's SMS/WhatsApp OTP branch needs an OTP gateway and a messaging provider, so our identifier+password sign-in stays as it is.
- Subscription screens: the premium-lapse and exhausted-seat blocking screens (and their renewal/upgrade actions) presumes a cloud subscription model our local build does not have.
- Support desk: ticket lists, ticket threads with internal notes and attachments, and the per-business account manager are vendor-service features a local-first app should not replicate.
- Video libraries: the YouTube-backed tutorial/feature library is remote content a local build should not carry.
- Multi-business switch: the business picker with per-business subscription state assumes one user across many cloud tenants, while our app is a single store per installation.
- Referral programme: the optional referral code at register and at sign-in drives a vendor referral programme, so our registration takes no referral code.


