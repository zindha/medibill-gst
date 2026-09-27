import * as React from "react"

import { cn } from "@/lib/utils"
import { useFitText } from "@/hooks/useFitText"

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { fit?: boolean; fitMaxPx?: number; fitMinPx?: number }
>(({ className, type, fit, fitMaxPx, fitMinPx, style, value, defaultValue, ...props }, forwardedRef) => {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- fit is stable per instance (always 0 or 1 fit input per row)
  const fitData = useFitText<HTMLInputElement>(String(value ?? defaultValue ?? ""), {
    maxPx: fitMaxPx ?? 12,
    minPx: fitMinPx ?? 10.5,
    disabled: !fit,
  });
  const setRefs = React.useCallback(
    (el: HTMLInputElement | null) => {
      (fitData.ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable ref object
    [forwardedRef]
  );

  return (
    <input
      ref={setRefs}
      type={type}
      data-slot="input"
      value={value}
      defaultValue={defaultValue}
      style={fit ? (fitData.style as React.CSSProperties & { textOverflow?: string }) : style}
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        fit ? "overflow-hidden text-ellipsis whitespace-nowrap" : "",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
});
Input.displayName = "Input";

export { Input }
