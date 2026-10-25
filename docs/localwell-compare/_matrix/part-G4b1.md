## Slice G4b1 — parity matrix

| Reference route | Our route | Status | Gap | Size |
|---|---|---|---|---|
| `/integrations` | `/dashboard/integrations` | Partial | We list connectable providers with connect/disconnect and encrypted config; no partner-type grouping, per-partner status/last-updated columns, or row→onboarding hand-off (the hand-off itself is N/A) | S |
| `/integrations/aadhar-kyc` | — | N/A | Aadhaar-based partner KYC needs an external partner onboarding portal that a local-first app should not operate | — |
| `/integrations/business-detail` | `/dashboard/settings` (store profile card) | Partial | We keep name/GSTIN/drug licence/phone/email/address/timings/storefront picture; missing entity type, owner name/PAN/mobile, PAN/CIN/LLPIN, licence image slots, bank accounts, enrolment id/UIN (we store an ayushman HFR id — mapping ambiguous) and any verification submit | M |
| `/integrations/kyc-docs` | — | N/A | Partner KYC document upload plus "send for review" hand-off is marketplace onboarding behaviour a local pharmacy should not replicate | — |
| `/integrations/partner_integrations` | — | N/A | Partner onboarding hub (getting-started checklist, partner warnings, Cashfree redirect, plan upgrade) is marketplace behaviour with no local equivalent | — |
| `/integrations/verify-email` | — | N/A | The invoice-email OTP is a partner-onboarding step; our staff auth is identifier + password with no onboarding verification flow | — |
| `/settings/subscriptions` | — | N/A | Plan state, billing history, SMS/e-invoice credit balances and sales-call requests all belong to a cloud subscription model we do not have | — |
| `/settings/users-devices` | `/dashboard/devices` | Partial | We list registered devices, sessions and activity with revoke/restore; no staff roster, no add-user flow, no device→user ownership, and no plan-based login counters (counters N/A) | M |
| `/subscriptions/checkout` | — | N/A | Plan picker, add-ons, coupons, GST-on-checkout and a Razorpay transaction are e-commerce/subscription flows a local-first app should not replicate | — |

## Slice G4b1 — our-side coverage notes

**Our routes that serve these reference pages**

- `/dashboard/integrations` → serves `/integrations`; it is a provider registry (list, config detail, connect/disconnect with secrets) rather than a browsable partner catalogue.
- `/dashboard/settings` → serves `/integrations/business-detail` through its store profile card (name, GSTIN, drug licence, phone, email, address/location, timings, storefront picture, ayushman HFR id).
- `/dashboard/devices` → serves `/settings/users-devices`; tabs are Devices / Sessions / Activity / Sync / Role, with admin-only device revoke/restore.
- No route of ours maps to `/settings/subscriptions` or `/subscriptions/checkout`; the shared "settings" name is the only overlap.

**Our routes with no reference counterpart in this slice**

- `/dashboard/compliance` (e-invoice + e-way bill generation, preflight status, submissions) — GST compliance work this reference slice never touches.
- `/dashboard/communications` (delivery history, retry, compose, templates, per-customer channel preferences) — no messaging page in the slice.
- `/dashboard/campaigns` (campaigns and offers, segment targeting) — no counterpart here.
- `/dashboard/migration` (bulk import wizard with preview/commit/rollback) — no counterpart here.
- `/dashboard/scheduled-reports` (scheduled jobs, run history, download) — no counterpart here.
- `/dashboard/bulk-bills`, `/dashboard/accounting`, `/onboarding` (store setup wizard), `/order` (public customer order portal) — no counterpart in this slice.
- We deliberately have no partner-onboarding, plan-billing or checkout route; those capabilities do not exist locally.

**Where our route already exceeds the reference**

