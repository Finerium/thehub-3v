// The knowledge-debt ranking of blueprint 9.5 (harness/debt.py `rank` at lines 19-54, in the fixture spelling of
// harness/entities.py `debt_clusters` at 1110-1133). It pins the shape src/coverage/debt.ts must land:
//
//   COEFFICIENTS = { a: 0.4, b: 0.3, c: 0.2, d: 0.1, basis: "ASSUMPTION" }
//   K_BY_CRITICALITY = { "HIGH CRITICAL": 1, "LOW CRITICAL": 0.5, "NON CRITICAL": 0.25 }   harness/debt.py:16
//   familyShare(unplannedFailureOfAsset, familyMembers): number                            r, 4 dp
//   rankDebt({ workOrders, uncoveredWoNumbers, criticalityByTag, familyMembers }): DebtRow[]
//
// score = 0.4 D/Dmax + 0.3 C/Cmax + 0.2 k + 0.1 r over the generous-uncovered unplanned-failure rows of the asset:
// D is their unplanned-breakdown downtime, C their recorded cost, and a row with an incomplete closeout contributes
// zero to C and one to incomplete_uncovered while staying an event of r. Frozen rules pinned here: every asset of
// criticalityByTag appears whether or not it has an uncovered row, ids are sorted, a zero fleet maximum makes that
// term zero, the score is rounded to 4 dp, and the ranking is score descending with ties broken by tag ascending.
import { describe, expect, it } from "vitest";
import type * as operations from "@/contracts/generated/operations";
import { workOrder } from "../../tests/fixtures/coverage";
import { COEFFICIENTS, familyShare, K_BY_CRITICALITY, rankDebt } from "./debt";

const HIGH = "AA-0001";
const LOW = "BB-0002";
const NONE = "CC-0003";
const criticalityByTag = { [HIGH]: "HIGH CRITICAL", [LOW]: "LOW CRITICAL", [NONE]: "NON CRITICAL" };

/** A Corrective row with no planned prefix, so it lands in the unplanned-failure population. */
const failed = (wo: string, tag: string, over: Partial<operations.WorkOrder> = {}): operations.WorkOrder =>
  workOrder({
    wo_number: wo,
    equipment_tag: tag,
    work_type: "Corrective",
    problem_description: "Synthetic failure of the test asset",
    breakdown: true,
    breakdown_kind: "unplanned",
    closeout_complete: true,
    ...over,
  });

describe("the frozen constants", () => {
  it("are the four coefficients with their ASSUMPTION basis and the criticality mapping (harness/debt.py:14-16)", () => {
    expect(COEFFICIENTS).toEqual({ a: 0.4, b: 0.3, c: 0.2, d: 0.1, basis: "ASSUMPTION" });
    expect(K_BY_CRITICALITY).toEqual({ "HIGH CRITICAL": 1, "LOW CRITICAL": 0.5, "NON CRITICAL": 0.25 });
  });
});

describe("familyShare", () => {
  const rows = [failed("WO-SYN-0001", HIGH), failed("WO-SYN-0002", HIGH), failed("WO-SYN-0003", HIGH)];

  it("is the share of the asset's unplanned-failure rows inside any family, at 4 dp (harness/master.py:315)", () => {
    expect(familyShare(rows, new Set(["WO-SYN-0001"]))).toBe(0.3333);
    expect(familyShare(rows, new Set(["WO-SYN-0001", "WO-SYN-0002", "WO-SYN-0003"]))).toBe(1);
  });

  it("is zero for an asset with no unplanned-failure row and for an empty family set", () => {
    expect(familyShare([], new Set(["WO-SYN-0001"]))).toBe(0);
    expect(familyShare(rows, new Set())).toBe(0);
  });
});

