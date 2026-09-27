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
  DATA_IMPORT_ENTITY_TYPES,
  DATA_IMPORT_FIELDS,
  dataMigrationsApi,
  type DataImportEntityType,
  type DataImportPreview,
  type DataImportRow,
  type DataImportSession,
} from "@/lib/api";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileInput,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const ROWS_PER_PAGE = 50;

const ENTITY_LABELS: Record<DataImportEntityType, string> = {
  customers: "Customers",
  suppliers: "Suppliers",
  medicines: "Medicines",
  stock: "Opening Stock",
};

const ENTITY_HINTS: Record<DataImportEntityType, string> = {
  customers:
    "Creates customers. Existing customers with the same name or phone are skipped (never updated). Opening balance is copied to the running balance.",
  suppliers:
    "Creates suppliers with payment terms, credit limit and opening balance. Existing suppliers with the same name or phone are skipped.",
  medicines:
    "Creates medicine master records. A non-standard GST rate falls back to 12% with a warning. Existing name + brand matches are skipped.",
  stock:
    "Adds opening stock batches for medicines that already exist in your catalog. Expiry accepts 12/27, 02/2027, 27/12/2027 or 2027-12-31. Blank prices fall back to the medicine's own prices.",
};

/** Sample row shown in the downloadable template — aligned to DATA_IMPORT_FIELDS. */
const TEMPLATE_SAMPLE: Record<DataImportEntityType, string[]> = {
  customers: ["Ramesh Kumar", "9876543210", "ramesh@example.com", "12 MG Road, Delhi", "", "0", "250"],
  suppliers: [
    "Acme Distributors",
    "9812345678",
    "orders@acme.in",
    "",
    "27AAAAA1111A1Z1",
    "Net 30",
    "50000",
    "0",
  ],
  medicines: [
    "Dolo 650",
    "Paracetamol",
    "Micro Labs",
    "Analgesic",
    "Paracetamol 650mg",
    "3004",
    "12",
    "",
    "Tablet",
    "650mg",
    "Strip",
    "15",
    "15",
    "",
    "R1",
    "10",
    "20",
    "8",
    "12",
    "20",
  ],
  stock: ["Dolo 650", "B-100", "12/27", "10", "30", "20", "25"],
};

