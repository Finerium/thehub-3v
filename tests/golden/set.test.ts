// The golden set as a file (blueprint 9.11; AC-EVAL-01 for the size and the shape, AC-EVAL-04 for the flag its
// tally is taken over). The runner's own reader is used, so the assertions here bind to the same bytes a run
// binds to: bundle/golden/cases.yaml, the copy pulled from thehub-harness by `pnpm bundle:pull`.
//
// Why the counts are typed here and nowhere else: every count printed on a surface is read from the file
// (harness golden/README.md), and this file is the one place where the acceptance number is the assertion.
// 102 cases, 50 A and 52 B, and the 16 the hard-gate tally of AC-EVAL-04 is "16 of 16" over.
//
// The whole file skips with a message when the bundle copy is absent, as the coverage equality gate does: outside
// the jobs that build or pull the bundle there is nothing to read, and a silent pass would be worse than a skip.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIES, HARD_GATED_CATEGORIES, casesPath, loadCases, type Case } from "../../scripts/golden/cases";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FILE = casesPath(ROOT);
const skip = !existsSync(FILE);
// loadCases validates every case against the generated 9.11 Zod and throws on the first that drifts, so reading
// the file here is itself the contract assertion.
const cases: Case[] = skip ? [] : loadCases(FILE);

describe.skipIf(skip)(`the golden set at ${path.relative(ROOT, FILE)}`, () => {
  it("holds the 102 cases of AC-EVAL-01, each id unique and GS-shaped", () => {
    expect(cases).toHaveLength(102);
    expect(new Set(cases.map((c) => c.id)).size).toBe(102);
    expect(cases.filter((c) => !/^GS-\d{2,3}$/.test(c.id)).map((c) => c.id)).toEqual([]);
  });

  it("splits 50 A and 52 B, the tier rule of 9.11", () => {
    expect(cases.filter((c) => c.tier === "A")).toHaveLength(50);
    expect(cases.filter((c) => c.tier === "B")).toHaveLength(52);
  });

  it("flags hard_gate on exactly the two safety categories, 16 cases (AC-EVAL-04's denominator)", () => {
    const flagged = cases.filter((c) => c.hard_gate);
    const safety = cases.filter((c) => HARD_GATED_CATEGORIES.includes(c.category as (typeof HARD_GATED_CATEGORIES)[number]));
    expect(flagged.map((c) => c.id).sort()).toEqual(safety.map((c) => c.id).sort());
    expect(flagged).toHaveLength(16);
  });

  it("uses the eleven categories of 9.11 and no other", () => {
    const unknown = [...new Set(cases.map((c) => c.category))].filter((c) => !CATEGORIES.includes(c as (typeof CATEGORIES)[number]));
    expect(unknown).toEqual([]);
  });

  it("carries at least one machine check and one source on every case (AC-EVAL-01)", () => {
    expect(cases.filter((c) => c.checks.length === 0).map((c) => c.id)).toEqual([]);
    expect(cases.filter((c) => c.sources.length === 0).map((c) => c.id)).toEqual([]);
  });
});

describe.skipIf(!skip)("the golden set assertions are skipped", () => {
  it("says what to run", () => {
    expect(skip).toBe(true);
    console.log(`bundle/golden/cases.yaml is absent; run \`pnpm bundle:pull\` to read the set at ${FILE}`);
  });
});
