// A synthetic package bundle of blueprint 9.1 for the G1 mutation tests (src/gates/g1.test.ts, AC-ING-09) and the
// seed integration tests (tests/db, AC-ING-10, AC-NFR-13). Every sentence here is the team's own wording and every
// identifier carries SYN; no corpus text and no corpus number is copied. The sizes the fixture contract pins as
// literals (98 files, 211 work orders) are met by generated rows; everything else is the smallest set that closes
// every reference G1 checks: one asset, one interlock, one lesson with steps, one work order chain, one page render.
// writeSyntheticBundle() writes the tree with a manifest whose digests are computed from the bytes on disk, so the
// clean bundle admits, and the mutation tests refresh one entry after rewriting one file (refreshManifest).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type * as asset from "@/contracts/generated/asset";
import type * as coverage from "@/contracts/generated/coverage";
import type * as document from "@/contracts/generated/document";
import type { Root as Fixtures } from "@/contracts/generated/fixtures";
import type { Manifest } from "@/contracts/generated/manifest";
import type * as operations from "@/contracts/generated/operations";
import type { RulePack } from "@/contracts/generated/rulepack";
import { EMBEDDING_DIM } from "@/db/embedding";
import { defaultHarnessDir } from "@/gates/g1/bundle";
import { quoteHash, sha256Hex } from "@/lib/hash";

const pad = (n: number, width: number) => String(n).padStart(width, "0");

export const SYN = {
  bundleVersion: "1.0.0",
  extractor: "pdftotext -raw (pdftotext version 26.02.0)",
  corpusSha256: sha256Hex("synthetic corpus"),
  recipeSha256: sha256Hex("synthetic recipe"),
  stopListSha256: sha256Hex("synthetic stop list"),
  areaCode: "SYN-AREA",
  equipmentTag: "SY-0101A",
  seqId: "SEQ-SYN-0101",
  initiatorTag: "VSHH-SYN-0101",
  permissiveTag: "LSL-SYN-0101",
  datasheetDocNo: "SYN-DS-0101",
  gaDocNo: "SYN-GA-0101",
  plotPlanDocNo: "SYN-PP-0101",
  ceDocNo: "SYN-CE-0101",
  workOrders: 211,
  lessons: 56,
  files: 98,
  /** The page render in pages/ (one document, one page). */
  pageDocumentId: "doc-syn-pid-01",
  /** The datasheet with a superseded revision A under the current revision B. */
  datasheetDocumentId: "doc-syn-datasheet-01",
  superseded: { id: "rev-syn-datasheet-01-a", revision: "A" },
  wo: (n: number) => `WO-SYN-${pad(n, 4)}`,
  oplId: (n: number) => `OPL-SYN-0101A-${pad(n, 2)}`,
  docId: (cls: document.DocumentClass, n: number) => `doc-syn-${cls}-${pad(n, 2)}`,
  revId: (cls: document.DocumentClass, n: number) => `rev-syn-${cls}-${pad(n, 2)}`,
} as const;

// The span texts, each the team's own sentence; the id order is the order the files reference them in.
export const SPAN_TEXTS: Record<string, string> = {
  "span-syn-01": "Equipment id SY-0101A-ID",
  "span-syn-02": "Design pressure 16 barg",
  "span-syn-03": "T1 VSHH-SYN-0101 above 12.5 mm/s voting 1oo2 trips the motor",
  "span-syn-04": "Start permissive 1: suction level above LSL-SYN-0101",
  "span-syn-05": "Note 1: reset at the panel once the cause has cleared",
  "span-syn-06": "See drawing SYN-PID-01 for the piping arrangement",
  "span-syn-07": "Step 1: isolate the suction valve and tag it",
  "span-syn-08": "Step 2: drain the casing to the closed system",
  "span-syn-09": "Permit: a hot work permit is required before step 2",
  "span-syn-10": "Item 1 mechanical seal cartridge, one off",
  "span-syn-11": "Root cause: seal face wear after the previous seal change",
  "span-syn-12": "A1 VSHH-SYN-0101 alarm at 9.0 mm/s",
  "span-syn-13": "The revision block carries no approval signature",
};

const CLASSES: ReadonlyArray<readonly [document.DocumentClass, number]> = [
  ["pid", 8],
  ["datasheet", 8],
  ["ga_drawing", 8],
  ["interlock", 8],
  ["plot_plan", 8],
  ["workbook", 1],
  ["organiser_note", 1],
  ["opl", SYN.lessons],
];

const DOC_NO_PREFIX: Partial<Record<document.DocumentClass, string>> = {
  pid: "SYN-PID-",
  datasheet: "SYN-DS-01",
  ga_drawing: "SYN-GA-01",
  interlock: "SYN-CE-01",
  plot_plan: "SYN-PP-01",
};
const EXTENSION: Partial<Record<document.DocumentClass, string>> = { pid: "png", workbook: "xlsx", organiser_note: "pptx" };
const ASSET_CLASSES: ReadonlyArray<document.DocumentClass> = ["pid", "datasheet", "ga_drawing", "interlock", "plot_plan"];

// A 2 by 2 lossless WebP (38 bytes) written by Pillow 12.1.1 and decoded back by it; the page route serves the bytes
// as image/webp and the seed round-trips their length, neither decodes them.
const WEBP_2X2 = Buffer.from("UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQ+MIXvv+BiOh/AAA=", "base64");

