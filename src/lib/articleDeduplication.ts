/** Normalise titles for fuzzy duplicate detection. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jaccard similarity on word tokens (0–1). */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;

  const wordsA = new Set(na.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection += 1;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

export const TITLE_DUPLICATE_THRESHOLD = 0.82;

export function normalizeArticleUrl(url?: string | null): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    let normalized = parsed.toString().replace(/\/$/, "");
    if (normalized.startsWith("http://")) {
      normalized = `https://${normalized.slice(7)}`;
    }
    return normalized.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}
