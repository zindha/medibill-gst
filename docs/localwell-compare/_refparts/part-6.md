# Reference part 6

### /control-center/business-profile  ·  chunk: static__chunks__pages__control-center__business-profile-db9664ded8703327.js
Features:
- Tabbed business profile editor split into basic identity, drug licence, entity/taxation, address-and-map and store timings sections.
- Basic identity captures business name, GSTIN, PAN, CIN or LLPIN, owner name, owner PAN and the trade name that comes back from GST records.
- Drug licence panel holds Form-20 and Form-21 numbers with their expiry dates and one uploaded image each.
- Entity section lists entity type, taxation type (GST registered vs non-registered), FSSAI licence number with expiry and the AYUSHMAN HFR id.
- Address panel holds three address lines, district and pincode, with a map pin, place autocomplete and a "Get My Location" button.
- Store timings are configured per weekday with two shifts each (open/close times) plus an Open 24x7 flag.
- Store-front, Form-20 and Form-21 image uploads are restricted to a single file each.
Interactions:
- "Get My Location" uses browser geolocation, reverse-fills address fields and moves the map pin; permission denial and unsupported-browser cases each get their own message.
- Choosing a place from search suggestions populates the address and the map marker.
- Switching the selected business entity reloads entity-scoped fields; the GSTIN is validated before saving and rejected as "INVALID GSTIN" when it does not pass.
- Timing rows cannot be edited while 24x7 is on ("Please disable 24x7 access to update timings.").
- Save persists the profile and confirms with "Business Profile Updated Successfully".
API: `business_get_profile, business_update_business_profile, business_get_master_business_entities, business_validate_gstin`
Entities: business_name, business_gstin, business_pan, business_cin, business_llpin, business_owner, business_owners_name, business_owner_pan, business_trade_name_on_gst_records, business_entity, entity_type, business_address_line_1, business_address_line_2, business_address_line_3, business_full_address, business_latitude, business_longitude, drug_license, dl_form_20, dl_form_21, business_fssai, business_hfr_id, gst_tax, bank_details, timings[].shift1, timings[].shift2, close_time, day_of_the_week
Notes:
- No literal `/api/...` URLs are present in the chunk; every call goes through a shared request helper that takes a service operation name, so URL paths live in a runtime chunk outside this folder.
- Google Maps is loaded at runtime with a key plus the places library for address lookup.

### /control-center/bulk-edit-bills  ·  chunk: static__chunks__pages__control-center__bulk-edit-bills-15d7f1b853c06f77.js
Features:
- Bulk operation console over sale bills with separate flows for loading bills to edit, deleting bills, recovering deleted bills, importing bills and adding a special discount.
- Filter panel combining sale date range, bill sequence range, bill value range, bill profit range, bill status, customer type and customer/doctor/operator selection.
- Loaded bills show invoice number, customer, doctor, GST-registered flag and an edited/unedited marker, with select-all and row selection.
- Bill-level special discount entered as a percentage and applied to the selected bills.
- Bill import accepts a CSV upload and stores it base64-encoded for the server.
- Progress polling shows the running bulk job, and completion/failure outcomes are surfaced; a bulk action report can be downloaded.
- Operator, doctor and customer pickers are searchable dropdowns that also remember the logged-in operator.
Interactions:
- "Load Sale Bills" runs the filters; invalid ranges are blocked with messages such as "From Bill Sequence No cannot be greater than To Bill Sequence No" and "Min Bill Value cannot be greater than Max Bill Value".
- Date filters must both be set before running ("Please select From Sale Date and To Sale Date").
- Deleting bills is an irreversible action that requires re-entering the password to confirm, then reports "Deleting Bills..." and the deletion progress.
- Bulk progress is polled so the operator can track the delete job; on success the result and report download are shown.
- The report download endpoint is used to fetch the bulk action report; failures surface as "Unable to download report".
API: `get_bills_for_bulk_edit, bulk_edit_bills, get_bulk_edit_progress, download_bulk_action_reports, import_bills, business_get_user_details`
Entities: bill_sequence_range, bill_value_range, bill_profit_percentage_range, bill_status, customer_type, customer_registration_type, customer_mobile_number, doctor_id, doctor_name, selected_operators, add_special_discount, bill_discount, job_id, csv_base64, business_user_name, business_user_role, is_bulk_delete, is_bulk_recovery
Notes:
- No literal `/api/...` URLs appear in the chunk; calls use a shared helper with service operation names.
- "Bulk Recovery" reuses the same delete-bill payload with an is_bulk_recovery flag rather than a separate operation.

