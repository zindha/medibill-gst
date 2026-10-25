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

