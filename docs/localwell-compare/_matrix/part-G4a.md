## Slice G4a — parity matrix

| Reference route | Our route | Status | Gap (concrete: name the capability, the field, or the workflow that differs) | Size |
|---|---|---|---|---|
| `/reports/business-reports` | `/dashboard/reports` | Partial | No server-driven report catalogue: we hard-code a 9-tab page instead of a report table (report_id, report_name, report_name_footer, report_desc, category chip) with category tabs, a persisted star/favourite toggle, remembered active tab, per-business column visibility and a tutorial panel. | M |
| `/reports/business-report-view/[report_id]` | `/dashboard/reports` | Partial | No generic per-report run page: we lack the filter builder (single/multi-select, boolean, dropdown, radio, input, clearable + remote branch/customer/medicine lookups capped at 25), the "Filter Report Columns" chooser, view-by (business/branch/customer), date-range cap per report, and Excel/PDF/HTML/email export + print preview (we only export CSV on the sales tab). | L |
| `/cash-and-bank` | `/dashboard/cash-bank` | Partial | We show Cash Book / Bank Book ledgers, not a payment-account registry: no account master rows (display name, branch, holder, IFSC, account balance, last transaction date, bank brand image, UPI), no cash-in-hand total, no "Search Accounts" by acc no/holder/IFSC, no server-defined SORT BY / FILTER BY panels with Reset Filter. | M |
| `/cash-and-bank/account-statement` | `/dashboard/cash-bank` (nearest: reconciliation rows only) | Missing | No per-account statement: no TXN UTR/date, txn type/user, narration, coloured in/out amount chip, opening/closing balance rows, add-or-reduce balance adjustment (type, amount, date, remark/UTR, old→new balance preview), transaction edit/delete, account delete, or PDF/CSV statement export. | L |
| `/cash-and-bank/cheque-management` | `/dashboard/payments` (cheque mode only) | Missing | No cheque lifecycle: we only accept `cheque` as a payment mode on the payment register; there is no open/cleared tab split, cheque_no/MICR/amount/date/party capture, pay-in/pay-out count and amount stats, deposit-to-bank / withdraw / settle-bearer-to-cash actions with UTR+invoice no, revert-to-open, or cheque search by no/MICR/amount. | L |
| `/expenses/add-expense/[expense_id]` | `/dashboard/expenses` (in progress) | In progress | Dedicated Expenses module (schema + router + add/edit/view screen) in flight — must carry: NATURE plain vs GST toggle forcing invoice number, backend-loaded expense category, searchable party with create-new (GSTIN, address, district, state, mobile, email, composition flag), HSN-coded item rows with per-row tax/taxable/amount, CGST+SGST vs IGST by party state, round-off, shared payment dialog (account, UTR, cheque) and save gating (item + party + category present, GST mode invoice number, valid HSN per row). | L |
| `/expenses/view-expenses` | `/dashboard/expenses` (in progress) | In progress | Same in-flight module — list half must carry: search on expense_no or party name, ADDED BETWEEN presets (Today, Yesterday, Last 7/30 Days, This Month, Last Month) defaulting to last 7 days, GST-expenses-only toggle, paginated selectable table, and an Add New Expense action that opens the add screen. | M |
| `/control-center/business-profile` | `/dashboard/settings` (store profile card) | Partial | Our store profile lacks PAN, CIN/LLPIN, owner name, owner PAN, trade name from GST records, Form-20 and Form-21 numbers with expiry dates and one image each, FSSAI licence number + expiry, entity type and taxation type (registered vs non-registered); address detail is one block rather than 3 lines + district + pincode with map pin/place autocomplete/Get My Location; GSTIN validation and the per-weekday two-shift timings with an Open 24x7 lock are ambiguous in our-screens.md. | L |
| `/control-center/bulk-edit-bills` | `/dashboard/bulk-bills` | Partial | We have filter → preview diff → commit; missing bulk delete (password re-entry confirmation) and bulk recovery (is_bulk_recovery reuse of the delete payload), bill CSV import (base64 upload), bill-level special discount %, job progress polling on job_id, downloadable bulk action report, and the reference filter set (bill sequence range, bill value range, bill profit range, bill status, customer type, customer/doctor/operator). | L |
| `/control-center/migration` | `/dashboard/migration` | Partial | We migrate via a generic session wizard (create → preview → commit → rollback); missing a source-software catalogue with template downloads, data-scope selection (customers, sales history, stock + batches, backup collection time, expiry cut-off), branch mapping (copy item mapping from a branch, copy MRP as sale rate), Excel upload with per-file validation/state/removal, unmapped-stock mapping rows, and downloadable per-request success/failure/excluded/mapping reports. | L |
| `/control-center/integrations` | `/dashboard/integrations` | Partial | We list provider rows and connect/disconnect with config + secrets; missing master partner-type grouping, per-row status label/colour and last-updated date, and a per-partner onboarding route beyond our config detail dialog. | S |
| `/control-centre/layout` (control-centre shell) | `/dashboard/*` shared shell | Covered | Reference page is a pass-through layout wrapper with no behaviour of its own; our shared DashboardLayout already nests every dashboard page, so nothing to build. | — |
| `/control-center/picklist-settings` | none | Missing | No customer-order picklist settings: no template-driven key/value binding rows (is_required, is_drop_down, is_clearable), no drawer editor with dropdown + space-to-search, no save that syncs the whole settings set with a sync confirmation, and no order-intake setting that our `/dashboard/orders` queue could honour. | S |
| `/control-center/plans-pricing` | none | N/A | Subscription state, SMS/e-invoice credit balances, billing history and upgrade checkout all require a cloud billing backend and payment gateway; a local-first single-pharmacy app has no plan to sell or credits to meter. | — |
| `/control-center/prefix-sequences` | `/dashboard/settings` (invoice format) + `/dashboard/billing` (next-number prefetch) | Partial | We store one invoice prefix/pattern + print format and prefetch the next number, but have no editor mapping transaction type → prefix + running sequence (seq_value, multi-row select, inline single-cell edit), no financial-year closing/reset flags per row, and no shared prefix-sequence source for expense_no. | M |
| `/control-center/refer-earn` | none | N/A | A referral wallet that pays cash rewards, tracks referred pharmacies' subscription state and offers social share needs a multi-tenant cloud programme; a single-pharmacy local install has no referrer network to reward. | — |
| `/control-center/sale-settings` | none | Missing | No sale-time settings store: no template-driven setting rows (binding_key/value, is_required, is_drop_down, default_doctor, visible-for-retailer/distributor flags), none of the sale rules ("Autofill Scheme wrt Sale Qty", "Doctor must for X Drugs", sale scheme format), no drawer editor with type-ahead, and no save that syncs the set with a sync confirmation. | M |