### /control-center/migration  ·  chunk: static__chunks__pages__control-center__migration-bd87296c7b82ce52.js
Features:
- Onboarding for moving data from another pharmacy software, offering a standard migration request and an Excel upload mode.
- Software catalogue lists supported old software with sample file format links so the user can download a template.
- Data scope selection covers customers, sales/sale history, stock and stock batches, with a backup collection time and an expiry cut-off date.
- Branch mapping lets the user copy item mapping from one branch and optionally copy MRP as the sale rate.
- Excel-based migration validates the uploaded file, then uploads it via a presigned URL to object storage and tracks upload state per file.
- Unmapped stock can be loaded and mapped after the upload, with per-item mapping rows and pending-to-map indicators.
- Migration request list shows status, and multiple downloadable reports exist for success, failure, excluded rows and mapping results.
Interactions:
- Selecting a software loads its files/templates; a request cannot be created until software and at least one date type are chosen.
- Dropping or browsing a file validates it first; wrong file type or duplicate files are rejected with explicit messages.
- A failed upload offers removal of the uploaded file before retrying.
- Reports download per migration request, with a distinct failure message when the server returns nothing downloadable.
- Branch selection reloads mapping data and unmapped stock; errors are reported per stage ("Failed to load branches", "Failed to load unmapped stocks").
API: `get_migration_softwares, get_software_files, get_migration_requests, get_migration_request_details, generate_new_migration_request, generate_excel_migration_request, validate_migration_file, get_presigned_url, remove_uploaded_file, get_mapping_business_for_migration, load_unmapped_stocks, customers_search_customers, download_csv_template, migration_download_reports`
Entities: business_id, business_name, business_type, business_gstin, business_drug_license_no, business_address, copy_item_from_business_name, copy_mrp_as_sale_rate, customer_name, customer_balance, backup_collection_time, expiry_cutoff_date, file_s3_url, csv_base64, file_type, file_size, selected_branches, mapping, migration_mode
Notes:
- No literal `/api/...` URLs appear in the chunk; service operation names are passed to a shared request helper.
- Object storage upload is done client-side against a presigned URL rather than through a normal endpoint.

### /control-center/integrations  ·  chunk: static__chunks__pages__control-center__integrations-783822e85bcc6195.js
Features:
- Catalogue of available partner integrations shown as a table of partner name, description, icon, status and last-updated date.
- Entries are grouped by master partner type with a status label such as "ACTIVE NOW" and a status colour.
- Rows are selectable so the user can enter a partner's onboarding flow.
- Tabbed navigation shell with a default selected tab and per-row selection state.
Interactions:
- The list loads asynchronously with a loading flag and re-fetch action.
- Selecting a partner row opens that partner's detail/onboarding route.
- Status text and colour are derived from the integration state returned by the server.
API: `partners_get_partners_integrations`
Entities: partner_id, partner_name, partner_type, partner_type_id, partner_type_icon, partner_description, partner_image_url, partner_integrations, available_integrations, status_text, status_color, created_on, master_partner_types
Notes:
- The chunk is a thin list view; the actual onboarding steps live in the partner integration pages.
- No literal `/api/...` URLs appear in the chunk.

### /control-center/layout  ·  chunk: static__chunks__pages__control-center__layout-e748f2c7101629df.js
Features:
- Minimal route layout wrapper for the control-center section that simply renders its children inside a layout section.
- Exists to give every control-center page a shared shell and shared chunk dependencies.
Interactions:
- None of its own; it only nests the child page.
API: `none`
Entities: none
Notes:
- This chunk contains only a pass-through layout component plus its Next.js route registration.

### /control-center/picklist-settings  ·  chunk: static__chunks__pages__control-center__picklist-settings-ae2c587e3d9ce526.js
Features:
- Editor for customer order picklist configuration, described as "Order Settings".
- Settings are generic key/value picklist rows where each key binds to a configurable value.
- Values can be changed in a drawer with a dropdown-style selector and a search-on-space shortcut.
- A save action syncs the edited settings back to the server and confirms "Picklist Settings Synced".
- The page uses a template-driven settings list so new picklist keys can appear without page changes.
Interactions:
- Selecting a setting row opens the edit drawer; the row is marked selected.
- Save (F2) submits the whole settings set and reports the sync result.
- Settings load asynchronously with a loading state and can be re-read.
API: `business_get_customer_order_settings, business_sync_customer_order_settings`
Entities: picklist_settings, customer_order_settings, template_customer_order_settings, binding_key, selected_settings, is_required, is_drop_down, is_clearable
Notes:
- The exact picklist keys are server-defined templates; only the generic binding_key/value pair is visible in the chunk.

### /control-center/plans-pricing  ·  chunk: static__chunks__pages__control-center__plans-pricing-d7faf2e8aba4cfb3.js
Features:
- Plan and billing summary showing the current subscription, whether the business is on the free plan or free trial, and an upgrade prompt.
- Credits overview lists SMS credits and usage plus e-invoice credits and e-invoice API credits.
- Billing history lists invoices that can be downloaded as HTML invoices.
- A sales-call request can be placed from the pricing screen, and a renewal path leads into the subscription checkout.
- Free-plan and free-trial states are highlighted with a warning panel and coloured theme.
Interactions:
- "Upgrade to Premium" or "Renew Premium Now" routes into the subscription checkout page.
- "Request Sales Call" posts a request and confirms success with "Succesfully Placed Request".
- Downloading an invoice fetches the invoice details and shows "Downloading Invoice" while in flight.
- The page adapts when reached from the pricing page versus from settings (is_from_pricing_page flag).
API: `subscription_get_subscription_details, subscription_get_business_invoice_details, subscription_request_sales_call, order_subscription`
Entities: subscription_details, billing_history, invoice_id, invoice_html, payment_status, sms_credits, sms_usage, e_invoice_credits, e_invoice_api_credits, add_on_pack, is_under_free_plan, is_under_free_trial, un_subscribed, is_sales_call_requested, retry_invoice_id
Notes:
- Shares its data layer with the /settings/subscriptions page; both display plan status, credits and billing history.
- No literal `/api/...` URLs appear in the chunk.

