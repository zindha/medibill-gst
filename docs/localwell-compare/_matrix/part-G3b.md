## Slice G3b — parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/stock-audit/view-audit/[stock_audit_id]` | `/dashboard/stock-audit` | Partial | No result screen for a finished audit: missing audited/short/excess/adjusted SKU counts, short and excess adjustment values, net adjustment, per-batch physical-count and reason editing, batch-number search and audit deletion | M |
| `/stock-audit/view-batches/[stock_audit_id]` | `/dashboard/stock-audit` | Partial | Our count entry lacks barcode-scan mode, row search/filter/sort, per-row mismatch reason, expiry-range filtering, discard-audit and per-row delete; we approve with one audit-level reason instead of finishing a synced count step | L |
| `/stock-audit/view-products` | `/dashboard/stock-audit` | Partial | No "Select SKUs to Audit" step: we enter counts straight after creating a session, with no company/form/location/category/initials/in-stock filter grid and no multi-select of stock ids carried into the count | M |
| `/stock-audit` | `/dashboard/stock-audit` | Partial | Our hub creates a session with a note only; missing the audit-type chooser, expiry-range dialog, audit number/type/created/ended/progress/adjusted-value/adjusted-by columns, date-range presets, sort and the running elapsed-time status | M |
| `/dashboard/view-dashboard` | `/dashboard` | Partial | Our dashboard has KPI cards, profit, fast/slow movers and refills; missing stock-value tiles (MRP, sale and purchase incl GST), cash-in-hand per payment mode, new-vs-repeat customers with average order value, and the due-payments card with payment and reminder actions | M |
| `/customer-orders` | `/dashboard/orders`, `/order`, `/dashboard/customers` | N/A | Distributor-customer mapping, mapping-request inbox, distributor invites, ZennX account creation and MedCart promotion belong to a hosted marketplace network we do not run; our local equivalent is the staff order queue plus the public `/order` portal | — |
| `/customer-orders/business-kyc` | `/dashboard/settings` | Partial | Our store profile holds GSTIN, drug licence and storefront picture; missing business-entity choice (PAN/LLPIN/CIN), server-side GSTIN validation with address and composition-dealer back-fill, Form 20/21 numbers with licence images, GST certificate upload and the self-declaration gate | M |
| `/customer-orders/order-detail` | `/dashboard/orders`, `/dashboard/billing` | Partial | Our order detail lists lines and runs accept → pack → ready → deliver; missing 6-digit customer delivery-code confirmation, AWB last-four capture, delivery/refused/pickup actions, editable billing and shipping addresses, bounced-order conversion and a status timeline | M |
| `/customer-orders/promote-medcart` | `/dashboard/campaigns` (nearest local analogue) | N/A | MedCart store links, referral QR stickers and app-install/order/revenue tiles promote a third-party marketplace we neither host nor integrate; our campaigns channel serves direct customer messaging instead | — |

## Slice G3b — our-side coverage notes

**Our routes that serve these reference pages**

- `/dashboard/stock-audit` — one session-based screen: create a session with a note, count against batches via barcode lookup or batch picker, submit or update a count row, then approve (which creates adjustments) or cancel with a reason; approval is gated to admin/pharmacist. Serves all four stock-audit reference pages at their narrowest.
- `/dashboard/inventory` — Stock, Expiry, Low Stock and History tabs with batch CRUD, adjust-with-reason and expiry buckets; supplies the stock and expiry figures the audit is compared against, and is the closest thing we have to the reference's filterable candidate grid.
- `/dashboard` (index) — KPI cards over a shared date range plus profit summary, fast/slow stock movers on a tab strip and an upcoming-refills widget. Serves the reference dashboard.
- `/dashboard/reports` — Sales, Stock, Purchase, Payments & Expenses, Profitability, Inventory Valuation, GST, Parties and Ordering tabs; it is where our dashboard cards can drill down (fast/slow movers, profit, pending parties).
- `/dashboard/payments` and `/dashboard/cash-bank` — payment register with cash/card/UPI/bank/cheque modes plus cash and bank books with statement import and reconciliation; these are our counterparts to the reference dashboard's cash-in-hand and due-payment cards.
- `/dashboard/refills` — refill reminder list, create, status update, delete, single send and send-all-due; the counterpart to the reference dashboard's refill reminders card.
- `/dashboard/orders` — staff queue for our own online customer orders: list with status tabs, order detail with line items, accept → pack → ready → deliver, reject/cancel with reason; deliver ties an invoice id.
- `/order` — public customer self-ordering page keyed by `storeId`, with medicine search, prescription upload, cart and unauthenticated status lookup; our counterpart to the reference's customer-side ordering entry point.
- `/dashboard/customers` — customer list, create/edit/delete, engagement insights, loyalty balance and a quick refill-reminder action; the closest local surface to the reference's customer record.
- `/dashboard/billing` — POS where an accepted customer order can be pulled in and billed; our counterpart to the reference's order-to-sale-bill path.
- `/dashboard/settings` and `/onboarding` — store profile (name, GSTIN, drug licence, phone, address, storefront picture, Ayushman HFR id) and post-signup store setup; the only local surfaces for business KYC data.
- `/dashboard/campaigns` — campaigns and offers over WhatsApp/SMS/email; the nearest local analogue to the reference's MedCart promotion page, without any marketplace install or revenue reporting.

