## Stocks

<a id="stocks-adjust-stocks"></a>

### `/stocks/adjust-stocks`

- **Chunk of origin:** `static__chunks__pages__stocks__adjust-stocks-3b359e184710e2e8.js`
- **What the user can do:**
  - Three-step Excel-driven flow for adjusting quantities on stock that already exists: grab a template, upload it, review the parsed rows.
  - Header title "Adjust Existing Stock" with a helper line "Adjust Stock CSV".
  - Download affordance "Click to Download" pulls a stock spreadsheet template; "Browse to Upload" accepts a local spreadsheet file.
  - Only `.xlsx` workbooks are accepted; any other type is rejected with "File must be of type Excel".
  - Review grid shows product name, company, batch, expiry and MRP alongside the previous on-hand figures (old units per pack, old number of packs, old loose units).
  - The same grid lets you type replacement figures: units per pack, number of packs and loose units.
  - Each row has an inline action cell with edit, save and delete icons; switching a row to edit mode enables only the new-quantity cells.
  - Rows can be removed before the update is committed.
  - Saving is done in groups of fifty rows so a large workbook does not block, with an "Updating N of M" progress indicator.
  - On completion a "Stock Updated Successfully" notice appears and the screen navigates to the stock list.
- **Interactions:**
  - Download template, then upload the filled workbook from the same page.
  - Put a row into edit mode, correct the pack/unit counts, save the row, then continue.
  - Press "Continue" to persist the whole workbook; "Cancel Import" abandons the import and leaves the previous stock untouched.
  - Success redirects to /stocks/view-stocks.
- **Notable entities & workflows:**
  - product name, company, batch, expiry date, MRP, units per pack, number of packs, loose units, stock update chunk
- **Backend operations:** `reports_get_stock_value_summary, stocks_parse_excel_for_bulk_update, stocks_update_batch`
- **Notes:**
  - The chunk calls the backend through a shared RPC helper rather than literal `/api/` URLs, so endpoint names below are the RPC operation names.
  - Batch size of fifty is a hard-coded client-side chunking constant.
  - This screen writes quantity corrections only; no new products are created here.

<a id="stocks-bulk-update-settings"></a>

### `/stocks/bulk-update-settings`

- **Chunk of origin:** `static__chunks__pages__stocks__bulk-update-settings-251da08e792a2cb7.js`
- **What the user can do:**
  - Bulk editor for product master settings, presented as a three-stage stepper: UPLOAD TEMPLATE, MATCH COLUMNS, PREVIEW DATA.
  - "Download Template" supplies a spreadsheet skeleton; "Upload Template" accepts a filled file.
  - Uploaded file is read in the browser and validated before parsing; a non-spreadsheet file yields "Please upload a valid .xlsx file.".
  - Oversized files are refused with "File size exceeds the 10 MB limit. Please upload a smaller file.".
  - Column-matching table lists each spreadsheet column with its header, the first and last data row, the number of rows affected, and a per-column "To Be Updated or Not?" switch.
  - Only columns that may be changed are offered; identifier and product-name columns are deliberately excluded from editing.
  - Column selection maps a spreadsheet column onto a database field; the replacement value for a changed cell is looked up under a per-column "new value" key.
  - Preview splits the sheet into a "VALIDATED DATA" section and an "INVALID DATA (Action Required Here)" section, showing valid-row count and per-row changed values.
  - Invalid or unmatched rows are highlighted and can be exported with "Download all invalid rows" as a separate workbook.
  - Validation rules include: product name is mandatory; blank cells leave existing values untouched; company, composition, product form and product category must match existing masters; barcode must be unique per product; product location has a character limit; the loose-billing flag accepts only Yes/No or TRUE/FALSE.
- **Interactions:**
  - Download, fill, re-upload, then walk the stepper forward with "Continue" and "Back".
  - Toggle individual columns in or out of the update set before previewing.
  - Correct invalid rows in the preview and re-upload the corrected sheet.
  - "Download all invalid rows" hands back a workbook that isolates the problems for fixing.
- **Notable entities & workflows:**
  - spreadsheet column header, first data row, last data row, rows to be updated, stock id, medicine name, product company, composition, product form, product category, barcode, product location, loose billing flag, new-value mapping key
- **Backend operations:** `stocks_download_invalid_rows, stocks_download_stocks_for_bulk_update, stocks_process_bulk_update_stocks`
- **Notes:**
  - Validation is enforced server-side; the client only reflects the returned valid/invalid split.
  - Accepted upload extensions are broader than the error message suggests, but the message only ever names `.xlsx`.
  - Preview is read-only; edits are made in the spreadsheet, not in the browser grid.

