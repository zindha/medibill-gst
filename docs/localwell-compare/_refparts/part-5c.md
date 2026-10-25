# Reference part 5c

### /expenses/add-expense/[expense_id]  ·  chunk: static__chunks__pages__expenses__add-expense__[expense_id]-8fc8cd520a3d1189.js
Features:
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
Interactions:
- Party GSTIN is auto-validated once it reaches 15 characters, which fills in trade name, address, district and composition-dealer status; invalid input blocks saving.
- Selecting or creating a party resets dependent fields, and the party list reloads after a party is saved or deleted.
- Deleting an expense or a party requires confirmation, then returns the user to the expense list.
- Toggling GST nature clears the previously chosen party and switches the tax display between CGST+SGST and IGST.
API: `expenses_get_parties`, `expense_sync_party`, `expense_get_metadata`, `expenses_get_products`, `medicine_get_hsn_gst_rates`, `business_get_prefix_sequence`, `expense_sync_expense`, `expense_get_expense_details`, `business_validate_gstin`
Entities: expense_no, expense_date, expense_category_id, expense_category, party_id, party_name, party_gstin, party_address, district_id, district_name, state_id, state_name, party_contact, party_email, is_gst_registered, is_composition_dealer, invoice_no, invoice_date, transaction_remarks, expense_item_name, expense_hsn_code_id, hsn_code, hsn_gst_rate, expense_gst_rate, expense_transaction_quantity, expense_transaction_rate, temp_unit_rate, expense_amount, expense_round_off, transaction_utr, transaction_records, business_payment_account_id, payment_date, cheque, is_credit, expense_details_id, expense_transaction_detail_id
Notes:
- Save is gated: an item must exist, a party and a category must be selected, GST mode requires an invoice number, and every GST row needs a valid HSN code.
- The delete calls reuse the same sync operation with an "is delete" flag rather than a dedicated delete endpoint; the party delete dialog offers a merge-style delete.
- No receipt or file attachment exists on this page; the payment modal, HSN/product pickers and several form widgets live in shared chunks outside this file.

### /expenses/view-expenses  ·  chunk: static__chunks__pages__expenses__view-expenses-7929ae125b9338b5.js
Features:
- Read-only expense list screen introduced as "Business Expenses" for tracking shop running costs.
- Filter row offers a search box labelled "SEARCH EXPENSES" that matches on expense number or party name.
- An "ADDED BETWEEN" date-range picker with presets for Today, Yesterday, Last 7 Days, Last 30 Days, This Month and Last Month, defaulting to the last seven days.
- A toggle restricts the list to GST expenses only.
- Results render in a focusable table with row selection, chevron affordance and ant-design pagination; the columns come from a shared column definition.
- Header offers an "Add New Expense" action that jumps straight into the add-expense screen for a new record.
- A keyboard hint bar documents F2 to add, arrow keys to move and Enter to open a selected expense.
Interactions:
- Rows are clickable and open the corresponding expense in the add-expense route, reusing it as the detail view.
- Filters are applied together in a single fetch, so changing the search text, date window or GST toggle reloads the same list endpoint.
- The page refetches automatically whenever the filter state changes.
- Selecting a row navigates to that expense's detail page; the add action opens the same page with a new-record identifier.
- Focus is managed between the filter inputs and the table so arrow-key navigation works after the search field loses focus.
API: `expenses_get_expenses`
Entities: expense_id, expense_no, from_date, to_date, date_range, search_text, show_expense_with_gst, expense_with_gst, expenses
Notes:
- The date picker is defined locally in this chunk and reuses the app's shared date component.
- Column rendering and table cell fields are supplied by a shared module, so the exact list columns are not visible here.

### /upload-migration-data  ·  chunk: static__chunks__pages__upload-migration-data-bc2503752b7e2534.js
Features:
- Landing screen for bringing in data from another accounting package, headed "Upload Migration Data".
- Intro line instructs the user to upload a single database file to migrate data from any software.
- A "Select Previous Software" dropdown is the first step; its value drives the rest of the flow and can be cleared once selected.
- Pressing Space on the dropdown opens a modal for picking the source software.
- The modal contains a lazy search box over the software list and a single-column table showing each software name, with row selection and Enter-to-confirm.
- The chosen software is stored on the page and shown back in the dropdown; an upload area sits below it.
Interactions:
- Typing in the modal search re-queries the software list and refreshes the table.
- Clicking a row or pressing Enter selects that software and closes the modal; the dropdown then displays the selected name.
- The search field auto-focuses when the modal opens so the user can type immediately.
API: `get_migration_softwares`
Entities: software_id, software_name, software_list, search_text
Notes:
- The file-upload widget itself is only a styled container in this chunk; the actual upload/validation and migration-request operations live in the control-center migration chunk.
- Only the software-lookup operation is present here.
