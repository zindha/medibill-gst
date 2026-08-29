import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Building2, Check, Copy, KeyRound, Loader2, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { activeStore, myStores } = useAuth();
  const updateStore = useMutation(api.stores.updateStore);
  const members = useQuery(api.stores.listMembers);
  const addMember = useMutation(api.stores.addMember);
  const removeMember = useMutation(api.stores.removeMember);
  const setMemberRole = useMutation(api.stores.setMemberRole);
  const regenerateJoinCode = useMutation(api.stores.regenerateJoinCode);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    gstin: "",
    drugLicenseNo: "",
  });
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<"admin" | "user" | "member">("user");
  const [removingId, setRemovingId] = useState<Id<"storeMembers"> | null>(null);
  const [copied, setCopied] = useState(false);
  const [resettingCode, setResettingCode] = useState(false);

  // Sync the edit form whenever the active store loads/changes.
  useEffect(() => {
    if (activeStore) {
      setForm({
        name: activeStore.name ?? "",
        phone: activeStore.phone ?? "",
        email: activeStore.email ?? "",
        address: activeStore.address ?? "",
        gstin: activeStore.gstin ?? "",
        drugLicenseNo: activeStore.drugLicenseNo ?? "",
      });
    }
  }, [activeStore]);

  if (!activeStore) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading store…
      </div>
    );
  }

  const isOwner = activeStore.isOwner;
  const isAdmin = activeStore.role === "admin";

  const handleSaveDetails = async () => {
    setSaving(true);
    try {
      await updateStore({
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        gstin: form.gstin || undefined,
        drugLicenseNo: form.drugLicenseNo || undefined,
      });
      toast.success("Store details saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save store details");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCode = async () => {
    if (!activeStore.joinCode) return;
    try {
      await navigator.clipboard.writeText(activeStore.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  };

  const handleResetCode = async () => {
    setResettingCode(true);
    try {
      toast.info("Regenerating join code…");
      await regenerateJoinCode();
      toast.success("New join code generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset join code");
    } finally {
      setResettingCode(false);
    }
  };

  const handleAddMember = async () => {
    if (!identifier.trim()) return;
    setAdding(true);
    try {
      await addMember({ identifier: identifier.trim(), role });
      toast.success("Member added");
      setIdentifier("");
      setAddOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add member");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (memberId: Id<"storeMembers">) => {
    setRemovingId(memberId);
    try {
      await removeMember({ memberId });
      toast.success("Member removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove member");
    } finally {
      setRemovingId(null);
    }
  };

  const roleLabel = (r: string) =>
    r === "admin" ? "Admin" : r === "user" ? "User" : "Member";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Store information and team access for {activeStore.name}
        </p>
      </div>

      {/* Store details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Store details
          </CardTitle>
          <CardDescription>
            Shown on your GST invoices. Adding your GSTIN and drug license makes
            your bills compliant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isAdmin && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
              You need admin access to edit store details.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Store name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                disabled={!isAdmin}
                placeholder="+91…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={!isAdmin}
                placeholder="store@example.com"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-1.5">
              <Label>GSTIN</Label>
              <Input
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                disabled={!isAdmin}
                placeholder="22AAAAA0000A1Z5"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Drug license no.</Label>
              <Input
                value={form.drugLicenseNo}
                onChange={(e) =>
                  setForm({ ...form, drugLicenseNo: e.target.value })
                }
                disabled={!isAdmin}
                placeholder="DL-…"
              />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end">
            <Button onClick={handleSaveDetails} disabled={!isAdmin || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save details
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invite by join code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Invite others by code
          </CardTitle>
          <CardDescription>
            Share a code so a colleague can set up their own account and join
            this store instantly — no need to add them manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAdmin && activeStore.joinCode ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-2.5">
                <span className="font-mono text-xl tracking-[0.2em] font-semibold">
                  {activeStore.joinCode}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyCode}
                >
                  {copied ? (
                    <Check className="mr-2 h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetCode}
                  disabled={resettingCode}
                >
                  {resettingCode ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Reset"
                  )}
                </Button>
              </div>
            </div>
          ) : isAdmin ? (
            <p className="text-sm text-muted-foreground">
              No join code yet — save your store details first.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only admins can view or reset this store's join code.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Team */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Team &amp; access
            </CardTitle>
            <CardDescription>
              People who can use this store. Members see the same inventory,
              invoices and reports as you.
            </CardDescription>
          </div>
          {isAdmin && (
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add member
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            <div className="flex items-center gap-3 py-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                {activeStore.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm truncate">
                    {activeStore.name} (Owner)
                  </span>
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground">Admin · store owner</p>
              </div>
            </div>
            {members?.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground text-center">
                No other members yet. Add someone from your team to share this store.
              </p>
            )}
            {members?.map((m) => (
              <div key={m._id} className="flex items-center gap-3 py-3">
                <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm truncate block">{m.name}</span>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.email || m.phone || "No contact"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={m.role}
                    disabled={!isAdmin}
                    onValueChange={(v) =>
                      setMemberRole({
                        memberId: m._id,
                        role: v as "admin" | "user" | "member",
                      }).then(() => toast.success("Role updated"))
                    }
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRemove(m._id)}
                      disabled={removingId === m._id}
                    >
                      {removingId === m._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!isAdmin && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
              You're a {roleLabel(activeStore.role)} — only admins can manage members.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add member dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a team member</DialogTitle>
            <DialogDescription>
              Enter the email or mobile number of an existing MediBill account.
              They'll get access to {activeStore.name} right away and can switch
              to it from their own dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email or mobile number</Label>
              <Input
                placeholder="member@example.com or +91…"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — manage members &amp; settings</SelectItem>
                  <SelectItem value="user">User — full billing access</SelectItem>
                  <SelectItem value="member">Member — access to billing &amp; inventory</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={!identifier.trim() || adding}>
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}