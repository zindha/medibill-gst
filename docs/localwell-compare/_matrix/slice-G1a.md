## Sale & customers

<a id="sale-add-sale"></a>

### `/sale/add-sale`

- **Chunk of origin:** `static__chunks__pages__sale__add-sale-45ecb47518b4776b.js`
- **What the user can do:**
  - New-sale landing screen that hosts a multi-panel sale composer (customer and product selection, sale details, and related side panels).
  - Redirects away when the sale store already holds a completed sale, sending the user to that sale's own detail URL instead of starting a second sale.
  - Three entry modes selected by URL flags: a brand-new sale, a stock transfer, or resuming a saved draft.
  - Marks the session as a stock transfer when launched as one, and records the sale type accordingly.
  - Carries a draft identifier in session state so a partially built sale can be resumed.
  - Pulls the active business record out of the global store on mount to render header context.
  - Optional quick-scan module appears only for a single business type and is suppressed for transfers and quotations.
  - Hides the navigation menu and caps page height to the viewport minus header chrome, giving the composer a full-height work area.
  - Sets the browser page title to "Add Sales".
- **Interactions:**
  - Query string drives bootstrap: is_new_sale, is_new_transfer and draft_id decide what the screen loads.
  - Sale state is cleared before a new sale or transfer starts so no stale customer or items carry over.
  - A draft id present in the URL is pushed to the backend on mount so the draft is restored.
  - A page-focus flag is threaded down to each child panel so keyboard/tab navigation keeps working.
- **Notable entities & workflows:**
  - sale_id, sale_state, sale_main_details, view_mode, sale_type, is_stock_transfer, draft_id, sale_draft_id, business_id, business_type_id, quick_scan_enabled
- **Backend operations:** `draft_sync_draft`
- **Notes:**
  - No literal `/api/...` strings exist in this chunk; endpoint identity lives in the shared services bundle that was not part of the chunk set.

<a id="sale-add-sale-sale_id"></a>

### `/sale/add-sale/[sale_id]`

- **Chunk of origin:** `static__chunks__pages__sale__add-sale__[sale_id]-fb0b0f66b26631c8.js`
- **What the user can do:**
  - Detail/editor variant of the sale screen, opening an existing sale, a quotation, or a stock transfer depending on URL parameters.
  - Distinguishes the three document kinds: a plain sale, a quotation, or a stock transfer carrying its own transfer status and date.
  - Loads the stored sale header for the requested id and shows a toast when the backend returns a non-success status.
  - Loads quotation details through a separate fetch path so quotations are read with their own payload.
  - Reads sale main details and sale doctor details from the shared sale store, so an in-progress draft and the linked doctor/patient stay in sync.
  - Resets the "view" mode so the record opens read-only first rather than directly editable.
  - Clears follow-up suggestion state (follow-ups to show, follow-ups to suggest, follow-ups based on, non-composition products, non-composition follow-ups) when the screen mounts.
  - Composes the same customer/product/detail panels as the new-sale screen, with the side menu hidden and a fixed working height.
  - Offers a quick-scan entry point, switched off for the quoting/stock-transfer variants.
- **Interactions:**
  - URL query (type, sale_id, transfer_status, date) selects which document and detail loader runs.
  - Each load shows a busy state while in flight and clears it when the request settles.
  - A failed load surfaces the backend message as an error toast.
  - Page focus state is propagated to child panels to keep keyboard navigation coherent.
- **Notable entities & workflows:**
  - sale_id, sale_main_details, sale_doctor_details, view_mode, transfer_status, followups_to_show, followups_to_suggest, followups_based_on, non_composition_products, non_composition_followups, business_type_id
- **Backend operations:** `sale details load, quotation details load (both via the shared services module)`
- **Notes:**
  - No literal `/api/...` strings exist in this chunk; the two loads are exposed only as minified shared-module calls.
  - The bracket segment is a dynamic route parameter, so the same chunk serves several document kinds.

<a id="sale-customer-facing-screen"></a>

### `/sale/customer-facing-screen`

