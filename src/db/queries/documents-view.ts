// The reads behind the Document viewer (blueprint 6.2 surface 4, 6.3 history toggle, 6.4 PageViewer and
// CitationChip; AC-CTX-09, AC-ANS-14) and the two pieces the asset surface shares with it: the open findings of a
// document and a span resolved by id into the Citation a chip carries. Drizzle only; every row leaves through the
// generated Zod of 9.2 and 9.8 (ARCHITECTURE 1.4). Nothing here reads derivative bytes: the viewer asks whether the
// one page it shows has a render and GET /api/documents/:id/pages/:n serves it, one page at a time (INV-7). A
// superseded revision is returned only when the labelled history toggle asks for it (9.2, AC-ANS-14).
import { and, asc, eq, inArray, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { Document, DocumentClass, DocumentEdge, DocumentRevision } from "@/contracts/generated/document";
import { Citation } from "@/contracts/generated/evidence_packet";
import { db } from "@/db/client";
import { openFindingRuleIds } from "@/db/queries/retrieval";
import {
  documentEdge,
  documentRevision,
  documentTable,
  equipment,
  integrityFinding,
  opl,
  pageDerivative,
  span,
} from "@/db/schema";

/** How a document class prints on a surface; the enum value stays beside it in mono where a register needs it. */
export const DOCUMENT_CLASS_LABEL: Record<DocumentClass, string> = {
  datasheet: "Datasheet",
  ga_drawing: "General-arrangement drawing",
  interlock: "Cause-and-effect sheet",
  plot_plan: "Plot plan",
  opl: "One Point Lesson",
  pid: "P&ID",
  workbook: "Maintenance workbook",
  organiser_note: "Organiser note",
};

// An Integrity Register finding as the surfaces show it (ARCHITECTURE 3.1 integrity_finding; AC-INT-02): severity,
// discipline, the two states, the safety_function mark; never an owner, a due date or a completion metric.
export const Finding = z
  .object({
    id: z.string(),
    rule_id: z.string(),
    rule: z.string().nullable(),
    severity: z.string(),
    discipline: z.string().nullable(),
    document_id: z.string().nullable(),
    span_id: z.string().nullable(),
    state: z.enum(["open", "resolved"]),
    safety_function: z.boolean(),
    routing_recommendation: z.string().nullable(),
    observation_only: z.boolean(),
    unit: z.string().nullable(),
    basis: z.string().nullable(),
    item: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();
export type Finding = z.infer<typeof Finding>;

export type FindingRow = typeof integrityFinding.$inferSelect;

/** How many item fields a summary line carries, and the longest value it prints without truncating one. */
const LOCATOR_FIELDS = 4;
const LOCATOR_VALUE_LENGTH = 40;

/**
 * The short scalar fields of a finding's `item`, as the harness recorded them: which record, which field, which
 * lesson the rule was reading. A long value (the quoted cell, the field text) is left to the Integrity Register,
 * which prints the item in full; nothing here is re-described and nothing is truncated mid-word into a claim.
 */
export function findingLocator(item: Record<string, unknown> | null): string | null {
  if (item === null) return null;
  const parts = Object.entries(item)
    .filter(([, v]) => typeof v === "number" || (typeof v === "string" && v.length > 0 && v.length <= LOCATOR_VALUE_LENGTH))
    .slice(0, LOCATOR_FIELDS)
    .map(([k, v]) => `${k} ${String(v)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function toFinding(row: FindingRow): Finding {
  return Finding.parse({
    id: row.id,
    rule_id: row.ruleId,
    rule: row.rule,
    severity: row.severity,
    discipline: row.discipline,
    document_id: row.documentId,
    span_id: row.spanId,
    state: row.state,
    safety_function: row.safetyFunction,
    routing_recommendation: row.routingRecommendation,
    observation_only: row.observationOnly,
    unit: row.unit,
    basis: row.basis,
    item: row.item,
  });
}

export function toDocument(row: typeof documentTable.$inferSelect): Document {
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

export function toRevision(row: typeof documentRevision.$inferSelect): DocumentRevision {
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

/** The open findings against these documents, rule then id order. */
export async function openFindings(documentIds: readonly string[]): Promise<Finding[]> {
  if (documentIds.length === 0) return [];
  const rows = await db
    .select()
    .from(integrityFinding)
    .where(and(inArray(integrityFinding.documentId, [...documentIds]), eq(integrityFinding.state, "open")))
    .orderBy(asc(integrityFinding.ruleId), asc(integrityFinding.id));
  return rows.map(toFinding);
}

/**
 * Spans by id as the 9.8 Citation a chip carries: the span's page and hash, its revision's label and approval
 * status, the document number, the rule ids open against the document and `superseded` when the revision is not
 * current. One query for the spans, one for the findings; ids that resolve to no span are simply absent.
 */
export async function citationsForSpans(spanIds: readonly string[]): Promise<Map<string, Citation>> {
  const out = new Map<string, Citation>();
  const ids = [...new Set(spanIds)];
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      spanId: span.id,
      page: span.page,
      quoteHash: span.quoteHash,
      revision: documentRevision.revision,
      approvalStatus: documentRevision.approvalStatus,
      approvalStatusText: documentRevision.approvalStatusText,
      isCurrent: documentRevision.isCurrent,
      documentId: documentTable.id,
      docNo: documentTable.docNo,
    })
    .from(span)
    .innerJoin(documentRevision, eq(span.documentRevisionId, documentRevision.id))
    .innerJoin(documentTable, eq(documentRevision.documentId, documentTable.id))
    .where(inArray(span.id, ids));
  const findings = await openFindingRuleIds(db, [...new Set(rows.map((r) => r.documentId))]);
  for (const r of rows) {
    out.set(
      r.spanId,
      Citation.parse({
        doc_no: r.docNo ?? r.documentId,
        document_id: r.documentId,
        revision: r.revision,
        approval_status: r.approvalStatus,
        approval_status_text: r.approvalStatusText,
        page: r.page,
        span_id: r.spanId,
        quote_hash: r.quoteHash,
        integrity_findings: findings.get(r.documentId) ?? [],
        superseded: !r.isCurrent,
      }),
    );
  }
  return out;
}

/** The equipment bound to a document: the P&ID by id, the typed classes by doc_no (9.3 Equipment), the subject tag. */
export async function assetsOfDocument(doc: Pick<Document, "id" | "doc_no" | "subject_tag">): Promise<string[]> {
  const bindings: SQL[] = [eq(equipment.pidDocumentId, doc.id)];
  if (doc.doc_no !== null) {
    bindings.push(
      eq(equipment.datasheetDocNo, doc.doc_no),
      eq(equipment.gaDrawingDocNo, doc.doc_no),
      eq(equipment.plotPlanDocNo, doc.doc_no),
      eq(equipment.ceDocNo, doc.doc_no),
    );
  }
  if (doc.subject_tag !== null) bindings.push(eq(equipment.tag, doc.subject_tag));
  const rows = await db.select({ tag: equipment.tag }).from(equipment).where(or(...bindings)).orderBy(asc(equipment.tag));
  return rows.map((r) => r.tag);
}

const DocumentRef = z
  .object({ id: z.string(), doc_no: z.string().nullable(), class: DocumentClass, subject_tag: z.string().nullable() })
  .strict();

// One graph edge as the viewer lists it: the edge row, the document at the other end and, when the edge's source
// span resolves, the citation that proves the cross-reference (AC-CTX-01: every edge came from a document).
export const EdgeView = z
  .object({
    direction: z.enum(["out", "in"]),
    edge: DocumentEdge,
    other: DocumentRef,
    citation: Citation.nullable(),
  })
  .strict();
export type EdgeView = z.infer<typeof EdgeView>;

// The one span the viewer landed on, with its own text (citation length) so the strip can name the words to find
// on the page; `superseded` says the span sits on a revision the history toggle would have to admit.
const SpanView = z
  .object({
    id: z.string(),
    page: z.number().int(),
    anchor_text: z.string(),
    revision: z.string(),
    superseded: z.boolean(),
  })
  .strict();

const LessonView = z
  .object({
    opl_id: z.string(),
    title: z.string(),
    discipline: z.string(),
    classification: z.string(),
    machine_drafted: z.boolean(),
    approver_alias: z.string().nullable(),
    date_of_sharing: z.string(),
  })
  .strict();

export const DocumentView = z
  .object({
    document: Document,
    current: DocumentRevision.nullable(),
    /** Only when the history toggle asked; otherwise empty, whatever the lineage holds. */
    superseded: z.array(DocumentRevision),
    /** How many superseded revisions the visible lineage holds, so the toggle can say what it would show. */
    history_available: z.number().int(),
    assets: z.array(z.string()),
    edges: z.array(EdgeView),
    integrity_findings: z.array(Finding),
    lesson: LessonView.nullable(),
    /** The page shown: the span's page when a span resolved, else the requested page clamped to the count. */
    page: z.number().int(),
    /** Whether a derivative exists for that page (the P&ID images, the workbook and the note carry none). */
    page_available: z.boolean(),
    span: SpanView.nullable(),
    /** The requested span id when it did not resolve on this document. */
    span_missing: z.string().nullable(),
  })
  .strict();
export type DocumentView = z.infer<typeof DocumentView>;

export type DocumentViewOptions = {
  visibleVersionIds: readonly string[];
  includeSuperseded: boolean;
  page: number;
  spanId: string | null;
};

// Current first, then the higher label (numeric aware, as src/db/versions.ts orders), then the id.
function byCurrency(a: DocumentRevision, b: DocumentRevision): number {
  if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
  const byLabel = b.revision.localeCompare(a.revision, "en", { numeric: true, sensitivity: "base" });
  return byLabel !== 0 ? byLabel : a.id.localeCompare(b.id);
}

function toEdge(row: typeof documentEdge.$inferSelect): DocumentEdge {
  return DocumentEdge.parse({
    from_document_id: row.fromDocumentId,
    to_document_id: row.toDocumentId,
    edge_kind: row.edgeKind,
    source_span_id: row.sourceSpanId,
  });
}

export async function getDocumentView(id: string, o: DocumentViewOptions): Promise<DocumentView | null> {
  const [docRow] = await db.select().from(documentTable).where(eq(documentTable.id, id)).limit(1);
  if (!docRow) return null;
  const doc = toDocument(docRow);

  const revisionRows =
    o.visibleVersionIds.length === 0
      ? []
      : await db
          .select()
          .from(documentRevision)
          .where(and(eq(documentRevision.documentId, id), inArray(documentRevision.corpusVersionId, [...o.visibleVersionIds])));
  const revisions = revisionRows.map(toRevision).sort(byCurrency);
  const current = revisions.find((r) => r.is_current) ?? null;
  const superseded = revisions.filter((r) => !r.is_current);

  // The span, by id, on any revision of this document; its page wins over the requested one.
  let spanView: z.infer<typeof SpanView> | null = null;
  if (o.spanId !== null) {
    const [s] = await db
      .select({
        id: span.id,
        page: span.page,
        anchorText: span.anchorText,
        revision: documentRevision.revision,
        isCurrent: documentRevision.isCurrent,
      })
      .from(span)
      .innerJoin(documentRevision, eq(span.documentRevisionId, documentRevision.id))
      .where(and(eq(span.id, o.spanId), eq(documentRevision.documentId, id)))
      .limit(1);
    if (s) spanView = { id: s.id, page: s.page, anchor_text: s.anchorText, revision: s.revision, superseded: !s.isCurrent };
  }
  const page = spanView ? spanView.page : Math.min(Math.max(1, o.page), Math.max(1, doc.page_count));

  const [out, inn, findings, assets, derivative] = await Promise.all([
    db
      .select({ edge: documentEdge, other: { id: documentTable.id, docNo: documentTable.docNo, class: documentTable.class, subjectTag: documentTable.subjectTag } })
      .from(documentEdge)
      .innerJoin(documentTable, eq(documentEdge.toDocumentId, documentTable.id))
      .where(eq(documentEdge.fromDocumentId, id))
      .orderBy(asc(documentEdge.edgeKind), asc(documentTable.docNo), asc(documentEdge.sourceSpanId)),
    db
      .select({ edge: documentEdge, other: { id: documentTable.id, docNo: documentTable.docNo, class: documentTable.class, subjectTag: documentTable.subjectTag } })
      .from(documentEdge)
      .innerJoin(documentTable, eq(documentEdge.fromDocumentId, documentTable.id))
      .where(eq(documentEdge.toDocumentId, id))
      .orderBy(asc(documentEdge.edgeKind), asc(documentTable.docNo), asc(documentEdge.sourceSpanId)),
    openFindings([id]),
    assetsOfDocument(doc),
    db
      .select({ page: pageDerivative.page })
      .from(pageDerivative)
      .where(and(eq(pageDerivative.documentId, id), eq(pageDerivative.page, page)))
      .limit(1),
  ]);

  const edgeRows = [...out.map((r) => ({ direction: "out" as const, ...r })), ...inn.map((r) => ({ direction: "in" as const, ...r }))];
  const citations = await citationsForSpans(edgeRows.map((r) => r.edge.sourceSpanId));
  const edges: EdgeView[] = edgeRows.map((r) => ({
    direction: r.direction,
    edge: toEdge(r.edge),
    other: { id: r.other.id, doc_no: r.other.docNo, class: r.other.class, subject_tag: r.other.subjectTag },
    citation: citations.get(r.edge.sourceSpanId) ?? null,
  }));

  let lesson: z.infer<typeof LessonView> | null = null;
  if (doc.class === "opl" && current !== null) {
    const [l] = await db.select().from(opl).where(eq(opl.documentRevisionId, current.id)).limit(1);
    if (l) {
      lesson = {
        opl_id: l.oplId,
        title: l.title,
        discipline: l.discipline,
        classification: l.classification,
        machine_drafted: l.machineDrafted,
        approver_alias: l.approverAlias,
        date_of_sharing: l.footer.date_of_sharing,
      };
    }
  }

  return DocumentView.parse({
    document: doc,
    current,
    superseded: o.includeSuperseded ? superseded : [],
    history_available: superseded.length,
    assets,
    edges,
    integrity_findings: findings,
    lesson,
    page,
    page_available: derivative.length > 0,
    span: spanView,
    span_missing: o.spanId !== null && spanView === null ? o.spanId : null,
  });
}