### /control-center/prefix-sequences  ·  chunk: static__chunks__pages__control-center__prefix-sequences-20b14417f1a80bae.js
Features:
- Editor mapping transaction types to the prefix and running sequence used for numbering.
- Rows list the transaction type, the prefix and the current sequence value.
- The hint "Prefix & Sequence together will form Invoice No" explains how numbering is composed.
- Financial-year flags exist per row to indicate closing or reset state of the year.
- Rows support selecting multiple entries and editing a single prefix/sequence cell inline.
Interactions:
- "Save (F2)" pushes the updated prefix and sequence values for the changed rows.
- A busy state ("Loading Sequences") is shown while the sequence list is fetched.
- Sequence rows can be switched on/off via a per-row selection state.
API: `business_get_prefix_sequence, business_update_prefix_sequence`
Entities: prefixes_sequences, prefix_key, prefix_value, seq_value, is_financial_year_closing, is_financial_year_reset, selected_items, transaction type
Notes:
- Sequence values are edited in-place and saved as a set keyed by prefix key.

### /control-center/refer-earn  ·  chunk: static__chunks__pages__control-center__refer-earn-328664e1f4ea6b9b.js
Features:
- Referral programme screen showing the user's own referral code with a copy action ("Code Copied").
- Summary cards show earnings so far, wallet balance and the number of referred pharmacies.
- A referral transactions list shows each referred pharmacy and whether it has subscribed.
- Wallet cash can be redeemed, and a tutorial video can be played inline.
- Social share links (YouTube, Facebook, Instagram) are offered for the referral code.
Interactions:
- Copying the referral code confirms with "Code Copied".
- "Redeem Wallet Cash" and "Watch Video"/"Watch Tutorial" open a modal with the embedded tutorial player.
- Referral details and referral transactions are fetched separately and shown in a paginated list.
- A language switcher is available on the screen.
API: `business_get_user_profile, get_user_referral_details, get_referral_transactions`
Entities: referral_key, referral_code, referred_business, total_earning, wallet_balance, subscription_status, video_id, referral transactions, business_user_profile
Notes:
- The referral code appears to be a fixed per-business string with the business user profile supplying it.
- No literal `/api/...` URLs appear in the chunk.

### /control-center/sale-settings  ·  chunk: static__chunks__pages__control-center__sale-settings-932b1d2325e261c7.js
Features:
- Editor for sale-time behaviour settings, presented as key/value rows in a drawer.
- Supported settings include "Autofill Scheme wrt Sale Qty", "Doctor must for X Drugs" and a sale scheme format option.
- Each setting can be scoped to a default doctor and marked visible for retailer or distributor business types.
- Mobile section and search are available to locate a setting quickly.
- A save action syncs the settings and confirms "Sale Settings Synced".
Interactions:
- Opening the drawer allows editing a setting value, with type-ahead support ("Type or Press Space Bar").
- Save (F2) submits the edited set and shows the sync confirmation.
- Settings load asynchronously; template-driven rows mean new settings appear from the server template.
API: `business_get_sale_settings, business_sync_sale_settings`
Entities: sale_settings, template_sale_settings, sale_setting, binding_key, settings_item, default_doctor, doctor_name, is_visible_for_retailer, is_visible_for_distributor, sale_state, sale_scheme_format, search_text
Notes:
- Shares the generic settings-drawer pattern with the picklist settings page.

### /integrations  ·  chunk: static__chunks__pages__integrations-05c1980a493c4e8f.js
Features:
- Top-level integrations catalogue listing partner integrations with name, description, icon, status and last updated date.
- Entries are grouped by master partner type and rows are selectable.
- Status labels such as "ACTIVE NOW" are shown with a matching colour indicator.
- Tabbed navigation with a default selected tab and per-tab counts.
Interactions:
- The catalogue loads asynchronously with a loading state.
- Choosing a row opens the partner's integration flow.
API: `partners_get_partners_integrations`
Entities: partner_id, partner_name, partner_type, partner_type_id, partner_type_icon, partner_description, partner_image_url, partner_integrations, available_integrations, status_text, status_color, created_on
Notes:
- Mirrors the /control-center/integrations catalogue; the standalone /integrations route is the customer-facing entry point.

### /integrations/aadhar-kyc  ·  chunk: static__chunks__pages__integrations__aadhar-kyc-4b4f69768c696349.js
Features:
- Aadhaar-based KYC submission step for a partner onboarding.
- Offers an onboarding link so the user can complete Aadhaar verification with the partner.
- A "Submit KYC using Aadhar" action starts the onboarding and "Send for Review (F2)" hands the case to review.
- "Go Back" returns to the previous onboarding step.
Interactions:
- Initiating onboarding requests the onboarding link and shows a submitting state.
- "Send for Review" confirms the step before the partner receives the case.
- Back navigation returns to the previous integration step.
API: `partners_initiate_partner_onboarding`
Entities: onboarding_link, partner_id
Notes:
- The Aadhaar capture itself happens on the partner's onboarding page; this page only starts the flow.

