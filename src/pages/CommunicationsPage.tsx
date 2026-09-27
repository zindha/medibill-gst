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
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  messagesApi,
  settingsApi,
  type CommunicationPreference,
  type MessageChannel,
  type MessageDelivery,
} from "@/lib/api";

type ProviderHealth = { whatsapp: boolean; sms: boolean; email: boolean };

const CHANNEL_ENV_HINT: Record<MessageChannel, string> = {
  whatsapp: "Set WHATSAPP_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID in server .env",
  sms: "Set SMS_WEBHOOK_URL in server .env",
  email: "Set EMAIL_WEBHOOK_URL in server .env",
};

const TEMPLATE_OPTIONS = [
  { id: "invoice_share", label: "Invoice share" },
  { id: "refill_reminder", label: "Refill reminder" },
  { id: "payment_due", label: "Payment due" },
  { id: "custom", label: "Custom message" },
];

/**
 * Override-able templates (server: `MESSAGE_TEMPLATES` in
 * services/messaging.ts — `custom` is excluded because its body always comes
 * from the composer). Defaults mirror the server so the editor shows the
 * effective text before anything is saved.
 */
const TEMPLATE_DEFS: Array<{ id: string; label: string; defaultBody: string }> = [
  {
    id: "invoice_share",
    label: "Invoice share",
    defaultBody:
      "Hi {customerName}! Invoice {invoiceNo} (₹{amount}) from {storeName}. {invoiceUrl} — thank you!",
  },
  {
    id: "refill_reminder",
    label: "Refill reminder",
    defaultBody:
      "Hi {customerName}, it's time to refill {medicineName}. Reply or visit us for the next pack.",
  },
  {
    id: "payment_due",
    label: "Payment due",
    defaultBody: "Hi {customerName}, ₹{amount} is due on your account at {storeName}.",
  },
];

