// The reads behind Assets (blueprint 6.2 surface 5, 9.3, 9.9 GET /api/assets and GET /api/assets/:tag; AC-CTX-01
// to 03, AC-ASSET). The fleet register joins equipment, area, interlock and the failure_event rows on the tag and
// reconciles the recorded hours against the workbook slice of fixtures.json; the asset page reads the equipment's
// document set, the typed cross-reference edges between those documents, the P&ID sidecar, the cause-and-effect
// sheet with its rows, permissives and notes, the datasheet parameters, the instrument tags with their rows,
// related records and pinned limits, the lessons and the open integrity findings. Drizzle only; every row leaves
// through the generated Zod of 9.3 (ARCHITECTURE 1.4). No figure is computed here that a document or the workbook
// does not state, nothing is ranked, predicted or aggregated by person (Case 1), and no derivative byte is read:
// the surface asks whether the P&ID page has a render and GET /api/documents/:id/pages/:n serves it (INV-7).
import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  Area,
  DatasheetParam,
  Equipment,
  InstrumentTag,
  Interlock,
  InterlockRow,
  PidSidecar,
  StartPermissive,
} from "@/contracts/generated/asset";
import { Document, DocumentClass, DocumentEdge, DocumentRevision } from "@/contracts/generated/document";
import type { Citation } from "@/contracts/generated/evidence_packet";
import { db } from "@/db/client";
import { citationsForSpans, openFindings, toDocument, toRevision, type Finding } from "@/db/queries/documents-view";
import {
  area,
  causalLink,
  datasheetParam,
  documentEdge,
  documentRevision,
  documentTable,
  equipment,
  failureEvent,
  instrumentTag,
  integrityFinding,
  interlock,
  interlockRow,
  opl,
  pageDerivative,
  pidSidecar,
  startPermissive,
  workOrder,
} from "@/db/schema";
import { fixtures } from "@/lib/fixtures";
import { log } from "@/lib/log";

// ---------------------------------------------------------------------------------------------------------------
// The workbook slice the fleet register reconciles against (10.5 `equipment_master`, one row per asset). A loose
// object: the harness may add keys and never renames one. Absent or unparsable, the register says so per row and
// prints no reconciliation figure in its place (blueprint 10.3).
// ---------------------------------------------------------------------------------------------------------------
const MasterRow = z.looseObject({
  tag: z.string(),
  name: z.string(),
  functional_location: z.string(),
  criticality_datasheet: z.string(),
  criticality_workbook: z.string(),
  // Null on an asset the workbook records no LOGIC No for (the control-loop asset), never an empty string.
  interlock_sheet: z.string().nullable(),
  interlock_workbook: z.string().nullable(),
  work_orders: z.number().int(),
  unplanned_rows: z.number().int(),
  planned_flagged_rows: z.number().int(),
  unplanned_h: z.number(),
  flagged_h: z.number(),
});
export type MasterRow = z.infer<typeof MasterRow>;

const AssetFixtures = z.looseObject({ equipment_master: z.array(MasterRow) });

/** The workbook rows by tag, or null when this runtime has no fixture or the file lacks the key. */
export function equipmentMaster(): Map<string, MasterRow> | null {
  if (!fixtures) return null;
  const parsed = AssetFixtures.safeParse(fixtures);
  if (!parsed.success) {
    log.warn({ event: "fixtures.slice_invalid", slice: "equipment_master", issues: parsed.error.issues.length });
    return null;
  }
  return new Map(parsed.data.equipment_master.map((r) => [r.tag, r]));
}

// ---------------------------------------------------------------------------------------------------------------
// Row mappers to the 9.3 shapes (validated on the way out, ARCHITECTURE 1.4)
// ---------------------------------------------------------------------------------------------------------------
function toEquipment(r: typeof equipment.$inferSelect): Equipment {
  return Equipment.parse({
    tag: r.tag,
    name: r.name,
    functional_location: r.functionalLocation,
    area_code: r.areaCode,
    service: r.service,
    criticality_datasheet: r.criticalityDatasheet,
    criticality_workbook: r.criticalityWorkbook,
    interlock_ref: r.interlockRef,
    datasheet_doc_no: r.datasheetDocNo,
    ga_drawing_doc_no: r.gaDrawingDocNo,
    pid_document_id: r.pidDocumentId,
    plot_plan_doc_no: r.plotPlanDocNo,
    ce_doc_no: r.ceDocNo,
  });
}