### /integrations/business-detail  ·  chunk: static__chunks__pages__integrations__business-detail-05f17eddbb974adf.js
Features:
- Verification screen for the business profile used by partner integrations, with tabs for basic details, drug licence, store front, taxation, settlement and timings.
- Shows the same identity fields as business profile (name, GSTIN, entity type, address, timings) plus enrolment id/UIN and store-front picture.
- Manages payment/settlement bank accounts for the business, including adding a new bank account and choosing the account used for settlements.
- Requires a store-front picture and an enrolment id/UIN before verification can complete.
- Sends a sample order notification to the mobile app so the user can accept or dismiss a test order.
- Includes a frequently asked questions section and a link to the mobile app / play store.
Interactions:
- "Send test order notification" posts a test order and waits for the user's accept/dismiss response; at most five test notifications can be sent.
- Choosing a bank account is mandatory to continue, and the settlement account can be changed.
- Editing the drug licence number and uploading images happen inline; only one image per slot is allowed.
- "Verify Business Detail" submits the verification, with warnings blocking progression ("Please upload the store front picture to continue", "Please enter ENROLMENT ID / UIN").
- A location picker with geolocation and place search fills the address and map pin.
API: `business_get_profile, business_get_master_business_entities, partners_get_partner_business_bank_details, sync_partner_business_info_tabs, send_test_app_notification`
Entities: business_name, business_gstin, business_pan, business_cin, business_llpin, business_entity, business_owner, business_owner_pan, business_owner_mobile_number, business_address_line_1/2/3, drug_license, dl_form_20_image_url, dl_form_21_image_url, gstin_certificate_image_url, business_image_url (store front), enrollment_id, enrolment_id, payment_accounts, selected_business_payment_account_id, payment_account_type_id, payment_account_display_name, bank_account_no, bank_name, bank_branch_name, business_verified, active_tab_id, faq, timings
Notes:
- The verification flow mirrors business-profile fields but adds settlement-account and test-notification requirements that only partners need.
- A self-declaration option is offered instead of some document uploads.

### /integrations/kyc-docs  ·  chunk: static__chunks__pages__integrations__kyc-docs-7df8e2dcd87f7c06.js
Features:
- KYC document upload step that lists the documents each partner requires, marking each as required or optional.
- Documents are uploaded by drag-and-drop or file browsing with a per-file size display and extension detection.
- Uploaded images are shown with removal controls and a "setup complete" check.
- The step can send the case for review once the required documents are present.
- A "Go Back" control returns to the previous onboarding step.
Interactions:
- Uploading shows a per-file progress state and reports failures ("Error occured in Uploading File").
- Removing an uploaded image updates the required-document checklist.
- "Send for Review (F2)" uploads the documents and then hands the case over; the button reflects a sending state.
API: `partners_get_kyc_docs, partners_upload_kyc_docs, partners_initiate_partner_onboarding`
Entities: kyc_docs, kyc_images, uploaded_image, uploaded_url, image_url, file_name, image_extension, image_size, raw_bytes, max_bytes, is_required, is_optional, setup_complete_check, selected_business_payment_account_id, onboarding_link, partner_id
Notes:
- Sizes are rendered with binary unit suffixes and the raw byte count is also shown.

### /integrations/partner_integrations  ·  chunk: static__chunks__pages__integrations__partner_integrations-683d5036926dd4f2.js
Features:
- Partner integration hub that lists partner integrations with logo, description, status and a getting-started progress checklist.
- Getting-started steps are shown as an ordered list that must all be completed before integration can be finished.
- Warnings raised by the partner are displayed and must be resolved before proceeding.
- Settlement bank account details can be viewed and updated, including account type, number, IFSC, account holder and proof image.
- Partner-specific configuration content is fetched for Medcart-style partners: getting started, how it works and pricing descriptions.
- Integration can be started, which redirects the user to the Cashfree onboarding dashboard, and the integration state is polled to show "Integration Active".
Interactions:
- "Start Integration" initiates partner onboarding and shows a "Starting Partner Integration..." state before redirecting.
- "PROCEED" advances only after every getting-started step is complete and warnings are cleared.
- Updating bank details syncs the settlement account and confirms with "Settings Synced".
- The screen also offers a path to upgrade the plan, since some partners require a paid subscription.
API: `partners_get_partner_info, partners_get_partner_integration_status, partners_get_getting_started_status, partners_initiate_partner_onboarding, sync_settlement_bank_details`
Entities: partner_id, partner_name, partner_type_id, partner_image_url, partner_description, onboarding_link, integration_status, current_status, getting_started_steps, is_completed, error_message, bank_account_no, bank_name, bank_branch_name, bank_branch_ifsc_code, account_holder_name, account_type, bank_account_for_settlement, bank_account_for_pos_settlement, is_current_account, is_current_bank_account, complete_business_profile, complete_business_kyc, is_email_verified, discount_info, flat_discount, discount_percent, additional_discount_info, maintenance_fee, medcart_config_description, medcart_config_getting_started, medcart_config_how_it_works, medcart_config_pricing, upgrade_your_plan, payment_status
Notes:
- The Medcart configuration blocks appear to be fetched as part of the getting-started payload rather than as a separate call.

### /integrations/verify-email  ·  chunk: static__chunks__pages__integrations__verify-email-f4b3203adca34218.js
Features:
- Email verification step for partner onboarding using a one-time code sent to the invoice email on file.
- Shows the OTP input, a resend countdown and a "Validate Code" action.
- "Resend Delivery Code" re-triggers the email OTP and restarts the countdown.
- Advises the user to check spam and trash folders if the code does not arrive.
Interactions:
- Validating checks that a 6-digit OTP is entered and rejects incomplete input with "Enter Valid OTP".
- A successful check shows "OTP Verification Successful"; a fresh send shows "OTP Sent Successfully".
- The resend control is disabled during the countdown and re-enabled afterwards.
API: `partners_trigger_email_otp, partners_verify_email_otp`
Entities: user_otp, invoice_email, partner_id, reset_otp, is_otp_incomplete
Notes:
- The verification target address comes from the business invoice email rather than being typed in.

