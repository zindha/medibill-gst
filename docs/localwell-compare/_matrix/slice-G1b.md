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

