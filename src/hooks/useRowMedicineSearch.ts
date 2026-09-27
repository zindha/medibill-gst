import { useEffect, useRef, useState } from "react";
import { catalogApi, medicinesApi } from "@/lib/api";
import type { CatalogMedicine } from "@/hooks/useMedicineCatalog";

export type RowSearchOption =
  | { kind: "stock"; key: string; med: any }
  | { kind: "catalog"; key: string; entry: CatalogMedicine };

/**
 * Per-row inline medicine search: server stock AJAX + Medicine DB, merged into
 * one keyboard list. Debounced so a burst of keystrokes issues one request
 * pair. Only the active (focused) row searches — idle rows cost nothing.
 */
export function useRowMedicineSearch(query: string, active: boolean) {
  const [stock, setStock] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<CatalogMedicine[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const reqId = useRef(0);
  const q = query.trim();

  useEffect(() => {
    if (!active || !q) {
      setStock([]);
      setCatalog([]);
      setSearching(false);
      if (!active) setOpen(false);
      else if (q) setOpen(true);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const [medsRes, catRes] = await Promise.all([
          medicinesApi.list({ search: q, limit: 15 }),
          catalogApi.search(q, 15).catch(() => ({ results: [] as CatalogMedicine[] })),
        ]);
        if (reqId.current !== id) return;
        const meds = Array.isArray(medsRes) ? medsRes : ((medsRes as any)?.data ?? []);
        const catRows = ((catRes as any)?.results ?? []) as Array<{
          name: string; company: string; composition: string; packSize: string;
          category: string; unit: string; price?: number; gstRate: number; catalogKey: string;
        }>;
        const present = new Set<string>(
          meds.map((m: any) => `${String(m.name).toLowerCase()}::${String(m.brand ?? m.company ?? "").toLowerCase()}`),
        );
        setStock(meds.map((m: any) => ({ ...m, _id: m.id ?? m._id })));
        const server: CatalogMedicine[] = catRows
          .filter((r) => !present.has(`${r.name.toLowerCase()}::${r.company.toLowerCase()}`))
          .map((r) => ({
            name: r.name,
            company: r.company,
            composition: r.composition,
            category: r.category || "Other",
            unit: r.unit || "Nos",
            packSize: r.packSize,
            price: r.price,
            hsnCode: "30049099",
            gstRate: (r.gstRate || 5) as 0 | 5 | 12 | 18 | 28,
            catalogKey: r.catalogKey || `${r.name}::${r.company}`,
          }));
        setCatalog(server.slice(0, 15));
        setHighlight(0);
        setOpen(true);
      } catch {
        if (reqId.current !== id) return;
        setStock([]);
        setCatalog([]);
      } finally {
        if (reqId.current === id) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, active]);

  const options: RowSearchOption[] = [
    ...stock.map((med: any) => ({ kind: "stock" as const, key: `stock:${med.id ?? med._id ?? med.name}`, med })),
    ...catalog.map((entry) => ({ kind: "catalog" as const, key: `catalog:${entry.catalogKey}`, entry })),
  ];

  return { options, searching, open, setOpen, highlight, setHighlight };
}
