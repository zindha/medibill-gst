# Reference part 3

### /stocks/adjust-stocks  ·  chunk: static__chunks__pages__stocks__adjust-stocks-3b359e184710e2e8.js
Features:
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

Interactions:
- Download template, then upload the filled workbook from the same page.
- Put a row into edit mode, correct the pack/unit counts, save the row, then continue.
- Press "Continue" to persist the whole workbook; "Cancel Import" abandons the import and leaves the previous stock untouched.
- Success redirects to /stocks/view-stocks.

API: `reports_get_stock_value_summary, stocks_parse_excel_for_bulk_update, stocks_update_batch`
Entities: product name, company, batch, expiry date, MRP, units per pack, number of packs, loose units, stock update chunk
Notes:
- The chunk calls the backend through a shared RPC helper rather than literal `/api/` URLs, so endpoint names below are the RPC operation names.
- Batch size of fifty is a hard-coded client-side chunking constant.
- This screen writes quantity corrections only; no new products are created here.

### /stocks/bulk-update-settings  ·  chunk: static__chunks__pages__stocks__bulk-update-settings-251da08e792a2cb7.js
Features:
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

Interactions:
- Download, fill, re-upload, then walk the stepper forward with "Continue" and "Back".
- Toggle individual columns in or out of the update set before previewing.
- Correct invalid rows in the preview and re-upload the corrected sheet.
- "Download all invalid rows" hands back a workbook that isolates the problems for fixing.

API: `stocks_download_invalid_rows, stocks_download_stocks_for_bulk_update, stocks_process_bulk_update_stocks`
Entities: spreadsheet column header, first data row, last data row, rows to be updated, stock id, medicine name, product company, composition, product form, product category, barcode, product location, loose billing flag, new-value mapping key
Notes:
- Validation is enforced server-side; the client only reflects the returned valid/invalid split.
- Accepted upload extensions are broader than the error message suggests, but the message only ever names `.xlsx`.
- Preview is read-only; edits are made in the spreadsheet, not in the browser grid.

### /stocks/stock-transfer/view-transfers  ·  chunk: static__chunks__pages__stocks__stock-transfer__view-transfers-f05245693046c254.js
Features:
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

Interactions:
- Switch tabs to move between sent, received, purchase-return and return-list views.
- Search by transfer reference, multi-select branches, pick a date range, then filter or sort on any column.
- Reset all filters from the same strip.
- Open a transfer row to inspect the order, after which the stale context keys are cleared.

API: `customers_search_customers, expenses_get_expense_categories, get_mapping_business_for_migration, get_stock_return_transfers, stock_transfer_get_stock_transfers`
Entities: transfer reference number, transfer date, transfer status, last status change, business name, business GSTIN, SKU count, transfer amount, with/without GST, added-by user, return invoice number, branch name and address, drug licence, nature of business, payable/receivable amount, mobile number, expense category
Notes:
- The customer-search endpoint is wired into this screen even though transfers are branch-based; it drives the searchable picker used for the branch modal.
- Branch lookups are capped at twenty-five candidates per request.
- Column-level filters are multi-select and are applied on top of the top-strip filters.

### /stocks/update-stock-info  ·  chunk: static__chunks__pages__stocks__update-stock-info-8ff2e99855275c11.js
Features:
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

Interactions:
- Search for a product, adjust its settings, and save; the save carries only the fields that were actually changed.
- Open "Bulk Update (F2)" to edit several products from one screen, or jump to the spreadsheet workflow for larger changes.
- Download the droplist PDF or generate barcodes from the header actions.
- The tutorial embed opens a video panel for guidance.

API: `settings_get_stock_settings, settings_update_stock_settings, stock_get_stock_droplist, stocks_get_stock_categories`
Entities: product category id and name, medicine form id and name, company id, stock location, minimum sale discount, maximum sale discount, online discount, discount lock flag, ignore-for-shortage flag, online listing flag, loose billing flag, preferred distributor id, sale scheme quantity, scheme free quantity, sale quantity, stock ids, purchase id, barcode print id
Notes:
- Both retailer and distributor business types share one form; the extra scheme fields are rendered only for retailer type.
- The droplist PDF filename embeds the business name and business id.
- Settings are loaded per purchase id rather than per stock id.

