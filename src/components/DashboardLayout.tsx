import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { devicesApi } from "@/lib/api";
import {
  Activity,
  BadgeCheck,
  Banknote,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarClock,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  ClipboardList,
  Cloud,
  Cross,
  Database,
  FileInput,
  FileText,
  FileUp,
  Files,
  Handshake,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Package,
  Plug,
  Receipt,
  RefreshCcw,
  ScanLine,
  Search,
  Scale,
  Settings,
  ShoppingBag,
  Smartphone,
  Stethoscope,
  Tag,
  Truck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  end?: boolean;
  /**
   * Capability required to see this item — matched against the server's
   * CAPABILITY_MAP via GET /api/devices/me. Only set where the API itself
   * enforces a role gate; items without one are visible to every role.
   */
  capability?: string;
}

// Sidebar mirrors LocalWell's navigation labels/order, mapped onto the existing
// MediBillGST routes. Section headers are kept for scanning density.
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", end: true },
      { to: "/dashboard/invoices", icon: FileText, label: "Invoices" },
      { to: "/dashboard/orders", icon: ShoppingBag, label: "Customer Orders", capability: "orders" },
      { to: "/dashboard/orderbook", icon: Handshake, label: "Orderbook" },
      { to: "/dashboard/reports", icon: BarChart3, label: "Business Reports", capability: "reports" },
      { to: "/dashboard/refills", icon: BellRing, label: "Patient Followups" },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/dashboard/expenses", icon: Receipt, label: "Expenses" },
      { to: "/dashboard/cash-bank", icon: Banknote, label: "Cash and Bank", capability: "reconciliation_view" },
      { to: "/dashboard/payment-accounts", icon: Wallet, label: "Payment Accounts" },
      { to: "/dashboard/payments", icon: Wallet, label: "Payments" },
      { to: "/dashboard/accounting", icon: BookOpen, label: "Accounting", capability: "accounting_view" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { to: "/dashboard/inventory", icon: Package, label: "Stock", capability: "inventory" },
      { to: "/dashboard/billing", icon: FileText, label: "Sales / New Bill", capability: "billing" },
      { to: "/dashboard/purchases", icon: Truck, label: "Purchases", capability: "purchases" },
      { to: "/dashboard/stock-audit", icon: ClipboardCheck, label: "Stock Audit", capability: "stock_audit" },
      { to: "/dashboard/returns", icon: RefreshCcw, label: "Returns" },
      { to: "/dashboard/labels", icon: Tag, label: "Labels" },
    ],
  },
  {
    label: "Manage",
    items: [
      { to: "/dashboard/customers", icon: Users, label: "Customers" },
      { to: "/dashboard/doctors", icon: Stethoscope, label: "Doctors" },
      { to: "/dashboard/prescriptions", icon: ClipboardList, label: "Prescriptions", capability: "prescriptions" },
      { to: "/dashboard/suppliers", icon: Truck, label: "Suppliers" },
      { to: "/dashboard/scan", icon: ScanLine, label: "Scan Bill" },
      { to: "/dashboard/catalog", icon: Database, label: "Medicine DB" },
      { to: "/dashboard/bulk-bills", icon: Files, label: "Bulk Edit Bills" },
      { to: "/dashboard/procurement", icon: Scale, label: "Procurement", capability: "purchases" },
      { to: "/dashboard/purchase-import", icon: FileUp, label: "Import CSV", capability: "imports" },
    ],
  },
  {
    label: "Control Centre",
    items: [
      { to: "/dashboard/communications", icon: MessageSquare, label: "Communications", capability: "messaging" },
      { to: "/dashboard/campaigns", icon: Megaphone, label: "Campaigns", capability: "campaigns" },
      { to: "/dashboard/devices", icon: Smartphone, label: "Devices & Sync", capability: "devices" },
      { to: "/dashboard/staff", icon: UserCog, label: "Staff", capability: "staff" },
      { to: "/dashboard/integrations", icon: Plug, label: "Integrations" },
      { to: "/dashboard/migration", icon: FileInput, label: "Data Migration" },
      { to: "/dashboard/compliance", icon: BadgeCheck, label: "e-Invoice", capability: "compliance" },
      { to: "/dashboard/scheduled-reports", icon: CalendarClock, label: "Scheduled Reports", capability: "reports" },
      { to: "/dashboard/settings", icon: Settings, label: "Settings", capability: "settings" },
    ],
  },
];