## Slice G4a — our-side coverage notes

**Our routes that serve this slice**

- `/dashboard/reports` → `/reports/business-reports` and `/reports/business-report-view` (fixed 9-tab analytics page; 25+ `/api/reports/*` routes, global from/to range, CSV export).
- `/dashboard/cash-bank` → `/cash-and-bank` only in spirit (Cash Book / Bank Book + reconciliation); it has no payment-account registry, so the reference landing and its statement page are unhosted.
- `/dashboard/payments` → the only place cheque appears on our side, as a payment *mode* on the register; no cheque document or lifecycle.
- `/dashboard/settings` → `/control-center/business-profile` (store profile card: name, GSTIN, drug license, phone/email, address, location, timings, storefront picture, ayushman HFR id) and `/control-center/prefix-sequences` (invoice format prefix/pattern + A4/thermal 80/58 + detailed/compact columns only).
- `/dashboard/bulk-bills` → `/control-center/bulk-edit-bills` (filter, preview diff, commit; admin/pharmacist only).
- `/dashboard/migration` → `/control-center/migration` (session wizard over customers/suppliers/medicines/opening stock, preview, commit, rollback, recent list).
- `/dashboard/integrations` → `/control-center/integrations` (provider registry, config detail, connect/disconnect).
- `/dashboard/invoices` + `/dashboard/billing` → the numbering half of `/control-center/prefix-sequences` (invoice create with next-number prefetch, invoice print template).
- `/dashboard/accounting` → closest host for the reference's cash/bank money movement (chart of accounts, journal entry form, day book, opening balances, period close/reopen); the reference expresses this as per-account statements instead.

