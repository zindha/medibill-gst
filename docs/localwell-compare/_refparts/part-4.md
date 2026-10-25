# Reference part 4

### /stocks/stock-picklist  ·  chunk: static__chunks__pages__stocks__stock-picklist-a71fbeea3d6e8add.js
Features:
- Two-panel picking workspace: the left panel lists stock still to be picked (accordion grouped by LOCATION) and the right panel lists what has been picked, each group also keyed by stock location.
- Availability colour coding in the left panel with three legend states — ADEQUATE (green), PARTIAL (orange) and BATCHES NOT IN PICKLIST (blue).
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
Interactions:
- Scan or type a batch barcode to pull that batch into the picked list; the scan field clears itself after ~10 s of inactivity.
- Remove a picked row from the picked list, which immediately re-runs the adequate/partial recomputation for that medicine.
- Pick an order (customer order, quotation, sale or stock transfer) to load its picklist for picking.
- Open the print preview, switch printer type and page size to re-render it, and use zoom / fit-to-content on the preview.
- Print now, download the picklist as PDF, or close the preview with Escape.
API: stocks_sync_picklist, generate_new_sale_details, medicine_search_medicines, get_picklist_html, convert_to_pdf, clear_redis_data
Entities: medicine_id, medicine_name, medicine_company_name, batch_id, batch_no, batch_expiry_date, batch_mrp, stock_location, location, qty_packs, qty_units, required_qty, fulfilled_qty, remaining_qty, is_partial, is_adequate, exact_match, customer_order_id, customer_order_no, order_no, customer_id, customer_name, sale_invoice_no, purchase_invoice_no, quotation_no, invoice_date, is_home_delivery, is_picklist_printed, product_list_available, sale_detail, printer, page_size, stock_transfer_id, sale_transaction_item_discount
Notes:
- No literal "/api/" strings appear in the bundle: the page dispatches named route keys through a shared networking service, and the keys listed above are the endpoints it calls.
- Scanning also rides on a socket.io channel (register_client / barcode_data events) for hardware scanners, which is not an HTTP endpoint.
- The chunk is a webpack bundle of unusual size: most of its bulk is embedded base64 asset data rather than application logic.

### /stocks/print-barcode-labels  ·  chunk: static__chunks__pages__stocks__print-barcode-labels-82a5118d99d4e9e8.js
Features:
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
Interactions:
- Type a search term or open a filter, pick values, then apply to reload the product list.
- Expand a product to reveal its batches, tick the batches to print and set the label count for each one.
- Scan a barcode to add or edit an item barcode; the scan submits automatically at 13 characters.
- Open the preview, switch between barcode and QR layout, adjust settings and zoom, then print or save settings as default.
API: business_get_barcode_settings, business_update_barcode_settings, settings_update_stock_settings, stock_audit_get_filters, stocks_get_stock_detail_for_barcodes
Entities: business_stock_category_id, category_name, medicine_company_id, medicine_company_name, medicine_form, medicine_form_id, stock_categories, stock_locations, stock_type, stock_id, stock_ids, batch_id, batch_no, batch_expiry_date, batch_barcode, batch_mrp, batch_sale_rate, barcode, qty_packs, medicine_name, business_name, distributor_name, purchase_invoice_no, purchase_invoice_date, print_barcode_purchase_id, label_product_name, label_mrp, label_sale_rate, label_expiry_date, label_store_name, label_batch_no, label_location, label_distributor, label_invoice_date, labels_count_row, label_width, label_height, left_right_page_padding, top_bottom_page_padding, labels_to_be_left_blank, labels, is_checked, is_disabled
Notes:
- No literal "/api/" strings appear in the bundle: the page dispatches named route keys through a shared networking service, and the keys listed above are the endpoints it calls.
- The barcode scanning modal itself lives in a separate chunk (see /stocks/print-barcode-labels/stock-scan-qr).
- Thermal output is ZPL for Zebra-style label printers; A4 output is plain browser printing.

### /stocks/print-barcode-labels/stock-scan-qr  ·  chunk: static__chunks__pages__stocks__print-barcode-labels__stock-scan-qr-255443d045128e02.js
Features:
- Small modal used by the barcode-label screen to capture a barcode from a handheld scanner or from typed input.
- The input is focused when the modal opens and re-focused every two seconds so scanner keystrokes always land in the field.
- The modal header reads "Scan Barcode" and offers a Dismiss action that closes it.
- The body shows an animated scanning illustration alongside the input, whose placeholder reads "Scan or type barcode".
- Capture completes on its own once 13 characters have been entered, and the value is handed back to the parent screen.
- Escape closes the modal.
Interactions:
- Scanning or typing fills the field; the value is submitted automatically at 13 characters.
- The Dismiss button or the Escape key closes the modal.
API: (none — client-side modal only)
Entities: scanned barcode value, scan_qr input field
Notes:
- The chunk makes no network calls; it is a pure client-side capture dialog used by the parent label screen.
- Escape handling and the periodic re-focus both come from shared keyboard/focus hooks rather than local logic.
