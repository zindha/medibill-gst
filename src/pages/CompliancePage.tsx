import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { complianceApi, invoicesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Copy,
  FileCheck,
  Loader2,
  Lock,
  RefreshCcw,
  Search,
  Truck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type ProviderHealth = {
  provider: "fake" | "nic";
  einvoice: boolean;
  eway: boolean;
  baseUrlsConfigured: boolean;
  missingEinvoice: string[];
  missingEway: string[];
};

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "border-amber-600/30 text-amber-700 bg-amber-600/5" },
  submitted: { label: "Submitted", cls: "border-blue-600/30 text-blue-700 bg-blue-600/5" },
  accepted: { label: "Accepted", cls: "border-green-600/30 text-green-700 bg-green-600/5" },
  rejected: { label: "Rejected", cls: "border-red-600/30 text-red-700 bg-red-600/5" },
  cancelled: { label: "Cancelled", cls: "border-gray-500/30 text-gray-600 bg-gray-100" },
};

const kindLabel = (kind: string) => (kind === "ewaybill" ? "e-Way Bill" : "e-Invoice");

const formatDate = (dateStr?: string | null) =>
  dateStr ? new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const formatTs = (ms?: number | string | null) =>
  ms ? new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function CompliancePage() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const canManage = role === "admin" || role === "pharmacist";

  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  // Invoice picker + preflight
  const [candidates, setCandidates] = useState<any[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("none");
  const [preflight, setPreflight] = useState<any>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // E-way dialog
  const [ewayTarget, setEwayTarget] = useState<any>(null);
  const [ewayDistance, setEwayDistance] = useState("");
  const [ewayTransporter, setEwayTransporter] = useState("");
  const [ewayVehicle, setEwayVehicle] = useState("");
  const [ewayReason, setEwayReason] = useState("");
  const [ewaySaving, setEwaySaving] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const [healthRes, rows] = await Promise.all([
        complianceApi.providers().catch(() => null),
        complianceApi.submissions().catch(() => []),
      ]);
      setHealth(healthRes);
      setSubmissions(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      const message = err?.message ?? "Failed to load compliance data";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadCandidates = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await invoicesApi.list({
        limit: 50,
        search: pickerQuery.trim() || undefined,
      });
      const list = Array.isArray(res) ? res : (res as any)?.data ?? [];
      // Recent, billable invoices only — cancelled bills can never be e-invoiced.
      setCandidates(list.filter((inv: any) => inv.status !== "cancelled"));
    } catch {
      setCandidates([]);
    }
  }, [isAuthenticated, pickerQuery]);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (isAuthenticated) void loadCandidates();
  }, [isAuthenticated, loadCandidates]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  // Preflight only runs once an invoice is explicitly picked.
  useEffect(() => {
    if (!isAuthenticated || selectedId === "none") {
      setPreflight(null);
      return;
    }
    let cancelled = false;
    setPreflightLoading(true);
    complianceApi
      .status(selectedId)
      .then((data) => {
        if (!cancelled) setPreflight(data);
      })
      .catch((err: any) => {
        if (!cancelled) toast.error(err?.message ?? "Failed to check invoice");
      })
      .finally(() => {
        if (!cancelled) setPreflightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, selectedId]);

  const doGenerate = async () => {
    if (selectedId === "none") return;
    setGenerating(true);
    try {
      const row = await complianceApi.generate(selectedId);
      toast.success(`e-Invoice generated · IRN ${row.irn ?? ""}`);
      await Promise.all([load(), complianceApi.status(selectedId).then(setPreflight).catch(() => {})]);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate e-invoice");
      // Refresh preflight so the recorded error/status is visible.
      complianceApi.status(selectedId).then(setPreflight).catch(() => {});
    } finally {
      setGenerating(false);
    }
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      toast.error("A reason is required to cancel an e-invoice");
      return;
    }
    setCancelling(true);
    try {
      await complianceApi.cancel(cancelTarget.invoiceId, cancelReason.trim());
      toast.success("e-Invoice cancelled");
      setCancelTarget(null);
      setCancelReason("");
      await load();
      if (selectedId !== "none") complianceApi.status(selectedId).then(setPreflight).catch(() => {});
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to cancel e-invoice");
    } finally {
      setCancelling(false);
    }
  };

  const doEway = async () => {
    if (!ewayTarget) return;
    const distance = Number(ewayDistance);
    if (!distance || distance <= 0) {
      toast.error("Distance (km) is required");
      return;
    }
    setEwaySaving(true);
    try {
      const row = await complianceApi.eway(ewayTarget.invoiceId, {
        distanceKm: distance,
        transporterName: ewayTransporter.trim() || undefined,
        vehicleNo: ewayVehicle.trim() || undefined,
        reason: ewayReason.trim() || undefined,
      });
      toast.success(`e-Way bill generated · ${row.ackNo ?? ""}`);
      setEwayTarget(null);
      setEwayDistance("");
      setEwayTransporter("");
      setEwayVehicle("");
      setEwayReason("");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate e-way bill");
    } finally {
      setEwaySaving(false);
    }
  };

  const copyIrn = async (irn: string) => {
    try {
      await navigator.clipboard.writeText(irn);
      toast.success("IRN copied");
    } catch {
      toast.error("Could not copy IRN");
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

  const isFake = health?.provider === "fake";
  const allConfigured = health?.provider === "nic" && health.einvoice && health.eway;
  const missingNames = [...new Set([...(health?.missingEinvoice ?? []), ...(health?.missingEway ?? [])])];
  const filtered =
    statusFilter === "all" ? submissions : submissions.filter((row) => row.status === statusFilter);

  const selected = candidates.find((c) => c.id === selectedId);

  const banner = health && (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-xs",
        isFake
          ? "border-amber-300/70 bg-amber-50 text-amber-800"
          : allConfigured
            ? "border-green-300/70 bg-green-50 text-green-800"
            : "border-amber-300/70 bg-amber-50 text-amber-800"
      )}
    >
      {isFake || !allConfigured ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0">
        {isFake ? (
          <>
            <p className="font-medium">Fake provider — IRNs are not government-issued.</p>
            <p className="mt-0.5">
              Set <span className="font-mono">EINVOICE_PROVIDER=nic</span> plus credentials in the
              server .env to submit real e-invoices.
            </p>
          </>
        ) : allConfigured ? (
          <p className="font-medium">
            NIC provider configured — e-invoice and e-way submission enabled.
          </p>
        ) : (
          <>
            <p className="font-medium">NIC provider partially configured.</p>
            <p className="mt-0.5">
              Missing env:{" "}
              <span className="font-mono">{missingNames.join(", ") || "unknown"}</span> (names only —
              values are never shown or stored).
            </p>
          </>
        )}
      </div>
    </div>
  );

  const preflightPanel = (
    <Card className="border-border/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <FileCheck className="h-4 w-4" /> Preflight &amp; generate
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pick an invoice to check GST payload readiness (HSN, GSTIN, tax totals) before
            generating.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <span className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search invoice / customer"
                className="h-9 w-56 pl-8"
              />
            </span>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="h-9 w-64">
                <SelectValue placeholder="Pick an invoice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pick an invoice…</SelectItem>
                {candidates.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.invoiceNo} · {inv.customerName || "Walk-in"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!canManage && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Read-only role — generation is limited to admin and
          pharmacist.
        </p>
      )}

      {canManage && selectedId !== "none" && (
        <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
          {preflightLoading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking payload…
            </p>
          ) : preflight ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-mono">{preflight.invoiceNo}</span>
                <span
                  className={cn(
                    "inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] leading-none",
                    STATUS_PILL[preflight.state]?.cls ?? "border-border text-muted-foreground"
                  )}
                >
                  {preflight.state === "none" ? "Not generated" : STATUS_PILL[preflight.state]?.label ?? preflight.state}
                </span>
                {preflight.submission?.irn && (
                  <button
                    type="button"
                    onClick={() => void copyIrn(preflight.submission.irn)}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                    title="Copy IRN"
                  >
                    {preflight.submission.irn} <Copy className="h-3 w-3" />
                  </button>
                )}
              </div>

              {preflight.payloadReady?.issues?.length > 0 ? (
                <div className="rounded-sm border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-medium">Payload not ready — fix these first:</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {preflight.payloadReady.issues.map((issue: string) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Payload ready — all GST validations pass.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void doGenerate()}
                  disabled={
                    generating || preflight.state === "accepted" || !preflight.payloadReady?.ok
                  }
                >
                  {generating ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {preflight.state === "accepted"
                    ? "Already generated"
                    : preflight.state === "rejected" || preflight.state === "cancelled"
                      ? "Re-generate"
                      : "Generate e-invoice"}
                </Button>
                {preflight.state === "accepted" && (
                  <Button size="sm" variant="outline" onClick={() => setCancelTarget(preflight)}>
                    <XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancel e-invoice
                  </Button>
                )}
                {preflight.state === "accepted" && !preflight.ewaybill && (
                  <Button size="sm" variant="outline" onClick={() => setEwayTarget(preflight)}>
                    <Truck className="mr-1.5 h-3.5 w-3.5" /> e-Way bill
                  </Button>
                )}
              </div>
              {preflight.submission?.error && (
                <p className="text-[11px] text-red-600">
                  Last error: <span className="font-mono">{preflight.submission.error}</span>
                </p>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Quick actions from the table row (no preflight selected) */}
      {canManage && selectedId === "none" && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Tip: expand a submission below, or pick an invoice above to generate / cancel / create an
          e-way bill.
        </p>
      )}
    </Card>
  );

  const submissionsTable = () => {
    if (loading && submissions.length === 0 && !error) {
      return (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading submissions…
        </div>
      );
    }
    if (error && submissions.length === 0) {
      return (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load submissions"
          description={error}
          actions={[{ label: "Retry", onClick: () => void load() }]}
        />
      );
    }
    if (filtered.length === 0) {
      return (
        <EmptyState
          icon={FileCheck}
          title={statusFilter === "all" ? "No compliance submissions yet" : `No ${statusFilter} submissions`}
          description="Generate an e-invoice from a bill above — accepted IRNs, ack numbers and e-way bills will appear here."
          actions={canManage ? [{ label: "Refresh", onClick: () => void load() }] : undefined}
        />
      );
    }
    return (
      <Card className="border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>IRN</TableHead>
              <TableHead>Ack</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const pill = STATUS_PILL[row.status] ?? {
                label: row.status,
                cls: "border-border text-muted-foreground",
              };
              return (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatTs(row.createdAt)}
                  </TableCell>
                  <TableCell className="min-w-0">
                    <p className="font-mono text-xs">{row.invoiceNo}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {row.customerName || "Walk-in"}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{kindLabel(row.kind)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={pill.cls}>
                      {pill.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.irn ? (
                      <button
                        type="button"
                        onClick={() => void copyIrn(row.irn)}
                        title="Copy IRN"
                        className="inline-flex items-center gap-1 font-mono text-[11px] hover:text-foreground"
                      >
                        {row.irn} <Copy className="h-3 w-3" />
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {row.ackNo ? (
                      <>
                        <span className="font-mono">{row.ackNo}</span>
                        {row.ackDate && <span className="block">{formatDate(row.ackDate)}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {row.error && (
                        <span
                          title={row.error}
                          className="inline-flex items-center gap-1 text-[11px] text-red-600"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" /> Error
                        </span>
                      )}
                      {canManage && row.kind === "einvoice" && row.status === "accepted" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setCancelTarget({ invoiceId: row.invoiceId, irn: row.irn })
                            }
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEwayTarget({ invoiceId: row.invoiceId })}
                            disabled={submissions.some(
                              (s) => s.invoiceId === row.invoiceId && s.kind === "ewaybill" && s.status === "accepted"
                            )}
                          >
                            <Truck className="mr-1 h-3.5 w-3.5" /> e-Way
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <BadgeCheck className="h-5 w-5" /> e-Invoice &amp; Compliance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            GST e-invoice and e-way bill submission — IRN, acknowledgement and cancellation history
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}{" "}
          Refresh
        </Button>
      </div>

      {banner}
      {preflightPanel}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Submissions</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every provider submission for this store — accepted IRNs can be cancelled within 24h.
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {submissionsTable()}

      {/* Cancel dialog — reason is mandatory and audited */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel e-invoice</DialogTitle>
            <DialogDescription>
              IRN{" "}
              <span className="font-mono">
                {cancelTarget?.irn ?? cancelTarget?.submission?.irn ?? ""}
              </span>{" "}
              will be cancelled with the provider. Only possible within 24h of generation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Reason</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Why is this e-invoice being cancelled?"
              className="h-20 text-sm"
            />
          </div>
          <Button onClick={() => void doCancel()} disabled={cancelling || !cancelReason.trim()}>
            {cancelling ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
            Cancel e-invoice
          </Button>
        </DialogContent>
      </Dialog>

      {/* E-way dialog */}
      <Dialog
        open={!!ewayTarget}
        onOpenChange={(open) => {
          if (!open) setEwayTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate e-Way bill</DialogTitle>
            <DialogDescription>
              Requires an accepted e-invoice for this bill. Transporter and vehicle details are
              stored on the submission row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Distance (km) *</Label>
              <Input
                type="number"
                min={1}
                value={ewayDistance}
                onChange={(e) => setEwayDistance(e.target.value)}
                placeholder="42"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Transporter name</Label>
              <Input
                value={ewayTransporter}
                onChange={(e) => setEwayTransporter(e.target.value)}
                placeholder="Swift Cargo"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vehicle number</Label>
              <Input
                value={ewayVehicle}
                onChange={(e) => setEwayVehicle(e.target.value)}
                placeholder="MH-01-AB-1234"
                className="uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Input
                value={ewayReason}
                onChange={(e) => setEwayReason(e.target.value)}
                placeholder="Delivery"
              />
            </div>
          </div>
          <Button onClick={() => void doEway()} disabled={ewaySaving}>
            {ewaySaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Truck className="mr-1.5 h-3.5 w-3.5" />}
            Generate e-Way bill
          </Button>
        </DialogContent>
      </Dialog>

      {selected && (
        <p className="text-[11px] text-muted-foreground">
          Selected: <span className="font-mono">{selected.invoiceNo}</span> ·{" "}
          {selected.customerName || "Walk-in"}
        </p>
      )}
      {!canManage && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Viewing only — generation, cancellation and e-way bills
          require an admin or pharmacist account.
        </p>
      )}
    </div>
  );
}