**Our routes in this area with no reference counterpart in the slice**

- `/dashboard/accounting` (trial balance, P&L, balance sheet, day book, journals, opening wizard, period lock).
- `/dashboard/scheduled-reports` (recurring jobs, run history, CSV download, email/SMS delivery).
- `/dashboard/compliance` (e-Invoice preflight/generate/cancel, e-way bill, submissions) — no reference page in this slice covers it.
- `/dashboard/invoices` (invoice register, detail/print, record payment, cancel, per-row e-invoice status, WhatsApp/SMS/email share).
- `/dashboard/orders` (staff queue accept→pack→ready→deliver); the reference's picklist settings are configuration for order intake, not an equivalent screen.
- `/dashboard/settings` blocks with no counterpart here: expiry policy, price-override role policy, backup scheduler, cloud backup (Drive/R2/S3), online-orders toggle, refill automation mode.
- `/dashboard/payments` as a *payment register* (received/paid/expense types) — the reference records money movement inside a bank-account statement, not a standalone register.

**Reference features our routes already exceed** (supported by our-screens.md)

- `/dashboard/cash-bank` adds bank-statement CSV import, suggested per-row matches and one-click match/unmatch on top of the reconciliation status summary; the reference cash-and-bank landing only lists accounts and fetches a summary.
- `/dashboard/scheduled-reports` adds recurring daily/weekly/monthly report jobs with enable/disable, run-now, run history, generated-CSV download and email/SMS delivery; the reference report view offers only one-off export formats.
- `/dashboard/accounting` adds double-entry journals, trial balance, P&L, balance sheet, an opening-balance wizard and period close/reopen; the reference account statement only performs single-sided add/reduce balance edits.
- `/dashboard/reports` includes a GST suite (tax summary, GSTR-1, GSTR-2, GSTR-3B, HSN, ITC), party RFM sorting and a shortbook/ordering view, plus global from/to range and export across tabs; the reference catalogue's report set is server-defined and not enumerated in the slice, so no per-report parity or exceedance claim is possible there.
- `/dashboard/invoices` adds per-row e-invoice status, invoice cancellation and WhatsApp/SMS/email invoice sharing; the reference's email capability in this slice is report-export-only.
- `/dashboard/payments` records cash/card/UPI/bank-transfer/cheque as typed payment entries with a payment type (received/paid/expense) filter; the reference keeps money movement inside a bank-account statement.

## Slice G4a — backlog

1. **G4a-01 — Payment accounts master and per-account statement**
   - Reference pages: `/cash-and-bank`, `/cash-and-bank/account-statement`
   - Description: Introduce a payment-account master and a statement screen so cash/bank balances, adjustments and statement export are first-class instead of reconciliation rows only.
   - Acceptance criteria: table `payment_accounts` (display name, payment_account_type_id, bank branch name, IFSC, account number, holder name, UPI address, merchant id/key, terminal id, balance, last transaction date); accounts list with search across account no / holder name / IFSC, server-defined SORT BY and FILTER BY with Reset Filter, cash-in-hand total on the summary response, result count in the footer; statement grid with TXN UTR/date, txn type/user, narration, coloured in/out amount chip, opening and closing balance rows, transaction search by UTR or amount, date-range control and paginated scroll loading with skeleton; "Add or Reduce Balance" modal (ADD MONEY / REDUCE MONEY, adjustment type, amount, date, remark or UTR) validating "Please Enter Adjustment Amount", "Please Enter Adjustment Name", "Please Select Adjustment Date" and previewing old vs new balance; transaction edit and delete behind "You want to Delete this Transaction!", account delete behind "Are you sure you want to delete this account?"; statement export as PDF and CSV with "Downloading statement..." progress and "Failed to download statement" on error.
   - Size: L · Dependency: new route · Priority: P1

