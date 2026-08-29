import { StoreSwitcher } from "@/components/StoreSwitcher";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  Cloud,
  Cross,
  FileText,
  LayoutDashboard,
  Package,
  ScanLine,
  Settings,
  Stethoscope,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet } from "react-router";

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  end?: boolean;
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", end: true },
      { to: "/dashboard/billing", icon: FileText, label: "New Bill" },
      { to: "/dashboard/invoices", icon: Activity, label: "Invoices" },
      { to: "/dashboard/payments", icon: Wallet, label: "Payments" },
      { to: "/dashboard/scan", icon: ScanLine, label: "Scan Bill" },
    ],
  },
  {
    label: "Manage",
    items: [
      { to: "/dashboard/inventory", icon: Package, label: "Inventory" },
      { to: "/dashboard/customers", icon: Users, label: "Customers" },
      { to: "/dashboard/doctors", icon: Stethoscope, label: "Doctors" },
      { to: "/dashboard/suppliers", icon: Truck, label: "Suppliers" },
      { to: "/dashboard/reports", icon: BarChart3, label: "Reports" },
    ],
  },
  {
    label: "Account",
    items: [{ to: "/dashboard/settings", icon: Settings, label: "Settings" }],
  },
];

const mobileItems: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home", end: true },
  { to: "/dashboard/billing", icon: FileText, label: "Bill" },
  { to: "/dashboard/invoices", icon: Activity, label: "Bills" },
  { to: "/dashboard/payments", icon: Wallet, label: "Payments" },
  { to: "/dashboard/inventory", icon: Package, label: "Stock" },
];

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/70",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary transition-all duration-200",
              isActive ? "opacity-100" : "opacity-0",
            )}
          />
          <item.icon className="h-4 w-4 shrink-0" />
          {item.label}
        </>
      )}
    </NavLink>
  );
}

export default function DashboardLayout() {
  const { isAuthenticated, activeStore, ensureStore } = useAuth();

  // Ensure every authenticated user has a store they can work in.
  useEffect(() => {
    if (isAuthenticated && !activeStore) {
      ensureStore({});
    }
  }, [isAuthenticated, activeStore, ensureStore]);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-sidebar hidden md:flex flex-col">
        <div className="px-4 py-4 border-b border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
              <Cross className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <span className="font-display text-base font-semibold tracking-tight text-foreground block">
                MediBill
              </span>
              <span className="text-[11px] text-muted-foreground">
                GST Billing System
              </span>
            </div>
          </div>
          <StoreSwitcher />
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItemLink key={item.to} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Sync status */}
        <div className="p-3 border-t border-border">
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
        </div>
      </aside>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur z-50">
        <div className="flex items-center justify-around py-1.5 px-2">
          {mobileItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px] transition-colors",
                  isActive ? "text-primary font-medium" : "text-muted-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-7 w-11 items-center justify-center rounded-full transition-colors",
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

      {/* Main Content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
