import Fastify from "fastify";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import { join } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";

// Ensure data directory exists
const DATA_DIR = process.env.DATA_DIR ?? join(process.env.PROGRAM_DATA ?? "C:\\ProgramData\\MediBill", "data");
const DB_DIR = join(DATA_DIR, "data");
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const fastify = Fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty",
      options: { translateTime: "SYS:standard", ignore: "pid,hostname" },
    },
  },
  trustProxy: false,
});

await fastify.register(helmet, { contentSecurityPolicy: false });
await fastify.register(compress);
await fastify.register(cors, {
  origin: true,
  credentials: true,
  // Default allowedMethods for @fastify/cors is only GET,HEAD,POST — without
  // DELETE (and PUT/PATCH) here, the browser's CORS preflight rejects delete
  // and update calls, surfacing as "Failed to delete ..." despite the server
  // handling them correctly.
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
await fastify.register(formbody);
// Cast: @fastify/cookie's plugin types don't match fastify v5's register
// overloads (known typing drift); runtime behavior is unaffected.
await fastify.register(cookie as any, { parseOptions: {} });
// Empty JSON bodies are legitimate (bodyless POSTs like logout / hold / retry).
// Fastify's built-in parser rejects them with FST_ERR_CTP_EMPTY_JSON_BODY, so
// swap in a parser that treats an empty payload as {} and keeps normal JSON
// parsing (including error reporting) for everything else.
fastify.removeContentTypeParser("application/json");
fastify.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (_req, body, done) => {
    const raw = typeof body === "string" ? body.trim() : "";
    if (!raw) return done(null, {});
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);
// Rate limiting.
//
// MediBill is a local-first, single-user app that binds to 127.0.0.1, but the
// app is also reached remotely through a tunnel (cloudflared/ngrok). In that
// topology EVERY remote request arrives from the tunnel's own loopback
// connection, so `req.ip` is 127.0.0.1 for all users and a low limit becomes a
// single shared bucket: one active user typing in medicine search (1 request
// per search) plus normal page loads could exhaust 100 req/min and surface
// unrelated "Rate limit exceeded" errors.
//
// The limiter is kept as a safety net against runaway clients, but sized for
// real interactive use. Override with RATE_LIMIT_MAX / RATE_LIMIT_WINDOW.
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? "2000", 10);
const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW ?? "1 minute";
await fastify.register(rateLimit, {
  max: RATE_LIMIT_MAX,
  timeWindow: RATE_LIMIT_WINDOW,
  keyGenerator: (req: any) => req.ip,
  // Don't count CORS preflights — they carry no work and would otherwise
  // consume half the budget for cross-origin (tunneled) traffic.
  allowList: (req: any) => req.method === "OPTIONS",
});

// Request-id propagation (Task 0 foundation): echo client-supplied
// X-Request-Id, or generate one so logs/workers can correlate requests.
// NOTE: must use onSend (not onRequest) — mutating reply headers inside an
// async onRequest hook hangs Fastify's inject() light-my-request path.
fastify.addHook("onSend", async (request: any, reply: any, payload: any) => {
  const incoming = request.headers?.["x-request-id"];
  const requestId =
    (Array.isArray(incoming) ? incoming[0] : incoming) ??
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  request.requestId = requestId;
  reply.header("x-request-id", requestId);
  return payload;
});

// Import routes
import authRoutes from "./routes/auth.js";
import { genericCorsHook } from "./routes/_hooks.js";
import medicineRoutes from "./routes/medicines.js";
import customerRoutes from "./routes/customers.js";
import supplierRoutes from "./routes/suppliers.js";
import invoiceRoutes from "./routes/invoices.js";
import purchaseRoutes from "./routes/purchases.js";
import purchaseReturnRoutes from "./routes/purchaseReturns.js";
import inventoryRoutes from "./routes/inventory.js";
import paymentRoutes from "./routes/payments.js";
import reportRoutes from "./routes/reports.js";
import dashboardRoutes from "./routes/dashboard.js";
import settingsRoutes from "./routes/settings.js";
import expiryPolicyRoutes from "./routes/expiryPolicies.js";
import backupRoutes from "./routes/backup.js";
import doctorRoutes from "./routes/doctors.js";
import returnsRoutes from "./routes/returns.js";
import refillRoutes from "./routes/refills.js";
import catalogOverrideRoutes from "./routes/catalogOverrides.js";
import catalogAdditionRoutes from "./routes/catalogAdditions.js";
import catalogRoutes from "./routes/catalog.js";
import outboxRoutes from "./routes/outbox.js";
import purchaseImportRoutes from "./routes/purchaseImports.js";
import productIntelligenceRoutes from "./routes/productIntelligence.js";
import procurementRoutes from "./routes/procurement.js";
import fileRoutes from "./routes/files.js";
import prescriptionRoutes from "./routes/prescriptions.js";
import stockAuditRoutes from "./routes/stockAudits.js";
import labelRoutes from "./routes/labels.js";
import messageRoutes from "./routes/messages.js";
import customerEngagementRoutes from "./routes/customerEngagement.js";
import accountingRoutes from "./routes/accounting.js";
import reconciliationRoutes from "./routes/reconciliation.js";
import complianceRoutes from "./routes/compliance.js";
import customerOrderRoutes from "./routes/customerOrders.js";
import publicOrderRoutes from "./routes/publicOrders.js";
import deviceRoutes from "./routes/devices.js";
import syncRoutes from "./routes/sync.js";
import dataMigrationRoutes from "./routes/dataMigrations.js";
import bulkBillRoutes from "./routes/bulkBills.js";
import integrationRoutes from "./routes/integrations.js";
import scheduledReportRoutes from "./routes/scheduledReports.js";
import expenseRoutes from "./routes/expenses.js";
import staffRoutes from "./routes/staff.js";
import orderbookRoutes from "./routes/orderbook.js";
import { warmCatalog } from "./catalog/db.js";

// Health check
fastify.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString(), version: "1.0.0" }));

