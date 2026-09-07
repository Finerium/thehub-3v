// G3 step 3 (ARCHITECTURE 8.6): the accepted draft becomes a document of the corpus. One page of text composed
// from the draft's own elements, and from it the `document`, its `document_revision` (revision 0, approved by the
// publishing Manager, current), the `span` rows every quotation of the lesson resolves through, the `chunk` rows
// retrieval reads (embedded through the Node lane of ARCHITECTURE 6), the `opl` row of 9.5, the `opl_step` rows of
// its procedure section, the `troubleshooting_row` rows of its section 5, and the `document_edge` rows the draft's
// own provenance already names.
//
// Section 5 is the one section that is not made of draft fields. AG-3 returns it as `troubleshooting_rows` (9.16),
// the drafting lane stores it in draft.draft_troubleshooting_row, and this step reads it back through
// src/loop/rows.ts on the publishing transaction: it composes the rows into the lesson's section 5 body, so the
// page a reader sees, the digest the document is identified by and the text coverage measures all carry it, and it
// writes the typed rows themselves so a published lesson quotes its records with their work-order ids (AC-LOOP-04).
//
// Nothing here is invented. The header fields 9.5 requires but the draft does not carry are read from the asset:
// the area's OPL header name, the asset's interlock reference, the doc_no of the P&ID it appears on, and the
// discipline its maintenance records carry. A slot keeps the fixed literal in the lesson body and writes no
// procedure step: the engineer's value lives in the SME note beside it, under the unverified-value line of 9.6, and
// never inside document text.
import { asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Opl } from "@/contracts/generated/coverage";
import type { Tx } from "@/db/client";
import type { DraftRow, FieldRow } from "@/db/queries/loop";
import {
  area,
  chunk,
  documentEdge,
  documentRevision,
  documentTable,
  equipment,
  opl,
  oplStep,
  span,
  troubleshootingRow,
  workOrder,
} from "@/db/schema";
import { embed } from "@/gateway";
import { NotFound } from "@/lib/errors";
import { quoteHash, sha256Hex } from "@/lib/hash";
import { troubleshootingRows, type TroubleshootingRowRow } from "@/loop/rows";
import { SECTION_HEADINGS } from "@/loop/template";

/** One page: a machine-drafted lesson is composed, never extracted, so it has exactly one. */
const PAGE = 1;
/** ARCHITECTURE 8.6 step 3: the first revision of a lesson The Hub itself published. */
const REVISION = "0";
/** The approval this revision carries: a Manager approved it through G3, which is the only way it exists. */
const APPROVAL_TEXT = "Approved by (Manager)";
/** The 9.2 edge kind of a lesson pointing at the document its evidence came from. */
const EDGE_KIND = "cross_reference" as const;

export type PublishedLesson = { documentId: string; documentRevisionId: string; oplId: string };

type Section = Opl["sections"][number];
type SectionNumber = Section["n"];
const SECTION_NUMBERS: readonly SectionNumber[] = [1, 2, 3, 4, 5, 6];
/** 9.5: section 4 is DETAILED PROCEDURE / STEPS, so its elements are the lesson's steps. */
const STEPS_SECTION: SectionNumber = 4;
/** 9.5: section 5 is COMMON PROBLEMS & TROUBLESHOOTING, so its body is the draft's rows and not its elements. */
const TROUBLESHOOTING_SECTION: SectionNumber = 5;

// One row as one line of the lesson body: the three cells the record was quoted into, then the work order they were
// quoted from. The corpus flattens the same table cell by cell with one space between them, and an empty cell is
// dropped rather than left as a double space (harness/opl.py:121). The work-order id is what AC-LOOP-04 asks a
// published section 5 to carry, and the typed row beside it carries the same id in `quoted_wo_number`.
function rowLine(row: TroubleshootingRowRow): string {
  const wo = row.quotedWoNumber === null ? "" : `(${row.quotedWoNumber})`;
  return [row.problem, row.cause, row.action, wo].filter((part) => part !== "").join(" ");
}

/** The 9.5 header fields the draft does not carry, each read from the asset it teaches. */
type AssetHeader = { areaUnit: string; relatedInterlockText: string; pidRef: string; discipline: string };