describe("rankDebt", () => {
  it("sums D over the uncovered UNPLANNED rows and C over the uncovered COMPLETE rows", () => {
    const workOrders = [
      failed("WO-SYN-0001", HIGH, { downtime_hours: 10, total_cost_idr: 1_000_000 }),
      // Flagged planned: it is uncovered and costed, but never contributes downtime to D (harness/debt.py:32).
      failed("WO-SYN-0002", HIGH, { breakdown_kind: "planned_flagged", downtime_hours: 90, total_cost_idr: 500_000 }),
      // Incomplete closeout: zero to C, one to incomplete_uncovered (harness/debt.py:33, 36).
      failed("WO-SYN-0003", HIGH, { closeout_complete: false, downtime_hours: 2, total_cost_idr: 9_000_000 }),
      // A null downtime and a null cost count as zero (harness/debt.py:32-33).
      failed("WO-SYN-0004", HIGH, { downtime_hours: null, total_cost_idr: null }),
    ];
    const out = rankDebt({
      workOrders,
      uncoveredWoNumbers: ["WO-SYN-0004", "WO-SYN-0003", "WO-SYN-0002", "WO-SYN-0001"],
      criticalityByTag,
      familyMembers: new Set(),
    });
    const high = out.find((row) => row.equipment_tag === HIGH);
    expect(high).toMatchObject({
      uncovered_wo_numbers: ["WO-SYN-0001", "WO-SYN-0002", "WO-SYN-0003", "WO-SYN-0004"],
      incomplete_uncovered: 1,
      factors: { D_hours: 12, C_idr: 1_500_000 },
    });
  });

  it("scores 0.4 D/Dmax + 0.3 C/Cmax + 0.2 k + 0.1 r at 4 dp and ranks it first (harness/debt.py:41-46)", () => {
    const workOrders = [
      failed("WO-SYN-0001", HIGH, { downtime_hours: 10, total_cost_idr: 1_000_000 }),
      failed("WO-SYN-0002", LOW, { downtime_hours: 5, total_cost_idr: 500_000 }),
      failed("WO-SYN-0003", LOW),
    ];
    const out = rankDebt({
      workOrders,
      uncoveredWoNumbers: ["WO-SYN-0001", "WO-SYN-0002"],
      criticalityByTag,
      familyMembers: new Set(["WO-SYN-0002"]),
    });
    // HIGH: D 10/10, C 1e6/1e6, k 1, r 0 -> 0.4 + 0.3 + 0.2 = 0.9
    // LOW:  D 5/10, C 5e5/1e6, k 0.5, r 1 of 2 rows = 0.5 -> 0.2 + 0.15 + 0.1 + 0.05 = 0.5
    // NONE: no uncovered row: D 0, C 0, k 0.25, r 0 -> 0.05
    expect(out.map((row) => [row.rank, row.equipment_tag, row.score])).toEqual([
      [1, HIGH, 0.9],
      [2, LOW, 0.5],
      [3, NONE, 0.05],
    ]);
    expect(out[1]?.factors).toEqual({ D_hours: 5, D_max: 10, C_idr: 500_000, C_max: 1_000_000, k: 0.5, r: 0.5 });
  });

  it("keeps every asset of criticalityByTag, uncovered or not, with an empty id list", () => {
    const out = rankDebt({
      workOrders: [failed("WO-SYN-0001", HIGH, { downtime_hours: 1, total_cost_idr: 1 })],
      uncoveredWoNumbers: ["WO-SYN-0001"],
      criticalityByTag,
      familyMembers: new Set(),
    });
    expect(out).toHaveLength(3);
    expect(out.find((row) => row.equipment_tag === NONE)).toMatchObject({
      uncovered_wo_numbers: [],
      incomplete_uncovered: 0,
      factors: { D_hours: 0, C_idr: 0, k: 0.25, r: 0 },
    });
  });

  it("makes a term zero when its fleet maximum is zero (harness/debt.py:42-43)", () => {
    const out = rankDebt({
      workOrders: [failed("WO-SYN-0001", HIGH, { downtime_hours: 0, total_cost_idr: 0 })],
      uncoveredWoNumbers: ["WO-SYN-0001"],
      criticalityByTag,
      familyMembers: new Set(),
    });
    const high = out.find((row) => row.equipment_tag === HIGH);
    expect(high?.factors).toMatchObject({ D_max: 0, C_max: 0 });
    expect(high?.score).toBe(0.2); // 0.2 k only, both ratios suppressed rather than NaN
  });

  it("breaks a tie in the ranking by tag ascending and returns the rows in rank order (harness/debt.py:46)", () => {
    const out = rankDebt({
      workOrders: [failed("WO-SYN-0001", HIGH), failed("WO-SYN-0002", LOW), failed("WO-SYN-0003", NONE)],
      uncoveredWoNumbers: [],
      criticalityByTag: { [HIGH]: "HIGH CRITICAL", [LOW]: "HIGH CRITICAL", [NONE]: "NON CRITICAL" },
      familyMembers: new Set(),
    });
    expect(out.map((row) => [row.rank, row.equipment_tag])).toEqual([
      [1, HIGH],
      [2, LOW],
      [3, NONE],
    ]);
  });
});
