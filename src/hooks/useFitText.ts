import { useEffect, useRef, useState } from "react";

/**
 * Auto-fit hook: scales font-size down when content overflows its container.
 *
 * Keeps tabular-nums money/batch cells readable at any table width. Floored at
 * `minPx` so values like `₹1,56,000.00` at 10.5px stay legible; if still clipped,
 * the caller should add an ellipsis + `title` fallback.
 *
 * Returns a ref to attach to the inner text element and an inline style to apply.
 */
export function useFitText<T extends HTMLElement>(text: string, opts?: { maxPx?: number; minPx?: number; disabled?: boolean }) {
  const maxPx = opts?.maxPx ?? 12;
  const minPx = opts?.minPx ?? 10.5;
  const disabled = opts?.disabled ?? false;
  const ref = useRef<T | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ fontSize: `${maxPx}px` });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (disabled) {
      el.style.fontSize = "";
      setStyle({ fontSize: `${maxPx}px` });
      return;
    }

    const fit = () => {
      if (!el) return;
      // Reset so measurement isn't polluted by a prior shrink.
      el.style.fontSize = `${maxPx}px`;
      let size = maxPx;
      while (size > minPx && el.scrollWidth > el.clientWidth + 0.5) {
        size = Math.max(minPx, +(size - 0.25).toFixed(2));
        el.style.fontSize = `${size}px`;
        if (size === minPx) break;
      }
      setStyle((prev) => (prev.fontSize === `${size}px` ? prev : { fontSize: `${size}px` }));
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const parent = el.parentElement as HTMLElement | null;
    if (parent) ro.observe(parent);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [text, maxPx, minPx, disabled]);

  return { ref, style, resetFontPx: maxPx, floorPx: minPx } as const;
}
