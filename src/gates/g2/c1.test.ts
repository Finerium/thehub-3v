// C1, citation resolution (blueprint 8.4, 9.8; AC-ANS-03): every span_id a claim names resolves to a span of the
// evidence set, and the kept claim carries that span's Citation. A claim with an unresolved citation, or with no
// citation at all, is dropped by C1 with the missing id in the reason; "provenance or nothing" (blueprint section 1).
// The evidence set is the one of src/answer/evidence.ts: the retrieved chunks and the spans the typed facts and the
// block items cite, so a claim that states a typed fact's value with that fact's own span_id resolves here.
import { describe, expect, it } from "vitest";
import { citation, claim, input, span, typedFacts, verdict } from "../../../tests/fixtures/g2";
import { runG2 } from "./index";

const TEXT = "VSHH-1201 trips GA-1201A at 7.1 mm/s.";

describe("C1 citation resolution", () => {
  it("a claim whose every span_id resolves is kept with one Citation per cited span", () => {
    const r = runG2(input({ claims: [claim("s1", TEXT, ["sp-ds-1", "sp-ws"])] }));
    expect(r.dropped).toEqual([]);
    expect(r.kept[0].citations).toEqual([citation("sp-ds-1"), citation("sp-ws")]);
  });

  it("an unresolved span_id drops the claim with the id in the reason; sibling claims are untouched", () => {
    const bad = claim("s1", TEXT, ["sp-ds-1", "sp-missing"]);
    const good = claim("s2", "The set pressure of PSV-1201 is 9.2 barg.", ["sp-ds-2"]);
    const r = runG2(input({ claims: [bad, good] }));
    expect(r.kept.map((c) => c.id)).toEqual(["s2"]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].claim).toEqual(bad);
    expect(r.dropped[0].check).toBe("C1");
    expect(r.dropped[0].reason).toContain("sp-missing");
  });

  it("a claim with no citation is dropped by C1", () => {
    const r = runG2(input({ claims: [claim("s1", TEXT, [])], verdicts: [verdict("s1", "entailed", "sp-ds-1")] }));
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.check)).toEqual(["C1"]);
  });

  it("an empty evidence set resolves nothing: every claim is dropped by C1", () => {
    const r = runG2(input({ claims: [claim("s1", TEXT, ["sp-ds-1"])], evidence: [] }));
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.check)).toEqual(["C1"]);
  });

  it("citations are one per distinct cited span, in first-mention order", () => {
    const r = runG2(input({ claims: [claim("s1", TEXT, ["sp-ds-1", "sp-ws", "sp-ds-1"])] }));
    expect(r.dropped).toEqual([]);
    expect(r.kept[0].citations.map((c) => c.span_id)).toEqual(["sp-ds-1", "sp-ws"]);
  });

  it("a claim citing a typed fact's own source span resolves when the evidence set carries that span", () => {
    const fact = typedFacts.find((f) => f.source.span_id === "sp-ce-1");
    if (fact === undefined) throw new Error("no fixture typed fact on sp-ce-1");
    const cited = claim("s1", "SEQ-1201 has 3 lines of start permissives that must be TRUE before reset.", [fact.source.span_id]);
    const retrieved = [span("sp-ds-1"), span("sp-ds-2")];

    // The set the live UC-1 trace built, the retrieved chunks alone: a correct sentence dies here, unresolved.
    const chunksOnly = runG2(input({ claims: [cited], evidence: retrieved }));
    expect(chunksOnly.kept).toEqual([]);
    expect(chunksOnly.dropped.map((d) => d.check)).toEqual(["C1"]);
    expect(chunksOnly.dropped[0]?.reason).toContain(fact.source.span_id);

    // The one evidence set: the chunks plus the span the typed fact cites, with its text (src/answer/evidence.ts).
    const withFactSpan = runG2(input({ claims: [cited], evidence: [...retrieved, span(fact.source.span_id)] }));
    expect(withFactSpan.dropped).toEqual([]);
    expect(withFactSpan.kept.map((c) => c.id)).toEqual(["s1"]);
    expect(withFactSpan.kept[0]?.citations).toEqual([citation(fact.source.span_id)]);
  });
});
