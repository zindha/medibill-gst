import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  MEDICINE_CATALOG,
  type MedicineCatalogEntry,
} from "@/data/medicineCatalog";

/** A medicine from either the curated seed or the large downloaded database. */
export interface CatalogMedicine extends MedicineCatalogEntry {
  /** Reference MRP in ₹ (only present in the large database). */
  price?: number;
  /** Stable identity: `${name}::${company}` — used for per-user overrides. */
  catalogKey: string;
  /** True when the user has verified/corrected GST or HSN for this entry. */
  verified?: boolean;
  /** True when the user flagged this entry as unavailable in their region. */
  unavailable?: boolean;
}

/** Compact row as stored in public/medicineCatalog.jsonl. */
interface RawRow {
  n: string;
  c: string;
  s: string;
  p: string;
  f: string;
  u: string;
  r: number;
  g: number;
}

const HSN_DEFAULT = "30049099";
const DATA_URL = `${import.meta.env.BASE_URL}medicineCatalog.jsonl`;

let cachePromise: Promise<RawRow[]> | null = null;

function loadCatalog(): Promise<RawRow[]> {
  if (!cachePromise) {
    cachePromise = fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
        return res.text();
      })
      .then((text) =>
        text
          .split("\n")
          .filter((l) => l.trim().length > 0)
          .map((l) => JSON.parse(l) as RawRow),
      )
      .catch((err) => {
        // Allow a retry on next search rather than caching the failure.
        cachePromise = null;
        throw err;
      });
  }
  return cachePromise;
}

function toCatalogMedicine(row: RawRow): CatalogMedicine {
  return {
    name: row.n,
    company: row.c,
    composition: row.s,
    category: row.f,
    unit: row.u,
    packSize: row.p,
    price: row.r > 0 ? row.r : undefined,
    hsnCode: HSN_DEFAULT,
    gstRate: (row.g || 5) as 0 | 5 | 12 | 18 | 28,
    catalogKey: `${row.n}::${row.c}`,
  };
}

export interface MedicineCatalogState {
  /**
   * Matches for the current query.
   * `undefined` when there is nothing to show yet (empty query or still
   * loading the database).
   */
  results: CatalogMedicine[] | undefined;
  /** True while the large database is being fetched/parsed for a query. */
  loading: boolean;
  /** Total number of medicines in the large database (0 until loaded). */
  count: number;
  /** True if the large database failed to load. */
  error: boolean;
  /** Number of catalog entries flagged unavailable in the user's region. */
  unavailableCount: number;
  /** Persist a verified GST rate (and optional HSN) for an entry. */
  saveGst: (entry: CatalogMedicine, gstRate: number, hsnCode: string) => void;
  /** Flag a catalog entry as available/unavailable in the user's region. */
  toggleUnavailable: (entry: CatalogMedicine, unavailable: boolean) => void;
  /** Remove all per-user overrides for an entry (revert to dataset defaults). */
  removeOverride: (catalogKey: string) => void;
}

/**
 * Searches the built-in medicine database (2.4L+ rows, lazily fetched and
 * cached) and merges the user's per-region overrides: entries flagged
 * unavailable are hidden (unless `includeUnavailable`) and verified GST/HSN
 * values replace the dataset defaults.
 *
 * With an empty query no results are returned — callers show the curated
 * popular list instead.
 */
export function useMedicineCatalog(
  query: string,
  limit = 25,
  includeUnavailable = false,
): MedicineCatalogState {
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const q = query.trim().toLowerCase();

  const overridesList = useQuery(api.catalogOverrides.list);
  const setUnavailableMut = useMutation(api.catalogOverrides.setUnavailable);
  const saveGstMut = useMutation(api.catalogOverrides.saveGst);
  const removeOverrideMut = useMutation(api.catalogOverrides.remove);

  const overridesMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof overridesList>[number]>();
    for (const o of overridesList ?? []) m.set(o.catalogKey, o);
    return m;
  }, [overridesList]);

  useEffect(() => {
    if (!q) {
      setRows(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      loadCatalog()
        .then((data) => {
          if (!cancelled) setRows(data);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const results = useMemo<CatalogMedicine[] | undefined>(() => {
    if (!q || !rows) return undefined;
    const out: CatalogMedicine[] = [];
    for (const row of rows) {
      if (out.length >= limit) break;
      const key = `${row.n}::${row.c}`;
      const override = overridesMap.get(key);
      if (override?.unavailable && !includeUnavailable) continue;
      if (
        !(
          row.n.toLowerCase().includes(q) ||
          row.c.toLowerCase().includes(q) ||
          row.s.toLowerCase().includes(q)
        )
      ) {
        continue;
      }
      const base = toCatalogMedicine(row);
      out.push({
        ...base,
        gstRate: (override?.gstRate ?? base.gstRate) as 0 | 5 | 12 | 18 | 28,
        hsnCode: override?.hsnCode || base.hsnCode,
        verified: !!override && !override.unavailable,
        unavailable: !!override?.unavailable,
      });
    }
    return out;
  }, [rows, q, limit, overridesMap, includeUnavailable]);

  const unavailableCount = useMemo(() => {
    let n = 0;
    for (const o of overridesList ?? []) if (o.unavailable) n++;
    return n;
  }, [overridesList]);

  const saveGst = useCallback(
    (entry: CatalogMedicine, gstRate: number, hsnCode: string) => {
      void saveGstMut({
        catalogKey: entry.catalogKey,
        medicineName: entry.name,
        company: entry.company,
        gstRate: gstRate as 0 | 5 | 12 | 18 | 28,
        hsnCode: hsnCode || undefined,
      });
    },
    [saveGstMut],
  );

  const toggleUnavailable = useCallback(
    (entry: CatalogMedicine, unavailable: boolean) => {
      void setUnavailableMut({
        catalogKey: entry.catalogKey,
        medicineName: entry.name,
        company: entry.company,
        unavailable,
      });
    },
    [setUnavailableMut],
  );

  const removeOverride = useCallback(
    (catalogKey: string) => {
      void removeOverrideMut({ catalogKey });
    },
    [removeOverrideMut],
  );

  return {
    results,
    loading,
    count: rows?.length ?? 0,
    error,
    unavailableCount,
    saveGst,
    toggleUnavailable,
    removeOverride,
  };
}

/** Popular curated medicines shown before the user types a query. */
export function getPopularCatalog(limit = 40): CatalogMedicine[] {
  return MEDICINE_CATALOG.slice(0, limit).map((m) => ({
    ...m,
    catalogKey: `${m.name}::${m.company}`,
  }));
}
