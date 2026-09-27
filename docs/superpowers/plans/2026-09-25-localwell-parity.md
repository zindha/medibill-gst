# LocalWell Parity (minus Multi-Branch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate every LocalWell screen in `New folder/` (11 screenshots, 24-Sep-2026) inside MediBillGST, minus the four multi-branch overheads — Branch Transfer, Delivery Challan, Quotation, Duplicate Medicines Across Branches — so Reports, Sales Transactions, Dashboard and billing reach feature parity with LocalWell.

**Architecture:** Extend the existing `reports.ts` monolith with new query builders (reusing `invoices/invoiceItems/salesReturns/medicines/batches/inventoryTransactions/payments/purchaseBills` via drizzle-orm + better-sqlite3). Frontend expands `ReportsPage.tsx` from 5 tabs to parity tabs (SALES/STOCK/PURCHASE/PAYMENTS/GST/PARTY/ORDER sub-tabs mirror LocalWell's 7-tab Business Reports catalog) while preserving the current `GST sub-views (Overview/GSTR-1/HSN/ITC)` and adding GSTR-2. Sales-list and dashboard are enhanced in-place (`InvoicesPage.tsx`, `DashboardPage.tsx`). No new tables; RFM/shortbook are computed views.

**Tech Stack:** Fastify + drizzle-orm (sqlite, better-sqlite3) + Zod, React 18 + Vite + TypeScript + Tailwind + lucide-react + Framer Motion (`apps/server` + `src/`)

**Spec:** Screenshots in `D:\Projects\MediBillGST\New folder\` + gap inventory from `src/pages/ReportsPage.tsx:44,155`, `src/pages/DashboardPage.tsx:106`, `src/pages/BillingPage.tsx:64`, `apps/server/src/db/schema/index.ts`, `apps/server/src/routes/reports.ts`, `src/lib/api.ts`.

## Global Constraints

- SKIP (out of scope): Branch Transfer, Delivery Challan, Quotation delivery-challan type, Duplicate Medicines Across Branches, and any multi-store/branch model — `stores` table stays single-store, `INVENTORY_TRANSACTION_TYPES.TRANSFER_IN/OUT` remain unused.
- `SALE TYPE` stays `Sale Invoice` only (`BillingPage.tsx`); do not add challan/transfer/quotation dials.
- All report endpoints use `GET /reports/*?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive) already validated by `reports.ts:6` zod; new endpoints reuse `dateFilter` helper pattern (`reports.ts:8`). Money fields render `toFixed(2)` + `tabular-nums`, rate tables show `CGST/SGST` split like existing GSTR-3B.
- Billing row parity uses existing `BillingPage.tsx:80` `schedule/packSizeLabel`; do not re-add HSN/Location/Rack to the billing grid (intentionally omitted). The creation-screen screenshot (`7.54.45 (1).jpeg`) is satisfied by existing Batch/Rx/PACK/RATE/DISC/GST/MARGIN/AMOUNT + margin guard already in `BillingPage.tsx:1802`.
- CSV exports reuse `ReportsPage.tsx:46 exportCSV` (header array + blob download); every new report gets a CSV button.
- Tests use `apps/server/test/helpers.ts` (`createTestUser`, `seedMedicine`, `createInvoiceWithItems`, `makeApp`) + `apps/server/test/setup.ts` temp `DATA_DIR` (better-sqlite3). Vitest `apps/server/test/*.test.ts`.
- Follow existing auth scoping (`request.user.id` filters every query) and `voided=false` for payments, `status != cancelled` for invoices — copy `reports.ts:240` where-clause pattern.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `apps/server/src/routes/reports.ts` | All report query builders + route handlers. Add helpers `rfmScore`, `fastSlow`, `stockValuation`, `expiryBuckets`, `openingClosing`, `productStatement`, `adjustmentsRegister`, `saleReturnDetail`, `salesSummaryBy`, `doctorSales`, `scheduleRegister`, `partySales`, `purchaseDetail`, `purchaseSummaryBy`, `pendingPayments`, `paymentsRegister`, `expenseRegister`, `buildGstr2`, `customerRegisterRFM`, `distributorRegister`, `shortbook`, `purchaseOrdersRegister`, `salesTransactionsSummary`. |
| `apps/server/src/routes/invoices.ts` | Minor: expose `doctorId` filter is already there; add `profit` hint if needed for sales-transactions KPIs (optional — profit computed in reports). |
| `src/lib/api.ts` | Add `reportsApi.*` entries for every new endpoint + `DashboardKpis` field docs keep in sync (`docs/API.md`). |
| `src/pages/ReportsPage.tsx` | Rebuild tabs to LocalWell 7-tab layout: `SALES REPORTS | STOCK REPORTS | PURCHASE REPORTS | PAYMENTS REPORTS | GST REPORTS | PARTY REPORTS | ORDER REPORTS`. Each tab hosts the catalog rows from screenshots. Preserve existing GST sub-views inside GST REPORTS. |
| `src/pages/InvoicesPage.tsx` | Enhance to LocalWell Sales Transactions list: header KPIs (Sales Count/Amt/Net Profit/Payable/Balance), date range + Filter/Sort + columns `INV AMT / NET PROFIT % / ADJ AMT / PAYABLE / BALANCE / PAID/DUE` (rows from `reportsApi.sales`). |
| `src/pages/DashboardPage.tsx` | Align to LocalWell Dashboard: keep existing 3+5+collections/stock cards, add Net Sales trend hint + ensure Fast/Slow and Refill strips match screenshots. |
| `src/pages/SettingsPage.tsx` | Light pass: expose `Business Profile` tabs BASIC/LICENSE/TAXATION/LOCATION/TIMINGS mapping to existing `settings` keys (name/address/gstin/drugLicense/phone). No new backend. |
| `docs/API.md`, `docs/DATABASE.md` | Document every new endpoint + computed field. |
| Tests | `apps/server/test/sales-reports.test.ts`, `stock-reports.test.ts`, `purchase-reports.test.ts`, `payments-reports.test.ts`, `gst-gstr2.test.ts`, `party-reports.test.ts`, `order-reports.test.ts` (extend `helpers.ts` with `seedSupplier`, `createPurchaseWithItems`, `createPayment`). |

---

### Task 1: Sales Reports Family (LocalWell SALES REPORTS minus Delivery Challans)

**Files:**
- Modify: `apps/server/src/routes/reports.ts:1-560` (imports + helpers + route blocks before `export default`)
- Modify: `src/lib/api.ts:140-220` (add `reportsApi.sales*` entries)
- Modify: `src/pages/ReportsPage.tsx:44,155,206,214` (tabs + 6 report views)
- Test: `apps/server/test/sales-reports.test.ts`

**Interfaces:**
- Consumes: `invoices`, `invoiceItems`, `salesReturns`, `salesReturnItems`, `medicines`, `customers`, `doctors`, `inventoryTransactions` from `apps/server/src/db/schema/index.ts`; existing `deriveItemTax`, `inPeriod`, `round2`, `emptyBucket` from `reports.ts`.
- Produces: `GET /reports/sales/register?from&to&view=invoice|date&customer&doctor&party&schedule` (invoice-wise + date-wise), `GET /reports/sales/detail` (product-level sale+return), `GET /reports/sales/summary?groupBy=product|company|category|customer|supplier|user`, `GET /reports/sales/doctor?doctorId`, `GET /reports/sales/schedule?schedule=H|H1|X`, `GET /reports/sales/party?customerId`. Frontend `reportsApi.salesRegister/salesDetail/salesSummary/salesDoctor/salesSchedule/salesParty`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/sales-reports.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestUser, seedMedicine, createInvoiceWithItems, makeApp } from "./helpers.js";
import { doctors } from "../src/db/schema/index.js";

describe("sales reports parity", () => {
  let app: Awaited<ReturnType<typeof makeApp>>;
  let userId: string;
  beforeEach(async () => { userId = await createTestUser(); app = await makeApp(userId); });
  it("register date-wise aggregates profit and adj amount", async () => {
    const med = await seedMedicine(userId, { name: "DOLO 650", mrp: 20, purchasePrice: 12, sellingPrice: 18, schedule: "H" });
    const inv = await createInvoiceWithItems(userId, { date: "2026-09-10", items: [{ medicineId: med.id, quantity: 2, rate: 18, gstRate: "12", discountAmount: 1 }] });
    const res = await app.inject({ method: "GET", url: "/reports/sales/register?from=2026-09-01&to=2026-09-30&view=date" });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.buckets.length).toBeGreaterThan(0);
    expect(typeof j.buckets[0].netProfit).toBe("number");
  });
  it("schedule register filters H schedule", async () => {
    const res = await app.inject({ method: "GET", url: "/reports/sales/schedule?schedule=H&from=2026-09-01&to=2026-09-30" });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().rows)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/test/sales-reports.test.ts -v`  (from `D:\Projects\MediBillGST\apps\server`)
Expected: FAIL — `Route GET:/reports/sales/register not found` / `GET:/reports/sales/schedule not found`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/server/src/routes/reports.ts — add after imports
import { doctors, customers } from "../db/schema/index.js";
// Helper: sales register (invoice-wise vs date-wise)
function buildSalesRegister(invoices: any[], items: any[], returns: any[], view: "invoice"|"date") { /* aggregate taxable/gst/profit/adj per invoice or per date; adj = grandTotal - sum(item.amount+gst); netProfit = sum((rate - purchasePrice)*qty) via medicines.purchasePrice lookup */ }
// Route handlers:
app.get("/reports/sales/register", async (req) => {
  const { from, to, view = "invoice", customer, doctor, schedule, q } = dateFilter.parse(req.query);
  // where = [eq(invoices.createdBy, userId), gte(invoices.date, from), lte(invoices.date, to), ne(invoices.status,"cancelled")]
  // optional customer/doctor/schedule filters via invoiceItems->medicines join
  // fetch invoices + invoiceItems + medicines, compute register, return { buckets, invoices: enrichedRows }
});
app.get("/reports/sales/detail", async (req) => { /* join invoiceItems + salesReturnItems, per-medicine saleQty/returnQty/netQty + gst/margin%, filter customer/phone */ });
app.get("/reports/sales/summary", async (req) => { /* groupBy param validates against ["product","company","category","customer","supplier","user"]; aggregate */ });
app.get("/reports/sales/doctor", async (req) => { /* filter invoices.doctorId = param, return date-wise + invoice-wise */ });
app.get("/reports/sales/schedule", async (req) => { /* filter medicines.schedule = param */ });
app.get("/reports/sales/party", async (req) => { /* filter invoices.customerId */ });
```

```ts
// src/lib/api.ts — extend reportsApi
salesRegister: (p) => api.get("/reports/sales/register", { params: p }).then(r => r.data),
salesDetail: (p) => api.get("/reports/sales/detail", { params: p }).then(r => r.data),
salesSummary: (p) => api.get("/reports/sales/summary", { params: p }).then(r => r.data),
salesDoctor: (p) => api.get("/reports/sales/doctor", { params: p }).then(r => r.data),
salesSchedule: (p) => api.get("/reports/sales/schedule", { params: p }).then(r => r.data),
salesParty: (p) => api.get("/reports/sales/party", { params: p }).then(r => r.data),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/test/sales-reports.test.ts -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire ReportsPage UI (view-by toggles + tables + CSV)**

