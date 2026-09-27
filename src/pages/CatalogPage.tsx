import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Database,
  PackageX,
  Plus,
  Search,
  Trash2,
  Upload,
  CheckCircle2,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import type { LucideIcon } from "lucide-react";
import {
  catalogAdditionsApi,
  productIntelApi,
  type CatalogAdditionInput,
} from "@/lib/api";
import { compositionTokens } from "@/lib/composition";
import { parseMedicineCsv, type ParsedMedicineCsv } from "@/lib/parseMedicineCsv";
import { useMedicineCatalog } from "@/hooks/useMedicineCatalog";
import { MedicineAlternatives } from "@/components/MedicineAlternatives";

/**
 * Resolve a catalog row to the tenant's own medicine (by exact name) and show
 * its alternatives; catalog rows themselves have no id or stock.
 */
function StockAlternativesSection({ name }: { name: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [medicineId, setMedicineId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setMedicineId(null);
    productIntelApi
      .search(name, { limit: 10 })
      .then((res) => {
        if (cancelled) return;
        const hit = res.stock.find(
          (s) => s.name.trim().toLowerCase() === name.trim().toLowerCase(),
        );
        setMedicineId(hit?.medicineId ?? null);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [name, attempt]);

  if (state === "loading") {
    return (
      <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Checking your stock…
      </p>
    );
  }
  if (state === "error") {
    return (
      <div className="flex items-center justify-between gap-2 py-2 text-sm">
        <span className="text-destructive">Stock lookup failed</span>
        <Button variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)}>
          Retry
        </Button>
      </div>
    );
  }
  if (!medicineId) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <PackageX className="h-4 w-4 shrink-0" />
        Not in your stock yet — add it from Inventory to dispense substitutes.
      </p>
    );
  }
  return <MedicineAlternatives medicineId={medicineId} inStock maxRows={5} />;
}

const FORMAT_HINT = [
  "name, company, composition, pack, price, gst",
  "Paracetamol Plus Tablet, ABC Pharma, Paracetamol 500mg, strip of 10 tablets, 45.50, 5",
].join("\n");

interface PreviewRow extends CatalogAdditionInput {
  status: "new" | "duplicate";
}

