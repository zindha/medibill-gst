import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPackQty } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { EmptyState } from "@/components/EmptyState";
import {
  ArrowRightLeft,
  BarChart3,
  CalendarRange,
  Download,
  FileText,
  Loader2,
  Package,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { motion } from "framer-motion";

type ReportTab = "sales" | "stock" | "purchase" | "payments" | "profit" | "inventory" | "tax" | "party" | "order";

function exportCSV(data: any[], filename: string, columns: { key: string; header: string }[]) {
  if (!data || data.length === 0) { toast.error("No data to export"); return; }
  const header = columns.map(c => c.header).join(",");
  const rows = data.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? "";
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReportsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ReportTab>("sales");
  const [loading, setLoading] = useState(false);

  // Date range
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);

  // Report data
  const [salesData, setSalesData] = useState<any>(null);
  const [purchaseData, setPurchaseData] = useState<any>(null);
  const [profitData, setProfitData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [taxData, setTaxData] = useState<any>(null);
  const [gstr1Data, setGstr1Data] = useState<any>(null);
  const [gstr2Data, setGstr2Data] = useState<any>(null);
  const [gstr3bData, setGstr3bData] = useState<any>(null);
  const [hsnData, setHsnData] = useState<any>(null);
  const [itcData, setItcData] = useState<any>(null);
  const [gstView, setGstView] = useState<"overview" | "gstr1" | "gstr2" | "hsn" | "itc">("overview");

  // Inventory filter
  const [invStatus, setInvStatus] = useState<"all" | "low" | "out">("all");

  // Sales parity (LocalWell) — 6 views inside SALES tab
  const [salesView, setSalesView] = useState<"register" | "detail" | "summary" | "doctor" | "schedule" | "party">("register");
  const [salesRegister, setSalesRegister] = useState<any>(null);
  const [salesRegisterView, setSalesRegisterView] = useState<"invoice" | "date">("invoice");
  const [salesDetail, setSalesDetail] = useState<any>(null);
  const [salesSummary, setSalesSummary] = useState<any>(null);
  const [salesSummaryGroupBy, setSalesSummaryGroupBy] = useState<string>("product");
  const [salesDoctor, setSalesDoctor] = useState<any>(null);
  const [salesSchedule, setSalesSchedule] = useState<any>(null);
  const [salesScheduleFilter, setSalesScheduleFilter] = useState<string>("H");
  const [salesParty, setSalesParty] = useState<any>(null);
  const [salesQ, setSalesQ] = useState("");

  // Stock parity — 7 views inside STOCK tab
  const [stockView, setStockView] = useState<"fast" | "slow" | "current" | "expired" | "opening-closing" | "statement" | "adjustments">("fast");
  const [stockFast, setStockFast] = useState<any>(null);
  const [stockSlow, setStockSlow] = useState<any>(null);
  const [stockCurrent, setStockCurrent] = useState<any>(null);
  const [stockExpired, setStockExpired] = useState<any>(null);
  const [stockOpeningClosing, setStockOpeningClosing] = useState<any>(null);
  const [stockStatement, setStockStatement] = useState<any>(null);
  const [stockAdjustments, setStockAdjustments] = useState<any>(null);
  const [stockStatementMedicineId, setStockStatementMedicineId] = useState("");
  const [stockMedicineSearch, setStockMedicineSearch] = useState("");
  const [stockMedicineOptions, setStockMedicineOptions] = useState<any[]>([]);

  // Purchase parity — 4 rows (LocalWell 7.54.47 PM.jpeg)
  const [purchaseView, setPurchaseView] = useState<"register" | "detail" | "summary" | "schedule">("register");
  const [purchaseRegisterView, setPurchaseRegisterView] = useState<"invoice" | "date">("invoice");
  const [purchaseRegister, setPurchaseRegister] = useState<any>(null);
  const [purchaseDetail, setPurchaseDetail] = useState<any>(null);
  const [purchaseSummary, setPurchaseSummary] = useState<any>(null);
  const [purchaseSummaryGroupBy, setPurchaseSummaryGroupBy] = useState<string>("product");
  const [purchaseSchedule, setPurchaseSchedule] = useState<any>(null);
  const [purchaseScheduleFilter, setPurchaseScheduleFilter] = useState<string>("H");
  const [purchaseDistributor, setPurchaseDistributor] = useState("");
  const [purchaseQ, setPurchaseQ] = useState("");

  // Payments parity — 4 rows per screenshot 7.54.47 PM (1).jpeg
  const [paymentsView, setPaymentsView] = useState<"pending-customers" | "pending-distributors" | "register" | "expense">("pending-customers");
  const [pendingViewMode, setPendingViewMode] = useState<"summary" | "detail">("summary");
  const [pendingCustomers, setPendingCustomers] = useState<any>(null);
  const [pendingDistributors, setPendingDistributors] = useState<any>(null);
  const [pendingCustomersQ, setPendingCustomersQ] = useState("");
  const [pendingDistributorsQ, setPendingDistributorsQ] = useState("");
  const [paymentsRegister, setPaymentsRegister] = useState<any>(null);
  const [paymentsRegisterType, setPaymentsRegisterType] = useState<string>("all");
  const [paymentsRegisterMode, setPaymentsRegisterMode] = useState<string>("all");
  const [paymentsRegisterQ, setPaymentsRegisterQ] = useState("");
  const [expenseRegister, setExpenseRegister] = useState<any>(null);
  const [expenseGroupBy, setExpenseGroupBy] = useState<"category" | "name">("category");
  const [expenseQ, setExpenseQ] = useState("");

  // Party parity — 5 rows per screenshot 7.54.50
  const [partyView, setPartyView] = useState<"customers" | "followups" | "ledger-customer" | "ledger-distributor" | "distributors">("customers");
  const [partyCustomersQ, setPartyCustomersQ] = useState("");
  const [partyCustomersSort, setPartyCustomersSort] = useState<"rfm" | "balance">("rfm");
  const [partyCustomersData, setPartyCustomersData] = useState<any>(null);
  const [partyDistributorsQ, setPartyDistributorsQ] = useState("");
  const [partyDistributorsData, setPartyDistributorsData] = useState<any>(null);
  const [partyFollowupsQ, setPartyFollowupsQ] = useState("");
  const [partyFollowupsData, setPartyFollowupsData] = useState<any>(null);
  const [ledgerCustomerId, setLedgerCustomerId] = useState("");
  const [ledgerSupplierId, setLedgerSupplierId] = useState("");
  const [ledgerCustomerData, setLedgerCustomerData] = useState<any>(null);
  const [ledgerDistributorData, setLedgerDistributorData] = useState<any>(null);
  const [ledgerCustomerSearch, setLedgerCustomerSearch] = useState("");
  const [ledgerSupplierSearch, setLedgerSupplierSearch] = useState("");
  const [ledgerCustomerOptions, setLedgerCustomerOptions] = useState<any[]>([]);
  const [ledgerSupplierOptions, setLedgerSupplierOptions] = useState<any[]>([]);

  // Order parity — 2 rows per screenshot 7.54.50 (1).jpeg
  const [orderView, setOrderView] = useState<"shortbook" | "purchase-orders">("shortbook");
  const [orderQ, setOrderQ] = useState("");
  const [orderSort, setOrderSort] = useState<"shortage" | "name">("shortage");
  const [shortbookData, setShortbookData] = useState<any>(null);
  const [purchaseOrdersData, setPurchaseOrdersData] = useState<any>(null);
  const [purchaseOrdersGroupBy, setPurchaseOrdersGroupBy] = useState<string>("product");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const { reportsApi } = await import("@/lib/api");
      const params = { from: fromDate, to: toDate };

      if (activeTab === "sales") {
        const d = await reportsApi.sales(params);
        setSalesData(d);
        // Parity: LocalWell sales catalog (6 rows) — load all in parallel, salesView picks which to show
        const [regInv, det, sum, doc, sched, party] = await Promise.all([
          reportsApi.salesRegister({ ...params, view: salesRegisterView, q: salesQ || undefined }),
          reportsApi.salesDetail({ ...params, q: salesQ || undefined }),
          reportsApi.salesSummary({ ...params, groupBy: salesSummaryGroupBy }),
          reportsApi.salesDoctor(params),
          reportsApi.salesSchedule({ ...params, schedule: salesScheduleFilter || undefined }),
          reportsApi.salesParty(params),
        ]);
        setSalesRegister(regInv);
        setSalesDetail(det);
        setSalesSummary(sum);
        setSalesDoctor(doc);
        setSalesSchedule(sched);
        setSalesParty(party);
      } else if (activeTab === "stock") {
        const [fast, slow, curr, exp, oc, adj] = await Promise.all([
          reportsApi.stockFast(params),
          reportsApi.stockSlow(params),
          reportsApi.stockCurrent(),
          reportsApi.stockExpired(params),
          reportsApi.stockOpeningClosing(params),
          reportsApi.stockAdjustments(params),
        ]);
        setStockFast(fast);
        setStockSlow(slow);
        setStockCurrent(curr);
        setStockExpired(exp);
        setStockOpeningClosing(oc);
        setStockAdjustments(adj);
        if (stockStatementMedicineId) {
          const stmt = await reportsApi.stockStatement({ medicineId: stockStatementMedicineId, ...params });
          setStockStatement(stmt);
        }
      } else if (activeTab === "purchase") {
        const d = await reportsApi.purchase(params);
        setPurchaseData(d);
        // Purchase parity (4 rows)
        const [purReg, purDet, purSum, purSched] = await Promise.all([
          reportsApi.purchaseRegister({ ...params, view: purchaseRegisterView, distributor: purchaseDistributor || undefined, q: purchaseQ || undefined }),
          reportsApi.purchaseDetail({ ...params, distributor: purchaseDistributor || undefined }),
          reportsApi.purchaseSummary({ ...params, groupBy: purchaseSummaryGroupBy }),
          reportsApi.purchaseSchedule({ ...params, schedule: purchaseScheduleFilter || undefined }),
        ]);
        setPurchaseRegister(purReg);
        setPurchaseDetail(purDet);
        setPurchaseSummary(purSum);
        setPurchaseSchedule(purSched);
      } else if (activeTab === "payments") {
        const [pc, pd, reg, exp] = await Promise.all([
          reportsApi.pendingCustomers({ view: pendingViewMode, q: pendingCustomersQ || undefined }),
          reportsApi.pendingDistributors({ view: pendingViewMode, q: pendingDistributorsQ || undefined }),
          reportsApi.paymentsRegister({
            from: fromDate, to: toDate,
            type: paymentsRegisterType !== "all" ? paymentsRegisterType : undefined,
            mode: paymentsRegisterMode !== "all" ? paymentsRegisterMode : undefined,
            q: paymentsRegisterQ || undefined,
          }),
          reportsApi.expenseRegister({ from: fromDate, to: toDate, groupBy: expenseGroupBy, q: expenseQ || undefined }),
        ]);
        setPendingCustomers(pc);
        setPendingDistributors(pd);
        setPaymentsRegister(reg);
        setExpenseRegister(exp);
      } else if (activeTab === "party") {
        const [pc, pd, fu] = await Promise.all([
          reportsApi.partyCustomers({ q: partyCustomersQ || undefined, sort: partyCustomersSort }),
          reportsApi.partyDistributors({ q: partyDistributorsQ || undefined }),
          reportsApi.partyFollowups({ from: fromDate, to: toDate, q: partyFollowupsQ || undefined }),
        ]);
        setPartyCustomersData(pc);
        setPartyDistributorsData(pd);
        setPartyFollowupsData(fu);
        // auto-load ledgers if an id has been selected
        if (ledgerCustomerId) {
          const lc = await reportsApi.partyLedger({ type: "customer", id: ledgerCustomerId, from: fromDate, to: toDate });
          setLedgerCustomerData(lc);
        }
        if (ledgerSupplierId) {
          const ls = await reportsApi.partyLedger({ type: "supplier", id: ledgerSupplierId, from: fromDate, to: toDate });
          setLedgerDistributorData(ls);
        }
      } else if (activeTab === "order") {
        const [sb, po] = await Promise.all([
          reportsApi.shortbook({ q: orderQ || undefined, sort: orderSort }),
          reportsApi.purchaseOrders({ from: fromDate, to: toDate, groupBy: purchaseOrdersGroupBy, q: orderQ || undefined }),
        ]);
        setShortbookData(sb);
        setPurchaseOrdersData(po);
      } else if (activeTab === "profit") {
        const d = await reportsApi.profit(params);
        setProfitData(d);
      } else if (activeTab === "inventory") {
        const d = await reportsApi.inventory({ status: invStatus === "all" ? undefined : invStatus });
        setInventoryData(d ?? []);
      } else if (activeTab === "tax") {
        const [t, g1, g2, b3, hsn, itc] = await Promise.all([
          reportsApi.tax(params),
          reportsApi.gstr1(params),
          reportsApi.gstr2(params),
          reportsApi.gstr3b(params),
          reportsApi.hsn(params),
          reportsApi.itc(params),
        ]);
        setTaxData(t);
        setGstr1Data(g1);
        setGstr2Data(g2);
        setGstr3bData(b3);
        setHsnData(hsn);
        setItcData(itc);
      }
    } catch (err) {
      console.error("Failed to load reports:", err);
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [activeTab, fromDate, toDate, invStatus, salesRegisterView, salesSummaryGroupBy, salesScheduleFilter, salesQ, stockStatementMedicineId, purchaseRegisterView, purchaseSummaryGroupBy, purchaseScheduleFilter, purchaseDistributor, purchaseQ, pendingViewMode, pendingCustomersQ, pendingDistributorsQ, paymentsRegisterType, paymentsRegisterMode, paymentsRegisterQ, expenseGroupBy, expenseQ, partyCustomersQ, partyCustomersSort, partyDistributorsQ, partyFollowupsQ, ledgerCustomerId, ledgerSupplierId, orderQ, orderSort, purchaseOrdersGroupBy]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadReports();
  }, [isAuthenticated, loadReports]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs: { value: ReportTab; label: string; icon: typeof FileText }[] = [
    { value: "sales", label: "Sales", icon: TrendingUp },
    { value: "stock", label: "Stock", icon: Package },
    { value: "purchase", label: "Purchase", icon: Package },
    { value: "payments", label: "Payments", icon: Wallet },
    { value: "profit", label: "Profit", icon: BarChart3 },
    { value: "inventory", label: "Inventory", icon: Package },
    { value: "tax", label: "GST Report", icon: FileText },
    { value: "party", label: "Party", icon: Users },
    { value: "order", label: "Order", icon: Receipt },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sales, purchase, profit, inventory and GST reports
          </p>
        </div>
      </div>

      {/* Date Range */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-sm border border-border/60 bg-card">
        <div>
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="mt-1 h-9 w-auto" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="mt-1 h-9 w-auto" />
        </div>
        <Button size="sm" variant="outline" onClick={() => { void loadReports(); }}>
          Apply
        </Button>
        {/* Quick ranges */}
        <div className="flex gap-1 ml-auto">
          {[[7, "7D"], [30, "30D"], [90, "90D"]].map(([days, label]) => (
            <Button key={days} size="sm" variant="ghost" className="text-xs h-7"
              onClick={() => {
                const to = new Date();
                const from = new Date(); from.setDate(from.getDate() - (days as number));
                setToDate(to.toISOString().split("T")[0]);
                setFromDate(from.toISOString().split("T")[0]);
              }}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as ReportTab)}>
        <TabsList className="grid grid-cols-9 w-full">
          {tabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs gap-1">
              <tab.icon className="h-3 w-3" />{tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── SALES REPORTS (LocalWell catalog, minus Delivery Challans) ── */}
        <TabsContent value="sales" className="space-y-4">
          {/* Search + catalog */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-52">
              <Input placeholder="Search customer / invoice / phone (filters Register & Detail)" value={salesQ} onChange={e => setSalesQ(e.target.value)} className="h-9" />
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadReports()}>Apply search</Button>
          </div>

          {/* LocalWell catalog — 6 rows */}
          <div className="grid grid-cols-1 gap-2">
            {([
              ["register", "Sales Register", "Invoice-wise & date-wise: taxable, GST, net profit, adj amount, payable, margin%"],
              ["detail", "Sale & Return Product-Level Detail", "Per-medicine saleQty / returnQty / netQty, taxable, GST, margin%"],
              ["summary", "Sales & Returns Summary", "Group by product / company / category / customer / supplier / user"],
              ["doctor", "Sales Register Doctor-Wise", "Invoices linked to a doctor"],
              ["schedule", "Scheduled Drug Register", "Filter by schedule (H, H1, X, etc.)"],
              ["party", "Sales Register Party-Wise", "Filter by customer / party"],
            ] as const).map(([value, label, desc]) => (
              <button key={value} type="button" onClick={() => setSalesView(value)}
                className={`text-left p-3 rounded-sm border flex items-center justify-between gap-3 ${salesView === value ? "bg-card border-primary/40 shadow-sm" : "bg-card border-border/60 hover:border-border"}`}>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${salesView === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{salesView === value ? "Open" : "View"}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* ── Register ── */}
              {salesView === "register" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Sales Register — {salesRegisterView === "invoice" ? "Invoice-wise" : "Date-wise"}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {(["invoice", "date"] as const).map(v => (
                          <Button key={v} size="sm" variant={salesRegisterView === v ? "default" : "outline"} className="h-7 text-xs" onClick={() => setSalesRegisterView(v)}>{v === "invoice" ? "By Invoice" : "By Date"}</Button>
                        ))}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => {
                        const rows = salesRegisterView === "date" ? (salesRegister?.buckets ?? []) : (salesRegister?.invoices ?? salesRegister?.rows ?? []);
                        exportCSV(rows, salesRegisterView === "date" ? "sales_register_date" : "sales_register_invoice", salesRegisterView === "date"
                          ? [{ key: "date", header: "Date" }, { key: "invoiceCount", header: "Invoices" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "payable", header: "Payable" }, { key: "netProfit", header: "Net Profit" }, { key: "marginPercent", header: "Margin %" }, { key: "adjAmount", header: "Adj Amt" }]
                          : [{ key: "invoiceNo", header: "Invoice No" }, { key: "date", header: "Date" }, { key: "customerName", header: "Customer" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "netProfit", header: "Net Profit" }, { key: "adjAmount", header: "Adj Amt" }, { key: "payable", header: "Payable" }, { key: "balance", header: "Balance" }, { key: "marginPercent", header: "Margin %" }]);
                      }}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                    </div>
                  </div>
                  {salesRegister?.summary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Invoices</p><p className="text-sm font-semibold tabular-nums">{salesRegister.summary.invoiceCount ?? 0}</p></div>
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Taxable</p><p className="text-sm font-semibold tabular-nums">₹{Number(salesRegister.summary.taxable ?? 0).toFixed(2)}</p></div>
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">GST</p><p className="text-sm font-semibold tabular-nums">₹{Number(salesRegister.summary.gst ?? 0).toFixed(2)}</p></div>
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Net Profit</p><p className="text-sm font-semibold tabular-nums text-green-700">₹{Number(salesRegister.summary.netProfit ?? 0).toFixed(2)}</p></div>
                    </div>
                  )}
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    {salesRegisterView === "date" ? (
                      <Table>
                        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Invoices</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Net Profit</TableHead><TableHead className="text-right">Adj Amt</TableHead><TableHead className="text-right">Payable</TableHead><TableHead className="text-right">Margin%</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(salesRegister?.buckets ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No sales in period</TableCell></TableRow>
                            : (salesRegister.buckets ?? []).map((b: any) => (
                              <TableRow key={b.date}><TableCell className="text-sm">{formatDate(b.date)}</TableCell><TableCell className="text-right tabular-nums">{b.invoiceCount}</TableCell><TableCell className="text-right tabular-nums">₹{b.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{b.gst.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums text-green-700">₹{b.netProfit.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{b.adjAmount.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{b.payable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{b.marginPercent.toFixed(1)}%</TableCell></TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <Table>
                        <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Net Profit</TableHead><TableHead className="text-right">Adj</TableHead><TableHead className="text-right">Payable</TableHead><TableHead className="text-right">Bal</TableHead><TableHead className="text-right">Margin%</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(salesRegister?.invoices ?? salesRegister?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">No sales in period</TableCell></TableRow>
                            : (salesRegister.invoices ?? salesRegister.rows ?? []).map((r: any) => (
                              <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.invoiceNo}</TableCell><TableCell className="text-xs text-muted-foreground">{formatDate(r.date)}</TableCell><TableCell className="text-sm">{r.customerName}</TableCell><TableCell className="text-right tabular-nums">₹{r.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.gst.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums text-green-700">₹{r.netProfit.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{r.adjAmount.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums font-medium">₹{r.payable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.balance.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{r.marginPercent.toFixed(1)}%</TableCell></TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </Card>
              )}

              {/* ── Detail ── */}
              {salesView === "detail" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Sale & Return — Product-Level Detail</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(salesDetail?.rows ?? [], "sales_detail_product", [
                      { key: "medicineName", header: "Medicine" }, { key: "saleQty", header: "Sale Qty" }, { key: "returnQty", header: "Return Qty" }, { key: "netQty", header: "Net Qty" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "marginPercent", header: "Margin %" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead className="text-right">Sale Qty</TableHead><TableHead className="text-right">Return Qty</TableHead><TableHead className="text-right">Net Qty</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Margin%</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(salesDetail?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No product sales in period</TableCell></TableRow>
                          : (salesDetail.rows ?? []).map((r: any) => (
                            <TableRow key={r.medicineId ?? r.medicineName}><TableCell className="text-sm">{r.medicineName}</TableCell><TableCell className="text-right tabular-nums">{r.saleQty}</TableCell><TableCell className="text-right tabular-nums text-orange-600">{r.returnQty}</TableCell><TableCell className="text-right tabular-nums font-medium">{r.netQty}</TableCell><TableCell className="text-right tabular-nums">₹{r.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.gst.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{r.marginPercent.toFixed(1)}%</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Summary ── */}
              {salesView === "summary" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Sales & Returns Summary</p>
                    <div className="flex items-center gap-2">
                      <Select value={salesSummaryGroupBy} onValueChange={v => setSalesSummaryGroupBy(v)}>
                        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Group by" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product">Product</SelectItem>
                          <SelectItem value="company">Company</SelectItem>
                          <SelectItem value="category">Category</SelectItem>
                          <SelectItem value="customer">Customer</SelectItem>
                          <SelectItem value="supplier">Supplier</SelectItem>
                          <SelectItem value="user">User</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => exportCSV(salesSummary?.rows ?? [], `sales_summary_${salesSummaryGroupBy}`, [
                        { key: "group", header: salesSummaryGroupBy }, { key: "saleQty", header: "Sale Qty" }, { key: "returnQty", header: "Return Qty" }, { key: "netQty", header: "Net Qty" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "payable", header: "Payable" },
                      ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                    </div>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead className="capitalize">{salesSummaryGroupBy}</TableHead><TableHead className="text-right">Sale Qty</TableHead><TableHead className="text-right">Return Qty</TableHead><TableHead className="text-right">Net Qty</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Payable</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(salesSummary?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No data for this group in period</TableCell></TableRow>
                          : (salesSummary.rows ?? []).map((r: any, i: number) => (
                            <TableRow key={`${r.group}-${i}`}><TableCell className="text-sm">{r.group}</TableCell><TableCell className="text-right tabular-nums">{r.saleQty}</TableCell><TableCell className="text-right tabular-nums text-orange-600">{r.returnQty}</TableCell><TableCell className="text-right tabular-nums font-medium">{r.netQty}</TableCell><TableCell className="text-right tabular-nums">₹{r.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.gst.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums font-medium">₹{r.payable.toFixed(2)}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Doctor ── */}
              {salesView === "doctor" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Sales Register — Doctor-Wise</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(salesDoctor?.rows ?? salesDoctor?.invoices ?? [], "sales_doctor", [
                      { key: "invoiceNo", header: "Invoice No" }, { key: "date", header: "Date" }, { key: "customerName", header: "Customer" }, { key: "doctorName", header: "Doctor" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "payable", header: "Payable" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Doctor</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Payable</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(salesDoctor?.rows ?? salesDoctor?.invoices ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No doctor-linked sales in period</TableCell></TableRow>
                          : (salesDoctor.rows ?? salesDoctor.invoices ?? []).map((r: any) => (
                            <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.invoiceNo}</TableCell><TableCell className="text-xs text-muted-foreground">{formatDate(r.date)}</TableCell><TableCell className="text-sm">{r.customerName}</TableCell><TableCell className="text-sm">{r.doctorName ?? "—"}</TableCell><TableCell className="text-right tabular-nums">₹{r.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.gst.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums font-medium">₹{r.payable.toFixed(2)}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Schedule ── */}
              {salesView === "schedule" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Scheduled Drug Register</p>
                    <div className="flex items-center gap-2">
                      <Select value={salesScheduleFilter} onValueChange={v => setSalesScheduleFilter(v)}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="H">H</SelectItem>
                          <SelectItem value="H1">H1</SelectItem>
                          <SelectItem value="X">X</SelectItem>
                          <SelectItem value="G">G</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => exportCSV(salesSchedule?.rows ?? salesSchedule?.invoices ?? [], `sales_schedule_${salesScheduleFilter}`, [
                        { key: "invoiceNo", header: "Invoice No" }, { key: "date", header: "Date" }, { key: "customerName", header: "Customer" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "quantity", header: "Qty" },
                      ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                    </div>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(salesSchedule?.rows ?? salesSchedule?.invoices ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No {salesScheduleFilter}-schedule sales in period</TableCell></TableRow>
                          : (salesSchedule.rows ?? salesSchedule.invoices ?? []).map((r: any) => (
                            <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.invoiceNo}</TableCell><TableCell className="text-xs text-muted-foreground">{formatDate(r.date)}</TableCell><TableCell className="text-sm">{r.customerName}</TableCell><TableCell className="text-right tabular-nums">{r.quantity}</TableCell><TableCell className="text-right tabular-nums">₹{r.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.gst.toFixed(2)}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Party ── */}
              {salesView === "party" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Sales Register — Party-Wise</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(salesParty?.rows ?? salesParty?.invoices ?? [], "sales_party", [
                      { key: "invoiceNo", header: "Invoice No" }, { key: "date", header: "Date" }, { key: "customerName", header: "Customer" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "payable", header: "Payable" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Net Profit</TableHead><TableHead className="text-right">Payable</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(salesParty?.rows ?? salesParty?.invoices ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No sales for this party in period — adjust date or search</TableCell></TableRow>
                          : (salesParty.rows ?? salesParty.invoices ?? []).map((r: any) => (
                            <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.invoiceNo}</TableCell><TableCell className="text-xs text-muted-foreground">{formatDate(r.date)}</TableCell><TableCell className="text-sm">{r.customerName}</TableCell><TableCell className="text-right tabular-nums">₹{r.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.gst.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums text-green-700">₹{r.netProfit.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums font-medium">₹{r.payable.toFixed(2)}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── STOCK REPORTS (7 rows; Duplicate Across Branches skipped) ── */}
        <TabsContent value="stock" className="space-y-4">
          {/* catalog */}
          <div className="grid grid-cols-1 gap-2">
            {([
              ["fast", "Fast-Moving Stock", "Ranked by qty sold desc — current stock + last sold"],
              ["slow", "Slow-Moving Stock", "Ascending — includes zero-sold in period"],
              ["current", "Current Stock with Value", "Sale / MRP / Cost valuation — total value card"],
              ["expired", "Expired & Near-Expiry", "Expired (≤ today) + Near (≤ 90 days) — expiry buckets"],
              ["opening-closing", "Opening/Closing Stock Statement", "Per product O: opening, C: closing from inventory ledger"],
              ["statement", "Product Stock Statement", "Full transaction ledger for one medicine — running balance"],
              ["adjustments", "Stock Adjustments Register", "Adjustment / Damage / Expired — grouped by user"],
            ] as const).map(([value, label, desc]) => (
              <button key={value} type="button" onClick={() => setStockView(value as any)}
                className={`text-left p-3 rounded-sm border flex items-center justify-between gap-3 ${stockView === value ? "bg-card border-primary/40 shadow-sm" : "bg-card border-border/60 hover:border-border"}`}>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${stockView === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{stockView === value ? "Open" : "View"}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Fast */}
              {stockView === "fast" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Fast-Moving — ranked by qty sold desc</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(stockFast?.rows ?? [], "stock_fast", [
                      { key: "medicineName", header: "Product" }, { key: "brand", header: "Company" }, { key: "qtySold", header: "Qty Sold" }, { key: "currentStock", header: "Current Stock" }, { key: "lastSold", header: "Last Sold" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Company</TableHead><TableHead className="text-right">Qty Sold</TableHead><TableHead className="text-right">Stock</TableHead><TableHead>Last Sold</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(stockFast?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No sales in period</TableCell></TableRow>
                          : (stockFast.rows ?? []).map((r: any) => (
                            <TableRow key={r.medicineId}><TableCell className="text-sm font-medium">{r.medicineName}</TableCell><TableCell className="text-sm text-muted-foreground">{r.brand ?? "—"}</TableCell><TableCell className="text-right tabular-nums font-semibold">{r.qtySold}</TableCell><TableCell className="text-right tabular-nums">{r.currentStock}</TableCell><TableCell className="text-xs text-muted-foreground">{r.lastSold ? formatDate(r.lastSold) : "—"}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* Slow */}
              {stockView === "slow" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Slow-Moving — ascending, zero-sold included</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(stockSlow?.rows ?? [], "stock_slow", [
                      { key: "medicineName", header: "Product" }, { key: "brand", header: "Company" }, { key: "qtySold", header: "Qty Sold" }, { key: "currentStock", header: "Current Stock" }, { key: "lastSold", header: "Last Sold" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Company</TableHead><TableHead className="text-right">Qty Sold</TableHead><TableHead className="text-right">Stock</TableHead><TableHead>Last Sold</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(stockSlow?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No medicines in period</TableCell></TableRow>
                          : (stockSlow.rows ?? []).map((r: any) => (
                            <TableRow key={r.medicineId}><TableCell className="text-sm font-medium">{r.medicineName}</TableCell><TableCell className="text-sm text-muted-foreground">{r.brand ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{r.qtySold}</TableCell><TableCell className="text-right tabular-nums">{r.currentStock}</TableCell><TableCell className="text-xs text-muted-foreground">{r.lastSold ? formatDate(r.lastSold) : "—"}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* Current */}
              {stockView === "current" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Current Stock with Value</p>
                    <div className="flex gap-2 text-xs">
                      <span className="px-2 py-1 rounded bg-muted">Packs: <b className="tabular-nums">{stockCurrent?.totalPacks ?? 0}</b></span>
                      <span className="px-2 py-1 rounded bg-muted">Sale: <b className="tabular-nums">₹{(stockCurrent?.totalValue ?? 0).toFixed(2)}</b></span>
                      <span className="px-2 py-1 rounded bg-muted">Cost: <b className="tabular-nums">₹{(stockCurrent?.totalCost ?? 0).toFixed(2)}</b></span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(stockCurrent?.rows ?? [], "stock_current", [
                      { key: "medicineName", header: "Product" }, { key: "brand", header: "Company" }, { key: "stockPacks", header: "Stock" }, { key: "saleValue", header: "Sale Value" }, { key: "mrpValue", header: "MRP Value" }, { key: "costValue", header: "Cost Value" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Company</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Sale Value</TableHead><TableHead className="text-right">MRP Value</TableHead><TableHead className="text-right">Cost Value</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(stockCurrent?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No stock</TableCell></TableRow>
                          : (stockCurrent.rows ?? []).map((r: any) => (
                            <TableRow key={r.medicineId}><TableCell className="text-sm font-medium">{r.medicineName}</TableCell><TableCell className="text-sm text-muted-foreground">{r.brand ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{r.stockPacks}</TableCell><TableCell className="text-right tabular-nums">₹{r.saleValue.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.mrpValue.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums text-muted-foreground">₹{r.costValue.toFixed(2)}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* Expired */}
              {stockView === "expired" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Expired / Near-Expiry — <Badge variant="destructive" className="text-[10px]">Expired {stockExpired?.expiredCount ?? 0}</Badge> <Badge variant="secondary" className="text-[10px] bg-orange-100 text-orange-700 border-orange-300 ml-1">Near {stockExpired?.nearCount ?? 0}</Badge></p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(stockExpired?.rows ?? [], "stock_expired", [
                      { key: "medicineName", header: "Product" }, { key: "batchNo", header: "Batch" }, { key: "expiryDate", header: "Expiry" }, { key: "quantity", header: "Qty" }, { key: "status", header: "Status" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead>Expiry</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(stockExpired?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No expired / near-expiry batches</TableCell></TableRow>
                          : (stockExpired.rows ?? []).map((r: any) => (
                            <TableRow key={r.batchId}><TableCell className="text-sm font-medium">{r.medicineName}</TableCell><TableCell className="font-mono text-xs">{r.batchNo}</TableCell><TableCell className="text-sm">{formatDate(r.expiryDate)}</TableCell><TableCell className="text-right tabular-nums">{r.quantity}</TableCell><TableCell>{r.status === "expired" ? <Badge variant="destructive" className="text-[10px]">Expired</Badge> : <Badge variant="secondary" className="text-[10px] bg-orange-100 text-orange-700 border-orange-300">Near ({r.daysToExpiry}d)</Badge>}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* Opening/Closing */}
              {stockView === "opening-closing" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Opening / Closing Stock Statement</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(stockOpeningClosing?.rows ?? [], "stock_opening_closing", [
                      { key: "medicineName", header: "Product" }, { key: "opening", header: "Opening (O)" }, { key: "closing", header: "Closing (C)" }, { key: "inRange", header: "Net In Period" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Company</TableHead><TableHead className="text-right">O:</TableHead><TableHead className="text-right">C:</TableHead><TableHead className="text-right">Net In Period</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(stockOpeningClosing?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No inventory transactions in period</TableCell></TableRow>
                          : (stockOpeningClosing.rows ?? []).map((r: any) => (
                            <TableRow key={r.medicineId}><TableCell className="text-sm font-medium">{r.medicineName}</TableCell><TableCell className="text-sm text-muted-foreground">{r.brand ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{r.opening}</TableCell><TableCell className="text-right tabular-nums font-semibold">{r.closing}</TableCell><TableCell className="text-right tabular-nums text-muted-foreground">{r.inRange}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* Statement */}
              {stockView === "statement" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <p className="text-sm font-semibold">Product Stock Statement — ledger with running balance</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Medicine ID (or pick via search below)" value={stockStatementMedicineId} onChange={e => setStockStatementMedicineId(e.target.value)} className="h-9 flex-1 min-w-52" />
                    <Button size="sm" onClick={async () => {
                      if (!stockStatementMedicineId) { toast.error("Enter a medicine ID"); return; }
                      const { reportsApi } = await import("@/lib/api");
                      const d = await reportsApi.stockStatement({ medicineId: stockStatementMedicineId, from: fromDate, to: toDate });
                      setStockStatement(d);
                    }}>Load</Button>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(stockStatement?.entries ?? stockStatement?.rows ?? [], "stock_statement", [
                      { key: "date", header: "Date" }, { key: "type", header: "Type" }, { key: "quantity", header: "Qty" }, { key: "runningBalance", header: "Running Balance" }, { key: "reason", header: "Reason" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Search medicine by name" value={stockMedicineSearch} onChange={e => setStockMedicineSearch(e.target.value)} className="h-8 flex-1 min-w-40" />
                    <Button size="sm" variant="outline" onClick={async () => {
                      const { medicinesApi } = await import("@/lib/api");
                      const d: any = await medicinesApi.list({ search: stockMedicineSearch, limit: 10 });
                      const rows = d?.data ?? d?.medicines ?? d ?? [];
                      setStockMedicineOptions(Array.isArray(rows) ? rows : []);
                    }}>Search</Button>
                  </div>
                  {stockMedicineOptions.length > 0 && (
                    <div className="border rounded-sm divide-y max-h-40 overflow-auto">
                      {stockMedicineOptions.map((m: any) => (
                        <button key={m.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between" onClick={() => { setStockStatementMedicineId(m.id); setStockMedicineOptions([]); }}>
                          <span>{m.name} {m.brand ? `· ${m.brand}` : ""}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{m.id.slice(0, 8)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Running Balance</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(stockStatement?.entries ?? stockStatement?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No entries — pick a medicine and Load</TableCell></TableRow>
                          : (stockStatement.entries ?? stockStatement.rows ?? []).map((e: any) => (
                            <TableRow key={e.id}><TableCell className="text-sm">{formatDate(e.date ?? String(e.createdAt).split("T")[0])}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">{e.type}</Badge></TableCell><TableCell className={`text-right tabular-nums ${Number(e.quantity) < 0 ? "text-red-600" : "text-green-700"}`}>{e.quantity}</TableCell><TableCell className="text-right tabular-nums font-semibold">{e.runningBalance}</TableCell><TableCell className="text-sm text-muted-foreground">{e.reason ?? "—"}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* Adjustments */}
              {stockView === "adjustments" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Stock Adjustments Register — {stockAdjustments?.summary?.total ?? 0} entries</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(stockAdjustments?.rows ?? [], "stock_adjustments", [
                      { key: "medicineName", header: "Product" }, { key: "type", header: "Type" }, { key: "quantity", header: "Qty" }, { key: "date", header: "Date" }, { key: "reason", header: "Reason" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  {stockAdjustments?.grouped?.length ? (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {stockAdjustments.grouped.map((g: any) => (
                        <span key={g.userId} className="px-2 py-1 rounded bg-muted">User {g.userId.slice(0, 8)}: <b>{g.count}</b></span>
                      ))}
                    </div>
                  ) : null}
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Date</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(stockAdjustments?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No adjustment / damage / expired entries in period</TableCell></TableRow>
                          : (stockAdjustments.rows ?? []).map((r: any) => (
                            <TableRow key={r.id}><TableCell className="text-sm font-medium">{r.medicineName}</TableCell><TableCell><Badge variant="secondary" className="text-[10px]">{r.type}</Badge></TableCell><TableCell className="text-right tabular-nums">{r.quantity}</TableCell><TableCell className="text-sm text-muted-foreground">{formatDate(r.date)}</TableCell><TableCell className="text-sm text-muted-foreground">{r.reason ?? "—"}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── PURCHASE REPORTS (LocalWell 4 rows per 7.54.47 PM.jpeg) ── */}
        <TabsContent value="purchase" className="space-y-4">
          {/* Filters: distributor + free-text search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-40">
              <Input placeholder="Distributor (supplier) filter" value={purchaseDistributor} onChange={e => setPurchaseDistributor(e.target.value)} className="h-9" />
            </div>
            <div className="flex-1 min-w-40">
              <Input placeholder="Search bill / supplier (q)" value={purchaseQ} onChange={e => setPurchaseQ(e.target.value)} className="h-9" />
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadReports()}>Apply filters</Button>
          </div>

          {/* 4-row catalog */}
          <div className="grid grid-cols-1 gap-2">
            {([
              ["register", "Purchase Register", "Per bill or per date buckets — taxable / GST / profit / margin% — filter by distributor or name"],
              ["detail", "Purchase & Return Product-Level Detail", "Per-medicine purchQty / returnQty / netQty, taxable, GST, margin% = (mrp − rate)/mrp"],
              ["summary", "Purchases & Returns Summary", "Group by product / supplier / company (medicines.brand)"],
              ["schedule", "Purchase Register Drug Schedule-Wise", "Filter by medicines.schedule (H, H1, X, …)"],
            ] as const).map(([value, label, desc]) => (
              <button key={value} type="button" onClick={() => setPurchaseView(value)}
                className={`text-left p-3 rounded-sm border flex items-center justify-between gap-3 ${purchaseView === value ? "bg-card border-primary/40 shadow-sm" : "bg-card border-border/60 hover:border-border"}`}>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${purchaseView === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{purchaseView === value ? "Open" : "View"}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* ── Purchase Register ── */}
              {purchaseView === "register" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Purchase Register — {purchaseRegisterView === "invoice" ? "Per Bill" : "Per Date"}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {(["invoice", "date"] as const).map(v => (
                          <Button key={v} size="sm" variant={purchaseRegisterView === v ? "default" : "outline"} className="h-7 text-xs" onClick={() => setPurchaseRegisterView(v)}>{v === "invoice" ? "By Bill" : "By Date"}</Button>
                        ))}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => {
                        const rows = purchaseRegisterView === "date" ? (purchaseRegister?.buckets ?? []) : (purchaseRegister?.bills ?? purchaseRegister?.rows ?? []);
                        exportCSV(rows, purchaseRegisterView === "date" ? "purchase_register_date" : "purchase_register_bill",
                          purchaseRegisterView === "date"
                            ? [{ key: "date", header: "Date" }, { key: "billCount", header: "Bills" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "payable", header: "Payable" }, { key: "profit", header: "Profit" }, { key: "marginPercent", header: "Margin %" }]
                            : [{ key: "billNo", header: "Bill No" }, { key: "billDate", header: "Date" }, { key: "supplierName", header: "Supplier" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "profit", header: "Profit" }, { key: "marginPercent", header: "Margin %" }, { key: "grandTotal", header: "Grand Total" }]);
                      }}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                    </div>
                  </div>
                  {purchaseRegister?.summary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Bills</p><p className="text-sm font-semibold tabular-nums">{purchaseRegister.summary.billCount ?? purchaseRegister.summary.invoiceCount ?? 0}</p></div>
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Taxable</p><p className="text-sm font-semibold tabular-nums">₹{Number(purchaseRegister.summary.taxable ?? 0).toFixed(2)}</p></div>
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">GST</p><p className="text-sm font-semibold tabular-nums">₹{Number(purchaseRegister.summary.gst ?? 0).toFixed(2)}</p></div>
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Payable</p><p className="text-sm font-semibold tabular-nums">₹{Number(purchaseRegister.summary.payable ?? purchaseRegister.summary.totalPurchase ?? 0).toFixed(2)}</p></div>
                    </div>
                  )}
                  {/* legacy total cards kept via purchaseData if period has no filtered bills */}
                  {purchaseData && !purchaseRegister && (
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="p-3 border-border/60"><p className="text-xs text-muted-foreground">Total Purchase</p><p className="text-lg font-semibold tabular-nums">₹{Math.round(purchaseData.summary?.totalPurchase ?? 0).toLocaleString("en-IN")}</p></Card>
                      <Card className="p-3 border-border/60"><p className="text-xs text-muted-foreground">Total GST</p><p className="text-lg font-semibold tabular-nums">₹{Math.round(purchaseData.summary?.totalGst ?? 0).toLocaleString("en-IN")}</p></Card>
                    </div>
                  )}
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    {purchaseRegisterView === "date" ? (
                      <Table>
                        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Bills</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Payable</TableHead><TableHead className="text-right">Profit</TableHead><TableHead className="text-right">Margin%</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(purchaseRegister?.buckets ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No purchases in period</TableCell></TableRow>
                            : (purchaseRegister.buckets ?? []).map((b: any) => (
                              <TableRow key={b.date}><TableCell className="text-sm">{formatDate(b.date)}</TableCell><TableCell className="text-right tabular-nums">{b.billCount ?? b.invoiceCount}</TableCell><TableCell className="text-right tabular-nums">₹{b.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{b.gst.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums font-medium">₹{b.payable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums text-green-700">₹{Number(b.profit ?? b.netProfit ?? 0).toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{Number(b.marginPercent ?? 0).toFixed(1)}%</TableCell></TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <Table>
                        <TableHeader><TableRow><TableHead>Bill No.</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Profit</TableHead><TableHead className="text-right">Margin%</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(purchaseRegister?.bills ?? purchaseRegister?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No purchases in this period — adjust date or filters</TableCell></TableRow>
                            : (purchaseRegister.bills ?? purchaseRegister.rows ?? []).map((bill: any) => (
                              <TableRow key={bill.id}>
                                <TableCell className="font-mono text-xs">{bill.billNo}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{formatDate(bill.billDate ?? bill.date ?? bill.createdAt)}</TableCell>
                                <TableCell className="text-sm">{bill.supplierName || bill.distributor || "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">₹{bill.taxable.toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">₹{bill.gst.toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums text-green-700">₹{Number(bill.profit ?? bill.netProfit ?? 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums">{Number(bill.marginPercent ?? 0).toFixed(1)}%</TableCell>
                                <TableCell className="text-right tabular-nums font-medium">₹{bill.grandTotal.toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </Card>
              )}

              {/* ── Purchase & Return Product-Level Detail ── */}
              {purchaseView === "detail" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Purchase & Return — Product-Level Detail</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(purchaseDetail?.rows ?? [], "purchase_detail_product", [
                      { key: "medicineName", header: "Medicine" }, { key: "purchQty", header: "Purch Qty" }, { key: "returnQty", header: "Return Qty" }, { key: "netQty", header: "Net Qty" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "marginPercent", header: "Margin %" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead className="text-right">Purch Qty</TableHead><TableHead className="text-right">Return Qty</TableHead><TableHead className="text-right">Net Qty</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Margin%</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(purchaseDetail?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No purchase line items in period</TableCell></TableRow>
                          : (purchaseDetail.rows ?? []).map((r: any) => (
                            <TableRow key={r.medicineId ?? r.medicineName}><TableCell className="text-sm">{r.medicineName}</TableCell><TableCell className="text-right tabular-nums">{r.purchQty ?? r.quantity ?? r.saleQty}</TableCell><TableCell className="text-right tabular-nums text-orange-600">{r.returnQty}</TableCell><TableCell className="text-right tabular-nums font-medium">{r.netQty}</TableCell><TableCell className="text-right tabular-nums">₹{r.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.gst.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{r.marginPercent.toFixed(1)}%</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Purchases & Returns Summary ── */}
              {purchaseView === "summary" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Purchases & Returns Summary</p>
                    <div className="flex items-center gap-2">
                      <Select value={purchaseSummaryGroupBy} onValueChange={v => setPurchaseSummaryGroupBy(v)}>
                        <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Group by" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product">Product</SelectItem>
                          <SelectItem value="supplier">Supplier</SelectItem>
                          <SelectItem value="company">Company</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => exportCSV(purchaseSummary?.rows ?? [], `purchase_summary_${purchaseSummaryGroupBy}`, [
                        { key: "group", header: purchaseSummaryGroupBy }, { key: "purchQty", header: "Purch Qty" }, { key: "returnQty", header: "Return Qty" }, { key: "netQty", header: "Net Qty" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" }, { key: "payable", header: "Payable" },
                      ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                    </div>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead className="capitalize">{purchaseSummaryGroupBy}</TableHead><TableHead className="text-right">Purch Qty</TableHead><TableHead className="text-right">Return Qty</TableHead><TableHead className="text-right">Net Qty</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead><TableHead className="text-right">Payable</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(purchaseSummary?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No data for this group in period</TableCell></TableRow>
                          : (purchaseSummary.rows ?? []).map((r: any, i: number) => (
                            <TableRow key={`${r.group}-${i}`}><TableCell className="text-sm">{r.group}</TableCell><TableCell className="text-right tabular-nums">{r.purchQty ?? r.quantity ?? r.saleQty}</TableCell><TableCell className="text-right tabular-nums text-orange-600">{r.returnQty}</TableCell><TableCell className="text-right tabular-nums font-medium">{r.netQty}</TableCell><TableCell className="text-right tabular-nums">₹{r.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.gst.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums font-medium">₹{r.payable.toFixed(2)}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Purchase Register Drug Schedule-Wise ── */}
              {purchaseView === "schedule" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Purchase Register — Drug Schedule-Wise</p>
                    <div className="flex items-center gap-2">
                      <Select value={purchaseScheduleFilter} onValueChange={v => setPurchaseScheduleFilter(v)}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="H">H</SelectItem>
                          <SelectItem value="H1">H1</SelectItem>
                          <SelectItem value="X">X</SelectItem>
                          <SelectItem value="G">G</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => exportCSV(purchaseSchedule?.rows ?? purchaseSchedule?.bills ?? [], `purchase_schedule_${purchaseScheduleFilter}`, [
                        { key: "billNo", header: "Bill No" }, { key: "billDate", header: "Date" }, { key: "supplierName", header: "Supplier" }, { key: "quantity", header: "Qty" }, { key: "taxable", header: "Taxable" }, { key: "gst", header: "GST" },
                      ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                    </div>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Bill No.</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">GST</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(purchaseSchedule?.rows ?? purchaseSchedule?.bills ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No {purchaseScheduleFilter}-schedule purchases in period</TableCell></TableRow>
                          : (purchaseSchedule.rows ?? purchaseSchedule.bills ?? []).map((r: any) => (
                            <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.billNo}</TableCell><TableCell className="text-xs text-muted-foreground">{formatDate(r.billDate ?? r.date)}</TableCell><TableCell className="text-sm">{r.supplierName}</TableCell><TableCell className="text-right tabular-nums">{r.quantity ?? r.purchQty}</TableCell><TableCell className="text-right tabular-nums">₹{r.taxable.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{r.gst.toFixed(2)}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── PAYMENTS REPORTS (LocalWell 4 rows per 7.54.47 PM (1).jpeg) ── */}
        <TabsContent value="payments" className="space-y-4">
          {/* catalog — 4 rows */}
          <div className="grid grid-cols-1 gap-2">
            {([
              ["pending-customers", "Pending Payment for Customers", "Customers with balance > 0, ordered by balance desc — summary total + count, detail rows with phone + last invoice date, q search"],
              ["pending-distributors", "Pending Payments for Distributors", "Suppliers with balance > 0 — same summary/detail + q search"],
              ["register", "Payments Register", "All voided=false payments in period — filter type (received/paid/expense) + paymentMode, joined party name; summary totalReceived/totalPaid/totalExpense"],
              ["expense", "Expense Register", "type=expense only — grouped by category (pass-through GST hint in category) or by description (groupBy=name), date range + q"],
            ] as const).map(([value, label, desc]) => (
              <button key={value} type="button" onClick={() => setPaymentsView(value as any)}
                className={`text-left p-3 rounded-sm border flex items-center justify-between gap-3 ${paymentsView === value ? "bg-card border-primary/40 shadow-sm" : "bg-card border-border/60 hover:border-border"}`}>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${paymentsView === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{paymentsView === value ? "Open" : "View"}</span>
              </button>
            ))}
          </div>

          {/* Summary / Detail toggle shared by pending rows */}
          {(paymentsView === "pending-customers" || paymentsView === "pending-distributors") && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">View</span>
              <div className="flex gap-1">
                {(["summary", "detail"] as const).map(v => (
                  <Button key={v} size="sm" variant={pendingViewMode === v ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setPendingViewMode(v)}>{v}</Button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* ── Pending Customers ── */}
              {paymentsView === "pending-customers" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Pending Payment — Customers</p>
                    <Button size="sm" variant="outline" onClick={() => {
                      const rows = pendingCustomers?.rows ?? pendingCustomers?.customers ?? [];
                      exportCSV(rows.length ? rows : [{ name: "—", balance: pendingCustomers?.totalDue ?? 0 }], "pending_customers",
                        [{ key: "name", header: "Customer" }, { key: "phone", header: "Phone" }, { key: "balance", header: "Balance (₹)" }, { key: "lastInvoiceDate", header: "Last Invoice" }]);
                    }}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Search name or phone (q)" value={pendingCustomersQ} onChange={e => setPendingCustomersQ(e.target.value)} className="h-8 flex-1 min-w-40" />
                    <Button size="sm" variant="outline" onClick={() => void loadReports()}>Apply</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Total Due</p><p className="text-lg font-semibold tabular-nums">₹{Number(pendingCustomers?.totalDue ?? pendingCustomers?.summary?.totalDue ?? 0).toFixed(2)}</p></div>
                    <div className="p-3 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Customers Owing</p><p className="text-lg font-semibold tabular-nums">{pendingCustomers?.count ?? pendingCustomers?.summary?.count ?? 0}</p></div>
                  </div>
                  {pendingViewMode === "detail" && (
                    <div className="border rounded-sm overflow-hidden overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Last Invoice</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(pendingCustomers?.rows ?? pendingCustomers?.customers ?? []).length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No pending customers{pendingCustomersQ ? ` for “${pendingCustomersQ}”` : ""}</TableCell></TableRow>
                            : (pendingCustomers.rows ?? pendingCustomers.customers ?? []).map((r: any) => (
                              <TableRow key={r.id}><TableCell className="text-sm font-medium">{r.name ?? r.customerName}</TableCell><TableCell className="text-sm text-muted-foreground">{r.phone ?? "—"}</TableCell><TableCell className="text-right tabular-nums font-semibold">₹{Number(r.balance).toFixed(2)}</TableCell><TableCell className="text-sm text-muted-foreground">{r.lastInvoiceDate ?? r.lastPurchaseDate ?? "—"}</TableCell></TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>
              )}

              {/* ── Pending Distributors ── */}
              {paymentsView === "pending-distributors" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Pending Payment — Distributors</p>
                    <Button size="sm" variant="outline" onClick={() => {
                      const rows = pendingDistributors?.rows ?? pendingDistributors?.suppliers ?? [];
                      exportCSV(rows.length ? rows : [{ name: "—", balance: pendingDistributors?.totalDue ?? 0 }], "pending_distributors",
                        [{ key: "name", header: "Distributor" }, { key: "phone", header: "Phone" }, { key: "balance", header: "Balance (₹)" }]);
                    }}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Search name or phone (q)" value={pendingDistributorsQ} onChange={e => setPendingDistributorsQ(e.target.value)} className="h-8 flex-1 min-w-40" />
                    <Button size="sm" variant="outline" onClick={() => void loadReports()}>Apply</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Total Due</p><p className="text-lg font-semibold tabular-nums">₹{Number(pendingDistributors?.totalDue ?? pendingDistributors?.summary?.totalDue ?? 0).toFixed(2)}</p></div>
                    <div className="p-3 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Distributors Owing</p><p className="text-lg font-semibold tabular-nums">{pendingDistributors?.count ?? pendingDistributors?.summary?.count ?? 0}</p></div>
                  </div>
                  {pendingViewMode === "detail" && (
                    <div className="border rounded-sm overflow-hidden overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Distributor</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(pendingDistributors?.rows ?? pendingDistributors?.suppliers ?? []).length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No pending distributors{pendingDistributorsQ ? ` for “${pendingDistributorsQ}”` : ""}</TableCell></TableRow>
                            : (pendingDistributors.rows ?? pendingDistributors.suppliers ?? []).map((r: any) => (
                              <TableRow key={r.id}><TableCell className="text-sm font-medium">{r.name ?? r.supplierName}</TableCell><TableCell className="text-sm text-muted-foreground">{r.phone ?? "—"}</TableCell><TableCell className="text-right tabular-nums font-semibold">₹{Number(r.balance).toFixed(2)}</TableCell></TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>
              )}

              {/* ── Payments Register ── */}
              {paymentsView === "register" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Payments Register — voided=false, date in range</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(paymentsRegister?.rows ?? [], "payments_register",
                      [{ key: "date", header: "Date" }, { key: "type", header: "Type" }, { key: "category", header: "Category" }, { key: "amount", header: "Amount" }, { key: "paymentMode", header: "Mode" }, { key: "customerName", header: "Customer" }, { key: "supplierName", header: "Supplier" }, { key: "description", header: "Description" }])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={paymentsRegisterType} onValueChange={v => setPaymentsRegisterType(v)}>
                      <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={paymentsRegisterMode} onValueChange={v => setPaymentsRegisterMode(v)}>
                      <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Mode" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All modes</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="credit">Credit</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Search category / description / party (q)" value={paymentsRegisterQ} onChange={e => setPaymentsRegisterQ(e.target.value)} className="h-8 flex-1 min-w-40" />
                    <Button size="sm" variant="outline" onClick={() => void loadReports()}>Apply</Button>
                  </div>
                  {paymentsRegister?.summary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Received</p><p className="text-sm font-semibold tabular-nums text-green-700">₹{Number(paymentsRegister.summary.totalReceived ?? 0).toFixed(2)}</p></div>
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Paid</p><p className="text-sm font-semibold tabular-nums">₹{Number(paymentsRegister.summary.totalPaid ?? 0).toFixed(2)}</p></div>
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Expense</p><p className="text-sm font-semibold tabular-nums text-orange-700">₹{Number(paymentsRegister.summary.totalExpense ?? 0).toFixed(2)}</p></div>
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Count</p><p className="text-sm font-semibold tabular-nums">{paymentsRegister.summary.count ?? 0}</p></div>
                    </div>
                  )}
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Party</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Mode</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(paymentsRegister?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No payments in period — adjust date, type or mode</TableCell></TableRow>
                          : (paymentsRegister.rows ?? []).map((r: any) => (
                            <TableRow key={r.id}><TableCell className="text-sm text-muted-foreground">{formatDate(r.date)}</TableCell><TableCell><Badge variant="secondary" className="text-[10px] capitalize">{r.type}</Badge></TableCell><TableCell className="text-sm">{r.customerName ?? r.supplierName ?? "—"}</TableCell><TableCell className="text-sm">{r.category ?? "—"}</TableCell><TableCell className="text-right tabular-nums font-medium">₹{r.amount.toFixed(2)}</TableCell><TableCell className="text-sm">{r.paymentMode ?? r.mode ?? "—"}</TableCell><TableCell className="text-sm text-muted-foreground">{r.description ?? "—"}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Expense Register ── */}
              {paymentsView === "expense" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Expense Register — type=expense, grouped {expenseGroupBy === "category" ? "by Category" : "by Name"}</p>
                    <div className="flex items-center gap-2">
                      <Select value={expenseGroupBy} onValueChange={v => setExpenseGroupBy(v as any)}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="category">By Category</SelectItem>
                          <SelectItem value="name">By Name (description)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => exportCSV(expenseRegister?.rows ?? expenseRegister?.groups ?? [], `expense_${expenseGroupBy}`,
                        [{ key: "group", header: expenseGroupBy === "name" ? "Name" : "Category" }, { key: "count", header: "Count" }, { key: "total", header: "Total (₹)" }])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Search category or description (q)" value={expenseQ} onChange={e => setExpenseQ(e.target.value)} className="h-8 flex-1 min-w-40" />
                    <Button size="sm" variant="outline" onClick={() => void loadReports()}>Apply</Button>
                  </div>
                  {expenseRegister?.summary && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Total Expense</p><p className="text-sm font-semibold tabular-nums">₹{Number(expenseRegister.summary.totalExpense ?? expenseRegister.totalExpense ?? 0).toFixed(2)}</p></div>
                      <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">Entries</p><p className="text-sm font-semibold tabular-nums">{expenseRegister.summary.count ?? 0}</p></div>
                    </div>
                  )}
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>{expenseGroupBy === "name" ? "Name (description)" : "Category"}</TableHead><TableHead className="text-right">Entries</TableHead><TableHead className="text-right">Total</TableHead><TableHead>GST hint (category)</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(expenseRegister?.rows ?? expenseRegister?.groups ?? []).length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No expenses in period</TableCell></TableRow>
                          : (expenseRegister.rows ?? expenseRegister.groups ?? []).map((r: any, i: number) => (
                            <TableRow key={`${r.group}-${i}`}><TableCell className="text-sm font-medium">{r.group ?? r.category}</TableCell><TableCell className="text-right tabular-nums">{r.count}</TableCell><TableCell className="text-right tabular-nums font-medium">₹{Number(r.total ?? r.totalAmount ?? r.amount ?? 0).toFixed(2)}</TableCell><TableCell className="text-sm text-muted-foreground">{String(r.category ?? r.gstInfo ?? r.group ?? "—")}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  {(expenseRegister?.entries ?? []).length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Show {expenseRegister.entries.length} ledger entries in period</summary>
                      <div className="mt-2 border rounded-sm overflow-hidden overflow-x-auto">
                        <Table>
                          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Mode</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {expenseRegister.entries.map((e: any) => (
                              <TableRow key={e.id}><TableCell className="text-xs text-muted-foreground">{formatDate(e.date)}</TableCell><TableCell className="text-xs">{e.category ?? "—"}</TableCell><TableCell className="text-xs text-muted-foreground">{e.description ?? "—"}</TableCell><TableCell className="text-right tabular-nums text-xs">₹{e.amount.toFixed(2)}</TableCell><TableCell className="text-xs">{e.paymentMode ?? "—"}</TableCell></TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </details>
                  )}
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── PROFIT REPORT ── */}
        <TabsContent value="profit" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : profitData ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-4 border-border/60">
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="text-xl font-semibold tabular-nums text-primary">
                    <AnimatedNumber value={profitData.totalSales ?? 0} format={v => `₹${Math.round(v).toLocaleString("en-IN")}`} />
                  </p>
                </Card>
                <Card className="p-4 border-border/60">
                  <p className="text-xs text-muted-foreground">Taxable Amount</p>
                  <p className="text-xl font-semibold tabular-nums">
                    <AnimatedNumber value={profitData.taxableAmount ?? 0} format={v => `₹${Math.round(v).toLocaleString("en-IN")}`} />
                  </p>
                </Card>
                <Card className="p-4 border-border/60">
                  <p className="text-xs text-muted-foreground">Cost of Goods</p>
                  <p className="text-xl font-semibold tabular-nums text-orange-600">
                    <AnimatedNumber value={profitData.costOfGoods ?? 0} format={v => `₹${Math.round(v).toLocaleString("en-IN")}`} />
                  </p>
                </Card>
                <Card className="p-4 border-border/60">
                  <p className="text-xs text-muted-foreground">Gross Profit</p>
                  <p className={`text-xl font-semibold tabular-nums ${((profitData.grossProfit ?? 0) >= 0 ? "text-green-600" : "text-red-600")}`}>
                    <AnimatedNumber value={Math.abs(profitData.grossProfit ?? 0)} format={v => `${(profitData.grossProfit ?? 0) >= 0 ? "" : "-" }₹${Math.round(v).toLocaleString("en-IN")}`} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Margin: {(profitData.profitMargin ?? 0).toFixed(1)}%
                  </p>
                </Card>
              </div>

              {/* Profit bar visualization */}
              <Card className="p-5 border-border/60">
                <p className="text-xs text-muted-foreground mb-3">Revenue vs Cost Breakdown</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Revenue (ex-GST)</span>
                      <span className="tabular-nums">₹{(profitData.taxableAmount ?? 0).toFixed(0)}</span>
                    </div>
                    <div className="h-3 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: "100%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Cost of Goods</span>
                      <span className="tabular-nums text-orange-600">₹{(profitData.costOfGoods ?? 0).toFixed(0)}</span>
                    </div>
                    <div className="h-3 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${profitData.taxableAmount > 0 ? ((profitData.costOfGoods / profitData.taxableAmount) * 100).toFixed(1) : 0}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Gross Profit</span>
                      <span className={`tabular-nums font-semibold ${(profitData.grossProfit ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        ₹{(profitData.grossProfit ?? 0).toFixed(0)}
                      </span>
                    </div>
                    <div className="h-3 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full"
                        style={{ width: `${profitData.taxableAmount > 0 ? Math.max(0, ((profitData.grossProfit / profitData.taxableAmount) * 100)).toFixed(1) : 0}%` }} />
                    </div>
                  </div>
                </div>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── INVENTORY REPORT ── */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {(["all", "low", "out"] as const).map(s => (
                <Button key={s} variant={invStatus === s ? "default" : "outline"} size="sm" className="text-xs"
                  onClick={() => setInvStatus(s)}>
                  {s === "all" ? "All" : s === "low" ? "Low Stock" : "Out of Stock"}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => exportCSV(inventoryData, "inventory_report", [
              { key: "name", header: "Medicine" },
              { key: "category", header: "Category" },
              { key: "totalStock", header: "Total Stock" },
              { key: "availableStock", header: "Available" },
              { key: "minQuantity", header: "Min Level" },
              { key: "mrp", header: "MRP" },
              { key: "purchasePrice", header: "Purchase Price" },
            ])}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="border rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Min Level</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryData.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {invStatus === "all" ? "No inventory data" : `No ${invStatus === "low" ? "low stock" : "out of stock"} items`}
                    </TableCell></TableRow>
                  ) : inventoryData.map((med: any) => (
                    <TableRow key={med.id}>
                      <TableCell className="text-sm">
                        <p className="font-medium">{med.name}</p>
                        <p className="text-xs text-muted-foreground">{med.brand ?? ""}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{med.category ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums" title={`${med.totalStock ?? 0} tabs`}>{formatPackQty(med.totalStock ?? 0, med.unitsPerPack)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${med.availableStock <= (med.minQuantity ?? 10) ? "text-red-600" : ""}`} title={`${med.availableStock ?? 0} tabs`}>
                        {formatPackQty(med.availableStock ?? 0, med.unitsPerPack)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{med.minQuantity ?? 10}</TableCell>
                      <TableCell className="text-right tabular-nums">{med.mrp ? `₹${med.mrp.toFixed(0)}` : "—"}</TableCell>
                      <TableCell className="text-right">
                        {med.availableStock === 0 ? (
                          <Badge variant="destructive" className="text-[10px]">Out</Badge>
                        ) : med.availableStock <= (med.minQuantity ?? 10) ? (
                          <Badge variant="destructive" className="text-[10px] bg-orange-100 text-orange-700 border-orange-300">Low</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 border-green-200">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── GST REPORTS ── */}
        <TabsContent value="tax" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Sub-view switcher */}
              <div className="flex flex-wrap items-center gap-2">
                {([
                  ["overview", "GSTR-3B Summary"],
                  ["gstr1", "GSTR-1 Outward"],
                  ["gstr2", "GSTR-2 Inward"],
                  ["hsn", "HSN Summary"],
                  ["itc", "ITC Ledger"],
                ] as const).map(([v, label]) => (
                  <Button key={v} size="sm" variant={gstView === v ? "default" : "outline"} className="text-xs"
                    onClick={() => setGstView(v)}>
                    {label}
                  </Button>
                ))}
              </div>

              {/* GST catalog — 3 rows per 7.54.49 PM.jpeg: GSTR-1, GSTR-2, GSTR-3B */}
              <div className="grid grid-cols-1 gap-2">
                {([
                  ["gstr1", "GSTR-1 — Outward Supplies", "B2B / B2C by GSTIN + credit notes (Table 9B). Invoice-wise outward, rate via deriveItemTax."],
                  ["gstr2", "GSTR-2 — Inward Supplies", "B2B (with supplier GSTIN) / B2C + debit notes as CNDR analog. Purchase bills + purchase returns in period; byRate buckets + gross vs net."],
                  ["overview", "GSTR-3B — Monthly Summary", "Outward liability vs ITC (net), byRate outward + inward. Liability floored at 0 per head."],
                ] as const).map(([value, label, desc]) => (
                  <button key={value} type="button" onClick={() => setGstView(value as any)}
                    className={`text-left p-3 rounded-sm border flex items-center justify-between gap-3 ${gstView === value ? "bg-card border-primary/40 shadow-sm" : "bg-card border-border/60 hover:border-border"}`}>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${gstView === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{gstView === value ? "Open" : "View"}</span>
                  </button>
                ))}
              </div>

              {/* ── OVERVIEW = GSTR-3B ── */}
              {gstView === "overview" && gstr3bData && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Outward Taxable (net)</p>
                      <p className="text-xl font-semibold tabular-nums">
                        <AnimatedNumber value={gstr3bData.outward?.netTaxable ?? 0} format={v => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Gross ₹{Math.round(gstr3bData.outward?.taxable ?? 0).toLocaleString("en-IN")} · CN −₹{Math.round(gstr3bData.outward?.creditTaxable ?? 0).toLocaleString("en-IN")}
                      </p>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Output GST (net)</p>
                      <p className="text-xl font-semibold tabular-nums">
                        <AnimatedNumber value={gstr3bData.outward?.netGst ?? 0} format={v => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        CGST ₹{(gstr3bData.outward?.netCgst ?? 0).toFixed(2)} · SGST ₹{(gstr3bData.outward?.netSgst ?? 0).toFixed(2)}
                      </p>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">ITC Available (net)</p>
                      <p className="text-xl font-semibold tabular-nums text-green-700">
                        <AnimatedNumber value={gstr3bData.itc?.netGst ?? 0} format={v => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {gstr3bData.itc?.billCount ?? 0} purchase bills · rev −₹{(gstr3bData.itc?.reversalGst ?? 0).toFixed(2)}
                      </p>
                    </Card>
                    <Card className="p-4 border-border/60 border-primary/40 bg-primary/5">
                      <p className="text-xs text-muted-foreground">Net GST Payable</p>
                      <p className="text-xl font-semibold tabular-nums text-primary">
                        <AnimatedNumber value={gstr3bData.liability?.totalPayable ?? 0} format={v => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Output − ITC (floored at 0 per head)
                      </p>
                    </Card>
                  </div>

                  {/* Rate-wise tables */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <Card className="p-4 border-border/60">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Outward by Rate (Table 3.1)</p>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportCSV(
                          Object.entries(gstr3bData.outward?.byRate ?? {}).map(([rate, b]: any) => ({ rate, ...b })),
                          "gstr3b_outward_by_rate",
                          [
                            { key: "rate", header: "GST Rate %" },
                            { key: "taxable", header: "Taxable Value" },
                            { key: "cgst", header: "CGST" },
                            { key: "sgst", header: "SGST" },
                            { key: "igst", header: "IGST" },
                            { key: "gst", header: "Total Tax" },
                          ])}>
                          <Download className="h-3 w-3 mr-1" />CSV
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rate</TableHead>
                            <TableHead className="text-right">Taxable</TableHead>
                            <TableHead className="text-right">CGST</TableHead>
                            <TableHead className="text-right">SGST</TableHead>
                            <TableHead className="text-right">Total Tax</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(gstr3bData.outward?.byRate ?? {}).length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No outward supplies in period</TableCell></TableRow>
                          ) : Object.entries(gstr3bData.outward?.byRate ?? {}).map(([rate, b]: any) => (
                            <TableRow key={rate}>
                              <TableCell className="font-medium">{rate}%</TableCell>
                              <TableCell className="text-right tabular-nums">₹{b.taxable?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">₹{b.cgst?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">₹{b.sgst?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">₹{b.gst?.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ITC by Rate (Table 4)</p>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportCSV(
                          Object.entries(gstr3bData.itc?.byRate ?? {}).map(([rate, b]: any) => ({ rate, ...b })),
                          "gstr3b_itc_by_rate",
                          [
                            { key: "rate", header: "GST Rate %" },
                            { key: "taxable", header: "Taxable Value" },
                            { key: "cgst", header: "CGST" },
                            { key: "sgst", header: "SGST" },
                            { key: "gst", header: "Total ITC" },
                          ])}>
                          <Download className="h-3 w-3 mr-1" />CSV
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rate</TableHead>
                            <TableHead className="text-right">Taxable</TableHead>
                            <TableHead className="text-right">CGST</TableHead>
                            <TableHead className="text-right">SGST</TableHead>
                            <TableHead className="text-right">ITC</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(gstr3bData.itc?.byRate ?? {}).length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No purchases in period — record purchase bills to build ITC</TableCell></TableRow>
                          ) : Object.entries(gstr3bData.itc?.byRate ?? {}).map(([rate, b]: any) => (
                            <TableRow key={rate}>
                              <TableCell className="font-medium">{rate}%</TableCell>
                              <TableCell className="text-right tabular-nums">₹{b.taxable?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">₹{b.cgst?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">₹{b.sgst?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium text-green-700">₹{b.gst?.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  </div>

                  {/* Nil / exempt note */}
                  {(gstr3bData.itc?.nilTaxable ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nil-rated / exempt inward (0%): ₹{(gstr3bData.itc.nilTaxable).toFixed(2)} — report under Table 3.2 / 5 as applicable.
                    </p>
                  )}
                </>
              )}

              {/* ── GSTR-1 OUTWARD ── */}
              {gstView === "gstr1" && gstr1Data && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">B2B Invoices</p>
                      <p className="text-xl font-semibold tabular-nums">{gstr1Data.summary?.b2bCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Table 4A/4B/4C — with GSTIN</p>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">B2C Invoices</p>
                      <p className="text-xl font-semibold tabular-nums">{gstr1Data.summary?.b2cCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Table 7 — retail, no GSTIN</p>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Invoice Value</p>
                      <p className="text-xl font-semibold tabular-nums">
                        <AnimatedNumber value={gstr1Data.summary?.totalInvoiceValue ?? 0} format={v => `₹${Math.round(v).toLocaleString("en-IN")}`} />
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Taxable ₹{Math.round(gstr1Data.summary?.totalTaxable ?? 0).toLocaleString("en-IN")} · GST ₹{Math.round(gstr1Data.summary?.totalGst ?? 0).toLocaleString("en-IN")}</p>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Credit Notes</p>
                      <p className="text-xl font-semibold tabular-nums">{gstr1Data.summary?.creditNoteCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Table 9B — −₹{Math.round(gstr1Data.summary?.creditGst ?? 0).toLocaleString("en-IN")} GST</p>
                    </Card>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {(gstr1Data.b2b?.length ?? 0) + (gstr1Data.b2c?.length ?? 0)} invoices · {(gstr1Data.cdnr?.length ?? 0)} credit notes
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => exportCSV(
                        [...(gstr1Data.b2b ?? []).map((r: any) => ({ ...r, type: "B2B" })), ...(gstr1Data.b2c ?? []).map((r: any) => ({ ...r, type: "B2C" }))],
                        "gstr1_invoices",
                        [
                          { key: "type", header: "Type" },
                          { key: "invoiceNo", header: "Invoice No" },
                          { key: "date", header: "Date" },
                          { key: "customerName", header: "Customer" },
                          { key: "customerGstin", header: "Customer GSTIN" },
                          { key: "invoiceValue", header: "Invoice Value" },
                          { key: "taxable", header: "Taxable Value" },
                          { key: "cgst", header: "CGST" },
                          { key: "sgst", header: "SGST" },
                          { key: "igst", header: "IGST" },
                          { key: "totalGst", header: "Total Tax" },
                        ])}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />Invoices CSV
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => exportCSV(gstr1Data.cdnr ?? [], "gstr1_credit_notes", [
                        { key: "returnNo", header: "Note No" },
                        { key: "date", header: "Date" },
                        { key: "originalInvoiceNo", header: "Original Invoice" },
                        { key: "customerName", header: "Customer" },
                        { key: "noteValue", header: "Note Value" },
                        { key: "taxable", header: "Taxable Value" },
                        { key: "cgst", header: "CGST" },
                        { key: "sgst", header: "SGST" },
                        { key: "totalGst", header: "Total Tax" },
                      ])}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />Notes CSV
                      </Button>
                    </div>
                  </div>

                  <div className="border rounded-sm overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-center">Type</TableHead>
                          <TableHead className="text-right">Taxable</TableHead>
                          <TableHead className="text-right">CGST</TableHead>
                          <TableHead className="text-right">SGST</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...(gstr1Data.b2b ?? []).map((r: any) => ({ ...r, _t: "B2B" })), ...(gstr1Data.b2c ?? []).map((r: any) => ({ ...r, _t: "B2C" }))].length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No outward invoices in this period</TableCell></TableRow>
                        ) : [...(gstr1Data.b2b ?? []).map((r: any) => ({ ...r, _t: "B2B" })), ...(gstr1Data.b2c ?? []).map((r: any) => ({ ...r, _t: "B2C" }))].map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{r.invoiceNo}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(r.date)}</TableCell>
                            <TableCell className="text-sm">
                              {r.customerName}
                              {r.customerGstin && <span className="block font-mono text-[10px] text-muted-foreground">{r.customerGstin}</span>}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={r._t === "B2B" ? "default" : "secondary"} className="text-[10px]">{r._t}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">₹{r.taxable?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">₹{r.cgst?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">₹{r.sgst?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">₹{r.invoiceValue?.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {(gstr1Data.cdnr?.length ?? 0) > 0 && (
                    <div className="border rounded-sm overflow-hidden">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 pt-3">Credit Notes (Table 9B)</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Note No.</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Original Invoice</TableHead>
                            <TableHead className="text-right">Taxable</TableHead>
                            <TableHead className="text-right">GST</TableHead>
                            <TableHead className="text-right">Note Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(gstr1Data.cdnr ?? []).map((r: any) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs">{r.returnNo}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{formatDate(r.date)}</TableCell>
                              <TableCell className="font-mono text-xs">{r.originalInvoiceNo ?? "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">₹{r.taxable?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">₹{r.totalGst?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">₹{r.noteValue?.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}

              {/* ── GSTR-2 INWARD ── */}
              {gstView === "gstr2" && gstr2Data && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Inward Bills</p>
                      <p className="text-xl font-semibold tabular-nums">{gstr2Data.summary?.billCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        B2B {gstr2Data.summary?.b2bCount ?? 0} · B2C {gstr2Data.summary?.b2cCount ?? 0}
                      </p>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Gross GST (inward)</p>
                      <p className="text-xl font-semibold tabular-nums">
                        <AnimatedNumber value={gstr2Data.summary?.totalGst ?? 0} format={v => `₹${Math.round(v).toLocaleString("en-IN")}`} />
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Taxable ₹{Math.round(gstr2Data.summary?.totalTaxable ?? 0).toLocaleString("en-IN")}
                      </p>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Debit Notes</p>
                      <p className="text-xl font-semibold tabular-nums">{gstr2Data.summary?.debitNoteCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">−₹{(gstr2Data.summary?.debitGst ?? 0).toFixed(2)} GST · −₹{(gstr2Data.summary?.debitTaxable ?? 0).toFixed(2)} taxable</p>
                    </Card>
                    <Card className="p-4 border-border/60 border-primary/40 bg-primary/5">
                      <p className="text-xs text-muted-foreground">Net ITC (gross − debit)</p>
                      <p className="text-xl font-semibold tabular-nums text-primary">
                        <AnimatedNumber value={gstr2Data.summary?.netGst ?? 0} format={v => `₹${Math.round(v).toLocaleString("en-IN")}`} />
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Net taxable ₹{Math.round(gstr2Data.summary?.netTaxable ?? 0).toLocaleString("en-IN")}</p>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <Card className="p-4 border-border/60">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">By Rate (inward)</p>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportCSV(
                          Object.entries(gstr2Data.byRate ?? {}).map(([rate, b]: any) => ({ rate, ...b })),
                          "gstr2_by_rate",
                          [
                            { key: "rate", header: "GST Rate %" },
                            { key: "taxable", header: "Taxable Value" },
                            { key: "cgst", header: "CGST" },
                            { key: "sgst", header: "SGST" },
                            { key: "gst", header: "Total Tax" },
                          ])}>
                          <Download className="h-3 w-3 mr-1" />CSV
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rate</TableHead>
                            <TableHead className="text-right">Taxable</TableHead>
                            <TableHead className="text-right">CGST</TableHead>
                            <TableHead className="text-right">SGST</TableHead>
                            <TableHead className="text-right">Total Tax</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(gstr2Data.byRate ?? {}).length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No inward supplies in period</TableCell></TableRow>
                          ) : Object.entries(gstr2Data.byRate ?? {}).map(([rate, b]: any) => (
                            <TableRow key={rate}>
                              <TableCell className="font-medium">{rate}%</TableCell>
                              <TableCell className="text-right tabular-nums">₹{b.taxable?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">₹{b.cgst?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">₹{b.sgst?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">₹{b.gst?.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">B2B vs B2C — by supplier GSTIN</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">B2B (with GSTIN)</p><p className="text-sm font-semibold tabular-nums">{gstr2Data.b2b?.length ?? 0} bills</p></div>
                        <div className="p-2 rounded bg-muted/50"><p className="text-[10px] text-muted-foreground">B2C (no GSTIN)</p><p className="text-sm font-semibold tabular-nums">{gstr2Data.b2c?.length ?? 0} bills</p></div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Intra-state split: CGST/SGST = GST/2. Debit notes below.</p>
                    </Card>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {(gstr2Data.b2b?.length ?? 0) + (gstr2Data.b2c?.length ?? 0)} purchase bills · {(gstr2Data.cdnr?.length ?? gstr2Data.cdn?.length ?? 0)} debit notes
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => exportCSV(
                        [...(gstr2Data.b2b ?? []).map((r: any) => ({ ...r, type: "B2B" })), ...(gstr2Data.b2c ?? []).map((r: any) => ({ ...r, type: "B2C" }))],
                        "gstr2_invoices",
                        [
                          { key: "type", header: "Type" },
                          { key: "billNo", header: "Bill No" },
                          { key: "billDate", header: "Date" },
                          { key: "supplierName", header: "Supplier" },
                          { key: "supplierGstin", header: "Supplier GSTIN" },
                          { key: "billValue", header: "Bill Value" },
                          { key: "taxable", header: "Taxable Value" },
                          { key: "cgst", header: "CGST" },
                          { key: "sgst", header: "SGST" },
                          { key: "totalGst", header: "Total Tax" },
                        ])}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />Invoices CSV
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => exportCSV(gstr2Data.cdnr ?? gstr2Data.cdn ?? [], "gstr2_debit_notes", [
                        { key: "returnNo", header: "Debit Note No" },
                        { key: "date", header: "Date" },
                        { key: "originalBillNo", header: "Original Bill" },
                        { key: "supplierName", header: "Supplier" },
                        { key: "noteValue", header: "Note Value" },
                        { key: "taxable", header: "Taxable Value" },
                        { key: "cgst", header: "CGST" },
                        { key: "sgst", header: "SGST" },
                        { key: "totalGst", header: "Total Tax" },
                      ])}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />Notes CSV
                      </Button>
                    </div>
                  </div>

                  <div className="border rounded-sm overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bill</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="text-center">Type</TableHead>
                          <TableHead className="text-right">Taxable</TableHead>
                          <TableHead className="text-right">CGST</TableHead>
                          <TableHead className="text-right">SGST</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...(gstr2Data.b2b ?? []).map((r: any) => ({ ...r, _t: "B2B" })), ...(gstr2Data.b2c ?? []).map((r: any) => ({ ...r, _t: "B2C" }))].length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No inward bills in this period</TableCell></TableRow>
                        ) : [...(gstr2Data.b2b ?? []).map((r: any) => ({ ...r, _t: "B2B" })), ...(gstr2Data.b2c ?? []).map((r: any) => ({ ...r, _t: "B2C" }))].map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{r.billNo}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(r.billDate ?? r.date)}</TableCell>
                            <TableCell className="text-sm">
                              {r.supplierName}
                              {r.supplierGstin && <span className="block font-mono text-[10px] text-muted-foreground">{r.supplierGstin}</span>}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={r._t === "B2B" ? "default" : "secondary"} className="text-[10px]">{r._t}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">₹{r.taxable?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">₹{r.cgst?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">₹{r.sgst?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">₹{(r.billValue ?? r.invoiceValue)?.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {((gstr2Data.cdnr ?? gstr2Data.cdn ?? []).length > 0) && (
                    <div className="border rounded-sm overflow-hidden">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 pt-3">Debit Notes (CNDR analog — Table for inward reversals)</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Debit Note</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Original Bill</TableHead>
                            <TableHead className="text-right">Taxable</TableHead>
                            <TableHead className="text-right">GST</TableHead>
                            <TableHead className="text-right">Note Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(gstr2Data.cdnr ?? gstr2Data.cdn ?? []).map((r: any) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs">{r.returnNo}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{formatDate(r.date)}</TableCell>
                              <TableCell className="font-mono text-xs">{r.originalBillNo ?? r.originalInvoiceNo ?? "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">₹{r.taxable?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">₹{r.totalGst?.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">₹{r.noteValue?.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}

              {/* ── HSN SUMMARY (Table 12) ── */}
              {gstView === "hsn" && hsnData && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Sales HSN lines</p>
                      <p className="text-xl font-semibold tabular-nums">{hsnData.sales?.length ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Taxable ₹{Math.round(hsnData.salesTotal?.taxable ?? 0).toLocaleString("en-IN")} · GST ₹{Math.round(hsnData.salesTotal?.gst ?? 0).toLocaleString("en-IN")}
                      </p>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Purchase HSN lines</p>
                      <p className="text-xl font-semibold tabular-nums">{hsnData.purchase?.length ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Taxable ₹{Math.round(hsnData.purchaseTotal?.taxable ?? 0).toLocaleString("en-IN")} · GST ₹{Math.round(hsnData.purchaseTotal?.gst ?? 0).toLocaleString("en-IN")}
                      </p>
                    </Card>
                  </div>

                  <Card className="p-4 border-border/60">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sales HSN-wise (Table 12)</p>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportCSV(hsnData.sales ?? [], "hsn_sales", [
                        { key: "hsn", header: "HSN" },
                        { key: "description", header: "Description" },
                        { key: "unit", header: "UQC" },
                        { key: "quantity", header: "Quantity" },
                        { key: "gstRate", header: "GST Rate %" },
                        { key: "taxable", header: "Taxable Value" },
                        { key: "cgst", header: "CGST" },
                        { key: "sgst", header: "SGST" },
                        { key: "gst", header: "Total Tax" },
                      ])}>
                        <Download className="h-3 w-3 mr-1" />CSV
                      </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>HSN</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-center">Rate</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Taxable</TableHead>
                          <TableHead className="text-right">CGST</TableHead>
                          <TableHead className="text-right">SGST</TableHead>
                          <TableHead className="text-right">Total Tax</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(hsnData.sales ?? []).length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No HSN data — add HSN codes to medicines</TableCell></TableRow>
                        ) : (hsnData.sales ?? []).map((r: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{r.hsn}</TableCell>
                            <TableCell className="text-sm max-w-48 truncate" title={r.description}>{r.description}</TableCell>
                            <TableCell className="text-center text-sm">{r.gstRate}%</TableCell>
                            <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                            <TableCell className="text-right tabular-nums">₹{r.taxable?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">₹{r.cgst?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">₹{r.sgst?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">₹{r.gst?.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </>
              )}

              {/* ── ITC LEDGER ── */}
              {gstView === "itc" && itcData && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Purchase Bills</p>
                      <p className="text-xl font-semibold tabular-nums">{itcData.summary?.billCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Value ₹{Math.round(itcData.summary?.billValue ?? 0).toLocaleString("en-IN")}</p>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Gross ITC</p>
                      <p className="text-xl font-semibold tabular-nums text-green-700">
                        <AnimatedNumber value={itcData.summary?.grossItc ?? 0} format={v => `₹${Math.round(v).toLocaleString("en-IN")}`} />
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">CGST ₹{(itcData.summary?.cgst ?? 0).toFixed(2)} · SGST ₹{(itcData.summary?.sgst ?? 0).toFixed(2)}</p>
                    </Card>
                    <Card className="p-4 border-border/60">
                      <p className="text-xs text-muted-foreground">Reversals</p>
                      <p className="text-xl font-semibold tabular-nums">{itcData.summary?.reversalCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">−₹{(itcData.summary?.reversalGst ?? 0).toFixed(2)} GST</p>
                    </Card>
                    <Card className="p-4 border-border/60 border-green-600/30 bg-green-50/50">
                      <p className="text-xs text-muted-foreground">Net ITC</p>
                      <p className="text-xl font-semibold tabular-nums text-green-700">
                        <AnimatedNumber value={itcData.summary?.netItc ?? 0} format={v => `₹${Math.round(v).toLocaleString("en-IN")}`} />
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Claimable under Table 4</p>
                    </Card>
                  </div>

                  {(itcData.summary?.withoutSupplierGstin ?? 0) > 0 && (
                    <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-sm px-3 py-2">
                      {itcData.summary.withoutSupplierGstin} bill(s) have no supplier GSTIN on file — add GSTINs to suppliers so these match GSTR-2B.
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{itcData.bills?.length ?? 0} purchase bills in period</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(itcData.bills ?? [], "itc_ledger", [
                      { key: "billNo", header: "Bill No" },
                      { key: "billDate", header: "Date" },
                      { key: "supplierName", header: "Supplier" },
                      { key: "supplierGstin", header: "Supplier GSTIN" },
                      { key: "billValue", header: "Bill Value" },
                      { key: "taxable", header: "Taxable Value" },
                      { key: "cgst", header: "CGST" },
                      { key: "sgst", header: "SGST" },
                      { key: "totalGst", header: "Total ITC" },
                      { key: "eligible", header: "Eligibility" },
                    ])}>
                      <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
                    </Button>
                  </div>

                  <div className="border rounded-sm overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bill No.</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="text-right">Taxable</TableHead>
                          <TableHead className="text-right">CGST</TableHead>
                          <TableHead className="text-right">SGST</TableHead>
                          <TableHead className="text-right">ITC</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(itcData.bills ?? []).length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No purchases in this period</TableCell></TableRow>
                        ) : (itcData.bills ?? []).map((b: any) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-xs">{b.billNo}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(b.billDate)}</TableCell>
                            <TableCell className="text-sm">
                              {b.supplierName}
                              {b.supplierGstin
                                ? <span className="block font-mono text-[10px] text-muted-foreground">{b.supplierGstin}</span>
                                : <span className="block text-[10px] text-orange-600">No GSTIN</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">₹{b.taxable?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">₹{b.cgst?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">₹{b.sgst?.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-green-700">₹{b.totalGst?.toFixed(2)}</TableCell>
                            <TableCell className="text-center">
                              {b.eligible === "eligible"
                                ? <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 border-green-200">Eligible</Badge>
                                : <Badge variant="destructive" className="text-[10px] bg-orange-100 text-orange-700 border-orange-300">Verify</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {/* Rate-accurate breakdown (shared, from line items) */}
              {taxData && gstView === "overview" && (
                <Card className="p-5 border-border/60">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Outward GST Breakdown by Rate (line-item derived)</p>
                  <div className="space-y-3">
                    {["0", "5", "12", "18", "28"].map(rate => {
                      const b = taxData.breakdown?.[rate];
                      if (!b) return null;
                      return (
                        <div key={rate} className="flex items-center gap-4">
                          <span className="text-sm font-medium w-8">{rate}%</span>
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span>Taxable</span>
                              <span className="tabular-nums">₹{b.taxableAmount.toFixed(2)}</span>
                            </div>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full"
                                style={{ width: `${taxData.netTaxable > 0 ? ((b.taxableAmount / taxData.netTaxable) * 100).toFixed(1) : 0}%` }} />
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs tabular-nums">GST: ₹{b.gstAmount.toFixed(2)}</p>
                            <p className="text-[10px] text-muted-foreground">CGST: ₹{b.cgst.toFixed(2)} · SGST: ₹{b.sgst.toFixed(2)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {(taxData.creditNoteCount ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground mt-3">
                      {taxData.creditNoteCount} credit note(s): −₹{(taxData.creditNoteTaxable ?? 0).toFixed(2)} taxable, −₹{(taxData.creditNoteGst ?? 0).toFixed(2)} GST netted above.
                    </p>
                  )}
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── PARTY REPORTS (5 rows per screenshot 7.54.50) ── */}
        <TabsContent value="party" className="space-y-4">
          {/* catalog — 5 rows */}
          <div className="grid grid-cols-1 gap-2">
            {([
              ["customers", "Customers Register — RFM", "Debtors with RFM score. R = recency days since lastPurchaseDate (or max invoice date), F = invoices last 180d, M = sum grandTotal. Normalize 1-5, score=R+F+M (0 if no history). Sort rfm | balance, q filters name/phone"],
              ["followups", "Pending Medicine Follow-ups", "refillReminders status=pending and reminderDate in range (from/to) + q on customer name/phone/medicine"],
              ["ledger-customer", "Payment Ledger — Customer", "Union invoices + payments filtered by customerId and date range, ordered by date, runningBalance"],
              ["ledger-distributor", "Payment Ledger — Distributor", "Union purchase bills + payments filtered by supplierId and date range, ordered by date, runningBalance"],
              ["distributors", "Distributors Register", "Creditors — suppliers createdBy=userId, balance outstanding sorted desc, q filter"],
            ] as const).map(([value, label, desc]) => (
              <button key={value} type="button" onClick={() => setPartyView(value as any)}
                className={`text-left p-3 rounded-sm border flex items-center justify-between gap-3 ${partyView === value ? "bg-card border-primary/40 shadow-sm" : "bg-card border-border/60 hover:border-border"}`}>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${partyView === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{partyView === value ? "Open" : "View"}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* ── Customers Register RFM ── */}
              {partyView === "customers" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Customers Register — RFM</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(partyCustomersData?.rows ?? partyCustomersData?.customers ?? [], "party_customers_rfm", [
                      { key: "name", header: "Customer" }, { key: "phone", header: "Phone" }, { key: "balance", header: "Outstanding (₹)" }, { key: "totalPurchases", header: "Total Purchases" }, { key: "recencyDays", header: "Recency Days" }, { key: "freq", header: "F (180d count)" }, { key: "monetary", header: "M (₹ 180d)" }, { key: "rfmScore", header: "RFM Score" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Search name or phone (q)" value={partyCustomersQ} onChange={e => setPartyCustomersQ(e.target.value)} className="h-8 flex-1 min-w-40" />
                    <Select value={partyCustomersSort} onValueChange={v => setPartyCustomersSort(v as any)}>
                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rfm">Sort: RFM</SelectItem>
                        <SelectItem value="balance">Sort: Balance</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => void loadReports()}>Apply</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Total Purchases</TableHead><TableHead className="text-right">R</TableHead><TableHead className="text-right">F</TableHead><TableHead className="text-right">M</TableHead><TableHead className="text-right">RFM</TableHead><TableHead>Last Purchase</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(partyCustomersData?.rows ?? partyCustomersData?.customers ?? []).length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No customers{partyCustomersQ ? ` for “${partyCustomersQ}”` : ""}</TableCell></TableRow>
                          : (partyCustomersData.rows ?? partyCustomersData.customers ?? []).map((r: any) => (
                            <TableRow key={r.id}><TableCell className="text-sm font-medium">{r.name ?? r.customerName}</TableCell><TableCell className="text-sm text-muted-foreground">{r.phone ?? "—"}</TableCell><TableCell className="text-right tabular-nums font-semibold">₹{Number(r.balance ?? 0).toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">₹{Number(r.totalPurchases ?? 0).toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{r.rScore ?? "—"}{r.recencyDays !== null && r.recencyDays !== undefined ? ` (${r.recencyDays}d)` : ""}</TableCell><TableCell className="text-right tabular-nums">{r.fScore ?? r.freq ?? 0}</TableCell><TableCell className="text-right tabular-nums">₹{Number(r.monetary ?? 0).toFixed(2)}</TableCell><TableCell className="text-right"><Badge variant={r.rfmScore === 0 ? "secondary" : r.rfmScore >= 10 ? "default" : "outline"} className="tabular-nums text-xs">{r.rfmScore}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{r.lastPurchaseDate ?? "—"}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Pending Medicine Follow-ups ── */}
              {partyView === "followups" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Pending Medicine Follow-ups — status=pending, reminderDate in range</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(partyFollowupsData?.rows ?? partyFollowupsData?.followups ?? [], "party_followups", [
                      { key: "customerName", header: "Customer" }, { key: "customerPhone", header: "Phone" }, { key: "medicineName", header: "Medicine" }, { key: "reminderDate", header: "Reminder Date" }, { key: "lastPurchaseDate", header: "Last Purchase" }, { key: "status", header: "Status" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Search customer name or phone (q)" value={partyFollowupsQ} onChange={e => setPartyFollowupsQ(e.target.value)} className="h-8 flex-1 min-w-40" />
                    <Button size="sm" variant="outline" onClick={() => void loadReports()}>Apply</Button>
                    <span className="text-xs text-muted-foreground">Period: {fromDate} → {toDate}</span>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Phone</TableHead><TableHead>Medicine</TableHead><TableHead>Reminder Date</TableHead><TableHead>Last Purchase</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(partyFollowupsData?.rows ?? partyFollowupsData?.followups ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No pending follow-ups in period{partyFollowupsQ ? ` for “${partyFollowupsQ}”` : ""}</TableCell></TableRow>
                          : (partyFollowupsData.rows ?? partyFollowupsData.followups ?? []).map((r: any) => (
                            <TableRow key={r.id}><TableCell className="text-sm font-medium">{r.customerName ?? "—"}</TableCell><TableCell className="text-sm text-muted-foreground">{r.customerPhone ?? "—"}</TableCell><TableCell className="text-sm">{r.medicineName}</TableCell><TableCell className="text-sm">{formatDate(r.reminderDate)}</TableCell><TableCell className="text-xs text-muted-foreground">{r.lastPurchaseDate ? formatDate(r.lastPurchaseDate) : "—"}</TableCell><TableCell><Badge variant="secondary" className="text-[10px] capitalize">{r.status}</Badge></TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Payment Ledger — Customer ── */}
              {partyView === "ledger-customer" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <p className="text-sm font-semibold">Payment Ledger — Customer (invoices + payments, running balance)</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Search customer by name" value={ledgerCustomerSearch} onChange={e => setLedgerCustomerSearch(e.target.value)} className="h-8 flex-1 min-w-40" />
                    <Button size="sm" variant="outline" onClick={async () => {
                      const { customersApi } = await import("@/lib/api");
                      const d: any = await customersApi.list({ search: ledgerCustomerSearch, limit: 10 });
                      const rows = d?.data ?? d?.customers ?? d ?? [];
                      setLedgerCustomerOptions(Array.isArray(rows) ? rows : []);
                    }}>Search</Button>
                  </div>
                  {ledgerCustomerOptions.length > 0 && (
                    <div className="border rounded-sm divide-y max-h-40 overflow-auto">
                      {ledgerCustomerOptions.map((c: any) => (
                        <button key={c.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between" onClick={() => { setLedgerCustomerId(c.id); setLedgerCustomerOptions([]); }}>
                          <span>{c.name} {c.phone ? `· ${c.phone}` : ""}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{c.id.slice(0, 8)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Customer ID" value={ledgerCustomerId} onChange={e => setLedgerCustomerId(e.target.value)} className="h-9 flex-1 min-w-40 font-mono text-xs" />
                    <span className="text-xs text-muted-foreground">Period: {fromDate} → {toDate}</span>
                    <Button size="sm" onClick={async () => {
                      if (!ledgerCustomerId) { toast.error("Pick a customer first"); return; }
                      const { reportsApi } = await import("@/lib/api");
                      const d = await reportsApi.partyLedger({ type: "customer", id: ledgerCustomerId, from: fromDate, to: toDate });
                      setLedgerCustomerData(d);
                    }}>Load ledger</Button>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(ledgerCustomerData?.entries ?? ledgerCustomerData?.ledger ?? [], "party_ledger_customer", [
                      { key: "date", header: "Date" }, { key: "type", header: "Type" }, { key: "invoiceNo", header: "Invoice/Bill" }, { key: "amount", header: "Amount" }, { key: "runningBalance", header: "Running Balance" }, { key: "description", header: "Description" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Invoice / Ref</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Running Balance</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {!ledgerCustomerData ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Pick a customer and Load — ledger ordered by date, running balance shown</TableCell></TableRow>
                          : (ledgerCustomerData.entries ?? ledgerCustomerData.ledger ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No entries in period for this customer</TableCell></TableRow>
                            : (ledgerCustomerData.entries ?? ledgerCustomerData.ledger ?? []).map((e: any) => (
                              <TableRow key={e.id}><TableCell className="text-sm">{formatDate(e.date)}</TableCell><TableCell><Badge variant={String(e.kind ?? e.type).includes("invoice") ? "default" : "secondary"} className="text-[10px] capitalize">{e.kind ?? e.type}</Badge></TableCell><TableCell className="font-mono text-xs">{e.invoiceNo ?? e.billNo ?? e.reference ?? "—"}</TableCell><TableCell className="text-right tabular-nums">₹{Number(e.amount ?? 0).toFixed(2)}</TableCell><TableCell className="text-right tabular-nums font-semibold">₹{Number(e.runningBalance ?? e.balance ?? 0).toFixed(2)}</TableCell><TableCell className="text-sm text-muted-foreground">{e.description ?? "—"}</TableCell></TableRow>
                            ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Payment Ledger — Distributor ── */}
              {partyView === "ledger-distributor" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <p className="text-sm font-semibold">Payment Ledger — Distributor (purchase bills + payments, running balance)</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Search distributor by name" value={ledgerSupplierSearch} onChange={e => setLedgerSupplierSearch(e.target.value)} className="h-8 flex-1 min-w-40" />
                    <Button size="sm" variant="outline" onClick={async () => {
                      const { suppliersApi } = await import("@/lib/api");
                      const d: any = await suppliersApi.list({ search: ledgerSupplierSearch, limit: 10 });
                      const rows = d?.data ?? d?.suppliers ?? d ?? [];
                      setLedgerSupplierOptions(Array.isArray(rows) ? rows : []);
                    }}>Search</Button>
                  </div>
                  {ledgerSupplierOptions.length > 0 && (
                    <div className="border rounded-sm divide-y max-h-40 overflow-auto">
                      {ledgerSupplierOptions.map((s: any) => (
                        <button key={s.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between" onClick={() => { setLedgerSupplierId(s.id); setLedgerSupplierOptions([]); }}>
                          <span>{s.name} {s.phone ? `· ${s.phone}` : ""}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{s.id.slice(0, 8)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Distributor ID" value={ledgerSupplierId} onChange={e => setLedgerSupplierId(e.target.value)} className="h-9 flex-1 min-w-40 font-mono text-xs" />
                    <span className="text-xs text-muted-foreground">Period: {fromDate} → {toDate}</span>
                    <Button size="sm" onClick={async () => {
                      if (!ledgerSupplierId) { toast.error("Pick a distributor first"); return; }
                      const { reportsApi } = await import("@/lib/api");
                      const d = await reportsApi.partyLedger({ type: "supplier", id: ledgerSupplierId, from: fromDate, to: toDate });
                      setLedgerDistributorData(d);
                    }}>Load ledger</Button>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(ledgerDistributorData?.entries ?? ledgerDistributorData?.ledger ?? [], "party_ledger_distributor", [
                      { key: "date", header: "Date" }, { key: "type", header: "Type" }, { key: "billNo", header: "Bill" }, { key: "amount", header: "Amount" }, { key: "runningBalance", header: "Running Balance" }, { key: "description", header: "Description" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Bill / Ref</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Running Balance</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {!ledgerDistributorData ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Pick a distributor and Load — ledger ordered by date, running balance shown</TableCell></TableRow>
                          : (ledgerDistributorData.entries ?? ledgerDistributorData.ledger ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No entries in period for this distributor</TableCell></TableRow>
                            : (ledgerDistributorData.entries ?? ledgerDistributorData.ledger ?? []).map((e: any) => (
                              <TableRow key={e.id}><TableCell className="text-sm">{formatDate(e.date)}</TableCell><TableCell><Badge variant={String(e.kind ?? e.type).includes("bill") || String(e.kind).includes("invoice") ? "default" : "secondary"} className="text-[10px] capitalize">{e.kind ?? e.type}</Badge></TableCell><TableCell className="font-mono text-xs">{e.billNo ?? e.invoiceNo ?? e.reference ?? "—"}</TableCell><TableCell className="text-right tabular-nums">₹{Number(e.amount ?? 0).toFixed(2)}</TableCell><TableCell className="text-right tabular-nums font-semibold">₹{Number(e.runningBalance ?? e.balance ?? 0).toFixed(2)}</TableCell><TableCell className="text-sm text-muted-foreground">{e.description ?? "—"}</TableCell></TableRow>
                            ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {/* ── Distributors Register ── */}
              {partyView === "distributors" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Distributors Register — creditors, balance outstanding sorted desc</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(partyDistributorsData?.rows ?? partyDistributorsData?.suppliers ?? [], "party_distributors", [
                      { key: "name", header: "Distributor" }, { key: "phone", header: "Phone" }, { key: "gstin", header: "GSTIN" }, { key: "balance", header: "Outstanding (₹)" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Search distributor name or phone (q)" value={partyDistributorsQ} onChange={e => setPartyDistributorsQ(e.target.value)} className="h-8 flex-1 min-w-40" />
                    <Button size="sm" variant="outline" onClick={() => void loadReports()}>Apply</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Distributor</TableHead><TableHead>Phone</TableHead><TableHead>GSTIN</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(partyDistributorsData?.rows ?? partyDistributorsData?.suppliers ?? []).length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No distributors{partyDistributorsQ ? ` for “${partyDistributorsQ}”` : ""}</TableCell></TableRow>
                          : (partyDistributorsData.rows ?? partyDistributorsData.suppliers ?? []).map((r: any) => (
                            <TableRow key={r.id}><TableCell className="text-sm font-medium">{r.name ?? r.supplierName}</TableCell><TableCell className="text-sm text-muted-foreground">{r.phone ?? "—"}</TableCell><TableCell className="font-mono text-xs">{r.gstin ?? "—"}</TableCell><TableCell className="text-right tabular-nums font-semibold">₹{Number(r.balance ?? 0).toFixed(2)}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── ORDER REPORTS (2 rows per screenshot 7.54.50 (1).jpeg) ── */}
        <TabsContent value="order" className="space-y-4">
          {/* catalog — 2 rows */}
          <div className="grid grid-cols-1 gap-2">
            {([
              ["shortbook", "Shortbook Products (Products to Order)", "availableStock = sum(batches.quantity where isActive), shortage% = (reorderLevel − available)/reorderLevel×100, orderQty = max(0, reorderLevel − available). Filter available ≤ reorderLevel (or ≤ minQuantity if reorderLevel not set). Sorted by shortage% desc or name. q searches name/brand."],
              ["purchase-orders", "Purchase Order Product Register", "Per product totalOrderedQty, billCount, suppliers list, totalAmount, lastBillDate — aggregated from purchaseBillItems in date range (last 30d if no range). q searches product/brand/supplier."],
            ] as const).map(([value, label, desc]) => (
              <button key={value} type="button" onClick={() => setOrderView(value as any)}
                className={`text-left p-3 rounded-sm border flex items-center justify-between gap-3 ${orderView === value ? "bg-card border-primary/40 shadow-sm" : "bg-card border-border/60 hover:border-border"}`}>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${orderView === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{orderView === value ? "Open" : "View"}</span>
              </button>
            ))}
          </div>

          {/* shared q + sort/period filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder={orderView === "shortbook" ? "Search medicine name or brand (q)" : "Search product / brand / supplier (q)"} value={orderQ} onChange={e => setOrderQ(e.target.value)} className="h-8 flex-1 min-w-40" />
            {orderView === "shortbook" ? (
              <Select value={orderSort} onValueChange={v => setOrderSort(v as any)}>
                <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shortage">Sort: Shortage %</SelectItem>
                  <SelectItem value="name">Sort: Name</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={purchaseOrdersGroupBy} onValueChange={v => setPurchaseOrdersGroupBy(v)}>
                <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Group by" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Group: Product</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={() => void loadReports()}>Apply</Button>
            <span className="text-xs text-muted-foreground">{orderView === "purchase-orders" ? `Period: ${fromDate} → ${toDate}` : null}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {orderView === "shortbook" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Shortbook — Products to Order</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(shortbookData?.rows ?? [], "order_shortbook", [
                      { key: "name", header: "Product" }, { key: "brand", header: "Company" }, { key: "category", header: "Category" }, { key: "minQuantity", header: "Min" }, { key: "reorderLevel", header: "Reorder" }, { key: "stock", header: "Stock" }, { key: "shortagePercent", header: "Shortage %" }, { key: "orderQty", header: "Order Qty" }, { key: "mrp", header: "MRP" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Company</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Min / Reorder</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Shortage %</TableHead><TableHead className="text-right">Order Qty</TableHead><TableHead className="text-right">MRP</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(shortbookData?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No products below reorder/min level{orderQ ? ` for “${orderQ}”` : ""}</TableCell></TableRow>
                          : (shortbookData.rows ?? []).map((r: any) => (
                            <TableRow key={r.medicineId}><TableCell className="text-sm font-medium">{r.name ?? r.medicineName}</TableCell><TableCell className="text-sm text-muted-foreground">{r.brand ?? "—"}</TableCell><TableCell className="text-sm text-muted-foreground">{r.category ?? "—"}</TableCell><TableCell className="text-right tabular-nums text-xs">{r.minQuantity ?? "—"} / {r.reorderLevel ?? r.threshold ?? "—"}</TableCell><TableCell className="text-right tabular-nums font-semibold">{r.stock ?? r.availableStock ?? 0}</TableCell><TableCell className={`text-right tabular-nums font-semibold ${(r.shortagePercent ?? 0) >= 50 ? "text-red-600" : (r.shortagePercent ?? 0) >= 20 ? "text-orange-600" : "text-muted-foreground"}`}>{(r.shortagePercent ?? r.shortage ?? 0).toFixed(1)}%</TableCell><TableCell className="text-right tabular-nums">{r.orderQty ?? 0}</TableCell><TableCell className="text-right tabular-nums">{r.mrp != null ? `₹${Number(r.mrp).toFixed(2)}` : "—"}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}

              {orderView === "purchase-orders" && (
                <Card className="p-4 border-border/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Purchase Order Product Register — grouped by product</p>
                    <Button size="sm" variant="outline" onClick={() => exportCSV(purchaseOrdersData?.rows ?? [], "order_purchase_orders_product", [
                      { key: "medicineName", header: "Product" }, { key: "brand", header: "Company" }, { key: "totalOrderedQty", header: "Total Ordered Qty" }, { key: "billCount", header: "Bills" }, { key: "totalAmount", header: "Total Amount" }, { key: "lastBillDate", header: "Last Bill Date" },
                    ])}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                  </div>
                  <div className="border rounded-sm overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Company</TableHead><TableHead className="text-right">Total Ordered</TableHead><TableHead className="text-right">Bills</TableHead><TableHead>Suppliers</TableHead><TableHead className="text-right">Total Amount</TableHead><TableHead>Last Bill</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(purchaseOrdersData?.rows ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No purchase orders in period{orderQ ? ` for “${orderQ}”` : ""} — adjust date range</TableCell></TableRow>
                          : (purchaseOrdersData.rows ?? []).map((r: any) => (
                            <TableRow key={r.medicineId ?? r.medicineName}><TableCell className="text-sm font-medium">{r.medicineName ?? r.name}</TableCell><TableCell className="text-sm text-muted-foreground">{r.brand ?? "—"}</TableCell><TableCell className="text-right tabular-nums font-semibold">{r.totalOrderedQty ?? r.quantity ?? 0}</TableCell><TableCell className="text-right tabular-nums">{r.billCount ?? r.bills ?? 0}</TableCell><TableCell className="text-sm">{(r.suppliers ?? r.supplierNames ?? []).length ? (r.suppliers ?? r.supplierNames).join(", ") : "—"}</TableCell><TableCell className="text-right tabular-nums">₹{Number(r.totalAmount ?? r.amount ?? 0).toFixed(2)}</TableCell><TableCell className="text-sm text-muted-foreground">{r.lastBillDate ?? r.lastDate ? formatDate(String(r.lastBillDate ?? r.lastDate)) : "—"}</TableCell></TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">From {purchaseOrdersData?.from ?? fromDate} to {purchaseOrdersData?.to ?? toDate} · groupBy: {purchaseOrdersData?.groupBy ?? "product"} · {purchaseOrdersData?.count ?? 0} product(s)</p>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