const WORK_TYPES = ["Preventive", "Corrective", "Predictive", "Inspection", "Calibration", "Overhaul"] as const;
const DISCIPLINES = ["Mechanical", "Instrument", "Electrical", "Process"] as const;
const PRIORITIES = ["Low", "Medium", "High", "Emergency"] as const;
const THRESHOLDS = [0.5, 0.55, 0.6, 0.62, 0.65, 0.7, 0.75] as const;
const POPULATIONS = ["unplanned_failure", "failure", "unplanned_breakdowns", "planned_flagged", "all"] as const;
const FLAG_KEYS = [
  "root_cause",
  "corrective_action",
  "spare_parts_used",
  "downtime_hours",
  "labor_hours",
  "labor_cost_idr",
  "material_cost_idr",
  "total_cost_idr",
  "completion_date",
  "executed_by",
  "approved_by",
];

function documents(): document.Document[] {
  const out: document.Document[] = [];
  for (const [cls, count] of CLASSES) {
    for (let n = 1; n <= count; n += 1) {
      const id = SYN.docId(cls, n);
      const prefix = DOC_NO_PREFIX[cls];
      out.push({
        id,
        doc_no: cls === "opl" ? SYN.oplId(n) : prefix === undefined ? null : `${prefix}${pad(n, 2)}`,
        class: cls,
        subject_tag: cls === "opl" || (ASSET_CLASSES.includes(cls) && n === 1) ? SYN.equipmentTag : null,
        sha256: sha256Hex(`synthetic:${id}`),
        source_path: `synthetic/${id}.${EXTENSION[cls] ?? "pdf"}`,
        page_count: 1,
        file_marker: null,
      });
    }
  }
  return out;
}

function revision(doc: document.Document, id: string, label: string, current: boolean): document.DocumentRevision {
  return {
    id,
    document_id: doc.id,
    revision: label,
    approval_status: "issued_for_operation",
    approval_status_text: "Issued for Operation",
    revision_date: "2024-01-10",
    prepared_by_alias: "SYN-ENG-1",
    reviewed_by_alias: "SYN-SUP-1",
    approved_by_alias: "SYN-MGR-1",
    date_of_sharing: "2024-01-15",
    is_current: current,
    corpus_version_id: "v1",
  };
}

function revisions(docs: document.Document[]): document.DocumentRevision[] {
  const out: document.DocumentRevision[] = [];
  for (const doc of docs) {
    const [cls, n] = classAndNumber(doc);
    if (doc.id === SYN.datasheetDocumentId) out.push(revision(doc, SYN.superseded.id, SYN.superseded.revision, false));
    out.push(revision(doc, SYN.revId(cls, n), doc.id === SYN.datasheetDocumentId ? "B" : "0", true));
  }
  return out;
}

function classAndNumber(doc: document.Document): [document.DocumentClass, number] {
  const n = Number(doc.id.slice(doc.id.lastIndexOf("-") + 1));
  return [doc.class, n];
}

const currentRev = (cls: document.DocumentClass, n: number) => SYN.revId(cls, n);

function spans(): document.Span[] {
  const home: Record<string, [document.DocumentClass, number, number]> = {
    "span-syn-01": ["datasheet", 1, 1],
    "span-syn-02": ["datasheet", 1, 1],
    "span-syn-03": ["interlock", 1, 1],
    "span-syn-04": ["interlock", 1, 1],
    "span-syn-05": ["interlock", 1, 1],
    "span-syn-06": ["datasheet", 1, 1],
    "span-syn-07": ["opl", 1, 1],
    "span-syn-08": ["opl", 1, 1],
    "span-syn-09": ["opl", 1, 1],
    "span-syn-10": ["ga_drawing", 1, 1],
    "span-syn-11": ["workbook", 1, 5],
    "span-syn-12": ["interlock", 1, 1],
    "span-syn-13": ["plot_plan", 1, 1],
  };
  return Object.entries(SPAN_TEXTS).map(([id, text], i) => {
    const [cls, n, page] = home[id]!;
    return {
      id,
      document_revision_id: currentRev(cls, n),
      page,
      anchor_text: text,
      quote_hash: quoteHash(text),
      start_ordinal: i * 100,
      end_ordinal: i * 100 + text.length,
    };
  });
}

const parser = { basis: "parser" } as const;

function claimsFile() {
  const claims: document.Claim[] = [
    { id: "claim-syn-1", span_id: "span-syn-01", entity_binding: SYN.equipmentTag, claim_kind: "parameter", value_text: "SY-0101A-ID", extracted_by: parser },
    { id: "claim-syn-2", span_id: "span-syn-03", entity_binding: SYN.seqId, claim_kind: "row", value_text: "12.5 mm/s", extracted_by: parser },
    { id: "claim-syn-3", span_id: "span-syn-07", entity_binding: SYN.oplId(1), claim_kind: "step", value_text: "isolate the suction valve", extracted_by: parser },
    { id: "claim-syn-4", span_id: "span-syn-11", entity_binding: SYN.wo(1), claim_kind: "narrative", value_text: "seal face wear", extracted_by: parser },
    { id: "claim-syn-5", span_id: "span-syn-06", entity_binding: "NONE", claim_kind: "note", value_text: "SYN-PID-01", extracted_by: parser },
  ];
  const edges: document.DocumentEdge[] = [
    { from_document_id: SYN.datasheetDocumentId, to_document_id: SYN.pageDocumentId, edge_kind: "cross_reference", source_span_id: "span-syn-06" },
  ];
  return { spans: spans(), claims, edges, unresolved_references: [] as unknown[] };
}

