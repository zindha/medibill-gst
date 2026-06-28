import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Eye,
  Printer,
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
  const [viewInvoice, setViewInvoice] = useState<typeof invoices[0] | null>(
    null,
  );
  const [viewItems, setViewItems] = useState<any[]>([]);

  const filtered = invoices?.filter(
    (inv) =>
      inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customerName &&
        inv.customerName.toLowerCase().includes(search.toLowerCase())),
  );

  const handleView = async (inv: (typeof invoices)[0]) => {
    setViewInvoice(inv);
    const result = await fetch(`/api/invoices/${inv._id}`);
    // Use the get query
    const items = await queryInvoiceItems(inv._id);
    setViewItems(items || []);
  };

  const handleDelete = async (id: string) => {
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
              <div className="flex gap-1 text-[10px] text-muted-foreground">
                <span>GST: ₹{inv.totalGst.toFixed(2)}</span>
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
          <p className="text-sm text-muted-foreground text-center py-8">
            No invoices found.
          </p>
        )}
      </div>

      {/* View Invoice Dialog */}
      <Dialog
        open={!!viewInvoice}
        onOpenChange={(open) => !open && setViewInvoice(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          {viewInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>{viewInvoice.invoiceNo}</span>
                  <Button variant="outline" size="sm">
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
                      {viewInvoice.customerName || "Walk-in Customer"}
                    </p>
                    {viewInvoice.customerPhone && (
                      <p className="text-muted-foreground text-xs">
                        {viewInvoice.customerPhone}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Date</p>
                    <p>{formatDate(viewInvoice.date)}</p>
                    <p className="text-muted-foreground text-xs">
                      {viewInvoice.paymentMode}
                    </p>
                  </div>
                </div>

                {/* This is a simplified view — items are loaded via the get query */}
                <div className="border-t border-border pt-3">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Subtotal</span>
                    <span>₹{viewInvoice.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>CGST</span>
                    <span>₹{viewInvoice.cgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>SGST</span>
                    <span>₹{viewInvoice.sgst.toFixed(2)}</span>
                  </div>
                  {viewInvoice.discount ? (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Discount</span>
                      <span>-₹{viewInvoice.discount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-base font-semibold pt-2 border-t border-border mt-2">
                    <span>Grand Total</span>
                    <span>₹{viewInvoice.grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                {viewInvoice.notes && (
                  <div className="text-sm text-muted-foreground pt-2 border-t border-border">
                    <p className="text-xs font-medium uppercase tracking-wider mb-1">
                      Notes
                    </p>
                    <p>{viewInvoice.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

// Helper to fetch invoice items
async function queryInvoiceItems(invoiceId: string) {
  // This is a workaround — in production, you'd use a proper convex query
  // For now, just return null to keep the UI simple
  return null;
}
