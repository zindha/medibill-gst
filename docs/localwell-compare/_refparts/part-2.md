# Reference part 2

### /purchase/add-purchase  ·  chunk: static__chunks__pages__purchase__add-purchase-79a38d8585f0a26e.js
Features:
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

Interactions:
- Save uses the Alt+S shortcut and there is an Alt+E+A shortcut to edit all rows at once
- Confirm dialogs guard delete, back-navigation and stock-transfer approve/reject
- A warning panel lists data issues to resolve (with ignore-all), and a "This Bill is Duplicate" prompt blocks saving
- A tutorial walkthrough and a "Watch Tutorial" link are available in the screen chrome
- Export of the finished purchase to PDF and CSV formats

API: `create_purchase_custom_charge`, `distributor_get_purchase_detail_from_csv`, `distributors_get_challans_for_distributor`, `distributors_get_distributor_csv_method`, `distributors_get_distributor_details`, `medicine_get_hsn_gst_rates`, `medicine_search_medicines_for_purchase`, `orderbook_import_purchase`, `purchase_add_purchase`, `purchase_delete_purchase`, `purchase_edit_purchase`, `purchase_get_purchase_bill_info`, `purchase_get_purchase_details`, `purchase_get_sale_custom_charge`, `purchase_invoice_detect`, `purchases_get_products_for_purchase_challans`, `purchases_get_purchase_column_settings`, `purchases_get_unpaid_purchase_returns`, `purchases_get_unpaid_purchase_returns_summary`, `purchases_sync_purchase_column_settings`, `stock_transfer_update_stock_transfer`, `stocks_get_stock_batches_purchase`
Entities: distributor, invoice number, invoice date, payment due date, purchase type, challan, medicine, batch number, batch expiry, pack, box, qty, free qty, MRP, PTR, purchase rate, sale rate, HSN, GST rate, tax, discount, markup, margin, custom charge, payment mode, cheque details, credit period, available credit, stock transfer, column settings, unpaid purchase return
Notes:
- Largest chunk in this set; the screen is a multi-mode form (manual entry, challan merge, CSV import, B2B Connect import) sharing one draft
- Draft identifiers are tracked separately for the bill view, edit flow and transfer flow
- Margin/markup reference basis is stored per distributor and per item

### /purchase/banner/b2connectbanner  ·  chunk: static__chunks__pages__purchase__banner__b2connectbanner-c6129bb3006363f0.js
Features:
- Full-width promotional banner rendered above page content with a purple gradient background
- A small pill-shaped chip on the left, defaulting to "Good News", followed by a short message
- A bold call-to-action on the right with a chevron/redirect icon, defaulting to "See Video"
- Fully self-contained inline styling; no design-system or component library usage
- Props allow a custom chip text, banner message, call-to-action text, icon source and click handler

Interactions:
- Clicking the call-to-action fires the supplied handler; without one the pointer is styled as non-interactive
- Icon source is configurable, so callers can point at their own asset instead of the bundled redirect arrow

API: `—`
Entities: chip text, banner message, call-to-action text, call-to-action icon, on-click handler
Notes:
- Route exists only to register the component; it makes no backend calls and renders a presentational strip only

### /purchase/import-csv  ·  chunk: static__chunks__pages__purchase__import-csv-0b6c2f17aa8b8f93.js
Features:
- CSV purchase-import screen that reuses the purchase draft context (distributor, district, invoice number, invoice date, GST flag, challan flag)
- Parses imported rows into draft product lines, then matches each row against the medicine catalogue
- Shows suggested product mappings, including fuzzy-match suggestions with a match score
- Lets the user pick a different existing medicine, or create a new medicine when no match is acceptable
- Verifies every mapping before the import is committed, with a warning that all mappings must be correct
- Shows in-stock quantity for each mapped product so the user can sanity-check the quantities
- Displays a per-step progress state for importing and for cancelling an in-flight import
- Warns that progress is lost if the user navigates back mid-import

Interactions:
- Search fields type-ahead for selecting products and companies
- A verify/apply step gates the import; a dedicated progress indicator shows the current stage
- Cancelling an import is offered as an explicit action while processing

API: `medicine_search_medicines`, `medicines_show_fuzzy_mappings`, `stocks_get_stock_details_for_purchase`
Entities: CSV row, imported product line, medicine mapping, fuzzy match score, pack, primary pack, company, stock detail, in-stock quantity, import type
Notes:
- Mapping is the core of the screen; the fuzzy-match endpoint supplies candidate medicines
- Stock detail is fetched per mapped product to display availability

