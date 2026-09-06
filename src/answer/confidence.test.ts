// The confidence band (ARCHITECTURE 7 step 13 and 13 decision 4; blueprint 9.7 AnswerTrace.confidence; AC-ANS-07,
// AC-NFR-06): a pure function of { question_coverage, source_count, approval_share } with the section 13
// thresholds, high when all three reach their floors, low when coverage or approval share falls under a half,
// medium otherwise; identical inputs give identical bands; the inputs are computed from what retrieval returned.
import { describe, expect, it } from "vitest";
import { chunkOf, chunks } from "../../tests/fixtures/answer";
import { APPROVED_STATUSES, THRESHOLDS, confidenceBand, confidenceInputs } from "./confidence";

describe("confidenceBand (section 13 decision 4)", () => {
  it("pins the thresholds verbatim", () => {
    expect(THRESHOLDS).toEqual({ high: { question_coverage: 0.8, source_count: 2, approval_share: 0.8 }, low: { question_coverage: 0.5, approval_share: 0.5 } });
    expect(APPROVED_STATUSES).toEqual(["issued_for_operation", "approved"]);
  });

  it.each([
    ["all three at their floors", { question_coverage: 0.8, source_count: 2, approval_share: 0.8 }, "high"],
    ["everything above", { question_coverage: 1, source_count: 5, approval_share: 1 }, "high"],
    ["coverage just under the high floor", { question_coverage: 0.79, source_count: 2, approval_share: 0.8 }, "medium"],
    ["one source only", { question_coverage: 0.9, source_count: 1, approval_share: 1 }, "medium"],
    ["approval share just under the high floor", { question_coverage: 0.9, source_count: 3, approval_share: 0.79 }, "medium"],
    ["coverage at the low ceiling stays medium", { question_coverage: 0.5, source_count: 1, approval_share: 0.5 }, "medium"],
    ["coverage under a half", { question_coverage: 0.49, source_count: 4, approval_share: 1 }, "low"],
    ["approval share under a half", { question_coverage: 1, source_count: 4, approval_share: 0.49 }, "low"],
    ["nothing retrieved", { question_coverage: 0, source_count: 0, approval_share: 0 }, "low"],
  ] as const)("%s -> %s", (_name, inputs, band) => {
    expect(confidenceBand(inputs)).toBe(band);
  });

  it("is deterministic: the same inputs give the same band every time (AC-ANS-07)", () => {
    const inputs = { question_coverage: 0.83, source_count: 2, approval_share: 0.86 };
    const bands = new Set(Array.from({ length: 50 }, () => confidenceBand({ ...inputs })));
    expect([...bands]).toEqual(["high"]);
  });

  it("refuses inputs outside the contract (a share above 1, a fractional source count)", () => {
    expect(() => confidenceBand({ question_coverage: 1.2, source_count: 2, approval_share: 1 })).toThrow();
    expect(() => confidenceBand({ question_coverage: 1, source_count: 1.5, approval_share: 1 })).toThrow();
    expect(() => confidenceBand({ question_coverage: 1, source_count: -1, approval_share: 1 })).toThrow();
  });
});

describe("confidenceInputs (traced beside the band)", () => {
  it("coverage is the share of the question's content terms found in the chunks; sources are distinct documents; approval counts issued-for-operation and approved citations", () => {
    // Every content term of this question occurs in the fixture chunks except "gearbox".
    const question = "VSHH-1201 trips GA-1201A vibration gearbox";
    const inputs = confidenceInputs(question, chunks, chunks.map((c) => c.citation));
    expect(inputs.question_coverage).toBeGreaterThan(0.5);
    expect(inputs.question_coverage).toBeLessThan(1);
    expect(inputs.source_count).toBe(new Set(chunks.map((c) => c.citation.document_id)).size);
    const approved = chunks.filter((c) => APPROVED_STATUSES.includes(c.citation.approval_status)).length;
    expect(inputs.approval_share).toBe(Math.round((approved / chunks.length) * 1e6) / 1e6);
  });

  it("is 0, 0, 0 with nothing retrieved and no citations, never a division by zero", () => {
    expect(confidenceInputs("What is the setpoint of VSHH-1201?", [], [])).toEqual({ question_coverage: 0, source_count: 0, approval_share: 0 });
  });

  it("the citation list may be wider than the chunks (typed facts) and counts toward sources and approval", () => {
    const [first] = chunks;
    if (first === undefined) throw new Error("no fixture chunk");
    const only = [first];
    const extra = chunkOf("sp-ct-0", "datasheet_group", 0, 0.5, 9).citation; // issued_for_construction, another document
    const inputs = confidenceInputs("VSHH-1201 trips GA-1201A", only, [first.citation, extra]);
    expect(inputs.source_count).toBe(2);
    expect(inputs.approval_share).toBe(0.5);
    expect(confidenceBand(inputs)).toBe("medium");
  });

  it("the same question and chunks give the same inputs and band twice (AC-NFR-06)", () => {
    const a = confidenceInputs("VSHH-1201 trips GA-1201A at 7.1 mm/s", chunks, chunks.map((c) => c.citation));
    const b = confidenceInputs("VSHH-1201 trips GA-1201A at 7.1 mm/s", structuredClone(chunks), chunks.map((c) => structuredClone(c.citation)));
    expect(a).toEqual(b);
    expect(confidenceBand(a)).toBe(confidenceBand(b));
  });
});
