// C2, quote fidelity (blueprint 9.2 Span.quote_hash, 8.4; AC-ANS-05): a cited span's stored quote_hash must equal
// sha256 over the UTF-8 bytes of canonical(text), recomputed by the gate over the text it was handed. A mismatch means
// the text the composer and the verifier saw is not the text the hash was stored over, and the claim is dropped by
// C2 with the span id in the reason. The canonical form (NFKC, soft hyphens joined, whitespace runs collapsed,
// trimmed) is the one of src/rulepack/screen.ts, so whitespace and soft-hyphen differences never fail the check.
import { describe, expect, it } from "vitest";
import { claim, input, quoteHashOf, span, spans, TAMPERED_SPAN_IDS } from "../../../tests/fixtures/g2";
import { runG2 } from "./index";

describe("the fixture spans (the rule the gate recomputes)", () => {
  it("every span hashes to its text through the canonical form, except the deliberately tampered one", () => {
    for (const s of spans) {
      const expected = quoteHashOf(s.text);
      if (TAMPERED_SPAN_IDS.includes(s.span_id)) expect(s.quote_hash).not.toBe(expected);
      else expect(s.quote_hash, s.span_id).toBe(expected);
    }
  });

  it("sp-ws is sp-ds-1 with a tab, whitespace runs and a soft hyphen: the same canonical text, the same hash", () => {
    expect(span("sp-ws").text).not.toBe(span("sp-ds-1").text);
    expect(span("sp-ws").quote_hash).toBe(span("sp-ds-1").quote_hash);
  });
});

describe("C2 quote fidelity", () => {
  it("a claim citing a span whose text does not hash to its quote_hash is dropped by C2", () => {
    const tampered = claim("s1", "PSV-1201 set pressure 9.2 barg.", ["sp-tampered"]);
    const clean = claim("s2", "The set pressure of PSV-1201 is 9.2 barg.", ["sp-ds-2"]);
    const r = runG2(input({ claims: [tampered, clean] }));
    expect(r.kept.map((c) => c.id)).toEqual(["s2"]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].claim).toEqual(tampered);
    expect(r.dropped[0].check).toBe("C2");
    expect(r.dropped[0].reason).toContain("sp-tampered");
  });

  it("one tampered citation among sound ones drops the claim", () => {
    const r = runG2(input({ claims: [claim("s1", "PSV-1201 set pressure 9.2 barg.", ["sp-ds-2", "sp-tampered"])] }));
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.check)).toEqual(["C2"]);
  });

  it("the hash is recomputed over the canonical form: whitespace and a soft hyphen do not fail the check", () => {
    const r = runG2(input({ claims: [claim("s1", "VSHH-1201 trips GA-1201A at 7.1 mm/s.", ["sp-ws"])] }));
    expect(r.dropped).toEqual([]);
    expect(r.kept[0].citations[0].quote_hash).toBe(span("sp-ds-1").quote_hash);
  });

  it("the hash is over the text as handed in: a span whose text was edited in flight fails", () => {
    const edited = { ...span("sp-ds-1"), text: "VSHH-1201 trips GA-1201A at 7.9 mm/s (1oo2 voting)." };
    const r = runG2(
      input({
        claims: [claim("s1", "VSHH-1201 trips GA-1201A at 7.9 mm/s.", ["sp-ds-1"])],
        evidence: [edited],
      }),
    );
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => [d.check, d.claim.id])).toEqual([["C2", "s1"]]);
  });

  it("every claim citing the tampered span is dropped, each on its own", () => {
    const r = runG2(
      input({
        claims: [
          claim("s1", "PSV-1201 set pressure 9.2 barg.", ["sp-tampered"]),
          claim("s2", "PSV-1201 set pressure 9.2 barg.", ["sp-tampered"]),
        ],
      }),
    );
    expect(r.dropped.map((d) => [d.claim.id, d.check])).toEqual([
      ["s1", "C2"],
      ["s2", "C2"],
    ]);
  });
});
