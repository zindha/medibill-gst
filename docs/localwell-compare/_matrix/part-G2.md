# Slice G2 — parity matrix

Comparison of the LocalWell reference slice **G2** ("Purchase" + "Orderbook (procurement workspace)", 17 reference pages) against the MediBill GST app as inventoried in `docs/localwell-compare/our-screens.md`.

## Slice G2 — parity matrix

| Reference route | Our route | Status | Gap (concrete: name the capability, the field, or the workflow that differs) | Size |
|---|---|---|---|---|
| `/purchase/add-purchase` | `/dashboard/purchases` (New Purchase tab), `/dashboard/purchase-import`, `/dashboard/scan` | Partial | Manual purchase bill exists (supplier, lines with batch, payment method) but there is no challan merge/split mode, no free-qty / per-line discount / markup / overall bill discount, no per-line HSN+GST rate with GST-in vs outside-GST toggle, no margin/markup basis (MRP/PTR/purchase rate/net rate), no custom charge lines, no cheque + credit-period + available-credit payment block, no duplicate-bill guard, no per-purchase PDF/CSV export, no per-user purchase column settings | L |
| `/purchase/banner/b2connectbanner` | — | N/A | It is a presentational strip promoting the B2B Connect partner marketplace ("See Video" CTA); a local-first single-pharmacy app has no partner marketplace to promote, so the banner component is not replicated | — |
| `/purchase/import-csv` | `/dashboard/purchase-import` | Partial | CSV import with column mapping, per-row medicine/supplier match suggestions, session detail and commit-to-bill exists, but there is no fuzzy match score, no create-medicine inline, no verify-all-mappings gate before commit, no in-stock quantity per mapped row, no per-step import/cancel progress state, and the session carries no distributor / district / invoice-number / invoice-date / GST-flag draft context | M |
| `/purchase/return-expired-products` | `/dashboard/purchases` (Purchase Returns tab), `/dashboard/procurement` (Expiry tab), `/dashboard/inventory` (Expiry tab) | Partial | Purchase returns exist (return-against-bill modal) and expiry lists exist, but there is no expiry-driven return: no expiry-age filter in days with date presets, no expired / near-expiry / slow-moving / expired-with-purchase-history tabs, no "Proceed to Load" stock loader, no invoice-date column per stock row, no cash-settlement hint on the return | L |
| `/purchase/return-purchase` | `/dashboard/purchases` (Purchase Returns tab) | Partial | Only the return-against-bill mode exists: no stock-return-transfer mode (sync, transfer detail view, invoice export), no debit-note "Claim GST in Debit Note" choice, no supplier GSTIN / drug-licence fields, no product-age window or goods-returned-on date, no per-row scheme / free quantity, no refundable-amount / amount-refunded block against a payment account, no expired/near-expiry/slow-moving loaders, no "Show Invoice" link back to the source purchase bill | L |
| `/purchase/view-purchases` | `/dashboard/purchases` (Bills tab), `/dashboard/reports` (Purchase + Parties tabs), `/dashboard/suppliers`, `/dashboard/payments` | Partial | A purchase register, party ledgers and supplier CRUD exist but there is no single 4-tab ledger (purchases / returns / payments / distributors), no per-supplier credit period / balance due / opening balance / total returns, no supplier merge, no "verified from GSTIN records" marker, no per-supplier statement download | L |
| `/orderbook/dashboard` | `/dashboard` (KPI cards), `/dashboard/reports` (Ordering tab) | Partial | Shortage and ordering analytics exist, but there is no shortbook settings model (min stock, max stock, reorder point in days, demand-calculation period, seasonality, previous-year-demand toggle) and no cart / in-order / finalized / shortage card set, no pending-order list, no popular-brand panel, no stock-category or distributor-locality filter | L |
| `/orderbook/distributors` | `/dashboard/suppliers` | N/A | The page exists to bind a distributor into the LocalWell network — entering the customer code from that distributor's bill or sending them a mapping request — and a local-first app owns its supplier master locally, so there is no counterparty platform to map against | — |
| `/orderbook/distributors/[distributor_id]` | — | N/A | It is a distributor's network catalogue with add-to-cart plus an "invite this distributor to LocalWell" banner; we hold no supplier catalogue and no marketplace cart, so neither the catalogue nor the platform invite is replicated | — |
| `/orderbook/order-analysis` | none (nearest: `/dashboard/reports` Ordering tab) | Missing | No order-fulfilment analysis at all: no ordered / arrived / shortage / pending per product, no order count or last-order column, no company / category / location / stock-type filter set, no bulk add-to-order, no XLS export — and we hold no purchase-order record to analyse | L |
| `/orderbook/product-list` | — | N/A | The reference chunk is a dead placeholder route — route registration, a font module and a placeholder class, with no screen logic, data fetching or components — so there is no capability to replicate | — |
| `/orderbook/products-already-to-order` | — | N/A | It is conflict review plus checkout validation for a marketplace cart before a network purchase order is placed; our local flow records a purchase bill directly and has neither a cart nor an order status to conflict over | — |
| `/orderbook/purchase-orders` | — | N/A | A purchase-order register against platform distributors with order number, status, age, created-by and Excel export; we never place orders on a third-party distributor network, so no PO register is replicated | — |
| `/orderbook/purchase-orders/view-po-detail` | — | N/A | The PO lifecycle screen (timeline, document versions, mark-as-delivered, edit/cancel, send document, return products to cart) is bound to network PO status; our equivalent artefact is a locally recorded purchase bill, so this screen is not replicated | — |
| `/orderbook/shortbook` | `/dashboard/reports` (Ordering tab), `/dashboard/inventory` (Low Stock tab) | Partial | A shortage-sorted book exists but it is not configurable: no min stock / max stock / reorder point in days / demand period / seasonality / previous-year-demand settings, no editable per-row order quantity, no shortage value expressed in days, and no bulk order push | M |
| `/orderbook/view-cart` | none (nearest: `/dashboard/reports` Ordering tab, `/dashboard/procurement`) | Missing | No order cart exists: no saved order with order quantity vs required quantity, no per-product distributor assignment showing GSTIN / margin / balance / available credit, no ABC-XYZ ordering priority, no company / category / location / distributor filter drawer, no "remove products above max stock" option, no preferred vs last-ordered distributor conflict warning | L |
| `/orderbook/view-cart/[order_id]` | none (nearest: `/dashboard/purchases` bill detail) | Missing | No saved-order detail screen: no per-product remove / reset-order-quantity menu, no out-of-sync order-quantity warning, no above-max-stock flagging, no checkout validation step before the order is placed | M |

