import { LabelSheet } from "@/components/labels/LabelPreview";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  labelsApi,
  inventoryApi,
  medicinesApi,
  type LabelPreview,
  type LabelTemplate,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Layers,
  Loader2,
  Plus,
  Printer,
  Search,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

interface SheetItem {
  key: string;
  medicineId: string;
  medicineName: string;
  batchId?: string;
  batchNo?: string;
  quantity: number;
}

const MAX_QTY = 500;
const NO_BATCH = "__none__";

function newKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function LabelsPage() {
  const [searchParams] = useSearchParams();

  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateId, setTemplateId] = useState<string>("");

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<any | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchId, setBatchId] = useState<string>(NO_BATCH);
  const [quantity, setQuantity] = useState(1);

  const [items, setItems] = useState<SheetItem[]>([]);
  const [adding, setAdding] = useState(false);

  const [preview, setPreview] = useState<LabelPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const prefillHandled = useRef(false);
  const debouncedSearch = useDebouncedValue(search, 250);

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );
  const totalLabels = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const totalSheets = template ? Math.ceil(totalLabels / template.perSheet) : 0;

  // Load templates once; default to the small shelf label.
  useEffect(() => {
    let cancelled = false;
    labelsApi
      .templates()
      .then((list) => {
        if (cancelled) return;
        setTemplates(list);
        setTemplateId((current) => current || list[0]?.id || "");
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message ?? "Failed to load label templates");
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ?medicineId=<id> prefill — the Inventory row's "Print labels" action.
  useEffect(() => {
    if (prefillHandled.current) return;
    prefillHandled.current = true;
    const medicineId = searchParams.get("medicineId");
    if (!medicineId) return;
    medicinesApi
      .get(medicineId)
      .then((med) => {
        const data = (med as any)?.data ?? med;
        if (data?.id) {
          setSelectedMedicine(data);
          setSearch("");
          setResults([]);
        }
      })
      .catch((err) => toast.error(err?.message ?? "Medicine not found"));
  }, [searchParams]);

  // Medicine search (debounced).
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q || selectedMedicine) {
      if (!q) setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    medicinesApi
      .list({ search: q, limit: 8 })
      .then((res) => {
        if (cancelled) return;
        const list: any[] = Array.isArray(res) ? res : ((res as any)?.data ?? []);
        setResults(list);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, selectedMedicine]);

  // Load available batches whenever the picked medicine changes.
  useEffect(() => {
    if (!selectedMedicine) {
      setBatches([]);
      setBatchId(NO_BATCH);
      return;
    }
    let cancelled = false;
    setBatchesLoading(true);
    setBatchId(NO_BATCH);
    inventoryApi
      .getAvailableBatches(selectedMedicine.id)
      .then((res) => {
        if (cancelled) return;
        setBatches(Array.isArray(res) ? res : ((res as any)?.data ?? []));
      })
      .catch(() => {
        if (!cancelled) setBatches([]);
      })
      .finally(() => {
        if (!cancelled) setBatchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMedicine]);

  // Live preview — the server expands quantities into print-ready labels.
  useEffect(() => {
    if (items.length === 0 || !templateId) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    labelsApi
      .preview({
        items: items.map((i) => ({
          medicineId: i.medicineId,
          batchId: i.batchId,
          quantity: i.quantity,
          template: templateId,
        })),
      })
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        setPreviewError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(err?.message ?? "Failed to build the label preview");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [items, templateId]);

  const pickMedicine = (med: any) => {
    setSelectedMedicine(med);
    setSearch("");
    setResults([]);
  };

  const clearMedicine = () => {
    setSelectedMedicine(null);
    setBatches([]);
    setBatchId(NO_BATCH);
  };

  const addToSheet = () => {
    if (!selectedMedicine) {
      toast.error("Search and select a medicine first");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      toast.error(`Quantity must be between 1 and ${MAX_QTY}`);
      return;
    }
    setAdding(true);
    const batch = batchId !== NO_BATCH ? batches.find((b) => b.id === batchId) : undefined;
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        medicineId: selectedMedicine.id,
        medicineName: selectedMedicine.name,
        batchId: batch?.id,
        batchNo: batch?.batchNo,
        quantity,
      },
    ]);
    setQuantity(1);
    setBatchId(NO_BATCH);
    setAdding(false);
  };

  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" /> Barcode Labels
          </h1>
          <p className="text-xs text-muted-foreground">
            Build shelf labels from your inventory and print them on A4 sheets with the browser.
          </p>
        </div>
        <Button onClick={() => window.print()} disabled={!preview || previewLoading}>
          <Printer className="h-4 w-4 mr-1.5" />
          Print {totalLabels > 0 ? `${totalLabels} labels` : ""}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ── Builder ── */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-0.5">
          {/* Template picker */}
          <section className="space-y-2">
            <Label className="text-xs">Label template</Label>
            {templatesLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className={cn(
                      "rounded-sm border px-2 py-2 text-left transition-colors",
                      t.id === templateId
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/60 hover:bg-secondary/50"
                    )}
                  >
                    <p className="text-xs font-semibold">{t.id}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.widthMm}×{t.heightMm}mm
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.cols}×{t.rows} · {t.perSheet}/sheet
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Medicine search */}
          <section className="space-y-2">
            <Label htmlFor="label-med-search" className="text-xs">
              Medicine
            </Label>
            {selectedMedicine ? (
              <div className="flex items-center justify-between gap-2 rounded-sm border border-primary/40 bg-primary/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedMedicine.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {selectedMedicine.brand ?? selectedMedicine.genericName ?? ""}
                    {selectedMedicine.barcode ? ` · ${selectedMedicine.barcode}` : ""}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title="Change medicine" onClick={clearMedicine}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="label-med-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, brand or barcode…"
                  className="h-9 pl-8"
                  autoFocus
                />
                {searching && (
                  <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
                {results.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-sm border border-border bg-popover shadow-md">
                    {results.map((med) => (
                      <li key={med.id}>
                        <button
                          type="button"
                          onClick={() => pickMedicine(med)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-secondary/60"
                        >
                          <span className="truncate">{med.name}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {med.brand ?? ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* Batch + quantity */}
          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Batch (optional)</Label>
              <Select value={batchId} onValueChange={setBatchId} disabled={!selectedMedicine || batchesLoading}>
                <SelectTrigger className="h-9">
                  <SelectValue
                    placeholder={batchesLoading ? "Loading batches…" : "No batch"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BATCH}>No batch</SelectItem>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batchNo} · exp {b.expiryDate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="label-qty" className="text-xs">
                Labels (1–{MAX_QTY})
              </Label>
              <Input
                id="label-qty"
                type="number"
                min={1}
                max={MAX_QTY}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="h-9"
              />
            </div>
          </section>

          <Button onClick={addToSheet} disabled={!selectedMedicine || adding} className="w-full">
            <Plus className="h-4 w-4 mr-1.5" /> Add to sheet
          </Button>

          {/* Item list */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">On the sheet</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {totalLabels} label{totalLabels !== 1 ? "s" : ""}
                {template ? ` · ${totalSheets} sheet${totalSheets !== 1 ? "s" : ""}` : ""}
              </span>
            </div>
            {items.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No labels queued"
                description="Search a medicine, optionally pick a batch, and add labels to the sheet."
              />
            ) : (
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center justify-between gap-2 rounded-sm border border-border/60 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.medicineName}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {item.batchNo ? `Batch ${item.batchNo} · ` : ""}×{item.quantity}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      title="Remove"
                      onClick={() => removeItem(item.key)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Preview ── */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-sm border border-border/60 bg-secondary/20">
          <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-2">
            <p className="text-xs font-medium text-muted-foreground">
              Preview{template ? ` — ${template.id} (${template.widthMm}×${template.heightMm}mm)` : ""}
            </p>
            {previewLoading && (
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Building…
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {previewError ? (
              <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {previewError}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Printer}
                title="Nothing to print yet"
                description="Add medicines to the sheet — the live preview renders labels at true millimetre sizes."
              />
            ) : preview ? (
              <LabelSheet template={preview.template} labels={preview.labels} />
            ) : (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
