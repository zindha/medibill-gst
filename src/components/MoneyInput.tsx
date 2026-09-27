import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { focusNextField } from "@/hooks/useEnterToNextField";
import { useFitText } from "@/hooks/useFitText";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onCommit: (value: number) => void;
  onEnter?: () => void;
  ariaLabel: string;
  title?: string;
  dataCell?: string;
  fit?: boolean;
  className?: string;
}

/**
 * Money box: always displays 2 decimals (0.00), edits as free text while
 * focused, commits a rounded number on blur / Enter. Avoids the native
 * number input, which renders 0 instead of 0.00.
 */
export function MoneyInput({ value, onCommit, onEnter, ariaLabel, title, dataCell, fit, className }: Props) {
  const [text, setText] = useState(value.toFixed(2));
  const [focused, setFocused] = useState(false);
  const lastValue = useRef(value);
  const displayValue = focused ? text : value.toFixed(2);
  const fitData = useFitText<HTMLInputElement>(displayValue, { maxPx: 12, minPx: 10.5, disabled: !fit || focused });
  const displayTitle = title ? (text?.trim() ? `${title} — ${text}` : title) : undefined;

  // Push store updates while idle (picks, batch changes, other cells).
  useEffect(() => {
    if (!focused && value !== lastValue.current) {
      lastValue.current = value;
      setText(value.toFixed(2));
    }
  }, [value, focused]);

  const commit = () => {
    const n = Number(text);
    const rounded = Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : lastValue.current;
    lastValue.current = rounded;
    setText(rounded.toFixed(2));
    onCommit(rounded);
  };

  return (
    <Input
      ref={fitData?.ref as any}
      type="text"
      inputMode="decimal"
      value={displayValue}
      data-cell={dataCell}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => {
        setFocused(true);
        setText(String(lastValue.current));
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          if (onEnter) onEnter();
          else focusNextField(e.currentTarget);
        }
      }}
      className={cn("h-8 px-1.5 text-xs text-right tabular-nums", className)}
      style={fitData && !focused ? (fitData.style as React.CSSProperties) : undefined}
      aria-label={ariaLabel}
      title={displayTitle}
    />
  );
}
