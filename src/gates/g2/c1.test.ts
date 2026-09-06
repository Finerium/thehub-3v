// C1, citation resolution (blueprint 8.4, 9.8; AC-ANS-03): every span_id a claim names resolves to a span of the
// evidence set, and the kept claim carries that span's Citation. A claim with an unresolved citation, or with no
// citation at all, is dropped by C1 with the missing id in the reason; "provenance or nothing" (blueprint section 1).
import { describe, expect, it } from "vitest";
import { citation, claim, input, verdict } from "../../../tests/fixtures/g2";
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
});
