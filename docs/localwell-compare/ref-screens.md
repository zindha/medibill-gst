# LocalWell reference — consolidated screen inventory

Reference spec for the feature-parity audit. Every screen below was derived from the shipped reference front-end bundles; this document restates what each page does in our own words and keeps the original per-page evidence fields (route, chunk of origin, capabilities, interactions, data entities and backend operations).

## Method & conventions

- **Pages analysed:** 93 reference page bundles (`static/chunks/pages/**`) across the reference app's Next.js pages router, covering every screen in the shipped chunk set.
- **How routes were derived:** each page's route path is taken from its bundle filename (`static__chunks__pages__<section>__<page>-<hash>.js`); nested segments such as `[sale_id]`, `[stock_audit_id]`, `[report_id]`, `[ticket_id]`, `[order_id]`, `[distributor_id]` and `[...params]` are dynamic route parameters, so one bundle can serve several document kinds.
- **Backend calls:** the reference dispatches every backend call through a shared request helper that takes a *named service operation* (for example `business_get_profile`, `tickets_sync_tickets`). No page bundle contains a literal `/api/...` URL string — endpoint identity lives in a runtime service bundle that was not part of the page set. The `API` field on each page therefore lists the operation identifiers the page actually invokes, which is the closest observable equivalent of an endpoint path.
- **Operation catalogue:** `ref-api-operations.md` catalogues 552 distinct operation identifiers invoked by the reference UI; 272 of them resolve to concrete request paths (e.g. `business_get_profile` -> `/app/business/get_business_profile`, `customer_orders_get_orders` -> `/app/customer_order/get_orders`). The remaining 280 are invoked but were not recovered from the service registry.
- **Page fields:** `Features` = what the user can do on the page; `Interactions` = how the user drives it (keyboard shortcuts, modals, filters, workflows); `Entities` = the notable data objects the page works with; `API` = the named service operations it dispatches; `Notes` = behaviours worth calling out for parity work.
- **Status of this document:** this is the *reference* side of the comparison only. Coverage of our own app lives in `parity-matrix.md`; the API-side capability view lives in `ref-api-operations.md`.

## Table of contents