<a id="stocks-stock-transfer-view-transfers"></a>

### `/stocks/stock-transfer/view-transfers`

- **Chunk of origin:** `static__chunks__pages__stocks__stock-transfer__view-transfers-f05245693046c254.js`
- **What the user can do:**
  - Branch-to-branch transfer register with top-level tabs for SENT, RECEIVED, PURCHASE RETURN and RETURN RECEIVED, plus a separate RETURN LIST view of purchase-return requests.
  - Header title "View Branch Transfers".
  - A collapsible "Search | Filter | Sort" strip exposes a transfer-number search box ("Search By Transfer No"), a multi-branch selector ("Filter By Branch") and a date-range picker captioned "SELECT DATE RANGE".
  - Branch picking opens a modal titled "Select a Branch" with multi-select behaviour and an "Apply (F2)" keyboard action.
  - Branch options are sourced from a business-mapping lookup limited to stock-transfer branches; expense categories are also loaded to populate filter chips.
  - "Reset Filter" clears search text, branch selection and sort state in one action.
  - Transfer grid columns: TRANSFER NO, REQUESTED ON, STATUS, LAST CHANGE, TRANSFERRED BY/TO with GSTIN, SKU COUNT, AMOUNT / GST, TOTAL AMT and ADDED BY.
  - Status is a coloured chip (pending amber, rejected red, accepted green) and carries its own column filter for pending, accepted and rejected.
  - The AMOUNT / GST column shows the transfer value plus whether GST is included or excluded, and is itself filterable.
  - Return-list grid starts with RETURN INVOICE NO, REQUESTED ON and STATUS and continues into branch name/address, business name, drug licence, nature of business, return-received marker, payable/receivable amount and mobile number.
  - Opening a transfer clears leftover local selection markers from purchase, sale and stock-return contexts so the wrong order is not picked up.
- **Interactions:**
  - Switch tabs to move between sent, received, purchase-return and return-list views.
  - Search by transfer reference, multi-select branches, pick a date range, then filter or sort on any column.
  - Reset all filters from the same strip.
  - Open a transfer row to inspect the order, after which the stale context keys are cleared.
- **Notable entities & workflows:**
  - transfer reference number, transfer date, transfer status, last status change, business name, business GSTIN, SKU count, transfer amount, with/without GST, added-by user, return invoice number, branch name and address, drug licence, nature of business, payable/receivable amount, mobile number, expense category
- **Backend operations:** `customers_search_customers, expenses_get_expense_categories, get_mapping_business_for_migration, get_stock_return_transfers, stock_transfer_get_stock_transfers`
- **Notes:**
  - The customer-search endpoint is wired into this screen even though transfers are branch-based; it drives the searchable picker used for the branch modal.
  - Branch lookups are capped at twenty-five candidates per request.
  - Column-level filters are multi-select and are applied on top of the top-strip filters.

<a id="stocks-update-stock-info"></a>

### `/stocks/update-stock-info`

- **Chunk of origin:** `static__chunks__pages__stocks__update-stock-info-8ff2e99855275c11.js`
- **What the user can do:**
  - Per-product configuration screen, titled "Update Stock Info" with the subtitle "View or Modify the Settings for Stock Products".
  - A single search field matches on product name, company or rack ("Search by Name or Company or Rack").
  - Each product exposes a settings form: product category, product form, company, stock location, minimum sale discount, maximum sale discount, online discount, a lock-product-discount switch, an ignore-for-shortage-calculation switch, an online-store listing switch, an "Enable Loose Billing" switch and a preferred distributor.
  - Maximum discount below minimum discount is flagged in the form with "Max Sale Discount < Min Sale Discount".
  - Retailer-type businesses additionally see sale scheme quantity, scheme free quantity, a computed sale-scheme percentage and a sale quantity.
  - Saving sends a set of per-field update flags (location, min/max discount, sale scheme, loose billing, shortage calculation, discount lock, online listing, online discount, product form, preferred distributor) together with the affected stock ids.
  - Header shortcuts: "Bulk Update (F2)" opens an in-page bulk-edit modal, "Update via Excel (F4)" routes to the bulk-update spreadsheet screen, "Stock Droplist (F6)" downloads a PDF named from the business and its id, and "Create Barcodes (F10)" opens barcode generation for the purchase.
  - Additional header actions cover printing, saving as PDF, a report view and a "Watch Tutorial" video embed.
  - The Stock Droplist modal lists products with its own search box.
  - Product categories used by the category picker are loaded separately from the settings themselves.
