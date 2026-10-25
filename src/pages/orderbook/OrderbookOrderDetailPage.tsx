import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { orderbookApi, type OrderDetail } from "@/lib/orderbookApi";

function formatMoney(n: number) {
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OrderbookOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [data, setData] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    orderbookApi
      .getOrder(orderId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load order");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Order not found.</p>;
  }

  const { order, distributor, snapshot } = data;
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/dashboard/orderbook/purchase-orders">
            <ArrowLeft className="mr-1 h-4 w-4" /> Purchase orders
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Order {snapshot.number}</h1>
        <p className="text-sm text-muted-foreground">
          {distributor.name} · Placed {new Date(order.createdAt).toLocaleString("en-IN")} ·{" "}
          <span className="capitalize">{order.status}</span>
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Items at placement time</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Medicine</th>
                  <th className="px-4 py-2 font-medium">Pack</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Rate</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {snapshot.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-4 py-2 font-medium">{it.name}</td>
                    <td className="px-4 py-2">{it.pack ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.quantity}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(it.rate)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatMoney(it.quantity * it.rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={4} className="px-4 py-2 text-right font-medium">
                    Subtotal
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(snapshot.subtotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {order.poId && (
        <Button asChild variant="outline">
          <Link to={`/dashboard/orderbook/pos/${order.poId}`}>View the linked purchase order</Link>
        </Button>
      )}
    </div>
  );
}