In `ReportsPage.tsx` inside `TabsContent value="sales"` replace single-sales view with LocalWell catalog: render 6 rows (Sales Register, Sale & Return Product-Level Detail, Sales & Returns Summary, Sales Register Doctor-Wise, Scheduled Drug Register, Sales Register Party-Wise) each expandable with table + `exportCSV`. Date-wise bar chart for Register date view. Reuse `TabsList` 7-tab header (see Task file-structure).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/reports.ts src/lib/api.ts src/pages/ReportsPage.tsx apps/server/test/sales-reports.test.ts
git commit -m "feat(reports): add sales register/detail/summary/doctor/schedule/party parity"
```

---

### Task 2: Stock Reports Family (7 of 8; skip Duplicate Across Branches)

**Files:**
- Modify: `apps/server/src/routes/reports.ts`
- Modify: `src/lib/api.ts` (add `reportsApi.stock*`)
- Modify: `src/pages/ReportsPage.tsx` (STOCK REPORTS tab with 7 rows)
- Test: `apps/server/test/stock-reports.test.ts`

**Interfaces:**
- Consumes: `medicines`, `batches`, `inventoryTransactions` (type filter), `invoices+invoiceItems` for fast/slow ranking.
- Produces: `GET /reports/stock/fast?from&to&limit`, `GET /reports/stock/slow?from&to`, `GET /reports/stock/current`, `GET /reports/stock/expired?from&to`, `GET /reports/stock/opening-closing?from&to`, `GET /reports/stock/statement?medicineId&from&to`, `GET /reports/stock/adjustments?from&to`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/stock-reports.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestUser, seedMedicine, makeApp } from "./helpers.js";
describe("stock reports", () => {
  let app: any; let uid: string;
  beforeEach(async () => { uid = await createTestUser(); app = await makeApp(uid); await seedMedicine(uid, { name: "AZEE 500", purchasePrice: 40, mrp: 60 }); });
  it("fast-movers returns ranked list", async () => {
    const res = await app.inject({ method: "GET", url: "/reports/stock/fast?from=2026-08-01&to=2026-09-30" });
    expect(res.statusCode).toBe(200); expect(Array.isArray(res.json().rows)).toBe(true);
  });
  it("current stock with value aggregates batches", async () => {
    const res = await app.inject({ method: "GET", url: "/reports/stock/current" });
    expect(res.statusCode).toBe(200); expect(typeof res.json().totalValue).toBe("number");
  });
  it("expired buckets uses expiryDate range", async () => {
    const res = await app.inject({ method: "GET", url: "/reports/stock/expired?from=2026-09-01&to=2026-12-31" });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/test/stock-reports.test.ts -v`
