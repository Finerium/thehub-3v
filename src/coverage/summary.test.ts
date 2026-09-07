// The populations, the sensitivity ladder and the bands of blueprint 9.5 (harness/workbook.py `populations` at lines
// 59-67, harness/coverage.py `table` at 98-113 and the band block at 255-260, and the fixture spelling of
// harness/entities.py `coverage_summaries` at 1081-1106). It pins the shape src/coverage/summary.ts must land:
//
//   POPULATIONS         ["all", "failure", "planned_flagged", "unplanned_breakdowns", "unplanned_failure"]
//   SENSITIVITY_LADDER  [0.5, 0.55, 0.6, 0.62, 0.65, 0.7, 0.75]        harness/coverage.py:27
//   populationsOf(workOrders): Record<Population, WorkOrder[]>
//   bandsOf(unplannedFailure, generous, strict, threshold): { no_lesson, copied_row_only, taught }
//   summarise(workOrders, { generous, strict }): Summary[]              ten rows, generous first, populations sorted
//
// Frozen rules pinned here: failure is Work_Type Corrective or Overhaul or Breakdown yes; unplanned_failure drops
// the rows whose problem description opens with a planned prefix; the flagged populations read breakdown_kind; a row
// is uncovered when its score is at or below t; the breakdown, downtime and cost columns count only the uncovered
// rows whose breakdown_kind is unplanned, a null downtime or cost counting as zero; the bands hang on the
// unplanned-failure row and nowhere else.
import { describe, expect, it } from "vitest";
import type * as operations from "@/contracts/generated/operations";
import { SYN, workOrder } from "../../tests/fixtures/coverage";
import type { WorkOrderScore } from "./score";
import { bandsOf, POPULATIONS, populationsOf, SENSITIVITY_LADDER, summarise } from "./summary";

/** A score map keyed by work-order number; only best_ratio is read by the summaries. */
const scores = (byWo: Record<string, number>): Map<string, WorkOrderScore> =>
  new Map(
    Object.entries(byWo).map(([wo, best_ratio]) => [
      wo,
      { best_ratio, matched_field: null, matched_lesson: null, covered: best_ratio > 0.62 },
    ]),
  );

describe("the frozen constants", () => {
  it("are the five populations and the seven-rung ladder (harness/coverage.py:27)", () => {
    expect(POPULATIONS).toEqual(["all", "failure", "planned_flagged", "unplanned_breakdowns", "unplanned_failure"]);
    expect(SENSITIVITY_LADDER).toEqual([0.5, 0.55, 0.6, 0.62, 0.65, 0.7, 0.75]);
  });
});

describe("populationsOf", () => {
  const rows: operations.WorkOrder[] = [
    // Corrective and not planned: a failure and an unplanned failure; flagged unplanned as well.
    workOrder({ wo_number: SYN.wo(1), work_type: "Corrective", breakdown: true, breakdown_kind: "unplanned" }),
    // Preventive with the breakdown flag: a failure through the flag alone.
    workOrder({ wo_number: SYN.wo(2), work_type: "Preventive", breakdown: true, breakdown_kind: "unplanned" }),
    // Overhaul opened by a planned prefix: a failure, but never an unplanned failure.
    workOrder({
      wo_number: SYN.wo(3),
      work_type: "Overhaul",
      problem_description: "Scheduled overhaul of the synthetic asset",
      breakdown: true,
      breakdown_kind: "planned_flagged",
    }),
    // The prefix is matched case-insensitively (harness/workbook.py:18 re.I).
    workOrder({
      wo_number: SYN.wo(4),
      work_type: "Corrective",
      problem_description: "turnaround window inspection of the synthetic asset",
    }),
    // Preventive, no flag: in `all` and nowhere else.
    workOrder({ wo_number: SYN.wo(5), work_type: "Preventive" }),
  ];
  const pops = populationsOf(rows);
  const ids = (p: keyof typeof pops) => pops[p].map((w) => w.wo_number);

  it("puts every row in `all`", () => {
    expect(ids("all")).toEqual([SYN.wo(1), SYN.wo(2), SYN.wo(3), SYN.wo(4), SYN.wo(5)]);
  });

  it("reads failure as Corrective or Overhaul or the breakdown flag (harness/workbook.py:44)", () => {
    expect(ids("failure")).toEqual([SYN.wo(1), SYN.wo(2), SYN.wo(3), SYN.wo(4)]);
  });

  it("drops a planned-prefixed row from unplanned_failure while it stays a failure", () => {
    expect(ids("unplanned_failure")).toEqual([SYN.wo(1), SYN.wo(2)]);
  });

  it("reads the two flagged populations off breakdown_kind (harness/workbook.py:45-48)", () => {
    expect(ids("planned_flagged")).toEqual([SYN.wo(3)]);
    expect(ids("unplanned_breakdowns")).toEqual([SYN.wo(1), SYN.wo(2)]);
  });
});

