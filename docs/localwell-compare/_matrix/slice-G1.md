# LocalWell reference â€” consolidated screen inventory

Reference spec for the feature-parity audit. Every screen below was derived from the shipped reference front-end bundles; this document restates what each page does in our own words and keeps the original per-page evidence fields (route, chunk of origin, capabilities, interactions, data entities and backend operations).

## Method & conventions

- **Pages analysed:** 93 reference page bundles (`static/chunks/pages/**`) across the reference app's Next.js pages router, covering every screen in the shipped chunk set.
- **How routes were derived:** each page's route path is taken from its bundle filename (`static__chunks__pages__<section>__<page>-<hash>.js`); nested segments such as `[sale_id]`, `[stock_audit_id]`, `[report_id]`, `[ticket_id]`, `[order_id]`, `[distributor_id]` and `[...params]` are dynamic route parameters, so one bundle can serve several document kinds.
- **Backend calls:** the reference dispatches every backend call through a shared request helper that takes a *named service operation* (for example `business_get_profile`, `tickets_sync_tickets`). No page bundle contains a literal `/api/...` URL string â€” endpoint identity lives in a runtime service bundle that was not part of the page set. The `API` field on each page therefore lists the operation identifiers the page actually invokes, which is the closest observable equivalent of an endpoint path.
- **Operation catalogue:** `ref-api-operations.md` catalogues 552 distinct operation identifiers invoked by the reference UI; 272 of them resolve to concrete request paths (e.g. `business_get_profile` -> `/app/business/get_business_profile`, `customer_orders_get_orders` -> `/app/customer_order/get_orders`). The remaining 280 are invoked but were not recovered from the service registry.
- **Page fields:** `Features` = what the user can do on the page; `Interactions` = how the user drives it (keyboard shortcuts, modals, filters, workflows); `Entities` = the notable data objects the page works with; `API` = the named service operations it dispatches; `Notes` = behaviours worth calling out for parity work.
- **Status of this document:** this is the *reference* side of the comparison only. Coverage of our own app lives in `parity-matrix.md`; the API-side capability view lives in `ref-api-operations.md`.

## Table of contents

