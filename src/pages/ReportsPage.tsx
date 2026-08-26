import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  CalendarRange,
  Download,
  Eye,
  FileText,
  Loader2,
  PackageCheck,
  PackagePlus,
  ShoppingCart,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

export default function ReportsPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  const queryRange = Number(searchParams.get("range") || 0);
  const initialDates = (() => {
    if (queryRange <= 0) return null;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - queryRange + 1);
    return {
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0],
    };
  })();

  const stats = useQuery(api.stats.dashboard);
  const updatePurchaseBill = useMutation(api.purchaseBills.update);
  const [markingId, setMarkingId] = useState<Id<"purchaseBills"> | null>(null);
  const [viewBillId, setViewBillId] = useState<Id<"purchaseBills"> | null>(null);
  const [savingBill, setSavingBill] = useState(false);
  const [billDraft, setBillDraft] = useState<{
    supplierName: string;
    billNo: string;
    billDate: string;
    amount: string;
    gstAmount: string;
  } | null>(null);
  const [fromDate, setFromDate] = useState(initialDates?.from || "");
  const [toDate, setToDate] = useState(initialDates?.to || "");
  const [tab, setTab] = useState<"gst" | "purchase" | "stock" | "customer">(
    queryTab === "purchase" || queryTab === "stock" || queryTab === "customer"
      ? queryTab
      : "gst",
  );

  const gstData = useQuery(api.stats.gstRegister, fromDate || toDate ? { fromDate: fromDate || undefined, toDate: toDate || undefined } : "skip");
  const purchaseData = useQuery(api.stats.purchaseRegister, fromDate || toDate ? { fromDate: fromDate || undefined, toDate: toDate || undefined } : "skip");

  if (!isAuthenticated && !isLoading) { navigate("/auth"); return null; }
  if (isLoading || !stats) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-pulse text-muted-foreground text-sm">Loading...</div></div>;

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map((row) => headers.map((h) => `"${row[h]}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: "gst" as const, label: "GST Sales Register" },
    { id: "purchase" as const, label: "Purchase Register" },
    { id: "stock" as const, label: "Stock Report" },
    { id: "customer" as const, label: "Customer Analytics" },
  ];

  const viewedBill = purchaseData?.entries.find((b) => b._id === viewBillId) ?? null;

  const openBillDetail = (b: NonNullable<typeof purchaseData>["entries"][number]) => {
    setViewBillId(b._id);
    setBillDraft(null);
  };

  const startEditBill = () => {
    if (!viewedBill) return;
    setBillDraft({
      supplierName: viewedBill.supplierName || "",
      billNo: viewedBill.billNo || "",
      billDate: viewedBill.billDate || "",
      amount: String(viewedBill.amount),
      gstAmount:
        viewedBill.gstAmount !== undefined
          ? String(viewedBill.gstAmount)
          : "",
    });
  };

  const saveBillDraft = async () => {
    if (!viewedBill || !billDraft) return;
    const amount = Number(billDraft.amount);
    const gstAmount = billDraft.gstAmount.trim()
      ? Number(billDraft.gstAmount)
      : undefined;
    if (!billDraft.supplierName.trim()) {
      toast("Supplier name is required");
      return;
    }
    if (Number.isNaN(amount) || amount < 0) {
      toast("Enter a valid amount");
      return;
    }
    if (gstAmount !== undefined && (Number.isNaN(gstAmount) || gstAmount < 0)) {
      toast("Enter a valid GST amount");
      return;
    }
    setSavingBill(true);
    try {
      await updatePurchaseBill({
        id: viewedBill._id,
        supplierName: billDraft.supplierName.trim() || undefined,
        billNo: billDraft.billNo.trim() || undefined,
        billDate: billDraft.billDate || undefined,
        amount,
        gstAmount,
      });
      toast("Bill updated");
      setBillDraft(null);
    } catch {
      toast("Failed to update bill");
    } finally {
      setSavingBill(false);
    }
  };

  const toggleBillStatus = async (b: NonNullable<typeof purchaseData>["entries"][number]) => {
    const next = b.status === "processed" ? "pending" : "processed";
    setMarkingId(b._id);
    try {
      await updatePurchaseBill({ id: b._id, status: next });
      toast(next === "processed" ? "Bill marked as processed" : "Bill marked as pending");
    } catch {
      toast("Failed to update bill");
    } finally {
      setMarkingId(null);
    }
  };

  const quickRange = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    setFromDate(from.toISOString().split("T")[0]);
    setToDate(to.toISOString().split("T")[0]);
  };

  const tile = (
    icon: ReactNode,
    label: string,
    value: string,
    note?: string,
    tone = "",
    i = 0,
  ) => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + i * 0.05 }}
      className="bg-secondary/50 p-3 rounded-sm"
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-xl font-semibold ${tone}`}>{value}</p>
      {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
    </motion.div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Business insights and registers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Date Filter */}
      <div className="flex items-end gap-3">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 text-sm w-40" />
        </div>
      </div>

      {/* GST Register */}
      {tab === "gst" && (
        <Card className="p-5 border-border/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">GST Sales Register</h3>
            {gstData && <Button variant="outline" size="sm" onClick={() => exportToCSV(gstData.entries, "gst-sales-register")}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>}
          </div>
          {fromDate && toDate && gstData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                {tile(<FileText className="h-3.5 w-3.5 text-muted-foreground" />, "Taxable", `₹${gstData.totalTaxable.toFixed(2)}`, undefined, undefined, 0)}
                {tile(<FileText className="h-3.5 w-3.5 text-muted-foreground" />, "CGST", `₹${gstData.totalCGST.toFixed(2)}`, undefined, undefined, 1)}
                {tile(<FileText className="h-3.5 w-3.5 text-muted-foreground" />, "SGST", `₹${gstData.totalSGST.toFixed(2)}`, undefined, undefined, 2)}
                {tile(<FileText className="h-3.5 w-3.5 text-muted-foreground" />, "Total GST", `₹${gstData.totalGST.toFixed(2)}`, undefined, "text-primary", 3)}
                {tile(<FileText className="h-3.5 w-3.5 text-muted-foreground" />, "Grand Total", `₹${gstData.totalAmount.toFixed(2)}`, undefined, undefined, 4)}
              </div>
              <div className="max-h-96 overflow-y-auto space-y-1">
                {gstData.entries.map((e, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className="flex items-center justify-between text-xs py-1.5 px-2 border border-border/40 rounded-sm">
                    <span className="w-28 shrink-0 font-medium">{e.invoiceNo}</span>
                    <span className="w-20 shrink-0 text-muted-foreground">{e.date}</span>
                    <span className="flex-1 truncate px-2">{e.customerName}</span>
                    <span className="w-20 text-right">₹{e.taxableValue.toFixed(2)}</span>
                    <span className="w-16 text-right">₹{e.cgst.toFixed(2)}</span>
                    <span className="w-16 text-right">₹{e.sgst.toFixed(2)}</span>
                    <span className="w-20 text-right font-medium">₹{e.grandTotal.toFixed(2)}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={CalendarRange}
              title="Pick a date range"
              description="Select From and To dates above to see your GST sales register with taxable values, CGST/SGST, and totals."
              actions={[
                { label: "Last 30 days", onClick: () => quickRange(30) },
                { label: "This month", onClick: () => quickRange(new Date().getDate()), variant: "outline" },
              ]}
            />
          )}
        </Card>
      )}

      {/* Purchase Register */}
      {tab === "purchase" && (
        <Card className="p-5 border-border/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Purchase Register</h3>
            {purchaseData && purchaseData.entries.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => exportToCSV(purchaseData.entries, "purchase-register")}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export CSV
              </Button>
            )}
          </div>
          {fromDate && toDate && purchaseData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {tile(<ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />, "Bills", String(purchaseData.entries.length), undefined, undefined, 0)}
                {tile(<ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />, "Total Purchases", `₹${purchaseData.totalAmount.toFixed(2)}`, undefined, undefined, 1)}
                {tile(<ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />, "Input GST", `₹${purchaseData.totalGst.toFixed(2)}`, undefined, "text-primary", 2)}
              </div>
              <div className="max-h-96 overflow-y-auto space-y-1">
                {purchaseData.entries.map((b, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className="flex items-center justify-between text-xs py-1.5 px-2 border border-border/40 rounded-sm">
                    <span className="w-36 shrink-0 font-medium truncate">{b.supplierName || "Unknown Supplier"}</span>
                    <span className="w-20 shrink-0 text-muted-foreground">{b.billNo || "—"}</span>
                    <span className="w-24 shrink-0 text-muted-foreground">{b.billDate || "—"}</span>
                    <span className="flex-1 flex items-center gap-1.5 px-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => openBillDetail(b)}
                        title="View bill details"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={markingId === b._id}
                        onClick={() => void toggleBillStatus(b)}
                        title={
                          b.status === "processed"
                            ? "Mark as pending"
                            : "Mark as processed"
                        }
                        className={`h-6 px-2 text-[10px] border rounded-sm shrink-0 ${
                          b.status === "processed"
                            ? "border-green-600/30 text-green-700 bg-green-600/5 hover:bg-green-600/10"
                            : "border-amber-600/30 text-amber-700 bg-amber-600/5 hover:bg-amber-600/10"
                        }`}
                      >
                        {markingId === b._id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            {b.status === "processed" ? "✓ Processed" : "Mark Done"}
                          </>
                        )}
                      </Button>
                    </span>
                    <span className="w-20 text-right">₹{b.amount.toFixed(2)}</span>
                    <span className="w-16 text-right">₹{(b.gstAmount || 0).toFixed(2)}</span>
                  </motion.div>
                ))}
                {purchaseData.entries.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No purchase bills in this range.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={ShoppingCart}
              title="Pick a date range"
              description="Select From and To dates above to see your purchase register — bills scanned via OCR appear here automatically."
              actions={[{ label: "Last 30 days", onClick: () => quickRange(30) }]}
            />
          )}
        </Card>
      )}

      {/* Stock Report */}
      {tab === "stock" && (
        <Card className="p-5 border-border/60">
          <h3 className="text-sm font-medium mb-4">Inventory Stock Report</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {tile(<PackageCheck className="h-3.5 w-3.5 text-muted-foreground" />, "Total Medicines", String(stats.totalMedicines), `${stats.totalStock} units`, undefined, 0)}
            {tile(<PackageCheck className="h-3.5 w-3.5 text-muted-foreground" />, "Low Stock Items", String(stats.lowStockCount), "Needs reordering", stats.lowStockCount > 0 ? "text-destructive" : "", 1)}
            {tile(<PackageCheck className="h-3.5 w-3.5 text-muted-foreground" />, "Expiring Soon", String(stats.expiringSoonCount), "Within 30 days", stats.expiringSoonCount > 0 ? "text-amber-600" : "", 2)}
          </div>
          {stats.lowStock.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Low Stock Items</p>
              <div className="space-y-1">
                {stats.lowStock.map((m) => (
                  <div key={m._id} className="flex items-center justify-between text-xs py-1.5 px-2 border border-border/40 rounded-sm">
                    <span>{m.name} {m.brand && `(${m.brand})`}</span>
                    <span className="text-destructive font-medium">{m.quantity} {m.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.expiringSoon.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Expiring Soon</p>
              <div className="space-y-1">
                {stats.expiringSoon.map((m) => (
                  <div key={m._id} className="flex items-center justify-between text-xs py-1.5 px-2 border border-border/40 rounded-sm">
                    <span>{m.name} {m.brand && `(${m.brand})`}</span>
                    <span className="text-amber-600 font-medium">Exp: {m.expiryDate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Purchase Bill Detail Dialog */}
      <Dialog
        open={!!viewBillId}
        onOpenChange={(open) => !open && setViewBillId(null)}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {viewedBill && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {viewedBill.supplierName || "Purchase Bill"}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded-sm border text-[10px] shrink-0 ${
                      viewedBill.status === "processed"
                        ? "border-green-600/30 text-green-700 bg-green-600/5"
                        : "border-amber-600/30 text-amber-700 bg-amber-600/5"
                    }`}
                  >
                    {viewedBill.status === "processed"
                      ? "Processed"
                      : "Pending"}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Details extracted from the scanned purchase bill
                </DialogDescription>
              </DialogHeader>

              {billDraft ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Supplier Name *</Label>
                    <Input
                      value={billDraft.supplierName}
                      onChange={(e) =>
                        setBillDraft({ ...billDraft, supplierName: e.target.value })
                      }
                      placeholder="Supplier name"
                      className="mt-1 h-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Bill No.</Label>
                      <Input
                        value={billDraft.billNo}
                        onChange={(e) =>
                          setBillDraft({ ...billDraft, billNo: e.target.value })
                        }
                        placeholder="Bill number"
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Bill Date</Label>
                      <Input
                        type="date"
                        value={billDraft.billDate}
                        onChange={(e) =>
                          setBillDraft({ ...billDraft, billDate: e.target.value })
                        }
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Amount (₹) *</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={billDraft.amount}
                        onChange={(e) =>
                          setBillDraft({ ...billDraft, amount: e.target.value })
                        }
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">GST Amount (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={billDraft.gstAmount}
                        onChange={(e) =>
                          setBillDraft({ ...billDraft, gstAmount: e.target.value })
                        }
                        placeholder="Optional"
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      className="flex-1"
                      disabled={savingBill}
                      onClick={() => void saveBillDraft()}
                    >
                      {savingBill ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      disabled={savingBill}
                      onClick={() => setBillDraft(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-secondary/50 p-2.5 rounded-sm">
                      <p className="text-[11px] text-muted-foreground">Bill No.</p>
                      <p className="text-sm font-medium mt-0.5">
                        {viewedBill.billNo || "—"}
                      </p>
                    </div>
                    <div className="bg-secondary/50 p-2.5 rounded-sm">
                      <p className="text-[11px] text-muted-foreground">Bill Date</p>
                      <p className="text-sm font-medium mt-0.5">
                        {viewedBill.billDate || "—"}
                      </p>
                    </div>
                    <div className="bg-secondary/50 p-2.5 rounded-sm">
                      <p className="text-[11px] text-muted-foreground">Amount</p>
                      <p className="text-sm font-semibold mt-0.5 text-primary">
                        ₹{viewedBill.amount.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-secondary/50 p-2.5 rounded-sm">
                      <p className="text-[11px] text-muted-foreground">GST Amount</p>
                      <p className="text-sm font-medium mt-0.5">
                        ₹{(viewedBill.gstAmount || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {viewedBill.gstAmount !== undefined &&
                    viewedBill.gstAmount > 0 &&
                    viewedBill.gstAmount <= viewedBill.amount && (
                      <div className="flex justify-between text-sm border-t border-border pt-3">
                        <span className="text-muted-foreground">
                          Taxable Value (approx.)
                        </span>
                        <span className="font-medium">
                          ₹{(viewedBill.amount - viewedBill.gstAmount).toFixed(2)}
                        </span>
                      </div>
                    )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startEditBill}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    Edit Details
                  </Button>
                </>
              )}

              {viewedBill.lineItems && viewedBill.lineItems.length > 0 && (
                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Imported Line Items
                    </p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm border border-green-600/30 text-green-700 bg-green-600/5">
                      In inventory
                    </span>
                  </div>
                  <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] text-muted-foreground px-2 mb-1">
                    <div className="col-span-5">Item</div>
                    <div className="col-span-1 text-center">Qty</div>
                    <div className="col-span-2 text-right">Rate</div>
                    <div className="col-span-1 text-center">GST</div>
                    <div className="col-span-2 text-right">Amount</div>
                    <div className="col-span-1" />
                  </div>
                  <div className="space-y-1">
                    {viewedBill.lineItems.map((item, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-12 gap-2 items-center text-xs py-1.5 px-2 rounded-sm border border-border/40"
                      >
                        <div className="col-span-12 sm:col-span-5">
                          <p className="font-medium truncate">{item.name}</p>
                          {item.hsnCode && (
                            <p className="text-[10px] text-muted-foreground">
                              HSN {item.hsnCode}
                            </p>
                          )}
                        </div>
                        <div className="col-span-3 sm:col-span-1 text-center text-muted-foreground">
                          {item.quantity}
                        </div>
                        <div className="col-span-3 sm:col-span-2 text-right">
                          ₹{item.rate.toFixed(2)}
                        </div>
                        <div className="col-span-2 sm:col-span-1 text-center">
                          <span className="inline-block px-1 py-0.5 rounded-sm bg-secondary/60 text-[10px]">
                            {item.gstRate}%
                          </span>
                        </div>
                        <div className="col-span-2 sm:col-span-2 text-right font-medium">
                          ₹{(item.quantity * item.rate).toFixed(2)}
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex justify-end">
                          <PackagePlus className="h-3.5 w-3.5 text-green-700" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
                    <span className="text-muted-foreground">Line total</span>
                    <span className="font-medium">
                      ₹
                      {viewedBill.lineItems
                        .reduce((s, i) => s + i.quantity * i.rate, 0)
                        .toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Raw OCR Text
                </p>
                <pre className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap bg-secondary/40 border border-border/40 rounded-sm p-3 max-h-56 overflow-y-auto">
                  {viewedBill.ocrText ||
                    "No OCR text available for this bill."}
                </pre>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={markingId === viewedBill._id}
                  onClick={() => void toggleBillStatus(viewedBill)}
                >
                  {markingId === viewedBill._id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <>
                      {viewedBill.status === "processed"
                        ? "Mark as Pending"
                        : "Mark as Processed"}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Customer Analytics */}
      {tab === "customer" && (
        <Card className="p-5 border-border/60">
          <h3 className="text-sm font-medium mb-4">Customer Analytics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tile(<FileText className="h-3.5 w-3.5 text-muted-foreground" />, "Total Customers", String(stats.totalCustomers), "Registered customers", undefined, 0)}
            {tile(<FileText className="h-3.5 w-3.5 text-muted-foreground" />, "Total Pending (Udhar)", `₹${stats.totalPending.toFixed(2)}`, "Unpaid + partial balances", stats.totalPending > 0 ? "text-amber-600" : "", 1)}
          </div>
        </Card>
      )}
    </motion.div>
  );
}
