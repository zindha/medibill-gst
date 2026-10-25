import "@vly-ai/integrations";
import { Toaster } from "@/components/ui/sonner";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { StrictMode, lazy, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import "./types/global.d.ts";
import { AuthProvider } from "@/hooks/use-auth";
import { useEnterToNextField } from "@/hooks/useEnterToNextField";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const DashboardLayout = lazy(() => import("./components/DashboardLayout.tsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.tsx"));
const BillingPage = lazy(() => import("./pages/BillingPage.tsx"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage.tsx"));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage.tsx"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage.tsx"));
const ExpenseFormPage = lazy(() => import("./pages/ExpenseFormPage.tsx"));
const CashBankPage = lazy(() => import("./pages/CashBankPage.tsx"));
const PurchasesPage = lazy(() => import("./pages/PurchasesPage.tsx"));
const PurchaseImportPage = lazy(() => import("./pages/PurchaseImportPage.tsx"));
const ProcurementPage = lazy(() => import("./pages/ProcurementPage.tsx"));
const InventoryPage = lazy(() => import("./pages/InventoryPage.tsx"));
const StockAuditPage = lazy(() => import("./pages/StockAuditPage.tsx"));
const LabelsPage = lazy(() => import("./pages/LabelsPage.tsx"));
const CustomersPage = lazy(() => import("./pages/CustomersPage.tsx"));
const DoctorsPage = lazy(() => import("./pages/DoctorsPage.tsx"));
const PrescriptionsPage = lazy(() => import("./pages/PrescriptionsPage.tsx"));
const SuppliersPage = lazy(() => import("./pages/SuppliersPage.tsx"));
const ReportsPage = lazy(() => import("./pages/ReportsPage.tsx"));
const AccountingPage = lazy(() => import("./pages/AccountingPage.tsx"));
const ScanBillPage = lazy(() => import("./pages/ScanBillPage.tsx"));
const SettingsPage = lazy(() => import("./pages/SettingsPage.tsx"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage.tsx"));
const SalesReturnsPage = lazy(() => import("./pages/SalesReturnsPage.tsx"));
const CatalogPage = lazy(() => import("./pages/CatalogPage.tsx"));
const RefillsPage = lazy(() => import("./pages/RefillsPage.tsx"));
const CommunicationsPage = lazy(() => import("./pages/CommunicationsPage.tsx"));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage.tsx"));
const DevicesPage = lazy(() => import("./pages/DevicesPage.tsx"));
const StaffPage = lazy(() => import("./pages/StaffPage.tsx"));
const CompliancePage = lazy(() => import("./pages/CompliancePage.tsx"));
const OrdersPage = lazy(() => import("./pages/OrdersPage.tsx"));
const OrderPortalPage = lazy(() => import("./pages/OrderPortalPage.tsx"));
const MigrationPage = lazy(() => import("./pages/MigrationPage.tsx"));
const BulkBillsPage = lazy(() => import("./pages/BulkBillsPage.tsx"));
const IntegrationsPage = lazy(() => import("./pages/IntegrationsPage.tsx"));
const ScheduledReportsPage = lazy(() => import("./pages/ScheduledReportsPage.tsx"));
const OrderbookDashboardPage = lazy(() => import("./pages/orderbook/OrderbookDashboardPage.tsx"));
const OrderbookDistributorsPage = lazy(() => import("./pages/orderbook/OrderbookDistributorsPage.tsx"));
const OrderbookDistributorDetailPage = lazy(
  () => import("./pages/orderbook/OrderbookDistributorDetailPage.tsx")
);
const OrderbookProductListPage = lazy(() => import("./pages/orderbook/OrderbookProductListPage.tsx"));
const OrderbookAlreadyToOrderPage = lazy(
  () => import("./pages/orderbook/OrderbookAlreadyToOrderPage.tsx")
);
const OrderbookPurchaseOrdersPage = lazy(
  () => import("./pages/orderbook/OrderbookPurchaseOrdersPage.tsx")
);
const OrderbookPoDetailPage = lazy(() => import("./pages/orderbook/OrderbookPoDetailPage.tsx"));
const OrderbookShortbookPage = lazy(() => import("./pages/orderbook/OrderbookShortbookPage.tsx"));
const OrderbookCartPage = lazy(() => import("./pages/orderbook/OrderbookCartPage.tsx"));
const OrderbookOrderDetailPage = lazy(() => import("./pages/orderbook/OrderbookOrderDetailPage.tsx"));
const OrderbookAnalysisPage = lazy(() => import("./pages/orderbook/OrderbookAnalysisPage.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
    </div>
  );
}

function RouteSyncer() {
  const location = useLocation();
  useEnterToNextField();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VlyToolbar />
    <InstrumentationProvider>
      <BrowserRouter>
        <AuthProvider>
          <RouteSyncer />
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground">Skip to content</a>
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<AuthPage redirectAfterAuth="/dashboard" />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              {/* Public customer ordering portal — no auth (storeId in query). */}
              <Route path="/order" element={<OrderPortalPage />} />
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="invoices" element={<InvoicesPage />} />
                <Route path="bulk-bills" element={<BulkBillsPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="expenses" element={<ExpensesPage />} />
                <Route path="expenses/:expenseId" element={<ExpenseFormPage />} />
                <Route path="cash-bank" element={<CashBankPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="stock-audit" element={<StockAuditPage />} />
                <Route path="labels" element={<LabelsPage />} />
                <Route path="purchases" element={<PurchasesPage />} />
                <Route path="purchase-import" element={<PurchaseImportPage />} />
                <Route path="procurement" element={<ProcurementPage />} />
                <Route path="orderbook" element={<OrderbookDashboardPage />} />
                <Route path="orderbook/distributors" element={<OrderbookDistributorsPage />} />
                <Route
                  path="orderbook/distributors/:distributorId"
                  element={<OrderbookDistributorDetailPage />}
                />
                <Route path="orderbook/products" element={<OrderbookProductListPage />} />
                <Route path="orderbook/already-to-order" element={<OrderbookAlreadyToOrderPage />} />
                <Route path="orderbook/purchase-orders" element={<OrderbookPurchaseOrdersPage />} />
                <Route path="orderbook/pos/:poId" element={<OrderbookPoDetailPage />} />
                <Route path="orderbook/shortbook" element={<OrderbookShortbookPage />} />
                <Route path="orderbook/cart" element={<OrderbookCartPage />} />
                <Route path="orderbook/orders/:orderId" element={<OrderbookOrderDetailPage />} />
                <Route path="orderbook/analysis" element={<OrderbookAnalysisPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="doctors" element={<DoctorsPage />} />
                <Route path="prescriptions" element={<PrescriptionsPage />} />
                <Route path="suppliers" element={<SuppliersPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="scheduled-reports" element={<ScheduledReportsPage />} />
                <Route path="compliance" element={<CompliancePage />} />
                <Route path="accounting" element={<AccountingPage />} />
                <Route path="catalog" element={<CatalogPage />} />
                <Route path="scan" element={<ScanBillPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="returns" element={<SalesReturnsPage />} />
                <Route path="refills" element={<RefillsPage />} />
                <Route path="communications" element={<CommunicationsPage />} />
                <Route path="campaigns" element={<CampaignsPage />} />
                <Route path="devices" element={<DevicesPage />} />
                <Route path="staff" element={<StaffPage />} />
                <Route path="migration" element={<MigrationPage />} />
                <Route path="integrations" element={<IntegrationsPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
        <Toaster />
      </BrowserRouter>
    </InstrumentationProvider>
  </StrictMode>,
);
