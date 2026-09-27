# Graph Report - MediBillGST  (2026-08-30)

## Corpus Check
- 238 files · ~137,640 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3700 nodes · 10113 edges · 224 communities (130 shown, 82 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 831 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- framer-motion-BE0yDnp4.js
- index-CWVDvDf0.js
- cn
- ui/index.ts
- InventoryPage.tsx
- rh
- react-vendor-DKOj5dwI.js
- radix-ui-D-DShXZx.js
- BillingPage-BefZp7ty.js
- Ln
- Oe
- Kt
- nu
- api.ts
- Jc
- n
- schema/index.ts
- ow
- generateId
- Hc
- MediBill — Windows Installation Guide
- u
- n
- gC
- DashboardLayout-DaRf6mzD.js
- index-DrLFqkzw.js
- server/src/index.ts
- SettingsPage-CeTxBP0C.js
- .error
- Kc
- Xp
- backup.ts
- et
- InventoryPage-CriTc_Ej.js
- dependencies
- routes/invoices.ts
- o
- vt
- wc
- dT
- oa
- getActiveStore
- r
- devDependencies
- zh
- compilerOptions
- ua
- server.js
- wA
- Ri
- main.tsx
- At
- users.ts
- compilerOptions
- schema.ts
- ec
- hA
- compilerOptions
- compilerOptions
- c
- api.js
- lib/auth.ts
- components.json
- InvoicesPage-DxdmmDWu.js
- instrumentation.tsx
- devDependencies
- w
- scripts
- nl
- dependencies
- What You Must Do When Invoked
- Je
- shared/src/index.ts
- index.d.ts
- Xt
- scripts
- carousel.tsx
- MediBill — Architecture Document
- vl
- YA
- api.d.ts
- vly-toolbar-readonly.tsx
- chart.tsx
- transform-medicine-data.ts
- authGuard
- toggle-group.tsx
- it
- convex/customers.ts
- convex/payments.ts
- server.d.ts
- billOcr.ts
- form.tsx
- shared/package.json
- $
- catalogOverrides.ts
- convex/invoices.ts
- tsconfig.json
- convex.json
- ScanBillPage-CJZ33GAl.js
- @convex-dev/auth
- zl
- i
- @oslojs/crypto
- @radix-ui/react-aspect-ratio
- Ve
- date-fns
- embla-carousel-react
- framer-motion
- t
- @hookform/resolvers
- @radix-ui/react-dialog
- vaul
- lucide-react
- main.ts
- next-themes
- convex
- N
- ah
- db/index.ts
- input-group.tsx
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- package.json
- @radix-ui/react-hover-card
- class-variance-authority
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- clsx
- eslint
- @radix-ui/react-radio-group
- @radix-ui/react-scroll-area
- eslint-config-prettier
- @radix-ui/react-separator
- eslint-plugin-react-hooks
- @radix-ui/react-slot
- @radix-ui/react-switch
- input-otp
- @radix-ui/react-toggle
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- @jridgewell/trace-mapping
- react-day-picker
- react-dom
- react-hook-form
- motion-dom
- react-resizable-panels
- react-router
- recharts
- sonner
- tailwind-merge
- tailwindcss
- @tailwindcss/vite
- @radix-ui/react-accordion
- @radix-ui/react-avatar
- zod
- @zumer/snapdom
- vly-integrations.ts
- ce
- he
- Tables
- @radix-ui/react-dropdown-menu
- MediBill
- _a
- MediBill — Backup & Restore
- VLY Integrations
- o
- @radix-ui/react-label
- @radix-ui/react-popover
- Inventory / Batches
- graphify reference: extra exports and benchmark
- MediBill — API Reference
- Invoices
- Medicines
- graphify reference: query, path, explain
- Authentication
- Customers
- Reports
- Settings
- Suppliers
- server/package.json
- Backup
- Doctors
- @radix-ui/react-progress
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- Purchases
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- AGENTS.md
- better-sqlite3
- drizzle-orm
- @fastify/compress
- @fastify/cookie
- @fastify/cors
- @fastify/rate-limit
- @fastify/static
- pino-pretty
- extraction-spec.md
- @radix-ui/react-select
- @radix-ui/react-slider
- @radix-ui/react-tabs
- react
- react-intersection-observer
- tesseract.js
- prettier
- tw-animate-css
- @types/node
- @types/react-dom
- typescript
- typescript-eslint
- @vitejs/plugin-react

## God Nodes (most connected - your core abstractions)
1. `dT()` - 372 edges
2. `cn()` - 273 edges
3. `o()` - 90 edges
4. `getActiveStore()` - 89 edges
5. `_` - 62 edges
6. `u()` - 55 edges
7. `generateId()` - 47 edges
8. `$` - 47 edges
9. `j()` - 46 edges
10. `r()` - 46 edges

## Surprising Connections (you probably didn't know these)
- `ql()` --indirect_call--> `Jl()`  [INFERRED]
  isolate/assets/framer-motion-BE0yDnp4.js → isolate/assets/radix-ui-D-DShXZx.js
- `cx()` --indirect_call--> `hr()`  [INFERRED]
  isolate/assets/index-CWVDvDf0.js → isolate/assets/radix-ui-D-DShXZx.js
- `authRoutes()` --indirect_call--> `authGuard()`  [INFERRED]
  apps/server/src/routes/auth.ts → apps/server/src/plugins/auth.ts
- `backupRoutes()` --indirect_call--> `authGuard()`  [INFERRED]
  apps/server/src/routes/backup.ts → apps/server/src/plugins/auth.ts
- `customerRoutes()` --indirect_call--> `authGuard()`  [INFERRED]
  apps/server/src/routes/customers.ts → apps/server/src/plugins/auth.ts

## Import Cycles
- None detected.

## Communities (224 total, 82 thin omitted)

### Community 0 - "framer-motion-BE0yDnp4.js"
Cohesion: 0.02
Nodes (117): aa(), af, as, ba(), bc(), bi, Br(), bs() (+109 more)

### Community 1 - "index-CWVDvDf0.js"
Cohesion: 0.03
Nodes (103): $a(), aA, Ac(), Av, Aw(), ay(), bv, bw() (+95 more)

### Community 2 - "cn"
Cohesion: 0.03
Nodes (105): Alert(), AlertDescription(), AlertTitle(), alertVariants, Avatar(), AvatarFallback(), AvatarImage(), ButtonGroup() (+97 more)

### Community 3 - "ui/index.ts"
Cohesion: 0.03
Nodes (116): Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent() (+108 more)

### Community 4 - "InventoryPage.tsx"
Cohesion: 0.09
Nodes (62): AnimatedNumber(), AnimatedNumberProps, BarcodeCameraScanner(), BarcodeCameraScannerProps, EmptyState(), EmptyStateAction, EmptyStateProps, GSTInvoiceTemplate() (+54 more)

### Community 5 - "rh"
Cohesion: 0.12
Nodes (24): ji(), Kr(), Rn(), bh(), Bi(), fd(), Fi(), Is() (+16 more)

### Community 6 - "react-vendor-DKOj5dwI.js"
Cohesion: 0.09
Nodes (25): It(), at(), Bt(), er(), Gt(), Ht(), jt(), kt() (+17 more)

### Community 7 - "radix-ui-D-DShXZx.js"
Cohesion: 0.04
Nodes (44): df, lr, _r(), An(), bc, bl(), br(), Cl() (+36 more)

### Community 8 - "BillingPage-BefZp7ty.js"
Cohesion: 0.12
Nodes (42): ds, hs, us, xs, d(), j(), a(), yf (+34 more)

### Community 9 - "Ln"
Cohesion: 0.07
Nodes (14): ao(), Cn(), fa(), fu(), H(), hu, Ln, pi() (+6 more)

### Community 10 - "Oe"
Cohesion: 0.11
Nodes (31): bd(), Bt(), co(), Do(), du(), ea(), Fh(), g0() (+23 more)

### Community 11 - "Kt"
Cohesion: 0.05
Nodes (15): Cr(), Dn, ea(), Fi(), ft(), Hi(), ja, Kt (+7 more)

### Community 12 - "nu"
Cohesion: 0.06
Nodes (20): Ai(), a(), An, bt(), Cl, Er(), ic(), ju() (+12 more)

### Community 13 - "api.ts"
Cohesion: 0.04
Nodes (73): DashboardLayout(), mobileItems, navGroups, NavItem, NavItemLink(), LogoDropdown(), StoreSwitcher(), Badge() (+65 more)

### Community 14 - "Jc"
Cohesion: 0.08
Nodes (43): af(), aS(), bp(), cS(), Eg(), Ew(), gS(), h() (+35 more)

### Community 15 - "n"
Cohesion: 0.06
Nodes (33): ac(), au, bl(), bn(), bu(), co(), cs(), cu (+25 more)

### Community 16 - "schema/index.ts"
Cohesion: 0.04
Nodes (47): Batch, CatalogOverride, CreditAccount, Customer, Doctor, GST_RATES, GstRate, InventoryTransaction (+39 more)

### Community 17 - "ow"
Cohesion: 0.09
Nodes (44): ct, jr(), Xe(), Bb(), bm(), Bn(), Ct(), dh() (+36 more)

### Community 18 - "generateId"
Cohesion: 0.10
Nodes (28): BackupHistory, batches, creditAccounts, generateId(), inventoryTransactions, invoiceItems, medicines, prescriptions (+20 more)

### Community 19 - "Hc"
Cohesion: 0.08
Nodes (7): _c(), ap(), fl(), Hc(), ip(), NC, Sc()

### Community 20 - "MediBill — Windows Installation Guide"
Cohesion: 0.06
Nodes (33): Automatic Updates (Future), "Backup failed", "Cannot connect to server", "Database is locked", Environment Variables, First Launch, Installation Options, Installer Walkthrough (+25 more)

### Community 21 - "u"
Cohesion: 0.20
Nodes (41): De(), ms, me(), xe(), le(), A, E(), T() (+33 more)

### Community 22 - "n"
Cohesion: 0.11
Nodes (53): am(), Br(), de(), e0(), Eb(), Fr(), gb(), ge() (+45 more)

### Community 23 - "gC"
Cohesion: 0.25
Nodes (5): Fc(), gC(), Og(), Vp(), zg()

### Community 24 - "DashboardLayout-DaRf6mzD.js"
Cohesion: 0.08
Nodes (33): e, h, A, be(), ce, de, fe(), ge() (+25 more)

### Community 25 - "index-DrLFqkzw.js"
Cohesion: 0.13
Nodes (25): o(), ir(), ar(), Be(), cr(), dr(), Fe(), fr() (+17 more)

### Community 26 - "server/src/index.ts"
Cohesion: 0.10
Nodes (25): ActivityLog, customers, INVENTORY_TRANSACTION_TYPES, invoices, payments, purchaseBillItems, purchaseBills, suppliers (+17 more)

### Community 27 - "SettingsPage-CeTxBP0C.js"
Cohesion: 0.11
Nodes (33): bt(), ct(), $e, Ge, it(), lt(), qe, rt() (+25 more)

### Community 28 - ".error"
Cohesion: 0.09
Nodes (13): dy, eA(), gA, gf(), mf(), mr, oA(), pA() (+5 more)

### Community 29 - "Kc"
Cohesion: 0.05
Nodes (22): Ba(), Cn(), cy(), dC(), dl(), Ec(), fi, Ft() (+14 more)

### Community 30 - "Xp"
Cohesion: 0.08
Nodes (26): _1(), cw(), Ep(), ex(), Hp(), ja(), jg(), k1() (+18 more)

### Community 31 - "backup.ts"
Cohesion: 0.10
Nodes (33): buildS3Client(), CLOUD_KEYS, CloudConfig, CloudStatus, encryptFile(), getCloudConfig(), getCloudStatus(), getSetting() (+25 more)

### Community 32 - "et"
Cohesion: 0.10
Nodes (37): Ae(), et(), ba(), bo(), cm(), dt(), Ei(), el() (+29 more)

### Community 33 - "InventoryPage-CriTc_Ej.js"
Cohesion: 0.09
Nodes (30): c, f(), aa(), ea(), he, Je, Ke, sa() (+22 more)

### Community 34 - "dependencies"
Cohesion: 0.11
Nodes (19): dependencies, argon2, @aws-sdk/client-s3, fastify, @fastify/formbody, @fastify/helmet, nanoid, node-cron (+11 more)

### Community 35 - "routes/invoices.ts"
Cohesion: 0.33
Nodes (8): invoiceBatchAllocations, selectBatchesFEFO(), createInvoiceSchema, generateInvoiceNumber(), invoiceItemSchema, invoiceRoutes(), normalizePaymentMode(), roundMoney()

### Community 36 - "o"
Cohesion: 0.09
Nodes (34): Mt(), ao(), bl(), bu(), cs(), db(), Em(), Er() (+26 more)

### Community 37 - "vt"
Cohesion: 0.11
Nodes (9): _e, ef(), kc(), No, of(), sf, tf(), vt (+1 more)

### Community 39 - "dT"
Cohesion: 0.05
Nodes (73): gr, zr(), dT(), _0(), Af(), ag(), Ai(), bs() (+65 more)

### Community 40 - "oa"
Cohesion: 0.08
Nodes (21): al(), l(), At(), eu(), fo(), gs(), _i(), In() (+13 more)

### Community 41 - "getActiveStore"
Cohesion: 0.11
Nodes (28): create, get, getExpiringSoon, getLowStock, getSubstitutes, list, remove, search (+20 more)

### Community 42 - "r"
Cohesion: 0.10
Nodes (26): a1(), Ax(), bx(), cg(), r(), di(), dr(), e1() (+18 more)

### Community 43 - "devDependencies"
Cohesion: 0.15
Nodes (13): concurrently, @eslint/js, eslint-plugin-react-refresh, globals, devDependencies, concurrently, @eslint/js, eslint-plugin-react-refresh (+5 more)

### Community 44 - "zh"
Cohesion: 0.11
Nodes (27): ga, An(), dd(), Dl(), h0(), hd(), hn(), ji() (+19 more)

### Community 45 - "compilerOptions"
Cohesion: 0.07
Nodes (28): DOM.Iterable, ES2020, vly-toolbar-readonly.tsx, compilerOptions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx (+20 more)

### Community 46 - "ua"
Cohesion: 0.09
Nodes (30): k(), wt, zs(), Cr(), dn(), dt(), Et(), fe() (+22 more)

### Community 47 - "server.js"
Cohesion: 0.10
Nodes (22): create, getByEntity, list, getByCustomer, getBySupplier, list, update, create (+14 more)

### Community 48 - "wA"
Cohesion: 0.21
Nodes (4): mi(), pg(), wA(), xr

### Community 49 - "Ri"
Cohesion: 0.19
Nodes (10): Ri(), a(), c(), ii(), L(), o(), pr(), r() (+2 more)

### Community 50 - "main.tsx"
Cohesion: 0.07
Nodes (27): CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader(), CardTitle(), Toaster(), AuthPage (+19 more)

### Community 51 - "At"
Cohesion: 0.18
Nodes (26): il, A0(), al(), At(), C0(), dc(), ds(), fc() (+18 more)

### Community 52 - "users.ts"
Cohesion: 0.12
Nodes (22): activeStore, addMember, approveJoin, createStore, ensureStore, generateJoinCode(), joinStoreByCode, listMembers (+14 more)

### Community 53 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+14 more)

### Community 54 - "schema.ts"
Cohesion: 0.11
Nodes (19): DataModel, Doc, Id, TableNames, create, generateReturnNo(), get, list (+11 more)

### Community 55 - "ec"
Cohesion: 0.13
Nodes (10): be(), ec(), go(), he(), ma(), mc(), pc(), qo() (+2 more)

### Community 57 - "compilerOptions"
Cohesion: 0.10
Nodes (20): ES2023, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+12 more)

