import { EmptyState } from "@/components/EmptyState";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type DeviceCapabilities,
  devicesApi,
  type StaffMember,
  type StaffRole,
  staffApi,
} from "@/lib/api";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  ShieldOff,
  UserPlus,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const ROLES: StaffRole[] = ["admin", "pharmacist", "cashier"];

const EMPTY_FORM = { name: "", email: "", phone: "", password: "", role: "cashier" as StaffRole };

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

export default function StaffPage() {
  // ── Me (role + capabilities) ─────────────────────────────────
  const [me, setMe] = useState<DeviceCapabilities | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  // ── Roster ───────────────────────────────────────────────────
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ── Add staff dialog ─────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Reset password dialog ────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const isAdmin = me?.role === "admin" || (me?.capabilities ?? []).includes("*");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await staffApi.list();
      setStaff(res?.items ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Could not load staff");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setMe(await devicesApi.me());
      } catch {
        // Role unknown — the roster stays read-only.
      } finally {
        setMeLoading(false);
      }
    })();
    void load();
  }, [load]);

  // ── Actions ──────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!form.email.trim()) {
      setFormError("Email is required — it is the sign-in id");
      return;
    }
    if (form.password.length < 6) {
      setFormError("Temporary password must be at least 6 characters");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await staffApi.create({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        role: form.role,
      });
      toast.success(`${form.name.trim()} added to staff`);
      setAddOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err: any) {
      setFormError(err?.message ?? "Could not add staff");
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (member: StaffMember, role: StaffRole) => {
    if (role === member.role) return;
    setBusyId(member.id);
    try {
      await staffApi.update(member.id, { role });
      toast.success(`${member.name} is now ${role}`);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not change role");
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (member: StaffMember) => {
    const next = member.status === "active" ? "inactive" : "active";
    setBusyId(member.id);
    try {
      await staffApi.update(member.id, { status: next });
      toast.success(next === "active" ? `${member.name} activated` : `${member.name} deactivated`);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not change status");
    } finally {
      setBusyId(null);
    }
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 6) {
      setResetError("Password must be at least 6 characters");
      return;
    }
    setResetting(true);
    setResetError(null);
    try {
      await staffApi.resetPassword(resetTarget.id, newPassword);
      toast.success(`Password reset for ${resetTarget.name}`);
      setResetTarget(null);
      setNewPassword("");
      await load();
    } catch (err: any) {
      setResetError(err?.message ?? "Could not reset password");
    } finally {
      setResetting(false);
    }
  };

  const revokeAll = async (member: StaffMember) => {
    if (
      !confirm(
        `Revoke every device and session of ${member.name}? They will be signed out everywhere.`,
      )
    ) {
      return;
    }
    setBusyId(member.id);
    try {
      const res = await staffApi.revokeAllDevices(member.id);
      toast.success(
        `Revoked ${res?.devicesRevoked ?? 0} device(s) and ${res?.sessionsRevoked ?? 0} session(s)`,
      );
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not revoke devices");
    } finally {
      setBusyId(null);
    }
  };

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
          <h1 className="text-xl font-semibold tracking-tight">Staff</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Team roster, roles and device access
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />Add staff
          </Button>
        )}
      </div>

      {!isAdmin && (
        <Card className="p-4 border-border/60 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldOff className="h-4 w-4" />
          Read-only — only an admin can manage the roster.
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <EmptyState icon={AlertTriangle} title="Could not load staff" description={error} />
      ) : staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff yet"
          description="Add your first team member to give them access to the counter."
        />
      ) : (
        <div className="border rounded-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Devices</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Added</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm font-medium">{m.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="block">{m.email || "—"}</span>
                    {m.phone && <span className="block text-xs">{m.phone}</span>}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => void changeRole(m, v as StaffRole)}
                        disabled={busyId === m.id}
                      >
                        <SelectTrigger size="sm" className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="capitalize">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {m.role}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={m.status === "active" ? "secondary" : "destructive"}
                      className="text-[10px] capitalize"
                    >
                      {m.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.deviceCount ?? 0}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.sessionCount ?? 0}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(m.createdAt)}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === m.id}
                          onClick={() => {
                            setResetTarget(m);
                            setNewPassword("");
                            setResetError(null);
                          }}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === m.id}
                          onClick={() => void toggleStatus(m)}
                        >
                          {m.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === m.id}
                          onClick={() => void revokeAll(m)}
                        >
                          <ShieldOff className="h-3.5 w-3.5" />
                          Revoke all
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
        Deactivating a member blocks the next sign-in. "Revoke all" signs the member out of every
        device and session — use it when a phone is lost.
      </p>

      {/* ── Add staff ── */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setFormError(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add staff</DialogTitle>
            <DialogDescription>
              Creates a login with the temporary password below. Ask the member to change it after
              the first sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Asha Menon"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="asha@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Temporary password *</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="min 6 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Add staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset password ── */}
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setResetTarget(null);
            setResetError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {resetTarget
                ? `Set a new password for ${resetTarget.name}.`
                : "Set a new password for this member."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">New password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="min 6 characters"
            />
          </div>
          {resetError && <p className="text-xs text-destructive">{resetError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetTarget(null);
                setResetError(null);
              }}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button onClick={() => void submitReset()} disabled={resetting}>
              {resetting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              )}
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
