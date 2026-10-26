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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { EmptyState } from "@/components/EmptyState";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitCompareArrows,
  Loader2,
  Plus,
  Receipt,
  RotateCcw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ExpiryMMYYInput } from "@/components/ExpiryMMYYInput";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { motion } from "framer-motion";

const GST_RATES = [0, 5, 12, 18, 28] as const;

interface PurchaseLineItem {
  medicineId?: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  unit: string;
  rate: number;
  amount: number;
  gstRate: "0" | "5" | "12" | "18" | "28";
  gstAmount: number;
  cgst: number;
  sgst: number;
  mrp: number;
  purchasePrice: number;
  sellingPrice: number;
}

function calcGST(amount: number, rate: number) {
  const base = amount / (1 + rate / 100);
  const gst = amount - base;
  return { base, gstAmount: gst, cgst: gst / 2, sgst: gst / 2 };
}

type TabValue = "bills" | "new" | "returns";

interface ReturnLineItem {
  medicineId: string;
  medicineName: string;
  batchId: string;
  quantity: number;
  rate: number;
}

const emptyReturnItem = (): ReturnLineItem => ({
  medicineId: "",
  medicineName: "",
  batchId: "",
  quantity: 1,
  rate: 0,
});

export default function PurchasesPage() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // ─── Data ───────────────────────────────────────────────────
  const [bills, setBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabValue>("bills");

  // LocalWell's purchases shortcut: F2 opens the Create New Purchases tab.
  useHotkeys([
    { key: "f2", label: "Create New Purchases", handler: () => setActiveTab("new") },
  ]);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [searching, setSearching] = useState(false);
  const skipSearchRef = useRef(true);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const [supplierBalance, setSupplierBalance] = useState<Record<string, number>>({});

  // ─── New Purchase Form ──────────────────────────────────────
  const [form, setForm] = useState({
    supplierId: "",
    supplierName: "",
    billNo: "",
    billDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    paymentMode: "cash" as "cash" | "card" | "upi" | "credit" | "other",
  });

  const [items, setItems] = useState<PurchaseLineItem[]>([
    {
      medicineName: "", batchNo: "", expiryDate: "", quantity: 1, freeQuantity: 0,
      unit: "Nos", rate: 0, amount: 0, gstRate: "12", gstAmount: 0, cgst: 0, sgst: 0,
      mrp: 0, purchasePrice: 0, sellingPrice: 0,
    },
  ]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // Expiry Safety Policy: lines the server refused (400 + blocked[]).
  const [blockedExpiry, setBlockedExpiry] = useState<any[] | null>(null);
  const [, setShowMedPicker] = useState(false);
  const [, setPickerIndex] = useState<number | null>(null);

  // ─── Compare suppliers (procurement) ─────────────────────────
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareMedicineId, setCompareMedicineId] = useState("");
  const [compareQty, setCompareQty] = useState(1);
  const [compareData, setCompareData] = useState<any>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // ─── Purchase Returns ────────────────────────────────────────
  const [returnList, setReturnList] = useState<any[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [returnsError, setReturnsError] = useState<string | null>(null);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({
    supplierId: "",
    purchaseBillId: "",
    date: new Date().toISOString().split("T")[0],
    reason: "",
    refundMode: "cash" as "cash" | "card" | "upi" | "credit" | "other",
  });
  const [returnBills, setReturnBills] = useState<any[]>([]);
  const [returnBillDetail, setReturnBillDetail] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<ReturnLineItem[]>([emptyReturnItem()]);
  const [batchesByMedicine, setBatchesByMedicine] = useState<Record<string, any[]>>({});
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  const loadReturns = useCallback(async () => {
    setReturnsLoading(true);
    setReturnsError(null);
    try {
      const { purchaseReturnsApi } = await import("@/lib/api");
      const result = await purchaseReturnsApi.list({ limit: 50 });
      setReturnList(Array.isArray(result) ? result : (result as any)?.data ?? []);
    } catch (err: any) {
      setReturnsError(err?.message ?? "Failed to load purchase returns");
    } finally {
      setReturnsLoading(false);
    }
  }, []);

  const loadBills = useCallback(async (p = 1) => {
    try {
      const { purchasesApi } = await import("@/lib/api");
      const result = await purchasesApi.list({ page: p, limit: 20, search: debouncedSearch || undefined });
      // Handle both array response and wrapped { data, pagination } response
      const list = Array.isArray(result) ? result : (result?.data ?? []);
      const pagination = !Array.isArray(result) ? result?.pagination : null;
      // Explicit paging: always replace the current rows (no duplication on Prev/Next).
      setBills(list);
      setHasMore(
        pagination && typeof pagination.total === "number"
          ? (pagination.page ?? p) < (pagination.totalPages ?? 1)
          : list.length === (pagination?.limit ?? 20)
      );
      setTotal(pagination && typeof pagination.total === "number" ? pagination.total : null);
      setPage(p);
      // Mirror the page into the URL so the list survives refresh and is deep-linkable.
      const next = new URLSearchParams(searchParams);
      next.set("page", String(p));
      setSearchParams(next, { replace: true });
    } catch {
      toast.error("Failed to load purchase bills");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const loadMeta = useCallback(async () => {
    try {
      const { suppliersApi, medicinesApi } = await import("@/lib/api");
      const [supps, medList] = await Promise.all([
        suppliersApi.list(),
        medicinesApi.list(),
      ]);
      setSuppliers(supps);
      setMedicines(medList);

      // Read balance from supplier records
      const balances: Record<string, number> = {};
      for (const s of supps) {
        balances[s.id] = s.balance ?? 0;
      }
      setSupplierBalance(balances);
    } catch (err) {
      console.error("Failed to load metadata:", err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadBills(initialPage);
    loadMeta();
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Debounced AJAX search: show a field spinner instead of reloading the whole page.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (skipSearchRef.current) { skipSearchRef.current = false; return; }
    setSearching(true);
    void loadBills(1).finally(() => setSearching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, debouncedSearch]);

  // Purchase Returns tab loads its list on first open (and stays fresh after
  // each create via loadReturns()).
  useEffect(() => {
    if (isAuthenticated && activeTab === "returns") void loadReturns();
  }, [isAuthenticated, activeTab, loadReturns]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  // ─── Line Item Helpers ──────────────────────────────────────
  const updateItem = <K extends keyof PurchaseLineItem>(idx: number, field: K, value: PurchaseLineItem[K]) => {
    setItems(prev => {
      const next = [...prev];
      next[idx][field] = value;

      if (field === "quantity" || field === "rate" || field === "gstRate") {
        const qty = field === "quantity" ? (value as number) : next[idx].quantity;
        const r = field === "rate" ? (value as number) : next[idx].rate;
        const amt = qty * r;
        const { gstAmount, cgst, sgst } = calcGST(amt, Number(next[idx].gstRate));
        next[idx].amount = amt;
        next[idx].gstAmount = gstAmount;
        next[idx].cgst = cgst;
        next[idx].sgst = sgst;
      }

      if (field === "mrp") {
        // sellingPrice defaults to MRP, purchasePrice = MRP * 0.7 (suggested)
        const mrpVal = value as number;
        next[idx].sellingPrice = mrpVal;
        next[idx].purchasePrice = parseFloat((mrpVal * 0.7).toFixed(2));
        next[idx].rate = parseFloat((mrpVal * 0.7).toFixed(2));
        // Recalculate amount
        const qty = next[idx].quantity;
        const amt = qty * next[idx].rate;
        const { gstAmount, cgst, sgst } = calcGST(amt, Number(next[idx].gstRate));
        next[idx].amount = amt;
        next[idx].gstAmount = gstAmount;
        next[idx].cgst = cgst;
        next[idx].sgst = sgst;
      }

      return next;
    });
  };

  const removeItem = (idx: number) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      medicineName: "", batchNo: "", expiryDate: "", quantity: 1, freeQuantity: 0,
      unit: "Nos", rate: 0, amount: 0, gstRate: "12", gstAmount: 0, cgst: 0, sgst: 0,
      mrp: 0, purchasePrice: 0, sellingPrice: 0,
    }]);
  };


  // ─── Compare suppliers ───────────────────────────────────────
  const openCompare = (idx: number) => {
    const item = items[idx];
    const matched =
      item.medicineId ??
      medicines.find(
        (m: any) =>
          item.medicineName &&
          m.name &&
          item.medicineName.toLowerCase().includes(String(m.name).toLowerCase())
      )?.id ??
      "";
    setCompareMedicineId(matched);
    setCompareQty(Math.max(1, item.quantity || 1));
    setCompareData(null);
    setCompareError(null);
    setCompareOpen(true);
  };

  const runCompare = async () => {
    if (!compareMedicineId) {
      toast.error("Select a medicine to compare");
      return;
    }
    setCompareLoading(true);
    setCompareError(null);
    try {
      const { procurementApi } = await import("@/lib/api");
      setCompareData(await procurementApi.compare(compareMedicineId, compareQty));
    } catch (err: any) {
      setCompareData(null);
      setCompareError(err?.message ?? "Failed to compare suppliers");
    } finally {
      setCompareLoading(false);
    }
  };

  const applySupplierToBill = (supplierId: string, supplierName: string) => {
    // When the bill already has a supplier the panel stays informational —
    // only an unset supplier can be chosen from the comparison.
    if (form.supplierId) return;
    setForm((f) => ({ ...f, supplierId, supplierName }));
    toast.success(`Bill supplier set to ${supplierName}`);
  };

  // ─── Purchase Return dialog ──────────────────────────────────
  const resetReturnForm = () => {
    setReturnForm({
      supplierId: "",
      purchaseBillId: "",
      date: new Date().toISOString().split("T")[0],
      reason: "",
      refundMode: "cash",
    });
    setReturnBills([]);
    setReturnBillDetail(null);
    setReturnItems([emptyReturnItem()]);
  };

  const loadBatchesFor = async (medicineId: string) => {
    if (!medicineId || batchesByMedicine[medicineId]) return;
    try {
      const { inventoryApi } = await import("@/lib/api");
      const rows = await inventoryApi.getBatches(medicineId);
      setBatchesByMedicine((prev) => ({ ...prev, [medicineId]: Array.isArray(rows) ? rows : [] }));
    } catch {
      setBatchesByMedicine((prev) => ({ ...prev, [medicineId]: [] }));
    }
  };

  const onReturnSupplierChange = async (supplierId: string) => {
    setReturnForm((f) => ({ ...f, supplierId, purchaseBillId: "" }));
    setReturnBillDetail(null);
    if (!supplierId) {
      setReturnBills([]);
      return;
    }
    try {
      const { purchasesApi } = await import("@/lib/api");
      const res = await purchasesApi.list({ supplierId, limit: 50 });
      setReturnBills(Array.isArray(res) ? res : ((res as any)?.data ?? []));
    } catch {
      setReturnBills([]);
    }
  };

  const onReturnBillChange = async (purchaseBillId: string) => {
    setReturnForm((f) => ({ ...f, purchaseBillId }));
    setReturnBillDetail(null);
    if (!purchaseBillId) return;
    try {
      const { purchasesApi } = await import("@/lib/api");
      setReturnBillDetail(await purchasesApi.get(purchaseBillId));
    } catch {
      setReturnBillDetail(null);
    }
  };

  const onReturnMedicineChange = (idx: number, medicineId: string) => {
    const med = medicines.find((m: any) => m.id === medicineId);
    const billItem = returnBillDetail?.items?.find((i: any) => i.medicineId === medicineId);
    setReturnItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              medicineId,
              medicineName: med?.name ?? "",
              batchId: "",
              // Rate prefill: selected bill's line first, else purchase price.
              rate: billItem?.rate ?? med?.purchasePrice ?? item.rate,
            }
          : item
      )
    );
    void loadBatchesFor(medicineId);
  };

  const onReturnBatchChange = (idx: number, batchId: string) => {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const batch = (batchesByMedicine[item.medicineId] ?? []).find((b: any) => b.id === batchId);
        const billItem = returnBillDetail?.items?.find(
          (bi: any) => bi.medicineId === item.medicineId && (!batchId || bi.batchId === batchId)
        );
        return { ...item, batchId, rate: batch?.purchasePrice ?? billItem?.rate ?? item.rate };
      })
    );
  };

  const updateReturnItem = (idx: number, patch: Partial<ReturnLineItem>) => {
    setReturnItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const returnTotals = returnItems.reduce(
    (sum, item) => sum + Math.round((item.quantity * item.rate + Number.EPSILON) * 100) / 100,
    0
  );

  const submitReturn = async () => {
    if (returnItems.some((i) => !i.medicineId)) {
      toast.error("Select a medicine for every row");
      return;
    }
    if (returnItems.some((i) => i.quantity < 1)) {
      toast.error("Quantity must be at least 1");
      return;
    }
    if (returnItems.some((i) => !(i.rate > 0))) {
      toast.error("Rate must be greater than 0 for every row");
      return;
    }
    setReturnSubmitting(true);
    try {
      const { purchaseReturnsApi } = await import("@/lib/api");
      const created = await purchaseReturnsApi.create({
        date: returnForm.date,
        supplierId: returnForm.supplierId || undefined,
        purchaseBillId: returnForm.purchaseBillId || undefined,
        reason: returnForm.reason || undefined,
        refundMode: returnForm.refundMode,
        items: returnItems.map((item) => ({
          medicineId: item.medicineId,
          batchId: item.batchId || undefined,
          quantity: item.quantity,
          rate: item.rate,
        })),
      });
      toast.success(
        `Purchase return ${(created as any)?.returnNo ?? ""} created — stock updated`
      );
      setReturnOpen(false);
      resetReturnForm();
      await loadReturns();
      loadMeta(); // credit refunds adjust the supplier balance
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create purchase return");
    } finally {
      setReturnSubmitting(false);
    }
  };

  // ─── Totals ─────────────────────────────────────────────────
  const totals = items.reduce((acc, item) => ({
    subtotal: acc.subtotal + item.amount,
    totalGst: acc.totalGst + item.gstAmount,
    cgst: acc.cgst + item.cgst,
    sgst: acc.sgst + item.sgst,
    totalMrp: acc.totalMrp + item.mrp * item.quantity,
  }), { subtotal: 0, totalGst: 0, cgst: 0, sgst: 0, totalMrp: 0 });

  const grandTotal = totals.subtotal + totals.totalGst - discountAmount;

  // ─── Submit ─────────────────────────────────────────────────
  const handleSubmit = async (override?: { reason: string }) => {
    if (!form.supplierId && !form.supplierName) { toast.error("Please select or enter a supplier"); return; }
    if (!form.billNo) { toast.error("Bill number is required"); return; }
    if (items.some(i => !i.medicineName)) { toast.error("Please fill in all medicine names"); return; }

    setSubmitting(true);
    setBlockedExpiry(null);
    try {
      const { purchasesApi } = await import("@/lib/api");
      const created = await purchasesApi.create({
        supplierId: form.supplierId || undefined,
        supplierName: form.supplierName || form.supplierId ? undefined : "Cash Supplier",
        billNo: form.billNo,
        billDate: form.billDate,
        dueDate: form.dueDate || undefined,
        items: items.map(item => ({
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate,
          quantity: item.quantity,
          freeQuantity: item.freeQuantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.amount,
          gstRate: item.gstRate,
          gstAmount: item.gstAmount,
          cgst: item.cgst,
          sgst: item.sgst,
          mrp: item.mrp,
        })),
        subtotal: totals.subtotal,
        totalGst: totals.totalGst,
        discountAmount,
        grandTotal,
        amountPaid: 0,
        paymentMode: form.paymentMode,
        overrideExpiry: !!override,
        overrideReason: override?.reason,
      });
      toast.success("Purchase bill created — stock updated");
      if (created?.warnings?.length) {
        toast.info(created.warnings.map((w: any) => `${w.batchNo ? `Batch ${w.batchNo}: ` : ""}${w.reason}`).join(" · "));
      }
      setItems([{
        medicineName: "", batchNo: "", expiryDate: "", quantity: 1, freeQuantity: 0,
        unit: "Nos", rate: 0, amount: 0, gstRate: "12", gstAmount: 0, cgst: 0, sgst: 0,
        mrp: 0, purchasePrice: 0, sellingPrice: 0,
      }]);
      setDiscountAmount(0);
      setForm(f => ({ ...f, billNo: "", dueDate: "" }));
      loadBills(1);
      loadMeta();
      setActiveTab("bills");
    } catch (err: any) {
      if (err?.status === 400 && Array.isArray(err?.payload?.blocked)) {
        // Expiry Safety Policy refusal — show the blocked lines with an
        // override action for roles the policy allows.
        setBlockedExpiry(err.payload.blocked);
        toast.error(err.payload.error || "Expired/near-expiry batch blocked by policy");
      } else {
        toast.error(err?.message ?? "Failed to create purchase bill");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totalSupplierBalance = Object.values(supplierBalance).reduce((s, v) => s + v, 0);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabValue)}>
      {/* Header — LocalWell "Purchases Transactions" */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Purchases Transactions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View List of all your Purchases Transactions here
          </p>
          <p className="text-xs text-muted-foreground/80 mt-0.5">
            {total != null && total > 0 ? (
              <>Showing {Math.min((page - 1) * 20 + 1, total)}–{Math.min(page * 20, total)} of {total} bills</>
            ) : (
              <>{bills.length} purchase bills</>
            )}
            {totalSupplierBalance !== 0 && (
              <span className="ml-2">
                · Supplier balance:{" "}
                <span className={totalSupplierBalance > 0 ? "text-red-600" : "text-green-600"}>
                  ₹{Math.abs(totalSupplierBalance).toFixed(2)} {totalSupplierBalance > 0 ? "payable" : "receivable"}
                </span>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="INVOICE NO — search no / supplier" className={"pl-9 h-9 w-56 text-sm" + (searching ? " pr-8" : "")} />
            {searching && <Loader2 className="absolute right-3 top-2 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />}
          </div>
          <TabsList className="h-9">
            <TabsTrigger value="bills" className="text-xs gap-1"><FileText className="h-3 w-3" />Bills</TabsTrigger>
            <TabsTrigger value="new" className="text-xs gap-1"><Plus className="h-3 w-3" />New Purchase</TabsTrigger>
            <TabsTrigger value="returns" className="text-xs gap-1"><RotateCcw className="h-3 w-3" />Purchase Returns</TabsTrigger>
          </TabsList>
        </div>
      </div>

      {/* ── BILLS TAB ── */}
      <TabsContent value="bills" className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : bills.length === 0 ? (
          <EmptyState icon={FileText}
            title={search ? "No bills match your search" : "No purchase bills yet"}
            description={search ? "Try a different bill number or supplier name." : "Record your first purchase to start tracking supplier balances."}
            actions={search ? [] : [{ label: "New Purchase", onClick: () => setActiveTab("new") }]}
          />
        ) : (
          <>
            <div className="border rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill: any) => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-mono text-sm">{bill.billNo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{bill.billDate ?? bill.createdAt?.split("T")[0]}</TableCell>
                      <TableCell className="text-sm">{bill.supplierName ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">₹{bill.grandTotal?.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={bill.paymentStatus === "paid" ? "default" : bill.paymentStatus === "partial" ? "secondary" : "outline"} className="text-[10px]">
                          {bill.paymentStatus ?? "unpaid"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/dashboard/suppliers?id=${bill.supplierId}`)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Page {page}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => loadBills(page - 1)}>
                  <ChevronLeft className="h-3 w-3" />Prev
                </Button>
                <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => loadBills(page + 1)}>
                  Next<ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        )}
      </TabsContent>

      {/* ── NEW PURCHASE TAB ── */}
      <TabsContent value="new" className="space-y-4">
        {/* Supplier + Bill Info */}
        <Card className="p-5 border-border/60">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Supplier & Bill Details</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Supplier *</Label>
              <Select value={form.supplierId} onValueChange={v => {
                const s = suppliers.find((x: any) => x.id === v);
                setForm({ ...form, supplierId: v, supplierName: s?.name ?? "" });
              }}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select or type supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {(supplierBalance[s.id] ?? 0) !== 0 && (
                        <span className="ml-2 text-muted-foreground">
                          {supplierBalance[s.id] > 0 ? `₹${supplierBalance[s.id].toFixed(2)} Dr` : `₹${Math.abs(supplierBalance[s.id]).toFixed(2)} Cr`}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Supplier Name</Label>
              <Input value={form.supplierName} onChange={e => setForm({ ...form, supplierName: e.target.value })} placeholder="If not listed" className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">Bill No. *</Label>
              <Input value={form.billNo} onChange={e => setForm({ ...form, billNo: e.target.value })} placeholder="e.g. PUR-001" className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">Bill Date</Label>
              <Input type="date" value={form.billDate} onChange={e => setForm({ ...form, billDate: e.target.value })} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="mt-1 h-9" />
            </div>
          </div>
        </Card>

        {/* Line Items */}
        <Card className="p-5 border-border/60">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Items</h3>
          <div className="hidden sm:block">
            <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-2 mb-1">
              <div className="col-span-3">Medicine</div>
              <div className="col-span-1 text-center">Batch</div>
              <div className="col-span-1">Expiry</div>
              <div className="col-span-1 text-center">Qty</div>
              <div className="col-span-1 text-center">Free</div>
              <div className="col-span-1 text-right">Rate</div>
              <div className="col-span-1 text-center">GST%</div>
              <div className="col-span-1 text-right">Amount</div>
              <div className="col-span-1 text-right">MRP</div>
              <div className="col-span-1 text-right">Action</div>
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center p-2 rounded-sm border border-border/40">
                {/* Medicine name with search */}
                <div className="col-span-2 sm:col-span-3">
                  <div className="flex gap-1">
                    <Input
                      value={item.medicineName}
                      onChange={e => updateItem(i, "medicineName", e.target.value)}
                      placeholder="Medicine name"
                      className="h-8 text-sm"
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                      onClick={() => { setPickerIndex(i); setShowMedPicker(true); }}>
                      <Search className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"
                      title="Compare suppliers for this medicine"
                      aria-label="Compare suppliers"
                      onClick={() => openCompare(i)}>
                      <GitCompareArrows className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {/* Batch No */}
                <div className="col-span-1">
                  <Input value={item.batchNo} onChange={e => updateItem(i, "batchNo", e.target.value)} placeholder="Batch" className="h-8 text-sm" />
                </div>
                {/* Expiry — MM/YY mask, Enter jumps to Qty */}
                <div className="col-span-1">
                  <ExpiryMMYYInput
                    value={item.expiryDate}
                    onCommit={(full) => updateItem(i, "expiryDate", full)}
                    ariaLabel={`Purchase row ${i + 1} expiry as MM/YY (Enter for Qty)`}
                    className="h-8 px-1 text-center font-mono text-xs tabular-nums"
                  />
                </div>
                {/* Qty */}
                <div className="col-span-2 sm:col-span-1 text-center">
                  <Input type="number" min={1} value={item.quantity}
                    onChange={e => updateItem(i, "quantity", Math.max(1, Number(e.target.value)))}
                    className="h-8 text-sm text-center" />
                </div>
                {/* Free */}
                <div className="col-span-1 text-center">
                  <Input type="number" min={0} value={item.freeQuantity}
                    onChange={e => updateItem(i, "freeQuantity", Number(e.target.value))}
                    className="h-8 text-sm text-center" />
                </div>
                {/* Rate */}
                <div className="col-span-1 text-right">
                  <Input type="number" min={0} step={0.01} value={item.rate}
                    onChange={e => updateItem(i, "rate", Number(e.target.value))}
                    className="h-8 text-sm text-right" />
                </div>
                {/* GST */}
                <div className="col-span-2 sm:col-span-1 text-center">
                  <Select value={item.gstRate} onValueChange={v => updateItem(i, "gstRate", v as any)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Amount */}
                <div className="col-span-2 sm:col-span-1 text-right text-sm font-medium leading-8 tabular-nums">
                  ₹{item.amount.toFixed(2)}
                </div>
                {/* MRP */}
                <div className="col-span-1 text-right">
                  <Input type="number" min={0} step={0.01} value={item.mrp}
                    onChange={e => updateItem(i, "mrp", Number(e.target.value))}
                    className="h-8 text-sm text-right" />
                </div>
                {/* Delete */}
                <div className="col-span-1 text-right" data-enter-skip>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(i)}>
                    <span className="sr-only">Remove</span>
                    ×
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addItem} className="mt-2">
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Item
          </Button>
        </Card>

        {/* Totals */}
        <Card className="p-5 border-border/60">
          <div className="flex flex-col sm:flex-row sm:justify-end gap-6">
            <div className="space-y-3 sm:w-72">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">₹{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST (half)</span>
                <span className="tabular-nums">₹{totals.cgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST (half)</span>
                <span className="tabular-nums">₹{totals.sgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total GST</span>
                <span className="tabular-nums">₹{totals.totalGst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Invoice Discount</span>
                <Input type="number" min={0} value={discountAmount}
                  onChange={e => setDiscountAmount(Number(e.target.value))}
                  data-enter="custom"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSubmit();
                    }
                  }}
                  className="h-7 w-24 text-sm text-right" />
              </div>
              <div className="flex justify-between text-sm items-center pt-3 border-t border-border mt-1">
                <span className="text-sm text-muted-foreground uppercase tracking-wider">Grand Total</span>
                <span className="text-2xl font-semibold tracking-tight text-primary tabular-nums leading-none">
                  ₹<AnimatedNumber value={grandTotal} format={n => n.toFixed(2)} />
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Expiry Safety Policy — blocked lines (400 + blocked[]) */}
        {blockedExpiry && blockedExpiry.length > 0 && (
          <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 space-y-1.5" role="alert">
            <p className="text-xs font-medium text-destructive">Blocked by expiry policy</p>
            <ul className="space-y-0.5">
              {blockedExpiry.map((b, i) => (
                <li key={`${b.batchNo ?? "line"}-${b.expiryDate}-${i}`} className="text-xs text-destructive/90">
                  {b.batchNo ? `Batch ${b.batchNo} — ` : ""}exp {b.expiryDate} ({b.daysToExpiry}d) · {b.reason}
                </li>
              ))}
            </ul>
            {user && (user.role === "admin" || user.role === "pharmacist") && (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={submitting}
                onClick={() => {
                  const reason = window.prompt("Override reason (recorded in the audit trail):");
                  if (!reason || !reason.trim()) return;
                  void handleSubmit({ reason: reason.trim() });
                }}
              >
                Override &amp; save
              </Button>
            )}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setActiveTab("bills")}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Receipt className="h-3.5 w-3.5 mr-1.5" />}
            Create Purchase Bill
          </Button>
        </div>
      </TabsContent>

      {/* ── PURCHASE RETURNS TAB ── */}
      <TabsContent value="returns" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Purchase Returns Transactions</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              View List of all your Purchase Returns Transactions here
            </p>
          </div>
          <Button size="sm" onClick={() => setReturnOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Create New Purchase Returns
          </Button>
        </div>

        {returnsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : returnsError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Failed to load purchase returns"
            description={returnsError}
            actions={[{ label: "Retry", onClick: () => void loadReturns() }]}
          />
        ) : returnList.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title="No data"
            description="Return purchased goods to a supplier — the batch stock is deducted and the refund is posted to the ledger."
            actions={[{ label: "Create New Purchase Returns", onClick: () => setReturnOpen(true) }]}
          />
        ) : (
          <div className="border rounded-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Billed On</TableHead>
                  <TableHead>Distributor</TableHead>
                  <TableHead className="text-right">Ret Amt</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnList.map((ret: any) => (
                  <TableRow key={ret.id}>
                    <TableCell className="font-mono text-sm">{ret.returnNo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ret.date}</TableCell>
                    <TableCell className="text-sm">{ret.supplierName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      ₹{Number(ret.refundAmount ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">{ret.refundMode ?? "cash"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[16rem] truncate">
                      {ret.reason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
      </Tabs>

      {/* ── Compare suppliers (procurement) ── */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Compare suppliers</DialogTitle>
            <DialogDescription>
              Latest effective rate per supplier (after discount &amp; free units), credit terms and
              outstanding balance — cheapest first.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2">
              <Label className="text-xs">Medicine</Label>
              <Select
                value={compareMedicineId || "__none__"}
                onValueChange={(v) => setCompareMedicineId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="Select medicine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select medicine…</SelectItem>
                  {medicines.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                      {m.brand ? ` (${m.brand})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input
                type="number"
                min={1}
                value={compareQty}
                onChange={(e) => setCompareQty(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 h-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => void runCompare()} disabled={compareLoading}>
              {compareLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <GitCompareArrows className="h-3.5 w-3.5 mr-1.5" />
              )}
              Compare
            </Button>
            {form.supplierId && (
              <p className="text-xs text-muted-foreground">
                Bill supplier already set — comparison is informational.
              </p>
            )}
          </div>

          {compareError && <p className="text-sm text-destructive">{compareError}</p>}

          {compareLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : compareData ? (
            compareData.quotes?.length ? (
              <div className="border rounded-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Effective</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Terms</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead>Last date</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compareData.quotes.map((q: any) => (
                      <TableRow key={`${q.supplierId}-${q.source}`}>
                        <TableCell className="text-sm font-medium">{q.supplierName}</TableCell>
                        <TableCell>
                          <Badge variant={q.source === "quote" ? "secondary" : "outline"} className="text-[10px]">
                            {q.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          ₹{(q.unitCost ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          ₹{(q.unitCost ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          ₹{(q.estimatedCost ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{q.terms ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          ₹{(q.outstanding ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{q.lastDate ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {!form.supplierId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => applySupplierToBill(q.supplierId, q.supplierName)}
                            >
                              Use this supplier
                            </Button>
                          ) : form.supplierId === q.supplierId ? (
                            <Badge variant="default" className="text-[10px]">Selected</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={GitCompareArrows}
                title="No supplier history"
                description="This medicine has no purchases or recorded quotes yet — record a quote from the Procurement page to compare."
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── New purchase return ── */}
      <Dialog
        open={returnOpen}
        onOpenChange={(open) => {
          setReturnOpen(open);
          if (!open) resetReturnForm();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">New purchase return</DialogTitle>
            <DialogDescription>
              Pick the supplier (and optionally the bill), choose the exact batch each item leaves from.
              The refund is computed from quantity × rate — GST splits proportionally on the server.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select
                value={returnForm.supplierId || "__none__"}
                onValueChange={(v) => void onReturnSupplierChange(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No supplier</SelectItem>
                  {suppliers.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Purchase bill (optional)</Label>
              <Select
                value={returnForm.purchaseBillId || "__none__"}
                onValueChange={(v) => void onReturnBillChange(v === "__none__" ? "" : v)}
                disabled={!returnForm.supplierId || returnBills.length === 0}
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder={returnBills.length ? "Select bill" : "No bills for supplier"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No bill</SelectItem>
                  {returnBills.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.billNo} · ₹{Number(b.grandTotal ?? 0).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={returnForm.date}
                onChange={(e) => setReturnForm((f) => ({ ...f, date: e.target.value }))}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Refund mode</Label>
              <Select
                value={returnForm.refundMode}
                onValueChange={(v) => setReturnForm((f) => ({ ...f, refundMode: v as typeof returnForm.refundMode }))}
              >
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="credit">Credit (adjust supplier balance)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-4">
              <Label className="text-xs">Reason</Label>
              <Input
                value={returnForm.reason}
                onChange={(e) => setReturnForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Near-expiry stock returned to distributor"
                className="mt-1 h-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            {returnItems.map((item, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center p-2 rounded-sm border border-border/40">
                <div className="col-span-2 sm:col-span-4">
                  <Select
                    value={item.medicineId || "__none__"}
                    onValueChange={(v) => v !== "__none__" && onReturnMedicineChange(i, v)}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select medicine" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select medicine…</SelectItem>
                      {medicines.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 sm:col-span-3">
                  <Select
                    value={item.batchId || "__none__"}
                    onValueChange={(v) => onReturnBatchChange(i, v === "__none__" ? "" : v)}
                    disabled={!item.medicineId}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={item.medicineId ? "Batch (auto if one)" : "—"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Auto (single batch)</SelectItem>
                      {(batchesByMedicine[item.medicineId] ?? []).map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.batchNo} · qty {b.quantity ?? 0}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 sm:col-span-1">
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateReturnItem(i, { quantity: Math.max(1, Number(e.target.value)) })}
                    className="h-8 text-sm text-center"
                    aria-label={`Row ${i + 1} quantity`}
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.rate}
                    onChange={(e) => updateReturnItem(i, { rate: Number(e.target.value) })}
                    className="h-8 text-sm text-right"
                    aria-label={`Row ${i + 1} rate`}
                  />
                </div>
                <div className="col-span-1 sm:col-span-1 text-right text-sm tabular-nums leading-8">
                  ₹{(item.quantity * item.rate).toFixed(2)}
                </div>
                <div className="col-span-1 sm:col-span-1 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setReturnItems((prev) => (prev.length === 1 ? prev : prev.filter((_, x) => x !== i)))}
                  >
                    <span className="sr-only">Remove row</span>×
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={() => setReturnItems((prev) => [...prev, emptyReturnItem()])}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Row
            </Button>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Refund (auto)</span>
              <span className="text-lg font-semibold tabular-nums">₹{returnTotals.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
            <Button onClick={() => void submitReturn()} disabled={returnSubmitting}>
              {returnSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Create Purchase Return
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
