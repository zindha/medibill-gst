import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Activity,
  DollarSign,
  IndianRupee,
  Package,
  PackageX,
  TrendingUp,
  Truck,
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
      change: "+12.5%",
    },
    {
      label: "Total GST",
      value: `₹${stats.totalGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      change: "",
    },
    {
      label: "Medicines",
      value: stats.totalMedicines,
      icon: Package,
      sub: `${stats.totalStock} units in stock`,
    },
    {
      label: "Invoices",
      value: stats.totalInvoices,
      icon: Activity,
      sub: `${stats.recentInvoices.length} recent`,
    },
    {
      label: "Suppliers",
      value: stats.totalSuppliers,
      icon: Truck,
      sub: "Active vendors",
    },
    {
      label: "Low Stock Items",
      value: stats.lowStockCount,
      icon: PackageX,
      sub: "Needs attention",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your medical shop
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <Card className="p-5 border-border/60">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {card.label}
                  </p>
                  <p
                    className={`text-2xl font-semibold tracking-tight ${
                      card.label === "Low Stock Items" && stats.lowStockCount > 0
                        ? "text-destructive"
                        : ""
                    }`}
                  >
                    {typeof card.value === "number"
                      ? card.value.toLocaleString()
                      : card.value}
                  </p>
                  {"sub" in card && (
                    <p className="text-xs text-muted-foreground">{card.sub}</p>
                  )}
                </div>
                <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Low Stock Alert */}
      {stats.lowStockCount > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Low Stock Alert
          </h2>
          <div className="space-y-1">
            {stats.lowStock.slice(0, 5).map((med) => (
              <div
                key={med._id}
                className="flex items-center justify-between py-2 px-4 border border-border/60 rounded-sm text-sm"
              >
                <span className="font-medium">{med.name}</span>
                <Badge variant="destructive" className="text-xs">
                  {med.quantity} left
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Invoices */}
      {stats.recentInvoices.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Recent Invoices
          </h2>
          <div className="space-y-1">
            {stats.recentInvoices.map((inv) => (
              <div
                key={inv._id}
                className="flex items-center justify-between py-2 px-4 border border-border/60 rounded-sm text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-xs">{inv.invoiceNo}</span>
                  <span className="text-muted-foreground">
                    {inv.customerName || "Walk-in Customer"}
                  </span>
                </div>
                <span className="font-medium">
                  ₹{inv.grandTotal.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
