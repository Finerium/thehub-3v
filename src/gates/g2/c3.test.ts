// C3, numeric fidelity (blueprint section 1 "no number is generated", 8.4, 9.16 AG-2 rule 3; AC-ANS-04): every
// numeral in a claim sentence must appear, with the unit written after it, in a span the claim cites or in a typed
// fact of the packet (value_text and unit). A stray numeral drops the sentence with the numeral in the reason. Unit
// synonyms are never accepted: "mm/sec" is not "mm/s" and "bar g" is not "barg", so the match is on whole tokens,
// not on substrings. Digits inside a tag or a document number (GA-1201A, SEQ-1201, OPL-LV-6701-05) are not numerals,
// on either side: a claim's tag needs no numeral match and a source tag never supplies one.
import { describe, expect, it } from "vitest";
import { claim, input, typedFacts, type GateInput } from "../../../tests/fixtures/g2";
import { runG2 } from "./index";

const NO_FACTS: Partial<GateInput> = { typed_facts: [] };

function run(text: string, spanIds: string[], overrides: Partial<GateInput> = {}) {
  return runG2(input({ claims: [claim("s1", text, spanIds)], ...overrides }));
}

function kept(text: string, spanIds: string[], overrides: Partial<GateInput> = {}): void {
  const r = run(text, spanIds, overrides);
  expect(r.dropped, text).toEqual([]);
  expect(r.kept.map((c) => c.text)).toEqual([text]);
}

function droppedC3(text: string, spanIds: string[], numeral: string, overrides: Partial<GateInput> = {}): void {
  const r = run(text, spanIds, overrides);
  expect(r.kept, text).toEqual([]);
  expect(r.dropped.map((d) => d.check)).toEqual(["C3"]);
  expect(r.dropped[0].reason).toContain(numeral);
}

describe("C3 numeric fidelity: numerals matched in a cited span", () => {
  it("a numeral with its unit present in the cited span is kept", () => {
    kept("VSHH-1201 trips GA-1201A at 7.1 mm/s.", ["sp-ds-1"]);
  });

  it("a numeral absent from every cited span and typed fact drops the sentence, naming the numeral", () => {
    droppedC3("VSHH-1201 trips GA-1201A at 9.0 mm/s.", ["sp-ds-1"], "9.0");
  });

  it("the unit must be the source's unit: 7.1 barg is not 7.1 mm/s, in the span or in the typed fact", () => {
    droppedC3("VSHH-1201 trips GA-1201A at 7.1 barg.", ["sp-ds-1"], "7.1");
  });

  it("only spans the claim cites count: a numeral that lives in an uncited span is stray", () => {
    droppedC3("The set pressure of PSV-1201 is 9.2 barg.", ["sp-ds-1"], "9.2", NO_FACTS);
    kept("The set pressure of PSV-1201 is 9.2 barg.", ["sp-ds-2"], NO_FACTS);
  });

  it("every numeral of the sentence must match; one stray numeral drops the whole sentence", () => {
    kept("VSHH-1201 trips GA-1201A at 7.1 mm/s and PSV-1201 is set at 9.2 barg.", ["sp-ds-1", "sp-ds-2"]);
    const r = run("VSHH-1201 trips GA-1201A at 7.1 mm/s and PSV-1201 is set at 9.5 barg.", ["sp-ds-1", "sp-ds-2"]);
    expect(r.dropped.map((d) => d.check)).toEqual(["C3"]);
    expect(r.dropped[0].reason).toContain("9.5");
    expect(r.dropped[0].reason).not.toContain("7.1");
  });

  it("a bare numeral followed by a noun matches the same words in the span", () => {
    kept("SEQ-1201 has 3 lines of start permissives.", ["sp-ce-1"], NO_FACTS);
    kept("The seal on GA-1201A was replaced after 3 hours of downtime.", ["sp-wo-1"], NO_FACTS);
  });

  it("a revision number is a numeral and matches the span that carries it", () => {
    kept("SYN-DS-GA-1201A Rev 3 governs GA-1201A.", ["sp-ds-3"], NO_FACTS);
  });
});

describe("C3 numeric fidelity: unit synonyms are not accepted", () => {
  it("mm/sec is not mm/s, even though mm/s is a prefix of mm/sec", () => {
    droppedC3("VSHH-1201 trips GA-1201A at 7.1 mm/sec.", ["sp-ds-1"], "7.1", NO_FACTS);
  });

  it("bar g is not barg, even though the source contains barg", () => {
    droppedC3("The design pressure is 8.5 bar g.", ["sp-ds-2"], "8.5", NO_FACTS);
    kept("The design pressure is 8.5 barg.", ["sp-ds-2"], NO_FACTS);
  });

  it("a typed fact with a synonym unit does not match either", () => {
    const synonym = typedFacts.map((f) => (f.unit === "mm/s" ? { ...f, unit: "mm/sec" } : f));
    droppedC3("The VSHH-1201 trip setpoint is 7.1 mm/s.", ["sp-ds-3"], "7.1", { typed_facts: synonym });
  });
});

describe("C3 numeric fidelity: numerals matched from typed facts", () => {
  it("a numeral with its unit that a typed fact carries (value_text and unit) is kept although no cited span has it", () => {
    kept("The VSHH-1201 trip setpoint is 7.1 mm/s.", ["sp-ds-3"]);
  });

  it("without that typed fact the same sentence is dropped", () => {
    droppedC3("The VSHH-1201 trip setpoint is 7.1 mm/s.", ["sp-ds-3"], "7.1", NO_FACTS);
  });

  it("a typed fact with unit null matches a bare numeral that no cited span carries", () => {
    const count = typedFacts.filter((f) => f.value_text === "3" && f.unit === null);
    expect(count).toHaveLength(1);
    kept("The start permissive line count of SEQ-1201 is 3.", ["sp-ds-1"], { typed_facts: count });
    droppedC3("The start permissive line count of SEQ-1201 is 3.", ["sp-ds-1"], "3", NO_FACTS);
  });
});

describe("C3 numeric fidelity: tags and document numbers are not numerals", () => {
  it("a claim made of tags and a document number carries no numeral and passes C3", () => {
    kept("The vibration initiator of GA-1201A is VSHH-1201.", ["sp-ds-3"], NO_FACTS);
    kept("GA-1201A is protected by SEQ-1201 and OPL-LV-6701-05 documents its bypass permit.", ["sp-ds-3"], NO_FACTS);
  });

  it("digits inside a source tag never supply a numeral: 1201 rpm is stray beside GA-1201A", () => {
    droppedC3("GA-1201A runs at 1201 rpm.", ["sp-ds-1"], "1201", NO_FACTS);
  });
});
