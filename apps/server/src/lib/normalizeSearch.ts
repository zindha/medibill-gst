/**
 * Fold search text so library-style queries match cleanly:
 * trim, collapse runs of whitespace, strip accents/diacritics, and lowercase.
 */
export function foldText(input: string): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Build a SQLite LIKE pattern from a normalized query. */
export function searchPattern(search: string): string {
  return `%${foldText(search)}%`;
}

/**
 * Queries this short (after folding) are too vague to safely run loose token /
 * subsequence matching (a single letter would match too broadly), so they only
 * rely on substring LIKE.
 */
export const MIN_SUBSEQUENCE_LEN = 3;