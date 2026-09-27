import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { accountingApi } from "@/lib/api";
import {
  AlertTriangle,
  BookOpen,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Lock,
  Plus,
  RefreshCcw,
  Scale,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type TabKey = "trial" | "pl" | "bs" | "daybook" | "journals" | "periods";

const money = (value?: number | null) =>
  `₹${(Number(value) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

interface JournalLineDraft {
  code: string;
  debit: string;
  credit: string;
  partyType: string;
  partyId: string;
  memo: string;
}

const emptyLine = (): JournalLineDraft => ({
  code: "",
  debit: "",
  credit: "",
  partyType: "",
  partyId: "",
  memo: "",
});

export default function AccountingPage() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const canPost = role === "admin" || role === "pharmacist";

  const today = new Date().toISOString().split("T")[0];
  const monthAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  })();

  const [tab, setTab] = useState<TabKey>("trial");
  const [fromDate, setFromDate] = useState(monthAgo);
  const [toDate, setToDate] = useState(today);
  const [asOf, setAsOf] = useState(today);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trial, setTrial] = useState<any>(null);
  const [pl, setPl] = useState<any>(null);
  const [bs, setBs] = useState<any>(null);
  const [dayBook, setDayBook] = useState<any>(null);
  const [dayPage, setDayPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);

  // Manual journal form
  const [journalDate, setJournalDate] = useState(today);
  const [journalDesc, setJournalDesc] = useState("");
  const [journalLines, setJournalLines] = useState<JournalLineDraft[]>([emptyLine(), emptyLine()]);
  const [posting, setPosting] = useState(false);

  // Period close form
  const [periodFrom, setPeriodFrom] = useState(monthAgo);
  const [periodTo, setPeriodTo] = useState(today);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "trial") {
        setTrial(await accountingApi.trialBalance({ from: fromDate, to: toDate }));
      } else if (tab === "pl") {
        setPl(await accountingApi.profitLoss({ from: fromDate, to: toDate }));
      } else if (tab === "bs") {
        setBs(await accountingApi.balanceSheet(asOf));
      } else if (tab === "daybook") {
        const result = await accountingApi.dayBook({ from: fromDate, to: toDate, page: dayPage, limit: 25 });
        setDayBook(result);
      } else if (tab === "journals") {
        setAccounts(await accountingApi.accounts());
      } else if (tab === "periods") {
        setPeriods(await accountingApi.periods());
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to load accounting data";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, tab, fromDate, toDate, asOf, dayPage, accountingApi]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  // Reset day-book page when the range changes
  useEffect(() => {
    setDayPage(1);
  }, [fromDate, toDate]);

  const lineDrafts = journalLines;
  const journalTotals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const line of lineDrafts) {
      debit += Number(line.debit) || 0;
      credit += Number(line.credit) || 0;
    }
    return {
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      diff: Math.round((debit - credit) * 100) / 100,
    };
  }, [lineDrafts]);

  const journalValid =
    journalTotals.diff === 0 &&
    journalTotals.debit > 0 &&
    lineDrafts.every((line) => line.code && (Number(line.debit) > 0 || Number(line.credit) > 0));

  const updateLine = (index: number, patch: Partial<JournalLineDraft>) => {
    setJournalLines((lines) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const submitJournal = async () => {
    if (!canPost) {
      toast.error("Only admins and pharmacists can post journals");
      return;
    }
    if (!journalValid) {
      toast.error("Entry must be balanced with at least one debit and one credit");
      return;
    }
    setPosting(true);
    try {
      await accountingApi.post({
        date: journalDate,
        description: journalDesc || undefined,
        lines: lineDrafts
          .filter((line) => line.code && (Number(line.debit) > 0 || Number(line.credit) > 0))
          .map((line) => ({
            code: line.code,
            debit: Number(line.debit) || 0,
            credit: Number(line.credit) || 0,
            partyType: line.partyType || undefined,
            partyId: line.partyId || undefined,
            memo: line.memo || undefined,
          })),
      });
      toast("Journal entry posted");
      setJournalLines([emptyLine(), emptyLine()]);
      setJournalDesc("");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to post journal entry");
    } finally {
      setPosting(false);
    }
  };

  const closePeriod = async () => {
    if (!canPost) return;
    setClosing(true);
    try {
      await accountingApi.closePeriod({ fromDate: periodFrom, toDate: periodTo });
      toast("Period closed — new postings are blocked for these dates");
      setPeriods(await accountingApi.periods());
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to close period");
    } finally {
      setClosing(false);
    }
  };

  const reopenPeriod = async (id: string) => {
    try {
      await accountingApi.reopenPeriod(id);
      toast("Period reopened");
      setPeriods(await accountingApi.periods());
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to reopen period");
    }
  };

  const renderBody = () => {
    if (loading && !hasData()) {
      return (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
        </div>
      );
    }
    if (error && !hasData()) {
      return (
        <div className="flex items-center justify-center py-16">
          <EmptyState
            icon={AlertTriangle}
            title="Failed to load accounting data"
            description={error}
            actions={[{ label: "Retry", onClick: () => void load() }]}
          />
        </div>
      );
    }
    return null;
  };

  const hasData = () =>
    (tab === "trial" && !!trial) ||
    (tab === "pl" && !!pl) ||
    (tab === "bs" && !!bs) ||
    (tab === "daybook" && !!dayBook) ||
    (tab === "journals" && accounts.length > 0) ||
    (tab === "periods" && periods.length > 0);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Accounting
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Double-entry ledger — trial balance, P&L, balance sheet, day book and journals
          </p>
        </div>
        {!canPost && (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border border-border/60 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Read-only role
          </span>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="trial">Trial Balance</TabsTrigger>
          <TabsTrigger value="pl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="daybook">Day Book</TabsTrigger>
          <TabsTrigger value="journals">Journals</TabsTrigger>
          <TabsTrigger value="periods">Periods</TabsTrigger>
        </TabsList>

        {/* ---------------- Trial Balance ---------------- */}
        <TabsContent value="trial" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            {rangeControls}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportCSV(trial?.rows ?? [], "trial_balance", [
                  { key: "code", header: "Code" },
                  { key: "name", header: "Account" },
                  { key: "type", header: "Type" },
                  { key: "debit", header: "Debit" },
                  { key: "credit", header: "Credit" },
                  { key: "balance", header: "Balance" },
                ])
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
          </div>
          {renderBody()}
          {trial && (
            <Card className="border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trial.rows.map((row: any) => (
                    <TableRow key={row.accountId}>
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-xs uppercase text-muted-foreground">{row.type}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.debit ? money(row.debit) : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.credit ? money(row.credit) : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium">{money(row.balance)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-secondary/40 font-semibold">
                    <TableCell colSpan={3}>Totals</TableCell>
                    <TableCell className="text-right font-mono text-xs">{money(trial.totals.totalDebit)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{money(trial.totals.totalCredit)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      Net income {money(trial.totals.netIncome)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {Math.abs(trial.totals.totalDebit - trial.totals.totalCredit) > 0.01 && (
                <div className="flex items-center gap-2 px-4 py-2 border-t border-border/60 text-xs text-amber-700 bg-amber-500/5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Debits and credits differ by{" "}
                  {money(trial.totals.totalDebit - trial.totals.totalCredit)}
                </div>
              )}
            </Card>
          )}
          {trial && trial.rows.every((r: any) => !r.debit && !r.credit) && (
            <EmptyState
              icon={Scale}
              title="No movement in this range"
              description="Trial balance reflects journal movement between the selected dates (no opening balances)."
            />
          )}
        </TabsContent>

        {/* ---------------- Profit & Loss ---------------- */}
        <TabsContent value="pl" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            {rangeControls}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportCSV(
                  [...(pl?.income ?? []).map((r: any) => ({ ...r, section: "Income" })), ...(pl?.expense ?? []).map((r: any) => ({ ...r, section: "Expense" }))],
                  "profit_loss",
                  [
                    { key: "section", header: "Section" },
                    { key: "code", header: "Code" },
                    { key: "name", header: "Account" },
                    { key: "balance", header: "Amount" },
                  ]
                )
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
          </div>
          {renderBody()}
          {pl && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-border/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-green-700">Income</h3>
                  <span className="text-sm font-semibold font-mono">{money(pl.incomeTotal)}</span>
                </div>
                <div className="space-y-1.5">
                  {pl.income.length === 0 && <p className="text-xs text-muted-foreground">No income posted in this range.</p>}
                  {pl.income.map((row: any) => (
                    <div key={row.accountId} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {row.code} · {row.name}
                      </span>
                      <span className="font-mono text-xs">{money(row.balance)}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="border-border/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-red-700">Expenses</h3>
                  <span className="text-sm font-semibold font-mono">{money(pl.expenseTotal)}</span>
                </div>
                <div className="space-y-1.5">
                  {pl.expense.length === 0 && <p className="text-xs text-muted-foreground">No expenses posted in this range.</p>}
                  {pl.expense.map((row: any) => (
                    <div key={row.accountId} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {row.code} · {row.name}
                      </span>
                      <span className="font-mono text-xs">{money(row.balance)}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="border-border/60 p-4 md:col-span-2 flex items-center justify-between">
                <span className="text-sm font-medium">Net Profit / Loss</span>
                <span className={`text-lg font-semibold font-mono ${pl.net >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {money(pl.net)}
                </span>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ---------------- Balance Sheet ---------------- */}
        <TabsContent value="bs" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-xs">As of</Label>
                <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="mt-1 h-9 w-40" />
              </div>
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Refresh
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportCSV(
                  [
                    ...(bs?.assets ?? []).map((r: any) => ({ ...r, section: "Assets" })),
                    ...(bs?.liabilities ?? []).map((r: any) => ({ ...r, section: "Liabilities" })),
                    ...(bs?.equity ?? []).map((r: any) => ({ ...r, section: "Equity" })),
                  ],
                  "balance_sheet",
                  [
                    { key: "section", header: "Section" },
                    { key: "code", header: "Code" },
                    { key: "name", header: "Account" },
                    { key: "balance", header: "Amount" },
                  ]
                )
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
          </div>
          {renderBody()}
          {bs && (
            <>
              {Math.abs(bs.totals.imbalance) > 0.01 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-amber-600/30 bg-amber-500/5 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> Balance sheet is out of balance by {money(bs.totals.imbalance)}
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-border/60 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Assets</h3>
                    <span className="text-sm font-semibold font-mono">{money(bs.totals.assets)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {bs.assets.length === 0 && <p className="text-xs text-muted-foreground">No asset movement.</p>}
                    {bs.assets.map((row: any) => (
                      <div key={row.accountId} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {row.code} · {row.name}
                        </span>
                        <span className="font-mono text-xs">{money(row.balance)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
                <div className="space-y-4">
                  <Card className="border-border/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">Liabilities</h3>
                      <span className="text-sm font-semibold font-mono">{money(bs.totals.liabilities)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {bs.liabilities.length === 0 && <p className="text-xs text-muted-foreground">No liability movement.</p>}
                      {bs.liabilities.map((row: any) => (
                        <div key={row.accountId} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {row.code} · {row.name}
                          </span>
                          <span className="font-mono text-xs">{money(row.balance)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                  <Card className="border-border/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">Equity</h3>
                      <span className="text-sm font-semibold font-mono">{money(bs.totals.equity)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {bs.equity.length === 0 && <p className="text-xs text-muted-foreground">No equity movement.</p>}
                      {bs.equity.map((row: any) => (
                        <div key={row.accountId} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {row.code} · {row.name}
                          </span>
                          <span className="font-mono text-xs">{money(row.balance)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-sm border-t border-border/60 pt-2 mt-2">
                        <span className="font-medium">Current Earnings</span>
                        <span className="font-mono text-xs font-semibold">{money(bs.totals.retainedEarnings)}</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
              <Card className="border-border/60 p-4 flex items-center justify-between">
                <span className="text-sm font-medium">
                  Assets = Liabilities + Equity + Current Earnings
                </span>
                <span className="text-sm font-mono">
                  {money(bs.totals.assets)} = {money(bs.totals.liabilities + bs.totals.equity + bs.totals.retainedEarnings)}
                </span>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ---------------- Day Book ---------------- */}
        <TabsContent value="daybook" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            {rangeControls}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const rows = (dayBook?.entries ?? []).flatMap((entry: any) =>
                  entry.lines.map((line: any) => ({
                    date: entry.date,
                    sourceType: entry.sourceType,
                    sourceId: entry.sourceId ?? "",
                    description: entry.description ?? "",
                    code: line.code,
                    account: line.name,
                    debit: line.debit,
                    credit: line.credit,
                    party: line.partyType ? `${line.partyType}:${line.partyId}` : "",
                  }))
                );
                exportCSV(rows, "day_book", [
                  { key: "date", header: "Date" },
                  { key: "sourceType", header: "Source" },
                  { key: "sourceId", header: "Source ID" },
                  { key: "description", header: "Description" },
                  { key: "code", header: "Code" },
                  { key: "account", header: "Account" },
                  { key: "debit", header: "Debit" },
                  { key: "credit", header: "Credit" },
                  { key: "party", header: "Party" },
                ]);
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
          </div>
          {renderBody()}
          {dayBook && dayBook.entries.length === 0 && (
            <EmptyState
              icon={FileText}
              title="No journal entries"
              description="Sales, purchases, payments and returns post here automatically as they happen."
            />
          )}
          {dayBook && dayBook.entries.length > 0 && (
            <div className="space-y-2">
              {dayBook.entries.map((entry: any) => (
                <Card key={entry.id} className="border-border/60 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                    onClick={() => setExpanded((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expanded[entry.id] ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {entry.description || entry.sourceType}
                          {entry.isReversal && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-sm border border-red-600/30 text-[10px] text-red-700 bg-red-600/5">
                              Reversal
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.date} · {entry.sourceType}
                          {entry.sourceId ? ` · ${entry.sourceId}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-xs font-mono text-muted-foreground shrink-0">
                      <span>Dr {money(entry.lines.reduce((s: number, l: any) => s + l.debit, 0))}</span>
                      <span>Cr {money(entry.lines.reduce((s: number, l: any) => s + l.credit, 0))}</span>
                    </div>
                  </button>
                  {expanded[entry.id] && (
                    <div className="border-t border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead>Party</TableHead>
                            <TableHead>Memo</TableHead>
                            <TableHead className="text-right">Debit</TableHead>
                            <TableHead className="text-right">Credit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entry.lines.map((line: any) => (
                            <TableRow key={line.id}>
                              <TableCell className="text-xs">
                                <span className="font-mono">{line.code}</span> · {line.name}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {line.partyType ? `${line.partyType} · ${line.partyId}` : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{line.memo || "—"}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{line.debit ? money(line.debit) : "—"}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{line.credit ? money(line.credit) : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>
              ))}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Page {dayBook.page} · {dayBook.total} entries total
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={dayPage <= 1 || loading}
                    onClick={() => setDayPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={dayPage * dayBook.limit >= dayBook.total || loading}
                    onClick={() => setDayPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ---------------- Journals (manual post) ---------------- */}
        <TabsContent value="journals" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Post a manual journal entry (admin / pharmacist only)</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportCSV(accounts, "chart_of_accounts", [
                  { key: "code", header: "Code" },
                  { key: "name", header: "Account" },
                  { key: "type", header: "Type" },
                  { key: "isSystem", header: "System" },
                ])
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Chart CSV
            </Button>
          </div>
          {renderBody()}
          <Card className="border-border/60 p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={journalDate} onChange={(e) => setJournalDate(e.target.value)} className="mt-1 h-9" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Description</Label>
                <Input
                  value={journalDesc}
                  onChange={(e) => setJournalDesc(e.target.value)}
                  placeholder="e.g. Opening balance adjustment"
                  className="mt-1 h-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] gap-2 px-1">
                <span className="text-xs text-muted-foreground">Account</span>
                <span className="text-xs text-muted-foreground text-right">Debit</span>
                <span className="text-xs text-muted-foreground text-right">Credit</span>
                <span className="text-xs text-muted-foreground">Party</span>
                <span className="text-xs text-muted-foreground">Memo</span>
                <span />
              </div>
              {journalLines.map((line, index) => (
                <div key={index} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] gap-2 items-center">
                  <Select value={line.code || undefined} onValueChange={(v) => updateLine(index, { code: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Account code" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.code}>
                          {account.code} — {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={line.debit}
                    onChange={(e) => updateLine(index, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
                    className="h-9 text-right"
                  />
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={line.credit}
                    onChange={(e) => updateLine(index, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
                    className="h-9 text-right"
                  />
                  <Select value={line.partyType || undefined} onValueChange={(v) => updateLine(index, { partyType: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={line.memo}
                    onChange={(e) => updateLine(index, { memo: e.target.value })}
                    placeholder="Memo"
                    className="h-9"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={journalLines.length <= 2}
                    onClick={() => setJournalLines((lines) => lines.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setJournalLines((lines) => [...lines, emptyLine()])}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add line
              </Button>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-mono text-xs">Dr {money(journalTotals.debit)}</span>
                <span className="font-mono text-xs">Cr {money(journalTotals.credit)}</span>
                <span
                  className={`px-2 py-0.5 rounded-sm border text-xs ${
                    journalTotals.diff === 0
                      ? "border-green-600/30 text-green-700 bg-green-600/5"
                      : "border-amber-600/30 text-amber-700 bg-amber-600/5"
                  }`}
                >
                  {journalTotals.diff === 0 ? "Balanced" : `Out of balance by ${money(journalTotals.diff)}`}
                </span>
              </div>
            </div>

            <Button className="w-full" disabled={!canPost || !journalValid || posting} onClick={() => void submitJournal()}>
              {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <BookOpen className="h-3.5 w-3.5 mr-1.5" />}
              Post Entry
            </Button>
            {!canPost && (
              <p className="text-xs text-muted-foreground text-center">Only admins and pharmacists can post journals.</p>
            )}
          </Card>

          <Card className="border-border/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/60 text-sm font-medium flex items-center justify-between">
              <span>Chart of Accounts</span>
              <span className="text-xs text-muted-foreground">{accounts.length} accounts</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Kind</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-mono text-xs">{account.code}</TableCell>
                    <TableCell className="text-sm">{account.name}</TableCell>
                    <TableCell className="text-xs uppercase text-muted-foreground">{account.type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{account.isSystem ? "System" : "Manual"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ---------------- Periods ---------------- */}
        <TabsContent value="periods" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Closed ranges reject new journal postings</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportCSV(periods, "accounting_periods", [
                  { key: "fromDate", header: "From" },
                  { key: "toDate", header: "To" },
                  { key: "closedAt", header: "Closed At" },
                  { key: "closedBy", header: "Closed By" },
                ])
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
          </div>
          <Card className="border-border/60 p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Lock className="h-4 w-4" /> Close an accounting period
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="mt-1 h-9 w-40" />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="mt-1 h-9 w-40" />
              </div>
              <Button size="sm" disabled={!canPost || closing || periodFrom > periodTo} onClick={() => void closePeriod()}>
                {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Lock className="h-3.5 w-3.5 mr-1.5" />}
                Close Period
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Closed ranges reject new journal postings until reopened. Sales and purchases dated inside a closed range
              are audited as posting failures.
            </p>
          </Card>

          {periods.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="No closed periods"
              description="Close a date range to lock it against new postings — useful after month-end reporting."
            />
          ) : (
            <Card className="border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Closed</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="text-sm font-mono">{period.fromDate}</TableCell>
                      <TableCell className="text-sm font-mono">{period.toDate}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {period.closedAt ? new Date(period.closedAt).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canPost}
                          onClick={() => void reopenPeriod(period.id)}
                        >
                          <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Reopen
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
