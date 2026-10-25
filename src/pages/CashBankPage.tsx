import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import ChequesPanel from "@/components/ChequesPanel";
import { useAuth } from "@/hooks/use-auth";
import { reconciliationApi } from "@/lib/api";
import { chequesApi, type Cheque, type ChequeDirection, type ChequeStatus } from "@/lib/chequesApi";
import { paymentAccountsApi, type PaymentAccount } from "@/lib/paymentAccountsApi";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Download,
  FileUp,
  Landmark,
  Link2,
  Loader2,
  Lock,
  Plus,
  RefreshCcw,
  Search,
  Unlink,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type TabKey = "cash" | "bank" | "cheques";

const money = (value?: number | null) =>
  `₹${(Number(value) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const formatDate = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

function exportCSV(data: any[], filename: string, columns: { key: string; header: string }[]) {
  if (!data || data.length === 0) {
    toast.error("No data to export");
    return;
  }
  const header = columns.map((c) => c.header).join(",");
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key] ?? "";
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const partyLabel = (parties: Array<{ code: string; memo?: string | null }> | undefined) =>
  (parties ?? []).map((party) => (party.memo ? `${party.code} · ${party.memo}` : party.code)).join(", ");

export default function CashBankPage() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const canManage = role === "admin" || role === "pharmacist";

  const today = new Date();
  const [tab, setTab] = useState<TabKey>("cash");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return isoDate(d);
  });
  const [toDate, setToDate] = useState(() => isoDate(today));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [unreconciledOnly, setUnreconciledOnly] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Match dialog
  const [matchRow, setMatchRow] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [force, setForce] = useState(false);
  const [matching, setMatching] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "cash") {
        setBook(await reconciliationApi.cashBook({ from: fromDate, to: toDate }));
      } else {
        const [bank, bankStatus, statementRows] = await Promise.all([
          reconciliationApi.bankBook({ from: fromDate, to: toDate }),
          reconciliationApi.status({ from: fromDate, to: toDate }),
          reconciliationApi.rows({
            from: fromDate,
            to: toDate,
            unreconciledOnly,
            q: searchQ.trim() || undefined,
          }),
        ]);
        setBook(bank);
        setStatus(bankStatus);
        setRows(statementRows);
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to load cash & bank data";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, tab, fromDate, toDate, unreconciledOnly, searchQ]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setImporting(true);
      try {
        const result = await reconciliationApi.importCsv(String(reader.result ?? ""));
        const skipped = result.skipped?.length ?? 0;
        toast.success(
          `Imported ${result.imported} · duplicates ${result.duplicates} · skipped ${skipped}`
        );
        if (skipped > 0) {
          const reasons = result.skipped
            .slice(0, 3)
            .map((s) => `line ${s.line}: ${s.reason}`)
            .join("; ");
          toast.info(`Skipped — ${reasons}${result.skipped.length > 3 ? " …" : ""}`);
        }
        await load();
      } catch (err: any) {
        toast.error(err?.message ?? "Failed to import statement");
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const openMatch = async (row: any) => {
    setMatchRow(row);
    setSelectedLine("");
    setNotes("");
    setForce(false);
    setSuggestions([]);
    setSuggestionsLoading(true);
    try {
      const [suggested, bankStatus] = await Promise.all([
        reconciliationApi.suggest(row.id),
        reconciliationApi.status({ from: fromDate, to: toDate }),
      ]);
      setSuggestions(suggested.candidates ?? []);
      setStatus(bankStatus);
      if (suggested.candidates?.length) setSelectedLine(suggested.candidates[0].journalLineId);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load suggestions");
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const submitMatch = async () => {
    if (!matchRow || !selectedLine) return;
    setMatching(true);
    try {
      await reconciliationApi.match({
        bankRowId: matchRow.id,
        journalLineId: selectedLine,
        notes: notes.trim() || undefined,
        force: force || undefined,
      });
      toast.success("Statement row matched");
      setMatchRow(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to match");
    } finally {
      setMatching(false);
    }
  };

  const doUnmatch = async (row: any) => {
    if (!row?.match?.id) return;
    try {
      await reconciliationApi.unmatch(row.match.id);
      toast.success("Match removed — the journal was not changed");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to remove match");
    }
  };

  if (!authLoading && !isAuthenticated) {
    navigate("/auth");
    return null;
  }
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  const totals = [
    { label: "Opening", value: book?.opening ?? 0, tone: "text-muted-foreground" },
    { label: "Inflow", value: book?.inflow ?? 0, tone: "text-green-600" },
    { label: "Outflow", value: book?.outflow ?? 0, tone: "text-red-600" },
    { label: "Closing", value: book?.closing ?? 0, tone: (book?.closing ?? 0) >= 0 ? "text-foreground" : "text-red-600" },
  ];

  const rangeControls = (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs">From</Label>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 h-9 w-40" />
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 h-9 w-40" />
      </div>
      <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Refresh
      </Button>
    </div>
  );

  const bookTable = () => {
    if (loading && !book) {
      return (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
        </div>
      );
    }
    if (error && !book) {
      return (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load the book"
          description={error}
          actions={[{ label: "Retry", onClick: () => void load() }]}
        />
      );
    }
    if (!book || book.rows.length === 0) {
      return (
        <EmptyState
          icon={Banknote}
          title={`No ${book?.book === "bank" ? "bank" : "cash"} entries in this range`}
          description="Entries posted to this account between the selected dates will appear here."
          actions={[{ label: "Refresh", onClick: () => void load() }]}
        />
      );
    }
    return (
      <Card className="border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description / source</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead className="text-right">Running balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {book.rows.map((row: any) => (
              <TableRow key={row.lineId}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(row.date)}
                </TableCell>
                <TableCell className="min-w-0">
                  <p className="text-sm truncate">{row.description || row.sourceType}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {row.sourceType}
                    {partyLabel(row.accountParties) ? ` · ${partyLabel(row.accountParties)}` : ""}
                  </p>
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-green-700">
                  {row.debit ? money(row.debit) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-red-700">
                  {row.credit ? money(row.credit) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-medium">
                  {money(row.runningBalance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  };

  const statusCards = () => {
    const totalsRow = status?.totals;
    const cards = [
      { label: "Statement rows", value: totalsRow?.statementRows ?? 0 },
      { label: "Matched", value: totalsRow?.matched ?? 0 },
      { label: "Unmatched statement rows", value: totalsRow?.unmatchedRows ?? 0 },
      { label: "Unmatched bank entries", value: totalsRow?.unmatchedJournalLines ?? 0 },
    ];
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <Card key={card.label} className="p-4 border-border/60">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-lg font-semibold mt-2">{card.value}</p>
          </Card>
        ))}
      </div>
    );
  };

  const statementTable = () => {
    if (loading && rows.length === 0 && !error) {
      return (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading statement rows…
        </div>
      );
    }
    if (error && rows.length === 0) {
      return (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load statement rows"
          description={error}
          actions={[{ label: "Retry", onClick: () => void load() }]}
        />
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={FileUp}
          title={unreconciledOnly ? "Everything is reconciled" : "No statement rows imported yet"}
          description={
            unreconciledOnly
              ? "No unmatched statement rows in this range."
              : "Import a bank statement CSV (date, reference, description, amount or debit/credit columns) to start reconciling."
          }
          actions={
            canManage
              ? [{ label: "Import statement", onClick: () => fileInputRef.current?.click() }]
              : undefined
          }
        />
      );
    }
    return (
      <Card className="border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(row.statementDate)}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.reference || "—"}</TableCell>
                <TableCell className="max-w-[20rem] truncate text-sm">{row.description || "—"}</TableCell>
                <TableCell
                  className={`text-right font-mono text-xs font-medium ${
                    row.amount > 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {row.amount > 0 ? "+" : ""}
                  {money(row.amount)}
                </TableCell>
                <TableCell>
                  {row.matched ? (
                    <Badge className="border-green-600/30 text-green-700 bg-green-600/5" variant="outline">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Matched
                    </Badge>
                  ) : (
                    <Badge className="border-amber-600/30 text-amber-700 bg-amber-600/5" variant="outline">
                      Unmatched
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {row.matched ? (
                    canManage ? (
                      <Button size="sm" variant="ghost" onClick={() => void doUnmatch(row)}>
                        <Unlink className="h-3.5 w-3.5 mr-1.5" /> Unmatch
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Matched</span>
                    )
                  ) : canManage ? (
                    <Button size="sm" variant="outline" onClick={() => void openMatch(row)}>
                      <Link2 className="h-3.5 w-3.5 mr-1.5" /> Match
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  };

  const manualLines: any[] = status?.unmatchedJournalLines ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Banknote className="h-5 w-5" /> Cash &amp; Bank
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cash book and bank book built from the ledger, plus bank statement reconciliation
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!canManage && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border border-border/60 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> Read-only role
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/dashboard/payment-accounts")}
          >
            <Wallet className="h-3.5 w-3.5 mr-1.5" /> Payment accounts
          </Button>
          {canManage && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFile}
                aria-label="Import bank statement CSV"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <FileUp className="h-3.5 w-3.5 mr-1.5" />
                )}
                Import statement
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="cash">Cash Book</TabsTrigger>
          <TabsTrigger value="bank">Bank Book</TabsTrigger>
          <TabsTrigger value="cheques">Cheques</TabsTrigger>
        </TabsList>

        <TabsContent value="cash" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            {rangeControls}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportCSV(book?.rows ?? [], "cash_book", [
                  { key: "date", header: "Date" },
                  { key: "sourceType", header: "Source" },
                  { key: "description", header: "Description" },
                  { key: "debit", header: "In" },
                  { key: "credit", header: "Out" },
                  { key: "runningBalance", header: "Running Balance" },
                ])
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {totals.map((t) => (
              <Card key={t.label} className="p-4 border-border/60">
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p className={`text-lg font-semibold mt-2 font-mono ${t.tone}`}>{money(t.value)}</p>
              </Card>
            ))}
          </div>

          {bookTable()}
        </TabsContent>

        <TabsContent value="bank" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            {rangeControls}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void load();
                  }}
                  placeholder="Search reference / description"
                  className="h-9 w-56 pl-8"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportCSV(book?.rows ?? [], "bank_book", [
                    { key: "date", header: "Date" },
                    { key: "sourceType", header: "Source" },
                    { key: "description", header: "Description" },
                    { key: "debit", header: "In" },
                    { key: "credit", header: "Out" },
                    { key: "runningBalance", header: "Running Balance" },
                  ])
                }
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {totals.map((t) => (
              <Card key={t.label} className="p-4 border-border/60">
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p className={`text-lg font-semibold mt-2 font-mono ${t.tone}`}>{money(t.value)}</p>
              </Card>
            ))}
          </div>

          {bookTable()}

          {/* Reconciliation (bank-only) */}
          <div className="pt-2 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Reconciliation</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Statement rows are matched against BANK journal lines — matching never changes the
                  journal, so the book always agrees with the trial balance.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={unreconciledOnly}
                  onCheckedChange={(value) => setUnreconciledOnly(!!value)}
                />
                Unreconciled only
              </label>
            </div>

            {statusCards()}
            {statementTable()}
          </div>
        </TabsContent>

        <TabsContent value="cheques" className="space-y-4">
          <ChequesPanel canManage={canManage} />
        </TabsContent>
      </Tabs>

      {/* Match dialog */}
      <Dialog open={!!matchRow} onOpenChange={(open) => { if (!open) setMatchRow(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Match statement row</DialogTitle>
            <DialogDescription>
              {matchRow
                ? `${formatDate(matchRow.statementDate)} · ${money(matchRow.amount)} · ${
                    matchRow.description || matchRow.reference || "statement row"
                  }`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium mb-2">Suggested matches</p>
              {suggestionsLoading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding candidates…
                </p>
              ) : suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No automatic suggestion — pick a journal line below.
                </p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {suggestions.map((candidate) => (
                    <label
                      key={candidate.journalLineId}
                      className="flex items-start gap-2 rounded-sm border border-border/60 px-3 py-2 cursor-pointer hover:bg-secondary/40"
                    >
                      <input
                        type="radio"
                        name="match-candidate"
                        className="mt-1"
                        checked={selectedLine === candidate.journalLineId}
                        onChange={() => setSelectedLine(candidate.journalLineId)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm truncate">
                            {candidate.description || candidate.sourceType}
                          </span>
                          <span className="font-mono text-xs">{money(candidate.lineAmount)}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(candidate.date)} · {candidate.sourceType} · confidence{" "}
                          {Math.round(candidate.confidence * 100)}%
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-medium mb-2">Or pick an unmatched bank journal line</p>
              {manualLines.length === 0 ? (
                <p className="text-xs text-muted-foreground">No unmatched BANK entries in this range.</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {manualLines.map((line) => (
                    <label
                      key={line.journalLineId}
                      className="flex items-start gap-2 rounded-sm border border-border/60 px-3 py-2 cursor-pointer hover:bg-secondary/40"
                    >
                      <input
                        type="radio"
                        name="match-candidate"
                        className="mt-1"
                        checked={selectedLine === line.journalLineId}
                        onChange={() => setSelectedLine(line.journalLineId)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm truncate">{line.description || line.sourceType}</span>
                          <span className="font-mono text-xs">{money(line.lineAmount)}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(line.date)} · {line.sourceType}
                          {line.memo ? ` · ${line.memo}` : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why this match? Required when forcing."
                className="mt-1 h-20 text-sm"
              />
            </div>

            {canManage && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox checked={force} onCheckedChange={(value) => setForce(!!value)} />
                Force match even if the amounts differ (requires notes)
              </label>
            )}

            <Button
              className="w-full"
              onClick={() => void submitMatch()}
              disabled={matching || !selectedLine || (force && !notes.trim())}
            >
              {matching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Match
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Book balance hints */}
      {tab === "cash" && book && book.rows.length > 0 && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <ArrowDownLeft className="h-3 w-3 text-green-600" />
          In = debit on the cash account · Out = credit · closing = opening + inflow − outflow
          <ArrowUpRight className="h-3 w-3 text-red-600" />
        </p>
      )}
    </div>
  );
}
