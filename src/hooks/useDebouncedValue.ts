import { useEffect, useState } from "react";

/** Returns `value` after it has been stable for `delay` ms — used to avoid
 *  firing a server route on every keystroke during live (AJAX) search. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}