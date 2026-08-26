import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useConvex, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { BarcodeCameraScanner } from "@/components/BarcodeCameraScanner";
import {
  getPopularCatalog,
  useMedicineCatalog,
  type CatalogMedicine,
} from "@/hooks/useMedicineCatalog";
import {
  Barcode,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PackagePlus,
  Plus,
  ScanBarcode,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const GST_RATES = [0, 5, 12, 18, 28];

export default function InventoryPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const medicines = useQuery(api.medicines.list);
  const suppliers = useQuery(api.suppliers.list);
  const createMedicine = useMutation(api.medicines.create);
  const updateMedicine = useMutation(api.medicines.update);
  const removeMedicine = useMutation(api.medicines.remove);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const convex = useConvex();
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBarcode, setScanBarcode] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState("");
  const [highlightId, setHighlightId] = useState<Id<"medicines"> | null>(null);
  const highlightTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [gstDraft, setGstDraft] = useState<{
    key: string;
    gstRate: number;
    hsnCode: string;
  } | null>(null);
  const {
    results: catalogResults,
    loading: catalogLoading,
    count: catalogCount,
    error: catalogError,
    unavailableCount,
    saveGst,
    toggleUnavailable,
    removeOverride,
  } = useMedicineCatalog(catalogSearch, 25, showUnavailable);

  const [form, setForm] = useState({
    name: "",
    brand: "",
    category: "",
    composition: "",
    batchNo: "",
    expiryDate: "",
    quantity: 0,
    minQuantity: 0,
    unit: "Nos",
    barcode: "",
    purchasePrice: 0,
    sellingPrice: 0,
    gstRate: 18,
    hsnCode: "",
    supplierId: "",
  });

  const filtered = medicines?.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.brand && m.brand.toLowerCase().includes(search.toLowerCase())) ||
      (m.hsnCode && m.hsnCode.toLowerCase().includes(search.toLowerCase())) ||
      (m.barcode && m.barcode.toLowerCase().includes(search.toLowerCase())),
  );

  const resetForm = () => {
    setForm({
      name: "",
      brand: "",
      category: "",
      composition: "",
      batchNo: "",
      expiryDate: "",
      quantity: 0,
      minQuantity: 0,
      unit: "Nos",
      barcode: "",
      purchasePrice: 0,
      sellingPrice: 0,
      gstRate: 18,
      hsnCode: "",
      supplierId: "",
    });
    setEditing(null);
  };

  const openEdit = (med: any) => {
    setForm({
      name: med.name,
      brand: med.brand || "",
      category: med.category || "",
      composition: med.composition || "",
      batchNo: med.batchNo || "",
      expiryDate: med.expiryDate || "",
      quantity: med.quantity,
      minQuantity: med.minQuantity || 0,
      unit: med.unit || "Nos",
      barcode: med.barcode || "",
      purchasePrice: med.purchasePrice,
      sellingPrice: med.sellingPrice,
      gstRate: med.gstRate,
      hsnCode: med.hsnCode || "",
      supplierId: med.supplierId || "",
    });
    setEditing(med);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      toast("Medicine name is required");
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name,
        brand: form.brand || undefined,
        category: form.category || undefined,
        composition: form.composition || undefined,
        batchNo: form.batchNo || undefined,
        expiryDate: form.expiryDate || undefined,
        quantity: form.quantity,
        minQuantity: form.minQuantity || undefined,
        unit: form.unit || undefined,
        barcode: form.barcode || undefined,
        purchasePrice: form.purchasePrice,
        sellingPrice: form.sellingPrice,
        gstRate: form.gstRate as 0 | 5 | 12 | 18 | 28,
        hsnCode: form.hsnCode || undefined,
        supplierId: (form.supplierId || undefined) as any,
      };

      if (editing) {
        await updateMedicine({ id: editing._id, ...data });
        toast("Medicine updated");
      } else {
        await createMedicine(data);
        toast("Medicine added");
      }
      resetForm();
      setDialogOpen(false);
    } catch (error) {
      toast("Failed to save medicine");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: Id<"medicines">) => {
    try {
      await removeMedicine({ id });
      toast("Medicine removed");
    } catch {
      toast("Failed to remove medicine");
    }
  };

  const importFromCatalog = (entry: CatalogMedicine) => {
    setForm({
      name: entry.name,
      brand: entry.company,
      category: entry.category,
      composition: entry.composition,
      batchNo: "",
      expiryDate: "",
      quantity: 0,
      minQuantity: 0,
      unit: entry.unit,
      barcode: "",
      purchasePrice: 0,
      sellingPrice: entry.price || 0,
      gstRate: entry.gstRate,
      hsnCode: entry.hsnCode,
      supplierId: "",
    });
    setEditing(null);
    setCatalogOpen(false);
    setDialogOpen(true);
  };

  const handleScannedBarcode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setScanLoading(true);
      setScanError("");
      try {
        const med = await convex.query(api.medicines.searchByBarcode, {
          barcode: trimmed,
        });
        if (med) {
          if (highlightTimeout.current) clearTimeout(highlightTimeout.current);
          setSearch(trimmed);
          setHighlightId(med._id);
          highlightTimeout.current = setTimeout(
            () => setHighlightId(null),
            3000,
          );
          setScanOpen(false);
          setScanBarcode("");
          toast(
            `Found: ${med.name} — ${med.quantity} ${med.unit || "units"} in stock`,
          );
        } else {
          setScanError(`No medicine found with barcode "${trimmed}"`);
        }
      } catch {
        setScanError("Failed to look up barcode");
      } finally {
        setScanLoading(false);
      }
    },
    [convex],
  );

  if (!isAuthenticated && !isLoading) {
    navigate("/auth");
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {medicines?.length || 0} medicines in stock
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setScanBarcode("");
              setScanError("");
              setScanOpen(true);
            }}
          >
            <ScanBarcode className="h-3.5 w-3.5 mr-1.5" />
            Scan
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCatalogSearch("");
              setCatalogOpen(true);
            }}
          >
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Medicine DB
          </Button>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
                Add Medicine
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editing ? "Edit Medicine" : "Add Medicine"}
                </DialogTitle>
                <DialogDescription>
                  Fill in the medicine details below
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Medicine Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Paracetamol 500mg"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Brand</Label>
                  <Input
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    placeholder="Brand name"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Input
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    placeholder="e.g. Tablet, Syrup"
                    className="mt-1 h-9"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Composition</Label>
                  <Input
                    value={form.composition}
                    onChange={(e) =>
                      setForm({ ...form, composition: e.target.value })
                    }
                    placeholder="e.g. Paracetamol 500mg + Caffeine 65mg"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Barcode</Label>
                  <Input
                    value={form.barcode}
                    onChange={(e) =>
                      setForm({ ...form, barcode: e.target.value })
                    }
                    placeholder="Scan or type barcode (EAN/UPI/MRP)"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Batch No.</Label>
                  <Input
                    value={form.batchNo}
                    onChange={(e) =>
                      setForm({ ...form, batchNo: e.target.value })
                    }
                    placeholder="Batch number"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Expiry Date</Label>
                  <Input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) =>
                      setForm({ ...form, expiryDate: e.target.value })
                    }
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({ ...form, quantity: Number(e.target.value) })
                    }
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Min. Stock Alert</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.minQuantity}
                    onChange={(e) =>
                      setForm({ ...form, minQuantity: Number(e.target.value) })
                    }
                    placeholder="0 = default (10)"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="Nos, Strip, Bottle"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Purchase Price (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.purchasePrice}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        purchasePrice: Number(e.target.value),
                      })
                    }
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Selling Price (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.sellingPrice}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        sellingPrice: Number(e.target.value),
                      })
                    }
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">GST Rate (%)</Label>
                  <Select
                    value={String(form.gstRate)}
                    onValueChange={(v) =>
                      setForm({ ...form, gstRate: Number(v) })
                    }
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GST_RATES.map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          {r}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">HSN Code</Label>
                  <Input
                    value={form.hsnCode}
                    onChange={(e) =>
                      setForm({ ...form, hsnCode: e.target.value })
                    }
                    placeholder="e.g. 300490"
                    className="mt-1 h-9"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Supplier</Label>
                  <Select
                    value={form.supplierId}
                    onValueChange={(v) =>
                      setForm({ ...form, supplierId: v })
                    }
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue placeholder="Select supplier (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers?.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={handleSave}
                disabled={saving || !form.name}
                className="mt-4"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                )}
                {editing ? "Update" : "Add"} Medicine
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Barcode Scan Dialog */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Barcode</DialogTitle>
            <DialogDescription>
              Point your camera at the medicine barcode, or type/paste the code
              for instant stock lookup
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={scanBarcode}
                onChange={(e) => setScanBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleScannedBarcode(scanBarcode);
                }}
                placeholder="Type or scan barcode code"
                className="h-9 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void handleScannedBarcode(scanBarcode)}
                disabled={scanLoading || !scanBarcode.trim()}
              >
                {scanLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Barcode className="h-3.5 w-3.5" />
                )}
                Find
              </Button>
            </div>
            {scanError && <p className="text-xs text-destructive">{scanError}</p>}
            <BarcodeCameraScanner
              active={scanOpen}
              onScan={(code) => {
                void handleScannedBarcode(code);
              }}
              onError={(msg) => setScanError(msg)}
              className="w-full overflow-hidden rounded-sm border border-border/60 bg-black [&_video]:w-full"
            />
            <p className="text-xs text-muted-foreground">
              Tip: USB barcode scanners can type the code directly into the
              input above.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Medicine Database Dialog */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Medicine Database</DialogTitle>
            <DialogDescription>
              Search 2.4 lakh+ medicines from leading pharma companies — then
              add them to your inventory with prices and stock
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Input
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search by name, company, or composition..."
              className="mb-2 pr-9"
              autoFocus
            />
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">
            {catalogSearch.trim()
              ? catalogCount
                ? `${catalogCount.toLocaleString("en-IN")} medicines · results below`
                : "Loading the full medicine database…"
              : "Popular medicines — start typing to search the full database"}
          </p>
          {catalogSearch.trim() && unavailableCount > 0 && (
            <button
              onClick={() => setShowUnavailable((s) => !s)}
              className="mb-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showUnavailable ? "Hide" : "Show"} unavailable in region (
              {unavailableCount})
            </button>
          )}
          <div className="max-h-72 overflow-y-auto space-y-1">
            {catalogLoading && catalogSearch.trim() && (
              <p className="text-sm text-muted-foreground text-center py-6 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading database…
              </p>
            )}
            {!catalogLoading &&
              (catalogSearch.trim() ? catalogResults : getPopularCatalog(40))?.map(
                (entry) => (
                  <div
                    key={`${entry.name}-${entry.company}`}
                    className={`flex items-center justify-between px-3 py-2 rounded-sm text-sm border border-border/40 ${
                      entry.unavailable ? "opacity-50" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {entry.name}
                        {entry.unavailable && (
                          <span className="ml-2 text-[10px] text-red-600 border border-red-600/30 rounded-sm px-1 py-0.5 align-middle">
                            Unavailable
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.company} · {entry.composition}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {entry.category} · {entry.packSize} · HSN{" "}
                        {entry.hsnCode} · {entry.gstRate}% GST
                        {entry.price ? ` · ₹${entry.price.toFixed(2)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                      {catalogSearch.trim() && (
                        <>
                          {/* GST / HSN verification */}
                          <Popover
                            open={gstDraft?.key === entry.catalogKey}
                            onOpenChange={(open) =>
                              !open && setGstDraft(null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs shrink-0"
                                onClick={() =>
                                  setGstDraft({
                                    key: entry.catalogKey,
                                    gstRate: entry.gstRate,
                                    hsnCode: entry.hsnCode,
                                  })
                                }
                              >
                                {entry.verified ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-600 mr-1" />
                                ) : (
                                  <Tag className="h-3 w-3 text-muted-foreground mr-1" />
                                )}
                                {entry.gstRate}%
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-60 p-3" align="end">
                              <p className="text-xs font-medium mb-2">
                                Verify GST / HSN
                              </p>
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-xs">GST Rate</Label>
                                  <Select
                                    value={String(
                                      gstDraft?.gstRate ?? entry.gstRate,
                                    )}
                                    onValueChange={(v) =>
                                      setGstDraft((d) =>
                                        d ? { ...d, gstRate: Number(v) } : d,
                                      )
                                    }
                                  >
                                    <SelectTrigger className="mt-1 h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {GST_RATES.map((r) => (
                                        <SelectItem key={r} value={String(r)}>
                                          {r}%
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">HSN Code</Label>
                                  <Input
                                    value={gstDraft?.hsnCode ?? entry.hsnCode}
                                    onChange={(e) =>
                                      setGstDraft((d) =>
                                        d
                                          ? { ...d, hsnCode: e.target.value }
                                          : d,
                                      )
                                    }
                                    className="mt-1 h-8 text-xs"
                                  />
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <Button
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => {
                                      if (gstDraft) {
                                        saveGst(
                                          entry,
                                          gstDraft.gstRate,
                                          gstDraft.hsnCode,
                                        );
                                        toast("GST rate saved");
                                      }
                                      setGstDraft(null);
                                    }}
                                  >
                                    Save
                                  </Button>
                                  {(entry.verified || entry.unavailable) && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        removeOverride(entry.catalogKey);
                                        setGstDraft(null);
                                        toast("Reset to database defaults");
                                      }}
                                    >
                                      Reset
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                          {/* Region availability flag */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            title={
                              entry.unavailable
                                ? "Mark available in my region"
                                : "Mark unavailable in my region"
                            }
                            onClick={() => {
                              toggleUnavailable(
                                entry,
                                !entry.unavailable,
                              );
                              toast(
                                entry.unavailable
                                  ? "Marked available in your region"
                                  : "Marked unavailable in your region",
                              );
                            }}
                          >
                            {entry.unavailable ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => importFromCatalog(entry)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                ),
              )}
            {!catalogLoading && catalogError && catalogSearch.trim() && (
              <p className="text-sm text-destructive text-center py-6">
                Failed to load the medicine database. Check your connection and
                try again.
              </p>
            )}
            {!catalogLoading &&
              !catalogError &&
              catalogSearch.trim() &&
              catalogResults?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No medicines found in the database.
                </p>
              )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-1">
        {filtered?.map((med, i) => (
          <motion.div
            key={med._id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className={`flex items-center justify-between px-4 py-3 border rounded-sm transition-colors cursor-pointer ${
              highlightId === med._id
                ? "border-foreground/50 bg-secondary ring-1 ring-foreground/20"
                : "border-border/60 hover:bg-secondary/30"
            }`}
            onClick={() => openEdit(med)}
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{med.name}</p>
                {med.brand && (
                  <p className="text-xs text-muted-foreground">{med.brand}</p>
                )}
              </div>
              <Badge
                variant={
                  (med.minQuantity
                    ? med.quantity <= med.minQuantity
                    : med.quantity <= 10)
                    ? "destructive"
                    : "secondary"
                }
                className="text-[10px] shrink-0"
              >
                {med.quantity} {med.unit}
                {med.minQuantity && med.quantity <= med.minQuantity
                  ? " · Low"
                  : ""}
              </Badge>
              <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
                {med.barcode && `BAR: ${med.barcode}`}
                {med.hsnCode && ` · HSN: ${med.hsnCode}`}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right text-xs">
                <p className="text-muted-foreground">₹{med.sellingPrice}</p>
                <p className="text-muted-foreground">{med.gstRate}% GST</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(med._id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        ))}
        {filtered?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No medicines found.
          </p>
        )}
      </div>
    </motion.div>
  );
}