- **Chunk of origin:** `static__chunks__pages__sale__customer-facing-screen-78f7c1a90f7e99d0.js`
- **What the user can do:**
  - A customer-facing checkout display intended to run on a second screen or device facing the shopper, not the cashier console.
  - Welcome state with a store greeting, store logo, business name, and the current date.
  - Live "YOUR ORDER" panel listing each product with quantity, pack, rate, MRP, batch number and batch expiry.
  - Footer totals row covering product count, quantity, MRP total, rate totals, discount, round-off and the amount to pay.
  - Savings and refund messaging: a savings figure, amount you will pay versus amount you will receive, and a balance summary.
  - Purchase/return/settlement panels summarising purchase amounts, purchase returns, sale returns, payable, paid, refundable and balance-due sums, plus net profit.
  - A payment request area that fetches a payment QR image for the sale so the shopper can scan and pay.
  - A product scan prompt inviting the shopper to scan a barcode.
  - Rating widget (star rating) and an NPS-style scale from 0 to 10, both written back to the sale as customer feedback.
  - A "Recommend Us" recommendation prompt plus a customer-experience carousel.
  - Uses business profile and invoice settings to render logo and header content.
- **Interactions:**
  - Screen modes switch between a welcome/dashboard view and the live order view.
  - Tapping or hovering a star sets the rating and stores it immediately against the sale id.
  - Selecting a point on the 0â€“10 scale submits the feedback value for that sale.
  - Totals recalculate from the sale payload whenever the invoice details are refreshed.
  - The payment QR is loaded only when both a valid sale id and a business context exist.
- **Notable entities & workflows:**
  - sale_id, customer_name, business_name, business_profile, invoice_settings, invoice_header_logo_url, batch_no, batch_expiry_date, batch_mrp, batch_primary_pack, qty_packs, qty_units, payable_amount, sum_paid_amount, sum_balance_due, sum_payable_amount, sum_sale_invoice_amount, sum_sale_return_invoice_amount, sum_purchase_invoice_amount, sum_purchase_retrun_amount, sum_sale_profit, sum_sale_return_profit_forgone, customer_invoice_payment_qr_url, customer_nps, star_rating, recommendation_feedback
- **Backend operations:** `sales_get_sale_invoice_details`, `customer_update_feedback`
- **Notes:**
  - Feedback posts carry only the sale id plus the rating/scale value; customer identity is implied server-side.

<a id="sale-return-sale"></a>

### `/sale/return-sale`

- **Chunk of origin:** `static__chunks__pages__sale__return-sale-4aa5d7e15305c790.js`
- **What the user can do:**
  - Largest workflow in this set: create or edit a sale return (or a stock-return transfer) against an original invoice.
  - Picks the original sale by searching on invoice number, date or amount, then loads that invoice's line items and batch details.
  - Line-item grid with columns for medicine, batch, expiry, pack, quantity, MRP, rate, sale rate, GST and HSN, plus free-quantity and amount columns.
  - Batch selection per product with expiry filtering (expiring/expired highlighting) and a "recently sold products" shortcut list.
  - Return date, sale return number/prefix sequence, and a separate stock-return transfer number and date for transfer-type returns.
  - Settlement area: amount to refund, amount settled, balance due, credit due, custom charges, bill discount and an input-tax-credit claim toggle.
  - Payment capture against a business payment account with mode, reference/UTR number, date and cheque number/MICR details.
  - Payment modes include cash, cheque and other accounts; a "VIEW PAYMENTS" panel lists prior settlement rows.
  - Settings drawer (F2) exposing return date, common settings, prefix/sequence fetch and report-GST-for-return flag.
  - A warning/"Resolve Warnings" gate that blocks saving until outstanding validation warnings are cleared.
  - B2B Connect import: pulls candidate B2B sale returns for the customer and imports selected ones, with its own duplicate-debit-note detection.
  - E-invoicing: generates an IRN and updates the E-invoice status of the return.
  - Draft support: a return can be started as a draft, reloaded, edited and deleted.
  - Stock return transfer can be exported as an invoice and its transfer status synchronised.
  - View mode shows the saved return with an invoice preview and an export action.
