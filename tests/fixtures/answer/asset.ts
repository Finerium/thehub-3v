// A synthetic asset for the query-level answer-lane tests (src/answer/{scope,retrieve,permit,templates}.test.ts;
// ARCHITECTURE section 7 steps 5, 6 and 8; AC-ANS-01, AC-ANS-15, AC-ANS-16, AC-NFR-06): one pump GA-9901A with a
// C&E sheet, a datasheet (with its own contradiction), a GA drawing, a plot plan, two approved lessons, a workbook
// page and a neighbouring asset LV-9902 that only a named family link may reach. `fakeQueries` is an in-memory
// implementation of every function of src/db/queries/retrieval.ts over these rows, typed against the real module so
// a renamed query fails here first; the row order it returns is `chunkOrder`, which a test may permute to prove the
// rerank is order-independent. Every document number carries the SYN- prefix and no text is corpus text.
import { quoteHash } from "@/lib/hash";

import type * as q from "@/db/queries/retrieval";

type Queries = typeof import("@/db/queries/retrieval");

export type RevisionRow = q.RevisionRow;
export type DocumentRow = q.DocumentRow;
export type EdgeRow = q.EdgeRow;
export type SpanSource = q.SpanSource;
export type PageSpan = q.PageSpan;
export type ChunkCandidate = q.ChunkCandidate;
export type EquipmentRow = q.EquipmentRow;
export type AreaRow = q.AreaRow;
export type InstrumentTagRow = q.InstrumentTagRow;
export type FamilyRow = q.FamilyRow;
export type InterlockRowType = q.InterlockRowType;
export type InterlockRowRow = q.InterlockRowRow;
export type PermissiveRow = q.PermissiveRow;
export type DatasheetParamRow = q.DatasheetParamRow;
export type ProofTestRow = q.ProofTestRow;
export type WorkOrderRow = q.WorkOrderRow;
export type CausalLinkRow = q.CausalLinkRow;
export type BomMatchRow = q.BomMatchRow;
export type BomItemRow = q.BomItemRow;
export type OplRow = q.OplRow;
export type OplStepRow = q.OplStepRow;
export type TroubleshootingRowRow = q.TroubleshootingRowRow;

/** A wide row from the columns a test names; Partial<T> keeps every name and type honest, the rest stay absent. */
function row<T extends object>(partial: Partial<T>): T {
  return partial as T;
}

export const VERSION_ID = "cv-1";
export const TAG = "GA-9901A";
export const OTHER_TAG = "LV-9902";
export const SEQ = "SEQ-9901";
export const LESSON_1 = "SYN-OPL-GA-9901A-01";
export const LESSON_2 = "SYN-OPL-GA-9901A-07";

export const documents: DocumentRow[] = [
  { id: "doc-ds-9901a", docNo: "SYN-DS-GA-9901A", class: "datasheet", subjectTag: TAG },
  { id: "doc-il-9901a", docNo: "SYN-IL-GA-9901A", class: "interlock", subjectTag: TAG },
  { id: "doc-ga-9901a", docNo: "SYN-GA-GA-9901A", class: "ga_drawing", subjectTag: TAG },
  { id: "doc-pid-9901a", docNo: "SYN-PID-GA-9901A", class: "pid", subjectTag: TAG },
  { id: "doc-pp-99", docNo: "SYN-PP-AREA-99", class: "plot_plan", subjectTag: null },
  { id: "doc-opl-9901a-01", docNo: LESSON_1, class: "opl", subjectTag: TAG },
  { id: "doc-opl-9901a-07", docNo: LESSON_2, class: "opl", subjectTag: TAG },
  { id: "doc-wb", docNo: "SYN-WB-MAINT", class: "workbook", subjectTag: null },
  { id: "doc-ds-9902", docNo: "SYN-DS-LV-9902", class: "datasheet", subjectTag: OTHER_TAG },
  { id: "doc-note", docNo: "SYN-NOTE", class: "organiser_note", subjectTag: null },
];

function revision(id: string, documentId: string, rev: string, status: RevisionRow["approvalStatus"], isCurrent: boolean): RevisionRow {
  return {
    id,
    documentId,
    revision: rev,
    approvalStatus: status,
    approvalStatusText: status.toUpperCase().replace(/_/g, " "),
    revisionDate: null,
    preparedByAlias: null,
    reviewedByAlias: null,
    approvedByAlias: null,
    dateOfSharing: null,
    isCurrent,
    corpusVersionId: VERSION_ID,
  };
}