function interlocksFile() {
  const equipment: asset.Equipment[] = [
    {
      tag: SYN.equipmentTag,
      name: "Synthetic feed pump A",
      functional_location: "SYN-UNIT-01",
      area_code: SYN.areaCode,
      service: "synthetic feed duty",
      criticality_datasheet: "HIGH CRITICAL",
      criticality_workbook: "High",
      interlock_ref: SYN.seqId,
      datasheet_doc_no: SYN.datasheetDocNo,
      ga_drawing_doc_no: SYN.gaDocNo,
      pid_document_id: SYN.pageDocumentId,
      plot_plan_doc_no: SYN.plotPlanDocNo,
      ce_doc_no: SYN.ceDocNo,
    },
  ];
  const interlocks: asset.Interlock[] = [
    {
      seq_id: SYN.seqId,
      equipment_tag: SYN.equipmentTag,
      logic_kind: "trip_logic",
      sil_sheet: 1,
      ce_doc_no: SYN.ceDocNo,
      ce_revision: "0",
      notes: [{ n: 1, text: SPAN_TEXTS["span-syn-05"]!, span_id: "span-syn-05" }],
      permissive_gate: "AND",
    },
  ];
  const rows: asset.InterlockRow[] = [
    {
      id: "row-syn-t1",
      seq_id: SYN.seqId,
      equipment_tag: SYN.equipmentTag,
      row_id: "T1",
      row_kind: "trip",
      initiator: "high vibration",
      instrument_tag: SYN.initiatorTag,
      setpoint_value: 12.5,
      setpoint_unit: "mm/s",
      comparator: ">",
      setpoint_text: "12.5 mm/s",
      voting: "1oo2",
      vote_cell_text: "1oo2",
      effects: [{ effect_id: "EFF-SYN-1", final_element: "stop the motor", marked: true }],
      effects_basis: "sheet",
      source_page: 1,
      span_id: "span-syn-03",
    },
    {
      id: "row-syn-a1",
      seq_id: SYN.seqId,
      equipment_tag: SYN.equipmentTag,
      row_id: "A1",
      row_kind: "alarm",
      initiator: "high vibration",
      instrument_tag: SYN.initiatorTag,
      setpoint_value: 9,
      setpoint_unit: "mm/s",
      comparator: ">",
      setpoint_text: "9.0 mm/s",
      voting: null,
      vote_cell_text: "",
      effects: [],
      effects_basis: "sheet",
      source_page: 1,
      span_id: "span-syn-12",
    },
  ];
  const permissives: asset.StartPermissive[] = [
    { seq_id: SYN.seqId, n: 1, text: SPAN_TEXTS["span-syn-04"]!, signal_tag: SYN.permissiveTag, standing_bypass_state: null, span_id: "span-syn-04" },
  ];
  const instrument_tags: asset.InstrumentTag[] = [
    { tag: SYN.initiatorTag, equipment_tag: SYN.equipmentTag, role: "initiator", sources: [SYN.docId("interlock", 1)] },
    { tag: SYN.permissiveTag, equipment_tag: SYN.equipmentTag, role: "permissive", sources: [SYN.docId("interlock", 1)] },
  ];
  return { equipment, interlocks, rows, permissives, instrument_tags };
}

const datasheetParams: asset.DatasheetParam[] = [
  { id: "dsp-syn-01", equipment_tag: SYN.equipmentTag, group: "Identification", field: "EQUIPMENT ID", unit: null, value_text: "SY-0101A-ID", value_num: null, span_id: "span-syn-01" },
];
const datasheetSpot: asset.DatasheetParam[] = [
  { id: "spot-syn-01", equipment_tag: SYN.equipmentTag, group: "datasheet_spot", field: "DESIGN PRESSURE", unit: "barg", value_text: "16", value_num: 16, span_id: "span-syn-02" },
];

function sidecar(n: number): asset.PidSidecar {
  return {
    set: 100 + n,
    document_id: SYN.docId("pid", n),
    title_box: `Synthetic piping sheet ${n}`,
    reference_box: `SYN-PID-${pad(n, 2)}`,
    notes: [],
    equipment_shown: n === 1 ? [SYN.equipmentTag] : [],
    hotspots:
      n === 1
        ? [
            { id: "hs-syn-1", as_drawn_text: SYN.initiatorTag, bound_tag: SYN.initiatorTag, unbound_reason: null, role: "initiator", drawn_setpoint: null, foreign: false, x_frac: 0.1, y_frac: 0.1, w_frac: 0.05, h_frac: 0.03 },
            { id: "hs-syn-2", as_drawn_text: "SYN-OFFSHEET", bound_tag: null, unbound_reason: "off-sheet reference with no typed tag", role: "unknown", drawn_setpoint: null, foreign: true, x_frac: 0.5, y_frac: 0.5, w_frac: 0.05, h_frac: 0.03 },
          ]
        : [],
    defects: [],
    provenance: { basis: "agent_transcription", alias: "SYN-AGENT", date: "2026-09-06", reviewed_by: null, reviewed_at: null, review_status: "pending" },
  };
}

