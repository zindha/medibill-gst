import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Clock,
  IndianRupee,
  Package,
  PackageX,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router";

export default function DashboardPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const stats = useQuery(api.stats.dashboard);

  if (!isAuthenticated && !isLoading) {
    navigate("/auth");
    return null;
  }

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">
          Loading...
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Total Revenue",
      value: `₹${stats.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      icon: IndianRupee,
    },
    {
      label: "Total GST",
      value: `₹${stats.totalGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
    },
    {
      label: "Medicines",
      value: stats.totalMedicines,
      icon: Package,
      sub: `${stats.totalStock} units`,
    },
    {
      label: "Invoices",
      value: stats.totalInvoices,
      icon: Activity,
      sub: `${stats.recentInvoices.length} recent`,
    },
    {
      label: "Customers",
      value: stats.totalCustomers,
      icon: Users,
    },
    {
      label: "Suppliers",
      value: stats.totalSuppliers,
      icon: Truck,
    },
    {
      label: "Low Stock",
      value: stats.lowStockCount,
      icon: PackageX,
      alert: stats.lowStockCount > 0,
    },
    {
      label: "Expiring Soon",
      value: stats.expiringSoonCount,
      icon: Clock,
      alert: stats.expiringSoonCount > 0,
    },
    {
      label: "Pending Payments",
      value: `₹${stats.totalPending.toLocaleString("en-IN")}`,
      icon: Wallet,
      alert: stats.totalPending > 0,
    },
  ];

  const maxRevenue = Math.max(...stats.monthlyRevenue.map((m) => m.revenue), 1);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your medical shop</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Card className={`p-4 border-border/60 ${card.alert ? "border-destructive/30" : ""}`}>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  {card.alert && <AlertTriangle className="h-3 w-3 text-destructive" />}
                  {card.label}
                </p>
                <p className={`text-lg font-semibold tracking-tight ${card.alert ? "text-destructive" : ""}`}>
                  {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                </p>
                {"sub" in card && <p className="text-[10px] text-muted-foreground">{card.sub}</p>}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Revenue Chart (Simple Bar) */}
      <Card className="p-5 border-border/60">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Monthly Revenue (Last 6 Months)</h3>
        <div className="flex items-end gap-2 h-24">
          {stats.monthlyRevenue.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-muted-foreground font-medium">₹{(m.revenue / 1000).toFixed(1)}k</span>
              <div className="w-full bg-secondary rounded-sm" style={{ height: `${Math.max((m.revenue / maxRevenue) * 100, 4)}%` }}>
                <div className="w-full h-full bg-foreground rounded-sm opacity-80" style={{ height: `${Math.max((m.revenue / maxRevenue) * 100, 4)}%` }} />
              </div>
              <span className="text-[8px] text-muted-foreground">{m.month}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Alerts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Low Stock */}
        {stats.lowStockCount > 0 && (
          <Card className="p-4 border-border/60">
            <h3 className="text-xs font-medium flex items-center gap-1.5 mb-2">
              <PackageX className="h-3.5 w-3.5 text-destructive" />
              Low Stock Alert
            </h3>
            <div className="space-y-1">
              {stats.lowStock.slice(0, 5).map((med) => (
                <div key={med._id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate">{med.name}</span>
                  <Badge variant="destructive" className="text-[9px] ml-2 shrink-0">{med.quantity}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Expiring Soon */}
        {stats.expiringSoonCount > 0 && (
          <Card className="p-4 border-border/60">
            <h3 className="text-xs font-medium flex items-center gap-1.5 mb-2">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              Expiring Soon
            </h3>
            <div className="space-y-1">
              {stats.expiringSoon.slice(0, 5).map((med) => (
                <div key={med._id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate">{med.name}</span>
                  <span className="text-amber-600 shrink-0 ml-2">{med.expiryDate}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Pending */}
        {stats.totalPending > 0 && (
          <Card className="p-4 border-border/60">
            <h3 className="text-xs font-medium flex items-center gap-1.5 mb-2">
              <Wallet className="h-3.5 w-3.5 text-destructive" />
              Pending Payments
            </h3>
            <p className="text-2xl font-semibold text-destructive">
              ₹{stats.totalPending.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {stats.dueReminders > 0 && `${stats.dueReminders} refill reminders due · `}
              {stats.pendingPurchaseBills > 0 && `${stats.pendingPurchaseBills} bills pending`}
            </p>
          </Card>
        )}
      </div>

      {/* Recent Invoices */}
      {stats.recentInvoices.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Recent Invoices</h2>
          <div className="space-y-1">
            {stats.recentInvoices.map((inv) => (
              <div key={inv._id} className="flex items-center justify-between py-2 px-4 border border-border/60 rounded-sm text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-xs">{inv.invoiceNo}</span>
                  <span className="text-muted-foreground">{inv.customerName || "Walk-in Customer"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] ${inv.status === "unpaid" ? "text-destructive" : "text-muted-foreground"}`}>
                    {inv.status === "unpaid" ? "Unpaid" : inv.status === "partial" ? "Partial" : "Paid"}
                  </span>
                  <span className="font-medium">₹{inv.grandTotal.toLocaleString("en-IN")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