### /stocks/upload-stocks  ·  chunk: static__chunks__pages__stocks__upload-stocks-d266bf6eea360301.js
Features:
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

Interactions:
- Upload a CSV, review the auto-suggested product matches, correct wrong ones, then "Save & Load Next" until the file is mapped.
- Fill or correct batch quantities, prices, expiry and invoice details in the second stage.
- Press "Add to Stock" to commit the batches to stock.
- Cancel at any point to abandon the upload without touching stock.

API: `load_unmapped_stocks, medicine_get_hsn_gst_rates, medicines_show_fuzzy_mappings, stocks_add_new_batch, sync_pending_to_map_stocks`
Entities: CSV medicine name, pack size, fuzzy match score, verified flag, stock location, migration id, failure migration id, migration stock id, medicine id, HSN code, batch number, batch expiry date, primary pack, secondary pack, number of packs, loose units, MRP, net purchase rate, sale rate, price to retailer, GST rate, distributor name, purchase invoice number, purchase invoice date
Notes:
- Setting MRP also overwrites the sale rate in the same edit.
- Duplicate batches are deliberately permitted for bulk uploads, unlike the adjust-stock screen.
- Purchase invoice dates are entered in day/month/year format while batch expiry uses month/year.

### /stocks/view-stocks  ·  chunk: static__chunks__pages__stocks__view-stocks-d686359abbb40817.js
Features:
- Main stock screen titled "View Stocks", with a left-hand summary panel headed "Stock on hand" showing the SKU count and the total stock value in rupees.
- The value and count are fetched from a dashboard stock-value summary.
- A collapsible "Search | Filter | Sort" strip provides generic filters, search filters and sort options, all loaded from a shared filter-configuration service, plus "Reset Filter".
- The product list loads twenty rows per page with a "Load More" continuation, driven by page number, free text, active search filter, stock filters and sort filter.
- Selecting a product opens a detail panel showing pack size, expiry in month/year (red once expired), stock location and MRP.
- Costing fields — purchase rate, net rate, sale rate, price to retailer and margin — are only shown when the viewer holds the stock-margin permission; sale rate is shown for retailers and price to retailer for distributors.
- The detail panel carries OTC/Rx prescription badges, composition text with an "Add Composition" shortcut, front and back product images, and an "Add Company" shortcut.
- A "Possible Duplicates" panel lists near-duplicate products with verified badges; entries can be multi-selected with a click and then merged.
- Merging requires at least one selection, otherwise "Please select atleast one duplicate" is shown; a successful merge reports "Stocks merged".
- Duplicate listing and merging are themselves permission-gated (merge-duplicate permission).
- Header actions on the detail panel: "Order Now (F2)" pushes the product to the order cart with prices and quantities auto-filled and confirms "Added to Cart"; "Settings (F4)" opens a per-stock settings modal; "+ Add New Item" starts a new item.
- The per-stock settings modal saves through the shared stock-settings endpoint using a single stock id or a list of stock ids.
- An announcement dialog can be shown, pulling its content from an announcement service and reporting the user's chosen action back; it is shown only once and that fact is remembered locally, and failure to load the announcement is silently ignored.

Interactions:
- Search, filter and sort the list, then scroll to load further pages.
- Click a product to inspect its stock detail, then order it, change its settings or merge duplicates.
- Select duplicate cards and press "Merge" to consolidate them.
- Dismiss or act on the announcement dialog when it appears.

API: `dashboard_get_stock_value, get_announcement_modal_data, get_stock_filters, medicine_get_medicine_details, orderbook_sync_cart, settings_update_stock_settings, stock_get_duplicate_stocks, stock_merge_duplicate_stocks, stocks_get_stocks, sync_announcement_action`
Entities: SKU count, total stock value, purchase amount, stock id, pack size, expiry date, stock location, MRP, purchase rate, net rate, sale rate, price to retailer, margin, prescription type, composition name, medicine details, duplicate medicines, merge target id, announcement id, announcement action
Notes:
- Costing data is permission-sensitive; without the margin permission the detail panel shows only pack, expiry, location and MRP.
- The announcement dialog is explicitly failure-tolerant and is shown at most once per browser profile.
- Duplicate cards are selected by a click-versus-drag gesture so page scrolling does not accidentally change the selection.