- **Sale & customers** (`sale`) â€” 6 page(s)
  - [`/sale/add-sale`](#sale-add-sale)
  - [`/sale/add-sale/[sale_id]`](#sale-add-sale-sale_id)
  - [`/sale/customer-facing-screen`](#sale-customer-facing-screen)
  - [`/sale/return-sale`](#sale-return-sale)
  - [`/sale/view-sales`](#sale-view-sales)
  - [`/sales-routes`](#sales-routes)
- **Invoices & document printing** (`invoices`) â€” 4 page(s)
  - [`/invoices/credit-note`](#invoices-credit-note)
  - [`/invoices/debit-note`](#invoices-debit-note)
  - [`/invoices/e-way-bill-view`](#invoices-e-way-bill-view)
  - [`/invoices/sale-invoice-new`](#invoices-sale-invoice-new)
- **Transactions** (`transactions`) â€” 4 page(s)
  - [`/transactions/sales`](#transactions-sales)
  - [`/transactions/purchases`](#transactions-purchases)
  - [`/transactions/sale-returns`](#transactions-sale-returns)
  - [`/transactions/purchase-returns`](#transactions-purchase-returns)
- **Reminders / patient follow-ups** (`reminders`) â€” 1 page(s)
  - [`/reminders/view-reminders`](#reminders-view-reminders)
- **Purchase** (`purchase`) â€” 6 page(s)
  - [`/purchase/add-purchase`](#purchase-add-purchase)
  - [`/purchase/banner/b2connectbanner`](#purchase-banner-b2connectbanner)
  - [`/purchase/import-csv`](#purchase-import-csv)
  - [`/purchase/return-expired-products`](#purchase-return-expired-products)
  - [`/purchase/return-purchase`](#purchase-return-purchase)
  - [`/purchase/view-purchases`](#purchase-view-purchases)
- **Orderbook (procurement workspace)** (`orderbook`) â€” 11 page(s)
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
- **Stocks** (`stocks`) â€” 9 page(s)
  - [`/stocks/adjust-stocks`](#stocks-adjust-stocks)
  - [`/stocks/bulk-update-settings`](#stocks-bulk-update-settings)
  - [`/stocks/stock-transfer/view-transfers`](#stocks-stock-transfer-view-transfers)
  - [`/stocks/update-stock-info`](#stocks-update-stock-info)
  - [`/stocks/upload-stocks`](#stocks-upload-stocks)
  - [`/stocks/view-stocks`](#stocks-view-stocks)
  - [`/stocks/stock-picklist`](#stocks-stock-picklist)
  - [`/stocks/print-barcode-labels`](#stocks-print-barcode-labels)
  - [`/stocks/print-barcode-labels/stock-scan-qr`](#stocks-print-barcode-labels-stock-scan-qr)
- **Stock audit** (`stock-audit`) â€” 4 page(s)
  - [`/stock-audit/view-audit/[stock_audit_id]`](#stock-audit-view-audit-stock_audit_id)
  - [`/stock-audit/view-batches/[stock_audit_id]`](#stock-audit-view-batches-stock_audit_id)
  - [`/stock-audit/view-products`](#stock-audit-view-products)
  - [`/stock-audit`](#stock-audit)
- **Dashboard** (`dashboard`) â€” 1 page(s)
  - [`/dashboard/view-dashboard`](#dashboard-view-dashboard)
- **Customer orders (B2B / marketplace side)** (`customer-orders`) â€” 4 page(s)
  - [`/customer-orders`](#customer-orders)
  - [`/customer-orders/business-kyc`](#customer-orders-business-kyc)
  - [`/customer-orders/order-detail`](#customer-orders-order-detail)
  - [`/customer-orders/promote-medcart`](#customer-orders-promote-medcart)
- **Reports** (`reports`) â€” 2 page(s)
  - [`/reports/business-reports`](#reports-business-reports)
  - [`/reports/business-report-view/[report_id]`](#reports-business-report-view-report_id)
- **Cash & bank** (`cash-and-bank`) â€” 3 page(s)
  - [`/cash-and-bank`](#cash-and-bank)
  - [`/cash-and-bank/account-statement`](#cash-and-bank-account-statement)
  - [`/cash-and-bank/cheque-management`](#cash-and-bank-cheque-management)
- **Expenses** (`expenses`) â€” 2 page(s)
  - [`/expenses/add-expense/[expense_id]`](#expenses-add-expense-expense_id)
  - [`/expenses/view-expenses`](#expenses-view-expenses)
- **Control centre** (`control-center`) â€” 10 page(s)
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
- **Integrations / partner onboarding** (`integrations`) â€” 6 page(s)
  - [`/integrations`](#integrations)
  - [`/integrations/aadhar-kyc`](#integrations-aadhar-kyc)
  - [`/integrations/business-detail`](#integrations-business-detail)
  - [`/integrations/kyc-docs`](#integrations-kyc-docs)
  - [`/integrations/partner_integrations`](#integrations-partner_integrations)
  - [`/integrations/verify-email`](#integrations-verify-email)
- **Settings** (`settings`) â€” 2 page(s)
  - [`/settings/subscriptions`](#settings-subscriptions)
  - [`/settings/users-devices`](#settings-users-devices)
- **Subscriptions** (`subscriptions`) â€” 1 page(s)
  - [`/subscriptions/checkout`](#subscriptions-checkout)
- **Support** (`support`) â€” 6 page(s)
  - [`/support/account-manager`](#support-account-manager)
  - [`/support/reset-account`](#support-reset-account)
  - [`/support/tickets/[ticket_id]`](#support-tickets-ticket_id)
  - [`/support/tickets/create-new-ticket`](#support-tickets-create-new-ticket)
  - [`/support/tickets`](#support-tickets)
  - [`/support/videos-resources`](#support-videos-resources)
- **Login & access** (`login`) â€” 8 page(s)
  - [`/login`](#login)
  - [`/login/create-password`](#login-create-password)
  - [`/login/login`](#login-login)
  - [`/login/login-exhausted`](#login-login-exhausted)
  - [`/login/register`](#login-register)
  - [`/login/subscription-expired`](#login-subscription-expired)
  - [`/login/support/[...params]`](#login-support-...params)
  - [`/login/switch-business`](#login-switch-business)
- **Miscellaneous** (`misc`) â€” 3 page(s)
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

