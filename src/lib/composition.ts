/**
 * Composition salt tokens — client mirror of the server's
 * `normalizeComposition()` (apps/server/src/services/productIntelligence.ts).
 *
 * The server copy is authoritative for alternative matching; this mirror only
 * renders token chips instantly while browsing the medicine database, so the
 * UI doesn't need a round-trip per row. Keep both implementations in sync.
 */

const STOPWORDS = new Set([
  "tab", "tabs", "tablet", "tablets", "cap", "caps", "capsule", "capsules",
  "pill", "pills", "mg", "mcg", "ug", "g", "gm", "kg", "ml", "l", "iu",
  "dose", "doses", "syrup", "susp", "suspension", "solution", "soln",
  "injection", "inj", "granules", "granule", "packet", "sachet",
  "sr", "xr", "cr", "od", "bd", "tds", "for", "the", "and", "of",
]);

const SEPARATOR_RE = /[+,&\/]/;

const STRENGTH_RE = /\d+(?:[.,]\d+)?\s*(?:mcg|mg|ug|µg|ml|iu|g|l|%)?(?![a-z0-9])/gi;

function fold(input: string): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Sorted, unique salt tokens: "Paracetamol 500mg + Caffeine 65mg" → ["caffeine","paracetamol"]. */
export function compositionTokens(input: string | null | undefined): string[] {
  const folded = fold(input ?? "");
  if (!folded) return [];
  const stripped = folded.replace(STRENGTH_RE, " ");
  const tokens = new Set<string>();
  for (const part of stripped.split(SEPARATOR_RE)) {
    for (const word of part.trim().split(/\s+/)) {
      if (!word || STOPWORDS.has(word)) continue;
      tokens.add(word);
    }
  }
  return [...tokens].sort();
}
