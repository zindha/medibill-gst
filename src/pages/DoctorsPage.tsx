import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Loader2, Plus, Search, Stethoscope, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function DoctorsPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const doctors = useQuery(api.doctors.list);
  const createDoctor = useMutation(api.doctors.create);
  const updateDoctor = useMutation(api.doctors.update);
  const removeDoctor = useMutation(api.doctors.remove);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", clinicName: "", clinicAddress: "", specialization: "", registrationNo: "", notes: "",
  });

  const filtered = doctors?.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()) || (d.clinicName && d.clinicName.toLowerCase().includes(search.toLowerCase())));
  const resetForm = () => { setForm({ name: "", phone: "", email: "", clinicName: "", clinicAddress: "", specialization: "", registrationNo: "", notes: "" }); setEditing(null); };
  const openEdit = (d: any) => {
    setForm({ name: d.name, phone: d.phone || "", email: d.email || "", clinicName: d.clinicName || "", clinicAddress: d.clinicAddress || "", specialization: d.specialization || "", registrationNo: d.registrationNo || "", notes: d.notes || "" });
    setEditing(d); setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast("Doctor name is required"); return; }
    setSaving(true);
    try {
      const data = { name: form.name, phone: form.phone || undefined, email: form.email || undefined, clinicName: form.clinicName || undefined, clinicAddress: form.clinicAddress || undefined, specialization: form.specialization || undefined, registrationNo: form.registrationNo || undefined, notes: form.notes || undefined };
      if (editing) { await updateDoctor({ id: editing._id, ...data }); toast("Doctor updated"); }
      else { await createDoctor(data); toast("Doctor added"); }
      resetForm(); setDialogOpen(false);
    } catch { toast("Failed to save"); } finally { setSaving(false); }
  };

  if (!isAuthenticated && !isLoading) { navigate("/auth"); return null; }
  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-pulse text-muted-foreground text-sm">Loading...</div></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Doctors & Clinics</h1>
          <p className="text-sm text-muted-foreground mt-1">{doctors?.length || 0} registered doctors</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9 h-9 text-sm" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button size="sm"><Stethoscope className="h-3.5 w-3.5 mr-1.5" />Add Doctor</Button></DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Edit Doctor" : "Add Doctor"}</DialogTitle><DialogDescription>Enter doctor or clinic details</DialogDescription></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label className="text-xs">Doctor Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. Name" className="mt-1 h-9" /></div>
                <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="mt-1 h-9" /></div>
                <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="mt-1 h-9" /></div>
                <div className="col-span-2"><Label className="text-xs">Clinic Name</Label><Input value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} placeholder="Clinic/Hospital name" className="mt-1 h-9" /></div>
                <div className="col-span-2"><Label className="text-xs">Clinic Address</Label><Textarea value={form.clinicAddress} onChange={(e) => setForm({ ...form, clinicAddress: e.target.value })} placeholder="Address" className="mt-1" rows={2} /></div>
                <div><Label className="text-xs">Specialization</Label><Input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} placeholder="e.g. Cardiologist" className="mt-1 h-9" /></div>
                <div><Label className="text-xs">Reg. No.</Label><Input value={form.registrationNo} onChange={(e) => setForm({ ...form, registrationNo: e.target.value })} placeholder="Registration number" className="mt-1 h-9" /></div>
                <div className="col-span-2"><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="mt-1" rows={2} /></div>
              </div>
              <Button onClick={handleSave} disabled={saving || !form.name} className="mt-4">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                {editing ? "Update" : "Add"} Doctor
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="space-y-1">
        {filtered?.map((d, i) => (
          <motion.div key={d._id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
            className="flex items-center justify-between px-4 py-3 border border-border/60 rounded-sm hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => openEdit(d)}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{d.name}</p>
              <p className="text-xs text-muted-foreground">{d.clinicName && `${d.clinicName} · `}{d.specialization && `${d.specialization}`}{d.phone && ` · ${d.phone}`}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
              onClick={(e) => { e.stopPropagation(); if (window.confirm("Remove this doctor?")) { removeDoctor({ id: d._id }); toast("Doctor removed"); }}}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        ))}
        {filtered?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No doctors found.</p>}
      </div>
    </motion.div>
  );
}
