// Family: claims.json (blueprint 9.2 Span, Claim, DocumentEdge). Spans first (every other family references
// them), then claims, then the document-graph edges, whose four columns are all key columns.
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
  return { rows: { span: spans, claim: claims, document_edge: edges } };
}
