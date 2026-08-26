import { api } from "@/convex/_generated/api";

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
import { Textarea } from "@/components/ui/textarea";
import {
  GSTInvoiceTemplate,
  PrintContainer,
} from "@/components/GSTInvoiceTemplate";
import { BarcodeCameraScanner } from "@/components/BarcodeCameraScanner";
import {
  getPopularCatalog,
  useMedicineCatalog,
  type CatalogMedicine,
} from "@/hooks/useMedicineCatalog";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useAuth } from "@/hooks/use-auth";
import { useConvex, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Barcode,
  Loader2,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

interface LineItem {
  medicineId?: string;
  medicineName: string;
  hsnCode?: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  gstRate: 0 | 5 | 12 | 18 | 28;
  gstAmount: number;
  cgst: number;
  sgst: number;
}

const GST_RATES = [0, 5, 12, 18, 28];

function calcGST(amount: number, rate: number) {
  const gstAmount = (amount * rate) / 100;
  return {
    gstAmount,
    cgst: gstAmount / 2,
    sgst: gstAmount / 2,
  };
}

export default function BillingPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const convex = useConvex();
  const medicines = useQuery(api.medicines.list);
  const customers = useQuery(api.customers.list);
  const doctors = useQuery(api.doctors.list);
  const createInvoice = useMutation(api.invoices.create);
  const createMedicine = useMutation(api.medicines.create);
  const getNextInvoiceNo = useQuery(api.invoices.getNextInvoiceNo);
  const [submitting, setSubmitting] = useState(false);

  const [items, setItems] = useState<LineItem[]>([
    {
      medicineName: "",
      quantity: 1,
      unit: "Nos",
      rate: 0,
      amount: 0,
      gstRate: 18,
      gstAmount: 0,
      cgst: 0,
      sgst: 0,
    },
  ]);
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [doctorId, setDoctorId] = useState<string | undefined>(undefined);
  const [discount, setDiscount] = useState(0);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { results: catalogResults, loading: catalogLoading } =
    useMedicineCatalog(searchQuery);
  const [showMedPicker, setShowMedPicker] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{
    invoiceNo: string;
    date: string;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    paymentMode?: string;
    subtotal: number;
    totalGst: number;
    cgst: number;
    sgst: number;
    igst: number;
    discount?: number;
    grandTotal: number;
    notes?: string;
    items: Array<{
      medicineName: string;
      hsnCode?: string;
      quantity: number;
      unit: string;
      rate: number;
      amount: number;
      gstRate: number;
      gstAmount: number;
      cgst: number;
      sgst: number;
    }>;
  } | null>(null);

  const pickerIndexRef = useRef<number | null>(null);

  const filteredMeds = medicines?.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.brand && m.brand.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const filteredCustomers = customers?.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(customerSearch)),
  );

  const addItem = () => {
    setItems([
      ...items,
      {
        medicineName: "",
        quantity: 1,
        unit: "Nos",
        rate: 0,
        amount: 0,
        gstRate: 18,
        gstAmount: 0,
        cgst: 0,
        sgst: 0,
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = <K extends keyof LineItem>(index: number, field: K, value: LineItem[K]) => {
    const newItems = [...items];
    newItems[index][field] = value;

    // Recalculate
    if (field === "quantity" || field === "rate" || field === "gstRate") {
      const qty = field === "quantity" ? (value as number) : newItems[index].quantity;
      const rate = field === "rate" ? (value as number) : newItems[index].rate;
      const gstRate = field === "gstRate" ? (value as number) : newItems[index].gstRate;
      const amount = qty * rate;
      const { gstAmount, cgst, sgst } = calcGST(amount, gstRate);
      newItems[index].amount = amount;
      newItems[index].gstAmount = gstAmount;
      newItems[index].cgst = cgst;
      newItems[index].sgst = sgst;
    }

    setItems(newItems);
  };

  const selectMedicine = useCallback((med: NonNullable<typeof medicines>[number]) => {
    const idx = pickerIndexRef.current;
    if (idx === null) return;
    const qty = 1;
    const rate = med.sellingPrice;
    const amount = qty * rate;
    const { gstAmount, cgst, sgst } = calcGST(amount, med.gstRate);
    setItems((prev) => {
      const next = [...prev];
      next[idx] = {
        medicineId: med._id,
        medicineName: `${med.name}${med.brand ? ` (${med.brand})` : ""}`,
        hsnCode: med.hsnCode,
        quantity: qty,
        unit: med.unit || "Nos",
        rate,
        amount,
        gstRate: med.gstRate,
        gstAmount,
        cgst,
        sgst,
      };
      return next;
    });
    pickerIndexRef.current = null;
    setPickerIndex(null);
    setShowMedPicker(false);
  }, []);

  const addCatalogItemToBill = async (entry: CatalogMedicine) => {
    const idx = pickerIndexRef.current;
    if (idx === null) return;
    try {
      const existing = medicines?.find(
        (med) => med.name.toLowerCase() === entry.name.toLowerCase(),
      );
      if (existing) {
        selectMedicine(existing);
        return;
      }
      const medId = await createMedicine({
        name: entry.name,
        brand: entry.company,
        category: entry.category,
        composition: entry.composition,
        quantity: 0,
        unit: entry.unit,
        purchasePrice: 0,
        sellingPrice: entry.price || 0,
        gstRate: entry.gstRate,
        hsnCode: entry.hsnCode,
      });
      selectMedicine({
        _id: medId,
        name: entry.name,
        brand: entry.company,
        hsnCode: entry.hsnCode,
        quantity: 0,
        unit: entry.unit,
        sellingPrice: entry.price || 0,
        gstRate: entry.gstRate,
      } as any);
      toast("Added to inventory — check the rate before saving");
    } catch {
      toast("Failed to add medicine");
    }
  };

  const lookupBarcode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setBarcodeLoading(true);
      setBarcodeError("");
      try {
        const med = await convex.query(api.medicines.searchByBarcode, {
          barcode: trimmed,
        });
        if (med) {
          setBarcode("");
          selectMedicine(med);
        } else {
          setBarcodeError(`No medicine found with barcode "${trimmed}"`);
        }
      } catch {
        setBarcodeError("Failed to look up barcode");
      } finally {
        setBarcodeLoading(false);
      }
    },
    [convex, selectMedicine],
  );

  const selectCustomer = (c: NonNullable<typeof customers>[number]) => {
    setCustomerId(c._id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone || "");
    setCustomerAddress(c.address || "");
    setShowCustomerPicker(false);
    setCustomerSearch("");
  };

  const clearCustomer = () => {
    setCustomerId(undefined);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
  };

  const totals = items.reduce(
    (acc, item) => ({
      subtotal: acc.subtotal + item.amount,
      totalGst: acc.totalGst + item.gstAmount,
      cgst: acc.cgst + item.cgst,
      sgst: acc.sgst + item.sgst,
    }),
    { subtotal: 0, totalGst: 0, cgst: 0, sgst: 0 },
  );

  const grandTotal = totals.subtotal + totals.totalGst - discount;

  const handleSubmit = async () => {
    if (items.length === 0 || items.some((i) => !i.medicineName)) {
      toast("Please fill in all item details");
      return;
    }
    setSubmitting(true);
    try {
      const invoiceNo = getNextInvoiceNo || `INV-${Date.now()}`;
      const date = new Date().toISOString().split("T")[0];
      const isCredit = paymentMode === "Credit";
      await createInvoice({
        invoiceNo,
        customerId: customerId as any,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        doctorId: doctorId as any,
        date,
        subtotal: totals.subtotal,
        totalGst: totals.totalGst,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: 0,
        discount: discount || undefined,
        grandTotal,
        paymentMode: paymentMode || undefined,
        status: isCredit ? "unpaid" : "paid",
        amountPaid: isCredit ? 0 : grandTotal,
        notes: notes || undefined,
        items: items.map((item) => ({
          ...item,
          medicineId: item.medicineId as any,
        })),
      });

      // Store invoice data for printing
      setLastInvoice({
        invoiceNo,
        date,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        paymentMode: paymentMode || undefined,
        subtotal: totals.subtotal,
        totalGst: totals.totalGst,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: 0,
        discount: discount || undefined,
        grandTotal,
        notes: notes || undefined,
        items: items.map((item) => ({
          medicineName: item.medicineName,
          hsnCode: item.hsnCode,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.amount,
          gstRate: item.gstRate,
          gstAmount: item.gstAmount,
          cgst: item.cgst,
          sgst: item.sgst,
        })),
      });

      toast("Invoice created successfully");
      // Reset form
      setItems([
        {
          medicineName: "",
          quantity: 1,
          unit: "Nos",
          rate: 0,
          amount: 0,
          gstRate: 18,
          gstAmount: 0,
          cgst: 0,
          sgst: 0,
        },
      ]);
      setCustomerId(undefined);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setDoctorId(undefined);
      setDiscount(0);
      setPaymentMode("Cash");
      setNotes("");
    } catch (error) {
      toast("Failed to create invoice");
    } finally {
      setSubmitting(false);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">New Bill</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {getNextInvoiceNo ? (
              <>
                Invoice{" "}
                <span className="font-mono font-medium text-foreground">
                  {getNextInvoiceNo}
                </span>{" "}
                · GST-ready
              </>
            ) : (
              "GST-ready billing"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Item
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save Invoice
          </Button>
        </div>
      </div>

      {/* Customer Section */}
      <Card className="p-5 border-border/60">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
            Customer Details
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustomerPicker(true)}
          >
            <UserRound className="h-3.5 w-3.5 mr-1.5" />
            {customerId ? "Change Customer" : "Choose Customer"}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Customer Name</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in Customer"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Phone number"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Payment Mode</Label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Card">Card</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="Credit">Credit (Udhar)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Address</Label>
            <Input
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Address"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Doctor (optional)</Label>
            <Select
              value={doctorId ?? "none"}
              onValueChange={(v) => setDoctorId(v === "none" ? undefined : v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {doctors?.map((d) => (
                  <SelectItem key={d._id} value={d._id}>
                    {d.name}
                    {d.clinicName ? ` — ${d.clinicName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {customerId && (
          <div className="mt-3 flex items-center justify-between rounded-sm border border-border/40 bg-secondary/30 px-3 py-2">
            <div className="text-sm min-w-0">
              <span className="font-medium">{customerName}</span>
              {customerPhone && (
                <span className="text-muted-foreground ml-2 text-xs">
                  {customerPhone}
                </span>
              )}
              {customerAddress && (
                <span className="text-muted-foreground ml-2 text-xs truncate">
                  {customerAddress}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={clearCustomer}
              title="Clear customer"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </Card>

      {/* Line Items */}
      <Card className="p-5 border-border/60">
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
          Items
        </h3>
        <div className="space-y-2">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-muted-foreground px-2">
            <div className="col-span-4">Item</div>
            <div className="col-span-1 text-center">Qty</div>
            <div className="col-span-2 text-right">Rate</div>
            <div className="col-span-1 text-center">GST%</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-1"></div>
            <div className="col-span-1"></div>
          </div>

          {items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-12 gap-2 items-center p-2 rounded-sm border border-border/40"
            >
              <div className="col-span-12 sm:col-span-4">
                <div className="flex gap-1">
                  <Input
                    value={item.medicineName}
                    onChange={(e) =>
                      updateItem(i, "medicineName", e.target.value)
                    }
                    placeholder="Medicine name"
                    className="h-8 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title="Search or scan barcode"
                    onClick={() => {
                      pickerIndexRef.current = i;
                      setPickerIndex(i);
                      setShowMedPicker(true);
                      setSearchQuery("");
                      setBarcode("");
                      setBarcodeError("");
                      setShowScanner(false);
                    }}
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="col-span-4 sm:col-span-1">
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(i, "quantity", Math.max(1, Number(e.target.value)))
                  }
                  className="h-8 text-sm text-center"
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.rate}
                  onChange={(e) =>
                    updateItem(i, "rate", Number(e.target.value))
                  }
                  className="h-8 text-sm text-right"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Select
                  value={String(item.gstRate)}
                  onValueChange={(v) => updateItem(i, "gstRate", Number(v) as 0 | 5 | 12 | 18 | 28)}
                >
                  <SelectTrigger className="h-8 text-sm">
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
              <div className="col-span-2 sm:col-span-2 text-right text-sm font-medium">
                ₹{item.amount.toFixed(2)}
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          ))}

          <Button variant="outline" size="sm" onClick={addItem} className="mt-2">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Item
          </Button>
        </div>
      </Card>

      {/* Totals */}
      <Card className="p-5 border-border/60">
        <div className="flex flex-col sm:flex-row sm:justify-end gap-6">
          <div className="space-y-3 sm:w-72">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">CGST (half)</span>
              <span>₹{totals.cgst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">SGST (half)</span>
              <span>₹{totals.sgst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total GST</span>
              <span>₹{totals.totalGst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Discount</span>
              <Input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="h-7 w-24 text-sm text-right"
              />
            </div>
            <div className="flex items-end justify-between pt-3 border-t border-border mt-1">
              <span className="text-sm text-muted-foreground uppercase tracking-wider">
                Grand Total
              </span>
              <span className="text-2xl font-semibold tracking-tight text-primary tabular-nums leading-none">
                ₹
                <AnimatedNumber
                  value={grandTotal}
                  format={(n) => n.toFixed(2)}
                />
              </span>
            </div>
            {paymentMode === "Credit" && (
              <p className="text-xs text-muted-foreground">
                Credit sale — invoice will be marked as{" "}
                <span className="text-foreground font-medium">unpaid</span> and
                tracked in payment outstanding.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Notes */}
      <Card className="p-5 border-border/60">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">
          Notes
        </Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          className="mt-2"
          rows={2}
        />
      </Card>

      {/* Medicine Picker Dialog */}
      <Dialog
        open={showMedPicker}
        onOpenChange={(open) => {
          if (!open) {
            setShowScanner(false);
            setPickerIndex(null);
            pickerIndexRef.current = null;
          }
          setShowMedPicker(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Medicine</DialogTitle>
            <DialogDescription>
              Scan a barcode or search your inventory
            </DialogDescription>
          </DialogHeader>

          {/* Barcode section */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void lookupBarcode(barcode);
                }}
                placeholder="Type or scan barcode code"
                className="h-9 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void lookupBarcode(barcode)}
                disabled={barcodeLoading || !barcode.trim()}
              >
                {barcodeLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Barcode className="h-3.5 w-3.5" />
                )}
                Find
              </Button>
              <Button
                size="sm"
                className="shrink-0"
                variant={showScanner ? "secondary" : "default"}
                onClick={() => {
                  setBarcodeError("");
                  setShowScanner((s) => !s);
                }}
                disabled={barcodeLoading}
              >
                {showScanner ? "Stop" : "Scan"}
              </Button>
            </div>
            {barcodeError && (
              <p className="text-xs text-destructive">{barcodeError}</p>
            )}
            <BarcodeCameraScanner
              active={showScanner}
              onScan={(code) => {
                setShowScanner(false);
                void lookupBarcode(code);
              }}
              onError={(msg) => setBarcodeError(msg)}
              className="w-full overflow-hidden rounded-sm border border-border/60 bg-black [&_video]:w-full"
            />
          </div>

          <div className="relative">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicines by name or brand..."
              className="mb-2 pr-9"
              autoFocus
            />
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredMeds?.map((med) => (
              <button
                key={med._id}
                onClick={() => selectMedicine(med)}
                className="w-full text-left px-3 py-2 rounded-sm text-sm hover:bg-secondary transition-colors flex items-center justify-between"
              >
                <div>
                  <span className="font-medium">{med.name}</span>
                  {med.brand && (
                    <span className="text-muted-foreground ml-1">
                      ({med.brand})
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  ₹{med.sellingPrice} | {med.quantity} in stock
                </div>
              </button>
            ))}
            {filteredMeds?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No medicines found in inventory.
              </p>
            )}
            {filteredMeds?.length === 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  From Medicine Database
                </p>
                {catalogLoading && searchQuery.trim() ? (
                  <p className="text-sm text-muted-foreground text-center py-4 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading database…
                  </p>
                ) : (
                  <div className="space-y-1">
                    {(searchQuery.trim()
                      ? catalogResults
                      : getPopularCatalog(15)
                    )?.map((m) => (
                      <div
                        key={`${m.name}-${m.company}`}
                        className="flex items-center justify-between px-3 py-2 rounded-sm text-sm border border-border/40"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {m.company} · {m.composition}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 ml-3"
                          onClick={() => void addCatalogItemToBill(m)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                      </div>
                    ))}
                    {searchQuery.trim() && catalogResults?.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No medicines found in the database.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Picker Dialog */}
      <Dialog
        open={showCustomerPicker}
        onOpenChange={setShowCustomerPicker}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Customer</DialogTitle>
            <DialogDescription>
              Choose a customer to auto-fill their details
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search by name or phone..."
              className="mb-2 pr-9"
              autoFocus
            />
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredCustomers?.map((c) => (
              <button
                key={c._id}
                onClick={() => selectCustomer(c)}
                className="w-full text-left px-3 py-2 rounded-sm text-sm hover:bg-secondary transition-colors flex items-center justify-between"
              >
                <div>
                  <span className="font-medium">{c.name}</span>
                  {c.phone && (
                    <span className="text-muted-foreground ml-1">
                      {c.phone}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.totalPurchases || 0} purchases
                </div>
              </button>
            ))}
            {filteredCustomers?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No customers found. Add them in Customers first.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Success banner with print option */}
      {lastInvoice && !showPrint && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-sm border border-border/60 bg-secondary/30 p-4"
        >
          <p className="text-sm font-medium mb-2">
            ✓ Invoice {lastInvoice.invoiceNo} created successfully
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setShowPrint(true)}
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Print Invoice
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLastInvoice(null)}
            >
              Dismiss
            </Button>
          </div>
        </motion.div>
      )}

      {/* Print Preview */}
      {showPrint && lastInvoice && (
        <PrintContainer onClose={() => setShowPrint(false)}>
          <GSTInvoiceTemplate invoice={lastInvoice} />
        </PrintContainer>
      )}
    </motion.div>
  );
}