- `/dashboard/devices` vs `/settings/users-devices`: we add a session kill action, an activity audit feed, offline-sync journal status, admin-only device revoke/restore, and role/capability chips; the reference page only lists users, the devices they sit on, and plan-based login counters.
- `/dashboard/settings` vs `/integrations/business-detail`: we add invoice format/pattern with thermal 80/58 and detailed-vs-compact columns, price-override role policy, expiry policy, a backup scheduler plus cloud backup (Google Drive / Cloudflare R2 / S3) with an encryption key, an online-orders toggle, and refill-automation mode with app base URL.
- `/dashboard/integrations` vs `/integrations`: ours is a connect/disconnect registry with config + secrets inputs and encrypted config storage; the reference page is a read-only catalogue that hands off into partner onboarding.
- `/dashboard/compliance` covers e-invoice/e-way bill generation and submission history, an area absent from the whole reference slice.

## Slice G4b1 — backlog

**G4b1-01 — Staff roster on the Devices & Sync page**
- Reference pages: `/settings/users-devices`
- Description: our Devices page never names the staff account behind a device or session, and no staff list exists anywhere in the app.
- Acceptance criteria:
  - a "Users" tab lists every staff account with name, identifier, role (admin|pharmacist|cashier), device count and last activity;
  - each device and session row shows its owning staff user;
  - the roster and the admin-only feeds load behind a visible loading state and an error state, mirroring the reference "Fetching Users" behaviour;
  - the roster endpoint is admin-gated server-side (`requireRole("admin")`), and non-admin roles see the roster read-only.
- Size: M (1-3 days)
- Dependency: backend data model
- Priority: P1

**G4b1-02 — Add staff user with a role**
- Reference pages: `/settings/users-devices` ("Add New User (F2)")
- Description: there is no way to create a second staff account; the reference page starts adding a user to the business from its Users & Devices screen.
- Acceptance criteria:
  - an admin-only "Add User" action creates a staff account with name, identifier (email or phone) and role chosen from admin|pharmacist|cashier;
  - the new account is listed in the G4b1-01 roster and can log in through the existing identifier+password flow and register its own device;
  - a duplicate identifier is rejected with a visible, field-level error;
  - non-admin roles cannot see the action and the create endpoint rejects their calls.
- Size: M (1-3 days)
- Dependency: backend data model
- Priority: P1

**G4b1-03 — Revoke every device of one staff user**
- Reference pages: `/settings/users-devices`
- Description: today a device is revoked one row at a time; the reference presents devices grouped per user, which implies a per-user offboarding action we lack.
- Acceptance criteria:
  - from a roster row an admin can revoke all devices and sessions of that staff user in one action, with a confirmation dialog naming the user;
  - affected sessions end with the same global 401 behaviour as the existing device kill-switch;
  - the roster row then shows the user as having no active device;
  - the action appears in the existing activity audit feed.
- Size: S (<1 day)
- Dependency: backend data model
- Priority: P1

**G4b1-04 — Change the role of an existing staff user**
- Reference pages: `/settings/users-devices`
- Description: our three roles are fixed when a user signs up, so a staff roster built in G4b1-01 could not be managed afterwards.
- Acceptance criteria:
  - an admin can change a staff user's role between admin|pharmacist|cashier from the roster;
  - the change takes effect on the user's next request (server-side capability check, not only sidebar hiding);
  - an admin cannot demote the last remaining admin account;
  - the change is recorded in the activity audit feed.
- Size: S (<1 day)
- Dependency: backend data model
- Priority: P2

**G4b1-05 — Business profile: entity type and owner identity**
- Reference pages: `/integrations/business-detail`
- Description: our store profile captures the business name and GSTIN but not who the business is and who owns it.
- Acceptance criteria:
  - the store profile card gains entity type, owner name, owner PAN and owner mobile fields, and business PAN/CIN/LLPIN fields;
  - values persist through the existing settings API and reappear on reload;
  - an optional GSTIN format check runs on blur and blocks only the GSTIN field, matching the reference validation style;
  - the onboarding wizard writes the same keys so a store configured at signup is not re-entered.