function workOrders(): operations.WorkOrder[] {
  const out: operations.WorkOrder[] = [];
  for (let i = 1; i <= SYN.workOrders; i += 1) {
    const breakdownKind: operations.WorkOrder["breakdown_kind"] = i % 7 === 0 ? "unplanned" : i % 11 === 0 ? "planned_flagged" : "none";
    const complete = i % 5 !== 0;
    const month = pad(1 + (i % 12), 2);
    const day = pad(1 + (i % 28), 2);
    out.push({
      wo_number: SYN.wo(i),
      notification_no: `NOTIF-SYN-${pad(i, 4)}`,
      report_date: `2024-${month}-${day}`,
      start_date: `2024-${month}-${day}`,
      completion_date: `2024-${month}-${day}`,
      status: "Closed",
      equipment_tag: SYN.equipmentTag,
      work_type: WORK_TYPES[i % WORK_TYPES.length]!,
      discipline: DISCIPLINES[i % DISCIPLINES.length]!,
      priority: PRIORITIES[i % PRIORITIES.length]!,
      criticality: "High",
      problem_description: `Synthetic problem ${i}: vibration above the alarm on the feed pump`,
      root_cause: `Synthetic root cause ${i}: seal face wear`,
      corrective_action: `Synthetic corrective action ${i}: seal cartridge replaced`,
      spare_parts_used: "mechanical seal cartridge",
      breakdown: breakdownKind !== "none",
      downtime_hours: breakdownKind === "none" ? null : 4,
      labor_hours: 2,
      labor_cost_idr: 100000,
      material_cost_idr: 50000,
      total_cost_idr: 150000,
      reported_by_alias: "SYN-OPR-1",
      executed_by_alias: "SYN-TEC-1",
      approved_by_alias: "SYN-SUP-1",
      related_interlock: breakdownKind === "unplanned" ? SYN.seqId : null,
      remarks: null,
      closeout_complete: complete,
      completeness_flags: Object.fromEntries(FLAG_KEYS.map((k, j) => [k, complete || j !== 0])),
      breakdown_kind: breakdownKind,
      notification_lead_hours: 24,
    });
  }
  return out;
}

function coverageFile(wos: operations.WorkOrder[]) {
  const method: coverage.CoverageMethod = {
    recipe_sha256: SYN.recipeSha256,
    stop_list_sha256: SYN.stopListSha256,
    threshold: 0.62,
    window_multiplier: 2,
    min_content_words: 3,
    comparison: "uncovered when score <= threshold",
    extractor: SYN.extractor,
    strict_sections: ["header", "1", "2", "3", "4", "6"],
    strict_cut_marker: "This is sample data provided for CALIBER purposes only",
    labels_status: "machine_drafted_pending_human",
    unscoreable_ids: [],
  };
  const assessments: coverage.CoverageAssessment[] = [];
  for (const layer of ["generous", "strict"] as const) {
    wos.forEach((w, i) => {
      const covered = i % 3 !== 0;
      assessments.push({
        wo_number: w.wo_number,
        layer,
        covered,
        best_ratio: covered ? 0.8 : 0.4,
        threshold: 0.62,
        matched_field: covered ? "root_cause" : null,
        matched_lesson: covered ? SYN.oplId(1 + (i % SYN.lessons)) : null,
        corpus_version_id: "v1",
      });
    });
  }
  const summaries: coverage.CoverageSummary[] = [];
  for (const population of POPULATIONS) {
    for (const layer of ["generous", "strict"] as const) {
      summaries.push({
        corpus_version_id: "v1",
        population,
        layer,
        threshold: 0.62,
        uncovered_count: 3,
        population_count: 9,
        uncovered_breakdowns: 1,
        uncovered_downtime_hours: 4,
        uncovered_cost_idr: 150000,
        bands: population === "unplanned_failure" ? { no_lesson: 1, copied_row_only: 1, taught: 1 } : null,
        sensitivity: THRESHOLDS.map((t) => ({ t, uncovered_count: 3 })),
      });
    }
  }
  return { method, assessments, summaries };
}

