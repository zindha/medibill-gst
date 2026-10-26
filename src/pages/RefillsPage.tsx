import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useHotkeys } from "@/hooks/useHotkeys";
import { motion } from "framer-motion";
import { BellRing, CalendarClock, Check, Loader2, Phone, Pill, Plus, Search, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { refillsApi, type MessageChannel, type RefillReminder } from "@/lib/api";

const CYCLE_OPTIONS = [
  { days: 7, label: "Weekly (7 days)" },
  { days: 15, label: "Fortnightly (15 days)" },
  { days: 30, label: "Monthly (30 days)" },
  { days: 60, label: "2 months (60 days)" },
  { days: 90, label: "Quarterly (90 days)" },
];

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export default function RefillsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [reminders, setReminders] = useState<RefillReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "due" | "upcoming" | "done">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dueChannel, setDueChannel] = useState<MessageChannel>("whatsapp");
  const [sendingDue, setSendingDue] = useState(false);
  const [sendingRowId, setSendingRowId] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerName: "", customerPhone: "", medicineName: "",
    lastPurchaseDate: new Date().toISOString().split("T")[0],
    daysAfter: 30, notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await refillsApi.list();
      setReminders(list);
    } catch {
      toast.error("Failed to load refill reminders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAuthenticated) void load(); }, [isAuthenticated, load]);
  useEffect(() => { if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true }); }, [authLoading, isAuthenticated, navigate]);

  useHotkeys([
    { key: "/", label: "Focus refill search", handler: () => document.querySelector<HTMLInputElement>("[data-refill-search]")?.focus() },
    { key: "n", label: "New refill reminder", handler: () => setDialogOpen(true) },
  ]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reminders.filter((r) => {
      if (filter === "due" && !(r.status === "pending" && daysUntil(r.reminderDate) <= 0)) return false;
      if (filter === "upcoming" && !(r.status === "pending" && daysUntil(r.reminderDate) > 0)) return false;
      if (filter === "done" && !(r.status === "completed" || r.status === "sent")) return false;
      if (filter === "all" && (r.status === "completed" || r.status === "sent")) {
        // show done only in "done" filter
        return false;
      }
      if (!q) return true;
      return (r.customerName ?? "").toLowerCase().includes(q) ||
        (r.customerPhone ?? "").includes(q) ||
        r.medicineName.toLowerCase().includes(q);
    });
  }, [reminders, search, filter]);

  const dueCount = useMemo(
    () => reminders.filter((r) => r.status === "pending" && daysUntil(r.reminderDate) <= 0).length,
    [reminders],
  );

  const handleSave = async () => {
    if (!form.medicineName.trim()) { toast.error("Medicine name is required"); return; }
    setSaving(true);
    try {
      await refillsApi.create({
        customerName: form.customerName || undefined,
        customerPhone: form.customerPhone || undefined,
        medicineName: form.medicineName.trim(),
        lastPurchaseDate: form.lastPurchaseDate,
        daysAfter: form.daysAfter,
        notes: form.notes || undefined,
      });
      toast.success("Monthly refill reminder set");
      setDialogOpen(false);
      setForm({ customerName: "", customerPhone: "", medicineName: "", lastPurchaseDate: new Date().toISOString().split("T")[0], daysAfter: 30, notes: "" });
      void load();
    } catch {
      toast.error("Failed to save reminder");
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (id: string, status: "sent" | "completed") => {
    try {
      await refillsApi.update(id, { status });
      toast.success(status === "completed" ? "Marked refilled" : "Marked as reminded");
      void load();
    } catch {
      toast.error("Update failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this reminder?")) return;
    try {
      await refillsApi.remove(id);
      toast.success("Reminder deleted");
      void load();
    } catch {
      toast.error("Delete failed");
    }
  };

  // Best-effort provider health check — warn (never block) when the channel
  // has no server-side credentials yet.
  const warnIfUnconfigured = async (channel: MessageChannel) => {
    try {
      const { messagesApi } = await import("@/lib/api");
      const health = await messagesApi.providers();
      if (!health[channel]) {
        const hint = channel === "whatsapp" ? "WHATSAPP_API_TOKEN" : channel === "sms" ? "SMS_WEBHOOK_URL" : "EMAIL_WEBHOOK_URL";
        toast.warning(`${channel} provider not configured`, {
          description: `Set ${hint} in the server .env — messages stay queued until then.`,
        });
      }
    } catch { /* health is best-effort */ }
  };

  const handleSendDue = async () => {
    setSendingDue(true);
    try {
      await warnIfUnconfigured(dueChannel);
      const res = await refillsApi.sendDue(dueChannel);
      const parts = [`${res.queued} queued`];
      if (res.already_queued) parts.push(`${res.already_queued} already queued`);
      if (res.skipped_optout) parts.push(`${res.skipped_optout} opted out`);
      if (res.skipped_nophone) parts.push(`${res.skipped_nophone} no phone`);
      toast.success("Due reminders queued", { description: parts.join(" · ") });
      void load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to queue due reminders");
    } finally {
      setSendingDue(false);
    }
  };

  const sendReminder = async (r: RefillReminder) => {
    setSendingRowId(r.id);
    try {
      await warnIfUnconfigured(dueChannel);
      await refillsApi.send(r.id, dueChannel);
      toast.success("Reminder queued", { description: r.medicineName });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to queue reminder");
    } finally {
      setSendingRowId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />Loading refills…
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <BellRing className="h-5 w-5 text-primary" />Patient Follow-ups
            {dueCount > 0 && <Badge variant="destructive">{dueCount} due</Badge>}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Start building relationship with your customers</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input value={search} data-refill-search onChange={(e) => setSearch(e.target.value)} placeholder="Search patient/medicine…  ( / )" className="h-9 w-52 pl-8 text-sm" />
          </div>
          <div className="flex items-center gap-1.5">
            <Select value={dueChannel} onValueChange={(v) => setDueChannel(v as MessageChannel)}>
              <SelectTrigger className="h-9 w-28 text-xs" title="Channel for sending reminders"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => void handleSendDue()} disabled={sendingDue || dueCount === 0} title="Queue reminders for every due row">
              {sendingDue ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Send due reminders
            </Button>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />New Reminder</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Monthly refill reminder</DialogTitle>
                <DialogDescription>Reminds you when a patient's medicine course runs out.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Medicine *</Label>
                  <Input value={form.medicineName} onChange={(e) => setForm({ ...form, medicineName: e.target.value })} placeholder="e.g. Metformin 500mg" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Patient name</Label>
                  <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Patient" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} placeholder="Phone" inputMode="tel" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Last purchased</Label>
                  <Input type="date" value={form.lastPurchaseDate} onChange={(e) => setForm({ ...form, lastPurchaseDate: e.target.value })} className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Remind after</Label>
                  <Select value={String(form.daysAfter)} onValueChange={(v) => setForm({ ...form, daysAfter: Number(v) })}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CYCLE_OPTIONS.map((c) => <SelectItem key={c.days} value={String(c.days)}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Notes</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. 1 strip daily" className="mt-1 h-9" />
                </div>
              </div>
              <Button onClick={handleSave} disabled={saving || !form.medicineName.trim()} className="mt-3">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                Set Reminder
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex shrink-0 gap-1.5">
        {/* LocalWell's Arriving / Expired vocabulary — same due/upcoming semantics */}
        {(["all", "due", "upcoming", "done"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="h-7 text-xs" onClick={() => setFilter(f)}>
            {f === "due" && dueCount > 0 ? `Expired (${dueCount})` : f === "due" ? "Expired" : f === "upcoming" ? "Arriving" : f === "all" ? "All" : "Done"}
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {filtered.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No Followups Found!" description="Set a monthly reminder when a chronic patient buys — the repeat sale comes to you." />
        ) : (
          filtered.map((r, idx) => {
            const d = daysUntil(r.reminderDate);
            const due = r.status === "pending" && d <= 0;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                className={`flex items-center gap-3 rounded-sm border p-3 ${due ? "border-red-300/70 bg-red-50/40" : "border-border/60"}`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${due ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary"}`}>
                  <Pill className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.medicineName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.customerName || "Walk-in"}{r.customerPhone ? ` · ${r.customerPhone}` : ""}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-xs font-semibold tabular-nums ${due ? "text-red-600" : d <= 7 ? "text-amber-600" : "text-muted-foreground"}`}>
                    {due ? (d === 0 ? "Due today" : `${Math.abs(d)}d overdue`) : `in ${d}d`}
                  </p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">{new Date(r.reminderDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                </div>
                {r.status === "pending" && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      title={`Send ${dueChannel} reminder${r.customerPhone ? ` to ${r.customerPhone}` : ""}`}
                      disabled={sendingRowId === r.id}
                      onClick={() => void sendReminder(r)}
                    >
                      {sendingRowId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                    {r.customerPhone && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" title={`Call ${r.customerPhone}`} onClick={() => window.open(`tel:${r.customerPhone}`, "_self")}>
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void markDone(r.id, "completed")}>
                      <Check className="h-3.5 w-3.5 mr-1" />Refilled
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => void handleDelete(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                {r.status !== "pending" && (
                  <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">{r.status}</Badge>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
