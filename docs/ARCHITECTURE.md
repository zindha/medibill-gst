# MediBill — Architecture Document

## Overview

MediBill is a **Windows-only, local-first pharmacy billing and inventory management system**. It is designed to operate entirely offline, with optional cloud backup for disaster recovery.

---

## 1. Technology Stack

### Frontend
- **React 19** + **Vite** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives)
- **React Router v7** for navigation
- **Framer Motion** for animations
- **Recharts** for dashboard charts
- Served by the Node.js backend in production

### Backend
- **Node.js** + **TypeScript**
- **Fastify** (production-quality HTTP framework)
- **Drizzle ORM** (SQLite)
- **better-sqlite3** (embedded SQLite engine)
- **Argon2** (password hashing)
- **Zod** (input validation)

### Database
- **SQLite** (local file, `C:\ProgramData\MediBill\data\medibill.db`)
- **WAL mode** enabled for concurrent reads
- **Foreign keys** enforced
- Migrations managed by Drizzle Kit

---

## 2. Architecture Layers

```
┌─────────────────────────────────────────────┐
│            React Frontend                   │
│   (existing UI, Convex SDK replaced with     │
│    REST API client in src/lib/api.ts)       │
└──────────────────────┬──────────────────────┘
                       │ HTTP/REST (localhost only)
┌──────────────────────▼──────────────────────┐
│         Fastify HTTP Server                │
│   Port: 3000 (configurable via PORT env)   │
│   Host: 127.0.0.1 (localhost only)         │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│           Business Logic Layer              │
│  BillingService │ TaxEngine │ FEFO Engine   │
│  InvoiceService │ StockService              │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│         Repository Layer (Drizzle)          │
│  Migrations │ Transactions │ Indexes        │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│               SQLite Database               │
│   C:\ProgramData\MediBill\data\            │
└─────────────────────────────────────────────┘
```

---

## 3. Project Structure

```
D:\Projects\MediBillGST\
│
├── apps/
│   └── server/                    # Node.js + Fastify backend
│       ├── src/
│       │   ├── index.ts           # Fastify app entry
│       │   ├── db/
│       │   │   ├── index.ts       # Drizzle + SQLite connection
│       │   │   ├── schema/
│       │   │   │   └── index.ts   # All table definitions
│       │   │   └── migrations/
│       │   │       └── 0000_init.sql
│       │   ├── lib/
│       │   │   └── auth.ts        # Password hashing, sessions
│       │   ├── plugins/
│       │   │   └── auth.ts        # Fastify auth guard middleware
│       │   └── routes/
│       │       ├── auth.ts        # Login/logout/register
│       │       ├── medicines.ts   # Medicine CRUD + barcode search
│       │       ├── inventory.ts    # Batch management + FEFO
│       │       ├── invoices.ts    # Billing + sales returns
│       │       ├── purchases.ts   # Purchase bills + returns
│       │       ├── customers.ts   # Customer CRUD + ledger
│       │       ├── suppliers.ts   # Supplier CRUD + ledger
│       │       ├── doctors.ts     # Doctor CRUD
│       │       ├── payments.ts    # Payment recording
│       │       ├── reports.ts     # Sales/purchase/inventory reports
│       │       ├── dashboard.ts   # Dashboard KPIs
│       │       ├── settings.ts    # App configuration
│       │       └── backup.ts      # Local backup + restore
│       ├── drizzle.config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                    # Shared TypeScript types
│       └── src/
│           └── index.ts           # API types, interfaces
│
├── docs/                          # Architecture documentation
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── BACKUP.md
│   └── ROADMAP.md
│
└── src/                           # React frontend (existing)
    ├── lib/
    │   ├── api.ts                 # REST API client (replaces Convex SDK)
    │   └── utils.ts
    ├── pages/                     # All page components
    ├── components/                 # UI components
    ├── hooks/                     # React hooks
    ├── main.tsx                   # React Router setup
    └── convex/                    # OLD — Convex backend (being removed)
```