**Our routes with no reference counterpart in this slice**

- `/dashboard/invoices`, `/dashboard/returns`, `/dashboard/billing`, `/dashboard/purchases`, `/dashboard/procurement`, `/dashboard/purchase-import`, `/dashboard/cash-bank`, `/dashboard/accounting`, `/dashboard/compliance` — sales, purchase, finance and compliance registers the three reference areas do not cover.
- `/dashboard/scan`, `/dashboard/labels`, `/dashboard/catalog` — OCR bill capture, label printing and the medicine catalogue.
- `/dashboard/doctors`, `/dashboard/prescriptions`, `/dashboard/suppliers` — party and prescription masters.
- `/dashboard/communications`, `/dashboard/scheduled-reports`, `/dashboard/devices`, `/dashboard/integrations`, `/dashboard/migration`, `/dashboard/bulk-bills` — messaging, scheduled jobs, device registry, provider registry, migration wizard and bulk bill editing.
- `/`, `/auth`, `/onboarding`, `*` — landing, sign-in, setup wizard and the 404 catch-all.
- Note: `/dashboard/payments`, `/dashboard/refills` and `/dashboard/reports` are counterparts for the reference dashboard's due-payment, refill and stock-mover cards rather than separate pages in this slice.

**Where our route already exceeds the reference**

- `/dashboard/reports` — nine-tab analytics with CSV export, party ledgers and RFM, GST suite (GSTR-1/2/3B, HSN, ITC), inventory valuation and a shortbook ordering tab; the reference dashboard offers summary cards only.
- `/dashboard/compliance` — e-Invoice generation with preflight validation, e-way bill creation and a submissions list; nothing in this slice covers statutory filing.
- `/dashboard/cash-bank` — bank-statement CSV import with suggested matches and one-click match/unmatch plus reconciliation status; the reference dashboard only charts cash in hand.
- `/dashboard/accounting` — double-entry trial balance, P&L, balance sheet, day book, journals, opening-balance wizard and period close/reopen; no counterpart in the reference slice.
- `/dashboard/purchase-import` and `/dashboard/scan` — CSV or in-browser OCR import of supplier bills with column mapping, medicine matching, session history and commit to a purchase bill.
- `/dashboard/devices` — device registry with admin revoke/restore, session kill switch, activity feed and offline sync journal.
- `/dashboard/scheduled-reports` — scheduled report jobs with daily/weekly/monthly cadence, run history, CSV download and email/SMS delivery.
- `/dashboard/stock-audit` — countable sessions that persist a count per batch, resolve into stock adjustments on approval with a reason, cancel with a reason, and keep approval behind an admin/pharmacist gate; the reference expresses audit outcome only as summary values.
- Reference drug-code and PMBJAY columns appear only for PMBJAY-enabled businesses; our settings store an Ayushman HFR id, but our medicine and audit records carry no drug-code field, so that column pair has no local counterpart either way.

## Slice G3b — backlog

### G3b-01 — Finished-audit result summary
- **Reference pages:** `/stock-audit/view-audit/[stock_audit_id]`
- **Description:** Give a finished audit its own result screen with a signed summary strip, instead of leaving the outcome in a list row.
- **Acceptance criteria:** Opening a finished audit shows audit number, audit date as day/month/year, audited SKU count, short SKU count with its adjustment value in red, excess SKU count with its adjustment value in green, adjusted SKU count and the net adjustment, every value signed from the saved counts; the batch table below lists batch number, physical packs and units and the mismatch reason for every row; a local search narrows rows by batch number; a delete action behind a confirmation dialog removes the audit and returns to the list.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P1