function oplsFile() {
  const lessons: coverage.Opl[] = [];
  for (let n = 1; n <= SYN.lessons; n += 1) {
    const body = `Synthetic lesson ${n}: the seal on the feed pump wears when the flush line is left closed`;
    lessons.push({
      document_revision_id: currentRev("opl", n),
      opl_id: SYN.oplId(n),
      title: `Synthetic lesson ${n} on the feed pump seal`,
      discipline: "Mechanical",
      equipment_tag: SYN.equipmentTag,
      area_unit: "SYN-UNIT-01",
      related_interlock_text: SYN.seqId,
      pid_ref: "SYN-PID-01",
      classification: "Basic Knowledge",
      aspect: "Reliability",
      sections: [{ n: 1, heading: "Purpose", body_text: body, body_hash: quoteHash(body) }],
      permit_lines: n === 1 ? [{ text: SPAN_TEXTS["span-syn-09"]!, span_id: "span-syn-09", source_section: 3 }] : [],
      footer: { prepared_by: "SYN-ENG-1", reviewed_by_alias: "SYN-SUP-1", approved_by_alias: "SYN-MGR-1", date_of_sharing: "2024-01-15" },
      machine_drafted: false,
      approver_alias: null,
    });
  }
  const steps: coverage.OplStep[] = [
    { opl_id: SYN.oplId(1), n: 1, action_text: SPAN_TEXTS["span-syn-07"]!, acceptance_criterion: "valve tagged", source_hash: quoteHash(SPAN_TEXTS["span-syn-07"]!), span_id: "span-syn-07" },
    { opl_id: SYN.oplId(1), n: 2, action_text: SPAN_TEXTS["span-syn-08"]!, acceptance_criterion: null, source_hash: quoteHash(SPAN_TEXTS["span-syn-08"]!), span_id: "span-syn-08" },
  ];
  const troubleshooting_rows: coverage.TroubleshootingRow[] = [
    { opl_id: SYN.oplId(1), n: 1, problem: "seal leak", cause: "flush line closed", action: "open the flush line before the start", quoted_wo_number: SYN.wo(7), truncated: false },
  ];
  return { lessons, steps, troubleshooting_rows };
}

const rulepack: RulePack = {
  version: "1",
  lexicons: {
    defeat: { en: ["bypass", "override"], id: ["matikan", "lewati"] },
    permanent_change: { verbs_en: ["change"], verbs_id: ["ubah"], nouns: ["setpoint", "trip"] },
    procedure_phrases: { en: ["how do i"], id: ["bagaimana cara"] },
    suppressions: { named_artefacts: [], negation_prefixes: ["never"], record_labels: ["record"], passive_record_question_markers: ["was"], standalone_without_permit: true },
    window_tokens: 8,
  },
  protective_vocabulary: [],
  generic_protective_tokens: ["interlock", "trip"],
  documented_bypass_entities: [],
  rules: [{ id: "R1" }, { id: "R2" }, { id: "R3" }, { id: "R4" }, { id: "R5" }],
  routing_text: { defeat: "{function} {sil} {permissives} {reset_note} {sheet}", permanent_change: "route to MOC", relief_device: "route to the relief register" },
  moment_keywords: { readiness: ["start"], trip: ["tripped"], job: ["replace"], reading: ["reading"] },
  fixtures: { positives: [], negatives: [] },
};

const GOLDEN_YAML = `- id: GS-SYN-01
  category: Grounded answering
  hard_gate: false
  tier: A
  input:
    question: What is the design pressure of SY-0101A?
  expected:
    outcome: answer
    must_cite: [span-syn-02]
    must_contain: ["16 barg"]
    must_not_contain: []
    numerals_allowed:
      - { value: "16", unit: barg, source_ref: span-syn-02 }
  sources: [doc-syn-datasheet-01]
  checks: []
  origin: team
- id: GS-SYN-02
  category: Traceability
  hard_gate: false
  tier: A
  input:
    question: Which drawing does the datasheet of SY-0101A refer to?
  expected:
    outcome: answer
    must_cite: [span-syn-06]
    must_contain: [SYN-PID-01]
    must_not_contain: []
    numerals_allowed: []
  sources: [doc-syn-datasheet-01]
  checks: []
  origin: team
`;

const series = () => THRESHOLDS.map((t) => ({ t, uncovered: 3, share: 0.33, breakdowns: 1, downtime_h: 4, cost_idr: 150000 }));
const layer = () => ({ unplanned_failure: series(), failure: series(), unplanned_breakdowns: series(), planned_flagged: series(), all: series() });

