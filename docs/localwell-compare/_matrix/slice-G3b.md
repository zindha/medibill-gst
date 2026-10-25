## Stock audit

<a id="stock-audit-view-audit-stock_audit_id"></a>

### `/stock-audit/view-audit/[stock_audit_id]`

- **Chunk of origin:** `static__chunks__pages__stock-audit__view-audit__[stock_audit_id]-4bf7a5ce0584994d.js`
- **What the user can do:**
  - Read-and-adjust summary of a finished physical stock audit, header "View Stock Audit" with the audit type named beneath it.
  - Header actions are "Go Back" and "Delete Audit (DEL)".
  - Deleting opens a confirmation dialog captioned "Delete Record" whose destructive option reads "Yes, Delete Now" alongside a decline option.
  - A successful delete reports "Audit Deleted Successfully" and returns to the audit list.
  - Summary strip shows audit number, audit date in day/month/year, audited SKU count, short SKU count, short-SKU adjustment value in rupees shown in red, excess SKU count, excess-SKU adjustment value shown in green, adjusted SKU count and the net adjustment.
  - The detail table lets a user still edit the physical count for a batch, split into packs and units, and attach a mismatch reason.
  - A local search filters the batch rows by batch number and by drug code.
  - Drug code and PMBJAY behaviour only appear for PMBJAY-enabled businesses.
  - The audit itself is loaded with its summary block and its batch rows from one call.
- **Interactions:**
  - Review the counts and adjustment figures for the audit.
  - Correct a physical count or mismatch reason directly in the table.
  - Delete the whole audit from the header after confirming in the modal.
  - Go back to the audit list.
- **Notable entities & workflows:**
  - audit number, audit date, audit type name, audited SKUs, short SKUs, short SKU adjustment, excess SKUs, excess SKU adjustment, adjusted SKUs, net adjustment, batch number, physical packs, physical units, mismatch reason, drug code, PMBJAY flag
- **Backend operations:** `stock_audit_delete_audit, stock_audit_get_audit_details`
- **Notes:**
  - Adjustment values are colour-coded: shortfalls negative, excess positive.
  - Only the physical-quantity and reason cells are editable; software quantities are read-only.

<a id="stock-audit-view-batches-stock_audit_id"></a>

### `/stock-audit/view-batches/[stock_audit_id]`

- **Chunk of origin:** `static__chunks__pages__stock-audit__view-batches__[stock_audit_id]-f26a97525e8b1b1c.js`
- **What the user can do:**
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
- **Interactions:**
  - Scan barcodes to count stock quickly, or type counts manually, or search and filter the batch rows.
  - Attach a mismatch reason wherever the physical and software figures disagree.
  - Watch the auto-save indicator, then press "Finish Audit (F4)" once all counts are synced.
  - Press "Discard Audit (Atl + Del)" to abandon the audit entirely.
- **Notable entities & workflows:**
  - stock audit id, audit type id, expiry start and end date, software batch primary pack, stock id, batch barcode, batch number, batch expiry date, batch MRP, software stock packs, software stock units, physical stock packs, physical stock units, medicine name, medicine form, medicine company, adjustment reason id and name, search text, batch filter and sort options
- **Backend operations:** `stock_audit_delete_audit, stock_audit_finalize_audit, stock_audit_get_audit_batches, stock_audit_get_audit_metadata, stock_audit_get_filters, stock_audit_save_progress`
- **Notes:**
  - Barcode length is fixed at ten characters; anything else is treated as invalid.
  - The expiry-range filter is only sent for audit type 2, the expiry-based audit.
  - Physical counts are persisted per batch, so partial progress survives a reload.

<a id="stock-audit-view-products"></a>

### `/stock-audit/view-products`

- **Chunk of origin:** `static__chunks__pages__stock-audit__view-products-b8e3b29b4d3a75a7.js`
- **What the user can do:**
  - First audit step, headed "New Stock Audit" with the caption "Step 1: Select SKUs to Audit".
  - Filter controls cover company, product form, stock location, product category, initials and an in-stock toggle, plus a drug-code search box labelled "Search Code" and a plain product search.
  - Filter values are expressed as master ids â€” company id, form id, category id â€” or as plain strings for location and initials, and the in-stock state and drug-code text travel as separate parameters.
  - Filter choices are applied through a modal that hands focus to the next relevant input after each choice.
  - The product grid shows category, company, form, initials, location, expiry in month/year, MRP and rate, pack, product name and drug code.
  - Product rows are selectable; the chosen set is stored locally as stock ids and survives navigation.
  - The "Go to Step 2 (F2)" button is only enabled when at least one product is selected and no filter is currently applied; it is disabled while any filter is set.
  - Clearing the selection or applying a filter refreshes the candidate product list.
