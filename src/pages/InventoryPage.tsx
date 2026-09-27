import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { BarcodeCameraScanner } from "@/components/BarcodeCameraScanner";
import { EmptyState } from "@/components/EmptyState";
import {
  useMedicineCatalog,
  type CatalogMedicine,
} from "@/hooks/useMedicineCatalog";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import {
  AlertTriangle,
  ArrowDownUp,
  Barcode,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Edit2,
  Eye,
  EyeOff,
  Filter,
  Loader2,
  PackagePlus,
  Plus,
  PlusCircle,
  Printer,
  ScanBarcode,
  Search,
  Tag,
  TrendingDown,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useActiveOptionScroll } from "@/hooks/useActiveOptionScroll";
import { ExpiryMMYYInput } from "@/components/ExpiryMMYYInput";
import { formatExpiryMY, formatPackQty } from "@/lib/utils";

const GST_RATES = [0, 5, 12, 18, 28] as const;

interface MedicineRow {
  id: string;
  name: string;
  genericName?: string;
  brand?: string;
  category?: string;
  composition?: string;
  hsnCode?: string;
  gstRate: string;
  unit?: string;
  packSize?: string;
  barcode?: string;
  minQuantity?: number;
  purchasePrice: number;
  sellingPrice: number;
  mrp?: number;
  isActive: boolean;
  totalStock: number;
  availableStock: number;
  stockValue: number;
  batches: BatchRow[];
}

interface BatchRow {
  id: string;
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  mrp: number;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  freeQuantity: number;
  isActive: boolean;
}

type TabValue = "stock" | "expiry" | "low" | "history";

