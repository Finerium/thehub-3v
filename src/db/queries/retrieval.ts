// Every query of the answer lane's retrieval side (ARCHITECTURE 7 steps 5, 6 and 8; blueprint 9.2, 9.3, 9.4, 9.5,
// AC-ANS-01, AC-ANS-02, AC-NFR-11): the asset master for scope resolution, the document graph, current revisions of
// the visible corpus versions, the two-stage chunk query, the spans a citation resolves to, the open integrity
// findings a chip carries, and the typed rows the templates read. Drizzle only, parameterised throughout; every
// function takes the client so a test can pass its own. A function given an empty id list returns empty without a
// round trip. Nothing here reads a draft table (INV-1: drafts are physically separate from the retrieval path).
import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  area,
  bomItem,
  bomMatch,
  causalLink,
  chunk,
  claim,
  datasheetParam,
  documentEdge,
  documentRevision,
  documentTable,
  equipment,
  failureFamily,
  instrumentTag,
  integrityFinding,
  interlock,
  interlockRow,
  opl,
  oplStep,
  proofTest,
  span,
  startPermissive,
  troubleshootingRow,
  workOrder,
} from "@/db/schema";

export type EquipmentRow = typeof equipment.$inferSelect;
export type AreaRow = typeof area.$inferSelect;
export type InstrumentTagRow = typeof instrumentTag.$inferSelect;
export type FamilyRow = typeof failureFamily.$inferSelect;
export type RevisionRow = typeof documentRevision.$inferSelect;
export type InterlockRowRow = typeof interlockRow.$inferSelect;
export type InterlockRowType = typeof interlock.$inferSelect;
export type PermissiveRow = typeof startPermissive.$inferSelect;
export type DatasheetParamRow = typeof datasheetParam.$inferSelect;
export type ProofTestRow = typeof proofTest.$inferSelect;
export type WorkOrderRow = typeof workOrder.$inferSelect;
export type CausalLinkRow = typeof causalLink.$inferSelect;
export type BomMatchRow = typeof bomMatch.$inferSelect;
export type BomItemRow = typeof bomItem.$inferSelect;
export type OplRow = typeof opl.$inferSelect;
export type OplStepRow = typeof oplStep.$inferSelect;
export type TroubleshootingRowRow = typeof troubleshootingRow.$inferSelect;

export type DocumentRow = { id: string; docNo: string | null; class: (typeof documentTable.$inferSelect)["class"]; subjectTag: string | null };

/** The organiser's dataset-explanation deck is never an answer source (blueprint 10.1). */
export const EXCLUDED_CLASS = "organiser_note" as const;

/** A span joined to its revision and document: everything a Citation needs except the open findings. */
export type SpanSource = {
  spanId: string;
  page: number;
  quoteHash: string;
  anchorText: string;
  startOrdinal: number;
  revisionId: string;
  revision: string;
  approvalStatus: RevisionRow["approvalStatus"];
  approvalStatusText: string;
  isCurrent: boolean;
  documentId: string;
  docNo: string | null;
  documentClass: DocumentRow["class"];
  subjectTag: string | null;
};

const spanSourceColumns = {
  spanId: span.id,
  page: span.page,
  quoteHash: span.quoteHash,
  anchorText: span.anchorText,
  startOrdinal: span.startOrdinal,
  revisionId: documentRevision.id,
  revision: documentRevision.revision,
  approvalStatus: documentRevision.approvalStatus,
  approvalStatusText: documentRevision.approvalStatusText,
  isCurrent: documentRevision.isCurrent,
  documentId: documentTable.id,
  docNo: documentTable.docNo,
  documentClass: documentTable.class,
  subjectTag: documentTable.subjectTag,
};

const documentColumns = { id: documentTable.id, docNo: documentTable.docNo, class: documentTable.class, subjectTag: documentTable.subjectTag };

function spanSourceQuery(db: Db) {
  return db
    .select(spanSourceColumns)
    .from(span)
    .innerJoin(documentRevision, eq(span.documentRevisionId, documentRevision.id))
    .innerJoin(documentTable, eq(documentRevision.documentId, documentTable.id));
}

