import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

export default function ReportsPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const stats = useQuery(api.stats.dashboard);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [tab, setTab] = useState<"gst" | "purchase" | "stock" | "customer">("gst");

  const gstData = useQuery(api.stats.gstRegister, fromDate || toDate ? { fromDate: fromDate || undefined, toDate: toDate || undefined } : "skip");

  if (!isAuthenticated && !isLoading) { navigate("/auth"); return null; }
  if (isLoading || !stats) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-pulse text-muted-foreground text-sm">Loading...</div></div>;

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map((row) => headers.map((h) => `"${row[h]}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: "gst" as const, label: "GST Sales Register" },
    { id: "purchase" as const, label: "Purchase Register" },
    { id: "stock" as const, label: "Stock Report" },
    { id: "customer" as const, label: "Customer Analytics" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Business insights and registers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Date Filter */}
      <div className="flex items-end gap-3">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 text-sm w-40" />
        </div>
      </div>

      {/* GST Register */}
      {tab === "gst" && (
        <Card className="p-5 border-border/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">GST Sales Register</h3>
            {gstData && <Button variant="outline" size="sm" onClick={() => exportToCSV(gstData.entries, "gst-sales-register")}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>}
          </div>
          {fromDate && toDate && gstData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="bg-secondary/50 p-2 rounded-sm"><p className="text-muted-foreground">Taxable</p><p className="font-semibold">₹{gstData.totalTaxable.toFixed(2)}</p></div>
                <div className="bg-secondary/50 p-2 rounded-sm"><p className="text-muted-foreground">CGST</p><p className="font-semibold">₹{gstData.totalCGST.toFixed(2)}</p></div>
                <div className="bg-secondary/50 p-2 rounded-sm"><p className="text-muted-foreground">SGST</p><p className="font-semibold">₹{gstData.totalSGST.toFixed(2)}</p></div>
                <div className="bg-secondary/50 p-2 rounded-sm"><p className="text-muted-foreground">Total GST</p><p className="font-semibold">₹{gstData.totalGST.toFixed(2)}</p></div>
                <div className="bg-secondary/50 p-2 rounded-sm"><p className="text-muted-foreground">Grand Total</p><p className="font-semibold">₹{gstData.totalAmount.toFixed(2)}</p></div>
              </div>
              <div className="max-h-96 overflow-y-auto space-y-1">
                {gstData.entries.map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 border border-border/40 rounded-sm">
                    <span className="w-28 shrink-0 font-medium">{e.invoiceNo}</span>
                    <span className="w-20 shrink-0 text-muted-foreground">{e.date}</span>
                    <span className="flex-1 truncate px-2">{e.customerName}</span>
                    <span className="w-20 text-right">₹{e.taxableValue.toFixed(2)}</span>
                    <span className="w-16 text-right">₹{e.cgst.toFixed(2)}</span>
                    <span className="w-16 text-right">₹{e.sgst.toFixed(2)}</span>
                    <span className="w-20 text-right font-medium">₹{e.grandTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Select a date range to view the GST register.</p>
          )}
        </Card>
      )}

      {/* Stock Report */}
      {tab === "stock" && (
        <Card className="p-5 border-border/60">
          <h3 className="text-sm font-medium mb-4">Inventory Stock Report</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-secondary/50 p-3 rounded-sm">
              <p className="text-xs text-muted-foreground">Total Medicines</p>
              <p className="text-xl font-semibold">{stats.totalMedicines}</p>
              <p className="text-xs text-muted-foreground">{stats.totalStock} units</p>
            </div>
            <div className="bg-secondary/50 p-3 rounded-sm">
              <p className="text-xs text-muted-foreground">Low Stock Items</p>
              <p className={`text-xl font-semibold ${stats.lowStockCount > 0 ? "text-destructive" : ""}`}>{stats.lowStockCount}</p>
              <p className="text-xs text-muted-foreground">Needs reordering</p>
            </div>
            <div className="bg-secondary/50 p-3 rounded-sm">
              <p className="text-xs text-muted-foreground">Expiring Soon</p>
              <p className={`text-xl font-semibold ${stats.expiringSoonCount > 0 ? "text-amber-600" : ""}`}>{stats.expiringSoonCount}</p>
              <p className="text-xs text-muted-foreground">Within 30 days</p>
            </div>
          </div>
          {stats.lowStock.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Low Stock Items</p>
              <div className="space-y-1">
                {stats.lowStock.map((m) => (
                  <div key={m._id} className="flex items-center justify-between text-xs py-1.5 px-2 border border-border/40 rounded-sm">
                    <span>{m.name} {m.brand && `(${m.brand})`}</span>
                    <span className="text-destructive font-medium">{m.quantity} {m.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.expiringSoon.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Expiring Soon</p>
              <div className="space-y-1">
                {stats.expiringSoon.map((m) => (
                  <div key={m._id} className="flex items-center justify-between text-xs py-1.5 px-2 border border-border/40 rounded-sm">
                    <span>{m.name} {m.brand && `(${m.brand})`}</span>
                    <span className="text-amber-600 font-medium">Exp: {m.expiryDate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Customer Analytics */}
      {tab === "customer" && (
        <Card className="p-5 border-border/60">
          <h3 className="text-sm font-medium mb-4">Customer Analytics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-secondary/50 p-3 rounded-sm">
              <p className="text-xs text-muted-foreground">Total Customers</p>
              <p className="text-xl font-semibold">{stats.totalCustomers}</p>
            </div>
            <div className="bg-secondary/50 p-3 rounded-sm">
              <p className="text-xs text-muted-foreground">Total Pending Payments</p>
              <p className="text-xl font-semibold">₹{stats.totalPending.toFixed(2)}</p>
            </div>
          </div>
        </Card>
      )}
    </motion.div>
  );
}
