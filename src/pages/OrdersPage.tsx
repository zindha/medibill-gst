import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  ApiError,
  ordersApi,
  type CustomerOrder,
  type CustomerOrderStatus,
  type OrderStatusCounts,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Search,
  ShoppingBag,
  Truck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "border-amber-600/30 text-amber-700 bg-amber-600/5" },
  accepted: { label: "Accepted", cls: "border-blue-600/30 text-blue-700 bg-blue-600/5" },
  packed: { label: "Packed", cls: "border-violet-600/30 text-violet-700 bg-violet-600/5" },
  ready: { label: "Ready", cls: "border-cyan-600/30 text-cyan-700 bg-cyan-600/5" },
  delivered: { label: "Delivered", cls: "border-green-600/30 text-green-700 bg-green-600/5" },
  rejected: { label: "Rejected", cls: "border-red-600/30 text-red-700 bg-red-600/5" },
  cancelled: { label: "Cancelled", cls: "border-gray-500/30 text-gray-600 bg-gray-100" },
};

type FilterKey = "all" | CustomerOrderStatus;
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "packed", label: "Packed" },
  { key: "ready", label: "Ready" },
  { key: "delivered", label: "Delivered" },
];

const money = (n: number) => `₹${Number(n ?? 0).toFixed(2)}`;

/** Server page size — "Load more" appends the next page until `total`. */
const PAGE_SIZE = 100;
const COUNT_KEYS = ["pending", "accepted", "packed", "ready", "delivered", "rejected", "cancelled"];

const timeLabel = (ts: string | number | Date) =>
  new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const shortId = (id: string) => id.slice(0, 8);

const itemsSummary = (order: CustomerOrder) =>
  order.items.map((i) => `${i.quantity}× ${i.medicineName}`).join(", ");

/** 409 stock refusal carries {error, details:{items:[{medicineName,available,requested}]}}. */
function stockShortages(err: unknown): Array<{ medicineName: string; available: number; requested: number }> | null {
  if (err instanceof ApiError && err.status === 409 && err.message === "Insufficient stock") {
    const items = err.details?.items;
    if (Array.isArray(items)) return items;
  }
  return null;
}