### Community 58 - "compilerOptions"
Cohesion: 0.10
Nodes (19): ./**/*, ES2021, ./_generated, compilerOptions, allowJs, allowSyntheticDefaultImports, forceConsistentCasingInFileNames, isolatedModules (+11 more)

### Community 59 - "c"
Cohesion: 0.08
Nodes (55): x(), b1(), Bo(), bS(), c1(), cT(), _e(), ee() (+47 more)

### Community 60 - "api.js"
Cohesion: 0.50
Nodes (3): api, components, internal

### Community 61 - "lib/auth.ts"
Cohesion: 0.21
Nodes (14): Session, sessions, User, users, authenticateUser(), createSession(), createUser(), deleteSession() (+6 more)

### Community 62 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 63 - "InvoicesPage-DxdmmDWu.js"
Cohesion: 0.05
Nodes (51): x(), c, r, e, o, r, F, H (+43 more)

### Community 64 - "instrumentation.tsx"
Cohesion: 0.14
Nodes (11): Collapsible(), CollapsibleContent(), CollapsibleTrigger(), DialogFooter(), AsyncError, ErrorBoundary, ErrorBoundaryState, GenericError (+3 more)

### Community 65 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, drizzle-kit, tsx, @types/better-sqlite3, @types/node, @types/node-cron, typescript, vitest (+7 more)

