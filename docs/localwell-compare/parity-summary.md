# Parity summary — LocalWell reference vs MediBill

## What was compared

- **Reference**: 93 client-side pages of `pharmacy.localwell.in`, recovered from the public `_buildManifest.js` and page chunks. Full spec: `ref-screens.md`; the 552 backend operation names the pages dispatch, with 272 resolved to request paths: `ref-api-operations.md`.
- **Ours**: 35 routes of the MediBill SPA (inventory: `our-screens.md`).
- **Method**: each reference page was read feature by feature (workflows, fields, operations, states) and matched to our nearest route by capability, then every P1 gap was **re-audited against the actual code** (schema + routes + UI) so the backlog contains only real work.

## Roll-up

| Status | Reference pages | Share |
| --- | --- | --- |
| Covered | 2 | 2% |
| Partial | 52 | 56% |
| Missing | 9 | 10% |
| In progress | 2 | 2% |
| N/A (deliberate non-replication) | 28 | 30% |
| **Total** | **93** | |

The shape of the gap is consistent: **we have the workflow, the reference has the depth.** Our screens cover the same business steps but omit bulk handling, printable/previewable documents, per-line economics and configurable master data. Nothing in the N/A bucket is a workflow we would lose by not replicating it — they are cloud subscription, payment-gateway, partner-marketplace, support-desk and referral surfaces that a local-first single-pharmacy app should not imitate.

## Where we already exceed the reference

- `/dashboard/accounting` — double-entry journals, trial balance, P&L, balance sheet, period close vs the reference's single-sided balance edits.
- `/dashboard/reports` — 9-tab analytics incl. GSTR-1/3B, HSN summary and ITC credit vs a server-defined report catalogue we cannot enumerate statically.
- `/dashboard/compliance` — e-invoice/e-way-bill issue **and** cancel, with preflight checks; the reference only lists them.
- `/dashboard/devices` — registered devices, admin revoke/restore, session kill, activity audit and offline-sync journal vs the reference's read-only device lists.
- `/dashboard/migration` — preview → commit → rollback session lifecycle vs the reference's software-picker landing.
- `/dashboard/procurement` — RFQ and purchase rate history, which the reference has no counterpart for.
- `/dashboard/scheduled-reports` — recurring jobs with delivery, vs the reference's one-off export.
- `/dashboard/inventory` — stock movement history, low-stock view, OCR bill import, stock-audit session lifecycle with approve/cancel gate.
- `/dashboard/billing` — camera barcode scanning, batch issue-order, margin warnings.
- `/dashboard/expenses` — **shipped**: parties master, GST number validation with state prefill, CGST/SGST vs IGST split, round-off, payment fields, filters and pagination (19 server tests).

## Audit results per P1 gap

Each P1 gap was re-checked in the code. `IMPLEMENTED` rows are closed; `PARTIAL` rows name the missing half.

