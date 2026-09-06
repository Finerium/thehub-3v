// C6, entailment from the verifier's verdicts (blueprint section 1 invariant 4, 8.4, 9.16 AG-4; AC-ANS-19,
// ADR-001): the gate decides, the verifier never does. A sentence is kept only with an "entailed" verdict for its
// sentence id; not_entailed and contradicted drop it with the verdict and the verifier's reason carried into the
// gate's reason; a sentence with no verdict is dropped as missing. A parse failure upstream reaches C6 as
// not_entailed for every sentence, which here is the empty verdict list: everything is dropped. Verdicts for unknown
// sentence ids change nothing.
import { describe, expect, it } from "vitest";
import { claim, claims, input, verdict, verdicts } from "../../../tests/fixtures/g2";
import { runG2 } from "./index";

const S1 = claim("s1", "VSHH-1201 trips GA-1201A at 7.1 mm/s.", ["sp-ds-1"]);
const S2 = claim("s2", "The set pressure of PSV-1201 is 9.2 barg.", ["sp-ds-2"]);

describe("C6 entailment", () => {
  it("an entailed verdict keeps the sentence with the entailment literal", () => {
    const r = runG2(input({ claims: [S1], verdicts: [verdict("s1", "entailed", "sp-ds-1")] }));
    expect(r.dropped).toEqual([]);
    expect(r.kept[0].entailment).toBe("entailed");
  });

  it("not_entailed drops the sentence; the reason carries the verdict and the verifier's reason", () => {
    const why = "The span gives 7.1 mm/s for a different initiator.";
    const r = runG2(input({ claims: [S1, S2], verdicts: [verdict("s1", "not_entailed", null, why), verdict("s2", "entailed", "sp-ds-2")] }));
    expect(r.kept.map((c) => c.id)).toEqual(["s2"]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].claim).toEqual(S1);
    expect(r.dropped[0].check).toBe("C6");
    expect(r.dropped[0].reason).toContain("not_entailed");
    expect(r.dropped[0].reason).toContain(why);
  });

  it("contradicted drops the sentence", () => {
    const r = runG2(input({ claims: [S1], verdicts: [verdict("s1", "contradicted", "sp-ds-1", "The span states 7.1 mm/s, the sentence 7.9.")] }));
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.check)).toEqual(["C6"]);
    expect(r.dropped[0].reason).toContain("contradicted");
  });

  it("a sentence with no verdict is dropped as missing", () => {
    const r = runG2(input({ claims: [S1, S2], verdicts: [verdict("s2", "entailed", "sp-ds-2")] }));
    expect(r.kept.map((c) => c.id)).toEqual(["s2"]);
    expect(r.dropped.map((d) => [d.claim.id, d.check])).toEqual([["s1", "C6"]]);
    expect(r.dropped[0].reason).toMatch(/missing|no verdict/i);
  });

  it("a parse failure upstream reaches C6 as not entailed: the empty verdict list drops every sentence", () => {
    const r = runG2(input({ claims, verdicts: verdicts.parse_failed }));
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => [d.claim.id, d.check])).toEqual(claims.map((c) => [c.id, "C6"]));
  });

  it("verdicts for unknown sentence ids are ignored", () => {
    const r = runG2(input({ claims: [S1], verdicts: [verdict("s9", "not_entailed", null, "x"), verdict("s1", "entailed", "sp-ds-1")] }));
    expect(r.dropped).toEqual([]);
    expect(r.kept.map((c) => c.id)).toEqual(["s1"]);
  });

  it("verdict order does not matter: verdicts are read by sentence id", () => {
    const r = runG2(input({ claims: [S1, S2], verdicts: [verdict("s2", "entailed", "sp-ds-2"), verdict("s1", "entailed", "sp-ds-1")] }));
    expect(r.dropped).toEqual([]);
    expect(r.kept.map((c) => c.id)).toEqual(["s1", "s2"]);
  });
});