### /settings/subscriptions  ·  chunk: static__chunks__pages__settings__subscriptions-19860b578778189a.js
Features:
- Plans and billing screen showing current subscription details and the active plan state.
- Billing history lists invoices with dates that can be downloaded.
- Credit balances are shown for SMS and e-invoice usage.
- A sales call can be requested with a confirmation that a call will follow.
- Links forward to the pricing page and the subscription checkout for upgrading.
Interactions:
- "Request a Sales Call (F2)" posts the request and shows "Sales Call Requested" / "You will Receive a Call Shortly".
- Downloading an invoice fetches invoice details and shows a downloading state.
- The screen adapts its chrome when opened from the pricing page.
API: `subscription_get_subscription_details, subscription_get_business_invoice_details, subscription_request_sales_call, order_subscription`
Entities: subscription_details, billing_history, invoice_id, invoice_html, payment_status, sms_credits, sms_usage, e_invoice_credits, e_invoice_api_credits, add_on_pack, is_under_free_plan, is_under_free_trial, is_sales_call_requested, retry_invoice_id, un_subscribed
Notes:
- Functionally the same data as the control-center plans and pricing screen, placed in the settings area.

### /settings/users-devices  ·  chunk: static__chunks__pages__settings__users-devices-68f8073ca5b231ba.js
Features:
- Users and devices screen listing the business users and the devices they are logged in on.
- Device records include device details and the auth token of the session.
- Login allowances are compared across businesses, with separate counters for subscribed and currently logged-in desktop and mobile logins.
- The screen shows whether the business is subscribed and can offer to buy more logins.
- "Add New User (F2)" starts adding a user to the business.
Interactions:
- The screen fetches users and devices on load with a "Fetching Users" state.
- When the login allowance is exhausted, the user is prompted to buy more logins ("No More Logins Available").
API: `authenticate_get_users_devices`
Entities: user_details, device_details, user_key, auth_token, business_user, subscription_desktop_count_across_businesses, subscription_mobile_count_across_businesses, logged_in_desktop_count_across_businesses, logged_in_mobile_count_across_businesses, is_subscribed, is_from_pricing_page, allow_vertical_scroll
Notes:
- The login counters are summed across every business the user belongs to, so the allowance is account-wide.

### /subscriptions/checkout  ·  chunk: static__chunks__pages__subscriptions__checkout-6601b55542530bd3.js
Features:
- Full subscription checkout: plan picker (free, essential and growth tiers with monthly and yearly variants), add-ons, coupons, billing details and payment.
- Add-ons cover extra desktop logins, extra mobile logins, SMS booster packs and e-invoicing API credits, with recommended add-ons highlighted.
- Billing details collect business name, business address, GSTIN, place of supply, contact number, email and customer name, with GSTIN format validation and IGST vs CGST+SGST tax computation.
- Coupon support lists available LocalWell coupons, validates them on apply, discounts the payable amount and reports invalid coupons.
- Payment summary computes gross total, discounts, GST amount, round off, net payable and a wallet credit option ("Use Localwell Credits") capped at a share of the invoice.
- Order drafts are synced so a half-finished checkout can be resumed, with referral coupons removed when applicable.
- Terms and conditions, refund policy and privacy links are part of the payment screen, and Razorpay is the payment gateway.
Interactions:
- Selecting a plan and quantity updates the order summary and then "Proceed to Pay" initiates the transaction.
- "Add to Cart (F2)" stages add-ons; add-ons can be removed again before payment.
- Applying a coupon validates it and updates totals; an invalid code shows "Invalid Coupon".
- Billing fields validate on blur (email, mobile, name, GSTIN) and block submission until valid.
- The transaction moves through "Initiating transaction" and "Completing Transaction" states and ends in "Payment Successful" or a payment.failed state.
- Buying extra logins from the max-logins page re-enters the checkout with a flag so the flow returns to the right place.
API: `subscription_get_localwell_plans, subscription_get_localwell_coupons, subscription_initiate_invoice_transaction, subscription_complete_transaction, subscription_sync_draft_invoice, subscription_get_business_invoice_details, order_base_plan, order_add_ons, order_applied_coupon, order_customer, order_is_referral_coupon_removed, order_subscription, order_valid_gstin, business_validate_gstin, get_existing_draft, check_business_user_access`
Entities: base plan (free_plan, essential_monthly, essential_yearly, growth_monthly, growth_yearly), addon_plans, duration_wise_pricing, order_id, order_details, order_amounts, invoice_id, invoice_amount, invoice_round_off, gross total, discounted_amount, coupon_code, coupon_code_id, coupon_value, coupon_discount_amount, is_coupon_applied, gst_amount, is_igst_applicable, place of supply, customer_billing_address, business_gstin, business_address, business_name, customer_name, customer_email, customer_mobile_number, extra_device_logins, e_invoice_api_credits, sms_credits, wallet amount, draft_invoice, payment, refundpolicy, terms
Notes:
- The checkout bundles base plan, add-ons, coupons, tax and payment into one page with a shared draft order object.
- The plugin gateway is Razorpay; the Cashfree reference in the partner flow is a separate onboarding path.