- **Interactions:**
  - Search for a product, adjust its settings, and save; the save carries only the fields that were actually changed.
  - Open "Bulk Update (F2)" to edit several products from one screen, or jump to the spreadsheet workflow for larger changes.
  - Download the droplist PDF or generate barcodes from the header actions.
  - The tutorial embed opens a video panel for guidance.
- **Notable entities & workflows:**
  - product category id and name, medicine form id and name, company id, stock location, minimum sale discount, maximum sale discount, online discount, discount lock flag, ignore-for-shortage flag, online listing flag, loose billing flag, preferred distributor id, sale scheme quantity, scheme free quantity, sale quantity, stock ids, purchase id, barcode print id
- **Backend operations:** `settings_get_stock_settings, settings_update_stock_settings, stock_get_stock_droplist, stocks_get_stock_categories`
- **Notes:**
  - Both retailer and distributor business types share one form; the extra scheme fields are rendered only for retailer type.
  - The droplist PDF filename embeds the business name and business id.
  - Settings are loaded per purchase id rather than per stock id.

<a id="stocks-upload-stocks"></a>

### `/stocks/upload-stocks`

- **Chunk of origin:** `static__chunks__pages__stocks__upload-stocks-d266bf6eea360301.js`
- **What the user can do:**
  - Bulk stock loader, titled "Upload Stock CSV" with the description "Bulk Upload Stock Using CSV file".
  - Two stages: first map each CSV product line to a real product, then enter batch-level stock data.
  - Mapping table columns: line number, "Product name from csv file", pack, "suggested Product mapping" and "alternative suggestions for mapping".
  - Each suggestion shows a composite match percentage, units per pack, company name, a verified badge and a stock-location tooltip.
  - A line can be remapped by picking an alternative suggestion, searching for the medicine by hand, or using "Create New Medicine" which opens a product-creation modal.
  - Mapping results page through the file fifty lines at a time, with a "Loading X of Y page(s)" indicator and a header showing the current slice of the upload ("Upload Stock (start-end Out of total)").
  - "Save & Load Next" persists the confirmed mappings and pulls the next slice of unmatched lines.
  - Batch stage columns: line number, product name, HSN, batch, expiry, pack, box, quantity in packs, quantity in units, MRP, rate, sale rate, P-T-R, GST percent, distributor name, invoice number and invoice date.
  - Pack/box and unit columns vary by business type: retailers see box and unit columns, distributors see the price-to-retailer column instead of sale rate.
  - The price-to-retailer cell opens a calculator modal that derives the retailer price from MRP, purchase rate, GST rate and the chosen medicine.
  - Editing a batch row exposes expiry, pack, box, pack quantity, unit quantity, MRP, rate, sale rate, retailer price and GST inputs, each with an inline save icon.
  - Expiry cells show month/year; rows past expiry are flagged red and rows expiring within roughly six months are flagged as near-expiry.
  - Rows can be deleted before committing.
  - "Add to Stock" writes the batches one at a time with duplicate batches allowed and the bulk-upload flag set, reporting "Saving N of M items" and naming the failing row number on error.
  - "Cancel Mapping" discards the mapping work and returns to the previous screen.
  - HSN and GST rates come from a separate tax master lookup; previously unmapped lines are reloaded from the unmapped-stock store.
- **Interactions:**
  - Upload a CSV, review the auto-suggested product matches, correct wrong ones, then "Save & Load Next" until the file is mapped.
  - Fill or correct batch quantities, prices, expiry and invoice details in the second stage.
  - Press "Add to Stock" to commit the batches to stock.
  - Cancel at any point to abandon the upload without touching stock.
- **Notable entities & workflows:**
  - CSV medicine name, pack size, fuzzy match score, verified flag, stock location, migration id, failure migration id, migration stock id, medicine id, HSN code, batch number, batch expiry date, primary pack, secondary pack, number of packs, loose units, MRP, net purchase rate, sale rate, price to retailer, GST rate, distributor name, purchase invoice number, purchase invoice date
- **Backend operations:** `load_unmapped_stocks, medicine_get_hsn_gst_rates, medicines_show_fuzzy_mappings, stocks_add_new_batch, sync_pending_to_map_stocks`
- **Notes:**
  - Setting MRP also overwrites the sale rate in the same edit.
  - Duplicate batches are deliberately permitted for bulk uploads, unlike the adjust-stock screen.
  - Purchase invoice dates are entered in day/month/year format while batch expiry uses month/year.

