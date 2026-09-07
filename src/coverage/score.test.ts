// The per-work-order score of the frozen coverage recipe (blueprint 9.5, harness/coverage.py `score` at lines
// 81-95). It pins the shape src/coverage/score.ts must land:
//
//   NARRATIVE_FIELDS = ["problem_description", "root_cause", "corrective_action"]   harness/workbook.py:13 (NARR)
//   THRESHOLD = 0.62                                                                harness/coverage.py:26
//   round4(x): number                                                               harness/coverage.py:94 round(x, 4)
//   scoreWorkOrder(wo, lessonsOfAsset, layer, stopList?): { best_ratio, matched_field, matched_lesson, covered }
//
// Frozen rules pinned here: the three narrative fields are tried in that order, the asset's lessons in sorted
// opl_id order, a strictly greater score replaces the best so both orders decide a tie (harness/coverage.py:88, 92),
// a work order with no scoreable field scores zero with a null unit (harness/coverage.py:84), the ratio is rounded
// to 4 dp the way Python's round does it, and a work order is UNCOVERED when the score is at or below the threshold
// (fixtures.method.comparison, "uncovered when score <= threshold").
//
// The stop list is the optional fourth argument, defaulting to the list tokenise.ts loads from
// fixtures.method.stop_list and checks against fixtures.method.stop_list_sha256 at load (D-19, ARCHITECTURE 8.1).
// It is a parameter and not a module global so the equality gate can pass the stop list of the very bundle it
// compares against instead of one read from some other file. Every word used below is invented and absent from the
// shipped list, so these expectations hold whichever list is in force.
import { describe, expect, it } from "vitest";
import { bareLessonText, SYN, workOrder } from "../../tests/fixtures/coverage";
import { generousText, type LessonText } from "./layers";
import { NARRATIVE_FIELDS, round4, scoreWorkOrder, THRESHOLD } from "./score";

/**
 * A lesson whose whole text is one section-1 body and nothing else: no header block, no headings, no parsed
 * field. A test can then read the window arithmetic off the words it wrote, because no other word is in the text.
 */
const said = (n: number, body: string): LessonText => bareLessonText(SYN.oplId(n), { 1: body });

const filler = (n: number, from = 0): string[] => Array.from({ length: n }, (_, i) => `filler${from + i}`);

describe("the frozen constants", () => {
  it("are the three narrative fields in order and the threshold 0.62", () => {
    expect(NARRATIVE_FIELDS).toEqual(["problem_description", "root_cause", "corrective_action"]);
    expect(THRESHOLD).toBe(0.62);
  });
});

describe("round4", () => {
  it("rounds to 4 dp half to even, as Python's round does (harness/coverage.py:94)", () => {
    expect(round4(0.03125)).toBe(0.0312);
    expect(round4(0.09375)).toBe(0.0938);
    expect(round4(0.15625)).toBe(0.1562);
  });

  it("rounds a repeating share the way the reference prints it", () => {
    expect(round4(1 / 3)).toBe(0.3333);
    expect(round4(2 / 3)).toBe(0.6667);
  });

  it("leaves a value that is already at 4 dp alone", () => {
    expect(round4(0.62)).toBe(0.62);
    expect(round4(0.6875)).toBe(0.6875);
    expect(round4(0)).toBe(0);
  });
});

