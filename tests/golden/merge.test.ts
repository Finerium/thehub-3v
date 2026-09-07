// The chunk merge of tests/golden/merge.ts. Tier B is run in id-scoped chunks so a provider stall costs one chunk
// rather than the tier, and the tier's report of record is the concatenation of those chunks written back through
// scripts/golden/report.ts. What has to hold: no case is dropped, no verdict is changed, the run header spans the
// whole tier rather than one chunk, and a case that appears twice keeps its last reading instead of both.
import { describe, expect, it } from "vitest";
import { merge } from "./merge";
import type { Report, Result } from "../../scripts/golden/report";

const RUN: Report["run"] = {
  tier: "B",
  base_url: "https://example.invalid",
  started_at: "2026-09-08T01:00:00.000Z",
  finished_at: "2026-09-08T01:10:00.000Z",
  model_ids: { "AG-2": "glm-5.3-flash" },
  prompt_versions: { "AG-2": "sha" },
  rulepack_version: "1",
  corpus_version: "v1",
  harness_commit: "abc",
  git_sha: "def",
};

function result(caseId: string, verdict: Result["verdict"]): Result {
  return {
    case_id: caseId,
    category: "Grounded answering",
    hard_gate: false,
    tier: "B",
    expected: "answer",
    pass: verdict === "pass",
    verdict,
    failures: verdict === "fail" ? [{ check: "expected.must_contain", detail: "1 of 2 expected strings absent" }] : [],
    unsupported: [],
    notes: [],
    skipped_reason: verdict === "skipped" ? "setup not satisfied by the runner" : null,
    trace_id: null,
    latency_ms: 100,
    line1_ms: 10,
  };
}

describe("the Tier B chunk merge", () => {
  it("keeps every case of every chunk, in chunk order, with its verdict untouched", () => {
    const merged = merge([
      { run: RUN, results: [result("GS-01", "pass"), result("GS-02", "fail")] },
      { run: RUN, results: [result("GS-33", "skipped")] },
    ]);
    expect(merged.results.map((r) => r.case_id)).toEqual(["GS-01", "GS-02", "GS-33"]);
    expect(merged.results.map((r) => r.verdict)).toEqual(["pass", "fail", "skipped"]);
    expect(merged.results[1]?.failures).toHaveLength(1);
  });

  it("spans the run header over the whole tier, not over one chunk", () => {
    const merged = merge([
      { run: { ...RUN, started_at: "2026-09-08T02:00:00.000Z", finished_at: "2026-09-08T02:30:00.000Z" }, results: [result("GS-02", "pass")] },
      { run: { ...RUN, started_at: "2026-09-08T01:00:00.000Z", finished_at: "2026-09-08T01:30:00.000Z" }, results: [result("GS-01", "pass")] },
    ]);
    expect(merged.run.started_at).toBe("2026-09-08T01:00:00.000Z");
    expect(merged.run.finished_at).toBe("2026-09-08T02:30:00.000Z");
  });

  it("keeps the last reading of a case a re-run put in two chunks, never both", () => {
    const merged = merge([
      { run: RUN, results: [result("GS-01", "fail")] },
      { run: RUN, results: [result("GS-01", "pass")] },
    ]);
    expect(merged.results).toHaveLength(1);
    expect(merged.results[0]?.verdict).toBe("pass");
  });

  it("refuses an empty merge rather than writing an empty report of record", () => {
    expect(() => merge([])).toThrow(/no chunk report/);
  });
});