### /purchase/return-expired-products  ·  chunk: static__chunks__pages__purchase__return-expired-products-6c4870602348c05e.js
Features:
- "Purchase Expiry Return" screen for sending expired or slow-moving stock back to the supplier
- Distributor picker with a type-ahead search over name or GSTIN, plus district-name filtering
- Category tabs covering expired items, near-expiry items, slow-moving products and expired products that still have purchase history
- Expiry-age filter expressed in days, with quick date presets (today, yesterday, last 7/30 days, this month)
- Product rows show batch number, pack, stock quantity, MRP, expiry date and invoice date
- Optional fields that can be filled in for the return, marked as not mandatory
- A "Proceed to Load" step that loads matching stock for the chosen distributor and filters
- Cash appears as a settlement hint for the return
- Rows can be edited, deleted and the date fields accept typed date input

Interactions:
- Distributor selection opens a searchable list filtered by the entered text
- Applying the filter refreshes the product list for that distributor
- Proceed to load runs the stock lookup and populates the grid

API: `distributors_get_master_distributors`, `stocks_get_expired_products`
Entities: distributor, GSTIN, district, expiry date, product age in days, batch number, pack, stock, MRP, invoice date, purchase history, cash settlement
Notes:
- Thin screen: it reuses the shared return machinery but only for expiry-driven stock
- Expiry-age window and distributor are the two inputs that drive the query

### /purchase/return-purchase  ·  chunk: static__chunks__pages__purchase__return-purchase-1901213e2740068c.js
Features:
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

Interactions:
- Keyboard-first flow: F2 applies, Proceed and Save uses Alt+S, arrow keys and space select list items
- Row-level delete and edit, with confirmations for deleting a product and for leaving the screen
- "Show Invoice" opens the linked purchase invoice for a returned item
- A tutorial link and an instructional help panel are available

API: `distributors_get_distributor_details`, `distributors_get_master_distributors`, `get_payment_accounts`, `get_stock_return_transfer_details`, `medicine_search_medicines_for_purchase_return`, `purchase_add_purchase_return`, `purchases_delete_purchase_return`, `purchases_edit_purchase_return`, `purchases_get_purchase_return_details`, `stock_return_transfer_export_invoice`, `stocks_get_stock_batches_purchase_return`, `sync_stock_return_transfer`
Entities: return type, distributor, GSTIN, drug licence, invoice number, return date, goods returned on, product age, batch, pack, expiry, stock, purchase rate, effective purchase rate, MRP, net rate, tax, discount, scheme, free quantity, amount, taxable amount, GST, balance, refundable amount, amount refunded, round off, debit note, payment account, stock return transfer
Notes:
- One of the two largest chunks; the return form is shared between purchase return and stock transfer variants
- Return quantity is entered in packs, and scheme quantities are tracked per purchase transaction

### /purchase/view-purchases  ·  chunk: static__chunks__pages__purchase__view-purchases-6bf38b68dcfa1a29.js
Features:
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

Interactions:
- Tabs switch between purchases, returns, payments and distributors
- Selecting a distributor opens its details and transaction list
- Option menus gate destructive actions behind explicit confirmation text

API: `distributor_get_distributor_transactions`, `distributors_get_distributor_details`, `distributors_merge_distributors`, `purchase_get_purchase_transactions_by_date`
Entities: purchase transaction, return transaction, payment, distributor, contact, GST number, drug licence, credit period, total purchase, total returns, purchase due, return due, opening balance, transaction date, statement
Notes:
- Destructive distributor operations (delete, merge) are implemented through the same option-menu pattern
- Merge is treated as a distinct, separately confirmed flow from edit

### /orderbook/dashboard  ·  chunk: static__chunks__pages__orderbook__dashboard-0e6373141d74b7dc.js
Features:
- Orderbook home with summary cards: items in cart, items that are in order, items finalized for order, and stock items in shortage
- Sections for local distributors, products from the powerhouses, products by stock category, and a pending-orders list
- Popular-brands panel showing the most ordered medicine companies
- Recent purchase-order list with order number, distributor, amount, SKUs, status, age, created/created-by/updated columns
- Shortbook settings dialog with min stock, max stock, reorder point in days, period for demand calculation and seasonality in demand calculation
- Same-period-demand-from-previous-year toggle used for shortage calculation
- Settings are saved back to the server and can be reloaded for verification
- Search field for the dashboard plus a tutorial link
- Stock-category filter list and distributor locality filter

