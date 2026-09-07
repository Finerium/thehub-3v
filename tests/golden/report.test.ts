// The report: the category order of AC-EVAL-03 (the two hard-gated categories first), the hard-gate tally that
// decides the exit status, the percentiles of AC-NFR-04 and the rule that a check the runner could not evaluate is
// counted and named rather than folded into the pass count.
import { describe, expect, it } from "vitest";
import { categoryOrder, evaluationPayload, hardGateTally, markdown, percentile, type Report, type Result } from "../../scripts/golden/report";

function result(overrides: Partial<Result> = {}): Result {
  return {
    case_id: "GS-TEST",
    category: "Grounded answering",
    hard_gate: false,
    tier: "A",
    expected: "answer",
    pass: true,
    verdict: "pass",
    failures: [],
    unsupported: [],
    notes: [],
    skipped_reason: null,
    trace_id: "trace-1",
    latency_ms: 100,
    line1_ms: 10,
    ...overrides,
  };
}

const report = (results: Result[]): Report => ({
  run: {
    tier: "A",
    base_url: "http://127.0.0.1:3181",
    started_at: "2026-09-07T00:00:00.000Z",
    finished_at: "2026-09-07T00:01:00.000Z",
    model_ids: { "AG-2": "test-model" },
    prompt_versions: { "AG-2": "0".repeat(64) },
    rulepack_version: "1",
    corpus_version: "v1",
    harness_commit: "b06e2eeeaf41",
    git_sha: "0123456789ab",
  },
  results,
});

describe("categoryOrder", () => {
  it("puts the two hard-gated categories first", () => {
    const results = [
      result({ category: "Grounded answering" }),
      result({ category: "Safety-adjacent served", hard_gate: true }),
      result({ category: "Safety refusal", hard_gate: true }),
      result({ category: "Loop" }),
    ];
    expect(categoryOrder(results)).toEqual(["Safety refusal", "Safety-adjacent served", "Grounded answering", "Loop"]);
  });
});

describe("hardGateTally", () => {
  it("counts a skipped hard gate as not passing", () => {
    const results = [
      result({ case_id: "GS-09", category: "Safety refusal", hard_gate: true }),
      result({ case_id: "GS-10", category: "Safety refusal", hard_gate: true, verdict: "skipped", pass: false, skipped_reason: "setup not satisfied by the runner" }),
      result({ case_id: "GS-68", category: "Safety refusal", hard_gate: true, verdict: "fail", pass: false, failures: [{ check: "rulepack_class", detail: "class none, expected defeat" }] }),
    ];
    expect(hardGateTally(results)).toEqual({ passed: 1, total: 3, failed: ["GS-68"], skipped: ["GS-10"] });
  });
});

describe("percentile", () => {
  it("reads the nearest-rank value and nothing from an empty list", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("evaluationPayload", () => {
  const payload = evaluationPayload(
    report([
      result({ case_id: "GS-09", category: "Safety refusal", hard_gate: true, expected: "refusal" }),
      result({ case_id: "GS-01", verdict: "fail", pass: false, failures: [{ check: "numeral_fidelity", detail: "1 numeral(s) outside the allowed set" }] }),
      result({ case_id: "GS-14", verdict: "skipped", pass: false, skipped_reason: "setup not satisfied by the runner" }),
    ]),
    "cv-1.0.1-abcdef123456",
  );

  it("builds the 9.7 EvaluationRun with the derived corpus version id and the ci principal", () => {
    expect(payload.run.corpus_version_id).toBe("cv-1.0.1-abcdef123456");
    expect(payload.run.ingested_by).toBe("ci");
    expect(payload.run.tier).toBe("A");
    expect(payload.run.model_pins).toEqual({ "AG-2": "test-model" });
  });

  it("gives every result the run id, the expected outcome and a reason only when there is one", () => {
    expect(payload.results.every((r) => r.run_id === payload.run.id)).toBe(true);
    expect(payload.results[0]).toMatchObject({ case_id: "GS-09", verdict: "pass", expected: "refusal", failure_reason: null });
    expect(payload.results[1]?.failure_reason).toBe("numeral_fidelity: 1 numeral(s) outside the allowed set");
    expect(payload.results[2]?.failure_reason).toBe("setup not satisfied by the runner");
  });

  it("maps the runner's `all` tier to the contract's `full`", () => {
    const everything = report([result()]);
    everything.run.tier = "all";
    expect(evaluationPayload(everything, "cv-1").run.tier).toBe("full");
  });
});

describe("markdown", () => {
  const text = markdown(
    report([
      result({ case_id: "GS-09", category: "Safety refusal", hard_gate: true, unsupported: [{ check: "audit_event", detail: "no database in reach to read the audit log" }] }),
      result({ case_id: "GS-01", category: "Grounded answering", tier: "B", verdict: "fail", pass: false, failures: [{ check: "numeral_fidelity", detail: "1 numeral(s) outside the allowed set: 9.9 in claims[0]" }] }),
      result({ case_id: "GS-14", category: "Loop", verdict: "skipped", pass: false, skipped_reason: "setup not satisfied by the runner" }),
    ]),
  );

  it("heads with the pins, the totals and the hard gates", () => {
    expect(text).toContain("# Golden set, tier A");
    expect(text).toContain("corpus version: v1");
    expect(text).toContain("**1 passed, 1 failed, 1 skipped of 3.** Hard gates 1 of 1.");
  });

  it("counts the checks it could not evaluate instead of hiding them", () => {
    expect(text).toContain("1 check(s) were not evaluated by the runner");
    expect(text).toContain("GS-09 audit_event: no database in reach");
  });

  it("prints the hard-gated category first and the failure detail", () => {
    expect(text.indexOf("## Safety refusal (hard gate)")).toBeLessThan(text.indexOf("## Grounded answering"));
    expect(text).toContain("GS-01 numeral_fidelity: 1 numeral(s) outside the allowed set");
    expect(text).toContain("setup not satisfied by the runner");
  });

  it("prints the two latency instruments", () => {
    expect(text).toContain("Line 1 (AC-NFR-04, the evidence list): p50 10 ms, p95 10 ms");
  });
});
