import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { orderbookApi, type ShortbookItem } from "@/lib/orderbookApi";

const SHORT_LABELS: Record<string, string> = {
  open: "Open",
  carried: "Carried forward",
  supplied: "Supplied",
  cancelled: "Cancelled",
};

export default function OrderbookShortbookPage() {
  const [items, setItems] = useState<ShortbookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      setItems(await orderbookApi.listShortbook());
    } catch {
      // empty on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await orderbookApi.listShortbook();
        if (!cancelled) setItems(rows);
      } catch {
        // empty on failure
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function resolve(item: ShortbookItem, action: "carried" | "supplied" | "cancelled") {
    setBusyId(item.id);
    try {
      await orderbookApi.resolveShortbook(item.id, action, qty[item.id] ?? item.demandedQuantity);
      toast.success(`Marked ${SHORT_LABELS[action].toLowerCase()}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Shortbook</h1>
        <p className="text-sm text-muted-foreground">
          Items distributors demanded but did not fully supply — chase, carry forward or close them
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing short — every demanded quantity was supplied.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Medicine</th>
                    <th className="px-4 py-2 font-medium">Pack</th>
                    <th className="px-4 py-2 text-right font-medium">Demanded</th>
                    <th className="px-4 py-2 text-right font-medium">Supplied</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-4 py-2 font-medium">{it.name}</td>
                      <td className="px-4 py-2">{it.pack ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{it.demandedQuantity}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{it.suppliedQuantity}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant="outline"
                          className={
                            it.status === "open"
                              ? "bg-amber-100 text-amber-800"
                              : it.status === "supplied"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-600"
                          }
                        >
                          {SHORT_LABELS[it.status] ?? it.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        {it.status === "open" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Input
                              type="number"
                              min="0"
                              max={it.demandedQuantity}
                              value={qty[it.id] ?? ""}
                              onChange={(e) =>
                                setQty({ ...qty, [it.id]: Number(e.target.value) || 0 })
                              }
                              placeholder={String(it.demandedQuantity)}
                              className="h-8 w-20 text-right"
                              aria-label={`Supplied quantity for ${it.name}`}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resolve(it, "supplied")}
                              disabled={busyId === it.id}
                            >
                              Supplied
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resolve(it, "carried")}
                              disabled={busyId === it.id}
                            >
                              Carry
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => resolve(it, "cancelled")}
                              disabled={busyId === it.id}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : null}
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