export default function InventoryPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // ─── Data State ────────────────────────────────────────────────
  const [medicines, setMedicines] = useState<MedicineRow[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabValue>("stock");

  // ─── Filters ─────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [stockSearching, setStockSearching] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expiryStatus, setExpiryStatus] = useState<"expired" | "30" | "60" | "90">("90");

  // ─── Medicine Form Dialog ─────────────────────────────────────
  const [medDialogOpen, setMedDialogOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<MedicineRow | null>(null);
  const [savingMed, setSavingMed] = useState(false);
  const [medForm, setMedForm] = useState({
    name: "",
    genericName: "",
    brand: "",
    category: "",
    composition: "",
    hsnCode: "",
    gstRate: "18",
    unit: "Nos",
    packSize: "",
    barcode: "",
    minQuantity: 10,
    purchasePrice: 0,
    sellingPrice: 0,
    mrp: 0,
  });

  // ─── Batch Form Dialog ────────────────────────────────────────
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchRow | null>(null);
  const [batchMedicineId, setBatchMedicineId] = useState<string | null>(null);
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchForm, setBatchForm] = useState({
    batchNo: "",
    expiryDate: "",
    mrp: 0,
    purchasePrice: 0,
    sellingPrice: 0,
    quantity: 0,
    freeQuantity: 0,
    supplierId: "",
  });

  // ─── Adjustment Dialog ────────────────────────────────────────
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustingBatch, setAdjustingBatch] = useState<BatchRow | null>(null);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjusting, setAdjusting] = useState(false);

  // ─── Barcode Scan Dialog ──────────────────────────────────────
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBarcode, setScanBarcode] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState("");

  // ─── Medicine Catalog Dialog ─────────────────────────────────
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogActiveIdx, setCatalogActiveIdx] = useState(0);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [stockPage, setStockPage] = useState(1);
  const STOCK_PAGE_SIZE = 25;
  const [gstDraft, setGstDraft] = useState<{ key: string; gstRate: number; hsnCode: string } | null>(null);
  const {
    results: catalogResults,
    loading: catalogLoading,
    count: catalogCount,
    unavailableCount,
    saveGst,
    toggleUnavailable,
    removeOverride,
  } = useMedicineCatalog(catalogSearch, 25, showUnavailable);

  // ─── Keyboard-first: scan, Medicine DB, add medicine, page moves ──
  useHotkeys([
    { key: "/", label: "Focus medicine search", handler: () => document.querySelector<HTMLInputElement>('[data-inventory-search]')?.focus() },
    { key: "n", label: "Add medicine", handler: () => { setEditingMed(null); resetMedForm(); setMedDialogOpen(true); } },
    { key: "b", label: "Scan barcode", handler: () => { setScanBarcode(""); setScanError(""); setScanOpen(true); } },
    { key: "m", label: "Open Medicine Database", handler: () => { setCatalogSearch(""); setCatalogActiveIdx(0); setCatalogOpen(true); } },
  ]);

  // Reset pagination + catalog cursor when the query changes.
  useEffect(() => { setStockPage(1); }, [search, categoryFilter]);
  useEffect(() => { setCatalogActiveIdx(0); }, [catalogSearch]);

  // Keep the arrow-key highlight visible inside the scrolling result list.
  const catalogList = useActiveOptionScroll();
  useEffect(() => { catalogList.reset(); }, [catalogSearch]);

  // ─── Low Stock & Expiry ──────────────────────────────────────
  const [lowStockItems, setLowStockItems] = useState<MedicineRow[]>([]);
  const [expiryItems, setExpiryItems] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txPage, setTxPage] = useState(1);

  const loadAll = useCallback(async () => {
    try {
      const { inventoryApi, suppliersApi } = await import("@/lib/api");
      const [stock, suppl] = await Promise.all([
        inventoryApi.stock(),
        suppliersApi.list(),
      ]);
      setMedicines(stock);
      setSuppliers(suppl);
    } catch (err) {
      console.error("Failed to load inventory:", err);
      toast.error("Failed to load inventory data");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLowStock = useCallback(async () => {
    try {
      const { inventoryApi } = await import("@/lib/api");
      const items = await inventoryApi.lowStock();
      setLowStockItems(items);
    } catch (err) {
      toast.error("Failed to load low-stock items");
    }
  }, []);

  const loadExpiry = useCallback(async (status: string) => {
    try {
      const { inventoryApi } = await import("@/lib/api");
      const items = await inventoryApi.expiry(status as any);
      setExpiryItems(items);
    } catch (err) {
      toast.error("Failed to load expiry data");
    }
  }, []);

  const loadTransactions = useCallback(async (page = 1) => {
    try {
      const { inventoryApi } = await import("@/lib/api");
      const result = await inventoryApi.transactions({ page: String(page), limit: "50" });
      setTransactions(result.data ?? result);
      setTxPage(page);
    } catch (err) {
      toast.error("Failed to load transaction history");
    }
  }, []);

  // Load stock on mount and on debounced AJAX search (without flashing the full-page loader)
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    setStockSearching(true);
    (async () => {
      try {
        const { inventoryApi } = await import("@/lib/api");
        const stock = await inventoryApi.stock(debouncedSearch || undefined);
        if (active) setMedicines(stock);
      } catch (err) {
        if (active) {
          console.error("Failed to load inventory:", err);
          toast.error("Failed to load inventory data");
        }
      } finally {
        if (active) {
          setLoading(false);
          setStockSearching(false);
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, debouncedSearch]);

  // Load suppliers once on mount (used by add/edit medicine forms)
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    (async () => {
      try {
        const { suppliersApi } = await import("@/lib/api");
        const suppl = await suppliersApi.list();
        if (active) setSuppliers(suppl);
      } catch {
        /* non-critical */
      }
    })();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === "low") loadLowStock();
    if (activeTab === "expiry") loadExpiry(expiryStatus);
    if (activeTab === "history") loadTransactions(txPage);
  }, [isAuthenticated, activeTab, expiryStatus, txPage, loadLowStock, loadExpiry, loadTransactions]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  // ─── Medicine CRUD ─────────────────────────────────────────────
  const resetMedForm = () => {
    setMedForm({ name: "", genericName: "", brand: "", category: "", composition: "", hsnCode: "", gstRate: "18", unit: "Nos", packSize: "", barcode: "", minQuantity: 10, purchasePrice: 0, sellingPrice: 0, mrp: 0 });
    setEditingMed(null);
  };

  const openEditMed = (med: MedicineRow) => {
    setMedForm({
      name: med.name,
      genericName: med.genericName ?? "",
      brand: med.brand ?? "",
      category: med.category ?? "",
      composition: med.composition ?? "",
      hsnCode: med.hsnCode ?? "",
      gstRate: med.gstRate,
      unit: med.unit ?? "Nos",
      packSize: med.packSize ?? "",
      barcode: med.barcode ?? "",
      minQuantity: med.minQuantity ?? 10,
      purchasePrice: med.purchasePrice,
      sellingPrice: med.sellingPrice,
      mrp: med.mrp ?? 0,
    });
    setEditingMed(med);
    setMedDialogOpen(true);
  };

  const handleSaveMedicine = async () => {
    if (!medForm.name) { toast.error("Medicine name is required"); return; }
    setSavingMed(true);
    try {
      const { medicinesApi } = await import("@/lib/api");
      if (editingMed) {
        await medicinesApi.update(editingMed.id, {
          name: medForm.name,
          genericName: medForm.genericName || undefined,
          brand: medForm.brand || undefined,
          category: medForm.category || undefined,
          composition: medForm.composition || undefined,
          hsnCode: medForm.hsnCode || undefined,
          gstRate: medForm.gstRate as any,
          unit: medForm.unit || undefined,
          packSize: medForm.packSize || undefined,
          barcode: medForm.barcode || undefined,
          minQuantity: medForm.minQuantity,
          purchasePrice: medForm.purchasePrice,
          sellingPrice: medForm.sellingPrice,
          mrp: medForm.mrp || undefined,
        });
        toast.success("Medicine updated");
      } else {
        await medicinesApi.create({
          name: medForm.name,
          genericName: medForm.genericName || undefined,
          brand: medForm.brand || undefined,
          category: medForm.category || undefined,
          composition: medForm.composition || undefined,
          hsnCode: medForm.hsnCode || undefined,
          gstRate: medForm.gstRate as any,
          unit: medForm.unit || undefined,
          packSize: medForm.packSize || undefined,
          barcode: medForm.barcode || undefined,
          minQuantity: medForm.minQuantity,
          purchasePrice: medForm.purchasePrice,
          sellingPrice: medForm.sellingPrice,
          mrp: medForm.mrp || undefined,
        });
        toast.success("Medicine added");
      }
      setMedDialogOpen(false);
      resetMedForm();
      loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save medicine");
    } finally {
      setSavingMed(false);
    }
  };

  const handleDeleteMedicine = async (id: string) => {
    try {
      const { medicinesApi } = await import("@/lib/api");
      await medicinesApi.delete(id);
      toast.success("Medicine deleted");
      loadAll();
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("invoiced or stocked")) {
        toast.error("Can't delete — this medicine has invoices or stock history");
      } else if (msg.includes("Medicine not found")) {
        toast.error("Medicine not found — it may already be deleted");
      } else {
        toast.error(msg || "Failed to delete medicine");
      }
    }
  };

  // ─── Batch CRUD ───────────────────────────────────────────────
  const openBatchDialog = (medicineId: string, batch?: BatchRow) => {
    setBatchMedicineId(medicineId);
    if (batch) {
      setEditingBatch(batch);
      setBatchForm({
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        mrp: batch.mrp,
        purchasePrice: batch.purchasePrice,
        sellingPrice: batch.sellingPrice,
        quantity: batch.quantity,
        freeQuantity: batch.freeQuantity,
        supplierId: "",
      });
    } else {
      setEditingBatch(null);
      // Pre-fill from medicine master
      const med = medicines.find(m => m.id === medicineId);
      setBatchForm({
        batchNo: "",
        expiryDate: "",
        mrp: med?.mrp ?? med?.sellingPrice ?? 0,
        purchasePrice: med?.purchasePrice ?? 0,
        sellingPrice: med?.sellingPrice ?? 0,
        quantity: 0,
        freeQuantity: 0,
        supplierId: "",
      });
    }
    setBatchDialogOpen(true);
  };

  const handleSaveBatch = async () => {
    if (!batchMedicineId || !batchForm.batchNo || !batchForm.expiryDate) {
      toast.error("Batch number and expiry date are required");
      return;
    }
    if (batchForm.sellingPrice > batchForm.mrp) {
      toast.error("Selling price cannot exceed MRP");
      return;
    }
    setSavingBatch(true);
    try {
      const { inventoryApi } = await import("@/lib/api");
      if (editingBatch) {
        await inventoryApi.updateBatch(editingBatch.id, {
          expiryDate: batchForm.expiryDate,
          mrp: batchForm.mrp,
          purchasePrice: batchForm.purchasePrice,
          sellingPrice: batchForm.sellingPrice,
        });
        toast.success("Batch updated");
      } else {
        await inventoryApi.createBatch({
          medicineId: batchMedicineId,
          batchNo: batchForm.batchNo,
          expiryDate: batchForm.expiryDate,
          mrp: batchForm.mrp,
          purchasePrice: batchForm.purchasePrice,
          sellingPrice: batchForm.sellingPrice,
          quantity: batchForm.quantity,
          freeQuantity: batchForm.freeQuantity,
          supplierId: batchForm.supplierId || undefined,
        });
        toast.success("Batch created — stock updated");
      }
      setBatchDialogOpen(false);
      loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save batch");
    } finally {
      setSavingBatch(false);
    }
  };

  // ─── Stock Adjustment ────────────────────────────────────────
  const openAdjustDialog = (batch: BatchRow) => {
    setAdjustingBatch(batch);
    setAdjustQty(batch.quantity);
    setAdjustReason("");
    setAdjustDialogOpen(true);
  };

  const handleAdjust = async () => {
    if (!adjustingBatch || !adjustReason) { toast.error("Reason is required for stock adjustment"); return; }
    setAdjusting(true);
    try {
      const { inventoryApi } = await import("@/lib/api");
      await inventoryApi.adjust({
        batchId: adjustingBatch.id,
        newQuantity: adjustQty,
        reason: adjustReason,
      });
      toast.success("Stock adjusted");
      setAdjustDialogOpen(false);
      loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to adjust stock");
    } finally {
      setAdjusting(false);
    }
  };

  // ─── Barcode Lookup ───────────────────────────────────────────
  const handleScanBarcode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScanLoading(true);
    setScanError("");
    try {
      const { medicinesApi } = await import("@/lib/api");
      const med = await medicinesApi.getByBarcode(trimmed);
      if (med) {
        setScanOpen(false);
        setScanBarcode("");
        // Navigate to that medicine in the list
        setSearch(trimmed);
        // Expand its batches
        const found = medicines.find(m => m.id === med.id || m.barcode === trimmed);
        if (found) {
          openBatchDialog(found.id);
        } else {
          toast(`Found: ${med.name} — add a batch to start tracking stock`);
          // Pre-fill form with medicine data then open batch dialog
          setMedForm({
            name: med.name,
            genericName: med.genericName ?? "",
            brand: med.brand ?? "",
            category: med.category ?? "",
            composition: med.composition ?? "",
            hsnCode: med.hsnCode ?? "",
            gstRate: med.gstRate,
            unit: med.unit ?? "Nos",
            packSize: med.packSize ?? "",
            barcode: med.barcode ?? "",
            minQuantity: med.minQuantity ?? 10,
            purchasePrice: med.purchasePrice,
            sellingPrice: med.sellingPrice,
            mrp: med.mrp ?? 0,
          });
          setMedDialogOpen(true);
        }
      } else {
        setScanError(`No medicine found with barcode "${trimmed}"`);
      }
    } catch {
      setScanError("Failed to look up barcode");
    } finally {
      setScanLoading(false);
    }
  };

  // ─── Import from Catalog ──────────────────────────────────────
  const importFromCatalog = (entry: CatalogMedicine) => {
    setMedForm({
      name: entry.name,
      genericName: entry.composition ?? "",
      brand: entry.company,
      category: entry.category ?? "",
      composition: entry.composition ?? "",
      hsnCode: entry.hsnCode ?? "",
      gstRate: String(entry.gstRate) as any,
      unit: entry.unit ?? "Nos",
      packSize: entry.packSize ?? "",
      barcode: "",
      minQuantity: 10,
      purchasePrice: 0,
      sellingPrice: entry.price ?? 0,
      mrp: entry.price ?? 0,
    });
    setEditingMed(null);
    setCatalogOpen(false);
    setMedDialogOpen(true);
  };

  // ─── Helpers ──────────────────────────────────────────────────
  const categories = [...new Set(medicines.map(m => m.category).filter((c): c is string => Boolean(c)))];

  const filteredMeds = medicines.filter(m => {
    const matchSearch = !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.brand ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (m.hsnCode ?? "").includes(search) ||
      (m.barcode ?? "").includes(search);
    const matchCat = !categoryFilter || m.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const today = new Date();
  const daysUntilExpiry = (dateStr: string) => {
    const exp = new Date(dateStr);
    return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  /** "14 strips + 10 tabs" instead of 14.666… — fractional packs become words. */
  const stockWords = (med: MedicineRow): { main: string; sub: string } => {
    const upp = Math.max(1, (med as any).unitsPerPack ?? 1);
    const words = formatPackQty(med.availableStock ?? 0, upp);
    const parts = words.split(" + ");
    return {
      main: parts[0] ?? words,
      sub: parts[1] ? `+ ${parts[1]} · ${upp}/strip` : `${upp}/strip`,
    };
  };

  const expiryColor = (dateStr: string) => {
    const days = daysUntilExpiry(dateStr);
    if (days <= 0) return "text-red-600 bg-red-50 border-red-200";
    if (days <= 30) return "text-orange-600 bg-orange-50 border-orange-200";
    if (days <= 90) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "";
  };

  const stockValue = medicines.reduce((sum, m) => sum + (m.stockValue ?? 0), 0);
  const totalSKUs = medicines.length;
  const lowStockCount = medicines.filter(m => m.availableStock <= (m.minQuantity ?? 10)).length;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalSKUs} medicines · ₹{stockValue.toFixed(2)} stock value
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* KPI Chips */}
          {lowStockCount > 0 && (
            <Badge variant="destructive" className="text-xs cursor-pointer" onClick={() => setActiveTab("low")}>
              <TrendingDown className="h-3 w-3 mr-1" />
              {lowStockCount} Low Stock
            </Badge>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              data-inventory-search
              onChange={e => setSearch(e.target.value)}
              placeholder="Search medicines…  ( / )"
              className={"pl-9 h-9 w-48 text-sm" + (stockSearching ? " pr-8" : "")}
            />
            {stockSearching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />}
          </div>
          <Button variant="outline" size="sm" onClick={() => { setScanBarcode(""); setScanError(""); setScanOpen(true); }}>
            <ScanBarcode className="h-3.5 w-3.5 mr-1.5" />Scan
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setCatalogSearch(""); setCatalogOpen(true); }}>
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />Medicine DB
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/stock-audit")}>
            <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />Start stock audit
          </Button>
          <Dialog open={medDialogOpen} onOpenChange={open => { setMedDialogOpen(open); if (!open) resetMedForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><PackagePlus className="h-3.5 w-3.5 mr-1.5" />Add Medicine</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingMed ? "Edit Medicine" : "Add New Medicine"}</DialogTitle>
                <DialogDescription>Fill in the medicine master details. Add batches to track stock.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Medicine Name *</Label>
                  <Input value={medForm.name} onChange={e => setMedForm({ ...medForm, name: e.target.value })} placeholder="e.g. Paracetamol 500mg" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Generic Name</Label>
                  <Input value={medForm.genericName} onChange={e => setMedForm({ ...medForm, genericName: e.target.value })} placeholder="Paracetamol" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Brand</Label>
                  <Input value={medForm.brand} onChange={e => setMedForm({ ...medForm, brand: e.target.value })} placeholder="Crocin" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Input value={medForm.category} onChange={e => setMedForm({ ...medForm, category: e.target.value })} placeholder="Tablet, Syrup..." className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Input value={medForm.unit} onChange={e => setMedForm({ ...medForm, unit: e.target.value })} placeholder="Nos, Strip, Bottle" className="mt-1 h-9" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Composition</Label>
                  <Input value={medForm.composition} onChange={e => setMedForm({ ...medForm, composition: e.target.value })} placeholder="Paracetamol 500mg + Caffeine 65mg" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Barcode</Label>
                  <Input value={medForm.barcode} onChange={e => setMedForm({ ...medForm, barcode: e.target.value })} placeholder="EAN or MRP barcode" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">HSN Code</Label>
                  <Input value={medForm.hsnCode} onChange={e => setMedForm({ ...medForm, hsnCode: e.target.value })} placeholder="300490" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">GST Rate (%)</Label>
                  <Select value={medForm.gstRate} onValueChange={v => setMedForm({ ...medForm, gstRate: v })}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Min. Stock Alert</Label>
                  <Input type="number" min={0} value={medForm.minQuantity} onChange={e => setMedForm({ ...medForm, minQuantity: Number(e.target.value) })} className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">MRP (₹)</Label>
                  <Input type="number" min={0} step={0.01} value={medForm.mrp} onChange={e => setMedForm({ ...medForm, mrp: Number(e.target.value) })} className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Purchase Price (₹)</Label>
                  <Input type="number" min={0} step={0.01} value={medForm.purchasePrice} onChange={e => setMedForm({ ...medForm, purchasePrice: Number(e.target.value) })} className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Selling Price (₹)</Label>
                  <Input type="number" min={0} step={0.01} value={medForm.sellingPrice} onChange={e => setMedForm({ ...medForm, sellingPrice: Number(e.target.value) })} className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Pack Size</Label>
                  <Input value={medForm.packSize} onChange={e => setMedForm({ ...medForm, packSize: e.target.value })} placeholder="10's, 100ml" className="mt-1 h-9" />
                </div>
              </div>
              <Button onClick={handleSaveMedicine} disabled={savingMed || !medForm.name} className="mt-2">
                {savingMed ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                {editingMed ? "Update" : "Add"} Medicine
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs — fills the viewport; each tab owns its internal region scroll */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabValue)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabsList className="grid w-full shrink-0 grid-cols-4 sm:w-auto">
          <TabsTrigger value="stock" className="text-xs gap-1"><PackagePlus className="h-3 w-3" />Stock</TabsTrigger>
          <TabsTrigger value="expiry" className="text-xs gap-1"><Clock className="h-3 w-3" />Expiry</TabsTrigger>
          <TabsTrigger value="low" className="text-xs gap-1"><TrendingDown className="h-3 w-3" />Low Stock</TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1"><ArrowDownUp className="h-3 w-3" />History</TabsTrigger>
        </TabsList>

        {/* ── STOCK TAB ── */}
        <TabsContent value="stock" className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden data-[state=inactive]:hidden">
          {/* Category filter */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Button variant="outline" size="sm" className={`text-xs h-7 ${!categoryFilter ? "bg-secondary" : ""}`} onClick={() => setCategoryFilter("")}>All</Button>
              {categories.map(cat => (
                <Button key={cat} variant="outline" size="sm" className={`text-xs h-7 shrink-0 ${categoryFilter === cat ? "bg-secondary" : ""}`} onClick={() => setCategoryFilter(cat)}>{cat}</Button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filteredMeds.length === 0 ? (
            <EmptyState icon={PackagePlus} title={search ? "No medicines match your search" : "No medicines yet"} description="Add your first medicine to start tracking stock." actions={[{ label: "Add Medicine", onClick: () => setMedDialogOpen(true) }]} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              {/* Column Headers */}
              <div className="hidden shrink-0 sm:grid grid-cols-12 gap-2 px-4 text-xs text-muted-foreground font-medium">
                <div className="col-span-4">Medicine</div>
                <div className="col-span-1 text-center">Stock</div>
                <div className="col-span-1 text-center">Min.</div>
                <div className="col-span-1 text-right">MRP</div>
                <div className="col-span-1 text-right">Rate</div>
                <div className="col-span-1 text-center">GST%</div>
                <div className="col-span-1 text-center">Batches</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              {/* Paged region — 25 rows per viewport, buttons instead of scroll */}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
              {filteredMeds.slice((stockPage - 1) * STOCK_PAGE_SIZE, stockPage * STOCK_PAGE_SIZE).map((med, i) => (
                <motion.div
                  key={med.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  className="border border-border/60 rounded-sm p-3 sm:p-4 hover:bg-secondary/30 transition-colors"
                >
                  {/* Medicine row */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                    <div className="sm:col-span-4">
                      <button onClick={() => openEditMed(med)} className="text-left hover:underline">
                        <p className="text-sm font-medium">{med.name}</p>
                        <p className="text-xs text-muted-foreground">{med.brand ?? med.genericName ?? ""} · {med.category ?? ""}</p>
                      </button>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {med.hsnCode ? `HSN: ${med.hsnCode}` : ""} {med.barcode ? `· BAR: ${med.barcode}` : ""}
                      </p>
                    </div>

                    <div className="sm:col-span-1 text-center">
                      <span className={`block text-sm font-semibold tabular-nums leading-tight ${med.availableStock <= (med.minQuantity ?? 10) ? "text-red-600" : "text-foreground"}`}>
                        {stockWords(med).main}
                      </span>
                      <p className="text-[10px] text-muted-foreground">{stockWords(med).sub}</p>
                    </div>

                    <div className="sm:col-span-1 text-center text-xs text-muted-foreground">
                      {med.minQuantity ?? 10}
                    </div>

                    <div className="sm:col-span-1 text-right text-sm tabular-nums">
                      {med.mrp ? `₹${med.mrp.toFixed(0)}` : "—"}
                    </div>

                    <div className="sm:col-span-1 text-right text-sm tabular-nums text-muted-foreground">
                      {med.sellingPrice > 0 ? `₹${med.sellingPrice.toFixed(2)}` : "—"}
                    </div>

                    <div className="sm:col-span-1 text-center">
                      <Badge variant="secondary" className="text-[10px]">{med.gstRate}%</Badge>
                    </div>

                    <div className="sm:col-span-1 text-center text-xs text-muted-foreground">
                      {med.batches?.length ?? 0} batch{(med.batches?.length ?? 0) !== 1 ? "es" : ""}
                    </div>

                    <div className="sm:col-span-2 flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit medicine" onClick={() => openEditMed(med)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Print labels" onClick={() => navigate(`/dashboard/labels?medicineId=${med.id}`)}><Printer className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Add batch" onClick={() => openBatchDialog(med.id)}><PlusCircle className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete medicine" onClick={() => handleDeleteMedicine(med.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>

                  {/* Batch list — expanded view */}
                  {med.batches && med.batches.length > 0 && (
                    <div className="mt-3 border-t border-border/40 pt-3">
                      <div className="hidden sm:grid grid-cols-12 gap-1 text-[10px] text-muted-foreground uppercase tracking-wider px-1 mb-1">
                        <div className="col-span-2">Batch No.</div>
                        <div className="col-span-2">Expiry</div>
                        <div className="col-span-1 text-right">Qty</div>
                        <div className="col-span-1 text-right">MRP</div>
                        <div className="col-span-1 text-right">Pur. ₹</div>
                        <div className="col-span-1 text-right">Sell ₹</div>
                        <div className="col-span-2 text-center">Status</div>
                        <div className="col-span-2 text-right">Actions</div>
                      </div>
                      <div className="space-y-1">
                        {med.batches.map(batch => {
                          const days = daysUntilExpiry(batch.expiryDate);
                          const isLow = batch.quantity <= 5;
                          const isExpired = days <= 0;
                          return (
                            <div key={batch.id} className={`grid grid-cols-2 sm:grid-cols-12 gap-1 sm:gap-2 items-center px-2 py-1.5 rounded-sm text-xs ${expiryColor(batch.expiryDate)} ${isLow && !isExpired ? "bg-orange-50" : ""}`}>
                              <div className="col-span-2 font-mono text-xs">{batch.batchNo}</div>
                              <div className="col-span-1 sm:col-span-2 text-muted-foreground">
                                <span className="font-mono">{formatExpiryMY(batch.expiryDate)}</span>
                                <span className="ml-1 text-[10px]">{days > 0 ? `${days}d` : "Exp"}</span>
                              </div>
                              <div className="col-span-1 text-right font-semibold tabular-nums" title={`${batch.quantity} tabs`}>{formatPackQty(batch.quantity, (med as any).unitsPerPack)}</div>
                              <div className="hidden sm:block sm:col-span-1 text-right tabular-nums">{batch.mrp > 0 ? `₹${batch.mrp.toFixed(0)}` : "—"}</div>
                              <div className="hidden sm:block sm:col-span-1 text-right tabular-nums text-muted-foreground">{batch.purchasePrice > 0 ? `₹${batch.purchasePrice.toFixed(2)}` : "—"}</div>
                              <div className="hidden sm:block sm:col-span-1 text-right tabular-nums text-muted-foreground">{batch.sellingPrice > 0 ? `₹${batch.sellingPrice.toFixed(2)}` : "—"}</div>
                              <div className="col-span-1 text-center">
                                {isExpired ? (
                                  <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                                ) : days <= 30 ? (
                                  <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">Expiring</Badge>
                                ) : isLow ? (
                                  <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-300">Low</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 border-green-200">OK</Badge>
                                )}
                              </div>
                              <div className="col-span-2 flex items-center gap-1 justify-end">
                                <Button size="icon" variant="ghost" className="h-6 w-6" title="Adjust stock" onClick={() => openAdjustDialog(batch)}><ArrowDownUp className="h-3 w-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit batch" onClick={() => openBatchDialog(med.id, batch)}><Edit2 className="h-3 w-3" /></Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(!med.batches || med.batches.length === 0) && (
                    <button
                      onClick={() => openBatchDialog(med.id)}
                      className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <PlusCircle className="h-3 w-3" />
                      Add first batch to track stock
                    </button>
                  )}
                </motion.div>
              ))}
              </div>
              {/* Pager — keyboard reachable, no endless scroll */}
              {filteredMeds.length > STOCK_PAGE_SIZE && (
                <div className="flex shrink-0 items-center justify-between border-t border-border/50 pt-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {(stockPage - 1) * STOCK_PAGE_SIZE + 1}–{Math.min(stockPage * STOCK_PAGE_SIZE, filteredMeds.length)} of {filteredMeds.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7" disabled={stockPage <= 1} onClick={() => setStockPage((p) => Math.max(1, p - 1))}>
                      ← Prev
                    </Button>
                    <span className="px-1 tabular-nums">Page {stockPage} / {Math.ceil(filteredMeds.length / STOCK_PAGE_SIZE)}</span>
                    <Button size="sm" variant="outline" className="h-7" disabled={stockPage >= Math.ceil(filteredMeds.length / STOCK_PAGE_SIZE)} onClick={() => setStockPage((p) => p + 1)}>
                      Next →
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── EXPIRY TAB ── */}
        <TabsContent value="expiry" className="space-y-4">
          <div className="flex gap-2">
            {(["expired", "30", "60", "90"] as const).map(s => (
              <Button key={s} variant={expiryStatus === s ? "default" : "outline"} size="sm" className="text-xs" onClick={() => { setExpiryStatus(s); }}>
                {s === "expired" ? "Expired" : `Next ${s} days`}
              </Button>
            ))}
          </div>
          {expiryItems.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No expiry items" description={`No medicines expiring in this period.`} />
          ) : (
            <div className="border rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiryItems.map((item: any, i: number) => {
                    const days = daysUntilExpiry(item.expiryDate);
                    return (
                      <TableRow key={`${item.id}-${i}`}>
                        <TableCell className="text-sm">
                          <p className="font-medium">{item.medicineName ?? item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.medicineBrand ?? item.brand ?? ""}</p>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{item.batchNo}</TableCell>
                        <TableCell className="text-sm">
                          <span className={days <= 0 ? "text-red-600 font-semibold" : days <= 30 ? "text-orange-600" : ""}>
                            {formatExpiryMY(item.expiryDate)}
                          </span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({days <= 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`})
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium" title={`${item.quantity} tabs`}>{formatPackQty(item.quantity, (item as any).unitsPerPack)}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{item.mrp?.toFixed(2) ?? "—"}</TableCell>
                        <TableCell>
                          {days <= 0 ? (
                            <Badge variant="destructive" className="text-xs">Expired</Badge>
                          ) : days <= 30 ? (
                            <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-300">Expiring Soon</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── LOW STOCK TAB ── */}
        <TabsContent value="low" className="space-y-3">
          {lowStockItems.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All stock levels are healthy" description="No medicines are below their minimum stock threshold." />
          ) : (
            <div className="border rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead className="text-center">Available</TableHead>
                    <TableHead className="text-center">Min. Level</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Stock Value</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.brand ?? item.genericName ?? ""}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-red-600 font-semibold tabular-nums" title={`${item.availableStock ?? 0} tabs`}>
                          {formatPackQty(item.availableStock ?? 0, (item as any).unitsPerPack)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground tabular-nums">{item.minQuantity ?? 10}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.mrp ? `₹${item.mrp.toFixed(0)}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        ₹{(item.stockValue ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openBatchDialog(item.id)}>
                          <PlusCircle className="h-3 w-3 mr-1" />Add Stock
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── HISTORY TAB ── */}
        <TabsContent value="history" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{transactions.length} recent transactions</p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" onClick={() => setTxPage(p => p + 1)}>Next</Button>
            </div>
          </div>
          {transactions.length === 0 ? (
            <EmptyState icon={ArrowDownUp} title="No transactions yet" description="Inventory transactions will appear here as stock changes." />
          ) : (
            <div className="border rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-IN") : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{tx.type?.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{tx.medicineName ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{tx.batchNo ?? "—"}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${tx.quantity > 0 ? "text-green-600" : "text-red-600"}`} title={`${tx.quantity} tabs`}>
                        {tx.quantity > 0 ? `+${formatPackQty(tx.quantity, tx.unitsPerPack)}` : `−${formatPackQty(Math.abs(tx.quantity), tx.unitsPerPack)}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground" title={`${tx.balanceAfter ?? 0} tabs`}>
                        {tx.balanceAfter != null ? formatPackQty(tx.balanceAfter, tx.unitsPerPack) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{tx.reason ?? tx.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Barcode Scan Dialog ── */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Barcode</DialogTitle>
            <DialogDescription>Point your camera at the medicine barcode or type the code manually.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input value={scanBarcode} onChange={e => setScanBarcode(e.target.value)} data-enter="custom" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void handleScanBarcode(scanBarcode); } }} placeholder="Type or scan barcode..." className="h-9 text-sm" autoFocus />
              <Button size="sm" onClick={() => void handleScanBarcode(scanBarcode)} disabled={scanLoading || !scanBarcode.trim()}>
                {scanLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Barcode className="h-3.5 w-3.5" />}
              </Button>
            </div>
            {scanError && <p className="text-xs text-destructive">{scanError}</p>}
            <BarcodeCameraScanner active={scanOpen} onScan={handleScanBarcode} onError={msg => setScanError(msg)} className="w-full overflow-hidden rounded-sm border border-border/60 bg-black [&_video]:w-full" />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Medicine Catalog Dialog — ↓↑ moves, Enter adds ── */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Medicine Database</DialogTitle>
            <DialogDescription>Search a lakh+ medicines — ↓↑ to move, Enter to add. Esc closes.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Input
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
              onKeyDown={e => {
                const list = catalogSearch.trim() ? (catalogResults ?? []) : [];
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const next = Math.min(catalogActiveIdx + 1, Math.max(0, list.length - 1));
                  setCatalogActiveIdx(next);
                  catalogList.scrollTo(next);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  const next = Math.max(0, catalogActiveIdx - 1);
                  setCatalogActiveIdx(next);
                  catalogList.scrollTo(next);
                } else if (e.key === "Enter" && list[catalogActiveIdx]) {
                  e.preventDefault();
                  importFromCatalog(list[catalogActiveIdx]);
                }
              }}
              placeholder="Search by name, company, or composition…"
              className="mb-2 pr-9"
              autoFocus
              aria-label="Search Medicine Database. Arrow keys move, Enter adds."
            />
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {catalogSearch.trim() ? (catalogCount ? `${catalogCount.toLocaleString("en-IN")} medicines found` : "Loading...") : "Popular medicines — start typing to search"}
          </p>
          <div ref={catalogList.listRef} className="max-h-72 overflow-y-auto scroll-py-1 space-y-1" role="listbox" aria-label="Medicine Database results" aria-activedescendant={catalogSearch.trim() && (catalogResults ?? [])[catalogActiveIdx] ? `catalog-opt-${catalogActiveIdx}` : undefined}>
            {catalogLoading && catalogSearch.trim() && <p className="text-sm text-muted-foreground text-center py-6 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Searching...</p>}
            {!catalogLoading && (catalogSearch.trim() ? catalogResults : [])?.map((entry: CatalogMedicine, listIdx: number) => {
              const isActive = listIdx === catalogActiveIdx;
              return (
                <button
                  key={entry.catalogKey}
                  id={`catalog-opt-${listIdx}`}
                  role="option"
                  data-option-index={listIdx}
                  aria-selected={isActive}
                  onMouseEnter={() => setCatalogActiveIdx(listIdx)}
                  onClick={() => importFromCatalog(entry)}
                  className={`flex w-full items-center justify-between px-3 py-2 rounded-sm text-sm border text-left transition-colors ${isActive ? "border-primary/50 bg-primary/5" : "border-border/40 hover:bg-secondary/60"} ${entry.unavailable ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{entry.name} {entry.unavailable && <span className="ml-1 text-[10px] text-red-600">Unavailable</span>}</p>
                    <p className="text-xs text-muted-foreground">{entry.company} · {entry.composition}</p>
                    <p className="text-[10px] text-muted-foreground">{entry.category} · HSN {entry.hsnCode} · {entry.gstRate}% GST {entry.price ? `· ₹${entry.price.toFixed(2)}` : ""}</p>
                  </div>
                  <span className="ml-2 flex shrink-0 items-center gap-1.5">
                    {isActive && <kbd className="rounded border border-border bg-background px-1 text-[10px]">Enter</kbd>}
                    <span className="inline-flex items-center rounded-sm border border-border/60 px-2 py-1 text-xs"><Plus className="h-3 w-3 mr-1" />Add</span>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Batch Form Dialog ── */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBatch ? "Edit Batch" : "Add New Batch"}</DialogTitle>
            <DialogDescription>Enter batch details to track stock. MRP is the maximum retail price (inclusive of GST).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!editingBatch && (
              <div className="p-3 rounded-sm bg-secondary/50 text-sm text-muted-foreground">
                Adding batch for: <span className="font-medium text-foreground">{medicines.find(m => m.id === batchMedicineId)?.name ?? "—"}</span>
              </div>
            )}
            <div>
              <Label className="text-xs">Batch Number *</Label>
              <Input value={batchForm.batchNo} onChange={e => setBatchForm({ ...batchForm, batchNo: e.target.value })} placeholder="e.g. BTH001" className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">Expiry (MM/YY) *</Label>
              <ExpiryMMYYInput
                value={batchForm.expiryDate}
                onCommit={(full) => setBatchForm({ ...batchForm, expiryDate: full })}
                ariaLabel="Batch expiry as MM/YY (Enter for MRP)"
                className="mt-1 h-9 tabular-nums"
              />
              {batchForm.expiryDate && (
                <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">Prints as {formatExpiryMY(batchForm.expiryDate)}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">MRP (₹) *</Label>
                <Input type="number" min={0} step={0.01} value={batchForm.mrp} onChange={e => setBatchForm({ ...batchForm, mrp: Number(e.target.value) })} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Opening Qty</Label>
                <Input type="number" min={0} value={batchForm.quantity} onChange={e => setBatchForm({ ...batchForm, quantity: Number(e.target.value) })} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Purchase Price (₹)</Label>
                <Input type="number" min={0} step={0.01} value={batchForm.purchasePrice} onChange={e => setBatchForm({ ...batchForm, purchasePrice: Number(e.target.value) })} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Selling Price (₹) *</Label>
                <Input type="number" min={0} step={0.01} value={batchForm.sellingPrice} onChange={e => setBatchForm({ ...batchForm, sellingPrice: Number(e.target.value) })} className="mt-1 h-9" />
                {batchForm.sellingPrice > batchForm.mrp && (
                  <p className="text-[10px] text-red-500 mt-1 flex items-center gap-0.5"><AlertCircle className="h-3 w-3" />Selling price exceeds MRP!</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">Selling price must be ≤ MRP</p>
              </div>
            </div>
            <div>
              <Label className="text-xs">Free Quantity (bonus stock)</Label>
              <Input type="number" min={0} value={batchForm.freeQuantity} onChange={e => setBatchForm({ ...batchForm, freeQuantity: Number(e.target.value) })} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={batchForm.supplierId} onValueChange={v => setBatchForm({ ...batchForm, supplierId: v })}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select supplier (optional)" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSaveBatch} disabled={savingBatch || !batchForm.batchNo || !batchForm.expiryDate} className="flex-1">
              {savingBatch ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              {editingBatch ? "Update" : "Create"} Batch
            </Button>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Stock Adjustment Dialog ── */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>
              Adjust stock for batch <strong>{adjustingBatch?.batchNo}</strong>. Use this for breakages, found items, or inventory corrections — not for regular sales/purchases.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-sm border border-border/60 px-3 py-2 bg-secondary/30">
              <span className="text-sm text-muted-foreground">Current quantity</span>
              <span className="text-sm font-semibold tabular-nums" title={`${adjustingBatch?.quantity} tabs`}>
                {adjustingBatch ? formatPackQty(adjustingBatch.quantity, (medicines.find((m) => m.id === adjustingBatch.medicineId) as any)?.unitsPerPack) : "—"}
              </span>
            </div>
            <div>
              <Label className="text-xs">New Quantity *</Label>
              <Input type="number" min={0} value={adjustQty} onChange={e => setAdjustQty(Number(e.target.value))} className="mt-1 h-9" />
              {adjustQty !== adjustingBatch?.quantity && (
                <p className={`text-xs mt-1 ${adjustQty > (adjustingBatch?.quantity ?? 0) ? "text-green-600" : "text-red-600"}`}>
                  {adjustQty > (adjustingBatch?.quantity ?? 0) ? `+${adjustQty - (adjustingBatch?.quantity ?? 0)} added` : `${(adjustingBatch?.quantity ?? 0) - adjustQty} removed`}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Reason *</Label>
              <Select onValueChange={setAdjustReason}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakage">Breakage / Damage</SelectItem>
                  <SelectItem value="found">Found during audit</SelectItem>
                  <SelectItem value="expired">Expired / Disposed</SelectItem>
                  <SelectItem value="sample">Sample / Freebie</SelectItem>
                  <SelectItem value="correction">Correction</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAdjust} disabled={adjusting || !adjustReason} className="flex-1">
              {adjusting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />}
              Confirm Adjustment
            </Button>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
