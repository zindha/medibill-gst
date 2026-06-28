import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Loader2, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function CustomersPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const customers = useQuery(api.customers.list);
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const removeCustomer = useMutation(api.customers.remove);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    gstin: "",
    creditLimit: 0,
    openingBalance: 0,
    notes: "",
  });

  const filtered = customers?.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search)),
  );

  const resetForm = () => {
    setForm({ name: "", phone: "", email: "", address: "", gstin: "", creditLimit: 0, openingBalance: 0, notes: "" });
    setEditing(null);
  };

  const openEdit = (c: any) => {
    setForm({
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      gstin: c.gstin || "",
      creditLimit: c.creditLimit || 0,
      openingBalance: c.openingBalance || 0,
      notes: c.notes || "",
    });
    setEditing(c);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast("Customer name is required"); return; }
    setSaving(true);
    try {
      const data = { name: form.name, phone: form.phone || undefined, email: form.email || undefined, address: form.address || undefined, gstin: form.gstin || undefined, creditLimit: form.creditLimit || undefined, openingBalance: form.openingBalance || undefined, notes: form.notes || undefined };
      if (editing) { await updateCustomer({ id: editing._id, ...data }); toast("Customer updated"); }
      else { await createCustomer(data); toast("Customer added"); }
      resetForm(); setDialogOpen(false);
    } catch { toast("Failed to save"); } finally { setSaving(false); }
  };

  if (!isAuthenticated && !isLoading) { navigate("/auth"); return null; }
  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-pulse text-muted-foreground text-sm">Loading...</div></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">{customers?.length || 0} registered customers</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9 h-9 text-sm" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="h-3.5 w-3.5 mr-1.5" />Add Customer</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Customer" : "Add Customer"}</DialogTitle>
                <DialogDescription>Enter customer details</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Customer Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="mt-1 h-9" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Address</Label>
                  <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" className="mt-1" rows={2} />
                </div>
                <div>
                  <Label className="text-xs">GSTIN</Label>
                  <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="GSTIN" className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Credit Limit (₹)</Label>
                  <Input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} className="mt-1 h-9" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Opening Balance (₹)</Label>
                  <Input type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} className="mt-1 h-9" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="mt-1" rows={2} />
                </div>
              </div>
              <Button onClick={handleSave} disabled={saving || !form.name} className="mt-4">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                {editing ? "Update" : "Add"} Customer
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-1">
        {filtered?.map((c, i) => (
          <motion.div key={c._id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
            className="flex items-center justify-between px-4 py-3 border border-border/60 rounded-sm hover:bg-secondary/30 transition-colors cursor-pointer"
            onClick={() => openEdit(c)}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.phone && `${c.phone} · `}Purchases: {c.totalPurchases || 0}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
              {c.lastPurchaseDate && <span>Last: {new Date(c.lastPurchaseDate).toLocaleDateString("en-IN")}</span>}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); if (window.confirm("Remove this customer?")) { removeCustomer({ id: c._id }); toast("Customer removed"); }}}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        ))}
        {filtered?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No customers found.</p>}
      </div>
    </motion.div>
  );
}