### Community 66 - "w"
Cohesion: 0.17
Nodes (25): ar(), L(), p(), st(), W(), Z(), De, be() (+17 more)

### Community 67 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, db:generate, db:migrate, db:push, db:studio, dev, lint (+2 more)

### Community 68 - "nl"
Cohesion: 0.09
Nodes (10): bo(), cc(), el(), fc(), lc(), mo(), nl, qu (+2 more)

### Community 69 - "dependencies"
Cohesion: 0.13
Nodes (15): axios, cmdk, hono, html5-qrcode, dependencies, axios, cmdk, hono (+7 more)

### Community 70 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 71 - "Je"
Cohesion: 0.13
Nodes (24): au(), cu(), eh(), fo(), Hr(), hu(), Id(), iu() (+16 more)

### Community 72 - "shared/src/index.ts"
Cohesion: 0.14
Nodes (14): ApiResponse, Batch, Customer, DashboardKPIs, GstRate, Invoice, InvoiceItem, InvoiceStatus (+6 more)

### Community 73 - "index.d.ts"
Cohesion: 0.14
Nodes (14): ApiResponse, Batch, Customer, DashboardKPIs, GstRate, Invoice, InvoiceItem, InvoiceStatus (+6 more)

### Community 74 - "Xt"
Cohesion: 0.18
Nodes (5): qc, ws(), xo(), Xt(), zo()

