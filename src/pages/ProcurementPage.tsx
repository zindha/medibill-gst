import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  History,
  Loader2,
  MessageSquarePlus,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { motion } from "framer-motion";

const fmtMoney = (n: number | null | undefined) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (d: string | null | undefined) => (d ? d.slice(0, 10) : "—");

type TabValue = "metrics" | "rates" | "quotes" | "expiry";

export default function ProcurementPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabValue>("metrics");

  // ─── Supplier metrics + expiry drill ─────────────────────────
  const [supplierId, setSupplierId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [metrics, setMetrics] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [expiryRows, setExpiryRows] = useState<any[]>([]);
  const [expiryTotal, setExpiryTotal] = useState(0);
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [expiryError, setExpiryError] = useState<string | null>(null);

  // ─── Rate history ────────────────────────────────────────────
  const [rateMedicineId, setRateMedicineId] = useState("");
  const [rateRows, setRateRows] = useState<any[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  // ─── Quotes ──────────────────────────────────────────────────
  const [quoteRows, setQuoteRows] = useState<any[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState({
    supplierId: "",
    medicineId: "",
    quotedRate: "",
    quoteDate: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [savingQuote, setSavingQuote] = useState(false);

  // ─── Meta load ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { suppliersApi, medicinesApi } = await import("@/lib/api");
        const [supps, medList] = await Promise.all([suppliersApi.list(), medicinesApi.list()]);
        if (cancelled) return;
        setSuppliers(supps ?? []);
        setMedicines(medList ?? []);
        if ((supps ?? []).length > 0) setSupplierId((supps as any[])[0].id);
        if ((medList ?? []).length > 0) setRateMedicineId((medList as any[])[0].id);
      } catch {
        toast.error("Failed to load suppliers and medicines");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadQuotes = useCallback(async () => {
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const { procurementApi } = await import("@/lib/api");
      const res = await procurementApi.quotes();
      setQuoteRows(res?.rows ?? []);
    } catch (err: any) {
      setQuotesError(err?.message ?? "Failed to load quotes");
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  // ─── Metrics + expiry ────────────────────────────────────────
  const loadMetrics = useCallback(
    async (sid = supplierId, f = from, t = to) => {
      if (!sid) return;
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const { procurementApi } = await import("@/lib/api");
        const data = await procurementApi.supplierMetrics(sid, {
          from: f || undefined,
          to: t || undefined,
        });
        setMetrics(data);
      } catch (err: any) {
        if (err?.status === 404) {
          setMetrics(null);
          setMetricsError("Supplier not found");
        } else {
          setMetricsError(err?.message ?? "Failed to load supplier metrics");
        }
      } finally {
        setMetricsLoading(false);
      }
    },
    [supplierId, from, to]
  );

  const loadExpiry = useCallback(
    async (sid = supplierId, f = from, t = to) => {
      if (!sid) return;
      setExpiryLoading(true);
      setExpiryError(null);
      try {
        const { procurementApi } = await import("@/lib/api");
        const res = await procurementApi.expiryItems(sid, {
          from: f || undefined,
          to: t || undefined,
        });
        setExpiryRows(res?.rows ?? []);
        setExpiryTotal(res?.totalValue ?? 0);
      } catch (err: any) {
        setExpiryError(err?.message ?? "Failed to load expiry items");
      } finally {
        setExpiryLoading(false);
      }
    },
    [supplierId, from, to]
  );

  useEffect(() => {
    if (supplierId) {
      void loadMetrics();
      void loadExpiry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  // ─── Rate history ────────────────────────────────────────────
  const loadRates = useCallback(async () => {
    if (!rateMedicineId) return;
    setRateLoading(true);
    setRateError(null);
    try {
      const { procurementApi } = await import("@/lib/api");
      const res = await procurementApi.rateHistory({ medicineId: rateMedicineId });
      setRateRows(res?.rows ?? []);
    } catch (err: any) {
      setRateError(err?.message ?? "Failed to load rate history");
    } finally {
      setRateLoading(false);
    }
  }, [rateMedicineId]);

  useEffect(() => {
    if (rateMedicineId) void loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateMedicineId]);

  // ─── Quotes ──────────────────────────────────────────────────
  const saveQuote = async () => {
    if (!quoteForm.supplierId) return toast.error("Select a supplier");
    if (!quoteForm.medicineId) return toast.error("Select a medicine");
    const rate = Number(quoteForm.quotedRate);
    if (!Number.isFinite(rate) || rate < 0) return toast.error("Enter a valid quoted rate");
    setSavingQuote(true);
    try {
      const { procurementApi } = await import("@/lib/api");
      await procurementApi.createQuote({
        supplierId: quoteForm.supplierId,
        medicineId: quoteForm.medicineId,
        quotedRate: rate,
        quoteDate: quoteForm.quoteDate || undefined,
        notes: quoteForm.notes || undefined,
      });
      toast.success("Quote recorded");
      setQuoteForm((f) => ({ ...f, quotedRate: "", notes: "" }));
      await loadQuotes();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save quote");
    } finally {
      setSavingQuote(false);
    }
  };

  const supplierName = (id: string) =>
    suppliers.find((s: any) => s.id === id)?.name ?? "—";
  const medicineName = (id: string) =>
    medicines.find((m: any) => m.id === id)?.name ?? "—";

  const navigate = useNavigate();
  if (metaLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (suppliers.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
        <h1 className="text-xl font-semibold tracking-tight">Procurement</h1>
        <EmptyState
          icon={BarChart3}
          title="No suppliers yet"
          description="Add suppliers first — procurement intelligence ranks them by rate, credit terms and performance."
          actions={[{ label: "Go to Suppliers", onClick: () => navigate("/dashboard/suppliers") }]}
        />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Procurement</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Supplier rates, credit terms, performance and expiry responsibility
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="h-9">
          <TabsTrigger value="metrics" className="text-xs gap-1">
            <BarChart3 className="h-3 w-3" />Metrics
          </TabsTrigger>
          <TabsTrigger value="rates" className="text-xs gap-1">
            <History className="h-3 w-3" />Rate History
          </TabsTrigger>
          <TabsTrigger value="quotes" className="text-xs gap-1">
            <MessageSquarePlus className="h-3 w-3" />Quotes
          </TabsTrigger>
          <TabsTrigger value="expiry" className="text-xs gap-1">
            <AlertTriangle className="h-3 w-3" />Expiry
          </TabsTrigger>
        </TabsList>

        {/* ── SUPPLIER METRICS ── */}
        <TabsContent value="metrics" className="space-y-4">
          <Card className="p-4 border-border/60">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <Label className="text-xs">Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              <Button
                className="h-9"
                variant="outline"
                onClick={() => {
                  void loadMetrics();
                  void loadExpiry();
                }}
                disabled={metricsLoading}
              >
                {metricsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Apply
              </Button>
            </div>
          </Card>

          {metricsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : metricsError ? (
            <EmptyState icon={AlertTriangle} title="Could not load metrics" description={metricsError} />
          ) : !metrics ? (
            <EmptyState icon={BarChart3} title="Select a supplier" description="Pick a supplier to see performance metrics." />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Total purchased", value: fmtMoney(metrics.totals?.totalPurchased) },
                  { label: "Total paid", value: fmtMoney(metrics.totals?.totalPaid) },
                  {
                    label: "Outstanding",
                    value: fmtMoney(metrics.totals?.outstanding),
                    accent: (metrics.totals?.outstanding ?? 0) > 0,
                  },
                  { label: "Bills", value: String(metrics.metrics?.billCount ?? 0) },
                  { label: "Return rate", value: `${metrics.metrics?.returnRatePct ?? 0}%` },
                  { label: "Avg payment days", value: `${metrics.metrics?.avgPaymentDays ?? 0} d` },
                  {
                    label: "Expiry risk value",
                    value: fmtMoney(metrics.metrics?.expiryRiskValue),
                    accent: (metrics.metrics?.expiryRiskValue ?? 0) > 0,
                  },
                  { label: "Payment terms", value: metrics.paymentTerms ?? "—" },
                ].map((c) => (
                  <Card key={c.label} className="p-4 border-border/60">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {c.label}
                    </p>
                    <p
                      className={`mt-1 text-lg font-semibold tabular-nums ${
                        c.accent ? "text-red-600" : "text-foreground"
                      }`}
                    >
                      {c.value}
                    </p>
                  </Card>
                ))}
              </div>

              <Card className="p-4 border-border/60">
                <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                  Bill trend — {metrics.supplierName}
                </h3>
                {metrics.bills?.length ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bill No.</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Due date</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metrics.bills.map((b: any) => (
                          <TableRow key={`${b.billNo}-${b.billDate}`}>
                            <TableCell className="font-mono text-sm">{b.billNo}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {shortDate(b.billDate)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {fmtMoney(b.grandTotal)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {fmtMoney(b.amountPaid)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {shortDate(b.dueDate)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={
                                  b.paymentStatus === "paid"
                                    ? "default"
                                    : b.paymentStatus === "partial"
                                      ? "secondary"
                                      : "outline"
                                }
                                className="text-[10px]"
                              >
                                {b.paymentStatus ?? "unpaid"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No purchase bills in this period.
                  </p>
                )}
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── RATE HISTORY ── */}
        <TabsContent value="rates" className="space-y-4">
          <Card className="p-4 border-border/60">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <Label className="text-xs">Medicine</Label>
                <Select value={rateMedicineId} onValueChange={setRateMedicineId}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Select medicine" />
                  </SelectTrigger>
                  <SelectContent>
                    {medicines.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                        {m.brand ? ` (${m.brand})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="h-9" variant="outline" onClick={() => void loadRates()}>
                Refresh
              </Button>
            </div>
          </Card>

          {!rateMedicineId ? (
            <EmptyState icon={History} title="Pick a medicine" description="Select a medicine to see its purchase rate timeline." />
          ) : rateLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rateError ? (
            <EmptyState icon={AlertTriangle} title="Could not load rate history" description={rateError} />
          ) : rateRows.length === 0 ? (
            <EmptyState
              icon={History}
              title="No rate history yet"
              description="Record purchases or quotes and the timeline will build itself."
            />
          ) : (
            <div className="border rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Bill</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Effective/unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateRows.map((r, i) => (
                    <TableRow key={`${r.date}-${r.billNo ?? "q"}-${i}`}>
                      <TableCell className="text-sm">{shortDate(r.date)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={r.source === "quote" ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {r.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.supplierName ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.billNo ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {r.quantity ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmtMoney(r.rate)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {fmtMoney(r.effectiveUnitCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── QUOTES ── */}
        <TabsContent value="quotes" className="space-y-4">
          <Card className="p-5 border-border/60">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
              Record a supplier quote
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div>
                <Label className="text-xs">Supplier</Label>
                <Select
                  value={quoteForm.supplierId}
                  onValueChange={(v) => setQuoteForm((f) => ({ ...f, supplierId: v }))}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Medicine</Label>
                <Select
                  value={quoteForm.medicineId}
                  onValueChange={(v) => setQuoteForm((f) => ({ ...f, medicineId: v }))}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {medicines.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Quoted rate (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={quoteForm.quotedRate}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, quotedRate: e.target.value }))}
                  placeholder="0.00"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Quote date</Label>
                <Input
                  type="date"
                  value={quoteForm.quoteDate}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, quoteDate: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
              <Button className="h-9" onClick={() => void saveQuote()} disabled={savingQuote}>
                {savingQuote ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
                )}
                Save Quote
              </Button>
              <div className="sm:col-span-2 lg:col-span-5">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea
                  value={quoteForm.notes}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. WhatsApp quote, valid till month end"
                  className="mt-1 h-9 min-h-9 resize-none"
                  rows={1}
                />
              </div>
            </div>
          </Card>

          {quotesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : quotesError ? (
            <EmptyState icon={AlertTriangle} title="Could not load quotes" description={quotesError} />
          ) : quoteRows.length === 0 ? (
            <EmptyState
              icon={MessageSquarePlus}
              title="No quotes recorded"
              description="Record phone or WhatsApp quotations to compare them against real purchase rates."
            />
          ) : (
            <div className="border rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Medicine</TableHead>
                    <TableHead className="text-right">Quoted rate</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quoteRows.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="text-sm">{shortDate(q.quoteDate)}</TableCell>
                      <TableCell className="text-sm">{q.supplierName ?? supplierName(q.supplierId)}</TableCell>
                      <TableCell className="text-sm">{q.medicineName ?? medicineName(q.medicineId)}</TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {fmtMoney(q.quotedRate)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{q.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── SUPPLIER-WISE EXPIRY RESPONSIBILITY ── */}
        <TabsContent value="expiry" className="space-y-4">
          <Card className="p-4 border-border/60">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <Label className="text-xs">Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9" />
              </div>
              <Button className="h-9" variant="outline" onClick={() => void loadExpiry()}>
                Apply
              </Button>
            </div>
          </Card>

          <Card className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Stock from this supplier expiring (or expired) within 365 days
              </span>
            </div>
            <span className="text-lg font-semibold tabular-nums text-red-600">
              {fmtMoney(expiryTotal)}
            </span>
          </Card>

          {expiryLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : expiryError ? (
            <EmptyState icon={AlertTriangle} title="Could not load expiry items" description={expiryError} />
          ) : expiryRows.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No expiry exposure"
              description="None of this supplier's purchases are expiring within the next 365 days."
            />
          ) : (
            <div className="border rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Days left</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Bill</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiryRows.map((r, i) => (
                    <TableRow key={`${r.medicineName}-${r.batchNo}-${i}`}>
                      <TableCell className="text-sm">{r.medicineName}</TableCell>
                      <TableCell className="font-mono text-xs">{r.batchNo ?? "—"}</TableCell>
                      <TableCell className="text-sm">{shortDate(r.expiryDate)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        <span className={r.daysToExpiry < 0 ? "text-red-600 font-medium" : ""}>
                          {r.daysToExpiry}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{r.quantity}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtMoney(r.rate)}</TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {fmtMoney(r.value)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.billNo ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
