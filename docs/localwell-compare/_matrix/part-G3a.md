## Slice G3a — parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/stocks/adjust-stocks` | `/dashboard/inventory` (Stock tab) | Partial | We adjust one batch at a time with a reason code; no spreadsheet template → upload → multi-row units-per-pack/packs/loose-unit edit, no chunked 50-row commit | M |
| `/stocks/bulk-update-settings` | `/dashboard/inventory`, `/dashboard/catalog` | Partial | No upload → column-match → validated/invalid preview → invalid-row export flow for master fields; we only have per-medicine dialogs plus a catalog CSV add with preview/dedupe | L |
| `/stocks/stock-transfer/view-transfers` | — | N/A | Branch-to-branch transfer register with multi-branch filters has no meaning for our single-store local-first deployment | — |
| `/stocks/update-stock-info` | `/dashboard/inventory` | Partial | No per-product master settings (stock location, min/max and online discount, discount-lock, ignore-for-shortage, online-listing, loose-billing, preferred distributor), no bulk-edit modal, no droplist PDF, no create-barcodes shortcut | L |
| `/stocks/upload-stocks` | `/dashboard/purchase-import`, `/dashboard/catalog` | Partial | Our import maps rows to medicines/suppliers and commits a purchase bill; missing fuzzy match scores with alternatives, inline create-medicine during mapping, a batch-level qty/price/HSN/GST entry stage, and a direct-to-stock commit | L |
| `/stocks/view-stocks` | `/dashboard/inventory`, `/dashboard/reports` | Partial | No stock-on-hand summary (SKU count + value), no costed detail panel, no Rx/OTC badge, composition or product images, no possible-duplicates merge, no push-to-cart from a stock row | L |
| `/stocks/stock-picklist` | `/dashboard/orders`, `/dashboard/billing` | Partial | Our order queue has a pack step; missing a two-panel pending/picked workspace with batch barcode scan, adequacy colour coding, fulfilled/remaining arithmetic, picklist print and picklist-to-sale flow | L |
| `/stocks/print-barcode-labels` | `/dashboard/labels` | Partial | Our labels page picks a template and previews per medicine/batch; missing filterable product list with batch expansion, per-batch label-count stepper, scan-to-add/edit barcode, per-store label content toggles, A4/thermal geometry and barcode-vs-QR toggle | L |
| `/stocks/print-barcode-labels/stock-scan-qr` | `/dashboard/billing` (shared barcode camera scanner) | Partial | Camera capture exists as a shared component but nothing stock-facing uses it: no scan-to-add/edit barcode on a stock item, no typed 13-character auto-submit fallback, no dismiss/Escape modal | S |

## Slice G3a — our-side coverage notes

**Our routes that serve these reference pages**