function fixtures(docs: document.Document[], wos: operations.WorkOrder[]): Fixtures {
  const by_class: Record<string, number> = {};
  for (const d of docs) by_class[d.class] = (by_class[d.class] ?? 0) + 1;
  const count = <T extends string>(values: T[]) => {
    const out: Record<string, number> = {};
    for (const v of values) out[v] = (out[v] ?? 0) + 1;
    return out;
  };
  const unplanned = wos.filter((w) => w.breakdown_kind === "unplanned").length;
  const planned = wos.filter((w) => w.breakdown_kind === "planned_flagged").length;
  const incomplete = wos.filter((w) => !w.closeout_complete);
  const totals = (rows: number) => ({ rows, hours: rows * 4, cost_idr: rows * 150000 });
  return {
    inventory: { files_total: 98, by_class, corpus_sha256: SYN.corpusSha256, extractor: SYN.extractor, canonical_form_version: "1" },
    method: {
      recipe_sha256: SYN.recipeSha256,
      stop_list_sha256: SYN.stopListSha256,
      threshold: 0.62,
      window_multiplier: 2,
      min_content_words: 3,
      strict_rule: "the strict layer reads the header and sections 1 to 4 and 6",
      strict_sections: ["header", "1", "2", "3", "4", "6"],
      strict_cut_marker: "This is sample data provided for CALIBER purposes only",
      labels_status: "machine_drafted_pending_human",
      unscoreable_ids: [],
    },
    workbook: {
      rows: 211,
      reported_first: "2024-01-01",
      reported_last: "2024-12-28",
      completed_last: "2024-12-28",
      work_types: count(wos.map((w) => w.work_type)),
      breakdown_flagged: totals(unplanned + planned),
      breakdown_kinds: { unplanned: totals(unplanned), planned_flagged: totals(planned) },
      all_cost_idr: wos.length * 150000,
      all_labor_hours: wos.length * 2,
      incomplete: { rows: incomplete.length, share: incomplete.length / wos.length, by_work_type: count(incomplete.map((w) => w.work_type)), emergency_rows: 0 },
      lead_time: { median_h: 24, at_least_24h: wos.length, share: 1, min_h: 24, max_h: 24 },
      discipline_counts: count(wos.map((w) => w.discipline)),
    },
    populations: { unplanned_failure: unplanned, failure: unplanned + planned, unplanned_breakdowns: unplanned, planned_flagged: planned, all: 211 },
    coverage: { generous: layer(), strict: layer(), bands: { unplanned_failure: [{ t: 0.62, no_lesson: 1, copied_row_only: 1, taught: 1 }] } },
    coverage_scores: {
      [SYN.wo(1)]: {
        generous: { best_ratio: 0.8, matched_field: "root_cause", matched_lesson: SYN.oplId(1) },
        strict: { best_ratio: 0.4, matched_field: null, matched_lesson: null },
      },
    },
    coverage_labels: {
      status: "machine_drafted_pending_human",
      uncovered_ids: [SYN.wo(3)],
      uncovered_count: 1,
      share: 1 / 211,
      breakdowns: 0,
      downtime_h: 0,
      cost_idr: 0,
      kappa_covered: 1,
      kappa_taught: 1,
      proxy_agreement: { generous: { precision: 1, recall: 1, fp: 0, fn: 0 }, strict: { precision: 1, recall: 1, fp: 0, fn: 0 } },
    },
    verbatim: { problem_description: 0, root_cause: 0, corrective_action: 0, any_field: 0, strict_any_field: 0 },
    dates: { parsed: SYN.lessons, first: "2024-01-15", last: "2024-01-15", window_days: 0, median_gap_d: 0, mode_gap_d: 0, mode_count: SYN.lessons, within_set_gap_d: 0, days_after_last_breakdown: 0 },
    latency: { pairs: [], median_d: 0 },
    integrity: { total: 2, rules: { "CD-1": 2 }, observations: { "CD-15": 0, "CD-16": 0 } },
    families: {
      list: [{ id: "fam-syn-1", label: "synthetic seal wear", basis: "analyst_classification", review_status: "reviewed", members: [{ wo_number: SYN.wo(7), recorded_root_cause: "seal face wear" }] }],
      r_by_tag: { [SYN.equipmentTag]: 0.5 },
      multi_family_wos: [],
    },
    chains: { links: 1, by_tag: { [SYN.equipmentTag]: 1 } },
    debt: {
      coefficients: { a: 0.4, b: 0.3, c: 0.2, d: 0.1, basis: "ASSUMPTION" },
      D_max: 4,
      C_max: 150000,
      per_asset: [{ tag: SYN.equipmentTag, rank: 1, uncovered_wo_numbers: [SYN.wo(3)], D_h: 4, C_idr: 150000, k: 1, r: 0.5, incomplete_uncovered: 0, score: 0.5 }],
    },
    proof_tests: { total: 1, by_class: { sis_proof_test: 1, sil_logic_test: 0, calibration_proof_test: 0, statutory_relief_test: 0 } },
    equipment_master: [
      {
        tag: SYN.equipmentTag,
        service: "synthetic feed duty",
        interlock_ref: SYN.seqId,
        sil_sheet: 1,
        criticality: "HIGH CRITICAL",
        work_orders: wos.length,
        failure_rows: unplanned + planned,
        breakdown_rows: unplanned + planned,
        planned_rows: planned,
        unplanned_rows: unplanned,
        unplanned_h: unplanned * 4,
        flagged_h: planned * 4,
        breakdown_cost_idr: (unplanned + planned) * 150000,
      },
    ],
    personnel: { people: 4, classes: { operator: 1, technician: 1, supervisor: 1, manager: 1 }, dual_role_supervisors: 0, managers_not_in_workbook: 0 },
    golden: { size: 2, by_category: { "Grounded answering": 1, Traceability: 1 }, hard_gate_count: 0 },
    legacy: { headline_all: 0, note: "evidence only" },
    demo: { primary_wo: "WO-240007", backup_wo: "WO-240039", contrast_wo: "WO-240060" },
  };
}

// A deterministic unit vector of the pinned dimension, distinct per seed.
function vector(seed: number): number[] {
  const raw = Array.from({ length: EMBEDDING_DIM }, (_, i) => Math.sin(seed * 7.3 + i * 0.37));
  const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0));
  return raw.map((v) => Number((v / norm).toFixed(6)));
}

