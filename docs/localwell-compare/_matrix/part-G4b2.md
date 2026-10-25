## Slice G4b2 — parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/support/account-manager` | — | N/A | A per-business human account manager assigned by the vendor backend presumes a hosted vendor relationship; a local-first install has no vendor to assign one. | — |
| `/support/reset-account` | — | Missing | We have no password/account reset screen at all; the reference prefills the signed-in business user's name and email so a reset lands on the right account. | M |
| `/support/tickets/[ticket_id]` | — | N/A | Ticket threads, internal notes, attachments and assignee editing are support-desk features of a hosted desk, not of an offline product. | — |
| `/support/tickets/create-new-ticket` | — | N/A | Raising tickets with server categories, priorities and file uploads belongs to the hosted support desk we do not replicate. | — |
| `/support/tickets` | — | N/A | A support ticket list with status tabs, per-tab counts and paging is part of that hosted support desk. | — |
| `/support/videos-resources` | — | N/A | The tutorial library is YouTube-hosted content fetched through the vendor video service; a local-first app should ship local help, not a video portal. | — |
| `/login` | `/auth` | Partial | We have identifier+password sign-in/register with device registration, but no SMS/WhatsApp OTP branch, no FCM-token/installation-fingerprint sync, and no Terms/Privacy links. | M |
| `/login/create-password` | `/auth` (register mode) | Partial | Our register sets the password inline; there is no separate set-password step with a confirm-password match check and a "Password Created Successfully" confirmation. | S |
| `/login/login` | — | N/A | Legacy redirect alias for a login URL we never shipped; our router exposes no legacy login path that would need forwarding. | — |
| `/login/login-exhausted` | — | N/A | Blocking on an exhausted device allowance presumes a seat/subscription licence model; a single local install has no billable logins to exhaust. | — |
| `/login/register` | `/auth` + `/onboarding` | Partial | We register only the user; business name, owner name, business type, GST-registered flag and pincode→district validation are absent from registration and only appear later as free-form onboarding settings. | M |
| `/login/subscription-expired` | — | N/A | A premium-lapse blocking screen presumes a subscription service; our local build has no plan that can expire. | — |
| `/login/support/[...params]` | — | N/A | Support-assisted sign-in carrying a vendor-issued support token has no local counterpart; our sign-in is identifier+password only. | — |
| `/login/switch-business` | — | N/A | Picking and switching among many cloud businesses assumes one user with many tenants; our app is one store per local installation. | — |
| `/upload-migration-data` | `/dashboard/migration` | Partial | Our wizard starts from our own entity sets; there is no "previous software" catalogue, no searchable source picker and no single-database-file upload path. | M |
| `/` | `/` | Covered | — | — |
| `/_error` | `*` (NotFound) | Partial | We ship a 404 catch-all page but no dedicated error route/boundary for unhandled route or render failures. | S |

Size is the build estimate for rows we intend to act on (Partial/Missing); `—` means no work is planned (Covered/N/A).

## Slice G4b2 — our-side coverage notes

**Our routes that serve this slice**

- `/auth` carries the reference's `/login`, `/login/create-password` and the user half of `/login/register`: one identifier+password form that toggles between login and register, registers the browser as a device on success, and redirects into the app.
- `/onboarding` carries the business half of `/login/register` — the store-setup wizard that writes store basics straight into settings keys.
- `/dashboard/migration` carries `/upload-migration-data`, and goes further than it (see below).
- `/` carries the reference's `/` entry point into the auth flow, as a landing page rather than a bare redirect.
- `*` (NotFound) is the closest thing we have to the reference's `/_error` route registration.
- `/dashboard/devices` is where our own version of the reference's device/session views lives (no reference counterpart in this slice).

**Our routes with no reference counterpart in this slice**

- `/dashboard/orders`, `/order` (public customer self-order portal), `/dashboard/billing`, `/dashboard/invoices`, `/dashboard/inventory`, `/dashboard/purchases`, `/dashboard/reports`, `/dashboard/accounting` and the other pharmacy-workflow screens.
- `/dashboard/devices` (device registry, sessions, activity, sync), `/dashboard/settings`, `/dashboard/integrations`, `/dashboard/communications`, `/dashboard/campaigns`, `/dashboard/scheduled-reports`, `/dashboard/compliance`.

**Where our side already exceeds the reference**

