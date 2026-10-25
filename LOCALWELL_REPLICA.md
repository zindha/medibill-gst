# LocalWell (pharmacy.localwell.in) → MediBillGST Replication Spec

Goal: replicate the look, layout, and feature set of **pharmacy.localwell.in** (LocalWell
pharmacy SaaS) inside the existing **MediBillGST** app, keeping **MediBill/GST branding**
(the name/logo) but matching LocalWell's screens, flows, and visual style.

Observed directly via authenticated browser captures of the account (owner "Malliga",
business "Lakshmi", Kanchipuram TN). Everything below is `observed` unless marked
`inferred`.

---

## 1. Tech stack of the target (observed)

- **Next.js SSR/PWA** — meta `apple-mobile-web-app-capable`, `manifest.webmanifest`,
  `/_next/static/*` chunked build, `__NEXT_DATA__` JSON.
- Styling: CSS-modules style classnames with a `lib-*` component library
  (`lib-input`, `lib-button`, `lib-chip`, `lib-text`, `lib-snackbar`, `lib-back-navigation`).
- State: localStorage keys `lw_storage`, `persist:root`; sessionStorage `lw_storage`.
- Backend API: `https://node.api.localwell.in` (Express, Caddy).
- Analytics: Google Tag Manager `GTM-PPW3GN3K`, GA4, Google Ads conversion.

MediBillGST is React 19 + Vite + Tailwind 4 + shadcn/ui + Convex — a different stack, so we
**replicate the visual/UX, not the implementation**.

---

## 2. Auth flow (observed, complete)

1. `/login` → full-screen centered card over a hero image.
   - Logo: `localwellLogo.svg`.
   - Title block: **"Login or Sign Up"** + subtext **"Enabling Pharmacies Since 2019"**.
   - Input label: **"Sign In to Continue"**.
   - Phone field: `+91` prefix + 10-digit number input, live counter `0/10`,
     placeholder "Enter 10-digit mobile number".
   - Button: **"Submit to Login"** (dark pill).
   - Footer: "By continuing, you are agreeing to our" + **Terms of Service** &
     **Privacy Policy** links (→ localwell.in pages).
2. On submit, backend looks up the number:
   - If account exists → shows **"Welcome, <Name>!"** with "Login as a different User"
     back link, then **"Enter Password to Login"** field + **"Validate Now"** button +
     "Forgot Password?" link.
   - If OTP-based → OTP screen (not exercised here; this account is password-based).
3. On success → redirect to the app shell (landing = **`/stocks/view-stocks`**).
4. Error toast: red snackbar "Incorrect Password" / "Please provide all the Required
   Values" etc.
5. Device-limit screen (`/login/login-exhausted`): "Maximum Allowed Logins Reached!",
   "Logout 1 More Device", and a device list to force-logout — shown on the **Free Plan**
   when concurrent device slots are exhausted.

Replication: replace MediBillGST `Auth.tsx` email/password form with the **mobile →
password** two-step flow (login/signup), keep MediBill branding, add the `+91` prefix,
the `0/10` counter, the welcome step, and the terms/privacy footer.

---

## 3. App shell (observed)

**Top header:**
- Left: **LocalWell full logo** (`/assets/icons/header/logofull.svg`).
- Center: **business switcher** — a "LA" initials chip labeled "Retailer", then the
  business name **"Lakshmi"** and line 2 **", Kanchipuram, Tamil Nadu - 600070"**, with a
  down-arrow.
- Right: notification/bell icon (red dot variant).

**Left sidebar (top → bottom):**
- **Search** (with "Ctrl + F to Search" hint) + **Shortcut** menu + **MA** user avatar.
- Primary nav: **Dashboard**, **Invoices**, **Customer**, **Orders**, **Orderbook**,
  **Business Reports**, **Patient Followups**, **Expenses**, **Cash and Bank**,
  **Branch Transfer**, **Stock Audit**, **Control Center**, **Support**.
- Footer: **Install on Desktop**, **Collapse Sidebar**.
- Promo banner in content area: "Activate Free Trial / You're Now Eligible!".

**Stock / Inventory screen** (`/stocks/view-stocks`) — the default landing:
- Tabs: **Purchases | Stock | Sales**.
- Toolbar: **Search | Filter | Sort**, plus buttons **+ Add New Item**, **Add
  Composition**, **Order Now (F2)**, **Settings (F4)**, **Show Zero Qty Batches**,
  **+ Add New Batch**.
- Table columns: **BATCH NO | PACK | EXPIRY | STATUS | MRP | PURC RATE | NET RATE |
  SALE RATE | STOCK QTY**.
- Header reads "Stock on hand · SKU: 0 · Stock Value".

### Screen/feature map → existing MediBillGST routes