Interactions:
- Shortbook settings open with the F2 shortcut and can be applied from the same dialog
- Summary cards link onward to cart, shortbook, order analysis and purchase orders
- Settings dialog validates and confirms the updated values before saving

API: `get_distributors_for_orderbook`, `orderbook_get_popular_medicine_companies`, `orderbook_get_purchase_orders`, `orderbook_get_settings`, `orderbook_get_stock_categories`, `orderbook_get_summary`, `orderbook_sync_settings`
Entities: summary card, item in cart, item in order, finalized item, shortage item, shortbook setting, min stock, max stock, reorder point, demand calculation period, demand seasonality, previous-year demand, stock category, distributor, popular brand, purchase order, order status, order amount, SKU count, business user name
Notes:
- Dashboard aggregates four separate backend summaries rather than one payload
- Shortbook settings are shared with the shortbook screen

### /orderbook/distributors  ·  chunk: static__chunks__pages__orderbook__distributors-17f7d3add71aefcd.js
Features:
- List of all distributors from the user's locality, with a name/GSTIN search box
- District-name filter for narrowing the list
- "Add New Distributor" action that opens a request-mapping flow
- Two mapping options are presented side by side: entering a customer code from the distributor's bill, or sending a mapping request to the distributor
- A customer code input with a "Map to" target distributor for the bill-based route
- Mapping request can be sent immediately or the distributor can be invited to become a new LocalWell customer
- Route navigates into a per-distributor product list once a distributor is chosen
- Keyboard navigation hints (Enter, Space, arrow keys, F2, ESC) are surfaced in the UI

Interactions:
- Selecting a distributor opens its product list
- Choosing a mapping option reveals the matching form (customer code vs request send)
- Mapping request is submitted with Enter and the result is confirmed back to the user

API: `get_distributors_for_orderbook`, `orderbook_request_mapping_with_distributor`
Entities: distributor, GSTIN, district, locality, customer code, mapping request, business selected district, search text
Notes:
- The page is the entry point for mapping a distributor via bill customer code or a self-service request
- Search and district selection both narrow the same distributor list

### /orderbook/distributors/[distributor_id]  ·  chunk: static__chunks__pages__orderbook__distributors__[distributor_id]-c8bc85a47aaa915a.js
Features:
- Product list of a single distributor's catalogue, opened from the distributor list
- Each product row shows the medicine with its pack information and current stock
- Products can be added to the order cart directly from the list
- An "add to cart" bulk action places the visible products into the cart
- A "View Cart" shortcut jumps to the cart with the items just added
- Banner invites a distributor that is not yet on LocalWell to join so they receive step-by-step order updates
- Router param is the distributor identifier; the screen is a thin list view

Interactions:
- Selecting "Add to Cart" pushes the listed products into the cart
- The invite call-to-action is shown only when the distributor is not on the platform
- Go Back returns to the distributor list

API: `orderbook_get_distributor_products`, `orderbook_sync_cart`
Entities: distributor id, medicine id, product, pack, stock, cart, add-to-cart action
Notes:
- Smallest functional page in the set; it is basically the distributor catalogue with cart push
- The cart write is shared with the shortbook and order-analysis screens

### /orderbook/order-analysis  ·  chunk: static__chunks__pages__orderbook__order-analysis-d84906d61276511b.js
Features:
- "Order Analysis" screen listing all ordered items with their fulfilment status
- Filter set covering company, category, location, stock type and a free-text product search
- Date-range presets (today, yesterday, last 7/30 days, this month) alongside a calendar picker
- Table columns: product name / company / category, ordered, arrived, shortage, pending, min|max stock, order count, location, image and last order
- A row-level action adds the item to the cart
- Bulk add-to-cart for selected items
- Export of the analysis to XLS
- Table is keyboard navigable with arrow keys and space for selection
- Company, category and location lists are loaded from shared stock filters

Interactions:
- Filters are applied with F2 and the filter drawer shows the selected option
- Rows are selected with space and can be bulk added to the cart
- Export produces an XLS file, with a progress state while it runs

API: `orderbook_export_order_analysis`, `orderbook_get_order_analysis`, `orderbook_sync_cart`, `stock_audit_get_filters`
Entities: medicine company, category, stock location, stock type, product form, ordered, arrived, shortage, pending, min stock, max stock, order count, last order, order quantity, cart, export file
Notes:
- Reuses the stock-audit filter set rather than defining its own
- Analysis rows are the same entities the shortbook screen orders against