### /stock-audit/view-audit/[stock_audit_id]  ·  chunk: static__chunks__pages__stock-audit__view-audit__[stock_audit_id]-4bf7a5ce0584994d.js
Features:
- Read-and-adjust summary of a finished physical stock audit, header "View Stock Audit" with the audit type named beneath it.
- Header actions are "Go Back" and "Delete Audit (DEL)".
- Deleting opens a confirmation dialog captioned "Delete Record" whose destructive option reads "Yes, Delete Now" alongside a decline option.
- A successful delete reports "Audit Deleted Successfully" and returns to the audit list.
- Summary strip shows audit number, audit date in day/month/year, audited SKU count, short SKU count, short-SKU adjustment value in rupees shown in red, excess SKU count, excess-SKU adjustment value shown in green, adjusted SKU count and the net adjustment.
- The detail table lets a user still edit the physical count for a batch, split into packs and units, and attach a mismatch reason.
- A local search filters the batch rows by batch number and by drug code.
- Drug code and PMBJAY behaviour only appear for PMBJAY-enabled businesses.
- The audit itself is loaded with its summary block and its batch rows from one call.

Interactions:
- Review the counts and adjustment figures for the audit.
- Correct a physical count or mismatch reason directly in the table.
- Delete the whole audit from the header after confirming in the modal.
- Go back to the audit list.

API: `stock_audit_delete_audit, stock_audit_get_audit_details`
Entities: audit number, audit date, audit type name, audited SKUs, short SKUs, short SKU adjustment, excess SKUs, excess SKU adjustment, adjusted SKUs, net adjustment, batch number, physical packs, physical units, mismatch reason, drug code, PMBJAY flag
Notes:
- Adjustment values are colour-coded: shortfalls negative, excess positive.
- Only the physical-quantity and reason cells are editable; software quantities are read-only.

### /stock-audit/view-batches/[stock_audit_id]  ·  chunk: static__chunks__pages__stock-audit__view-batches__[stock_audit_id]-f26a97525e8b1b1c.js
Features:
- Second audit step, headed "New Stock Audit" with the caption "Step 2: Check & Record Physical Stock".
- Header actions: "Go Back", "Finish Audit (F4)" and "Discard Audit (Atl + Del)".
- An auto-save indicator shows "Saving in progress..." or "Saved Successfully" as counts are recorded.
- Barcode-scan mode uses a hidden ten-character barcode field; a scanned code increments the matching batch's physical count and the field refocuses every two seconds.
- Scan outcomes are reported as "Product Successfully Scanned", "Product with given barcode was not found" or "Invalid Barcode".
- Alternative entry modes are a stock search over product, location and batch number, an expiry date range, and filter and sort options loaded from the audit filter service.
- Each row carries software-side figures (pack size, batch number, expiry, MRP, stock packs, stock units) next to the physical figures (physical packs, physical units), plus medicine name, form and company.
- A mismatch-reason picker is available per row, sourced from the audit metadata service, and opens in a modal from the row action.
- Equality between software and physical quantity is judged by converting packs to units using the row's pack size before comparing.
- Progress is saved continuously by sending the audit id with the accumulated batch list.
- Finishing is only possible once every physical count has been synced; it reports "Audit Finished Successfully" and opens the audit summary.
- Discarding deletes the audit and returns to the audit list.
- Rows can be deleted individually; a delete confirmation dialog is used for destructive header actions.
- The audit type, chosen expiry range, saved batches and selected items are remembered locally across steps, and the expiry range is only applied for the expiry-based audit type.

Interactions:
- Scan barcodes to count stock quickly, or type counts manually, or search and filter the batch rows.
- Attach a mismatch reason wherever the physical and software figures disagree.
- Watch the auto-save indicator, then press "Finish Audit (F4)" once all counts are synced.
- Press "Discard Audit (Atl + Del)" to abandon the audit entirely.

API: `stock_audit_delete_audit, stock_audit_finalize_audit, stock_audit_get_audit_batches, stock_audit_get_audit_metadata, stock_audit_get_filters, stock_audit_save_progress`
Entities: stock audit id, audit type id, expiry start and end date, software batch primary pack, stock id, batch barcode, batch number, batch expiry date, batch MRP, software stock packs, software stock units, physical stock packs, physical stock units, medicine name, medicine form, medicine company, adjustment reason id and name, search text, batch filter and sort options
Notes:
- Barcode length is fixed at ten characters; anything else is treated as invalid.
- The expiry-range filter is only sent for audit type 2, the expiry-based audit.
- Physical counts are persisted per batch, so partial progress survives a reload.