### /support/account-manager  ·  chunk: static__chunks__pages__support__account-manager-dd18fec6ad021ee0.js
Features:
- Shows the business's assigned account manager with photo, name, role, greeting, languages, intro and personal story.
- Provides direct contact actions: call the manager, WhatsApp them, or copy their contact details.
- Presents the engagement as a three-step flow (step 1/2/3) explaining what happens after a call request.
- Warns about outstanding items that should be reviewed before continuing.
- The manager's level and availability/member card details are displayed.
Interactions:
- "Call Now" triggers the call request operation and shows "You are placing a call" then "You will receive a call shortly".
- "WhatsApp" and "Code Copied" offer alternative contact paths.
- A reset-account action opens the reset modal for the current business user.
API: `get_business_account_manager, call_lw_account_manager`
Entities: member_cards, member_name, member_role, member_identifier, member_email, member_img_url, member_greeting, member_intro, member_story, member_languages, member_availability, manager_level, business_user, business_user_mobile_number, warning_title, warning_subtitle
Notes:
- Account manager assignment is per business, fetched from the backend rather than chosen by the user.

### /support/reset-account  ·  chunk: static__chunks__pages__support__reset-account-abcabc61909f6cbe.js
Features:
- Small modal host for a "reset account" action performed on the currently signed-in business user.
- Prefills the current business user name and email so the reset applies to the right account.
- Closing or cancelling the modal sends the user back to the account manager screen.
Interactions:
- On mount it reads the signed-in business user from the app store and fills the modal with their name and email.
- Dismissing the modal redirects to the account manager page.
API: `none`
Entities: business_user, business_user_name, business_user_email
Notes:
- The actual reset form and its submit logic live in the shared modal component, not in this chunk.

### /support/tickets/[ticket_id]  ·  chunk: static__chunks__pages__support__tickets__[ticket_id]-69d92f63839bf583.js
Features:
- Ticket detail view with a threaded conversation of user messages and support replies.
- Shows ticket header information: subject, ID, category, priority, status, tags, assignee, creation and modification times and expected resolution.
- Replies can be written, and internal notes (support-only) are marked separately from customer-visible comments.
- Images and files can be attached to a reply, with image preview and a full view.
- Messages can be edited or deleted, with deleted messages shown as "This message was deleted."
- Ticket status can be changed, including closing the ticket and re-opening it, and an assignee can be updated.
Interactions:
- "Send Message" posts the reply and syncs the comment list; the input is cleared afterwards.
- "Close Ticket (F2)" and "Re-Open Ticket (F2)" update the status and reflect the new state.
- Deleting a comment requires confirmation, and a deleted internal note is labelled distinctly.
- Uploading an image shows per-image progress and enforces the allowed image count.
- "Apply (F4)" commits status and assignee changes made in the ticket header.
API: `tickets_get_ticket_details, tickets_sync_tickets, tickets_sync_ticket_comment`
Entities: ticket_id, ticket_subject, ticket_description, ticket_status_id, ticket_status_name, ticket_priority, ticket_priority_name, ticket_category_id, ticket_category_name, ticket_tags, assigned_to_member_id, member_name, member_id, created_on, modified_on, expected_resolution_by, is_seen, is_approval_needed, ticket_comments, ticket_comment, ticket_comment_id, ticket_comment_files, ticket_files, file_name, file_url, file_size, internal_note_title, is_internal_comment, is_delete, is_editable, can_upload_image, can_remove_image, maximum_images, user_role, business_user_name
Notes:
- Comments carry a deletion flag and a separate internal-note flag, so the server keeps soft-deleted content.

### /support/tickets/create-new-ticket  ·  chunk: static__chunks__pages__support__tickets__create-new-ticket-e499f5e45aa6870e.js
Features:
- Form to raise a new support ticket with a subject line, category selection and a description.
- Categories are loaded from the server with a description and can be searched.
- Priority is chosen from a fixed set (Low, Medium, High, Critical) and optional tags with colours can be attached.
- Up to three file attachments or screenshots can be added by drag-and-drop or browsing.
- The form is shown as a drawer/section with Go Back and Save actions, and the business context (name, user, mobile) is carried along.
Interactions:
- Submitting validates that a subject is entered and a category is selected, with the matching messages ("Please Enter Ticket Subject", "Please Select Ticket Category").
- Duplicate file uploads are rejected ("Same file was already uploaded."), and a read error is reported separately from an upload error.
- Successful creation confirms "Ticket Successfully Added" and the ticket list is synced.
API: `tickets_get_ticket_meta_data, tickets_sync_tickets`
Entities: ticket_subject, ticket_description, ticket_category_id, ticket_category_name, ticket_category_desc, ticket_priority, priority_label, ticket_tags, tag_color_list, ticket_files, file_name, file_url, file_size, expected_resolution_by, ticket_id, business_name, business_user_name, business_user_mobile_number, member_name, is_optional, is_required
Notes:
- Attachment limit is three and is described in the UI text itself.

### /support/tickets  ·  chunk: static__chunks__pages__support__tickets-7f6ac09975caa851.js
Features:
- Support ticket list with a table of ticket ID, subject, category, priority, status, created and updated dates.
- Tabs split the list by status (All, Open, Closed, Created) with per-tab ticket counts.
- Rows are selectable and sortable, and the list supports paging.
- Ticket categories and statuses come from server metadata, with a status colour per row.
- A "New Ticket (F2)" action opens the create-ticket flow, and the previously selected tab is remembered.
Interactions:
- Switching tab loads that status bucket and updates the counts.
- Selecting a row opens the ticket detail page for that ticket id.
- The list loads asynchronously with a loading flag, and the view can be toggled between list and other layouts.
API: `tickets_get_tickets, tickets_get_tickets_counts, tickets_get_ticket_meta_data`
Entities: ticket_id, ticket_subject, ticket_category_id, ticket_category_name, ticket_priority, ticket_priority_name, ticket_status_id, ticket_status_name, ticket_status_color, created_on, navigation_tabs, no_of_tabs, view_by, items_length, items_per_page
Notes:
- Counts are fetched separately from the rows so tab badges can render independently.