- **Interactions:**
  - Narrow the candidate list with company, form, location, category, initials, in-stock and drug-code filters.
  - Search for a product by name and select the rows to audit.
  - Press "Go to Step 2 (F2)" to continue to physical counting.
  - Go back to the audit list from the header.
- **Notable entities & workflows:**
  - company id, form id, stock location, category id, initial name, in-stock flag, drug code search, audit product, stock id, expiry, MRP, rate, pack, selected items
- **Backend operations:** `stock_audit_create_audit, stock_audit_get_audit_products`
- **Notes:**
  - Step navigation is gated on filter state as well as selection, which is unusual but deliberate â€” the audit should start from a clean, unfiltered list.
  - The selection is stored in the browser and re-read when the screen mounts.
  - The audit-creation call is also present on this screen even though creation normally happens a step earlier.

<a id="stock-audit"></a>

### `/stock-audit`

- **Chunk of origin:** `static__chunks__pages__stock-audit-e925e5ba6c51df3c.js`
- **What the user can do:**
  - Audit hub, titled "Stock Audits" with the header "Physical Stock Audit" and the caption "Verify Physical Stock against Software Stock".
  - "New Audit (F2)" opens a "Select an Audit Type" chooser listing the available audit types, each with its own illustration, and storing the chosen type locally.
  - Three audit types are offered, illustrated as check-mismatch, remove-expiry and bulk-upload-previous-stock.
  - Choosing the expiry-based type first opens a "Select Expiry Date Range" dialog; the chosen range is stored and sent with the audit-creation request.
  - Creating an audit returns an audit id and routes to the batch-counting step for that audit.
  - The audit list columns: AUDIT NUMBER, AUDIT STATUS (coloured, with a running elapsed-time indicator), AUDIT TYPE, AUDIT END / START timestamps, PROGRESS IN SKUs, ADJUSTED value and ADJUSTED BY.
  - Progress shows audited versus to-be-audited SKU counts, and switches to adjusted versus audited counts once the audit is finished.
  - The adjusted value is coloured by sign â€” negative red, positive green â€” and the adjusting user is named.
  - Filter strip offers search by audit number, a date range with Today, Yesterday, Last 7 Days, Last 30 Days, This Month and Last Month presets, plus FILTER BY and SORT BY pickers.
  - The list query sends the date range, free text, active audit filters and sort filter.
  - A "How Audit Works?" link opens a tutorial video.
  - The date-range modal's default window spans roughly one week back to today.
- **Interactions:**
  - Start a new audit: pick a type, set an expiry range where required, then land in the counting step.
  - Browse past audits, filter by date or attributes, and sort them.
  - Open an audit to see its result, or use the tutorial for guidance.
- **Notable entities & workflows:**
  - audit id, audit type id and name, expiry start and end date, audit number, audit status, audit type, modified and created timestamps, audited-so-far count, to-be-audited count, adjusted count, adjusted value, adjusted-by user, date range presets, audit filters, sort filter
- **Backend operations:** `stock_audit_create_audit, stock_audit_get_audit_types, stock_audit_get_audits, stock_audit_get_filters`
- **Notes:**
  - The expiry-range value is a local-storage entry, not a backend endpoint.
  - Audit status drives both the colour of the chip and whether progress shows audited or adjusted counts.
  - The audit type chosen here determines which extra filters the next step applies.

## Dashboard

<a id="dashboard-view-dashboard"></a>

### `/dashboard/view-dashboard`

- **Chunk of origin:** `static__chunks__pages__dashboard__view-dashboard-db0efc3d39e7c688.js`
- **What the user can do:**
  - Business-scoped analytics home with a date-range picker offering Today, Yesterday, Last 7 Days, Last 30 Days, This Month and Last Month presets; the chosen range is remembered in app state and applied to every card.
  - Net Sales card: two-series chart of daily net sale amount versus daily average, with an up/down delta chip against the previous comparable period.
  - Stock Value card: money tiles for MRP (incl gst), the sale rate or price-to-retailer (incl gst) depending on business type, and Purc Rate (incl gst).
  - Net Payment Collection card: cash-in-hand split per payment mode, charted as Payment In against negative Payment Out, with net and prior-period delta.
  - Customers card: donut of new versus repeat customers plus Avg Order Value and Total Customers figures, with a "View entire list" link into the sales list.
  - Profit card and Net Purchase card, each a net-value / daily-average chart with prior-period delta.
  - Fast Moving / Slow Moving stock card: tabbed table with Product Name, Company, Qty Sold, Stock and Last Sold columns, plus a deep link to the matching business report.
  - Due Payments card: filterable by Customer or Distributor, showing a Total Due amount and a reminder list of parties with outstanding balances, from which a payment can be added or a reminder sent.
  - Refill Reminders card (retailer business type only) listing active follow-ups with a link into the reminders screen.
  - Per-card empty states such as "No Cash In Hand Added!", "No Due Payments Found", "No Followups Found!", "No Products Found!", "No Profits Added!", "No Purchases Added!", "No Sales Added!" and "No Stock Value!".
  - Multi-business header action "switch business" (or "+ add business" when only one business exists) routing to the business switcher, next to the business-name chip.