export default function OrdersPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<OrderStatusCounts | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Detail dialog
  const [detail, setDetail] = useState<CustomerOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [imageOpen, setImageOpen] = useState<string | null>(null);

  // Deliver dialog
  const [deliverTarget, setDeliverTarget] = useState<CustomerOrder | null>(null);
  const [delivering, setDelivering] = useState(false);

  // Reject/cancel reason dialog
  const [reasonTarget, setReasonTarget] = useState<{
    order: CustomerOrder;
    action: "reject" | "cancel";
  } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [reasonSaving, setReasonSaving] = useState(false);

  // Inline 409 stock detail per order
  const [stockErrors, setStockErrors] = useState<
    Record<string, Array<{ medicineName: string; available: number; requested: number }>>
  >({});

  /**
   * Fetch one page from the server (status + q are server-side). `append`
   * adds the next page; otherwise the list is replaced (scope change).
   */
  const fetchPage = useCallback(
    async (pageNo: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const res = await ordersApi.list({
          page: pageNo,
          limit: PAGE_SIZE,
          q: debouncedQuery.trim() || undefined,
          status: filter !== "all" ? filter : undefined,
        });
        const rows = res.data ?? [];
        setOrders((prev) => (append ? [...prev, ...rows] : rows));
        setTotal(res.total ?? rows.length);
        if (res.counts) setCounts(res.counts);
        setPage(pageNo);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load orders");
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [debouncedQuery, filter]
  );

  /** Refresh only the pills/total after a state change — keeps loaded rows. */
  const refreshScope = useCallback(async () => {
    try {
      const res = await ordersApi.list({
        page: 1,
        limit: 1,
        q: debouncedQuery.trim() || undefined,
        status: filter !== "all" ? filter : undefined,
      });
      setTotal(res.total ?? 0);
      if (res.counts) setCounts(res.counts);
    } catch {
      // Pill refresh is best-effort — the loaded rows are already correct.
    }
  }, [debouncedQuery, filter]);

  // (Re)load page 1 whenever the auth session or the search scope changes.
  useEffect(() => {
    if (!isAuthenticated) return;
    // Deferred: fetchPage sets loading state, which must not run synchronously
    // inside the effect body.
    const t = setTimeout(() => void fetchPage(1, false), 0);
    return () => clearTimeout(t);
  }, [isAuthenticated, fetchPage]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  const load = useCallback(() => fetchPage(1, false), [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading) return;
    if (orders.length >= total) return;
    void fetchPage(page + 1, true);
  }, [fetchPage, loading, loadingMore, orders.length, page, total]);

  /** Pills use the SERVER counts; fall back to the loaded set if absent. */
  const pillCounts = useMemo<Record<string, number>>(() => {
    if (counts) {
      const map: Record<string, number> = {};
      for (const [key, value] of Object.entries(counts)) map[key] = value;
      return map;
    }
    const map: Record<string, number> = { all: orders.length };
    for (const key of COUNT_KEYS) map[key] = orders.filter((o) => o.status === key).length;
    return map;
  }, [counts, orders]);

  /** Shared action runner — refreshes the queue and surfaces 409 stock detail. */
  const runAction = async (
    order: CustomerOrder,
    fn: () => Promise<CustomerOrder>,
    successMsg?: string
  ): Promise<CustomerOrder | null> => {
    setBusyId(order.id);
    setStockErrors((prev) => {
      if (!prev[order.id]) return prev;
      const next = { ...prev };
      delete next[order.id];
      return next;
    });
    try {
      const updated = await fn();
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
      if (successMsg) toast.success(successMsg);
      // Server counts/total can move with the transition — refresh the pills
      // without dropping the loaded (possibly paged) rows.
      void refreshScope();
      return updated;
    } catch (err) {
      const shortages = stockShortages(err);
      if (shortages) {
        setStockErrors((prev) => ({ ...prev, [order.id]: shortages }));
        toast.error("Insufficient stock — see the item detail on the row");
      } else if (err instanceof ApiError && err.status === 409) {
        toast.error(err.message);
      } else {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const accept = (o: CustomerOrder) => runAction(o, () => ordersApi.accept(o.id), "Order accepted");
  const pack = (o: CustomerOrder) => runAction(o, () => ordersApi.pack(o.id), "Order packed");
  const ready = (o: CustomerOrder) => runAction(o, () => ordersApi.ready(o.id), "Order ready for delivery");

  const openDetail = async (o: CustomerOrder) => {
    setDetailLoading(true);
    setDetail(o);
    try {
      const full = await ordersApi.get(o.id);
      setDetail(full);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load order");
    } finally {
      setDetailLoading(false);
    }
  };

  const submitDeliver = async () => {
    if (!deliverTarget?.invoiceId) return;
    setDelivering(true);
    const updated = await runAction(
      deliverTarget,
      () => ordersApi.deliver(deliverTarget.id, deliverTarget.invoiceId!),
      "Order delivered"
    );
    setDelivering(false);
    if (updated) setDeliverTarget(null);
  };

  const submitReason = async () => {
    if (!reasonTarget) return;
    const reason = reasonText.trim();
    if (reason.length < 3) {
      toast.error("Reason must be at least 3 characters");
      return;
    }
    setReasonSaving(true);
    const { order, action } = reasonTarget;
    const updated = await runAction(
      order,
      () => (action === "reject" ? ordersApi.reject(order.id, reason) : ordersApi.cancel(order.id, reason)),
      action === "reject" ? "Order rejected" : "Order cancelled"
    );
    setReasonSaving(false);
    if (updated) {
      setReasonTarget(null);
      setReasonText("");
      if (detail?.id === updated.id) setDetail(null);
    }
  };

  const billOrder = (o: CustomerOrder) => {
    setDetail(null);
    navigate(`/dashboard/billing?orderId=${encodeURIComponent(o.id)}`);
  };

  if (!isAuthenticated && !authLoading) return null;

  const renderActions = (o: CustomerOrder) => {
    const busy = busyId === o.id;
    const disabled = busyId !== null && !busy;
    const btn = (label: string, icon: React.ReactNode, onClick: () => void, variant: "default" | "outline" | "ghost" = "outline") => (
      <Button
        key={label}
        size="sm"
        variant={variant}
        className="h-7 text-xs"
        disabled={busy || disabled}
        onClick={onClick}
      >
        {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : icon}
        {label}
      </Button>
    );

    switch (o.status) {
      case "pending":
        return [
          btn("Accept", <CheckCircle2 className="mr-1 h-3 w-3" />, () => void accept(o), "default"),
          btn("Reject", <XCircle className="mr-1 h-3 w-3" />, () => {
            setReasonTarget({ order: o, action: "reject" });
            setReasonText("");
          }),
          btn("Cancel", <XCircle className="mr-1 h-3 w-3" />, () => {
            setReasonTarget({ order: o, action: "cancel" });
            setReasonText("");
          }),
        ];
      case "accepted":
        return [
          btn("Mark packed", <PackageCheck className="mr-1 h-3 w-3" />, () => void pack(o), "default"),
          btn("Deliver", <Truck className="mr-1 h-3 w-3" />, () => setDeliverTarget(o)),
          btn("Reject", <XCircle className="mr-1 h-3 w-3" />, () => {
            setReasonTarget({ order: o, action: "reject" });
            setReasonText("");
          }),
          btn("Cancel", <XCircle className="mr-1 h-3 w-3" />, () => {
            setReasonTarget({ order: o, action: "cancel" });
            setReasonText("");
          }),
        ];
      case "packed":
        return [
          btn("Mark ready", <Truck className="mr-1 h-3 w-3" />, () => void ready(o), "default"),
          btn("Deliver", <Truck className="mr-1 h-3 w-3" />, () => setDeliverTarget(o)),
          btn("Cancel", <XCircle className="mr-1 h-3 w-3" />, () => {
            setReasonTarget({ order: o, action: "cancel" });
            setReasonText("");
          }),
        ];
      case "ready":
        return [btn("Deliver", <Truck className="mr-1 h-3 w-3" />, () => setDeliverTarget(o), "default")];
      default:
        return [];
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <ShoppingBag className="h-4 w-4" /> Online Orders
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Customer orders from the public order page — accept, pack, bill and deliver.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {/* Filter pills with counts */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] leading-4",
                filter === f.key ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
              )}
            >
              {pillCounts[f.key] ?? 0}
            </span>
          </button>
        ))}
        <span className="ml-auto relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name / phone / id"
            className="h-8 w-56 pl-8 text-xs"
            aria-label="Search orders"
          />
        </span>
      </div>

      {loadError && (
        <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          {loadError}
        </p>
      )}

      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading orders…
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filter === "all" && !query ? "No online orders yet" : "No orders match this filter"}
          description={
            filter === "all" && !query
              ? "Share your public order link from Settings — customer orders will land here."
              : "Try a different status pill or clear the search."
          }
          actions={
            filter === "all" && !query
              ? [{ label: "Open Settings", onClick: () => navigate("/dashboard/settings") }]
              : [{ label: "Clear filter", onClick: () => { setFilter("all"); setQuery(""); } }]
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((o) => {
            const pill = STATUS_PILL[o.status] ?? STATUS_PILL.pending;
            const shortages = stockErrors[o.id];
            return (
              <Card key={o.id} className="border-border/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => void openDetail(o)}
                    aria-label={`Open order ${shortId(o.id)}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{shortId(o.id)}</span>
                      <span
                        className={cn(
                          "inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] leading-none",
                          pill.cls
                        )}
                      >
                        {pill.label}
                      </span>
                      {o.prescriptionFileId && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <FileText className="h-3 w-3" /> Rx
                        </Badge>
                      )}
                      {o.invoiceId && (
                        <Badge variant="outline" className="gap-1 text-[10px] text-green-700">
                          <CheckCircle2 className="h-3 w-3" /> Billed
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium">
                      {o.customerName} <span className="font-normal text-muted-foreground">· {o.phone}</span>
                    </p>
                    <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                      {itemsSummary(o)}
                    </p>
                    {(o.status === "rejected" || o.status === "cancelled") && o.reason && (
                      <p className="mt-0.5 text-xs text-destructive/90">Reason: {o.reason}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{timeLabel(o.createdAt)}</p>
                  </button>

                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm font-semibold">{money(o.subtotal)}</span>
                    <div className="flex flex-wrap justify-end gap-1.5">{renderActions(o)}</div>
                    {(o.status === "accepted" || o.status === "packed" || o.status === "ready") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => billOrder(o)}
                      >
                        <FileText className="mr-1 h-3 w-3" /> Bill this order
                      </Button>
                    )}
                  </div>
                </div>

                {shortages && (
                  <div
                    className="mt-2 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2"
                    role="alert"
                  >
                    <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> Insufficient stock
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {shortages.map((s, i) => (
                        <li key={`${s.medicineName}-${i}`} className="text-xs text-destructive/90">
                          {s.medicineName} — available {s.available}, requested {s.requested}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Paging — append the next server page until the total is loaded */}
          {orders.length < total && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore || loading}
              >
                {loadingMore && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Load more
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {orders.length} of {total} orders
              </span>
            </div>
          )}
          {!loading && orders.length >= total && total > PAGE_SIZE && (
            <p className="pt-1 text-center text-[11px] text-muted-foreground">
              All {total} orders loaded
            </p>
          )}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) { setDetail(null); setImageOpen(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Order #{detail ? shortId(detail.id) : ""}
              {detail && (
                <span
                  className={cn(
                    "inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] leading-none",
                    STATUS_PILL[detail.status]?.cls
                  )}
                >
                  {STATUS_PILL[detail.status]?.label}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {detail ? timeLabel(detail.createdAt) : ""}
              {detailLoading ? " · loading…" : ""}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{detail.customerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{detail.phone}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Delivery address</p>
                  <p className="font-medium">{detail.deliveryAddress || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="font-medium">{detail.notes || "—"}</p>
                </div>
              </div>

              <div className="rounded-sm border border-border/60">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-muted-foreground">
                      <th className="px-2 py-1.5 font-medium">Item</th>
                      <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                      <th className="px-2 py-1.5 text-right font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((i) => (
                      <tr key={i.id} className="border-b border-border/40 last:border-0">
                        <td className="px-2 py-1.5">{i.medicineName}</td>
                        <td className="px-2 py-1.5 text-right">{i.quantity}</td>
                        <td className="px-2 py-1.5 text-right">{money(i.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="px-2 py-1.5 font-medium">Subtotal</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{money(detail.subtotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {(detail.status === "rejected" || detail.status === "cancelled") && detail.reason && (
                <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {detail.status === "rejected" ? "Rejected" : "Cancelled"}: {detail.reason}
                </p>
              )}

              {detail.prescriptionFile && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> Prescription — {detail.prescriptionFile.filename}
                  </p>
                  <button
                    type="button"
                    onClick={() => setImageOpen(`data:${detail.prescriptionFile!.contentType};base64,${detail.prescriptionFile!.data}`)}
                    className="flex h-40 w-full items-center justify-center overflow-hidden rounded-sm border border-border/60 bg-muted/40"
                    aria-label="Preview prescription"
                  >
                    <img
                      src={`data:${detail.prescriptionFile.contentType};base64,${detail.prescriptionFile.data}`}
                      alt="Prescription"
                      className="max-h-40 w-auto object-contain"
                    />
                  </button>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                {(detail.status === "accepted" || detail.status === "packed" || detail.status === "ready") && (
                  <Button size="sm" onClick={() => billOrder(detail)}>
                    <FileText className="mr-1.5 h-3.5 w-3.5" /> Bill this order
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setDetail(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Prescription image lightbox */}
      <Dialog open={!!imageOpen} onOpenChange={(open) => { if (!open) setImageOpen(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Prescription
            </DialogTitle>
          </DialogHeader>
          {imageOpen && (
            <img src={imageOpen} alt="Prescription" className="mx-auto max-h-[70vh] w-auto rounded-sm" />
          )}
        </DialogContent>
      </Dialog>

      {/* Deliver dialog */}
      <Dialog open={!!deliverTarget} onOpenChange={(open) => { if (!open) setDeliverTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deliver order</DialogTitle>
            <DialogDescription>
              Mark #{deliverTarget ? shortId(deliverTarget.id) : ""} as delivered to{" "}
              {deliverTarget?.customerName}.
            </DialogDescription>
          </DialogHeader>
          {deliverTarget && (
            <div className="space-y-3">
              {deliverTarget.invoiceId ? (
                <p className="flex items-center gap-1.5 rounded-sm border border-green-600/30 bg-green-600/5 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Linked bill found — delivering records the handover.
                </p>
              ) : (
                <div className="rounded-sm border border-amber-600/30 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-medium">Bill first</p>
                  <p className="mt-0.5">
                    This order has no invoice yet. Create the bill from the order (stock is deducted there),
                    then deliver — the saved bill links automatically.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={() => billOrder(deliverTarget)}
                  >
                    <FileText className="mr-1 h-3 w-3" /> Open billing with this order
                  </Button>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setDeliverTarget(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void submitDeliver()}
                  disabled={delivering || !deliverTarget.invoiceId}
                  title={!deliverTarget.invoiceId ? "Create the bill first" : undefined}
                >
                  {delivering && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Confirm delivered
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject/cancel reason dialog */}
      <Dialog open={!!reasonTarget} onOpenChange={(open) => { if (!open) setReasonTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reasonTarget?.action === "reject" ? "Reject order" : "Cancel order"}
            </DialogTitle>
            <DialogDescription>
              #{reasonTarget ? shortId(reasonTarget.order.id) : ""} — the reason is stored on the order and
              included in the customer notification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="order-reason" className="text-xs">Reason</Label>
            <Textarea
              id="order-reason"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="e.g. Medicine out of stock"
              rows={3}
              maxLength={500}
            />
            <p className="text-[10px] text-muted-foreground">Minimum 3 characters.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setReasonTarget(null)}>
                Back
              </Button>
              <Button size="sm" onClick={() => void submitReason()} disabled={reasonSaving || reasonText.trim().length < 3}>
                {reasonSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {reasonTarget?.action === "reject" ? "Reject order" : "Cancel order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* External link hint to the public portal (docs pointer) */}
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ExternalLink className="h-3 w-3" /> Customers order through Settings → Online Ordering → copy the
        public link.
      </p>
    </div>
  );
}
