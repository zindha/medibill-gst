import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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
import {
  GSTInvoiceTemplate,
  PrintContainer,
} from "@/components/GSTInvoiceTemplate";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Banknote,
  Eye,
  Printer,
  Receipt,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function InvoicesPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const invoices = useQuery(api.invoices.list);
  const removeInvoice = useMutation(api.invoices.remove);
  const [search, setSearch] = useState("");
  const [viewInvoiceId, setViewInvoiceId] = useState<Id<"invoices"> | null>(null);
  const [printData, setPrintData] = useState<typeof invoiceDetail | null>(null);
  const invoiceDetail = useQuery(
    api.invoices.get,
    viewInvoiceId ? { id: viewInvoiceId } : "skip",
  );
  const payments = useQuery(
    api.payments.listByInvoice,
    viewInvoiceId ? { invoiceId: viewInvoiceId } : "skip",
  );
  const createPayment = useMutation(api.payments.create);
  const removePaymentMut = useMutation(api.payments.remove);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("Cash");
  const [payDate, setPayDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const filtered = invoices?.filter(
    (inv) =>
      inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customerName &&
        inv.customerName.toLowerCase().includes(search.toLowerCase())),
  );

  const handleView = (inv: NonNullable<typeof invoices>[number]) => {
    setViewInvoiceId(inv._id);
  };

  const handleDelete = async (id: Id<"invoices">) => {
    try {
      await removeInvoice({ id });
      toast("Invoice deleted");
    } catch {
      toast("Failed to delete invoice");
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusInfo = (inv: {
    status?: string | null;
    paymentMode?: string | null;
  }) => {
    const status = inv.status || (inv.paymentMode === "Credit" ? "unpaid" : "paid");
    const map: Record<string, { label: string; cls: string }> = {
      paid: {
        label: "Paid",
        cls: "border-green-600/30 text-green-700 bg-green-600/5",
      },
      partial: {
        label: "Partial",
        cls: "border-amber-600/30 text-amber-700 bg-amber-600/5",
      },
      unpaid: {
        label: "Unpaid",
        cls: "border-red-600/30 text-red-700 bg-red-600/5",
      },
    };
    return map[status] || map.paid;
  };

  const viewedInvoice = invoiceDetail?.invoice;
  const balance = viewedInvoice
    ? Math.max(0, viewedInvoice.grandTotal - (viewedInvoice.amountPaid || 0))
    : 0;

  const openPayDialog = () => {
    setPayAmount(balance ? balance.toFixed(2) : "");
    setPayMode("Cash");
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayOpen(true);
  };

  const handleSavePayment = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast("Enter a valid amount");
      return;
    }
    if (!viewedInvoice) return;
    try {
      await createPayment({
        date: payDate,
        type: "received",
        category: "Invoice Payment",
        amount,
        reference: viewedInvoice.invoiceNo,
        invoiceId: viewedInvoice._id,
        customerId: viewedInvoice.customerId,
        description: `Payment for ${viewedInvoice.invoiceNo}`,
        paymentMode: payMode,
      });
      toast("Payment recorded");
      setPayOpen(false);
    } catch {
      toast("Failed to record payment");
    }
  };

  const handleRemovePayment = async (id: Id<"payments">) => {
    try {
      await removePaymentMut({ id });
      toast("Payment removed");
    } catch {
      toast("Failed to remove payment");
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
          <h1 className="text-xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {invoices?.length || 0} total invoices
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoices..."
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        {filtered?.map((inv, i) => (
          <motion.div
            key={inv._id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="flex items-center justify-between px-4 py-3 border border-border/60 rounded-sm hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">
                {inv.invoiceNo}
              </span>
              <span className="text-sm truncate">
                {inv.customerName || "Walk-in Customer"}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatDate(inv.date)}
              </span>
              <span className="text-sm font-semibold shrink-0">
                ₹{inv.grandTotal.toLocaleString("en-IN")}
              </span>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>GST: ₹{inv.totalGst.toFixed(2)}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-sm border text-[10px] ${getStatusInfo(inv).cls}`}
                >
                  {getStatusInfo(inv).label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleView(inv)}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(inv._id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        ))}
        {filtered?.length === 0 && (
          <EmptyState
            icon={Receipt}
            title={search ? "No invoices match your search" : "No invoices yet"}
            description={
              search
                ? "Try a different invoice number or customer name."
                : "Create your first GST invoice from billing — scan barcodes, add items, and print a GST-compliant bill in seconds."
            }
            actions={
              search
                ? []
                : [
                    {
                      label: "Create Invoice",
                      onClick: () => navigate("/dashboard/billing"),
                    },
                  ]
            }
          />
        )}
      </div>

      {/* View Invoice Dialog */}
      <Dialog
        open={!!viewInvoiceId}
        onOpenChange={(open) => !open && setViewInvoiceId(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          {invoiceDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>{invoiceDetail.invoice.invoiceNo}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPrintData(invoiceDetail);
                      setViewInvoiceId(null);
                    }}
                  >
                    <Printer className="h-3.5 w-3.5 mr-1.5" />
                    Print
                  </Button>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Customer</p>
                    <p className="font-medium">
                      {invoiceDetail.invoice.customerName || "Walk-in Customer"}
                    </p>
                    {invoiceDetail.invoice.customerPhone && (
                      <p className="text-muted-foreground text-xs">
                        {invoiceDetail.invoice.customerPhone}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Date</p>
                    <p>{formatDate(invoiceDetail.invoice.date)}</p>
                    <p className="text-muted-foreground text-xs">
                      {invoiceDetail.invoice.paymentMode}
                    </p>
                  </div>
                </div>

                {/* Line Items */}
                {invoiceDetail.items.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                      Items
                    </h4>
                    <div className="space-y-1">
                      {invoiceDetail.items.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm py-1"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="truncate block">
                              {item.medicineName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {item.quantity} × ₹{item.rate.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <span>₹{item.amount.toFixed(2)}</span>
                            <span className="block text-xs text-muted-foreground">
                              GST: ₹{item.gstAmount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment Status */}
                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wider">
                      Payment
                    </h4>
                    {balance > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openPayDialog}
                      >
                        <Banknote className="h-3.5 w-3.5 mr-1.5" />
                        Record Payment
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <span
                        className={`inline-block mt-1 px-1.5 py-0.5 rounded-sm border text-[10px] ${getStatusInfo(invoiceDetail.invoice).cls}`}
                      >
                        {getStatusInfo(invoiceDetail.invoice).label}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Paid</p>
                      <p className="font-medium mt-1">
                        ₹{(invoiceDetail.invoice.amountPaid || 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="font-medium mt-1">₹{balance.toFixed(2)}</p>
                    </div>
                  </div>
                  {payments && payments.length > 0 && (
                    <div className="mt-3">
                      {payments.map((p) => (
                        <div
                          key={p._id}
                          className="flex items-center justify-between text-sm py-1.5 border-t border-border/40"
                        >
                          <div className="min-w-0">
                            <span className="font-medium">
                              ₹{p.amount.toFixed(2)}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {p.paymentMode} · {formatDate(p.date)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => handleRemovePayment(p._id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-3">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Subtotal</span>
                    <span>₹{invoiceDetail.invoice.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>CGST</span>
                    <span>₹{invoiceDetail.invoice.cgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>SGST</span>
                    <span>₹{invoiceDetail.invoice.sgst.toFixed(2)}</span>
                  </div>
                  {invoiceDetail.invoice.discount ? (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Discount</span>
                      <span>-₹{invoiceDetail.invoice.discount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-base font-semibold pt-2 border-t border-border mt-2">
                    <span>Grand Total</span>
                    <span>₹{invoiceDetail.invoice.grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                {invoiceDetail.invoice.notes && (
                  <div className="text-sm text-muted-foreground pt-2 border-t border-border">
                    <p className="text-xs font-medium uppercase tracking-wider mb-1">
                      Notes
                    </p>
                    <p>{invoiceDetail.invoice.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {viewedInvoice && (
                <>
                  {viewedInvoice.invoiceNo} · Balance ₹{balance.toFixed(2)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="mt-1 h-9"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Payment Mode</Label>
                <Select value={payMode} onValueChange={setPayMode}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleSavePayment}
              disabled={!payAmount || Number(payAmount) <= 0}
            >
              <Banknote className="h-3.5 w-3.5 mr-1.5" />
              Save Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Preview */}
      {printData && (
        <PrintContainer onClose={() => setPrintData(null)}>
          <GSTInvoiceTemplate
            invoice={{
              invoiceNo: printData.invoice.invoiceNo,
              date: printData.invoice.date,
              customerName: printData.invoice.customerName ?? undefined,
              customerPhone: printData.invoice.customerPhone ?? undefined,
              customerAddress: printData.invoice.customerAddress ?? undefined,
              paymentMode: printData.invoice.paymentMode ?? undefined,
              subtotal: printData.invoice.subtotal,
              totalGst: printData.invoice.totalGst,
              cgst: printData.invoice.cgst,
              sgst: printData.invoice.sgst,
              igst: printData.invoice.igst,
              discount: printData.invoice.discount ?? undefined,
              grandTotal: printData.invoice.grandTotal,
              notes: printData.invoice.notes ?? undefined,
              items: printData.items.map((item) => ({
                medicineName: item.medicineName,
                hsnCode: item.hsnCode ?? undefined,
                quantity: item.quantity,
                unit: item.unit ?? undefined,
                rate: item.rate,
                amount: item.amount,
                gstRate: item.gstRate,
                gstAmount: item.gstAmount,
                cgst: item.cgst,
                sgst: item.sgst,
              })),
            }}
          />
        </PrintContainer>
      )}
    </motion.div>
  );
}