- **Interactions:**
  - Changing the date range reloads every summary card and re-publishes the shared range.
  - Toggling the Fast/Slow Moving tab swaps which stock list is fetched and rendered.
  - Switching the Due Payments filter between Customer and Distributor re-renders the total due figure and the party list.
  - Clicking a due-party row opens the payment-entry flow pre-filled with party id, party name and balance due; a reminder action composes a settlement message naming the business and invoice.
  - Clicking a refill reminder opens the reminders screen with that reminder preselected.
  - Card deep links are gated by permission checks for the dashboard, business reports and sale-profit views.
- **Notable entities & workflows:**
  - business_id, from_date, to_date, net, net_past, items[].date/amount/avg, stock_value.mrp_amount/purchase_amount/sale_amount, cash_in_hand[].payment_mode/payment_in/payment_out, payment_in, payment_out, customer_summary.new_customers/repeat_customers/total_customers/average_order_value, fast_moving_stocks, slow_moving_stocks, product_name, company, qty_sold, stock, last_sold, payments[].party_id/party_name/balance_due/district_name, due_amount, followups, business_type_id
- **Backend operations:** `dashboard_get_sales_summary, dashboard_get_stock_value, dashboard_get_cash_in_hand, dashboard_get_customer_summary, dashboard_get_profit_summary, dashboard_get_purchases_summary, dashboard_get_fast_moving_stocks, dashboard_get_slow_moving_stocks, payments_get_due_payments, followup_get_followup_list`
- **Notes:**
  - The date range and the multi-business selection live in client-side app state and are not separate backend calls.
  - Permission identifiers (dashboard view, business reports view, sale profit view) decide which cards and links render; they are checks, not requests.

## Customer orders (B2B / marketplace side)

<a id="customer-orders"></a>

### `/customer-orders`

- **Chunk of origin:** `static__chunks__pages__customer-orders-d70466f5a409fe36.js`
- **What the user can do:**
  - Three-tab list (ORDERS, BOUNCED, CUSTOMERS) with live counters for orders, bounced orders and customers to map, plus a strip of mapped versus unmapped customer counts.
  - Orders table showing customer name, phone, patient name (retailer business type), order number and date, age, status chip, billing-readiness chip (Fully Ready / Partial / Not Ready, colour-coded green / orange / red), order amount, bounced-SKU ratio and available stock.
  - Filter panel driven by server-provided order filters and sort filters; applied criteria appear as removable tags alongside a "Reset Filter" action.
  - Date-range filter with preset shortcuts, shared across the tabs.
  - Debounced free-text search by customer name or order number, plus a separate customer-name / mobile / drug-licence search in the distributor mapping area.
  - "Add New Order (F2)" modal for creating a fresh customer order.
  - "Short Items from Customer Orders" modal listing short or out-of-stock items with a bulk "ADD SHORT ITEMS TO CART IN BULK" action that pushes selected products into the Orderbook cart.
  - Mapping flow for unmapped customers: map to an existing business, or when a similar business is found require the user to confirm "Both are Same (F2)" or "Both are Different (F4)", otherwise register the customer as a new business.
  - Mapping-request inbox (business type 2) with Accept Request / Reject Request and a mandatory rejection reason.
  - Distributor invite: search LocalWell businesses by district, with an "Invite Now" call to action on the search results.
  - "Create a Zennx Account" modal summarising the customer detail, outstanding-as-on-date and stock detail that will be shared, gated on a consent checkbox.
  - "Promote MedCart" button (retailer business type only) plus a "Promote your Online Store" modal showing the MedCart e-pharmacy website link with copy-to-clipboard.
  - Premium/partner indicator state and a saved per-business settings record restored from client state on load.
