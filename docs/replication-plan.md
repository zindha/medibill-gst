# LocalWell Replication Plan — Work Packages

Read `docs/localwell-parity.md` first. Everything below is original code in MediBillGST conventions. Target's code/assets/copy are never copied.

## Shared conventions (all work packages)

- **Pages**: `src/pages/<Name>Page.tsx` (or `src/pages/<module>/<Name>Page.tsx` for new modules). Each teammate creates page files; the **Lead wires** `src/main.tsx` routes and `src/components/DashboardLayout.tsx` nav at integration to avoid shared-file conflicts.
- **API client**: create a **separate file** per module: `src/lib/<module>Api.ts` using the existing helpers (`import { request, ApiError } from "@/lib/api"` style used by existing pages — check imports in a sibling file first).
- **Backend**: new Fastify module `apps/server/src/routes/<module>.ts` + `apps/server/src/services/<module>.ts`, zod-validated, `authGuard` preHandler, `{ success: true, data }` envelope, tenant-scoped (`request.userId`). Report the `apiRoutes` entry `[routes, "/api/<module>"]` needed in `apps/server/src/index.ts` — **Lead wires index.ts**.
- **DB**: Drizzle tables in `apps/server/src/db/schema/index.ts` + a new migration `apps/server/src/db/migrations/00NN_<module>.sql` (plain SQL, matching existing migration style). Reuse existing tables where possible before adding new ones.
- **UI**: shadcn/ui primitives from `src/components/ui`, lucide-react icons, Sonner toasts (`toast.success/error`), Tailwind v4 tokens, no nested cards/shadows, responsive (desktop grid + mobile cards), keyboard-friendly.
- **Verification per package**: root `npm run typecheck`, `npm run lint` (scoped ok), `cd apps/server && npm run build`. No TODO stubs; empty states handled; forms validated with zod.

## WP1 — Orderbook module (teammate: `orderbook`)

New module mirroring the target's distributor-ordering workflow, 11 screens under `/dashboard/orderbook/*`:

1. `OrderbookDashboardPage` — pending POs, shortbook alerts, reorder suggestions, spend KPIs.
2. `OrderbookDistributorsPage` — distributor list w/ search, connected status, outstanding balance.
3. `OrderbookDistributorDetailPage` — profile, price lists, recent orders, ledger.
4. `OrderbookProductListPage` — searchable catalog filtered to distributor, rate + pack info, add-to-cart.
5. `OrderbookAlreadyToOrderPage` — items already pending/ordered recently.
6. `OrderbookPurchaseOrdersPage` — PO list w/ status filters (draft/sent/confirmed/partial/received/cancelled).
7. `OrderbookPoDetailPage` — line items, statuses, receive-against-PO action (updates stock + purchases where feasible).
8. `OrderbookShortbookPage` — items demanded but not supplied, with carry-forward/resupply actions.
9. `OrderbookCartPage` — current cart, supplier grouping, GST computation preview, place order.
10. `OrderbookOrderDetailPage` — cart order detail/history snapshot.
11. `OrderbookAnalysisPage` — order trends, top products, fill rate charts (recharts).

Backend: `routes/orderbook.ts` + `services/orderbook.ts` + `0019_orderbook.sql` — tables: `orderbookDistributors` (link to suppliers), `orderbookPurchaseOrders`, `orderbookPoItems`, `orderbookShortbook`, `orderbookCart`, `orderbookCartItems`. Endpoints: distributors CRUD, PO lifecycle (create/send/confirm/receive/cancel), shortbook list/resolve, cart add/update/checkout, analysis aggregates.

## WP2 — Stocks ops + cash-bank (teammate: `stocks-ops`)

1. `StockPicklistPage` — build a picklist from pending bills/order, batch/expiry-aware picking, mark picked.
2. `StockTransferPage` — inter-store transfer list + create (needs multi-store: reuse store joins; if single store, allow transfer log w/ status).
3. `StockBulkSettingsPage` — bulk update rules (margin %, GST rate, reorder level, rack) + CSV bulk stock upload.
4. Extend `CashBankPage.tsx` with a **Cheques** tab: cheque register (issued/received, pending/cleared/bounced/cancelled), mark-state actions, linked party. Backend: new `routes/cheques.ts` (+ migration table `cheques`) or extend reconciliation service if a fitting table exists.
5. `SalesRoutesPage` — delivery route planning: routes list, route editor (stops = pending deliveries from invoices/orders), optimize order (simple nearest-neighbor ok), mark delivered.

