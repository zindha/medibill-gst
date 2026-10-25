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

