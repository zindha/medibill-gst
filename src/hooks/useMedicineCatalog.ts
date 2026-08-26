import { useEffect, useMemo, useState } from "react";
import {
  MEDICINE_CATALOG,
  type MedicineCatalogEntry,
} from "@/data/medicineCatalog";

/** A medicine from either the curated seed or the large downloaded database. */
export interface CatalogMedicine extends MedicineCatalogEntry {
  /** Reference MRP in ₹ (only present in the large database). */
  price?: number;
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
}

/**
 * Searches the built-in medicine database.
 *
 * The large database (2.4L+ rows, ~6MB gzipped) is fetched lazily on the
 * first non-empty query and cached for the session. With an empty query the
 * hook returns no results — callers show the curated popular list instead.
 */
export function useMedicineCatalog(query: string, limit = 25): MedicineCatalogState {
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const q = query.trim().toLowerCase();

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
      if (
        row.n.toLowerCase().includes(q) ||
        row.c.toLowerCase().includes(q) ||
        row.s.toLowerCase().includes(q)
      ) {
        out.push(toCatalogMedicine(row));
      }
    }
    return out;
  }, [rows, q, limit]);

  return { results, loading, count: rows?.length ?? 0, error };
}

/** Popular curated medicines shown before the user types a query. */
export function getPopularCatalog(limit = 40): CatalogMedicine[] {
  return MEDICINE_CATALOG.slice(0, limit) as CatalogMedicine[];
}
