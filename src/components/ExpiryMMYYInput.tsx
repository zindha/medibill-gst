import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatExpiryMY } from "@/lib/utils";
import { focusNextField } from "@/hooks/useEnterToNextField";

interface Props {
  /** Full ISO date (YYYY-MM-DD) or "". */
  value?: string;
  disabled?: boolean;
  dataCell?: string;
  onCommit: (fullDate: string) => void;
  onEnter?: () => void;
  ariaLabel: string;
  className?: string;
  title?: string;
}

/**
 * Expiry box that always shows MM/YY. Type digits — the slash is automatic,
 * month clamps to 01–12, and a complete MM/YY commits end-of-month ISO.
 */
export function ExpiryMMYYInput({ value, disabled, dataCell, onCommit, onEnter, ariaLabel, className, title }: Props) {
  const [text, setText] = useState(formatExpiryMY(value));
  const [focused, setFocused] = useState(false);

  // Push store updates while idle (batch picks, popup fills).
  useEffect(() => {
    if (!focused) setText(formatExpiryMY(value));
  }, [value, focused]);

  const commit = (mask: string) => {
    const m = mask.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    if (!m) return;
    const lastDay = new Date(2000 + Number(m[2]), Number(m[1]), 0).getDate();
    onCommit(`20${m[2]}-${m[1]}-${String(lastDay).padStart(2, "0")}`);
  };

  return (
    <Input
      value={text}
      data-cell={dataCell}
      disabled={disabled}
      placeholder="MM/YY"
      inputMode="numeric"
      maxLength={5}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
        let masked = digits;
        if (digits.length >= 3) masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
        if (masked.length >= 2) {
          const mm = Math.min(12, Math.max(1, Number(masked.slice(0, 2)) || 1));
          masked = `${String(mm).padStart(2, "0")}${masked.slice(2)}`;
        }
        setText(masked);
        if (/^(0[1-9]|1[0-2])\/\d{2}$/.test(masked)) commit(masked);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(formatExpiryMY(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const m = text.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
          if (m) commit(text);
          if (onEnter) onEnter();
          else focusNextField(e.currentTarget);
        }
      }}
      className={className}
      aria-label={ariaLabel}
      title={title}
    />
  );
}
