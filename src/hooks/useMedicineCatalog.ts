import { useCallback, useEffect, useMemo, useState } from "react";
import {
  catalogAdditionsApi,
  catalogApi,
  type CatalogAddition,
  type CatalogOverride,
} from "@/lib/api";
export interface MedicineCatalogEntry {
  name: string;
  company: string;
  composition: string;
  category: string;
  unit: string;
  packSize: string;
  hsnCode: string;
  gstRate: 0 | 5 | 12 | 18 | 28;
}

/** A medicine from either the curated seed or the downloaded database. */
export interface CatalogMedicine extends MedicineCatalogEntry {
  /** Reference MRP in ₹ (only present in the large database). */
  price?: number;
  /** Stable identity: `${name}::${company}` — used for per-user overrides. */
  catalogKey: string;
  /** True when the user has verified/corrected GST or HSN for this entry. */
  verified?: boolean;
  /** True when the user flagged this entry as unavailable in their region. */
  unavailable?: boolean;
  /** True when this medicine was added by the user (not in the bundled DB). */
  added?: boolean;
  /** The catalog_addition row id, when `added`. */
  additionId?: string;
}

/** A row as returned by GET /api/catalog/search. */
interface ServerRow {
  name: string;
  company: string;
  composition: string;
  packSize: string;
  category: string;
  unit: string;
  price?: number;
  gstRate: number;
  catalogKey: string;
}

const HSN_DEFAULT = "30049099";

/** Debounce so a burst of keystrokes issues one request. */
const SEARCH_DEBOUNCE_MS = 150;

function fromServerRow(r: ServerRow): CatalogMedicine {
  return {
    name: r.name,
    company: r.company,
    composition: r.composition,
    category: r.category || "Other",
    unit: r.unit || "Nos",
    packSize: r.packSize,
    price: r.price,
    hsnCode: HSN_DEFAULT,
    gstRate: (r.gstRate || 5) as 0 | 5 | 12 | 18 | 28,
    catalogKey: r.catalogKey || `${r.name}::${r.company}`,
  };
}

export interface MedicineCatalogState {
  /**
   * Matches for the current query.
   * `undefined` when there is nothing to show yet (empty query or still
   * loading the database).
   */
  results: CatalogMedicine[] | undefined;
  /** True while a search is in flight. */
  loading: boolean;
  /** Total number of matches the server found for the current query. */
  count: number;
  /** True if the search failed. */
  error: boolean;
  /** Number of catalog entries flagged unavailable in the user's region. */
  unavailableCount: number;
  /** Medicines the user has added via CSV upload. */
  additions: CatalogMedicine[];
  /** Re-fetch the user's catalog additions from the server. */
  refreshAdditions: () => Promise<void>;
  /** Remove a user-added medicine by its database id. */
  removeAddition: (id: string) => Promise<void>;
  /** Persist a verified GST rate (and optional HSN) for an entry. */
  saveGst: (entry: CatalogMedicine, gstRate: number, hsnCode: string) => void;
  /** Flag a catalog entry as available/unavailable in the user's region. */
  toggleUnavailable: (entry: CatalogMedicine, unavailable: boolean) => void;
  /** Remove all per-user overrides for an entry (revert to dataset defaults). */
  removeOverride: (catalogKey: string) => void;
}

/**
 * Searches the built-in medicine database (2.4L+ rows) via the server.
 *
 * The matching rows are fetched from `GET /api/catalog/search` — the full
 * dataset is never downloaded or parsed by the browser. This replaced a
 * client-side implementation that shipped a 37 MB JSONL file and ran 243,578
 * `JSON.parse` calls on the main thread (~1.3 s locally, ~51 s over a tunnel,
 * ~143 MB of JS heap).
 *
 * Per-user overrides (verified GST/HSN, region availability) and CSV additions
 * are still merged in the client, since they are small and user-scoped.
 *
 * With an empty query no results are returned; callers can show their own
 * empty-state or popular-search UI.
 */