### /orderbook/product-list  ·  chunk: static__chunks__pages__orderbook__product-list-dbc6e278ad126545.js
Features:
- Route registration only: the chunk declares the /orderbook/product-list page path
- Ships a minimal style module with the shared Poppins font stack and a placeholder class
- Contains no screen logic, no data fetching and no user-facing components
- Effectively a placeholder left behind by the bundler for this route

Interactions:
- None: the chunk has no interactive code paths

API: `—`
Entities: route path, font family, placeholder class
Notes:
- Treat as a dead/placeholder route, not a real screen
- Worth confirming with the parent whether the reference app exposes a real product list elsewhere

### /orderbook/products-already-to-order  ·  chunk: static__chunks__pages__orderbook__products-already-to-order-e5085b2f72c42083.js
Features:
- Conflict review screen for products that are already covered by an in-flight order
- Two grouped lists: products already in order and products ordering now
- Rows show distributor, order number, order amount, SKU count, status, age, created, created-by and updated columns
- A resolution section explains the conflicts detected in the current order
- The user confirms and finishes placing the order, dropping the conflicting quantities
- Checkout is validated against the cart before the order is finalized
- Order status identifier is carried through the screen
- The screen also links onward to the cart

Interactions:
- "Finish Placing Order" (F2) commits the order after conflicts are resolved
- Validation runs before checkout and blocks the order if the cart is not acceptable

API: `orderbook_checkout_cart`, `orderbook_validate_checkout`
Entities: product already in order, product ordering now, order conflict, distributor, order number, order amount, SKU count, order status, age, created by, updated, checkout, validation
Notes:
- This is the last-mile guard before a purchase order is submitted
- Data comes from the same cart/validation pair used by the cart detail screen

### /orderbook/purchase-orders  ·  chunk: static__chunks__pages__orderbook__purchase-orders-7980a120069147b1.js
Features:
- Purchase-order list, shown distributor-wise, with order number, distributor, amount, SKU count, status, age, created, created-by and updated columns
- Search across order number or supplier
- Status filter fed by a master list of customer-order statuses
- Date-range filter with a calendar picker and presets (today, yesterday, last 7/30 days, this month)
- Export of purchase-order items to Excel
- Quick links to order analysis and to the order cart
- Keyboard-navigable table with row selection

Interactions:
- Search and status filter narrow the list; filters are applied with F2
- Selecting a row opens the purchase-order detail screen
- Excel export runs with a visible progress state

API: `customer_orders_get_master_order_statuses`, `orderbook_get_purchase_order_items_excel`, `orderbook_get_purchase_orders`
Entities: purchase order, order number, distributor, order amount, SKU count, order status, age, created at, created by, updated at, date range, export file
Notes:
- Status filter values come from a shared master-status endpoint
- The Excel export is report-hosted rather than on the node API

### /orderbook/purchase-orders/view-po-detail  ·  chunk: static__chunks__pages__orderbook__purchase-orders__view-po-detail-596d8bc13d8ccea9.js
Features:
- Purchase-order detail screen with the order status and the distributor it was placed with
- Order timeline showing the order-placed-with entity, and document versions such as Original and Recommended
- Print, PDF export and Excel export options for the purchase order
- Send the order document by email or WhatsApp, and a generic "send document" action
- A "mark as delivered" action that advances the order status
- Edit purchase order and Cancel Order actions, each with its own confirmation describing the effect
- Option to return the ordered products to the cart instead of deleting the order
- Distributor name and mobile number are shown on the screen
- Order can be synced back to the backend after an edit

Interactions:
- Options are chosen from a menu with F2/F4/F6 shortcuts and confirmed before destructive effects
- Edit is only offered while the order status still allows changes
- Document version selection changes which copy is printed, exported or sent

API: `orderbook_export_purchase_order`, `orderbook_get_document`, `orderbook_get_purchase_order_detail`, `orderbook_get_purchase_order_timeline`, `orderbook_import_purchase`, `orderbook_send_document`, `orderbook_sync_purchase_order`
Entities: purchase order, order status, timeline event, order-placed-with, document version, distributor, mobile number, delivery status, cart return, stock transfer
Notes:
- Returning products to the cart is deliberately distinct from deleting the order
- The order detail can be pushed back into the purchase flow via the import operation

