import { useCallback, useEffect, useState } from "react";
import { Loader2, PackageX, RefreshCw, Replace, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { productIntelApi, type AlternativesResult, type MedicineAlternative } from "@/lib/api";

interface Props {
  medicineId: string;
  /** Swap the chosen alternative into the caller's context (billing row etc.). */
  onUse?: (alt: MedicineAlternative) => void;
  /** Only show candidates you can actually dispense right now. */
  inStock?: boolean;
  /** Cap rows per bucket to keep the list compact. */
  maxRows?: number;
  className?: string;
}

interface FlattenedRow {
  bucket: "Exact salt" | "Same composition" | "Substitute";
  alt: MedicineAlternative;
}

const BUCKETS: Array<{ key: keyof AlternativesResult["buckets"]; label: FlattenedRow["bucket"] }> = [
  { key: "exactSalt", label: "Exact salt" },
  { key: "sameComposition", label: "Same composition" },
  { key: "substitutes", label: "Substitute" },
];

/**
 * Compact alternatives list: same-salt / same-composition / substitute
 * candidates from the tenant's own stock with rate, stock and margin, each
 * with a "Use this" action. Loading, empty and error states included.
 */
export function MedicineAlternatives({ medicineId, onUse, inStock = true, maxRows = 5, className }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AlternativesResult | null>(null);

  const load = useCallback(async () => {
    if (!medicineId) {
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await productIntelApi.alternatives(medicineId, { inStock });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load alternatives");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [medicineId, inStock]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: FlattenedRow[] = result
    ? BUCKETS.flatMap(({ key, label }) =>
        result.buckets[key].slice(0, maxRows).map((alt) => ({ bucket: label, alt })),
      )
    : [];

  if (loading) {
    return (
      <p className={`flex items-center gap-2 py-3 text-sm text-muted-foreground ${className ?? ""}`}>
        <Loader2 className="h-4 w-4 animate-spin" />Finding alternatives…
      </p>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-between gap-2 py-2 text-sm ${className ?? ""}`}>
        <span className="text-destructive">{error}</span>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className={`flex items-center gap-2 py-3 text-sm text-muted-foreground ${className ?? ""}`}>
        <PackageX className="h-4 w-4 shrink-0" />
        No alternatives in stock for {result?.source?.name ?? "this medicine"}.
      </p>
    );
  }

  return (
    <ul className={`space-y-1 ${className ?? ""}`}>
      {rows.map(({ bucket, alt }) => (
        <li
          key={alt.medicineId}
          className="flex items-center justify-between gap-2 rounded-sm border border-border/60 px-2 py-1.5"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{alt.name}</span>
              {alt.brand && <span className="shrink-0 text-xs text-muted-foreground">({alt.brand})</span>}
              {alt.explicit && (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Pharmacist-linked substitute" />
              )}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {bucket} · ₹{alt.sellingPrice.toFixed(2)} · {alt.stockPacks} in stock ·{" "}
              {alt.marginPercent.toFixed(1)}% margin
            </span>
          </span>
          {onUse && (
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => onUse(alt)}>
              <Replace className="mr-1 h-3.5 w-3.5" /> Use this
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