export default function CatalogPage() {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ParsedMedicineCsv | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const catalog = useMedicineCatalog(search, 50, true);
  const { additions, refreshAdditions, removeAddition } = catalog;

  // File selected → parse + show a preview without persisting anything.
  const handleFile = async (file: File) => {
    setError("");
    setPreview(null);
    setPreviewRows([]);
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setError("Please choose a .csv file. (Excel files aren't supported yet.)");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseMedicineCsv(text);
      if (parsed.rows === 0) {
        setError("The file appears empty. Check the format and try again.");
        return;
      }
      setFileName(file.name);
      setPreview(parsed);
      setPreviewRows(
        parsed.additions.map((a) => ({ ...a, status: "new" as const })),
      );
    } catch (err) {
      setError(`Could not read the file: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  // Persist only the parsed additions; the server also dedups against existing.
  const handleImport = async () => {
    if (!preview || preview.additions.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const res = await catalogAdditionsApi.import(preview.additions);
      setFileName("");
      setPreview(null);
      setPreviewRows([]);
      await refreshAdditions();
      toast.success(
        res.count > 0
          ? `Added ${res.count} medicine${res.count === 1 ? "" : "s"} to your database`
          : "Nothing new to add — everything was already there",
      );
      if (res.duplicates > 0) {
        toast.info(`${res.duplicates} row(s) were already in your additions`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    try {
      await removeAddition(id);
      toast.success(`Removed ${name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove medicine");
    }
  };

  const filteredAdditions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return additions;
    return additions.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.company.toLowerCase().includes(q) ||
        a.composition.toLowerCase().includes(q),
    );
  }, [additions, search]);

  const hasPreviewData = preview !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Medicine Database
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your distributor&apos;s price list or a stock CSV to add Tamil Nadu and regional
          medicines to the searchable catalog — no scripts or rebuilds needed.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upload card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload a medicine list
            </CardTitle>
            <CardDescription>
              Columns are matched flexibly — name, company, composition, pack, price, gst.
              Rows already in the bundled database (243k+ medicines) are skipped automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="csv-file">CSV file</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="csv-file"
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => fileRef.current?.click()}
                >
                  Browse…
                </Button>
              </div>
            </div>

            <pre className="rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground overflow-x-auto">
              {FORMAT_HINT}
            </pre>

            {fileName && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{fileName}</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {hasPreviewData && preview && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Badge variant="default">
                    {preview.additions.length} ready to add
                  </Badge>
                  <Badge variant="secondary">
                    {preview.rows} rows read
                  </Badge>
                  <span className="text-muted-foreground">
                    (duplicates &amp; invalid rows dropped)
                  </span>
                </div>
                <div className="max-h-48 overflow-auto rounded-md border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>MRP</TableHead>
                        <TableHead>GST</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.slice(0, 50).map((r) => (
                        <TableRow key={r.catalogKey}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell>{r.company}</TableCell>
                          <TableCell>₹{r.price}</TableCell>
                          <TableCell>{r.gstRate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {previewRows.length > 50 && (
                    <p className="p-2 text-xs text-muted-foreground">
                      …and {previewRows.length - 50} more
                    </p>
                  )}
                </div>
                <Button onClick={handleImport} disabled={uploading || preview.additions.length === 0}>
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" /> Add {preview.additions.length} to database
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Help / counts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4" /> Your additions
            </CardTitle>
            <CardDescription>Custom medicines are searchable in billing &amp; inventory.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-3xl font-display font-semibold text-foreground">{additions.length}</p>
              <p className="text-xs text-muted-foreground">Medicines you have added</p>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Shown first in medicine search</li>
              <li>• Stored per pharmacy account</li>
              <li>• No app rebuild required</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Search results — expandable rows: salt tokens + stock alternatives */}
      {search.trim() && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-4 w-4" /> Search results
            </CardTitle>
            <CardDescription>
              {catalog.loading
                ? "Searching the medicine database…"
                : `${catalog.count} match${catalog.count === 1 ? "" : "es"} — click a row for composition tokens and alternatives in your stock.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {catalog.error ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Could not search the medicine database — try again in a moment.</span>
              </div>
            ) : catalog.loading && (catalog.results ?? []).length === 0 ? (
              <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </p>
            ) : (catalog.results ?? []).length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No matches for “{search}”.
              </p>
            ) : (
              <ul className="space-y-1">
                {(catalog.results ?? []).map((m) => {
                  const key = m.catalogKey || `${m.name}::${m.company}`;
                  const open = expandedKey === key;
                  const tokens = compositionTokens(m.composition || m.name);
                  return (
                    <li key={key} className="rounded-sm border border-border/60">
                      <button
                        type="button"
                        aria-expanded={open}
                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                        onClick={() => setExpandedKey(open ? null : key)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{m.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {m.company}
                            {m.composition ? ` · ${m.composition}` : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
                          {m.price ? `₹${m.price}` : "—"}
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                          />
                        </span>
                      </button>
                      {open && (
                        <div className="space-y-3 border-t border-border/60 bg-muted/30 p-3">
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted-foreground">
                              Composition tokens
                            </p>
                            {tokens.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {tokens.map((t) => (
                                  <Badge key={t} variant="secondary" className="font-normal">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No composition on file for this entry.
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted-foreground">
                              Alternatives in your stock
                            </p>
                            <StockAlternativesSection name={m.name} />
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Existing additions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" /> Added medicines
          </CardTitle>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your additions…"
              className="max-w-md"
            />
          </div>
        </CardHeader>
        <CardContent>
          {additions.length === 0 ? (
            <EmptyState
              icon={Database as LucideIcon}
              title="No custom medicines yet"
              description="Upload a CSV above to add medicines that aren't in the built-in database."
            />
          ) : (
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Composition</TableHead>
                    <TableHead>MRP</TableHead>
                    <TableHead>GST</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdditions.map((a) => (
                    <TableRow key={a.additionId}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.company}</TableCell>
                      <TableCell className="text-muted-foreground">{a.composition}</TableCell>
                      <TableCell>{a.price ? `₹${a.price}` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{a.gstRate}%</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${a.name}`}
                          onClick={() => a.additionId && handleRemove(a.additionId, a.name)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredAdditions.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No additions match “{search}”.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}