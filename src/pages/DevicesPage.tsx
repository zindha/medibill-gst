import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type DeviceActivityFeed,
  type DeviceCapabilities,
  type DeviceSessionView,
  type DeviceView,
  devicesApi,
  syncApi,
  type SyncPullOutcome,
  type SyncStatusInfo,
} from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  Ban,
  History,
  KeyRound,
  Loader2,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type TabValue = "devices" | "sessions" | "activity" | "sync" | "role";

const fmtTime = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";

const fmtBytes = (b?: number) =>
  b ? `${(b / (1024 * 1024)).toFixed(1)} MB` : "—";

const shortId = (id: string) =>
  id.length > 12 ? `${id.slice(0, 8)}…` : id;

export default function DevicesPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("devices");

  // ── Me (role + capabilities) ─────────────────────────────────
  const [me, setMe] = useState<DeviceCapabilities | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);

  // ── Devices ──────────────────────────────────────────────────
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState<string | null>(null);
  const [allBusy, setAllBusy] = useState<string | null>(null);

  // ── Sessions (admin) ─────────────────────────────────────────
  const [sessions, setSessions] = useState<DeviceSessionView[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState<string | null>(null);

  // ── Activity (admin) ─────────────────────────────────────────
  const [activity, setActivity] = useState<DeviceActivityFeed | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  // ── Sync ─────────────────────────────────────────────────────
  const [status, setStatus] = useState<SyncStatusInfo | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<SyncPullOutcome | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const isAdmin = me?.role === "admin" || (me?.capabilities ?? []).includes("*");

  // ── Loads ────────────────────────────────────────────────────
  const loadMe = useCallback(async () => {
    setMeLoading(true);
    setMeError(null);
    try {
      setMe(await devicesApi.me());
    } catch (err: any) {
      setMeError(err?.message ?? "Could not load your role");
    } finally {
      setMeLoading(false);
    }
  }, []);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDevicesError(null);
    try {
      setDevices((await devicesApi.list()) ?? []);
    } catch (err: any) {
      setDevicesError(err?.message ?? "Could not load devices");
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      setSessions((await devicesApi.sessions()) ?? []);
    } catch (err: any) {
      setSessionsError(err?.message ?? "Could not load sessions");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      setActivity(await devicesApi.activity());
    } catch (err: any) {
      setActivityError(err?.message ?? "Could not load activity");
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      setStatus(await syncApi.status());
    } catch (err: any) {
      setStatusError(err?.message ?? "Could not load sync status");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
    void loadDevices();
  }, [loadMe, loadDevices]);

  // Admin-only feeds — fetched once as soon as we know the role.
  useEffect(() => {
    if (!isAdmin) return;
    void loadSessions();
    void loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Sync status on first visit to the Sync tab.
  useEffect(() => {
    if (activeTab === "sync" && !status && !statusLoading) void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Never leave an admin-only tab selected for a non-admin.
  useEffect(() => {
    if (meLoading) return;
    if (!isAdmin && (activeTab === "sessions" || activeTab === "activity")) {
      setActiveTab("devices");
    }
  }, [meLoading, isAdmin, activeTab]);

  // ── Actions ──────────────────────────────────────────────────
  const toggleRevoke = async (device: DeviceView) => {
    setDeviceBusy(device.id);
    try {
      if (device.revoked) {
        await devicesApi.restore(device.id);
        toast.success(`Restored ${device.deviceName ?? "device"}`);
      } else {
        await devicesApi.revoke(device.id);
        toast.success(`Revoked ${device.deviceName ?? "device"}`);
      }
      await loadDevices();
    } catch (err: any) {
      toast.error(err?.message ?? "Action failed");
    } finally {
      setDeviceBusy(null);
    }
  };

  /** Revokes every device + session of the device's owner. */
  const revokeAllForOwner = async (device: DeviceView) => {
    const owner = device.userName ?? device.userId;
    if (
      !confirm(
        `Revoke every device and session of ${owner}? They will be signed out everywhere.`,
      )
    ) {
      return;
    }
    setAllBusy(device.id);
    try {
      const res = await devicesApi.revokeAll(device.userId);
      toast.success(
        `Revoked ${res?.devicesRevoked ?? 0} device(s) and ${res?.sessionsRevoked ?? 0} session(s)`,
      );
      await loadDevices();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not revoke devices");
    } finally {
      setAllBusy(null);
    }
  };

  const revokeSession = async (session: DeviceSessionView) => {
    setSessionBusy(session.id);
    try {
      await devicesApi.revokeSession(session.id);
      toast.success("Session revoked");
      await loadSessions();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not revoke session");
    } finally {
      setSessionBusy(null);
    }
  };

  const pullNow = async () => {
    setPulling(true);
    try {
      const outcome = await syncApi.pull(cursor ? { cursor } : undefined);
      setPullResult(outcome);
      if (outcome.nextCursor) setCursor(outcome.nextCursor);
      await loadStatus();
      toast.success(`Pulled ${outcome.ops.length} operation${outcome.ops.length === 1 ? "" : "s"}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Pull failed");
    } finally {
      setPulling(false);
    }
  };

  // "Revoke all" acts on the owner — show it once per owner (first row).
  const firstDeviceByOwner = new Map<string, string>();
  for (const d of devices) {
    if (!firstDeviceByOwner.has(d.userId)) firstDeviceByOwner.set(d.userId, d.id);
  }

  if (meLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Devices &amp; Sync</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Registered devices, remote sessions, activity and offline sync
          </p>
        </div>
        {me && (
          <Badge variant={isAdmin ? "default" : "secondary"} className="w-fit">
            <ShieldCheck className="h-3 w-3" />
            {me.role}
          </Badge>
        )}
      </div>

      {meError && (
        <Card className="p-4 border-border/60 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          {meError} — showing everything, role-based tabs may be unavailable.
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="h-9">
          <TabsTrigger value="devices" className="text-xs gap-1">
            <Smartphone className="h-3 w-3" />Devices
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="sessions" className="text-xs gap-1">
              <KeyRound className="h-3 w-3" />Sessions
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="activity" className="text-xs gap-1">
              <Activity className="h-3 w-3" />Activity
            </TabsTrigger>
          )}
          <TabsTrigger value="sync" className="text-xs gap-1">
            <RefreshCcw className="h-3 w-3" />Sync
          </TabsTrigger>
          <TabsTrigger value="role" className="text-xs gap-1">
            <ShieldCheck className="h-3 w-3" />My Role
          </TabsTrigger>
        </TabsList>

        {/* ── DEVICES ── */}
        <TabsContent value="devices" className="space-y-4">
          {devicesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : devicesError ? (
            <EmptyState icon={AlertTriangle} title="Could not load devices" description={devicesError} />
          ) : devices.length === 0 ? (
            <EmptyState
              icon={Smartphone}
              title="No devices registered"
              description="This browser registers itself as a device the next time you sign in."
            />
          ) : (
            <div className="border rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Version</TableHead>
                    {isAdmin && <TableHead>Owner</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead>Last seen</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-sm font-medium">
                        {d.deviceName ?? "Unnamed device"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {d.platform ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {d.appVersion ?? "—"}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-sm text-muted-foreground">
                          {d.userName ?? d.userId}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant={d.revoked ? "destructive" : "secondary"} className="text-[10px]">
                          {d.revoked ? "Revoked" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtTime(d.lastSeenAt)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            {firstDeviceByOwner.get(d.userId) === d.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={deviceBusy === d.id || allBusy === d.id}
                                onClick={() => void revokeAllForOwner(d)}
                              >
                                {allBusy === d.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ShieldOff className="h-3.5 w-3.5" />
                                )}
                                Revoke all
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={d.revoked ? "outline" : "destructive"}
                              disabled={deviceBusy === d.id || allBusy === d.id}
                              onClick={() => void toggleRevoke(d)}
                            >
                              {deviceBusy === d.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : d.revoked ? (
                                <RotateCcw className="h-3.5 w-3.5" />
                              ) : (
                                <Ban className="h-3.5 w-3.5" />
                              )}
                              {d.revoked ? "Restore" : "Revoke"}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Revoking a device blocks every request it makes with a{" "}
            <code className="font-mono">X-Device-Token</code> header (401) until it is restored.
            Per-user cap: 10 active devices — the oldest are revoked automatically. "Revoke all"
            signs the owner out of every device and session they hold.
          </p>
        </TabsContent>

        {/* ── SESSIONS (admin) ── */}
        {isAdmin && (
          <TabsContent value="sessions" className="space-y-4">
            {sessionsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : sessionsError ? (
              <EmptyState icon={AlertTriangle} title="Could not load sessions" description={sessionsError} />
            ) : sessions.length === 0 ? (
              <EmptyState icon={KeyRound} title="No active sessions" description="Sessions appear here as soon as someone signs in." />
            ) : (
              <div className="border rounded-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session id</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>User agent</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{shortId(s.id)}</TableCell>
                        <TableCell className="text-sm">{s.userName ?? s.userId}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.ipAddress ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate" title={s.userAgent ?? ""}>
                          {s.userAgent ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtTime(s.createdAt)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtTime(s.expiresAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={sessionBusy === s.id}
                            onClick={() => void revokeSession(s)}
                          >
                            {sessionBusy === s.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Ban className="h-3.5 w-3.5" />
                            )}
                            Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Revoking a session kills its bearer/cookie token immediately — the user is signed
              out on their next request.
            </p>
          </TabsContent>
        )}

        {/* ── ACTIVITY (admin) ── */}
        {isAdmin && (
          <TabsContent value="activity" className="space-y-4">
            {activityLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : activityError ? (
              <EmptyState icon={AlertTriangle} title="Could not load activity" description={activityError} />
            ) : !activity ? (
              <EmptyState icon={Activity} title="No activity yet" />
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { label: "Active devices", value: String(activity.counts.devicesActive) },
                    { label: "Revoked devices", value: String(activity.counts.devicesRevoked) },
                    { label: "Live sessions", value: String(activity.counts.sessions) },
                  ].map((c) => (
                    <Card key={c.label} className="p-4 border-border/60">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">{c.value}</p>
                    </Card>
                  ))}
                </div>

                {activity.events.length === 0 ? (
                  <EmptyState icon={History} title="No audit events yet" description="Device, session and business actions will show up here." />
                ) : (
                  <div className="border rounded-sm overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Entity</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activity.events.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="text-sm font-medium">{e.action}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {e.entity}
                              {e.entityId ? ` · ${shortId(e.entityId)}` : ""}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{e.actorName ?? e.actorId}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{fmtTime(e.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        )}

        {/* ── SYNC ── */}
        <TabsContent value="sync" className="space-y-4">
          {statusLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : statusError ? (
            <EmptyState icon={AlertTriangle} title="Could not load sync status" description={statusError} />
          ) : status ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Sync operations", value: String(status.opsCount) },
                  { label: "Database size", value: fmtBytes(status.dbSizeBytes) },
                  { label: "Last backup", value: fmtTime(status.lastBackupAt) },
                  { label: "Server time", value: fmtTime(status.serverTime) },
                ].map((c) => (
                  <Card key={c.label} className="p-4 border-border/60">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">{c.value}</p>
                  </Card>
                ))}
              </div>

              <Card className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Cursor pull</p>
                  <p className="text-xs text-muted-foreground">
                    Fetches your own applied + conflict operations after the current cursor.
                  </p>
                </div>
                <Button className="h-9" onClick={() => void pullNow()} disabled={pulling}>
                  {pulling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />}
                  Pull now
                </Button>
              </Card>

              {pullResult && (
                <Card className="p-4 border-border/60">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: "Operations pulled", value: String(pullResult.ops.length) },
                      { label: "Applied", value: String(pullResult.ops.filter((o) => o.status === "applied").length) },
                      { label: "Conflicts", value: String(pullResult.ops.filter((o) => o.status === "conflict").length) },
                      { label: "Has more", value: pullResult.hasMore ? "Yes" : "No" },
                    ].map((c) => (
                      <div key={c.label}>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                        <p className="mt-1 text-base font-semibold tabular-nums">{c.value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground font-mono break-all">
                    next cursor: {pullResult.nextCursor ?? "— (end of feed)"}
                  </p>
                </Card>
              )}

              <Card className="p-4 border-border/60 space-y-2 text-sm text-muted-foreground">
                <p className="text-xs text-foreground uppercase tracking-wider">How sync works</p>
                <p>
                  Invoices are pushed <span className="text-foreground font-medium">live</span> —
                  they are server-authoritative and never flow through the sync journal.
                </p>
                <p>
                  Masters (medicines, customers, suppliers, settings) sync via push/pull: each
                  push carries the <code className="font-mono">baseVersion</code> the client last
                  saw, and the server answers <code className="font-mono">applied</code>,{" "}
                  <code className="font-mono">conflict</code>,{" "}
                  <code className="font-mono">duplicate</code> or{" "}
                  <code className="font-mono">error</code> per operation.
                </p>
                <p>
                  Conflicts are resolved by re-pushing the same operation without a{" "}
                  <code className="font-mono">baseVersion</code> to force-overwrite the server row.
                  Replaying an <code className="font-mono">operationId</code> is always a no-op
                  (idempotent).
                </p>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── MY ROLE ── */}
        <TabsContent value="role" className="space-y-4">
          {!me ? (
            <EmptyState icon={AlertTriangle} title="Could not load your role" description={meError ?? "Try again later."} />
          ) : (
            <>
              <Card className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Signed in as {me.role}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{me.userId}</span>
              </Card>

              {me.capabilities.includes("*") ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="Full access"
                  description="Admin — every capability is granted, including device/session management."
                />
              ) : (
                <Card className="p-4 border-border/60">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                    Capabilities ({me.capabilities.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {me.capabilities.map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px] font-mono">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </Card>
              )}

              <p className="text-xs text-muted-foreground">
                Capabilities come from the server&apos;s role map — the UI hides navigation only
                where the API itself enforces a role gate.
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
