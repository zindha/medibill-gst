import { LogoDropdown } from "@/components/LogoDropdown";
import { cn } from "@/lib/utils";
import {
  Activity,
  FileText,
  LayoutDashboard,
  Package,
  ScanLine,
  Settings,
  Truck,
} from "lucide-react";
import { NavLink, Outlet } from "react-router";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/dashboard/billing", icon: FileText, label: "New Bill" },
  { to: "/dashboard/invoices", icon: Activity, label: "Invoices" },
  { to: "/dashboard/inventory", icon: Package, label: "Inventory" },
  { to: "/dashboard/suppliers", icon: Truck, label: "Suppliers" },
  { to: "/dashboard/scan", icon: ScanLine, label: "Scan Bill" },
];

export default function DashboardLayout() {
  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-card hidden md:flex flex-col">
        <div className="px-5 py-5 border-b border-border flex items-center gap-3">
          <LogoDropdown />
          <div className="text-sm font-medium leading-tight">
            <span className="text-foreground">MediBill</span>
            <span className="block text-xs text-muted-foreground font-normal">
              GST Billing System
            </span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors",
                  isActive
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <NavLink
            to="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </NavLink>
        </div>
      </aside>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card z-50">
        <div className="flex items-center justify-around py-2 px-2">
          {navItems.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded-sm text-[10px] transition-colors",
                  isActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
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