- **Interactions:**
  - Barcode scanning or typed search adds a product row; quantity can be entered in units or packs.
  - Choosing a customer filters the list of invoices and eligible purchase returns.
  - Saving requires a valid customer, at least one product, a resolved warning set, and an entered return id for edits.
  - A duplicate debit note check runs before saving a B2B-imported return and blocks the save when a duplicate is detected.
  - Keyboard-first: Escape dismisses, Space selects, F2 opens settings, and an on-screen hint states the type-or-space-bar rule.
  - Each request surfaces a specific failure message for load, delete, save, IRN generation, prefix sequence and E-invoice update problems.
- **Notable entities & workflows:**
  - sale_id, sale_invoice_no, invoice_no, customer_id, customer_name, patient_name, product_id, medicine_name, batch_id, batch_no, batch_expiry_date, batch_mrp, batch_gst_rate, purchase_rate, return_transaction_quantity, return_transaction_rate, return_transaction_item_discount, return_transaction_gst_rate, hsn_code, gst_rate, return_date, return_number, credit_note_no, debit_note_no, payment_amount, payment_mode, payment_account_type_id, payment_reference_no, payment_date, cheque_no, cheque_date, cheque_micr, amount_settled, credit_due, balance_due, report_gst_for_sale_return, draft_id, e_invoice_status, prefix_sequence, sale_delivery_charge, sale_bill_discount, claim_input_tax
- **Backend operations:** `get_sale_return_details`, `add_sale_return_common`, `edit_sale_return_common`, `sales_delete_sale_return_common`, `sale_return_add`, `sale_return_edit`, `sale_return_delete`, `api_generate_new_sale_return_details`, `api_get_b2b_sale_returns`, `draft_get_drafts`, `draft_sync_draft`, `customers_get_customer_details`, `customers_get_customer_invoices`, `medicine_search_medicines`, `medicine_get_hsn_gst_rates`, `get_stock_batches_sale_return`, `get_stock_return_transfer_details`, `stock_return_transfer_export_invoice`, `sync_stock_return_transfer_status`, `sale_generate_sale_return_e_invoice`, `sale_update_e_invoiced_sale_return`, `business_get_prefix_sequence`, `get_payment_accounts`
- **Notes:**
  - The chunk contains console-style diagnostics ("API Response for loadSaleReturnDetails:", "Starting to load return details for ID:") that leak the operation flow into the client console.
  - Prefix/sequence is fetched per return so the printed number matches the configured invoice-numbering scheme.

<a id="sale-view-sales"></a>

### `/sale/view-sales`

- **Chunk of origin:** `static__chunks__pages__sale__view-sales-cf7125da98954e99.js`
- **What the user can do:**
  - Master screen for reviewing sales, split into two top-level sections: CUSTOMERS and SALES BY DATE.
  - Customer side renders a card list of customers with dues and totals, plus a customer-detail panel.
  - Customer detail panel has its own tabs: SALES, RETURNS, PAYMENTS and QUOTATION.
  - Sales-by-date side has tabs SALES, RETURNS and PAYMENTS for the selected date range.
  - Customer summary cards report gross sales, net sales, paid amount, due/outstanding, customer returns due, customer age and customer-since, with first-sale and last-transaction stamps.
  - Transaction tables expose invoice number, credit note number, payment invoice number, invoice amount, paid amount, payment mode, paid-on date, UTR reference, due date, status (Paid / Due / Due Cleared / Overdue / Expired / Converted), and refundable amount.
  - Date filters offer Today, Yesterday, Last 7 Days, Last 30 Days, Last Month, This Month plus custom from/to dates.
  - Search by customer name or GSTIN, with sort and filter controls that support an applied-filter summary and a reset.
  - Customer actions menu: edit customer, delete customer, merge customer, and convert a customer into a patient.
  - Sales-side actions include adding a customer, creating a sale return, sending a payment reminder, and downloading a customer statement.
  - Permission-aware: the sale-by-date tab is blocked without the sale_by_date_view permission, and returns viewing can be refused with a permission message.
  - Tracks drafts, quotations, proformas and e-invoice status as separate counts.