Expected: FAIL — routes not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// reports.ts helpers
function buildFastSlow(invoicesItems, from, to) { /* sum qty per medicineId where invoice.date in range, sort desc/asc, attach stock = sum(batches.quantity) */ }
function buildCurrentStock(medicines, batches) { /* per medicine: stockPacks, saleValue=stock*sellingPrice, mrpValue, costValue */ }
function buildOpeningClosing(transactions, from, to) { /* opening = sum qty before from, closing = opening + sum qty in range; walk inventoryTransactions */ }
```

Routes: `GET /reports/stock/fast|slow|current|expired|opening-closing|statement|adjustments` — all scoped by `createdBy`/`created_by` as existing patterns; `expired` filters `batches.expiryDate` between `from`/`to` or `<= today` + `near = today..today+90d`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/test/stock-reports.test.ts -v` → PASS.

- [ ] **Step 5: ReportsPage STOCK REPORTS UI — 7 rows, each drill-down**

Each row: star toggle (nop — just localStorage), description from screenshots, `>` arrow opens detail table + CSV. Fast/Slow share a ranked table (Product, Company, Qty Sold, Stock, Last Sold). Expired groups into Expired vs Near-Expiry (≤90d). Opening/Closing shows `O:`, `C:`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/reports.ts src/lib/api.ts src/pages/ReportsPage.tsx apps/server/test/stock-reports.test.ts
git commit -m "feat(reports): add stock fast/slow/current/expired/opening-closing/statement/adjustments"
```

---

### Task 3: Purchase Reports Family (4 rows)

**Files:**
- Modify: `apps/server/src/routes/reports.ts`, `src/lib/api.ts`, `src/pages/ReportsPage.tsx`
- Test: `apps/server/test/purchase-reports.test.ts`

**Interfaces:**
- Consumes: `purchaseBills`, `purchaseBillItems`, `purchaseReturns`, `purchaseReturnItems`, `suppliers`, `medicines`.
- Produces: `GET /reports/purchase/register?view=invoice|date&distributor`, `GET /reports/purchase/detail`, `GET /reports/purchase/summary?groupBy=product|supplier|company`, `GET /reports/purchase/schedule?schedule`.

- [ ] **Step 1: Write the failing test**

```ts
// purchase-reports.test.ts
it("purchase register filters by distributor", async () => {
  const res = await app.inject({ method: "GET", url: "/reports/purchase/register?from=2026-08-01&to=2026-09-30&distributor=XYZ" });
  expect(res.statusCode).toBe(200);
});
it("purchase schedule groups H-schedule", async () => {
  const res = await app.inject({ method: "GET", url: "/reports/purchase/schedule?schedule=H&from=2026-08-01&to=2026-09-30" });
  expect(res.statusCode).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/test/purchase-reports.test.ts -v` → FAIL.

- [ ] **Step 3: Write minimal implementation**

Reuse sales pattern but source `purchaseBills/billItems` + joins `purchaseReturns`. `detail` row has product-wise gst/margin% (margin = (mrp - purchasePrice)/mrp). `summary` by `product|supplier|company` (company = `medicines.brand`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/test/purchase-reports.test.ts -v` → PASS.

- [ ] **Step 5: ReportsPage PURCHASE REPORTS UI — 4 catalog rows + drill tables + CSV**

Add distributor search filter (`SuppliersPage` combobox pattern) wired to `distributor` query param.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/reports.ts src/lib/api.ts src/pages/ReportsPage.tsx apps/server/test/purchase-reports.test.ts
git commit -m "feat(reports): add purchase register/detail/summary/schedule parity"
```

---

### Task 4: Payments Reports Family (4 rows)

**Files:**
- Modify: `apps/server/src/routes/reports.ts`, `src/lib/api.ts`, `src/pages/ReportsPage.tsx`
- Test: `apps/server/test/payments-reports.test.ts`

**Interfaces:**
- Consumes: `payments` (type received/paid/expense, voided=false), `customers`, `suppliers`, `invoices`, `purchaseBills`.
- Produces: `GET /reports/payments/pending-customers?view=summary|detail`, `GET /reports/payments/pending-distributors`, `GET /reports/payments/register?from&to&type&mode`, `GET /reports/payments/expense?from&to&groupBy=category|name`.

- [ ] **Step 1: Write the failing test**

```ts
it("pending customers summary sums balance > 0", async () => {
  const res = await app.inject({ method: "GET", url: "/reports/payments/pending-customers?view=summary" });
  expect(res.statusCode).toBe(200); expect(typeof res.json().totalDue).toBe("number");
});
it("payments register respects date filter", async () => {
  const res = await app.inject({ method: "GET", url: "/reports/payments/register?from=2026-09-01&to=2026-09-30" });
  expect(res.statusCode).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/test/payments-reports.test.ts -v` → FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
function pendingCustomers(db, userId) { return db.select().from(customers).where(and(eq(customers.createdBy,userId), gt(customers.balance,0))).orderBy(desc(customers.balance)); }
// payments register = payments where voided=false and date in range, join customers/suppliers name,  supports type/mode filter
// expense register = payments where type='expense',  grouped by category
```

Reuse `Dashboard:dues` aggregation (now report-scoped + detail row per invoice/bill).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/test/payments-reports.test.ts -v` → PASS.

- [ ] **Step 5: ReportsPage PAYMENTS REPORTS UI — 4 rows + Summary/Detail toggle**

Rows: Pending Customers, Pending Distributors show summary card (Total Due) + detail table (Party, Payable, Balance, Last Tx). Payments Register shows by Invoice/Date/User. Expense Register grouped + with/without GST toggle (payments.category filter).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/reports.ts src/lib/api.ts src/pages/ReportsPage.tsx apps/server/test/payments-reports.test.ts
git commit -m "feat(reports): add pending payments + register + expense register"
```

---

### Task 5: GST — GSTR-2 + Enhanced GST Catalog (purchase counterpart to existing GSTR-1/3B/HSN/ITC)

**Files:**
- Modify: `apps/server/src/routes/reports.ts` (add `buildGstr2`, route)
- Modify: `src/lib/api.ts` (`reportsApi.gstr2`)
- Modify: `src/pages/ReportsPage.tsx` (GST REPORTS tab: 3 rows + keep existing 4 sub-views)
- Test: `apps/server/test/gst-gstr2.test.ts`

**Interfaces:**
- Consumes: `purchaseBills`, `purchaseBillItems`, `purchaseReturns`, `purchaseReturnItems`, `suppliers`, `medicines` (for rate derivation same as `deriveItemTax`).
- Produces: `GET /reports/gstr2?from&to` returns `{ summary:{ totalTaxable, totalGst, cgst, sgst, igst, billCount, debitNoteCount }, b2b[], cdnr[] by supplier GSTIN }`; enriches `buildGstr1` sibling. Frontend `reportsApi.gstr2`.

- [ ] **Step 1: Write the failing test**

```ts
it("gstr2 sums inward GST by rate net of debit notes", async () => {
  const med = await seedMedicine(uid, { name: "PCM", hsnCode: "3004", gstRate: "12" });
  await createPurchaseWithItems(uid, { billDate: "2026-09-10", items: [{ medicineId: med.id, quantity: 10, rate: 10, gstRate: "12" }] });
  const res = await app.inject({ method: "GET", url: "/reports/gstr2?from=2026-09-01&to=2026-09-30" });
  expect(res.statusCode).toBe(200); expect(res.json().summary.totalGst).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/test/gst-gstr2.test.ts -v` → FAIL.

- [ ] **Step 3: Write minimal implementation**

Mirror `buildOutwardSummary`/`buildGstr1` but source `purchaseBills` + `purchaseReturns` (debit notes). Rate bucket uses same `deriveItemTax` logic; split CGST/SGST for intra-state (all purchases treated intra-state unless `supplier.gstin` state differs — keep simple: split half).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/test/gst-gstr2.test.ts -v` → PASS.

- [ ] **Step 5: ReportsPage GST REPORTS catalog — 3 rows + sub-views**

Tab GST REPORTS shows 3 catalog rows (GSTR-1, GSTR-2, GSTR-3B) per `7.54.49 PM.jpeg`; clicking a row switches `gstView` to the existing Overview/GSTR-1/HSN/ITC + new `gstr2` view. Keep CSV parity.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/reports.ts src/lib/api.ts src/pages/ReportsPage.tsx apps/server/test/gst-gstr2.test.ts
git commit -m "feat(reports): add GSTR-2 inward (purchase + debit notes) with rate buckets"
```

---

### Task 6: Party Reports Family — Debtors/Creditors, RFM, Ledgers, Follow-ups

**Files:**
- Modify: `apps/server/src/routes/reports.ts`, `src/lib/api.ts`, `src/pages/ReportsPage.tsx`
- Test: `apps/server/test/party-reports.test.ts`

**Interfaces:**
- Consumes: `customers`, `suppliers`, `invoices`, `payments`, `refillReminders` (for pending medicine follow-ups), `medicines`.
- Produces: `GET /reports/party/customers` (RFM), `GET /reports/party/customer-followups`, `GET /reports/party/ledger?type=customer|supplier&id`, `GET /reports/party/distributors`. Frontend `reportsApi.partyCustomers/partyDistributors/partyLedger/partyFollowups`.

- [ ] **Step 1: Write the failing test**

```ts
it("customers register returns RFM score", async () => {
  const res = await app.inject({ method: "GET", url: "/reports/party/customers" });
  expect(res.statusCode).toBe(200); expect(Array.isArray(res.json().rows)).toBe(true);
  if (res.json().rows.length) expect(res.json().rows[0]).toHaveProperty("rfmScore");
});
it("payment ledger for customer returns balance timeline", async () => {
  const cust = await createCustomer(uid, { name: "K Mathivanan" });
  const res = await app.inject({ method: "GET", url: `/reports/party/ledger?type=customer&id=${cust.id}&from=2026-01-01&to=2026-12-31` });
  expect(res.statusCode).toBe(200); expect(Array.isArray(res.json().entries)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/test/party-reports.test.ts -v` → FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
function rfmScore(customer, invoicesForCustomer) {
  // R = days since lastPurchaseDate (lower is better, 5..1), F = count invoices in 180d, M = sum grandTotal; score = R+F+M normalized 1-5 each
}
// customers register = select customers where createdBy=userId, compute RFM + totalPurchases + lastPurchaseDate + outstanding
// ledger = union of invoices + payments where customerId/supplierId, ordered by date, running balance; reuses existing /customers/:id/ledger logic but paginated report shape
// followups = refillReminders where status='pending' and reminderDate between from/to
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/test/party-reports.test.ts -v` → PASS.

- [ ] **Step 5: ReportsPage PARTY REPORTS UI — 5 rows**

Rows per screenshot: Customers Register (Debtors) with RFM badge, Customer Pending Medicine Follow-ups (reuse RefillsPage card), Payment Ledger for Customer, Payment Ledger for Distributor (both with date range + customer/distributor search), Distributors Register (Creditors) outstanding table. Each has CSV.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/reports.ts src/lib/api.ts src/pages/ReportsPage.tsx apps/server/test/party-reports.test.ts
git commit -m "feat(reports): add party registers RFM, follow-ups, ledgers"
```

---

### Task 7: Order Reports — Shortbook + Purchase Order Register

**Files:**
- Modify: `apps/server/src/routes/reports.ts`, `src/lib/api.ts`, `src/pages/ReportsPage.tsx`
- Test: `apps/server/test/order-reports.test.ts`

**Interfaces:**
- Consumes: `medicines`, `batches`, `purchaseBills`, `purchaseBillItems`.
- Produces: `GET /reports/order/shortbook` (products to order: available <= reorderLevel/minQuantity), `GET /reports/order/purchase-orders?groupBy=product&from&to`. Frontend `reportsApi.shortbook/purchaseOrders`.

- [ ] **Step 1: Write the failing test**

```ts
it("shortbook returns low-stock medicines ordered by shortage %", async () => {
  const med = await seedMedicine(uid, { name: "LOWMED", minQuantity: 50, reorderLevel: 100 });
  const res = await app.inject({ method: "GET", url: "/reports/order/shortbook" });
  expect(res.statusCode).toBe(200); expect(res.json().rows.some(r => r.medicineId === med.id)).toBe(true);
});
it("purchase order register groups by product", async () => {
  const res = await app.inject({ method: "GET", url: "/reports/order/purchase-orders?from=2026-08-01&to=2026-09-30" });
  expect(res.statusCode).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/test/order-reports.test.ts -v` → FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// shortbook: for each medicine, availableStock = sum(batches.quantity) where batches.createdBy=userId and isActive,  shortage% = (reorderLevel - available)/reorderLevel; filter available <= reorderLevel
// purchase-orders: aggregate purchaseBillItems by medicineId in date range, return per product totalQty + lastBill + supplier
```

No new table; shortbook is a read view, purchase orders derived from existing bills.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/test/order-reports.test.ts -v` → PASS.

- [ ] **Step 5: ReportsPage ORDER REPORTS UI — 2 rows**

Shortbook table columns: Product, Company, Min/Reorder, Stock, Shortage %, Order Qty hint (reorderLevel - stock). Purchase Order Product Register: Product, Total Ordered, Bills, Suppliers.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/reports.ts src/lib/api.ts src/pages/ReportsPage.tsx apps/server/test/order-reports.test.ts
git commit -m "feat(reports): add shortbook + purchase order register"
```

---

### Task 8: Sales Transactions List Parity (InvoicesPage → LocalWell screenshot 1)

**Files:**
- Modify: `apps/server/src/routes/reports.ts` (reuse `sales/register` summary for KPIs) or `apps/server/src/routes/invoices.ts` (add profit/adj fields on list), `src/lib/api.ts` (optional `invoicesApi.list` extends), `src/pages/InvoicesPage.tsx`
- Test: `apps/server/test/invoices.test.ts` (extend)

**Interfaces:**
- Consumes: `reportsApi.salesRegister` summary (Sales Count, Sales Amt Sum, Net Profit, Payable, Balance) + existing `invoicesApi.list`.
- Produces: `GET /invoices` already returns `totalGst, grandTotal`; enhance row enrichment in frontend by merging `reportsApi.salesRegister(includeProfit=true)` or compute profit on-fly using `medicines.purchasePrice` per invoice item.

- [ ] **Step 1: Write the failing test (or manual bsk check — unit sufficient)**

```ts
it("invoices list rows include adjAmount derived field", async () => {
  const med = await seedMedicine(uid, { name: "PROD", mrp: 20, purchasePrice: 10 });
  await createInvoiceWithItems(uid, { items: [{ medicineId: med.id, quantity: 1, rate: 18, gstRate: "12" }] });
  const res = await app.inject({ method: "GET", url: "/invoices?from=2026-09-01&to=2026-09-30" });
  expect(res.statusCode).toBe(200); expect(res.json().invoices[0]).toHaveProperty("grandTotal");
});
```

- [ ] **Step 2: Run test to verify current shape**

Run: `npx vitest run apps/server/test/invoices.test.ts -v` → note what is missing (NET PROFIT %, ADJ).

- [ ] **Step 3: Implement InvoicesPage header KPIs + row enrich**

Header: 5 KPI tiles (Sales Count, Sales Amt Sum, Sales Net Profit, Payable Sum, Balance Sum) fetched from `reportsApi.salesRegister({from,to,view:"invoice"})` + local date filter bar (`INV NO search, FILTER BY, SORT BY` per screenshot `7.54.43`). Table columns add: `INV AMT, NET PROFIT (+ green % below), ADJ AMT (= grandTotal - invoiceValue), PAYABLE, BALANCE, PAID/DUE pill, USERNAME`. Profit = `sum((rate - purchasePrice)*qty)`. Map `ADJ AMT` sign (+ green, − red muted) like LocalWell.

- [ ] **Step 4: Verify via bsk**

`bsk open http://localhost:5173/invoices` at 1280px, screenshot: confirm KPIs + NET PROFIT column green + no overflow.

- [ ] **Step 5: Commit**

```bash
git add src/pages/InvoicesPage.tsx apps/server/src/routes/reports.ts src/lib/api.ts
git commit -m "feat(sales): bring invoices list to LocalWell parity: KPIs + profit/adj/payable/balance columns"
```

---

### Task 9: Dashboard Parity Polish + Verification Sweep

**Files:**
- Modify: `src/pages/DashboardPage.tsx`, `src/pages/SettingsPage.tsx`, `docs/API.md`, `docs/DATABASE.md`
- Test: `apps/server/test/dashboard.test.ts` (extend)

**Interfaces:**
- Consumes: `dashboardApi.kpis`, `refillsApi.upcoming`, `reportsApi.stockFast/Slow` (reuse), existing settings keys.
- Produces: Dashboard date range picker (17-09 to 24-09 style), Customers tile (Total/Avg Order/New/Repeat per screenshot `7.54.45`), Profit card (from Profit 0.00 from ₹219.15 style). Settings adds BASIC/LICENSE/TAXATION/LOCATION/TIMINGS sub-tabs.

- [ ] **Step 1: Extend dashboard.test for customers tile if needed**

```ts
it("kpis include customers metrics", async () => {
  const res = await app.inject({ method: "GET", url: "/dashboard/kpis?date=2026-09-24" });
  expect(res.json()).toHaveProperty("customers");
});
```

- [ ] **Step 2: Dashboard polish — date range + Customers tile**

Keep current Today's Sales/Bills/Profit row, then add row: `Net Sales, Stock Value (3 valuations), Customers` as per screenshot `7.54.45 PM.jpeg`. Customers: Total Customers, Avg Order Value, New Repeat. Payment Collection In/Out stays. Fast/Slow tabs + Due Payments toggle (Customer/Distributor) already but ensure date range filter wires to `from/to`.

- [ ] **Step 3: Settings/Control Centre BASIC/LICENSE/TAXATION/LOCATION/TIMINGS tabs**

Map BASIC → name/address/phone; LICENSE → drugLicenseNo; TAXATION → gstin/tax config; LOCATION → address; TIMINGS → settings key `store_timings`. Reuse `settingsApi.get/put`.

- [ ] **Step 4: Run full gates**

Run: `npx vitest run` (expect 8+ passed), `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`), `bsk` screenshot of `/reports`, `/invoices`, `/dashboard` at 1280px.

- [ ] **Step 5: Update docs + graph + commit**

```bash
npm run typecheck 2>&1 | head -20
npx vitest run 2>&1 | tail -10
graphify update . 2>&1 | tail -3
git add src/pages/DashboardPage.tsx src/pages/SettingsPage.tsx docs/API.md docs/DATABASE.md
git commit -m "feat(dashboard+settings): align to LocalWell Dashboard + Control Centre parity"
```

---

## Execution Order

1. Task 1 (Sales) → unlocks Task 8 (Invoices list reuses it)
2. Tasks 2, 3, 4 in parallel after Task 1 pattern is established (shared helpers)
3. Task 5 (GSTR-2) after Task 1 GST base is touched
4. Task 6 (Party) after payments pending helpers exist (Task 4)
5. Task 7 (Order) independent, but last among reports
6. Task 8 (Sales Transactions) after Task 1
7. Task 9 (Dashboard+Settings polish + verification)

## Risks

- Profit/margin needs `medicines.purchasePrice` join — ensure no N+1 (batch queries).
- Opening/Closing Statement walks `inventoryTransactions`; cap date range to 90d default to avoid scan.
- RFM must handle customers with zero invoices (R=null → score 0).
- All new report routes must copy the `createdBy` scoping pattern from `reports.ts:240` exactly — otherwise cross-tenant leak.

## Verification

- `npx vitest run` green (new tests 7+ files), `npm run typecheck` clean, `bsk` 3 screenshots (Reports GST tab + Invoices list + Dashboard) no overflow at 1024px and 1280px.
