// The one evidence set of the answer lane (blueprint 9.8 Citation, Block and TypedFact, 9.16 AG-2 and AG-4;
// ARCHITECTURE section 7 steps 6, 8, 9, 10 and 11; AC-ANS-03). A packet cites two kinds of span: the chunks
// retrieval returned, and the span every typed fact and every block item carries as its own source (an interlock
// row's setpoint, a start permissive, a datasheet parameter, a proof test, a BOM part, a lesson). Both are
// provenance, so both belong to the set the composer writes from, the verifier is given the texts of, and C1
// resolves against; a set holding only the retrieved chunks makes a correct typed-fact citation an unresolved id.
// Each item is a Citation with the text its quote_hash was stored over, so C2 recomputes the hash from what the
// composer and the verifier saw (AC-ANS-05). For a retrieved chunk that is RetrievedChunk.anchor_text, which is the
// chunk text when the chunk cites itself and the contained span's anchor text when it cites that span (retrieve.ts
// makes the citation page-exact and hash-exact on the span, so the chunk text is not the text behind its hash);
// for a typed fact or a block item it is the span's anchor text, read through the retrieval query layer.
// Order is deterministic: the retrieved chunks first, in rerank order (line 1 of the stream is that set alone,
// 9.8), then the typed facts in their order and the block items in block order, deduplicated by span_id with the
// first mention winning. A span id the span table does not carry is left out: provenance or nothing.
import { Citation, type Block, type TypedFact } from "@/contracts/generated/evidence_packet";
import type { Db } from "@/db/client";
import { spansByIds } from "@/db/queries/retrieval";
import type { EvidenceSpan } from "@/gates/g2";
import type { RetrievedChunk } from "./types";

/** A Citation with the text behind its quote_hash; the shape the gate already calls EvidenceSpan. */
export type EvidenceItem = EvidenceSpan;

export type EvidenceInput = {
  /** The retrieved chunks in rerank order; each contributes its citation and the text behind that citation's hash. */
  retrieved: readonly RetrievedChunk[];
  typed_facts: readonly TypedFact[];
  blocks: readonly Block[];
};

/**
 * Every Citation inside a block item, in the item's own key order. Block.items is unknown[] on the wire (9.8) and
 * the citation sits at a different depth per kind: beside the item (a permissive, a lesson), inside its typed fact
 * (an interlock row), inside a nested list (a return-to-service permissive) or inside a ladder layer. One walk
 * covers every kind and keeps covering a kind added later; a strict Citation parse is what identifies one.
 */
export function citationsIn(value: unknown, out: Citation[]): void {
  if (Array.isArray(value)) {
    for (const element of value) citationsIn(element, out);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const parsed = Citation.safeParse(value);
  if (parsed.success) {
    out.push(parsed.data);
    return;
  }
  for (const key of Object.keys(value)) citationsIn((value as Record<string, unknown>)[key], out);
}

/** The set handed to AG-2, AG-4 and G2: the retrieved chunks plus the spans the typed facts and the blocks cite. */
export async function buildEvidenceSet(db: Db, input: EvidenceInput): Promise<EvidenceItem[]> {
  const items: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const chunk of input.retrieved) {
    if (seen.has(chunk.citation.span_id)) continue;
    seen.add(chunk.citation.span_id);
    items.push({ ...chunk.citation, integrity_findings: [...chunk.citation.integrity_findings], text: chunk.anchor_text });
  }

  const cited: Citation[] = input.typed_facts.map((fact) => fact.source);
  for (const block of input.blocks) citationsIn(block.items, cited);
  const missing = cited.filter((citation) => !seen.has(citation.span_id));
  if (missing.length === 0) return items;

  // The anchor text of each span, read once through the retrieval query layer; a citation is already resolved.
  const sources = await spansByIds(db, missing.map((citation) => citation.span_id));
  for (const citation of missing) {
    if (seen.has(citation.span_id)) continue;
    const source = sources.get(citation.span_id);
    if (source === undefined) continue;
    seen.add(citation.span_id);
    items.push({ ...citation, integrity_findings: [...citation.integrity_findings], text: source.anchorText });
  }
  return items;
}