<a id="stocks-view-stocks"></a>

### `/stocks/view-stocks`

- **Chunk of origin:** `static__chunks__pages__stocks__view-stocks-d686359abbb40817.js`
- **What the user can do:**
  - Main stock screen titled "View Stocks", with a left-hand summary panel headed "Stock on hand" showing the SKU count and the total stock value in rupees.
  - The value and count are fetched from a dashboard stock-value summary.
  - A collapsible "Search | Filter | Sort" strip provides generic filters, search filters and sort options, all loaded from a shared filter-configuration service, plus "Reset Filter".
  - The product list loads twenty rows per page with a "Load More" continuation, driven by page number, free text, active search filter, stock filters and sort filter.
  - Selecting a product opens a detail panel showing pack size, expiry in month/year (red once expired), stock location and MRP.
  - Costing fields â€” purchase rate, net rate, sale rate, price to retailer and margin â€” are only shown when the viewer holds the stock-margin permission; sale rate is shown for retailers and price to retailer for distributors.
  - The detail panel carries OTC/Rx prescription badges, composition text with an "Add Composition" shortcut, front and back product images, and an "Add Company" shortcut.
  - A "Possible Duplicates" panel lists near-duplicate products with verified badges; entries can be multi-selected with a click and then merged.
  - Merging requires at least one selection, otherwise "Please select atleast one duplicate" is shown; a successful merge reports "Stocks merged".
  - Duplicate listing and merging are themselves permission-gated (merge-duplicate permission).
  - Header actions on the detail panel: "Order Now (F2)" pushes the product to the order cart with prices and quantities auto-filled and confirms "Added to Cart"; "Settings (F4)" opens a per-stock settings modal; "+ Add New Item" starts a new item.
  - The per-stock settings modal saves through the shared stock-settings endpoint using a single stock id or a list of stock ids.
  - An announcement dialog can be shown, pulling its content from an announcement service and reporting the user's chosen action back; it is shown only once and that fact is remembered locally, and failure to load the announcement is silently ignored.
- **Interactions:**
  - Search, filter and sort the list, then scroll to load further pages.
  - Click a product to inspect its stock detail, then order it, change its settings or merge duplicates.
  - Select duplicate cards and press "Merge" to consolidate them.
  - Dismiss or act on the announcement dialog when it appears.
- **Notable entities & workflows:**
  - SKU count, total stock value, purchase amount, stock id, pack size, expiry date, stock location, MRP, purchase rate, net rate, sale rate, price to retailer, margin, prescription type, composition name, medicine details, duplicate medicines, merge target id, announcement id, announcement action
- **Backend operations:** `dashboard_get_stock_value, get_announcement_modal_data, get_stock_filters, medicine_get_medicine_details, orderbook_sync_cart, settings_update_stock_settings, stock_get_duplicate_stocks, stock_merge_duplicate_stocks, stocks_get_stocks, sync_announcement_action`
- **Notes:**
  - Costing data is permission-sensitive; without the margin permission the detail panel shows only pack, expiry, location and MRP.
  - The announcement dialog is explicitly failure-tolerant and is shown at most once per browser profile.
  - Duplicate cards are selected by a click-versus-drag gesture so page scrolling does not accidentally change the selection.

<a id="stocks-stock-picklist"></a>

### `/stocks/stock-picklist`

