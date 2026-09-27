import * as React from "react";
import { cn } from "@/lib/utils";
import { useFitText } from "@/hooks/useFitText";

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  value: string;
  title?: string;
  maxPx?: number;
  minPx?: number;
  className?: string;
}

/**
 * Render `value` in a non-wrapping span that auto-shrinks its font-size when
 * the parent cell is too narrow. Floored at 10.5px so money/batch stays
 * legible; at the floor it falls back to ellipsis + tooltip.
 */
export function FitText({ value, title, maxPx = 12, minPx = 10.5, className, ...rest }: Props) {
  const hook = useFitText<HTMLSpanElement>(value, { maxPx, minPx });
  return (
    <span
      ref={hook.ref}
      title={title ?? value}
      className={cn("block max-w-full overflow-hidden text-ellipsis whitespace-nowrap tabular-nums", className)}
      style={hook.style}
      {...rest}
    >
      {value}
    </span>
  );
}