function toArea(r: typeof area.$inferSelect): Area {
  return Area.parse({
    code: r.code,
    workbook_name: r.workbookName,
    datasheet_name: r.datasheetName,
    opl_header_name: r.oplHeaderName,
    plot_plan_title_name: r.plotPlanTitleName,
  });
}

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

function toSidecar(r: typeof pidSidecar.$inferSelect): PidSidecar {
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

// ---------------------------------------------------------------------------------------------------------------
// The fleet register (/assets, GET /api/assets)
// ---------------------------------------------------------------------------------------------------------------

/** One asset's line of the register: what the sheets state, what the workbook counted, and whether the two agree. */
export type FleetRow = {
  equipment: Equipment;
  area_workbook_name: string;
  /** The sheet's own LOGIC No line, its kind and the SIL it states; null where no cause-and-effect sheet is bound. */
  interlock: { seq_id: string | null; logic_kind: Interlock["logic_kind"]; sil_sheet: number | null } | null;
  work_orders: number;
  unplanned_rows: number;
  planned_flagged_rows: number;
  /** Recorded downtime of the unplanned failure_event rows, and of every breakdown-flagged row. */
  unplanned_hours: number;
  flagged_hours: number;
  lessons: number;
  open_findings: number;
  /** The workbook row of the fixture, or null when this runtime carries no fixture. */
  workbook: MasterRow | null;
};

export type Fleet = {
  rows: FleetRow[];
  /** False when no fixture is readable here: the register prints the recorded figures and states the absence. */
  fixture_available: boolean;
  totals: {
    assets: number;
    areas: number;
    work_orders: number;
    unplanned_hours: number;
    flagged_hours: number;
    /** Documents carrying one of the eight tags as their subject, counted per class. */
    documents: number;
  };
};

/** Hours are numeric(6,1) in the database; the driver returns them as numbers, a null sum as 0 recorded hours. */
const hoursSum = (column: typeof failureEvent.downtimeHours) => sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

/**
 * The eight rows of the register, ordered by tag (never ranked: Case 1 forbids prioritising an asset over another).
 * Six grouped reads, joined in memory on the tag.
 */
export async function readFleet(): Promise<Fleet> {
  const [assets, areas, interlocks, events, orders, lessons, findings, documents] = await Promise.all([
    db.select().from(equipment).orderBy(asc(equipment.tag)),
    db.select().from(area),
    db.select({ tag: interlock.equipmentTag, seqId: interlock.seqId, logicKind: interlock.logicKind, sil: interlock.silSheet }).from(interlock),
    db
      .select({
        tag: failureEvent.equipmentTag,
        kind: failureEvent.breakdownKind,
        rows: count(),
        hours: hoursSum(failureEvent.downtimeHours),
      })
      .from(failureEvent)
      .groupBy(failureEvent.equipmentTag, failureEvent.breakdownKind),
    db.select({ tag: workOrder.equipmentTag, n: count() }).from(workOrder).groupBy(workOrder.equipmentTag),
    db.select({ tag: opl.equipmentTag, n: count() }).from(opl).groupBy(opl.equipmentTag),
    db
      .select({ tag: documentTable.subjectTag, n: count() })
      .from(integrityFinding)
      .innerJoin(documentTable, eq(integrityFinding.documentId, documentTable.id))
      .where(eq(integrityFinding.state, "open"))
      .groupBy(documentTable.subjectTag),
    db.select({ tag: documentTable.subjectTag, n: count() }).from(documentTable).groupBy(documentTable.subjectTag),
  ]);

  const master = equipmentMaster();
  const areaOf = new Map(areas.map((a) => [a.code, a.workbookName]));
  const rows: FleetRow[] = assets.map((a) => {
    const kinds = events.filter((e) => e.tag === a.tag);
    const lock = interlocks.find((i) => i.tag === a.tag) ?? null;
    return {
      equipment: toEquipment(a),
      area_workbook_name: areaOf.get(a.areaCode) ?? a.areaCode,
      interlock: lock ? { seq_id: lock.seqId, logic_kind: lock.logicKind, sil_sheet: lock.sil } : null,
      work_orders: orders.find((o) => o.tag === a.tag)?.n ?? 0,
      unplanned_rows: kinds.find((e) => e.kind === "unplanned")?.rows ?? 0,
      planned_flagged_rows: kinds.find((e) => e.kind === "planned_flagged")?.rows ?? 0,
      unplanned_hours: kinds.find((e) => e.kind === "unplanned")?.hours ?? 0,
      flagged_hours: kinds.reduce((s, e) => s + e.hours, 0),
      lessons: lessons.find((l) => l.tag === a.tag)?.n ?? 0,
      open_findings: findings.find((f) => f.tag === a.tag)?.n ?? 0,
      workbook: master?.get(a.tag) ?? null,
    };
  });

  return {
    rows,
    fixture_available: master !== null,
    totals: {
      assets: rows.length,
      areas: new Set(rows.map((r) => r.equipment.area_code)).size,
      work_orders: rows.reduce((s, r) => s + r.work_orders, 0),
      unplanned_hours: rows.reduce((s, r) => s + r.unplanned_hours, 0),
      flagged_hours: rows.reduce((s, r) => s + r.flagged_hours, 0),
      documents: documents.filter((d) => d.tag !== null && rows.some((r) => r.equipment.tag === d.tag)).reduce((s, d) => s + d.n, 0),
    },
  };
}

/**
 * True when the recorded hours, the record count and the workbook criticality of this line all equal the workbook
 * row the harness recomputed; null without a fixture row. The LOGIC No is shown verbatim beside it and is not part
 * of the claim: the workbook records none for an asset whose sheet is a control loop.
 */
export function reconciled(row: FleetRow): boolean | null {
  if (!row.workbook) return null;
  return (
    row.workbook.unplanned_h === row.unplanned_hours &&
    row.workbook.flagged_h === row.flagged_hours &&
    row.workbook.work_orders === row.work_orders &&
    row.workbook.criticality_workbook === row.equipment.criticality_workbook
  );
}

// ---------------------------------------------------------------------------------------------------------------
// One asset (/assets/:tag, GET /api/assets/:tag)
// ---------------------------------------------------------------------------------------------------------------

/** The six document classes the asset page tabs through, in the 6.2 order; the label is the tab's own wording. */
export const DOCUMENT_TABS = [
  { class: "datasheet", label: "Datasheet" },
  { class: "ga_drawing", label: "GA drawing" },
  { class: "pid", label: "P&ID" },
  { class: "interlock", label: "Cause-and-effect sheet" },
  { class: "plot_plan", label: "Plot plan" },
  { class: "opl", label: "Lessons" },
] as const satisfies ReadonlyArray<{ class: DocumentClass; label: string }>;

export type DocumentTab = (typeof DOCUMENT_TABS)[number]["class"];

export const DOCUMENT_TAB_CLASSES: DocumentTab[] = DOCUMENT_TABS.map((t) => t.class);

export function isDocumentTab(value: string | undefined): value is DocumentTab {
  return value !== undefined && (DOCUMENT_TAB_CLASSES as string[]).includes(value);
}

/** One document of the asset's set with the revision the visible lineage serves and its open finding rule ids. */
export type AssetDocument = {
  document: Document;
  current: DocumentRevision | null;
  /** How many superseded revisions the lineage holds; the viewer's labelled toggle is the only way to see them. */
  superseded: number;
  open_finding_rule_ids: string[];
  /** Why this document is on the asset: the equipment column that names it, or the document's own subject tag. */
  binding: string;
};

/** One typed edge between two documents of the asset's set, with the span that carries the cross-reference. */
export type AssetEdge = {
  edge: DocumentEdge;
  from: { id: string; doc_no: string | null; class: DocumentClass };
  to: { id: string; doc_no: string | null; class: DocumentClass };
  citation: Citation | null;
};

/** One instrument tag of the asset with everything the TagCard prints. */
export type TagView = {
  tag: InstrumentTag;
  rows: InterlockRow[];
  work_orders: Array<{ wo_number: string; chain_place: string | null; root_cause: string }>;
  limits: DatasheetParam[];
};

export type LessonRow = {
  opl_id: string;
  document_id: string;
  title: string;
  discipline: string;
  classification: string;
  aspect: string;
  machine_drafted: boolean;
  approver_alias: string | null;
  date_of_sharing: string;
  related_interlock_text: string;
};

export type AssetView = {
  equipment: Equipment;
  area: Area;
  documents: AssetDocument[];
  edges: AssetEdge[];
  sidecar: PidSidecar | null;
  /** Whether page 1 of the P&ID has a stored derivative; false renders the designed no-underlay state (6.3). */
  pid_page_available: boolean;
  interlock: Interlock | null;
  rows: InterlockRow[];
  permissives: StartPermissive[];
  params: DatasheetParam[];
  tags: TagView[];
  lessons: LessonRow[];
  integrity_findings: Finding[];
  /** Every span this page cites, resolved to its 9.8 Citation so each chip lands on `#page=n&span=<span_id>`. */
  citations: Record<string, Citation>;
};

/** The narrative fields a work order records; a tag is "related" when the record's own text names it. */
const NARRATIVE = [
  workOrder.problemDescription,
  workOrder.rootCause,
  workOrder.correctiveAction,
  workOrder.remarks,
] as const;

/** The basis line the surface prints under the related records; the binding is the record's own words. */
export const RELATED_WORK_ORDER_BASIS =
  "Related where the record's own Problem_Description, Root_Cause, Corrective_Action or Remarks names the tag.";

/** The chain place of a record, from the causal_link package artefact; never computed at read time (9.4). */
function chainPlace(links: ReadonlyArray<typeof causalLink.$inferSelect>, woNumber: string): string | null {
  const place = links.find((l) => l.fromWo === woNumber || l.toWo === woNumber);
  if (!place) return null;
  const side = place.fromWo === woNumber ? "earlier hop" : "later hop";
  return `${place.id} ${side}, ${place.mechanismNoun}, ${place.intervalDays} days`;
}

/**
 * The whole asset page in one read (blueprint 6.2 surface 5). `versionIds` are the corpus versions this visitor
 * sees (src/auth/sandbox.ts): a revision outside them is not served, and a document whose lineage carries no
 * visible revision still prints with its class and its bindings, stating that no revision is served here.
 */
export async function readAsset(tag: string, versionIds: readonly string[]): Promise<AssetView | null> {
  const [eq_] = await db.select().from(equipment).where(eq(equipment.tag, tag)).limit(1);
  if (!eq_) return null;
  const [area_] = await db.select().from(area).where(eq(area.code, eq_.areaCode)).limit(1);
  if (!area_) return null;

  const boundDocNos = [eq_.datasheetDocNo, eq_.gaDrawingDocNo, eq_.plotPlanDocNo, eq_.ceDocNo];
  const bindingOf = new Map<string, string>([
    [eq_.datasheetDocNo, "equipment.datasheet_doc_no"],
    [eq_.gaDrawingDocNo, "equipment.ga_drawing_doc_no"],
    [eq_.plotPlanDocNo, "equipment.plot_plan_doc_no"],
    [eq_.ceDocNo, "equipment.ce_doc_no"],
  ]);

  // The asset's document set: the four typed classes by doc_no, the P&ID by id (TJC-LLD-PID-XXXX repeats across
  // sheets, so the id is the only safe key), and every document whose own subject_tag is this asset (the lessons).
  const docRows = await db
    .select()
    .from(documentTable)
    .where(or(eq(documentTable.id, eq_.pidDocumentId), eq(documentTable.subjectTag, tag), inArray(documentTable.docNo, boundDocNos)))
    .orderBy(asc(documentTable.class), asc(documentTable.docNo), asc(documentTable.id));
  const documentIds = docRows.map((d) => d.id);

  const [revisionRows, findingRuleRows, sidecarRow, derivative, lockRows, rowRows, permissiveRows, paramRows, tagRows, oplRows, edgeRows, links] =
    await Promise.all([
      versionIds.length === 0
        ? []
        : db
            .select()
            .from(documentRevision)
            .where(and(inArray(documentRevision.documentId, documentIds), inArray(documentRevision.corpusVersionId, [...versionIds]))),
      db
        .selectDistinct({ documentId: integrityFinding.documentId, ruleId: integrityFinding.ruleId })
        .from(integrityFinding)
        .where(and(inArray(integrityFinding.documentId, documentIds), eq(integrityFinding.state, "open")))
        .orderBy(asc(integrityFinding.documentId), asc(integrityFinding.ruleId)),
      db.select().from(pidSidecar).where(eq(pidSidecar.documentId, eq_.pidDocumentId)).limit(1),
      db
        .select({ page: pageDerivative.page })
        .from(pageDerivative)
        .where(and(eq(pageDerivative.documentId, eq_.pidDocumentId), eq(pageDerivative.page, 1)))
        .limit(1),
      db.select().from(interlock).where(eq(interlock.equipmentTag, tag)).limit(1),
      db.select().from(interlockRow).where(eq(interlockRow.equipmentTag, tag)).orderBy(asc(interlockRow.rowId)),
      db.select().from(startPermissive).orderBy(asc(startPermissive.n)),
      db
        .select()
        .from(datasheetParam)
        .where(eq(datasheetParam.equipmentTag, tag))
        .orderBy(asc(datasheetParam.group), asc(datasheetParam.id)),
      db.select().from(instrumentTag).where(eq(instrumentTag.equipmentTag, tag)).orderBy(asc(instrumentTag.tag)),
      db.select().from(opl).where(eq(opl.equipmentTag, tag)).orderBy(asc(opl.oplId)),
      db
        .select({
          edge: documentEdge,
          fromClass: documentTable.class,
          fromDocNo: documentTable.docNo,
        })
        .from(documentEdge)
        .innerJoin(documentTable, eq(documentEdge.fromDocumentId, documentTable.id))
        .where(and(inArray(documentEdge.fromDocumentId, documentIds), inArray(documentEdge.toDocumentId, documentIds)))
        .orderBy(asc(documentEdge.edgeKind), asc(documentTable.docNo), asc(documentEdge.sourceSpanId)),
      db.select().from(causalLink).where(eq(causalLink.equipmentTag, tag)),
    ]);

  const lock = lockRows[0] ? toInterlock(lockRows[0]) : null;
  const rows = rowRows.map(toInterlockRow);
  // The sheet files its permissives under its LOGIC No, or under the equipment tag where it states none (the
  // control-loop sheet): keying on seq_id alone drops that block silently. AC-CTX-03.
  const permissiveKey = lock ? (lock.seq_id ?? lock.equipment_tag) : null;
  const permissives = permissiveKey === null ? [] : permissiveRows.filter((p) => p.seqId === permissiveKey).map(toPermissive);
  const params = paramRows.map(toParam);
  const sidecar = sidecarRow[0] ? toSidecar(sidecarRow[0]) : null;

  const findingRules = new Map<string, string[]>();
  for (const r of findingRuleRows) {
    if (r.documentId === null) continue;
    findingRules.set(r.documentId, [...(findingRules.get(r.documentId) ?? []), r.ruleId]);
  }

  const revisions = revisionRows.map(toRevision);
  const documents: AssetDocument[] = docRows.map((d) => {
    const own = revisions.filter((r) => r.document_id === d.id);
    return {
      document: toDocument(d),
      current: own.find((r) => r.is_current) ?? null,
      superseded: own.filter((r) => !r.is_current).length,
      open_finding_rule_ids: findingRules.get(d.id) ?? [],
      binding:
        d.id === eq_.pidDocumentId
          ? "equipment.pid_document_id"
          : (d.docNo !== null ? bindingOf.get(d.docNo) : undefined) ?? "document.subject_tag",
    };
  });
  const classOf = new Map(docRows.map((d) => [d.id, { id: d.id, doc_no: d.docNo, class: d.class }] as const));

  // Every span the page cites: the sheet's rows, permissives and notes, and every datasheet parameter, plus the
  // span each edge came from (AC-CTX-01: an edge is a document cross-reference, and its chip proves it).
  const citations = await citationsForSpans([
    ...rows.map((r) => r.span_id),
    ...permissives.map((p) => p.span_id),
    ...(lock?.notes ?? []).map((n) => n.span_id),
    ...params.map((p) => p.span_id),
    ...edgeRows.map((e) => e.edge.sourceSpanId),
  ]);

  const edges: AssetEdge[] = edgeRows.flatMap((e) => {
    const from = classOf.get(e.edge.fromDocumentId);
    const to = classOf.get(e.edge.toDocumentId);
    if (!from || !to) return [];
    return [
      {
        edge: DocumentEdge.parse({
          from_document_id: e.edge.fromDocumentId,
          to_document_id: e.edge.toDocumentId,
          edge_kind: e.edge.edgeKind,
          source_span_id: e.edge.sourceSpanId,
        }),
        from,
        to,
        citation: citations.get(e.edge.sourceSpanId) ?? null,
      },
    ];
  });

  // Related records per instrument tag: one grouped read over the asset's own work orders whose narrative names a
  // tag. The tags come from instrument_tag rows, never from user text, and Drizzle parameterises the pattern.
  const tagNames = tagRows.map((t) => t.tag);
  const related =
    tagNames.length === 0
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
          .where(and(eq(workOrder.equipmentTag, tag), or(...tagNames.flatMap((t) => NARRATIVE.map((f) => ilike(f, `%${t}%`))))))
          .orderBy(asc(workOrder.woNumber));

  const spots = params.filter((p) => p.group === "datasheet_spot");
  const tags: TagView[] = tagRows.map((t) => {
    const name = t.tag.toLowerCase();
    const names = related.filter((w) =>
      [w.problem, w.cause, w.action, w.remarks].some((f) => (f ?? "").toLowerCase().includes(name)),
    );
    return {
      tag: toInstrumentTag(t),
      rows: rows.filter((r) => r.instrument_tag === t.tag),
      work_orders: names.map((w) => ({ wo_number: w.woNumber, chain_place: chainPlace(links, w.woNumber), root_cause: w.cause })),
      limits: spots,
    };
  });

  const revisionDocumentOf = new Map(revisions.map((r) => [r.id, r.document_id] as const));
  const lessons: LessonRow[] = oplRows.flatMap((o) => {
    const documentId = revisionDocumentOf.get(o.documentRevisionId);
    if (documentId === undefined) return [];
    return [
      {
        opl_id: o.oplId,
        document_id: documentId,
        title: o.title,
        discipline: o.discipline,
        classification: o.classification,
        aspect: o.aspect,
        machine_drafted: o.machineDrafted,
        approver_alias: o.approverAlias,
        date_of_sharing: o.footer.date_of_sharing,
        related_interlock_text: o.relatedInterlockText,
      },
    ];
  });

  return {
    equipment: toEquipment(eq_),
    area: toArea(area_),
    documents,
    edges,
    sidecar,
    pid_page_available: derivative.length > 0,
    interlock: lock,
    rows,
    permissives,
    params,
    tags,
    lessons,
    integrity_findings: await openFindings(documentIds),
    citations: Object.fromEntries(citations),
  };
}

/** The 9.3 label of a document class wherever the asset surface names one; the enum stays beside it in mono. */
export const TAB_LABEL: Record<DocumentTab, string> = Object.fromEntries(DOCUMENT_TABS.map((t) => [t.class, t.label])) as Record<
  DocumentTab,
  string
>;

/** 9.2 DocumentEdge.edge_kind, in words, for the edge list under the tabs. */
export const EDGE_KIND_LABEL: Record<DocumentEdge["edge_kind"], string> = {
  cross_reference: "cross-reference in the body text",
  assoc_docs: "associated-documents block",
  note: "sheet note",
  label: "header or title-block label",
};

/** Blueprint 6.3: the note of a cause-and-effect sheet that declares its setpoints training values. */
export function isTrainingValuesNote(text: string): boolean {
  return /training value/i.test(text);
}
