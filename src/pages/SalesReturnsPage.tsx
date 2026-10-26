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
import { EmptyState } from "@/components/EmptyState";
import { formatPackFraction } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Receipt,
  RefreshCcw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useNavigate } from "react-router";
import { toast } from "sonner";

interface ReturnItem {
  medicineId?: string;
  medicineName: string;
  batchId?: string;
  batchNo?: string;
  quantity: number;
  maxQuantity: number;
  rate: number;
  amount: number;
  gstRate: string;
  gstAmount: number;
  reason: string;
}

const REFUND_MODES = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "credit", label: "Customer Credit" },
  { value: "other", label: "Other" },
];

const RETURN_REASONS = [
  "Medicine expired",
  "Wrong medicine dispensed",
  "Customer changed mind",
  "Medicine damaged",
  "Incorrect quantity",
  "Doctor changed prescription",
  "Other",
];

export default function SalesReturnsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // List state
  const [returns, setReturns] = useState<any[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Create-return state
  const [showCreate, setShowCreate] = useState(false);

  // LocalWell's sale-returns shortcut: F2 opens the Create New Sale Returns dialog.
  useHotkeys([
    { key: "f2", label: "Create New Sale Returns", handler: () => setShowCreate(true) },
  ]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceResults, setInvoiceResults] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [returnReason, setReturnReason] = useState("");
  const [refundMode, setRefundMode] = useState("cash");
  const [submitting, setSubmitting] = useState(false);

  // View state
  const [viewReturn, setViewReturn] = useState<any | null>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  // Load returns list
  const loadReturns = useCallback(async () => {
    try {
      const { returnsApi } = await import("@/lib/api");
      const data = await returnsApi.list({});
      setReturns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load returns:", err);
    } finally {
      setLoadingReturns(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadReturns();
  }, [isAuthenticated, loadReturns]);

  // Search invoices
  const searchInvoices = useCallback(async (query: string) => {
    if (!query.trim()) { setInvoiceResults([]); return; }
    try {
      const { invoicesApi } = await import("@/lib/api");
      const data = await invoicesApi.list({ search: query, limit: 10 });
      setInvoiceResults(Array.isArray(data) ? data : []);
    } catch {
      setInvoiceResults([]);
    }
  }, []);

  // Load invoice items when selected
  const loadInvoiceItems = useCallback(async (invoiceId: string) => {
    try {
      const { invoicesApi } = await import("@/lib/api");
      const inv = await invoicesApi.get(invoiceId);
      setSelectedInvoice(inv);
      setInvoiceItems(inv.items ?? []);

      // Pre-fill return items with all items, qty=0
      const prefill: ReturnItem[] = (inv.items ?? []).map((item: any) => ({
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        batchId: item.batchId,
        batchNo: item.batchNo,
        quantity: 0,
        maxQuantity: item.quantity,
        rate: item.rate,
        amount: 0,
        gstRate: item.gstRate,
        gstAmount: item.gstAmount,
        reason: "",
      }));
      setReturnItems(prefill);
    } catch {
      toast.error("Failed to load invoice items");
    }
  }, []);

  // Update return item quantity
  const updateReturnItem = (index: number, field: keyof ReturnItem, value: any) => {
    setReturnItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };

      if (field === "quantity") {
        item.quantity = Math.min(item.maxQuantity, Math.max(0, Number(value) || 0));
        item.amount = item.quantity * item.rate;
        item.gstAmount = item.amount - item.amount / (1 + Number(item.gstRate) / 100);
      } else if (field === "reason") {
        item.reason = value;
      }

      next[index] = item;
      return next;
    });
  };

  // Calculate totals
  const returnTotals = returnItems.reduce(
    (acc, item) => ({
      subtotal: acc.subtotal + item.amount,
      totalGst: acc.totalGst + item.gstAmount,
      totalQty: acc.totalQty + item.quantity,
    }),
    { subtotal: 0, totalGst: 0, totalQty: 0 },
  );

  // Submit return
  const handleSubmitReturn = async () => {
    const itemsToReturn = returnItems.filter((i) => i.quantity > 0);
    if (itemsToReturn.length === 0) {
      toast.error("Select at least one item to return");
      return;
    }

    setSubmitting(true);
    try {
      const { returnsApi } = await import("@/lib/api");

      const subtotal = returnTotals.subtotal;
      const totalGst = returnTotals.totalGst;
      const cgst = totalGst / 2;
      const sgst = totalGst / 2;
      const grandTotal = subtotal + totalGst;

      await returnsApi.create({
        invoiceId: selectedInvoice.id,
        customerId: selectedInvoice.customerId,
        customerName: selectedInvoice.customerName,
        reason: returnReason,
        refundMode,
        items: itemsToReturn.map((item) => ({
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          batchId: item.batchId,
          batchNo: item.batchNo,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
          gstRate: item.gstRate,
          gstAmount: item.gstAmount,
          cgst: item.gstAmount / 2,
          sgst: item.gstAmount / 2,
          refundAmount: item.amount + item.gstAmount,
          reason: item.reason,
        })),
        subtotal,
        totalGst,
        cgst,
        sgst,
        grandTotal,
        refundAmount: grandTotal,
      });

      toast.success("Return processed successfully");
      setShowCreate(false);
      resetCreateForm();
      loadReturns();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to process return");
    } finally {
      setSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setInvoiceSearch("");
    setInvoiceResults([]);
    setSelectedInvoice(null);
    setInvoiceItems([]);
    setReturnItems([]);
    setReturnReason("");
    setRefundMode("cash");
  };

  const filteredReturns = returns.filter(
    (r) =>
      r.returnNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.invoiceId?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header — LocalWell "Sale Returns Transactions" */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sale Returns Transactions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View List of all your Sale Returns Transactions here
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} title="Create New Sale Returns (F2)">
          <RefreshCcw className="h-4 w-4 mr-2" />
          Create New Sale Returns
          <kbd className="ml-1.5 rounded border border-border bg-background px-1 font-mono text-[9px]">F2</kbd>
        </Button>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by return no., customer or invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      {/* Returns List */}
      {loadingReturns ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredReturns.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No data"
          description="Sales returns will appear here once processed"
        />
      ) : (
        <div className="space-y-3">
          {filteredReturns.map((ret) => (
            <motion.div
              key={ret.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card
                className="p-4 cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => setViewReturn(ret)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                      <RefreshCcw className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{ret.returnNo}</p>
                      <p className="text-xs text-muted-foreground">
                        {ret.customerName ?? "Walk-in Customer"} •{" "}
                        {ret.date}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">₹{ret.grandTotal?.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {ret.refundMode ? `Refund: ${ret.refundMode}` : "Refund pending"}
                    </p>
                  </div>
                </div>
                {ret.reason && (
                  <p className="text-xs text-muted-foreground mt-2">Reason: {ret.reason}</p>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* ─── New Return Dialog ─── */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetCreateForm(); setShowCreate(open); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Sales Return</DialogTitle>
            <DialogDescription>Select an invoice and specify items to return</DialogDescription>
          </DialogHeader>

          {!selectedInvoice ? (
            /* Invoice Search */
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoice number or customer name..."
                  value={invoiceSearch}
                  onChange={(e) => {
                    setInvoiceSearch(e.target.value);
                    searchInvoices(e.target.value);
                  }}
                  className="pl-9"
                />
              </div>

              {invoiceResults.length > 0 && (
                <div className="border rounded-lg divide-y">
                  {invoiceResults.map((inv) => (
                    <button
                      key={inv.id}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setInvoiceSearch(inv.invoiceNo);
                        setInvoiceResults([]);
                        loadInvoiceItems(inv.id);
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-sm">{inv.invoiceNo}</p>
                          <p className="text-xs text-muted-foreground">
                            {inv.customerName ?? "Walk-in"} • {inv.date}
                          </p>
                        </div>
                        <p className="font-semibold text-sm">₹{inv.grandTotal?.toFixed(2)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Return Form */
            <div className="space-y-6">
              {/* Selected Invoice */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{selectedInvoice.invoiceNo}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedInvoice.customerName ?? "Walk-in"} • {selectedInvoice.date} • ₹
                    {selectedInvoice.grandTotal?.toFixed(2)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectedInvoice(null); setReturnItems([]); }}
                >
                  Change
                </Button>
              </div>

              {/* Return Reason */}
              <div>
                <Label>Return Reason</Label>
                <Select value={returnReason} onValueChange={setReturnReason}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {RETURN_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Items */}
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                  Select Items to Return
                </Label>
                <div className="border rounded-lg divide-y">
                  {invoiceItems.map((item: any, idx: number) => {
                    const retItem = returnItems[idx];
                    const isSelected = retItem && retItem.quantity > 0;
                    return (
                      <div
                        key={idx}
                        className={`px-4 py-3 ${isSelected ? "bg-muted/30" : ""}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.medicineName}</p>
                            <p className="text-xs text-muted-foreground" title={`Max ${item.quantity} pack units`}>
                              Batch: {item.batchNo ?? "—"} • Rate: ₹{item.rate} • Max: {formatPackFraction(item.quantity, item.unitsPerPack)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              max={item.quantity}
                              value={retItem?.quantity ?? 0}
                              onChange={(e) => updateReturnItem(idx, "quantity", e.target.value)}
                              className="w-20 h-8 text-sm text-center"
                            />
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-2 space-y-2">
                            <Select
                              value={retItem.reason}
                              onValueChange={(v) => updateReturnItem(idx, "reason", v)}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Select reason for this item" />
                              </SelectTrigger>
                              <SelectContent>
                                {RETURN_REASONS.map((r) => (
                                  <SelectItem key={r} value={r}>{r}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Items being returned</span>
                  <span className="font-medium">{returnTotals.totalQty}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Return Subtotal</span>
                  <span>₹{returnTotals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GST to credit</span>
                  <span>₹{returnTotals.totalGst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t pt-2">
                  <span>Credit Amount</span>
                  <span>₹{(returnTotals.subtotal + returnTotals.totalGst).toFixed(2)}</span>
                </div>
              </div>

              {/* Refund Mode */}
              <div>
                <Label>Refund Method</Label>
                <Select value={refundMode} onValueChange={setRefundMode}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUND_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setShowCreate(false); resetCreateForm(); }}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitReturn}
                  disabled={submitting || returnTotals.totalQty === 0}
                >
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  {submitting ? "Processing..." : "Process Return"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── View Return Dialog ─── */}
      <Dialog open={!!viewReturn} onOpenChange={(open) => { if (!open) setViewReturn(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewReturn?.returnNo}</DialogTitle>
            <DialogDescription>
              Return from {viewReturn?.date} • {viewReturn?.customerName ?? "Walk-in Customer"}
            </DialogDescription>
          </DialogHeader>
          {viewReturn && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Original Invoice</p>
                  <p className="font-medium">{viewReturn.invoiceId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Refund Mode</p>
                  <p className="font-medium capitalize">{viewReturn.refundMode ?? "Pending"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Refund Amount</p>
                  <p className="font-semibold text-lg text-primary">₹{viewReturn.grandTotal?.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{viewReturn.status}</p>
                </div>
              </div>
              {viewReturn.reason && (
                <div>
                  <p className="text-xs text-muted-foreground">Reason</p>
                  <p className="text-sm">{viewReturn.reason}</p>
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setViewReturn(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