- **Interactions:**
  - Tab selection is keyboard driven (left/right arrows, Enter to select, ESC to close) and the selected section is persisted.
  - Selecting a customer card opens the customer detail panel; a customer can be converted to patient behind a confirmation prompt.
  - Merge and delete require choosing an option from a confirmation list, with explicit success toasts.
  - Infinite list scrolling loads more rows, and the list remembers its scroll position.
  - A customer "due" card opens a draggable dues panel showing gross sales and related money figures.
  - Statement download is offered per customer for the selected period.
- **Notable entities & workflows:**
  - customer_id, customer_name, customer_gstin, customer_mobile_number, customer_address, customer_gender, customer_age_in_years, customer_since_txt, customer_total_net, customer_sale_due, customer_return_due, customer_sale_duetotal_sales, customer_sale_duetotal_returns, sale_id, sale_invoice_no, sale_invoice_date, sale_invoice_amount, credit_note_no, payment_invoice_no, payment_amount, payment_mode, payment_date, payment_remarks, payment_status, payable_amount, refundable_amount, balance_due, adjustment_amount, net_sale_amount, net_profit, quotation_id, quotation_status_name, quotation_valid_till, sale_date, due_date, status, e_invoice_status, draft_message, drafts_count, proformas_count, from_date, to_date, date_range_type
- **Backend operations:** `sales_get_sales`, `customer_get_customers`, `customers_get_customer_details`, `customer_get_customer_filters`, `customer_get_customer_transactions`, `customer_merge_customers`, `convert_customer_to_patient`, `sales_get_sale_transactions_by_date`, `sales_get_sale_transactions_metrics`, `view_customer_item_from_global_search`, `refresh_customer_list`, `business_account_settings`
- **Notes:**
  - The screen mixes two different list paradigms: a card list for customers and a column table for transactions.
  - Sale-by-date visibility is gated on a named permission, so the same route renders differently by role.

<a id="sales-routes"></a>

### `/sales-routes`

- **Chunk of origin:** `static__chunks__pages__sales-routes-0155f90b9c97cdf0.js`
- **What the user can do:**
  - Manages the salesman's route plan: a list of routes, the customers assigned to each, and the salesman responsible.
  - Route card list shows route name, area name, assigned salesman and the mapped/unmapped customer counts.
  - Right-hand panel for the selected route has two tabs: CUSTOMERS MAPPED and PENDING TO MAP.
  - Unmapped customers can be mapped to the current route in bulk via a "MAP TO THIS ROUTE" action.
  - Mapped customers can be detached with a "REMOVE FROM THIS ROUTE" action.
  - A salesman picker lets the user choose or clear the route's salesman, with a "No Salesman Added" empty state when unset.
  - Route creation/editing modal captures the route name and area.
  - Customer list shows name, mobile number, email id, address lines and drug licence number.
  - Search boxes for routes, for a salesman by name or number, and for customers by name or GSTIN.
  - Infinite list loading with a "Load More" control, plus sort and filter panels with applied-filter display.
  - Header buttons: add a new customer, add a new route (F2), and edit the route (F4).
- **Interactions:**
  - Selecting a route loads its mapped and pending customer lists and its salesman mapping.
  - Mapping or removing customers triggers a refresh of both tabs and reports "Mapping Completed Successfully".
  - Assigning or removing a salesman persists the change and re-reads the route list.
  - The route editor opens as a modal and refreshes the list once saved.
  - Search and sort inputs update the corresponding list in place.
- **Notable entities & workflows:**
  - route_id, route_name, area_name, salesman_id, salesman_name, counter_user_id, customer_id, customer_name, customer_address_line_1, customer_address_line_2, customer_mobile_number, customer_drug_license_no, business_user_name, business_user_mobile_number, business_user_email, business_user_role_id, customers_to_map, customers_to_unmap, mapped_customer_count, non_mapped_customer_count, search_text, sort_by, sort_order, page_no
- **Backend operations:** `sales_get_sale_routes`, `sales_get_sale_route_filters`, `sales_get_route_customers`, `sales_sync_salesman_mapping`, `sale_update_customer_mapping`, `business_get_user_details`
- **Notes:**
  - Both "add route" and "add customer" open their own dialogs from the page header rather than separate routes.

