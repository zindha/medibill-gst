### /sale/add-sale
- New-sale landing screen that hosts a multi-panel sale composer (customer and product selection, sale details, and r
- Redirects away when the sale store already holds a completed sale, sending the user to that sale's own detail URL i
- Three entry modes selected by URL flags
- Marks the session as a stock transfer when launched as one, and records the sale type accordingly.
- Carries a draft identifier in session state so a partially built sale can be resumed.
- Pulls the active business record out of the global store on mount to render header context.
- Optional quick-scan module appears only for a single business type and is suppressed for transfers and quotations.
- Hides the navigation menu and caps page height to the viewport minus header chrome, giving the composer a full-heig
- Sets the browser page title to "Add Sales".

### /sale/add-sale/[sale_id]
- Detail/editor variant of the sale screen, opening an existing sale, a quotation, or a stock transfer depending on U
- Distinguishes the three document kinds
- Loads the stored sale header for the requested id and shows a toast when the backend returns a non-success status.
- Loads quotation details through a separate fetch path so quotations are read with their own payload.
- Reads sale main details and sale doctor details from the shared sale store, so an in-progress draft and the linked 
- Resets the "view" mode so the record opens read-only first rather than directly editable.
- Clears follow-up suggestion state (follow-ups to show, follow-ups to suggest, follow-ups based on, non-composition 
- Composes the same customer/product/detail panels as the new-sale screen, with the side menu hidden and a fixed work
- Offers a quick-scan entry point, switched off for the quoting/stock-transfer variants.

### /sale/customer-facing-screen
- A customer-facing checkout display intended to run on a second screen or device facing the shopper, not the cashier
- Welcome state with a store greeting, store logo, business name, and the current date.
- Live "YOUR ORDER" panel listing each product with quantity, pack, rate, MRP, batch number and batch expiry.
- Footer totals row covering product count, quantity, MRP total, rate totals, discount, round-off and the amount to p
- Savings and refund messaging
- Purchase/return/settlement panels summarising purchase amounts, purchase returns, sale returns, payable, paid, refu
- A payment request area that fetches a payment QR image for the sale so the shopper can scan and pay.
- A product scan prompt inviting the shopper to scan a barcode.
- Rating widget (star rating) and an NPS-style scale from 0 to 10, both written back to the sale as customer feedback
- A "Recommend Us" recommendation prompt plus a customer-experience carousel.
- Uses business profile and invoice settings to render logo and header content.

### /sale/return-sale
- Largest workflow in this set
- Picks the original sale by searching on invoice number, date or amount, then loads that invoice's line items and ba
- Line-item grid with columns for medicine, batch, expiry, pack, quantity, MRP, rate, sale rate, GST and HSN, plus fr
- Batch selection per product with expiry filtering (expiring/expired highlighting) and a "recently sold products" sh
- Return date, sale return number/prefix sequence, and a separate stock-return transfer number and date for transfer-
- Settlement area
- Payment capture against a business payment account with mode, reference/UTR number, date and cheque number/MICR det
- Payment modes include cash, cheque and other accounts; a "VIEW PAYMENTS" panel lists prior settlement rows.
- Settings drawer (F2) exposing return date, common settings, prefix/sequence fetch and report-GST-for-return flag.
- A warning/"Resolve Warnings" gate that blocks saving until outstanding validation warnings are cleared.
- B2B Connect import
- E-invoicing
- Draft support
- Stock return transfer can be exported as an invoice and its transfer status synchronised.
- View mode shows the saved return with an invoice preview and an export action.

### /sale/view-sales
- Master screen for reviewing sales, split into two top-level sections
- Customer side renders a card list of customers with dues and totals, plus a customer-detail panel.
- Customer detail panel has its own tabs
- Sales-by-date side has tabs SALES, RETURNS and PAYMENTS for the selected date range.
- Customer summary cards report gross sales, net sales, paid amount, due/outstanding, customer returns due, customer 
- Transaction tables expose invoice number, credit note number, payment invoice number, invoice amount, paid amount, 
- Date filters offer Today, Yesterday, Last 7 Days, Last 30 Days, Last Month, This Month plus custom from/to dates.
- Search by customer name or GSTIN, with sort and filter controls that support an applied-filter summary and a reset.
- Customer actions menu
- Sales-side actions include adding a customer, creating a sale return, sending a payment reminder, and downloading a
- Permission-aware
- Tracks drafts, quotations, proformas and e-invoice status as separate counts.

### /sales-routes
- Manages the salesman's route plan
- Route card list shows route name, area name, assigned salesman and the mapped/unmapped customer counts.
- Right-hand panel for the selected route has two tabs
- Unmapped customers can be mapped to the current route in bulk via a "MAP TO THIS ROUTE" action.
- Mapped customers can be detached with a "REMOVE FROM THIS ROUTE" action.
- A salesman picker lets the user choose or clear the route's salesman, with a "No Salesman Added" empty state when u
- Route creation/editing modal captures the route name and area.
- Customer list shows name, mobile number, email id, address lines and drug licence number.
- Search boxes for routes, for a salesman by name or number, and for customers by name or GSTIN.
- Infinite list loading with a "Load More" control, plus sort and filter panels with applied-filter display.
- Header buttons

### /invoices/credit-note
- Renders a printable credit note for a sale return, built from server-side HTML returned by the backend.
- Header shows the note number, the creation date, and the invoice it belongs to.
- A live HTML preview pane with zoom in/out, page selection and previous/next note navigation.
- Print section offers a printer choice between laser/inkjet and a thermal receipt layout, with an export-as-PDF shor
- A "Send Invoice (F2)" modal offering three channels
- WhatsApp delivery uses a pre-formatted message text against the customer's mobile number via the WhatsApp web link.
- PDF export writes a base64 PDF to a data URL and triggers a browser download.
- Includes the returned line items and the return details with the products returned.
- Header action to jump back to the originating sale.

### /invoices/debit-note
- Printable debit note for a purchase return, the purchase-side mirror of the credit note.
- Header shows the debit note number and the creation date, alongside the source purchase return.
- Live HTML preview with zoom, page selection and previous/next note navigation.
- Print section offers laser/inkjet versus thermal receipt layouts, plus export-as-PDF (F4).
- A "Send Invoice (F2)" modal with email, SMS and WhatsApp channels.
- WhatsApp delivery sends a prepared message to the target mobile number.
- Body lists the returned products and the purchase return details.
- Header action links back to the originating purchase.

### /invoices/e-way-bill-view
- Read-only viewer for the e-way bill attached to a sale invoice.
- Shows the e-way bill number, the date it was generated, and the date it stays valid until.
- Renders the bill as server-produced HTML in a preview pane with zoom and page selection.
- Export-as-PDF (F4) writes a base64 PDF and downloads it as an e-way-bill file.
- Header shows the invoice number and invoice date for cross-reference.
- A back button returns to the previous screen.

### /invoices/sale-invoice-new
- Sale-invoice viewer/print screen built around a server-rendered invoice HTML preview.
- Header shows invoice number, invoice date and the invoice status chips (Sale, Credit, Paid, Proforma).
- Preview pane supports zoom in/out and page selection, with previous/next invoice navigation.
- Print section offers laser/inkjet, thermal receipt, and dot-matrix A5/A6 layouts, with export-as-PDF (F4).
- Dot-matrix rendering has separate templates for A5 and A6 paper sizes.
- A "Send Invoice (F2)" modal offers email, SMS and WhatsApp channels.
- WhatsApp sharing links to the online store, so the customer can also shop there.
- A language switcher (English plus three regional languages) and a "Watch Tutorial" video modal for invoice guidance
- Customer summary panel shows name, mobile number, age, first-sale date and total customer net value, with a link to
- Quotation details are shown inline when the source document is a quotation, including the validity date.
- Websocket status is tracked so live connectivity loss can be surfaced.
- Link to jump to the sale screen and to the previous/next sale in the list.

### /transactions/sales
- Thin transaction-list screen that renders a shared invoices widget configured for the sales category.
- The widget is given a tab identifier of 1 and the label "Sales" with an always-on count display.
- Wrapped in the common page container so it inherits the standard header, filter and footer scaffold.
- Sets the page title to "View Invoices ".
- Clears the previously selected sale/return detail when the screen mounts, so no stale selection persists.

### /transactions/purchases
- Thin transaction-list screen wrapping the shared invoices widget for the purchases category.
- The widget is given a tab identifier of 2 and the label "Purchases" with an always-on count display.
- Uses the same page container scaffold as the sibling transaction screens.
- Sets the page title to "View Invoices ".
- Clears the previously selected sale/return detail on mount.

### /transactions/sale-returns
- Thin transaction-list screen wrapping the shared invoices widget for the sale-returns category.
- The widget is given a tab identifier of 3 and the label "Sale Returns" with an always-on count display.
- Uses the shared page container scaffold and sets the page title to "View Invoices ".
- Clears the previously selected sale/return detail on mount.

### /transactions/purchase-returns
- Thin transaction-list screen wrapping the shared invoices widget for the purchase-returns category.
- The widget is given a tab identifier of 4 and the label "Purchase Returns" with an always-on count display.
- Uses the shared page container scaffold and sets the page title to "View Invoices ".
- Clears the previously selected sale/return detail on mount.

### /reminders/view-reminders
- "PATIENT FOLLOW-UPS" screen for tracking customers who need a reminder or revisit prompt.
- Two-level layout
- Reminder rows show customer/patient identity, follow-up type, due or follow-up date, medicine and brand/generic nam
- Filters by follow-up type, date range (including a minimum follow-up date), status, search text and sort order, wit
- Bulk selection via checkboxes with select-all, plus a dropdown action menu per row (edit, delete, mark as helpful/n
- Patient panel shows contact number, address, age, gender, prescription type, last-bought and next-refill quantities
- Analytics strip for the patient
- A sales-history panel lists the patient's prior invoices and amounts.
- A follow-up composer adds remarks or posts an update against the follow-up.
- Composition tracking links a reminder to a dispensed medicine composition so the context is visible.
- A dropped-off flag separates customers who stopped buying from active ones.

### /purchase/add-purchase
- Manual purchase bill form
- Product line grid with pack, box, quantity, free quantity, MRP, rate, purchase rate, sale rate, batch and expiry co
- Medicine/barcode search with a type-ahead picker and keyboard-driven selection ("Type or Press Space")
- Batch selection drawer listing batch number, pack, expiry, MRP and prior sale history for each batch of a medicine
- HSN code and GST rate lookup per medicine, plus a toggle for bills that carry GST versus bills outside GST
- Per-line discount and markup editing, an overall bill discount, and a "More Settings" panel
- Margin and markup reference bases selectable per distributor
- Custom charges (for example freight or delivery) as separate charge lines with user-defined charge types
- Payment block
- Challan-based flow
- Bill image upload with automatic invoice number/date detection, and a duplicate-bill warning when the same bill num
- Import entry points for CSV bill import and B2B Connect import, with attach-CSV/attach-PDF on the bill; expiry buck

### /purchase/banner/b2connectbanner
- Full-width promotional banner rendered above page content with a purple gradient background
- A small pill-shaped chip on the left, defaulting to "Good News", followed by a short message
- A bold call-to-action on the right with a chevron/redirect icon, defaulting to "See Video"
- Fully self-contained inline styling; no design-system or component library usage
- Props allow a custom chip text, banner message, call-to-action text, icon source and click handler

### /purchase/import-csv
- CSV purchase-import screen that reuses the purchase draft context (distributor, district, invoice number, invoice d
- Parses imported rows into draft product lines, then matches each row against the medicine catalogue
- Shows suggested product mappings, including fuzzy-match suggestions with a match score
- Lets the user pick a different existing medicine, or create a new medicine when no match is acceptable
- Verifies every mapping before the import is committed, with a warning that all mappings must be correct
- Shows in-stock quantity for each mapped product so the user can sanity-check the quantities
- Displays a per-step progress state for importing and for cancelling an in-flight import
- Warns that progress is lost if the user navigates back mid-import

### /purchase/return-expired-products
- "Purchase Expiry Return" screen for sending expired or slow-moving stock back to the supplier
- Distributor picker with a type-ahead search over name or GSTIN, plus district-name filtering
- Category tabs covering expired items, near-expiry items, slow-moving products and expired products that still have 
- Expiry-age filter expressed in days, with quick date presets (today, yesterday, last 7/30 days, this month)
- Product rows show batch number, pack, stock quantity, MRP, expiry date and invoice date
- Optional fields that can be filled in for the return, marked as not mandatory
- A "Proceed to Load" step that loads matching stock for the chosen distributor and filters
- Cash appears as a settlement hint for the return
- Rows can be edited, deleted and the date fields accept typed date input

### /purchase/return-purchase
- Two return modes in one screen
- Distributor picker with name/GSTIN search, district filtering and a warning when the distributor has no GST number
- Return type must be selected before the form is usable, with "Fill in the details below to load" guidance
- Header fields
- Auto-load of items for return, plus separate loaders for expired or near-expiry stock and for slow-moving stock
- Manual item addition by medicine search or barcode scan, with a per-row adjustment panel for discount, scheme and f
- Product grid columns cover product, batch number, pack, expiry, stock, purchase rate, effective purchase rate, MRP,
- Debit-note handling with an explicit "Claim GST in Debit Note" choice, and a GSTIN/drug-licence field that can be a
- Payment accounts for refunds, with refundable amount and amount-refunded shown
- Stock return transfer can be synced to the backend and its transfer detail viewed and downloaded as an invoice
- Date presets and expiry-from loader let the user bound the return by age

### /purchase/view-purchases
- Ledger screen with top-level tabs for purchases, returns, payments and distributors
- Date-wise purchase transaction list for the selected day, plus a per-distributor transaction view
- Distributor master list with contact, GST number, drug licence, credit period and balance due
- Distributor summary figures
- Action menu per distributor to edit, delete or merge distributor records, with a merge confirmation step
- "Party Verified from GSTIN Records" marker next to distributors whose details came from GST records
- Statement download for a distributor, including a separate statement download for the current distributor
- Shortcuts to start a new purchase, a purchase return or a payment against a distributor
- A premium badge indicator for business users
- View state is remembered per tab (purchase view, return view, distributor view)

### /orderbook/dashboard
- Orderbook home with summary cards
- Sections for local distributors, products from the powerhouses, products by stock category, and a pending-orders li
- Popular-brands panel showing the most ordered medicine companies
- Recent purchase-order list with order number, distributor, amount, SKUs, status, age, created/created-by/updated co
- Shortbook settings dialog with min stock, max stock, reorder point in days, period for demand calculation and seaso
- Same-period-demand-from-previous-year toggle used for shortage calculation
- Settings are saved back to the server and can be reloaded for verification
- Search field for the dashboard plus a tutorial link
- Stock-category filter list and distributor locality filter

### /orderbook/distributors
- List of all distributors from the user's locality, with a name/GSTIN search box
- District-name filter for narrowing the list
- "Add New Distributor" action that opens a request-mapping flow
- Two mapping options are presented side by side
- A customer code input with a "Map to" target distributor for the bill-based route
- Mapping request can be sent immediately or the distributor can be invited to become a new LocalWell customer
- Route navigates into a per-distributor product list once a distributor is chosen
- Keyboard navigation hints (Enter, Space, arrow keys, F2, ESC) are surfaced in the UI

### /orderbook/distributors/[distributor_id]
- Product list of a single distributor's catalogue, opened from the distributor list
- Each product row shows the medicine with its pack information and current stock
- Products can be added to the order cart directly from the list
- An "add to cart" bulk action places the visible products into the cart
- A "View Cart" shortcut jumps to the cart with the items just added
- Banner invites a distributor that is not yet on LocalWell to join so they receive step-by-step order updates
- Router param is the distributor identifier; the screen is a thin list view

### /orderbook/order-analysis
- "Order Analysis" screen listing all ordered items with their fulfilment status
- Filter set covering company, category, location, stock type and a free-text product search
- Date-range presets (today, yesterday, last 7/30 days, this month) alongside a calendar picker
- Table columns
- A row-level action adds the item to the cart
- Bulk add-to-cart for selected items
- Export of the analysis to XLS
- Table is keyboard navigable with arrow keys and space for selection
- Company, category and location lists are loaded from shared stock filters

### /orderbook/product-list
- Route registration only
- Ships a minimal style module with the shared Poppins font stack and a placeholder class
- Contains no screen logic, no data fetching and no user-facing components
- Effectively a placeholder left behind by the bundler for this route

### /orderbook/products-already-to-order
- Conflict review screen for products that are already covered by an in-flight order
- Two grouped lists
- Rows show distributor, order number, order amount, SKU count, status, age, created, created-by and updated columns
- A resolution section explains the conflicts detected in the current order
- The user confirms and finishes placing the order, dropping the conflicting quantities
- Checkout is validated against the cart before the order is finalized
- Order status identifier is carried through the screen
- The screen also links onward to the cart

### /orderbook/purchase-orders
- Purchase-order list, shown distributor-wise, with order number, distributor, amount, SKU count, status, age, create
- Search across order number or supplier
- Status filter fed by a master list of customer-order statuses
- Date-range filter with a calendar picker and presets (today, yesterday, last 7/30 days, this month)
- Export of purchase-order items to Excel
- Quick links to order analysis and to the order cart
- Keyboard-navigable table with row selection

### /orderbook/purchase-orders/view-po-detail
- Purchase-order detail screen with the order status and the distributor it was placed with
- Order timeline showing the order-placed-with entity, and document versions such as Original and Recommended
- Print, PDF export and Excel export options for the purchase order
- Send the order document by email or WhatsApp, and a generic "send document" action
- A "mark as delivered" action that advances the order status
- Edit purchase order and Cancel Order actions, each with its own confirmation describing the effect
- Option to return the ordered products to the cart instead of deleting the order
- Distributor name and mobile number are shown on the screen
- Order can be synced back to the backend after an edit

### /orderbook/shortbook
- "My ShortBook" list of stock products currently in shortage, with pack information and demand for the same period l
- Value expressed as a number of days, with a refresh countdown and a "refreshing" state
- Order quantity per row that the user can adjust before ordering
- Settings dialog with min stock, max stock, reorder point in days, period for demand calculation and seasonality in 
- Same-period-demand-from-previous-year toggle used when computing shortage
- Bulk "Add to Cart" that places the shortage quantities into the cart
- A "Go To Cart" shortcut to review the resulting order
- Stock identifier and order quantity are tracked per row

### /orderbook/view-cart
- Cart screen with two tabs
- Product table with product/company, composition/generic name/salt, nature, count, amount, order quantity, priority,
- Filter drawer with filters by company, category, location and distributor, plus a product search and distributor se
- Options to show only compositions with more than one SKU and to remove products whose stock exceeds the maximum sto
- Order priority can follow an ABC-XYZ analysis
- Per-product distributor assignment
- Magic-Select Distributor bulk action that assigns the same distributor to many products
- Warnings when the selected distributor differs from the last-ordered or preferred distributor, and when the distrib
- Stock settings can be updated from the cart screen

### /orderbook/view-cart/[order_id]
- Detail view of a single saved order/cart, reached by order id from the router
- Product action menu with remove-product and reset-order-quantity operations
- Warning that the order quantity in the cart may be out of sync, with the reason to review
- Flagging of products whose stock is above the maximum stock
- Order priority can follow an ABC-XYZ analysis
- A stock filter option for the product list
- Options to proceed to checkout or return to the cart
- Checkout is validated against the cart before the order is placed

### /stocks/adjust-stocks
- Three-step Excel-driven flow for adjusting quantities on stock that already exists
- Header title "Adjust Existing Stock" with a helper line "Adjust Stock CSV".
- Download affordance "Click to Download" pulls a stock spreadsheet template; "Browse to Upload" accepts a local spre
- Only `.xlsx` workbooks are accepted; any other type is rejected with "File must be of type Excel".
- Review grid shows product name, company, batch, expiry and MRP alongside the previous on-hand figures (old units pe
- The same grid lets you type replacement figures
- Each row has an inline action cell with edit, save and delete icons; switching a row to edit mode enables only the 
- Rows can be removed before the update is committed.
- Saving is done in groups of fifty rows so a large workbook does not block, with an "Updating N of M" progress indic
- On completion a "Stock Updated Successfully" notice appears and the screen navigates to the stock list.

### /stocks/bulk-update-settings
- Bulk editor for product master settings, presented as a three-stage stepper
- "Download Template" supplies a spreadsheet skeleton; "Upload Template" accepts a filled file.
- Uploaded file is read in the browser and validated before parsing; a non-spreadsheet file yields "Please upload a v
- Oversized files are refused with "File size exceeds the 10 MB limit. Please upload a smaller file.".
- Column-matching table lists each spreadsheet column with its header, the first and last data row, the number of row
- Only columns that may be changed are offered; identifier and product-name columns are deliberately excluded from ed
- Column selection maps a spreadsheet column onto a database field; the replacement value for a changed cell is looke
- Preview splits the sheet into a "VALIDATED DATA" section and an "INVALID DATA (Action Required Here)" section, show
- Invalid or unmatched rows are highlighted and can be exported with "Download all invalid rows" as a separate workbo
- Validation rules include

### /stocks/stock-transfer/view-transfers
- Branch-to-branch transfer register with top-level tabs for SENT, RECEIVED, PURCHASE RETURN and RETURN RECEIVED, plu
- Header title "View Branch Transfers".
- A collapsible "Search | Filter | Sort" strip exposes a transfer-number search box ("Search By Transfer No"), a mult
- Branch picking opens a modal titled "Select a Branch" with multi-select behaviour and an "Apply (F2)" keyboard acti
- Branch options are sourced from a business-mapping lookup limited to stock-transfer branches; expense categories ar
- "Reset Filter" clears search text, branch selection and sort state in one action.
- Transfer grid columns
- Status is a coloured chip (pending amber, rejected red, accepted green) and carries its own column filter for pendi
- The AMOUNT / GST column shows the transfer value plus whether GST is included or excluded, and is itself filterable
- Return-list grid starts with RETURN INVOICE NO, REQUESTED ON and STATUS and continues into branch name/address, bus
- Opening a transfer clears leftover local selection markers from purchase, sale and stock-return contexts so the wro

### /stocks/update-stock-info
- Per-product configuration screen, titled "Update Stock Info" with the subtitle "View or Modify the Settings for Sto
- A single search field matches on product name, company or rack ("Search by Name or Company or Rack").
- Each product exposes a settings form
- Maximum discount below minimum discount is flagged in the form with "Max Sale Discount < Min Sale Discount".
- Retailer-type businesses additionally see sale scheme quantity, scheme free quantity, a computed sale-scheme percen
- Saving sends a set of per-field update flags (location, min/max discount, sale scheme, loose billing, shortage calc
- Header shortcuts
- Additional header actions cover printing, saving as PDF, a report view and a "Watch Tutorial" video embed.
- The Stock Droplist modal lists products with its own search box.
- Product categories used by the category picker are loaded separately from the settings themselves.

### /stocks/upload-stocks
- Bulk stock loader, titled "Upload Stock CSV" with the description "Bulk Upload Stock Using CSV file".
- Two stages
- Mapping table columns
- Each suggestion shows a composite match percentage, units per pack, company name, a verified badge and a stock-loca
- A line can be remapped by picking an alternative suggestion, searching for the medicine by hand, or using "Create N
- Mapping results page through the file fifty lines at a time, with a "Loading X of Y page(s)" indicator and a header
- "Save & Load Next" persists the confirmed mappings and pulls the next slice of unmatched lines.
- Batch stage columns
- Pack/box and unit columns vary by business type
- The price-to-retailer cell opens a calculator modal that derives the retailer price from MRP, purchase rate, GST ra
- Editing a batch row exposes expiry, pack, box, pack quantity, unit quantity, MRP, rate, sale rate, retailer price a
- Expiry cells show month/year; rows past expiry are flagged red and rows expiring within roughly six months are flag
- Rows can be deleted before committing.
- "Add to Stock" writes the batches one at a time with duplicate batches allowed and the bulk-upload flag set, report
- "Cancel Mapping" discards the mapping work and returns to the previous screen.
- HSN and GST rates come from a separate tax master lookup; previously unmapped lines are reloaded from the unmapped-

### /stocks/view-stocks
- Main stock screen titled "View Stocks", with a left-hand summary panel headed "Stock on hand" showing the SKU count
- The value and count are fetched from a dashboard stock-value summary.
- A collapsible "Search | Filter | Sort" strip provides generic filters, search filters and sort options, all loaded 
- The product list loads twenty rows per page with a "Load More" continuation, driven by page number, free text, acti
- Selecting a product opens a detail panel showing pack size, expiry in month/year (red once expired), stock location
- Costing fields — purchase rate, net rate, sale rate, price to retailer and margin — are only shown when the viewer 
- The detail panel carries OTC/Rx prescription badges, composition text with an "Add Composition" shortcut, front and
- A "Possible Duplicates" panel lists near-duplicate products with verified badges; entries can be multi-selected wit
- Merging requires at least one selection, otherwise "Please select atleast one duplicate" is shown; a successful mer
- Duplicate listing and merging are themselves permission-gated (merge-duplicate permission).
- Header actions on the detail panel
- The per-stock settings modal saves through the shared stock-settings endpoint using a single stock id or a list of 
- An announcement dialog can be shown, pulling its content from an announcement service and reporting the user's chos

### /stock-audit/view-audit/[stock_audit_id]
- Read-and-adjust summary of a finished physical stock audit, header "View Stock Audit" with the audit type named ben
- Header actions are "Go Back" and "Delete Audit (DEL)".
- Deleting opens a confirmation dialog captioned "Delete Record" whose destructive option reads "Yes, Delete Now" alo
- A successful delete reports "Audit Deleted Successfully" and returns to the audit list.
- Summary strip shows audit number, audit date in day/month/year, audited SKU count, short SKU count, short-SKU adjus
- The detail table lets a user still edit the physical count for a batch, split into packs and units, and attach a mi
- A local search filters the batch rows by batch number and by drug code.
- Drug code and PMBJAY behaviour only appear for PMBJAY-enabled businesses.
- The audit itself is loaded with its summary block and its batch rows from one call.

### /stock-audit/view-batches/[stock_audit_id]
- Second audit step, headed "New Stock Audit" with the caption "Step 2
- Header actions
- An auto-save indicator shows "Saving in progress..." or "Saved Successfully" as counts are recorded.
- Barcode-scan mode uses a hidden ten-character barcode field; a scanned code increments the matching batch's physica
- Scan outcomes are reported as "Product Successfully Scanned", "Product with given barcode was not found" or "Invali
- Alternative entry modes are a stock search over product, location and batch number, an expiry date range, and filte
- Each row carries software-side figures (pack size, batch number, expiry, MRP, stock packs, stock units) next to the
- A mismatch-reason picker is available per row, sourced from the audit metadata service, and opens in a modal from t
- Equality between software and physical quantity is judged by converting packs to units using the row's pack size be
- Progress is saved continuously by sending the audit id with the accumulated batch list.
- Finishing is only possible once every physical count has been synced; it reports "Audit Finished Successfully" and 
- Discarding deletes the audit and returns to the audit list.
- Rows can be deleted individually; a delete confirmation dialog is used for destructive header actions.
- The audit type, chosen expiry range, saved batches and selected items are remembered locally across steps, and the 

### /stock-audit/view-products
- First audit step, headed "New Stock Audit" with the caption "Step 1
- Filter controls cover company, product form, stock location, product category, initials and an in-stock toggle, plu
- Filter values are expressed as master ids — company id, form id, category id — or as plain strings for location and
- Filter choices are applied through a modal that hands focus to the next relevant input after each choice.
- The product grid shows category, company, form, initials, location, expiry in month/year, MRP and rate, pack, produ
- Product rows are selectable; the chosen set is stored locally as stock ids and survives navigation.
- The "Go to Step 2 (F2)" button is only enabled when at least one product is selected and no filter is currently app
- Clearing the selection or applying a filter refreshes the candidate product list.

### /stock-audit
- Audit hub, titled "Stock Audits" with the header "Physical Stock Audit" and the caption "Verify Physical Stock agai
- "New Audit (F2)" opens a "Select an Audit Type" chooser listing the available audit types, each with its own illust
- Three audit types are offered, illustrated as check-mismatch, remove-expiry and bulk-upload-previous-stock.
- Choosing the expiry-based type first opens a "Select Expiry Date Range" dialog; the chosen range is stored and sent
- Creating an audit returns an audit id and routes to the batch-counting step for that audit.
- The audit list columns
- Progress shows audited versus to-be-audited SKU counts, and switches to adjusted versus audited counts once the aud
- The adjusted value is coloured by sign — negative red, positive green — and the adjusting user is named.
- Filter strip offers search by audit number, a date range with Today, Yesterday, Last 7 Days, Last 30 Days, This Mon
- The list query sends the date range, free text, active audit filters and sort filter.
- A "How Audit Works?" link opens a tutorial video.
- The date-range modal's default window spans roughly one week back to today.

### /stocks/stock-picklist
- Two-panel picking workspace
- Availability colour coding in the left panel with three legend states — ADEQUATE (green), PARTIAL (orange) and BATC
- Picked-row columns
- Barcode picking
- Live scanner relay
- Batch resolution on scan
- Quantity arithmetic per medicine
- Picklist print preview is rendered server-side for the chosen device
- Print options
- Laser/A4 output uses the browser print dialog; thermal output is sent through the JS Print Manager client, with a d
- Keyboard control
- Picklist lifecycle
- Sale creation from a picklist
- Persistent picklist state is kept in the shared store so a half-finished picklist survives navigation and page relo

### /stocks/print-barcode-labels
- Screen for producing barcode and QR labels for items held in stock, with a searchable, filterable product list wher
- Filters by category, company, product form, initials (alphabet), stock location and free text, plus a stock directi
- Product-list columns
- Per-batch rows add BATCH NO and EXPIRY with a checkbox that includes the batch in the print run.
- Label-count editor per batch
- Inline barcode handling
- Label content toggles stored as business settings
- A4 sheet layout options
- Thermal layout options
- Preview modal with a barcode / QR code toggle, zoom in and out, and a settings panel offering "Save as default" and
- Two label styles are drawn
- Printing
- Settings are persisted per business and stored separately for the barcode screen versus other stock screens.
- Shortcuts

### /stocks/print-barcode-labels/stock-scan-qr
- Small modal used by the barcode-label screen to capture a barcode from a handheld scanner or from typed input.
- The input is focused when the modal opens and re-focused every two seconds so scanner keystrokes always land in the
- The modal header reads "Scan Barcode" and offers a Dismiss action that closes it.
- The body shows an animated scanning illustration alongside the input, whose placeholder reads "Scan or type barcode
- Capture completes on its own once 13 characters have been entered, and the value is handed back to the parent scree
- Escape closes the modal.

### /dashboard/view-dashboard
- Business-scoped analytics home with a date-range picker offering Today, Yesterday, Last 7 Days, Last 30 Days, This 
- Net Sales card
- Stock Value card
- Net Payment Collection card
- Customers card
- Profit card and Net Purchase card, each a net-value / daily-average chart with prior-period delta.
- Fast Moving / Slow Moving stock card
- Due Payments card
- Refill Reminders card (retailer business type only) listing active follow-ups with a link into the reminders screen
- Per-card empty states such as "No Cash In Hand Added!", "No Due Payments Found", "No Followups Found!", "No Product
- Multi-business header action "switch business" (or "+ add business" when only one business exists) routing to the b

### /customer-orders
- Three-tab list (ORDERS, BOUNCED, CUSTOMERS) with live counters for orders, bounced orders and customers to map, plu
- Orders table showing customer name, phone, patient name (retailer business type), order number and date, age, statu
- Filter panel driven by server-provided order filters and sort filters; applied criteria appear as removable tags al
- Date-range filter with preset shortcuts, shared across the tabs.
- Debounced free-text search by customer name or order number, plus a separate customer-name / mobile / drug-licence 
- "Add New Order (F2)" modal for creating a fresh customer order.
- "Short Items from Customer Orders" modal listing short or out-of-stock items with a bulk "ADD SHORT ITEMS TO CART I
- Mapping flow for unmapped customers
- Mapping-request inbox (business type 2) with Accept Request / Reject Request and a mandatory rejection reason.
- Distributor invite
- "Create a Zennx Account" modal summarising the customer detail, outstanding-as-on-date and stock detail that will b
- "Promote MedCart" button (retailer business type only) plus a "Promote your Online Store" modal showing the MedCart
- Premium/partner indicator state and a saved per-business settings record restored from client state on load.

### /customer-orders/business-kyc
- "Your Business KYC" page collecting the data required to enable digital payments for the business.
- Business-entity selector modal listing entity types from the master list, driven by keyboard navigation.
- Entity-dependent identifier fields
- Legal name of the business and the owner's name, both upper-cased and length-capped.
- GSTIN field validated server-side, back-filling the registered business address and the composition-dealer flag; a 
- Drug licence Form 20 and Form 21 numbers with a separate image upload for each.
- Image uploads for the pharmacy storefront (explicitly not the business logo) and for the GST certificate, with prev
- A required self-declaration toggle asserting the facts are true.
- Save action that persists the profile, confirms with a toast and redirects to the partner-integrations page.

### /customer-orders/order-detail
- "Verify & Update Order Detail" header carrying the order number, a coloured status chip and a back arrow.
- Left panel of order attributes
- Payment detail block showing the payment account and the transaction UTR.
- Product table with rate, MRP and amount, a bulk "Product Actions" control, and a per-line expander for substitutes 
- Delivery action picker offering Mark as Delivered, Delivery Refused by Customer and Pickup, each with its own confi
- Order action picker offering edit order, decline order and — for bounced orders — process the order; declined or re
- Delivery confirmation modal that sends a 6-digit code to the customer's mobile and requires the entered code before
- Bounced-order handling offering either deletion of the bounced order or conversion into a new customer order, with 
- Sale bill creation
- Per-product actions to add to cart, remove only, or remove products from the order.
- Status timeline listing the current order status and the order-updates stages such as uploading the order bill.

### /customer-orders/promote-medcart
- MedCart promotion page headed "Promote Your Online Store" with a date-range filter covering the performance numbers
- Performance tiles for App Installs from your invite link, App Orders placed on your app and Revenue from all your o
- "Your Store Link" card listing the Mobile App Link and the Web Store Link, both copyable.
- Two generated QR codes encoding a referral-tagged Play Store redirect for the store slug, plus a printable "QR Code
- "Steps to Promote" three-step card
- "Reasons to Promote" marketing block explaining why to push the MedCart app.
- "What is Medcart? (F4)" link out to the partner integrations page, plus a Go Back button.
