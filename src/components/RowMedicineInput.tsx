import { useEffect, useRef } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRowMedicineSearch, type RowSearchOption } from "@/hooks/useRowMedicineSearch";
import { useActiveOptionScroll } from "@/hooks/useActiveOptionScroll";
import type { CatalogMedicine } from "@/hooks/useMedicineCatalog";

interface Props {
  rowIndex: number;
  value: string;
  active: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  onPickStock: (med: any) => void;
  onPickCatalog: (entry: CatalogMedicine) => void;
}

/**
 * The Item box: type to AJAX-search stock + Medicine DB inline, ↓↑ to move,
 * Enter to add — all inside the bill row, no dialog hop.
 */
export function RowMedicineInput({ rowIndex, value, active, onFocus, onBlur, onChange, onPickStock, onPickCatalog }: Props) {
  const { options, searching, open, setOpen, highlight, setHighlight } = useRowMedicineSearch(value, active);
  const list = useActiveOptionScroll();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (active) {
      setHighlight(0);
      list.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, active]);

  const pick = (opt: RowSearchOption) => {
    setOpen(false);
    if (opt.kind === "stock") onPickStock(opt.med);
    else onPickCatalog(opt.entry);
  };

  const visible = open && (options.length > 0 || searching);

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <Input
        value={value}
        data-row-medicine-input
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          onFocus();
          setOpen(true);
        }}
        onBlur={() => {
          // Delay so an option click lands before the list closes.
          setTimeout(() => {
            onBlur();
            setOpen(false);
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = Math.min(highlight + 1, Math.max(0, options.length - 1));
            setHighlight(next);
            list.scrollTo(next);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const next = Math.max(0, highlight - 1);
            setHighlight(next);
            list.scrollTo(next);
          } else if (e.key === "Enter") {
            const opt = options[highlight];
            if (opt && value.trim()) {
              e.preventDefault();
              pick(opt);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Type to search stock + DB…"
        className="h-8 pr-8 text-sm"
        aria-label={`Row ${rowIndex + 1} medicine — type to search, arrows move, Enter adds`}
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
      />
      <span className="pointer-events-none absolute right-2.5 top-2">
        {searching ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Search className="h-4 w-4 text-muted-foreground" />
        )}
      </span>
      {visible && (
        <div
          ref={(el) => {
            list.listRef.current = el;
          }}
          role="listbox"
          aria-label="Matching medicines"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 space-y-1 overflow-y-auto scroll-py-1 rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {searching && options.length === 0 && (
            <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Searching…
            </p>
          )}
          {options.map((opt, listIdx) => {
            const isActive = listIdx === highlight;
            if (opt.kind === "stock") {
              const med = opt.med;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="option"
                  data-option-index={listIdx}
                  aria-selected={isActive}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(listIdx)}
                  onClick={() => pick(opt)}
                  className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${isActive ? "bg-secondary" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="font-medium">{med.name}</span>
                    {med.brand && <span className="ml-1 text-muted-foreground">({med.brand})</span>}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    ₹{med.sellingPrice ?? med.mrp} · {med.quantity ?? med.totalStock ?? 0} in stock
                  </span>
                </button>
              );
            }
            const m = opt.entry;
            return (
              <button
                key={opt.key}
                type="button"
                role="option"
                data-option-index={listIdx}
                aria-selected={isActive}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(listIdx)}
                onClick={() => pick(opt)}
                className={`flex w-full items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-left text-sm ${isActive ? "border-primary/50 bg-primary/5" : "border-border/40"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.company}</span>
                </span>
                <span className="shrink-0 rounded-sm border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">DB · Enter</span>
              </button>
            );
          })}
          {!searching && options.length === 0 && value.trim() && (
            <p className="py-3 text-center text-sm text-muted-foreground">No matches — try the scan bar or Medicine DB.</p>
          )}
        </div>
      )}
    </div>
  );
}
