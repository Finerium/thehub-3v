// runG2 (ARCHITECTURE section 7 step 11; blueprint 8.4, 9.8; AC-ANS-03, AC-ANS-07, AC-NFR-06): the gate takes the
// composer's claims, the retrieved spans with their texts, the typed facts, the verifier's verdicts, the pack and the
// approved-lesson whitelist, and returns the 9.8 Claims it kept, the claims it dropped with the check that dropped
// them, and the outbound screen of what is left. It is synchronous and deterministic: the same input gives the same
// output, the input is never mutated, and a claim that fails several checks is labelled by the first in C1 to C6
// order. The per-check rules live in c1 to c6.test.ts; this file pins the orchestration.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Claim,
  citation,
  claim,
  claims,
  input,
  verdict,
  verdicts,
  type GateResult,
} from "../../../tests/fixtures/g2";
import { runG2 } from "./index";

const NOT = (id: string) => verdict(id, "not_entailed", null, "The span does not state the value.");

describe("runG2 over the fixture packet, every check passing", () => {
  // The annotation pins the result shape structurally: kept are 9.8 Claims, dropped name the check, outbound is the screen.
  const result: GateResult = runG2(input({ claims, verdicts: verdicts.entailed }));

  it("keeps every claim, in composer order, and drops none", () => {
    expect(result.dropped).toEqual([]);
    expect(result.kept.map((c) => c.id)).toEqual(claims.map((c) => c.id));
  });

  it("each kept claim is a 9.8 Claim: id and text kept, entailment literal, citations are the spans' Citations", () => {
    for (const [i, kept] of result.kept.entries()) {
      expect(() => Claim.parse(kept)).not.toThrow();
      expect(kept.id).toBe(claims[i].id);
      expect(kept.text).toBe(claims[i].text);
      expect(kept.entailment).toBe("entailed");
      expect(kept.citations.map((c) => c.span_id)).toEqual(claims[i].span_ids);
    }
    expect(result.kept[0].citations[0]).toEqual(citation("sp-ds-1"));
  });

  it("no citation carries the span text (the packet cites, the source page renders)", () => {
    for (const kept of result.kept) for (const c of kept.citations) expect(c).not.toHaveProperty("text");
  });

  it("the outbound screen of the kept text is clear", () => {
    expect(result.outbound.blocked).toBe(false);
    expect(result.outbound.classification.intent_class).toBe("none");
  });
});

describe("the empty and the fully dropped packet", () => {
  it("no claims: nothing kept, nothing dropped, the outbound screen over the empty text", () => {
    const r = runG2(input({ claims: [], verdicts: [] }));
    expect(r.kept).toEqual([]);
    expect(r.dropped).toEqual([]);
    expect([r.outbound.blocked, r.outbound.whitelisted, r.outbound.residual]).toEqual([false, true, ""]);
  });

  it("every claim dropped: kept is empty and the outbound screen is over the empty text", () => {
    const r = runG2(input({ claims, verdicts: claims.map((c) => NOT(c.id)) }));
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => [d.claim.id, d.check])).toEqual(claims.map((c) => [c.id, "C6"]));
    expect([r.outbound.blocked, r.outbound.residual]).toEqual([false, ""]);
  });
});

describe("a claim that fails several checks is labelled with the first failing check in C1 to C6 order", () => {
  const cases: Array<[string, string, string[], "entailed" | "not_entailed", string]> = [
    ["C1", "VSHH-1201 trips GA-1201A at 7.1 mm/s.", ["sp-missing"], "not_entailed", "C1"],
    ["C1 over C2", "PSV-1201 set pressure 9.2 barg.", ["sp-missing", "sp-tampered"], "entailed", "C1"],
    ["C2", "PSV-1201 set pressure 9.9 barg.", ["sp-tampered"], "not_entailed", "C2"],
    ["C3", "VSHH-1201 trips GA-1201A at 9.0 mm/s.", ["sp-ds-1"], "not_entailed", "C3"],
    ["C3 over C5", "Raise the VSHH-1201 setpoint to 9.0 mm/s permanently.", ["sp-ds-1"], "entailed", "C3"],
    ["C4", "The CT-7801 fan motor is rated 37 kW at 1480 rpm.", ["sp-ct-a"], "not_entailed", "C4"],
    ["C5", "Then bypass the SEQ-6701 trip and run the pump.", ["sp-opl-1"], "not_entailed", "C5"],
  ];

  it.each(cases)("%s", (_name, text, spanIds, v, check) => {
    const c = claim("sx", text, spanIds);
    const r = runG2(input({ claims: [c], verdicts: [verdict("sx", v, v === "entailed" ? spanIds[0] : null)] }));
    expect(r.kept).toEqual([]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].check).toBe(check);
    expect(r.dropped[0].claim).toEqual(c);
    expect(r.dropped[0].reason.length).toBeGreaterThan(0);
  });
});

describe("the gate is deterministic and pure (AC-NFR-06, AC-ANS-07)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const make = () =>
    input({
      claims: [
        ...claims,
        claim("s6", "VSHH-1201 trips GA-1201A at 9.0 mm/s.", ["sp-ds-1"]),
        claim("s7", "Then bypass the SEQ-6701 trip and run the pump.", ["sp-opl-1"]),
        claim("s8", "The CT-7801 fan motor is rated 37 kW at 1480 rpm.", ["sp-ct-a"]),
      ],
      verdicts: [...verdicts.entailed, verdict("s6", "entailed", "sp-ds-1"), NOT("s7"), verdict("s8", "entailed", "sp-ct-a")],
    });

  it("the same input gives the same output twice, and the input is left untouched", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00.000Z"));
    const first = make();
    const snapshot = structuredClone(first);
    const a = runG2(first);
    const b = runG2(make());
    expect(b).toEqual(a);
    expect(first).toEqual(snapshot);
    expect(a.kept.map((c) => c.id)).toEqual(claims.map((c) => c.id));
    expect(a.dropped.map((d) => [d.claim.id, d.check])).toEqual([
      ["s6", "C3"],
      ["s7", "C5"],
      ["s8", "C4"],
    ]);
  });

  it("returns synchronously, never a promise", () => {
    expect(runG2(input({ claims: [], verdicts: [] }))).not.toBeInstanceOf(Promise);
  });

  it("kept and dropped partition the claims: every composer claim lands in exactly one list", () => {
    const r = runG2(make());
    const ids = [...r.kept.map((c) => c.id), ...r.dropped.map((d) => d.claim.id)].sort();
    expect(ids).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]);
  });
});