export const revisions: RevisionRow[] = [
  revision("rev-ds-3", "doc-ds-9901a", "3", "issued_for_operation", true),
  revision("rev-ds-2", "doc-ds-9901a", "2", "issued_for_operation", false),
  revision("rev-ds-1", "doc-ds-9901a", "1", "issued_for_review", false),
  revision("rev-il-2", "doc-il-9901a", "2", "issued_for_operation", true),
  revision("rev-ga-0", "doc-ga-9901a", "0", "issued_for_construction", true),
  revision("rev-pid-0", "doc-pid-9901a", "0", "issued_for_construction", true),
  revision("rev-pp-0", "doc-pp-99", "0", "issued_for_construction", true),
  revision("rev-opl1", "doc-opl-9901a-01", "-", "approved", true),
  revision("rev-opl2", "doc-opl-9901a-07", "-", "approved", true),
  revision("rev-wb", "doc-wb", "-", "unknown", true),
  revision("rev-ds-9902", "doc-ds-9902", "1", "issued_for_operation", true),
  revision("rev-note", "doc-note", "-", "unknown", true),
];

const revisionById = new Map(revisions.map((r) => [r.id, r] as const));
const documentById = new Map(documents.map((d) => [d.id, d] as const));

function span(id: string, revisionId: string, page: number, startOrdinal: number, text: string): SpanSource {
  const rev = revisionById.get(revisionId);
  const doc = rev ? documentById.get(rev.documentId) : undefined;
  if (!rev || !doc) throw new Error(`fixture span ${id}: unknown revision ${revisionId}`);
  return {
    spanId: id,
    page,
    quoteHash: quoteHash(text),
    anchorText: text,
    startOrdinal,
    revisionId,
    revision: rev.revision,
    approvalStatus: rev.approvalStatus,
    approvalStatusText: rev.approvalStatusText,
    isCurrent: rev.isCurrent,
    documentId: doc.id,
    docNo: doc.docNo,
    documentClass: doc.class,
    subjectTag: doc.subjectTag,
  };
}

export const STEP_TEXTS = ["Isolate the motor at the MCC and apply LOTO.", "Remove the coupling guard and inspect the element.", "Torque the bolts to 45 Nm."] as const;
export const PERMIT_LINE_1 = "Work permit and LOTO on the motor breaker required.";
export const PERMIT_LINE_OTHER_LESSON = "Car-seal removal permit required.";
export const PERMIT_LINE_NO_SPAN = "A line that resolves to no span.";