**Status counts:** Covered 0 · Partial 7 · Missing 3 · N/A 7 (17 reference pages).

## Slice G2 — our-side coverage notes

### Our routes that serve these reference pages

- `/dashboard/purchases` — serves `/purchase/add-purchase` (Bills tab + New Purchase entry), `/purchase/return-purchase` (Purchase Returns tab + return-against-bill modal) and part of `/purchase/view-purchases` (Bills tab with search, pagination and bill detail).
- `/dashboard/purchase-import` — serves `/purchase/import-csv` (CSV paste/upload, column-mapping editor, per-row match suggestions, commit → purchase bill) and the CSV import entry point inside `/purchase/add-purchase`.
- `/dashboard/scan` — serves the bill-image ingestion part of `/purchase/add-purchase`: in-browser OCR of a supplier bill (supplier, bill no, GST rate, batch, expiry, MRP, qty, rate) that upserts medicines.
- `/dashboard/reports` — serves `/purchase/view-purchases` (Purchase tab: register, detail, summary, schedule, grouped by product/supplier/company; Parties tab: distributor list and per-party ledgers) and the shortage book behind `/orderbook/shortbook` and `/orderbook/dashboard` (Ordering tab: shortage % sorted book, purchase-order grouping by product).
- `/dashboard/procurement` — serves the supplier-facing half of `/purchase/view-purchases` and `/orderbook/view-cart`: supplier purchase history and spend metrics, expiry-risk items per supplier, rate history per medicine, RFQ quote requests.
- `/dashboard/suppliers` — serves the distributor-master list inside `/purchase/view-purchases` and the distributor list of `/orderbook/distributors` (name, contact, GSTIN only).
- `/dashboard/inventory` — serves `/purchase/return-expired-products` (Expiry tab, expiry status buckets) and the low-stock list feeding `/orderbook/shortbook`.
- `/dashboard/payments` — serves the payments tab of `/purchase/view-purchases` (payment register, create, cheque mode).
- `/dashboard` — serves the KPI/summary part of `/orderbook/dashboard` (KPI cards over a date range, profit summary, fast/slow stock movers).

### Our routes in this area with no reference counterpart in G2

