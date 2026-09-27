import { useEffect } from "react";

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

/** Collect the Enter-order fields for a scope (dialog or [data-enter-scope]). */
function fieldsIn(scope: Element): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>("input, select, button")].filter((f) => {
    if (f.hasAttribute("disabled")) return false;
    if (f.tabIndex < 0) return false;
    if (!isVisible(f)) return false;
    // The dialog ✕ stays Esc-only — Enter must never land on it.
    if (f.getAttribute("data-slot") === "dialog-close") return false;
    // Action/icon cells opt out via wrapper (e.g. purchase row Delete).
    if (f.closest("[data-enter-skip]")) return false;
    // Fields that own Enter are never targets either (scan/search bars,
    // picker boxes, submit shortcuts).
    if (f.getAttribute("data-enter") === "custom" || f.getAttribute("data-enter") === "submit") return false;
    // Search/scan bars are actions, not form boxes — never land on them.
    if (f.tagName === "INPUT") {
      const ph = ((f as HTMLInputElement).placeholder ?? "").toLowerCase();
      const ar = (f.getAttribute("aria-label") ?? "").toLowerCase();
      if (
        ph.includes("search") || ph.includes("scan") || ph.includes("barcode") ||
        ar.includes("search") || ar.includes("scan") || ar.includes("barcode")
      )
        return false;
    }
    if (f.tagName === "BUTTON") {
      // Native SELECTs participate fully (Enter opens the dropdown, and we
      // refocus them in order). Custom select triggers / comboboxes own
      // Enter for option picking — they are never plain next-field boxes.
      // Primary actions are targets; icon-only and dismiss buttons are not.
      if (f.getAttribute("data-slot") === "select-trigger" || f.getAttribute("role") === "combobox") return false;
      const cls = (f as HTMLElement).className ?? "";
      if (/(^|\s)(h-8\s+w-8|w-8\s+h-8|h-7\s+w-7)(\s|$)/.test(cls)) return false;
      const text = (f.textContent ?? "").replace(/[\s×+]+$/u, "").trim();
      if (text.length === 0) return false;
      // Skip dismiss actions — Enter on the last box lands on the primary
      // action (Save/Add), never on Cancel/Skip/Back/Close.
      if (/^(cancel|skip|back|close|change|stop)$/i.test(text)) return false;
      return true;
    }
    if ((f as HTMLInputElement).readOnly) return false;
    if (f.tagName === "INPUT") {
      const type = (f as HTMLInputElement).type;
      if (type === "hidden" || type === "submit" || type === "button" || type === "file" || type === "checkbox" || type === "radio") return false;
    }
    return true;
  });
}

/**
 * Move focus from `from` to the next field in its scope. Returns true if moved.
 * Used by custom inputs (Money, MM/YY) when they have no explicit onEnter.
 */
export function focusNextField(from: HTMLElement): boolean {
  const scope =
    from.closest("[data-enter-scope]") ??
    from.closest("[role='dialog']") ??
    // Page-level field groups (Purchases form, inventory dialogs live in portals).
    from.closest("main") ??
    document.body;
  const fields = fieldsIn(scope);
  const next = fields[fields.indexOf(from) + 1];
  if (!next) return false;
  next.focus();
  if (next.tagName === "INPUT") {
    requestAnimationFrame(() => {
      const n = next as HTMLInputElement;
      if (n.type === "text" || n.type === "number") n.select?.();
    });
  }
  return true;
}

/**
 * Global Enter-to-next-field: in ANY dialog — and any region marked
 * data-enter-scope — Enter on a plain input behaves like Tab and moves to
 * the next visible, enabled box (selecting its text for quick overwrite).
 * Custom-wired fields keep their own Enter behavior: table rows, pickers,
 * scanners, search boxes (data-enter="custom"), submit shortcuts
 * (data-enter="submit"), textareas, native forms, and focused buttons.
 */
export function useEnterToNextField() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.defaultPrevented) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName !== "INPUT") return;
      const type = (el as HTMLInputElement).type;
      if (
        type === "hidden" ||
        type === "submit" ||
        type === "button" ||
        type === "file" ||
        type === "checkbox" ||
        type === "radio"
      )
        return;
      // Rows, dropdowns, pickers, command palette, native forms, search /
      // scan boxes, and custom-wired fields opt out (they own Enter).
      const input = el as HTMLInputElement;
      const placeholder = (input.placeholder ?? "").toLowerCase();
      const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
      const isSearchLike =
        placeholder.includes("search") ||
        placeholder.includes("scan") ||
        placeholder.includes("barcode") ||
        aria.includes("search") ||
        aria.includes("scan") ||
        aria.includes("barcode");
      if (
        el.closest("[data-bill-row]") ||
        el.closest("[role='listbox']") ||
        el.closest("[role='menu']") ||
        el.closest("[data-slot='command']") ||
        el.closest("[data-enter-skip]") ||
        el.closest("form") ||
        isSearchLike ||
        el.getAttribute("data-enter") === "custom" ||
        el.getAttribute("data-enter") === "submit"
      )
        return;
      if (!el.closest("[data-enter-scope], [role='dialog'], main")) return;
      if (focusNextField(el)) {
        e.preventDefault();
      }
    };
    // Bubble (not capture): React custom Enter handlers run first and win
    // via preventDefault (pickers, scanners, row chains). We only handle
    // plain inputs nobody claimed.
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
