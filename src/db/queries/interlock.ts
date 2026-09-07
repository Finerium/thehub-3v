// The reads behind the interlock matrix (blueprint 6.2 surface 5, AC-CTX-03): every cause-and-effect sheet of the
// corpus with the rows it types, the effect columns those rows are marked against, the start permissives it files
// and the notes it prints, plus the trip-boilerplate finding the Integrity Register raised against a sheet whose
// words describe a trip it types no row for (CD-17). Drizzle only; every row leaves through the generated Zod of
// section 9.3 (ARCHITECTURE 1.4). Nothing is computed that a sheet does not state: the SIL, the LOGIC No, the vote
// cell, the marks and the notes are the sheet's own, and a sheet that states none of them says so on the surface.
//
// Why the permissive key is not the LOGIC No alone: a sheet that types a control loop states no LOGIC No, so its
// start-permissive block is filed under the equipment tag. Keying on `seq_id` alone silently drops those rows,
// which is why `permissiveKey` is `seq_id ?? equipment_tag` here and wherever a surface reads permissives.
import { and, asc, eq, inArray } from "drizzle-orm";
import { Interlock, InterlockRow, StartPermissive } from "@/contracts/generated/asset";
import type { Citation } from "@/contracts/generated/evidence_packet";
import { db } from "@/db/client";
import { citationsForSpans, toFinding, type Finding } from "@/db/queries/documents-view";
import { documentTable, equipment, integrityFinding, interlock, interlockRow, startPermissive } from "@/db/schema";

/** The register rule that reads a sheet whose trip boilerplate has no trip row under it (blueprint 11, AC-CTX-03). */
export const TRIP_BOILERPLATE_RULE = "CD-17";

/** One cause-and-effect sheet as the matrix renders it. */
export type InterlockSheet = {
  interlock: Interlock;
  /** The asset the sheet protects, with the LOGIC No line its equipment row carries verbatim. */
  equipment: { tag: string; name: string; interlock_ref: string };
  /** The cause-and-effect document, where the visitor may open the page a citation lands on; null if unseeded. */
  ce_document_id: string | null;
  rows: InterlockRow[];
  permissives: StartPermissive[];
  /** What the sheet's permissive block is filed under: its LOGIC No, or the tag on a sheet that states none. */
  permissive_key: string;
  /** True when the block is filed under the tag because the sheet states no LOGIC No. */
  permissives_keyed_by_tag: boolean;
  /** The open CD-17 finding against this sheet, or null; never a judgement made here. */
  boilerplate_finding: Finding | null;
};

export type InterlockMatrixView = {
  sheets: InterlockSheet[];
  /** Every span the matrix cites (rows, permissives, notes), resolved to its 9.8 Citation. */
  citations: Record<string, Citation>;
  totals: {
    sheets: number;
    trip_logic: number;
    control_loop: number;
    rows: number;
    trip_rows: number;
    permissives: number;
    permissives_by_logic_no: number;
    permissives_by_tag: number;
  };
};

function toInterlock(r: typeof interlock.$inferSelect): Interlock {
  return Interlock.parse({
    seq_id: r.seqId,
    equipment_tag: r.equipmentTag,
    logic_kind: r.logicKind,
    sil_sheet: r.silSheet,
    ce_doc_no: r.ceDocNo,
    ce_revision: r.ceRevision,
    notes: r.notes,
    permissive_gate: r.permissiveGate,
  });
}

function toRow(r: typeof interlockRow.$inferSelect): InterlockRow {
  return InterlockRow.parse({
    id: r.id,
    seq_id: r.seqId,
    equipment_tag: r.equipmentTag,
    row_id: r.rowId,
    row_kind: r.rowKind,
    initiator: r.initiator,
    instrument_tag: r.instrumentTag,
    setpoint_value: r.setpointValue,
    setpoint_unit: r.setpointUnit,
    comparator: r.comparator,
    setpoint_text: r.setpointText,
    voting: r.voting,
    vote_cell_text: r.voteCellText,
    effects: r.effects,
    effects_basis: r.effectsBasis,
    source_page: r.sourcePage,
    span_id: r.spanId,
  });
}

function toPermissive(r: typeof startPermissive.$inferSelect): StartPermissive {
  return StartPermissive.parse({
    seq_id: r.seqId,
    n: r.n,
    text: r.text,
    signal_tag: r.signalTag,
    standing_bypass_state: r.standingBypassState,
    span_id: r.spanId,
  });
}

/**
 * Every sheet of the corpus, or only those of `tags`, ordered by the equipment tag (never ranked: Case 1 forbids
 * putting one asset's protective function above another's). Five grouped reads joined in memory on the tag, then
 * one span read for the chips. A tag with no sheet simply has no entry; nothing is invented in its place.
 */