### /orderbook/shortbook  ·  chunk: static__chunks__pages__orderbook__shortbook-d645f68a543feb6d.js
Features:
- "My ShortBook" list of stock products currently in shortage, with pack information and demand for the same period last year
- Value expressed as a number of days, with a refresh countdown and a "refreshing" state
- Order quantity per row that the user can adjust before ordering
- Settings dialog with min stock, max stock, reorder point in days, period for demand calculation and seasonality in demand calculation
- Same-period-demand-from-previous-year toggle used when computing shortage
- Bulk "Add to Cart" that places the shortage quantities into the cart
- A "Go To Cart" shortcut to review the resulting order
- Stock identifier and order quantity are tracked per row

Interactions:
- Settings open with F4, are applied with F2 and are saved back to the server
- Add to Cart (F2) pushes the shortbook quantities into the cart
- Dismiss & Go Back leaves the screen and the cart

API: `orderbook_get_items_to_order`, `orderbook_get_settings`, `orderbook_sync_cart`, `orderbook_sync_settings`
Entities: shortbook row, stock id, order quantity, min stock, max stock, reorder point, demand calculation period, demand seasonality, previous-year demand, shortage days, cart
Notes:
- Settings are the same ones exposed from the orderbook dashboard
- The shortbook is the default entry point for generating a purchase order

### /orderbook/view-cart  ·  chunk: static__chunks__pages__orderbook__view-cart-b7398bc06b32a91e.js
Features:
- Cart screen with two tabs: the list of cart products and the list of draft orders to review and checkout
- Product table with product/company, composition/generic name/salt, nature, count, amount, order quantity, priority, last transaction, last ordered, average sale, margin, stock status, location and image
- Filter drawer with filters by company, category, location and distributor, plus a product search and distributor search
- Options to show only compositions with more than one SKU and to remove products whose stock exceeds the maximum stock
- Order priority can follow an ABC-XYZ analysis
- Per-product distributor assignment: choose a distributor, see the distributor's name/address, GSTIN, margin, balance and available credit, and set a preferred distributor
- Magic-Select Distributor bulk action that assigns the same distributor to many products
- Warnings when the selected distributor differs from the last-ordered or preferred distributor, and when the distributor has no GSTIN
- Stock settings can be updated from the cart screen

Interactions:
- Product rows open an action menu to remove a product, reset the order quantity to the required quantity, or assign a distributor
- A distributor is picked from a searchable list and the assignment is confirmed
- Filters are applied with F2, and rows are selected with space

API: `distributors_get_master_distributors`, `orderbook_get_cart`, `orderbook_get_cart_filters`, `orderbook_get_distributors_for_medicine`, `orderbook_magic_assign_distributors`, `orderbook_sync_cart`, `settings_update_stock_settings`, `stock_audit_get_filters`
Entities: cart product, draft order, order quantity, required quantity, product, company, composition, generic name, salt, nature, category, location, distributor, distributor GSTIN, distributor margin, balance, available credit, preferred distributor, last ordered distributor, average sale, margin, stock status, ABC-XYZ priority, count, amount
Notes:
- The busiest orderbook screen; it merges the cart list, the draft-order review and distributor assignment
- A row can be in conflict with the last-ordered or preferred distributor, which the user must acknowledge

### /orderbook/view-cart/[order_id]  ·  chunk: static__chunks__pages__orderbook__view-cart__[order_id]-d120b877f33e834c.js
Features:
- Detail view of a single saved order/cart, reached by order id from the router
- Product action menu with remove-product and reset-order-quantity operations
- Warning that the order quantity in the cart may be out of sync, with the reason to review
- Flagging of products whose stock is above the maximum stock
- Order priority can follow an ABC-XYZ analysis
- A stock filter option for the product list
- Options to proceed to checkout or return to the cart
- Checkout is validated against the cart before the order is placed

Interactions:
- Product Actions opens with F2 and offers remove or reset order quantity
- Proceed to Checkout (F4) submits the order after validation
- Go Back returns to the cart list

API: `orderbook_checkout_cart`, `orderbook_get_cart_details`, `orderbook_sync_cart`, `orderbook_validate_checkout`
Entities: order id, cart detail, medicine id, product, order quantity, required quantity, stock status, max stock, ABC-XYZ priority, checkout, validation
Notes:
- Complements /orderbook/view-cart: the list screen holds the filters, this screen holds the per-product actions
- The order id in the route identifies which saved order is being reviewed
