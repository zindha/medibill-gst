import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus } from "lucide-react";
import { orderbookApi, type PoListRow } from "@/lib/orderbookApi";
import { PoStatusBadge } from "./OrderbookDashboardPage";

function formatMoney(n: number) {
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "confirmed", label: "Confirmed" },
  { value: "partial", label: "Partial" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

export default function OrderbookPurchaseOrdersPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PoListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await orderbookApi.listPos(status === "all" ? {} : { status });
        if (!cancelled) setRows(rows);
      } catch {
        // empty state on failure
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Purchase orders</h1>
          <p className="text-sm text-muted-foreground">Orders raised to distributors from the orderbook</p>
        </div>
        <Button onClick={() => navigate("/dashboard/orderbook/products")}>
          <Plus className="mr-2 h-4 w-4" /> New order
        </Button>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="flex-wrap">
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No purchase orders in this view.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">PO number</th>
                    <th className="px-4 py-2 font-medium">Distributor</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 text-right font-medium">Items</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.po.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <Link
                          to={`/dashboard/orderbook/pos/${row.po.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.po.number}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{row.distributorName}</td>
                      <td className="px-4 py-2">{row.po.orderDate}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.itemCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatMoney(row.po.total)}
                      </td>
                      <td className="px-4 py-2">
                        <PoStatusBadge status={row.po.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
