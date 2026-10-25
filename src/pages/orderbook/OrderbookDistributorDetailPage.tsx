import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { orderbookApi, type DistributorDetail } from "@/lib/orderbookApi";
import { PoStatusBadge } from "./OrderbookDashboardPage";

function formatMoney(n: number) {
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OrderbookDistributorDetailPage() {
  const { distributorId } = useParams<{ distributorId: string }>();
  const [data, setData] = useState<DistributorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!distributorId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await orderbookApi.getDistributor(distributorId);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load distributor");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [distributorId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost">
          <Link to="/dashboard/orderbook/distributors">
            <ArrowLeft className="mr-2 h-4 w-4" /> Distributors
          </Link>
        </Button>
        <p className="py-8 text-center text-sm text-muted-foreground">Distributor not found.</p>
      </div>
    );
  }

  const d = data.distributor;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/dashboard/orderbook/distributors">
              <ArrowLeft className="mr-1 h-4 w-4" /> Distributors
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">{d.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[d.phone, d.city, d.pincode].filter(Boolean).join(" · ") || "No contact details"}
          </p>
        </div>
        <Button asChild>
          <Link to={`/dashboard/orderbook/products?distributorId=${d.id}`}>Order from this distributor</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Connection</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold capitalize">{d.connectionStatus}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Credit limit</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold tabular-nums">
            {formatMoney(d.creditLimit ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold tabular-nums">
            {formatMoney(d.outstanding ?? 0)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open purchase orders</CardTitle>
          </CardHeader>
          <CardContent>
            {data.openPos.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No open orders.</p>
            ) : (
              <div className="divide-y">
                {data.openPos.map((po) => (
                  <Link
                    key={po.id}
                    to={`/dashboard/orderbook/pos/${po.id}`}
                    className="flex items-center justify-between py-2 text-sm hover:bg-muted/40"
                  >
                    <span className="font-medium">{po.number}</span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{formatMoney(po.total)}</span>
                      <PoStatusBadge status={po.status} />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent placed orders</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentOrders.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No orders placed yet.</p>
            ) : (
              <div className="divide-y">
                {data.recentOrders.map((o) => (
                  <Link
                    key={o.id}
                    to={`/dashboard/orderbook/orders/${o.id}`}
                    className="flex items-center justify-between py-2 text-sm hover:bg-muted/40"
                  >
                    <span>{new Date(o.createdAt).toLocaleDateString("en-IN")}</span>
                    <span className="tabular-nums">{formatMoney(o.total)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