describe("scoreWorkOrder", () => {
  it("tries the narrative fields in the frozen order, so the first field wins a tie", () => {
    const wo = workOrder({
      wo_number: SYN.wo(1),
      problem_description: "alpha beta gamma",
      root_cause: "delta epsilon zeta",
    });
    const l = said(1, "alpha beta gamma delta epsilon zeta");
    expect(scoreWorkOrder(wo, [l], "generous")).toEqual({
      best_ratio: 1,
      matched_field: "problem_description",
      matched_lesson: l.opl_id,
      covered: true,
    });
  });

  it("lets a strictly higher later field beat an earlier one", () => {
    const wo = workOrder({
      wo_number: SYN.wo(2),
      problem_description: "alpha beta gamma",
      corrective_action: "delta epsilon zeta",
    });
    const l = said(1, "alpha delta epsilon zeta");
    expect(scoreWorkOrder(wo, [l], "generous")).toMatchObject({
      best_ratio: 1,
      matched_field: "corrective_action",
    });
  });

  it("visits the asset's lessons in sorted opl_id order, so a tie is order-independent (harness/coverage.py:88)", () => {
    const wo = workOrder({ wo_number: SYN.wo(3), problem_description: "alpha beta gamma" });
    const first = said(1, "alpha beta gamma");
    const second = said(2, "alpha beta gamma");
    expect(scoreWorkOrder(wo, [second, first], "generous").matched_lesson).toBe(first.opl_id);
    expect(scoreWorkOrder(wo, [first, second], "generous").matched_lesson).toBe(first.opl_id);
  });

  it("scores zero with a null unit when no field has three content words (harness/coverage.py:84)", () => {
    const wo = workOrder({
      wo_number: SYN.wo(4),
      problem_description: "alpha beta",
      root_cause: "",
      corrective_action: "gamma",
    });
    expect(scoreWorkOrder(wo, [said(1, "alpha beta gamma")], "generous")).toEqual({
      best_ratio: 0,
      matched_field: null,
      matched_lesson: null,
      covered: false,
    });
  });

  it("scores zero with a null unit when the asset has no lesson at all", () => {
    const wo = workOrder({ wo_number: SYN.wo(5), problem_description: "alpha beta gamma" });
    expect(scoreWorkOrder(wo, [], "generous")).toEqual({
      best_ratio: 0,
      matched_field: null,
      matched_lesson: null,
      covered: false,
    });
  });

  it("scores zero with a null unit when no word of any field reaches any lesson", () => {
    const wo = workOrder({ wo_number: SYN.wo(6), problem_description: "alpha beta gamma" });
    expect(scoreWorkOrder(wo, [said(1, "delta epsilon zeta")], "generous")).toMatchObject({
      best_ratio: 0,
      matched_field: null,
      matched_lesson: null,
    });
  });

  it("rounds the best ratio to 4 dp (harness/coverage.py:94)", () => {
    const wo = workOrder({ wo_number: SYN.wo(7), problem_description: "alpha beta gamma" });
    expect(scoreWorkOrder(wo, [said(1, "alpha delta epsilon")], "generous").best_ratio).toBe(0.3333);
  });

  it("calls a score at exactly the threshold UNCOVERED (fixtures.method.comparison)", () => {
    // Fifty distinct content words, so the window is a hundred tokens and the ninety-one token lesson is one
    // window; thirty-one of the fifty inside it is 0.62 exactly.
    const words = filler(50, 100);
    const wo = workOrder({ wo_number: SYN.wo(8), problem_description: words.join(" ") });
    const at = said(1, [...words.slice(0, 31), ...filler(60)].join(" "));
    expect(scoreWorkOrder(wo, [at], "generous")).toMatchObject({ best_ratio: THRESHOLD, covered: false });
  });

  it("calls a score above the threshold covered", () => {
    const words = filler(50, 100);
    const wo = workOrder({ wo_number: SYN.wo(9), problem_description: words.join(" ") });
    const above = said(1, [...words.slice(0, 32), ...filler(59)].join(" "));
    expect(scoreWorkOrder(wo, [above], "generous")).toMatchObject({ best_ratio: 0.64, covered: true });
  });

  it("takes the stop list as its fourth argument and removes those words before scoring", () => {
    // "alpha" is a stop word here, so the field keeps two content words, falls under the minimum and is skipped.
    const wo = workOrder({ wo_number: SYN.wo(11), problem_description: "alpha beta gamma" });
    const l = said(1, "alpha beta gamma");
    expect(scoreWorkOrder(wo, [l], "generous", []).best_ratio).toBe(1);
    expect(scoreWorkOrder(wo, [l], "generous", ["alpha"])).toEqual({
      best_ratio: 0,
      matched_field: null,
      matched_lesson: null,
      covered: false,
    });
  });

  it("reads the layer it is given: the strict layer never sees section 5", () => {
    const l: LessonText = bareLessonText(SYN.oplId(1), { 1: "alpha", 5: "beta gamma delta" });
    const wo = workOrder({ wo_number: SYN.wo(10), problem_description: "beta gamma delta" });
    expect(generousText(l)).toContain("beta gamma delta");
    expect(scoreWorkOrder(wo, [l], "generous").best_ratio).toBe(1);
    expect(scoreWorkOrder(wo, [l], "strict")).toEqual({
      best_ratio: 0,
      matched_field: null,
      matched_lesson: null,
      covered: false,
    });
  });
});
