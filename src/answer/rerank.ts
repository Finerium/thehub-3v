// The deterministic rerank of ARCHITECTURE 7 step 6 (AC-NFR-06): candidates are ordered by (lexical hit, cosine,
// document_revision_id, page, ordinal), a total order over stored data, so identical inputs give an identical set
// in an identical order whatever order the database returned them in. Pure; no I/O.

export type RankKey = { lexical: number; cosine: number; revisionId: string; page: number; ordinal: number };

export function compareRank(a: RankKey, b: RankKey): number {
  if (a.lexical !== b.lexical) return b.lexical - a.lexical;
  if (a.cosine !== b.cosine) return b.cosine - a.cosine;
  if (a.revisionId !== b.revisionId) return a.revisionId < b.revisionId ? -1 : 1;
  if (a.page !== b.page) return a.page - b.page;
  return a.ordinal - b.ordinal;
}

/** A new array in rerank order; the input is not mutated. */
export function rerank<T extends RankKey>(candidates: readonly T[]): T[] {
  return [...candidates].sort(compareRank);
}

/** The lexical score as the closed set the trace records: 2 exact tag, 1 tsquery hit, 0 none. */
export function lexicalOf(value: number): 0 | 1 | 2 {
  return value >= 2 ? 2 : value >= 1 ? 1 : 0;
}

/**
 * The served set of ARCHITECTURE 7 step 6: one slot reserved for the best chunk of every document class present in
 * the pool, then the remainder of k filled in rerank order. Without the floor one asset's seven lessons supply about
 * three quarters of its chunks, so the cause-and-effect sheet, the datasheet, the general-arrangement drawing and the
 * plot plan are crowded out of k = 12. The rerank key is unchanged and the result comes back in rerank order, so the
 * set and its order stay deterministic over identical inputs (AC-NFR-06).
 */
export function reserveByClass<T extends RankKey & { documentClass: string }>(candidates: readonly T[], k: number): T[] {
  const ordered = rerank(candidates);
  if (ordered.length <= k) return ordered;
  const best = new Map<string, T>();
  for (const c of ordered) if (!best.has(c.documentClass)) best.set(c.documentClass, c);
  // best.values() is already in rerank order, so a pool with more classes than slots keeps the best-ranked classes.
  const picked = new Set<T>([...best.values()].slice(0, k));
  for (const c of ordered) {
    if (picked.size >= k) break;
    picked.add(c);
  }
  return ordered.filter((c) => picked.has(c));
}