// Wrap each API route with CORS preflight support
const apiRoutes: [any, string][] = [
  [authRoutes, "/api/auth"],
  [medicineRoutes, "/api/medicines"],
  [customerRoutes, "/api/customers"],
  [supplierRoutes, "/api/suppliers"],
  [invoiceRoutes, "/api/invoices"],
  [purchaseRoutes, "/api/purchases"],
  [purchaseReturnRoutes, "/api/purchase-returns"],
  [inventoryRoutes, "/api/inventory"],
  [paymentRoutes, "/api/payments"],
  [reportRoutes, "/api/reports"],
  [dashboardRoutes, "/api/dashboard"],
  [settingsRoutes, "/api/settings"],
  [expiryPolicyRoutes, "/api/expiry-policy"],
  [backupRoutes, "/api/backup"],
  [doctorRoutes, "/api/doctors"],
  [returnsRoutes, "/api/returns"],
  [refillRoutes, "/api/refills"],
  [catalogOverrideRoutes, "/api/catalog-overrides"],
  [catalogAdditionRoutes, "/api/catalog-additions"],
  [catalogRoutes, "/api/catalog"],
  [outboxRoutes, "/api/outbox"],
  [purchaseImportRoutes, "/api/purchase-imports"],
  [productIntelligenceRoutes, "/api/product-intelligence"],
  [procurementRoutes, "/api/procurement"],
  [fileRoutes, "/api/files"],
  [prescriptionRoutes, "/api/prescriptions"],
  [stockAuditRoutes, "/api/stock-audits"],
  [labelRoutes, "/api/labels"],
  [messageRoutes, "/api/messages"],
  [customerEngagementRoutes, "/api/customer-engagement"],
  [accountingRoutes, "/api/accounting"],
  [reconciliationRoutes, "/api/reconciliation"],
  [complianceRoutes, "/api/compliance"],
  // Task 14 — staff order queue (authGuard inside the route) and the
  // PUBLIC ordering endpoints (no preHandler → unauthenticated access is
  // intentional; the global rate limiter above still applies).
  [customerOrderRoutes, "/api/orders"],
  [publicOrderRoutes, "/api/public"],
  // Task 15 — device registry / monitoring + offline sync journal
  [deviceRoutes, "/api/devices"],
  [syncRoutes, "/api/sync"],
  // Task 16 — full data migration (customers/suppliers/medicines/opening stock)
  [dataMigrationRoutes, "/api/data-migrations"],
  // Task 16 — bulk bill edits (filter + preview diff + confirmed commit)
  [bulkBillRoutes, "/api/bulk-bills"],
  // Task 17 — Integrations Center (provider registry, encrypted config)
  [integrationRoutes, "/api/integrations"],
  // Task 17 — scheduled reports (CSV generation + outbox-backed delivery)
  [scheduledReportRoutes, "/api/scheduled-reports"],
  // Business expenses (expense register with payees, item lines and GST split)
  [expenseRoutes, "/api/expenses"],
  // Staff & Access — the roster of the caller's store (admin-only)
  [staffRoutes, "/api/staff"],
  // Orderbook — distributor ordering workspace (POs, cart, shortbook)
  [orderbookRoutes, "/api/orderbook"],
];

