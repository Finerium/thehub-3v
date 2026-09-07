// The golden set's dialect reader (scripts/golden/yaml.ts) and the loader over the real bundle/golden/cases.yaml.
// The file assertions are AC-EVAL-01's counts read from the file, so a case added, retiered or recategorised
// without the counts moving with it fails here.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { casesPath, countsByCategory, loadCases, select } from "../../scripts/golden/cases";
import { YamlError, parseYaml } from "../../scripts/golden/yaml";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const CASES = casesPath(ROOT);

describe("the dialect reader", () => {
  it("reads a block sequence of mappings with flow values", () => {
    const doc = parseYaml(
      [
        "# a comment line",
        "- id: GS-01",
        "  hard_gate: false",
        "  input:",
        '    question: "why?"',
        "  expected:",
        '    must_cite: ["A", "B"]',
        "    numerals_allowed:",
        '      - {value: "7.4", unit: "mm/s", source_ref: "A row 1"}',
        "  checks:",
        '    - {type: "string_present", args: {from: "expected.must_contain"}}',
        "- id: GS-02",
        "  hard_gate: true",
        "",
      ].join("\n"),
    );
    expect(doc).toEqual([
      {
        id: "GS-01",
        hard_gate: false,
        input: { question: "why?" },
        expected: { must_cite: ["A", "B"], numerals_allowed: [{ value: "7.4", unit: "mm/s", source_ref: "A row 1" }] },
        checks: [{ type: "string_present", args: { from: "expected.must_contain" } }],
      },
      { id: "GS-02", hard_gate: true },
    ]);
  });

  it("keeps a hash inside a quoted scalar and drops a trailing comment", () => {
    expect(parseYaml('- text: "the #1 cause" # a note')).toEqual([{ text: "the #1 cause" }]);
  });

  it("keeps the backslashes of a quoted regular expression", () => {
    expect(parseYaml('- {pattern: "(?i)\\\\bevery \\\\d"}')).toEqual([{ pattern: "(?i)\\bevery \\d" }]);
  });

  it("reads integers, floats, booleans and null but leaves a bare word a string", () => {
    expect(parseYaml("- {a: 1, b: 1.5, c: true, d: false, e: null, f: on, g: partial}")).toEqual([
      { a: 1, b: 1.5, c: true, d: false, e: null, f: "on", g: "partial" },
    ]);
  });

  it("names the line of a malformed document", () => {
    expect(() => parseYaml(["- id: GS-01", "   bad: 1"].join("\n"))).toThrow(YamlError);
  });
});

describe("bundle/golden/cases.yaml", () => {
  const present = existsSync(CASES);
  it.runIf(present)("is 102 GoldenCase objects with the v1 counts", () => {
    const cases = loadCases(CASES);
    expect(cases).toHaveLength(102);
    expect(new Set(cases.map((c) => c.id)).size).toBe(102);
    expect(cases.filter((c) => c.hard_gate)).toHaveLength(16);
    expect(select(cases, "A", null)).toHaveLength(50);
    expect(select(cases, "B", null)).toHaveLength(52);
    expect(Object.fromEntries(countsByCategory(cases))).toEqual({
      "Grounded answering": 14,
      Traceability: 8,
      Abstention: 9,
      "False abstention": 11,
      "Safety refusal": 11,
      "Safety-adjacent served": 5,
      "Trap integrity": 19,
      Loop: 8,
      "Adversarial phrasing": 10,
      "Operational context": 3,
      "Moment-shaped answers": 4,
    });
  });

  it.runIf(present)("hard-gates exactly the two safety categories", () => {
    const cases = loadCases(CASES);
    for (const c of cases) {
      expect(c.hard_gate).toBe(c.category === "Safety refusal" || c.category === "Safety-adjacent served");
    }
  });

  it.runIf(present)("selects by id in file order", () => {
    const cases = loadCases(CASES);
    expect(select(cases, "all", ["GS-10", "GS-09"]).map((c) => c.id)).toEqual(["GS-09", "GS-10"]);
  });
});
