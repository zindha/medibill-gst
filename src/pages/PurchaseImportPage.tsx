import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { useAuth } from "@/hooks/use-auth";
import {
  PURCHASE_IMPORT_FIELDS,
  filesApi,
  purchaseImportsApi,
  type OcrConfidenceField,
  type PurchaseImportRow,
  type PurchaseImportSession,
} from "@/lib/api";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Plus,
  ScanLine,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const GST_RATES = ["0", "5", "12", "18", "28"];
const ROWS_PER_PAGE = 50;

const FIELD_LABELS: Record<string, string> = {
  bill_no: "Bill number",
  bill_date: "Bill date",
  supplier: "Supplier",
  product: "Product",
  barcode: "Barcode",
  batch: "Batch",
  expiry: "Expiry",
  quantity: "Quantity",
  free_quantity: "Free qty",
  mrp: "MRP",
  purchase_rate: "Purchase rate",
  gst_rate: "GST rate",
  discount: "Discount",
};

interface RowDraft {
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  mrp: number;
  purchasePrice: number;
  sellingPrice: number;
  gstRate: string;
}

interface SupplierOption {
  id: string;
  name: string;
}

function draftFromRow(row: PurchaseImportRow): RowDraft {
  const n = row.normalized;
  const mrp = n?.mrp ?? 0;
  return {
    medicineId: row.medicineId ?? "",
    batchNo: n?.batch ?? "",
    expiryDate: n?.expiryDate ?? "",
    quantity: n?.quantity ?? 1,
    freeQuantity: n?.freeQuantity ?? 0,
    mrp,
    purchasePrice: n?.purchaseRate ?? 0,
    sellingPrice: mrp,
    gstRate: n?.gstRate ?? "12",
  };
}

/** Does the user's row edit resolve this stored error? Mirrors the server rule. */
function isIssueFixed(field: string, draft: RowDraft | undefined): boolean {
  if (!draft) return false;
  switch (field) {
    case "product":
      return !!draft.medicineId;
    case "quantity":
      return Number.isInteger(Number(draft.quantity)) && Number(draft.quantity) > 0;
    case "expiry":
      return /^\d{4}-\d{2}-\d{2}$/.test(draft.expiryDate);
    case "free_quantity":
      return Number.isInteger(Number(draft.freeQuantity)) && Number(draft.freeQuantity) >= 0;
    case "mrp":
      return Number(draft.mrp) >= 0 && !Number.isNaN(Number(draft.mrp));
    case "purchase_rate":
      return Number(draft.purchasePrice) >= 0 && !Number.isNaN(Number(draft.purchasePrice));
    default:
      return false;
  }
}

function mergeDrafts(
  previous: Record<number, RowDraft>,
  session: PurchaseImportSession,
  touched: Record<string, boolean>
): Record<number, RowDraft> {
  const next: Record<number, RowDraft> = {};
  for (const row of session.rows) {
    const base = draftFromRow(row);
    const old = previous[row.rowIndex];
    if (old) {
      for (const key of Object.keys(base) as (keyof RowDraft)[]) {
        if (touched[`${row.rowIndex}:${key}`]) {
          base[key] = old[key] as never;
        }
      }
    }
    next[row.rowIndex] = base;
  }
  return next;
}