for (const [routes, prefix] of apiRoutes) {
  await fastify.register(async (app) => {
    await genericCorsHook(app);
    await app.register(routes);
  }, { prefix });
}

// Serve frontend build when it exists
// Vite root is the repo root, so the build lands in <repo>/dist (not apps/web/dist).
const frontendDistCandidates = [
  process.env.FRONTEND_DIST,
  join(__dirname, "../../../dist"), // <repo>/dist          (src/index.ts or dist/index.js)
  join(__dirname, "../../web/dist"), // <repo>/apps/web/dist (legacy layout)
].filter(Boolean) as string[];

const frontendDist = frontendDistCandidates.find((p) =>
  existsSync(join(p, "index.html"))
);

if (frontendDist) {
  const staticImport = await import("@fastify/static");
  const FastifyStatic = staticImport.default;
  await fastify.register(FastifyStatic as any, { root: frontendDist, prefix: "/" });

  // SPA fallback via notFoundHandler (avoids the duplicate `GET *` route clash
  // that occurs when combined with @fastify/static's own wildcard route).
  fastify.setNotFoundHandler((request: any, reply: any) => {
    if (request.url.startsWith("/api/")) {
      return reply.status(404).send({ success: false, error: "Route not found" });
    }
    return reply.sendFile("index.html");
  });

  fastify.log.info(`Serving frontend from ${frontendDist}`);
} else {
  fastify.log.info("No frontend build found — API only (run `npm run build` for SPA)");
}

// Global error handler
fastify.setErrorHandler((error: any, request: any, reply: any) => {
  fastify.log.error(error);
  if (error.validation) {
    return reply.status(400).send({ success: false, error: "Validation error", details: error.validation });
  }
  return reply.status(error.statusCode ?? 500).send({ success: false, error: error.message ?? "Internal server error" });
});

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "127.0.0.1";

try {
  await fastify.listen({ port: PORT, host: HOST });
  // Build/verify the medicine catalog search index in the background so the
  // first search doesn't pay the one-time cost (and boot isn't blocked).
  warmCatalog();
  // Start backup scheduler after server is listening
  const { startBackupScheduler } = await import("./backup/scheduler.js");
  startBackupScheduler().catch((err) =>
    fastify.log.error("[scheduler] Failed to start backup scheduler:", err)
  );
  // Messaging worker (Task 9) — drains message.send outbox events + refill
  // automation cron. No-op under Vitest / NODE_ENV=test.
  const { startMessagingWorker } = await import("./services/messagingWorker.js");
  try {
    startMessagingWorker();
  } catch (err) {
    fastify.log.error(`[messaging-worker] Failed to start: ${String(err)}`);
  }
  fastify.log.info(`MediBill server running on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err as Error);
  process.exit(1);
}

export default fastify;