- Size: S (<1 day)
- Dependency: existing page extension
- Priority: P2

**G4b1-06 — Business profile document slots (drug licence, GSTIN certificate)**
- Reference pages: `/integrations/business-detail`
- Description: we hold a drug licence number and one storefront picture as plain settings values; the reference keeps per-document image slots with one image per slot.
- Acceptance criteria:
  - the store profile card offers separate slots for the drug-licence Form 20 image, the Form 21 image and the GSTIN certificate image, each holding exactly one file;
  - each slot can be replaced or cleared and shows a preview with the file name and size;
  - uploads reuse the existing files API, and the stored file id is written back to the store profile settings;
  - a slot shows an explicit "missing" state when empty.
- Size: M (1-3 days)
- Dependency: existing page extension
- Priority: P2

**G4b1-07 — Address picker with map pin**
- Reference pages: `/integrations/business-detail`
- Description: the reference fills address and map pin through a place-search / geolocation picker; our inventory lists only plain address and location fields on the store profile.
- Acceptance criteria:
  - the store address can be picked from a place search or the device geolocation, storing latitude and longitude alongside the address text;
  - the picked location is shown as a pin preview on the profile card;
  - a store profile saved without coordinates still loads and displays its address text unchanged.
- Size: M (1-3 days)
- Dependency: existing page extension
- Priority: P3

**G4b1-08 — Record our own bank accounts**
- Reference pages: `/integrations/business-detail`
- Description: the reference page manages the business's own bank accounts and marks one for settlement; we record payments at the till but keep no bank-account list.
- Acceptance criteria:
  - the store profile card lists bank accounts with holder name, account number, IFSC and branch, and supports add, edit and delete;
  - exactly one account can be marked as the settlement account;
  - accounts are visible only to admin and pharmacist roles;
  - no account detail is ever sent to an external partner (local-only storage).
- Size: M (1-3 days)
- Dependency: backend data model
- Priority: P3

**G4b1-09 — Self-test order drill for online orders**
- Reference pages: `/integrations/business-detail` ("Send test order notification", at most five test notifications)
- Description: the reference sends a sample order to the operator's device so the order path can be proven end to end; our online-orders toggle and staff order queue have no such drill.
- Acceptance criteria:
  - the online-orders card in Settings offers "Send test order", creating an order flagged as a test in the existing staff order queue;
  - the test order can be accepted and dismissed through the normal accept → pack → ready → deliver path, and the resulting test invoice is marked as a test;
  - at most five test orders can be sent, after which the action is disabled with a visible reason;
  - the action is admin-only and writes to the activity audit feed.
- Size: S (<1 day)
- Dependency: backend data model
- Priority: P2

## Slice G4b1 — deviations to document

- Subscription checkout (plan picker, add-ons, draft order resume): we ship no plan or billing entity, so there is nothing to check out locally.
- Coupons and wallet credits ("Use Localwell Credits", referral coupon removal): a local install has no promotional pricing layer or shared wallet to discount against.
- Payment gateway (Razorpay "Initiating/Completing Transaction" states): the app itself is not sold online; customer payments are recorded at the till instead.
- Aadhaar/partner KYC (Aadhaar onboarding link, KYC document upload, "Send for Review"): partner onboarding is marketplace behaviour we do not run.
- Partner settlement-account sync and the Cashfree onboarding redirect: we never push bank details to, or start an onboarding with, an external partner.
- Partner-onboarding email OTP on the invoice email: our staff accounts are created by an admin and sign in with identifier + password, so no delivery-code step exists.
- Subscription-gated login allowances ("No More Logins Available", buy more desktop/mobile logins): our devices are revoked by an admin, not capped by a plan.
- Displaying each device's session auth token: the reference shows it in the device list; we never render session tokens in the UI and revoke sessions instead.