export const spans: SpanSource[] = [
  span("sp-il-1", "rev-il-2", 1, 1, "VSHH-9901 High-high vibration 7.1 mm/s 1oo2 TRIP MOTOR GA-9901A"),
  span("sp-il-2", "rev-il-2", 1, 2, "VSH-9901 High vibration 4.5 mm/s alarm"),
  span("sp-il-3", "rev-il-2", 1, 3, "PSLL-9901 Low-low suction pressure 1.2 barg 1oo1 TRIP MOTOR GA-9901A"),
  span("sp-il-4", "rev-il-2", 1, 4, "PSV-9901 relief 10 barg"),
  span("sp-il-5", "rev-il-2", 2, 1, "1. Suction valve OPEN ZSO-9901"),
  span("sp-il-6", "rev-il-2", 2, 2, "2. Seal flush established PDI-9901"),
  span("sp-il-7", "rev-il-2", 2, 3, "Note 1: Trip set points are training values."),
  span("sp-il-8", "rev-il-2", 2, 4, "Note 2: A trip is latched and requires a manual reset once the cause has cleared."),
  span("sp-ds-1", "rev-ds-3", 1, 1, "Design pressure 8.5 barg"),
  span("sp-ds-2", "rev-ds-3", 1, 2, "Vibration normal 2.0 mm/s"),
  span("sp-ds-3", "rev-ds-3", 1, 3, "Area classification Zone 2"),
  span("sp-ds-4", "rev-ds-3", 1, 4, "Ex protection Ex d IIB T3"),
  span("sp-ds-5", "rev-ds-3", 1, 5, "Service Crude naphtha"),
  span("sp-ds-6", "rev-ds-3", 2, 1, "PSV set pressure 10 barg"),
  span("sp-ds-7", "rev-ds-3", 2, 2, "Design pressure 8.0 barg"),
  span("sp-ds-old", "rev-ds-2", 1, 1, "Design pressure 8.0 barg (superseded)"),
  span("sp-ga-1", "rev-ga-0", 1, 1, "12 Coupling element Polyurethane 1"),
  span("sp-opl1-t", "rev-opl1", 1, 1, `${LESSON_1} Coupling element inspection and replacement GA-9901A`),
  span("sp-opl1-p", "rev-opl1", 1, 2, PERMIT_LINE_1),
  span("sp-opl1-s1", "rev-opl1", 2, 1, STEP_TEXTS[0]),
  span("sp-opl1-s2", "rev-opl1", 2, 2, STEP_TEXTS[1]),
  span("sp-opl1-s3", "rev-opl1", 2, 3, STEP_TEXTS[2]),
  span("sp-opl2-t", "rev-opl2", 1, 1, `${LESSON_2} Seal flush line-up GA-9901A`),
  span("sp-opl2-p", "rev-opl2", 1, 2, PERMIT_LINE_OTHER_LESSON),
  span("sp-wb-1", "rev-wb", 12, 1, "WO-990010 Coupling element worn, high vibration VSHH-9901"),
  span("sp-wb-2", "rev-wb", 12, 2, "WO-990011 Seal leak at the drive end"),
  span("sp-wb-3", "rev-wb", 13, 1, "WO-990001 SIS proof test SEQ-9901 Pass"),
  span("sp-wb-4", "rev-wb", 13, 2, "WO-990003 Calibration of VSHH-9901 Pass"),
  span("sp-9902-1", "rev-ds-9902", 1, 1, "LV-9902 Design pressure 5 barg"),
];

const spanById = new Map(spans.map((s) => [s.spanId, s] as const));

/** Open integrity findings per document (9.8 Citation.integrity_findings). */
export const findings = new Map<string, string[]>([["doc-ds-9901a", ["IR-03"]]]);

export const equipment: EquipmentRow[] = [
  row<EquipmentRow>({
    tag: TAG,
    name: "Feed pump A",
    functionalLocation: "99-GA-9901A",
    areaCode: "99",
    service: "Crude naphtha",
    criticalityDatasheet: "HIGH CRITICAL",
    criticalityWorkbook: "A",
    interlockRef: SEQ,
    datasheetDocNo: "SYN-DS-GA-9901A",
    gaDrawingDocNo: "SYN-GA-GA-9901A",
    pidDocumentId: "doc-pid-9901a",
    plotPlanDocNo: "SYN-PP-AREA-99",
    ceDocNo: "SYN-IL-GA-9901A",
  }),
  row<EquipmentRow>({
    tag: OTHER_TAG,
    name: "Feed control valve",
    functionalLocation: "99-LV-9902",
    areaCode: "99",
    service: "Crude naphtha",
    criticalityDatasheet: "LOW CRITICAL",
    criticalityWorkbook: "B",
    interlockRef: "",
    datasheetDocNo: "SYN-DS-LV-9902",
    gaDrawingDocNo: "SYN-GA-LV-9902",
    pidDocumentId: "doc-pid-9902",
    plotPlanDocNo: "SYN-PP-AREA-99",
    ceDocNo: "SYN-IL-LV-9902",
  }),
];

export const areas: AreaRow[] = [
  row<AreaRow>({ code: "99", workbookName: "Feed Area", datasheetName: "Unit 99 Feed", oplHeaderName: "Feed Area 99", plotPlanTitleName: "FEED AREA" }),
];

export const instruments: InstrumentTagRow[] = [
  row<InstrumentTagRow>({ tag: "VSHH-9901", equipmentTag: TAG, role: "initiator", sources: ["doc-il-9901a"] }),
  row<InstrumentTagRow>({ tag: "PSV-9901", equipmentTag: TAG, role: "relief", sources: ["doc-ds-9901a"] }),
  row<InstrumentTagRow>({ tag: "ZSO-9901", equipmentTag: TAG, role: "permissive", sources: ["doc-il-9901a"] }),
];