async function readAssetHeader(tx: Tx, tag: string): Promise<AssetHeader> {
  const [asset] = await tx
    .select({
      areaUnit: area.oplHeaderName,
      interlockRef: equipment.interlockRef,
      pidRef: documentTable.docNo,
    })
    .from(equipment)
    .innerJoin(area, eq(area.code, equipment.areaCode))
    .innerJoin(documentTable, eq(documentTable.id, equipment.pidDocumentId))
    .where(eq(equipment.tag, tag))
    .limit(1);
  if (!asset) throw new NotFound("equipment", tag);

  // The discipline the asset's own maintenance records carry, most frequent first (the template's header rule).
  const [byRecords] = await tx
    .select({ discipline: workOrder.discipline, n: count() })
    .from(workOrder)
    .where(eq(workOrder.equipmentTag, tag))
    .groupBy(workOrder.discipline)
    .orderBy(desc(count()), asc(workOrder.discipline))
    .limit(1);

  return {
    areaUnit: asset.areaUnit,
    relatedInterlockText: asset.interlockRef,
    pidRef: asset.pidRef ?? "",
    discipline: byRecords?.discipline ?? "",
  };
}

type Composed = {
  sections: Section[];
  /** The page text every span offset is measured in, and the bytes the document's digest is taken over. */
  pageText: string;
  /** Per field id, the half-open character range of its text inside the page. */
  offsets: Map<string, { start: number; end: number }>;
  /** Per section, the chunk text retrieval indexes: the number, the heading and the body. */
  chunkTexts: Map<SectionNumber, string>;
};

/** The lesson as one page: an identifying head line, then each section as its heading followed by its elements. */
function compose(draft: DraftRow, fields: readonly FieldRow[], rows: readonly TroubleshootingRowRow[]): Composed {
  const lines: string[] = [];
  const offsets = new Map<string, { start: number; end: number }>();
  let cursor = 0;

  const push = (text: string, fieldId?: string): void => {
    if (lines.length > 0) cursor += 1; // the newline this line is joined with
    if (fieldId !== undefined) offsets.set(fieldId, { start: cursor, end: cursor + text.length });
    cursor += text.length;
    lines.push(text);
  };

  push(`${draft.oplIdReserved} ${draft.title}`);
  const sections: Section[] = [];
  const chunkTexts = new Map<SectionNumber, string>();
  for (const n of SECTION_NUMBERS) {
    const elements = fields.filter((f) => f.section === n);
    // Section 5 has no fields to carry a span, so its lines are pushed without one: nothing quotes a row through a
    // span, and the rows themselves are published typed. They are part of the page all the same, because the page
    // is what the document's digest is taken over and what the generous coverage layer measures.
    const lines = n === TROUBLESHOOTING_SECTION ? rows.map(rowLine) : [];
    if (elements.length === 0 && lines.length === 0) continue;
    const heading = SECTION_HEADINGS[n];
    push(`${n}. ${heading}`);
    for (const element of elements) push(element.text, element.id);
    for (const line of lines) push(line);
    const bodyText = [...elements.map((e) => e.text), ...lines].join(" ");
    sections.push({ n, heading, body_text: bodyText, body_hash: quoteHash(bodyText) });
    chunkTexts.set(n, `${n}. ${heading} ${bodyText}`);
  }

  return { sections, pageText: lines.join("\n"), offsets, chunkTexts };
}

/** The documents the draft's own provenance spans belong to: the only edges a published lesson can claim. */
async function edgeTargets(tx: Tx, fields: readonly FieldRow[]): Promise<Map<string, string>> {
  const spanIds = [...new Set(fields.map((f) => f.provenance.span_id).filter((id): id is string => id !== null))];
  if (spanIds.length === 0) return new Map();
  const rows = await tx
    .select({ spanId: span.id, documentId: documentRevision.documentId })
    .from(span)
    .innerJoin(documentRevision, eq(documentRevision.id, span.documentRevisionId))
    .where(inArray(span.id, spanIds));
  return new Map(rows.map((r) => [r.spanId, r.documentId] as const));
}

/**
 * Write the lesson into `corpusVersionId`. Every row of this step belongs to the new version, so re-activating the
 * seeded version leaves it in place and merely not current (ARCHITECTURE 3.4); nothing is deleted or overwritten.
 */