- `/dashboard/purchase-import` — the import is a persistent session with detail view, re-download of the original file, delete session and preview figures on commit; the reference has no session-management screen of this kind.
- `/dashboard/procurement` — RFQ / supplier quote requests, rate-history charts and per-supplier expiry-risk lists have no counterpart page in the G2 reference set.
- `/dashboard/scan` — a standalone OCR screen that upserts medicines; in the reference, bill-image handling only exists inside `/purchase/add-purchase`.
- `/dashboard/stock-audit` — count sessions with approve/cancel; the reference has no stock-audit screen.
- `/dashboard/scheduled-reports` — scheduled report jobs with run history and CSV download; no reference counterpart (the reference exports are per-screen buttons).

### Reference features our routes already exceed

- `/dashboard/purchases` adds cross-supplier price comparison (`procurementApi.compare`), supplier prior-bill lookup, batch history for a returned item, and a rate-override permission gate (admin/pharmacist only) — none of which the reference `/purchase/add-purchase` provides.
- `/dashboard/reports` adds nine analytic tabs including profit, inventory valuation and a full GST suite (tax summary, GSTR-1, GSTR-2, GSTR-3B, HSN, ITC) plus party RFM/balance sorting — the reference slice exposes no comparable reporting layer for procurement.
- `/dashboard/procurement` adds RFQ quote requests to suppliers and per-medicine rate history; the reference orderbook has no quote/request concept.
- `/dashboard/inventory` adds movement history, batch edit, and stock adjustment with explicit reasons (Breakage / Found / Expired / Sample / Correction); the reference purchase screens expose no stock-adjustment reason vocabulary.
- `/dashboard/purchase-import` adds session-level review, original-file re-download and pre-commit preview figures; the reference `/purchase/import-csv` only maps, verifies and commits.
- `/dashboard/reports` (Ordering tab) already produces a shortage-sorted book with shortage percentage, which is the base the reference shortbook builds on top of.
- `/dashboard/dashboard` provides date-ranged KPI and profit summaries for procurement decisions; the reference orderbook dashboard covers only orderbook counts.

## Slice G2 — backlog

1. **G2-01 — Supplier master carries credit terms, dues and licence fields**
   Reference pages: `/purchase/view-purchases`, `/purchase/add-purchase`, `/purchase/return-purchase`
   Description: extend the supplier record beyond name/contact/GSTIN so purchase entry can show credit period, available credit and balance due, and returns can carry licence numbers.
   Acceptance criteria: supplier record gains `credit_period_days`, `credit_limit`, `opening_balance`, `drug_licence`, `gstin_verified_at`; `GET /api/suppliers` and `GET /api/suppliers/:id` return them; the supplier list shows balance due (opening balance + purchases − returns − payments); purchase entry shows available credit = credit limit − outstanding balance; a supplier with no GSTIN is flagged in the UI.
   Size: M · Dependency: backend data model · Priority: P1

2. **G2-02 — Complete purchase-bill payment block**
   Reference pages: `/purchase/add-purchase`
   Description: the purchase entry records only a payment method; it needs the full payable/paid/credit block the reference exposes.
   Acceptance criteria: purchase bill stores `total_payable`, `amount_paid`, `payment_mode` (cash/card/UPI/cheque/credit), `cheque_no`, `cheque_date` and `credit_period_days_applied`; the form shows total payable vs amount paid and the remaining credit balance; the credit option is disabled with a reason when available credit (from G2-01) is insufficient.
   Size: M · Dependency: backend data model · Priority: P1

3. **G2-03 — Duplicate purchase-bill guard**
   Reference pages: `/purchase/add-purchase`
   Description: re-entering the same bill number for the same supplier must be detected before it double-counts stock and cost.
   Acceptance criteria: the server rejects a purchase bill whose `(supplier_id, invoice_number)` already exists on another non-cancelled bill; the purchase form shows a "This Bill is Duplicate" warning naming the existing bill and blocks save until the user resolves it; the guard is enforced server-side, not only in the UI.
   Size: S · Dependency: backend data model · Priority: P1

4. **G2-04 — Purchase line pricing fields: free quantity, discount, markup, bill discount**
   Reference pages: `/purchase/add-purchase`
   Description: purchase lines need free quantity, per-line discount and markup, and the bill needs an overall discount.
   Acceptance criteria: purchase item stores `free_qty`, `discount_pct`, `markup_pct`; the bill stores an overall `discount_amount`; the grid exposes free-qty, discount and markup columns; line amount and bill totals recompute from rate, discount and free quantity; a "More Settings" panel groups the bill-level discount/rounding/tax options.
   Size: M · Dependency: backend data model · Priority: P1

