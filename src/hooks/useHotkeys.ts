import { useEffect, useState } from "react";

export interface HotkeyBinding {
  /** e.g. "ctrl+s", "?", "g b", "escape" — single keys, ctrl/meta combos, or two-key sequences starting with g */
  key: string;
  /** What the cheatsheet shows */
  label: string;
  handler: (e: KeyboardEvent) => void;
  /** Skip when focus is inside inputs/textareas/selects (default true for printable keys) */
  allowInInputs?: boolean;
}

const bindings: HotkeyBinding[] = [];
const listeners = new Set<() => void>();
let installed = false;
let pendingG = false;
let gTimer: ReturnType<typeof setTimeout> | null = null;

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return el.isContentEditable;
}

function normalize(e: KeyboardEvent): string {
  const k = e.key.toLowerCase();
  if (k === " ") return "space";
  if (k === "escape") return "esc";
  return k;
}

function onKeyDown(e: KeyboardEvent) {
  // Two-key "g then x" navigation sequences.
  if (pendingG) {
    const k = normalize(e);
    const seq = `g ${k}`;
    const hit = bindings.find((b) => b.key === seq);
    pendingG = false;
    if (gTimer) clearTimeout(gTimer);
    if (hit) {
      if (!hit.allowInInputs && isEditable(e.target)) return;
      e.preventDefault();
      hit.handler(e);
      return;
    }
    // Not a sequence — fall through to normal handling.
  }
  if (normalize(e) === "g" && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
    pendingG = true;
    gTimer = setTimeout(() => { pendingG = false; }, 800);
    return;
  }
  for (const b of bindings) {
    if (b.key.startsWith("g ")) continue;
    const parts = b.key.split("+");
    const wantCtrl = parts.includes("ctrl");
    const wantMeta = parts.includes("meta");
    const wantShift = parts.includes("shift");
    const wantAlt = parts.includes("alt");
    const main = parts[parts.length - 1];
    if (main === "ctrl" || main === "meta" || main === "shift" || main === "alt") continue;
    if (!!e.ctrlKey !== wantCtrl) continue;
    // Allow Cmd on macOS wherever Ctrl is bound.
    if (wantCtrl && e.metaKey && !e.ctrlKey) {
      // treat as match — fall through
    } else if (!!e.metaKey !== wantMeta && !(wantCtrl && e.metaKey)) {
      continue;
    }
    // Shift only matters when explicitly bound (e.g. "shift+?"). For plain
    // single keys, Shift just produces the character ("?" needs Shift) or
    // changes letter case (already lowercased) — allow it.
    if (wantShift && !e.shiftKey) continue;
    if (!!e.altKey !== wantAlt) continue;
    if (normalize(e) !== main && !(wantCtrl && e.key.toLowerCase() === main)) continue;
    if (!b.allowInInputs && isEditable(e.target) && main.length === 1 && !wantCtrl && !wantMeta) continue;
    e.preventDefault();
    b.handler(e);
    return;
  }
}

function install() {
  if (installed) return;
  installed = true;
  window.addEventListener("keydown", onKeyDown);
}

function notify() {
  listeners.forEach((l) => l());
}

/** Register app-wide hotkeys. Bindings are global; register once per surface. */
export function useHotkeys(list: HotkeyBinding[]) {
  useEffect(() => {
    install();
    for (const b of list) {
      if (!bindings.some((x) => x.key === b.key && x.label === b.label)) {
        bindings.push(b);
      }
    }
    notify();
    return () => {
      for (const b of list) {
        const i = bindings.findIndex((x) => x.key === b.key && x.label === b.label);
        if (i >= 0) bindings.splice(i, 1);
      }
      notify();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** All currently registered hotkeys — feeds the cheatsheet. */
export function useAllHotkeys(): HotkeyBinding[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [...bindings];
}

/** Human-readable key hint, e.g. "Ctrl+S", "G then B", "?". */
export function formatKey(key: string): string {
  if (key.startsWith("g ")) return `G then ${key.slice(2).toUpperCase()}`;
  return key
    .split("+")
    .map((p) => (p === "ctrl" ? "Ctrl" : p === "meta" ? "⌘" : p === "shift" ? "Shift" : p === "alt" ? "Alt" : p === " " ? "Space" : p.length === 1 ? p.toUpperCase() : p))
    .join("+");
}
