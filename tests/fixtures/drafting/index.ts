// Synthetic fixtures for the drafting lane (src/loop/*.test.ts, src/app/api/drafts/**/route.test.ts; blueprint 9.5,
// 9.6, 9.9, 9.16; ARCHITECTURE 8.2 to 8.5; AC-LOOP-04, 05, 06, 13, 14, 15). One invented asset GA-9901A with three
// invented work orders, one datasheet parameter and one lesson step: no corpus text, no corpus work-order number and
// no corpus document number appears here. Every cluster, work order, AG-3 output, redline output and draft field is
// parsed against the generated Zod on load, so a fixture that drifts from the frozen contract of section 9 fails
// before any lane test runs.
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Sandbox } from "@/auth/sandbox";
import { DebtCluster } from "@/contracts/generated/coverage";
import { DraftField, type DraftState } from "@/contracts/generated/drafts";
import { AG3Output, AG4RedlineOutput, GatewayCall, type AG3Input } from "@/contracts/generated/gateway";
import { WorkOrder } from "@/contracts/generated/operations";
import type { draftDocument, draftField, draftTransition, redlineVerdict } from "@/db/schema";
import { SLOT_TEXT } from "@/lib/fixed-strings";

export const CORPUS_VERSION = { id: "cv-1", label: "v1" } as const;
export const TAG = "GA-9901A";
export const CLUSTER_ID = "dc-cv-1-GA-9901A";
export const SANDBOX_ID = "sbx0000000000000000000000000000000000000000";
export const DRAFT_ID = "dr-0001";

// src/auth/sandbox.ts accepts the thehub_sandbox cookie only as 43 base64url characters (D-16). A fixture id of any
// other shape is ignored by getSandbox(), the route then sees no sandbox, and every scope assertion of this lane
// would pass for the wrong reason; so the shape is checked here, once, when the fixtures load.
if (!/^[A-Za-z0-9_-]{43}$/.test(SANDBOX_ID)) throw new Error("fixture sandbox id is not a sandbox cookie value");