### G3b-02 — Editable physical count and per-batch mismatch reason
- **Reference pages:** `/stock-audit/view-batches/[stock_audit_id]`, `/stock-audit/view-audit/[stock_audit_id]`
- **Description:** Let a counter attach a reason to each mismatching batch and let a reviewer correct the physical count in place, instead of recording one reason for the whole audit.
- **Acceptance criteria:** The count row opens a reason picker listing reasons served by the backend and stores the chosen reason against that batch's count; software pack size, stock packs and stock units stay read-only while physical packs and physical units are editable in the result table; saving a row recomputes that batch's short or excess and the audit's net adjustment; approval writes the stock adjustment using the row reason; a batch whose physical count equals the software count needs no reason.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P1

### G3b-03 — Barcode-scan counting with scan feedback
- **Reference pages:** `/stock-audit/view-batches/[stock_audit_id]`
- **Description:** Count batches by scanning their barcodes with the camera instead of picking every batch by hand, extending the camera mount planned in G3a-10.
- **Acceptance criteria:** The count screen keeps a barcode field focused so a hardware scanner or the camera component can fill it; a scanned code that matches a stock batch increments that batch's physical count and the field re-focuses for the next scan; a code that matches nothing reports a product-not-found message and a malformed code reports an invalid-barcode message, neither changing any count; typed entry stays supported; the count is persisted per batch so a reload keeps it.
- **Size:** S
- **Dependency:** existing page extension
- **Priority:** P1

### G3b-04 — Counting-row search, sort and save state
- **Reference pages:** `/stock-audit/view-batches/[stock_audit_id]`
- **Description:** Make a long count grid navigable and show that each count has reached the server.
- **Acceptance criteria:** Rows can be searched by product, location or batch number and sorted by the options the audit filter service returns; the header shows a saving-in-progress then saved state as counts are submitted; each count edit is sent immediately with no separate save step; the search and sort cover counted rows as well as uncounted ones.
- **Size:** S
- **Dependency:** existing page extension
- **Priority:** P2

### G3b-05 — Audit types and expiry-range audit
- **Reference pages:** `/stock-audit`, `/stock-audit/view-batches/[stock_audit_id]`
- **Description:** Let the user choose what kind of audit to run and, for an expiry audit, bound it by an expiry date range.
- **Acceptance criteria:** The audit hub opens a type chooser listing the audit types the backend returns and stores the chosen type; choosing the expiry type opens a date-range dialog whose range is sent with the audit-creation request and stored on the audit record; the expiry range narrows the candidate products and the counting rows; the audit list shows the type of each audit.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3b-06 — Select-SKUs step with filters
- **Reference pages:** `/stock-audit/view-products`
- **Description:** Add a first step that filters candidate stock and multi-selects the SKUs to audit before any counting starts.
- **Acceptance criteria:** A candidate grid lists category, company, form, initials, location, expiry as month/year, MRP, rate, pack, product name and a product search; filters cover company, product form, stock location, product category, initials and an in-stock toggle; selected rows are stored with the audit as stock ids and survive a reload; continuing to counting stays disabled until at least one product is selected.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3b-07 — Audit list columns, date presets and sort
- **Reference pages:** `/stock-audit`
- **Description:** Give the audit hub the reference's progress columns and filter strip.
- **Acceptance criteria:** Each row shows audit number, status, audit type, created and ended timestamps, audited versus to-be-audited SKU counts that switch to adjusted versus audited once the audit is finished, a signed adjusted value and the adjusting user; the filter strip offers a search by audit number, a date range with Today, Yesterday, Last 7 Days, Last 30 Days, This Month and Last Month presets, plus filter and sort pickers; a running audit shows an elapsed-time indicator.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3b-08 — Dashboard stock-value and cash-in-hand cards
- **Reference pages:** `/dashboard/view-dashboard`
- **Description:** Add the two summary cards our dashboard is missing: what the stock is worth and how much cash the shop is holding.
- **Acceptance criteria:** A Stock Value card shows MRP-incl-GST, sale-rate-incl-GST and purchase-rate-incl-GST totals for the selected range; a Net Payment Collection card splits cash in hand by payment mode, charts payment in against payment out and shows the net with a prior-period delta; both cards reload when the shared range changes and show an empty state when there is nothing to report.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P2

