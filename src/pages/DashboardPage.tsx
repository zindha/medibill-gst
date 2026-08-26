import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Clock,
  FileText,
  IndianRupee,
  Package,
  PackageX,
  ReceiptText,
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

  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? "Burning the midnight oil"
      : hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening";
  const lines = [
    "Ready to serve your patients today?",
    "Another day to keep the shelves full.",
    "Fresh stock, happy customers, smooth billing.",
    "Every prescription matters — make today count.",
    "Small steps, healthy shop.",
  ];
  const motivation = lines[new Date().getDate() % lines.length];
  const dateLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const today = stats.dailyInvoices[stats.dailyInvoices.length - 1];
  const activeDays = stats.dailyInvoices.filter((d) => d.count > 0).length;

  const cards = [
    {
      label: "Total Revenue",
      value: stats.totalRevenue,
      format: (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`,
      icon: IndianRupee,
      tint: "bg-primary/10 text-primary",
    },
    {
      label: "Total GST",
      value: stats.totalGst,
      format: (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`,
      icon: TrendingUp,
      tint: "bg-muted text-muted-foreground",
    },
    {
      label: "Medicines",
      value: stats.totalMedicines,
      sub: `${stats.totalStock} units in stock`,
      icon: Package,
      tint: "bg-sky-500/10 text-sky-600",
    },
    {
      label: "Invoices",
      value: stats.totalInvoices,
      sub: `${stats.recentInvoices.length} recent`,
      icon: Activity,
      tint: "bg-violet-500/10 text-violet-600",
    },
    {
      label: "Customers",
      value: stats.totalCustomers,
      icon: Users,
      tint: "bg-amber-500/10 text-amber-600",
    },
    {
      label: "Suppliers",
      value: stats.totalSuppliers,
      icon: Truck,
      tint: "bg-teal-500/10 text-teal-600",
    },
    {
      label: "Low Stock",
      value: stats.lowStockCount,
      icon: PackageX,
      tint: "bg-red-500/10 text-red-600",
      alert: stats.lowStockCount > 0,
    },
    {
      label: "Expiring Soon",
      value: stats.expiringSoonCount,
      icon: Clock,
      tint: "bg-amber-500/10 text-amber-600",
      alert: stats.expiringSoonCount > 0,
    },
    {
      label: "Pending",
      value: stats.totalPending,
      format: (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`,
      icon: Wallet,
      tint: "bg-red-500/10 text-red-600",
      alert: stats.totalPending > 0,
    },
  ];

  const maxRevenue = Math.max(...stats.monthlyRevenue.map((m) => m.revenue), 1);

  const statusPill = (status?: string) => {
    const s = status || "paid";
    const map: Record<string, string> = {
      paid: "bg-green-500/10 text-green-700 border-green-500/25",
      partial: "bg-amber-500/10 text-amber-700 border-amber-500/25",
      unpaid: "bg-red-500/10 text-red-700 border-red-500/25",
    };
    return map[s] || map.paid;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative space-y-8"
    >
      {/* Decorative glow */}
      <div className="pointer-events-none absolute -top-24 right-0 h-64 w-96 rounded-full bg-primary/10 blur-3xl" />

      {/* Greeting */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight mt-1">
            {greeting}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{motivation}</p>
        </div>
        <Button
          onClick={() => navigate("/dashboard/billing")}
          className="shrink-0"
        >
          <FileText className="h-4 w-4 mr-1.5" />
          New Bill
        </Button>
      </div>

      {/* Today snapshot */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="card-hover p-4 border-border/60 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <IndianRupee className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Today's Sales
            </p>
            <p className="text-lg font-semibold tracking-tight">
              <AnimatedNumber
                value={today?.revenue || 0}
                format={(v) => `₹${Math.round(v).toLocaleString("en-IN")}`}
              />
            </p>
          </div>
        </Card>
        <Card className="card-hover p-4 border-border/60 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0">
            <ReceiptText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Bills Today
            </p>
            <p className="text-lg font-semibold tracking-tight">
              <AnimatedNumber value={today?.count || 0} />
            </p>
          </div>
        </Card>
        <Card className="card-hover p-4 border-border/60 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Billing Rhythm
            </p>
            <p className="text-lg font-semibold tracking-tight">
              {activeDays}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                of last 7 days
              </span>
            </p>
          </div>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <Card
              className={`card-hover h-full p-4 border-border/60 ${
                card.alert ? "border-red-500/30" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">
                    {card.label}
                  </p>
                  <p className="text-lg font-semibold tracking-tight mt-1">
                    <AnimatedNumber
                      value={card.value}
                      format={card.format}
                    />
                  </p>
                  {"sub" in card && card.sub ? (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {card.sub}
                    </p>
                  ) : (
                    <p className="text-[10px] text-transparent mt-0.5 select-none">
                      .
                    </p>
                  )}
                </div>
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${card.tint}`}
                >
                  <card.icon className="h-4 w-4" />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {stats.totalInvoices === 0 ? (
        /* First-run onboarding */
        <EmptyState
          icon={FileText}
          title="Ready for your first bill?"
          description="Create a GST invoice, add your medicines from the 2.4 lakh+ medicine database, and watch your dashboard come alive."
          actions={[
            {
              label: "Create your first bill",
              onClick: () => navigate("/dashboard/billing"),
            },
            {
              label: "Add medicines",
              variant: "outline",
              onClick: () => navigate("/dashboard/inventory"),
            },
          ]}
        />
      ) : (
        <>
          {/* Revenue + Activity */}
          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Monthly Revenue
              </h3>
              <span className="text-xs text-muted-foreground">
                Last 6 months
              </span>
            </div>
            <div className="flex items-end gap-2 h-32">
              {stats.monthlyRevenue.map((m, i) => {
                const isLatest = i === stats.monthlyRevenue.length - 1;
                return (
                  <div
                    key={m.month}
                    className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end"
                  >
                    <span className="text-[9px] text-muted-foreground font-medium">
                      {m.revenue > 0 ? `₹${(m.revenue / 1000).toFixed(1)}k` : ""}
                    </span>
                    <div className="w-full flex items-end h-24">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{
                          height: `${Math.max((m.revenue / maxRevenue) * 100, 3)}%`,
                        }}
                        transition={{
                          delay: 0.3 + i * 0.07,
                          duration: 0.6,
                          ease: "easeOut",
                        }}
                        className={`w-full rounded-t-md ${
                          isLatest ? "bg-primary" : "bg-foreground/20"
                        }`}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground">
                      {m.month}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 7-day rhythm strip */}
            <div className="mt-6 pt-5 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  This Week
                </h3>
                <span className="text-xs text-muted-foreground">
                  {activeDays === 0
                    ? "No bills yet this week"
                    : activeDays === 7
                      ? "Billed every day — on fire! 🔥"
                      : `${activeDays} active billing ${activeDays === 1 ? "day" : "days"}`}
                </span>
              </div>
              <div className="flex items-end justify-between gap-2">
                {stats.dailyInvoices.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-muted-foreground">
                      {d.count > 0 ? `${d.count}` : ""}
                    </span>
                    <div
                      className={`w-full h-14 rounded-md flex items-end overflow-hidden border ${
                        d.count > 0
                          ? "border-primary/20 bg-primary/5"
                          : "border-border bg-muted/40"
                      }`}
                    >
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{
                          height: `${Math.min(d.count * 20, 100)}%`,
                        }}
                        transition={{ delay: 0.6 + stats.dailyInvoices.indexOf(d) * 0.05, duration: 0.4 }}
                        className={`w-full ${
                          d.label === "Today" && d.count > 0
                            ? "bg-primary"
                            : "bg-primary/60"
                        }`}
                      />
                    </div>
                    <span
                      className={`text-[9px] ${
                        d.label === "Today"
                          ? "text-primary font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Alerts Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats.lowStockCount > 0 && (
              <Card className="p-4 border-l-2 border-l-red-500">
                <h3 className="text-xs font-medium flex items-center gap-1.5 mb-2">
                  <PackageX className="h-3.5 w-3.5 text-red-600" />
                  Low Stock Alert
                </h3>
                <div className="space-y-1">
                  {stats.lowStock.slice(0, 5).map((med) => (
                    <div
                      key={med._id}
                      className="flex items-center justify-between text-xs py-1"
                    >
                      <span className="truncate">{med.name}</span>
                      <Badge className="text-[9px] ml-2 shrink-0 bg-red-500/10 text-red-700 border-red-500/25">
                        {med.quantity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {stats.expiringSoonCount > 0 && (
              <Card className="p-4 border-l-2 border-l-amber-500">
                <h3 className="text-xs font-medium flex items-center gap-1.5 mb-2">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  Expiring Soon
                </h3>
                <div className="space-y-1">
                  {stats.expiringSoon.slice(0, 5).map((med) => (
                    <div
                      key={med._id}
                      className="flex items-center justify-between text-xs py-1"
                    >
                      <span className="truncate">{med.name}</span>
                      <span className="text-amber-600 shrink-0 ml-2">
                        {med.expiryDate}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {stats.totalPending > 0 && (
              <Card className="p-4 border-l-2 border-l-red-500">
                <h3 className="text-xs font-medium flex items-center gap-1.5 mb-2">
                  <Wallet className="h-3.5 w-3.5 text-red-600" />
                  Pending Payments
                </h3>
                <p className="text-2xl font-semibold text-red-600">
                  <AnimatedNumber
                    value={stats.totalPending}
                    format={(v) => `₹${Math.round(v).toLocaleString("en-IN")}`}
                  />
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {stats.dueReminders > 0 &&
                    `${stats.dueReminders} refill reminders due · `}
                  Track collections in Payments.
                </p>
              </Card>
            )}

            {stats.pendingPurchaseBills > 0 && (
              <Card className="p-4 border-l-2 border-l-teal-500">
                <h3 className="text-xs font-medium flex items-center gap-1.5 mb-2">
                  <Truck className="h-3.5 w-3.5 text-teal-600" />
                  Purchase Bills Pending
                </h3>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold text-teal-600">
                    <AnimatedNumber value={stats.pendingPurchaseBills} />
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {stats.pendingPurchaseBills === 1 ? "bill" : "bills"}{" "}
                    to process
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {stats.pendingPurchaseBillsAmount > 0 &&
                    `₹${Math.round(stats.pendingPurchaseBillsAmount).toLocaleString("en-IN")} in scanned purchases · `}
                  Review and mark them done in the register.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() =>
                    navigate("/dashboard/reports?tab=purchase&range=30")
                  }
                >
                  Review Bills
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Card>
            )}
          </div>

          {/* Recent Invoices */}
          {stats.recentInvoices.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Recent Invoices
                </h2>
                <button
                  onClick={() => navigate("/dashboard/invoices")}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  View all
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-1">
                {stats.recentInvoices.map((inv, i) => (
                  <motion.div
                    key={inv._id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center justify-between py-2.5 px-4 border border-border/60 rounded-md text-sm hover:bg-secondary/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-medium text-xs text-muted-foreground">
                        {inv.invoiceNo}
                      </span>
                      <span className="truncate">
                        {inv.customerName || "Walk-in Customer"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusPill(inv.status)}`}
                      >
                        {inv.status === "unpaid"
                          ? "Unpaid"
                          : inv.status === "partial"
                            ? "Partial"
                            : "Paid"}
                      </span>
                      <span className="font-semibold">
                        ₹{inv.grandTotal.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