2. **G4a-02 — Invoice-number prefix and sequence sequences**
   - Reference pages: `/control-center/prefix-sequences` (also drives `expense_no`)
   - Description: Replace the single invoice prefix/pattern setting with a per-transaction-type prefix + running-sequence editor shared by invoice and expense numbering.
   - Acceptance criteria: table keyed by prefix_key with prefix_value and seq_value; editor listing transaction type, prefix and current sequence value with the hint "Prefix & Sequence together will form Invoice No"; multi-row selection and inline edit of one prefix/sequence cell; save (F2) persists only the changed rows; per-row financial-year closing and reset flags; the same prefix source is read when creating an invoice and when generating an expense reference number.
   - Size: M · Dependency: backend data model · Priority: P1

3. **G4a-03 — Expenses module: add/edit/view screens (in flight)**
   - Reference pages: `/expenses/add-expense/[expense_id]`, `/expenses/view-expenses`
   - Description: Dedicated Expenses module being implemented in parallel — verify the finished screens against the reference acceptance criteria below rather than scoping new work.
   - Acceptance criteria: one route serving add, edit and read-only view; NATURE toggle plain vs GST where GST mode demands an invoice number and drives the tax breakdown; expense category loaded from the backend; searchable party picker with create/edit party (name, GSTIN, address, district, state, mobile, email, composition-dealer flag) and GSTIN auto-validation at 15 characters; item rows with product/service search-or-create, HSN code and rate, quantity and unit rate, per-row tax/taxable/amount; totals with taxable amount, CGST+SGST or IGST by party state, round-off and final amount; shared initial-payment dialog (amount, payment date, transaction records, payment account, UTR, cheque details) plus a payments summary and View Payments; header actions save, save-now, edit, delete expense, delete party, back; save gated on item + party + category, invoice number in GST mode and a valid HSN on every GST row; list screen with search on expense_no/party name, ADDED BETWEEN presets (Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Last Month) defaulting to last 7 days, GST-only toggle, paginated selectable table and an Add New Expense action.
   - Size: L · Dependency: backend data model · Priority: P1

4. **G4a-04 — Report filter builder, column chooser and export formats**
   - Reference pages: `/reports/business-report-view/[report_id]`
   - Description: Make report runs configurable and exportable beyond a fixed grid with CSV-only export.
   - Acceptance criteria: per-report filter definitions rendered from server metadata supporting single-select, multi-select, boolean, dropdown, radio, input and clearable types with a searchable option list; remote lookups for branch, customer and medicine capped at 25 hits; "Filter Report Columns" modal choosing data columns and secondary label columns; view-by selector (business, branch, customer) with a date-driven secondary filter row; date range presets (Last 7 Days, Last 30 Days, Last Month, This Month) clamped by a per-report maximum selectable days and per-report date-range type; export in Excel, CSV, PDF, HTML and email, with a dedicated excel endpoint used when the report declares one; print modal with HTML preview, print, email and PDF download; export blocked by a required column-selection modal; abort and load failures surface "Request was cancelled by user" and "An error occurred while loading the report."
   - Size: L · Dependency: backend data model · Priority: P2