- **Chunk of origin:** `static__chunks__pages__stocks__stock-picklist-a71fbeea3d6e8add.js`
- **What the user can do:**
  - Two-panel picking workspace: the left panel lists stock still to be picked (accordion grouped by LOCATION) and the right panel lists what has been picked, each group also keyed by stock location.
  - Availability colour coding in the left panel with three legend states â€” ADEQUATE (green), PARTIAL (orange) and BATCHES NOT IN PICKLIST (blue).
  - Picked-row columns: PRODUCT (medicine name plus company), BATCH NO, PACK, PACKS (packs :: units), EXPIRY shown as MM/YY, MRP RATE and a per-row remove action.
  - Barcode picking: keystrokes are captured in a scan field, digits are debounced for ~400 ms and a lookup is triggered from 10 digits upwards; 10- and 13-digit batch barcodes are accepted while 11-12 digit and over-13-digit codes are rejected as invalid.
  - Live scanner relay: a websocket session registers the client under a device/business derived key and delivers scanned barcode payloads into the picking screen; buffered client data can be cleared on the server.
  - Batch resolution on scan: the matching batch is located inside the pending list (exact batch match flag), its pack counter is incremented in the picked list, and the row is grouped under its stock location with a "No Stock Location" fallback.
  - Quantity arithmetic per medicine: required quantity is derived from available packs, and picked quantities are consumed batch by batch to produce fulfilled quantity, remaining quantity and per-row adequate/partial flags.
  - Picklist print preview is rendered server-side for the chosen device: a thermal 80 mm template plus a thermal print string, or an A5 HTML sheet for laser/inkjet output.
  - Print options: printer type (Laser or Inkjet vs Thermal), page size (A5 vs 80 mm), page orientation, zoom in/out, fit-to-content, and PDF download of the rendered picklist.
  - Laser/A4 output uses the browser print dialog; thermal output is sent through the JS Print Manager client, with a download page offered when that local print manager is not installed or is blocked.
  - Keyboard control: arrow keys move between the picking screen and the preview, Ctrl+P prints the picklist, F4 downloads the PDF and Escape closes the preview.
  - Picklist lifecycle: loading a pending order, marking the picklist as printed and syncing it to the sale, deleting the picklist (returning to the originating customer order), and a header that flips from "Pending to Pick" to "Picklist Ready" once printed.
  - Sale creation from a picklist: the picked data pre-fills customer, order, patient, doctor, payment and discount context, with the customer defaulting to "Cash or Counter Sale" when unknown; customer orders, quotations, sales and stock transfers are all supported, and the flow continues into the sale entry screen.
  - Persistent picklist state is kept in the shared store so a half-finished picklist survives navigation and page reloads.
- **Interactions:**
  - Scan or type a batch barcode to pull that batch into the picked list; the scan field clears itself after ~10 s of inactivity.
  - Remove a picked row from the picked list, which immediately re-runs the adequate/partial recomputation for that medicine.
  - Pick an order (customer order, quotation, sale or stock transfer) to load its picklist for picking.
  - Open the print preview, switch printer type and page size to re-render it, and use zoom / fit-to-content on the preview.
  - Print now, download the picklist as PDF, or close the preview with Escape.
- **Notable entities & workflows:**
  - medicine_id, medicine_name, medicine_company_name, batch_id, batch_no, batch_expiry_date, batch_mrp, stock_location, location, qty_packs, qty_units, required_qty, fulfilled_qty, remaining_qty, is_partial, is_adequate, exact_match, customer_order_id, customer_order_no, order_no, customer_id, customer_name, sale_invoice_no, purchase_invoice_no, quotation_no, invoice_date, is_home_delivery, is_picklist_printed, product_list_available, sale_detail, printer, page_size, stock_transfer_id, sale_transaction_item_discount
- **Backend operations:** `stocks_sync_picklist, generate_new_sale_details, medicine_search_medicines, get_picklist_html, convert_to_pdf, clear_redis_data`
- **Notes:**
  - No literal "/api/" strings appear in the bundle: the page dispatches named route keys through a shared networking service, and the keys listed above are the endpoints it calls.
  - Scanning also rides on a socket.io channel (register_client / barcode_data events) for hardware scanners, which is not an HTTP endpoint.
  - The chunk is a webpack bundle of unusual size: most of its bulk is embedded base64 asset data rather than application logic.

<a id="stocks-print-barcode-labels"></a>

### `/stocks/print-barcode-labels`

