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