- **Sale & customers** (`sale`) — 6 page(s)
  - [`/sale/add-sale`](#sale-add-sale)
  - [`/sale/add-sale/[sale_id]`](#sale-add-sale-sale_id)
  - [`/sale/customer-facing-screen`](#sale-customer-facing-screen)
  - [`/sale/return-sale`](#sale-return-sale)
  - [`/sale/view-sales`](#sale-view-sales)
  - [`/sales-routes`](#sales-routes)
- **Invoices & document printing** (`invoices`) — 4 page(s)
  - [`/invoices/credit-note`](#invoices-credit-note)
  - [`/invoices/debit-note`](#invoices-debit-note)
  - [`/invoices/e-way-bill-view`](#invoices-e-way-bill-view)
  - [`/invoices/sale-invoice-new`](#invoices-sale-invoice-new)
- **Transactions** (`transactions`) — 4 page(s)
  - [`/transactions/sales`](#transactions-sales)
  - [`/transactions/purchases`](#transactions-purchases)
  - [`/transactions/sale-returns`](#transactions-sale-returns)
  - [`/transactions/purchase-returns`](#transactions-purchase-returns)
- **Reminders / patient follow-ups** (`reminders`) — 1 page(s)
  - [`/reminders/view-reminders`](#reminders-view-reminders)
- **Purchase** (`purchase`) — 6 page(s)
  - [`/purchase/add-purchase`](#purchase-add-purchase)
  - [`/purchase/banner/b2connectbanner`](#purchase-banner-b2connectbanner)
  - [`/purchase/import-csv`](#purchase-import-csv)
  - [`/purchase/return-expired-products`](#purchase-return-expired-products)
  - [`/purchase/return-purchase`](#purchase-return-purchase)
  - [`/purchase/view-purchases`](#purchase-view-purchases)
- **Orderbook (procurement workspace)** (`orderbook`) — 11 page(s)
  - [`/orderbook/dashboard`](#orderbook-dashboard)
  - [`/orderbook/distributors`](#orderbook-distributors)
  - [`/orderbook/distributors/[distributor_id]`](#orderbook-distributors-distributor_id)
  - [`/orderbook/order-analysis`](#orderbook-order-analysis)
  - [`/orderbook/product-list`](#orderbook-product-list)
  - [`/orderbook/products-already-to-order`](#orderbook-products-already-to-order)
  - [`/orderbook/purchase-orders`](#orderbook-purchase-orders)
  - [`/orderbook/purchase-orders/view-po-detail`](#orderbook-purchase-orders-view-po-detail)
  - [`/orderbook/shortbook`](#orderbook-shortbook)
  - [`/orderbook/view-cart`](#orderbook-view-cart)
  - [`/orderbook/view-cart/[order_id]`](#orderbook-view-cart-order_id)
- **Stocks** (`stocks`) — 9 page(s)
  - [`/stocks/adjust-stocks`](#stocks-adjust-stocks)
  - [`/stocks/bulk-update-settings`](#stocks-bulk-update-settings)
  - [`/stocks/stock-transfer/view-transfers`](#stocks-stock-transfer-view-transfers)
  - [`/stocks/update-stock-info`](#stocks-update-stock-info)
  - [`/stocks/upload-stocks`](#stocks-upload-stocks)
  - [`/stocks/view-stocks`](#stocks-view-stocks)
  - [`/stocks/stock-picklist`](#stocks-stock-picklist)
  - [`/stocks/print-barcode-labels`](#stocks-print-barcode-labels)
  - [`/stocks/print-barcode-labels/stock-scan-qr`](#stocks-print-barcode-labels-stock-scan-qr)
- **Stock audit** (`stock-audit`) — 4 page(s)
  - [`/stock-audit/view-audit/[stock_audit_id]`](#stock-audit-view-audit-stock_audit_id)
  - [`/stock-audit/view-batches/[stock_audit_id]`](#stock-audit-view-batches-stock_audit_id)
  - [`/stock-audit/view-products`](#stock-audit-view-products)
  - [`/stock-audit`](#stock-audit)
- **Dashboard** (`dashboard`) — 1 page(s)
  - [`/dashboard/view-dashboard`](#dashboard-view-dashboard)
- **Customer orders (B2B / marketplace side)** (`customer-orders`) — 4 page(s)
  - [`/customer-orders`](#customer-orders)
  - [`/customer-orders/business-kyc`](#customer-orders-business-kyc)
  - [`/customer-orders/order-detail`](#customer-orders-order-detail)
  - [`/customer-orders/promote-medcart`](#customer-orders-promote-medcart)
- **Reports** (`reports`) — 2 page(s)
  - [`/reports/business-reports`](#reports-business-reports)
  - [`/reports/business-report-view/[report_id]`](#reports-business-report-view-report_id)
- **Cash & bank** (`cash-and-bank`) — 3 page(s)
  - [`/cash-and-bank`](#cash-and-bank)
  - [`/cash-and-bank/account-statement`](#cash-and-bank-account-statement)
  - [`/cash-and-bank/cheque-management`](#cash-and-bank-cheque-management)
- **Expenses** (`expenses`) — 2 page(s)
  - [`/expenses/add-expense/[expense_id]`](#expenses-add-expense-expense_id)
  - [`/expenses/view-expenses`](#expenses-view-expenses)
- **Control centre** (`control-center`) — 10 page(s)
  - [`/control-center/business-profile`](#control-center-business-profile)
  - [`/control-center/bulk-edit-bills`](#control-center-bulk-edit-bills)
  - [`/control-center/migration`](#control-center-migration)
  - [`/control-center/integrations`](#control-center-integrations)
  - [`/control-center/layout`](#control-center-layout)
  - [`/control-center/picklist-settings`](#control-center-picklist-settings)
  - [`/control-center/plans-pricing`](#control-center-plans-pricing)
  - [`/control-center/prefix-sequences`](#control-center-prefix-sequences)
  - [`/control-center/refer-earn`](#control-center-refer-earn)
  - [`/control-center/sale-settings`](#control-center-sale-settings)
- **Integrations / partner onboarding** (`integrations`) — 6 page(s)
  - [`/integrations`](#integrations)
  - [`/integrations/aadhar-kyc`](#integrations-aadhar-kyc)
  - [`/integrations/business-detail`](#integrations-business-detail)
  - [`/integrations/kyc-docs`](#integrations-kyc-docs)
  - [`/integrations/partner_integrations`](#integrations-partner_integrations)
  - [`/integrations/verify-email`](#integrations-verify-email)
- **Settings** (`settings`) — 2 page(s)
  - [`/settings/subscriptions`](#settings-subscriptions)
  - [`/settings/users-devices`](#settings-users-devices)
- **Subscriptions** (`subscriptions`) — 1 page(s)
  - [`/subscriptions/checkout`](#subscriptions-checkout)
- **Support** (`support`) — 6 page(s)
  - [`/support/account-manager`](#support-account-manager)
  - [`/support/reset-account`](#support-reset-account)
  - [`/support/tickets/[ticket_id]`](#support-tickets-ticket_id)
  - [`/support/tickets/create-new-ticket`](#support-tickets-create-new-ticket)
  - [`/support/tickets`](#support-tickets)
  - [`/support/videos-resources`](#support-videos-resources)
- **Login & access** (`login`) — 8 page(s)
  - [`/login`](#login)
  - [`/login/create-password`](#login-create-password)
  - [`/login/login`](#login-login)
  - [`/login/login-exhausted`](#login-login-exhausted)
  - [`/login/register`](#login-register)
  - [`/login/subscription-expired`](#login-subscription-expired)
  - [`/login/support/[...params]`](#login-support-...params)
  - [`/login/switch-business`](#login-switch-business)
- **Miscellaneous** (`misc`) — 3 page(s)
  - [`/upload-migration-data`](#upload-migration-data)
  - [`/`](#root)
  - [`/_error`](#_error)

---

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
  - Selecting a point on the 0–10 scale submits the feedback value for that sale.
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

## Invoices & document printing

<a id="invoices-credit-note"></a>

### `/invoices/credit-note`

- **Chunk of origin:** `static__chunks__pages__invoices__credit-note-f8fee11555c19bd0.js`
- **What the user can do:**
  - Renders a printable credit note for a sale return, built from server-side HTML returned by the backend.
  - Header shows the note number, the creation date, and the invoice it belongs to.
  - A live HTML preview pane with zoom in/out, page selection and previous/next note navigation.
  - Print section offers a printer choice between laser/inkjet and a thermal receipt layout, with an export-as-PDF shortcut (F4).
  - A "Send Invoice (F2)" modal offering three channels: email, SMS and WhatsApp.
  - WhatsApp delivery uses a pre-formatted message text against the customer's mobile number via the WhatsApp web link.
  - PDF export writes a base64 PDF to a data URL and triggers a browser download.
  - Includes the returned line items and the return details with the products returned.
  - Header action to jump back to the originating sale.
- **Interactions:**
  - Arrow keys move between notes, Enter confirms a selection, ESC closes the menu.
  - Choosing a send channel posts the document with the selected channel and reports success or failure via snackbar.
  - Choosing a printer layout swaps the preview between HTML and thermal representations.
  - Export-as-PDF and page navigation operate on the currently loaded note only.
- **Notable entities & workflows:**
  - sale_return_id, credit_note_no, note_type, sale_return_date, sale_return_detail, return_detail, return_products, products_returned, business_id, business_type_id, document_id, document_type, target_mobile_no, whatsapp_text, sms_credits, invoice_html, html_preview, zoom_level, page_params, page_size, prev_sale_return_id, next_sale_return_id
- **Backend operations:** `sales_get_sale_return_invoice_details`, `sales_get_sale_return_invoice_html`, `orderbook_send_document`, `convert_to_pdf`
- **Notes:**
  - Both the credit-note and debit-note chunks share the same invoice-preview component and differ only in document type and endpoint.

<a id="invoices-debit-note"></a>

### `/invoices/debit-note`

- **Chunk of origin:** `static__chunks__pages__invoices__debit-note-9af3314eeb6f8995.js`
- **What the user can do:**
  - Printable debit note for a purchase return, the purchase-side mirror of the credit note.
  - Header shows the debit note number and the creation date, alongside the source purchase return.
  - Live HTML preview with zoom, page selection and previous/next note navigation.
  - Print section offers laser/inkjet versus thermal receipt layouts, plus export-as-PDF (F4).
  - A "Send Invoice (F2)" modal with email, SMS and WhatsApp channels.
  - WhatsApp delivery sends a prepared message to the target mobile number.
  - Body lists the returned products and the purchase return details.
  - Header action links back to the originating purchase.
- **Interactions:**
  - Arrow keys move between notes, Enter commits a choice, ESC dismisses.
  - The selected send channel is posted with the document and the outcome is reported via snackbar.
  - Printer selection toggles the preview representation.
  - Export writes a base64 PDF and triggers a download.
- **Notable entities & workflows:**
  - purchase_return_id, debit_note_no, credit_note_no, note_type, purchase_return_date, purchase_return_detail, return_detail, return_products, products_returned, purchase_return, business_id, business_type_id, document_id, document_type, target_mobile_no, whatsapp_text, sms_credits, invoice_html, html_preview, zoom_level, page_params, page_size, prev_purchase_return_id, next_purchase_return_id
- **Backend operations:** `purchases_get_purchase_return_invoice_details`, `purchases_get_purchase_return_invoice_html`, `orderbook_send_document`, `convert_to_pdf`
- **Notes:**
  - Functionally identical to the credit-note screen apart from the purchase-return data source.

<a id="invoices-e-way-bill-view"></a>

### `/invoices/e-way-bill-view`

- **Chunk of origin:** `static__chunks__pages__invoices__e-way-bill-view-2c30f83a6b5106f8.js`
- **What the user can do:**
  - Read-only viewer for the e-way bill attached to a sale invoice.
  - Shows the e-way bill number, the date it was generated, and the date it stays valid until.
  - Renders the bill as server-produced HTML in a preview pane with zoom and page selection.
  - Export-as-PDF (F4) writes a base64 PDF and downloads it as an e-way-bill file.
  - Header shows the invoice number and invoice date for cross-reference.
  - A back button returns to the previous screen.
- **Interactions:**
  - Loads the bill from the invoice endpoint with the e-way-bill flag set, and shows a loading message while fetching.
  - Shows an explicit failure message when the bill cannot be retrieved.
  - Auto-download can be triggered once the bill has loaded.
  - The back action pops the current route.
- **Notable entities & workflows:**
  - sale_id, ewb_no, ewb_date, ewb_valid_till, generated_date, valid_upto, invoice_html, page_size, zoom_level
- **Backend operations:** `sales_get_sale_invoice_details`, `convert_to_pdf`
- **Notes:**
  - The e-way bill is fetched as a variant of the sale-invoice endpoint rather than a dedicated endpoint.

<a id="invoices-sale-invoice-new"></a>

### `/invoices/sale-invoice-new`

- **Chunk of origin:** `static__chunks__pages__invoices__sale-invoice-new-ddb27b2e0f0e12a1.js`
- **What the user can do:**
  - Sale-invoice viewer/print screen built around a server-rendered invoice HTML preview.
  - Header shows invoice number, invoice date and the invoice status chips (Sale, Credit, Paid, Proforma).
  - Preview pane supports zoom in/out and page selection, with previous/next invoice navigation.
  - Print section offers laser/inkjet, thermal receipt, and dot-matrix A5/A6 layouts, with export-as-PDF (F4).
  - Dot-matrix rendering has separate templates for A5 and A6 paper sizes.
  - A "Send Invoice (F2)" modal offers email, SMS and WhatsApp channels.
  - WhatsApp sharing links to the online store, so the customer can also shop there.
  - A language switcher (English plus three regional languages) and a "Watch Tutorial" video modal for invoice guidance.
  - Customer summary panel shows name, mobile number, age, first-sale date and total customer net value, with a link to edit the customer.
  - Quotation details are shown inline when the source document is a quotation, including the validity date.
  - Websocket status is tracked so live connectivity loss can be surfaced.
  - Link to jump to the sale screen and to the previous/next sale in the list.
- **Interactions:**
  - Page size (80mm thermal, A5, A6) and printer type select which template renders in the preview.
  - Sending by SMS, email or WhatsApp posts the invoice for that channel and confirms with a snackbar ("SMS Sent", "Invoice Mailed").
  - Previous/next navigation steps through invoices, with a busy state during the fetch.
  - The tutorial modal plays an embedded video chosen by the selected language.
  - The language dropdown switches the tutorial/invoice language immediately.
- **Notable entities & workflows:**
  - sale_id, sale_invoice_no, sale_invoice_date, invoice_data, invoice_html, thermal_invoice_html, thermal_invoice_desktop, dot_matrix_string, dot_matrix_a5_html, dot_matrix_a6_html, thermal_printer_content, invoice_settings, invoice_page_size, page_size, zoom_level, customer_id, customer_name, customer_mobile_number, customer_net, customer_total_net, first_sale_date, quotation_id, quotation_valid_till, total_invoice_amount, payable_amount, next_sale_id, previous_sale_id, sms_credits, online_store_url, websocket_status, video_id, language_list, email_send_flag, show_send_invoice_modal
- **Backend operations:** `sales_get_sale_invoice_details`, `customers_get_customer_details`, `sales_email_distribution_sale_invoice`, `sms_send_invoice_sms`, `convert_to_pdf`
- **Notes:**
  - The PDF is delivered as a base64 data URL rather than a binary stream, so the export path is entirely client-side.

## Transactions

<a id="transactions-sales"></a>

### `/transactions/sales`

- **Chunk of origin:** `static__chunks__pages__transactions__sales-8b5958d7bd7bf11f.js`
- **What the user can do:**
  - Thin transaction-list screen that renders a shared invoices widget configured for the sales category.
  - The widget is given a tab identifier of 1 and the label "Sales" with an always-on count display.
  - Wrapped in the common page container so it inherits the standard header, filter and footer scaffold.
  - Sets the page title to "View Invoices ".
  - Clears the previously selected sale/return detail when the screen mounts, so no stale selection persists.
- **Interactions:**
  - The shared widget owns filtering, sorting, keyboard row selection and pagination for the listed transactions.
  - Because the screen is a category wrapper, adding a transaction type means adding another wrapper rather than new logic.
- **Notable entities & workflows:**
  - view_sale_selected_details, id, title, count, show_count
- **Backend operations:** `view_sale_selected_details`
- **Notes:**
  - No data endpoint is referenced in this chunk; the list is loaded entirely by the shared invoices component.

<a id="transactions-purchases"></a>

### `/transactions/purchases`

- **Chunk of origin:** `static__chunks__pages__transactions__purchases-c206b38324c7b744.js`
- **What the user can do:**
  - Thin transaction-list screen wrapping the shared invoices widget for the purchases category.
  - The widget is given a tab identifier of 2 and the label "Purchases" with an always-on count display.
  - Uses the same page container scaffold as the sibling transaction screens.
  - Sets the page title to "View Invoices ".
  - Clears the previously selected sale/return detail on mount.
- **Interactions:**
  - Filtering, sorting and pagination of purchase rows are handled by the shared widget.
  - Navigation between the four transaction categories is the only page-specific behaviour.
- **Notable entities & workflows:**
  - view_sale_selected_details, id, title, count, show_count
- **Backend operations:** `view_sale_selected_details`
- **Notes:**
  - Identical in shape to the sales wrapper apart from the tab id and title.

<a id="transactions-sale-returns"></a>

### `/transactions/sale-returns`

- **Chunk of origin:** `static__chunks__pages__transactions__sale-returns-2ad30bbee681f2a7.js`
- **What the user can do:**
  - Thin transaction-list screen wrapping the shared invoices widget for the sale-returns category.
  - The widget is given a tab identifier of 3 and the label "Sale Returns" with an always-on count display.
  - Uses the shared page container scaffold and sets the page title to "View Invoices ".
  - Clears the previously selected sale/return detail on mount.
- **Interactions:**
  - The shared widget provides filtering, sorting and paging for return documents.
  - Category switching between transactions happens outside this screen.
- **Notable entities & workflows:**
  - view_sale_selected_details, id, title, count, show_count
- **Backend operations:** `view_sale_selected_details`
- **Notes:**
  - Functionally a category switch over one shared component.

<a id="transactions-purchase-returns"></a>

### `/transactions/purchase-returns`

- **Chunk of origin:** `static__chunks__pages__transactions__purchase-returns-9fe1b3e36a8fca7a.js`
- **What the user can do:**
  - Thin transaction-list screen wrapping the shared invoices widget for the purchase-returns category.
  - The widget is given a tab identifier of 4 and the label "Purchase Returns" with an always-on count display.
  - Uses the shared page container scaffold and sets the page title to "View Invoices ".
  - Clears the previously selected sale/return detail on mount.
- **Interactions:**
  - Row filtering, sorting and paging come from the shared widget.
  - The screen itself only selects which transaction type the widget shows.
- **Notable entities & workflows:**
  - view_sale_selected_details, id, title, count, show_count
- **Backend operations:** `view_sale_selected_details`
- **Notes:**
  - The fourth and final tab of the same shared transaction widget.

## Reminders / patient follow-ups

<a id="reminders-view-reminders"></a>

### `/reminders/view-reminders`

- **Chunk of origin:** `static__chunks__pages__reminders__view-reminders-cf12f85f82f587f2.js`
- **What the user can do:**
  - "PATIENT FOLLOW-UPS" screen for tracking customers who need a reminder or revisit prompt.
  - Two-level layout: a reminders list on the left and a patient-detail panel on the right.
  - Reminder rows show customer/patient identity, follow-up type, due or follow-up date, medicine and brand/generic names, and a pending versus followed-up badge.
  - Filters by follow-up type, date range (including a minimum follow-up date), status, search text and sort order, with an applied-filters summary and a reset action.
  - Bulk selection via checkboxes with select-all, plus a dropdown action menu per row (edit, delete, mark as helpful/not helpful).
  - Patient panel shows contact number, address, age, gender, prescription type, last-bought and next-refill quantities with dates, remaining units, and a "Check Current Stock" action.
  - Analytics strip for the patient: sales count, total sales, average order value, average revisit frequency, first-sale and last-sale dates.
  - A sales-history panel lists the patient's prior invoices and amounts.
  - A follow-up composer adds remarks or posts an update against the follow-up.
  - Composition tracking links a reminder to a dispensed medicine composition so the context is visible.
  - A dropped-off flag separates customers who stopped buying from active ones.
- **Interactions:**
  - Selecting a reminder loads that patient's details and follow-up history, including the metrics toggle.
  - Search, filter and sort changes re-query the list from page one.
  - Scrolling to the bottom loads the next page of reminders.
  - Marking a follow-up helpful or not helpful writes the classification and restyles the row.
  - Editing a follow-up opens the edit form; deleting requires confirmation.
  - Patient details can be edited for both the customer record and the patient record.
- **Notable entities & workflows:**
  - followup_id, followup_note, followup_note_id, followup_type_id, followup_date, next_refill_date, next_refill_quantity_in_units, last_sale_date, last_sale_quantity_in_units, remaining_qty_units, patient_id, patient_name, patient_mobile_number, patient_address, patient_age_in_years, patient_gender, prescription_type, customer_id, customer_mobile_number, customer_metrics, customer_details, composition_id, composition_name, medicine_id, medicine_name, bu_name, active_count, dropped_off_count, dropped_off_flag, importance_score, avg_order_value, avg_order_freq, sales_count, total_sales, first_sale_date, search_text, page_no
- **Backend operations:** `followup_get_followup_list`, `followup_get_patient_followups`, `followups_get_patient_details`, `followup_update_followup`, `get_followup_filters`
- **Notes:**
  - The follow-up list payload takes a follow-up type plus filter/sort payloads, so the type tab drives the query shape.

## Purchase

<a id="purchase-add-purchase"></a>

### `/purchase/add-purchase`

- **Chunk of origin:** `static__chunks__pages__purchase__add-purchase-79a38d8585f0a26e.js`
- **What the user can do:**
  - Manual purchase bill form: distributor, invoice number, invoice date, payment due date and purchase type, with a switch between invoice and delivery challan documents
  - Product line grid with pack, box, quantity, free quantity, MRP, rate, purchase rate, sale rate, batch and expiry columns; expired batches are visually flagged
  - Medicine/barcode search with a type-ahead picker and keyboard-driven selection ("Type or Press Space")
  - Batch selection drawer listing batch number, pack, expiry, MRP and prior sale history for each batch of a medicine
  - HSN code and GST rate lookup per medicine, plus a toggle for bills that carry GST versus bills outside GST
  - Per-line discount and markup editing, an overall bill discount, and a "More Settings" panel
  - Margin and markup reference bases selectable per distributor: MRP, PTR, purchase rate and net purchase rate
  - Custom charges (for example freight or delivery) as separate charge lines with user-defined charge types
  - Payment block: total payable, amount paid, payment mode, cheque details, credit period and available credit
  - Challan-based flow: select a distributor's delivery challans, then either merge them into one invoice or split their products into a separate invoice
  - Bill image upload with automatic invoice number/date detection, and a duplicate-bill warning when the same bill number is re-entered
  - Import entry points for CSV bill import and B2B Connect import, with attach-CSV/attach-PDF on the bill; expiry buckets (under 3, 6, 9, 12 months), a near-expiry toggle, per-user column settings, settlement of unpaid purchase returns, and Approve/Reject on stock transfers raised from the purchase
- **Interactions:**
  - Save uses the Alt+S shortcut and there is an Alt+E+A shortcut to edit all rows at once
  - Confirm dialogs guard delete, back-navigation and stock-transfer approve/reject
  - A warning panel lists data issues to resolve (with ignore-all), and a "This Bill is Duplicate" prompt blocks saving
  - A tutorial walkthrough and a "Watch Tutorial" link are available in the screen chrome
  - Export of the finished purchase to PDF and CSV formats
- **Notable entities & workflows:**
  - distributor, invoice number, invoice date, payment due date, purchase type, challan, medicine, batch number, batch expiry, pack, box, qty, free qty, MRP, PTR, purchase rate, sale rate, HSN, GST rate, tax, discount, markup, margin, custom charge, payment mode, cheque details, credit period, available credit, stock transfer, column settings, unpaid purchase return
- **Backend operations:** `create_purchase_custom_charge`, `distributor_get_purchase_detail_from_csv`, `distributors_get_challans_for_distributor`, `distributors_get_distributor_csv_method`, `distributors_get_distributor_details`, `medicine_get_hsn_gst_rates`, `medicine_search_medicines_for_purchase`, `orderbook_import_purchase`, `purchase_add_purchase`, `purchase_delete_purchase`, `purchase_edit_purchase`, `purchase_get_purchase_bill_info`, `purchase_get_purchase_details`, `purchase_get_sale_custom_charge`, `purchase_invoice_detect`, `purchases_get_products_for_purchase_challans`, `purchases_get_purchase_column_settings`, `purchases_get_unpaid_purchase_returns`, `purchases_get_unpaid_purchase_returns_summary`, `purchases_sync_purchase_column_settings`, `stock_transfer_update_stock_transfer`, `stocks_get_stock_batches_purchase`
- **Notes:**
  - Largest chunk in this set; the screen is a multi-mode form (manual entry, challan merge, CSV import, B2B Connect import) sharing one draft
  - Draft identifiers are tracked separately for the bill view, edit flow and transfer flow
  - Margin/markup reference basis is stored per distributor and per item

<a id="purchase-banner-b2connectbanner"></a>

### `/purchase/banner/b2connectbanner`

- **Chunk of origin:** `static__chunks__pages__purchase__banner__b2connectbanner-c6129bb3006363f0.js`
- **What the user can do:**
  - Full-width promotional banner rendered above page content with a purple gradient background
  - A small pill-shaped chip on the left, defaulting to "Good News", followed by a short message
  - A bold call-to-action on the right with a chevron/redirect icon, defaulting to "See Video"
  - Fully self-contained inline styling; no design-system or component library usage
  - Props allow a custom chip text, banner message, call-to-action text, icon source and click handler
- **Interactions:**
  - Clicking the call-to-action fires the supplied handler; without one the pointer is styled as non-interactive
  - Icon source is configurable, so callers can point at their own asset instead of the bundled redirect arrow
- **Notable entities & workflows:**
  - chip text, banner message, call-to-action text, call-to-action icon, on-click handler
- **Backend operations:** 
- **Notes:**
  - Route exists only to register the component; it makes no backend calls and renders a presentational strip only

<a id="purchase-import-csv"></a>

### `/purchase/import-csv`

- **Chunk of origin:** `static__chunks__pages__purchase__import-csv-0b6c2f17aa8b8f93.js`
- **What the user can do:**
  - CSV purchase-import screen that reuses the purchase draft context (distributor, district, invoice number, invoice date, GST flag, challan flag)
  - Parses imported rows into draft product lines, then matches each row against the medicine catalogue
  - Shows suggested product mappings, including fuzzy-match suggestions with a match score
  - Lets the user pick a different existing medicine, or create a new medicine when no match is acceptable
  - Verifies every mapping before the import is committed, with a warning that all mappings must be correct
  - Shows in-stock quantity for each mapped product so the user can sanity-check the quantities
  - Displays a per-step progress state for importing and for cancelling an in-flight import
  - Warns that progress is lost if the user navigates back mid-import
- **Interactions:**
  - Search fields type-ahead for selecting products and companies
  - A verify/apply step gates the import; a dedicated progress indicator shows the current stage
  - Cancelling an import is offered as an explicit action while processing
- **Notable entities & workflows:**
  - CSV row, imported product line, medicine mapping, fuzzy match score, pack, primary pack, company, stock detail, in-stock quantity, import type
- **Backend operations:** `medicine_search_medicines`, `medicines_show_fuzzy_mappings`, `stocks_get_stock_details_for_purchase`
- **Notes:**
  - Mapping is the core of the screen; the fuzzy-match endpoint supplies candidate medicines
  - Stock detail is fetched per mapped product to display availability

<a id="purchase-return-expired-products"></a>

### `/purchase/return-expired-products`

- **Chunk of origin:** `static__chunks__pages__purchase__return-expired-products-6c4870602348c05e.js`
- **What the user can do:**
  - "Purchase Expiry Return" screen for sending expired or slow-moving stock back to the supplier
  - Distributor picker with a type-ahead search over name or GSTIN, plus district-name filtering
  - Category tabs covering expired items, near-expiry items, slow-moving products and expired products that still have purchase history
  - Expiry-age filter expressed in days, with quick date presets (today, yesterday, last 7/30 days, this month)
  - Product rows show batch number, pack, stock quantity, MRP, expiry date and invoice date
  - Optional fields that can be filled in for the return, marked as not mandatory
  - A "Proceed to Load" step that loads matching stock for the chosen distributor and filters
  - Cash appears as a settlement hint for the return
  - Rows can be edited, deleted and the date fields accept typed date input
- **Interactions:**
  - Distributor selection opens a searchable list filtered by the entered text
  - Applying the filter refreshes the product list for that distributor
  - Proceed to load runs the stock lookup and populates the grid
- **Notable entities & workflows:**
  - distributor, GSTIN, district, expiry date, product age in days, batch number, pack, stock, MRP, invoice date, purchase history, cash settlement
- **Backend operations:** `distributors_get_master_distributors`, `stocks_get_expired_products`
- **Notes:**
  - Thin screen: it reuses the shared return machinery but only for expiry-driven stock
  - Expiry-age window and distributor are the two inputs that drive the query

<a id="purchase-return-purchase"></a>

### `/purchase/return-purchase`

- **Chunk of origin:** `static__chunks__pages__purchase__return-purchase-1901213e2740068c.js`
- **What the user can do:**
  - Two return modes in one screen: a purchase return (debit note) and a stock return transfer to a distributor
  - Distributor picker with name/GSTIN search, district filtering and a warning when the distributor has no GST number
  - Return type must be selected before the form is usable, with "Fill in the details below to load" guidance
  - Header fields: invoice number, return date, goods-returned-on date, distributor reference and a product-age/day window
  - Auto-load of items for return, plus separate loaders for expired or near-expiry stock and for slow-moving stock
  - Manual item addition by medicine search or barcode scan, with a per-row adjustment panel for discount, scheme and free quantity
  - Product grid columns cover product, batch number, pack, expiry, stock, purchase rate, effective purchase rate, MRP, net rate, tax, discount, amount, taxable amount, GST and balance
  - Debit-note handling with an explicit "Claim GST in Debit Note" choice, and a GSTIN/drug-licence field that can be added
  - Payment accounts for refunds, with refundable amount and amount-refunded shown
  - Stock return transfer can be synced to the backend and its transfer detail viewed and downloaded as an invoice
  - Date presets and expiry-from loader let the user bound the return by age
- **Interactions:**
  - Keyboard-first flow: F2 applies, Proceed and Save uses Alt+S, arrow keys and space select list items
  - Row-level delete and edit, with confirmations for deleting a product and for leaving the screen
  - "Show Invoice" opens the linked purchase invoice for a returned item
  - A tutorial link and an instructional help panel are available
- **Notable entities & workflows:**
  - return type, distributor, GSTIN, drug licence, invoice number, return date, goods returned on, product age, batch, pack, expiry, stock, purchase rate, effective purchase rate, MRP, net rate, tax, discount, scheme, free quantity, amount, taxable amount, GST, balance, refundable amount, amount refunded, round off, debit note, payment account, stock return transfer
- **Backend operations:** `distributors_get_distributor_details`, `distributors_get_master_distributors`, `get_payment_accounts`, `get_stock_return_transfer_details`, `medicine_search_medicines_for_purchase_return`, `purchase_add_purchase_return`, `purchases_delete_purchase_return`, `purchases_edit_purchase_return`, `purchases_get_purchase_return_details`, `stock_return_transfer_export_invoice`, `stocks_get_stock_batches_purchase_return`, `sync_stock_return_transfer`
- **Notes:**
  - One of the two largest chunks; the return form is shared between purchase return and stock transfer variants
  - Return quantity is entered in packs, and scheme quantities are tracked per purchase transaction

<a id="purchase-view-purchases"></a>

### `/purchase/view-purchases`

- **Chunk of origin:** `static__chunks__pages__purchase__view-purchases-6bf38b68dcfa1a29.js`
- **What the user can do:**
  - Ledger screen with top-level tabs for purchases, returns, payments and distributors
  - Date-wise purchase transaction list for the selected day, plus a per-distributor transaction view
  - Distributor master list with contact, GST number, drug licence, credit period and balance due
  - Distributor summary figures: total purchase, total returns, purchase due, return due and opening balance
  - Action menu per distributor to edit, delete or merge distributor records, with a merge confirmation step
  - "Party Verified from GSTIN Records" marker next to distributors whose details came from GST records
  - Statement download for a distributor, including a separate statement download for the current distributor
  - Shortcuts to start a new purchase, a purchase return or a payment against a distributor
  - A premium badge indicator for business users
  - View state is remembered per tab (purchase view, return view, distributor view)
- **Interactions:**
  - Tabs switch between purchases, returns, payments and distributors
  - Selecting a distributor opens its details and transaction list
  - Option menus gate destructive actions behind explicit confirmation text
- **Notable entities & workflows:**
  - purchase transaction, return transaction, payment, distributor, contact, GST number, drug licence, credit period, total purchase, total returns, purchase due, return due, opening balance, transaction date, statement
- **Backend operations:** `distributor_get_distributor_transactions`, `distributors_get_distributor_details`, `distributors_merge_distributors`, `purchase_get_purchase_transactions_by_date`
- **Notes:**
  - Destructive distributor operations (delete, merge) are implemented through the same option-menu pattern
  - Merge is treated as a distinct, separately confirmed flow from edit

## Orderbook (procurement workspace)

<a id="orderbook-dashboard"></a>

### `/orderbook/dashboard`

- **Chunk of origin:** `static__chunks__pages__orderbook__dashboard-0e6373141d74b7dc.js`
- **What the user can do:**
  - Orderbook home with summary cards: items in cart, items that are in order, items finalized for order, and stock items in shortage
  - Sections for local distributors, products from the powerhouses, products by stock category, and a pending-orders list
  - Popular-brands panel showing the most ordered medicine companies
  - Recent purchase-order list with order number, distributor, amount, SKUs, status, age, created/created-by/updated columns
  - Shortbook settings dialog with min stock, max stock, reorder point in days, period for demand calculation and seasonality in demand calculation
  - Same-period-demand-from-previous-year toggle used for shortage calculation
  - Settings are saved back to the server and can be reloaded for verification
  - Search field for the dashboard plus a tutorial link
  - Stock-category filter list and distributor locality filter
- **Interactions:**
  - Shortbook settings open with the F2 shortcut and can be applied from the same dialog
  - Summary cards link onward to cart, shortbook, order analysis and purchase orders
  - Settings dialog validates and confirms the updated values before saving
- **Notable entities & workflows:**
  - summary card, item in cart, item in order, finalized item, shortage item, shortbook setting, min stock, max stock, reorder point, demand calculation period, demand seasonality, previous-year demand, stock category, distributor, popular brand, purchase order, order status, order amount, SKU count, business user name
- **Backend operations:** `get_distributors_for_orderbook`, `orderbook_get_popular_medicine_companies`, `orderbook_get_purchase_orders`, `orderbook_get_settings`, `orderbook_get_stock_categories`, `orderbook_get_summary`, `orderbook_sync_settings`
- **Notes:**
  - Dashboard aggregates four separate backend summaries rather than one payload
  - Shortbook settings are shared with the shortbook screen

<a id="orderbook-distributors"></a>

### `/orderbook/distributors`

- **Chunk of origin:** `static__chunks__pages__orderbook__distributors-17f7d3add71aefcd.js`
- **What the user can do:**
  - List of all distributors from the user's locality, with a name/GSTIN search box
  - District-name filter for narrowing the list
  - "Add New Distributor" action that opens a request-mapping flow
  - Two mapping options are presented side by side: entering a customer code from the distributor's bill, or sending a mapping request to the distributor
  - A customer code input with a "Map to" target distributor for the bill-based route
  - Mapping request can be sent immediately or the distributor can be invited to become a new LocalWell customer
  - Route navigates into a per-distributor product list once a distributor is chosen
  - Keyboard navigation hints (Enter, Space, arrow keys, F2, ESC) are surfaced in the UI
- **Interactions:**
  - Selecting a distributor opens its product list
  - Choosing a mapping option reveals the matching form (customer code vs request send)
  - Mapping request is submitted with Enter and the result is confirmed back to the user
- **Notable entities & workflows:**
  - distributor, GSTIN, district, locality, customer code, mapping request, business selected district, search text
- **Backend operations:** `get_distributors_for_orderbook`, `orderbook_request_mapping_with_distributor`
- **Notes:**
  - The page is the entry point for mapping a distributor via bill customer code or a self-service request
  - Search and district selection both narrow the same distributor list

<a id="orderbook-distributors-distributor_id"></a>

### `/orderbook/distributors/[distributor_id]`

- **Chunk of origin:** `static__chunks__pages__orderbook__distributors__[distributor_id]-c8bc85a47aaa915a.js`
- **What the user can do:**
  - Product list of a single distributor's catalogue, opened from the distributor list
  - Each product row shows the medicine with its pack information and current stock
  - Products can be added to the order cart directly from the list
  - An "add to cart" bulk action places the visible products into the cart
  - A "View Cart" shortcut jumps to the cart with the items just added
  - Banner invites a distributor that is not yet on LocalWell to join so they receive step-by-step order updates
  - Router param is the distributor identifier; the screen is a thin list view
- **Interactions:**
  - Selecting "Add to Cart" pushes the listed products into the cart
  - The invite call-to-action is shown only when the distributor is not on the platform
  - Go Back returns to the distributor list
- **Notable entities & workflows:**
  - distributor id, medicine id, product, pack, stock, cart, add-to-cart action
- **Backend operations:** `orderbook_get_distributor_products`, `orderbook_sync_cart`
- **Notes:**
  - Smallest functional page in the set; it is basically the distributor catalogue with cart push
  - The cart write is shared with the shortbook and order-analysis screens

<a id="orderbook-order-analysis"></a>

### `/orderbook/order-analysis`

- **Chunk of origin:** `static__chunks__pages__orderbook__order-analysis-d84906d61276511b.js`
- **What the user can do:**
  - "Order Analysis" screen listing all ordered items with their fulfilment status
  - Filter set covering company, category, location, stock type and a free-text product search
  - Date-range presets (today, yesterday, last 7/30 days, this month) alongside a calendar picker
  - Table columns: product name / company / category, ordered, arrived, shortage, pending, min|max stock, order count, location, image and last order
  - A row-level action adds the item to the cart
  - Bulk add-to-cart for selected items
  - Export of the analysis to XLS
  - Table is keyboard navigable with arrow keys and space for selection
  - Company, category and location lists are loaded from shared stock filters
- **Interactions:**
  - Filters are applied with F2 and the filter drawer shows the selected option
  - Rows are selected with space and can be bulk added to the cart
  - Export produces an XLS file, with a progress state while it runs
- **Notable entities & workflows:**
  - medicine company, category, stock location, stock type, product form, ordered, arrived, shortage, pending, min stock, max stock, order count, last order, order quantity, cart, export file
- **Backend operations:** `orderbook_export_order_analysis`, `orderbook_get_order_analysis`, `orderbook_sync_cart`, `stock_audit_get_filters`
- **Notes:**
  - Reuses the stock-audit filter set rather than defining its own
  - Analysis rows are the same entities the shortbook screen orders against

<a id="orderbook-product-list"></a>

### `/orderbook/product-list`

- **Chunk of origin:** `static__chunks__pages__orderbook__product-list-dbc6e278ad126545.js`
- **What the user can do:**
  - Route registration only: the chunk declares the /orderbook/product-list page path
  - Ships a minimal style module with the shared Poppins font stack and a placeholder class
  - Contains no screen logic, no data fetching and no user-facing components
  - Effectively a placeholder left behind by the bundler for this route
- **Interactions:**
  - None: the chunk has no interactive code paths
- **Notable entities & workflows:**
  - route path, font family, placeholder class
- **Backend operations:** 
- **Notes:**
  - Treat as a dead/placeholder route, not a real screen
  - Worth confirming with the parent whether the reference app exposes a real product list elsewhere

<a id="orderbook-products-already-to-order"></a>

### `/orderbook/products-already-to-order`

- **Chunk of origin:** `static__chunks__pages__orderbook__products-already-to-order-e5085b2f72c42083.js`
- **What the user can do:**
  - Conflict review screen for products that are already covered by an in-flight order
  - Two grouped lists: products already in order and products ordering now
  - Rows show distributor, order number, order amount, SKU count, status, age, created, created-by and updated columns
  - A resolution section explains the conflicts detected in the current order
  - The user confirms and finishes placing the order, dropping the conflicting quantities
  - Checkout is validated against the cart before the order is finalized
  - Order status identifier is carried through the screen
  - The screen also links onward to the cart
- **Interactions:**
  - "Finish Placing Order" (F2) commits the order after conflicts are resolved
  - Validation runs before checkout and blocks the order if the cart is not acceptable
- **Notable entities & workflows:**
  - product already in order, product ordering now, order conflict, distributor, order number, order amount, SKU count, order status, age, created by, updated, checkout, validation
- **Backend operations:** `orderbook_checkout_cart`, `orderbook_validate_checkout`
- **Notes:**
  - This is the last-mile guard before a purchase order is submitted
  - Data comes from the same cart/validation pair used by the cart detail screen

<a id="orderbook-purchase-orders"></a>

### `/orderbook/purchase-orders`

- **Chunk of origin:** `static__chunks__pages__orderbook__purchase-orders-7980a120069147b1.js`
- **What the user can do:**
  - Purchase-order list, shown distributor-wise, with order number, distributor, amount, SKU count, status, age, created, created-by and updated columns
  - Search across order number or supplier
  - Status filter fed by a master list of customer-order statuses
  - Date-range filter with a calendar picker and presets (today, yesterday, last 7/30 days, this month)
  - Export of purchase-order items to Excel
  - Quick links to order analysis and to the order cart
  - Keyboard-navigable table with row selection
- **Interactions:**
  - Search and status filter narrow the list; filters are applied with F2
  - Selecting a row opens the purchase-order detail screen
  - Excel export runs with a visible progress state
- **Notable entities & workflows:**
  - purchase order, order number, distributor, order amount, SKU count, order status, age, created at, created by, updated at, date range, export file
- **Backend operations:** `customer_orders_get_master_order_statuses`, `orderbook_get_purchase_order_items_excel`, `orderbook_get_purchase_orders`
- **Notes:**
  - Status filter values come from a shared master-status endpoint
  - The Excel export is report-hosted rather than on the node API

<a id="orderbook-purchase-orders-view-po-detail"></a>

### `/orderbook/purchase-orders/view-po-detail`

- **Chunk of origin:** `static__chunks__pages__orderbook__purchase-orders__view-po-detail-596d8bc13d8ccea9.js`
- **What the user can do:**
  - Purchase-order detail screen with the order status and the distributor it was placed with
  - Order timeline showing the order-placed-with entity, and document versions such as Original and Recommended
  - Print, PDF export and Excel export options for the purchase order
  - Send the order document by email or WhatsApp, and a generic "send document" action
  - A "mark as delivered" action that advances the order status
  - Edit purchase order and Cancel Order actions, each with its own confirmation describing the effect
  - Option to return the ordered products to the cart instead of deleting the order
  - Distributor name and mobile number are shown on the screen
  - Order can be synced back to the backend after an edit
- **Interactions:**
  - Options are chosen from a menu with F2/F4/F6 shortcuts and confirmed before destructive effects
  - Edit is only offered while the order status still allows changes
  - Document version selection changes which copy is printed, exported or sent
- **Notable entities & workflows:**
  - purchase order, order status, timeline event, order-placed-with, document version, distributor, mobile number, delivery status, cart return, stock transfer
- **Backend operations:** `orderbook_export_purchase_order`, `orderbook_get_document`, `orderbook_get_purchase_order_detail`, `orderbook_get_purchase_order_timeline`, `orderbook_import_purchase`, `orderbook_send_document`, `orderbook_sync_purchase_order`
- **Notes:**
  - Returning products to the cart is deliberately distinct from deleting the order
  - The order detail can be pushed back into the purchase flow via the import operation

<a id="orderbook-shortbook"></a>

### `/orderbook/shortbook`

- **Chunk of origin:** `static__chunks__pages__orderbook__shortbook-d645f68a543feb6d.js`
- **What the user can do:**
  - "My ShortBook" list of stock products currently in shortage, with pack information and demand for the same period last year
  - Value expressed as a number of days, with a refresh countdown and a "refreshing" state
  - Order quantity per row that the user can adjust before ordering
  - Settings dialog with min stock, max stock, reorder point in days, period for demand calculation and seasonality in demand calculation
  - Same-period-demand-from-previous-year toggle used when computing shortage
  - Bulk "Add to Cart" that places the shortage quantities into the cart
  - A "Go To Cart" shortcut to review the resulting order
  - Stock identifier and order quantity are tracked per row
- **Interactions:**
  - Settings open with F4, are applied with F2 and are saved back to the server
  - Add to Cart (F2) pushes the shortbook quantities into the cart
  - Dismiss & Go Back leaves the screen and the cart
- **Notable entities & workflows:**
  - shortbook row, stock id, order quantity, min stock, max stock, reorder point, demand calculation period, demand seasonality, previous-year demand, shortage days, cart
- **Backend operations:** `orderbook_get_items_to_order`, `orderbook_get_settings`, `orderbook_sync_cart`, `orderbook_sync_settings`
- **Notes:**
  - Settings are the same ones exposed from the orderbook dashboard
  - The shortbook is the default entry point for generating a purchase order

<a id="orderbook-view-cart"></a>

### `/orderbook/view-cart`

- **Chunk of origin:** `static__chunks__pages__orderbook__view-cart-b7398bc06b32a91e.js`
- **What the user can do:**
  - Cart screen with two tabs: the list of cart products and the list of draft orders to review and checkout
  - Product table with product/company, composition/generic name/salt, nature, count, amount, order quantity, priority, last transaction, last ordered, average sale, margin, stock status, location and image
  - Filter drawer with filters by company, category, location and distributor, plus a product search and distributor search
  - Options to show only compositions with more than one SKU and to remove products whose stock exceeds the maximum stock
  - Order priority can follow an ABC-XYZ analysis
  - Per-product distributor assignment: choose a distributor, see the distributor's name/address, GSTIN, margin, balance and available credit, and set a preferred distributor
  - Magic-Select Distributor bulk action that assigns the same distributor to many products
  - Warnings when the selected distributor differs from the last-ordered or preferred distributor, and when the distributor has no GSTIN
  - Stock settings can be updated from the cart screen
- **Interactions:**
  - Product rows open an action menu to remove a product, reset the order quantity to the required quantity, or assign a distributor
  - A distributor is picked from a searchable list and the assignment is confirmed
  - Filters are applied with F2, and rows are selected with space
- **Notable entities & workflows:**
  - cart product, draft order, order quantity, required quantity, product, company, composition, generic name, salt, nature, category, location, distributor, distributor GSTIN, distributor margin, balance, available credit, preferred distributor, last ordered distributor, average sale, margin, stock status, ABC-XYZ priority, count, amount
- **Backend operations:** `distributors_get_master_distributors`, `orderbook_get_cart`, `orderbook_get_cart_filters`, `orderbook_get_distributors_for_medicine`, `orderbook_magic_assign_distributors`, `orderbook_sync_cart`, `settings_update_stock_settings`, `stock_audit_get_filters`
- **Notes:**
  - The busiest orderbook screen; it merges the cart list, the draft-order review and distributor assignment
  - A row can be in conflict with the last-ordered or preferred distributor, which the user must acknowledge

<a id="orderbook-view-cart-order_id"></a>

### `/orderbook/view-cart/[order_id]`

- **Chunk of origin:** `static__chunks__pages__orderbook__view-cart__[order_id]-d120b877f33e834c.js`
- **What the user can do:**
  - Detail view of a single saved order/cart, reached by order id from the router
  - Product action menu with remove-product and reset-order-quantity operations
  - Warning that the order quantity in the cart may be out of sync, with the reason to review
  - Flagging of products whose stock is above the maximum stock
  - Order priority can follow an ABC-XYZ analysis
  - A stock filter option for the product list
  - Options to proceed to checkout or return to the cart
  - Checkout is validated against the cart before the order is placed
- **Interactions:**
  - Product Actions opens with F2 and offers remove or reset order quantity
  - Proceed to Checkout (F4) submits the order after validation
  - Go Back returns to the cart list
- **Notable entities & workflows:**
  - order id, cart detail, medicine id, product, order quantity, required quantity, stock status, max stock, ABC-XYZ priority, checkout, validation
- **Backend operations:** `orderbook_checkout_cart`, `orderbook_get_cart_details`, `orderbook_sync_cart`, `orderbook_validate_checkout`
- **Notes:**
  - Complements /orderbook/view-cart: the list screen holds the filters, this screen holds the per-product actions
  - The order id in the route identifies which saved order is being reviewed

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
  - Costing fields — purchase rate, net rate, sale rate, price to retailer and margin — are only shown when the viewer holds the stock-margin permission; sale rate is shown for retailers and price to retailer for distributors.
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
- **Backend operations:** `(none — client-side modal only)`
- **Notes:**
  - The chunk makes no network calls; it is a pure client-side capture dialog used by the parent label screen.
  - Escape handling and the periodic re-focus both come from shared keyboard/focus hooks rather than local logic.

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
  - Filter values are expressed as master ids — company id, form id, category id — or as plain strings for location and initials, and the in-stock state and drug-code text travel as separate parameters.
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
  - Step navigation is gated on filter state as well as selection, which is unusual but deliberate — the audit should start from a clean, unfiltered list.
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
  - The adjusted value is coloured by sign — negative red, positive green — and the adjusting user is named.
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
  - Each save attempt runs client validation first and names the first missing requirement specifically — storefront image, Form 20 image, GST certificate, or the self declaration.
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
  - Order action picker offering edit order, decline order and — for bounced orders — process the order; declined or refused orders can be re-opened.
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

## Reports

<a id="reports-business-reports"></a>

### `/reports/business-reports`

- **Chunk of origin:** `static__chunks__pages__reports__business-reports-05590721bd92498b.js`
- **What the user can do:**
  - Catalogue screen headed "Business Reports" listing available reports grouped under category tabs, each tab labelled with its category name in a colour-coded chip.
  - Table with a "REPORT NAME / VIEW BY" column and a "REPORT DESCRIPTION" column, plus a per-row category chip and a favourite (star) toggle column.
  - Each report row carries a second-line footer label (report_name_footer) and a star control whose tooltip reads "Star / UnStar Report".
  - Rows are selectable and open the report view page for the chosen report id.
  - Favourite state is persisted server-side; a toast confirms "Added to" / "Removed from" starred reports.
  - Distributor-only reports are appended to the catalogue when the signed-in business is a distributor (business_type_id 2 plus is_distributor set).
  - The active category tab index is remembered across visits and restored on load.
  - A "How to View Reports?" helper panel opens a tutorial video beside the catalogue.
  - Per-business column visibility is honoured, so the category column can be hidden.
  - A landing analytics event fires when the catalogue appears.
- **Interactions:**
  - Click a report row to open that report.
  - Click the row star to favourite or unfavourite without triggering row navigation.
  - Switch category tab to change the listed reports.
  - Open the "How to View Reports?" help video.
- **Notable entities & workflows:**
  - report_id, report_name, report_name_footer, report_desc, report_categories, report_category_id, report_category_name, is_starred_report, business_type_id, is_distributor, is_row_selectable, is_column_hidden, active_tab
- **Backend operations:** `reports_get_reports`, `reports_add_starred_reports`, `reports_remove_starred_reports`
- **Notes:**
  - Metadata for the report the user picked is kept in shared state and reused by the view page.
  - No literal endpoint URLs appear; every request goes through the shared service layer keyed by the operation identifiers above.

<a id="reports-business-report-view-report_id"></a>

### `/reports/business-report-view/[report_id]`

- **Chunk of origin:** `static__chunks__pages__reports__business-report-view__[report_id]-ddefcfaf42d00f77.js`
- **What the user can do:**
  - Report screen built from the metadata attached to the route's report id: header shows report name, subtitle, description and a star/unstar toggle.
  - A view-by selector (business, branch, customer) changes how rows are grouped; a secondary view-by filter row can be date-driven.
  - Date range filter with preset ranges "Last 7 Days", "Last 30 Days", "Last Month" and "This Month"; the selectable window is capped per report (a configurable maximum in days, e.g. a 90-day placeholder) and a per-report date range type is honoured.
  - Column chooser modal ("Filter Report Columns") picks which data columns and secondary label columns appear in the grid.
  - A report filter modal supports single-select, multi-select, boolean, dropdown, radio, input and clearable field types, with a searchable option list.
  - Remote lookups back the filters: branch search via business mapping for migration and customer search, both capped at 25 hits and carrying the stock-transfer context; medicine search is available as a report API key.
  - Grid renders report rows with pagination, sortable columns, ellipsis truncation, alternating row styling and a no-data message.
  - Some reports render as accordion panels: each group expands to reveal its rows and a stats strip of counts and sums.
  - Header-level stat tiles can be ticked, and ticked stats are the ones carried into the exported PDF.
  - Export modal offers Excel, CSV, PDF, HTML and email; when a report declares a dedicated excel API it is called through its own endpoint instead of the generic excel export.
  - Print modal renders an HTML preview and offers printing, sending by email and downloading a PDF.
  - A column-selection modal can be required before export, with a hint that columns must be chosen first.
  - Cancellation through the request abort signal surfaces "Request was cancelled by user"; load failures surface "An error occurred while loading the report."
- **Interactions:**
  - Pick a date range and a view-by option, then load the report.
  - Open "Filter Report Columns" and tick the columns to show.
  - Open the filter modal, choose filter values and apply them.
  - Star or unstar the report from the header.
  - Choose an export format and export; print or email from the print modal.
- **Notable entities & workflows:**
  - report_id, report_name, report_meta_data, report_category_id, report_category_name, report_filters, filter_columns, data_columns, date_range, date_range_type, from_date, to_date, default_days, maximum_selectable_date_days, report_view_by, report_view_by_filters, report_view_by_name, report_view_by_filter_id, applied_filters, selected_filters, report_payload_array_key, report_payload_label_key, report_payload_value_key, has_dedicated_excel_api, report_api_endpoint, excel_base64, html_preview, is_stock_transfer, selected_branches, business_id, business_name, business_gstin, business_drug_license_no, customer_name, customer_balance
- **Backend operations:** `get_mapping_business_for_migration`, `customers_search_customers`, `medicine_search_medicines`, `schedule_types`, `reports_add_starred_reports`, `reports_remove_starred_reports`, `report_download_pdf`, `report_download_excel`, `report_download_csv`, `report_download_html`, `report_send_email`
- **Notes:**
  - The row fetch and the export both dispatch an operation name taken from report metadata (report_api_key / report_api_endpoint), so report-specific operations exist beyond the literals listed above.
  - Export responses arrive as base64 payloads that are saved as XLSX/CSV or rendered as a PDF.

## Cash & bank

<a id="cash-and-bank"></a>

### `/cash-and-bank`

- **Chunk of origin:** `static__chunks__pages__cash-and-bank-1f3db9a089df0370.js`
- **What the user can do:**
  - Landing screen titled "Payment Accounts" with the tagline "Never loose track of your Cash Flow & Accounts".
  - Table columns are "ACCOUNT NAME / BRANCH" (display name over branch name), "ACC HOLDER NAME / UPI", "IFSC CODE" (tagged current or savings account) and "LATEST TXN" (last transaction date), alongside a balance column.
  - Each row shows the bank's brand image for that account type.
  - Search box labelled "Search Accounts" with the hint "Search by Acc no, Acc Holder Name, IFSC Code".
  - Sort and filter panels "SORT BY" and "FILTER BY" are built from server-supplied sort and account filter definitions, with a "Reset Filter" option.
  - The cash-in-hand total comes back on the summary response and is published to shared state so the rest of the module can use it.
  - A "Watch Tutorial" video panel is available, and that panel itself offers a language selector.
  - Rows are selectable so a chosen account can open its statement, and the result count is shown in the footer.
  - A landing analytics event fires on entry.
- **Interactions:**
  - Search accounts by account number, holder name or IFSC code.
  - Open SORT BY or FILTER BY and reset the filters.
  - Click an account row to open its statement.
  - Open the tutorial video and switch its language.
- **Notable entities & workflows:**
  - business_payment_account_id, payment_account_display_name, payment_account_type_id, bank_branch_name, bank_branch_ifsc_code, account_balance, last_transaction_dt, cash_in_hand, payment_accounts, account_filters, sort_filters, search_text, items_length, is_current_bank_account, pay_accs_image_url
- **Backend operations:** `get_pay_acc_filters`, `get_payment_account_summary`
- **Notes:**
  - This page only reads a summary; account detail and transaction history are fetched on the statement page.

<a id="cash-and-bank-account-statement"></a>

### `/cash-and-bank/account-statement`

- **Chunk of origin:** `static__chunks__pages__cash-and-bank__account-statement-5bbb9f294d620ecf.js`
- **What the user can do:**
  - Statement screen for one payment account headed "Account Statement", with a back button and an account summary (holder name, bank, account number, account balance).
  - Transaction grid columns are "TXN UTR / DATE", "TXN TYPE / USER", "TXN NARRATION", "Txn Amount" and "Account"; opening and closing balance appear as their own narration rows.
  - Money in and money out are distinguished by a coloured amount chip, and a "From:"/"To:" prefix names the counterparty account for each leg.
  - Transaction search ("Search Transactions", "Search by Txn UTR No or Txn Amount") plus sort/filter panels built from server filters and a date-range control ("Select Date range").
  - An "Add or Reduce Balance" modal lets the user pick ADD MONEY or REDUCE MONEY, choose an adjustment type, and enter amount, date and a remark or UTR; it validates with "Please Enter Adjustment Amount", "Please Enter Adjustment Name" and "Please Select Adjustment Date", and previews the old and new account balance.
  - An existing transaction can be edited through the same modal, and deleted after the confirmation "You want to Delete this Transaction!".
  - The payment account itself can be removed after the confirmation "Are you sure you want to delete this account?".
  - A statement download modal lets the user pick a date range and export PDF or CSV; a failure surfaces "Failed to download statement" and a progress state reads "Downloading statement...".
  - Adjustments and transfers link a source and a target account, so such a row carries both a debit and a credit transaction id.
  - Rows can expose supporting uploaded images, and the account card carries UPI address, merchant id and key, and terminal id.
  - Statement rows are paginated and append on scroll, with a skeleton shown while loading and a load-failure message offering a retry.
- **Interactions:**
  - Search, sort and filter transactions and select a date range.
  - Add a money-in or money-out adjustment; edit or delete an existing transaction.
  - Open the download modal and export the statement as PDF or CSV.
  - Delete the payment account.
- **Notable entities & workflows:**
  - business_payment_account_id, account_balance, opening_balance, closing_balance, transaction_amount, transaction_utr, transaction_date, transaction_remarks, txn_type, txn_narration_header, txn_narration_footer, is_adjustment_entry, is_opening_balance, is_closing_balance, adjustment_type_id, adjustment_name, credit_transaction_id, debit_transaction_id, transfer_transaction_id, source_payment_account_type_id, target_payment_account_type_id, primary_account_id, account_holder_name, bank_name, bank_account_no, upi_address, merchant_id, merchant_key, terminal_identifier, transaction_records, page_no, date_range, from_date, to_date
- **Backend operations:** `get_pay_acc_filters`, `get_pay_acc_detail`, `get_pay_acc_statement`, `get_pay_acc_transaction_detail`, `add_pay_acc_transaction`, `edit_pay_acc_transaction`, `delete_pay_acc_transaction`, `delete_pay_acc`, `download_pay_acc_statement`
- **Notes:**
  - Balance arithmetic differs for add versus reduce and is recomputed against the stored account balance when an adjustment is edited.
  - The statement download returns a base64 file that is written out locally.

<a id="cash-and-bank-cheque-management"></a>

### `/cash-and-bank/cheque-management`

- **Chunk of origin:** `static__chunks__pages__cash-and-bank__cheque-management-8cc065880489ac57.js`
- **What the user can do:**
  - Cheque management screen with two navigation tabs selected under a "Clearing Status:" heading: "OPEN CHEQUES" and "CLEARED CHEQUES".
  - Header stats strip shows counts of paid-in and paid-out cheques plus "Amount Paid" and "Amount Received" totals.
  - Table columns include "CHEQUE NO", "MICR CODE", "CHEQUE AMT", "CHEQUE DATE", "ISSUED FOR", "AMT / ISSUED", "GIVEN OUT", "CHEQUE WAS", "CLEARED IN BANK ACCOUNT", "CLEARING TXN" and "TXN ADDED BY".
  - Each row prefixes the party as "BY:" for a cheque received and "TO:" for a cheque issued, alongside the customer or distributor name.
  - An "Add Open Cheque" form captures cheque number, MICR code, amount, date and the issuing party, validating with "Cheque No is Required", "Cheque Amount is Required", "Cheque date is Required" and "Customer is Required"; a warning blocks "Cannot Open Source of an External Cheque".
  - Purchase district is auto-filled from the business profile when a cheque is added.
  - The open-cheque action modal offers depositing an A/c payee cheque to a bank account, withdrawing an A/c payee cheque from a bank account, and settling a bearer cheque to cash, each with amount, payment date, UTR and invoice number, and states the effect on the cash-in-hand balance.
  - The cleared-cheque action modal lists similar settlement options and can edit the cheque's deposit or withdraw transaction.
  - A revert action returns a cleared cheque to the open list ("Revert Cheque to Open State"), and delete removes the cheque after a confirmation prompt.
  - Search by cheque number, MICR code or amount ("Search Cheques") plus SORT BY and FILTER BY panels with single- and multi-layer dropdown filters and a "Reset Filter" option.
  - Payment-in and payment-out transactions are colour-coded chips, and the header shows amount to pay and amount to receive.
  - Payment accounts usable as a cheque destination are loaded from the server, and the cash-in-hand account is cached in shared state.
- **Interactions:**
  - Switch between the open and cleared cheque tabs.
  - Add a cheque through the form; validation errors block saving.
  - Open the cheque action modal and post the cheque to a bank account or to cash.
  - Revert a cheque to open state, or delete a cheque.
  - Search and filter the cheque list.
- **Notable entities & workflows:**
  - cheque_id, cheque_no, cheque_micr, cheque_amount, cheque_date, cheque_party_name, cheque_party_footer, is_credit_cheque, is_credit_cheque_count, is_debit_cheque_count, is_bearer_cheque, is_external_cheque, is_cheque_open, pay_in_amount_sum, pay_out_amount_sum, cheque_stats, payment_accounts, payment_account_type_id, business_payment_account_id, payment_date, payment_invoice_no, transaction_utr, transaction_amount, customer_id, customer_name, distributor_id, distributor_name, district_id, district_name, state_id, state_name, business_user_name, date_range, from_date, to_date, view_by_id
- **Backend operations:** `get_pay_acc_filters`, `get_cheques`, `add_cheque`, `update_cheque`, `delete_cheque`, `get_payment_accounts`
- **Notes:**
  - Revert and edit both go through the same update operation with a mode flag rather than separate endpoints.
  - The selected tab is translated into a view-by id that is sent with the cheque list request.

## Expenses

<a id="expenses-add-expense-expense_id"></a>

### `/expenses/add-expense/[expense_id]`

- **Chunk of origin:** `static__chunks__pages__expenses__add-expense__[expense_id]-8fc8cd520a3d1189.js`
- **What the user can do:**
  - Single expense capture screen that serves three modes from the same route: add (new), edit (existing id) and read-only view.
  - Expense header shows a server-generated reference number and a required date/time stamp, both formatted for display.
  - A "NATURE" toggle switches the expense between plain and GST-bearing mode; GST mode additionally demands an invoice number and drives the tax breakdown.
  - Expense category is chosen from a list loaded from the backend, shown in a "Select an Expense Category" picker.
  - Party is picked from a searchable list with a create-new fallback that opens an add/edit party form (name, GSTIN, address, district, state, mobile, email, composition-dealer flag).
  - Item rows let the user search or create a product/service, pick an HSN code with its rate, and enter quantity and unit rate; tax, taxable amount and amount are computed per row.
  - Totals panel summarises taxable amount, CGST+SGST or IGST depending on whether the party is in another state, round-off and final expense amount.
  - Payment is collected through a shared initial-payment dialog: amount, invoice/payment date, transaction records, business payment account, UTR and cheque details; a refund/payments summary and a "View Payments" action are shown for saved records.
  - Header actions cover save, save-now, edit, delete expense, delete party, go back and a tutorial link.
  - Keyboard-driven workflow: F2 to save or create, F4 to edit, DEL to delete, ESC to go back, Alt+S to save immediately, Space to open pickers, arrow keys to navigate rows, Enter to open.
  - Leaving the page with pending edits raises an "unsaved changes" confirmation warning.
- **Interactions:**
  - Party GSTIN is auto-validated once it reaches 15 characters, which fills in trade name, address, district and composition-dealer status; invalid input blocks saving.
  - Selecting or creating a party resets dependent fields, and the party list reloads after a party is saved or deleted.
  - Deleting an expense or a party requires confirmation, then returns the user to the expense list.
  - Toggling GST nature clears the previously chosen party and switches the tax display between CGST+SGST and IGST.
- **Notable entities & workflows:**
  - expense_no, expense_date, expense_category_id, expense_category, party_id, party_name, party_gstin, party_address, district_id, district_name, state_id, state_name, party_contact, party_email, is_gst_registered, is_composition_dealer, invoice_no, invoice_date, transaction_remarks, expense_item_name, expense_hsn_code_id, hsn_code, hsn_gst_rate, expense_gst_rate, expense_transaction_quantity, expense_transaction_rate, temp_unit_rate, expense_amount, expense_round_off, transaction_utr, transaction_records, business_payment_account_id, payment_date, cheque, is_credit, expense_details_id, expense_transaction_detail_id
- **Backend operations:** `expenses_get_parties`, `expense_sync_party`, `expense_get_metadata`, `expenses_get_products`, `medicine_get_hsn_gst_rates`, `business_get_prefix_sequence`, `expense_sync_expense`, `expense_get_expense_details`, `business_validate_gstin`
- **Notes:**
  - Save is gated: an item must exist, a party and a category must be selected, GST mode requires an invoice number, and every GST row needs a valid HSN code.
  - The delete calls reuse the same sync operation with an "is delete" flag rather than a dedicated delete endpoint; the party delete dialog offers a merge-style delete.
  - No receipt or file attachment exists on this page; the payment modal, HSN/product pickers and several form widgets live in shared chunks outside this file.

<a id="expenses-view-expenses"></a>

### `/expenses/view-expenses`

- **Chunk of origin:** `static__chunks__pages__expenses__view-expenses-7929ae125b9338b5.js`
- **What the user can do:**
  - Read-only expense list screen introduced as "Business Expenses" for tracking shop running costs.
  - Filter row offers a search box labelled "SEARCH EXPENSES" that matches on expense number or party name.
  - An "ADDED BETWEEN" date-range picker with presets for Today, Yesterday, Last 7 Days, Last 30 Days, This Month and Last Month, defaulting to the last seven days.
  - A toggle restricts the list to GST expenses only.
  - Results render in a focusable table with row selection, chevron affordance and ant-design pagination; the columns come from a shared column definition.
  - Header offers an "Add New Expense" action that jumps straight into the add-expense screen for a new record.
  - A keyboard hint bar documents F2 to add, arrow keys to move and Enter to open a selected expense.
- **Interactions:**
  - Rows are clickable and open the corresponding expense in the add-expense route, reusing it as the detail view.
  - Filters are applied together in a single fetch, so changing the search text, date window or GST toggle reloads the same list endpoint.
  - The page refetches automatically whenever the filter state changes.
  - Selecting a row navigates to that expense's detail page; the add action opens the same page with a new-record identifier.
  - Focus is managed between the filter inputs and the table so arrow-key navigation works after the search field loses focus.
- **Notable entities & workflows:**
  - expense_id, expense_no, from_date, to_date, date_range, search_text, show_expense_with_gst, expense_with_gst, expenses
- **Backend operations:** `expenses_get_expenses`
- **Notes:**
  - The date picker is defined locally in this chunk and reuses the app's shared date component.
  - Column rendering and table cell fields are supplied by a shared module, so the exact list columns are not visible here.

## Control centre

<a id="control-center-business-profile"></a>

### `/control-center/business-profile`

- **Chunk of origin:** `static__chunks__pages__control-center__business-profile-db9664ded8703327.js`
- **What the user can do:**
  - Tabbed business profile editor split into basic identity, drug licence, entity/taxation, address-and-map and store timings sections.
  - Basic identity captures business name, GSTIN, PAN, CIN or LLPIN, owner name, owner PAN and the trade name that comes back from GST records.
  - Drug licence panel holds Form-20 and Form-21 numbers with their expiry dates and one uploaded image each.
  - Entity section lists entity type, taxation type (GST registered vs non-registered), FSSAI licence number with expiry and the AYUSHMAN HFR id.
  - Address panel holds three address lines, district and pincode, with a map pin, place autocomplete and a "Get My Location" button.
  - Store timings are configured per weekday with two shifts each (open/close times) plus an Open 24x7 flag.
  - Store-front, Form-20 and Form-21 image uploads are restricted to a single file each.
- **Interactions:**
  - "Get My Location" uses browser geolocation, reverse-fills address fields and moves the map pin; permission denial and unsupported-browser cases each get their own message.
  - Choosing a place from search suggestions populates the address and the map marker.
  - Switching the selected business entity reloads entity-scoped fields; the GSTIN is validated before saving and rejected as "INVALID GSTIN" when it does not pass.
  - Timing rows cannot be edited while 24x7 is on ("Please disable 24x7 access to update timings.").
  - Save persists the profile and confirms with "Business Profile Updated Successfully".
- **Notable entities & workflows:**
  - business_name, business_gstin, business_pan, business_cin, business_llpin, business_owner, business_owners_name, business_owner_pan, business_trade_name_on_gst_records, business_entity, entity_type, business_address_line_1, business_address_line_2, business_address_line_3, business_full_address, business_latitude, business_longitude, drug_license, dl_form_20, dl_form_21, business_fssai, business_hfr_id, gst_tax, bank_details, timings[].shift1, timings[].shift2, close_time, day_of_the_week
- **Backend operations:** `business_get_profile, business_update_business_profile, business_get_master_business_entities, business_validate_gstin`
- **Notes:**
  - No literal `/api/...` URLs are present in the chunk; every call goes through a shared request helper that takes a service operation name, so URL paths live in a runtime chunk outside this folder.
  - Google Maps is loaded at runtime with a key plus the places library for address lookup.

<a id="control-center-bulk-edit-bills"></a>

### `/control-center/bulk-edit-bills`

- **Chunk of origin:** `static__chunks__pages__control-center__bulk-edit-bills-15d7f1b853c06f77.js`
- **What the user can do:**
  - Bulk operation console over sale bills with separate flows for loading bills to edit, deleting bills, recovering deleted bills, importing bills and adding a special discount.
  - Filter panel combining sale date range, bill sequence range, bill value range, bill profit range, bill status, customer type and customer/doctor/operator selection.
  - Loaded bills show invoice number, customer, doctor, GST-registered flag and an edited/unedited marker, with select-all and row selection.
  - Bill-level special discount entered as a percentage and applied to the selected bills.
  - Bill import accepts a CSV upload and stores it base64-encoded for the server.
  - Progress polling shows the running bulk job, and completion/failure outcomes are surfaced; a bulk action report can be downloaded.
  - Operator, doctor and customer pickers are searchable dropdowns that also remember the logged-in operator.
- **Interactions:**
  - "Load Sale Bills" runs the filters; invalid ranges are blocked with messages such as "From Bill Sequence No cannot be greater than To Bill Sequence No" and "Min Bill Value cannot be greater than Max Bill Value".
  - Date filters must both be set before running ("Please select From Sale Date and To Sale Date").
  - Deleting bills is an irreversible action that requires re-entering the password to confirm, then reports "Deleting Bills..." and the deletion progress.
  - Bulk progress is polled so the operator can track the delete job; on success the result and report download are shown.
  - The report download endpoint is used to fetch the bulk action report; failures surface as "Unable to download report".
- **Notable entities & workflows:**
  - bill_sequence_range, bill_value_range, bill_profit_percentage_range, bill_status, customer_type, customer_registration_type, customer_mobile_number, doctor_id, doctor_name, selected_operators, add_special_discount, bill_discount, job_id, csv_base64, business_user_name, business_user_role, is_bulk_delete, is_bulk_recovery
- **Backend operations:** `get_bills_for_bulk_edit, bulk_edit_bills, get_bulk_edit_progress, download_bulk_action_reports, import_bills, business_get_user_details`
- **Notes:**
  - No literal `/api/...` URLs appear in the chunk; calls use a shared helper with service operation names.
  - "Bulk Recovery" reuses the same delete-bill payload with an is_bulk_recovery flag rather than a separate operation.

<a id="control-center-migration"></a>

### `/control-center/migration`

- **Chunk of origin:** `static__chunks__pages__control-center__migration-bd87296c7b82ce52.js`
- **What the user can do:**
  - Onboarding for moving data from another pharmacy software, offering a standard migration request and an Excel upload mode.
  - Software catalogue lists supported old software with sample file format links so the user can download a template.
  - Data scope selection covers customers, sales/sale history, stock and stock batches, with a backup collection time and an expiry cut-off date.
  - Branch mapping lets the user copy item mapping from one branch and optionally copy MRP as the sale rate.
  - Excel-based migration validates the uploaded file, then uploads it via a presigned URL to object storage and tracks upload state per file.
  - Unmapped stock can be loaded and mapped after the upload, with per-item mapping rows and pending-to-map indicators.
  - Migration request list shows status, and multiple downloadable reports exist for success, failure, excluded rows and mapping results.
- **Interactions:**
  - Selecting a software loads its files/templates; a request cannot be created until software and at least one date type are chosen.
  - Dropping or browsing a file validates it first; wrong file type or duplicate files are rejected with explicit messages.
  - A failed upload offers removal of the uploaded file before retrying.
  - Reports download per migration request, with a distinct failure message when the server returns nothing downloadable.
  - Branch selection reloads mapping data and unmapped stock; errors are reported per stage ("Failed to load branches", "Failed to load unmapped stocks").
- **Notable entities & workflows:**
  - business_id, business_name, business_type, business_gstin, business_drug_license_no, business_address, copy_item_from_business_name, copy_mrp_as_sale_rate, customer_name, customer_balance, backup_collection_time, expiry_cutoff_date, file_s3_url, csv_base64, file_type, file_size, selected_branches, mapping, migration_mode
- **Backend operations:** `get_migration_softwares, get_software_files, get_migration_requests, get_migration_request_details, generate_new_migration_request, generate_excel_migration_request, validate_migration_file, get_presigned_url, remove_uploaded_file, get_mapping_business_for_migration, load_unmapped_stocks, customers_search_customers, download_csv_template, migration_download_reports`
- **Notes:**
  - No literal `/api/...` URLs appear in the chunk; service operation names are passed to a shared request helper.
  - Object storage upload is done client-side against a presigned URL rather than through a normal endpoint.

<a id="control-center-integrations"></a>

### `/control-center/integrations`

- **Chunk of origin:** `static__chunks__pages__control-center__integrations-783822e85bcc6195.js`
- **What the user can do:**
  - Catalogue of available partner integrations shown as a table of partner name, description, icon, status and last-updated date.
  - Entries are grouped by master partner type with a status label such as "ACTIVE NOW" and a status colour.
  - Rows are selectable so the user can enter a partner's onboarding flow.
  - Tabbed navigation shell with a default selected tab and per-row selection state.
- **Interactions:**
  - The list loads asynchronously with a loading flag and re-fetch action.
  - Selecting a partner row opens that partner's detail/onboarding route.
  - Status text and colour are derived from the integration state returned by the server.
- **Notable entities & workflows:**
  - partner_id, partner_name, partner_type, partner_type_id, partner_type_icon, partner_description, partner_image_url, partner_integrations, available_integrations, status_text, status_color, created_on, master_partner_types
- **Backend operations:** `partners_get_partners_integrations`
- **Notes:**
  - The chunk is a thin list view; the actual onboarding steps live in the partner integration pages.
  - No literal `/api/...` URLs appear in the chunk.

<a id="control-center-layout"></a>

### `/control-center/layout`

- **Chunk of origin:** `static__chunks__pages__control-center__layout-e748f2c7101629df.js`
- **What the user can do:**
  - Minimal route layout wrapper for the control-center section that simply renders its children inside a layout section.
  - Exists to give every control-center page a shared shell and shared chunk dependencies.
- **Interactions:**
  - None of its own; it only nests the child page.
- **Notable entities & workflows:**
  - none
- **Backend operations:** `none`
- **Notes:**
  - This chunk contains only a pass-through layout component plus its Next.js route registration.

<a id="control-center-picklist-settings"></a>

### `/control-center/picklist-settings`

- **Chunk of origin:** `static__chunks__pages__control-center__picklist-settings-ae2c587e3d9ce526.js`
- **What the user can do:**
  - Editor for customer order picklist configuration, described as "Order Settings".
  - Settings are generic key/value picklist rows where each key binds to a configurable value.
  - Values can be changed in a drawer with a dropdown-style selector and a search-on-space shortcut.
  - A save action syncs the edited settings back to the server and confirms "Picklist Settings Synced".
  - The page uses a template-driven settings list so new picklist keys can appear without page changes.
- **Interactions:**
  - Selecting a setting row opens the edit drawer; the row is marked selected.
  - Save (F2) submits the whole settings set and reports the sync result.
  - Settings load asynchronously with a loading state and can be re-read.
- **Notable entities & workflows:**
  - picklist_settings, customer_order_settings, template_customer_order_settings, binding_key, selected_settings, is_required, is_drop_down, is_clearable
- **Backend operations:** `business_get_customer_order_settings, business_sync_customer_order_settings`
- **Notes:**
  - The exact picklist keys are server-defined templates; only the generic binding_key/value pair is visible in the chunk.

<a id="control-center-plans-pricing"></a>

### `/control-center/plans-pricing`

- **Chunk of origin:** `static__chunks__pages__control-center__plans-pricing-d7faf2e8aba4cfb3.js`
- **What the user can do:**
  - Plan and billing summary showing the current subscription, whether the business is on the free plan or free trial, and an upgrade prompt.
  - Credits overview lists SMS credits and usage plus e-invoice credits and e-invoice API credits.
  - Billing history lists invoices that can be downloaded as HTML invoices.
  - A sales-call request can be placed from the pricing screen, and a renewal path leads into the subscription checkout.
  - Free-plan and free-trial states are highlighted with a warning panel and coloured theme.
- **Interactions:**
  - "Upgrade to Premium" or "Renew Premium Now" routes into the subscription checkout page.
  - "Request Sales Call" posts a request and confirms success with "Succesfully Placed Request".
  - Downloading an invoice fetches the invoice details and shows "Downloading Invoice" while in flight.
  - The page adapts when reached from the pricing page versus from settings (is_from_pricing_page flag).
- **Notable entities & workflows:**
  - subscription_details, billing_history, invoice_id, invoice_html, payment_status, sms_credits, sms_usage, e_invoice_credits, e_invoice_api_credits, add_on_pack, is_under_free_plan, is_under_free_trial, un_subscribed, is_sales_call_requested, retry_invoice_id
- **Backend operations:** `subscription_get_subscription_details, subscription_get_business_invoice_details, subscription_request_sales_call, order_subscription`
- **Notes:**
  - Shares its data layer with the /settings/subscriptions page; both display plan status, credits and billing history.
  - No literal `/api/...` URLs appear in the chunk.

<a id="control-center-prefix-sequences"></a>

### `/control-center/prefix-sequences`

- **Chunk of origin:** `static__chunks__pages__control-center__prefix-sequences-20b14417f1a80bae.js`
- **What the user can do:**
  - Editor mapping transaction types to the prefix and running sequence used for numbering.
  - Rows list the transaction type, the prefix and the current sequence value.
  - The hint "Prefix & Sequence together will form Invoice No" explains how numbering is composed.
  - Financial-year flags exist per row to indicate closing or reset state of the year.
  - Rows support selecting multiple entries and editing a single prefix/sequence cell inline.
- **Interactions:**
  - "Save (F2)" pushes the updated prefix and sequence values for the changed rows.
  - A busy state ("Loading Sequences") is shown while the sequence list is fetched.
  - Sequence rows can be switched on/off via a per-row selection state.
- **Notable entities & workflows:**
  - prefixes_sequences, prefix_key, prefix_value, seq_value, is_financial_year_closing, is_financial_year_reset, selected_items, transaction type
- **Backend operations:** `business_get_prefix_sequence, business_update_prefix_sequence`
- **Notes:**
  - Sequence values are edited in-place and saved as a set keyed by prefix key.

<a id="control-center-refer-earn"></a>

### `/control-center/refer-earn`

- **Chunk of origin:** `static__chunks__pages__control-center__refer-earn-328664e1f4ea6b9b.js`
- **What the user can do:**
  - Referral programme screen showing the user's own referral code with a copy action ("Code Copied").
  - Summary cards show earnings so far, wallet balance and the number of referred pharmacies.
  - A referral transactions list shows each referred pharmacy and whether it has subscribed.
  - Wallet cash can be redeemed, and a tutorial video can be played inline.
  - Social share links (YouTube, Facebook, Instagram) are offered for the referral code.
- **Interactions:**
  - Copying the referral code confirms with "Code Copied".
  - "Redeem Wallet Cash" and "Watch Video"/"Watch Tutorial" open a modal with the embedded tutorial player.
  - Referral details and referral transactions are fetched separately and shown in a paginated list.
  - A language switcher is available on the screen.
- **Notable entities & workflows:**
  - referral_key, referral_code, referred_business, total_earning, wallet_balance, subscription_status, video_id, referral transactions, business_user_profile
- **Backend operations:** `business_get_user_profile, get_user_referral_details, get_referral_transactions`
- **Notes:**
  - The referral code appears to be a fixed per-business string with the business user profile supplying it.
  - No literal `/api/...` URLs appear in the chunk.

<a id="control-center-sale-settings"></a>

### `/control-center/sale-settings`

- **Chunk of origin:** `static__chunks__pages__control-center__sale-settings-932b1d2325e261c7.js`
- **What the user can do:**
  - Editor for sale-time behaviour settings, presented as key/value rows in a drawer.
  - Supported settings include "Autofill Scheme wrt Sale Qty", "Doctor must for X Drugs" and a sale scheme format option.
  - Each setting can be scoped to a default doctor and marked visible for retailer or distributor business types.
  - Mobile section and search are available to locate a setting quickly.
  - A save action syncs the settings and confirms "Sale Settings Synced".
- **Interactions:**
  - Opening the drawer allows editing a setting value, with type-ahead support ("Type or Press Space Bar").
  - Save (F2) submits the edited set and shows the sync confirmation.
  - Settings load asynchronously; template-driven rows mean new settings appear from the server template.
- **Notable entities & workflows:**
  - sale_settings, template_sale_settings, sale_setting, binding_key, settings_item, default_doctor, doctor_name, is_visible_for_retailer, is_visible_for_distributor, sale_state, sale_scheme_format, search_text
- **Backend operations:** `business_get_sale_settings, business_sync_sale_settings`
- **Notes:**
  - Shares the generic settings-drawer pattern with the picklist settings page.

## Integrations / partner onboarding

<a id="integrations"></a>

### `/integrations`

- **Chunk of origin:** `static__chunks__pages__integrations-05c1980a493c4e8f.js`
- **What the user can do:**
  - Top-level integrations catalogue listing partner integrations with name, description, icon, status and last updated date.
  - Entries are grouped by master partner type and rows are selectable.
  - Status labels such as "ACTIVE NOW" are shown with a matching colour indicator.
  - Tabbed navigation with a default selected tab and per-tab counts.
- **Interactions:**
  - The catalogue loads asynchronously with a loading state.
  - Choosing a row opens the partner's integration flow.
- **Notable entities & workflows:**
  - partner_id, partner_name, partner_type, partner_type_id, partner_type_icon, partner_description, partner_image_url, partner_integrations, available_integrations, status_text, status_color, created_on
- **Backend operations:** `partners_get_partners_integrations`
- **Notes:**
  - Mirrors the /control-center/integrations catalogue; the standalone /integrations route is the customer-facing entry point.

<a id="integrations-aadhar-kyc"></a>

### `/integrations/aadhar-kyc`

- **Chunk of origin:** `static__chunks__pages__integrations__aadhar-kyc-4b4f69768c696349.js`
- **What the user can do:**
  - Aadhaar-based KYC submission step for a partner onboarding.
  - Offers an onboarding link so the user can complete Aadhaar verification with the partner.
  - A "Submit KYC using Aadhar" action starts the onboarding and "Send for Review (F2)" hands the case to review.
  - "Go Back" returns to the previous onboarding step.
- **Interactions:**
  - Initiating onboarding requests the onboarding link and shows a submitting state.
  - "Send for Review" confirms the step before the partner receives the case.
  - Back navigation returns to the previous integration step.
- **Notable entities & workflows:**
  - onboarding_link, partner_id
- **Backend operations:** `partners_initiate_partner_onboarding`
- **Notes:**
  - The Aadhaar capture itself happens on the partner's onboarding page; this page only starts the flow.

<a id="integrations-business-detail"></a>

### `/integrations/business-detail`

- **Chunk of origin:** `static__chunks__pages__integrations__business-detail-05f17eddbb974adf.js`
- **What the user can do:**
  - Verification screen for the business profile used by partner integrations, with tabs for basic details, drug licence, store front, taxation, settlement and timings.
  - Shows the same identity fields as business profile (name, GSTIN, entity type, address, timings) plus enrolment id/UIN and store-front picture.
  - Manages payment/settlement bank accounts for the business, including adding a new bank account and choosing the account used for settlements.
  - Requires a store-front picture and an enrolment id/UIN before verification can complete.
  - Sends a sample order notification to the mobile app so the user can accept or dismiss a test order.
  - Includes a frequently asked questions section and a link to the mobile app / play store.
- **Interactions:**
  - "Send test order notification" posts a test order and waits for the user's accept/dismiss response; at most five test notifications can be sent.
  - Choosing a bank account is mandatory to continue, and the settlement account can be changed.
  - Editing the drug licence number and uploading images happen inline; only one image per slot is allowed.
  - "Verify Business Detail" submits the verification, with warnings blocking progression ("Please upload the store front picture to continue", "Please enter ENROLMENT ID / UIN").
  - A location picker with geolocation and place search fills the address and map pin.
- **Notable entities & workflows:**
  - business_name, business_gstin, business_pan, business_cin, business_llpin, business_entity, business_owner, business_owner_pan, business_owner_mobile_number, business_address_line_1/2/3, drug_license, dl_form_20_image_url, dl_form_21_image_url, gstin_certificate_image_url, business_image_url (store front), enrollment_id, enrolment_id, payment_accounts, selected_business_payment_account_id, payment_account_type_id, payment_account_display_name, bank_account_no, bank_name, bank_branch_name, business_verified, active_tab_id, faq, timings
- **Backend operations:** `business_get_profile, business_get_master_business_entities, partners_get_partner_business_bank_details, sync_partner_business_info_tabs, send_test_app_notification`
- **Notes:**
  - The verification flow mirrors business-profile fields but adds settlement-account and test-notification requirements that only partners need.
  - A self-declaration option is offered instead of some document uploads.

<a id="integrations-kyc-docs"></a>

### `/integrations/kyc-docs`

- **Chunk of origin:** `static__chunks__pages__integrations__kyc-docs-7df8e2dcd87f7c06.js`
- **What the user can do:**
  - KYC document upload step that lists the documents each partner requires, marking each as required or optional.
  - Documents are uploaded by drag-and-drop or file browsing with a per-file size display and extension detection.
  - Uploaded images are shown with removal controls and a "setup complete" check.
  - The step can send the case for review once the required documents are present.
  - A "Go Back" control returns to the previous onboarding step.
- **Interactions:**
  - Uploading shows a per-file progress state and reports failures ("Error occured in Uploading File").
  - Removing an uploaded image updates the required-document checklist.
  - "Send for Review (F2)" uploads the documents and then hands the case over; the button reflects a sending state.
- **Notable entities & workflows:**
  - kyc_docs, kyc_images, uploaded_image, uploaded_url, image_url, file_name, image_extension, image_size, raw_bytes, max_bytes, is_required, is_optional, setup_complete_check, selected_business_payment_account_id, onboarding_link, partner_id
- **Backend operations:** `partners_get_kyc_docs, partners_upload_kyc_docs, partners_initiate_partner_onboarding`
- **Notes:**
  - Sizes are rendered with binary unit suffixes and the raw byte count is also shown.

<a id="integrations-partner_integrations"></a>

### `/integrations/partner_integrations`

- **Chunk of origin:** `static__chunks__pages__integrations__partner_integrations-683d5036926dd4f2.js`
- **What the user can do:**
  - Partner integration hub that lists partner integrations with logo, description, status and a getting-started progress checklist.
  - Getting-started steps are shown as an ordered list that must all be completed before integration can be finished.
  - Warnings raised by the partner are displayed and must be resolved before proceeding.
  - Settlement bank account details can be viewed and updated, including account type, number, IFSC, account holder and proof image.
  - Partner-specific configuration content is fetched for Medcart-style partners: getting started, how it works and pricing descriptions.
  - Integration can be started, which redirects the user to the Cashfree onboarding dashboard, and the integration state is polled to show "Integration Active".
- **Interactions:**
  - "Start Integration" initiates partner onboarding and shows a "Starting Partner Integration..." state before redirecting.
  - "PROCEED" advances only after every getting-started step is complete and warnings are cleared.
  - Updating bank details syncs the settlement account and confirms with "Settings Synced".
  - The screen also offers a path to upgrade the plan, since some partners require a paid subscription.
- **Notable entities & workflows:**
  - partner_id, partner_name, partner_type_id, partner_image_url, partner_description, onboarding_link, integration_status, current_status, getting_started_steps, is_completed, error_message, bank_account_no, bank_name, bank_branch_name, bank_branch_ifsc_code, account_holder_name, account_type, bank_account_for_settlement, bank_account_for_pos_settlement, is_current_account, is_current_bank_account, complete_business_profile, complete_business_kyc, is_email_verified, discount_info, flat_discount, discount_percent, additional_discount_info, maintenance_fee, medcart_config_description, medcart_config_getting_started, medcart_config_how_it_works, medcart_config_pricing, upgrade_your_plan, payment_status
- **Backend operations:** `partners_get_partner_info, partners_get_partner_integration_status, partners_get_getting_started_status, partners_initiate_partner_onboarding, sync_settlement_bank_details`
- **Notes:**
  - The Medcart configuration blocks appear to be fetched as part of the getting-started payload rather than as a separate call.

<a id="integrations-verify-email"></a>

### `/integrations/verify-email`

- **Chunk of origin:** `static__chunks__pages__integrations__verify-email-f4b3203adca34218.js`
- **What the user can do:**
  - Email verification step for partner onboarding using a one-time code sent to the invoice email on file.
  - Shows the OTP input, a resend countdown and a "Validate Code" action.
  - "Resend Delivery Code" re-triggers the email OTP and restarts the countdown.
  - Advises the user to check spam and trash folders if the code does not arrive.
- **Interactions:**
  - Validating checks that a 6-digit OTP is entered and rejects incomplete input with "Enter Valid OTP".
  - A successful check shows "OTP Verification Successful"; a fresh send shows "OTP Sent Successfully".
  - The resend control is disabled during the countdown and re-enabled afterwards.
- **Notable entities & workflows:**
  - user_otp, invoice_email, partner_id, reset_otp, is_otp_incomplete
- **Backend operations:** `partners_trigger_email_otp, partners_verify_email_otp`
- **Notes:**
  - The verification target address comes from the business invoice email rather than being typed in.

## Settings

<a id="settings-subscriptions"></a>

### `/settings/subscriptions`

- **Chunk of origin:** `static__chunks__pages__settings__subscriptions-19860b578778189a.js`
- **What the user can do:**
  - Plans and billing screen showing current subscription details and the active plan state.
  - Billing history lists invoices with dates that can be downloaded.
  - Credit balances are shown for SMS and e-invoice usage.
  - A sales call can be requested with a confirmation that a call will follow.
  - Links forward to the pricing page and the subscription checkout for upgrading.
- **Interactions:**
  - "Request a Sales Call (F2)" posts the request and shows "Sales Call Requested" / "You will Receive a Call Shortly".
  - Downloading an invoice fetches invoice details and shows a downloading state.
  - The screen adapts its chrome when opened from the pricing page.
- **Notable entities & workflows:**
  - subscription_details, billing_history, invoice_id, invoice_html, payment_status, sms_credits, sms_usage, e_invoice_credits, e_invoice_api_credits, add_on_pack, is_under_free_plan, is_under_free_trial, is_sales_call_requested, retry_invoice_id, un_subscribed
- **Backend operations:** `subscription_get_subscription_details, subscription_get_business_invoice_details, subscription_request_sales_call, order_subscription`
- **Notes:**
  - Functionally the same data as the control-center plans and pricing screen, placed in the settings area.

<a id="settings-users-devices"></a>

### `/settings/users-devices`

- **Chunk of origin:** `static__chunks__pages__settings__users-devices-68f8073ca5b231ba.js`
- **What the user can do:**
  - Users and devices screen listing the business users and the devices they are logged in on.
  - Device records include device details and the auth token of the session.
  - Login allowances are compared across businesses, with separate counters for subscribed and currently logged-in desktop and mobile logins.
  - The screen shows whether the business is subscribed and can offer to buy more logins.
  - "Add New User (F2)" starts adding a user to the business.
- **Interactions:**
  - The screen fetches users and devices on load with a "Fetching Users" state.
  - When the login allowance is exhausted, the user is prompted to buy more logins ("No More Logins Available").
- **Notable entities & workflows:**
  - user_details, device_details, user_key, auth_token, business_user, subscription_desktop_count_across_businesses, subscription_mobile_count_across_businesses, logged_in_desktop_count_across_businesses, logged_in_mobile_count_across_businesses, is_subscribed, is_from_pricing_page, allow_vertical_scroll
- **Backend operations:** `authenticate_get_users_devices`
- **Notes:**
  - The login counters are summed across every business the user belongs to, so the allowance is account-wide.

## Subscriptions

<a id="subscriptions-checkout"></a>

### `/subscriptions/checkout`

- **Chunk of origin:** `static__chunks__pages__subscriptions__checkout-6601b55542530bd3.js`
- **What the user can do:**
  - Full subscription checkout: plan picker (free, essential and growth tiers with monthly and yearly variants), add-ons, coupons, billing details and payment.
  - Add-ons cover extra desktop logins, extra mobile logins, SMS booster packs and e-invoicing API credits, with recommended add-ons highlighted.
  - Billing details collect business name, business address, GSTIN, place of supply, contact number, email and customer name, with GSTIN format validation and IGST vs CGST+SGST tax computation.
  - Coupon support lists available LocalWell coupons, validates them on apply, discounts the payable amount and reports invalid coupons.
  - Payment summary computes gross total, discounts, GST amount, round off, net payable and a wallet credit option ("Use Localwell Credits") capped at a share of the invoice.
  - Order drafts are synced so a half-finished checkout can be resumed, with referral coupons removed when applicable.
  - Terms and conditions, refund policy and privacy links are part of the payment screen, and Razorpay is the payment gateway.
- **Interactions:**
  - Selecting a plan and quantity updates the order summary and then "Proceed to Pay" initiates the transaction.
  - "Add to Cart (F2)" stages add-ons; add-ons can be removed again before payment.
  - Applying a coupon validates it and updates totals; an invalid code shows "Invalid Coupon".
  - Billing fields validate on blur (email, mobile, name, GSTIN) and block submission until valid.
  - The transaction moves through "Initiating transaction" and "Completing Transaction" states and ends in "Payment Successful" or a payment.failed state.
  - Buying extra logins from the max-logins page re-enters the checkout with a flag so the flow returns to the right place.
- **Notable entities & workflows:**
  - base plan (free_plan, essential_monthly, essential_yearly, growth_monthly, growth_yearly), addon_plans, duration_wise_pricing, order_id, order_details, order_amounts, invoice_id, invoice_amount, invoice_round_off, gross total, discounted_amount, coupon_code, coupon_code_id, coupon_value, coupon_discount_amount, is_coupon_applied, gst_amount, is_igst_applicable, place of supply, customer_billing_address, business_gstin, business_address, business_name, customer_name, customer_email, customer_mobile_number, extra_device_logins, e_invoice_api_credits, sms_credits, wallet amount, draft_invoice, payment, refundpolicy, terms
- **Backend operations:** `subscription_get_localwell_plans, subscription_get_localwell_coupons, subscription_initiate_invoice_transaction, subscription_complete_transaction, subscription_sync_draft_invoice, subscription_get_business_invoice_details, order_base_plan, order_add_ons, order_applied_coupon, order_customer, order_is_referral_coupon_removed, order_subscription, order_valid_gstin, business_validate_gstin, get_existing_draft, check_business_user_access`
- **Notes:**
  - The checkout bundles base plan, add-ons, coupons, tax and payment into one page with a shared draft order object.
  - The plugin gateway is Razorpay; the Cashfree reference in the partner flow is a separate onboarding path.

## Support

<a id="support-account-manager"></a>

### `/support/account-manager`

- **Chunk of origin:** `static__chunks__pages__support__account-manager-dd18fec6ad021ee0.js`
- **What the user can do:**
  - Shows the business's assigned account manager with photo, name, role, greeting, languages, intro and personal story.
  - Provides direct contact actions: call the manager, WhatsApp them, or copy their contact details.
  - Presents the engagement as a three-step flow (step 1/2/3) explaining what happens after a call request.
  - Warns about outstanding items that should be reviewed before continuing.
  - The manager's level and availability/member card details are displayed.
- **Interactions:**
  - "Call Now" triggers the call request operation and shows "You are placing a call" then "You will receive a call shortly".
  - "WhatsApp" and "Code Copied" offer alternative contact paths.
  - A reset-account action opens the reset modal for the current business user.
- **Notable entities & workflows:**
  - member_cards, member_name, member_role, member_identifier, member_email, member_img_url, member_greeting, member_intro, member_story, member_languages, member_availability, manager_level, business_user, business_user_mobile_number, warning_title, warning_subtitle
- **Backend operations:** `get_business_account_manager, call_lw_account_manager`
- **Notes:**
  - Account manager assignment is per business, fetched from the backend rather than chosen by the user.

<a id="support-reset-account"></a>

### `/support/reset-account`

- **Chunk of origin:** `static__chunks__pages__support__reset-account-abcabc61909f6cbe.js`
- **What the user can do:**
  - Small modal host for a "reset account" action performed on the currently signed-in business user.
  - Prefills the current business user name and email so the reset applies to the right account.
  - Closing or cancelling the modal sends the user back to the account manager screen.
- **Interactions:**
  - On mount it reads the signed-in business user from the app store and fills the modal with their name and email.
  - Dismissing the modal redirects to the account manager page.
- **Notable entities & workflows:**
  - business_user, business_user_name, business_user_email
- **Backend operations:** `none`
- **Notes:**
  - The actual reset form and its submit logic live in the shared modal component, not in this chunk.

<a id="support-tickets-ticket_id"></a>

### `/support/tickets/[ticket_id]`

- **Chunk of origin:** `static__chunks__pages__support__tickets__[ticket_id]-69d92f63839bf583.js`
- **What the user can do:**
  - Ticket detail view with a threaded conversation of user messages and support replies.
  - Shows ticket header information: subject, ID, category, priority, status, tags, assignee, creation and modification times and expected resolution.
  - Replies can be written, and internal notes (support-only) are marked separately from customer-visible comments.
  - Images and files can be attached to a reply, with image preview and a full view.
  - Messages can be edited or deleted, with deleted messages shown as "This message was deleted."
  - Ticket status can be changed, including closing the ticket and re-opening it, and an assignee can be updated.
- **Interactions:**
  - "Send Message" posts the reply and syncs the comment list; the input is cleared afterwards.
  - "Close Ticket (F2)" and "Re-Open Ticket (F2)" update the status and reflect the new state.
  - Deleting a comment requires confirmation, and a deleted internal note is labelled distinctly.
  - Uploading an image shows per-image progress and enforces the allowed image count.
  - "Apply (F4)" commits status and assignee changes made in the ticket header.
- **Notable entities & workflows:**
  - ticket_id, ticket_subject, ticket_description, ticket_status_id, ticket_status_name, ticket_priority, ticket_priority_name, ticket_category_id, ticket_category_name, ticket_tags, assigned_to_member_id, member_name, member_id, created_on, modified_on, expected_resolution_by, is_seen, is_approval_needed, ticket_comments, ticket_comment, ticket_comment_id, ticket_comment_files, ticket_files, file_name, file_url, file_size, internal_note_title, is_internal_comment, is_delete, is_editable, can_upload_image, can_remove_image, maximum_images, user_role, business_user_name
- **Backend operations:** `tickets_get_ticket_details, tickets_sync_tickets, tickets_sync_ticket_comment`
- **Notes:**
  - Comments carry a deletion flag and a separate internal-note flag, so the server keeps soft-deleted content.

<a id="support-tickets-create-new-ticket"></a>

### `/support/tickets/create-new-ticket`

- **Chunk of origin:** `static__chunks__pages__support__tickets__create-new-ticket-e499f5e45aa6870e.js`
- **What the user can do:**
  - Form to raise a new support ticket with a subject line, category selection and a description.
  - Categories are loaded from the server with a description and can be searched.
  - Priority is chosen from a fixed set (Low, Medium, High, Critical) and optional tags with colours can be attached.
  - Up to three file attachments or screenshots can be added by drag-and-drop or browsing.
  - The form is shown as a drawer/section with Go Back and Save actions, and the business context (name, user, mobile) is carried along.
- **Interactions:**
  - Submitting validates that a subject is entered and a category is selected, with the matching messages ("Please Enter Ticket Subject", "Please Select Ticket Category").
  - Duplicate file uploads are rejected ("Same file was already uploaded."), and a read error is reported separately from an upload error.
  - Successful creation confirms "Ticket Successfully Added" and the ticket list is synced.
- **Notable entities & workflows:**
  - ticket_subject, ticket_description, ticket_category_id, ticket_category_name, ticket_category_desc, ticket_priority, priority_label, ticket_tags, tag_color_list, ticket_files, file_name, file_url, file_size, expected_resolution_by, ticket_id, business_name, business_user_name, business_user_mobile_number, member_name, is_optional, is_required
- **Backend operations:** `tickets_get_ticket_meta_data, tickets_sync_tickets`
- **Notes:**
  - Attachment limit is three and is described in the UI text itself.

<a id="support-tickets"></a>

### `/support/tickets`

- **Chunk of origin:** `static__chunks__pages__support__tickets-7f6ac09975caa851.js`
- **What the user can do:**
  - Support ticket list with a table of ticket ID, subject, category, priority, status, created and updated dates.
  - Tabs split the list by status (All, Open, Closed, Created) with per-tab ticket counts.
  - Rows are selectable and sortable, and the list supports paging.
  - Ticket categories and statuses come from server metadata, with a status colour per row.
  - A "New Ticket (F2)" action opens the create-ticket flow, and the previously selected tab is remembered.
- **Interactions:**
  - Switching tab loads that status bucket and updates the counts.
  - Selecting a row opens the ticket detail page for that ticket id.
  - The list loads asynchronously with a loading flag, and the view can be toggled between list and other layouts.
- **Notable entities & workflows:**
  - ticket_id, ticket_subject, ticket_category_id, ticket_category_name, ticket_priority, ticket_priority_name, ticket_status_id, ticket_status_name, ticket_status_color, created_on, navigation_tabs, no_of_tabs, view_by, items_length, items_per_page
- **Backend operations:** `tickets_get_tickets, tickets_get_tickets_counts, tickets_get_ticket_meta_data`
- **Notes:**
  - Counts are fetched separately from the rows so tab badges can render independently.

<a id="support-videos-resources"></a>

### `/support/videos-resources`

- **Chunk of origin:** `static__chunks__pages__support__videos-resources-016f76300a6c9d80.js`
- **What the user can do:**
  - Video resource library listing tutorial and feature videos with thumbnail, title, description, channel and duration.
  - Videos are grouped into categories with counts, and can be filtered by device type.
  - A search box filters videos by feature name.
  - An embedded player plays the selected video inside the page.
  - App version is tracked for reference and a language filter is available.
- **Interactions:**
  - Typing in the search field filters the video list as you type.
  - Selecting a category narrows the list and updates the visible count.
  - Choosing a video opens the in-page player, with the window height adjusted for the player.
  - The list shows skeleton placeholders while loading.
- **Notable entities & workflows:**
  - yt_videos, yt_video_categories, video_category, video_category_id, video_id, channel_name, title_render, description, thumbnail, device_type_id, language_name_in_english, app_version, page_no, show_count, vids_cnt, time_passed
- **Backend operations:** `dashboard_get_youtube_video`
- **Notes:**
  - The underlying content is YouTube-hosted, fetched through the dashboard video service.

## Login & access

<a id="login"></a>

### `/login`

- **Chunk of origin:** `static__chunks__pages__login-89a131be1beb37a1.js`
- **What the user can do:**
  - Combined sign-in and sign-up screen accepting a mobile number, then either an OTP or a password.
  - OTP can be delivered by SMS or WhatsApp, with resend and a "Change Mobile Number" option.
  - New numbers can create an account; existing users can continue with a password instead of an OTP.
  - Registers the current device (device name/type, device token, FCM token, installation fingerprint) so sessions can be tracked.
  - On success the user is routed to the business switcher or the app home, with a referral code optionally applied and a district/area prompt shown on first use.
  - Includes links to the Terms of Service and Privacy Policy.
- **Interactions:**
  - Entering a mobile number checks whether the user exists before choosing the OTP or password branch.
  - The OTP field validates six digits and rejects invalid or missing codes with "Please enter a valid OTP".
  - Resending is available via SMS or WhatsApp with a visible countdown.
  - "Login as a different User" returns to the mobile-number step.
  - Device and session state are synced to the server after successful sign-in.
- **Notable entities & workflows:**
  - mobile_number, mobile_number_otp, password, is_password_null, auth_token, access_token, device_name, device_token, device_type, fcm_token, installation_fingerprint, business_user_id, business_user_name, business_user_mobile_number, member_id, user_hash, referral_code, ref_id, district selection, temp_business_id, login_business_id, support_login_auth_token, app_version
- **Backend operations:** `authenticate_check_user_presence, authenticate_send_login_otp, authenticate_create_password, authenticate_device_user, session_sync_device, business_get_user_businesses, check_business_user_access`
- **Notes:**
  - The login screen is the single entry point that decides between OTP login, password login and account creation.

<a id="login-create-password"></a>

### `/login/create-password`

- **Chunk of origin:** `static__chunks__pages__login__create-password-1b52f03adafbb464.js`
- **What the user can do:**
  - Set-password screen for a newly created user, asking for a password and a confirmation.
  - The screen can switch the account (Change Business User) and shows the username being set.
  - Success path reports "Password Created Successfully" and continues into the app.
  - Password and confirmation must match, and the password must satisfy the length/format rules.
- **Interactions:**
  - Validation compares the two fields and rejects a mismatch with "Password and Confirm Password are not Matching".
  - Saving the password requires a valid password before it is accepted.
  - The screen can go back to the login flow via the back icon.
- **Notable entities & workflows:**
  - password, confirm_password, business_user_name, temp_business_id, login_business_id, pre_auth_mobile, auth_token, is_loading, is_disabled
- **Backend operations:** `authenticate_create_password, business_get_user_businesses, check_business_user_access`
- **Notes:**
  - Business access is checked after the password is set, so a user without access is rejected at this step.

<a id="login-login"></a>

### `/login/login`

- **Chunk of origin:** `static__chunks__pages__login__login-a2f0c63e25e6b13e.js`
- **What the user can do:**
  - Legacy login route that exists only to redirect visitors to the current login screen.
- **Interactions:**
  - On mount it pushes the user to /login and renders nothing.
- **Notable entities & workflows:**
  - none
- **Backend operations:** `none`
- **Notes:**
  - The chunk contains only the Next.js route registration and a redirect effect.

<a id="login-login-exhausted"></a>

### `/login/login-exhausted`

- **Chunk of origin:** `static__chunks__pages__login__login-exhausted-c88a77814ab48051.js`
- **What the user can do:**
  - Blocking screen shown when the business has used all of its allotted device logins.
  - Displays the business name, owner, employee name, user role and last login details.
  - Lists active devices and desktop-only devices for the account.
  - Offers two ways out: buy more logins (upgrade) or contact the shop owner.
  - Shows subscribed versus logged-in counters across all businesses the user belongs to.
- **Interactions:**
  - The screen fetches active devices on load with a "Fetching Active Devices" state.
  - "Buy More Logins (F2)" starts the subscription checkout with the max-login flag so the user returns here afterwards.
  - "Contact Shop Owner" and "Subscribe Now (F2)" are the alternative escalation paths.
  - The user is blocked from other actions while the allowance is exhausted (prevent_user_actions).
- **Notable entities & workflows:**
  - business_name, business_user, business_user_name, business_user_role_id, user_details, device_details, is_max_logins_reached, is_subscribed, logged_in_desktop_count_across_businesses, subscription_desktop_count_across_businesses, subscription_mobile_count_across_businesses, show_only_desktop_devices, is_from_max_login, adding_subscription_from_max_login_page, prevent_user_actions, sync_settings
- **Backend operations:** `authenticate_get_users_devices, check_business_user_access`
- **Notes:**
  - Reached both from a login attempt and from the users-and-devices screen when logins run out.

<a id="login-register"></a>

### `/login/register`

- **Chunk of origin:** `static__chunks__pages__login__register-6d505d913ea9fc28.js`
- **What the user can do:**
  - Business registration form for a new pharmacy or a new branch of an existing business.
  - Fields: business name, owner name, business type (Retailer or Distributor), email, mobile number and area pincode.
  - Pincode lookup resolves the district name and validates the pincode against the geography service.
  - GST-registered status can be declared with a yes/no choice, and an optional referral code can be applied.
  - On success it confirms "Registration Successful" and continues to password creation.
- **Interactions:**
  - Each field validates on blur with a specific message (business name, owner name, email format, valid pincode).
  - Selecting the business type shows the matching inputs, and the district name is filled from the chosen pincode.
  - The referral accordion is optional and only sent when a code is entered.
  - Registration submits the business and the primary business user together.
- **Notable entities & workflows:**
  - business_name, business_owners_name, business_type, business_user_name, business_user_email, business_user_mobile_number, business_pin_code, business_pin_code_id, district_name, is_gst_registered, referral_code, business_referral_code, mobile_number, pre_auth_mobile, installation_fingerprint, business_users
- **Backend operations:** `business_add_business, geography_get_pincodes`
- **Notes:**
  - Registration runs after the mobile number is authenticated, so the phone number is already known.

<a id="login-subscription-expired"></a>

### `/login/subscription-expired`

- **Chunk of origin:** `static__chunks__pages__login__subscription-expired-b3f80523ff987888.js`
- **What the user can do:**
  - Blocking screen shown when the business's premium subscription has lapsed.
  - Shows the business and user context with the warning that the current plan has expired.
  - Lists active devices for the account and compares subscribed versus logged-in logins.
  - Offers a direct renewal action back into the subscription flow.
- **Interactions:**
  - Active devices are fetched on load with a "Fetching Active Devices" state.
  - "Renew Premium Now (F2)" routes into the subscription checkout.
  - The screen is shown instead of the normal app after authentication.
- **Notable entities & workflows:**
  - business_user, business_user_role_id, business_id, is_subscribed, is_max_logins_reached, logged_in_desktop_count_across_businesses, subscription_desktop_count_across_businesses, subscription_mobile_count_across_businesses, show_only_desktop_devices, is_from_pricing_page, adding_subscription_from_max_login_page, temp_business_id
- **Backend operations:** `authenticate_get_users_devices, check_business_user_access`
- **Notes:**
  - Shares the same shell and data as the login-exhausted screen; only the warning copy and the renewal action differ.

<a id="login-support-...params"></a>

### `/login/support/[...params]`

- **Chunk of origin:** `static__chunks__pages__login__support__[...params]-3acd439668cbe80c.js`
- **What the user can do:**
  - Support-assisted sign-in entry point that receives business user id, user hash, member id and a support auth token.
  - Shows a LocalWell logo and a "Signing you in..." message while the handoff completes.
- **Interactions:**
  - On mount it takes the four parameters from the route and replaces the URL with the login route carrying them as query values.
  - If any parameter is missing the redirect is skipped and the page stays on the signing-in state.
- **Notable entities & workflows:**
  - business_user_id, user_hash, member_id, support_login_auth_token
- **Backend operations:** `none`
- **Notes:**
  - The actual token exchange happens on the login page after the redirect.

<a id="login-switch-business"></a>

### `/login/switch-business`

- **Chunk of origin:** `static__chunks__pages__login__switch-business-309cbc76f2f797d9.js`
- **What the user can do:**
  - Business picker listing every business the signed-in user can access, with address, business type and subscription state.
  - Each entry shows its subscription status: Subscribed, Under Free Trial, Renewal Pending or Yet to Subscribe.
  - Retail and Distribution businesses are rendered differently and can carry a logged-in flag.
  - Offers "Add a New Firm or Branch" and an option to log out of the current device.
  - A footer confirms the switch in progress or reports a successful logout.
- **Interactions:**
  - Selecting a business switches the active session and confirms with "Switching Business".
  - "Logout" ends the device session and reports "Logged out successfully".
  - The list loads with a "Fetching Businesses" state and falls back to the register route to add a business.
  - Retail and distributor detail panels are shown for the highlighted business.
- **Notable entities & workflows:**
  - business_id, business_name, business_address, business_type_id, business_user_mobile_number, subscription_status, logged_in, access_token, auth_token, temp_business_id, login_business_id, switch_business_id, district selection
- **Backend operations:** `business_get_user_businesses, business_logout_device, check_business_user_access, view_customer_selected_details, view_distributor_selected_details`
- **Notes:**
  - The route also leads to the login-exhausted screen when the chosen business has no free logins left.

## Miscellaneous

<a id="upload-migration-data"></a>

### `/upload-migration-data`

- **Chunk of origin:** `static__chunks__pages__upload-migration-data-bc2503752b7e2534.js`
- **What the user can do:**
  - Landing screen for bringing in data from another accounting package, headed "Upload Migration Data".
  - Intro line instructs the user to upload a single database file to migrate data from any software.
  - A "Select Previous Software" dropdown is the first step; its value drives the rest of the flow and can be cleared once selected.
  - Pressing Space on the dropdown opens a modal for picking the source software.
  - The modal contains a lazy search box over the software list and a single-column table showing each software name, with row selection and Enter-to-confirm.
  - The chosen software is stored on the page and shown back in the dropdown; an upload area sits below it.
- **Interactions:**
  - Typing in the modal search re-queries the software list and refreshes the table.
  - Clicking a row or pressing Enter selects that software and closes the modal; the dropdown then displays the selected name.
  - The search field auto-focuses when the modal opens so the user can type immediately.
- **Notable entities & workflows:**
  - software_id, software_name, software_list, search_text
- **Backend operations:** `get_migration_softwares`
- **Notes:**
  - The file-upload widget itself is only a styled container in this chunk; the actual upload/validation and migration-request operations live in the control-center migration chunk.
  - Only the software-lookup operation is present here.

<a id="root"></a>

### `/`

- **Chunk of origin:** `static__chunks__pages__index-d244792227feccc9.js`
- **What the user can do:**
  - Root route that exists only to send visitors into the login flow.
  - Renders an empty placeholder while the redirect happens.
- **Interactions:**
  - On mount it pushes the router to /login.
- **Notable entities & workflows:**
  - none
- **Backend operations:** `none`
- **Notes:**
  - The chunk contains only the route registration and a redirect effect.

<a id="_error"></a>

### `/_error`

- **Chunk of origin:** `static__chunks__pages___error-c045b1966ba31c39.js`
- **What the user can do:**
  - Next.js custom error route registration.
  - Contains no application code of its own; the error UI comes from the framework runtime.
- **Interactions:**
  - None in this chunk.
- **Notable entities & workflows:**
  - none
- **Backend operations:** `none`
- **Notes:**
  - The chunk is only a route registration entry, so no feature detail is recoverable from it. ## Notes on API extraction
  - None of these 35 page chunks contains a literal `/api/...` URL string; the only `/api` hit in the whole folder is the Google Maps script URL. Every backend call is made through a shared request helper that receives a service operation name (for example `business_get_profile`, `tickets_sync_tickets`), and those operation names are resolved to URL paths in a runtime chunk that is not part of this folder.
  - The API lines above therefore list the service operation identifiers each page actually invokes, which is the closest observable equivalent of an endpoint path.