/** The Reviewing Supervisor is the only role holding create_draft (9.9 matrix). */
export const SUPERVISOR = {
  id: "u-sup",
  username: "supervisor_demo",
  alias: "SUP-DEMO",
  role: "Reviewing Supervisor" as const,
  sessionId: "s-sup",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------------------------------------------
// The cluster and its evidence (AG3Input)
// ---------------------------------------------------------------------------------------------------------------

export const CLUSTER = DebtCluster.parse({
  id: CLUSTER_ID,
  equipment_tag: TAG,
  corpus_version_id: CORPUS_VERSION.id,
  uncovered_wo_numbers: ["WO-990001", "WO-990002"],
  factors: { D_hours: 12.5, D_max: 40, C_idr: 30_000_000, C_max: 90_000_000, k: 1, r: 0.5 },
  coefficients: { a: 0.4, b: 0.3, c: 0.2, d: 0.1, basis: "ASSUMPTION" },
  incomplete_uncovered: 1,
  score: 0.5375,
  rank: 1,
});

const WORK_ORDER_BASE = {
  notification_no: "NT-990001",
  report_date: "2025-03-04",
  start_date: "2025-03-04",
  completion_date: "2025-03-05",
  status: "Closed",
  equipment_tag: TAG,
  work_type: "Corrective",
  discipline: "Mechanical",
  priority: "High",
  criticality: "HIGH CRITICAL",
  spare_parts_used: "coupling element set",
  breakdown: true,
  downtime_hours: 6.25,
  labor_hours: 8,
  labor_cost_idr: 5_000_000,
  material_cost_idr: 10_000_000,
  total_cost_idr: 15_000_000,
  reported_by_alias: "OPS-1",
  executed_by_alias: "MEC-1",
  approved_by_alias: "SUP-DEMO",
  related_interlock: null,
  remarks: null,
  closeout_complete: true,
  completeness_flags: {},
  breakdown_kind: "unplanned",
  notification_lead_hours: 2,
} as const;

function workOrder(partial: { wo_number: string; problem_description: string; root_cause: string; corrective_action: string } & Partial<WorkOrder>): WorkOrder {
  return WorkOrder.parse({ ...WORK_ORDER_BASE, ...partial });
}

/** The three narrative fields the verbatim check reads (harness coverage.py NARR). */
export const NARRATIVE_FIELDS = ["problem_description", "root_cause", "corrective_action"] as const;

export const WORK_ORDERS: WorkOrder[] = [
  workOrder({
    wo_number: "WO-990001",
    problem_description: "High vibration alarm on the driven end during a normal running load.",
    root_cause: "The coupling element had hardened and cracked well beyond its inspection interval.",
    corrective_action: "Replaced the coupling element and realigned the driver to the driven shaft.",
  }),
  workOrder({
    wo_number: "WO-990002",
    problem_description: "Bearing temperature rose steadily over one shift without a load change.",
    root_cause: "Lubricant had degraded and carried metallic debris from the earlier coupling failure.",
    corrective_action: "Drained the lubricant, flushed the housing and refilled to the marked level.",
    closeout_complete: false,
  }),
  workOrder({
    wo_number: "WO-990003",
    problem_description: "Short.",
    root_cause: "Unknown.",
    corrective_action: "None.",
    downtime_hours: null,
  }),
];

export const DATASHEET_PARAM = {
  id: "dp-syn-1",
  equipment_tag: TAG,
  group: "Vibration",
  field: "Alarm set point",
  unit: "mm/s",
  value_text: "7.1 mm/s",
  value_num: 7.1,
  span_id: "sp-syn-ds-1",
} as const;

export const OPL_STEP = {
  opl_id: "OPL-GA-9901A-01",
  n: 1,
  action_text: "Isolate the driver and lock out its starter before opening the coupling guard.",
  acceptance_criterion: "The starter is locked out and tagged.",
  source_hash: "a".repeat(64),
  span_id: "sp-syn-opl-1",
} as const;

/** The asset's one published lesson, which is where OPL_STEP comes from: the house style the drafter is shown, and
 *  the reason the new draft reserves OPL-GA-9901A-02. Its sections are the six of the template, abbreviated. */
export const LESSON: AG3Input["evidence"]["lessons"][number] = {
  document_revision_id: "dr-syn-opl-1",
  opl_id: OPL_STEP.opl_id,
  title: "Coupling guard removal",
  discipline: "Mechanical",
  equipment_tag: TAG,
  area_unit: "Unit 99",
  related_interlock_text: "None",
  pid_ref: "PID-SYN-99",
  classification: "Basic Knowledge",
  aspect: "Mechanical integrity",
  sections: ([1, 2, 3, 4, 5, 6] as const).map((n) => ({
    n,
    heading: `Section ${n}`,
    body_text: `Section ${n} of the published lesson.`,
    body_hash: "b".repeat(64),
  })),
  permit_lines: [{ text: "A work permit is raised before the guard is opened.", span_id: "sp-syn-opl-2", source_section: 2 }],
  footer: { prepared_by: "MEC-1", reviewed_by_alias: "SUP-DEMO", approved_by_alias: "MGR-DEMO", date_of_sharing: "2025-04-01" },
  machine_drafted: false,
  approver_alias: "MGR-DEMO",
};

/** The typed evidence of the AG-3 envelope (9.16): the six kinds in the order the contract names them. The cluster
 *  is uncovered, so no lesson covers these work orders; the asset's existing lesson is still evidence. */
export const EVIDENCE: AG3Input["evidence"] = {
  work_orders: WORK_ORDERS,
  datasheet_params: [DATASHEET_PARAM],
  interlock_rows: [],
  bom_items: [],
  opl_steps: [OPL_STEP],
  lessons: [LESSON],
};

// ---------------------------------------------------------------------------------------------------------------
// AG-3 outputs (9.16). `element()` keeps every one carrying provenance or being a slot, as the contract requires.
// ---------------------------------------------------------------------------------------------------------------

type Element = AG3Output["sections"][number]["elements"][number];

export function element(text: string, ref: string | null = "WO-990001", type: DraftField["provenance"]["type"] = "work_order"): Element {
  return { text, provenance: { type, ref, span_id: null }, is_slot: false };
}

export const SLOT_ELEMENT: Element = { text: SLOT_TEXT, provenance: { type: "slot", ref: null, span_id: null }, is_slot: true };

const HEADER = { opl_id: "OPL-GA-9901A-02", title: "Coupling element inspection and replacement", equipment_tag: TAG, discipline: "Mechanical" };

/** Six sections, each with the elements a test names; a section not named gets one sourced element. */
export function ag3Output(bySection: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, Element[]>> = {}, rows: AG3Output["troubleshooting_rows"] = []): AG3Output {
  const ns = [1, 2, 3, 4, 5, 6] as const;
  return AG3Output.parse({
    header: HEADER,
    sections: ns.map((n) => ({ n, elements: bySection[n] ?? [element(`Section ${n} line from the maintenance record.`)] })),
    troubleshooting_rows: rows,
  });
}

/** Nothing reproduced, one slot in section 4, one numeral the datasheet parameter types (AC-LOOP-05 contrast case). */
export const CLEAN_OUTPUT: AG3Output = ag3Output({
  3: [element("The alarm set point is 7.1 mm/s.", DATASHEET_PARAM.id, "datasheet_param")],
  4: [SLOT_ELEMENT],
  5: [element("See the troubleshooting table below.")],
});

/** A narrative field of WO-990001 reproduced verbatim inside section 2 (AC-LOOP-04, the blocking case). */
export const VERBATIM_OUTPUT: AG3Output = ag3Output({
  2: [element(`Background: ${WORK_ORDERS[0]!.root_cause}`)],
});

/** Section 5 quotes the same narrative with its work-order id, which the rule allows. */
export const SECTION_5_QUOTE_OUTPUT: AG3Output = ag3Output(
  { 5: [element(`WO-990001: ${WORK_ORDERS[0]!.root_cause}`)] },
  [{ problem: "High vibration", cause: "Hardened coupling element", action: "Replace the element", quoted_wo_number: "WO-990001" }],
);

/** A numeral no evidence types, in a non-slot element (AC-LOOP-05, the blocking case). */
export const UNSOURCED_NUMERAL_OUTPUT: AG3Output = ag3Output({
  3: [element("Replace the coupling element every 18 months.")],
});

// ---------------------------------------------------------------------------------------------------------------
// draft_field rows (9.6). verbatim.ts and numeric.ts read these, never an AG-3 output.
// ---------------------------------------------------------------------------------------------------------------

let fieldSeq = 0;

export function field(partial: Partial<DraftField> & { section: DraftField["section"]; text: string }): DraftField {
  fieldSeq += 1;
  return DraftField.parse({
    id: `df-${fieldSeq}`,
    draft_id: DRAFT_ID,
    ordinal: 1,
    provenance: { type: "work_order", ref: "WO-990001", span_id: null },
    numeric_provenance: [],
    quarantined: false,
    is_slot: false,
    ...partial,
  });
}

export function slotField(section: DraftField["section"], ordinal = 1): DraftField {
  return field({ section, ordinal, text: SLOT_TEXT, is_slot: true, provenance: { type: "slot", ref: null, span_id: null } });
}

/** The numeric_provenance entry the datasheet parameter supports. */
export const SET_POINT_PROVENANCE = { numeral: "7.1", source_ref: DATASHEET_PARAM.id, unit: "mm/s" } as const;

// ---------------------------------------------------------------------------------------------------------------
// Redline outputs (9.16 AG-4 redline): a verdict and reasons, never an edit.
// ---------------------------------------------------------------------------------------------------------------

export const REDLINE_PASS = AG4RedlineOutput.parse({ verdict: "pass", reasons: [] });

export const REDLINE_BLOCK = AG4RedlineOutput.parse({
  verdict: "block",
  reasons: [{ category: "safety_framing", text: "The isolation step does not name the permit the work needs.", field_id: "df-1" }],
});

// ---------------------------------------------------------------------------------------------------------------
// Rows as the database returns them (Drizzle select shapes)
// ---------------------------------------------------------------------------------------------------------------

export type DraftRow = typeof draftDocument.$inferSelect;

export function draftRow(partial: Partial<DraftRow> = {}): DraftRow {
  return {
    id: DRAFT_ID,
    clusterId: CLUSTER_ID,
    equipmentTag: TAG,
    state: "proposed" as DraftState,
    leaseExpiresAt: new Date("2026-09-07T10:04:00.000Z"),
    corpusVersionId: CORPUS_VERSION.id,
    oplIdReserved: "OPL-GA-9901A-02",
    title: "Coupling element inspection and replacement",
    classification: "Trouble Case",
    aspect: "Mechanical integrity",
    createdByAlias: SUPERVISOR.alias,
    modelId: "glm-5.3-flash",
    promptVersion: "fixture",
    previousDraftId: null,
    sessionScope: SANDBOX_ID,
    ...partial,
  };
}

export const SANDBOX_ROW: Sandbox = { id: SANDBOX_ID, corpusVersionId: null, createdAt: new Date("2026-09-07T09:00:00.000Z"), lastSeenAt: new Date("2026-09-07T10:00:00.000Z") };

// ---------------------------------------------------------------------------------------------------------------
// Reading a Drizzle SQL fragment in a unit test: the Postgres dialect renders it to { sql, params } with no
// connection, so a test can assert what a where clause or a default expression actually says.
// ---------------------------------------------------------------------------------------------------------------

export function queryOf(fragment: unknown): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(fragment as SQL);
  return { sql: query.sql, params: query.params };
}

