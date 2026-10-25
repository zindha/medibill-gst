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
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Receipt,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const PAGE_SIZE = 20;

/** Date range shortcuts offered above the expense list. */
const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
] as const;

type PresetId = (typeof PRESETS)[number]["id"] | "all";

/** ISO (yyyy-mm-dd) date string for a local day. */
function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The from/to pair of a preset, or null when the preset is "all time". */
function presetRange(id: PresetId): { from: string; to: string } | null {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  const daysAgo = (n: number) => {
    const copy = startOfDay(now);
    copy.setDate(copy.getDate() - n);
    return copy;
  };

  switch (id) {
    case "today":
      return { from: isoDay(now), to: isoDay(now) };
    case "yesterday": {
      const y = daysAgo(1);
      return { from: isoDay(y), to: isoDay(y) };
    }
    case "last7":
      return { from: isoDay(daysAgo(6)), to: isoDay(now) };
    case "last30":
      return { from: isoDay(daysAgo(29)), to: isoDay(now) };
    case "thisMonth":
      return {
        from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case "lastMonth":
      return {
        from: isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: isoDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    default:
      return null;
  }
}

/** Formats yyyy-mm-dd without letting the browser timezone shift the day. */
const formatDate = (value: string) => {
  const [year, month, day] = String(value ?? "").split("-");
  if (!year || !month || !day) return value;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${day} ${months[Number(month) - 1] ?? month} ${year}`;
};

const money = (value: number) => `₹${Number(value ?? 0).toFixed(2)}`;

export default function ExpensesPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<PresetId>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [gstOnly, setGstOnly] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const { expensesApi } = await import("@/lib/api");
      const result = await expensesApi.list({
        q: debouncedSearch || undefined,
        from: from || undefined,
        to: to || undefined,
        gstOnly: gstOnly || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(Array.isArray(result?.items) ? result.items : []);
      setTotal(Number(result?.total ?? 0));
    } catch {
      toast.error("Could not load expenses");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, from, to, gstOnly, page]);

  useEffect(() => {
    if (isAuthenticated) void loadExpenses();
  }, [isAuthenticated, loadExpenses]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  // Any change of a filter starts again on the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, from, to, gstOnly]);

  const applyPreset = (id: PresetId) => {
    setPreset(id);
    const next = presetRange(id);
    setFrom(next?.from ?? "");
    setTo(next?.to ?? "");
  };

  const onManualRange = (start: string, end: string) => {
    setPreset("all");
    setFrom(start);
    setTo(end);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!authLoading && !isAuthenticated) {
    navigate("/auth");
    return null;
  }
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Business Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Be it Rent or Salaries, track all your shop expenses with ease
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SEARCH EXPENSES"
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Button size="sm" onClick={() => navigate("/dashboard/expenses/new")} title="Add New Expense (F2)">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add New Expense <kbd className="ml-1.5 rounded border border-border bg-background px-1 font-mono text-[9px]">F2</kbd>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-3 border-border/60 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {PRESETS.map((option) => (
            <button
              key={option.id}
              onClick={() => applyPreset(option.id)}
              className={`px-2.5 py-1 rounded-sm text-xs transition-colors ${
                preset === option.id
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            onClick={() => applyPreset("all")}
            className={`px-2.5 py-1 rounded-sm text-xs transition-colors ${
              preset === "all"
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All time
          </button>
          <button
            onClick={() => setGstOnly((value) => !value)}
            className={`ml-auto px-2.5 py-1 rounded-sm text-xs border transition-colors ${
              gstOnly
                ? "border-primary text-primary font-medium"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {gstOnly ? "GST only: on" : "GST only: off"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => onManualRange(e.target.value, to)}
            className="h-8 w-40 text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => onManualRange(from, e.target.value)}
            className="h-8 w-40 text-xs"
          />
        </div>
      </Card>

      {/* List */}
      {items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No data"
          description={
            search || from || to || gstOnly
              ? "No expense matches the current filters."
              : "Record rent, salaries, utilities and other business spends here."
          }
          actions={[
            { label: "Add New Expense", onClick: () => navigate("/dashboard/expenses/new") },
          ]}
        />
      ) : (
        <Card className="border-border/60 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Expense No</TableHead>
                <TableHead>Expense Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Paid to Party</TableHead>
                <TableHead>Invoice No</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((expense: any) => (
                <TableRow
                  key={expense.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/dashboard/expenses/${expense.id}`)}
                >
                  <TableCell className="font-mono text-sm">{expense.number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(expense.date)}
                  </TableCell>
                  <TableCell className="text-sm">{expense.partyName || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {expense.category}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {expense.invoiceNo || "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {expense.isGst ? money(expense.taxAmount) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    {money(expense.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/60">
            <p className="text-xs text-muted-foreground">
              Add New Expense - F2 &nbsp;|&nbsp; View Expense Detail - Enter
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft className="h-3 w-3" />Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next<ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </motion.div>
  );
}