- **Chunk of origin:** `static__chunks__pages__stocks__print-barcode-labels-82a5118d99d4e9e8.js`
- **What the user can do:**
  - Screen for producing barcode and QR labels for items held in stock, with a searchable, filterable product list where each product row expands into its batches.
  - Filters by category, company, product form, initials (alphabet), stock location and free text, plus a stock direction choice of Stock In or Stock Out; filter lists are loaded from the stock audit filter service and cached per business.
  - Product-list columns: CATEGORY, COMPANY, PRODUCT FORM, PRODUCT description, STOCK, MRP, SALE RATE, EXPIRY, BATCH, PURC DATE, ITEM BARCODE, BATCH BARCODE, STOCK QTY (packs) and LABELS TO PRINT.
  - Per-batch rows add BATCH NO and EXPIRY with a checkbox that includes the batch in the print run.
  - Label-count editor per batch: a numeric stepper bounded by the packs actually in stock, warning that only N labels are available for that batch and rejecting negative counts.
  - Inline barcode handling: rows without a barcode offer "Scan to Add", rows with one offer "Scan to Edit", and scanning can also persist a new barcode onto the stock item, confirmed by a "Barcode Added" notice.
  - Label content toggles stored as business settings: product name, MRP, sale rate, expiry date, store name, batch no, location, distributor and invoice date.
  - A4 sheet layout options: labels per A4 sheet preset, labels per row, label width and height in millimetres, plus left-right and top-bottom gaps in millimetres; width and height are recomputed from the A4 page dimensions and the chosen preset.
  - Thermal layout options: a dedicated thermal mode with fixed label size (35 x 15 mm), label gap, reverse direction and a Zebra printer toggle; thermal labels are emitted as ZPL commands (CODE128C barcode plus positioned text lines).
  - Preview modal with a barcode / QR code toggle, zoom in and out, and a settings panel offering "Save as default" and "Reset" to the shipped defaults.
  - Two label styles are drawn: CODE128C item and batch barcodes, and a QR-code label carrying store name, medicine name, MRP, location and barcode.
  - Printing: A4 output uses the browser print dialog, while thermal output is sent through the JS Print Manager client; a helper download page is offered when the print manager is missing, and a blocked print manager raises a warning toast.
  - Settings are persisted per business and stored separately for the barcode screen versus other stock screens.
  - Shortcuts: F2 applies the filter, opens the preview or triggers printing, Enter expands and collapses rows, arrow keys move between rows and batches, Escape closes dialogs.
- **Interactions:**
  - Type a search term or open a filter, pick values, then apply to reload the product list.
  - Expand a product to reveal its batches, tick the batches to print and set the label count for each one.
  - Scan a barcode to add or edit an item barcode; the scan submits automatically at 13 characters.
  - Open the preview, switch between barcode and QR layout, adjust settings and zoom, then print or save settings as default.
- **Notable entities & workflows:**
  - business_stock_category_id, category_name, medicine_company_id, medicine_company_name, medicine_form, medicine_form_id, stock_categories, stock_locations, stock_type, stock_id, stock_ids, batch_id, batch_no, batch_expiry_date, batch_barcode, batch_mrp, batch_sale_rate, barcode, qty_packs, medicine_name, business_name, distributor_name, purchase_invoice_no, purchase_invoice_date, print_barcode_purchase_id, label_product_name, label_mrp, label_sale_rate, label_expiry_date, label_store_name, label_batch_no, label_location, label_distributor, label_invoice_date, labels_count_row, label_width, label_height, left_right_page_padding, top_bottom_page_padding, labels_to_be_left_blank, labels, is_checked, is_disabled
- **Backend operations:** `business_get_barcode_settings, business_update_barcode_settings, settings_update_stock_settings, stock_audit_get_filters, stocks_get_stock_detail_for_barcodes`
- **Notes:**
  - No literal "/api/" strings appear in the bundle: the page dispatches named route keys through a shared networking service, and the keys listed above are the endpoints it calls.
  - The barcode scanning modal itself lives in a separate chunk (see /stocks/print-barcode-labels/stock-scan-qr).
  - Thermal output is ZPL for Zebra-style label printers; A4 output is plain browser printing.

<a id="stocks-print-barcode-labels-stock-scan-qr"></a>

### `/stocks/print-barcode-labels/stock-scan-qr`

- **Chunk of origin:** `static__chunks__pages__stocks__print-barcode-labels__stock-scan-qr-255443d045128e02.js`
- **What the user can do:**
  - Small modal used by the barcode-label screen to capture a barcode from a handheld scanner or from typed input.
  - The input is focused when the modal opens and re-focused every two seconds so scanner keystrokes always land in the field.
  - The modal header reads "Scan Barcode" and offers a Dismiss action that closes it.
  - The body shows an animated scanning illustration alongside the input, whose placeholder reads "Scan or type barcode".
  - Capture completes on its own once 13 characters have been entered, and the value is handed back to the parent screen.
  - Escape closes the modal.
- **Interactions:**
  - Scanning or typing fills the field; the value is submitted automatically at 13 characters.
  - The Dismiss button or the Escape key closes the modal.
- **Notable entities & workflows:**
  - scanned barcode value, scan_qr input field
- **Backend operations:** `(none â€” client-side modal only)`
- **Notes:**
  - The chunk makes no network calls; it is a pure client-side capture dialog used by the parent label screen.
  - Escape handling and the periodic re-focus both come from shared keyboard/focus hooks rather than local logic.