/** `{tokens}` documented for one default body (missing tokens render empty). */
function tokensIn(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\{(\w+)\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

function statusPill(status: string, error?: string | null) {
  const cls: Record<string, string> = {
    queued: "border-amber-300/70 bg-amber-50 text-amber-700",
    sending: "border-sky-300/70 bg-sky-50 text-sky-700",
    sent: "border-green-300/70 bg-green-50 text-green-700",
    failed: "border-red-300/70 bg-red-50 text-red-700",
    opted_out: "border-border/70 bg-muted text-muted-foreground",
  };
  return (
    <span
      title={error || undefined}
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] leading-none capitalize",
        cls[status] ?? "border-border/70 bg-muted text-muted-foreground"
      )}
    >
      {status.replace("_", " ")}
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

function aggregateLink(row: MessageDelivery): { label: string; to?: string } {
  if (row.aggregateType === "invoice") return { label: row.aggregateId ?? "invoice", to: "/dashboard/invoices" };
  if (row.aggregateType === "refill") return { label: row.aggregateId ?? "refill", to: "/dashboard/refills" };
  return { label: row.aggregateType ? `${row.aggregateType}:${row.aggregateId}` : "—" };
}

export default function CommunicationsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState("history");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderHealth | null>(null);
  const [rows, setRows] = useState<MessageDelivery[]>([]);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Composer
  const [sending, setSending] = useState(false);
  const [composeChannel, setComposeChannel] = useState<MessageChannel>("whatsapp");
  const [template, setTemplate] = useState("invoice_share");
  const [recipient, setRecipient] = useState("");
  const [customerId, setCustomerId] = useState<string>("none");
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone?: string | null }>>([]);
  const [customBody, setCustomBody] = useState("");
  const [variablesJson, setVariablesJson] = useState("{\n  \"customerName\": \"\"\n}");

  // Preferences
  const [prefs, setPrefs] = useState<CommunicationPreference[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefCustomerId, setPrefCustomerId] = useState("none");
  const [prefChannel, setPrefChannel] = useState<MessageChannel>("whatsapp");
  const [prefOptedOut, setPrefOptedOut] = useState(true);
  const [savingPref, setSavingPref] = useState(false);

  // Templates (settings key `message_templates` — per-key merge on save)
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, string>>({});
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, string>>({});
  const [templateSaving, setTemplateSaving] = useState<string | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [health, history, customerList] = await Promise.all([
        messagesApi.providers().catch(() => ({ whatsapp: false, sms: false, email: false })),
        messagesApi.history({ limit: 100 }).catch(() => ({ data: [] as MessageDelivery[], body: {} as any })),
        import("@/lib/api").then((m) => m.customersApi.list({ limit: 200 })).catch(() => []),
      ]);
      setProviders(health);
      setRows(Array.isArray(history.data) ? history.data : []);
      const list = Array.isArray(customerList) ? customerList : ((customerList as any)?.data ?? []);
      setCustomers(list.map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })));
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to load communications");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPrefs = useCallback(async () => {
    setPrefsLoading(true);
    try {
      setPrefs(await messagesApi.preferences());
    } catch {
      toast.error("Failed to load communication preferences");
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  /** Read the stored per-template overrides (defaults show when absent). */
  const loadTemplates = useCallback(async () => {
    setTemplatesError(null);
    try {
      const res = await settingsApi.get("message_templates");
      const value = res?.value;
      const overrides: Record<string, string> = {};
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (typeof v === "string") overrides[k] = v;
        }
      }
      setTemplateOverrides(overrides);
      setTemplateDrafts({});
    } catch (err: any) {
      setTemplatesError(err?.message ?? "Could not load template overrides");
    }
  }, []);

  /**
   * Save ONE template — the settings route merges the partial object into the
   * stored JSON, so the other overrides are never clobbered.
   */
  const saveTemplate = async (id: string, body: string) => {
    setTemplateSaving(id);
    try {
      await settingsApi.set("message_templates", { [id]: body });
      setTemplateOverrides((prev) => ({ ...prev, [id]: body }));
      setTemplateDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success("Template saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save the template");
    } finally {
      setTemplateSaving(null);
    }
  };

  /** Remove the override for ONE template — the built-in default takes over. */
  const resetTemplate = async (id: string) => {
    setTemplateSaving(id);
    try {
      await settingsApi.set("message_templates", { [id]: null });
      setTemplateOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setTemplateDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success("Reset to the default template");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not reset the template");
    } finally {
      setTemplateSaving(null);
    }
  };

  useEffect(() => { if (isAuthenticated) { void load(); void loadPrefs(); } }, [isAuthenticated, load, loadPrefs]);
  // Deferred (setTimeout) so the effect body never sets state synchronously.
  useEffect(() => {
    if (!isAuthenticated) return;
    const t = setTimeout(() => void loadTemplates(), 0);
    return () => clearTimeout(t);
  }, [isAuthenticated, loadTemplates]);
  useEffect(() => { if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true }); }, [authLoading, isAuthenticated, navigate]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (channelFilter !== "all" && r.channel !== channelFilter) return false;
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        return true;
      }),
    [rows, channelFilter, statusFilter]
  );

  const handleRetry = async (row: MessageDelivery) => {
    try {
      await messagesApi.retry(row.id);
      toast.success("Message re-queued");
      void load();
    } catch (err: any) {
      toast.error(err?.message ?? "Retry failed");
    }
  };

  const handleSend = async () => {
    if (!recipient.trim() && customerId === "none") {
      toast.error("Enter a recipient or pick a customer");
      return;
    }
    setSending(true);
    try {
      let variables: Record<string, unknown> = {};
      if (template === "custom") {
        if (!customBody.trim()) { toast.error("Message body is required"); setSending(false); return; }
        variables = { body: customBody };
      } else if (variablesJson.trim()) {
        try {
          variables = JSON.parse(variablesJson);
        } catch {
          toast.error("Variables must be valid JSON");
          setSending(false);
          return;
        }
      }
      const result = await messagesApi.send({
        channel: composeChannel,
        recipient: recipient.trim() || undefined,
        customerId: customerId !== "none" ? customerId : undefined,
        template,
        variables,
      });
      if (result.status === "opted_out") {
        toast.warning("Customer has opted out — message recorded, not sent");
      } else {
        toast.success("Message queued for delivery");
      }
      setRecipient("");
      setCustomBody("");
      void load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to queue message");
    } finally {
      setSending(false);
    }
  };

  const handleSavePref = async () => {
    if (prefCustomerId === "none") { toast.error("Pick a customer"); return; }
    setSavingPref(true);
    try {
      await messagesApi.setPreference({ customerId: prefCustomerId, channel: prefChannel, optedOut: prefOptedOut });
      toast.success(prefOptedOut ? "Opt-out saved" : "Consent saved");
      setPrefCustomerId("none");
      void loadPrefs();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save preference");
    } finally {
      setSavingPref(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />Loading communications…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <MessageSquare className="h-5 w-5 text-primary" />Communications
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Send invoices and refill reminders over WhatsApp, SMS or email — with consent controls.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      {/* Provider health banner — env presence only, never secret values */}
      <div className="flex shrink-0 flex-wrap gap-2">
        {(["whatsapp", "sms", "email"] as MessageChannel[]).map((ch) => {
          const ok = providers?.[ch];
          return (
            <div
              key={ch}
              title={ok ? `${ch} configured` : CHANNEL_ENV_HINT[ch]}
              className={cn(
                "flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs",
                ok ? "border-green-300/70 bg-green-50 text-green-800" : "border-amber-300/70 bg-amber-50 text-amber-800"
              )}
            >
              {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              <span className="font-medium capitalize">{ch}</span>
              <span className="text-[11px]">{ok ? "Configured" : CHANNEL_ENV_HINT[ch]}</span>
            </div>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabsList className="shrink-0">
          <TabsTrigger value="history" className="text-xs gap-1"><MessageSquare className="h-3.5 w-3.5" />History</TabsTrigger>
          <TabsTrigger value="compose" className="text-xs gap-1"><Send className="h-3.5 w-3.5" />Compose</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" />Templates</TabsTrigger>
          <TabsTrigger value="preferences" className="text-xs gap-1"><Settings2 className="h-3.5 w-3.5" />Preferences</TabsTrigger>
        </TabsList>

        {/* ---------------- History ---------------- */}
        <TabsContent value="history" className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 gap-1.5">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Channel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="opted_out">Opted out</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border/60 bg-card">
            {filtered.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={MessageSquare}
                  title="No messages yet"
                  description="Share an invoice from the Invoices page or send a refill reminder to get started."
                />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 font-medium">Recipient</th>
                    <th className="px-3 py-2 font-medium">Template</th>
                    <th className="px-3 py-2 font-medium">Aggregate</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="w-24 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const agg = aggregateLink(row);
                    return (
                      <tr key={row.id} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3 py-2">{channelBadge(row.channel)}</td>
                        <td className="max-w-[160px] truncate px-3 py-2 text-xs">{row.recipient}</td>
                        <td className="px-3 py-2 text-xs">{row.template}</td>
                        <td className="px-3 py-2 text-xs">
                          {agg.to ? (
                            <button type="button" className="text-primary hover:underline" onClick={() => navigate(agg.to!)}>
                              {agg.label.slice(0, 12)}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">{agg.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{statusPill(row.status, row.error)}</td>
                        <td className="px-3 py-2 text-right">
                          {row.status === "failed" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void handleRetry(row)}>
                              <RefreshCw className="h-3 w-3 mr-1" />Retry
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* ---------------- Compose ---------------- */}
        <TabsContent value="compose" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <Card className="max-w-2xl border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-4 w-4 text-muted-foreground" />Send a message
              </CardTitle>
              <CardDescription>
                Queues through the outbox worker — delivery depends on provider configuration above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Channel</Label>
                  <Select value={composeChannel} onValueChange={(v) => setComposeChannel(v as MessageChannel)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Template</Label>
                  <Select value={template} onValueChange={setTemplate}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_OPTIONS.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Customer (fills phone)</Label>
                  <Select value={customerId} onValueChange={(v) => {
                    setCustomerId(v);
                    const c = customers.find((x) => x.id === v);
                    if (c?.phone) setRecipient(c.phone);
                  }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Pick a customer…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Manual recipient —</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Recipient {composeChannel === "email" ? "email" : "phone"}</Label>
                  <Input
                    className="h-9"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder={composeChannel === "email" ? "name@example.com" : "+91 98765 43210"}
                  />
                </div>
              </div>

              {template === "custom" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Message body</Label>
                  <Textarea
                    className="min-h-[100px] font-mono text-xs"
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    placeholder="Type the exact message to send…"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">Variables (JSON)</Label>
                  <Textarea
                    className="min-h-[110px] font-mono text-xs"
                    value={variablesJson}
                    onChange={(e) => setVariablesJson(e.target.value)}
                    placeholder='{"customerName": "Asha", "amount": "250.00"}'
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Available: customerName, amount, invoiceNo, invoiceUrl, medicineName, storeName (defaults from settings).
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => void handleSend()} disabled={sending}>
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  Queue message
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Templates ---------------- */}
        <TabsContent value="templates" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Overrides live in settings key{" "}
              <span className="font-mono">message_templates</span> and are merged over the
              built-in defaults — saving or resetting one template never changes the others.
              Missing <span className="font-mono">{"{tokens}"}</span> render as empty strings.
            </p>
            {templatesError && (
              <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
                {templatesError}
              </p>
            )}
            {TEMPLATE_DEFS.map((t) => {
              const effective = templateOverrides[t.id] ?? t.defaultBody;
              const draft = templateDrafts[t.id] ?? effective;
              const modified = templateOverrides[t.id] !== undefined;
              const dirty = draft !== effective;
              const saving = templateSaving === t.id;
              const tokens = tokensIn(t.defaultBody);
              return (
                <Card key={t.id} className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {t.label}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {modified ? "Overridden" : "Default"}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="font-mono text-[11px]">
                      {tokens.length > 0 ? `Tokens: ${tokens.map((tok) => `{${tok}}`).join(" ")}` : "No tokens"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Textarea
                      value={draft}
                      onChange={(e) =>
                        setTemplateDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))
                      }
                      rows={3}
                      className="font-mono text-xs"
                      aria-label={`${t.label} message body`}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] text-muted-foreground">
                        {modified ? "Saved override in use." : "Using the built-in default."}
                      </p>
                      <div className="flex gap-2">
                        {modified && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void resetTemplate(t.id)}
                            disabled={saving}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" /> Reset to default
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => void saveTemplate(t.id, draft)}
                          disabled={saving || !dirty}
                        >
                          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {dirty ? "Save" : "Saved"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <p className="text-[11px] text-muted-foreground">
              The <span className="font-mono">custom</span> template always uses the body typed in
              the Compose tab — it has no override here.
            </p>
          </div>
        </TabsContent>

        {/* ---------------- Preferences ---------------- */}
        <TabsContent value="preferences" className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <Card className="shrink-0 border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-muted-foreground" />Set consent
              </CardTitle>
              <CardDescription>Opted-out customers are never queued — the block is enforced server-side.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 space-y-1.5">
                <Label className="text-xs">Customer</Label>
                <Select value={prefCustomerId} onValueChange={setPrefCustomerId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pick a customer…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pick a customer…</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36 space-y-1.5">
                <Label className="text-xs">Channel</Label>
                <Select value={prefChannel} onValueChange={(v) => setPrefChannel(v as MessageChannel)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch checked={prefOptedOut} onCheckedChange={setPrefOptedOut} id="opted-out" />
                <Label htmlFor="opted-out" className="text-xs cursor-pointer">
                  {prefOptedOut ? "Opted out" : "Consented"}
                </Label>
              </div>
              <Button size="sm" onClick={() => void handleSavePref()} disabled={savingPref || prefCustomerId === "none"}>
                {savingPref ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                Save
              </Button>
            </CardContent>
          </Card>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border/60 bg-card">
            {prefsLoading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Loading preferences…
              </div>
            ) : prefs.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Settings2}
                  title="No preferences yet"
                  description="Record who opted out of WhatsApp, SMS or email — sending respects it automatically."
                />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 font-medium">State</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {prefs.map((p) => (
                    <tr key={p.id} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs font-medium">{p.customerName ?? p.customerId ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{p.customerPhone ?? "—"}</td>
                      <td className="px-3 py-2">{channelBadge(p.channel)}</td>
                      <td className="px-3 py-2">
                        {p.optedOut ? (
                          <Badge variant="secondary" className="text-[10px] text-red-700">Opted out</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] text-green-700">Consented</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
