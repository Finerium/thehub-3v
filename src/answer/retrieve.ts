// Retrieval (ARCHITECTURE 7 step 6; blueprint 8.4 "approved current revisions only, lexical authoritative for
// tags, vector for ranking, deterministic rerank in code"; AC-ANS-02, AC-ANS-14, AC-NFR-06). Candidates are the
// chunks of the scope's current revisions whose approval status is in the served set (one constant, shared with
// gate C4); the lexical stage is text_tsv @@ plainto_tsquery('simple', ...) over the question's content terms plus
// an exact tag match that ranks first; the vector stage orders by cosine to the query vector. One slot of k = 12 is
// reserved for the best chunk of every document class present, the rest of k is filled in rerank order, and
// rerank.ts fixes the order of the whole set. include_superseded is honoured only when the caller passes it (the
// labelled history toggle) and the caller traces it; a superseded citation keeps `superseded: true` so the chip
// can say so.
// Each retrieved chunk cites the first span of the span table it contains (page-exact, hash-exact) or, when it
// contains none, itself; the text behind the cited hash travels with it so the gate can recompute it.
import type { Citation } from "@/contracts/generated/evidence_packet";
import type { Db } from "@/db/client";
import * as q from "@/db/queries/retrieval";
import { SERVED_APPROVAL_STATUSES } from "@/gates/g2";
import { contentTerms, questionTags } from "./scope";
import { lexicalOf, reserveByClass } from "./rerank";
import { RETRIEVAL_K, type RetrieveOptions, type Retrieval, type RetrievedChunk, type Scope } from "./types";

export { SERVED_APPROVAL_STATUSES, RETRIEVAL_K };

/** The 9.8 Citation of a span or a chunk, with the rule ids open against its document. */
export function citationOf(
  source: {
    docNo: string | null;
    documentId: string;
    revision: string;
    approvalStatus: Citation["approval_status"];
    approvalStatusText: string;
    isCurrent: boolean;
    page: number;
    spanId: string;
    quoteHash: string;
  },
  ruleIds: readonly string[],
): Citation {
  return {
    doc_no: source.docNo ?? source.documentId,
    document_id: source.documentId,
    revision: source.revision,
    approval_status: source.approvalStatus,
    approval_status_text: source.approvalStatusText,
    page: source.page,
    span_id: source.spanId,
    quote_hash: source.quoteHash,
    integrity_findings: [...ruleIds],
    superseded: !source.isCurrent,
  };
}

/** The plainto_tsquery text of a question: its content terms that are not tags (tags match exactly, separately). */
export function termsOf(question: string, tags: readonly string[]): string {
  const tagTokens = new Set(tags.map((t) => t.toLowerCase()));
  return contentTerms(question)
    .filter((t) => !tagTokens.has(t))
    .join(" ");
}

export async function retrieve(
  db: Db,
  scope: Scope,
  question: string,
  queryVector: readonly number[],
  opts: RetrieveOptions,
): Promise<Retrieval> {
  const k = opts.k ?? RETRIEVAL_K;
  let revisionIds = scope.revision_ids;
  if (opts.include_superseded) {
    const all = await q.revisionsOf(db, scope.document_ids, opts.visible_version_ids, true);
    revisionIds = [...new Set([...scope.revision_ids, ...all.map((r) => r.id)])].sort();
  }
  // The tags the question wrote that are in scope (equipment and instrument), the authoritative lexical hits.
  const inQuestion = new Set(questionTags(question));
  const tags = [...scope.tags, ...scope.instrument_tags].filter((t) => inQuestion.has(t));

  // The pool the query returns is the top k plus the best chunk of each document class present; reserveByClass keeps
  // one slot per class and fills the rest of k in rerank order, so a lesson-heavy asset never crowds the sheet, the
  // datasheet, the drawing or the plot plan out of the served set. The rerank key and the order are unchanged.
  const candidates = reserveByClass(
    await q.candidateChunks(db, {
      revisionIds,
      servedStatuses: SERVED_APPROVAL_STATUSES,
      includeSuperseded: opts.include_superseded,
      visibleVersionIds: opts.visible_version_ids,
      queryVector,
      terms: termsOf(question, tags),
      tags,
      k,
    }),
    k,
  );
  if (candidates.length === 0) return { evidence: [], chunks: [] };

  const [spans, findings] = await Promise.all([
    q.spansOnPages(db, candidates.map((c) => ({ revisionId: c.revisionId, page: c.page }))),
    q.openFindingRuleIds(db, [...new Set(candidates.map((c) => c.documentId))]),
  ]);

  const chunks: RetrievedChunk[] = candidates.map((c) => {
    const ruleIds = findings.get(c.documentId) ?? [];
    // spansOnPages is ordered by page and start ordinal, so the first contained span is the lowest on the page.
    const contained = spans.find((s) => s.revisionId === c.revisionId && s.page === c.page && c.text.includes(s.anchorText));
    const citation = contained
      ? citationOf({ ...c, page: contained.page, spanId: contained.spanId, quoteHash: contained.quoteHash }, ruleIds)
      : citationOf({ ...c, spanId: c.chunkId, quoteHash: c.quoteHash }, ruleIds);
    return {
      chunk_id: c.chunkId,
      unit_kind: c.unitKind,
      text: c.text,
      citation,
      anchor_text: contained ? contained.anchorText : c.text,
      rank: { lexical: lexicalOf(c.lexical), cosine: c.cosine },
    };
  });
  return { evidence: chunks.map((c) => c.citation), chunks };
}