export const FAMILY = { id: "FF-01", label: "coupling misalignment" } as const;

export const families: FamilyRow[] = [
  row<FamilyRow>({
    id: FAMILY.id,
    label: FAMILY.label,
    basis: "analyst_classification",
    reviewStatus: "reviewed",
    members: [
      { wo_number: "WO-990010", recorded_root_cause: "misalignment" },
      { wo_number: "WO-990020", recorded_root_cause: "misalignment" },
    ],
  }),
];

export const edges: EdgeRow[] = [
  { fromDocumentId: "doc-il-9901a", toDocumentId: "doc-ds-9901a", edgeKind: "cross_reference", toClass: "datasheet", toSubjectTag: TAG },
  { fromDocumentId: "doc-il-9901a", toDocumentId: "doc-ds-9902", edgeKind: "cross_reference", toClass: "datasheet", toSubjectTag: OTHER_TAG },
  { fromDocumentId: "doc-ds-9901a", toDocumentId: "doc-pp-99", edgeKind: "assoc_docs", toClass: "plot_plan", toSubjectTag: null },
  { fromDocumentId: "doc-il-9901a", toDocumentId: "doc-wb", edgeKind: "note", toClass: "workbook", toSubjectTag: null },
];

export const interlocks: InterlockRowType[] = [
  {
    seqId: SEQ,
    equipmentTag: TAG,
    logicKind: "trip_logic",
    silSheet: 1,
    ceDocNo: "SYN-IL-GA-9901A",
    ceRevision: "2",
    notes: [
      { n: 1, text: "Note 1: Trip set points are training values.", span_id: "sp-il-7" },
      { n: 2, text: "Note 2: A trip is latched and requires a manual reset once the cause has cleared.", span_id: "sp-il-8" },
    ],
    permissiveGate: "AND",
  },
];

function interlockRow(partial: Partial<InterlockRowRow> & Pick<InterlockRowRow, "id" | "rowId" | "rowKind" | "initiator" | "instrumentTag" | "setpointText" | "spanId">): InterlockRowRow {
  return {
    seqId: SEQ,
    equipmentTag: TAG,
    setpointValue: null,
    setpointUnit: null,
    comparator: null,
    voting: null,
    voteCellText: "",
    effects: [],
    effectsBasis: "marked X in the sheet",
    sourcePage: 1,
    ...partial,
  };
}

export const interlockRows: InterlockRowRow[] = [
  interlockRow({
    id: "ir-1",
    rowId: "R1",
    rowKind: "trip",
    initiator: "High-high vibration",
    instrumentTag: "VSHH-9901",
    setpointText: "7.1",
    setpointValue: 7.1,
    setpointUnit: "mm/s",
    comparator: ">",
    voting: "1oo2",
    voteCellText: "1oo2",
    effects: [
      { effect_id: "E1", final_element: "TRIP MOTOR GA-9901A", marked: true },
      { effect_id: "E2", final_element: "CLOSE XV-9901", marked: true },
      { effect_id: "E3", final_element: "ALARM DCS", marked: false },
    ],
    spanId: "sp-il-1",
  }),
  interlockRow({ id: "ir-2", rowId: "R2", rowKind: "alarm", initiator: "High vibration", instrumentTag: "VSH-9901", setpointText: "4.5", setpointValue: 4.5, setpointUnit: "mm/s", comparator: ">", spanId: "sp-il-2" }),
  interlockRow({
    id: "ir-3",
    rowId: "R3",
    rowKind: "trip",
    initiator: "Low-low suction pressure",
    instrumentTag: "PSLL-9901",
    setpointText: "1.2",
    setpointValue: 1.2,
    setpointUnit: "barg",
    comparator: "<",
    voting: "1oo1",
    voteCellText: "1oo1",
    effects: [{ effect_id: "E1", final_element: "TRIP MOTOR GA-9901A", marked: true }],
    spanId: "sp-il-3",
  }),
  interlockRow({ id: "ir-4", rowId: "R4", rowKind: "mech", initiator: "Relief valve", instrumentTag: "PSV-9901", setpointText: "10", setpointValue: 10, setpointUnit: "barg", comparator: null, spanId: "sp-il-4" }),
];