### Community 75 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, build:dist, build:installer, build:server, db:migrate, db:push, dev (+7 more)

### Community 76 - "carousel.tsx"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 77 - "MediBill — Architecture Document"
Cohesion: 0.09
Nodes (22): 10. Migration Strategy, 1. Technology Stack, 2. Architecture Layers, 3. Project Structure, 4.1 Batch-Aware Inventory, 4.2 Inventory Transaction Log, 4.3 FEFO (First Expiry, First Out), 4.4 Tax Architecture (+14 more)

### Community 78 - "vl"
Cohesion: 0.18
Nodes (4): gc, Sl, vl(), wl()

### Community 80 - "api.d.ts"
Cohesion: 0.21
Nodes (7): { auth, signIn, signOut, store, isAuthenticated }, emailOtp, http, create, getDueReminders, list, updateStatus

### Community 81 - "vly-toolbar-readonly.tsx"
Cohesion: 0.26
Nodes (9): ComponentInfo, FiberNode, formatReactComponentHierarchy(), getDomSelector(), getReactComponentHierarchy(), getSelectedElementAnnotation(), getSelectedElementsPrompt(), injectHighlightStyle() (+1 more)

### Community 82 - "chart.tsx"
Cohesion: 0.25
Nodes (10): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartStyle(), ChartTooltipContent(), getPayloadConfigFromPayload() (+2 more)

