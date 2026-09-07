// The P&ID sidecar read (blueprint 9.3 PidSidecar, ARCHITECTURE 7 step 8; deviation D-12 and ADR-007). The eight
// sheets are images: `pdftotext -raw` extracts nothing from them, so a P&ID revision carries no span, no chunk and
// therefore no Citation of its own. What the sheets state reaches the lane only through the adopted sidecars, and
// those were transcribed by an agent under the alias EXEC-1 with review_status "pending": every reading served from
// one says so, and none of them is ever given the citation of another document (INV-3, "provenance or nothing").
//
// This is a keyed read by document id, the same shape as every other read of the answer lane. It lives outside
// src/db/queries/retrieval.ts on purpose: tests/fixtures/answer/asset.ts declares its in-memory fake as
// `typeof import("@/db/queries/retrieval")`, so a new value export there would make that fixture (a test-author
// file) fail to compile and the mocked module would answer undefined at run time.
//
// `readPidSheet` is the read behind the hotspot layer of the document viewer (blueprint 6.2 surface 4 and 6.4
// HotspotLayer; AC-CTX-02). A hotspot's bound_tag is not a claim of its own: it opens only what a typed row of the
// seeded corpus already carries under that tag, which is the cause-and-effect row on the instrument tag, the
// datasheet cell whose value is the tag, and the work orders of the sheet's own asset whose narrative names it.
// A hotspot the sidecar bound to nothing carries the sidecar's own reason and opens nothing.
import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { DatasheetParam, InstrumentTag, InterlockRow, PidSidecar } from "@/contracts/generated/asset";
import type { Citation } from "@/contracts/generated/evidence_packet";
import { db, type Db } from "@/db/client";
import { citationsForSpans } from "@/db/queries/documents-view";
import {
  causalLink,
  datasheetParam,
  equipment,
  instrumentTag,
  interlockRow,
  pageDerivative,
  pidSidecar,
  workOrder,
} from "@/db/schema";

export type PidSidecarRow = typeof pidSidecar.$inferSelect;

export type Hotspot = PidSidecar["hotspots"][number];

/** The sidecars of the given P&ID documents, by set number. An empty id list returns empty without a round trip. */
export async function pidSidecarsOf(db_: Db, documentIds: readonly string[]): Promise<PidSidecarRow[]> {
  const distinct = [...new Set(documentIds)];
  if (distinct.length === 0) return [];
  return db_
    .select()
    .from(pidSidecar)
    .where(inArray(pidSidecar.documentId, distinct))
    .orderBy(asc(pidSidecar.set));
}

function toSidecar(r: PidSidecarRow): PidSidecar {
  return PidSidecar.parse({
    set: r.set,
    document_id: r.documentId,
    title_box: r.titleBox,
    reference_box: r.referenceBox,
    notes: r.notes,
    equipment_shown: r.equipmentShown,
    hotspots: r.hotspots,
    defects: r.defects,
    provenance: r.provenance,
  });
}