export const permissives: PermissiveRow[] = [
  { seqId: SEQ, n: 1, text: "Suction valve OPEN ZSO-9901", signalTag: "ZSO-9901", standingBypassState: null, spanId: "sp-il-5" },
  { seqId: SEQ, n: 2, text: "Seal flush established PDI-9901", signalTag: "PDI-9901", standingBypassState: "bypassed in DCS since 2025-01-10", spanId: "sp-il-6" },
];

function param(id: string, group: string, field: string, unit: string | null, valueText: string, valueNum: number | null, spanId: string): DatasheetParamRow {
  return { id, equipmentTag: TAG, group, field, unit, valueText, valueNum, spanId };
}

export const params: DatasheetParamRow[] = [
  param("dp-1", "design", "Design pressure", "barg", "8.5", 8.5, "sp-ds-1"),
  param("dp-2", "vibration", "Vibration normal", "mm/s", "2.0", 2, "sp-ds-2"),
  param("dp-3", "header", "Area classification", null, "Zone 2", null, "sp-ds-3"),
  param("dp-4", "header", "Ex protection", null, "Ex d IIB T3", null, "sp-ds-4"),
  param("dp-5", "header", "Service", null, "Crude naphtha", null, "sp-ds-5"),
  param("dp-6", "design", "PSV set pressure", "barg", "10", 10, "sp-ds-6"),
  param("dp-7", "design", "Design pressure", "barg", "8.0", 8, "sp-ds-7"),
];

export const proofTests: ProofTestRow[] = [
  { woNumber: "WO-990003", equipmentTag: TAG, seqId: null, deviceTag: "VSHH-9901", testClass: "calibration_proof_test", completionDate: "2025-05-01", resultText: "Pass", asFound: "7.0", asLeft: "7.1" },
  { woNumber: "WO-990001", equipmentTag: TAG, seqId: SEQ, deviceTag: "VSHH-9901", testClass: "sis_proof_test", completionDate: "2025-03-01", resultText: "Pass", asFound: "7.1", asLeft: "7.1" },
  { woNumber: "WO-990002", equipmentTag: TAG, seqId: SEQ, deviceTag: "VSHH-9901", testClass: "sis_proof_test", completionDate: "2024-03-01", resultText: "Pass", asFound: "7.2", asLeft: "7.1" },
];

function workOrder(partial: Partial<WorkOrderRow> & Pick<WorkOrderRow, "woNumber" | "equipmentTag" | "problemDescription">): WorkOrderRow {
  return row<WorkOrderRow>({
    reportDate: "2025-02-10",
    workType: "Corrective",
    discipline: "Mechanical",
    rootCause: "",
    correctiveAction: "",
    sparePartsUsed: "",
    relatedInterlock: null,
    breakdownKind: "none",
    closeoutComplete: true,
    ...partial,
  });
}

export const workOrders: WorkOrderRow[] = [
  workOrder({ woNumber: "WO-990001", equipmentTag: TAG, problemDescription: "SIS proof test SEQ-9901", workType: "Inspection", discipline: "Instrument", relatedInterlock: SEQ, reportDate: "2025-03-01" }),
  workOrder({ woNumber: "WO-990002", equipmentTag: TAG, problemDescription: "SIS proof test SEQ-9901", workType: "Inspection", discipline: "Instrument", relatedInterlock: SEQ, reportDate: "2024-03-01" }),
  workOrder({ woNumber: "WO-990003", equipmentTag: TAG, problemDescription: "Calibration of VSHH-9901", workType: "Calibration", discipline: "Instrument", reportDate: "2025-05-01" }),
  workOrder({
    woNumber: "WO-990010",
    equipmentTag: TAG,
    problemDescription: "Coupling element worn, high vibration VSHH-9901",
    rootCause: "misalignment",
    correctiveAction: "Replaced coupling element",
    sparePartsUsed: "coupling element",
    relatedInterlock: SEQ,
    breakdownKind: "unplanned",
  }),
  workOrder({ woNumber: "WO-990011", equipmentTag: TAG, problemDescription: "Seal leak at the drive end", rootCause: "worn seal", correctiveAction: "Seal replaced", reportDate: "2025-01-05" }),
  workOrder({ woNumber: "WO-990020", equipmentTag: OTHER_TAG, problemDescription: "Positioner drift", rootCause: "misalignment", reportDate: "2025-04-01" }),
];