5. **G2-05 — Per-medicine HSN and GST rate on purchase lines, with a GST-in / outside-GST bill toggle**
   Reference pages: `/purchase/add-purchase`
   Description: purchase input needs HSN code and GST rate per medicine and a bill-level switch for bills outside GST.
   Acceptance criteria: medicine record carries `hsn_code` and `gst_rate`; the purchase medicine picker shows both; the purchase line stores the HSN and GST rate used plus computed tax; the bill header has a GST-in / outside-GST toggle that switches tax display on all lines; purchase tax values are readable by the existing GST/ITC report endpoints.
   Size: M · Dependency: backend data model · Priority: P1

6. **G2-06 — Shortbook reorder settings shared by the dashboard and the shortage book**
   Reference pages: `/orderbook/dashboard`, `/orderbook/shortbook`
   Description: the shortage book must be driven by configurable reorder parameters rather than a fixed rule.
   Acceptance criteria: a reorder-settings record (per product with global defaults) stores `min_stock`, `max_stock`, `reorder_point_days`, `demand_period_days`, `seasonality_enabled` and `use_previous_year_demand`; a settings dialog edits and persists them through a new endpoint and reloads them for verification; the shortage book reads the same settings; when `use_previous_year_demand` is on, demand for the current period is compared with the same period one year earlier; the shortage list reports the shortage as a number of days.
   Size: L · Dependency: backend data model · Priority: P1

7. **G2-07 — Reorder sheet with per-item supplier assignment**
   Reference pages: `/orderbook/view-cart`, `/orderbook/view-cart/[order_id]`
   Description: replace the marketplace cart with a local reorder sheet that holds shortage lines, order quantities and the supplier each line is bought from.
   Acceptance criteria: a saved order holds lines of `(product, required_qty, order_qty, supplier_id)`; a row menu offers remove and "reset order quantity to required quantity"; a supplier picker shows supplier name/address, GSTIN, margin, balance and available credit per candidate; a bulk "assign distributor" action applies one supplier to many lines; lines whose stock exceeds max stock are flagged and can be removed in bulk; the sheet shows filters by company, category, location and distributor plus a product search; "apply to purchase" creates a draft purchase bill pre-filled with the lines, quantities and suppliers.
   Size: L · Dependency: new page · Priority: P1

8. **G2-08 — Delivery-challan purchase flow (challan merge and split)**
   Reference pages: `/purchase/add-purchase`
   Description: purchase entry must support bills that arrive as delivery challans, and consolidate or split them into invoices.
   Acceptance criteria: the purchase header carries `document_type` (invoice | challan); a challan picker lists a supplier's open challans with their lines; "merge" consolidates selected challans into one bill; "split" creates a separate invoice from their products while the challans stay linked; challan lines carry their own batch, quantity and expiry and the resulting bill prints the source challan references.
   Size: L · Dependency: backend data model · Priority: P2

9. **G2-09 — Margin/markup reference basis per supplier and per item**
   Reference pages: `/purchase/add-purchase`
   Description: margin and markup must be computed against a chosen base price, not a single implicit rate.
   Acceptance criteria: supplier carries a default `margin_basis` of MRP, PTR, purchase rate or net purchase rate; the purchase line editor allows overriding the basis per item; the margin/markup preview recomputes from the selected basis; the chosen basis is stored on the line so later reports can reproduce it.
   Size: M · Dependency: backend data model · Priority: P2

10. **G2-10 — Custom charges on purchase bills**
    Reference pages: `/purchase/add-purchase`
    Description: freight and other charges must be entered as their own lines so they do not distort product pricing.
    Acceptance criteria: a charge-type list defines named charges (freight, delivery, handling); the purchase bill supports charge lines with amount and a taxable flag; charge lines add to the bill total and appear on the bill print/export; the charge types are editable in settings.
    Size: S · Dependency: backend data model · Priority: P2

11. **G2-11 — Expiry-driven purchase return**
    Reference pages: `/purchase/return-expired-products`
    Description: let the pharmacy send expired or slow-moving stock back to a supplier by expiry age, not only by referencing an existing bill.
    Acceptance criteria: the Purchases returns tab gains an "expiry return" mode; the distributor picker searches name or GSTIN and filters by district; tabs classify expired, near-expiry, slow-moving and expired-with-purchase-history stock; an expiry-age filter in days with presets (today, yesterday, last 7/30 days, this month) drives one stock query; loaded rows show batch, pack, stock, MRP, expiry date and invoice date; rows are editable/deletable before submit; the submit shows the cash-settlement amount for the return.
    Size: L · Dependency: existing page extension · Priority: P2