### /support/videos-resources  ·  chunk: static__chunks__pages__support__videos-resources-016f76300a6c9d80.js
Features:
- Video resource library listing tutorial and feature videos with thumbnail, title, description, channel and duration.
- Videos are grouped into categories with counts, and can be filtered by device type.
- A search box filters videos by feature name.
- An embedded player plays the selected video inside the page.
- App version is tracked for reference and a language filter is available.
Interactions:
- Typing in the search field filters the video list as you type.
- Selecting a category narrows the list and updates the visible count.
- Choosing a video opens the in-page player, with the window height adjusted for the player.
- The list shows skeleton placeholders while loading.
API: `dashboard_get_youtube_video`
Entities: yt_videos, yt_video_categories, video_category, video_category_id, video_id, channel_name, title_render, description, thumbnail, device_type_id, language_name_in_english, app_version, page_no, show_count, vids_cnt, time_passed
Notes:
- The underlying content is YouTube-hosted, fetched through the dashboard video service.

### /login  ·  chunk: static__chunks__pages__login-89a131be1beb37a1.js
Features:
- Combined sign-in and sign-up screen accepting a mobile number, then either an OTP or a password.
- OTP can be delivered by SMS or WhatsApp, with resend and a "Change Mobile Number" option.
- New numbers can create an account; existing users can continue with a password instead of an OTP.
- Registers the current device (device name/type, device token, FCM token, installation fingerprint) so sessions can be tracked.
- On success the user is routed to the business switcher or the app home, with a referral code optionally applied and a district/area prompt shown on first use.
- Includes links to the Terms of Service and Privacy Policy.
Interactions:
- Entering a mobile number checks whether the user exists before choosing the OTP or password branch.
- The OTP field validates six digits and rejects invalid or missing codes with "Please enter a valid OTP".
- Resending is available via SMS or WhatsApp with a visible countdown.
- "Login as a different User" returns to the mobile-number step.
- Device and session state are synced to the server after successful sign-in.
API: `authenticate_check_user_presence, authenticate_send_login_otp, authenticate_create_password, authenticate_device_user, session_sync_device, business_get_user_businesses, check_business_user_access`
Entities: mobile_number, mobile_number_otp, password, is_password_null, auth_token, access_token, device_name, device_token, device_type, fcm_token, installation_fingerprint, business_user_id, business_user_name, business_user_mobile_number, member_id, user_hash, referral_code, ref_id, district selection, temp_business_id, login_business_id, support_login_auth_token, app_version
Notes:
- The login screen is the single entry point that decides between OTP login, password login and account creation.

### /login/create-password  ·  chunk: static__chunks__pages__login__create-password-1b52f03adafbb464.js
Features:
- Set-password screen for a newly created user, asking for a password and a confirmation.
- The screen can switch the account (Change Business User) and shows the username being set.
- Success path reports "Password Created Successfully" and continues into the app.
- Password and confirmation must match, and the password must satisfy the length/format rules.
Interactions:
- Validation compares the two fields and rejects a mismatch with "Password and Confirm Password are not Matching".
- Saving the password requires a valid password before it is accepted.
- The screen can go back to the login flow via the back icon.
API: `authenticate_create_password, business_get_user_businesses, check_business_user_access`
Entities: password, confirm_password, business_user_name, temp_business_id, login_business_id, pre_auth_mobile, auth_token, is_loading, is_disabled
Notes:
- Business access is checked after the password is set, so a user without access is rejected at this step.

### /login/login  ·  chunk: static__chunks__pages__login__login-a2f0c63e25e6b13e.js
Features:
- Legacy login route that exists only to redirect visitors to the current login screen.
Interactions:
- On mount it pushes the user to /login and renders nothing.
API: `none`
Entities: none
Notes:
- The chunk contains only the Next.js route registration and a redirect effect.

### /login/login-exhausted  ·  chunk: static__chunks__pages__login__login-exhausted-c88a77814ab48051.js
Features:
- Blocking screen shown when the business has used all of its allotted device logins.
- Displays the business name, owner, employee name, user role and last login details.
- Lists active devices and desktop-only devices for the account.
- Offers two ways out: buy more logins (upgrade) or contact the shop owner.
- Shows subscribed versus logged-in counters across all businesses the user belongs to.
Interactions:
- The screen fetches active devices on load with a "Fetching Active Devices" state.
- "Buy More Logins (F2)" starts the subscription checkout with the max-login flag so the user returns here afterwards.
- "Contact Shop Owner" and "Subscribe Now (F2)" are the alternative escalation paths.
- The user is blocked from other actions while the allowance is exhausted (prevent_user_actions).
API: `authenticate_get_users_devices, check_business_user_access`
Entities: business_name, business_user, business_user_name, business_user_role_id, user_details, device_details, is_max_logins_reached, is_subscribed, logged_in_desktop_count_across_businesses, subscription_desktop_count_across_businesses, subscription_mobile_count_across_businesses, show_only_desktop_devices, is_from_max_login, adding_subscription_from_max_login_page, prevent_user_actions, sync_settings
Notes:
- Reached both from a login attempt and from the users-and-devices screen when logins run out.