// ---------------------------------------------------------------------------------------------------------------
// Scope (AC-ANS-01)
// ---------------------------------------------------------------------------------------------------------------

/** The asset master the scope resolver matches the question against: 8 equipment, 8 areas, the instrument tags. */
export async function assetMaster(db: Db): Promise<{ equipment: EquipmentRow[]; areas: AreaRow[]; instruments: InstrumentTagRow[] }> {
  const [equipmentRows, areas, instruments] = await Promise.all([
    db.select().from(equipment).orderBy(asc(equipment.tag)),
    db.select().from(area).orderBy(asc(area.code)),
    db.select().from(instrumentTag).orderBy(asc(instrumentTag.tag)),
  ]);
  return { equipment: equipmentRows, areas, instruments };
}

export async function familiesAll(db: Db): Promise<FamilyRow[]> {
  return db.select().from(failureFamily).orderBy(asc(failureFamily.id));
}

export async function equipmentTagsOfWorkOrders(db: Db, woNumbers: readonly string[]): Promise<Array<{ woNumber: string; equipmentTag: string }>> {
  if (woNumbers.length === 0) return [];
  return db
    .select({ woNumber: workOrder.woNumber, equipmentTag: workOrder.equipmentTag })
    .from(workOrder)
    .where(inArray(workOrder.woNumber, [...woNumbers]))
    .orderBy(asc(workOrder.woNumber));
}

/** The documents of the assets in scope: subject_tag in the tags, or doc_no among the equipment rows' typed references. */
export async function documentsOfTags(db: Db, tags: readonly string[], docNos: readonly string[]): Promise<DocumentRow[]> {
  const bindings: SQL[] = [];
  if (tags.length > 0) bindings.push(inArray(documentTable.subjectTag, [...tags]));
  if (docNos.length > 0) bindings.push(inArray(documentTable.docNo, [...docNos]));
  if (bindings.length === 0) return [];
  return db
    .select(documentColumns)
    .from(documentTable)
    .where(and(or(...bindings), ne(documentTable.class, EXCLUDED_CLASS)))
    .orderBy(asc(documentTable.id));
}

export async function documentsByIds(db: Db, ids: readonly string[]): Promise<DocumentRow[]> {
  if (ids.length === 0) return [];
  return db
    .select(documentColumns)
    .from(documentTable)
    .where(and(inArray(documentTable.id, [...ids]), ne(documentTable.class, EXCLUDED_CLASS)))
    .orderBy(asc(documentTable.id));
}

export type EdgeRow = {
  fromDocumentId: string;
  toDocumentId: string;
  edgeKind: (typeof documentEdge.$inferSelect)["edgeKind"];
  toClass: DocumentRow["class"];
  toSubjectTag: string | null;
};

/** The one-hop neighbourhood of the documents in scope through document_edge, with the target's class and subject. */
export async function edgesFrom(db: Db, documentIds: readonly string[]): Promise<EdgeRow[]> {
  if (documentIds.length === 0) return [];
  return db
    .selectDistinct({
      fromDocumentId: documentEdge.fromDocumentId,
      toDocumentId: documentEdge.toDocumentId,
      edgeKind: documentEdge.edgeKind,
      toClass: documentTable.class,
      toSubjectTag: documentTable.subjectTag,
    })
    .from(documentEdge)
    .innerJoin(documentTable, eq(documentEdge.toDocumentId, documentTable.id))
    .where(and(inArray(documentEdge.fromDocumentId, [...documentIds]), ne(documentTable.class, EXCLUDED_CLASS)))
    .orderBy(asc(documentEdge.fromDocumentId), asc(documentEdge.toDocumentId), asc(documentEdge.edgeKind));
}

/**
 * The revisions of the documents in scope inside the visible corpus versions (src/auth/sandbox.ts): the current
 * one per document by default; every revision of those documents when the labelled history toggle asks (AC-ANS-14).
 */
