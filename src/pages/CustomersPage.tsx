import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  BarChart3, Loader2, Repeat, Plus, RefreshCcw, Search, Trash2, UserPlus, Wallet,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const CHURN_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
  unknown: "bg-secondary text-muted-foreground border-border",
};

const CHURN_LABELS: Record<string, string> = {
  high: "High churn risk",
  medium: "Medium churn risk",
  low: "Low churn risk",
  unknown: "No history yet",
};

function InsightStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm border border-border/60 bg-secondary/20 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

export default function CustomersPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Insights dialog (Task 10)
  const [insightsFor, setInsightsFor] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [loyaltyForm, setLoyaltyForm] = useState({ points: 10, reason: "" });
  const [loyaltyBusy, setLoyaltyBusy] = useState(false);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", gstin: "", creditLimit: 0, openingBalance: 0, notes: "",
  });

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const { customersApi } = await import("@/lib/api");
      const result = await customersApi.list({ limit: 100 });
      const list = Array.isArray(result) ? result : (result?.data ?? []);
      setCustomers(list);
    } catch { toast.error("Failed to load customers"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAuthenticated) void loadCustomers(); }, [isAuthenticated, loadCustomers]);
  useEffect(() => { if (!isLoading && !isAuthenticated) navigate("/auth", { replace: true }); }, [isLoading, isAuthenticated, navigate]);

  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search)),
  );

  const resetForm = () => {
    setForm({ name: "", phone: "", email: "", address: "", gstin: "", creditLimit: 0, openingBalance: 0, notes: "" });
    setEditing(null);
  };

  const openEdit = (c: any) => {
    setForm({ name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "", gstin: c.gstin || "", creditLimit: c.creditLimit || 0, openingBalance: c.openingBalance || 0, notes: c.notes || "" });
    setEditing(c); setDialogOpen(true);
  };

  const openInsights = async (c: any) => {
    setInsightsFor(c);
    setInsights(null);
    setLoyalty(null);
    setInsightsError("");
    setInsightsLoading(true);
    try {
      const { engagementApi } = await import("@/lib/api");
      const [data, loyaltyView] = await Promise.all([
        engagementApi.insights(c.id),
        engagementApi.loyalty(c.id).catch(() => null),
      ]);
      setInsights(data);
      setLoyalty(loyaltyView);
    } catch (err: any) {
      setInsightsError(err?.message ?? "Failed to load insights");
    } finally {
      setInsightsLoading(false);
    }
  };

  const closeInsights = () => {
    setInsightsFor(null);
    setInsights(null);
    setLoyalty(null);
    setInsightsError("");
    setLoyaltyForm({ points: 10, reason: "" });
  };

  const runLoyalty = async (op: "earn" | "redeem") => {
    if (!insightsFor) return;
    const points = Number(loyaltyForm.points);
    if (!(points > 0)) { toast.error("Points must be greater than 0"); return; }
    setLoyaltyBusy(true);
    try {
      const { engagementApi } = await import("@/lib/api");
      const payload = { customerId: insightsFor.id, points, reason: loyaltyForm.reason || undefined };
      if (op === "earn") await engagementApi.earn(payload);
      else await engagementApi.redeem(payload);
      toast.success(op === "earn" ? "Points awarded" : "Points redeemed");
      const [view, data] = await Promise.all([
        engagementApi.loyalty(insightsFor.id),
        engagementApi.insights(insightsFor.id),
      ]);
      setLoyalty(view);
      setInsights(data);
    } catch (err: any) {
      toast.error(err?.message ?? "Loyalty update failed");
    } finally {
      setLoyaltyBusy(false);
    }
  };

  const createRefill = async (m: any) => {
    try {
      const { refillsApi } = await import("@/lib/api");
      await refillsApi.create({
        customerId: insightsFor?.id,
        customerName: insights?.customer?.name,
        customerPhone: insights?.customer?.phone ?? undefined,
        medicineId: m.medicineId,
        medicineName: m.name,
        lastPurchaseDate: m.lastBought,
        daysAfter: m.avgGapDays ?? 30,
      });
      toast.success(`Refill reminder set for ${m.name}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create refill");
    }
  };

  const handleSave = async () => {
    if (!form.name) { toast("Customer name is required"); return; }
    setSaving(true);
    try {
      const { customersApi } = await import("@/lib/api");
      const data = { name: form.name, phone: form.phone || undefined, email: form.email || undefined, address: form.address || undefined, gstin: form.gstin || undefined, creditLimit: form.creditLimit || undefined, openingBalance: form.openingBalance || undefined, notes: form.notes || undefined };
      if (editing) { await customersApi.update(editing.id, data); toast("Customer updated"); }
      else { await customersApi.create(data); toast("Customer added"); }
      resetForm(); setDialogOpen(false); void loadCustomers();
    } catch { toast("Failed to save"); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this customer?")) return;
    try { const { customersApi } = await import("@/lib/api"); await customersApi.delete(id); toast("Customer removed"); void loadCustomers(); }
    catch { toast("Failed to remove customer"); }
  };

  if (!isAuthenticated && !isLoading) { navigate("/auth"); return null; }
  if (isLoading || loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-pulse text-muted-foreground text-sm">Loading...</div></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">{customers.length || 0} registered customers</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9 h-9 text-sm" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button size="sm"><UserPlus className="h-3.5 w-3.5 mr-1.5" />Add Customer</Button></DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Edit Customer" : "Add Customer"}</DialogTitle><DialogDescription>Enter customer details</DialogDescription></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label className="text-xs">Customer Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="mt-1 h-9" /></div>
                <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="mt-1 h-9" /></div>
                <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="mt-1 h-9" /></div>
                <div className="col-span-2"><Label className="text-xs">Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" className="mt-1" rows={2} /></div>
                <div><Label className="text-xs">GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="GSTIN" className="mt-1 h-9" /></div>
                <div><Label className="text-xs">Credit Limit (₹)</Label><Input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} className="mt-1 h-9" /></div>
                <div className="col-span-2"><Label className="text-xs">Opening Balance (₹)</Label><Input type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} className="mt-1 h-9" /></div>
                <div className="col-span-2"><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="mt-1" rows={2} /></div>
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
        {filtered.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
            className="flex items-center justify-between px-4 py-3 border border-border/60 rounded-sm hover:bg-secondary/30 transition-colors cursor-pointer"
            onClick={() => openEdit(c)}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.phone || "—"}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {c.balance != null && c.balance !== 0 && (
                <span className={`text-xs ${c.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                  {c.balance > 0 ? "Cr" : "Dr"} ₹{Math.abs(c.balance).toFixed(0)}
                </span>
              )}
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-primary"
                title="Purchase insights, RFM and loyalty"
                onClick={(e) => { e.stopPropagation(); void openInsights(c); }}>
                <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                Insights
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <EmptyState icon={UserPlus}
            title={search ? "No customers match your search" : "No customers yet"}
            description={search ? "Try a different name or phone number." : "Save regular customers for one-tap billing."}
            actions={search ? [] : [{ label: "Add Customer", onClick: () => setDialogOpen(true) }]}
          />
        )}
      </div>

      {/* ── Insights dialog (Task 10) — RFM, churn, frequent meds, loyalty ── */}
      <Dialog open={!!insightsFor} onOpenChange={(open) => { if (!open) closeInsights(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {insightsFor?.name} — Insights
            </DialogTitle>
            <DialogDescription>Purchase behaviour, churn and loyalty for this customer.</DialogDescription>
          </DialogHeader>

          {insightsLoading && (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading insights…
            </div>
          )}

          {!insightsLoading && insightsError && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              {insightsError}
              <Button variant="outline" size="sm" className="mt-2 block" onClick={() => insightsFor && void openInsights(insightsFor)}>
                Retry
              </Button>
            </div>
          )}

          {!insightsLoading && !insightsError && insights && (
            <div className="space-y-4">
              {/* RFM + headline stats */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary/10 text-primary border border-primary/30 text-sm px-2.5 py-1">
                  RFM {insights.rfm.rfmScore}/15
                </Badge>
                <Badge variant="outline" className="text-xs">R {insights.rfm.rScore}</Badge>
                <Badge variant="outline" className="text-xs">F {insights.rfm.fScore}</Badge>
                <Badge variant="outline" className="text-xs">M {insights.rfm.mScore}</Badge>
                <Badge className={`text-xs border ${CHURN_STYLES[insights.churnRisk] ?? CHURN_STYLES.unknown}`}>
                  {CHURN_LABELS[insights.churnRisk] ?? insights.churnRisk}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <InsightStat label="Lifetime value" value={`₹${Number(insights.ltv).toFixed(0)}`} />
                <InsightStat label="Invoices" value={String(insights.invoiceCount)} />
                <InsightStat label="Avg interval" value={insights.avgIntervalDays != null ? `${insights.avgIntervalDays}d` : "—"} />
                <InsightStat label="Idle" value={insights.daysIdle != null ? `${insights.daysIdle}d` : "—"} />
              </div>

              {/* Frequent medicines */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Frequent medicines (180d)
                </h3>
                {insights.frequentMedicines.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-sm border border-dashed border-border px-3 py-3">
                    No purchases on record yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-sm border border-border/60">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/60 bg-secondary/30 text-left text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Medicine</th>
                          <th className="px-3 py-2 font-medium text-right">Qty</th>
                          <th className="px-3 py-2 font-medium">Last bought</th>
                          <th className="px-3 py-2 font-medium text-right">Repeat</th>
                          <th className="px-3 py-2 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insights.frequentMedicines.map((m: any) => (
                          <tr key={m.medicineId} className="border-b border-border/40 last:border-0">
                            <td className="px-3 py-2">
                              <span className="font-medium">{m.name}</span>
                              {m.brand && <span className="ml-1.5 text-muted-foreground">{m.brand}</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{m.qty}</td>
                            <td className="px-3 py-2 tabular-nums">{m.lastBought}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {m.avgGapDays != null ? `${m.avgGapDays}d` : "—"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]"
                                onClick={() => void createRefill(m)}>
                                <Repeat className="h-3 w-3 mr-1" />Create refill
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Refill candidates */}
              {insights.refillCandidates.length > 0 && (
                <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Refill due within 7 days: {insights.refillCandidates.map((m: any) => m.name).join(", ")}
                  </p>
                </div>
              )}

              {/* Loyalty */}
              <div className="rounded-sm border border-border/60 px-3 py-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" /> Loyalty points
                  </h3>
                  <span className="text-lg font-semibold tabular-nums text-primary">
                    {loyalty ? loyalty.balance : 0}
                  </span>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label className="text-[10px]">Points</Label>
                    <Input type="number" min={1} value={loyaltyForm.points}
                      onChange={(e) => setLoyaltyForm({ ...loyaltyForm, points: Number(e.target.value) })}
                      className="h-8 w-24 text-sm" aria-label="Loyalty points" />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <Label className="text-[10px]">Reason</Label>
                    <Input value={loyaltyForm.reason}
                      onChange={(e) => setLoyaltyForm({ ...loyaltyForm, reason: e.target.value })}
                      placeholder="Optional reason" className="h-8 text-sm" />
                  </div>
                  <Button size="sm" className="h-8" disabled={loyaltyBusy}
                    onClick={() => void runLoyalty("earn")}>
                    {loyaltyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                    Earn
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" disabled={loyaltyBusy}
                    onClick={() => void runLoyalty("redeem")}>
                    Redeem
                  </Button>
                </div>

                {loyalty && loyalty.entries.length > 0 ? (
                  <div className="mt-2.5 max-h-32 overflow-y-auto space-y-1">
                    {loyalty.entries.slice(0, 10).map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate">
                          {e.reason || e.type}{e.invoiceId ? " · invoice" : ""}
                        </span>
                        <span className={`tabular-nums font-medium ${e.points >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {e.points >= 0 ? "+" : ""}{e.points}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No loyalty activity yet.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
