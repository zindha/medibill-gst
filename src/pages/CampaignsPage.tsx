import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  Megaphone,
  Percent,
  Plus,
  RefreshCw,
  Send,
  Tag,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  engagementApi,
  medicinesApi,
  type Campaign,
  type CampaignAudience,
  type CampaignStats,
  type MessageChannel,
  type Offer,
} from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
  draft: "border-border/70 bg-muted text-muted-foreground",
  scheduled: "border-sky-300/70 bg-sky-50 text-sky-700",
  done: "border-green-300/70 bg-green-50 text-green-700",
  cancelled: "border-red-300/70 bg-red-50 text-red-700",
};

const TEMPLATE_OPTIONS = [
  { id: "custom", label: "Custom message" },
  { id: "invoice_share", label: "Invoice share" },
  { id: "refill_reminder", label: "Refill reminder" },
  { id: "payment_due", label: "Payment due" },
];

const AUDIENCE_OPTIONS = [
  { id: "all", label: "All customers" },
  { id: "rfm", label: "RFM score at least" },
  { id: "medicine", label: "Bought a medicine" },
  { id: "balance", label: "Outstanding balance" },
  { id: "refill", label: "Refill due soon" },
];

const isoDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString().split("T")[0];

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] leading-none capitalize",
        STATUS_STYLES[status] ?? STATUS_STYLES.draft
      )}
    >
      {status}
    </span>
  );
}

function channelBadge(channel: string) {
  const cls: Record<string, string> = {
    whatsapp: "border-green-300/70 bg-green-50 text-green-700",
    sms: "border-sky-300/70 bg-sky-50 text-sky-700",
    email: "border-violet-300/70 bg-violet-50 text-violet-700",
  };
  return (
    <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] leading-none uppercase", cls[channel] ?? "")}>
      {channel}
    </span>
  );
}

function audienceLabel(raw: string): string {
  try {
    const a = JSON.parse(raw) as CampaignAudience;
    switch (a.type) {
      case "all":
        return "All customers";
      case "rfm":
        return `RFM ≥ ${a.minScore}`;
      case "medicine":
        return `Bought medicine${a.withinDays ? ` (${a.withinDays}d)` : ""}`;
      case "balance":
        return `Balance ≥ ₹${a.minAmount}`;
      case "refill":
        return `Refill due in ${a.withinDays}d`;
      default:
        return "Unknown audience";
    }
  } catch {
    return "Unknown audience";
  }
}

function statsLabel(raw: string | null | undefined): CampaignStats | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.queued === "number" ? (parsed as CampaignStats) : null;
  } catch {
    return null;
  }
}

