import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useHotkeys } from "@/hooks/useHotkeys";
import { filesApi, prescriptionsApi, type Prescription, type PrescriptionStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Check,
  ClipboardList,
  Eye,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type StatusTab = "all" | PrescriptionStatus;

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "dispensed", label: "Dispensed" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_BADGE: Record<PrescriptionStatus, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-700",
  verified: "border-blue-300 bg-blue-50 text-blue-700",
  dispensed: "border-green-300 bg-green-50 text-green-700",
  rejected: "border-red-300 bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: PrescriptionStatus }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", STATUS_BADGE[status] ?? "")}>
      {status}
    </Badge>
  );
}

function formatDate(raw?: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const blankForm = () => ({
  patientName: "",
  customerId: "",
  patientAge: "",
  patientGender: "",
  doctorId: "",
  date: new Date().toISOString().split("T")[0],
  notes: "",
});

export default function PrescriptionsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const debouncedQ = useDebouncedValue(search.trim(), 300);

  const [doctors, setDoctors] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [view, setView] = useState<Prescription | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await prescriptionsApi.list({
        q: debouncedQ || undefined,
        doctorId: doctorFilter || undefined,
        customerId: customerFilter || undefined,
        limit: 100,
      });
      setRows(res.data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load prescriptions");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, doctorFilter, customerFilter]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    (async () => {
      try {
        const { doctorsApi, customersApi } = await import("@/lib/api");
        const [docs, custs] = await Promise.all([doctorsApi.list({ limit: 100 }), customersApi.list({ limit: 100 })]);
        if (!active) return;
        setDoctors(Array.isArray(docs) ? docs : (docs as any)?.data ?? []);
        setCustomers(Array.isArray(custs) ? custs : (custs as any)?.data ?? []);
      } catch {
        /* filter dropdowns stay empty — the list itself still loads */
      }
    })();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  useHotkeys([
    { key: "/", label: "Focus prescription search", handler: () => document.querySelector<HTMLInputElement>("[data-rx-search]")?.focus() },
    { key: "n", label: "New prescription", handler: () => setCreateOpen(true) },
  ]);

  const openView = async (rx: Prescription) => {
    setView(rx);
    setViewOpen(true);
    setImageUrl("");
    if (rx.imagePath) {
      setImageLoading(true);
      try {
        const file = await filesApi.get(rx.imagePath);
        setImageUrl(`data:${file.contentType};base64,${file.data}`);
      } catch {
        toast.error("Couldn't load the prescription image");
      } finally {
        setImageLoading(false);
      }
    }
  };

  const closeView = () => {
    setViewOpen(false);
    setView(null);
    setImageUrl("");
  };

  const handleVerify = async (rx: Prescription) => {
    setActionId(rx.id);
    try {
      await prescriptionsApi.verify(rx.id);
      toast.success("Prescription verified");
      if (view?.id === rx.id) setView({ ...rx, status: "verified" });
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Verify failed");
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (rx: Prescription) => {
    const reason = window.prompt(`Reject prescription for ${rx.patientName}? Enter a reason (recorded in the audit trail):`);
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("A rejection reason is required");
      return;
    }
    setActionId(rx.id);
    try {
      await prescriptionsApi.reject(rx.id, reason.trim());
      toast.success("Prescription rejected");
      if (view?.id === rx.id) setView({ ...rx, status: "rejected" });
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Reject failed");
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (rx: Prescription) => {
    if (!window.confirm(`Delete the prescription for ${rx.patientName}?`)) return;
    setActionId(rx.id);
    try {
      await prescriptionsApi.remove(rx.id);
      toast.success("Prescription deleted");
      if (view?.id === rx.id) closeView();
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    } finally {
      setActionId(null);
    }
  };

  const handleDispense = async (rx: Prescription, invoiceId: string) => {
    setActionId(rx.id);
    try {
      await prescriptionsApi.dispense(rx.id, invoiceId);
      toast.success("Marked as dispensed");
      const fresh = await prescriptionsApi.get(rx.id);
      setView(fresh);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Dispense failed");
    } finally {
      setActionId(null);
    }
  };

  const handleImagePick = (file: File | null) => {
    setImageFile(file);
  };

  const handleCreate = async () => {
    if (!form.patientName.trim()) {
      toast.error("Patient name is required");
      return;
    }
    setSaving(true);
    try {
      let imageFileId: string | undefined;
      if (imageFile) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("Could not read the image"));
          reader.readAsDataURL(imageFile);
        });
        const stored = await filesApi.upload({
          filename: imageFile.name || "prescription.jpg",
          contentType: imageFile.type || "image/jpeg",
          data: dataUrl,
        });
        imageFileId = stored.id;
      }
      await prescriptionsApi.create({
        patientName: form.patientName.trim(),
        customerId: form.customerId || undefined,
        patientAge: form.patientAge ? Number(form.patientAge) : undefined,
        patientGender: form.patientGender || undefined,
        doctorId: form.doctorId || undefined,
        date: form.date,
        notes: form.notes.trim() || undefined,
        imageFileId,
      });
      toast.success("Prescription added");
      setCreateOpen(false);
      setForm(blankForm());
      setImageFile(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save prescription");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || (loading && rows.length === 0 && !error)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Loading prescriptions…
      </div>
    );
  }

  const counts = STATUS_TABS.reduce<Record<string, number>>((acc, t) => {
    acc[t.value] = t.value === "all" ? rows.length : rows.filter((r) => r.status === t.value).length;
    return acc;
  }, {});
  const visible = statusTab === "all" ? rows : rows.filter((r) => r.status === statusTab);
  const hasFilters = Boolean(debouncedQ || doctorFilter || customerFilter) || statusTab !== "all";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ClipboardList className="h-5 w-5 text-primary" />
            Prescriptions
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Capture patient prescriptions, verify them, and dispense against a bill.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              data-rx-search
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient/doctor/notes…  ( / )"
              className="h-9 w-56 pl-8 text-sm"
            />
          </div>
          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setForm(blankForm()); setImageFile(null); } }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Prescription
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New prescription</DialogTitle>
                <DialogDescription>Record the patient, doctor and (optionally) a photo of the prescription.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Patient name *</Label>
                  <Input
                    value={form.patientName}
                    onChange={(e) => setForm({ ...form, patientName: e.target.value })}
                    placeholder="Patient name"
                    className="mt-1 h-9"
                    list="rx-customer-names"
                  />
                  <datalist id="rx-customer-names">
                    {customers.map((c: any) => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>
                <div>
                  <Label className="text-xs">Customer (optional)</Label>
                  <Select value={form.customerId || "none"} onValueChange={(v) => setForm({ ...form, customerId: v === "none" ? "" : v })}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Walk-in" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Walk-in (no customer)</SelectItem>
                      {customers.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Date *</Label>
                  <Input
                    type="date"
                    value={form.date}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Age</Label>
                  <Input
                    type="number"
                    min={0}
                    max={150}
                    value={form.patientAge}
                    onChange={(e) => setForm({ ...form, patientAge: e.target.value })}
                    placeholder="42"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Gender</Label>
                  <Select value={form.patientGender || "none"} onValueChange={(v) => setForm({ ...form, patientGender: v === "none" ? "" : v })}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Doctor (optional)</Label>
                  <Select value={form.doctorId || "none"} onValueChange={(v) => setForm({ ...form, doctorId: v === "none" ? "" : v })}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No doctor</SelectItem>
                      {doctors.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}{d.clinicName ? ` · ${d.clinicName}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Notes / medicines</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="e.g. Tab. Amlodipine 5mg — 1 OD × 30 days"
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Prescription image (optional)</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="h-9 text-xs"
                      onChange={(e) => handleImagePick(e.target.files?.[0] ?? null)}
                    />
                    {imageFile && (
                      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setImageFile(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {imageFile && <p className="mt-1 text-[11px] text-muted-foreground">{imageFile.name}</p>}
                </div>
              </div>
              <Button onClick={handleCreate} disabled={saving || !form.patientName.trim()} className="mt-2">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                Add Prescription
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((t) => (
          <Button
            key={t.value}
            size="sm"
            variant={statusTab === t.value ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setStatusTab(t.value)}
          >
            {t.label}
            <span className="ml-1 text-muted-foreground tabular-nums">{counts[t.value] ?? 0}</span>
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <Select value={doctorFilter || "all"} onValueChange={(v) => setDoctorFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="All doctors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All doctors</SelectItem>
              {doctors.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={customerFilter || "all"} onValueChange={(v) => setCustomerFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="All customers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="shrink-0 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void load()}>Retry</button>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={hasFilters ? "No prescriptions match your filters" : "No prescriptions yet"}
            description={
              hasFilters
                ? "Try another search or status tab."
                : "Capture a prescription once — verify it, then dispense it against the bill."
            }
            actions={
              hasFilters
                ? []
                : [{ label: "Add Prescription", onClick: () => setCreateOpen(true) }]
            }
          />
        ) : (
          visible.map((rx, idx) => (
            <motion.div
              key={rx.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.02, 0.3) }}
              className="flex items-center gap-3 rounded-sm border border-border/60 p-3 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => void openView(rx)}>
                <p className="truncate text-sm font-medium">
                  {rx.patientName}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {[rx.patientAge, rx.patientGender].filter(Boolean).join(" · ")}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {rx.doctorName ? `${rx.doctorName} · ` : ""}
                  {formatDate(rx.date)}
                  {rx.notes ? ` · ${rx.notes}` : ""}
                </p>
              </div>
              <StatusBadge status={rx.status} />
              <div className="flex shrink-0 items-center gap-1">
                {rx.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={actionId === rx.id}
                    onClick={() => void handleVerify(rx)}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />Verify
                  </Button>
                )}
                {rx.status !== "dispensed" && rx.status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-destructive hover:text-destructive"
                    disabled={actionId === rx.id}
                    onClick={() => void handleReject(rx)}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />Reject
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8" title="View" onClick={() => void openView(rx)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                {rx.status !== "dispensed" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Delete"
                    disabled={actionId === rx.id}
                    onClick={() => void handleDelete(rx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Detail dialog — prescription info, image preview, linked invoices */}
      <Dialog open={viewOpen} onOpenChange={(open) => { if (!open) closeView(); }}>
        <DialogContent className="sm:max-w-2xl">
          {view && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {view.patientName}
                  <StatusBadge status={view.status} />
                </DialogTitle>
                <DialogDescription>
                  {view.doctorName ? `${view.doctorName} · ` : ""}
                  {formatDate(view.date)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Patient</p>
                  <p className="mt-0.5">
                    {view.patientName}
                    {[view.patientAge, view.patientGender].filter(Boolean).length > 0
                      ? ` · ${[view.patientAge, view.patientGender].filter(Boolean).join(" · ")}`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Doctor</p>
                  <p className="mt-0.5">{view.doctorName ?? "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes</p>
                  <p className="mt-0.5">{view.notes || "—"}</p>
                </div>
                {view.status === "dispensed" && (
                  <div className="col-span-2">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Dispensed</p>
                    <p className="mt-0.5">
                      {formatDate(view.dispensedAt)}
                      {view.dispensedInvoiceId ? ` · invoice linked` : ""}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-border/60 pt-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Prescription image</p>
                {!view.imagePath ? (
                  <p className="text-xs text-muted-foreground">No image attached.</p>
                ) : imageLoading ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading image…
                  </p>
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={`Prescription for ${view.patientName}`}
                    className="max-h-64 w-full rounded-md border border-border/60 object-contain bg-secondary/30"
                  />
                ) : (
                  <p className="text-xs text-destructive">Image could not be loaded.</p>
                )}
              </div>

              <div className="border-t border-border/60 pt-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Linked invoices</p>
                {!view.invoices || view.invoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No invoice linked yet — link one from Billing, or dispense against an existing bill below.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {view.invoices.map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between rounded-sm border border-border/60 px-2.5 py-1.5 text-xs">
                        <span className="font-mono">{inv.invoiceNo}</span>
                        <span className="text-muted-foreground">
                          {inv.prescriptionStatus ?? view.status} · {inv.status} · ₹{Number(inv.grandTotal ?? 0).toFixed(2)}
                        </span>
                        {view.status === "verified" && inv.prescriptionStatus !== "dispensed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[11px]"
                            disabled={actionId === view.id}
                            onClick={() => void handleDispense(view, inv.id)}
                          >
                            Dispense
                          </Button>
                        )}
                        {inv.prescriptionStatus === "dispensed" && (
                          <Badge variant="outline" className="text-[10px] border-green-300 bg-green-50 text-green-700">Dispensed</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                {view.status === "pending" && (
                  <Button size="sm" onClick={() => void handleVerify(view)} disabled={actionId === view.id}>
                    <Check className="h-3.5 w-3.5 mr-1" />Verify
                  </Button>
                )}
                {view.status !== "dispensed" && view.status !== "rejected" && (
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => void handleReject(view)} disabled={actionId === view.id}>
                    <X className="h-3.5 w-3.5 mr-1" />Reject
                  </Button>
                )}
                {view.status !== "dispensed" && (
                  <Button size="sm" variant="outline" onClick={() => void handleDelete(view)} disabled={actionId === view.id}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
