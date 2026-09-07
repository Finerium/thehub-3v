// The reads the coverage port needs to recompute a corpus version (blueprint 9.5, ARCHITECTURE 8.1, 8.6 step 4).
// Nothing here computes: it hands src/coverage the same four inputs the harness runs over, read through Drizzle
// from the rows of one version's lineage, so a G3 recount and the equality gate score the same corpus.
//
// Which rows belong to a version. `work_order`, `equipment` and `failure_family` carry no corpus_version_id: they
// are the workbook and the asset master, seeded once and shared by every version. Lessons do carry one, through
// their document revision, so they are selected by the lineage rule of ARCHITECTURE 3.4 (per document, the
// revision from the nearest version in the lineage), which is what makes a sandbox publication add its lesson to
// the visitor's numbers and to nobody else's (D-16).
//
// Why the note chunk travels with the lesson: the generous layer is the WHOLE lesson text, and the extracted
// header block is the part of it that no parsed field reproduces (tests/equality/coverage.test.ts; without it the
// published `all` figure at t = 0.62 reads 146 uncovered instead of 143). It is the one chunk of unit_kind "note"
// the ingestion writes per lesson. A machine-drafted lesson published through G3 was never extracted and has no
// header block; it composes its generous text out of its sections alone, which is what an empty string here means.
import { and, asc, eq, inArray } from "drizzle-orm";
import type * as operations from "@/contracts/generated/operations";
import type { LessonText } from "@/coverage/layers";
import type { Tx } from "@/db/client";
import { chunk, documentRevision, equipment, failureFamily, opl, workOrder } from "@/db/schema";
import { currentRevisionIds } from "@/db/versions";
import { toWorkOrder } from "@/db/queries/failures";

export type CoverageInputs = {
  /** Every work order, in wo_number order: the order the harness's workbook rows arrive in, which the sums follow. */
  workOrders: operations.WorkOrder[];
  /** The lessons in force for this lineage, in opl_id order, each carrying its header block and equipment name. */
  lessons: LessonText[];
  /** Datasheet criticality per asset tag: the k term, and the fleet the debt ranking covers (harness/debt.py:16). */
  criticalityByTag: Record<string, string>;
  /** Every work order that belongs to any failure family: the r term (harness/master.py:308-315). */
  familyMembers: Set<string>;
};

/** The four inputs of the frozen recipe, read from the rows of `lineage` (nearest version first). */
export async function readCoverageInputs(tx: Tx, lineage: readonly string[]): Promise<CoverageInputs> {
  if (lineage.length === 0) throw new Error("readCoverageInputs needs at least one corpus version in the lineage");
  const ids = [...lineage];

  // One statement at a time: this runs on the single connection of the G3 transaction (ARCHITECTURE 8.6), where
  // concurrent statements would only queue on it anyway.
  const workOrderRows = await tx.select().from(workOrder).orderBy(asc(workOrder.woNumber));
  const revisions = await tx
    .select({
      id: documentRevision.id,
      documentId: documentRevision.documentId,
      corpusVersionId: documentRevision.corpusVersionId,
      revision: documentRevision.revision,
    })
    .from(documentRevision)
    .where(inArray(documentRevision.corpusVersionId, ids));
  const assets = await tx
    .select({ tag: equipment.tag, name: equipment.name, criticality: equipment.criticalityDatasheet })
    .from(equipment)
    .orderBy(asc(equipment.tag));
  const families = await tx.select({ members: failureFamily.members }).from(failureFamily);

  // ARCHITECTURE 3.4: per document, the revision from the nearest version of the lineage.
  const current = currentRevisionIds(revisions, lineage);
  const lessonRows =
    current.length === 0
      ? []
      : await tx.select().from(opl).where(inArray(opl.documentRevisionId, current)).orderBy(asc(opl.oplId));

  const lessonRevisionIds = lessonRows.map((l) => l.documentRevisionId);
  const noteRows =
    lessonRevisionIds.length === 0
      ? []
      : await tx
          .select({ revisionId: chunk.documentRevisionId, text: chunk.text })
          .from(chunk)
          .where(and(inArray(chunk.documentRevisionId, lessonRevisionIds), eq(chunk.unitKind, "note")))
          .orderBy(asc(chunk.documentRevisionId), asc(chunk.page), asc(chunk.ordinal));

  // One note chunk per lesson; the first in (page, ordinal) order is that one, and the order makes the pick stable.
  const headerText = new Map<string, string>();
  for (const note of noteRows) if (!headerText.has(note.revisionId)) headerText.set(note.revisionId, note.text);
  const nameByTag = new Map(assets.map((a) => [a.tag, a.name]));

  const lessons: LessonText[] = lessonRows.map((l) => ({
    document_revision_id: l.documentRevisionId,
    opl_id: l.oplId,
    title: l.title,
    discipline: l.discipline,
    equipment_tag: l.equipmentTag,
    area_unit: l.areaUnit,
    related_interlock_text: l.relatedInterlockText,
    pid_ref: l.pidRef,
    classification: l.classification,
    aspect: l.aspect,
    sections: l.sections,
    permit_lines: l.permitLines,
    footer: l.footer,
    machine_drafted: l.machineDrafted,
    approver_alias: l.approverAlias,
    header_text: headerText.get(l.documentRevisionId) ?? "",
    equipment_name: nameByTag.get(l.equipmentTag) ?? "",
  }));

  return {
    workOrders: workOrderRows.map(toWorkOrder),
    lessons,
    criticalityByTag: Object.fromEntries(assets.map((a) => [a.tag, a.criticality])),
    familyMembers: new Set(families.flatMap((f) => f.members.map((m) => m.wo_number))),
  };
}