### /stock-audit/view-products  ·  chunk: static__chunks__pages__stock-audit__view-products-b8e3b29b4d3a75a7.js
Features:
- First audit step, headed "New Stock Audit" with the caption "Step 1: Select SKUs to Audit".
- Filter controls cover company, product form, stock location, product category, initials and an in-stock toggle, plus a drug-code search box labelled "Search Code" and a plain product search.
- Filter values are expressed as master ids — company id, form id, category id — or as plain strings for location and initials, and the in-stock state and drug-code text travel as separate parameters.
- Filter choices are applied through a modal that hands focus to the next relevant input after each choice.
- The product grid shows category, company, form, initials, location, expiry in month/year, MRP and rate, pack, product name and drug code.
- Product rows are selectable; the chosen set is stored locally as stock ids and survives navigation.
- The "Go to Step 2 (F2)" button is only enabled when at least one product is selected and no filter is currently applied; it is disabled while any filter is set.
- Clearing the selection or applying a filter refreshes the candidate product list.

Interactions:
- Narrow the candidate list with company, form, location, category, initials, in-stock and drug-code filters.
- Search for a product by name and select the rows to audit.
- Press "Go to Step 2 (F2)" to continue to physical counting.
- Go back to the audit list from the header.

API: `stock_audit_create_audit, stock_audit_get_audit_products`
Entities: company id, form id, stock location, category id, initial name, in-stock flag, drug code search, audit product, stock id, expiry, MRP, rate, pack, selected items
Notes:
- Step navigation is gated on filter state as well as selection, which is unusual but deliberate — the audit should start from a clean, unfiltered list.
- The selection is stored in the browser and re-read when the screen mounts.
- The audit-creation call is also present on this screen even though creation normally happens a step earlier.

### /stock-audit  ·  chunk: static__chunks__pages__stock-audit-e925e5ba6c51df3c.js
Features:
- Audit hub, titled "Stock Audits" with the header "Physical Stock Audit" and the caption "Verify Physical Stock against Software Stock".
- "New Audit (F2)" opens a "Select an Audit Type" chooser listing the available audit types, each with its own illustration, and storing the chosen type locally.
- Three audit types are offered, illustrated as check-mismatch, remove-expiry and bulk-upload-previous-stock.
- Choosing the expiry-based type first opens a "Select Expiry Date Range" dialog; the chosen range is stored and sent with the audit-creation request.
- Creating an audit returns an audit id and routes to the batch-counting step for that audit.
- The audit list columns: AUDIT NUMBER, AUDIT STATUS (coloured, with a running elapsed-time indicator), AUDIT TYPE, AUDIT END / START timestamps, PROGRESS IN SKUs, ADJUSTED value and ADJUSTED BY.
- Progress shows audited versus to-be-audited SKU counts, and switches to adjusted versus audited counts once the audit is finished.
- The adjusted value is coloured by sign — negative red, positive green — and the adjusting user is named.
- Filter strip offers search by audit number, a date range with Today, Yesterday, Last 7 Days, Last 30 Days, This Month and Last Month presets, plus FILTER BY and SORT BY pickers.
- The list query sends the date range, free text, active audit filters and sort filter.
- A "How Audit Works?" link opens a tutorial video.
- The date-range modal's default window spans roughly one week back to today.

Interactions:
- Start a new audit: pick a type, set an expiry range where required, then land in the counting step.
- Browse past audits, filter by date or attributes, and sort them.
- Open an audit to see its result, or use the tutorial for guidance.

API: `stock_audit_create_audit, stock_audit_get_audit_types, stock_audit_get_audits, stock_audit_get_filters`
Entities: audit id, audit type id and name, expiry start and end date, audit number, audit status, audit type, modified and created timestamps, audited-so-far count, to-be-audited count, adjusted count, adjusted value, adjusted-by user, date range presets, audit filters, sort filter
Notes:
- The expiry-range value is a local-storage entry, not a backend endpoint.
- Audit status drives both the colour of the chip and whether progress shows audited or adjusted counts.
- The audit type chosen here determines which extra filters the next step applies.