interface RecentImport {
  id: string;
  entityType: DataImportEntityType;
  filename: string;
  status: "draft" | "committed" | "rolled_back";
  counts: { total: number; ok: number; error: number; skipped: number; committed: number };
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadTemplate(entityType: DataImportEntityType): void {
  const fields = DATA_IMPORT_FIELDS[entityType];
  const sample = TEMPLATE_SAMPLE[entityType];
  const csv = [fields.join(","), sample.map(csvEscape).join(",")].join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${entityType}-template.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Export every error/skipped row with its issues so they can be fixed offline. */
function downloadProblemRows(session: DataImportSession): void {
  const problemRows = session.rows.filter(
    (r) => r.status === "error" || r.status === "skipped"
  );
  if (problemRows.length === 0) return;
  const header = ["row", "status", "issues", ...session.columns];
  const lines = [header.map(csvEscape).join(",")];
  for (const row of problemRows) {
    const cells = [
      String(row.rowIndex + 1),
      row.status,
      row.issues.map((i) => `${i.severity}: ${i.message}`).join("; "),
      ...session.columns.map((col) => row.raw[col] ?? ""),
    ];
    lines.push(cells.map(csvEscape).join(","));
  }
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${session.filename.replace(/\.csv$/i, "")}-problems.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function rowSummary(entityType: DataImportEntityType, row: DataImportRow): string {
  const n = row.normalized ?? {};
  if (entityType === "stock") {
    return `${n.medicineName ?? "—"} · ${n.batchNo ?? "—"} · ${n.expiryDate ?? "—"} · qty ${n.quantity ?? "—"}`;
  }
  const bits = [n.name];
  if (entityType === "customers" || entityType === "suppliers") {
    if (n.phone) bits.push(String(n.phone));
    if (n.openingBalance) bits.push(`bal ${n.openingBalance}`);
  } else if (n.brand) {
    bits.push(String(n.brand));
  }
  return bits.filter(Boolean).join(" · ") || Object.values(row.raw).join(" · ") || "—";
}

function statusBadge(row: DataImportRow) {
  switch (row.status) {
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    case "skipped":
      return (
        <Badge variant="outline" className="text-amber-700 border-amber-300">
          Skipped
        </Badge>
      );
    case "ok":
      return (
        <Badge variant="outline" className="text-green-700 border-green-300">
          <CheckCircle2 className="h-3 w-3" /> Ready
        </Badge>
      );
    case "committed":
      return <Badge>Committed</Badge>;
    case "rolled_back":
      return <Badge variant="secondary">Rolled back</Badge>;
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

export default function MigrationPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [entityType, setEntityType] = useState<DataImportEntityType>("customers");
  const [session, setSession] = useState<DataImportSession | null>(null);
  const [preview, setPreview] = useState<DataImportPreview | null>(null);
  const [recent, setRecent] = useState<RecentImport[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [page, setPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      setRecent(await dataMigrationsApi.list());
    } catch {
      setRecent([]);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadRecent();
  }, [isAuthenticated, loadRecent]);

  const loadSession = useCallback((s: DataImportSession) => {
    setSession(s);
    setPreview(null);
    setPage(1);
  }, []);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const csv = await file.text();
        const created = await dataMigrationsApi.create({
          entityType,
          filename: file.name,
          csv,
        });
        loadSession(created);
        toast.success(`Loaded ${created.rows.length} rows from ${file.name}`);
      } catch (err: any) {
        toast.error(err?.message ?? "Failed to read CSV");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [entityType, loadSession]
  );

  const handlePreview = useCallback(async () => {
    if (!session) return;
    setPreviewing(true);
    try {
      const result = await dataMigrationsApi.preview(session.importId);
      setPreview(result);
      toast.message(
        `${result.wouldCreate} will be created · ${result.wouldSkip} skipped · ${result.errors} errors`
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }, [session]);

  const handleCommit = useCallback(async () => {
    if (!session) return;
    if (session.errors > 0) {
      toast.error(`Fix ${session.errors} blocking row issue(s) before committing`);
      return;
    }
    setCommitting(true);
    try {
      const result = await dataMigrationsApi.commit(session.importId);
      toast.success(
        `Import committed — ${result.created} created, ${result.skipped} skipped`
      );
      const refreshed = await dataMigrationsApi.get(session.importId);
      loadSession(refreshed);
      void loadRecent();
    } catch (err: any) {
      const rows = err?.details?.rows;
      if (Array.isArray(rows) && rows.length > 0) {
        toast.error(`Row ${(rows[0].rowIndex ?? 0) + 1}: ${rows[0].message ?? err.message}`);
      } else {
        toast.error(err?.message ?? "Commit failed");
      }
    } finally {
      setCommitting(false);
    }
  }, [session, loadSession, loadRecent]);

  const handleRollback = useCallback(async () => {
    if (!session) return;
    setRollingBack(true);
    try {
      const result = await dataMigrationsApi.rollback(session.importId);
      toast.success(`Rollback complete — ${result.deleted} record(s) removed`);
      const refreshed = await dataMigrationsApi.get(session.importId);
      loadSession(refreshed);
      void loadRecent();
    } catch (err: any) {
      const skipped = err?.details?.skipped;
      if (Array.isArray(skipped) && skipped.length > 0) {
        toast.error(`${err.message} — first: row ${(skipped[0].rowIndex ?? 0) + 1} (${skipped[0].reason})`);
      } else {
        toast.error(err?.message ?? "Rollback failed");
      }
    } finally {
      setRollingBack(false);
      setRollbackOpen(false);
    }
  }, [session, loadSession, loadRecent]);

  const handleDiscard = useCallback(async () => {
    if (!session) return;
    try {
      await dataMigrationsApi.remove(session.importId);
      setSession(null);
      setPreview(null);
      toast.success("Import discarded");
      void loadRecent();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to discard import");
    }
  }, [session, loadRecent]);

  const openRecent = useCallback(async (id: string) => {
    try {
      loadSession(await dataMigrationsApi.get(id));
    } catch (err: any) {
      toast.error(err?.message ?? "Could not open import");
    }
  }, [loadSession]);

  const totalPages = session ? Math.max(1, Math.ceil(session.rows.length / ROWS_PER_PAGE)) : 1;
  const visibleRows = session
    ? session.rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)
    : [];

  const counts = useMemo(() => session?.counts ?? null, [session]);

  if (authLoading) return null;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Data Migration</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Import customers, suppliers, medicines or opening stock from a CSV — review every row,
            preview, then commit atomically
          </p>
        </div>
        {session && (
          <div className="flex items-center gap-2">
            {session.status === "committed" && (
              <Button variant="outline" size="sm" onClick={() => setRollbackOpen(true)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Roll back
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setSession(null)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New import
            </Button>
            {session.status === "draft" && (
              <Button variant="ghost" size="sm" onClick={() => void handleDiscard()}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Discard draft
              </Button>
            )}
          </div>
        )}
      </div>

      {!session ? (
        <div className="space-y-5">
          <Card className="p-6 border-border/60">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
              What are you importing?
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
              {DATA_IMPORT_ENTITY_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEntityType(type)}
                  className={`h-16 rounded-md border text-sm font-medium transition-colors ${
                    entityType === type
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {ENTITY_LABELS[type]}
                </button>
              ))}
            </div>

            <div className="rounded-md border border-border/50 bg-secondary/40 p-3 mb-5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {ENTITY_HINTS[entityType]}
              </p>
              <p className="text-xs mt-2">
                <span className="text-muted-foreground">Columns: </span>
                <span className="font-mono">{DATA_IMPORT_FIELDS[entityType].join(", ")}</span>
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Header names are matched by aliases (e.g. “product” → name, “qty” → quantity,
                “exp” → expiry) — unknown columns are ignored.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Choose CSV file
              </Button>
              <Button variant="outline" onClick={() => downloadTemplate(entityType)}>
                <Download className="h-4 w-4 mr-2" />
                Download {ENTITY_LABELS[entityType]} template
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => void handleFile(e)}
              />
            </div>
          </Card>

          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
                Recent imports
              </h3>
              {recentLoading && (
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </span>
              )}
            </div>
            {recent.length === 0 && !recentLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No imports yet — upload a CSV above to start
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">{item.filename}</TableCell>
                      <TableCell className="text-sm">{ENTITY_LABELS[item.entityType]}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "committed"
                              ? "default"
                              : item.status === "rolled_back"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {item.counts.total}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => void openRecent(item.id)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Session header + counts */}
          <Card className="p-5 border-border/60">
            <div className="flex flex-wrap items-center gap-3">
              <FileInput className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{session.filename}</span>
              <Badge variant={session.status === "draft" ? "outline" : "default"}>
                {session.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {ENTITY_LABELS[session.entityType]}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Badge variant="outline" className="text-green-700 border-green-300">
                  {counts?.ok ?? 0} ready
                </Badge>
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  {counts?.skipped ?? 0} skipped
                </Badge>
                {(counts?.error ?? 0) > 0 ? (
                  <Badge variant="destructive">
                    <AlertTriangle className="h-3 w-3" /> {counts?.error} errors
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-green-700 border-green-300">
                    <CheckCircle2 className="h-3 w-3" /> 0 errors
                  </Badge>
                )}
                <Badge variant="secondary">{counts?.total ?? 0} rows</Badge>
              </div>
            </div>
            {session.warnings > 0 && (
              <p className="text-xs text-amber-700 mt-2">
                {session.warnings} warning(s) — review them below; warnings never block a commit.
              </p>
            )}
          </Card>

          {/* Preview result */}
          {preview && (
            <Card className="p-4 border-border/60">
              <div className="flex items-center gap-2 text-sm">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span>
                  Preview: <strong>{preview.wouldCreate}</strong> will be created,{" "}
                  <strong>{preview.wouldSkip}</strong> skipped,{" "}
                  <strong className={preview.errors > 0 ? "text-destructive" : ""}>
                    {preview.errors}
                  </strong>{" "}
                  errors — nothing has been written yet
                </span>
              </div>
            </Card>
          )}

          {/* Rows */}
          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Rows</h3>
              <div className="flex items-center gap-3">
                {session.rows.some((r) => r.status === "error" || r.status === "skipped") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => downloadProblemRows(session)}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download problem rows
                  </Button>
                )}
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
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Row</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={row.status === "error" ? "bg-destructive/5" : undefined}
                  >
                    <TableCell className="text-xs text-muted-foreground">{row.rowIndex + 1}</TableCell>
                    <TableCell className="text-sm">{rowSummary(session.entityType, row)}</TableCell>
                    <TableCell>{statusBadge(row)}</TableCell>
                    <TableCell className="min-w-64">
                      {row.issues.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="space-y-0.5">
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
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {visibleRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      No rows
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Action bar */}
          {session.status === "draft" ? (
            <Card className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                {session.errors > 0 ? (
                  <span className="text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    {session.errors} blocking issue{session.errors === 1 ? "" : "s"} must be fixed
                    before committing
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    All rows ready — commit runs in one transaction, or preview first
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void handlePreview()} disabled={previewing}>
                  {previewing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Eye className="h-4 w-4 mr-2" />
                  )}
                  Preview
                </Button>
                <Button
                  onClick={() => void handleCommit()}
                  disabled={committing || session.errors > 0}
                >
                  {committing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Commit import
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {session.status === "committed"
                  ? "This import is committed. Rollback removes what it created — unless another record now references it."
                  : "This import was rolled back — everything it created was removed."}
              </div>
              {session.status === "committed" && (
                <Button variant="outline" onClick={() => setRollbackOpen(true)}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Roll back import
                </Button>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Rollback confirm dialog */}
      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roll back this import?</DialogTitle>
            <DialogDescription>
              Every record this import created will be deleted. If any of them are already
              referenced (an invoice uses the customer, stock moved, …) the rollback is refused
              and nothing is removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleRollback()} disabled={rollingBack}>
              {rollingBack ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Roll back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