/** Search-as-you-type medicine picker (used by the audience + offer forms). */
function MedicinePicker({
  value,
  valueId,
  onPick,
  placeholder,
}: {
  value: string;
  valueId?: string;
  onPick: (med: { id: string; name: string } | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    setOpen(true);
    if (!q.trim()) { setResults([]); onPick(null); return; }
    setSearching(true);
    try {
      const res = await medicinesApi.list({ search: q, limit: 8 });
      const list = Array.isArray(res) ? res : (res as any)?.data ?? [];
      setResults(list);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => void search(e.target.value)}
        onFocus={() => query && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Search medicine…"}
        className="h-8 text-sm"
        aria-label={placeholder ?? "Search medicine"}
      />
      {open && (searching || results.length > 0) && (
        <div className="absolute z-20 mt-1 w-full rounded-sm border border-border bg-background shadow-md">
          {searching && <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>}
          {!searching &&
            results.map((m) => (
              <button
                key={m.id}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-secondary"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQuery(m.name);
                  setOpen(false);
                  onPick({ id: m.id, name: m.name });
                }}
              >
                {m.name}
                {m.brand ? <span className="text-muted-foreground"> · {m.brand}</span> : null}
              </button>
            ))}
        </div>
      )}
      {valueId && !query && (
        <span className="text-[11px] text-muted-foreground">Selected: {value}</span>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);

  // Campaign form
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    channel: "whatsapp" as MessageChannel,
    template: "custom",
    body: "",
    scheduleAt: "",
    audienceType: "all",
    rfmMinScore: 10,
    balanceMin: 0,
    refillDays: 7,
    withinDays: 30,
    medicineId: "",
    medicineName: "",
  });
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [lastStats, setLastStats] = useState<(CampaignStats & { name: string }) | null>(null);

  // Offer form
  const [offerForm, setOfferForm] = useState({
    name: "",
    type: "fixed" as "fixed" | "percent",
    value: 0,
    minAmount: 0,
    startsOn: isoDate(0),
    endsOn: isoDate(30),
    medicineId: "",
    medicineName: "",
    isActive: true,
  });
  const [savingOffer, setSavingOffer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [campaignList, offerList] = await Promise.all([
        engagementApi.listCampaigns().catch(() => [] as Campaign[]),
        engagementApi.listOffers().catch(() => [] as Offer[]),
      ]);
      setCampaigns(Array.isArray(campaignList) ? campaignList : []);
      setOffers(Array.isArray(offerList) ? offerList : []);
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAuthenticated) void load(); }, [isAuthenticated, load]);
  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  const buildAudience = (): CampaignAudience => {
    switch (form.audienceType) {
      case "rfm":
        return { type: "rfm", minScore: Number(form.rfmMinScore) || 0 };
      case "medicine":
        return {
          type: "medicine",
          medicineId: form.medicineId,
          withinDays: Number(form.withinDays) || undefined,
        };
      case "balance":
        return { type: "balance", minAmount: Number(form.balanceMin) || 0 };
      case "refill":
        return { type: "refill", withinDays: Number(form.refillDays) || 7 };
      default:
        return { type: "all" };
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Campaign name is required"); return; }
    if (form.audienceType === "medicine" && !form.medicineId) {
      toast.error("Pick the medicine for this audience");
      return;
    }
    setCreating(true);
    try {
      await engagementApi.createCampaign({
        name: form.name.trim(),
        channel: form.channel,
        template: form.template,
        body: form.body,
        audience: buildAudience(),
        scheduleAt: form.scheduleAt ? new Date(form.scheduleAt).toISOString() : null,
      });
      toast.success("Campaign created as draft");
      setForm({ ...form, name: "", body: "", scheduleAt: "", medicineId: "", medicineName: "" });
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async (campaign: Campaign) => {
    setBusyCampaignId(campaign.id);
    try {
      const stats = await engagementApi.sendCampaign(campaign.id);
      setLastStats({ ...stats, name: campaign.name });
      toast.success(
        `Queued ${stats.queued} message${stats.queued === 1 ? "" : "s"}` +
          (stats.skippedOptOut || stats.skippedNoContact
            ? ` · skipped ${stats.skippedOptOut} opted-out, ${stats.skippedNoContact} unreachable`
            : "")
      );
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send campaign");
    } finally {
      setBusyCampaignId(null);
    }
  };

  const handleCancel = async (campaign: Campaign) => {
    setBusyCampaignId(campaign.id);
    try {
      await engagementApi.cancelCampaign(campaign.id);
      toast.success("Campaign cancelled");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to cancel campaign");
    } finally {
      setBusyCampaignId(null);
    }
  };

  const handleCreateOffer = async () => {
    if (!offerForm.name.trim()) { toast.error("Offer name is required"); return; }
    if (!(Number(offerForm.value) > 0)) { toast.error("Offer value must be greater than 0"); return; }
    setSavingOffer(true);
    try {
      await engagementApi.createOffer({
        name: offerForm.name.trim(),
        type: offerForm.type,
        value: Number(offerForm.value),
        medicineId: offerForm.medicineId || null,
        minAmount: Number(offerForm.minAmount) || 0,
        startsOn: offerForm.startsOn,
        endsOn: offerForm.endsOn,
        isActive: offerForm.isActive,
      });
      toast.success("Offer created");
      setOfferForm({
        ...offerForm,
        name: "",
        value: 0,
        minAmount: 0,
        medicineId: "",
        medicineName: "",
      });
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create offer");
    } finally {
      setSavingOffer(false);
    }
  };

  const toggleOffer = async (offer: Offer) => {
    try {
      await engagementApi.updateOffer(offer.id, { isActive: !offer.isActive });
      toast.success(offer.isActive ? "Offer deactivated" : "Offer activated");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update offer");
    }
  };

  if (!isAuthenticated && !authLoading) { navigate("/auth"); return null; }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" /> Campaigns & Offers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Audience-targeted messages through the messaging outbox, plus bill and product offers.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Refresh
        </Button>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {loadError}
        </div>
      )}

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
        </TabsList>

        {/* ───────────────────────── Campaigns ───────────────────────── */}
        <TabsContent value="campaigns" className="space-y-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">New campaign</CardTitle>
              <CardDescription>
                The audience is resolved when you press Send — opt-outs and customers without a
                reachable contact are skipped automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Monsoon wellness tips"
                  className="mt-1 h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Channel</Label>
                  <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v as MessageChannel })}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Template</Label>
                  <Select value={form.template} onValueChange={(v) => setForm({ ...form, template: v })}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_OPTIONS.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs">Message body</Label>
                <Textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Hi {customerName}, visit {storeName} for your monthly refill."
                  className="mt-1 text-sm"
                  rows={3}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tokens: <code>{"{customerName}"}</code>, <code>{"{storeName}"}</code> — rendered per recipient.
                </p>
              </div>

              <div>
                <Label className="text-xs">Audience</Label>
                <Select value={form.audienceType} onValueChange={(v) => setForm({ ...form, audienceType: v })}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.audienceType === "rfm" && (
                <div>
                  <Label className="text-xs">Minimum RFM score (3–15)</Label>
                  <Input
                    type="number"
                    min={3}
                    max={15}
                    value={form.rfmMinScore}
                    onChange={(e) => setForm({ ...form, rfmMinScore: Number(e.target.value) })}
                    className="mt-1 h-9"
                  />
                </div>
              )}
              {form.audienceType === "balance" && (
                <div>
                  <Label className="text-xs">Minimum balance (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.balanceMin}
                    onChange={(e) => setForm({ ...form, balanceMin: Number(e.target.value) })}
                    className="mt-1 h-9"
                  />
                </div>
              )}
              {form.audienceType === "refill" && (
                <div>
                  <Label className="text-xs">Refill due within (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.refillDays}
                    onChange={(e) => setForm({ ...form, refillDays: Number(e.target.value) })}
                    className="mt-1 h-9"
                  />
                </div>
              )}
              {form.audienceType === "medicine" && (
                <>
                  <div>
                    <Label className="text-xs">Medicine *</Label>
                    <MedicinePicker
                      value={form.medicineName}
                      valueId={form.medicineId}
                      onPick={(med) =>
                        setForm({ ...form, medicineId: med?.id ?? "", medicineName: med?.name ?? "" })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Bought within (days, optional)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.withinDays}
                      onChange={(e) => setForm({ ...form, withinDays: Number(e.target.value) })}
                      className="mt-1 h-9"
                    />
                  </div>
                </>
              )}

              <div>
                <Label className="text-xs">Schedule (optional)</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduleAt}
                  onChange={(e) => setForm({ ...form, scheduleAt: e.target.value })}
                  className="mt-1 h-9"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => void handleCreate()} disabled={creating} className="w-full sm:w-auto">
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Create campaign
                </Button>
              </div>
            </CardContent>
          </Card>

          {lastStats && (
            <div className="rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              <strong>{lastStats.name}</strong>: audience {lastStats.audience}, queued {lastStats.queued},
              skipped {lastStats.skippedOptOut} opted-out + {lastStats.skippedNoContact} unreachable.
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading campaigns…
            </div>
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No campaigns yet"
              description="Create your first audience-targeted message — opt-outs are always respected."
            />
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => {
                const stats = statsLabel(c.stats);
                const busy = busyCampaignId === c.id;
                return (
                  <div key={c.id} className="rounded-sm border border-border/60 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{c.name}</span>
                        {channelBadge(c.channel)}
                        <StatusPill status={c.status} />
                        {c.scheduleAt && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <CalendarClock className="h-3 w-3" />
                            {new Date(c.scheduleAt).toLocaleString()}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {audienceLabel(c.audience)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.status !== "cancelled" && (
                          <Button
                            size="sm"
                            variant={c.status === "done" ? "outline" : "default"}
                            className="h-7 text-xs"
                            disabled={busy}
                            onClick={() => void handleSend(c)}
                          >
                            {busy ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Send className="h-3 w-3 mr-1" />
                            )}
                            {c.status === "done" ? "Resend" : c.status === "scheduled" ? "Send now" : "Send"}
                          </Button>
                        )}
                        {(c.status === "draft" || c.status === "scheduled") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            disabled={busy}
                            onClick={() => void handleCancel(c)}
                          >
                            <XCircle className="h-3 w-3 mr-1" />Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                    {c.body && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.body}</p>
                    )}
                    {stats && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        audience {stats.audience} · queued {stats.queued} · skipped {stats.skippedOptOut}{" "}
                        opted-out · {stats.skippedNoContact} unreachable
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ───────────────────────── Offers ───────────────────────── */}
        <TabsContent value="offers" className="space-y-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">New offer</CardTitle>
              <CardDescription>
                Applied automatically at billing when the bill matches the window, minimum amount and
                (optionally) the medicine.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Offer name *</Label>
                <Input
                  value={offerForm.name}
                  onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })}
                  placeholder="e.g. Festive ₹50 off"
                  className="mt-1 h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={offerForm.type}
                    onValueChange={(v) => setOfferForm({ ...offerForm, type: v as "fixed" | "percent" })}
                  >
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed ₹</SelectItem>
                      <SelectItem value="percent">Percent %</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{offerForm.type === "fixed" ? "Value (₹)" : "Value (%)"}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={offerForm.value}
                    onChange={(e) => setOfferForm({ ...offerForm, value: Number(e.target.value) })}
                    className="mt-1 h-9"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Minimum bill (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={offerForm.minAmount}
                  onChange={(e) => setOfferForm({ ...offerForm, minAmount: Number(e.target.value) })}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Starts on</Label>
                <Input
                  type="date"
                  value={offerForm.startsOn}
                  onChange={(e) => setOfferForm({ ...offerForm, startsOn: e.target.value })}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Ends on</Label>
                <Input
                  type="date"
                  value={offerForm.endsOn}
                  onChange={(e) => setOfferForm({ ...offerForm, endsOn: e.target.value })}
                  className="mt-1 h-9"
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs">Specific medicine (optional — empty = whole bill)</Label>
                <MedicinePicker
                  value={offerForm.medicineName}
                  valueId={offerForm.medicineId}
                  onPick={(med) =>
                    setOfferForm({ ...offerForm, medicineId: med?.id ?? "", medicineName: med?.name ?? "" })
                  }
                  placeholder="Whole bill (no medicine filter)"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Switch
                  checked={offerForm.isActive}
                  onCheckedChange={(v) => setOfferForm({ ...offerForm, isActive: v })}
                  aria-label="Offer active"
                />
                <span className="text-xs text-muted-foreground">Active</span>
              </div>

              <div className="sm:col-span-3">
                <Button onClick={() => void handleCreateOffer()} disabled={savingOffer}>
                  {savingOffer ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Tag className="h-3.5 w-3.5 mr-1.5" />}
                  Create offer
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading offers…
            </div>
          ) : offers.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No offers yet"
              description="Fixed or percentage discounts with a validity window — picked up automatically at billing."
            />
          ) : (
            <div className="space-y-2">
              {offers.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border/60 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{o.name}</span>
                    <span className="inline-flex items-center gap-1 rounded-sm border border-border/70 bg-muted px-1.5 py-0.5 text-[11px]">
                      {o.type === "percent" ? <Percent className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
                      {o.type === "percent" ? `${o.value}%` : `₹${o.value}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {o.startsOn} → {o.endsOn}
                      {Number(o.minAmount) > 0 ? ` · min ₹${o.minAmount}` : ""}
                      {o.medicineId ? " · specific medicine" : " · whole bill"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] leading-none",
                        o.isActive
                          ? "border-green-300/70 bg-green-50 text-green-700"
                          : "border-border/70 bg-muted text-muted-foreground"
                      )}
                    >
                      {o.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={!!o.isActive} onCheckedChange={() => void toggleOffer(o)} aria-label={`Toggle ${o.name}`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
