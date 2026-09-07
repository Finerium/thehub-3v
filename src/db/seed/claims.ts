// Family: claims.json (blueprint 9.2 Span, Claim, DocumentEdge). Spans first (every other family references
// them), then claims, then the document-graph edges, whose four columns are all key columns.
import { and, inArray, notInArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { claim, documentEdge, span } from "@/db/schema";
import type { Bundle } from "@/gates/g1";
import { upsert, type FamilyResult } from "./upsert";

export async function seedClaims(tx: Tx, b: Bundle): Promise<FamilyResult> {
  const spans = await upsert(
    tx,
    span,
    b.claims.spans.map((s) => ({
      id: s.id,
      documentRevisionId: s.document_revision_id,
      page: s.page,
      anchorText: s.anchor_text,
      quoteHash: s.quote_hash,
      startOrdinal: s.start_ordinal,
      endOrdinal: s.end_ordinal,
    })),
    [span.id],
  );
  const claims = await upsert(
    tx,
    claim,
    b.claims.claims.map((c) => ({
      id: c.id,
      spanId: c.span_id,
      entityBinding: c.entity_binding,
      claimKind: c.claim_kind,
      valueText: c.value_text,
      extractedBy: c.extracted_by,
    })),
    [claim.id],
  );
  const edges = await upsert(
    tx,
    documentEdge,
    b.claims.edges.map((e) => ({
      fromDocumentId: e.from_document_id,
      toDocumentId: e.to_document_id,
      edgeKind: e.edge_kind,
      sourceSpanId: e.source_span_id,
    })),
    [documentEdge.fromDocumentId, documentEdge.toDocumentId, documentEdge.edgeKind, documentEdge.sourceSpanId],
  );
  // A claim id is positional in the bundle, so a corpus version that adds spans renumbers every claim that sorts
  // after them. Upserting alone would leave the old numbering beside the new one and the lane would cite rows this
  // corpus version does not carry. The reconciliation is bounded twice over: only the revisions this bundle holds,
  // and only ids this bundle does not carry. That is what makes a re-seed truthful rather than additive.
  const revisionIds = [...new Set(b.claims.spans.map((s) => s.document_revision_id))];
  const spanIds = b.claims.spans.map((s) => s.id);
  const claimIds = b.claims.claims.map((c) => c.id);
  let staleClaims = 0;
  let staleSpans = 0;
  if (revisionIds.length > 0 && spanIds.length > 0 && claimIds.length > 0) {
    const spansOfThisBundle = tx.select({ id: span.id }).from(span).where(inArray(span.documentRevisionId, revisionIds));
    staleClaims = (
      await tx
        .delete(claim)
        .where(and(inArray(claim.spanId, spansOfThisBundle), notInArray(claim.id, claimIds)))
        .returning({ id: claim.id })
    ).length;
    staleSpans = (
      await tx
        .delete(span)
        .where(and(inArray(span.documentRevisionId, revisionIds), notInArray(span.id, spanIds)))
        .returning({ id: span.id })
    ).length;
  }
  return {
    rows: { span: spans, claim: claims, document_edge: edges },
    notes:
      staleClaims + staleSpans > 0
        ? [`claims: ${staleClaims} claim and ${staleSpans} span rows of an earlier bundle removed from this version's revisions`]
        : [],
  };
}
