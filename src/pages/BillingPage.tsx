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
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
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
  const medicines = useQuery(api.medicines.list);
  const createInvoice = useMutation(api.invoices.create);
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
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showMedPicker, setShowMedPicker] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredMeds = medicines?.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.brand && m.brand.toLowerCase().includes(searchQuery.toLowerCase())),
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

  const selectMedicine = (med: NonNullable<typeof medicines>[number]) => {
    if (pickerIndex === null) return;
    const qty = 1;
    const rate = med.sellingPrice;
    const amount = qty * rate;
    const { gstAmount, cgst, sgst } = calcGST(amount, med.gstRate);
    const newItems = [...items];
    newItems[pickerIndex] = {
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
    setItems(newItems);
    setShowMedPicker(false);
    setPickerIndex(null);
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
      await createInvoice({
        invoiceNo: getNextInvoiceNo || `INV-${Date.now()}`,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        date: new Date().toISOString().split("T")[0],
        subtotal: totals.subtotal,
        totalGst: totals.totalGst,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: 0,
        discount: discount || undefined,
        grandTotal,
        paymentMode: paymentMode || undefined,
        notes: notes || undefined,
        items: items.map((item) => ({
          ...item,
          medicineId: item.medicineId as any,
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
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">New Bill</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {getNextInvoiceNo && `Invoice #${getNextInvoiceNo}`}
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
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
          Customer Details
        </h3>
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
                <SelectItem value="Credit">Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
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
                    onClick={() => {
                      setPickerIndex(i);
                      setShowMedPicker(true);
                      setSearchQuery("");
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
            <div className="flex justify-between text-base font-semibold pt-2 border-t border-border">
              <span>Grand Total</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
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
      <Dialog open={showMedPicker} onOpenChange={setShowMedPicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Medicine</DialogTitle>
            <DialogDescription>
              Search and select a medicine from your inventory
            </DialogDescription>
          </DialogHeader>
          <Input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search medicines..."
            className="mb-2"
            autoFocus
          />
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
                No medicines found. Add some in Inventory first.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
