import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  BellRing,
  HandCoins,
  Loader2,
  Clock,
  FileText,
  IndianRupee,
  PackageCheck,
  PackageX,
  Phone,
  ReceiptText,
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  CalendarRange,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type {
  DashboardInvoice,
  DashboardKpis,
  RefillReminder,
} from "@/lib/api";
import { mockDashboardKpis } from "@/data/mockDashboard";

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function pctBadge(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return null;
  const down = pct < 0;
  const cls = down ? "text-red-600 bg-red-500/10 border-red-500/20" : pct > 0 ? "text-green-700 bg-green-500/10 border-green-500/20" : "text-muted-foreground bg-muted border-border/60";
  const arrow = down ? "â†“" : pct > 0 ? "â†‘" : "â†’";
  return <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{arrow}{Math.abs(pct)}%</span>;
}

/** LocalWell money-card chart area: 5..0 axis + empty-state label. */
function SparkArea({ emptyLabel, hasData }: { emptyLabel: string; hasData: boolean }) {
  return (
    <div className="mt-2 flex gap-1.5">
      <div className="flex flex-col justify-between py-0.5 text-[9px] leading-none text-muted-foreground tabular-nums">
        {[5, 4, 3, 2, 1, 0].map((n) => <span key={n}>{n}</span>)}
      </div>
      <div className="h-16 flex-1 rounded-sm border border-dashed border-border/60 bg-muted/30 flex items-center justify-center text-[10px] text-muted-foreground">
        {hasData ? <TrendingUp className="h-4 w-4 text-brand" /> : emptyLabel}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const isVisualReview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("mock");

  // â”€â”€â”€ KPI Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayProfit, setTodayProfit] = useState<number | null>(null);
  const [refills, setRefills] = useState<RefillReminder[]>([]);
  const [duesTab, setDuesTab] = useState<"customers" | "suppliers">("customers");
  const [fastSlowTab, setFastSlowTab] = useState<"fast" | "slow">("slow");
  const [stockFast, setStockFast] = useState<any[] | null>(null);
  const [stockSlow, setStockSlow] = useState<any[] | null>(null);

  // Date range — screenshot: 17-09-2026 - 24-09-2026
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);

  const loadKpis = useCallback(async (from?: string, to?: string) => {
    if (isVisualReview) {
      setKpis(mockDashboardKpis);
      setRefills([]);
      setStockFast([]);
      setStockSlow([]);
      setLoading(false);
      return;
    }
    try {
      const { dashboardApi, reportsApi, refillsApi } = await import("@/lib/api");
      const f = from ?? fromDate;
      const t = to ?? toDate;
      const [data, profit, upcoming] = await Promise.all([
        dashboardApi.kpis({ from: f, to: t }),
        reportsApi.profit({ from: f, to: t }).catch(() => null),
        refillsApi.upcoming(7).catch(() => []),
      ]);
      setKpis(data);
      setRefills(upcoming ?? []);
      if (profit && typeof profit.grossProfit === "number") setTodayProfit(profit.grossProfit);
      else if (data && typeof (data as any).grossProfit === "number") setTodayProfit((data as any).grossProfit);
      // Fast/slow — best-effort; empty => "No Products Found" placeholder per screenshot
      try {
        const [fast, slow] = await Promise.all([
          reportsApi.stockFast({ from: f, to: t, limit: 5 }).catch(() => null),
          reportsApi.stockSlow({ from: f, to: t }).catch(() => null),
        ]);
        setStockFast((fast as any)?.rows ?? (fast as any)?.data?.rows ?? null);
        setStockSlow((slow as any)?.rows ?? (slow as any)?.data?.rows ?? null);
      } catch {
        // keep null -> placeholder
      }
    } catch (err) {
      console.error("Failed to load dashboard KPIs:", err);
    } finally {
      setLoading(false);
    }
  }, [isVisualReview, fromDate, toDate]);

  useEffect(() => {
    if (isVisualReview || isAuthenticated) void loadKpis();
  }, [isAuthenticated, isVisualReview, loadKpis]);

  useEffect(() => {
    if (!isVisualReview && !authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, isVisualReview, navigate]);

  if (authLoading || loading || !kpis) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Loading dashboard…
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const lines = ["Ready to serve your patients today?", "Another day to keep the shelves full.", "Fresh stock, happy customers, smooth billing.", "Every prescription matters — make today count.", "Small steps, healthy shop."];
  const motivation = lines[new Date().getDate() % lines.length];
  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const today = kpis.todaySales ?? 0;
  const todayCount = kpis.todayInvoices ?? 0;

  // Range-aware aliases (backend Task 9)
  const netSales = (kpis as any).netSales ?? today;
  const netSalesPrev = (kpis as any).netSalesPrev ?? null;
  const netSalesPct = (kpis as any).netSalesChangePct ?? null;
  const netPurchase = (kpis as any).netPurchase ?? 0;
  const netPurchasePrev = (kpis as any).netPurchasePrev ?? null;
  const netPurchasePct = (kpis as any).netPurchaseChangePct ?? null;
  const grossProfit = (kpis as any).grossProfit ?? todayProfit ?? 0;
  const grossProfitPrev = (kpis as any).grossProfitPrev ?? null;
  const grossProfitPct = (kpis as any).grossProfitChangePct ?? null;

  const customersTotal = (kpis as any).customers?.total ?? 0;
  const customersAvg = (kpis as any).customers?.avgOrderValue ?? 0;
  const customersNew = (kpis as any).customers?.new ?? 0;
  const customersRepeat = (kpis as any).customers?.repeat ?? 0;

  const cards = [
    { label: "Today's GST", value: kpis.todayGst ?? 0, format: (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`, icon: TrendingUp, tint: "bg-muted text-muted-foreground", to: "/dashboard/reports" },
    { label: "Low Stock", value: kpis.lowStockCount ?? 0, icon: PackageX, tint: "bg-red-500/10 text-red-600", alert: (kpis.lowStockCount ?? 0) > 0, to: "/dashboard/inventory?tab=low" },
    { label: "Expiring Soon", value: kpis.expiringCount ?? 0, icon: Clock, tint: "bg-amber-500/10 text-amber-600", alert: (kpis.expiringCount ?? 0) > 0, to: "/dashboard/inventory?tab=expiry" },
    { label: "Pending Credit", value: kpis.outstandingCredit ?? 0, format: (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`, icon: Wallet, tint: "bg-red-500/10 text-red-600", alert: (kpis.outstandingCredit ?? 0) > 0, to: "/dashboard/payments" },
  ];

  const statusPill = (status?: DashboardInvoice["status"]) => {
    const map: Record<string, string> = {
      paid: "bg-green-500/10 text-green-700 border-green-500/25",
      partial: "bg-amber-500/10 text-amber-700 border-amber-500/25",
      unpaid: "bg-red-500/10 text-red-700 border-red-500/25",
    };
    return map[status ?? "paid"] || map.paid;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative space-y-4">
      {isVisualReview && <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary" role="note">Visual review mode · showing sample pharmacy data</div>}
      {/* Decorative glow */}
      <div className="pointer-events-none absolute -top-24 right-0 h-64 w-96 rounded-full bg-primary/10 blur-3xl" />

      {/* Greeting + Date range */}
      <main id="main-content" className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            {/* LocalWell dashboard header: date, then the business name */}
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-balance mt-1">Lakshmi Balaji Medicals</h1>
          </div>
          <div className="flex flex-wrap items-end gap-2 shrink-0">
            <div className="flex items-end gap-2 rounded-sm border border-border/60 bg-card px-3 py-2">
              <div>
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><CalendarRange className="h-3 w-3" />From</Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="mt-1 h-8 w-auto text-xs" />
              </div>
              <span className="pb-2 text-muted-foreground text-xs">—</span>
              <div>
                <Label className="text-[10px] text-muted-foreground">To</Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="mt-1 h-8 w-auto text-xs" />
              </div>
              <Button size="sm" className="h-8 text-xs ml-1" onClick={() => { setLoading(true); void loadKpis(fromDate, toDate); }}>Apply</Button>
            </div>
            <Button onClick={() => navigate("/dashboard/billing")} className="shrink-0">
              <FileText className="h-4 w-4 mr-1.5" />New Bill
            </Button>
          </div>
        </div>
      </div>

      {/* â”€â”€ Money first: Net Sales / Profit / Net Purchase â”€â”€ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-3 border-border/60 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground">Net Sales</h3>
            <button onClick={() => navigate("/dashboard/reports")} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 shrink-0">View entire list <ArrowRight className="h-3 w-3" /></button>
          </div>
          <p className="text-xl font-bold tracking-tight tabular-nums">₹{netSales.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
            from ₹{(netSalesPrev ?? 0).toFixed(2)} {pctBadge(netSalesPct)}
          </p>
          <SparkArea emptyLabel="No Sales Added!" hasData={netSales > 0} />
        </Card>

        <Card className="p-3 border-border/60 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground">Profit</h3>
            <button onClick={() => navigate("/dashboard/reports?tab=profit")} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 shrink-0">View entire list <ArrowRight className="h-3 w-3" /></button>
          </div>
          <p className={`text-xl font-bold tracking-tight tabular-nums ${grossProfit >= 0 ? "text-green-700" : "text-red-600"}`}>₹{grossProfit.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
            from ₹{(grossProfitPrev ?? 0).toFixed(2)} {pctBadge(grossProfitPct)}
          </p>
          <SparkArea emptyLabel="No Profits Added!" hasData={grossProfit !== 0} />
        </Card>

        <Card className="p-3 border-border/60 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground">Net Purchase</h3>
            <button onClick={() => navigate("/dashboard/reports?tab=purchase")} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 shrink-0">View entire list <ArrowRight className="h-3 w-3" /></button>
          </div>
          <p className="text-xl font-bold tracking-tight tabular-nums">₹{netPurchase.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
            from ₹{(netPurchasePrev ?? 0).toFixed(2)} {pctBadge(netPurchasePct)}
          </p>
          <SparkArea emptyLabel="No Purchases Added!" hasData={netPurchase > 0} />
        </Card>
      </div>

      {/* â”€â”€ Money row 2: Collections / Dues â”€â”€ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-3 border-border/60">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground flex items-center gap-1.5">
              <HandCoins className="h-3.5 w-3.5 text-green-600" />Net Payment Collection
            </h3>
            <button onClick={() => navigate("/dashboard/payments")} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
              View entire list <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <p className="text-xl font-bold tracking-tight tabular-nums">₹{Math.round((kpis.collections as any)?.totalIn ?? kpis.collections?.received ?? 0).toLocaleString("en-IN")}</p>
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs tabular-nums">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Payment In</p>
              <p className="font-semibold text-green-700">₹{Math.round((kpis.collections as any)?.totalIn ?? kpis.collections?.received ?? 0).toLocaleString("en-IN")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Payment Out</p>
              <p className="font-semibold text-red-600">₹{Math.round((kpis.collections as any)?.totalOut ?? ( (kpis.collections?.paid ?? 0) + (kpis.collections?.expenses ?? 0))).toLocaleString("en-IN")}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border/40 text-[10px] tabular-nums">
            <div><p className="text-muted-foreground uppercase tracking-wider">Received</p><p className="font-medium">₹{Math.round(kpis.collections?.received ?? 0).toLocaleString("en-IN")}</p></div>
            <div><p className="text-muted-foreground uppercase tracking-wider">Paid out</p><p className="font-medium">₹{Math.round(kpis.collections?.paid ?? 0).toLocaleString("en-IN")}</p></div>
            <div><p className="text-muted-foreground uppercase tracking-wider">Expenses</p><p className="font-medium">₹{Math.round(kpis.collections?.expenses ?? 0).toLocaleString("en-IN")}</p></div>
          </div>
        </Card>

        <Card className="p-3 border-border/60">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 text-red-600" />Due Payments
            </h3>
            <button onClick={() => navigate("/dashboard/payments")} className="text-[11px] text-primary hover:underline">View entire list</button>
          </div>
          <div className="flex gap-1 mb-3">
            {(["customers", "suppliers"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDuesTab(t)}
                className={`text-[11px] px-2.5 py-1 rounded-full border ${duesTab === t ? "border-primary/40 bg-primary/10 text-primary font-medium" : "border-border/60 text-muted-foreground"}`}
              >
                {t === "customers" ? "Customer" : "Distributor"}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Due date {fromDate} - {toDate}</p>
          <p className="text-base font-bold tracking-tight tabular-nums mt-0.5">
            Total Due <span className="text-red-600">₹{Math.round(duesTab === "customers" ? (kpis.dues?.customerTotal ?? 0) : (kpis.dues?.supplierTotal ?? 0)).toLocaleString("en-IN")}</span>
            <span className="ml-2 text-[10px] font-normal text-muted-foreground">
              {duesTab === "customers" ? "customers owe us" : "we owe suppliers"}
            </span>
          </p>
          <div className="mt-2 space-y-0.5">
            {(() => {
              const list = duesTab === "customers" ? (kpis.dues?.customers ?? []) : (kpis.dues?.suppliers ?? []);
              if (list.length === 0) return <p className="py-3 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded">No Due Payments Found</p>;
              return list.slice(0, 5).map((d) => (
                <div key={d.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                  <span className="truncate">
                    {d.name}
                    {d.phone && <span className="text-muted-foreground ml-1.5">{d.phone}</span>}
                  </span>
                  <span className="shrink-0 ml-2 tabular-nums font-medium">₹{Math.round(d.balance).toLocaleString("en-IN")}</span>
                </div>
              ));
            })()}
          </div>
        </Card>
      </div>

      {/* Today snapshot */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="card-hover p-3 border-border/60 flex items-center justify-center gap-2 text-center">
          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <IndianRupee className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Today's Sales</p>
            <p className="text-base font-semibold tracking-tight tabular-nums">
              <AnimatedNumber value={today} format={(v) => `₹${Math.round(v).toLocaleString("en-IN")}`} />
            </p>
          </div>
        </Card>
        <Card className="card-hover p-3 border-border/60 flex items-center justify-center gap-2 text-center">
          <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0">
            <ReceiptText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Bills Today</p>
            <p className="text-base font-semibold tracking-tight tabular-nums"><AnimatedNumber value={todayCount} /></p>
          </div>
        </Card>
        <Card className="card-hover p-3 border-border/60 flex items-center justify-center gap-2 text-center">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${(todayProfit ?? grossProfit ?? 0) >= 0 ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit & Loss · today</p>
            <p className={`text-base font-semibold tracking-tight tabular-nums ${(todayProfit ?? grossProfit ?? 0) >= 0 ? "text-green-700" : "text-red-600"}`}>
              {todayProfit === null && grossProfit === 0 ? (
                <span className="text-sm font-normal text-muted-foreground">—</span>
              ) : (
                <AnimatedNumber value={todayProfit ?? grossProfit} format={(v) => `${v < 0 ? "−" : ""}₹${Math.abs(Math.round(v)).toLocaleString("en-IN")}`} />
              )}
            </p>
          </div>
        </Card>
      </div>

      {/* Register snapshot */}
      <div className="flex items-center justify-between border-y border-border/70 py-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Register snapshot</p>
        <p className="text-xs text-muted-foreground">Today’s counter activity</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Card
              role="link"
              tabIndex={0}
              aria-label={`${card.label}: open details`}
              onClick={() => navigate(card.to)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(card.to); } }}
              className={`card-hover h-full p-3 border-border/60 cursor-pointer ${card.alert ? "border-red-500/30" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{card.label}</p>
                  <p className="text-base font-semibold tracking-tight tabular-nums mt-1">
                    <AnimatedNumber value={card.value} format={card.format} />
                  </p>
                </div>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${card.tint}`}>
                  <card.icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary">
                View details <ArrowRight className="h-3 w-3" />
              </p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* â”€â”€ Operations: Stock Value / Customers / Stock Movement â”€â”€ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-3 border-border/60 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground flex items-center gap-1.5"><PackageCheck className="h-3.5 w-3.5 text-primary" />Stock Value</h3>
            <button onClick={() => navigate("/dashboard/inventory")} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 shrink-0">View entire list <ArrowRight className="h-3 w-3" /></button>
          </div>
          <div className="space-y-1 mt-1 text-xs tabular-nums">
            <div className="flex justify-between"><span className="text-muted-foreground">MRP</span><span className="font-semibold">₹{Math.round(kpis.stockValue?.mrpValue ?? 0).toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sale</span><span className="font-semibold">₹{Math.round(kpis.stockValue?.saleValue ?? 0).toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Purchase</span><span className="font-semibold">₹{Math.round(kpis.stockValue?.costValue ?? 0).toLocaleString("en-IN")}</span></div>
            <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">{Math.round(kpis.stockValue?.packs ?? 0).toLocaleString("en-IN")} packs on shelf</p>
          </div>
        </Card>

        <Card className="p-3 border-border/60 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-violet-600" />Customers</h3>
            <button onClick={() => navigate("/dashboard/reports?tab=party")} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 shrink-0">View entire list <ArrowRight className="h-3 w-3" /></button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
            <div className="rounded bg-muted/40 px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-base font-bold tabular-nums leading-tight">{customersTotal}</p>
            </div>
            <div className="rounded bg-muted/40 px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Order</p>
              <p className="text-xs font-semibold tabular-nums leading-tight">₹{Math.round(customersAvg).toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">New</p>
              <p className="text-xs font-semibold tabular-nums leading-tight">{customersNew}</p>
            </div>
            <div className="rounded bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Repeat</p>
              <p className="text-xs font-semibold tabular-nums leading-tight">{customersRepeat}</p>
            </div>
          </div>
        </Card>

        <Card className="p-3 border-border/60 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground">Stock Movement</h3>
            <div className="flex gap-1">
              {(["slow", "fast"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFastSlowTab(t)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border capitalize ${fastSlowTab === t ? "border-primary/40 bg-primary/10 text-primary font-medium" : "border-border/60 text-muted-foreground"}`}
                >
                  {t === "slow" ? "Slow Moving" : "Fast Moving"}
                </button>
              ))}
            </div>
          </div>
          {(() => {
            const rows = fastSlowTab === "fast" ? (stockFast ?? []) : (stockSlow ?? []);
            if (!rows || rows.length === 0) {
              return <p className="py-3 text-center text-xs text-muted-foreground">No Products Found</p>;
            }
            return (
              <div className="space-y-1">
                {rows.slice(0, 5).map((r: any, i: number) => (
                  <div key={r.medicineId ?? i} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                    <span className="truncate min-w-0 font-medium">{r.medicineName ?? r.name ?? "—"}</span>
                    <span className="shrink-0 ml-2 tabular-nums text-muted-foreground">{r.qtySold ?? r.stockPacks ?? 0} sold</span>
                  </div>
                ))}
              </div>
            );
          })()}
          <button onClick={() => navigate("/dashboard/reports?tab=stock")} className="mt-1.5 text-[11px] text-primary hover:underline inline-flex items-center gap-1">View entire list <ArrowRight className="h-3 w-3" /></button>
        </Card>
      </div>

      {/* Refill Reminders */}
      <Card className="p-3 border-border/60">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <BellRing className="h-3.5 w-3.5 text-amber-600" />Refill Reminders
          </h3>
          <button onClick={() => navigate("/dashboard/refills")} className="text-[11px] text-primary hover:underline">View entire list</button>
        </div>
        {refills.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded">No refill reminders in next 7 days</p>
        ) : (
          <div className="space-y-1.5">
            {refills.slice(0, 5).map((r) => {
              const d = daysUntil(r.reminderDate);
              const overdue = r.status === "pending" && d <= 0;
              return (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded border border-border/40 px-2.5 py-1.5">
                  <span className="min-w-0">
                    <span className="block text-xs font-medium truncate">{r.customerName ?? "Customer"}</span>
                    <span className="block text-xs text-muted-foreground truncate">{r.medicineName}</span>
                    <span className={`text-[10px] tabular-nums ${overdue ? "text-red-600 font-medium" : d <= 7 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {overdue ? (d === 0 ? "Due today" : `${Math.abs(d)}d overdue`) : `in ${d}d`}
                    </span>
                  </span>
                  <span className="shrink-0 flex items-center gap-1.5">
                    {r.customerPhone && (
                      <a href={`tel:${r.customerPhone}`} aria-label={`Call ${r.customerName}`} className="text-muted-foreground hover:text-primary">
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => navigate("/dashboard/refills")}>Follow Up</Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recent Invoices */}
      {(kpis.recentInvoices ?? []).length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Invoices</h2>
            <button onClick={() => navigate("/dashboard/invoices")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-1">
            {kpis.recentInvoices.slice(0, 8).map((inv: DashboardInvoice, i: number) => (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center justify-between py-1.5 px-3 border border-border/60 rounded-md text-[13px] hover:bg-secondary/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium text-xs text-muted-foreground">{inv.invoiceNo}</span>
                  <span className="truncate">{inv.customerName || "Walk-in Customer"}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusPill(inv.status)}`}>
                    {inv.status === "unpaid" ? "Unpaid" : inv.status === "partial" ? "Partial" : "Paid"}
                  </span>
                  <span className="font-semibold tabular-nums">₹{inv.grandTotal?.toLocaleString("en-IN")}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {(kpis.totalInvoices ?? 0) === 0 && (
        <EmptyState
          icon={FileText}
          title="Ready for your first bill?"
          description="Create a GST invoice, add your medicines from the database, and watch your dashboard come alive."
          actions={[
            { label: "Create your first bill", onClick: () => navigate("/dashboard/billing") },
            { label: "Add medicines", variant: "outline", onClick: () => navigate("/dashboard/inventory") },
          ]}
        />
      )}
    </main>
    </motion.div>
  );
}