---

## 4. Key Design Decisions

### 4.1 Batch-Aware Inventory

Pharmacy inventory is managed at the **batch level**, not the medicine level. Every batch has:
- Unique batch number
- Expiry date
- MRP (Maximum Retail Price)
- Purchase price
- Selling price
- Quantity

This allows accurate expiry tracking and FEFO (First Expiry, First Out) dispensing.

### 4.2 Inventory Transaction Log

Every stock movement is recorded as an `inventory_transactions` row. Stock is **never modified directly** — every change goes through a transaction record. This creates a complete audit trail.

### 4.3 FEFO (First Expiry, First Out)

When dispensing, the system automatically selects batches with the earliest expiry date first, ignoring expired batches. This is implemented in `inventory.ts` (`selectBatchesFEFO`).

### 4.4 Tax Architecture

GST rates are stored per medicine and snapshotted at invoice creation time. Historical invoices never change even if tax rates are updated. The `tax_config` table allows HSN-code-based GST rate lookup.

### 4.5 Invoice Numbering

Configurable format (default: `MB-YYYY-NNNNNN`). Invoice numbers are never reused after cancellation. The format is stored in the `settings` table.

### 4.6 Session Management

Sessions are stored in SQLite with httpOnly cookies. Tokens are 32-character nanoids. Sessions expire after 7 days.

### 4.7 Backup Strategy

- **Daily local backups**: Automatic, stored in `C:\ProgramData\MediBill\backups\daily\`
- **Weekly cloud backups**: Optional, encrypted before upload
- **30-day retention** for daily backups
- **Backup verification** before any restore

---

## 5. Security Model

- Backend binds to `127.0.0.1` only — no network exposure
- Passwords hashed with Argon2 (never stored in plaintext)
- Session tokens: 32-char nanoid, httpOnly cookie, 7-day expiry
- All API inputs validated with Zod schemas
- Parameterized queries (Drizzle handles SQL injection prevention)
- Role-based permissions checked server-side on every mutation
- Audit log for all sensitive operations
- Backup encryption key derived from user passphrase (PBKDF2)

---

## 6. Roles and Permissions

| Role | Capabilities |
|------|-------------|
| `admin` | Full access: users, settings, all modules |
| `pharmacist` | Billing, inventory, customers, suppliers, reports |
| `cashier` | Billing only, limited customer functions |

---

## 7. Data Flow: Complete Sale

```
1. POS screen receives barcode scan or medicine search
2. Server returns medicine + available batches (FEFO-ordered)
3. User confirms selection and quantity
4. Frontend sends POST /api/invoices with all line items
5. Backend transaction:
   a. Generate invoice number
   b. Create invoice row
   c. Create invoice_items rows
   d. For each item: select FEFO batches, deduct stock
   e. Record inventory_transactions for each batch deduction
   f. Record payment (if amount paid)
   g. Update customer balance (if credit)
   h. Log activity
6. If any step fails: entire transaction rolls back
7. Return invoice data to frontend
8. Frontend prints invoice
```

---

## 8. Offline Operation

All MediBill operations work without internet:
- Authentication (local session)
- Billing / POS
- Medicine search
- Inventory management
- Purchase recording
- Returns processing
- Customer / supplier management
- Reports generation
- Invoice printing (local thermal/A4 printer)
- Local backup

Cloud-only operations are isolated:
- Weekly cloud backup upload
- Application update check

---

## 9. Development Commands

```bash
# Start full development environment (frontend + backend)
npm run dev

# Start only frontend
npm run dev:web

# Start only backend
npm run dev:server

# Push database schema
npm run db:push

# Run migrations
npm run db:migrate

# Build production frontend
npm run build

# Build production backend
npm run build:server
```

---

## 10. Migration Strategy

When the database schema needs to change:
1. Create a new migration file in `apps/server/src/db/migrations/`
2. Run `npm run db:migrate` to apply
3. Never modify production database directly
4. Keep migrations version-controlled