| LocalWell sidebar / screen | MediBillGST route (already present) | Notes |
|---|---|---|
| Dashboard | `/dashboard` | restyle |
| Invoices | `/dashboard/invoices`, `/dashboard/bulk-bills` | restyle |
| Customer | `/dashboard/customers`, `/dashboard/doctors` | restyle |
| Orders | `/dashboard/orders` | restyle |
| Orderbook | `/dashboard/orderbook/*` (dashboard, distributors, products, already-to-order, POs, shortbook, cart, analysis) | restyle |
| Business Reports | `/dashboard/reports`, `/dashboard/scheduled-reports` | restyle |
| Patient Followups | `/dashboard/prescriptions`, `/dashboard/refills` | restyle |
| Expenses | `/dashboard/expenses`, `/dashboard/expenses/:id` | restyle |
| Cash and Bank | `/dashboard/cash-bank`, `/dashboard/payments` | restyle |
| Stock Audit | `/dashboard/stock-audit` | restyle |
| Control Center | `/dashboard/settings`, `/dashboard/staff`, `/dashboard/devices`, `/dashboard/compliance`, `/dashboard/integrations`, `/dashboard/migration` | restyle |
| Support / Install | footer items | add |
| Stock (landing) | `/dashboard/inventory` | **align to view-stocks layout** |
| Purchases | `/dashboard/purchases`, `/dashboard/purchase-import`, `/dashboard/procurement` | restyle |
| Sales | `/dashboard/billing`, `/dashboard/returns`, `/dashboard/scan` | restyle |

Net: **the feature set already exists**; work = restyle the shell + login + key screens
to LocalWell's look and reorder the sidebar to match LocalWell's labels.

---

## 4. Visual design tokens (inferred from DOM/CSS classes)

- **Palette**: dark navy header/sidebar (CSS shows `#E0E0E0` theme-color; buttons are a
  dark pill `lib-buttonDark`); content area is light gray/white. Accent used for the
  notification bell is a pink/red `#FE316A`. Pharmacy-green/teal used in marketing.
  *Confirm exact brand hex before finalizing; sample the shipped CSS
  (`/_next/static/css/7f554d3153e6d905.css`) if a pixel-exact match is required.*
- **Type**: sans-serif system stack (`-apple-system, Segoe UI, Roboto, Helvetica,
  Arial`) + Next font auto-optimization woff2; headings medium weight; body 13–14px.
- **Shape**: pill buttons, rounded input fields, centered modal card on auth.
- **Components to build/align**: pill button, bordered input with prefix/suffix
  (+91, char counter), snackbar toast (green ok / red error), chip, user-avatar block,
  business-switcher, collapsible sidebar, tabs.

MediBillGST already ships shadcn/ui primitives (button, input, tabs, sidebar, dropdown,
dialog, sonner toast) — reuse them and restyle via Tailwind theme tokens.

---

## 5. Implementation order (this project)

1. **Auth.tsx** → mobile → password two-step login (MediBill branding, +91, 0/10
   counter, welcome step, terms/privacy footer).
2. **App shell** (DashboardLayout) → dark sidebar with LocalWell nav labels/order,
   top header with logo + business switcher + bell; collapsible sidebar.
3. **Landing screen** → `/dashboard` (and default after login) styled like the
   LocalWell "Stock on hand" / dashboard overview.
4. **Per-screen alignment** for the high-visibility screens (Inventory/Stock,
   Invoices, Orders, Reports, Expenses, Cash & Bank) — match table columns, toolbar,
   and tab patterns from the observed layout.
5. Verify parity feature-by-feature.

## 6. Verified routes + batch screen references (Playwright captures, 2026-10-26)

Real sidebar routes extracted from the live app (screenshots + text under
`localwell-captures/`):

| LocalWell label | Verified route | Captured |
|---|---|---|
| Dashboard | `/dashboard/view-dashboard` | ✓ |
| Customer Orders | `/customer-orders` | ✓ |
| Orderbook | `/orderbook/dashboard` | ✓ |
| Business Reports | `/reports/business-reports` | ✓ |
| Patient Followups | `/reminders/view-reminders` | ✓ |
| Expenses | `/expenses/view-expenses` | ✓ |
| Branch Transfer | `/stocks/stock-transfer/view-transfers` | ✓ (list route) |
| Stock Audit | `/stock-audit` | ✓ |
| Control Center | `/control-center/business-profile` | ✓ |
| Invoices | submenu (child route unknown) | — |
| Cash and Bank | submenu (child route unknown) | — |

Header center tabs: **Purchases | Stock | Sales** (Sales premium-locked).

Shared screen design language (observed on Expenses / Orders / Reports):
- Title + one-line subtitle; primary action labeled with its hotkey, e.g. **Add New
  Expense (F2)**; footer hint line "… - F2 | Move Up or Down - Arrow Keys | View
  Detail - Enter".
- Toolbar: SEARCH (uppercase placeholder), **ADDED BETWEEN** date range, **FILTER BY /
  SORT BY** selects.
- Empty state reads exactly **"No data"**.

Expenses table columns (exact): EXPENSE NO · EXPENSE DATE · CATEGORY · NATURE · PAID TO
PARTY · PAY MODE / UTR · AMOUNT · ADDED ON · ADDED BY.
Customer Orders columns: PATIENT NAME · ORDER NO · SOURCE · FULFILLMENT · CREATED · AGE ·
ORD STATUS · UPDATED · SKUs · FOR BILLING? · AMOUNT.
Business Reports columns: REPORT NAME / VIEW BY · REPORT DESCRIPTION.

Free-plan gating: premium screens show an upgrade modal ("Wow! You have discovered a
Premium Feature…") — not replicated; MediBill ships the features unlocked.

Login automation note: the free plan allows ~1 concurrent device; `capture_localwell.py`
evicts the stale session via the device-card logout icon on
`/login/login-exhausted` (selector `[class^='user-card_logoutIcon']`) before re-login.