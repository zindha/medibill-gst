import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  inventoryApi,
  medicinesApi,
  stockAuditsApi,
  type StockAudit,
  type StockAuditDetail,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Plus,
  Printer,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type StatusFilter = "all" | "open" | "approved" | "cancelled";
type RowFilter = "all" | "variance" | "uncounted";

const STATUS_BADGE: Record<string, string> = {
  open: "border-amber-300 bg-amber-50 text-amber-700",
  approved: "border-green-300 bg-green-50 text-green-700",
  cancelled: "border-red-300 bg-red-50 text-red-600",
};

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "approved", label: "Approved" },
  { value: "cancelled", label: "Cancelled" },
];

const ROW_TABS: { value: RowFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "variance", label: "Variance only" },
  { value: "uncounted", label: "Uncounted" },
];

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", STATUS_BADGE[status] ?? "")}>
      {status}
    </Badge>
  );
}

function formatDate(raw?: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(raw?: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(n: number): string {
  return `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN")}`;
}

interface DisplayRow {
  key: string;
  medicineId: string;
  batchId: string;
  medicineName: string;
  medicineBrand?: string | null;
  batchNo: string;
  expiryDate: string;
  expected: number;
  counted: number | null;
  variance: number | null;
  currentQuantity: number;
  countedAt?: string | null;
}

export default function StockAuditPage() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const canApprove = user?.role === "admin" || user?.role === "pharmacist";

  const [audits, setAudits] = useState<StockAudit[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [statusTab, setStatusTab] = useState<StatusFilter>("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StockAuditDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [creating, setCreating] = useState(false);

  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [rowSearch, setRowSearch] = useState("");
  const debouncedRowSearch = useDebouncedValue(rowSearch.trim(), 250);

  const [entryQuery, setEntryQuery] = useState("");
  const debouncedEntryQuery = useDebouncedValue(entryQuery.trim(), 250);
  const [entryResults, setEntryResults] = useState<any[]>([]);
  const [entrySearching, setEntrySearching] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<any | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [countedQty, setCountedQty] = useState("");
  const [counting, setCounting] = useState(false);

  const [approveOpen, setApproveOpen] = useState(false);
  const [approveReason, setApproveReason] = useState("");
  const [approveBusy, setApproveBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const res = await stockAuditsApi.list({
        status: statusTab === "all" ? undefined : statusTab,
        limit: 100,
      });
      setAudits(res.data);
    } catch (err: any) {
      setListError(err?.message ?? "Failed to load stock audits");
    } finally {
      setListLoading(false);
    }
  }, [statusTab]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const data = await stockAuditsApi.get(id);
      setDetail(data);
    } catch (err: any) {
      setDetailError(err?.message ?? "Failed to load audit session");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadList();
  }, [isAuthenticated, loadList]);

  useEffect(() => {
    if (authLoading && !isAuthenticated) return;
    if (!isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!isAuthenticated || selectedMedicine || !debouncedEntryQuery) {
      setEntryResults([]);
      setEntrySearching(false);
      return;
    }
    let active = true;
    setEntrySearching(true);
    inventoryApi
      .stock(debouncedEntryQuery)
      .then((rows) => {
        if (!active) return;
        setEntryResults((Array.isArray(rows) ? rows : []).slice(0, 8));
      })
      .catch(() => {
        if (active) setEntryResults([]);
      })
      .finally(() => {
        if (active) setEntrySearching(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, debouncedEntryQuery, selectedMedicine]);

  const resetEntry = () => {
    setEntryQuery("");
    setEntryResults([]);
    setSelectedMedicine(null);
    setBatches([]);
    setSelectedBatchId("");
    setCountedQty("");
  };

  const pickMedicine = async (med: any) => {
    setSelectedMedicine(med);
    setEntryQuery(med.name ?? "");
    setEntryResults([]);
    const list = Array.isArray(med.batches) && med.batches.length > 0
      ? med.batches
      : await inventoryApi.getBatches(med.id).catch(() => []);
    setBatches(list);
    setSelectedBatchId(list[0]?.id ?? "");
    setCountedQty("");
  };

  const handleBarcodeEnter = async () => {
    if (selectedMedicine || !entryQuery.trim()) return;
    try {
      const med = await medicinesApi.getByBarcode(entryQuery.trim());
      if (med?.id) await pickMedicine(med);
    } catch {
      if (entryResults.length === 0) toast.error("No medicine found for that barcode");
    }
  };

  const submitCount = async () => {
    if (!selectedId || !selectedMedicine || !selectedBatchId) return;
    const qty = Number(countedQty);
    if (countedQty.trim() === "" || Number.isNaN(qty) || qty < 0) {
      toast.error("Enter the counted quantity (0 or more)");
      return;
    }
    setCounting(true);
    try {
      const res = await stockAuditsApi.count(selectedId, {
        medicineId: selectedMedicine.id,
        batchId: selectedBatchId,
        countedQuantity: qty,
      });
      toast.success(res.created ? "Count recorded" : "Count updated");
      resetEntry();
      await loadDetail(selectedId);
      void loadList();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to record count");
    } finally {
      setCounting(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const audit = await stockAuditsApi.create({ note: newNote.trim() || undefined });
      toast.success("Stock audit started");
      setCreateOpen(false);
      setNewNote("");
      setSelectedId(audit.id);
      void loadList();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to start audit");
    } finally {
      setCreating(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedId) return;
    const reason = approveReason.trim();
    if (!reason) {
      toast.error("Approval reason is required");
      return;
    }
    setApproveBusy(true);
    try {
      const res = await stockAuditsApi.approve(selectedId, reason);
      toast.success(`Audit approved — ${res.adjustments.length} adjustment${res.adjustments.length === 1 ? "" : "s"} posted`);
      setApproveOpen(false);
      setApproveReason("");
      await loadDetail(selectedId);
      void loadList();
    } catch (err: any) {
      toast.error(err?.message ?? "Approval failed");
    } finally {
      setApproveBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedId) return;
    setCancelBusy(true);
    try {
      await stockAuditsApi.cancel(selectedId, cancelReason.trim() || undefined);
      toast.success("Stock audit cancelled");
      setCancelOpen(false);
      setCancelReason("");
      await loadDetail(selectedId);
      void loadList();
    } catch (err: any) {
      toast.error(err?.message ?? "Cancel failed");
    } finally {
      setCancelBusy(false);
    }
  };

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (!detail) return [];
    const counted: DisplayRow[] = detail.rows.map((r) => ({
      key: `c:${r.id}`,
      medicineId: r.medicineId,
      batchId: r.batchId,
      medicineName: r.medicineName,
      medicineBrand: r.medicineBrand,
      batchNo: r.batchNo,
      expiryDate: r.expiryDate,
      expected: r.expectedQuantity,
      counted: r.countedQuantity,
      variance: r.variance,
      currentQuantity: r.currentBatchQuantity,
      countedAt: r.countedAt,
    }));
    const uncounted: DisplayRow[] = detail.uncounted.map((r) => ({
      key: `u:${r.id}`,
      medicineId: r.medicineId,
      batchId: r.id,
      medicineName: r.medicineName,
      medicineBrand: r.medicineBrand,
      batchNo: r.batchNo,
      expiryDate: r.expiryDate,
      expected: r.currentQuantity,
      counted: null,
      variance: null,
      currentQuantity: r.currentQuantity,
      countedAt: null,
    }));
    return [...counted, ...uncounted];
  }, [detail]);

  const filteredRows = useMemo(() => {
    let rows = displayRows;
    if (rowFilter === "variance") rows = rows.filter((r) => r.variance !== null && r.variance !== 0);
    else if (rowFilter === "uncounted") rows = rows.filter((r) => r.counted === null);
    if (debouncedRowSearch) {
      const q = debouncedRowSearch.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.medicineName.toLowerCase().includes(q) ||
          (r.medicineBrand ?? "").toLowerCase().includes(q) ||
          r.batchNo.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [displayRows, rowFilter, debouncedRowSearch]);

  const varianceRows = useMemo(
    () => displayRows.filter((r) => r.variance !== null && r.variance !== 0),
    [displayRows]
  );

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (selectedId) {
    const audit = detail?.audit;
    const isOpen = audit?.status === "open";
    const summary = detail?.summary;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-full min-h-0 flex-col gap-4 overflow-hidden"
      >
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" className="mt-0.5 px-2" onClick={() => { setSelectedId(null); resetEntry(); }} aria-label="Back to stock audits">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">Stock Audit</h1>
                {audit && <StatusBadge status={audit.status} />}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {audit?.note ? `${audit.note} · ` : ""}
                Started {formatDateTime(audit?.startedAt)}
                {audit?.approvedAt ? ` · Approved ${formatDateTime(audit.approvedAt)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1.5" />Print report
            </Button>
            {canApprove && isOpen && (
              <>
                <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                  <X className="h-3.5 w-3.5 mr-1.5" />Cancel audit
                </Button>
                <Button
                  size="sm"
                  disabled={!detail || detail.rows.length === 0 || detailLoading}
                  onClick={() => {
                    setApproveReason("");
                    setApproveOpen(true);
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approve
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Counted</p>
            <p className="text-lg font-semibold tabular-nums">
              {summary ? `${summary.counted}/${summary.totalRows}` : "—"}
            </p>
          </Card>
          <Card className="px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Variance rows</p>
            <p className="text-lg font-semibold tabular-nums">{summary ? summary.varianceRows : "—"}</p>
          </Card>
          <Card className="px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Net variance</p>
            <p className={cn("text-lg font-semibold tabular-nums", (summary?.totalVarianceValue ?? 0) < 0 ? "text-red-600" : (summary?.totalVarianceValue ?? 0) > 0 ? "text-green-600" : "")}>
              {summary ? formatMoney(summary.totalVarianceValue ?? 0) : "—"}
            </p>
          </Card>
          <Card className="px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</p>
            <p className="text-lg font-semibold capitalize">{audit?.status ?? "—"}</p>
          </Card>
        </div>

        {isOpen && (
          <Card className="shrink-0 p-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
              <div className="relative flex-1">
                <Label className="text-xs">Scan barcode or search medicine</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    data-stock-audit-search
                    value={entryQuery}
                    onChange={(e) => {
                      setEntryQuery(e.target.value);
                      if (selectedMedicine) {
                        setSelectedMedicine(null);
                        setBatches([]);
                        setSelectedBatchId("");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleBarcodeEnter();
                      }
                    }}
                    placeholder="Scan or type medicine name… (Enter scans barcode)"
                    className="pl-9 h-9"
                    disabled={counting}
                  />
                  {entrySearching && (
                    <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {!selectedMedicine && entryResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card shadow-md">
                    {entryResults.map((med) => (
                      <button
                        key={med.id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary/70"
                        onClick={() => void pickMedicine(med)}
                      >
                        <span className="truncate">
                          {med.name}
                          {med.brand ? <span className="text-muted-foreground"> · {med.brand}</span> : null}
                        </span>
                        <span className="ml-2 shrink-0 text-xs text-muted-foreground tabular-nums">
                          {med.totalStock ?? 0} in stock
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedMedicine && (
                <>
                  <div className="w-full lg:w-64">
                    <Label className="text-xs">Batch</Label>
                    <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue placeholder="Select batch" />
                      </SelectTrigger>
                      <SelectContent>
                        {batches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.batchNo} · exp {b.expiryDate} · qty {b.quantity}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full lg:w-36">
                    <Label className="text-xs">Counted qty</Label>
                    <Input
                      type="number"
                      min={0}
                      value={countedQty}
                      onChange={(e) => setCountedQty(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void submitCount();
                        }
                      }}
                      className="mt-1 h-9"
                      placeholder="0"
                    />
                  </div>
                  <Button size="sm" className="h-9" onClick={() => void submitCount()} disabled={counting}>
                    {counting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-1.5" />}
                    Record count
                  </Button>
                  <Button variant="ghost" size="sm" className="h-9 px-2" onClick={resetEntry} aria-label="Clear entry">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </Card>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {ROW_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setRowFilter(tab.value)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs transition-colors",
                  rowFilter === tab.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              value={rowSearch}
              onChange={(e) => setRowSearch(e.target.value)}
              placeholder="Search rows…"
              className="pl-9 h-8 w-48 text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          {detailLoading && !detail ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : detailError ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2">
              <p className="text-sm text-destructive">{detailError}</p>
              <Button variant="outline" size="sm" onClick={() => selectedId && loadDetail(selectedId)}>Retry</Button>
            </div>
          ) : filteredRows.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={detail && detail.rows.length === 0 && detail.uncounted.length === 0 ? "No batches to count yet" : "No matching rows"}
              description={
                detail && detail.rows.length === 0 && detail.uncounted.length === 0
                  ? "Add inventory batches, then scan them here to record physical counts."
                  : "Adjust the filter or search to see rows."
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Medicine</th>
                  <th className="px-3 py-2 font-medium">Batch</th>
                  <th className="px-3 py-2 font-medium">Expiry</th>
                  <th className="px-3 py-2 text-right font-medium">Expected</th>
                  <th className="px-3 py-2 text-right font-medium">Counted</th>
                  <th className="px-3 py-2 text-right font-medium">Variance</th>
                  <th className="px-3 py-2 font-medium">Counted at</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.key} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{r.medicineName}</span>
                      {r.medicineBrand ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">{r.medicineBrand}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.batchNo}</td>
                    <td className="px-3 py-2 tabular-nums">{r.expiryDate}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.expected}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.counted === null ? <span className="text-muted-foreground">—</span> : r.counted}
                    </td>
                    <td className={cn("px-3 py-2 text-right font-medium tabular-nums",
                      r.variance === null ? "text-muted-foreground" : r.variance < 0 ? "text-red-600" : r.variance > 0 ? "text-green-600" : "text-muted-foreground")}>
                      {r.variance === null ? "—" : r.variance > 0 ? `+${r.variance}` : r.variance}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.countedAt ? formatDateTime(r.countedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Printable audit report — screen-hidden, revealed by @media print */}
        <div className="stock-audit-print">
          <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>Stock Audit Report</h1>
          <p style={{ fontSize: 12, margin: 0 }}>
            Status: {audit?.status} · Started: {formatDateTime(audit?.startedAt)} ·
            {audit?.approvedAt ? ` Approved: ${formatDateTime(audit.approvedAt)} ·` : ""} Note: {audit?.note || "—"}
          </p>
          <p style={{ fontSize: 12, margin: "4px 0 12px" }}>
            Counted {summary?.counted ?? 0}/{summary?.totalRows ?? 0} batches · Variance rows:{" "}
            {summary?.varianceRows ?? 0} · Net variance: {formatMoney(summary?.totalVarianceValue ?? 0)}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Medicine", "Batch", "Expiry", "Expected", "Counted", "Variance"].map((h) => (
                  <th key={h} style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => (
                <tr key={r.key}>
                  <td style={{ border: "1px solid #999", padding: "4px 6px" }}>
                    {r.medicineName}
                    {r.medicineBrand ? ` · ${r.medicineBrand}` : ""}
                  </td>
                  <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.batchNo}</td>
                  <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{r.expiryDate}</td>
                  <td style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "right" }}>{r.expected}</td>
                  <td style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "right" }}>
                    {r.counted ?? "—"}
                  </td>
                  <td style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "right" }}>
                    {r.variance === null ? "—" : r.variance > 0 ? `+${r.variance}` : r.variance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Approve stock audit</DialogTitle>
              <DialogDescription>
                Posts an adjustment transaction for every non-zero variance below. Counts become
                immutable once approved.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-56 overflow-y-auto rounded-md border border-border p-2">
              {varianceRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No variances — nothing will be adjusted.</p>
              ) : (
                varianceRows.map((r) => (
                  <div key={r.key} className="flex items-center justify-between text-sm">
                    <span className="truncate">
                      {r.medicineName} <span className="text-muted-foreground">· {r.batchNo}</span>
                    </span>
                    <span className="tabular-nums">
                      {r.expected} → {r.counted}{" "}
                      <span className={cn("font-medium", r.variance! < 0 ? "text-red-600" : "text-green-600")}>
                        ({r.variance! > 0 ? "+" : ""}
                        {r.variance})
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
            <div>
              <Label className="text-xs">Approval reason *</Label>
              <Textarea
                value={approveReason}
                onChange={(e) => setApproveReason(e.target.value)}
                placeholder="e.g. September month-end physical count reviewed"
                className="mt-1 min-h-16"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setApproveOpen(false)}>
                Back
              </Button>
              <Button size="sm" onClick={() => void handleApprove()} disabled={approveBusy}>
                {approveBusy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Approve
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cancel stock audit</DialogTitle>
              <DialogDescription>
                The session is closed without touching stock. Count rows are kept for history.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label className="text-xs">Reason (optional)</Label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Counted on the wrong day"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)}>
                Keep open
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void handleCancel()} disabled={cancelBusy}>
                {cancelBusy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Cancel audit
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 flex-col gap-4 overflow-hidden"
    >
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Stock Audit</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Physical stock-take sessions — count batches, review variances, approve adjustments
          </p>
        </div>
        <Button size="sm" onClick={() => { setNewNote(""); setCreateOpen(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />New Audit
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusTab(tab.value)}
              className={cn(
                "rounded px-2.5 py-1 text-xs transition-colors",
                statusTab === tab.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        {listLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : listError ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <p className="text-sm text-destructive">{listError}</p>
            <Button variant="outline" size="sm" onClick={() => void loadList()}>Retry</Button>
          </div>
        ) : audits.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No stock audits yet"
            description="Start a session, scan each batch and record the physical count. Variances become adjustment transactions on approval."
            actions={[{ label: "Start stock audit", onClick: () => { setNewNote(""); setCreateOpen(true); } }]}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Note</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Progress</th>
                <th className="px-3 py-2 text-right font-medium">Variance rows</th>
                <th className="px-3 py-2 text-right font-medium">Net variance</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                  <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                  <td className="max-w-56 truncate px-3 py-2">{a.note || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(a.startedAt)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {a.summary ? `${a.summary.counted}/${a.summary.totalRows}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.summary?.varianceRows ?? "—"}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums",
                    (a.summary?.totalVarianceValue ?? 0) < 0 ? "text-red-600" : (a.summary?.totalVarianceValue ?? 0) > 0 ? "text-green-600" : "")}>
                    {a.summary ? formatMoney(a.summary.totalVarianceValue ?? 0) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => { setSelectedId(a.id); }}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start stock audit</DialogTitle>
            <DialogDescription>
              Opens a new session. Expected quantities are frozen per batch when you record the
              first count — batches added later stay out of the variance until counted.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="e.g. Month-end count — shelf A to D"
              className="mt-1 min-h-16"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleCreate()} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Start audit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
