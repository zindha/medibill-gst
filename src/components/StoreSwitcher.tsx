import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";

export function StoreSwitcher() {
  const [storeName, setStoreName] = useState("MediBill");

  useEffect(() => {
    const loadName = async () => {
      try {
        const { settingsApi } = await import("@/lib/api");
        const all = await settingsApi.getAll();
        if (all.store_name) setStoreName(all.store_name);
      } catch {
        // fallback to default
      }
    };
    void loadName();
  }, []);

  return (
    <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg border border-border bg-card/60 hover:bg-secondary/70 transition-colors text-left">
      <span className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Building2 className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-foreground truncate">
          {storeName}
        </span>
      </span>
    </button>
  );
}
