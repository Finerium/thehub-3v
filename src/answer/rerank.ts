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
