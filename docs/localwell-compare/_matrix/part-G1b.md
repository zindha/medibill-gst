## Slice G1b — parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/invoices/credit-note` | `/dashboard/returns` | Partial | No printable credit note at all — no document preview with zoom and page selection, no thermal vs laser layout choice, no PDF export, no email/SMS/WhatsApp send of the note, no jump back to the originating sale | M |
| `/invoices/debit-note` | `/dashboard/purchases` (Purchase Returns tab) | Partial | Purchase returns exist as records but never as a document — no debit-note preview with zoom and page selection, no print-layout choice, no PDF export, no send-by-channel modal, no link back to the source purchase | M |
| `/invoices/e-way-bill-view` | `/dashboard/compliance` | Partial | We generate e-way bills and list submissions, but a per-invoice read-only bill view is missing — no e-way bill number and valid-until dates, no document preview with zoom and page selection, no bill PDF export, no back-to-invoice action | M |
| `/invoices/sale-invoice-new` | `/dashboard/invoices` | Partial | We print a GST invoice and share it by WhatsApp/SMS/email, but lack the preview pane with zoom and page selection, PDF export, laser/inkjet vs dot-matrix A5/A6 layouts, previous/next invoice navigation, invoice language switcher with tutorial modal, customer summary panel (age, first-sale date, net value, edit link), inline quotation details and websocket connectivity status | L |
| `/transactions/sales` | `/dashboard/invoices` | Partial | The invoice register searches, filters and sorts, but has no pagination, no always-on row count and no keyboard row selection | S |
| `/transactions/purchases` | `/dashboard/purchases` (Bills tab) | Partial | The purchase-bill list has search and pagination but no sort control, no always-on row count and no keyboard row selection | S |
| `/transactions/sale-returns` | `/dashboard/returns` | Partial | Our returns list carries totals only — no status filter, no sort, no pagination, no always-on row count, no keyboard row selection | S |
| `/transactions/purchase-returns` | `/dashboard/purchases` (Purchase Returns tab) | Partial | The purchase-returns list has no filters, no sorting, no pagination, no always-on row count and no keyboard row selection | S |
| `/reminders/view-reminders` | `/dashboard/refills` (+ `/dashboard/customers`) | Partial | Refill reminders exist with CRUD and sending, but there is no follow-up list/patient-detail split, no follow-up-type, date-range, status, search and sort filters with an applied summary and reset, no bulk selection, no helpful/not-helpful marking, no patient analytics strip, no sales-history panel, no follow-up remarks composer, no check-current-stock action and no dropped-off flag | L |

## Slice G1b — our-side coverage notes

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

## Slice G1b — backlog

### G1b-01 — Printable credit note for sale returns
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

### G1b-02 — Printable debit note for purchase returns
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

### G1b-03 — Send credit and debit notes over email, SMS and WhatsApp
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

### G1b-04 — Per-invoice e-way bill viewer
- Reference pages: `/invoices/e-way-bill-view`
- Description: the reference reads back the e-way bill attached to a sale invoice; our compliance page only issues and lists bills.
- Acceptance criteria:
  - An invoice with an issued e-way bill opens a read-only bill view showing the e-way bill number, the date it was generated and the date it stays valid until, alongside the invoice number and date.
  - The bill renders as a document preview with zoom and page selection, and an export-as-PDF action downloads it.
  - A back action returns to the previous screen, and a missing or failed bill shows an explicit failure message.
- Size: M
- Dependency: new route
- Priority: P2

### G1b-05 — Invoice preview pane with zoom, page selection and PDF export
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

### G1b-06 — Previous/next document navigation in the print view
- Reference pages: `/invoices/sale-invoice-new`, `/invoices/credit-note`, `/invoices/debit-note`
- Description: the reference steps through neighbouring documents from the viewer; our invoice detail is a single-record dialog.
- Acceptance criteria:
  - The print view resolves the previous and next document of the same kind relative to the one on screen.
  - Navigating loads the neighbour in place with a busy state during the fetch.
  - The controls are hidden or disabled at the ends of the list rather than failing silently.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1b-07 — Customer summary panel on the invoice view
- Reference pages: `/invoices/sale-invoice-new`
- Description: the reference shows a customer panel beside the invoice; our customer record stores name, phone, email and address, so age and first-sale date are not yet available.
- Acceptance criteria:
  - The invoice view shows the customer name, mobile number, age, first-sale date and total customer net value.
  - The panel links to the customer record so it can be edited.
  - Customer age and first-sale date are stored or derived and are not blank for existing customers.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1b-08 — Customer quotation as a proforma document