### Community 83 - "transform-medicine-data.ts"
Cohesion: 0.20
Nodes (4): buf, [input, output], rl, seen

### Community 84 - "authGuard"
Cohesion: 0.15
Nodes (14): catalogOverrides, validateSession(), authGuard(), fastify, FastifyReply, FastifyRequest, requireRole(), catalogOverrideRoutes() (+6 more)

### Community 85 - "toggle-group.tsx"
Cohesion: 0.43
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 86 - "it"
Cohesion: 0.17
Nodes (20): ae(), Cr(), de(), He(), r(), t(), I(), it() (+12 more)

### Community 87 - "convex/customers.ts"
Cohesion: 0.25
Nodes (7): create, get, getPurchaseHistory, list, remove, search, update

### Community 88 - "convex/payments.ts"
Cohesion: 0.32
Nodes (7): create, getPendingAmount, getTotals, list, listByInvoice, recomputeInvoiceStatus(), remove

### Community 89 - "server.d.ts"
Cohesion: 0.29
Nodes (6): ActionCtx, DatabaseReader, DatabaseWriter, Env, MutationCtx, QueryCtx

### Community 90 - "billOcr.ts"
Cohesion: 0.33
Nodes (5): ExtractedBillData, ParsedBillItem, parseOcrLineItems(), sanitizeGst(), VALID_GST

