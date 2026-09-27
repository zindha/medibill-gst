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
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type IntegrationDetail,
  type IntegrationHealth,
  integrationsApi,
} from "@/lib/api";
import {
  AlertTriangle,
  Cloud,
  Loader2,
  Plug,
  RefreshCcw,
  ShoppingBag,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

/**
 * Integrations Center (Task 17) — one card per registry provider, a dynamic
 * configure dialog driven by the server's field definitions, and honest
 * status pills (Connected / Disabled / Not connected + env|settings|fake mode).
 * Secrets are write-only here: the server redacts them to "•••" and the form
 * shows a "••• saved" placeholder instead of any value.
 */

const MODE_LABEL: Record<string, string> = {
  settings: "settings",
  env: "env",
  fake: "fake",
};

function statusOf(p: IntegrationHealth): { label: string; tone: string } {
  if (p.connected) return { label: "Connected", tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
  if (p.connectedAt && !p.enabled) return { label: "Disabled", tone: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
  return { label: "Not connected", tone: "bg-muted text-muted-foreground border-border" };
}

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<IntegrationHealth[]>([]);
  const [summary, setSummary] = useState<{ connected: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IntegrationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await integrationsApi.list();
      setProviders(data.providers ?? []);
      setSummary(data.summary ?? null);
    } catch (err: any) {
      setError(err?.message ?? "Could not load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openConfigure = useCallback(async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setValues({});
    setDetailLoading(true);
    try {
      const d = await integrationsApi.get(id);
      setDetail(d);
      const next: Record<string, string> = {};
      for (const field of d.fields) {
        // Secrets are never returned — the placeholder signals "saved".
        next[field.key] = field.secret ? "" : (d.config[field.key] ?? "");
      }
      setValues(next);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load configuration");
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const save = async () => {
    if (!openId || !detail) return;
    setSaving(true);
    try {
      const config: Record<string, string> = {};
      const secrets: Record<string, string> = {};
      for (const field of detail.fields) {
        const value = (values[field.key] ?? "").trim();
        // Empty inputs keep the previously saved value (secrets are write-only).
        if (!value) continue;
        if (field.secret) secrets[field.key] = value;
        else config[field.key] = value;
      }
      await integrationsApi.connect(openId, { config, secrets, enabled: true });
      toast.success(`${detail.name} connected`);
      setOpenId(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save configuration");
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!openId || !detail) return;
    setSaving(true);
    try {
      await integrationsApi.disconnect(openId);
      toast.success(`${detail.name} disconnected — configuration forgotten`);
      setOpenId(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not disconnect");
    } finally {
      setSaving(false);
    }
  };

  const toggleOnlineOrders = async (enabled: boolean) => {
    setBusy("online_orders");
    try {
      await integrationsApi.connect("online_orders", { enabled });
      toast.success(enabled ? "Online ordering enabled" : "Online ordering disabled");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update online ordering");
    } finally {
      setBusy(null);
    }
  };

  const openDetail = providers.find((p) => p.id === openId) ?? null;

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
          <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect messaging, GST compliance, backup and storefront services
          </p>
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <Badge variant="secondary" className="w-fit">
              {summary.connected}/{summary.total} connected
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load integrations"
          description={error}
          actions={[{ label: "Retry", onClick: () => void load() }]}
        />
      ) : providers.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No integrations registered"
          description="The provider registry is empty — this is unexpected, try refreshing."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {providers.map((p) => {
            const status = statusOf(p);
            return (
              <Card key={p.id} className="p-4 border-border/60 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {p.category}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {p.mode && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {MODE_LABEL[p.mode] ?? p.mode}
                    </Badge>
                  )}
                  {p.id === "google_drive" && p.detail?.email && (
                    <Badge variant="outline" className="text-[10px]">
                      {p.detail.email}
                    </Badge>
                  )}
                  {p.missingEnv.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      set {p.missingEnv.join(", ")}
                    </span>
                  )}
                </div>

                {p.id === "online_orders" ? (
                  <div className="mt-auto space-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-secondary/40 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium flex items-center gap-1.5">
                          <ShoppingBag className="h-3.5 w-3.5" /> Public order portal
                        </p>
                        <p className="text-[11px] text-muted-foreground">Toggle storefront orders</p>
                      </div>
                      <Switch
                        checked={p.enabled}
                        disabled={busy === "online_orders"}
                        onCheckedChange={(v) => void toggleOnlineOrders(v)}
                        aria-label="Toggle online ordering"
                      />
                    </div>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("/dashboard/orders")}>
                      Open order queue
                    </Button>
                  </div>
                ) : p.id === "google_drive" ? (
                  <div className="mt-auto flex items-center gap-2">
                    <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("/dashboard/settings")}>
                      <Cloud className="h-3.5 w-3.5 mr-1.5" />
                      Open backup settings
                    </Button>
                  </div>
                ) : p.id === "einvoice" ? (
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      IRNs are generated locally — nothing to configure.
                    </p>
                    <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                      Fake IRN generator
                    </Badge>
                  </div>
                ) : (
                  <div className="mt-auto flex items-center gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => void openConfigure(p.id)}>
                      Configure
                    </Button>
                    {p.id === "payment_collect" && (
                      <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                        QR display only
                      </Badge>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Secrets are encrypted at rest (AES-256-GCM) and never returned by the API —
        the server only hands them to the provider adapters.{" "}
        <Link to="/dashboard/scheduled-reports" className="underline underline-offset-2 hover:text-foreground">
          Scheduled Reports
        </Link>{" "}
        deliver reports through the messaging channels you connect here.
      </p>

      {/* ── Configure dialog ── */}
      <Dialog open={openId !== null} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{openDetail?.name ?? "Configure"}</DialogTitle>
            <DialogDescription>
              {openDetail?.category} · values are stored encrypted; the server never sends them back.
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {detail.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {detail.id === "google_drive"
                    ? "Google Drive uses the OAuth flow on the Settings page."
                    : "This integration has no fields — use the toggle on its card."}
                </p>
              ) : (
                detail.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`field-${field.key}`} className="text-xs capitalize">
                      {field.key}
                      {field.secret && <span className="text-muted-foreground"> (secret)</span>}
                    </Label>
                    <Input
                      id={`field-${field.key}`}
                      type={field.secret ? "password" : "text"}
                      autoComplete="off"
                      value={values[field.key] ?? ""}
                      placeholder={
                        field.secret && detail.secrets[field.key] === "•••"
                          ? "••• saved — type to replace"
                          : field.key
                      }
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                    />
                  </div>
                ))
              )}
              {detail.id === "payment_collect" && (
                <p className="text-[11px] text-muted-foreground">
                  QR display only — MediBill renders your UPI ID as a QR code and does not
                  process payments through a gateway.
                </p>
              )}
            </div>
          ) : null}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {detail && detail.connected && (
              <Button variant="destructive" onClick={() => void disconnect()} disabled={saving}>
                Disconnect
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpenId(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || detailLoading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
