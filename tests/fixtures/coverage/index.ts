// Synthetic inputs for the coverage port unit tests (src/coverage/*.test.ts). Every sentence, tag and number here is
// the team's own: no corpus text and no corpus number is copied, so these files stay publishable. The asset tag is
// SY-0101A, lessons are OPL-SY-0101A-nn and work orders WO-SYN-nnnn, matching the SYN convention of
// tests/fixtures/bundle/synthetic.ts. The equality gate (tests/equality/coverage.test.ts) is the one place the port
// meets real corpus figures; nothing in this file is expected to reproduce a published number.
import type { LessonText } from "@/coverage/layers";
import type * as coverage from "@/contracts/generated/coverage";
import type * as operations from "@/contracts/generated/operations";

/** A stop list of the shape the port is given (fixtures.method.stop_list, D-19), small enough to read in a test. */
export const STOP: readonly string[] = ["and", "at", "for", "of", "the", "to", "with"];

export const SYN = {
  equipmentTag: "SY-0101A",
  equipmentName: "SYNTHETIC TEST PUMP",
  oplId: (n: number) => `OPL-SY-0101A-${String(n).padStart(2, "0")}`,
  wo: (n: number) => `WO-SYN-${String(n).padStart(4, "0")}`,
} as const;

type Section = coverage.Opl["sections"][number];

export const SECTION_HEADINGS: Readonly<Record<Section["n"], string>> = {
  1: "PURPOSE / OBJECTIVE",
  2: "SAFETY PRECAUTIONS",
  3: "TOOLS & MATERIALS REQUIRED",
  4: "DETAILED PROCEDURE / STEPS",
  5: "COMMON PROBLEMS & TROUBLESHOOTING",
  6: "KEY LEARNING POINTS",
};

/** One section body; `n` picks the heading, so a test names sections by number the way blueprint 9.5 does. */
export function section(n: Section["n"], bodyText: string, heading = SECTION_HEADINGS[n]): Section {
  // body_hash is not read by the port; a stable filler keeps the object contract-shaped.
  return { n, heading, body_text: bodyText, body_hash: "0".repeat(64) };
}

/** A contract-shaped lesson with the six sections a caller cares about and empty bodies for the rest. */
export function lesson(oplId: string, bodies: Partial<Record<Section["n"], string>>): coverage.Opl {
  const ns: Section["n"][] = [1, 2, 3, 4, 5, 6];
  return {
    document_revision_id: `rev-${oplId.toLowerCase()}`,
    opl_id: oplId,
    title: "Barscreen rake check",
    discipline: "Mechanical",
    equipment_tag: SYN.equipmentTag,
    area_unit: "0100 - SYNTHETIC UNIT",
    related_interlock_text: "SEQ-SYN-0101 (SIL 1)",
    pid_ref: "SYN-PID-0101",
    classification: "Basic Knowledge",
    aspect: "P-Q-C-D-S-M-E",
    sections: ns.map((n) => section(n, bodies[n] ?? "")),
    permit_lines: [],
    footer: {
      prepared_by: "Panel Operator / Technician",
      reviewed_by_alias: "EMP-SYN-1",
      approved_by_alias: "EMP-SYN-2",
      date_of_sharing: "2026-01-05",
    },
    machine_drafted: false,
    approver_alias: "EMP-SYN-2",
  };
}

/** The same lesson as a `LessonText`, with the header block and the equipment name a caller wants to see. */
export function lessonText(
  oplId: string,
  bodies: Partial<Record<Section["n"], string>>,
  extra: Partial<Pick<LessonText, "header_text" | "equipment_name">> = {},
): LessonText {
  return {
    ...lesson(oplId, bodies),
    header_text: extra.header_text ?? "ONE POINT LESSON header block",
    equipment_name: extra.equipment_name ?? SYN.equipmentName,
  };
}

/**
 * A lesson that contributes nothing but the bodies it is given: no header block, no headings, an empty equipment
 * name, and every unnamed field emptied. A test that counts content words to reason about the window uses this, so
 * the window arithmetic is the arithmetic of the words the test wrote and of nothing else.
 */
export function bareLessonText(oplId: string, bodies: Partial<Record<Section["n"], string>>): LessonText {
  const base = lesson(oplId, bodies);
  const ns: Section["n"][] = [1, 2, 3, 4, 5, 6];
  return {
    ...base,
    title: "",
    discipline: "",
    area_unit: "",
    related_interlock_text: "",
    pid_ref: "",
    classification: base.classification,
    aspect: "",
    sections: ns.map((n) => section(n, bodies[n] ?? "", "")),
    header_text: "",
    equipment_name: "",
  };
}

type WorkOrderOverrides = Partial<operations.WorkOrder> & { wo_number: string };

/** A contract-shaped work order; only the fields the port reads need naming at a call site. */
export function workOrder(overrides: WorkOrderOverrides): operations.WorkOrder {
  return {
    notification_no: "NT-SYN-0001",
    report_date: "2026-01-01T00:00:00",
    start_date: "2026-01-01T01:00:00",
    completion_date: "2026-01-01T02:00:00",
    status: "Completed",
    equipment_tag: SYN.equipmentTag,
    work_type: "Corrective",
    discipline: "Mechanical",
    priority: "Medium",
    criticality: "HIGH CRITICAL",
    problem_description: "",
    root_cause: "",
    corrective_action: "",
    spare_parts_used: "",
    breakdown: false,
    downtime_hours: null,
    labor_hours: null,
    labor_cost_idr: null,
    material_cost_idr: null,
    total_cost_idr: null,
    reported_by_alias: "EMP-SYN-3",
    executed_by_alias: "EMP-SYN-4",
    approved_by_alias: "EMP-SYN-2",
    related_interlock: null,
    remarks: null,
    closeout_complete: false,
    completeness_flags: {},
    breakdown_kind: "none",
    notification_lead_hours: 1,
    ...overrides,
  };
}
