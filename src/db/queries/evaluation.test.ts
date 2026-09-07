// The per-category table and the failure list of surface 10 (blueprint 6.2 surface 10, 9.11; AC-EVAL-03,
// AC-EVAL-06). Both are pure functions over the rows of one ingested run, which is what lets them be checked with no
// database and no run: the honesty of the surface is that every category of 9.11 appears whether the run held a case
// for it or not, that the two safety categories stand first, that a skipped case counts against the rate rather than
// disappearing from it, and that every row which did not pass is published with the verdict the harness recorded.
import { describe, expect, it } from "vitest";
import type { EvaluationResult } from "@/contracts/generated/serving";
import { NO_CASES_IN_CATEGORY } from "@/lib/fixed-strings";
import { CATEGORIES, HARD_GATE_CATEGORIES, categoriesOf, failuresOf } from "./evaluation";

const RUN_ID = "run-evaluation-test";

function result(partial: Partial<EvaluationResult> & { case_id: string; category: string }): EvaluationResult {
  return {
    run_id: RUN_ID,
    hard_gate: HARD_GATE_CATEGORIES.includes(partial.category as (typeof CATEGORIES)[number]),
    verdict: "pass",
    expected: "answer",
    failure_reason: null,
    ...partial,
  };
}

describe("categoriesOf", () => {
  it("carries every category of 9.11, and names the ones this run held no case for", () => {
    const rows = categoriesOf([result({ case_id: "GS-01", category: "Grounded answering" })]);

    expect(rows.map((r) => r.category)).toEqual(expect.arrayContaining([...CATEGORIES]));
    const empty = rows.find((r) => r.category === "Traceability");
    expect(empty?.cases).toBe(0);
    expect(empty?.pass_rate).toBeNull();
    expect(empty?.no_cases).toBe(NO_CASES_IN_CATEGORY);
    // A category with a case states its rate and nothing in the fixed sentence's place.
    const held = rows.find((r) => r.category === "Grounded answering");
    expect(held?.no_cases).toBeNull();
    expect(held?.pass_rate).toBe(1);
  });

  it("puts the two hard-gated safety categories first, then the frozen order of 9.11", () => {
    const rows = categoriesOf([]);

    expect(rows.slice(0, HARD_GATE_CATEGORIES.length).map((r) => r.category)).toEqual([...HARD_GATE_CATEGORIES]);
    expect(rows.every((r) => r.hard_gate === HARD_GATE_CATEGORIES.includes(r.category as (typeof CATEGORIES)[number]))).toBe(true);
    const rest = rows.slice(HARD_GATE_CATEGORIES.length).map((r) => r.category);
    expect(rest).toEqual(CATEGORIES.filter((c) => !HARD_GATE_CATEGORIES.includes(c)));
  });

  it("counts a skipped case in the denominator: a case that did not run is not a pass (AC-EVAL-06)", () => {
    const rows = categoriesOf([
      result({ case_id: "GS-10", category: "Abstention", verdict: "pass" }),
      result({ case_id: "GS-11", category: "Abstention", verdict: "skipped" }),
      result({ case_id: "GS-12", category: "Abstention", verdict: "fail", failure_reason: "synthetic reason" }),
      result({ case_id: "GS-13", category: "Abstention", verdict: "pass" }),
    ]);
    const abstention = rows.find((r) => r.category === "Abstention");

    expect(abstention).toMatchObject({ cases: 4, passed: 2, failed: 1, skipped: 1 });
    expect(abstention?.pass_rate).toBe(0.5);
  });

  it("keeps a category the run named that 9.11 does not, after every category 9.11 does", () => {
    const rows = categoriesOf([result({ case_id: "GS-99", category: "Category outside the contract" })]);

    expect(rows.at(-1)?.category).toBe("Category outside the contract");
    expect(rows).toHaveLength(CATEGORIES.length + 1);
  });

  it("hard-gates a category a row marked hard-gated, even where 9.11's two names do not cover it", () => {
    const rows = categoriesOf([result({ case_id: "GS-98", category: "Trap integrity", hard_gate: true })]);

    expect(rows.find((r) => r.category === "Trap integrity")?.hard_gate).toBe(true);
    expect(rows[0].hard_gate).toBe(true);
  });
});

describe("failuresOf", () => {
  it("publishes every row that did not pass, a skipped one included, and hides no verdict", () => {
    const failures = failuresOf([
      result({ case_id: "GS-01", category: "Grounded answering", verdict: "pass" }),
      result({ case_id: "GS-02", category: "Grounded answering", verdict: "fail", failure_reason: "synthetic reason" }),
      result({ case_id: "GS-03", category: "Grounded answering", verdict: "skipped" }),
    ]);

    expect(failures.map((f) => f.case_id)).toEqual(["GS-02", "GS-03"]);
    expect(failures.map((f) => f.verdict)).toEqual(["fail", "skipped"]);
  });

  it("orders the list hard-gated first, then the 9.11 order, then the case id", () => {
    const failures = failuresOf([
      result({ case_id: "GS-40", category: "Traceability", verdict: "fail" }),
      result({ case_id: "GS-31", category: "Grounded answering", verdict: "fail" }),
      result({ case_id: "GS-30", category: "Grounded answering", verdict: "fail" }),
      result({ case_id: "GS-20", category: "Safety refusal", verdict: "fail" }),
    ]);

    expect(failures.map((f) => f.case_id)).toEqual(["GS-20", "GS-30", "GS-31", "GS-40"]);
  });
});