export const causalLinks: CausalLinkRow[] = [
  { id: "cl-1", fromWo: "WO-990011", toWo: "WO-990010", equipmentTag: TAG, mechanismNoun: "misalignment", intervalDays: 36, linkingSentence: "misalignment named in both records", linkingField: "root_cause", spanId: "sp-wb-1" },
];

export const bomMatches: BomMatchRow[] = [
  { woNumber: "WO-990010", partString: "coupling element", bomItemId: "bom-12", alternativeBomItemId: null, disambiguatorText: null, status: "matched" },
];

export const bomItems: BomItemRow[] = [
  { id: "bom-12", equipmentTag: TAG, gaDrawingDocNo: "SYN-GA-GA-9901A", itemNo: 12, description: "Coupling element", material: "Polyurethane", quantity: "1", spanId: "sp-ga-1" },
];

const FOOTER = { prepared_by: "PRP-01", reviewed_by_alias: "REV-01", approved_by_alias: "APR-01", date_of_sharing: "2025-06-01" };

export const opls: OplRow[] = [
  {
    documentRevisionId: "rev-opl1",
    oplId: LESSON_1,
    title: "Coupling element inspection and replacement GA-9901A",
    discipline: "Mechanical",
    equipmentTag: TAG,
    areaUnit: "Feed Area 99",
    relatedInterlockText: `${SEQ} (VSHH-9901)`,
    pidRef: "",
    classification: "Basic Knowledge",
    aspect: "Reliability",
    sections: [{ n: 1, heading: "Purpose", body_text: "A worn coupling element raises vibration at VSHH-9901 and ends in a trip.", body_hash: "0".repeat(64) }],
    permitLines: [
      { text: PERMIT_LINE_1, span_id: "sp-opl1-p", source_section: 2 },
      { text: PERMIT_LINE_OTHER_LESSON, span_id: "sp-opl2-p", source_section: 3 },
      { text: PERMIT_LINE_NO_SPAN, span_id: "sp-nowhere", source_section: 4 },
    ],
    footer: FOOTER,
    machineDrafted: false,
    approverAlias: "APR-01",
  },
  {
    documentRevisionId: "rev-opl2",
    oplId: LESSON_2,
    title: "Seal flush line-up GA-9901A",
    discipline: "Mechanical",
    equipmentTag: TAG,
    areaUnit: "Feed Area 99",
    relatedInterlockText: "",
    pidRef: "",
    classification: "Improvement",
    aspect: "Operability",
    sections: [{ n: 1, heading: "Purpose", body_text: "Line up the seal flush before a start.", body_hash: "0".repeat(64) }],
    permitLines: [{ text: PERMIT_LINE_OTHER_LESSON, span_id: "sp-opl2-p", source_section: 2 }],
    footer: FOOTER,
    machineDrafted: true,
    approverAlias: null,
  },
];

export const oplSteps: OplStepRow[] = STEP_TEXTS.map((text, i) => ({
  oplId: LESSON_1,
  n: i + 1,
  actionText: text,
  acceptanceCriterion: i === 2 ? "Bolts torqued" : null,
  sourceHash: quoteHash(text),
  spanId: `sp-opl1-s${i + 1}`,
}));

export const troubleshooting: TroubleshootingRowRow[] = [
  { oplId: LESSON_1, n: 1, problem: "High vibration on GA-9901A", cause: "Worn coupling element", action: "Replace the element", quotedWoNumber: "WO-990010", truncated: false },
];

/** The workbook span of each work order (the row a WorkOrder cites); WO-990002 has none, so it is never cited. */
export const workOrderSpanIds = new Map<string, string>([
  ["WO-990010", "sp-wb-1"],
  ["WO-990011", "sp-wb-2"],
  ["WO-990001", "sp-wb-3"],
  ["WO-990003", "sp-wb-4"],
]);