export function useMedicineCatalog(
  query: string,
  limit = 25,
  includeUnavailable = false,
): MedicineCatalogState {
  const [serverRows, setServerRows] = useState<ServerRow[] | null>(null);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const q = query.trim().toLowerCase();

  // Per-user overrides are persisted through the local REST API. If the
  // request fails (e.g. not authenticated), degrade to no overrides.
  const [overrides, setOverrides] = useState<Map<string, CatalogOverride> | null>(null);
  // Medicines the user added via CSV upload.
  const [additionsRaw, setAdditionsRaw] = useState<CatalogAddition[]>([]);

  const refreshAdditions = useCallback(async () => {
    try {
      const list = await catalogAdditionsApi.list();
      setAdditionsRaw(list);
    } catch {
      /* keep existing additions on failure */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    catalogApi
      .list()
      .then((list) => {
        if (cancelled) return;
        setOverrides(new Map(list.map((o) => [o.catalogKey, o])));
      })
      .catch(() => {
        if (!cancelled) setOverrides(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    catalogAdditionsApi
      .list()
      .then((list) => {
        if (!cancelled) setAdditionsRaw(list);
      })
      .catch(() => {
        if (!cancelled) setAdditionsRaw([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const removeAddition = useCallback(async (id: string) => {
    await catalogAdditionsApi.remove(id);
    setAdditionsRaw((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const toAdditionMedicine = (a: CatalogAddition): CatalogMedicine => ({
    name: a.medicineName,
    company: a.company ?? "",
    composition: a.composition ?? "",
    category: a.form ?? "Other",
    unit: a.unit ?? "Nos",
    packSize: a.packSize ?? "",
    price: a.price && a.price > 0 ? a.price : undefined,
    hsnCode: HSN_DEFAULT,
    gstRate: (parseInt(a.gstRate ?? "5", 10) || 5) as 0 | 5 | 12 | 18 | 28,
    catalogKey: a.catalogKey,
    added: true,
    additionId: a.id,
  });

  const applyOverrideChange = (key: string, patch: Partial<CatalogOverride>, shouldRemove: boolean) => {
    setOverrides((prev) => {
      const next = new Map(prev ?? []);
      const existing = next.get(key);
      if (shouldRemove || (!existing && !patch.gstRate && !patch.hsnCode && !patch.unavailable)) {
        next.delete(key);
        return next;
      }
      next.set(key, { ...(existing ?? ({ catalogKey: key } as CatalogOverride)), ...patch });
      return next;
    });
  };

  const overridesMap = overrides ?? new Map<string, CatalogOverride>();

  // -------------------------------------------------------------------------
  // Server-side search (debounced, with race protection)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!q) {
      setServerRows(null);
      setServerTotal(0);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(() => {
      // Over-fetch a little so client-side "unavailable" filtering still fills
      // the requested page.
      const fetchLimit = includeUnavailable ? limit : Math.min(limit * 3, 200);
      catalogApi
        .search(q, fetchLimit)
        .then((res) => {
          if (cancelled) return;
          setServerRows(res?.results ?? []);
          setServerTotal(res?.total ?? 0);
          setError(false);
        })
        .catch(() => {
          if (cancelled) return;
          setServerRows([]);
          setServerTotal(0);
          setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, limit, includeUnavailable]);

  const addedKeys = useMemo(
    () => new Set(additionsRaw.map((a) => a.catalogKey)),
    [additionsRaw],
  );

  const additions = useMemo<CatalogMedicine[]>(
    () => additionsRaw.map(toAdditionMedicine),
    [additionsRaw],
  );

  const results = useMemo<CatalogMedicine[] | undefined>(() => {
    if (!q) return undefined;
    const out: CatalogMedicine[] = [];

    // User additions match first (highest relevance — they're the pharmacy's own).
    for (const a of additions) {
      if (out.length >= limit) break;
      if (a.unavailable && !includeUnavailable) continue;
      if (
        !(a.name.toLowerCase().includes(q) ||
          a.company.toLowerCase().includes(q) ||
          a.composition.toLowerCase().includes(q))
      ) {
        continue;
      }
      out.push({ ...a });
    }

    if (!serverRows) return out; // search still in flight — show additions only

    for (const row of serverRows) {
      if (out.length >= limit) break;
      const key = row.catalogKey || `${row.name}::${row.company}`;
      // Skip rows the user has already added (their version wins).
      if (addedKeys.has(key)) continue;
      const override = overridesMap.get(key);
      if (override?.unavailable && !includeUnavailable) continue;
      const base = fromServerRow(row);
      out.push({
        ...base,
        gstRate: (override?.gstRate ?? base.gstRate) as 0 | 5 | 12 | 18 | 28,
        hsnCode: override?.hsnCode || base.hsnCode,
        verified: !!override && !override.unavailable,
        unavailable: !!override?.unavailable,
      });
    }
    return out;
  }, [serverRows, q, limit, overridesMap, includeUnavailable, additions, addedKeys]);

  const unavailableCount = useMemo(() => {
    let n = 0;
    for (const o of overridesMap.values()) if (o.unavailable) n++;
    return n;
  }, [overridesMap]);

  const saveGst = useCallback(
    (entry: CatalogMedicine, gstRate: number, hsnCode: string) => {
      void catalogApi
        .saveGst({
          catalogKey: entry.catalogKey,
          medicineName: entry.name,
          company: entry.company,
          gstRate: String(gstRate) as "0" | "5" | "12" | "18" | "28",
          hsnCode: hsnCode || undefined,
        })
        .then(() => {
          applyOverrideChange(entry.catalogKey, {
            gstRate: String(gstRate) as "0" | "5" | "12" | "18" | "28",
            hsnCode: hsnCode || undefined,
            verified: true,
            unavailable: false,
          }, false);
        })
        .catch(() => {
          /* ignore — overrides are best-effort */
        });
    },
    [],
  );

  const toggleUnavailable = useCallback(
    (entry: CatalogMedicine, unavailable: boolean) => {
      void catalogApi
        .setUnavailable({
          catalogKey: entry.catalogKey,
          medicineName: entry.name,
          company: entry.company,
          unavailable,
        })
        .then(() => {
          applyOverrideChange(entry.catalogKey, { unavailable }, false);
        })
        .catch(() => {
          /* ignore — overrides are best-effort */
        });
    },
    [],
  );

  const removeOverride = useCallback(
    (catalogKey: string) => {
      void catalogApi
        .remove(catalogKey)
        .then(() => applyOverrideChange(catalogKey, {}, true))
        .catch(() => {
          /* ignore — overrides are best-effort */
        });
    },
    [],
  );

  return {
    results,
    loading,
    count: serverTotal,
    error,
    unavailableCount,
    additions,
    refreshAdditions,
    removeAddition,
    saveGst,
    toggleUnavailable,
    removeOverride,
  };
}