## WP3 — Support + subscription + growth (teammate: `support-billing`)

1. `SupportTicketsPage` + `SupportTicketDetailPage` + create dialog/page — status/open/closed, replies timeline. Backend `routes/tickets.ts` + migration.
2. `SupportAccountManagerPage` — assigned manager card + contact actions (data from settings; placeholder manager from integrations/user profile).
3. `SupportResetAccountPage` — guided account reset request flow (danger confirmations, audit-logged mutation).
4. `HelpCenterPage` — videos & resources: embedded player grid + downloadable guides list (static curated content, original).
5. `PlansPricingPage` + `SubscriptionPage` (settings) + `SubscriptionCheckoutPage` — plan cards (Free/Growth/Pro), current plan state, invoice history for subscription, mock checkout (no real payment gateway; record-only). Backend `routes/subscription.ts` storing plan + period + renewal invoice.
6. `ReferEarnPage` — referral code display, invited list, earned credits ledger (backend simple table).
7. Extend `SettingsPage.tsx` numbering section → full prefix-sequences editor (invoice/credit/debit/PO/purchase/expense prefixes + next numbers, using existing numbering service).
8. Login sub-states in `Auth.tsx`: create-password step, OTP-attempt-exhausted state, subscription-expired gate (reads subscription state when present).

## WP4 — Sale extras + orders detail + integrations detail (teammate: `sale-kyc`)

1. `CustomerFacingScreenPage` — full-screen second display: reads current bill draft (public-safe endpoint or local store), shows items + running total + bill number, QR pay hint. Public-style route `/sale/customer-facing-screen` outside dashboard chrome.
2. `CustomerOrderDetailPage` — full detail for `/dashboard/orders/:orderId` (timeline, items, payments, addresses, status transitions reuse ordersApi).
3. `BusinessKycPage` — KYC submission wizard (documents upload via filesApi, status tracking) wired to compliance backend.
4. Credit/Debit note flow: `CreditDebitNotesPage` — issue notes against invoices (backend `routes/notes.ts` + migration, GST-aware, prints via existing invoice template variant).
5. `B2ConnectBannerPage` component + placement (purchases page header promo card) + `IntegrationsBusinessDetailPage` — partner integration detail viewer reusing integrationsApi.
6. E-way bill dedicated print/parcel view (`EwayBillViewPage`) reusing compliance data.

## Integration (Lead)

- Wire all new routes in `src/main.tsx` (lazy imports, dashboard children + public routes).
- Add nav entries (grouped: new "Orderbook" group; Stocks ops under Inventory group; Support group; Subscription under Settings).
- Register backend modules in `apps/server/src/index.ts` `apiRoutes`.
- Root `npm run typecheck` + lint + `apps/server` build; boot dev servers; smoke-test each new route with agent-browser.
- Update `README.md` routes list and `docs/localwell-parity.md` statuses.

## Execution order (updated 2026-10-25)

Merged with the prior-session audit (`docs/localwell-compare/parity-summary.md`, batches A/B/D already shipped server-side). Delegated as subagents with disjoint file scopes; the Lead owns `src/main.tsx`, `src/components/DashboardLayout.tsx`, `src/lib/api.ts`, `apps/server/src/index.ts` and final verification.

| Workstream | Migration numbers | Covers |
|---|---|---|
| Batch C + cheques | 0019, 0020 | payment accounts, statements, cheque register |
| Batch E + stock tools | 0021, 0022 | picklist, transfers, bulk update/upload, audit depth |
| Batch F + notes | 0023 | credit/debit notes, ledgers, register depth, sign fix |
| WP1 orderbook | 0026 | 11 orderbook screens + PO/cart/shortbook backend |
| WP3 support/subscription | 0024, 0025 (pending launch) | tickets, help center, account manager, plans, referral, numbering grid, login states |
| WP4 sale extras | (no new migrations) | customer-facing screen, order detail, KYC, e-way view, B2 Connect |

Verification protocol per batch: root `npm run typecheck`, `apps/server` targeted vitest files, then Lead runs full `npx vitest run` + `npx vite build` + smoke tests.