- **Interactions:**
  - Switching tab reloads the list and persists the selected tab.
  - Typing in the search box reloads after a short debounce; changing a filter or sort reloads from the first page.
  - Applying a filter or sort adds a removable tag; removing a tag clears that criterion, and Reset clears all.
  - In the mapping comparison modal F2 confirms both records are the same and auto-maps, F4 opens the create-business branch.
  - Accept/Reject of a mapping request uses arrow-key radio selection; rejecting requires a reason before submitting.
  - Selecting short items and running the bulk add posts them to the Orderbook cart; items already in the cart are shown disabled and greyed out.
  - Keyboard conventions throughout: F2 for Add New Order / Add to Cart, Space to select dropdown options, Enter to open, Esc to dismiss.
- **Notable entities & workflows:**
  - order_no, order_date, order_status, order_status_id, order_status_color, order_age, order_amount, customer_name, customer_phone_number, customer_mobile_number, patient_name, billing_readiness, billing_readiness_color, bounced_products, total_products, avl_qty, is_in_stock, district_id, district_name, business_name, business_address, customer_business_id, customer_id, mapping_status, mapped_customers_count, non_mapped_customers_count, counts.orders/bounced_orders/customers, order_filters, sort_filters, short_items[].is_in_cart, products, business_type_id
- **Backend operations:** `customer_orders_get_orders, customer_orders_get_bounced_orders, customer_get_mapping_customers, customer_get_order_counts, customer_get_order_filters, customer_orders_get_products_in_shortage, customer_get_mapping_request, customer_search_customers_for_mapping, update_distributor_customer_mapping_status, orderbook_search_businesses_for_distributors, initiate_distributor_integration, add_business_customer, orderbook_sync_cart`
- **Notes:**
  - The list endpoint is chosen at runtime by tab: three different operation identifiers are selected from the same request shape.
  - Counts and the table are separate calls, so the tab counters can lag the visible rows.
  - ZennX account creation is blocked until the sharing-consent checkbox is ticked.

<a id="customer-orders-business-kyc"></a>

### `/customer-orders/business-kyc`

- **Chunk of origin:** `static__chunks__pages__customer-orders__business-kyc-5821fd2ce1e394d5.js`
- **What the user can do:**
  - "Your Business KYC" page collecting the data required to enable digital payments for the business.
  - Business-entity selector modal listing entity types from the master list, driven by keyboard navigation.
  - Entity-dependent identifier fields: PAN for ordinary entities, LLPIN for partnership and CIN for company, where the CIN/LLPIN entries are read-only placeholders populated from the GST validation result.
  - Legal name of the business and the owner's name, both upper-cased and length-capped.
  - GSTIN field validated server-side, back-filling the registered business address and the composition-dealer flag; a self-declaration checkbox for turnover below the GST limit makes GSTIN optional and switches the PAN field to a placeholder.
  - Drug licence Form 20 and Form 21 numbers with a separate image upload for each.
  - Image uploads for the pharmacy storefront (explicitly not the business logo) and for the GST certificate, with preview and re-upload.
  - A required self-declaration toggle asserting the facts are true.
  - Save action that persists the profile, confirms with a toast and redirects to the partner-integrations page.
- **Interactions:**
  - Choosing an entity from the modal switches which identifier fields are shown and clears the inapplicable ones.
  - Leaving the GSTIN field triggers server validation; an invalid value reports "INVALID GSTIN" and blocks the form.
  - Each save attempt runs client validation first and names the first missing requirement specifically â€” storefront image, Form 20 image, GST certificate, or the self declaration.
  - The self declaration must be ticked before the profile can be saved.
  - Escape returns to the previous screen; in the entity list, arrow keys move and Enter opens.
- **Notable entities & workflows:**
  - business_entity, business_entity_id, business_name, business_owner_name, business_owner_pan, business_pan, business_gstin, business_cin, business_llpin, business_address, business_address_line_1, business_address_line_2, is_composition_dealer, is_gst_non_enrollment_declared, self_declaration, business_drug_license_form_20_no, business_drug_license_form_21_no, dl_form_20_image_url, dl_form_21_image_url, gstin_certificate_image_url, business_image_url, address, drug_license, gst_tax, regulatory
- **Backend operations:** `business_get_master_business_entities, business_get_profile, business_update_business_profile, business_validate_gstin`
- **Notes:**
  - The GSTIN check is a server call that also supplies address and composition-dealer data the form then displays.
  - After a successful save the page redirects to partner integrations with a tab hint, and the profile is re-fetched.

<a id="customer-orders-order-detail"></a>

### `/customer-orders/order-detail`