5. **G4a-05 — Cheque register with open/cleared lifecycle**
   - Reference pages: `/cash-and-bank/cheque-management`
   - Description: Promote cheques from a payment mode to a tracked instrument with issue, clearing and reversal states.
   - Acceptance criteria: table storing cheque_no, MICR code, amount, cheque_date, issuing party (customer or distributor), credit/bearer/external flags and open/cleared state; list split into OPEN CHEQUES and CLEARED CHEQUES tabs with header stats for paid-in and paid-out counts plus Amount Paid and Amount Received; add form capturing cheque number, MICR, amount, date and party, validating "Cheque No is Required", "Cheque Amount is Required", "Cheque date is Required" and "Customer is Required", and blocking "Cannot Open Source of an External Cheque"; action modal to deposit an A/c payee cheque to a bank account, withdraw one from a bank account, or settle a bearer cheque to cash, capturing amount, payment date, UTR and invoice number and stating the effect on cash in hand; revert a cleared cheque to open state; delete behind a confirmation prompt; search by cheque number, MICR or amount plus SORT BY / FILTER BY panels with Reset Filter; cheque rows also reachable as payment entries.
   - Size: L · Dependency: backend data model · Priority: P2

6. **G4a-06 — Extend bulk bill operations with delete, recovery, import, discount and job reporting**
   - Reference pages: `/control-center/bulk-edit-bills`
   - Description: Extend the existing filter→preview→commit bulk screen with the reference's destructive and bulk-operations arms.
   - Acceptance criteria: filters extended to sale date range, bill sequence range, bill value range, bill profit range, bill status, customer type and customer/doctor/operator with searchable pickers that remember the logged-in operator; validation "From Bill Sequence No cannot be greater than To Bill Sequence No", "Min Bill Value cannot be greater than Max Bill Value" and "Please select From Sale Date and To Sale Date"; bulk delete requiring the password re-entered to confirm, reporting "Deleting Bills..." and the deletion progress; bulk recovery reusing the same delete payload with an is_bulk_recovery flag; bill-level special discount as a percentage applied to the selected bills; CSV bill import stored base64-encoded; progress polling on job_id with success/failure outcomes and a downloadable bulk action report that surfaces "Unable to download report" on failure.
   - Size: L · Dependency: existing page extension · Priority: P2

7. **G4a-07 — Report catalogue with categories, favourites and help panel**
   - Reference pages: `/reports/business-reports`
   - Description: Replace the hard-coded report tab set with a server-driven report catalogue users can pin.
   - Acceptance criteria: report table with report_id, report_name, report_name_footer, report_desc and report_category (chip + colour); category tab bar that remembers the active tab across visits; per-row star control with tooltip "Star / UnStar Report" that favourites without triggering row navigation, persists server-side and confirms "Added to" / "Removed from"; rows selectable to open the report view for that report id; per-business column visibility so the category column can be hidden; distributor-only report rows appended only for distributor businesses; a "How to View Reports?" help panel beside the catalogue.
   - Size: M · Dependency: backend data model · Priority: P2

8. **G4a-08 — Sale settings store**
   - Reference pages: `/control-center/sale-settings`
   - Description: Add sale-time behaviour settings so sale rules are configured, not hard-coded in the POS.
   - Acceptance criteria: template-driven sale_settings rows loaded from the server (binding_key/value, is_required, is_drop_down, default_doctor with doctor name, visible-for-retailer and visible-for-distributor flags); ship at least "Autofill Scheme wrt Sale Qty", "Doctor must for X Drugs" and a sale scheme format option; drawer editor with dropdown selector and type-ahead ("Type or Press Space Bar") plus a mobile section and setting search; save (F2) syncs the edited set and confirms "Sale Settings Synced"; a doctor-mandatory rule for a drug actually blocks saving a bill that omits the doctor.
   - Size: M · Dependency: backend data model · Priority: P2

9. **G4a-09 — Business profile field and validation completion**
   - Reference pages: `/control-center/business-profile`
   - Description: Complete the store profile so compliance identifiers and licences are captured like the reference.
   - Acceptance criteria: profile fields for PAN, CIN or LLPIN, owner name, owner PAN, trade name, entity type, taxation type (GST registered vs non-registered), FSSAI licence number with expiry, and AYUSHMAN HFR id; drug licence split into Form-20 and Form-21 numbers each with expiry date and a single uploaded image; address captured as three lines plus district and pincode with latitude/longitude pin, place autocomplete and a "Get My Location" action with distinct messages for denied permission and unsupported browser; per-weekday timings with two shifts and an Open 24x7 flag that blocks timing edits ("Please disable 24x7 access to update timings."); GSTIN validated before save and rejected as "INVALID GSTIN"; success confirmation "Business Profile Updated Successfully"; switching the selected business entity reloads entity-scoped fields.
   - Size: L · Dependency: backend data model · Priority: P2