function chunk(chunkId: string, revisionId: string, page: number, ordinal: number, text: string, lexical: number, cosine: number, unitKind: ChunkCandidate["unitKind"] = "note"): ChunkCandidate {
  const rev = revisionById.get(revisionId);
  const doc = rev ? documentById.get(rev.documentId) : undefined;
  if (!rev || !doc) throw new Error(`fixture chunk ${chunkId}: unknown revision ${revisionId}`);
  return {
    chunkId,
    revisionId,
    page,
    ordinal,
    unitKind,
    text,
    quoteHash: quoteHash(text),
    lexical,
    cosine,
    revision: rev.revision,
    approvalStatus: rev.approvalStatus,
    approvalStatusText: rev.approvalStatusText,
    isCurrent: rev.isCurrent,
    documentId: doc.id,
    docNo: doc.docNo,
    documentClass: doc.class,
    subjectTag: doc.subjectTag,
  };
}

/** Retrieval candidates: two contain a span table span (page-exact), one contains none, two are outside the served set. */
export const chunkCandidates: ChunkCandidate[] = [
  chunk("rev-il-2/c001", "rev-il-2", 1, 1, "VSHH-9901 High-high vibration 7.1 mm/s 1oo2 TRIP MOTOR GA-9901A", 2, 0.9, "ce_row"),
  chunk("rev-il-2/c003", "rev-il-2", 1, 3, "PSLL-9901 Low-low suction pressure 1.2 barg 1oo1 TRIP MOTOR GA-9901A", 2, 0.9, "ce_row"),
  chunk("rev-ds-3/c001", "rev-ds-3", 1, 1, "Design pressure 8.5 barg Vibration normal 2.0 mm/s", 0, 0.8, "datasheet_group"),
  chunk("rev-wb/c005", "rev-wb", 12, 5, "A workbook remark that matches no span of the span table.", 1, 0.75, "wo_field"),
  chunk("rev-ds-3/c002", "rev-ds-3", 2, 2, "Design pressure 8.0 barg", 0, 0.8, "datasheet_group"),
  chunk("rev-ds-2/c001", "rev-ds-2", 1, 1, "Design pressure 8.0 barg (superseded)", 0, 0.95, "datasheet_group"),
  chunk("rev-ds-1/c001", "rev-ds-1", 1, 1, "An issued-for-review reading that is never served.", 0, 0.99, "datasheet_group"),
  chunk("rev-ds-9902/c001", "rev-ds-9902", 1, 1, "LV-9902 Design pressure 5 barg", 0, 0.7, "datasheet_group"),
];

/** The order the fake database returns candidates in; a test permutes it to prove the rerank is order-independent. */
export const state = { chunkOrder: chunkCandidates.map((c) => c.chunkId), steps: oplSteps.map((s) => ({ ...s })), calls: [] as Array<{ fn: string; args: unknown[] }> };

export function resetAsset(): void {
  state.chunkOrder = chunkCandidates.map((c) => c.chunkId);
  state.steps = oplSteps.map((s) => ({ ...s }));
  state.calls = [];
}

const record = (fn: string, ...args: unknown[]) => state.calls.push({ fn, args });
const byTag = <T extends { equipmentTag: string }>(rows: T[], tags: readonly string[]) => rows.filter((r) => tags.includes(r.equipmentTag));
const sourceMap = (ids: readonly string[]) => new Map(ids.flatMap((id) => (spanById.has(id) ? [[id, spanById.get(id) as SpanSource] as const] : [])));

