/**
 * Cheque register panel — issued/received post-dated cheques.
 * Rendered inside CashBankPage's "cheques" tab.
 */
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import {
  chequesApi,
  type Cheque,
  type ChequeDirection,
  type ChequeStatus,
} from "@/lib/chequesApi";
import { CalendarClock, Loader2, Plus, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const money = (minor: number) => `₹${(Number(minor ?? 0) / 100).toFixed(2)}`;

const STATUS_PILL: Record<ChequeStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "border-amber-600/30 text-amber-700 bg-amber-600/5" },
  cleared: { label: "Cleared", cls: "border-green-600/30 text-green-700 bg-green-600/5" },
  bounced: { label: "Bounced", cls: "border-red-600/30 text-red-700 bg-red-600/5" },
  cancelled: { label: "Cancelled", cls: "border-gray-500/30 text-gray-600 bg-gray-100" },
};

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Upcoming pending cheques within N days — LocalWell-style alert strip. */
function dueSoon(c: Cheque): boolean {
  if (c.status !== "pending") return false;
  const days = (new Date(c.dueDate).getTime() - Date.now()) / 86400000;
  return days <= 7;
}

export default function ChequesPanel({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | ChequeStatus>("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | ChequeDirection>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add form
  const [direction, setDirection] = useState<ChequeDirection>("issued");
  const [partyType, setPartyType] = useState<"customer" | "supplier" | "other">("customer");
  const [partyName, setPartyName] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [bankName, setBankName] = useState("");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(inDays(30));

  const fetchRows = useCallback(() => chequesApi.list(), []);

  // Mount load: setState only inside async callbacks (never synchronously).
  useEffect(() => {
    let alive = true;
    fetchRows()
      .then((data) => { if (alive) setRows(data.rows ?? []); })
      .catch((err) => {
        if (alive) toast.error(err instanceof Error ? err.message : "Could not load cheques");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetchRows]);

  /** User-triggered reload (after create / status change). */
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRows();
      setRows(data.rows ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load cheques");
    } finally {
      setLoading(false);
    }
  }, [fetchRows]);

  const filtered = rows.filter(
    (r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (directionFilter === "all" || r.direction === directionFilter),
  );

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const pendingValue = rows
    .filter((r) => r.status === "pending")
    .reduce((sum, r) => sum + (r.amountMinor ?? 0), 0);

  const markStatus = async (cheque: Cheque, status: "cleared" | "bounced" | "cancelled") => {
    try {
      await chequesApi.setStatus(cheque.id, status);
      toast.success(`Cheque ${cheque.chequeNo} marked ${status}`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!partyName || !chequeNo || !amount) {
      toast.error("Party, cheque no and amount are required");
      return;
    }
    const amountMinor = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await chequesApi.create({
        direction,
        partyType,
        partyName,
        chequeNo,
        bankName: bankName || undefined,
        amountMinor,
        issueDate,
        dueDate,
      });
      toast.success("Cheque added");
      setAddOpen(false);
      setPartyName("");
      setChequeNo("");
      setBankName("");
      setAmount("");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add cheque");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Cheque Register</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pendingCount} pending · {money(pendingValue)} outstanding
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Cheque
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "all" : (v as ChequeStatus))}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cleared">Cleared</SelectItem>
            <SelectItem value="bounced">Bounced</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={directionFilter} onValueChange={(v) => setDirectionFilter(v === "all" ? "all" : (v as ChequeDirection))}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Issued + Received</SelectItem>
            <SelectItem value="issued">Issued (out)</SelectItem>
            <SelectItem value="received">Received (in)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading cheques…
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No data"
          description="Track post-dated cheques here — clear, bounce or cancel them as they resolve."
          actions={canManage ? [{ label: "Add Cheque", onClick: () => setAddOpen(true) }] : []}
        />
      ) : (
        <Card className="border-border/60 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cheque No</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className={dueSoon(c) ? "bg-amber-500/5" : ""}>
                  <TableCell className="font-mono text-xs">{c.chequeNo}</TableCell>
                  <TableCell className="text-sm">
                    {c.partyName}
                    <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                      {c.direction === "issued" ? "out" : "in"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.bankName ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {dueSoon(c) && <CalendarClock className="h-3 w-3 text-amber-600" />}
                      {String(c.dueDate ?? "").slice(0, 10)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {c.direction === "issued" ? "−" : "+"} {money(c.amountMinor)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_PILL[c.status].cls}`}>
                      {STATUS_PILL[c.status].label}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {c.status === "pending" ? (
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void markStatus(c, "cleared")}>
                            Clear
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => void markStatus(c, "bounced")}>
                            Bounce
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Cheque</DialogTitle>
            <DialogDescription>Record an issued or received post-dated cheque.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Direction</Label>
                <Select value={direction} onValueChange={(v) => setDirection(v as ChequeDirection)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issued">Issued (we pay)</SelectItem>
                    <SelectItem value="received">Received (we get)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Party type</Label>
                <Select value={partyType} onValueChange={(v) => setPartyType(v as typeof partyType)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Party name</Label>
              <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} className="mt-1 h-9" placeholder="Party name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cheque no</Label>
                <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} className="mt-1 h-9" placeholder="123456" />
              </div>
              <div>
                <Label className="text-xs">Bank</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="mt-1 h-9" placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-9" placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Issue date</Label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-9" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                Add Cheque
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
