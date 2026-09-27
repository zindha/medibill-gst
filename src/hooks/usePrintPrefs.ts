import { useCallback, useEffect, useState } from "react";

export type PrintPaper = "laser-a4" | "thermal-80" | "thermal-58";
export type PrintLayout = "detailed" | "compact";

export interface PrintPrefs {
  paper: PrintPaper;
  layout: PrintLayout;
  logoDataUrl: string | null;
  showLogo: boolean;
  showHsn: boolean;
  showMrp: boolean;
  showTaxTable: boolean;
  showSavings: boolean;
  showNotes: boolean;
  showTerms: boolean;
  footerText: string;
  copies: number;
}

export const DEFAULT_PRINT_PREFS: PrintPrefs = {
  paper: "laser-a4",
  layout: "detailed",
  logoDataUrl: null,
  showLogo: true,
  showHsn: true,
  showMrp: true,
  showTaxTable: true,
  showSavings: true,
  showNotes: true,
  showTerms: true,
  footerText: "Goods once sold will not be taken back. Subject to local jurisdiction.",
  copies: 1,
};

const LOCAL_KEY = "medibill:print-prefs:v1";

/** Print prefs: server settings first (shared across devices), localStorage fallback. */
export function usePrintPrefs() {
  const [prefs, setPrefs] = useState<PrintPrefs>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) return { ...DEFAULT_PRINT_PREFS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return DEFAULT_PRINT_PREFS;
  });
  const [shop, setShop] = useState({ name: "", address: "", gstin: "", phone: "", email: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { settingsApi } = await import("@/lib/api");
        const [allRaw, print] = await Promise.all([
          settingsApi.getAll().catch(() => ({})),
          settingsApi.get("print_prefs").catch(() => null),
        ]);
        if (cancelled) return;
        const all = allRaw as Record<string, any>;
        setShop({
          name: all.store_name ?? "",
          address: all.store_address ?? "",
          gstin: all.store_gstin ?? "",
          phone: all.store_phone ?? "",
          email: all.store_email ?? "",
        });
        const serverPrefs = (print as any)?.value ?? print;
        if (serverPrefs && typeof serverPrefs === "object") {
          setPrefs((p) => ({ ...p, ...serverPrefs }));
        }
      } catch { /* keep local prefs */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async (next: PrintPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    try {
      const { settingsApi } = await import("@/lib/api");
      await settingsApi.set("print_prefs", next);
    } catch { /* local-only fallback */ }
  }, []);

  return { prefs, save, shop };
}
