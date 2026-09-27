import { useEffect, useRef } from "react";

/**
 * Keeps the keyboard-highlighted option visible inside a scrolling listbox.
 * Returns a ref to attach to the list container; call `scrollTo(index)`
 * whenever the active index changes via ArrowUp/ArrowDown.
 */
export function useActiveOptionScroll() {
  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollTo = (index: number) => {
    const list = listRef.current;
    if (!list) return;
    // Options carry data-option-index; mouse users never trigger this.
    const el = list.querySelector<HTMLElement>(`[data-option-index="${index}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  // Reset scroll when the list content is replaced (new query).
  const reset = () => {
    listRef.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    return () => {
      listRef.current = null;
    };
  }, []);

  return { listRef, scrollTo, reset };
}