12. **G2-12 — Purchase return as a debit note with refund settlement**
    Reference pages: `/purchase/return-purchase`
    Description: the return must carry the tax, licence and settlement fields a debit note needs.
    Acceptance criteria: the return header stores invoice number, return date, goods-returned-on date, distributor reference, product-age window in days, `claim_gst_in_debit_note` flag, supplier GSTIN and drug licence; return lines store scheme quantity and free quantity; a payment block shows refundable amount and amount-refunded and records the refund against an existing payment account; the grid exposes purchase rate, effective purchase rate, MRP, net rate, tax, discount, amount, taxable amount, GST and balance; a per-row "show invoice" action opens the source purchase bill.
    Size: L · Dependency: backend data model · Priority: P2

13. **G2-13 — Stock return transfer to supplier**
    Reference pages: `/purchase/return-purchase`
    Description: support the second reference return mode — sending stock back without a refund — as a transfer record.
    Acceptance criteria: a return can be created as a stock transfer to a supplier instead of a debit note; the transfer stores its lines and can be synced to the server; a transfer can be reopened by id to view its detail and exported as an invoice file; confirming the transfer decrements stock and records the movement in inventory history.
    Size: M · Dependency: backend data model · Priority: P2

14. **G2-14 — Purchase import: match score, verification gate, inline medicine creation, stock context**
    Reference pages: `/purchase/import-csv`
    Description: the import screen needs confidence scoring and a hard verification step before a bill can be created.
    Acceptance criteria: the mapping endpoint returns candidate medicines with a match score; the row editor shows the score, allows picking a different existing medicine, and allows creating a medicine inline; a verify step lists unmapped/unverified rows and blocks commit until every row is mapped; each mapped row displays current in-stock quantity; importing and cancelling expose a per-step progress state; navigating away or cancelling mid-import warns that progress is lost.
    Size: M · Dependency: existing page extension · Priority: P2

15. **G2-15 — OCR-scanned supplier bill produces a draft purchase bill**
    Reference pages: `/purchase/add-purchase`
    Description: today a scanned bill only upserts medicines; it should also pre-fill a purchase bill with the detected invoice number and date.
    Acceptance criteria: after OCR the scan session creates a draft purchase bill with supplier, detected invoice number and invoice date, and lines carrying batch, expiry, MRP, quantity and rate; the operator reviews the extracted lines and commits the bill; committing creates exactly one purchase bill and does not double-create medicines that already exist.
    Size: M · Dependency: existing page extension · Priority: P2

16. **G2-16 — Unified purchase ledger screen**
    Reference pages: `/purchase/view-purchases`
    Description: purchases, returns, payments and distributors are currently split across four routes; the reference keeps them in one tabbed ledger.
    Acceptance criteria: one screen exposes tabs for purchases, returns, payments and distributors; the purchases tab lists transactions for a selected date; the distributors tab lists suppliers with contact, GSTIN, drug licence, credit period and balance due plus total purchase, total returns, purchase due, return due and opening balance; per-tab view state is remembered; shortcuts create a new purchase, a purchase return, and a payment against a supplier.
    Size: L · Dependency: existing page extension · Priority: P2

17. **G2-17 — Supplier merge with confirmation**
    Reference pages: `/purchase/view-purchases`
    Description: duplicate supplier records created by data entry must be mergeable.
    Acceptance criteria: an option menu on a supplier offers "merge" alongside edit and delete; merging takes a target supplier, moves all purchases, returns and payments of the source supplier to the target, keeps the source as an inactive record, and requires an explicit confirmation naming both suppliers; the server rejects a merge that would cross GSTIN or credit-limit records without a forced override.
    Size: M · Dependency: backend data model · Priority: P2

18. **G2-18 — Approve/reject for purchase-raised stock transfers**
    Reference pages: `/purchase/add-purchase`
    Description: stock transfers raised from a purchase need a review step before they move stock.
    Acceptance criteria: a purchase can raise a stock transfer; transfers appear in a pending list with their lines; an admin or pharmacist can approve (which applies the stock movement) or reject with a reason (which leaves stock unchanged); both actions are recorded with actor and timestamp.
    Size: M · Dependency: backend data model · Priority: P2