- `/dashboard/migration` exceeds `/upload-migration-data`: the reference page stops at choosing a previous software and showing an upload area (its real migration work lives in a separate control-center chunk), while ours runs the whole session lifecycle — create, preview diff, commit, rollback — and lists recent migration sessions with status.
- `/dashboard/devices` exceeds every device view in the reference: we expose registered devices with admin revoke/restore, an active-session feed with a per-session kill, an activity audit feed and offline sync journal status, where the reference only shows a read-only device list on its blocking screens.
- `/` exceeds the reference's bare redirect: our landing is a public entry page with a "Get started" CTA to `/auth` and a "Go to dashboard" shortcut when already authenticated, while the reference root only pushes the router to `/login`.
- `/auth` accepts an email *or* phone identifier, where the reference's sign-in entry is a mobile number only.

## Slice G4b2 — backlog

**G4b2-01 — Confirm-password check and a separate set-password step on register**
- Reference pages: `/login/create-password`, `/login`
- Our register asks for a password inline; the reference asks for it again after account creation with a confirmation field, a mismatch rejection and an explicit success message.
- Acceptance: the register flow shows a confirm-password field; saving is rejected while the two fields differ; a successful set reports the password-created confirmation before entering the app; existing identifier+password login is unaffected.
- Size: S · Dependency: existing page extension · Priority: P2

**G4b2-02 — Password reset for the signed-in user and for local staff**
- Reference pages: `/support/reset-account`
- Our app has no password-reset path at all, and with no support desk to call a locked-out user cannot be recovered locally.
- Acceptance: a reset entry point exists for the signed-in user, prefilled with that account's name and email; an admin can reset a staff account's password; a reset password takes effect on the next login and invalidates the previous session; no role can reset another user's password without admin rights.
- Size: M · Dependency: backend data model · Priority: P1

**G4b2-03 — Business profile with pincode→district validation during registration/onboarding**
- Reference pages: `/login/register`
- The reference captures business name, owner name, business type, email, mobile, pincode with resolved district, GST-registered flag and optional referral code during registration; ours captures only a user, then writes free-form store basics into settings.
- Acceptance: registration or onboarding captures business name, owner name, business type, email, mobile, pincode and the GST-registered flag; a valid pincode resolves and displays a district name and an invalid one is rejected with a field-level message; every captured value persists into the store profile and is shown in Settings; the store still completes onboarding without a pincode.
- Size: M · Dependency: backend data model · Priority: P2

**G4b2-04 — Terms of Service and Privacy Policy links on the auth screen**
- Reference pages: `/login`
- The reference shows both policy links beside the sign-in form; our `/auth` documents no such links.
- Acceptance: both links render on `/auth` in both login and register modes and on the landing page's registration path; each link opens a locally shipped document without a network call.
- Size: S · Dependency: existing page extension · Priority: P3

**G4b2-05 — "Previous software" source picker for the migration wizard**
- Reference pages: `/upload-migration-data`
- The reference migration entry begins by choosing the source software from a searchable catalogue, then uploading that software's single database file; our wizard begins directly from our own entity sets.
- Acceptance: `/dashboard/migration` opens with a searchable source-software selector whose choice is stored on the session; the selection drives the upload step; an unsupported or skipped source still allows the existing customer/supplier/medicine/opening-stock path; the preview → commit → rollback flow is unchanged.
- Size: M · Dependency: backend data model · Priority: P2

**G4b2-06 — Device name/type and installation fingerprint recorded at sign-in**
- Reference pages: `/login`
- The reference syncs device name, device type, device token, FCM token and an installation fingerprint after sign-in; our register records a device but these named attributes are not documented on our side.
- Acceptance: the device registration issued at login records a device label and type and a stable installation fingerprint; the record is visible on `/dashboard/devices`; repeated logins from the same installation reuse the fingerprint instead of creating a second device row.
- Size: S · Dependency: backend data model · Priority: P2

**G4b2-07 — Top-level error boundary alongside the 404 catch-all**
- Reference pages: `/_error`
- The reference registers a framework error route; our router documents only a `*` NotFound page.
- Acceptance: an unhandled route or render error shows a dedicated error screen with a retry action and a link back to `/dashboard`; unknown paths still render the existing 404 page.
- Size: S · Dependency: none · Priority: P3

## Slice G4b2 — deviations to document

- Phone-OTP login: the reference's SMS/WhatsApp OTP branch needs an OTP gateway and a messaging provider, so our identifier+password sign-in stays as it is.
- Subscription screens: the premium-lapse and exhausted-seat blocking screens (and their renewal/upgrade actions) presumes a cloud subscription model our local build does not have.
- Support desk: ticket lists, ticket threads with internal notes and attachments, and the per-business account manager are vendor-service features a local-first app should not replicate.
- Video libraries: the YouTube-backed tutorial/feature library is remote content a local build should not carry.
- Multi-business switch: the business picker with per-business subscription state assumes one user across many cloud tenants, while our app is a single store per installation.
- Referral programme: the optional referral code at register and at sign-in drives a vendor referral programme, so our registration takes no referral code.
