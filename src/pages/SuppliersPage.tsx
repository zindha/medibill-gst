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
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Loader2, Plus, Search, Trash2, Truck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function SuppliersPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const suppliers = useQuery(api.suppliers.list);
  const createSupplier = useMutation(api.suppliers.create);
  const updateSupplier = useMutation(api.suppliers.update);
  const removeSupplier = useMutation(api.suppliers.remove);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    gstin: "",
  });

  const filtered = suppliers?.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone && s.phone.includes(search)) ||
      (s.gstin && s.gstin.toLowerCase().includes(search.toLowerCase())),
  );

  const resetForm = () => {
    setForm({
      name: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      gstin: "",
    });
    setEditing(null);
  };

  const openEdit = (s: any) => {
    setForm({
      name: s.name,
      contactPerson: s.contactPerson || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      gstin: s.gstin || "",
    });
    setEditing(s);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      toast("Supplier name is required");
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name,
        contactPerson: form.contactPerson || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        gstin: form.gstin || undefined,
      };
      if (editing) {
        await updateSupplier({ id: editing._id, ...data });
        toast("Supplier updated");
      } else {
        await createSupplier(data);
        toast("Supplier added");
      }
      resetForm();
      setDialogOpen(false);
    } catch {
      toast("Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: Id<"suppliers">) => {
    if (!window.confirm("Are you sure you want to remove this supplier?")) return;
    try {
      await removeSupplier({ id });
      toast("Supplier removed");
    } catch {
      toast("Failed to remove supplier");
    }
  };

  if (!isAuthenticated && !isLoading) {
    navigate("/auth");
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {suppliers?.length || 0} suppliers registered
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Truck className="h-3.5 w-3.5 mr-1.5" />
                Add Supplier
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editing ? "Edit Supplier" : "Add Supplier"}
                </DialogTitle>
                <DialogDescription>
                  Enter the supplier/distributor details
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Company Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Pharma Distributors Ltd."
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Contact Person</Label>
                  <Input
                    value={form.contactPerson}
                    onChange={(e) =>
                      setForm({ ...form, contactPerson: e.target.value })
                    }
                    placeholder="Person name"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Phone number"
                    className="mt-1 h-9"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="Email address"
                    className="mt-1 h-9"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Address</Label>
                  <Textarea
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    placeholder="Full address"
                    className="mt-1"
                    rows={2}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">GSTIN</Label>
                  <Input
                    value={form.gstin}
                    onChange={(e) =>
                      setForm({ ...form, gstin: e.target.value })
                    }
                    placeholder="e.g. 27AABCB1234C1Z1"
                    className="mt-1 h-9"
                  />
                </div>
              </div>
              <Button
                onClick={handleSave}
                disabled={saving || !form.name}
                className="mt-4"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                )}
                {editing ? "Update" : "Add"} Supplier
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-1">
        {filtered?.map((s, i) => (
          <motion.div
            key={s._id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="flex items-center justify-between px-4 py-3 border border-border/60 rounded-sm hover:bg-secondary/30 transition-colors cursor-pointer"
            onClick={() => openEdit(s)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {s.contactPerson && `${s.contactPerson} · `}
                {s.phone && `${s.phone}`}
                {s.gstin && ` · GST: ${s.gstin}`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(s._id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        ))}
        {filtered?.length === 0 && (
          <EmptyState
            icon={Truck}
            title={
              search ? "No suppliers match your search" : "No suppliers yet"
            }
            description={
              search
                ? "Try a different name, phone, or GSTIN."
                : "Add your distributors to track purchase bills, GSTINs, and supplier payments."
            }
            actions={
              search
                ? []
                : [
                    {
                      label: "Add Supplier",
                      onClick: () => setDialogOpen(true),
                    },
                  ]
            }
          />
        )}
      </div>
    </motion.div>
  );
}
