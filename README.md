# MediBill

MediBill is a modern billing and operations workspace for pharmacies and medical shops in India. It brings GST billing, medicine inventory, purchase tracking, payments, customer credit, and shop reporting into one responsive web application.

## Highlights

- **GST billing** — Create invoices with CGST, SGST, IGST, discounts, HSN codes, payment status, and printable invoice output.
- **Medicine inventory** — Track medicines by batch, quantity, expiry date, barcode, purchase price, selling price, GST rate, and supplier.
- **Large medicine catalog** — Search the bundled `public/medicineCatalog.jsonl` catalog containing more than 243,000 medicine records. The catalog is loaded and searched lazily in the browser.
- **Purchase management** — Record purchase bills, suppliers, line items, and scanned bill data.
- **Bill scanning and OCR** — Upload or photograph purchase bills and extract text with Tesseract.js. Barcode/QR scanning is supported through `html5-qrcode`.
- **Payments and credit accounts** — Track received payments, supplier payments, expenses, paid/unpaid/partial invoices, and customer or supplier credit (`udhar`/`khata`).
- **Shop operations** — Manage customers, doctors, suppliers, prescriptions, sales returns, purchase returns, and refill reminders.
- **Reports and dashboard insights** — View sales, GST, stock health, expiring batches, outstanding credit, recent invoices, and business trends.
- **Multi-store support** — Owners can manage stores and invite members using store join codes.
- **Authentication** — Convex Auth supports email OTP and anonymous users.

## Technology

### Web application

- Vite
- React 19 and TypeScript
- React Router v7
- Tailwind CSS v4
- shadcn/ui and Radix UI primitives
- Framer Motion
- Lucide React
- Recharts
- Convex and Convex Auth

### Supporting server

The repository also contains `apps/server`, a separate Fastify service using SQLite and Drizzle ORM. It provides server-side APIs and persistence used by parts of the application.

- Fastify
- SQLite via `better-sqlite3`
- Drizzle ORM and Drizzle Kit
- Zod validation
- Node cron jobs
- Optional S3 integration

## Project structure

```text
.
├── src/
│   ├── components/       Shared UI and dashboard layout
│   ├── convex/           Convex schema, auth, queries, mutations, and actions
│   ├── data/              Curated medicine data and local data helpers
│   ├── hooks/             React hooks, including authentication and catalog search
│   ├── lib/               API and utility modules
│   └── pages/             Landing, auth, dashboard, billing, inventory, and reports
├── public/
│   └── medicineCatalog.jsonl  Bundled medicine catalog (243,000+ rows)
├── apps/server/           Fastify + SQLite supporting server
├── packaging/             Packaging and installer resources
├── scripts/               Distribution and installer build scripts
├── main.ts                Desktop/runtime entry point used by the project shell
└── vite.config.ts         Vite configuration
```

## Requirements

- Node.js compatible with the installed project toolchain
- [Bun](https://bun.sh/) is the preferred package manager for the frontend workspace
- PowerShell is required for the Windows distribution and installer scripts
- Convex environment variables for connected Convex development

The repository already contains dependencies and environment configuration in the development setup. Do not commit secrets from `.env` or `.env.local`.

## Getting started

Install dependencies with Bun:

```bash
bun install
```

Start both the Vite frontend and supporting server:

```bash
bun run dev
```

The scripts start:

- `vite` for the web application (`bun run dev:web`)
- the Fastify service in `apps/server` (`bun run dev:server`)

To run either side separately:

```bash
bun run dev:web
bun run dev:server
```

Open the Vite URL printed by the dev server. The public landing page is `/`; authentication is available at `/auth`, and the protected workspace begins at `/dashboard`.

## Useful commands

From the repository root:

```bash
bun run build          # Build the frontend and supporting server
bun run build:server   # Build only apps/server
bun run lint           # Run ESLint
bun run format         # Format the repository with Prettier
bun run preview        # Preview the Vite production build
bun run db:migrate     # Run server database migrations
bun run db:push        # Push the server schema to the database
```

For server-specific commands:

```bash
cd apps/server
bun run test
bun run db:generate
bun run db:migrate
bun run db:studio
```

The distribution and installer scripts are Windows PowerShell scripts:

```bash
bun run build:dist
bun run build:installer
bun run package
```

## Authentication and authorization

Authentication is already wired through Convex Auth. Frontend components should use the shared hook:

```tsx
import { useAuth } from "@/hooks/use-auth";

const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();
```

Protected pages redirect unauthenticated users to `/auth`. Business records are associated with the authenticated user and, where applicable, a selected store. Authorization must be enforced in backend queries, mutations, and actions—not only in the UI.

Authentication configuration lives in `src/convex/auth/`, `src/convex/auth.config.ts`, and `src/convex/auth.ts`. The email OTP configuration should not be changed casually because it is part of the existing authentication setup.

## Data model

The Convex schema is defined in `src/convex/schema.ts`. Main business tables include:

- `stores` and `storeMembers`
- `medicines`
- `invoices` and `invoiceItems`
- `purchaseBills`
- `suppliers` and `customers`
- `payments` and `creditAccounts`
- `prescriptions` and `doctors`
- `salesReturns` and `purchaseReturns`
- `refillReminders`
- `activityLog`
- `catalogOverrides`

Convex document IDs use the generated `Id<"TableName">` types. The schema intentionally keeps `schemaValidation: false` to match the current project configuration.

## Routes

The main application routes are:

- `/` — MediBill marketing and product landing page
- `/auth` — Sign in and sign up
- `/onboarding` — Initial store setup
- `/dashboard` — Dashboard overview
- `/dashboard/billing` — Create a new GST bill
- `/dashboard/invoices` — Sales invoices
- `/dashboard/payments` — Payments and credit tracking
- `/dashboard/purchases` — Purchase bills
- `/dashboard/inventory` — Medicine stock and catalog
- `/dashboard/customers` — Customers
- `/dashboard/doctors` — Doctors and clinics
- `/dashboard/suppliers` — Suppliers
- `/dashboard/reports` — Reports and trends
- `/dashboard/scan` — Scan/import a purchase bill
- `/dashboard/returns` — Sales returns
- `/dashboard/settings` — Store and account settings

## Frontend conventions

- Put pages in `src/pages` and reusable components in `src/components`.
- Prefer existing shadcn/ui primitives from `src/components/ui`.
- Use the `@/` import alias for project imports.
- Keep layouts responsive for phone, tablet, and desktop users.
- Use toast notifications through Sonner for user-visible success and error states.
- Use Framer Motion for purposeful transitions and rendering animations.
- Avoid nested cards and unnecessary shadows; use borders and the existing design tokens in `src/index.css`.
- Use the existing auth hook rather than reading authentication state directly.

## Environment

The frontend expects the Convex deployment values configured by the development environment, including:

- `CONVEX_DEPLOYMENT`
- `VITE_CONVEX_URL`

Convex Auth also uses server-side values such as JWKS, `JWT_PRIVATE_KEY`, and `SITE_URL`. Keep local secrets in ignored `.env` files and configure production values in the relevant deployment environment.

## Status

MediBill is an actively developed pharmacy-management application. The main user flows are implemented, while deployment, offline packaging, and supporting-server integration may depend on the environment in which the app is run.
