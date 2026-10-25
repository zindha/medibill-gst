import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Check, Loader2, PackageCheck, Send, X } from "lucide-react";
import { toast } from "sonner";
import { orderbookApi, type PoDetail } from "@/lib/orderbookApi";
import { PoStatusBadge } from "./OrderbookDashboardPage";

function formatMoney(n: number) {
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OrderbookPoDetailPage() {
  const { poId } = useParams<{ poId: string }>();
  const [data, setData] = useState<PoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!poId) return;
    try {
      const res = await orderbookApi.getPo(poId);
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load purchase order");
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!poId) { setLoading(false); return; }
      try {
        const res = await orderbookApi.getPo(poId);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load purchase order");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poId]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Purchase order not found.</p>;
  }

  const { po, items, distributor } = data;
  const canReceive = ["sent", "confirmed", "partial"].includes(po.status);
  const allFilled =
    items.length > 0 &&
    items.every((it) => (receipts[it.id] ?? 0) > 0 || it.receivedQuantity >= it.quantity);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/dashboard/orderbook/purchase-orders">
              <ArrowLeft className="mr-1 h-4 w-4" /> Purchase orders
            </Link>
          </Button>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {po.number} <PoStatusBadge status={po.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {distributor?.name ?? "Distributor"} · Ordered {po.orderDate}
            {po.expectedDate ? ` · Expected ${po.expectedDate}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {po.status === "draft" && (
            <Button onClick={() => act(() => orderbookApi.sendPo(po.id), "Order sent")} disabled={busy}>
              <Send className="mr-2 h-4 w-4" /> Send
            </Button>
          )}
          {po.status === "sent" && (
            <Button onClick={() => act(() => orderbookApi.confirmPo(po.id), "Order confirmed")} disabled={busy}>
              <Check className="mr-2 h-4 w-4" /> Confirm
            </Button>
          )}
          {["draft", "sent", "confirmed", "partial"].includes(po.status) && (
            <Button
              variant="destructive"
              onClick={() => act(() => orderbookApi.cancelPo(po.id), "Order cancelled")}
              disabled={busy}
            >
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Line items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Medicine</th>
                  <th className="px-4 py-2 font-medium">Pack</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Free</th>
                  <th className="px-4 py-2 text-right font-medium">Rate</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 text-right font-medium">Received</th>
                  {canReceive && <th className="px-4 py-2 text-right font-medium">Receiving now</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-4 py-2 font-medium">{it.name}</td>
                    <td className="px-4 py-2">{it.pack ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.quantity}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.freeQuantity || "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(it.rate)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatMoney(it.quantity * it.rate)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {it.receivedQuantity}/{it.quantity}
                    </td>
                    {canReceive && (
                      <td className="px-4 py-2 text-right">
                        <Input
                          type="number"
                          min="0"
                          max={Math.max(0, it.quantity - it.receivedQuantity)}
                          value={receipts[it.id] ?? ""}
                          onChange={(e) =>
                            setReceipts({ ...receipts, [it.id]: Number(e.target.value) || 0 })
                          }
                          className="h-8 w-24 text-right"
                          aria-label={`Receive quantity for ${it.name}`}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={5} className="px-4 py-2 text-right font-medium">
                    Total
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(po.total)}
                  </td>
                  <td colSpan={canReceive ? 2 : 1} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {canReceive && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Quantities short of the demand are logged to the shortbook automatically.
          </p>
          <Button
            onClick={() =>
              act(async () => {
                const payload = items
                  .map((it) => ({ itemId: it.id, receivedQuantity: receipts[it.id] ?? 0 }))
                  .filter((r) => r.receivedQuantity > 0);
                if (!payload.length) throw new Error("Enter at least one received quantity");
                const res = await orderbookApi.receivePo(po.id, payload);
                setReceipts({});
                if (res.shortbooked > 0) {
                  toast.info(`${res.shortbooked} item(s) moved to the shortbook`);
                }
              }, "Receipt recorded")
            }
            disabled={busy || !allFilled}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
            Record receipt
          </Button>
        </div>
      )}
    </div>
  );
}