const mobileItems: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home", end: true },
  { to: "/dashboard/billing", icon: FileText, label: "New bill" },
  { to: "/dashboard/invoices", icon: Activity, label: "Bills" },
  { to: "/dashboard/inventory", icon: Package, label: "Stock" },
  { to: "/dashboard/payments", icon: Wallet, label: "Payments" },
];

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      className={({ isActive }) =>
        cn(
          // LocalWell app-menu row: icon + 14px label, plain hover, bold-black active.
          "group relative flex min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-all duration-200 xl:px-3",
          collapsed && "justify-center px-0 xl:px-0",
          isActive
            ? "font-semibold text-black"
            : "text-[#4c4c4c] hover:bg-[#f5f5f5] hover:text-black",
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-black" : "text-[#757575]")} />
          {!collapsed && item.label}
        </>
      )}
    </NavLink>
  );
}

export default function DashboardLayout() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset the content scroll on route change so tall pages start at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Server capability map (GET /api/devices/me). `null` = unknown/failed →
  // show every item (fail-open) so a missing capability never hides the app.
  const [capabilities, setCapabilities] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("medibill:sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  // Fetch the capability set once per mount.
  useEffect(() => {
    let cancelled = false;
    devicesApi
      .me()
      .then((data) => {
        if (!cancelled) setCapabilities(data?.capabilities ?? null);
      })
      .catch(() => {
        if (!cancelled) setCapabilities(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Hide an item only when the server granted capabilities AND the required one is absent. */
  const canSee = (item: NavItem) => {
    if (!item.capability) return true;
    if (!capabilities) return true; // still loading or request failed — fail-open
    return capabilities.includes("*") || capabilities.includes(item.capability);
  };

  // First login: direct the user to onboarding
  useEffect(() => {
    if (isAuthenticated) {
      // Check if user needs onboarding (no store setup yet)
      // For now, go directly to dashboard
    }
  }, [isAuthenticated, user, navigate]);

  const toggleSidebar = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("medibill:sidebar-collapsed", c ? "0" : "1");
      } catch { /* preference stays in memory */ }
      return !c;
    });
  };

  // [ = collapse, ] = expand — works from anywhere in the workspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inInput = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (inInput) return;
      if (e.key === "[") toggleSidebar();
      else if (e.key === "]" && collapsed) toggleSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed]);

  return (
    <div className="h-dvh flex overflow-hidden bg-background">
      <CommandPalette onShowShortcuts={() => setShortcutsOpen(true)} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {/* Sidebar — toggle between full labels and icons-only */}
      <aside className={cn("shrink-0 border-r border-border bg-sidebar hidden md:flex flex-col transition-[width] duration-200", collapsed ? "w-16" : "w-56 xl:w-60")}>
        <div className={cn("py-4 border-b border-border", collapsed ? "px-2" : "px-4")}>
          <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm shrink-0">
              <Cross className="h-4 w-4" strokeWidth={2.5} />
            </div>
            {!collapsed && (
              <div className="leading-tight min-w-0">
                <span className="font-display text-base font-semibold tracking-tight text-foreground block">
                  MediBill
                </span>
                <span className="text-[11px] text-muted-foreground">
                  GST Billing System
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            title={collapsed ? "Expand sidebar ( ] )" : "Collapse to icons ( [ )"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar to icons"}
            aria-expanded={!collapsed}
            className="mt-3 flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-border/60 text-[11px] text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          >
            {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <><ChevronsLeft className="h-3.5 w-3.5" /><span>Collapse</span></>}
          </button>
        </div>

        <nav className={cn("flex-1 overflow-y-auto", collapsed ? "p-2" : "p-3")} aria-label="Workspace navigation">
          {/* LocalWell's menu is a flat list — groups only set the order. */}
          <div className="space-y-0.5">
            {navGroups.flatMap((group) => group.items.filter(canSee)).map((item) => (
              <NavItemLink key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        </nav>

        {/* Sync status */}
        <div className={cn("border-t border-border", collapsed ? "p-2" : "p-3")}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2" title="Live sync — cloud backup active">
              <span className="relative flex h-2 w-2">
                <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-primary" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                title="Show keyboard shortcuts (?)"
                aria-label="Show keyboard shortcuts"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              >
                <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">?</kbd>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-2 py-2.5 rounded-md bg-secondary/50">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-primary" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <div className="leading-tight">
                  <p className="text-xs font-medium">Live sync</p>
                  <p className="text-[10px] text-muted-foreground">
                    Cloud backup active
                  </p>
                </div>
                <Cloud className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
              </div>
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                className="mt-1.5 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                title="Show keyboard shortcuts (?)"
              >
                <span>Shortcuts</span>
                <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">?</kbd>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur z-50 pb-[env(safe-area-inset-bottom)]" aria-label="Mobile navigation">
        <div className="mx-auto flex max-w-lg items-center gap-1 px-2 py-1.5">
          {mobileItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1 text-[10px] transition-colors",
                  isActive ? "text-primary font-medium" : "text-muted-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>                  <span
                    className={cn(
                      "flex h-7 w-10 items-center justify-center rounded-full transition-colors",
                      isActive ? "bg-primary/10" : "",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main Content — single scroll region; tall pages scroll, fit-pages keep inner scroll */}
      <main className="min-w-0 flex h-dvh min-h-0 flex-1 flex-col overflow-hidden pb-20 md:pb-0">
        {/* Top header — LocalWell AppHeader: logo, business block, center tabs, actions */}
        <header className="shrink-0 border-b border-border bg-sidebar">
          <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
            {/* Logo */}
            <div className="flex shrink-0 items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Cross className="h-4 w-4" strokeWidth={2.5} />
              </div>
              <span className="hidden font-display text-base font-semibold tracking-tight text-foreground sm:block">
                MediBill
              </span>
            </div>

            {/* Business block — initials chip + name, LocalWell style */}
            <button
              type="button"
              className="flex min-w-0 items-center gap-2.5 rounded-md py-1 pr-2 text-left hover:bg-[#f5f5f5]"
              title="Switch store"
            >
              <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md bg-[#60096a] leading-none text-white">
                <span className="text-[11px] font-bold">{((user?.name || "M")[0] || "M").toUpperCase()}</span>
                <span className="text-[6px] uppercase tracking-wide">Retailer</span>
              </span>
              <span className="hidden min-w-0 leading-tight lg:block">
                <span className="block max-w-[220px] truncate text-[13px] font-semibold text-black">
                  {user?.name || "My Store"}
                </span>
                <span className="block max-w-[220px] truncate text-[11px] text-[#757575]">
                  GST Billing System
                </span>
              </span>
            </button>

            {/* Center module tabs — Purchases | Stock | Sales with pink underline */}
            <nav className="mx-auto hidden h-full items-center gap-1 md:flex" aria-label="Module tabs">
              {[
                { to: "/dashboard/purchases", label: "Purchases" },
                { to: "/dashboard/inventory", label: "Stock" },
                { to: "/dashboard/billing", label: "Sales" },
              ].map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    cn(
                      "relative flex h-full items-center px-4 text-sm",
                      isActive ? "font-semibold text-black" : "text-[#757575] hover:text-black",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {tab.label}
                      {isActive && (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-brand" aria-hidden />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* Right actions — Search, Alert, user chip */}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#757575] hover:bg-[#f5f5f5] hover:text-black sm:flex"
                title="Search all (Ctrl+K)"
              >
                <Search className="h-3.5 w-3.5" />
                Search
              </button>
              <button
                type="button"
                className="relative flex h-9 w-9 items-center justify-center rounded-md text-[#757575] hover:bg-[#f5f5f5] hover:text-black"
                aria-label="Alerts"
              >
                <BellRing className="h-[18px] w-[18px]" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand" />
              </button>
              <div className="ml-1 flex items-center gap-2 rounded-md px-2 py-1 hover:bg-[#f5f5f5]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#60096a] text-[11px] font-bold text-white">
                  {((user?.name || "U")[0] || "U").toUpperCase()}
                </span>
                <span className="hidden text-[11px] uppercase tracking-wide text-[#757575] lg:block">
                  User
                </span>
              </div>
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="mx-auto flex min-h-0 w-full max-w-[87.5rem] flex-1 flex-col overflow-y-auto px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
          <Outlet />
        </div>
        <p className="sr-only">Press Ctrl+K for the command palette, ? for all shortcuts.</p>
      </main>
    </div>
  );
}