export async function writeLesson(
  tx: Tx,
  draft: DraftRow,
  fields: readonly FieldRow[],
  actor: { alias: string },
  corpusVersionId: string,
): Promise<PublishedLesson> {
  const header = await readAssetHeader(tx, draft.equipmentTag);
  const rows = await troubleshootingRows(tx, draft.id);
  const { sections, pageText, offsets, chunkTexts } = compose(draft, fields, rows);

  const digest = sha256Hex(pageText);
  const documentId = `doc-${digest.slice(0, 12)}`;
  const documentRevisionId = `rev-${digest.slice(0, 12)}`;
  const today = new Date().toISOString().slice(0, 10);

  await tx.insert(documentTable).values({
    id: documentId,
    docNo: draft.oplIdReserved,
    class: "opl",
    subjectTag: draft.equipmentTag,
    sha256: digest,
    // The lesson was composed here, not extracted from a supplied file; its source is the draft it came from.
    sourcePath: `thehub://drafts/${draft.id}`,
    pageCount: 1,
    fileMarker: null,
  });
  await tx.insert(documentRevision).values({
    id: documentRevisionId,
    documentId,
    revision: REVISION,
    approvalStatus: "approved",
    approvalStatusText: APPROVAL_TEXT,
    revisionDate: today,
    preparedByAlias: draft.modelId,
    reviewedByAlias: draft.createdByAlias,
    approvedByAlias: actor.alias,
    dateOfSharing: today,
    isCurrent: true,
    corpusVersionId,
  });

  // One span per element: the anchor text is the element itself, so every quotation of this lesson resolves to the
  // element that carried the provenance (9.2 Span, AC-ANS-05).
  const spanIdOf = new Map<string, string>();
  const spanRows = fields.flatMap((field) => {
    const at = offsets.get(field.id);
    if (at === undefined) return [];
    const id = `${documentRevisionId}/p${PAGE}/${at.start}-${at.end}`;
    spanIdOf.set(field.id, id);
    return [
      {
        id,
        documentRevisionId,
        page: PAGE,
        anchorText: field.text,
        quoteHash: quoteHash(field.text),
        startOrdinal: at.start,
        endOrdinal: at.end,
      },
    ];
  });
  if (spanRows.length > 0) await tx.insert(span).values(spanRows);

  // ponytail: the embedder runs inside the publishing transaction, under the G3 advisory lock; move it ahead of
  // the lock with a re-read after it if publication latency ever matters.
  const chunkEntries = [...chunkTexts.entries()];
  const vectors = await embed(
    chunkEntries.map(([, text]) => text),
    "passage",
  );
  await tx.insert(chunk).values(
    chunkEntries.map(([n, text], i) => ({
      id: `${documentRevisionId}/c${String(n).padStart(3, "0")}`,
      documentRevisionId,
      page: PAGE,
      ordinal: n,
      unitKind: "opl_section" as const,
      text,
      quoteHash: quoteHash(text),
      embedding: vectors[i] ?? [],
    })),
  );

  await tx.insert(opl).values({
    documentRevisionId,
    oplId: draft.oplIdReserved,
    title: draft.title,
    discipline: header.discipline,
    equipmentTag: draft.equipmentTag,
    areaUnit: header.areaUnit,
    relatedInterlockText: header.relatedInterlockText,
    pidRef: header.pidRef,
    classification: draft.classification as Opl["classification"],
    aspect: draft.aspect,
    sections,
    // A machine-drafted lesson carries no extracted permit block; the permit route serves approved lessons only.
    permitLines: [],
    footer: {
      prepared_by: draft.modelId,
      reviewed_by_alias: draft.createdByAlias,
      approved_by_alias: actor.alias,
      date_of_sharing: today,
    },
    machineDrafted: true,
    approverAlias: actor.alias,
  });

  // Section 5: the draft's rows, keeping the numbering the draft gave them, with `truncated` as the draft holds it
  // (false on every drafted row: only an extracted row can be cut at the page watermark).
  if (rows.length > 0) {
    await tx.insert(troubleshootingRow).values(
      rows.map((row) => ({
        oplId: draft.oplIdReserved,
        n: row.n,
        problem: row.problem,
        cause: row.cause,
        action: row.action,
        quotedWoNumber: row.quotedWoNumber,
        truncated: row.truncated,
      })),
    );
  }

  // The procedure: the elements of section 4 in order, a slot excluded (its value is the SME note, never a step).
  const steps = fields.filter((f) => f.section === STEPS_SECTION && !f.isSlot);
  if (steps.length > 0) {
    await tx.insert(oplStep).values(
      steps.map((field, i) => ({
        oplId: draft.oplIdReserved,
        n: i + 1,
        actionText: field.text,
        acceptanceCriterion: null,
        sourceHash: quoteHash(field.text),
        spanId: spanIdOf.get(field.id) ?? "",
      })),
    );
  }

  const targets = await edgeTargets(tx, fields);
  const edges = fields.flatMap((field) => {
    const spanId = field.provenance.span_id;
    const toDocumentId = spanId === null ? undefined : targets.get(spanId);
    const sourceSpanId = spanIdOf.get(field.id);
    if (toDocumentId === undefined || sourceSpanId === undefined || toDocumentId === documentId) return [];
    return [{ fromDocumentId: documentId, toDocumentId, edgeKind: EDGE_KIND, sourceSpanId }];
  });
  if (edges.length > 0) await tx.insert(documentEdge).values(edges).onConflictDoNothing();

  return { documentId, documentRevisionId, oplId: draft.oplIdReserved };
}
