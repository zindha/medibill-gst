import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { orderbookApi, type CartView } from "@/lib/orderbookApi";

function formatMoney(n: number) {
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OrderbookCartPage() {
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      setCart(await orderbookApi.getCart());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load cart");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const view = await orderbookApi.getCart();
        if (!cancelled) setCart(view);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load cart");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateQty(id: string) {
    const value = qty[id];
    if (value === undefined) return;
    setBusy(true);
    try {
      await orderbookApi.updateCartItem(id, Math.max(1, value));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await orderbookApi.deleteCartItem(id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    setBusy(true);
    try {
      const res = await orderbookApi.checkout();
      toast.success(
        `${res.orders.length} order(s) placed: ${res.orders.map((o) => o.number).join(", ")}`
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Order cart</h1>
          <p className="text-sm text-muted-foreground">
            Lines are grouped by distributor — checkout creates one purchase order per distributor
          </p>
        </div>
        <Button onClick={checkout} disabled={busy || !cart || cart.groups.length === 0}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Place order{cart && cart.groups.length > 1 ? `s (${cart.groups.length})` : ""}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !cart || cart.groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Your cart is empty.</p>
            <Button asChild className="mt-3" variant="outline">
              <Link to="/dashboard/orderbook/products">Browse products</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {cart.groups.map((group) => (
            <Card key={group.distributor.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{group.distributor.name}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {group.lineCount} line{group.lineCount > 1 ? "s" : ""} ·{" "}
                    {formatMoney(group.subtotal)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.pack ?? "—"} · {formatMoney(item.rate)} each
                        </p>
                      </div>
                      <Input
                        type="number"
                        min="1"
                        value={qty[item.id] ?? item.quantity}
                        onChange={(e) =>
                          setQty({ ...qty, [item.id]: Math.max(1, Number(e.target.value) || 1) })
                        }
                        onBlur={() => updateQty(item.id)}
                        className="h-8 w-20 text-right"
                        aria-label={`Quantity for ${item.name}`}
                      />
                      <span className="w-24 text-right text-sm tabular-nums">
                        {formatMoney(item.quantity * item.rate)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => remove(item.id)}
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Cart total</span>
            <span className="text-lg font-semibold tabular-nums">{formatMoney(cart.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