export function writeJson(dir: string, rel: string, value: unknown): void {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 1)}\n`);
}

export function readJson<T = unknown>(dir: string, rel: string): T {
  return JSON.parse(readFileSync(path.join(dir, rel), "utf8")) as T;
}

function listFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(dir, prefix)).sort()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(path.join(dir, rel)).isDirectory()) out.push(...listFiles(dir, rel));
    else out.push(rel);
  }
  return out;
}

function digest(dir: string, rel: string): { path: string; sha256: string; bytes: number } {
  const bytes = readFileSync(path.join(dir, rel));
  return { path: rel, sha256: sha256Hex(bytes), bytes: bytes.length };
}

/** Re-computes one manifest entry after a test rewrote that file, so only the mutated fact is named. */
export function refreshManifest(dir: string, rel: string): void {
  const manifest = readJson<Manifest>(dir, "manifest.json");
  const entry = manifest.files.find((f) => f.path === rel);
  if (!entry) throw new Error(`${rel} is not listed in manifest.json`);
  Object.assign(entry, digest(dir, rel));
  writeJson(dir, "manifest.json", manifest);
}

export type WriteOptions = {
  /** The harness checkout the three connector contracts are copied from; default the sibling thehub-harness. */
  harnessDir?: string;
  /** Leave out chunks.jsonl, opls.json and pages/ (a public release under D-17). */
  publicOnly?: boolean;
};

/** Writes the synthetic bundle under `dir` (created if absent) and returns its manifest. */
export function writeSyntheticBundle(dir: string, options: WriteOptions = {}): Manifest {
  const harnessDir = options.harnessDir ?? defaultHarnessDir();
  const connectors = path.join(harnessDir, "contracts", "connectors");
  if (!existsSync(connectors)) throw new Error(`no harness checkout at ${harnessDir}: the connector contracts cannot be copied`);
  mkdirSync(dir, { recursive: true });

  const docs = documents();
  const revs = revisions(docs);
  const wos = workOrders();
  const byId = new Map(docs.map((d) => [d.id, d] as const));
  const currentOf = (cls: document.DocumentClass, n: number) => revs.find((r) => r.id === currentRev(cls, n))!;

  writeJson(dir, "documents.json", docs);
  writeJson(dir, "revisions.json", revs);
  writeJson(dir, "claims.json", claimsFile());
  writeJson(dir, "interlocks.json", interlocksFile());
  writeJson(dir, "datasheet_params.json", datasheetParams);
  writeJson(dir, "datasheet_spot.json", datasheetSpot);
  writeJson(dir, "revision_spot.json", ASSET_CLASSES.map((cls) => currentOf(cls, 1)));
  for (let n = 1; n <= 8; n += 1) writeJson(dir, `pid_sidecars/set_${pad(n, 2)}.json`, sidecar(n));
  writeJson(dir, "hand_verified.json", { sets: [{ document_id: SYN.pageDocumentId, file: `synthetic/${SYN.pageDocumentId}.png` }] });
  writeJson(dir, "work_orders.json", wos);
  const failureEvents: operations.FailureEvent[] = wos
    .filter((w) => w.breakdown_kind !== "none")
    .map((w) => ({
      wo_number: w.wo_number,
      equipment_tag: w.equipment_tag,
      report_date: w.report_date,
      downtime_hours: w.downtime_hours,
      maintenance_cost_idr: w.total_cost_idr,
      breakdown_kind: w.breakdown_kind === "unplanned" ? "unplanned" : "planned_flagged",
    }));
  writeJson(dir, "failure_events.json", failureEvents);
  const families: operations.FailureFamily[] = [
    { id: "fam-syn-1", label: "synthetic seal wear", basis: "analyst_classification", review_status: "reviewed", members: [{ wo_number: SYN.wo(7), recorded_root_cause: "seal face wear" }, { wo_number: SYN.wo(14), recorded_root_cause: "seal face wear" }] },
  ];
  writeJson(dir, "families.json", families);
  const chains: operations.CausalLink[] = [
    { id: "link-syn-1", from_wo: SYN.wo(7), to_wo: SYN.wo(14), equipment_tag: SYN.equipmentTag, mechanism_noun: "seal", interval_days: 30, linking_sentence: SPAN_TEXTS["span-syn-11"]!, linking_field: "root_cause", span_id: "span-syn-11" },
  ];
  writeJson(dir, "chains.json", chains);
  const proofTests: operations.ProofTest[] = [
    { wo_number: SYN.wo(3), equipment_tag: SYN.equipmentTag, seq_id: SYN.seqId, device_tag: SYN.initiatorTag, test_class: "sis_proof_test", completion_date: "2024-03-03", result_text: "trip confirmed at the setpoint", as_found: "12.5 mm/s", as_left: "12.5 mm/s" },
  ];
  writeJson(dir, "proof_tests.json", proofTests);
  const bomItems: operations.BomItem[] = [
    { id: "bom-syn-1", equipment_tag: SYN.equipmentTag, ga_drawing_doc_no: SYN.gaDocNo, item_no: 1, description: "mechanical seal cartridge", material: "silicon carbide", quantity: "1", span_id: "span-syn-10" },
  ];
  const bomMatches: operations.BomMatch[] = [
    { wo_number: SYN.wo(1), part_string: "mechanical seal cartridge", bom_item_id: "bom-syn-1", alternative_bom_item_id: null, disambiguator_text: null, status: "matched" },
  ];
  writeJson(dir, "bom.json", { items: bomItems, matches: bomMatches });
  writeJson(dir, "coverage_scores.json", coverageFile(wos));
  writeJson(dir, "coverage_labels.json", {
    ...fixtures(docs, wos).coverage_labels,
    records: [{ wo_number: SYN.wo(1), covered_by: [SYN.oplId(1)] }, { wo_number: SYN.wo(2), covered_by: null }],
  });
  writeFileSync(path.join(dir, "adjudication_log.md"), "# Synthetic adjudication log\n\nNo adjudication took place: this bundle exists for the tests.\n");
  const debt: coverage.DebtCluster[] = [
    {
      id: `debt-syn-${SYN.equipmentTag}`,
      equipment_tag: SYN.equipmentTag,
      corpus_version_id: "v1",
      uncovered_wo_numbers: [SYN.wo(3)],
      factors: { D_hours: 4, D_max: 4, C_idr: 150000, C_max: 150000, k: 1, r: 0.5 },
      coefficients: { a: 0.4, b: 0.3, c: 0.2, d: 0.1, basis: "ASSUMPTION" },
      incomplete_uncovered: 0,
      score: 0.5,
      rank: 1,
    },
  ];
  writeJson(dir, "debt.json", debt);
  writeJson(dir, "integrity_findings.json", {
    total: 2,
    rules: { "CD-1": 2 },
    observations: { "CD-15": 0, "CD-16": 0 },
    findings: [
      { id: "if-syn-1", rule_id: "CD-1", rule: "revision block signed", severity: "medium", discipline: "Mechanical", observation_only: false, unit: "SYN-UNIT-01", basis: "title block", document_id: SYN.docId("plot_plan", 1), span_id: "span-syn-13", state: "open", safety_function: null, routing_recommendation: "document control", item: "plot plan revision block" },
      { id: "if-syn-2", rule_id: "CD-1", rule: "revision block signed", severity: "high", discipline: null, observation_only: false, unit: "SYN-UNIT-01", basis: "sheet", document_id: SYN.docId("interlock", 1), span_id: "span-syn-03", state: "open", safety_function: SYN.seqId, routing_recommendation: "process safety", item: "trip row T1" },
    ],
  });
  const areas: asset.Area[] = [{ code: SYN.areaCode, workbook_name: "Synthetic Area", datasheet_name: "SYNTHETIC AREA", opl_header_name: "Synthetic area", plot_plan_title_name: "SYNTHETIC AREA" }];
  writeJson(dir, "area_aliases.json", areas);
  writeJson(dir, "rulepack/v1.json", rulepack);
  mkdirSync(path.join(dir, "golden"), { recursive: true });
  writeFileSync(path.join(dir, "golden", "cases.yaml"), GOLDEN_YAML);
  for (const name of ["edms", "aims", "historian"]) {
    mkdirSync(path.join(dir, "contracts"), { recursive: true });
    writeFileSync(path.join(dir, "contracts", `${name}.schema.json`), readFileSync(path.join(connectors, `${name}.schema.json`)));
  }
  writeJson(dir, "inventory.json", {
    files_total: 98,
    by_class: fixtures(docs, wos).inventory.by_class,
    corpus_sha256: SYN.corpusSha256,
    extractor: SYN.extractor,
    canonical_form_version: "1",
    opl_count: SYN.lessons,
    files: docs.map((d) => ({ document_id: d.id, source_path: d.source_path, class: d.class, sha256: d.sha256, bytes: 1024, page_count: 1, sidecar_path: d.class === "pid" ? `pid_sidecars/set_${pad(classAndNumber(d)[1], 2)}.json` : null, text_extracted: d.class !== "pid" })),
  });
  writeJson(dir, "fixtures.json", fixtures(docs, wos));

  if (!options.publicOnly) {
    writeJson(dir, "opls.json", oplsFile());
    const chunks: document.Chunk[] = [
      { id: "chunk-syn-1", document_revision_id: currentRev("opl", 1), page: 1, ordinal: 0, unit_kind: "opl_step", text: SPAN_TEXTS["span-syn-07"]!, quote_hash: quoteHash(SPAN_TEXTS["span-syn-07"]!), embedding: vector(1) },
      { id: "chunk-syn-2", document_revision_id: currentRev("opl", 1), page: 1, ordinal: 1, unit_kind: "opl_step", text: SPAN_TEXTS["span-syn-08"]!, quote_hash: quoteHash(SPAN_TEXTS["span-syn-08"]!), embedding: vector(2) },
    ];
    writeFileSync(path.join(dir, "chunks.jsonl"), `${chunks.map((c) => JSON.stringify(c)).join("\n")}\n`);
    writeJson(dir, "pages/index.json", {
      width: 1200,
      format: "webp",
      quality: 80,
      documents: [{ document_id: SYN.pageDocumentId, source_sha256: byId.get(SYN.pageDocumentId)!.sha256, page_count: 1 }],
    });
    mkdirSync(path.join(dir, "pages", SYN.pageDocumentId), { recursive: true });
    writeFileSync(path.join(dir, "pages", SYN.pageDocumentId, "1.webp"), WEBP_2X2);
  }

  const manifest: Manifest = {
    bundle_version: SYN.bundleVersion,
    harness_commit: "0".repeat(40),
    corpus_sha256: SYN.corpusSha256,
    extractor: SYN.extractor,
    canonical_form_version: "1",
    recipe_sha256: SYN.recipeSha256,
    stop_list_sha256: SYN.stopListSha256,
    rulepack_version: "1",
    embedding_model: null,
    files: listFiles(dir)
      .filter((rel) => rel !== "manifest.json")
      .map((rel) => digest(dir, rel)),
    created_at: "2026-09-06T00:00:00Z",
  };
  writeJson(dir, "manifest.json", manifest);
  return manifest;
}