export async function readInterlockMatrix(tags?: readonly string[]): Promise<InterlockMatrixView> {
  const filter = tags === undefined ? undefined : [...tags];
  if (filter !== undefined && filter.length === 0) {
    return { sheets: [], citations: {}, totals: emptyTotals() };
  }

  const [lockRows, assetRows, rowRows, permissiveRows] = await Promise.all([
    filter === undefined
      ? db.select().from(interlock).orderBy(asc(interlock.equipmentTag))
      : db.select().from(interlock).where(inArray(interlock.equipmentTag, filter)).orderBy(asc(interlock.equipmentTag)),
    filter === undefined
      ? db.select({ tag: equipment.tag, name: equipment.name, ref: equipment.interlockRef }).from(equipment)
      : db.select({ tag: equipment.tag, name: equipment.name, ref: equipment.interlockRef }).from(equipment).where(inArray(equipment.tag, filter)),
    filter === undefined
      ? db.select().from(interlockRow).orderBy(asc(interlockRow.equipmentTag), asc(interlockRow.rowId))
      : db.select().from(interlockRow).where(inArray(interlockRow.equipmentTag, filter)).orderBy(asc(interlockRow.equipmentTag), asc(interlockRow.rowId)),
    db.select().from(startPermissive).orderBy(asc(startPermissive.seqId), asc(startPermissive.n)),
  ]);

  const docNos = [...new Set(lockRows.map((l) => l.ceDocNo))];
  // The sheet documents by their doc_no, and the open trip-boilerplate findings against them. The finding read
  // follows openFindings (documents-view): state open, no version filter, because a finding is raised against the
  // document, and the surface prints the rule the register itself recorded.
  const documents =
    docNos.length === 0
      ? []
      : await db
          .select({ id: documentTable.id, docNo: documentTable.docNo })
          .from(documentTable)
          .where(and(inArray(documentTable.docNo, docNos), eq(documentTable.class, "interlock")));
  const documentIds = documents.map((d) => d.id);
  const findings =
    documentIds.length === 0
      ? []
      : await db
          .select()
          .from(integrityFinding)
          .where(and(inArray(integrityFinding.documentId, documentIds), eq(integrityFinding.ruleId, TRIP_BOILERPLATE_RULE), eq(integrityFinding.state, "open")))
          .orderBy(asc(integrityFinding.id));

  const idOfDocNo = new Map(documents.flatMap((d) => (d.docNo === null ? [] : [[d.docNo, d.id] as const])));
  const nameOf = new Map(assetRows.map((a) => [a.tag, a] as const));
  const rows = rowRows.map(toRow);
  const permissives = permissiveRows.map(toPermissive);

  const sheets: InterlockSheet[] = lockRows.map((l) => {
    const lock = toInterlock(l);
    const key = lock.seq_id ?? lock.equipment_tag;
    const asset = nameOf.get(lock.equipment_tag);
    const documentId = idOfDocNo.get(lock.ce_doc_no) ?? null;
    const finding = findings.find((f) => f.documentId === documentId) ?? null;
    return {
      interlock: lock,
      equipment: { tag: lock.equipment_tag, name: asset?.name ?? lock.equipment_tag, interlock_ref: asset?.ref ?? "" },
      ce_document_id: documentId,
      rows: rows.filter((r) => r.equipment_tag === lock.equipment_tag),
      permissives: permissives.filter((p) => p.seq_id === key),
      permissive_key: key,
      permissives_keyed_by_tag: lock.seq_id === null,
      boilerplate_finding: finding === null ? null : toFinding(finding),
    };
  });

  const citations = await citationsForSpans([
    ...sheets.flatMap((s) => s.rows.map((r) => r.span_id)),
    ...sheets.flatMap((s) => s.permissives.map((p) => p.span_id)),
    ...sheets.flatMap((s) => s.interlock.notes.map((n) => n.span_id)),
  ]);

  const counted = sheets.flatMap((s) => s.permissives.map(() => s.permissives_keyed_by_tag));
  return {
    sheets,
    citations: Object.fromEntries(citations),
    totals: {
      sheets: sheets.length,
      trip_logic: sheets.filter((s) => s.interlock.logic_kind === "trip_logic").length,
      control_loop: sheets.filter((s) => s.interlock.logic_kind === "control_loop_only").length,
      rows: sheets.reduce((n, s) => n + s.rows.length, 0),
      trip_rows: sheets.reduce((n, s) => n + s.rows.filter((r) => r.row_kind === "trip").length, 0),
      permissives: counted.length,
      permissives_by_logic_no: counted.filter((byTag) => !byTag).length,
      permissives_by_tag: counted.filter((byTag) => byTag).length,
    },
  };
}

function emptyTotals(): InterlockMatrixView["totals"] {
  return {
    sheets: 0,
    trip_logic: 0,
    control_loop: 0,
    rows: 0,
    trip_rows: 0,
    permissives: 0,
    permissives_by_logic_no: 0,
    permissives_by_tag: 0,
  };
}
