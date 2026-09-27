import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  ApiError,
  publicApi,
  type PublicCatalogMedicine,
  type PublicOrderStatusView,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Minus,
  Package,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

interface CartLine {
  medicine: PublicCatalogMedicine;
  quantity: number;
}

const STATUS_STEPS = ["pending", "accepted", "packed", "ready", "delivered"] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "Received",
  accepted: "Accepted",
  packed: "Packed",
  ready: "Ready for delivery",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const money = (n: number) => `₹${Number(n ?? 0).toFixed(2)}`;

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Public customer ordering portal (Task 14) — route `/order?storeId=<ownerId>`.
 * No authentication: `storeId` is the install owner's user id (single-store
 * convention, copied from Settings → Online Ordering). Invalid/missing storeId
 * renders an "invalid link" screen instead of the form.
 */
export default function OrderPortalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const storeId = (searchParams.get("storeId") ?? "").trim();

  const [storeName, setStoreName] = useState("Pharmacy");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const [results, setResults] = useState<PublicCatalogMedicine[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [rxFile, setRxFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [disabledByStore, setDisabledByStore] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Success + tracking
  const [orderId, setOrderId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<PublicOrderStatusView | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const invalidLink = !storeId;

  // Store header (tiny — falls back to "Pharmacy").
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await publicApi.store(storeId);
        if (!cancelled) setStoreName(res.name || "Pharmacy");
      } catch {
        /* keep the fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // Debounced catalog search (q ≥ 2 enforced server-side). The effect body
  // itself never sets state synchronously — stale results are hidden through
  // the derived `visible*` values below until the next fetch lands.
  useEffect(() => {
    if (!storeId || debouncedSearch.length < 2) return;
    let active = true;
    (async () => {
      await Promise.resolve(); // yield: keep setState out of the effect body
      if (!active) return;
      setSearching(true);
      setSearchError(null);
      try {
        const rows = await publicApi.searchMedicines(storeId, debouncedSearch, 20);
        if (active) setResults(rows);
      } catch (err) {
        if (active) {
          setResults([]);
          setSearchError(err instanceof Error ? err.message : "Search failed");
        }
      } finally {
        if (active) setSearching(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [storeId, debouncedSearch]);

  const searchReady = !!storeId && debouncedSearch.length >= 2;
  const visibleResults = searchReady ? results : [];
  const showSearching = searchReady && searching;
  const visibleSearchError = searchReady ? searchError : null;

  const cartCount = useMemo(() => cart.reduce((sum, l) => sum + l.quantity, 0), [cart]);
  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.quantity * l.medicine.sellingPrice, 0),
    [cart],
  );

  const addLine = (med: PublicCatalogMedicine) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.medicine.medicineId === med.medicineId);
      if (existing) {
        return prev.map((l) =>
          l.medicine.medicineId === med.medicineId ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { medicine: med, quantity: 1 }];
    });
  };

  const changeQty = (medicineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.medicine.medicineId === medicineId ? { ...l, quantity: l.quantity + delta } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  const submit = async () => {
    setFormError(null);
    if (cart.length === 0) {
      setFormError("Add at least one medicine to your order.");
      return;
    }
    if (!name.trim() || phone.trim().length < 7) {
      setFormError("Your name and a valid phone number are required.");
      return;
    }
    setSubmitting(true);
    try {
      let prescriptionFileId: string | undefined;
      if (rxFile) {
        const dataUrl = await readFileBase64(rxFile);
        const stored = await publicApi.uploadFile({
          storeId,
          filename: rxFile.name || "prescription.jpg",
          contentType: rxFile.type || "image/jpeg",
          data: dataUrl,
        });
        prescriptionFileId = stored.id;
      }
      const order = await publicApi.createOrder({
        storeId,
        customerName: name.trim(),
        phone: phone.trim(),
        deliveryAddress: address.trim() || undefined,
        notes: notes.trim() || undefined,
        prescriptionFileId,
        items: cart.map((l) => ({ medicineId: l.medicine.medicineId, quantity: l.quantity })),
      });
      setOrderId(order.id);
      setCart([]);
      setRxFile(null);
      setDisabledByStore(false);
      toast.success("Order placed");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setDisabledByStore(true);
        setFormError("Online ordering is currently disabled by the pharmacy.");
      } else if (err instanceof ApiError && err.status === 409 && err.message === "Insufficient stock") {
        const items = err.details?.items;
        const detail = Array.isArray(items)
          ? items
              .map(
                (i: { medicineName: string; available: number }) =>
                  `${i.medicineName} (available ${i.available})`,
              )
              .join(", ")
          : "";
        setFormError(`Some items are out of stock: ${detail}`);
      } else {
        setFormError(err instanceof Error ? err.message : "Could not place the order");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const track = async (id: string) => {
    setTrackingLoading(true);
    try {
      const view = await publicApi.status(storeId, id);
      setTracking(view);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the order status");
    } finally {
      setTrackingLoading(false);
    }
  };

  const reset = () => {
    setOrderId(null);
    setTracking(null);
    setSearch("");
    setName("");
    setPhone("");
    setAddress("");
    setNotes("");
    setSearchParams({ storeId }, { replace: true });
  };

  // ─── Invalid link ────────────────────────────────────────────────────────
  if (invalidLink) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border/60 p-6 text-center">
          <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">Invalid order link</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This link is missing the pharmacy code. Ask the store for their order link — it looks
            like <span className="font-mono text-xs">/order?storeId=…</span>
          </p>
        </Card>
      </div>
    );
  }

  // ─── Success / tracking view ─────────────────────────────────────────────
  if (orderId && !tracking) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Card className="border-border/60 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
          <h1 className="mt-3 text-lg font-semibold">Order received!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your order <span className="font-mono font-medium text-foreground">#{orderId.slice(0, 8)}</span>{" "}
            has been sent to {storeName}.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={() => void track(orderId)} disabled={trackingLoading}>
              {trackingLoading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Package className="mr-1.5 h-4 w-4" />
              )}
              Track status
            </Button>
            <Button variant="outline" onClick={reset}>
              Place another order
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (orderId && tracking) {
    const stepIndex = STATUS_STEPS.indexOf(
      tracking.status as (typeof STATUS_STEPS)[number],
    );
    const terminalBad = tracking.status === "rejected" || tracking.status === "cancelled";
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Card className="border-border/60 p-6">
          <div className="text-center">
            <h1 className="text-lg font-semibold">Order #{tracking.id.slice(0, 8)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {storeName} · last updated{" "}
              {new Date(tracking.updatedAt).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          {terminalBad ? (
            <p className="mt-4 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive">
              {tracking.status === "rejected" ? "Rejected" : "Cancelled"} by the pharmacy.
            </p>
          ) : (
            <ol className="mt-5 space-y-3">
              {STATUS_STEPS.map((step, i) => {
                const done = stepIndex >= i;
                const current = stepIndex === i;
                return (
                  <li key={step} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        done
                          ? "border-green-600 bg-green-600 text-white"
                          : "border-border text-muted-foreground",
                        current && "ring-2 ring-green-600/40",
                      )}
                      aria-hidden="true"
                    >
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={cn("text-sm", done ? "font-medium" : "text-muted-foreground")}>
                      {STATUS_LABEL[step]}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-4 rounded-sm border border-border/60 p-3">
            <p className="mb-1.5 text-xs text-muted-foreground">Items</p>
            <ul className="space-y-1 text-sm">
              {tracking.items.map((i, idx) => (
                <li key={`${i.medicineName}-${idx}`} className="flex justify-between gap-2">
                  <span>{i.medicineName}</span>
                  <span className="text-muted-foreground">× {i.quantity}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Button variant="outline" onClick={() => void track(tracking.id)} disabled={trackingLoading}>
              {trackingLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Refresh status
            </Button>
            <Button variant="ghost" onClick={reset}>
              Place another order
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Order form ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShoppingBag className="h-3.5 w-3.5" /> Online ordering
        </p>
        <h1 className="text-xl font-semibold tracking-tight">{storeName}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Search medicines, add what you need and share a prescription if asked — we'll prepare your
          order.
        </p>
      </header>

      {disabledByStore && (
        <div className="mb-4 rounded-sm border border-amber-600/40 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          Online ordering is currently disabled. Please call the pharmacy to place your order.
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search medicine name or brand (min 2 letters)"
          className="pl-9"
          aria-label="Search medicines"
        />
      </div>

      {visibleSearchError && (
        <p className="mb-3 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          {visibleSearchError}
        </p>
      )}

      {showSearching && (
        <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </p>
      )}

      {!showSearching && searchReady && visibleResults.length === 0 && !visibleSearchError && (
        <p className="mb-3 rounded-sm border border-border/60 bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
          No medicines match “{debouncedSearch}”.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visibleResults.map((med) => {
          const line = cart.find((l) => l.medicine.medicineId === med.medicineId);
          return (
            <Card key={med.medicineId} className="border-border/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={med.name}>
                    {med.name}
                  </p>
                  {med.brand && (
                    <p className="truncate text-xs text-muted-foreground">{med.brand}</p>
                  )}
                  {med.packSize && (
                    <p className="text-[11px] text-muted-foreground">Pack: {med.packSize}</p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-[10px]",
                    med.inStock ? "border-green-600/40 text-green-700" : "border-red-600/40 text-red-700",
                  )}
                >
                  {med.inStock ? "In stock" : "Out of stock"}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{money(med.sellingPrice)}</span>
                {line ? (
                  <span className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => changeQty(med.medicineId, -1)}
                      aria-label={`Remove one ${med.name}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{line.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => changeQty(med.medicineId, 1)}
                      aria-label={`Add one ${med.name}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!med.inStock}
                    onClick={() => addLine(med)}
                    title={med.inStock ? undefined : "Out of stock"}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <Card className="mt-4 border-border/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <ShoppingBag className="h-4 w-4" /> Your order ({cartCount})
          </p>
          <ul className="space-y-2">
            {cart.map((l) => (
              <li key={l.medicine.medicineId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {l.medicine.name}{" "}
                  <span className="text-xs text-muted-foreground">· {money(l.medicine.sellingPrice)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-6 w-6"
                    onClick={() => changeQty(l.medicine.medicineId, -1)}
                    aria-label={`Remove one ${l.medicine.name}`}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-5 text-center text-xs font-medium">{l.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-6 w-6"
                    onClick={() => changeQty(l.medicine.medicineId, 1)}
                    aria-label={`Add one ${l.medicine.name}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t border-border/60 pt-2 text-sm font-semibold">
            <span>Subtotal (indicative)</span>
            <span>{money(subtotal)}</span>
          </p>
        </Card>
      )}

      {/* Customer details */}
      <Card className="mt-4 space-y-3 border-border/60 p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <ClipboardList className="h-4 w-4" /> Your details
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="portal-name" className="text-xs">Name *</Label>
          <Input id="portal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="portal-phone" className="text-xs">Phone *</Label>
          <Input
            id="portal-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            inputMode="tel"
            maxLength={20}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="portal-address" className="text-xs">Delivery address</Label>
          <Textarea
            id="portal-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="House / street / landmark"
            rows={2}
            maxLength={300}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="portal-notes" className="text-xs">Notes</Label>
          <Textarea
            id="portal-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the pharmacy should know"
            rows={2}
            maxLength={500}
          />
        </div>

        {/* Prescription (optional) */}
        <div className="space-y-1.5">
          <Label className="text-xs">Prescription (optional)</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && f.size > 10 * 1024 * 1024) {
                toast.error("Image must be under 10MB");
                e.target.value = "";
                return;
              }
              setRxFile(f);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              {rxFile ? <FileText className="mr-1.5 h-3.5 w-3.5" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              {rxFile ? "Change file" : "Upload prescription"}
            </Button>
            {rxFile && (
              <>
                <span className="truncate text-xs text-muted-foreground">{rxFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setRxFile(null)}
                  aria-label="Remove prescription"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">JPG/PNG/PDF up to 10MB.</p>
        </div>

        {formError && (
          <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
            {formError}
          </p>
        )}

        <Button
          className="w-full"
          onClick={() => void submit()}
          disabled={submitting || disabledByStore || cart.length === 0}
        >
          {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />}
          Place order{cartCount > 0 ? ` (${cartCount})` : ""}
        </Button>
        <p className="text-center text-[10px] text-muted-foreground">
          Final availability and price are confirmed by the pharmacy.
        </p>
      </Card>

      <footer className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Truck className="h-3 w-3" /> Powered by {storeName}
      </footer>
    </div>
  );
}
