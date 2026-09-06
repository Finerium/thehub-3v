// The two document reads behind GET /api/documents/:id and GET /api/documents/:id/pages/:n (blueprint 9.9, INV-7,
// AC-CTX-09): the document with its revisions (the current one unless the superseded history is asked for), the
// equipment bound to it, the open integrity finding ids and the page anchors the viewer deep-links to
// (#page=n&span=<span_id>); and one page derivative at a time. Every row leaves through the generated Zod of 9.2
// (ARCHITECTURE 1.4). No query here reads derivative bytes except the one page asked for, and nothing lists
// derivatives across documents: no bulk route exists.
import { and, asc, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { Document, DocumentRevision } from "@/contracts/generated/document";
import { db } from "@/db/client";
import { documentRevision, documentTable, equipment, integrityFinding, pageDerivative, span } from "@/db/schema";

export const PageAnchor = z.object({ span_id: z.string(), page: z.number().int() }).strict();

// The 9.9 response of GET /api/documents/:id; integrity_findings are the ids of the findings open against the
// document, page_anchors the spans of the returned revisions with their page (no anchor text: citation-length
// corpus text travels only inside an evidence packet).
export const DocumentDetail = z
  .object({
    document: Document,
    revisions: z.array(DocumentRevision),
    assets: z.array(z.string()),
    integrity_findings: z.array(z.string()),
    page_anchors: z.array(PageAnchor),
  })
  .strict();
export type DocumentDetail = z.infer<typeof DocumentDetail>;

// 9.9: image/webp or image/png, one width (ADR-010; the 1200 px decision of the run notes), metadata-free bytes.
export const PageImage = z.object({ format: z.enum(["webp", "png"]), bytes: z.instanceof(Buffer) });
export type PageImage = z.infer<typeof PageImage>;

function toDocument(row: typeof documentTable.$inferSelect): Document {
  return Document.parse({
    id: row.id,
    doc_no: row.docNo,
    class: row.class,
    subject_tag: row.subjectTag,
    sha256: row.sha256,
    source_path: row.sourcePath,
    page_count: row.pageCount,
    file_marker: row.fileMarker,
  });
}

function toRevision(row: typeof documentRevision.$inferSelect): DocumentRevision {
  return DocumentRevision.parse({
    id: row.id,
    document_id: row.documentId,
    revision: row.revision,
    approval_status: row.approvalStatus,
    approval_status_text: row.approvalStatusText,
    revision_date: row.revisionDate,
    prepared_by_alias: row.preparedByAlias,
    reviewed_by_alias: row.reviewedByAlias,
    approved_by_alias: row.approvedByAlias,
    date_of_sharing: row.dateOfSharing,
    is_current: row.isCurrent,
    corpus_version_id: row.corpusVersionId,
  });
}

// Current first, then the higher revision label (numeric aware, as src/db/versions.ts orders), then the id.
function byCurrency(a: DocumentRevision, b: DocumentRevision): number {
  if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
  const byLabel = b.revision.localeCompare(a.revision, "en", { numeric: true, sensitivity: "base" });
  return byLabel !== 0 ? byLabel : a.id.localeCompare(b.id);
}

export async function getDocument(id: string, includeSuperseded: boolean): Promise<DocumentDetail | null> {
  const [doc] = await db.select().from(documentTable).where(eq(documentTable.id, id)).limit(1);
  if (!doc) return null;

  const revisionRows = await db
    .select()
    .from(documentRevision)
    .where(
      includeSuperseded
        ? eq(documentRevision.documentId, id)
        : and(eq(documentRevision.documentId, id), eq(documentRevision.isCurrent, true)),
    );
  const revisions = revisionRows.map(toRevision).sort(byCurrency);

  // Equipment bound to the document: the P&ID by id, the typed classes by doc_no (9.3 Equipment), the subject tag.
  const bindings: SQL[] = [eq(equipment.pidDocumentId, id)];
  if (doc.docNo !== null) {
    bindings.push(
      eq(equipment.datasheetDocNo, doc.docNo),
      eq(equipment.gaDrawingDocNo, doc.docNo),
      eq(equipment.plotPlanDocNo, doc.docNo),
      eq(equipment.ceDocNo, doc.docNo),
    );
  }
  if (doc.subjectTag !== null) bindings.push(eq(equipment.tag, doc.subjectTag));
  const assets = await db.select({ tag: equipment.tag }).from(equipment).where(or(...bindings)).orderBy(asc(equipment.tag));

  const findings = await db
    .select({ id: integrityFinding.id })
    .from(integrityFinding)
    .where(and(eq(integrityFinding.documentId, id), eq(integrityFinding.state, "open")))
    .orderBy(asc(integrityFinding.id));

  const revisionIds = revisions.map((r) => r.id);
  const anchors =
    revisionIds.length === 0
      ? []
      : await db
          .select({ span_id: span.id, page: span.page })
          .from(span)
          .where(inArray(span.documentRevisionId, revisionIds))
          .orderBy(asc(span.page), asc(span.id));

  return DocumentDetail.parse({
    document: toDocument(doc),
    revisions,
    assets: assets.map((a) => a.tag),
    integrity_findings: findings.map((f) => f.id),
    page_anchors: anchors,
  });
}

// One page, the widest derivative stored for it (one width exists today; a second one would win here without a
// typed number). Null when the document or the page has no derivative.
export async function getPageDerivative(documentId: string, page: number): Promise<PageImage | null> {
  const [row] = await db
    .select({ format: pageDerivative.format, bytes: pageDerivative.bytes })
    .from(pageDerivative)
    .where(and(eq(pageDerivative.documentId, documentId), eq(pageDerivative.page, page)))
    .orderBy(desc(pageDerivative.width))
    .limit(1);
  return row ? PageImage.parse(row) : null;
}
