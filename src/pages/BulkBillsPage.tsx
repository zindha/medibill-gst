import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  bulkBillsApi,
  type BulkBillFilters,
  type BulkBillPatch,
  type BulkBillPreviewResult,
} from "@/lib/api";
import { AlertTriangle, CheckCircle2, Eye, Files, Loader2, PencilLine } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const PAYMENT_MODE_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "credit", label: "Credit" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
];

const FIELD_LABELS: Record<string, string> = {
  customerId: "Customer",
  date: "Date",
  notes: "Notes",
  paymentMode: "Payment mode",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function BulkBillsPage() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("any");
  const [customerId, setCustomerId] = useState("any");
  const [q, setQ] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const [patchCustomerId, setPatchCustomerId] = useState("any");
  const [patchDate, setPatchDate] = useState("");
  const [patchNotes, setPatchNotes] = useState("");
  const [patchPaymentMode, setPatchPaymentMode] = useState("any");

  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [preview, setPreview] = useState<BulkBillPreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const { customersApi } = await import("@/lib/api");
        const res: any = await customersApi.list({ limit: 500 });
        if (cancelled) return;
        const list: any[] = Array.isArray(res) ? res : res?.data ?? [];
        setCustomers(list.map((c) => ({ id: c.id, name: c.name })));
      } catch {
        // Non-fatal: the customer select simply stays empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const filters = useMemo<BulkBillFilters>(() => {
    const out: BulkBillFilters = {};
    if (from) out.from = from;
    if (to) out.to = to;
    if (status !== "any") out.status = status;
    if (customerId !== "any") out.customerId = customerId;
    if (q.trim()) out.q = q.trim();
    if (minAmount !== "" && !Number.isNaN(Number(minAmount))) out.minAmount = Number(minAmount);
    if (maxAmount !== "" && !Number.isNaN(Number(maxAmount))) out.maxAmount = Number(maxAmount);
    return out;
  }, [from, to, status, customerId, q, minAmount, maxAmount]);

  const patch = useMemo<BulkBillPatch>(() => {
    const out: BulkBillPatch = {};
    if (patchCustomerId !== "any") out.customerId = patchCustomerId === "walkin" ? null : patchCustomerId;
    if (patchDate) out.date = patchDate;
    if (patchNotes) out.notes = patchNotes;
    if (patchPaymentMode !== "any") out.paymentMode = patchPaymentMode;
    return out;
  }, [patchCustomerId, patchDate, patchNotes, patchPaymentMode]);

  const patchKeys = Object.keys(patch);
  const hasFilters = Object.keys(filters).length > 0;

  const handlePreview = useCallback(async () => {
    if (!hasFilters) {
      toast.error("Set at least one filter — a bulk edit must be scoped");
      return;
    }
    if (patchKeys.length === 0) {
      toast.error("Choose at least one field to change");
      return;
    }
    setPreviewing(true);
    try {
      const result = await bulkBillsApi.preview({ filters, patch });
      setPreview(result);
      toast.message(`${result.total} invoice(s) match`);
    } catch (err: any) {
      if (err?.status === 403) toast.error("Insufficient permissions — admin or pharmacist only");
      else toast.error(err?.message ?? "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }, [filters, patch, patchKeys, hasFilters]);

  const handleCommit = useCallback(async () => {
    setCommitting(true);
    try {
      const result = await bulkBillsApi.commit({ filters, patch, confirm: "CONFIRM" });
      toast.success(
        `${result.updated} invoice(s) updated${result.skipped ? `, ${result.skipped} skipped` : ""} — audit event recorded`
      );
      setConfirmOpen(false);
      setConfirmText("");
      setPreview(null);
      // Re-run the preview so the grid reflects the new values.
      try {
        setPreview(await bulkBillsApi.preview({ filters, patch }));
      } catch {
        /* non-fatal */
      }
    } catch (err: any) {
      if (err?.status === 403) {
        toast.error("Insufficient permissions — only admins and pharmacists can apply bulk changes");
      } else {
        toast.error(err?.message ?? "Bulk change failed");
      }
      setConfirmOpen(false);
    } finally {
      setCommitting(false);
    }
  }, [filters, patch]);

  if (authLoading) return null;

  const privileged = !user || user.role === "admin" || user.role === "pharmacist";

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Files className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Bulk Edit Bills</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select invoices with filters, preview every change as an old → new diff, then apply
              with confirmation — one audit event per bulk change
            </p>
          </div>
        </div>
        {preview && (
          <Badge variant="secondary" className="mt-1">
            {preview.total} matched
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Filters */}
        <Card className="p-5 border-border/60">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            1 · Filter the bills
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any (except cancelled)</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Customer</label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Any customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-muted-foreground">
                Search invoice # or customer
              </label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="MB-2026…"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Min total</label>
              <Input
                type="number"
                min={0}
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Max total</label>
              <Input
                type="number"
                min={0}
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </Card>

        {/* Patch */}
        <Card className="p-5 border-border/60">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            2 · Choose what changes (only filled fields are sent)
          </h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Reassign customer</label>
              <Select value={patchCustomerId} onValueChange={setPatchCustomerId}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Leave unchanged</SelectItem>
                  <SelectItem value="walkin">Clear (walk-in)</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Set date</label>
              <Input
                type="date"
                value={patchDate}
                onChange={(e) => setPatchDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Set payment mode</label>
              <Select value={patchPaymentMode} onValueChange={setPatchPaymentMode}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Leave unchanged</SelectItem>
                  {PAYMENT_MODE_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Set notes (≤500 chars)</label>
              <Textarea
                value={patchNotes}
                onChange={(e) => setPatchNotes(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Leave empty to keep notes unchanged"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Will change:</span>
              {patchKeys.length === 0 ? (
                <span className="text-xs text-amber-700">nothing yet — pick a field above</span>
              ) : (
                patchKeys.map((key) => (
                  <Badge key={key} variant="outline" className="text-xs">
                    <PencilLine className="h-3 w-3 mr-1" />
                    {FIELD_LABELS[key] ?? key}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Preview action */}
      <Card className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {hasFilters ? (
            <>
              Filters active — cancelled bills are never matched. Empty filters intentionally match
              nothing.
            </>
          ) : (
            <span className="text-amber-700 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Set at least one filter before previewing
            </span>
          )}
        </div>
        <Button onClick={() => void handlePreview()} disabled={previewing}>
          {previewing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Eye className="h-4 w-4 mr-2" />
          )}
          Preview changes
        </Button>
      </Card>

      {/* Results */}
      {!preview ? (
        <Card className="p-8 border-border/60 text-center text-sm text-muted-foreground">
          Set filters and a patch above, then hit “Preview changes” — you will see every matched
          bill with its old → new diff before anything is written
        </Card>
      ) : preview.total === 0 ? (
        <Card className="p-8 border-border/60 text-center text-sm text-muted-foreground">
          No invoices match these filters
        </Card>
      ) : (
        <Card className="p-5 border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
                Matched bills
              </h3>
              <Badge variant="secondary">{preview.total}</Badge>
            </div>
            <Button onClick={() => setConfirmOpen(true)} disabled={!privileged}>
              {privileged
                ? `Apply to ${preview.total} bill${preview.total === 1 ? "" : "s"}`
                : "Admin or pharmacist only"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-sm font-medium">{inv.invoiceNo}</TableCell>
                    <TableCell className="text-sm">{inv.date}</TableCell>
                    <TableCell className="text-sm">{inv.customerName ?? "Walk-in"}</TableCell>
                    <TableCell className="text-right text-sm">{inv.grandTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "unpaid" ? "outline" : "secondary"}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-72">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(inv.diffs).map(([key, diff]) => {
                          const changed = formatValue(diff.from) !== formatValue(diff.to);
                          return (
                            <span
                              key={key}
                              className={`text-xs rounded border px-1.5 py-0.5 ${
                                changed
                                  ? "border-green-300 bg-green-50 text-green-800"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {FIELD_LABELS[key] ?? key}: {formatValue(diff.from)} →{" "}
                              <strong>{formatValue(diff.to)}</strong>
                            </span>
                          );
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            Applying writes only the fields shown above (totals and line items are never touched)
            and records one <span className="font-mono">invoice.bulk_patch</span> audit event.
          </p>
        </Card>
      )}

      {/* CONFIRM dialog */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setConfirmText("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply bulk change to {preview?.total ?? 0} bill(s)?</DialogTitle>
            <DialogDescription>
              This updates {patchKeys.map((k) => FIELD_LABELS[k] ?? k).join(", ")} on every matched
              bill. Type <span className="font-mono font-semibold">CONFIRM</span> to proceed.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="CONFIRM"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCommit()}
              disabled={committing || confirmText !== "CONFIRM"}
            >
              {committing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Apply changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