- Reference pages: `/invoices/sale-invoice-new`
- Description: the reference treats a quotation as a source document whose number and validity date are shown inline on the invoice view; our invoice statuses have no proforma state and our inventory lists no customer-quotation screen.
- Acceptance criteria:
  - A customer quotation can be issued as its own document with a quotation number and validity date.
  - When an invoice originates from a quotation, the quotation number and validity date are shown inline on the invoice view.
  - Quotations are listed and counted separately from sales.
- Size: L
- Dependency: backend data model
- Priority: P2

### G1b-09 — Transaction list parity: pagination, row count and keyboard selection
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

### G1b-10 — Unified transaction category switcher
- Reference pages: `/transactions/sales`, `/transactions/purchases`, `/transactions/sale-returns`, `/transactions/purchase-returns`
- Description: the reference switches between the four transaction categories inside one screen; ours splits them across separate dashboard routes.
- Acceptance criteria:
  - A category control switches between sales, purchases, sale returns and purchase returns and shows each category's row count.
  - Switching categories clears the previously selected document so no stale selection persists.
  - The active category survives a page reload through the route.
- Size: M
- Dependency: existing page extension
- Priority: P2

### G1b-11 — Patient follow-ups screen with list, filters and patient detail
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

### G1b-12 — Follow-up classification, bulk selection, editing and remarks
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

### G1b-13 — Patient analytics strip and sales-history panel
- Reference pages: `/reminders/view-reminders`
- Description: the reference gives each patient a metrics strip and a list of prior invoices; our parties report already computes RFM per customer but nothing is surfaced inside the follow-up worklist.
- Acceptance criteria:
  - The patient panel shows sales count, total sales, average order value, average revisit frequency, first-sale date and last-sale date.
  - A sales-history panel lists the patient's prior invoices with their amounts.
  - The figures agree with the same customer's entries in the Parties report for the same period.
- Size: M
- Dependency: backend data model
- Priority: P2

### G1b-14 — Patient stock check and dropped-off flag
- Reference pages: `/reminders/view-reminders`
- Description: the reference offers a current-stock check for the patient's medicine and flags customers who have stopped buying; our batches live in inventory and our party view exposes RFM but no churn flag.
- Acceptance criteria:
  - The patient panel shows the current stock of the medicine in the follow-up, with an action that refreshes it.
  - The panel shows the last-bought and next-refill quantities with their dates and the remaining units.
  - Customers whose last purchase falls outside the active window are flagged as dropped off, derived from existing party data.
- Size: S
- Dependency: existing page extension
- Priority: P2

### G1b-15 — Invoice language switcher and tutorial modal
- Reference pages: `/invoices/sale-invoice-new`
- Description: the reference switches the invoice language between English and three regional languages and plays a tutorial video chosen by that language.
- Acceptance criteria:
  - The invoice view offers an invoice-language selector that re-renders the document in the chosen language.
  - A tutorial action opens a modal with a guidance video matching the selected language.
  - Language choices persist per user rather than resetting on every open.
- Size: M
- Dependency: existing page extension
- Priority: P3

## Slice G1b — deviations to document

- Server-rendered document HTML is not replicated — the reference previews come from backend templates, while we render invoice, credit-note and debit-note documents from our own client-side template.
- Base64 data-URL PDF delivery is not replicated — we export a real PDF file download instead of handing the browser an inline data URL.
- Provider-less WhatsApp web links are not replicated — our sends run through the configured messaging pipeline with delivery history and per-customer channel preferences.
- Regional-language invoice templates and the tutorial video player are not replicated in this slice — invoices stay in English and the guidance video is deferred.
- A separate template per printer and paper size is not replicated — we keep the A4 and thermal 80/58 formats already offered in Settings rather than adding dot-matrix A5/A6 layouts.
- The F2/F4 invoice hotkeys and arrow-key note navigation are not replicated — we rely on the existing CommandPalette and ShortcutsDialog.
- The websocket connectivity indicator on the invoice screen is not replicated — our local-first client refreshes state instead of holding a live socket channel open.
- The hosted online-store link inside the invoice WhatsApp share is not replicated — our public `/order` portal is the equivalent customer-facing surface.