- `/dashboard/inventory` — Stock tab with batch add/edit, adjust-with-reason, expiry buckets, low stock and movement history; medicine create/update/delete dialogs. Serves adjust-stocks, update-stock-info, view-stocks.
- `/dashboard/catalog` — catalogue browse, CSV bulk-add with preview and dedupe, per-row "add to store", product-intelligence alternatives. Serves bulk-update-settings, upload-stocks.
- `/dashboard/purchase-import` — CSV or OCR import, column mapping, per-row medicine/supplier matching, commit to a purchase bill. Serves upload-stocks.
- `/dashboard/labels` — template picker plus server-side label preview/print per medicine and batch. Serves print-barcode-labels.
- `/dashboard/orders` and `/dashboard/billing` — order queue with accept → pack → ready → deliver, and batch availability with batch issue order at billing. Serve stock-picklist.
- `/dashboard/stock-audit` — count sessions, counts against batches by barcode lookup or batch pick, approve/cancel with reasons. Serves the counting intent behind stock-picklist.
- `/dashboard/reports` — Stock (current stock, fast/slow movers, opening-closing, adjustments), Inventory Valuation, GST (HSN, GSTR-1/3B) and Ordering (shortage %) tabs. Serve view-stocks and upload-stocks context.
- `/dashboard/scan` and `/dashboard/purchases` — OCR bill capture and purchase-bill entry. Serve upload-stocks (batch and invoice capture).
- `/dashboard/settings` — store profile, invoice format, expiry policy, price-override policy. Partly serves update-stock-info (the reference's droplist filename and settings scoping are store-level, like ours).

**Our routes with no reference counterpart in this slice**

- `/dashboard/invoices`, `/dashboard/returns`, `/dashboard/payments`, `/dashboard/cash-bank` — sales-side finance registers the reference expresses outside the Stocks area.
- `/dashboard/refills`, `/dashboard/communications`, `/dashboard/campaigns` — patient messaging, offers and refill automation.
- `/dashboard/customers`, `/dashboard/doctors`, `/dashboard/prescriptions`, `/dashboard/suppliers`, `/dashboard/procurement` — party and procurement master data.
- `/dashboard/accounting`, `/dashboard/compliance`, `/dashboard/scheduled-reports`, `/dashboard/devices`, `/dashboard/integrations`, `/dashboard/bulk-bills`, `/dashboard/migration` — back-office, platform and compliance screens.
- `/dashboard` (KPI), `/onboarding`, `/auth`, `/order` (public portal), `*` (404) — entry, setup and public surfaces.

**Where our route already exceeds the reference**

- `/dashboard/inventory` — movement history with pagination, a low-stock list and supplier enrichment on the stock table; the reference stock list has no movement or low-stock view.
- `/dashboard/purchase-import` — in-browser OCR of a supplier bill image alongside CSV, persisted import sessions with original re-download, and preview figures on commit; the reference spreadsheet flows are file-only with no OCR path.
- `/dashboard/stock-audit` — countable audit sessions with approve/cancel reasons and an admin/pharmacist approval gate; the reference expresses counting only as a picklist screen with no session lifecycle.
- `/dashboard/reports` — nine-tab analytics including GSTR-1/3B, HSN, ITC, party ledgers and RFM; the reference slice has no reporting suite.
- `/dashboard/billing` — camera barcode lookup, batch availability with issue-order selection, offer and loyalty evaluation, and a below-MRP margin warning; the reference "Order Now" is a plain cart push.
- `/dashboard/labels` — server-rendered template preview and print; the reference draws its label layout client-side.
- `/dashboard/settings` — per-store price-override policy roles and expiry policy config; the reference keeps discount control per product and offers no central policy.

## Slice G3a — backlog

### G3a-01 — Spreadsheet bulk quantity correction
- **Reference pages:** `/stocks/adjust-stocks`
- **Description:** Let a user correct on-hand packs and units for many existing batches at once from a filled spreadsheet instead of editing each batch in the inventory stock tab.
- **Acceptance criteria:** Inventory Stock tab offers "Adjust via spreadsheet" with a template download carrying product, company, batch, expiry, MRP and current on-hand figures; upload accepts `.xlsx` only, rejects other types with "File must be of type Excel" and refuses files above 10 MB; parsed rows show in an editable grid where only units-per-pack, packs and loose units are writable; rows can be deleted before commit; "Continue" persists in chunks of 50 with an "Updating N of M" counter; every changed row writes an inventory adjustment with the reason codes already used by `inventoryApi.adjust`; no new medicines are created by this flow.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P2

### G3a-02 — Spreadsheet bulk product-master editor
- **Reference pages:** `/stocks/bulk-update-settings`
- **Description:** A three-step wizard (upload template → choose columns → preview) for editing master fields on many products in one pass, with a workbook of the failing rows handed back.
- **Acceptance criteria:** The bulk-edit entry point downloads a spreadsheet skeleton and accepts a filled `.xlsx`, validated in the browser before parsing; the column-match table lists each sheet column with its header, first and last data row, affected row count and a "To Be Updated or Not?" switch, with identifier and product-name columns not editable; preview splits rows into a VALIDATED DATA and an INVALID DATA section with per-row changed values highlighted; server-side validation enforces mandatory product name, blank cells leaving existing values untouched, company/composition/form/category matching existing masters, barcode unique per product, a location length limit and a loose-billing flag accepting only Yes/No or TRUE/FALSE; "Download all invalid rows" exports the failing rows as a separate workbook and invalid rows are never written.
- **Size:** L
- **Dependency:** existing page extension
- **Priority:** P2

### G3a-03 — Per-product stock settings and flags
- **Reference pages:** `/stocks/update-stock-info`
- **Description:** Give each stocked product a settings record covering location, discount bands, listing flags and a preferred supplier, editable from the inventory screen.
- **Acceptance criteria:** The medicine/stock settings form exposes product category, product form, company, stock location, minimum sale discount, maximum sale discount, online discount, a lock-product-discount switch, an ignore-for-shortage switch, an online-store-listing switch, an enable-loose-billing switch and a preferred supplier drawn from our existing supplier master; the form flags "Max Sale Discount < Min Sale Discount" when the maximum sits below the minimum; saving sends only the fields actually changed together with the affected stock ids; values persist on the record and are returned by the stock read endpoints; the ignore-for-shortage flag feeds the `/dashboard/reports` Ordering (shortage) tab.
- **Size:** L
- **Dependency:** backend data model
- **Priority:** P2

### G3a-04 — Stock-on-hand summary and costed product detail panel
- **Reference pages:** `/stocks/view-stocks`
- **Description:** Add the reference's stock summary strip and a detail panel that exposes costing, prescription type and composition for the selected stock item.
- **Acceptance criteria:** The stock tab shows a "Stock on hand" summary with SKU count and total stock value; clicking a stock row opens a detail panel showing pack size, expiry as MM/YY in red once expired, stock location and MRP; purchase rate, net rate, sale rate and margin render for admin and pharmacist only, while a cashier sees pack, expiry, location and MRP alone, and the server withholds cost fields for unprivileged roles as well; the panel shows an OTC/Rx badge, composition text and product images where recorded.
- **Size:** L
- **Dependency:** existing page extension
- **Priority:** P2

### G3a-05 — Possible-duplicate detection and merge
- **Reference pages:** `/stocks/view-stocks`
- **Description:** Detect near-duplicate stock entries for a product and let an authorised user consolidate them from the stock screen.
- **Acceptance criteria:** The stock detail panel lists possible duplicates with a verified badge; entries are multi-selectable and clicking a card toggles selection without disturbing list scrolling; merging with no selection shows "Please select atleast one duplicate"; a successful merge reports "Stocks merged" and the merged rows disappear from the panel; merge is restricted to admin and pharmacist, enforced on the server.
- **Size:** M
- **Dependency:** backend data model
- **Priority:** P2

### G3a-06 — Stock sheet import with fuzzy product matching and a batch-entry stage
- **Reference pages:** `/stocks/upload-stocks`
- **Description:** Import a supplier stock sheet in two stages — map every line to a product, then enter batch quantities, prices and expiry — committing straight to stock.
- **Acceptance criteria:** The import session accepts a stock sheet and opens a mapping stage listing line number, source product name, pack, suggested match with a match percentage, units per pack, company, verified badge and stock location; a line can be remapped from alternative suggestions, searched manually, or created as a new medicine inline; mapping pages 50 lines at a time with a "Loading X of Y page(s)" indicator and a "Save & Load Next" that persists confirmed mappings; the second stage captures batch, expiry as MM/YY, packs, units, MRP, rate, sale rate, HSN and GST percent, with expired rows flagged red and rows expiring within roughly six months flagged near-expiry; rows can be deleted before commit; "Add to Stock" writes batches one at a time with a "Saving N of M items" counter and names the failing row number on error; "Cancel Mapping" abandons the upload without touching stock.
- **Size:** L
- **Dependency:** existing page extension
- **Priority:** P2

### G3a-07 — Batch picklist workspace for order fulfilment
- **Reference pages:** `/stocks/stock-picklist`
- **Description:** A new `/dashboard/picklist` screen with two panels — stock still to be picked grouped by location, and what has been picked — driven by batch barcode scans and per-medicine fulfilled/remaining quantities.
- **Acceptance criteria:** The left panel groups pending stock by location with ADEQUATE, PARTIAL and BATCHES NOT IN PICKLIST colouring; the right panel lists picked rows with product, company, batch no, pack, packs and units, expiry as MM/YY and MRP, plus a remove action; a scan field accepts 10- and 13-digit batch barcodes after roughly 400 ms of debounce and rejects 11-12 digit and over-13-digit codes, and a valid scan adds that batch to the picked panel under its location; removing a picked row immediately recomputes that medicine's adequate/partial state; required quantity derives from available packs and picked quantities are consumed batch by batch into fulfilled and remaining quantities; a picklist can be started from a customer order, quotation, sale or stock transfer; the half-finished picklist survives navigation and reload.
- **Size:** L
- **Dependency:** new page
- **Priority:** P1

### G3a-08 — Picklist print preview and PDF download
- **Reference pages:** `/stocks/stock-picklist`
- **Description:** Render the picked list for the printer and for paper, without depending on a browser extension.
- **Acceptance criteria:** The preview renders a thermal 80 mm template and an A5 HTML sheet for the chosen order; printer type (laser/inkjet vs thermal), page size (A5 vs 80 mm) and orientation can be switched and re-render the preview; zoom in/out and fit-to-content work on the preview; a PDF download produces the same picklist as a file; printing uses the browser print dialog only; Ctrl+P prints, F4 downloads the PDF and Escape closes the preview; marking the picklist printed updates the source order.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P1

### G3a-09 — Barcode and QR label printing with batch counts, layout control and barcode editing
- **Reference pages:** `/stocks/print-barcode-labels`
- **Description:** Upgrade label printing from a template preview into a filterable stock list with per-batch label counts, configurable page geometry, thermal output and inline barcode editing.
- **Acceptance criteria:** The label screen lists stock products with filters for category, company, product form, initials, location and free text plus a Stock In / Stock Out direction, and each row expands to its batches; every batch carries a label-count stepper bounded by the packs actually in stock, rejecting negative counts and warning that only N labels are available; rows without a barcode offer "Scan to Add" and rows with one offer "Scan to Edit", and a scan can be persisted onto the stock item with a "Barcode Added" confirmation; label content toggles (product name, MRP, sale rate, expiry date, store name, batch no, location, distributor, invoice date) persist as per-store settings; A4 layout exposes labels per sheet, labels per row, label width and height in mm and left-right/top-bottom gaps in mm, while thermal mode fixes a 35 x 15 mm label and emits ZPL for Zebra printers; the preview toggles between CODE128C item and batch barcodes and a QR layout carrying store name, medicine name, MRP, location and barcode, with zoom in/out and Save-as-default / Reset.
- **Size:** L
- **Dependency:** existing page extension
- **Priority:** P2

### G3a-10 — Camera-based stock counting
- **Reference pages:** `/stocks/stock-picklist`, `/stocks/print-barcode-labels/stock-scan-qr`
- **Description:** Count stock with the device camera or a hardware scanner during a stock audit, instead of typing every code by hand.
- **Acceptance criteria:** The existing barcode camera scanner component is mounted in the stock-audit count entry and a captured code looks up the medicine and prefills the count row; typed input stays supported and auto-submits at 13 characters, with the field re-focused so scanner keystrokes always land in it; the capture modal offers Dismiss and closes on Escape, returning the value to the calling screen; the audit session, approve-with-reason and cancel-with-reason flow are unchanged when scanning is used; a count row can still be edited or replaced by the existing batch picker.
- **Size:** S
- **Dependency:** existing page extension
- **Priority:** P1

### G3a-11 — Stock droplist PDF and barcode creation from a purchase
- **Reference pages:** `/stocks/update-stock-info`
- **Description:** Provide the reference's two stock-level output shortcuts: a stock droplist document and barcode generation for a purchase.
- **Acceptance criteria:** A "Stock Droplist" action downloads a PDF listing stocked products with its own search box and a filename that identifies the store; a "Create Barcodes" action opens barcode generation for a chosen purchase and produces printable codes for its batches; both are reachable from the stock screen header.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P3

### G3a-12 — Stock list filter, sort and paging
- **Reference pages:** `/stocks/view-stocks`
- **Description:** Give the stock list the same narrowing controls the reference offers, rather than a search box alone.
- **Acceptance criteria:** The stock table exposes a combined search, filter and sort strip with a Reset action that clears search text, active filters and sort in one step; filters cover category, company, location, expiry state and stock direction; sorting is available on product name, expiry and stock quantity; the list pages 20 rows at a time with a "Load More" continuation.
- **Size:** M
- **Dependency:** existing page extension
- **Priority:** P2

## Slice G3a — deviations to document

- Branch-to-branch transfer register, branch filters and branch-scoped stock — our deployment is a single store, so there is no second branch to transfer to.
- Retailer-vs-distributor dual business type, including the price-to-retailer column and the retailer-only sale-scheme quantities — one store, one pricing model.
- Announcement-service dialog with once-per-browser-profile memory — no remote announcement feed to poll in a local-first app.
- Hosted "Watch Tutorial" video embed in the stock header — guidance stays as in-page text rather than an embedded video panel.
- Browser-extension print-manager client for thermal output — we print through the browser dialog and server-rendered preview/PDF only.
- "Order Now" push into the reference's shared order cart — our equivalent is the public `/order` portal plus the staff order queue, not a cart handoff from a stock row.
- Reference stock settings loaded per purchase id rather than per stock id — our records are keyed per medicine/batch, so we do not inherit the purchase-scoped settings model.
