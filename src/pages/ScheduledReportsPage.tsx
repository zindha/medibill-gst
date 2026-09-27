import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type CreateScheduledReportInput,
  type SchedulePreset,
  type ScheduledReportRecipient,
  type ScheduledReportRow,
  type ScheduledReportRunRow,
  type ScheduledReportType,
  filesApi,
  scheduledReportsApi,
} from "@/lib/api";
import {
  AlertTriangle,
  CalendarClock,
  Download,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

/**
 * Scheduled Reports (Task 17) — scheduled CSV / PDF delivery. PDF is
 * server-rendered A4 (pdfkit), stored as a file on the run and downloaded
 * from the run history — it is never inlined in a channel message. Periods
 * are period-relative (`daysBack` from the run date) and next-run times are
 * computed in the SERVER's local timezone, shown verbatim from the API.
 */

const TYPE_LABELS: Record<ScheduledReportType, string> = {
  sales: "Sales",
  stock: "Stock",
  purchase: "Purchase",
  payments: "Payments",
  party: "Party (receivables)",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function scheduleLabel(raw: string): string {
  const s = parseJson<SchedulePreset | null>(raw, null);
  if (!s) return "—";
  if (s.kind === "daily") return `Daily ${s.time}`;
  if (s.kind === "weekly") return `Weekly ${WEEKDAYS[s.day ?? 0]} ${s.time}`;
  return `Monthly day ${s.day ?? 1} ${s.time}`;
}

function fmtStamp(v: string | null): string {
  if (!v) return "—";
  // `YYYY-MM-DDTHH:mm` is server-local — render it without re-interpreting zones.
  const [date, time] = v.split("T");
  if (!time) return v;
  return `${date} ${time}`;
}

/** ISO timestamps (run rows) — render in the browser's locale. */
function fmtIso(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? v
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function statusTone(status: string): string {
  if (status === "done") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
  if (status === "failed") return "bg-red-500/10 text-red-600 border-red-500/30";
  return "bg-amber-500/10 text-amber-600 border-amber-500/30";
}

async function downloadBase64(filename: string, contentType: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType || "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Fallback name when the file row has no filename — honour its content type. */
function fallbackName(runId: string, contentType: string | null | undefined): string {
  return contentType === "application/pdf" ? `${runId}.pdf` : `${runId}.csv`;
}

export default function ScheduledReportsPage() {
  const [reports, setReports] = useState<ScheduledReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Create / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledReportRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ScheduledReportType>("sales");
  const [kind, setKind] = useState<"daily" | "weekly" | "monthly">("daily");
  const [weekday, setWeekday] = useState(1);
  const [monthDay, setMonthDay] = useState(1);
  const [time, setTime] = useState("09:00");
  const [recipients, setRecipients] = useState<ScheduledReportRecipient[]>([
    { channel: "email", address: "" },
  ]);
  const [daysBack, setDaysBack] = useState(30);
  const [format, setFormat] = useState<"csv" | "pdf">("csv");

  // Runs drawer
  const [runsFor, setRunsFor] = useState<ScheduledReportRow | null>(null);
  const [runs, setRuns] = useState<ScheduledReportRunRow[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReports((await scheduledReportsApi.list()) ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Could not load scheduled reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setType("sales");
    setKind("daily");
    setWeekday(1);
    setMonthDay(1);
    setTime("09:00");
    setRecipients([{ channel: "email", address: "" }]);
    setDaysBack(30);
    setFormat("csv");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (row: ScheduledReportRow) => {
    setEditing(row);
    setName(row.name);
    setType(row.reportType);
    const schedule = parseJson<SchedulePreset | null>(row.schedule, null);
    setKind(schedule?.kind ?? "daily");
    setWeekday(schedule?.kind === "weekly" ? (schedule.day ?? 1) : 1);
    setMonthDay(schedule?.kind === "monthly" ? (schedule.day ?? 1) : 1);
    setTime(schedule?.time ?? "09:00");
    const saved = parseJson<ScheduledReportRecipient[]>(row.recipients, []);
    setRecipients(saved.length > 0 ? saved : [{ channel: "email", address: "" }]);
    setDaysBack(parseJson<{ daysBack?: number }>(row.filters, {}).daysBack ?? 30);
    setFormat(row.format === "pdf" ? "pdf" : "csv");
    setDialogOpen(true);
  };

  const schedulePreset = (): SchedulePreset => {
    if (kind === "weekly") return { kind: "weekly", day: weekday, time };
    if (kind === "monthly") return { kind: "monthly", day: monthDay, time };
    return { kind: "daily", time };
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      toast.error("Pick a valid time (HH:mm)");
      return;
    }
    setSaving(true);
    try {
      const cleanRecipients = recipients.filter((r) => r.address.trim().length > 0);
      const payload: CreateScheduledReportInput = {
        name: name.trim(),
        reportType: type,
        schedule: schedulePreset(),
        recipients: cleanRecipients,
        format,
        filters: { daysBack: Number(daysBack) || 30 },
      };
      if (editing) {
        await scheduledReportsApi.update(editing.id, {
          name: payload.name,
          schedule: payload.schedule,
          recipients: payload.recipients,
          filters: payload.filters,
        });
        toast.success("Scheduled report updated");
      } else {
        await scheduledReportsApi.create(payload);
        toast.success("Scheduled report created");
      }
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save the report");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (row: ScheduledReportRow) => {
    setBusy(row.id);
    try {
      await scheduledReportsApi.update(row.id, { enabled: !row.enabled });
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update the report");
    } finally {
      setBusy(null);
    }
  };

  const runNow = async (row: ScheduledReportRow) => {
    setBusy(row.id);
    try {
      const result = await scheduledReportsApi.run(row.id);
      toast.success(
        `Ran "${row.name}" — ${result.rows} rows, ${result.delivered} message(s) queued` +
          (result.deliveryFailed ? `, ${result.deliveryFailed} failed` : "")
      );
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Run failed");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: ScheduledReportRow) => {
    if (!window.confirm(`Delete "${row.name}"? Its run history is removed too.`)) return;
    setBusy(row.id);
    try {
      await scheduledReportsApi.remove(row.id);
      toast.success("Scheduled report deleted");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not delete the report");
    } finally {
      setBusy(null);
    }
  };

  const openRuns = async (row: ScheduledReportRow) => {
    setRunsFor(row);
    setRuns([]);
    setRunsLoading(true);
    try {
      setRuns((await scheduledReportsApi.runs(row.id)) ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load runs");
    } finally {
      setRunsLoading(false);
    }
  };

  const download = async (run: ScheduledReportRunRow) => {
    if (!run.fileId) return;
    setDownloading(run.id);
    try {
      const file = await filesApi.get(run.fileId);
      await downloadBase64(
        file.filename || fallbackName(run.id, file.contentType),
        file.contentType,
        file.data
      );
    } catch {
      toast.error("Could not download the file");
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scheduled Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Daily, weekly or monthly CSV &amp; PDF reports delivered to email &amp; SMS
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New report
          </Button>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load scheduled reports"
          description={error}
          actions={[{ label: "Retry", onClick: () => void load() }]}
        />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No scheduled reports yet"
          description="Create a daily, weekly or monthly CSV/PDF report — it runs automatically and lands in each recipient's inbox."
          actions={[{ label: "Create your first report", onClick: openCreate }]}
        />
      ) : (
        <div className="border rounded-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm font-medium">{row.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {TYPE_LABELS[row.reportType] ?? row.reportType}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {row.format === "pdf" ? "PDF" : "CSV"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {scheduleLabel(row.schedule)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.enabled ? fmtStamp(row.nextRunAt) : "paused"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.lastRunAt ? fmtStamp(row.lastRunAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.enabled}
                      disabled={busy === row.id}
                      onCheckedChange={() => void toggleEnabled(row)}
                      aria-label={`Toggle ${row.name}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === row.id}
                        onClick={() => void runNow(row)}
                        title="Run now"
                      >
                        {busy === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void openRuns(row)} title="Run history">
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(row)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy === row.id}
                        onClick={() => void remove(row)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Runs happen on the server&apos;s local timezone; periods are relative (last N days from
        the run). CSV bodies are inlined in delivery messages; PDFs are stored on the run and
        downloaded from the run history.{" "}
        <Link to="/dashboard/integrations" className="underline underline-offset-2 hover:text-foreground">
          Integrations
        </Link>{" "}
        control where delivery messages can go.
      </p>

      {/* ── Create / edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit scheduled report" : "New scheduled report"}</DialogTitle>
            <DialogDescription>
              The report runs on the server and stores a file (CSV or PDF) you can download any
              time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sr-name" className="text-xs">Name</Label>
              <Input id="sr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning sales" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Report type</Label>
                <Select value={type} onValueChange={(v) => setType(v as ScheduledReportType)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as ScheduledReportType[]).map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Frequency</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as "daily" | "weekly" | "monthly")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {kind === "weekly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Day</Label>
                  <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d, i) => (
                        <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {kind === "monthly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Day of month</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    className="h-9"
                    value={monthDay}
                    onChange={(e) => setMonthDay(Math.max(1, Math.min(28, Number(e.target.value) || 1)))}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Time (server local)</Label>
                <Input type="time" className="h-9" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Period (days back)</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  className="h-9"
                  value={daysBack}
                  onChange={(e) => setDaysBack(Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Recipients</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => setRecipients((r) => [...r, { channel: "email", address: "" }])}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {recipients.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <Select
                    value={r.channel}
                    onValueChange={(v) =>
                      setRecipients((list) =>
                        list.map((item, idx) =>
                          idx === i ? { ...item, channel: v as "email" | "sms" } : item
                        )
                      )
                    }
                  >
                    <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-9 flex-1"
                    placeholder={r.channel === "email" ? "owner@example.com" : "+919999999999"}
                    value={r.address}
                    onChange={(e) =>
                      setRecipients((list) =>
                        list.map((item, idx) => (idx === i ? { ...item, address: e.target.value } : item))
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 w-9"
                    disabled={recipients.length === 1}
                    onClick={() => setRecipients((list) => list.filter((_, idx) => idx !== i))}
                    title="Remove recipient"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Leave addresses blank (or remove rows) for a file-only report.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Format</Label>
              <div className="flex flex-wrap items-center gap-2">
                {(["csv", "pdf"] as const).map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={format === f ? "default" : "outline"}
                    className="h-8 text-xs uppercase"
                    disabled={editing !== null}
                    title={editing ? "Format is fixed after creation" : `Export as ${f.toUpperCase()}`}
                    onClick={() => setFormat(f)}
                  >
                    {f}
                  </Button>
                ))}
                <span className="text-[11px] text-muted-foreground">
                  PDF renders an A4 table — download it from the run history (not inlined in
                  messages).
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {editing ? "Save changes" : "Create report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Run history drawer ── */}
      <Sheet open={runsFor !== null} onOpenChange={(v) => !v && setRunsFor(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Run history — {runsFor?.name}</SheetTitle>
            <SheetDescription>
              Each run stores a file (CSV or PDF — download below) and queues delivery messages.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {runsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : runs.length === 0 ? (
              <EmptyState icon={History} title="No runs yet" description="Use Run now or wait for the schedule." />
            ) : (
              <div className="border rounded-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead className="text-right">File</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="text-xs">{fmtIso(run.startedAt)}</TableCell>
                        <TableCell>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusTone(run.status)}`}>
                            {run.status}
                          </span>
                          {run.error && (
                            <p className="text-[10px] text-red-600 mt-1 max-w-[160px] break-words">{run.error}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{run.rowCount ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {run.messageStatus ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {run.fileId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={downloading === run.id}
                              onClick={() => void download(run)}
                              title="Download file"
                            >
                              {downloading === run.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