export const fakeQueries: Queries = {
  EXCLUDED_CLASS: "organiser_note",
  async assetMaster() {
    return { equipment: [...equipment], areas: [...areas], instruments: [...instruments] };
  },
  async familiesAll() {
    return [...families];
  },
  async equipmentTagsOfWorkOrders(_db, woNumbers) {
    return workOrders.filter((w) => woNumbers.includes(w.woNumber)).map((w) => ({ woNumber: w.woNumber, equipmentTag: w.equipmentTag }));
  },
  async documentsOfTags(_db, tags, docNos) {
    record("documentsOfTags", tags, docNos);
    return documents.filter((d) => d.class !== "organiser_note" && ((d.subjectTag !== null && tags.includes(d.subjectTag)) || (d.docNo !== null && docNos.includes(d.docNo))));
  },
  async documentsByIds(_db, ids) {
    return documents.filter((d) => ids.includes(d.id) && d.class !== "organiser_note");
  },
  async edgesFrom(_db, documentIds) {
    return edges.filter((e) => documentIds.includes(e.fromDocumentId));
  },
  async revisionsOf(_db, documentIds, visibleVersionIds, includeSuperseded) {
    record("revisionsOf", documentIds, visibleVersionIds, includeSuperseded);
    return revisions
      .filter((r) => documentIds.includes(r.documentId) && visibleVersionIds.includes(r.corpusVersionId) && (includeSuperseded || r.isCurrent))
      .sort((a, b) => a.documentId.localeCompare(b.documentId) || a.revision.localeCompare(b.revision) || a.id.localeCompare(b.id));
  },
  async openFindingRuleIds(_db, documentIds) {
    return new Map([...findings].filter(([id]) => documentIds.includes(id)));
  },
  async candidateChunks(_db, q) {
    record("candidateChunks", q);
    const byId = new Map(chunkCandidates.map((c) => [c.chunkId, c] as const));
    return state.chunkOrder
      .map((id) => byId.get(id))
      .filter((c): c is ChunkCandidate => c !== undefined)
      .filter((c) => q.revisionIds.includes(c.revisionId) && (q.includeSuperseded || (c.isCurrent && q.servedStatuses.includes(c.approvalStatus))))
      .map((c) => ({ ...c }));
  },
  async spansOnPages(_db, pairs) {
    return spans
      .filter((s) => pairs.some((p) => p.revisionId === s.revisionId && p.page === s.page))
      .sort((a, b) => a.page - b.page || a.startOrdinal - b.startOrdinal)
      .map((s) => ({ spanId: s.spanId, revisionId: s.revisionId, page: s.page, anchorText: s.anchorText, quoteHash: s.quoteHash, startOrdinal: s.startOrdinal }));
  },
  async spansByIds(_db, ids) {
    return sourceMap(ids);
  },
  async firstSpanOfRevisions(_db, revisionIds) {
    const out = new Map<string, SpanSource>();
    for (const s of [...spans].sort((a, b) => a.page - b.page || a.startOrdinal - b.startOrdinal)) {
      if (revisionIds.includes(s.revisionId) && !out.has(s.revisionId)) out.set(s.revisionId, s);
    }
    return out;
  },
  async workOrderSpans(_db, woNumbers) {
    const out = new Map<string, SpanSource>();
    for (const wo of woNumbers) {
      const id = workOrderSpanIds.get(wo);
      const s = id ? spanById.get(id) : undefined;
      if (s) out.set(wo, s);
    }
    return out;
  },
  async interlocksOf(_db, tags) {
    return byTag(interlocks, tags);
  },
  async interlockRowsOf(_db, tags) {
    return byTag(interlockRows, tags);
  },
  async permissivesOf(_db, seqIds) {
    return permissives.filter((p) => seqIds.includes(p.seqId));
  },
  async datasheetParamsOf(_db, tags) {
    return byTag(params, tags);
  },
  async proofTestsOf(_db, tags) {
    return byTag(proofTests, tags).sort((a, b) => a.testClass.localeCompare(b.testClass) || b.completionDate.localeCompare(a.completionDate));
  },
  async workOrdersOf(_db, tags) {
    return byTag(workOrders, tags);
  },
  async causalLinksOf(_db, tags) {
    return byTag(causalLinks, tags);
  },
  async bomMatchesOf(_db, woNumbers) {
    return bomMatches.filter((m) => woNumbers.includes(m.woNumber));
  },
  async bomItemsByIds(_db, ids) {
    return new Map(bomItems.filter((b) => ids.includes(b.id)).map((b) => [b.id, b] as const));
  },
  async oplsOf(_db, tags) {
    return byTag(opls, tags);
  },
  async oplsByIds(_db, oplIds) {
    return opls.filter((o) => oplIds.includes(o.oplId));
  },
  async oplsByRevisionIds(_db, revisionIds) {
    return opls.filter((o) => revisionIds.includes(o.documentRevisionId));
  },
  async oplStepsOf(_db, oplIds) {
    return state.steps.filter((s) => oplIds.includes(s.oplId)).sort((a, b) => a.n - b.n);
  },
  async troubleshootingRowsOf(_db, oplIds) {
    return troubleshooting.filter((t) => oplIds.includes(t.oplId));
  },
  async revisionsByIds(_db, revisionIds) {
    return new Map(revisions.filter((r) => revisionIds.includes(r.id)).map((r) => [r.id, r] as const));
  },
};