| Gap | Verdict | What is actually missing |
| --- | --- | --- |
| G1a-04 Sale-return credit tracking | PARTIAL | credit refund mode exists but **adds** to the customer balance while the GL credits AR (sign disagreement); `credit_accounts` never written; no apply-to-invoice; no partial settlement |
| G1a-07 Return line-grid parity | MISSING | only qty + reason editable; no discount column on `sales_return_items`; no partial settle |
| G1a-10 Customer ledger panel | MISSING | `/customers/:id/ledger` returns payments only; no SALES/RETURNS/PAYMENTS/QUOTATION tabs on the customer page |
| G1b-01 Printable credit note | MISSING | no print/export action, no document route |
| G1b-02 Printable debit note | MISSING | no document route or row action |
| G1b-05 Invoice preview | PARTIAL | preview exists; toolbar is Print + Close — no zoom, page selection or PDF export |
| G1b-09 Transaction list parity | PARTIAL | purchase-bill tab has a pager; invoice, sales-return and purchase-return registers have none; no keyboard row selection |
| G1b-11 Patient follow-ups | PARTIAL | the refill worklist is medicine-centric; no patient-centric screen, history or remark log |
| G2-01 Supplier master credit fields | PARTIAL | terms/limit/opening balance are in DB+API but have **no UI**; drug licence and GSTIN-verified absent everywhere |
| G2-02 Purchase payment block | PARTIAL | columns exist; the UI hardcodes `amountPaid: 0`, renders no payment-mode control, and there is no settle endpoint → every UI bill is "unpaid" |
| G2-03 Duplicate bill guard | MISSING | no supplier invoice number at all |
| G2-04 Line pricing | PARTIAL | free qty and bill discount exist; per-line discount is not in the UI payload; markup absent |
| G2-05 HSN/GST from master + outside-GST | PARTIAL | the line medicine picker is dead code, so HSN/GST are never captured from the master; no outside-GST toggle |
| G2-06 Reorder policy | PARTIAL | minQuantity/reorderLevel only — no max, reorder-point days, demand period, seasonality |
| G2-07 Reorder sheet | PARTIAL | the server computes shortage + recommended supplier; the UI drops the supplier and cannot push to a purchase |
| G3a-07 Batch picklist workspace | MISSING | whole feature absent |
| G3a-08 Picklist printing | MISSING | whole feature absent (pdfkit already available) |
| G3a-10 Camera stock counting | MISSING | the camera component exists but is only mounted on billing and inventory lookup |
| G3b-01 Audit result summary | PARTIAL | has counted/total and net variance in ₹; no short/excess SKU counts, no net adjustment in units |
| G3b-02 Editable counts + reasons | PARTIAL | search exists; sorting, in-place editing and per-batch reason missing; the updateCount API has **zero** UI callers |
| G3b-03 Scan-to-increment counting | MISSING | counts are absolute sets only; `batches` has no barcode column |
| G4a-01 Payment-accounts master | MISSING | `accounts` is a chart of accounts; only two hardcoded money accounts (CASH, BANK); no IFSC/holder/UPI, no per-account statement, no add/reduce adjustments |
| G4a-02 Prefix + sequences | PARTIAL | an invoice-prefix setting exists but the generator **ignores it**; other doc types hardcode `EXP-`, `RET-`, `PR-`; no padding/start-at control |
| G4a-03 Expenses module | IMPLEMENTED | shipped |
| G4b1-01 Staff roster | MISSING | `store_members` exists but **no route reads it** |
| G4b1-02 Add staff with role | MISSING | registration is disabled once a user exists; no invite/role flow |
| G4b1-03 Revoke one user's devices | MISSING | single-device/session revoke only |
| G4b2-02 Offline password reset | MISSING | only old-password change (and no screen calls it) — a locked-out user is unrecoverable |

## Build order (each batch: server + frontend, tests green, typecheck green)

| Batch | Scope | Gaps | Size |
| --- | --- | --- | --- |
| **A** (running) | Staff roster, add staff with role, per-user device revoke, admin password reset, own-password change screen | G4b1-01/02/03, G4b2-02 | M |
| **B** (running) | Purchase correctness: supplier invoice no + duplicate guard, payment block + settle endpoint, HSN/GST from master, outside-GST toggle, per-line discount & markup, supplier credit fields, medicine reorder policy | G2-01..G2-07 | L |
| **C** | Payment accounts: master with IFSC/holder/UPI/balance, per-account statement, add/reduce adjustments, link to the cash & bank screen | G4a-01 | L |
| **D** | Numbering: per-doc-type prefix/padding/start-at, wire the generators (invoice, expense, sale return, purchase return) | G4a-02 | M |
| **E** | Stock ops: audit summary in units, editable counts + per-batch reason + sorting, scan-to-increment + camera, batch barcode, picklist workspace + print | G3a-07/08/10, G3b-01/02/03 | L |
| **F** | Documents & ledgers: credit note, debit note, invoice preview zoom/page/PDF, register pagination + row count + keyboard selection, customer ledger panel, return line-grid + discount, credit-account sign fix + partial settlement | G1a-04/07/10, G1b-01/02/05/09 | L |
| **G** | Patient follow-ups worklist (patient-centric, history, remark log, bulk actions) | G1b-11 | L |
| **H** | Report depth: filter builder, column chooser, Excel/PDF/HTML/email export | P2 family | L |
| **I** | Dashboard cards: stock value, cash in hand, new vs repeat customers, due payments | P2 family | M |

Fixed along the way (real defects found by the audit): dead medicine picker in the purchase form, unused `changePassword` client, invoice prefix not honoured by the generator, unused stock-audit `updateCount` endpoint, `store_members` table never read.