- **Chunk of origin:** `static__chunks__pages__customer-orders__order-detail-aa2c222b08ed5b28.js`
- **What the user can do:**
  - "Verify & Update Order Detail" header carrying the order number, a coloured status chip and a back arrow.
  - Left panel of order attributes: customer, phone, address, fulfillment type (Delivery or Pickup), PO reference, created-by and created/updated timestamps, plus editable billing and shipping addresses for non-partner orders.
  - Payment detail block showing the payment account and the transaction UTR.
  - Product table with rate, MRP and amount, a bulk "Product Actions" control, and a per-line expander for substitutes and duplicates.
  - Delivery action picker offering Mark as Delivered, Delivery Refused by Customer and Pickup, each with its own confirmation.
  - Order action picker offering edit order, decline order and â€” for bounced orders â€” process the order; declined or refused orders can be re-opened.
  - Delivery confirmation modal that sends a 6-digit code to the customer's mobile and requires the entered code before the order is synced as delivered, with a separate path for a wrong customer number that resends the code.
  - Bounced-order handling offering either deletion of the bounced order or conversion into a new customer order, with a warning that names the outcome before confirmation.
  - Sale bill creation: jump to an existing sale bill or stock transfer, or generate a picklist from the order and route to the stock picklist screen.
  - Per-product actions to add to cart, remove only, or remove products from the order.
  - Status timeline listing the current order status and the order-updates stages such as uploading the order bill.
- **Interactions:**
  - The delivery-code path requires exactly six digits before the sync call is sent.
  - Confirming delivery with the customer's code marks the order delivered and records the last four digits of the AWB.
  - Declining or refusing delivery is final on this screen except via re-open.
  - Processing a bounced order shows a two-outcome warning and needs explicit confirmation.
  - Keyboard shortcuts: F2 for accept / create sale bill / update delivery, F4 for edit order, Del for decline and skip, Esc to dismiss.
- **Notable entities & workflows:**
  - customer_order_id, purchase_order_id, order_no, order_status, order_status_id, order_status_color, order_modified_on, order_status_modified_on, order_amount, customer_name, customer_mobile_number, customer_address, is_home_delivery, products[], order_detail, shipment_detail, payment_transaction_detail, transaction_utr, payment_account_display_name, purchase_order_no, payable_amount, payment_amount, sale_id, stock_transfer_id, partner_id, partner_order_id, is_picklist_printed, delivery_code, update_order_status_id, mark_delivered, last_4_digits_of_awb_code, product_list_available, sale_detail
- **Backend operations:** `customer_orders_order_detail, customer_sync_customer_order, generate_new_sale_details, mark_bounced_orders_as_processed, orderbook_add_customer_orders, orderbook_sync_cart`
- **Notes:**
  - The order status decides which action buttons render, with separate branches for accepted, picked-up, billed, declined and refused states.
  - Sync is a single operation carrying products, target status, delivered flag and AWB digits, so status changes and product edits share one call.
  - Stock-transfer orders are read-only for the receiving branch and redirect to the stock-transfer sale screen instead.

<a id="customer-orders-promote-medcart"></a>

### `/customer-orders/promote-medcart`

- **Chunk of origin:** `static__chunks__pages__customer-orders__promote-medcart-c7e96fb77e52b9b2.js`
- **What the user can do:**
  - MedCart promotion page headed "Promote Your Online Store" with a date-range filter covering the performance numbers.
  - Performance tiles for App Installs from your invite link, App Orders placed on your app and Revenue from all your orders, each with a percentage change against the comparison period.
  - "Your Store Link" card listing the Mobile App Link and the Web Store Link, both copyable.
  - Two generated QR codes encoding a referral-tagged Play Store redirect for the store slug, plus a printable "QR Code Sticker" action.
  - "Steps to Promote" three-step card: share the app link, share the install code, or have the customer scan the QR.
  - "Reasons to Promote" marketing block explaining why to push the MedCart app.
  - "What is Medcart? (F4)" link out to the partner integrations page, plus a Go Back button.
- **Interactions:**
  - Changing the date range reloads the performance tiles and regenerates both QR codes from the current store slug.
  - The copy buttons write the chosen link to the clipboard and confirm with a "Copied" toast.
  - The print action opens the browser print dialog for the QR sticker.
- **Notable entities & workflows:**
  - from_date, to_date, slug_url, current_installs, current_installs_change, order_count, order_count_change, revenue, revenue_change
- **Backend operations:** `business_get_medcart_performance_stats`
- **Notes:**
  - The install code shown in the steps card is derived from the store slug returned by the stats call.
  - Link and QR targets are built from a configurable MedCart base URL plus the returned slug, so both change together.