### /login/register  ·  chunk: static__chunks__pages__login__register-6d505d913ea9fc28.js
Features:
- Business registration form for a new pharmacy or a new branch of an existing business.
- Fields: business name, owner name, business type (Retailer or Distributor), email, mobile number and area pincode.
- Pincode lookup resolves the district name and validates the pincode against the geography service.
- GST-registered status can be declared with a yes/no choice, and an optional referral code can be applied.
- On success it confirms "Registration Successful" and continues to password creation.
Interactions:
- Each field validates on blur with a specific message (business name, owner name, email format, valid pincode).
- Selecting the business type shows the matching inputs, and the district name is filled from the chosen pincode.
- The referral accordion is optional and only sent when a code is entered.
- Registration submits the business and the primary business user together.
API: `business_add_business, geography_get_pincodes`
Entities: business_name, business_owners_name, business_type, business_user_name, business_user_email, business_user_mobile_number, business_pin_code, business_pin_code_id, district_name, is_gst_registered, referral_code, business_referral_code, mobile_number, pre_auth_mobile, installation_fingerprint, business_users
Notes:
- Registration runs after the mobile number is authenticated, so the phone number is already known.

### /login/subscription-expired  ·  chunk: static__chunks__pages__login__subscription-expired-b3f80523ff987888.js
Features:
- Blocking screen shown when the business's premium subscription has lapsed.
- Shows the business and user context with the warning that the current plan has expired.
- Lists active devices for the account and compares subscribed versus logged-in logins.
- Offers a direct renewal action back into the subscription flow.
Interactions:
- Active devices are fetched on load with a "Fetching Active Devices" state.
- "Renew Premium Now (F2)" routes into the subscription checkout.
- The screen is shown instead of the normal app after authentication.
API: `authenticate_get_users_devices, check_business_user_access`
Entities: business_user, business_user_role_id, business_id, is_subscribed, is_max_logins_reached, logged_in_desktop_count_across_businesses, subscription_desktop_count_across_businesses, subscription_mobile_count_across_businesses, show_only_desktop_devices, is_from_pricing_page, adding_subscription_from_max_login_page, temp_business_id
Notes:
- Shares the same shell and data as the login-exhausted screen; only the warning copy and the renewal action differ.

### /login/support/[...params]  ·  chunk: static__chunks__pages__login__support__[...params]-3acd439668cbe80c.js
Features:
- Support-assisted sign-in entry point that receives business user id, user hash, member id and a support auth token.
- Shows a LocalWell logo and a "Signing you in..." message while the handoff completes.
Interactions:
- On mount it takes the four parameters from the route and replaces the URL with the login route carrying them as query values.
- If any parameter is missing the redirect is skipped and the page stays on the signing-in state.
API: `none`
Entities: business_user_id, user_hash, member_id, support_login_auth_token
Notes:
- The actual token exchange happens on the login page after the redirect.

### /login/switch-business  ·  chunk: static__chunks__pages__login__switch-business-309cbc76f2f797d9.js
Features:
- Business picker listing every business the signed-in user can access, with address, business type and subscription state.
- Each entry shows its subscription status: Subscribed, Under Free Trial, Renewal Pending or Yet to Subscribe.
- Retail and Distribution businesses are rendered differently and can carry a logged-in flag.
- Offers "Add a New Firm or Branch" and an option to log out of the current device.
- A footer confirms the switch in progress or reports a successful logout.
Interactions:
- Selecting a business switches the active session and confirms with "Switching Business".
- "Logout" ends the device session and reports "Logged out successfully".
- The list loads with a "Fetching Businesses" state and falls back to the register route to add a business.
- Retail and distributor detail panels are shown for the highlighted business.
API: `business_get_user_businesses, business_logout_device, check_business_user_access, view_customer_selected_details, view_distributor_selected_details`
Entities: business_id, business_name, business_address, business_type_id, business_user_mobile_number, subscription_status, logged_in, access_token, auth_token, temp_business_id, login_business_id, switch_business_id, district selection
Notes:
- The route also leads to the login-exhausted screen when the chosen business has no free logins left.

### /  ·  chunk: static__chunks__pages__index-d244792227feccc9.js
Features:
- Root route that exists only to send visitors into the login flow.
- Renders an empty placeholder while the redirect happens.
Interactions:
- On mount it pushes the router to /login.
API: `none`
Entities: none
Notes:
- The chunk contains only the route registration and a redirect effect.

### /_error  ·  chunk: static__chunks__pages___error-c045b1966ba31c39.js
Features:
- Next.js custom error route registration.
- Contains no application code of its own; the error UI comes from the framework runtime.
Interactions:
- None in this chunk.
API: `none`
Entities: none
Notes:
- The chunk is only a route registration entry, so no feature detail is recoverable from it.

## Notes on API extraction

- None of these 35 page chunks contains a literal `/api/...` URL string; the only `/api` hit in the whole folder is the Google Maps script URL. Every backend call is made through a shared request helper that receives a service operation name (for example `business_get_profile`, `tickets_sync_tickets`), and those operation names are resolved to URL paths in a runtime chunk that is not part of this folder.
- The API lines above therefore list the service operation identifiers each page actually invokes, which is the closest observable equivalent of an endpoint path.