### Community 91 - "form.tsx"
Cohesion: 0.23
Nodes (11): FormControl(), FormDescription(), FormField(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext, FormItemContextValue (+3 more)

### Community 92 - "shared/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 93 - "$"
Cohesion: 0.14
Nodes (15): o, s, a, e, $, a, ee, H (+7 more)

### Community 94 - "catalogOverrides.ts"
Cohesion: 0.53
Nodes (5): getOverride(), list, remove, saveGst, setUnavailable

### Community 95 - "convex/invoices.ts"
Cohesion: 0.47
Nodes (5): create, get, getNextInvoiceNo, list, remove

### Community 96 - "tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, paths, files, references

### Community 97 - "convex.json"
Cohesion: 0.40
Nodes (4): aiFiles, enabled, functions, $schema

### Community 98 - "ScanBillPage-CJZ33GAl.js"
Cohesion: 0.14
Nodes (14): a, o, e, o, de, ge(), he(), me (+6 more)

### Community 101 - "i"
Cohesion: 0.07
Nodes (25): aT, BC, by(), eT(), fv(), gt(), iC(), kt() (+17 more)

### Community 104 - "Ve"
Cohesion: 0.22
Nodes (14): Ve(), A(), C(), D(), F(), a(), S(), t() (+6 more)

### Community 108 - "t"
Cohesion: 0.15
Nodes (15): ds(), hs(), Ka(), t(), Li(), ma(), me(), Mr() (+7 more)

### Community 116 - "N"
Cohesion: 0.20
Nodes (14): mi(), N, ve, Zt(), ar(), Ft(), ie(), ir() (+6 more)

### Community 117 - "ah"
Cohesion: 0.24
Nodes (12): ah(), Ch(), Ed(), eo(), eu(), fu(), Jn(), Ld() (+4 more)

### Community 118 - "db/index.ts"
Cohesion: 0.25
Nodes (6): db, DB_PATH, sqlite, doctors, createDoctorSchema, doctorRoutes()

### Community 119 - "input-group.tsx"
Cohesion: 0.28
Nodes (8): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea()

### Community 122 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 157 - "ce"
Cohesion: 0.13
Nodes (42): ce, Dt, ee, jt, Se, ae(), ao(), ba() (+34 more)

### Community 170 - "he"
Cohesion: 0.14
Nodes (15): St, aa(), Ac(), Bu(), Gc(), Hc(), he(), Hu() (+7 more)

### Community 171 - "Tables"
Cohesion: 0.11
Nodes (18): `activity_log`, `backup_history`, `batches`, `customers`, Entity Relationship Diagram, Inventory Transaction Pattern, `inventory_transactions`, `invoice_items` (+10 more)

### Community 173 - "MediBill"
Cohesion: 0.12
Nodes (15): Authentication and authorization, Data model, Environment, Frontend conventions, Getting started, Highlights, MediBill, Project structure (+7 more)

### Community 174 - "_a"
Cohesion: 0.47
Nodes (6): Na(), d0(), ig(), q0(), _a(), za()

### Community 175 - "MediBill — Backup & Restore"
Cohesion: 0.17
Nodes (11): Backup Encryption Details, Backup Health Monitoring, Backup Verification, Daily Local Backup, Data Locations, Disaster Recovery Checklist, Manual Backup, MediBill — Backup & Restore (+3 more)

### Community 176 - "VLY Integrations"
Cohesion: 0.17
Nodes (11): AI Integration, Available Features, Checking Integration Status, Email Integration, Environment Variables, Error Handling, Important Notes, Installation (+3 more)

### Community 177 - "o"
Cohesion: 0.12
Nodes (20): pr, ur(), yc, Ce(), r(), d(), Ie(), is() (+12 more)

### Community 180 - "Inventory / Batches"
Cohesion: 0.20
Nodes (10): GET `/api/inventory/batches/available?medicineId=`, GET `/api/inventory/batches?medicineId=`, GET `/api/inventory/expiry?status=expired|30|60|90`, GET `/api/inventory/low-stock`, GET `/api/inventory/stock`, GET `/api/inventory/transactions`, Inventory / Batches, POST `/api/inventory/adjust` (+2 more)

### Community 181 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 182 - "MediBill — API Reference"
Cohesion: 0.22
Nodes (8): Dashboard, GET `/api/dashboard/kpis`, GET `/api/health`, GET `/api/payments`, Health Check, MediBill — API Reference, Payments, POST `/api/payments`

### Community 183 - "Invoices"
Cohesion: 0.25
Nodes (8): GET `/api/invoices`, GET `/api/invoices/:id`, GET `/api/invoices/number/:invoiceNo`, Invoices, POST `/api/invoices`, POST `/api/invoices/:id/cancel`, POST `/api/invoices/:id/hold`, POST `/api/invoices/:id/recall`

### Community 184 - "Medicines"
Cohesion: 0.29
Nodes (7): DELETE `/api/medicines/:id`, GET `/api/medicines`, GET `/api/medicines/barcode/:barcode`, GET `/api/medicines/:id`, Medicines, POST `/api/medicines`, PUT `/api/medicines/:id`

### Community 185 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 186 - "Authentication"
Cohesion: 0.33
Nodes (6): Authentication, GET `/api/auth/me`, POST `/api/auth/change-password`, POST `/api/auth/login`, POST `/api/auth/logout`, POST `/api/auth/register`

### Community 187 - "Customers"
Cohesion: 0.33
Nodes (6): Customers, GET `/api/customers`, GET `/api/customers/:id`, GET `/api/customers/:id/ledger`, POST `/api/customers`, PUT `/api/customers/:id`

### Community 188 - "Reports"
Cohesion: 0.33
Nodes (6): GET `/api/reports/inventory`, GET `/api/reports/profit`, GET `/api/reports/purchase`, GET `/api/reports/sales`, GET `/api/reports/tax`, Reports

### Community 189 - "Settings"
Cohesion: 0.33
Nodes (6): GET `/api/settings`, GET `/api/settings/invoice-format`, GET `/api/settings/:key`, PUT `/api/settings/invoice-format`, PUT `/api/settings/:key`, Settings

### Community 190 - "Suppliers"
Cohesion: 0.33
Nodes (6): GET `/api/suppliers`, GET `/api/suppliers/:id`, GET `/api/suppliers/:id/ledger`, POST `/api/suppliers`, PUT `/api/suppliers/:id`, Suppliers

### Community 191 - "server/package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 192 - "Backup"
Cohesion: 0.40
Nodes (5): Backup, GET `/api/backup/history`, GET `/api/backup/status`, POST `/api/backup/create`, POST `/api/backup/restore`

### Community 193 - "Doctors"
Cohesion: 0.40
Nodes (5): Doctors, GET `/api/doctors`, GET `/api/doctors/:id`, POST `/api/doctors`, PUT `/api/doctors/:id`

### Community 195 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 196 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 197 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 198 - "Purchases"
Cohesion: 0.50
Nodes (4): GET `/api/purchases`, GET `/api/purchases/:id`, POST `/api/purchases`, Purchases

## Knowledge Gaps
- **828 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+823 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1084 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **82 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dT()` connect `dT` to `et`, `index-CWVDvDf0.js`, `o`, `rh`, `Je`, `BillingPage-BefZp7ty.js`, `Oe`, `zh`, `_a`, `o`, `ow`, `At`, `ah`, `n`, `u`, `c`, `.error`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `Kc()` connect `Kc` to `index-CWVDvDf0.js`, `i`, `Jc`, `u`, `c`, `.error`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `$` connect `$` to `framer-motion-BE0yDnp4.js`, `index-CWVDvDf0.js`, `react-vendor-DKOj5dwI.js`, `radix-ui-D-DShXZx.js`, `BillingPage-BefZp7ty.js`, `u`, `DashboardLayout-DaRf6mzD.js`, `SettingsPage-CeTxBP0C.js`, `InvoicesPage-DxdmmDWu.js`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `dT()` (e.g. with `A0()` and `b0()`) actually correct?**
  _`dT()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `o()` (e.g. with `R0()` and `fx()`) actually correct?**
  _`o()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _828 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `framer-motion-BE0yDnp4.js` be split into smaller, more focused modules?**
  _Cohesion score 0.023135642982971227 - nodes in this community are weakly interconnected._