function toInterlockRow(r: typeof interlockRow.$inferSelect): InterlockRow {
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

function toParam(r: typeof datasheetParam.$inferSelect): DatasheetParam {
  return DatasheetParam.parse({
    id: r.id,
    equipment_tag: r.equipmentTag,
    group: r.group,
    field: r.field,
    unit: r.unit,
    value_text: r.valueText,
    value_num: r.valueNum,
    span_id: r.spanId,
  });
}

function toInstrumentTag(r: typeof instrumentTag.$inferSelect): InstrumentTag {
  return InstrumentTag.parse({ tag: r.tag, equipment_tag: r.equipmentTag, role: r.role, sources: r.sources });
}

/** One work order the sheet's asset recorded whose own narrative names the tag, with its place in a frozen chain. */
export type RelatedWorkOrder = { wo_number: string; root_cause: string; chain_place: string | null };

/** What one bound tag opens: the typed rows of the seeded corpus that carry it, and nothing else. */
export type PidTypedRows = {
  tag: string;
  instrument: InstrumentTag | null;
  interlock_rows: InterlockRow[];
  datasheet_params: DatasheetParam[];
  work_orders: RelatedWorkOrder[];
};

/** The selected hotspot; `typed` is null on a hotspot the sidecar bound to nothing, which opens no row at all. */
export type PidSelection = { hotspot: Hotspot; typed: PidTypedRows | null };

export type PidSheetView = {
  sidecar: PidSidecar;
  /** The asset whose `equipment.pid_document_id` is this sheet; null when no equipment column names it. */
  equipment_tag: string | null;
  /** Whether page 1 of this document carries a stored derivative; false renders the stated-absence plate (6.3). */
  page_available: boolean;
  /** The bound tags of this sheet a typed row already carries, so a pin knows whether it opens one. */
  typed_tags: string[];
  /** The hotspot the address selected with what its tag opens; null when the address selected none. */
  selected: PidSelection | null;
  /** Every span the selected typed rows cite, resolved to its 9.8 Citation for the chips. */
  citations: Record<string, Citation>;
};

/** The narrative fields a work order records; a tag is related when the record's own text names it (assets.ts). */
const NARRATIVE = [
  workOrder.problemDescription,
  workOrder.rootCause,
  workOrder.correctiveAction,
  workOrder.remarks,
] as const;

/** The chain place of a record, from the causal_link package artefact; never computed at read time (9.4). */
function chainPlace(links: ReadonlyArray<typeof causalLink.$inferSelect>, woNumber: string): string | null {
  const place = links.find((l) => l.fromWo === woNumber || l.toWo === woNumber);
  if (!place) return null;
  const side = place.fromWo === woNumber ? "earlier hop" : "later hop";
  return `${place.id} ${side}, ${place.mechanismNoun}, ${place.intervalDays} days`;
}

/**
 * The sheet behind `/documents/:id` when the document is a P&ID (blueprint 6.2 surface 4; AC-CTX-02). One read:
 * the sidecar, whether the sheet has an underlay, what every bound tag of the set opens, and the full typed rows of
 * the one hotspot the address selected. `hotspotId` is address text: it selects only when the set carries a
 * hotspot of that id, so nothing typed into the query string ever reaches a query.
 */
export async function readPidSheet(documentId: string, hotspotId: string | null): Promise<PidSheetView | null> {
  const [row] = await db.select().from(pidSidecar).where(eq(pidSidecar.documentId, documentId)).limit(1);
  if (!row) return null;
  const sidecar = toSidecar(row);

  const tags = [...new Set(sidecar.hotspots.flatMap((h) => (h.bound_tag === null ? [] : [h.bound_tag])))].sort();
  const [ownerRows, derivative, rowRows, paramRows, tagRows] = await Promise.all([
    db.select({ tag: equipment.tag }).from(equipment).where(eq(equipment.pidDocumentId, documentId)).limit(1),
    db
      .select({ page: pageDerivative.page })
      .from(pageDerivative)
      .where(and(eq(pageDerivative.documentId, documentId), eq(pageDerivative.page, 1)))
      .limit(1),
    tags.length === 0
      ? []
      : db.select().from(interlockRow).where(inArray(interlockRow.instrumentTag, tags)).orderBy(asc(interlockRow.id)),
    tags.length === 0
      ? []
      : db.select().from(datasheetParam).where(inArray(datasheetParam.valueText, tags)).orderBy(asc(datasheetParam.id)),
    tags.length === 0 ? [] : db.select().from(instrumentTag).where(inArray(instrumentTag.tag, tags)),
  ]);
  const equipmentTag = ownerRows[0]?.tag ?? null;

  // The related records of the sheet's own asset, exactly as the asset page binds them: the record's own words.
  const related =
    tags.length === 0 || equipmentTag === null
      ? []
      : await db
          .select({
            woNumber: workOrder.woNumber,
            problem: workOrder.problemDescription,
            cause: workOrder.rootCause,
            action: workOrder.correctiveAction,
            remarks: workOrder.remarks,
          })
          .from(workOrder)
          .where(
            and(eq(workOrder.equipmentTag, equipmentTag), or(...tags.flatMap((t) => NARRATIVE.map((f) => ilike(f, `%${t}%`))))),
          )
          .orderBy(asc(workOrder.woNumber));
  const woNumbers = related.map((w) => w.woNumber);
  const links =
    woNumbers.length === 0
      ? []
      : await db
          .select()
          .from(causalLink)
          .where(or(inArray(causalLink.fromWo, woNumbers), inArray(causalLink.toWo, woNumbers)))
          .orderBy(asc(causalLink.id));

  const typedOf = (tag: string): PidTypedRows => {
    const name = tag.toLowerCase();
    return {
      tag,
      instrument: tagRows.filter((t) => t.tag === tag).map(toInstrumentTag)[0] ?? null,
      interlock_rows: rowRows.filter((r) => r.instrumentTag === tag).map(toInterlockRow),
      datasheet_params: paramRows.filter((p) => p.valueText === tag).map(toParam),
      work_orders: related
        .filter((w) => [w.problem, w.cause, w.action, w.remarks].some((f) => (f ?? "").toLowerCase().includes(name)))
        .map((w) => ({ wo_number: w.woNumber, root_cause: w.cause, chain_place: chainPlace(links, w.woNumber) })),
    };
  };
  const opensARow = (t: PidTypedRows): boolean =>
    t.interlock_rows.length > 0 || t.datasheet_params.length > 0 || t.work_orders.length > 0;

  const typedTags = tags.filter((t) => opensARow(typedOf(t)));
  const hotspot = hotspotId === null ? null : (sidecar.hotspots.find((h) => h.id === hotspotId) ?? null);
  const selected: PidSelection | null =
    hotspot === null ? null : { hotspot, typed: hotspot.bound_tag === null ? null : typedOf(hotspot.bound_tag) };
  const typed = selected?.typed ?? null;
  const spanIds =
    typed === null ? [] : [...typed.interlock_rows.map((r) => r.span_id), ...typed.datasheet_params.map((p) => p.span_id)];

  return {
    sidecar,
    equipment_tag: equipmentTag,
    page_available: derivative.length > 0,
    typed_tags: typedTags,
    selected,
    citations: Object.fromEntries(await citationsForSpans(spanIds)),
  };
}
