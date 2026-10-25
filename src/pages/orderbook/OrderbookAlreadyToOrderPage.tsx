import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { orderbookApi, type AlreadyToOrder } from "@/lib/orderbookApi";

export default function OrderbookAlreadyToOrderPage() {
  const [data, setData] = useState<AlreadyToOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    orderbookApi
      .alreadyToOrder()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Already to order</h1>
        <p className="text-sm text-muted-foreground">
          Items pending on open purchase orders and unresolved shortfalls
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">On open purchase orders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!data || data.pending.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                  Nothing on open orders.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Medicine</th>
                      <th className="px-4 py-2 font-medium">Distributor</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 text-right font-medium">Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.pending.map((p, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 font-medium">{p.name}</td>
                        <td className="px-4 py-2">{p.distributorName}</td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="capitalize">
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {p.receivedQuantity}/{p.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Open shortfalls</CardTitle>
            </CardHeader>
            <CardContent>
              {!data || data.shorts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No shortfalls.</p>
              ) : (
                <div className="divide-y">
                  {data.shorts.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <span className="font-medium">{s.name}</span>
                        {s.pack ? (
                          <span className="ml-2 text-muted-foreground">{s.pack}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums text-muted-foreground">
                          {s.demandedQuantity} short
                        </span>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/dashboard/orderbook/shortbook">Resolve</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
