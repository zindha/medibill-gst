import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {
  orderbookApi,
  type OrderbookDistributor,
  type ProductHit,
} from "@/lib/orderbookApi";

export default function OrderbookProductListPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselected = params.get("distributorId") ?? "";

  const [distributors, setDistributors] = useState<OrderbookDistributor[]>([]);
  const [distributorId, setDistributorId] = useState(preselected);
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<ProductHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => {
    orderbookApi
      .listDistributors()
      .then((d) => {
        setDistributors(d);
        if (!preselected && d[0]) setDistributorId(d[0].id);
      })
      .catch(() => toast.error("Failed to load distributors"));
  }, [preselected]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await orderbookApi.searchProducts(q, undefined, 50);
        if (!cancelled) setProducts(rows);
      } catch {
        // empty state on failure
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  async function addToCart(p: ProductHit) {
    if (!distributorId) {
      toast.error("Select a distributor first");
      return;
    }
    const quantity = qty[p.id] ?? 1;
    setAdding(p.id);
    try {
      await orderbookApi.addCartItem({
        distributorId,
        medicineId: p.id,
        name: p.name,
        pack: p.packSize ?? undefined,
        quantity,
        rate: p.purchasePrice || 0,
      });
      toast.success(`${p.name} added to cart`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add to cart");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Product list</h1>
          <p className="text-sm text-muted-foreground">Search your medicine master and add to the order cart</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/dashboard/orderbook/cart")}>
          <ShoppingCart className="mr-2 h-4 w-4" /> Cart
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={distributorId}
          onChange={(e) => setDistributorId(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Distributor"
        >
          <option value="">Select distributor…</option>
          {distributors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search medicines…"
            className="pl-8"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : products.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No medicines match “{q}”.
            </p>
          ) : (
            <div className="divide-y">
              {products.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.packSize ?? "—"} · Purchase ₹{(p.purchasePrice ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    value={qty[p.id] ?? 1}
                    onChange={(e) =>
                      setQty({ ...qty, [p.id]: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="h-8 w-20"
                    aria-label={`Quantity for ${p.name}`}
                  />
                  <Button
                    size="sm"
                    onClick={() => addToCart(p)}
                    disabled={adding === p.id || !distributorId}
                  >
                    {adding === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span className="ml-1">Add</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