/** A gateway_call row as invoke() returns it, for a mocked invoke. */
export function gatewayCall(role: "AG-3" | "AG-4", outcome: GatewayCall["outcome"] = "ok"): GatewayCall {
  return GatewayCall.parse({
    role,
    request_sha256: "0".repeat(64),
    response_sha256: "0".repeat(64),
    model_id: "glm-5.3-flash",
    prompt_version: "fixture",
    gateway_config_sha256: "0".repeat(64),
    corpus_version_id: CORPUS_VERSION.id,
    latency_ms: 1,
    input_tokens: 0,
    output_tokens: 0,
    outcome,
  });
}

/** A contract object as Drizzle hands it back: top-level keys camel-cased, every nested value left alone. */
export function rowOf(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase()), v]));
}

/** draft_field, redline_verdict and draft_transition as Drizzle returns them (the detail route maps them to 9.6). */
export function fieldRow(partial: Partial<typeof draftField.$inferSelect> = {}): typeof draftField.$inferSelect {
  return {
    id: "df-row-1",
    draftId: DRAFT_ID,
    section: 3,
    ordinal: 1,
    text: "The alarm set point is 7.1 mm/s.",
    provenance: { type: "datasheet_param", ref: DATASHEET_PARAM.id, span_id: null },
    numericProvenance: [SET_POINT_PROVENANCE],
    quarantined: false,
    isSlot: false,
    ...partial,
  };
}

export function verdictRow(partial: Partial<typeof redlineVerdict.$inferSelect> = {}): typeof redlineVerdict.$inferSelect {
  return {
    draftId: DRAFT_ID,
    round: 1,
    verdict: "block",
    reasons: REDLINE_BLOCK.reasons,
    modelId: "glm-5.3-flash",
    promptVersion: "0".repeat(64),
    createdAt: new Date("2026-09-07T10:02:00.000Z"),
    ...partial,
  };
}

export function transitionRow(partial: Partial<typeof draftTransition.$inferSelect> = {}): typeof draftTransition.$inferSelect {
  return {
    id: "dt-1",
    draftId: DRAFT_ID,
    fromState: "proposed",
    toState: "drafted",
    actorAlias: "system",
    actorRole: "system",
    reason: null,
    editDiff: null,
    serverTs: new Date("2026-09-07T10:01:00.000Z"),
    ...partial,
  };
}
