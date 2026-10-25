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