describe("bandsOf", () => {
  const rows = [workOrder({ wo_number: SYN.wo(1) }), workOrder({ wo_number: SYN.wo(2) }), workOrder({ wo_number: SYN.wo(3) })];

  it("splits the population into no_lesson, copied_row_only and taught (harness/coverage.py:255-260)", () => {
    // 1 uncovered in both layers, 2 covered generously but uncovered strictly, 3 covered in both.
    const generous = scores({ [SYN.wo(1)]: 0.1, [SYN.wo(2)]: 0.9, [SYN.wo(3)]: 0.9 });
    const strict = scores({ [SYN.wo(1)]: 0.1, [SYN.wo(2)]: 0.2, [SYN.wo(3)]: 0.9 });
    expect(bandsOf(rows, generous, strict, 0.62)).toEqual({ no_lesson: 1, copied_row_only: 1, taught: 1 });
  });

  it("counts a row uncovered strictly but covered generously as copied_row_only only once", () => {
    const generous = scores({ [SYN.wo(1)]: 0.9, [SYN.wo(2)]: 0.9, [SYN.wo(3)]: 0.9 });
    const strict = scores({ [SYN.wo(1)]: 0.1, [SYN.wo(2)]: 0.1, [SYN.wo(3)]: 0.1 });
    expect(bandsOf(rows, generous, strict, 0.62)).toEqual({ no_lesson: 0, copied_row_only: 3, taught: 0 });
  });
});

describe("summarise", () => {
  const rows: operations.WorkOrder[] = [
    workOrder({
      wo_number: SYN.wo(1),
      work_type: "Corrective",
      breakdown: true,
      breakdown_kind: "unplanned",
      downtime_hours: 4.5,
      total_cost_idr: 1_000_000,
    }),
    workOrder({
      wo_number: SYN.wo(2),
      work_type: "Corrective",
      breakdown: true,
      breakdown_kind: "unplanned",
      downtime_hours: null,
      total_cost_idr: null,
    }),
    workOrder({
      wo_number: SYN.wo(3),
      work_type: "Overhaul",
      problem_description: "Statutory inspection of the synthetic asset",
      breakdown: true,
      breakdown_kind: "planned_flagged",
      downtime_hours: 99,
      total_cost_idr: 99_000_000,
    }),
  ];
  // Everything uncovered at every rung except work order 1, which clears 0.62 but not 0.65.
  const generous = scores({ [SYN.wo(1)]: 0.64, [SYN.wo(2)]: 0.1, [SYN.wo(3)]: 0.1 });
  const strict = scores({ [SYN.wo(1)]: 0.1, [SYN.wo(2)]: 0.1, [SYN.wo(3)]: 0.1 });
  const out = summarise(rows, { generous, strict });
  const find = (layer: string, population: string) =>
    out.find((s) => s.layer === layer && s.population === population);

  it("returns ten rows, the generous layer first and the populations sorted", () => {
    expect(out.map((s) => [s.layer, s.population])).toEqual([
      ["generous", "all"],
      ["generous", "failure"],
      ["generous", "planned_flagged"],
      ["generous", "unplanned_breakdowns"],
      ["generous", "unplanned_failure"],
      ["strict", "all"],
      ["strict", "failure"],
      ["strict", "planned_flagged"],
      ["strict", "unplanned_breakdowns"],
      ["strict", "unplanned_failure"],
    ]);
  });

  it("counts a row uncovered when its score is at or below the threshold", () => {
    expect(find("generous", "all")).toMatchObject({ population_count: 3, uncovered_count: 2, threshold: 0.62 });
    expect(find("strict", "all")).toMatchObject({ population_count: 3, uncovered_count: 3 });
  });

  it("counts breakdowns, downtime and cost over the uncovered UNPLANNED rows only, a null counting as zero", () => {
    // Work order 2 is the only uncovered unplanned row generously: its downtime and cost are null, so both are zero.
    expect(find("generous", "all")).toMatchObject({
      uncovered_breakdowns: 1,
      uncovered_downtime_hours: 0,
      uncovered_cost_idr: 0,
    });
    // Strictly both unplanned rows are uncovered; the planned_flagged row never contributes.
    expect(find("strict", "all")).toMatchObject({
      uncovered_breakdowns: 2,
      uncovered_downtime_hours: 4.5,
      uncovered_cost_idr: 1_000_000,
    });
  });

  it("walks the whole ladder in order and moves the count where the score crosses a rung", () => {
    expect(find("generous", "all")?.sensitivity).toEqual([
      { t: 0.5, uncovered_count: 2 },
      { t: 0.55, uncovered_count: 2 },
      { t: 0.6, uncovered_count: 2 },
      { t: 0.62, uncovered_count: 2 },
      { t: 0.65, uncovered_count: 3 },
      { t: 0.7, uncovered_count: 3 },
      { t: 0.75, uncovered_count: 3 },
    ]);
  });

  it("hangs the bands on the unplanned-failure row and nowhere else (harness/entities.py:1094)", () => {
    expect(find("generous", "unplanned_failure")?.bands).toEqual({ no_lesson: 1, copied_row_only: 1, taught: 0 });
    expect(find("strict", "unplanned_failure")?.bands).toEqual({ no_lesson: 1, copied_row_only: 1, taught: 0 });
    expect(find("generous", "all")?.bands).toBeNull();
    expect(find("strict", "failure")?.bands).toBeNull();
  });
});
