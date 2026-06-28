import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Loader2,
  PackagePlus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const GST_RATES = [0, 5, 12, 18, 28];

export default function InventoryPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const medicines = useQuery(api.medicines.list);
  const suppliers = useQuery(api.suppliers.list);
  const createMedicine = useMutation(api.medicines.create);
  const updateMedicine = useMutation(api.medicines.update);
  const removeMedicine = useMutation(api.medicines.remove);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    brand: "",
    category: "",
    batchNo: "",
    expiryDate: "",
    quantity: 0,
    unit: "Nos",
    purchasePrice: 0,
    sellingPrice: 0,
    gstRate: 18,
    hsnCode: "",
    supplierId: "",
  });

  const filtered = medicines?.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.brand && m.brand.toLowerCase().includes(search.toLowerCase())) ||
      (m.hsnCode && m.hsnCode.toLowerCase().includes(search.toLowerCase())),
  );

  const resetForm = () => {
    setForm({
      name: "",
      brand: "",
      category: "",
      batchNo: "",
      expiryDate: "",
      quantity: 0,
      unit: "Nos",
      purchasePrice: 0,
      sellingPrice: 0,
      gstRate: 18,
      hsnCode: "",
      supplierId: "",
    });
    setEditing(null);
  };

  const openEdit = (med: any) => {
    setForm({
      name: med.name,
      brand: med.brand || "",
      category: med.category || "",
      batchNo: med.batchNo || "",
      expiryDate: med.expiryDate || "",
      quantity: med.quantity,
      unit: med.unit || "Nos",
      purchasePrice: med.purchasePrice,
      sellingPrice: med.sellingPrice,
      gstRate: med.gstRate,
      hsnCode: med.hsnCode || "",
      supplierId: med.supplierId || "",
    });
    setEditing(med);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      toast("Medicine name is required");
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name,
        brand: form.brand || undefined,
        category: form.category || undefined,
        batchNo: form.batchNo || undefined,
        expiryDate: form.expiryDate || undefined,
        quantity: form.quantity,
        unit: form.unit || undefined,
        purchasePrice: form.purchasePrice,
        sellingPrice: form.sellingPrice,
        gstRate: form.gstRate as 0 | 5 | 12 | 18 | 28,
        hsnCode: form.hsnCode || undefined,
        supplierId: (form.supplierId || undefined) as any,
      };

      if (editing) {
        await updateMedicine({ id: editing._id, ...data });
        toast("Medicine updated");
      } else {
        await createMedicine(data);
        toast("Medicine added");
      }
      resetForm();
      setDialogOpen(false);
    } catch (error) {
      toast("Failed to save medicine");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeMedicine({ id });
      toast("Medicine removed");
    } catch {
      toast("Failed to remove medicine");
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
          <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {medicines?.length || 0} medicines in stock
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
                <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
                Add Medicine
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editing ? "Edit Medicine" : "Add Medicine"}
                </DialogTitle>
                <DialogDescription>
                  Fill in the medicine details below
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Medicine Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Paracetamol 500mg"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Brand</Label>
                  <Input
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    placeholder="Brand name"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Input
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    placeholder="e.g. Tablet, Syrup"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Batch No.</Label>
                  <Input
                    value={form.batchNo}
                    onChange={(e) =>
                      setForm({ ...form, batchNo: e.target.value })
                    }
                    placeholder="Batch number"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Expiry Date</Label>
                  <Input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) =>
                      setForm({ ...form, expiryDate: e.target.value })
                    }
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({ ...form, quantity: Number(e.target.value) })
                    }
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="Nos, Strip, Bottle"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Purchase Price (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.purchasePrice}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        purchasePrice: Number(e.target.value),
                      })
                    }
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Selling Price (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.sellingPrice}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        sellingPrice: Number(e.target.value),
                      })
                    }
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">GST Rate (%)</Label>
                  <Select
                    value={String(form.gstRate)}
                    onValueChange={(v) =>
                      setForm({ ...form, gstRate: Number(v) })
                    }
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GST_RATES.map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          {r}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">HSN Code</Label>
                  <Input
                    value={form.hsnCode}
                    onChange={(e) =>
                      setForm({ ...form, hsnCode: e.target.value })
                    }
                    placeholder="e.g. 300490"
                    className="mt-1 h-9"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Supplier</Label>
                  <Select
                    value={form.supplierId}
                    onValueChange={(v) =>
                      setForm({ ...form, supplierId: v })
                    }
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue placeholder="Select supplier (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers?.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                {editing ? "Update" : "Add"} Medicine
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-1">
        {filtered?.map((med, i) => (
          <motion.div
            key={med._id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="flex items-center justify-between px-4 py-3 border border-border/60 rounded-sm hover:bg-secondary/30 transition-colors cursor-pointer"
            onClick={() => openEdit(med)}
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{med.name}</p>
                {med.brand && (
                  <p className="text-xs text-muted-foreground">{med.brand}</p>
                )}
              </div>
              <Badge
                variant={med.quantity <= 10 ? "destructive" : "secondary"}
                className="text-[10px] shrink-0"
              >
                {med.quantity} {med.unit}
              </Badge>
              <span className="text-xs text-muted-foreground shrink-0">
                {med.hsnCode && `HSN: ${med.hsnCode}`}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right text-xs">
                <p className="text-muted-foreground">₹{med.sellingPrice}</p>
                <p className="text-muted-foreground">{med.gstRate}% GST</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(med._id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        ))}
        {filtered?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No medicines found.
          </p>
        )}
      </div>
    </motion.div>
  );
}