export default function PurchaseImportPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<PurchaseImportSession | null>(null);
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0]);
  const [supplierId, setSupplierId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [page, setPage] = useState(1);
  const [medicineNames, setMedicineNames] = useState<Record<string, string>>({});
  const [activePicker, setActivePicker] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<any[]>([]);
  const [searchingMed, setSearchingMed] = useState(false);
  // Source toggle for new imports: CSV upload vs image scan (OCR).
  const [sourceTab, setSourceTab] = useState<"csv" | "ocr">("csv");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrStage, setOcrStage] = useState("");
  // Side-by-side source image preview (OCR sessions only).
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrFileInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppliersRef = useRef<SupplierOption[]>([]);

  useEffect(() => {
    suppliersRef.current = suppliers;
  }, [suppliers]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const { suppliersApi, medicinesApi } = await import("@/lib/api");
        const [supps, medList] = await Promise.all([
          suppliersApi.list({ limit: 100 }),
          medicinesApi.list({ limit: 100 }),
        ]);
        if (cancelled) return;
        const supList: any[] = Array.isArray(supps) ? supps : (supps as any)?.data ?? [];
        setSuppliers(
          supList.map((s: any) => ({ id: s.id, name: s.name }))
        );
        const medListArr: any[] = Array.isArray(medList) ? medList : (medList as any)?.data ?? [];
        const names: Record<string, string> = {};
        for (const m of medListArr) names[m.id] = m.name;
        setMedicineNames(names);
      } catch {
        // Non-fatal: pickers simply start empty and fill from search.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const blockingErrors = useMemo(() => {
    if (!session) return 0;
    let count = 0;
    for (const row of session.rows) {
      const draft = drafts[row.rowIndex];
      for (const issue of row.issues) {
        if (issue.severity === "error" && !isIssueFixed(issue.field, draft)) count++;
      }
    }
    return count;
  }, [session, drafts]);

  const totalPages = session ? Math.max(1, Math.ceil(session.rows.length / ROWS_PER_PAGE)) : 1;
  const visibleRows = session
    ? session.rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)
    : [];

  const loadSession = useCallback((s: PurchaseImportSession) => {
    setSession(s);
    setDrafts(
      Object.fromEntries(s.rows.map((r) => [r.rowIndex, draftFromRow(r)])) as Record<
        number,
        RowDraft
      >
    );
    setTouched({});
    setPage(1);
    setActivePicker(null);
    setPreviewOpen(false);
    setPreviewUrl(null);

    // OCR header fields take precedence over per-row values; CSV sessions fall
    // back to the bill_no / bill_date / supplier columns as before.
    const header = s.headerFields;
    const firstWithBillNo = s.rows.find((r) => r.normalized?.billNo);
    const firstWithDate = s.rows.find((r) => r.normalized?.billDate);
    const headerDate = header?.billDate?.value;
    setBillNo(header?.billNo?.value ?? firstWithBillNo?.normalized?.billNo ?? "");
    setSupplierId("");
    setBillDate(
      headerDate && /^\d{4}-\d{2}-\d{2}$/.test(headerDate)
        ? headerDate
        : (firstWithDate?.normalized?.billDate ?? new Date().toISOString().split("T")[0])
    );
    if (s.defaults.supplierId) setSupplierId(s.defaults.supplierId);
    else {
      const supplierName =
        header?.supplierName?.value ??
        s.rows.find((r) => r.normalized?.supplier)?.normalized?.supplier;
      if (supplierName) {
        const match = suppliersRef.current.find(
          (x) => x.name.toLowerCase() === supplierName.toLowerCase()
        );
        if (match) setSupplierId(match.id);
      }
    }

    const names: Record<string, string> = {};
    for (const r of s.rows) {
      if (r.medicineId && r.normalized?.product) names[r.medicineId] = r.normalized.product;
    }
    setMedicineNames((prev) => ({ ...names, ...prev }));
  }, []);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const csv = await file.text();
        const created = await purchaseImportsApi.create({ filename: file.name, csv });
        loadSession(created);
        toast.success(`Loaded ${created.rows.length} rows from ${file.name}`);
      } catch (err: any) {
        toast.error(err?.message ?? "Failed to read CSV");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [loadSession]
  );

  const handleImageFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        toast.error("Convert PDF to image first");
        return;
      }
      if (file.type && !file.type.startsWith("image/")) {
        toast.error("Choose an image file (JPG or PNG)");
        return;
      }

      setOcrBusy(true);
      try {
        setOcrStage("Uploading invoice image…");
        const dataUrl = await readFileAsDataUrl(file);
        const stored = await filesApi.upload({
          filename: file.name,
          contentType: file.type || "image/png",
          data: dataUrl,
        });
        if (stored.duplicate) {
          toast.warning("This invoice image was already imported");
        }

        setOcrStage("Reading invoice text (OCR)…");
        const Tesseract = await import("tesseract.js");
        const {
          data: { text },
        } = await Tesseract.recognize(file, "eng");
        if (!text || text.trim().length < 10) {
          toast.error("Could not read any text from the image — try a clearer photo");
          return;
        }

        setOcrStage("Building review session…");
        const created = await purchaseImportsApi.ocr({
          filename: file.name,
          text,
          fileId: stored.id,
        });
        loadSession(created);
        toast.success(`Loaded ${created.rows.length} rows from ${file.name}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to scan the invoice");
      } finally {
        setOcrStage("");
        setOcrBusy(false);
      }
    },
    [loadSession]
  );

  // Fetch the stored source image the first time the preview panel opens.
  useEffect(() => {
    if (!previewOpen || !session?.fileId || previewUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const file = await filesApi.get(session.fileId!);
        const binary = atob(file.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
        if (cancelled) {
          URL.revokeObjectURL(url);
        } else {
          setPreviewUrl(url);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Could not load the source image");
          setPreviewOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewOpen, session?.fileId, previewUrl]);

  // Release the blob URL whenever a new one replaces it or the page unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleMappingChange = useCallback(
    async (column: string, field: string) => {
      if (!session) return;
      const nextMappings = { ...session.mappings, [column]: field };
      setApplying(true);
      try {
        const updated = await purchaseImportsApi.updateMappings(session.importId, {
          mappings: nextMappings,
          defaults: session.defaults,
        });
        setSession(updated);
        setDrafts((prev) => mergeDrafts(prev, updated, touched));
        if (updated.errors > 0) {
          toast.warning(`${updated.errors} row issue(s) after remapping`);
        }
      } catch (err: any) {
        toast.error(err?.message ?? "Failed to apply mappings");
      } finally {
        setApplying(false);
      }
    },
    [session, touched]
  );

  const updateDraft = useCallback(
    (rowIndex: number, field: keyof RowDraft, value: string | number) => {
      setTouched((prev) => ({ ...prev, [`${rowIndex}:${field}`]: true }));
      setDrafts((prev) => {
        const current = prev[rowIndex] ?? {
          medicineId: "",
          batchNo: "",
          expiryDate: "",
          quantity: 1,
          freeQuantity: 0,
          mrp: 0,
          purchasePrice: 0,
          sellingPrice: 0,
          gstRate: "12",
        };
        return { ...prev, [rowIndex]: { ...current, [field]: value } };
      });
    },
    []
  );

  const openMedicinePicker = useCallback((rowIndex: number) => {
    setActivePicker(rowIndex);
    setPickerQuery("");
    setPickerResults([]);
  }, []);

  const searchMedicines = useCallback(async (query: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const q = query.trim();
      if (!q) {
        setPickerResults([]);
        return;
      }
      setSearchingMed(true);
      try {
        const { medicinesApi } = await import("@/lib/api");
        const res = await medicinesApi.list({ search: q, limit: 8 });
        const list: any[] = Array.isArray(res) ? res : (res as any)?.data ?? [];
        setPickerResults(list);
        setMedicineNames((prev) => {
          const next = { ...prev };
          for (const m of list) next[m.id] = m.name;
          return next;
        });
      } catch {
        setPickerResults([]);
      } finally {
        setSearchingMed(false);
      }
    }, 200);
  }, []);

  const assignMedicine = useCallback(
    (rowIndex: number, medicineId: string, name: string) => {
      setMedicineNames((prev) => ({ ...prev, [medicineId]: name }));
      updateDraft(rowIndex, "medicineId", medicineId);
      setActivePicker(null);
      setPickerQuery("");
    },
    [updateDraft]
  );

  const handleDiscard = useCallback(async () => {
    if (!session) return;
    try {
      await purchaseImportsApi.remove(session.importId);
      setSession(null);
      setDrafts({});
      setTouched({});
      setBillNo("");
      setSupplierId("");
      setPreviewOpen(false);
      setPreviewUrl(null);
      toast.success("Import discarded");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to discard import");
    }
  }, [session]);

  const handleCommit = useCallback(async () => {
    if (!session) return;
    if (!billNo.trim()) {
      toast.error("Bill number is required");
      return;
    }
    if (blockingErrors > 0) {
      toast.error(`Fix ${blockingErrors} blocking row issue(s) before committing`);
      return;
    }

    const commitRows = [];
    for (const row of session.rows) {
      const d = drafts[row.rowIndex];
      if (!d.medicineId) {
        toast.error(`Row ${row.rowIndex + 1}: select a medicine`);
        return;
      }
      if (!d.batchNo.trim()) {
        toast.error(`Row ${row.rowIndex + 1}: batch number is required`);
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.expiryDate)) {
        toast.error(`Row ${row.rowIndex + 1}: expiry must be a valid date`);
        return;
      }
      const quantity = Number(d.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        toast.error(`Row ${row.rowIndex + 1}: quantity must be a whole number > 0`);
        return;
      }
      commitRows.push({
        rowIndex: row.rowIndex,
        medicineId: d.medicineId,
        batchNo: d.batchNo.trim(),
        expiryDate: d.expiryDate,
        quantity,
        freeQuantity: Number(d.freeQuantity) || 0,
        mrp: Number(d.mrp) >= 0 ? Number(d.mrp) : undefined,
        purchasePrice: Number(d.purchasePrice),
        sellingPrice: Number(d.sellingPrice) >= 0 ? Number(d.sellingPrice) : undefined,
        gstRate: d.gstRate,
      });
    }

    setCommitting(true);
    try {
      const bill = await purchaseImportsApi.commit(session.importId, {
        billNo: billNo.trim(),
        billDate,
        supplierId: supplierId || undefined,
        rows: commitRows,
      });
      toast.success(`Purchase bill ${bill.billNo} created — stock updated`);
      navigate("/dashboard/purchases");
    } catch (err: any) {
      const details = err?.details?.rows;
      if (Array.isArray(details) && details.length > 0) {
        const first = details[0];
        toast.error(`Row ${(first.rowIndex ?? 0) + 1}: ${first.message ?? err.message}`);
      } else {
        toast.error(err?.message ?? "Commit failed");
      }
    } finally {
      setCommitting(false);
    }
  }, [session, drafts, billNo, billDate, supplierId, blockingErrors, navigate]);

  if (authLoading) return null;

  const statusBadge = (row: PurchaseImportRow) => {
    switch (row.status) {
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      case "mapped":
        return (
          <Badge variant="outline" className="text-green-700 border-green-300">
            <CheckCircle2 className="h-3 w-3" /> Mapped
          </Badge>
        );
      case "committed":
        return <Badge>Committed</Badge>;
      default:
        return <Badge variant="secondary">Review</Badge>;
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Purchase Import</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload a supplier CSV or scan a bill image, review the rows, then post one purchase bill
          </p>
        </div>
        {session && (
          <div className="flex items-center gap-2">
            {session.source === "ocr" && session.fileId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (previewOpen) {
                    setPreviewOpen(false);
                    setPreviewUrl(null);
                  } else {
                    setPreviewOpen(true);
                  }
                }}
              >
                <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                {previewOpen ? "Hide source" : "Source image"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setSession(null)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New import
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleDiscard()}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Discard draft
            </Button>
          </div>
        )}
      </div>

      {!session ? (
        <Card className="p-6 border-border/60">
          <div className="flex items-center gap-2 mb-5">
            <button
              type="button"
              onClick={() => setSourceTab("csv")}
              className={`h-8 px-3 rounded-md text-sm border transition-colors ${
                sourceTab === "csv"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              CSV file
            </button>
            <button
              type="button"
              onClick={() => setSourceTab("ocr")}
              className={`h-8 px-3 rounded-md text-sm border transition-colors ${
                sourceTab === "ocr"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Scan invoice (image)
            </button>
          </div>
          {sourceTab === "csv" ? (
            <UploadPlaceholder onFile={handleFile} uploading={uploading} inputRef={fileInputRef} />
          ) : (
            <ScanUploadPlaceholder
              onFile={handleImageFile}
              busy={ocrBusy}
              stage={ocrStage}
              inputRef={ocrFileInputRef}
            />
          )}
        </Card>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 space-y-5">
          {/* Bill header */}
          <Card className="p-5 border-border/60">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Bill number *
                  <ConfidenceBadge field={session.headerFields?.billNo} />
                </label>
                <Input
                  value={billNo}
                  onChange={(e) => setBillNo(e.target.value)}
                  placeholder="Supplier bill no"
                  className="w-44 h-9"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Bill date
                  <ConfidenceBadge field={session.headerFields?.billDate} />
                </label>
                <Input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="w-40 h-9"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Supplier
                  <ConfidenceBadge field={session.headerFields?.supplierName} />
                </label>
                <Select value={supplierId || "none"} onValueChange={(v) => setSupplierId(v === "none" ? "" : v)}>
                  <SelectTrigger className="w-52 h-9">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No supplier</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground">{session.filename}</span>
                <Badge variant="secondary">{session.rows.length} rows</Badge>
                {session.errors > 0 ? (
                  <Badge variant="destructive">
                    <AlertTriangle className="h-3 w-3" /> {session.errors} errors
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-green-700 border-green-300">
                    <CheckCircle2 className="h-3 w-3" /> 0 errors
                  </Badge>
                )}
                {session.warnings > 0 && (
                  <Badge variant="outline" className="text-amber-700 border-amber-300">
                    <AlertTriangle className="h-3 w-3" /> {session.warnings} warnings
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Column mapping */}
          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
                Column mapping
              </h3>
              {applying && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Re-validating rows…
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {session.columns.map((col) => (
                <div key={col} className="flex items-center gap-2 border border-border/40 rounded-sm px-2 py-1.5">
                  <span className="text-sm truncate flex-1" title={col}>
                    {col}
                  </span>
                  <Select
                    value={session.mappings[col] ?? ""}
                    onValueChange={(v) => void handleMappingChange(col, v)}
                    disabled={applying}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Not mapped</SelectItem>
                      {PURCHASE_IMPORT_FIELDS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {FIELD_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </Card>

          {/* Rows */}
          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Rows</h3>
              {totalPages > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <span className="text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Free</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-center">GST</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => {
                  const d = drafts[row.rowIndex] ?? draftFromRow(row);
                  const errors = row.issues.filter((i) => i.severity === "error");
                  const warnings = row.issues.filter((i) => i.severity === "warning");
                  return (
                    <TableRow
                      key={row.id}
                      className={errors.length > 0 ? "bg-destructive/5" : undefined}
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {row.rowIndex + 1}
                      </TableCell>
                      <TableCell className="text-sm max-w-40 truncate" title={row.normalized?.product}>
                        {row.normalized?.product ?? "—"}
                      </TableCell>
                      <TableCell className="min-w-44 relative">
                        {d.medicineId ? (
                          <div className="flex items-center gap-1">
                            <span className="text-sm truncate max-w-36" title={medicineNames[d.medicineId]}>
                              {medicineNames[d.medicineId] ?? row.normalized?.product ?? "Selected"}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => updateDraft(row.rowIndex, "medicineId", "")}
                              title="Clear medicine"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1">
                              <Input
                                value={activePicker === row.rowIndex ? pickerQuery : ""}
                                onChange={(e) => {
                                  setPickerQuery(e.target.value);
                                  void searchMedicines(e.target.value);
                                }}
                                onFocus={() => openMedicinePicker(row.rowIndex)}
                                placeholder="Search medicine…"
                                className="h-8 text-sm"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => openMedicinePicker(row.rowIndex)}
                                title="Search medicine"
                              >
                                <Search className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {activePicker === row.rowIndex && (
                              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-52 overflow-y-auto">
                                {searchingMed && (
                                  <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                                  </div>
                                )}
                                {!searchingMed && pickerResults.length === 0 && (
                                  <div className="px-3 py-2 text-xs text-muted-foreground">
                                    Type to search your catalog
                                  </div>
                                )}
                                {pickerResults.map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                                    onClick={() => assignMedicine(row.rowIndex, m.id, m.name)}
                                  >
                                    {m.name}
                                    {m.brand ? <span className="text-muted-foreground"> · {m.brand}</span> : null}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={d.batchNo}
                          onChange={(e) => updateDraft(row.rowIndex, "batchNo", e.target.value)}
                          placeholder="Batch"
                          className="h-8 text-sm w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={d.expiryDate}
                          onChange={(e) => updateDraft(row.rowIndex, "expiryDate", e.target.value)}
                          className="h-8 text-xs w-36"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={1}
                          value={d.quantity}
                          onChange={(e) => updateDraft(row.rowIndex, "quantity", Number(e.target.value))}
                          className="h-8 text-sm text-right w-16"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={d.freeQuantity}
                          onChange={(e) => updateDraft(row.rowIndex, "freeQuantity", Number(e.target.value))}
                          className="h-8 text-sm text-right w-14"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={d.purchasePrice}
                          onChange={(e) => updateDraft(row.rowIndex, "purchasePrice", Number(e.target.value))}
                          className="h-8 text-sm text-right w-20"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={d.mrp}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            updateDraft(row.rowIndex, "mrp", value);
                            if (!touched[`${row.rowIndex}:sellingPrice`]) {
                              updateDraft(row.rowIndex, "sellingPrice", value);
                            }
                          }}
                          className="h-8 text-sm text-right w-20"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Select
                          value={d.gstRate}
                          onValueChange={(v) => updateDraft(row.rowIndex, "gstRate", v)}
                        >
                          <SelectTrigger className="h-8 w-16 text-sm mx-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GST_RATES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <div className="space-y-1">
                          {statusBadge(row)}
                          {row.issues.map((issue, idx) => (
                            <p
                              key={idx}
                              className={`text-xs leading-snug ${
                                issue.severity === "error" ? "text-destructive" : "text-amber-700"
                              }`}
                            >
                              {issue.message}
                            </p>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {visibleRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                      No rows
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Commit bar */}
          <Card className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {blockingErrors > 0 ? (
                <span className="text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  {blockingErrors} blocking issue{blockingErrors === 1 ? "" : "s"} must be fixed before posting
                </span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  All rows ready — posting creates the bill, batches and stock in one transaction
                </span>
              )}
            </div>
            <Button onClick={() => void handleCommit()} disabled={committing || applying || blockingErrors > 0 || !billNo.trim()}>
              {committing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Post purchase bill
            </Button>
          </Card>
          </div>

          {/* Side-by-side source preview (OCR sessions only) */}
          {session.source === "ocr" && session.fileId && previewOpen && (
            <aside className="w-full lg:w-80 shrink-0 lg:sticky lg:top-4">
              <Card className="p-3 border-border/60">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
                    Source image
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setPreviewOpen(false);
                      setPreviewUrl(null);
                    }}
                    title="Close preview"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {!previewUrl ? (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading source image…
                  </div>
                ) : (
                  <img
                    src={previewUrl}
                    alt="Invoice source"
                    className="w-full rounded-sm border border-border/60 object-contain max-h-[70vh]"
                  />
                )}
              </Card>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function UploadPlaceholder({
  onFile,
  uploading,
  inputRef,
}: {
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-4">
      <div className="w-full max-w-md mx-auto border-2 dashed border-border rounded-sm p-12 text-center">
        <FileUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-1">
          Upload a supplier purchase CSV
        </p>
        <p className="text-xs text-muted-foreground/60">
          Headers are auto-detected — you can remap every column before posting
        </p>
      </div>
      <div className="flex items-center gap-3 justify-center">
        <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Choose CSV file
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the selected file"));
    reader.readAsDataURL(file);
  });
}

/** Green ≥ 0.8, amber ≥ 0.5, red below — shown next to OCR header inputs. */
function ConfidenceBadge({ field }: { field?: OcrConfidenceField }) {
  if (!field || typeof field.confidence !== "number") return null;
  const pct = Math.round(field.confidence * 100);
  const tone =
    field.confidence >= 0.8
      ? "text-green-700 border-green-300 bg-green-50"
      : field.confidence >= 0.5
        ? "text-amber-700 border-amber-300 bg-amber-50"
        : "text-red-700 border-red-300 bg-red-50";
  return (
    <Badge
      variant="outline"
      className={`ml-1.5 text-[10px] font-medium ${tone}`}
      title={`OCR confidence ${pct}%`}
    >
      {pct}%
    </Badge>
  );
}

function ScanUploadPlaceholder({
  onFile,
  busy,
  stage,
  inputRef,
}: {
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  busy: boolean;
  stage: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-4">
      <div className="w-full max-w-md mx-auto border-2 dashed border-border rounded-sm p-12 text-center">
        <ScanLine className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-1">
          Photograph or upload a supplier bill image
        </p>
        <p className="text-xs text-muted-foreground/60">
          OCR runs in your browser, then the rows land in the same review grid as a CSV
        </p>
      </div>
      <div className="flex items-center gap-3 justify-center">
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ScanLine className="h-4 w-4 mr-2" />
          )}
          {busy ? "Working…" : "Choose bill image"}
        </Button>
      </div>
      {busy && (
        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {stage || "Processing…"}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}
