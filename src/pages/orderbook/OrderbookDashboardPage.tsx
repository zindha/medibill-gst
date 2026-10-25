import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  Plus,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { orderbookApi, type Analysis, type AlreadyToOrder, type PoListRow } from "@/lib/orderbookApi";

function formatMoney(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const PO_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  confirmed: "Confirmed",
  partial: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

export function PoStatusBadge({ status }: { status: string }) {
  const tone =
    status === "received"
      ? "bg-green-100 text-green-800"
      : status === "cancelled"
        ? "bg-red-100 text-red-800"
        : status === "draft"
          ? "bg-gray-100 text-gray-700"
          : "bg-blue-100 text-blue-800";
  return (
    <Badge variant="outline" className={tone}>
      {PO_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export default function OrderbookDashboardPage() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [pending, setPending] = useState<AlreadyToOrder | null>(null);
  const [recent, setRecent] = useState<PoListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, ato, pos] = await Promise.all([
          orderbookApi.analysis(),
          orderbookApi.alreadyToOrder(),
          orderbookApi.listPos({}),
        ]);
        if (cancelled) return;
        setAnalysis(a);
        setPending(ato);
        setRecent(pos.slice(0, 6));
      } catch {
        // Dashboard stays empty on failure; individual screens surface errors.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingPos = analysis?.statusCounts
    .filter((s) => ["draft", "sent", "confirmed", "partial"].includes(s.status))
    .reduce((sum, s) => sum + s.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orderbook</h1>
          <p className="text-sm text-muted-foreground">Distributor ordering at a glance</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/dashboard/orderbook/products">
              <Plus className="mr-2 h-4 w-4" /> Order products
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard/orderbook/cart">
              <ShoppingBag className="mr-2 h-4 w-4" /> View cart
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Pending POs", value: String(pendingPos), icon: ClipboardList },
          { label: "Open shortbook", value: String(analysis?.openShortbook ?? 0), icon: AlertTriangle },
          {
            label: "Spend (6 months)",
            value: formatMoney(analysis?.spendByMonth.reduce((s, m) => s + m.total, 0) ?? 0),
            icon: Wallet,
          },
          {
            label: "Fill rate",
            value: `${Math.round((analysis?.fillRate ?? 0) * 100)}%`,
            icon: TrendingUp,
          },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <kpi.icon className="h-4 w-4" /> {kpi.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-2xl font-semibold tabular-nums">{kpi.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent purchase orders</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No purchase orders yet — start from the product list.
              </p>
            ) : (
              <div className="divide-y">
                {recent.map((row) => (
                  <Link
                    key={row.po.id}
                    to={`/dashboard/orderbook/pos/${row.po.id}`}
                    className="flex items-center justify-between py-2 text-sm hover:bg-muted/40"
                  >
                    <div>
                      <span className="font-medium">{row.po.number}</span>
                      <span className="ml-2 text-muted-foreground">{row.distributorName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">{formatMoney(row.po.total)}</span>
                      <PoStatusBadge status={row.po.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Awaiting supply</CardTitle>
          </CardHeader>
          <CardContent>
            {!pending || (pending.pending.length === 0 && pending.shorts.length === 0) ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing pending — every demanded item is supplied.
              </p>
            ) : (
              <div className="divide-y">
                {pending.pending.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-muted-foreground">{p.distributorName}</span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                      {p.receivedQuantity}/{p.quantity} received
                    </span>
                  </div>
                ))}
                {pending.shorts.slice(0, 3).map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium">{s.name}</span>
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                        short
                      </span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                      {s.demandedQuantity} not supplied
                    </span>
                  </div>
                ))}
                <div className="pt-2 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/dashboard/orderbook/shortbook">Open shortbook</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