export async function revisionsOf(
  db: Db,
  documentIds: readonly string[],
  visibleVersionIds: readonly string[],
  includeSuperseded: boolean,
): Promise<RevisionRow[]> {
  if (documentIds.length === 0 || visibleVersionIds.length === 0) return [];
  const conditions: SQL[] = [
    inArray(documentRevision.documentId, [...documentIds]),
    inArray(documentRevision.corpusVersionId, [...visibleVersionIds]),
  ];
  if (!includeSuperseded) conditions.push(eq(documentRevision.isCurrent, true));
  return db
    .select()
    .from(documentRevision)
    .where(and(...conditions))
    .orderBy(asc(documentRevision.documentId), asc(documentRevision.revision), asc(documentRevision.id));
}

/** Rule ids of the findings open against each document, distinct and sorted (9.8 Citation.integrity_findings). */
export async function openFindingRuleIds(db: Db, documentIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (documentIds.length === 0) return out;
  const rows = await db
    .selectDistinct({ documentId: integrityFinding.documentId, ruleId: integrityFinding.ruleId })
    .from(integrityFinding)
    .where(and(inArray(integrityFinding.documentId, [...documentIds]), eq(integrityFinding.state, "open")))
    .orderBy(asc(integrityFinding.documentId), asc(integrityFinding.ruleId));
  for (const r of rows) {
    if (r.documentId === null) continue; // area observations (CD-16) bind to no single document
    out.set(r.documentId, [...(out.get(r.documentId) ?? []), r.ruleId]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Retrieval (ARCHITECTURE 7 step 6)
// ---------------------------------------------------------------------------------------------------------------

export type ChunkCandidate = {
  chunkId: string;
  revisionId: string;
  page: number;
  ordinal: number;
  unitKind: (typeof chunk.$inferSelect)["unitKind"];
  text: string;
  quoteHash: string;
  /** 2 when the chunk carries one of the scope's tags verbatim, 1 on a tsquery hit over the content terms, else 0. */
  lexical: number;
  /** Cosine similarity (1 minus pgvector's cosine distance) to the query vector. */
  cosine: number;
  revision: string;
  approvalStatus: RevisionRow["approvalStatus"];
  approvalStatusText: string;
  isCurrent: boolean;
  documentId: string;
  docNo: string | null;
  documentClass: DocumentRow["class"];
  subjectTag: string | null;
};

export type ChunkQuery = {
  /** The revisions retrieval may read: the scope's current revisions, plus the superseded ones under the toggle. */
  revisionIds: readonly string[];
  /** The served approval statuses (src/gates/g2 SERVED_APPROVAL_STATUSES); ignored under the toggle. */
  servedStatuses: readonly RevisionRow["approvalStatus"][];
  includeSuperseded: boolean;
  visibleVersionIds: readonly string[];
  queryVector: readonly number[];
  /** The question's content terms for plainto_tsquery('simple', ...); empty means no term stage. */
  terms: string;
  /** The equipment and instrument tags in scope; an exact tag match is the authoritative lexical hit. */
  tags: readonly string[];
  k: number;
};

/**
 * Both retrieval stages in one statement: candidates are chunks of the named revisions (served statuses, current,
 * unless the toggle admits the rest); the lexical stage marks exact tag matches (2) and tsquery hits (1); the vector
 * stage orders each lexical group by cosine and fills to k from the rest, so lexical hits always rank first. The
 * full sort key (lexical, cosine, revision id, page, ordinal) makes the k-boundary deterministic (AC-NFR-06).
 */
// ponytail: ORDER BY on a compound key scans the scope's chunks (a few documents of 832 chunks); an HNSW-first
// pre-filter if the corpus grows by orders of magnitude.
export async function candidateChunks(db: Db, q: ChunkQuery): Promise<ChunkCandidate[]> {
  if (q.revisionIds.length === 0 || q.visibleVersionIds.length === 0 || q.k <= 0) return [];
  const vector = `[${q.queryVector.join(",")}]`;
  const tagHits: SQL[] = q.tags.map((tag) => sql`${chunk.textTsv} @@ plainto_tsquery('simple', ${tag})`);
  const tagHit: SQL = tagHits.length > 0 ? sql`(${sql.join(tagHits, sql` OR `)})` : sql`false`;
  const termHit: SQL = q.terms.length > 0 ? sql`${chunk.textTsv} @@ plainto_tsquery('simple', ${q.terms})` : sql`false`;
  const lexical = sql<number>`(CASE WHEN ${tagHit} THEN 2 WHEN ${termHit} THEN 1 ELSE 0 END)`;
  const cosine = sql<number>`(1 - (${chunk.embedding} <=> ${vector}::vector))`;

  const conditions: SQL[] = [
    inArray(chunk.documentRevisionId, [...q.revisionIds]),
    inArray(documentRevision.corpusVersionId, [...q.visibleVersionIds]),
    ne(documentTable.class, EXCLUDED_CLASS),
  ];
  if (!q.includeSuperseded) {
    conditions.push(eq(documentRevision.isCurrent, true));
    if (q.servedStatuses.length > 0) conditions.push(inArray(documentRevision.approvalStatus, [...q.servedStatuses]));
  }

  const rows = await db
    .select({
      chunkId: chunk.id,
      revisionId: chunk.documentRevisionId,
      page: chunk.page,
      ordinal: chunk.ordinal,
      unitKind: chunk.unitKind,
      text: chunk.text,
      quoteHash: chunk.quoteHash,
      lexical,
      cosine,
      revision: documentRevision.revision,
      approvalStatus: documentRevision.approvalStatus,
      approvalStatusText: documentRevision.approvalStatusText,
      isCurrent: documentRevision.isCurrent,
      documentId: documentTable.id,
      docNo: documentTable.docNo,
      documentClass: documentTable.class,
      subjectTag: documentTable.subjectTag,
    })
    .from(chunk)
    .innerJoin(documentRevision, eq(chunk.documentRevisionId, documentRevision.id))
    .innerJoin(documentTable, eq(documentRevision.documentId, documentTable.id))
    .where(and(...conditions))
    .orderBy(desc(lexical), desc(cosine), asc(chunk.documentRevisionId), asc(chunk.page), asc(chunk.ordinal))
    .limit(q.k);
  // The driver returns numeric expressions as strings or numbers depending on the cast; pin both to numbers.
  return rows.map((r) => ({ ...r, lexical: Number(r.lexical), cosine: Number(r.cosine) }));
}

export type PageSpan = { spanId: string; revisionId: string; page: number; anchorText: string; quoteHash: string; startOrdinal: number };

/** The spans on the given (revision, page) pairs, ordered by page and start ordinal: a chunk cites the first it contains. */
export async function spansOnPages(db: Db, pairs: ReadonlyArray<{ revisionId: string; page: number }>): Promise<PageSpan[]> {
  if (pairs.length === 0) return [];
  const seen = new Set<string>();
  const clauses: SQL[] = [];
  for (const p of pairs) {
    const key = `${p.revisionId}|${p.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clauses.push(and(eq(span.documentRevisionId, p.revisionId), eq(span.page, p.page)) as SQL);
  }
  return db
    .select({
      spanId: span.id,
      revisionId: span.documentRevisionId,
      page: span.page,
      anchorText: span.anchorText,
      quoteHash: span.quoteHash,
      startOrdinal: span.startOrdinal,
    })
    .from(span)
    .where(or(...clauses))
    .orderBy(asc(span.documentRevisionId), asc(span.page), asc(span.startOrdinal), asc(span.id));
}

/** Spans by id with their revision and document (the citation of a typed row: span_id -> Citation). */
export async function spansByIds(db: Db, ids: readonly string[]): Promise<Map<string, SpanSource>> {
  const out = new Map<string, SpanSource>();
  const distinct = [...new Set(ids)];
  if (distinct.length === 0) return out;
  const rows = await spanSourceQuery(db).where(inArray(span.id, distinct));
  for (const r of rows) out.set(r.spanId, r);
  return out;
}

/** The first span of each revision (page, then start ordinal): the citation of a document as a whole, e.g. a lesson's title block. */
export async function firstSpanOfRevisions(db: Db, revisionIds: readonly string[]): Promise<Map<string, SpanSource>> {
  const out = new Map<string, SpanSource>();
  const distinct = [...new Set(revisionIds)];
  if (distinct.length === 0) return out;
  const rows = await spanSourceQuery(db)
    .where(inArray(span.documentRevisionId, distinct))
    .orderBy(asc(span.documentRevisionId), asc(span.page), asc(span.startOrdinal), asc(span.id));
  for (const r of rows) if (!out.has(r.revisionId)) out.set(r.revisionId, r);
  return out;
}

/**
 * The workbook span bound to each work order (a parser claim whose entity_binding is the WO number on the workbook
 * revision), first by row and ordinal: the citation of a proof test, a work order or a BOM match. A work order with
 * no bound span has no citation, and whatever would cite it is omitted ("provenance or nothing").
 */
export async function workOrderSpans(db: Db, woNumbers: readonly string[]): Promise<Map<string, SpanSource>> {
  const out = new Map<string, SpanSource>();
  const distinct = [...new Set(woNumbers)];
  if (distinct.length === 0) return out;
  const rows = await db
    .select({ ...spanSourceColumns, woNumber: claim.entityBinding })
    .from(claim)
    .innerJoin(span, eq(claim.spanId, span.id))
    .innerJoin(documentRevision, eq(span.documentRevisionId, documentRevision.id))
    .innerJoin(documentTable, eq(documentRevision.documentId, documentTable.id))
    .where(and(inArray(claim.entityBinding, distinct), eq(documentTable.class, "workbook"), eq(documentRevision.isCurrent, true)))
    .orderBy(asc(claim.entityBinding), asc(span.page), asc(span.startOrdinal), asc(span.id));
  for (const { woNumber, ...source } of rows) if (!out.has(woNumber)) out.set(woNumber, source);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Typed rows for the templates (ARCHITECTURE 7 step 8; blueprint 9.3, 9.4, 9.5)
// ---------------------------------------------------------------------------------------------------------------

export async function interlocksOf(db: Db, tags: readonly string[]): Promise<InterlockRowType[]> {
  if (tags.length === 0) return [];
  return db.select().from(interlock).where(inArray(interlock.equipmentTag, [...tags])).orderBy(asc(interlock.equipmentTag), asc(interlock.ceDocNo));
}

export async function interlockRowsOf(db: Db, tags: readonly string[]): Promise<InterlockRowRow[]> {
  if (tags.length === 0) return [];
  return db
    .select()
    .from(interlockRow)
    .where(inArray(interlockRow.equipmentTag, [...tags]))
    .orderBy(asc(interlockRow.equipmentTag), asc(interlockRow.sourcePage), asc(interlockRow.rowId), asc(interlockRow.id));
}

export async function permissivesOf(db: Db, seqIds: readonly string[]): Promise<PermissiveRow[]> {
  if (seqIds.length === 0) return [];
  return db.select().from(startPermissive).where(inArray(startPermissive.seqId, [...seqIds])).orderBy(asc(startPermissive.seqId), asc(startPermissive.n));
}

export async function datasheetParamsOf(db: Db, tags: readonly string[]): Promise<DatasheetParamRow[]> {
  if (tags.length === 0) return [];
  return db
    .select()
    .from(datasheetParam)
    .where(inArray(datasheetParam.equipmentTag, [...tags]))
    .orderBy(asc(datasheetParam.equipmentTag), asc(datasheetParam.group), asc(datasheetParam.field), asc(datasheetParam.id));
}

export async function proofTestsOf(db: Db, tags: readonly string[]): Promise<ProofTestRow[]> {
  if (tags.length === 0) return [];
  return db
    .select()
    .from(proofTest)
    .where(inArray(proofTest.equipmentTag, [...tags]))
    .orderBy(asc(proofTest.equipmentTag), asc(proofTest.testClass), desc(proofTest.completionDate), asc(proofTest.woNumber));
}

export async function workOrdersOf(db: Db, tags: readonly string[]): Promise<WorkOrderRow[]> {
  if (tags.length === 0) return [];
  return db
    .select()
    .from(workOrder)
    .where(inArray(workOrder.equipmentTag, [...tags]))
    .orderBy(asc(workOrder.equipmentTag), desc(workOrder.reportDate), asc(workOrder.woNumber));
}

export async function causalLinksOf(db: Db, tags: readonly string[]): Promise<CausalLinkRow[]> {
  if (tags.length === 0) return [];
  return db
    .select()
    .from(causalLink)
    .where(inArray(causalLink.equipmentTag, [...tags]))
    .orderBy(asc(causalLink.equipmentTag), asc(causalLink.fromWo), asc(causalLink.toWo), asc(causalLink.id));
}

export async function bomMatchesOf(db: Db, woNumbers: readonly string[]): Promise<BomMatchRow[]> {
  if (woNumbers.length === 0) return [];
  return db.select().from(bomMatch).where(inArray(bomMatch.woNumber, [...woNumbers])).orderBy(asc(bomMatch.woNumber), asc(bomMatch.partString));
}

export async function bomItemsByIds(db: Db, ids: readonly string[]): Promise<Map<string, BomItemRow>> {
  const out = new Map<string, BomItemRow>();
  const distinct = [...new Set(ids)];
  if (distinct.length === 0) return out;
  const rows = await db.select().from(bomItem).where(inArray(bomItem.id, distinct));
  for (const r of rows) out.set(r.id, r);
  return out;
}

export async function oplsOf(db: Db, tags: readonly string[]): Promise<OplRow[]> {
  if (tags.length === 0) return [];
  return db.select().from(opl).where(inArray(opl.equipmentTag, [...tags])).orderBy(asc(opl.oplId));
}

export async function oplsByIds(db: Db, oplIds: readonly string[]): Promise<OplRow[]> {
  const distinct = [...new Set(oplIds)];
  if (distinct.length === 0) return [];
  return db.select().from(opl).where(inArray(opl.oplId, distinct)).orderBy(asc(opl.oplId));
}

export async function oplsByRevisionIds(db: Db, revisionIds: readonly string[]): Promise<OplRow[]> {
  const distinct = [...new Set(revisionIds)];
  if (distinct.length === 0) return [];
  return db.select().from(opl).where(inArray(opl.documentRevisionId, distinct)).orderBy(asc(opl.oplId));
}

export async function oplStepsOf(db: Db, oplIds: readonly string[]): Promise<OplStepRow[]> {
  const distinct = [...new Set(oplIds)];
  if (distinct.length === 0) return [];
  return db.select().from(oplStep).where(inArray(oplStep.oplId, distinct)).orderBy(asc(oplStep.oplId), asc(oplStep.n));
}

export async function troubleshootingRowsOf(db: Db, oplIds: readonly string[]): Promise<TroubleshootingRowRow[]> {
  const distinct = [...new Set(oplIds)];
  if (distinct.length === 0) return [];
  return db
    .select()
    .from(troubleshootingRow)
    .where(inArray(troubleshootingRow.oplId, distinct))
    .orderBy(asc(troubleshootingRow.oplId), asc(troubleshootingRow.n));
}

/** The current revision rows of the given revision ids (a lesson's revision label for Procedure.revision). */
export async function revisionsByIds(db: Db, revisionIds: readonly string[]): Promise<Map<string, RevisionRow>> {
  const out = new Map<string, RevisionRow>();
  const distinct = [...new Set(revisionIds)];
  if (distinct.length === 0) return out;
  const rows = await db.select().from(documentRevision).where(inArray(documentRevision.id, distinct));
  for (const r of rows) out.set(r.id, r);
  return out;
}