10. **G4a-10 — Customer-order picklist settings**
    - Reference pages: `/control-center/picklist-settings`
    - Description: Configure the customer order intake fields via template-driven picklist settings.
    - Acceptance criteria: picklist_settings rows for customer_order_settings loaded from a server template with binding_key/value, is_required, is_drop_down and is_clearable flags so new keys appear without page changes; drawer editor with a dropdown-style selector and search-on-space; save (F2) submits the whole settings set and confirms "Picklist Settings Synced"; settings reload on mount with a loading state; the configured values are actually consumed by the order intake path rather than stored alone.
    - Size: S · Dependency: backend data model · Priority: P2

11. **G4a-11 — Migration from other pharmacy software with branch mapping**
    - Reference pages: `/control-center/migration`
    - Description: Extend the generic migration wizard with source-software onboarding and branch/stock mapping.
    - Acceptance criteria: software catalogue of supported old systems, each with downloadable sample file templates; data-scope selection covering customers, sales history, stock and stock batches, with backup collection time and expiry cut-off date; a request cannot be created until software and at least one date type are chosen; branch mapping that can copy item mapping from another branch and optionally copy MRP as the sale rate, with "Failed to load branches" and "Failed to load unmapped stocks" reported per stage; Excel upload validated before transfer (wrong file type and duplicate files rejected explicitly), failed uploads removable before retry, upload state tracked per file, and unmapped stock loaded afterwards with per-item mapping rows and pending-to-map indicators; migration request list with status and downloadable success, failure, excluded-row and mapping reports.
    - Size: L · Dependency: backend data model · Priority: P3

12. **G4a-12 — Integration partner status metadata**
    - Reference pages: `/control-center/integrations`
    - Description: Enrich the provider registry with partner grouping, status and freshness so admins can see integration health.
    - Acceptance criteria: integration rows carry partner_type grouping, partner description, icon/image, a status label with colour (e.g. "ACTIVE NOW") and last-updated date derived from the server response; list loads asynchronously with a loading flag and a re-fetch action; selecting a row opens that partner's detail/configuration view; per-partner onboarding steps beyond connect/disconnect remain out of scope for this item.
    - Size: S · Dependency: existing page extension · Priority: P3

## Slice G4a — deviations to document

- **Plan pricing / subscription & credits** (`/control-center/plans-pricing`): no cloud billing backend, no subscriptions and no payment gateway exist in a local-first single-pharmacy app, so plan state, SMS/e-invoice credit balances, billing history and upgrade checkout are deliberately absent.
- **Referral rewards** (`/control-center/refer-earn`): a referral code, earnings wallet and cash redemption depend on a multi-tenant cloud programme and paying referred businesses, which a single local install cannot operate.
- **Hosted tutorial videos, language switchers and hosted banners** (business-reports help video, cash-and-bank "Watch Tutorial" with language selector, expense tutorial link): the reference streams hosted content with a language picker; our local SPA ships no hosted content pipeline, so in-app help text and the existing shortcuts dialog replace it.
- **Layout customisation** (`/control-centre/layout`): the reference exposes a configurable per-section shell; our app uses one fixed DashboardLayout for every screen, and letting a single operator rearrange chrome adds no pharmacy workflow value.
- **Distributor-only report and party variants** (business-reports distributor append, cheque/distributor party fields): reference rows appear only for businesses flagged `business_type_id 2` + `is_distributor`; our app serves one pharmacy store, so the distributor branches stay unimplemented rather than faked.
- **Third-party marketplace partner onboarding** (`/control-center/integrations`): the reference rows open external partner onboarding flows; we keep a registry of self-hosted providers and connect/disconnect only, and do not replicate marketplace onboarding.
