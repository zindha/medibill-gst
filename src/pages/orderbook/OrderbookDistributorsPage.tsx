import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { orderbookApi, type OrderbookDistributor } from "@/lib/orderbookApi";

export default function OrderbookDistributorsPage() {
  const [items, setItems] = useState<OrderbookDistributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    city: "",
    pincode: "",
    creditLimit: "",
  });

  const load = useCallback(async (search: string) => {
    try {
      setItems(await orderbookApi.listDistributors(search || undefined));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load distributors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await orderbookApi.listDistributors(q || undefined);
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load distributors");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  async function save() {
    if (!form.name.trim()) {
      toast.error("Distributor name is required");
      return;
    }
    setSaving(true);
    try {
      await orderbookApi.createDistributor({
        name: form.name.trim(),
        phone: form.phone || undefined,
        city: form.city || undefined,
        pincode: form.pincode || undefined,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
      });
      toast.success("Distributor added");
      setOpen(false);
      setForm({ name: "", phone: "", city: "", pincode: "", creditLimit: "" });
      load(q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add distributor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Distributors</h1>
          <p className="text-sm text-muted-foreground">Suppliers you order stock from</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add distributor
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search distributors…"
          className="pl-8"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No distributors yet — add your first one to start ordering.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Phone</th>
                    <th className="px-4 py-2 font-medium">City</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <Link
                          to={`/dashboard/orderbook/distributors/${d.id}`}
                          className="font-medium hover:underline"
                        >
                          {d.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{d.phone ?? "—"}</td>
                      <td className="px-4 py-2">{d.city ?? "—"}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant="outline"
                          className={
                            d.connectionStatus === "connected"
                              ? "bg-green-100 text-green-800"
                              : d.connectionStatus === "pending"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-gray-100 text-gray-600"
                          }
                        >
                          {d.connectionStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {d.outstanding ? `₹${d.outstanding.toLocaleString("en-IN")}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add distributor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="dist-name">Name *</Label>
              <Input
                id="dist-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="dist-phone">Phone</Label>
                <Input
                  id="dist-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dist-city">City</Label>
                <Input
                  id="dist-city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="dist-pin">Pincode</Label>
                <Input
                  id="dist-pin"
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dist-credit">Credit limit (₹)</Label>
                <Input
                  id="dist-credit"
                  type="number"
                  min="0"
                  value={form.creditLimit}
                  onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
