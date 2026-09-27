import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "14 strips + 10 tabs" instead of 14.666… — tab counts become words.
 * totalTabs is the raw DB quantity (tabs); unitsPerPack is tabs per strip.
 */
export function formatPackQty(totalTabs: number, unitsPerPack?: number | null): string {
  const upp = Math.max(1, Math.round(unitsPerPack ?? 1) || 1);
  const total = Math.max(0, Math.round(totalTabs ?? 0));
  const strips = Math.floor(total / upp);
  const loose = total % upp;
  if (upp <= 1) {
    return `${total} tab${total === 1 ? "" : "s"}`;
  }
  if (loose === 0) {
    return `${strips} strip${strips === 1 ? "" : "s"}`;
  }
  if (strips === 0) {
    return `${loose} loose tab${loose === 1 ? "" : "s"}`;
  }
  return `${strips} strip${strips === 1 ? "" : "s"} + ${loose} tab${loose === 1 ? "" : "s"}`;
}

/** Fractional pack qty (billing) → words, e.g. 14.667 packs @15 → "14 strips + 10 tabs". */
export function formatPackFraction(packs: number, unitsPerPack?: number | null): string {
  const upp = Math.max(1, Math.round(unitsPerPack ?? 1) || 1);
  return formatPackQty(Math.round((packs ?? 0) * upp), upp);
}

/** Expiry "2027-10-31" (or any parseable date) → "10/27" (MM/YY). */
export function formatExpiryMY(raw?: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}
