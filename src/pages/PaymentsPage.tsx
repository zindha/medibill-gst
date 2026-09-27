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
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  IndianRupee,
  Loader2,
  Plus,
  RotateCcw,
  Scale,
  Trash2,
  Wallet,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type PayType = "received" | "paid" | "expense";

const TYPE_META: Record<PayType, { label: string; cls: string }> = {
  received: { label: "Received", cls: "border-green-600/30 text-green-700 bg-green-600/5" },
  paid: { label: "Paid", cls: "border-red-600/30 text-red-700 bg-red-600/5" },
  expense: { label: "Expense", cls: "border-red-600/30 text-red-700 bg-red-600/5" },
};

export default function PaymentsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [payments, setPayments] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PayType | "all">("all");
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [form, setForm] = useState({
    type: "received" as PayType,
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    category: "",
    paymentMode: "cash",
    invoiceId: "",
    description: "",
  });

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const { paymentsApi, getAuthToken } = await import("@/lib/api");
      const apiBase = import.meta.env.VITE_API_URL || "/api";
      const [pResult, tResult] = await Promise.all([
        paymentsApi.list(),
        fetch(`${apiBase}/payments/summary`, {
          headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
        }).then(r => r.json()).catch(() => null),
      ]);
      const list = Array.isArray(pResult) ? pResult : (pResult?.data ?? []);
      setPayments(list);
      if (tResult?.data) setTotals(tResult.data);
    } catch { toast.error("Failed to load payments"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAuthenticated) void loadPayments(); }, [isAuthenticated, loadPayments]);
  useEffect(() => { if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true }); }, [authLoading, isAuthenticated, navigate]);

  const filtered = filter === "all" ? payments : payments.filter((p) => p.type === filter);

  const resetForm = () => {
    setForm({ type: "received", amount: 0, date: new Date().toISOString().split("T")[0], category: "", paymentMode: "cash", invoiceId: "", description: "" });
  };

  const handleSave = async () => {
    if (!form.amount || form.amount <= 0) { toast("Enter a valid amount"); return; }
    setSaving(true);
    try {
      const { paymentsApi } = await import("@/lib/api");
      await paymentsApi.create({
        date: form.date,
        type: form.type,
        category: form.category || undefined,
        amount: form.amount,
        paymentMode: form.paymentMode as any,
        invoiceId: form.invoiceId || undefined,
        description: form.description || undefined,
      });
      toast("Payment recorded");
      resetForm(); setAddOpen(false); void loadPayments();
    } catch (err: any) { toast(err.message ?? "Failed to record payment"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this payment?")) return;
    try {
      const { getAuthToken } = await import("@/lib/api");
      const apiBase = import.meta.env.VITE_API_URL || "/api";
      await fetch(`${apiBase}/payments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
      });
      toast("Payment removed"); void loadPayments();
    } catch { toast("Failed to remove payment"); }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  if (!authLoading && !isAuthenticated) { navigate("/auth"); return null; }
  if (authLoading || loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-pulse text-muted-foreground text-sm">Loading...</div></div>;

  const summary = [
    { label: "Total Received", value: totals.received || 0, icon: ArrowDownLeft, tone: "text-green-600" },
    { label: "Total Paid", value: totals.paid || 0, icon: ArrowUpRight, tone: "text-red-600" },
    { label: "Expenses", value: totals.expenses || 0, icon: Wallet, tone: "text-red-600" },
    { label: "Net Cash Flow", value: totals.net || 0, icon: Scale, tone: (totals.net || 0) >= 0 ? "text-green-600" : "text-red-600" },
    { label: "Outstanding", value: totals.outstanding || 0, icon: IndianRupee, tone: (totals.outstanding || 0) > 0 ? "text-amber-600" : "text-muted-foreground" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Payments</h1>
            <p className="text-sm text-muted-foreground mt-1">Track money received, paid, and outstanding</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/cash-bank")}>
            <Banknote className="h-3.5 w-3.5 mr-1.5" /> Cash &amp; Bank
          </Button>
        </div>
        <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Add Payment</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Payment</DialogTitle>
              <DialogDescription>Record money received, paid out, or an expense</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PayType })}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Amount (₹)</Label>
                <Input type="number" min={0} step={0.01} value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} placeholder="0.00" className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Payment Mode</Label>
                <Select value={form.paymentMode} onValueChange={(v) => setForm({ ...form, paymentMode: v })}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Rent, Salary, Sales" className="mt-1 h-9" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional note" className="mt-1 h-9" />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving || !form.amount || form.amount <= 0} className="mt-4 w-full">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Save Payment
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {summary.map((s) => (
          <Card key={s.label} className="p-4 border-border/60">
            <div className="flex items-center gap-2">
              <s.icon className={`h-4 w-4 ${s.tone}`} />
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
            <p className="text-lg font-semibold mt-2">₹{s.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
          </Card>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-3">
        {(["all", "received", "paid", "expense"] as const).map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-sm text-sm transition-colors ${filter === t ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "all" ? "All" : TYPE_META[t].label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-1">
        {filtered.map((p, i) => {
          const isVoided = !!p.voided;
          return (
          <motion.div key={p.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
            className={`flex items-center justify-between px-4 py-3 border rounded-sm transition-colors ${isVoided ? "border-red-600/30 bg-red-600/[0.03]" : "border-border/60 hover:bg-secondary/30"}`}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {isVoided ? <RotateCcw className="h-4 w-4 text-red-600 shrink-0" /> : p.type === "received" ? <ArrowDownLeft className="h-4 w-4 text-green-600 shrink-0" /> : <ArrowUpRight className="h-4 w-4 text-red-600 shrink-0" />}
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${isVoided ? "text-red-700" : ""}`}>{p.description || p.category || TYPE_META[p.type as PayType].label}</p>
                <p className="text-xs text-muted-foreground">{formatDate(p.date ?? p.createdAt)}{p.paymentMode ? ` · ${p.paymentMode}` : ""}{p.reference ? ` · ${p.reference}` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-sm font-semibold ${isVoided ? "text-red-600" : p.type === "received" ? "text-green-700" : "text-red-700"}`}>
                {isVoided ? "Refunded ₹" : p.type === "received" ? "+" : "-"}{p.amount.toFixed(2)}
              </span>
              {isVoided ? (
                <span className="px-1.5 py-0.5 rounded-sm border text-[10px] border-red-600/30 text-red-700 bg-red-600/5">Refunded</span>
              ) : p.category === "Refund" ? (
                <span className="px-1.5 py-0.5 rounded-sm border text-[10px] border-red-600/30 text-red-700 bg-red-600/5">Refund</span>
              ) : (
                <span className={`px-1.5 py-0.5 rounded-sm border text-[10px] ${TYPE_META[p.type as PayType].cls}`}>{TYPE_META[p.type as PayType].label}</span>
              )}
              {!isVoided && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(p.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </motion.div>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState icon={Wallet}
            title={filter === "all" ? "No payments recorded" : `No ${TYPE_META[filter as PayType].label.toLowerCase()} payments`}
            description={filter === "all" ? "Record money received, paid out, or expenses." : `Nothing under ${TYPE_META[filter as PayType].label.toLowerCase()} yet.`}
            actions={[{ label: "Add Payment", onClick: () => setAddOpen(true) }]}
          />
        )}
      </div>
    </motion.div>
  );
}