### G3b-09 — Dashboard customers card
- **Reference pages:** `/dashboard/view-dashboard`
- **Description:** Show who is buying — new versus repeat customers and the average order value — on the dashboard.
- **Acceptance criteria:** A Customers card shows a new-versus-repeat split, total customers and average order value for the selected range, with a link into the customer list; the card shows an empty state when the range holds no sales.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P2

### G3b-10 — Dashboard due-payments card with reminder actions
- **Reference pages:** `/dashboard/view-dashboard`
- **Description:** Surface outstanding balances on the dashboard and let staff chase or settle them from the card.
- **Acceptance criteria:** A Due Payments card toggles between customer and supplier balances (our counterpart to the reference's distributor filter), shows the total due and a list of parties with balances; clicking a party opens the payment form pre-filled with that party and the amount due; a reminder action sends a settlement message through the existing messaging channel.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P2

### G3b-11 — Delivery confirmation code and AWB capture
- **Reference pages:** `/customer-orders/order-detail`
- **Description:** Require proof of delivery from the customer before an order is closed.
- **Acceptance criteria:** Delivering an order sends a 6-digit code to the customer's mobile and keeps the order undelivered until the code is entered; the entered code must be exactly six digits; the last four digits of the AWB are recorded with the delivery and shown on the order; a wrong customer number offers a resend of the code.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3b-12 — Order detail addresses, bounced handling and status timeline
- **Reference pages:** `/customer-orders/order-detail`
- **Description:** Enrich our order detail with editable addresses, a choice of what to do with a bounced order and a visible status history.
- **Acceptance criteria:** The order detail shows a timeline of accepted, packed, ready and delivered stages with their timestamps; billing and shipping addresses are editable on orders that are not partner orders; a bounced order can be deleted or converted into a new order after a confirmation that names the outcome.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P3

### G3b-13 — Business KYC profile with licence and certificate uploads
- **Reference pages:** `/customer-orders/business-kyc`
- **Description:** Turn the settings store profile into a KYC form collecting the evidence a business needs to transact digitally.
- **Acceptance criteria:** A business-entity selector switches the identifier between PAN, LLPIN and CIN and clears the inapplicable fields; a GSTIN change triggers server validation that back-fills the registered address and the composition-dealer flag, and an invalid value reports "INVALID GSTIN" and blocks saving; Form 20 and Form 21 numbers each accept an image upload with preview and re-upload, as do the storefront image and the GST certificate; a self-declaration switch must be ticked before the profile saves.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3b-14 — In-app stock-audit guidance
- **Reference pages:** `/stock-audit`
- **Description:** Offer guidance for running an audit without depending on a hosted tutorial video.
- **Acceptance criteria:** The audit hub exposes a "How audit works?" entry that opens in-page guidance covering type choice, counting, reasons and approval; the guidance is served from the app so it is available with no network.
- **Size:** S
- **Dependency:** none
- **Priority:** P3

## Slice G3b — deviations to document

- B2B marketplace ordering — distributor-customer mapping, the mapping-request inbox, distributor invites and ZennX account creation assume a hosted network of other pharmacies to trade with; our customer orders run against our own storefront through `/order` and the staff queue.
- MedCart promotion — referral store links, generated QR stickers and app-install, app-order and revenue tiles promote a third-party marketplace we neither host nor integrate; our campaigns channel is used for direct customer messaging instead.
- Distributor-side workflows — the Orderbook cart handoff, distributor integration call and the retailer-versus-distributor business-type branches describe the counterparty side of a B2B exchange, not a single-store pharmacy workflow.
- Hosted banners and partner surfaces — the MedCart banner, the "What is Medcart?" outbound link and the partner-integrations landing page belong to a hosted marketing shell; our `/dashboard/integrations` is a provider registry with no campaign banners.
- Business KYC as a separate step that redirects into partner integrations — our GSTIN, drug-licence and storefront evidence stays inside the settings store profile, with no redirect to a partner area that does not exist for us.
- PMBJAY-only drug-code column and search — we keep no drug-code field per medicine, so the reference's PMBJAY-gated drug code is left out of the audit screens entirely rather than partially implemented.
- Hosted "How Audit Works?" tutorial video on the audit hub — guidance stays as in-app help so it is available with no network.
