import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GSTInvoiceTemplate } from "@/components/GSTInvoiceTemplate";
import { PrintContainer } from "@/components/GSTInvoiceTemplate";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Banknote, ChevronDown, ChevronRight, Eye, Loader2, Printer, Receipt, Search, Share2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePrintPrefs } from "@/hooks/usePrintPrefs";
import { formatPackFraction } from "@/lib/utils";
import { useNavigate } from "react-router";
import { toast } from "sonner";

function formatDate(dateStr: string) {
  if (!dateStr) return "â€”";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoney(n: number) {
  const v = Number(n) || 0;
  return `â‚¹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getStatusInfo(inv: any) {
  // hold is boolean on invoice; map to pill
  if (inv.hold) return { label: "Hold", cls: "border-amber-600/30 text-amber-700 bg-amber-600/5" };
  const status = inv.status || "paid";
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Paid", cls: "border-green-600/30 text-green-700 bg-green-600/5" },
    partial: { label: "Due", cls: "border-amber-600/30 text-amber-700 bg-amber-600/5" },
    unpaid: { label: "Due", cls: "border-red-600/30 text-red-700 bg-red-600/5" },
    hold: { label: "Hold", cls: "border-amber-600/30 text-amber-700 bg-amber-600/5" },
    cancelled: { label: "Cancelled", cls: "border-gray-500/30 text-gray-600 bg-gray-100" },
  };
  return map[status] || map.paid;
}

function defaultFromDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().split("T")[0];
}
function defaultToDate(): string {
  return new Date().toISOString().split("T")[0];
}

export default function InvoicesPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [fromDate, setFromDate] = useState<string>(() => defaultFromDate());
  const [toDate, setToDate] = useState<string>(() => defaultToDate());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date");

  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [viewPayments, setViewPayments] = useState<any[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [printData, setPrintData] = useState<any>(null);
  const { prefs: printPrefs, shop: printShop } = usePrintPrefs();
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("cash");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [paySaving, setPaySaving] = useState(false);

  const [searching, setSearching] = useState(false);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiSummary, setKpiSummary] = useState<any>(null);
  const [enrichMap, setEnrichMap] = useState<Map<string, any>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Compliance (e-invoice) detail â€” fetched ONLY when a row is expanded.
  const [complianceMap, setComplianceMap] = useState<Map<string, any>>(new Map());
  const [complianceBusy, setComplianceBusy] = useState<string | null>(null);
  const skipSearchRef = useRef(true);

  const toggleExpand = async (inv: any) => {
    const isExpanded = expandedId === inv.id;
    setExpandedId(isExpanded ? null : inv.id);
    if (isExpanded || complianceMap.has(inv.id)) return;
    setComplianceBusy(inv.id);
    try {
      const { complianceApi } = await import("@/lib/api");
      const status = await complianceApi.status(inv.id);
      setComplianceMap((prev) => new Map(prev).set(inv.id, status));
    } catch {
      // Keep the row usable even if the compliance call fails (e.g. offline).
    } finally {
      setComplianceBusy(null);
    }
  };

  // Invoice sharing (Task 9) â€” dialog state
  const [shareInvoice, setShareInvoice] = useState<any>(null);
  const [shareChannels, setShareChannels] = useState<Record<string, boolean>>({ whatsapp: true, sms: false, email: false });
  const [shareCustomerId, setShareCustomerId] = useState<string>("none");
  const [shareCustomers, setShareCustomers] = useState<Array<{ id: string; name: string; phone?: string | null }>>([]);
  const [shareSaving, setShareSaving] = useState(false);

  const loadData = useCallback(async (fromSearch = false) => {
    if (fromSearch) setSearching(true); else { setLoading(true); setKpiLoading(true); }
    try {
      const { invoicesApi, reportsApi } = await import("@/lib/api");
      const statusParam = filterStatus === "all" ? undefined : (filterStatus === "hold" ? undefined : filterStatus);
      const [invResult, regResult] = await Promise.all([
        invoicesApi.list({
          limit: 100,
          search: debouncedSearch || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          status: statusParam,
        }),
        reportsApi.salesRegister({ from: fromDate || undefined, to: toDate || undefined, view: "invoice" }).catch(() => null),
      ]);
      const list = Array.isArray(invResult) ? invResult : (invResult?.data ?? []);
      setInvoices(list);
      if (regResult) {
        const reg: any = regResult;
        setKpiSummary(reg.summary ?? null);
        const rows: any[] = reg.invoices ?? reg.rows ?? [];
        const m = new Map<string, any>();
        for (const r of rows) m.set(r.id, r);
        setEnrichMap(m);
      } else {
        setKpiSummary(null);
        setEnrichMap(new Map());
      }
    } catch {
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
      setSearching(false);
      setKpiLoading(false);
    }
  }, [debouncedSearch, fromDate, toDate, filterStatus]);

  useEffect(() => { if (isAuthenticated) void loadData(false); }, [isAuthenticated, loadData]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (skipSearchRef.current) { skipSearchRef.current = false; return; }
    void loadData(true);
  }, [debouncedSearch]);

  // reload when date/status changes (not debounced search)
  useEffect(() => {
    if (!isAuthenticated) return;
    if (skipSearchRef.current) return;
    void loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, filterStatus]);

  useEffect(() => { if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true }); }, [authLoading, isAuthenticated, navigate]);

  const handleView = async (inv: any) => {
    setViewLoading(true);
    try {
      const { invoicesApi, paymentsApi } = await import("@/lib/api");
      const [detail, payments] = await Promise.all([
        invoicesApi.get(inv.id),
        paymentsApi.list({ invoiceId: inv.id }),
      ]);
      setViewInvoice(detail);
      setViewPayments(Array.isArray(payments) ? payments : (payments?.data ?? []));
    } catch { toast.error("Failed to load invoice"); }
    finally { setViewLoading(false); }
  };

  const handleDelete = async (inv: any) => {
    if (!window.confirm(`Cancel invoice ${inv.invoiceNo}? This will restore stock.`)) return;
    try {
      const { invoicesApi } = await import("@/lib/api");
      await invoicesApi.cancel(inv.id);
      toast("Invoice cancelled");
      void loadData(false);
    } catch (err: any) { toast.error(err.message ?? "Failed to cancel invoice"); }
  };

  const openShare = async (inv: any) => {
    setShareInvoice(inv);
    setShareChannels({ whatsapp: true, sms: false, email: false });
    setShareCustomerId("none");
    if (shareCustomers.length === 0) {
      try {
        const { customersApi } = await import("@/lib/api");
        const list = await customersApi.list({ limit: 200 });
        const arr = Array.isArray(list) ? list : ((list as any)?.data ?? []);
        setShareCustomers(arr.map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })));
      } catch { /* picker falls back to the invoice's own phone */ }
    }
  };

  const handleShare = async () => {
    if (!shareInvoice) return;
    const channels = (["whatsapp", "sms", "email"] as const).filter((c) => shareChannels[c]);
    if (channels.length === 0) { toast.error("Pick at least one channel"); return; }
    setShareSaving(true);
    try {
      const { messagesApi } = await import("@/lib/api");
      const res = await messagesApi.invoiceShare(shareInvoice.id, {
        channels,
        customerId: shareCustomerId !== "none" ? shareCustomerId : undefined,
      });
      const queued = res.deliveries?.length ?? 0;
      const skipped = res.skipped?.length ?? 0;
      if (queued === 0) {
        toast.error("No destination available for the selected channels");
      } else {
        toast.success(`Queued ${queued} message${queued === 1 ? "" : "s"}`, {
          description: skipped ? `${skipped} skipped â€” no destination` : undefined,
        });
      }
      setShareInvoice(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to share invoice");
    } finally {
      setShareSaving(false);
    }
  };

  const handlePrint = () => {
    if (!viewInvoice) return;
    setPrintData(viewInvoice);
    setViewInvoice(null);
  };

  const balance = viewInvoice ? Math.max(0, viewInvoice.grandTotal - (viewInvoice.amountPaid ?? 0)) : 0;

  const openPayDialog = () => {
    setPayAmount(balance ? balance.toFixed(2) : "");
    setPayMode("cash");
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayOpen(true);
  };

  const handleSavePayment = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (!viewInvoice) return;
    setPaySaving(true);
    try {
      const { paymentsApi } = await import("@/lib/api");
      await paymentsApi.create({
        date: payDate,
        type: "received",
        category: "Invoice Payment",
        amount,
        reference: viewInvoice.invoiceNo,
        invoiceId: viewInvoice.id,
        customerId: viewInvoice.customerId,
        description: `Payment for ${viewInvoice.invoiceNo}`,
        paymentMode: payMode,
      });
      toast.success("Payment recorded");
      setPayOpen(false);
      const { invoicesApi } = await import("@/lib/api");
      const [detail, payments] = await Promise.all([
        invoicesApi.get(viewInvoice.id),
        paymentsApi.list({ invoiceId: viewInvoice.id }),
      ]);
      setViewInvoice(detail);
      setViewPayments(Array.isArray(payments) ? payments : (payments?.data ?? []));
    } catch (err: any) { toast.error(err.message ?? "Failed to record payment"); }
    finally { setPaySaving(false); }
  };

  // Enrich + filter + sort for display
  const displayRows = useMemo(() => {
    const enriched = invoices.map((inv: any) => {
      const e = enrichMap.get(inv.id);
      const netProfit = e?.netProfit ?? 0;
      const adjAmount = e?.adjAmount ?? (Number(inv.discountAmount ?? 0) ? -Number(inv.discountAmount) : 0);
      const payable = Number(inv.grandTotal ?? 0);
      const bal = Math.max(0, payable - Number(inv.amountPaid ?? 0));
      const marginPercent = e?.marginPercent ?? (payable > 0 ? Number(((netProfit / payable) * 100).toFixed(2)) : 0);
      const username = inv.username ?? inv.createdByName ?? "You";
      const invAmt = payable; // grandTotal as INV AMT per spec
      return { ...inv, _netProfit: netProfit, _adjAmount: adjAmount, _payable: payable, _balance: bal, _marginPercent: marginPercent, _username: username, _invAmt: invAmt, _taxable: e?.taxable ?? 0 };
    });
    // filter hold client-side if needed
    let filtered = enriched;
    if (filterStatus === "hold") {
      filtered = filtered.filter((r: any) => !!r.hold);
    } else if (filterStatus !== "all") {
      // already filtered server side, but keep client filter for safety (exclude cancelled handled by server)
      filtered = filtered.filter((r: any) => (r.status ?? "paid") === filterStatus);
    }
    // search is server side, no extra
    // sort
    if (sortBy === "amount") {
      filtered = [...filtered].sort((a: any, b: any) => Number(b.grandTotal ?? 0) - Number(a.grandTotal ?? 0));
    } else if (sortBy === "customer") {
      filtered = [...filtered].sort((a: any, b: any) => String(a.customerName ?? "").localeCompare(String(b.customerName ?? "")));
    } else {
      filtered = [...filtered].sort((a: any, b: any) => String(b.date ?? b.createdAt).localeCompare(String(a.date ?? a.createdAt)));
    }
    return filtered;
  }, [invoices, enrichMap, filterStatus, sortBy]);

  // KPI derived values
  const kpis = useMemo(() => {
    const count = kpiSummary?.invoiceCount ?? invoices.length;
    const salesAmtSum = Number(kpiSummary?.payable ?? invoices.reduce((a: number, inv: any) => a + Number(inv.grandTotal ?? 0), 0));
    const netProfitSum = Number(kpiSummary?.netProfit ?? 0);
    const payableSum = salesAmtSum;
    const balanceSum = invoices.reduce((a: number, inv: any) => a + Math.max(0, Number(inv.grandTotal ?? 0) - Number(inv.amountPaid ?? 0)), 0);
    return { count, salesAmtSum, netProfitSum, payableSum, balanceSum };
  }, [kpiSummary, invoices]);

  if (!authLoading && !isAuthenticated) { navigate("/auth"); return null; }
  if (authLoading || loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-pulse text-muted-foreground text-sm">Loading...</div></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sales Transactions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">View List of all your Sales Transactions here</p>
        </div>
      </div>

      {/* 5 KPI cards â€” matches LocalWell screenshot 7.54.43 PM */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Card className="p-3 border-border/60">
          <p className="text-[11px] tracking-wide text-muted-foreground ">Sales Count</p>
          {kpiLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-2" /> : <p className="text-xl font-semibold tabular-nums mt-1">{kpis.count}</p>}
        </Card>
        <Card className="p-3 border-border/60">
          <p className="text-[11px] tracking-wide text-muted-foreground ">Sales Amt Sum</p>
          {kpiLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-2" /> : <p className="text-lg font-semibold tabular-nums mt-1">{formatMoney(kpis.salesAmtSum)}</p>}
        </Card>
        <Card className="p-3 border-border/60">
          <p className="text-[11px] tracking-wide text-muted-foreground ">Sales Net Profit</p>
          {kpiLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-2" /> : <p className="text-lg font-semibold tabular-nums mt-1 text-green-700">{formatMoney(kpis.netProfitSum)}</p>}
        </Card>
        <Card className="p-3 border-border/60">
          <p className="text-[11px] tracking-wide text-muted-foreground ">Payable Sum</p>
          {kpiLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-2" /> : <p className="text-lg font-semibold tabular-nums mt-1">{formatMoney(kpis.payableSum)}</p>}
        </Card>
        <Card className="p-3 border-border/60">
          <p className="text-[11px] tracking-wide text-muted-foreground ">Balance Sum</p>
          {kpiLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-2" /> : <p className={`text-lg font-semibold tabular-nums mt-1 ${kpis.balanceSum > 0 ? "text-amber-700" : "text-muted-foreground"}`}>{formatMoney(kpis.balanceSum)}</p>}
        </Card>
      </div>

      {/* Filters bar â€” INVOICE NO search, date range, FILTER BY, SORT BY */}
      <div className="flex flex-wrap items-end gap-3 p-3 rounded-sm border border-border/60 bg-card">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-[11px] tracking-wide text-muted-foreground uppercase">Invoice No</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="INVOICE NO â€” search no / customer / phone" className={"pl-8 h-9 text-sm" + (searching ? " pr-8" : "")} />
            {searching && <Loader2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground pointer-events-none" />}
          </div>
        </div>
        <div>
          <Label className="text-[11px] tracking-wide text-muted-foreground uppercase">From</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 h-9 w-auto text-sm" />
        </div>
        <div>
          <Label className="text-[11px] tracking-wide text-muted-foreground uppercase">To</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 h-9 w-auto text-sm" />
        </div>
        <div>
          <Label className="text-[11px] tracking-wide text-muted-foreground uppercase">Filter By</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="mt-1 h-9 w-36 text-sm"><SelectValue placeholder="FILTER BY" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="partial">Due / Partial</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="hold">Hold</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] tracking-wide text-muted-foreground uppercase">Sort By</Label>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="mt-1 h-9 w-36 text-sm"><SelectValue placeholder="SORT BY" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Billed On</SelectItem>
              <SelectItem value="amount">Amount</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" className="h-9" onClick={() => void loadData(false)}>Apply</Button>
      </div>

      {/* Transactions table */}
      <div className="border border-border/60 rounded-sm bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-[11px] whitespace-nowrap">INVOICE NO</TableHead>
                <TableHead className="text-[11px] min-w-[160px]">CUSTOMER NAME/INFO</TableHead>
                <TableHead className="text-[11px] whitespace-nowrap">BILLED ON</TableHead>
                <TableHead className="text-right text-[11px] whitespace-nowrap">INV AMT</TableHead>
                <TableHead className="text-right text-[11px] whitespace-nowrap">NET PROFIT</TableHead>
                <TableHead className="text-right text-[11px] whitespace-nowrap">ADJ AMT</TableHead>
                <TableHead className="text-right text-[11px] whitespace-nowrap">PAYABLE</TableHead>
                <TableHead className="text-right text-[11px] whitespace-nowrap">BALANCE</TableHead>
                <TableHead className="text-[11px] whitespace-nowrap">PAID/DUE</TableHead>
                <TableHead className="text-[11px] whitespace-nowrap">USERNAME</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-10">
                    <EmptyState icon={Receipt}
                      title={search ? "No invoices match your search" : "No invoices in this period"}
                      description={search ? "Try a different invoice number or customer name." : "Adjust date range or create an invoice from billing."}
                      actions={search ? [] : [{ label: "Create Invoice", onClick: () => navigate("/dashboard/billing") }]}
                    />
                  </TableCell>
                </TableRow>
              ) : displayRows.map((inv: any) => {
                const profit = Number(inv._netProfit ?? 0);
                const margin = Number(inv._marginPercent ?? 0);
                const adj = Number(inv._adjAmount ?? 0);
                const payable = Number(inv._payable ?? inv.grandTotal ?? 0);
                const balance = Number(inv._balance ?? 0);
                const pill = getStatusInfo(inv);
                const isExpanded = expandedId === inv.id;
                return (
                  <>
                    <TableRow key={inv.id} className="hover:bg-muted/30 group">
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {inv.invoiceNo}
                        {inv.prescriptionId && (
                          <button
                            type="button"
                            title={`Prescription ${inv.prescriptionStatus ? `Â· ${inv.prescriptionStatus}` : "linked"} â€” open Prescriptions`}
                            onClick={() => navigate("/dashboard/prescriptions")}
                            className="ml-1.5 inline-flex h-4 items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 font-sans text-[9px] font-semibold uppercase tracking-wide text-primary hover:bg-primary/20"
                          >
                            Rx
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <div className="text-sm font-medium leading-none truncate">{inv.customerName || "Walk-in Customer"}</div>
                        {inv.customerPhone && <div className="text-[11px] text-muted-foreground leading-none mt-1">{inv.customerPhone}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(inv.date ?? inv.createdAt)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">{formatMoney(inv._invAmt)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        <div className="text-sm font-medium text-green-700">{formatMoney(profit)}</div>
                        <div className="text-[11px] text-green-700/80 leading-none">{margin.toFixed(2)}%</div>
                      </TableCell>
                      <TableCell className={"text-right tabular-nums text-xs whitespace-nowrap " + (adj > 0 ? "text-green-700" : adj < 0 ? "text-red-600" : "text-muted-foreground")}>{adj === 0 ? "â‚¹0.00" : `${adj > 0 ? "+" : ""}${formatMoney(adj)}`}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium whitespace-nowrap">{formatMoney(payable)}</TableCell>
                      <TableCell className={"text-right tabular-nums text-sm whitespace-nowrap " + (balance > 0 ? "text-amber-700 font-medium" : "text-muted-foreground")}>{formatMoney(balance)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className={`inline-flex px-1.5 py-0.5 rounded-sm border text-[11px] leading-none ${pill.cls}`}>{pill.label}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap max-w-[110px] truncate">{inv._username}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void handleView(inv)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void openShare(inv)} title="Share on WhatsApp / SMS / email"><Share2 className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => void handleDelete(inv)} title="Cancel"><Trash2 className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void toggleExpand(inv)} title={isExpanded ? "Collapse" : "Expand"}>
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${inv.id}-exp`} className="bg-muted/20">
                        <TableCell colSpan={11} className="py-3">
                          <div className="flex flex-wrap gap-4 text-xs">
                            <span className="text-muted-foreground">Invoice:</span> <span className="font-mono">{inv.invoiceNo}</span>
                            <span className="text-muted-foreground">GST:</span> <span className="tabular-nums">{formatMoney(inv.totalGst ?? 0)}</span>
                            <span className="text-muted-foreground">Subtotal:</span> <span className="tabular-nums">{formatMoney(inv.subtotal ?? 0)}</span>
                            <span className="text-muted-foreground">Discount:</span> <span className="tabular-nums">{formatMoney(inv.discountAmount ?? inv.discount ?? 0)}</span>
                            <span className="text-muted-foreground">Paid:</span> <span className="tabular-nums">{formatMoney(inv.amountPaid ?? 0)}</span>
                            {inv.paymentMode && <><span className="text-muted-foreground">Mode:</span> <span>{inv.paymentMode}</span></>}
                          </div>

                          {/* Compliance (e-invoice) â€” fetched only on expand */}
                          <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border/50 pt-2 text-xs">
                            <span className="text-muted-foreground">e-Invoice:</span>
                            {complianceBusy === inv.id ? (
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Checkingâ€¦
                              </span>
                            ) : complianceMap.has(inv.id) ? (
                              (() => {
                                const c = complianceMap.get(inv.id);
                                const state = c?.state ?? "none";
                                const pill =
                                  state === "accepted"
                                    ? "border-green-600/30 text-green-700 bg-green-600/5"
                                    : state === "rejected"
                                      ? "border-red-600/30 text-red-700 bg-red-600/5"
                                      : state === "pending"
                                        ? "border-amber-600/30 text-amber-700 bg-amber-600/5"
                                        : "border-border text-muted-foreground";
                                return (
                                  <>
                                    <span className={`inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] leading-none ${pill}`}>
                                      {state === "none" ? "Not generated" : state}
                                    </span>
                                    {c?.submission?.irn && (
                                      <span className="font-mono text-[11px]" title={`IRN ${c.submission.irn}`}>
                                        {c.submission.irn}
                                      </span>
                                    )}
                                    {c?.submission?.ackNo && (
                                      <span className="text-[11px] text-muted-foreground">Ack {c.submission.ackNo}</span>
                                    )}
                                    <button
                                      type="button"
                                      className="text-[11px] text-primary underline-offset-2 hover:underline"
                                      onClick={() => navigate("/dashboard/compliance")}
                                    >
                                      Open e-Invoice center
                                    </button>
                                    {!c?.payloadReady?.ok && c?.payloadReady?.issues?.length > 0 && (
                                      <span className="text-[11px] text-amber-700" title={c.payloadReady.issues.join("; ")}>
                                        {c.payloadReady.issues.length} payload issue(s)
                                      </span>
                                    )}
                                  </>
                                );
                              })()
                            ) : (
                              <span className="text-muted-foreground">â€”</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* View Invoice Dialog */}
      <Dialog open={!!viewInvoice || viewLoading} onOpenChange={(open) => { if (!open) { setViewInvoice(null); setViewPayments([]); } }}>
        <DialogContent className="sm:max-w-2xl">
          {viewLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : viewInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>{viewInvoice.invoiceNo}</span>
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="h-3.5 w-3.5 mr-1.5" />Print
                  </Button>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Customer</p>
                    <p className="font-medium">{viewInvoice.customerName || "Walk-in Customer"}</p>
                    {viewInvoice.customerPhone && <p className="text-muted-foreground text-xs">{viewInvoice.customerPhone}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Date</p>
                    <p>{formatDate(viewInvoice.date ?? viewInvoice.createdAt)}</p>
                    <p className="text-muted-foreground text-xs">{viewInvoice.paymentMode || "â€”"}</p>
                  </div>
                </div>

                {viewInvoice.items?.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Items</h4>
                    <div className="space-y-1">
                      {viewInvoice.items.map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1">
                          <div className="flex-1 min-w-0">
                            <span className="truncate block">{item.medicineName}</span>
                            <span className="text-xs text-muted-foreground" title={`${item.quantity} pack units`}>{formatPackFraction(item.quantity, item.unitsPerPack)} Ã— â‚¹{item.rate?.toFixed(2)}</span>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <span>â‚¹{item.amount?.toFixed(2)}</span>
                            <span className="block text-xs text-muted-foreground">GST: â‚¹{item.gstAmount?.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(() => {
                  const bal = Math.max(0, viewInvoice.grandTotal - (viewInvoice.amountPaid ?? 0));
                  return (
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs text-muted-foreground uppercase tracking-wider">Payment</h4>
                        {bal > 0 && (
                          <Button variant="outline" size="sm" onClick={openPayDialog}>
                            <Banknote className="h-3.5 w-3.5 mr-1.5" />Record Payment
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Status</p>
                          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-sm border text-[10px] ${getStatusInfo(viewInvoice).cls}`}>{getStatusInfo(viewInvoice).label}</span>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Paid</p>
                          <p className="font-medium mt-1">â‚¹{(viewInvoice.amountPaid ?? 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Balance</p>
                          <p className="font-medium mt-1">â‚¹{bal.toFixed(2)}</p>
                        </div>
                      </div>

                      {viewPayments.length > 0 && (
                        <div className="border-t border-border mt-3 pt-3">
                          <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Payments</h4>
                          <div className="space-y-1">
                            {viewPayments.map((p: any) => {
                              const isVoided = !!p.voided;
                              const isRefund = p.type === "paid";
                              const out = isVoided || isRefund;
                              return (
                                <div key={p.id} className={"flex items-center justify-between text-sm px-2 py-1.5 rounded-sm border " + (out ? "border-red-600/30 bg-red-600/[0.03]" : "border-border/40")}>
                                  <div className="min-w-0">
                                    <span className={"text-sm font-medium " + (out ? "text-red-700" : "")}>{isVoided ? "Refund" : isRefund ? "Refund (paid out)" : "Payment"}</span>
                                    <span className="text-xs text-muted-foreground ml-2">{formatDate(p.date ?? p.createdAt)}{p.paymentMode ? " - " + p.paymentMode : ""}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-3">
                                    {out && <span className="px-1.5 py-0.5 rounded-sm border text-[10px] border-red-600/30 text-red-700 bg-red-600/5">Refunded</span>}
                                    <span className={"font-semibold " + (out ? "text-red-600" : "text-green-700")}>{out ? "-" : "+"}â‚¹{p.amount.toFixed(2)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="border-t border-border pt-3">
                  <div className="flex justify-between text-sm font-medium"><span>Subtotal</span><span>â‚¹{viewInvoice.subtotal?.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm text-muted-foreground"><span>CGST</span><span>â‚¹{viewInvoice.cgst?.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm text-muted-foreground"><span>SGST</span><span>â‚¹{viewInvoice.sgst?.toFixed(2)}</span></div>
                  {viewInvoice.discount > 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Discount</span><span>-â‚¹{viewInvoice.discount?.toFixed(2)}</span></div>}
                  <div className="flex justify-between text-base font-semibold pt-2 border-t border-border mt-2"><span>Grand Total</span><span>â‚¹{viewInvoice.grandTotal?.toFixed(2)}</span></div>
                </div>

                {viewInvoice.notes && (
                  <div className="text-sm text-muted-foreground pt-2 border-t border-border">
                    <p className="text-xs font-medium uppercase tracking-wider mb-1">Notes</p>
                    <p>{viewInvoice.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            {viewInvoice && <p className="text-sm text-muted-foreground">{viewInvoice.invoiceNo} Â· Balance â‚¹{balance.toFixed(2)}</p>}
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount (â‚¹)</Label>
              <Input type="number" min={0} step={0.01} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="mt-1 h-9" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Payment Mode</Label>
                <Select value={payMode} onValueChange={setPayMode}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1 h-9" />
              </div>
            </div>
            <Button className="w-full" onClick={() => void handleSavePayment()} disabled={paySaving || !payAmount || Number(payAmount) <= 0}>
              {paySaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Banknote className="h-3.5 w-3.5 mr-1.5" />}
              Save Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Invoice Dialog */}
      <Dialog open={!!shareInvoice} onOpenChange={(open) => { if (!open) setShareInvoice(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Share {shareInvoice?.invoiceNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Channels</Label>
              {(["whatsapp", "sms", "email"] as const).map((ch) => (
                <label key={ch} className="flex cursor-pointer items-center gap-2 text-sm capitalize">
                  <Checkbox
                    checked={!!shareChannels[ch]}
                    onCheckedChange={(v) => setShareChannels((prev) => ({ ...prev, [ch]: v === true }))}
                  />
                  {ch === "whatsapp" ? "WhatsApp" : ch}
                </label>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recipient</Label>
              <Select value={shareCustomerId} onValueChange={setShareCustomerId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    Invoice customer{shareInvoice?.customerPhone ? ` Â· ${shareInvoice.customerPhone}` : ""}
                  </SelectItem>
                  {shareCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.phone ? ` Â· ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                The message links to this invoice and queues through the outbox worker.
              </p>
            </div>
            <Button className="w-full" onClick={() => void handleShare()} disabled={shareSaving}>
              {shareSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
              Queue share
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Preview */}
      {printData && (
        <PrintContainer
          onClose={() => setPrintData(null)}
          paper={printPrefs.paper}
          previewLabel={printPrefs.paper === "laser-a4" ? "A4 Laser" : printPrefs.paper === "thermal-80" ? "80mm Thermal" : "58mm Thermal"}
        >
          <GSTInvoiceTemplate
            invoice={{
              invoiceNo: printData.invoiceNo,
              date: printData.date,
              customerName: printData.customerName ?? undefined,
              customerPhone: printData.customerPhone ?? undefined,
              customerAddress: printData.customerAddress ?? undefined,
              paymentMode: printData.paymentMode ?? undefined,
              subtotal: printData.subtotal,
              totalGst: printData.totalGst,
              cgst: printData.cgst,
              sgst: printData.sgst,
              igst: printData.igst,
              discount: printData.discount ?? undefined,
              grandTotal: printData.grandTotal,
              notes: printData.notes ?? undefined,
              items: (printData.items ?? []).map((item: any) => ({
                medicineName: item.medicineName,
                hsnCode: item.hsnCode ?? undefined,
                quantity: item.quantity,
                unit: item.unit ?? undefined,
                unitsPerPack: item.unitsPerPack ?? 1,
                mrp: item.mrp ?? undefined,
                rate: item.rate,
                amount: item.amount,
                gstRate: item.gstRate,
                gstAmount: item.gstAmount,
                cgst: item.cgst,
                sgst: item.sgst,
              })),
            }}
            shopName={printShop.name || undefined}
            shopAddress={printShop.address || undefined}
            shopGstin={printShop.gstin || undefined}
            shopPhone={printShop.phone || undefined}
            paper={printPrefs.paper}
            layout={printPrefs.layout}
            shopLogoDataUrl={printPrefs.logoDataUrl}
            showLogo={printPrefs.showLogo}
            showHsn={printPrefs.showHsn}
            showMrp={printPrefs.showMrp}
            showTaxTable={printPrefs.showTaxTable}
            showSavings={printPrefs.showSavings}
            showNotes={printPrefs.showNotes}
            showTerms={printPrefs.showTerms}
            footerText={printPrefs.footerText}
          />
        </PrintContainer>
      )}
    </motion.div>
  );
}