19. **G2-19 — Order-fulfilment analysis screen**
    Reference pages: `/orderbook/order-analysis`
    Description: an analysis of ordered vs arrived vs pending stock, with the shared stock filter set and spreadsheet export.
    Acceptance criteria: an analysis query returns, per product and for a chosen date range, ordered, arrived, shortage, pending, order count, min/max stock, location and last-order date; the screen offers filters for company, category, location, stock type and a free-text product search plus date-range presets and a calendar picker; selected rows can be pushed into the reorder sheet from G2-07; export produces an XLS file of the analysis.
    Size: L · Dependency: new page · Priority: P2

20. **G2-20 — Per-supplier statement download**
    Reference pages: `/purchase/view-purchases`
    Description: from the supplier ledger the user can download a statement.
    Acceptance criteria: a statement action on a supplier downloads a CSV/PDF for the selected date range containing opening balance, dated purchase/return/payment rows and closing balance; the file uses the same figures shown on screen.
    Size: S · Dependency: existing page extension · Priority: P3

21. **G2-21 — Export a finished purchase bill to PDF and CSV**
    Reference pages: `/purchase/add-purchase`
    Description: the completed purchase must be exportable on its own, not only through reports.
    Acceptance criteria: the purchase bill detail offers PDF and CSV export; the PDF reproduces the bill as printed (supplier, invoice number/date, lines with batch, expiry, qty, rate, discount, tax, totals); the CSV contains one row per line with the same values.
    Size: S · Dependency: existing page extension · Priority: P3

22. **G2-22 — Purchase-entry expiry buckets and per-user column settings**
    Reference pages: `/purchase/add-purchase`
    Description: the purchase grid needs expiry-aware filtering and user-specific column layout.
    Acceptance criteria: the purchase line grid can filter to expiry buckets of under 3, 6, 9 and 12 months and has a near-expiry toggle; column visibility and order are stored per user in settings and restored on the next visit; expired batches are visually flagged in the grid.
    Size: S · Dependency: existing page extension · Priority: P3

23. **G2-23 — Settlement of unpaid purchase returns**
    Reference pages: `/purchase/add-purchase`
    Description: purchase returns that are not yet settled must be visible and closable.
    Acceptance criteria: an endpoint lists unpaid purchase returns with supplier, amount and age in days; the purchase screen shows them and the amount outstanding; settling a return records a payment against the supplier and clears the outstanding amount.
    Size: S · Dependency: backend data model · Priority: P3

24. **G2-24 — Batch picker with prior sale history on purchase entry**
    Reference pages: `/purchase/add-purchase`
    Description: when a batch is chosen during purchase entry, the user needs the batch's selling history.
    Acceptance criteria: selecting a batch opens a drawer listing batch number, pack, expiry, MRP and that batch's prior sale quantities/dates; the data comes from existing batch movement data, with no new stock history source.
    Size: S · Dependency: existing page extension · Priority: P3

**Backlog counts:** 24 items — P1: 7 · P2: 12 · P3: 5.

## Slice G2 — deviations to document

- **Partner / distributor marketplace (including "powerhouse" supplier sections, marketplace-wide popular brands, and distributor catalogues with add-to-cart):** we source from our own supplier master and record purchase bills locally; there is no third-party marketplace for us to broker orders through, so no marketplace catalogue, cart or brand-ranking layer is replicated.
- **Distributor onboarding by customer code or mapping request (the `/orderbook/distributors` add-new-distributor flow, and the "invite this distributor to join" banner):** our suppliers are created and owned by the pharmacy itself; there is no counterparty platform to send a mapping request to, so distributor onboarding and invitation are deliberately not implemented.
- **Hosted promotional banner (`/purchase/banner/b2connectbanner`):** it is a partner cross-sell strip with a video CTA, which a local-first app has no reason to host; no in-app promotional banner surface is added.
- **Platform purchase-order lifecycle (PO register, PO detail timeline, order-status advance / mark-as-delivered, document versions Original/Recommended, PO-level Excel export and "return products to cart"):** our procurement record is a locally entered purchase bill; we deliberately do not implement a server-side order-placement and fulfilment service for third-party suppliers.
- **Messaging-gateway document delivery (sending purchase-order documents by email or WhatsApp, and the generic "send document" action):** our Communications page is for customer-facing messages and templates, not for third-party document fulfilment; platform-mediated document sending to suppliers is not replicated.
- **Subscription and premium-tier affordances (the reference's premium badge and premium-badged actions):** we run a single local store with no paid tiers, so premium indicators are deliberately omitted.
- **Reference placeholder and dead routes (`/orderbook/product-list`):** the reference route has no screen logic, so no corresponding route is created in our app.
