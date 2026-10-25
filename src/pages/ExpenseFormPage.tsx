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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

const GST_RATES = [0, 5, 12, 18, 28];

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "credit", label: "Credit" },
  { value: "other", label: "Other" },
];

interface ItemRow {
  key: string;
  name: string;
  hsn: string;
  gstRate: number;
  quantity: number;
  unit: string;
  unitRate: number;
}

interface PartyForm {
  name: string;
  gstin: string;
  address: string;
  district: string;
  state: string;
  phone: string;
  email: string;
  isCompositionDealer: boolean;
}

const emptyParty: PartyForm = {
  name: "",
  gstin: "",
  address: "",
  district: "",
  state: "",
  phone: "",
  email: "",
  isCompositionDealer: false,
};

let rowCounter = 0;
const newRow = (): ItemRow => ({
  key: `row-${++rowCounter}`,
  name: "",
  hsn: "",
  gstRate: 0,
  quantity: 1,
  unit: "",
  unitRate: 0,
});

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const money = (value: number) => `₹${Number(value ?? 0).toFixed(2)}`;

const today = () => new Date().toISOString().split("T")[0];

export default function ExpenseFormPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { expenseId } = useParams();
  const navigate = useNavigate();

  const isNew = !expenseId || expenseId === "new";

  const [expenseNumber, setExpenseNumber] = useState<string>("");
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [partyId, setPartyId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [isGst, setIsGst] = useState(false);
  const [notes, setNotes] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [items, setItems] = useState<ItemRow[]>([newRow()]);

  const [categories, setCategories] = useState<string[]>([]);
  const [businessStateCode, setBusinessStateCode] = useState<string | null>(null);
  const [parties, setParties] = useState<any[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [selectedParty, setSelectedParty] = useState<any>(null);

  const [partyDialogOpen, setPartyDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<any>(null);
  const [partyForm, setPartyForm] = useState<PartyForm>(emptyParty);

  const [productRowKey, setProductRowKey] = useState<string | null>(null);
  const [productText, setProductText] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  const debouncedPartySearch = useDebouncedValue(partySearch, 250);
  const debouncedProductText = useDebouncedValue(productText, 250);

  // ── Loading ──────────────────────────────────────────────────────────────

  const loadParties = useCallback(async (query: string) => {
    try {
      const { expensesApi } = await import("@/lib/api");
      const list = await expensesApi.parties(query || undefined);
      setParties(Array.isArray(list) ? list : []);
    } catch {
      setParties([]);
    }
  }, []);

  const loadExpense = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const { expensesApi } = await import("@/lib/api");
      const data = await expensesApi.get(id);
      const expense = data?.expense;
      if (!expense) throw new Error("missing");
      setExpenseNumber(expense.number ?? "");
      setDate(expense.date ?? today());
      setCategory(expense.category ?? "");
      setDescription(expense.description ?? "");
      setPartyId(expense.partyId ?? "");
      setInvoiceNo(expense.invoiceNo ?? "");
      setIsGst(!!expense.isGst);
      setNotes(expense.notes ?? "");
      setPaymentMode(expense.paymentMode ?? "");
      setPaymentRef(expense.paymentRef ?? "");
      setPaymentDate(expense.paymentDate ?? "");
      setItems(
        (data.items ?? []).map((line: any) => ({
          key: `row-${++rowCounter}`,
          name: line.name ?? "",
          hsn: line.hsn ?? "",
          gstRate: Number(line.gstRate ?? 0),
          quantity: Number(line.quantity ?? 0),
          unit: line.unit ?? "",
          unitRate: Number(line.unitRate ?? 0),
        })),
      );
      if (data.party) setSelectedParty(data.party);
    } catch {
      toast.error("Could not open this expense");
      navigate("/dashboard/expenses", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      try {
        const { expensesApi } = await import("@/lib/api");
        const meta = await expensesApi.metadata();
        setCategories(meta?.categories ?? []);
        setBusinessStateCode(meta?.businessStateCode ?? null);
      } catch {
        setCategories([]);
      }
    })();
    void loadParties("");
  }, [isAuthenticated, loadParties]);

  useEffect(() => {
    if (isAuthenticated && !isNew && expenseId) void loadExpense(expenseId);
  }, [isAuthenticated, isNew, expenseId, loadExpense]);

  useEffect(() => {
    if (isAuthenticated) void loadParties(debouncedPartySearch);
  }, [isAuthenticated, debouncedPartySearch, loadParties]);

  useEffect(() => {
    if (!productRowKey || debouncedProductText.length < 2) {
      setSuggestions([]);
      return;
    }
    void (async () => {
      try {
        const { expensesApi } = await import("@/lib/api");
        const list = await expensesApi.products(debouncedProductText);
        setSuggestions(Array.isArray(list) ? list : []);
      } catch {
        setSuggestions([]);
      }
    })();
  }, [debouncedProductText, productRowKey]);

  // ── Totals (mirrors the server computation) ─────────────────────────────

  const lineAmount = (row: ItemRow) => round2(row.quantity * row.unitRate);
  const lineTax = (row: ItemRow) => round2((lineAmount(row) * row.gstRate) / 100);

  const subtotal = round2(items.reduce((sum, row) => sum + lineAmount(row), 0));
  const taxAmount = round2(items.reduce((sum, row) => sum + lineTax(row), 0));
  const gross = round2(subtotal + taxAmount);
  const roundOff = round2(Math.round(gross) - gross);
  const total = round2(gross + roundOff);

  const intraState = !!(
    selectedParty?.stateCode &&
    businessStateCode &&
    selectedParty.stateCode === businessStateCode
  );
  const cgst = intraState ? round2(taxAmount / 2) : 0;
  const sgst = intraState ? round2(taxAmount - cgst) : 0;
  const igst = intraState ? 0 : taxAmount;

  // ── Item helpers ────────────────────────────────────────────────────────

  const updateItem = (key: string, patch: Partial<ItemRow>) =>
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const removeItem = (key: string) =>
    setItems((rows) => rows.filter((row) => row.key !== key));

  const addItem = () => setItems((rows) => [...rows, newRow()]);

  const applyProduct = (key: string, product: any) => {
    updateItem(key, {
      name: product.name ?? "",
      hsn: product.hsn ?? "",
      gstRate: Number(product.gstRate ?? 0),
      unit: product.unit ?? "",
      unitRate: Number(product.price ?? 0),
    });
    setProductRowKey(null);
    setProductText("");
    setSuggestions([]);
  };

  // ── Party picker ────────────────────────────────────────────────────────

  const pickParty = (party: any) => {
    setPartyId(party.id);
    setSelectedParty(party);
    setPartySearch("");
  };

  const openPartyDialog = (party: any) => {
    setEditingParty(party);
    setPartyForm(
      party
        ? {
            name: party.name ?? "",
            gstin: party.gstin ?? "",
            address: party.address ?? "",
            district: party.district ?? "",
            state: party.state ?? "",
            phone: party.phone ?? "",
            email: party.email ?? "",
            isCompositionDealer: !!party.isCompositionDealer,
          }
        : emptyParty,
    );
    setPartyDialogOpen(true);
  };

  const saveParty = async () => {
    if (!partyForm.name.trim()) {
      toast("Party name is required");
      return;
    }
    try {
      const { expensesApi } = await import("@/lib/api");
      const payload = {
        name: partyForm.name.trim(),
        gstin: partyForm.gstin.trim() || undefined,
        address: partyForm.address.trim() || undefined,
        district: partyForm.district.trim() || undefined,
        state: partyForm.state.trim() || undefined,
        phone: partyForm.phone.trim() || undefined,
        email: partyForm.email.trim() || undefined,
        isCompositionDealer: partyForm.isCompositionDealer,
      };
      const saved = editingParty
        ? await expensesApi.updateParty(editingParty.id, payload)
        : await expensesApi.createParty(payload);
      toast(editingParty ? "Party updated" : "Party added");
      setPartyDialogOpen(false);
      await loadParties(debouncedPartySearch);
      if (!editingParty) pickParty(saved);
      else if (selectedParty?.id === saved.id) setSelectedParty(saved);
    } catch (err: any) {
      toast(err?.message ?? "Could not save the party");
    }
  };

  // ── Save / delete ───────────────────────────────────────────────────────

  const validate = () => {
    const next: Record<string, string> = {};
    if (!date) next.date = "Date is required";
    if (!category) next.category = "Category is required";
    const filled = items.filter((row) => row.name.trim() !== "");
    if (filled.length === 0) next.items = "Add at least one item line";
    if (isGst && !invoiceNo.trim()) next.invoiceNo = "Invoice number is required";
    if (isGst && filled.some((row) => !row.hsn.trim())) next.hsn = "HSN code is required on every line";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      const { expensesApi } = await import("@/lib/api");
      const payload = {
        date,
        category,
        description: description.trim() || undefined,
        partyId: partyId || undefined,
        invoiceNo: invoiceNo.trim() || undefined,
        isGst,
        notes: notes.trim() || undefined,
        paymentMode: paymentMode || undefined,
        paymentRef: paymentRef.trim() || undefined,
        paymentDate: paymentDate || undefined,
        items: items
          .filter((row) => row.name.trim() !== "")
          .map((row) => ({
            name: row.name.trim(),
            hsn: row.hsn.trim() || undefined,
            gstRate: row.gstRate,
            quantity: row.quantity,
            unit: row.unit.trim() || undefined,
            unitRate: row.unitRate,
          })),
      };
      if (isNew) {
        await expensesApi.create(payload);
        toast("Expense saved");
      } else {
        await expensesApi.update(expenseId!, payload);
        toast("Expense updated");
      }
      navigate("/dashboard/expenses");
    } catch (err: any) {
      toast(err?.message ?? "Could not save the expense");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!expenseId) return;
    if (!window.confirm("Delete this expense?")) return;
    try {
      const { expensesApi } = await import("@/lib/api");
      await expensesApi.delete(expenseId);
      toast("Expense deleted");
      navigate("/dashboard/expenses");
    } catch (err: any) {
      toast(err?.message ?? "Could not delete the expense");
    }
  };

  if (!authLoading && !isAuthenticated) {
    navigate("/auth");
    return null;
  }
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/expenses")}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {isNew ? "New Expense" : expenseNumber || "Expense"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isNew
                ? "The expense number is assigned when you save."
                : `Recorded on ${date} · ${category}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save Expense
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: details and lines */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 border-border/60 space-y-3">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
              Expense details
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs">Date *</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 h-9"
                />
                {errors.date && (
                  <p className="text-[11px] text-destructive mt-1">{errors.date}</p>
                )}
              </div>
              <div>
                <Label className="text-xs">Category *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className="text-[11px] text-destructive mt-1">{errors.category}</p>
                )}
              </div>
              <div>
                <Label className="text-xs">Invoice No</Label>
                <Input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder={isGst ? "Required for GST" : "Optional"}
                  className="mt-1 h-9"
                />
                {errors.invoiceNo && (
                  <p className="text-[11px] text-destructive mt-1">{errors.invoiceNo}</p>
                )}
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch id="gst-nature" checked={isGst} onCheckedChange={setIsGst} />
                <Label htmlFor="gst-nature" className="text-xs">
                  GST invoice
                </Label>
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this spend was for"
                className="mt-1 h-9"
              />
            </div>
          </Card>

          {/* Party */}
          <Card className="p-4 border-border/60 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Party</h3>
              <Button variant="outline" size="sm" onClick={() => openPartyDialog(null)}>
                <UserPlus className="h-3.5 w-3.5 mr-1.5" /> New Party
              </Button>
            </div>
            {selectedParty ? (
              <div className="flex items-start justify-between gap-3 border border-border/60 rounded-sm px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{selectedParty.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedParty.gstin ? `GSTIN ${selectedParty.gstin}` : "No GSTIN on file"}
                    {selectedParty.state ? ` · ${selectedParty.state}` : ""}
                    {selectedParty.district ? ` · ${selectedParty.district}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => openPartyDialog(selectedParty)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setPartyId("");
                      setSelectedParty(null);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Input
                  value={partySearch}
                  onChange={(e) => setPartySearch(e.target.value)}
                  placeholder="Search party by name or GSTIN..."
                  className="h-9"
                />
                {parties.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-auto border border-border/60 rounded-sm">
                    {parties.map((party: any) => (
                      <button
                        key={party.id}
                        onClick={() => pickParty(party)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/40"
                      >
                        {party.name}
                        {party.gstin && (
                          <span className="ml-2 text-xs text-muted-foreground">{party.gstin}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {parties.length === 0 && partySearch.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No party matches. Use “New Party” to add one.
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Item lines */}
          <Card className="p-4 border-border/60 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Items</h3>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Line
              </Button>
            </div>
            {errors.items && <p className="text-[11px] text-destructive">{errors.items}</p>}
            {errors.hsn && <p className="text-[11px] text-destructive">{errors.hsn}</p>}

            <div className="space-y-2">
              {items.map((row) => (
                <div key={row.key} className="border border-border/60 rounded-sm p-2 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-4 relative">
                      <Input
                        value={row.name}
                        onChange={(e) => {
                          updateItem(row.key, { name: e.target.value });
                          setProductRowKey(row.key);
                          setProductText(e.target.value);
                        }}
                        placeholder="Description or product"
                        className="h-9"
                      />
                      {productRowKey === row.key && suggestions.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full max-h-40 overflow-auto border border-border/60 rounded-sm bg-background shadow-sm">
                          {suggestions.map((product: any) => (
                            <button
                              key={product.id}
                              onClick={() => applyProduct(row.key, product)}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/40"
                            >
                              {product.name}
                              {product.hsn && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  HSN {product.hsn}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        value={row.hsn}
                        onChange={(e) => updateItem(row.key, { hsn: e.target.value })}
                        placeholder="HSN"
                        className="h-9"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Select
                        value={String(row.gstRate)}
                        onValueChange={(value) => updateItem(row.key, { gstRate: Number(value) })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GST_RATES.map((rate) => (
                            <SelectItem key={rate} value={String(rate)}>
                              {rate}% GST
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-1">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={row.quantity}
                        onChange={(e) => updateItem(row.key, { quantity: Number(e.target.value) })}
                        className="h-9"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Input
                        value={row.unit}
                        onChange={(e) => updateItem(row.key, { unit: e.target.value })}
                        placeholder="Unit"
                        className="h-9"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={row.unitRate}
                        onChange={(e) => updateItem(row.key, { unitRate: Number(e.target.value) })}
                        className="h-9"
                      />
                    </div>
                    <div className="sm:col-span-1 flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {money(lineAmount(row))}
                      </span>
                      {items.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(row.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right: totals and payment */}
        <div className="space-y-4">
          <Card className="p-4 border-border/60 space-y-2">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Totals</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{money(subtotal)}</span>
            </div>
            {intraState ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">CGST</span>
                  <span className="tabular-nums">{money(cgst)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">SGST</span>
                  <span className="tabular-nums">{money(sgst)}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">IGST</span>
                <span className="tabular-nums">{money(igst)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Round off</span>
              <span className="tabular-nums">{money(roundOff)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border/60 pt-2">
              <span className="font-medium">Total</span>
              <span className="font-semibold tabular-nums">{money(total)}</span>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {intraState ? "Intra-state: CGST + SGST" : "Inter-state: IGST"}
            </Badge>
          </Card>

          <Card className="p-4 border-border/60 space-y-3">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Payment</h3>
            <div>
              <Label className="text-xs">Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="Not recorded" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reference (UTR / cheque no)</Label>
              <Input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="Optional"
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Payment date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note"
                rows={3}
                className="mt-1"
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Party dialog */}
      <Dialog open={partyDialogOpen} onOpenChange={setPartyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingParty ? "Edit Party" : "New Party"}</DialogTitle>
            <DialogDescription>
              Party details used for the GST state split and invoice references.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Name *</Label>
              <Input
                value={partyForm.name}
                onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })}
                placeholder="e.g. City Power Supply"
                className="mt-1 h-9"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">GSTIN</Label>
              <Input
                value={partyForm.gstin}
                onChange={(e) => setPartyForm({ ...partyForm, gstin: e.target.value.toUpperCase() })}
                placeholder="e.g. 27ABCDE1234F1Z5"
                className="mt-1 h-9"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Address</Label>
              <Textarea
                value={partyForm.address}
                onChange={(e) => setPartyForm({ ...partyForm, address: e.target.value })}
                rows={2}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">District</Label>
              <Input
                value={partyForm.district}
                onChange={(e) => setPartyForm({ ...partyForm, district: e.target.value })}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">State</Label>
              <Input
                value={partyForm.state}
                onChange={(e) => setPartyForm({ ...partyForm, state: e.target.value })}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input
                value={partyForm.phone}
                onChange={(e) => setPartyForm({ ...partyForm, phone: e.target.value })}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                value={partyForm.email}
                onChange={(e) => setPartyForm({ ...partyForm, email: e.target.value })}
                className="mt-1 h-9"
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Switch
                id="composition-dealer"
                checked={partyForm.isCompositionDealer}
                onCheckedChange={(value) =>
                  setPartyForm({ ...partyForm, isCompositionDealer: value })
                }
              />
              <Label htmlFor="composition-dealer" className="text-xs">
                Composition dealer
              </Label>
            </div>
          </div>
          <Button onClick={saveParty} className="mt-4 w-full">
            {editingParty ? "Update Party" : "Add Party"}
          </Button>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
