# Reference part 5b

### /reports/business-reports  ·  chunk: static__chunks__pages__reports__business-reports-05590721bd92498b.js
Features:
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

Interactions:
- Click a report row to open that report.
- Click the row star to favourite or unfavourite without triggering row navigation.
- Switch category tab to change the listed reports.
- Open the "How to View Reports?" help video.

API: `reports_get_reports`, `reports_add_starred_reports`, `reports_remove_starred_reports`
Entities: report_id, report_name, report_name_footer, report_desc, report_categories, report_category_id, report_category_name, is_starred_report, business_type_id, is_distributor, is_row_selectable, is_column_hidden, active_tab
Notes:
- Metadata for the report the user picked is kept in shared state and reused by the view page.
- No literal endpoint URLs appear; every request goes through the shared service layer keyed by the operation identifiers above.

### /reports/business-report-view/[report_id]  ·  chunk: static__chunks__pages__reports__business-report-view__[report_id]-ddefcfaf42d00f77.js
Features:
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

Interactions:
- Pick a date range and a view-by option, then load the report.
- Open "Filter Report Columns" and tick the columns to show.
- Open the filter modal, choose filter values and apply them.
- Star or unstar the report from the header.
- Choose an export format and export; print or email from the print modal.

API: `get_mapping_business_for_migration`, `customers_search_customers`, `medicine_search_medicines`, `schedule_types`, `reports_add_starred_reports`, `reports_remove_starred_reports`, `report_download_pdf`, `report_download_excel`, `report_download_csv`, `report_download_html`, `report_send_email`
Entities: report_id, report_name, report_meta_data, report_category_id, report_category_name, report_filters, filter_columns, data_columns, date_range, date_range_type, from_date, to_date, default_days, maximum_selectable_date_days, report_view_by, report_view_by_filters, report_view_by_name, report_view_by_filter_id, applied_filters, selected_filters, report_payload_array_key, report_payload_label_key, report_payload_value_key, has_dedicated_excel_api, report_api_endpoint, excel_base64, html_preview, is_stock_transfer, selected_branches, business_id, business_name, business_gstin, business_drug_license_no, customer_name, customer_balance
Notes:
- The row fetch and the export both dispatch an operation name taken from report metadata (report_api_key / report_api_endpoint), so report-specific operations exist beyond the literals listed above.
- Export responses arrive as base64 payloads that are saved as XLSX/CSV or rendered as a PDF.

### /cash-and-bank  ·  chunk: static__chunks__pages__cash-and-bank-1f3db9a089df0370.js
Features:
- Landing screen titled "Payment Accounts" with the tagline "Never loose track of your Cash Flow & Accounts".
- Table columns are "ACCOUNT NAME / BRANCH" (display name over branch name), "ACC HOLDER NAME / UPI", "IFSC CODE" (tagged current or savings account) and "LATEST TXN" (last transaction date), alongside a balance column.
- Each row shows the bank's brand image for that account type.
- Search box labelled "Search Accounts" with the hint "Search by Acc no, Acc Holder Name, IFSC Code".
- Sort and filter panels "SORT BY" and "FILTER BY" are built from server-supplied sort and account filter definitions, with a "Reset Filter" option.
- The cash-in-hand total comes back on the summary response and is published to shared state so the rest of the module can use it.
- A "Watch Tutorial" video panel is available, and that panel itself offers a language selector.
- Rows are selectable so a chosen account can open its statement, and the result count is shown in the footer.
- A landing analytics event fires on entry.

Interactions:
- Search accounts by account number, holder name or IFSC code.
- Open SORT BY or FILTER BY and reset the filters.
- Click an account row to open its statement.
- Open the tutorial video and switch its language.

API: `get_pay_acc_filters`, `get_payment_account_summary`
Entities: business_payment_account_id, payment_account_display_name, payment_account_type_id, bank_branch_name, bank_branch_ifsc_code, account_balance, last_transaction_dt, cash_in_hand, payment_accounts, account_filters, sort_filters, search_text, items_length, is_current_bank_account, pay_accs_image_url
Notes:
- This page only reads a summary; account detail and transaction history are fetched on the statement page.

### /cash-and-bank/account-statement  ·  chunk: static__chunks__pages__cash-and-bank__account-statement-5bbb9f294d620ecf.js
Features:
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

Interactions:
- Search, sort and filter transactions and select a date range.
- Add a money-in or money-out adjustment; edit or delete an existing transaction.
- Open the download modal and export the statement as PDF or CSV.
- Delete the payment account.

API: `get_pay_acc_filters`, `get_pay_acc_detail`, `get_pay_acc_statement`, `get_pay_acc_transaction_detail`, `add_pay_acc_transaction`, `edit_pay_acc_transaction`, `delete_pay_acc_transaction`, `delete_pay_acc`, `download_pay_acc_statement`
Entities: business_payment_account_id, account_balance, opening_balance, closing_balance, transaction_amount, transaction_utr, transaction_date, transaction_remarks, txn_type, txn_narration_header, txn_narration_footer, is_adjustment_entry, is_opening_balance, is_closing_balance, adjustment_type_id, adjustment_name, credit_transaction_id, debit_transaction_id, transfer_transaction_id, source_payment_account_type_id, target_payment_account_type_id, primary_account_id, account_holder_name, bank_name, bank_account_no, upi_address, merchant_id, merchant_key, terminal_identifier, transaction_records, page_no, date_range, from_date, to_date
Notes:
- Balance arithmetic differs for add versus reduce and is recomputed against the stored account balance when an adjustment is edited.
- The statement download returns a base64 file that is written out locally.

### /cash-and-bank/cheque-management  ·  chunk: static__chunks__pages__cash-and-bank__cheque-management-8cc065880489ac57.js
Features:
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

Interactions:
- Switch between the open and cleared cheque tabs.
- Add a cheque through the form; validation errors block saving.
- Open the cheque action modal and post the cheque to a bank account or to cash.
- Revert a cheque to open state, or delete a cheque.
- Search and filter the cheque list.

API: `get_pay_acc_filters`, `get_cheques`, `add_cheque`, `update_cheque`, `delete_cheque`, `get_payment_accounts`
Entities: cheque_id, cheque_no, cheque_micr, cheque_amount, cheque_date, cheque_party_name, cheque_party_footer, is_credit_cheque, is_credit_cheque_count, is_debit_cheque_count, is_bearer_cheque, is_external_cheque, is_cheque_open, pay_in_amount_sum, pay_out_amount_sum, cheque_stats, payment_accounts, payment_account_type_id, business_payment_account_id, payment_date, payment_invoice_no, transaction_utr, transaction_amount, customer_id, customer_name, distributor_id, distributor_name, district_id, district_name, state_id, state_name, business_user_name, date_range, from_date, to_date, view_by_id
Notes:
- Revert and edit both go through the same update operation with a mode flag rather than separate endpoints.
- The selected tab is translated into a view-by id that is sent with the cheque list request.
