// C5, rule-pack clearance of the outbound text (blueprint 9.10, 8.4; AC-ANS-17): the approved-lesson spans are
// whitelisted first, in their canonical form, and the pack classifies what remains of each claim. A defeat phrase
// inside a whitelisted span passes; the same phrase outside the whitelist is dropped by C5 with the rule id and the
// matched phrase in the reason; a permanent_change residual is dropped too. The check runs per claim, so a benign
// claim beside a blocked one survives, and `outbound` is the screen (src/rulepack/screen.ts) of the kept text with the
// same whitelist, which is therefore never blocked. The lesson span here is a synthetic sentence of the fixture; the
// 56-lesson screen over the corpus runs in the harness (AC-ANS-17).
import { afterEach, describe, expect, it, vi } from "vitest";
import { classify, pack, screenOutbound } from "@/rulepack";
import { claim, input, span, verdict } from "../../../tests/fixtures/g2";
import { runG2 } from "./index";

const LESSON = span("sp-opl-1").text;
const FRAMED = `${LESSON} Record the reading in the log.`;
const BENIGN = "Record the reading in the log.";
const CHANGE = "Raise the VSHH-1201 setpoint permanently.";

describe("the fixture lesson span", () => {
  it("would be refused by the classifier alone (defeat, targeted); the whitelist is what makes it renderable", () => {
    const c = classify(pack, LESSON);
    expect([c.intent_class, c.rule_id, c.matched_phrase]).toEqual(["defeat", "R2-defeat-targeted", "bypass"]);
  });
});

describe("C5 rule-pack clearance with approved-lesson spans whitelisted first", () => {
  it("a claim that is a whitelisted lesson span is kept, and the outbound screen is fully whitelisted", () => {
    const r = runG2(input({ claims: [claim("s1", LESSON, ["sp-opl-1"])], whitelisted_spans: [LESSON] }));
    expect(r.dropped).toEqual([]);
    expect(r.kept.map((c) => c.text)).toEqual([LESSON]);
    expect([r.outbound.blocked, r.outbound.whitelisted, r.outbound.residual]).toEqual([false, true, ""]);
  });

  it("the same sentence without the whitelist is dropped by C5, naming the rule and the phrase", () => {
    const c = claim("s1", LESSON, ["sp-opl-1"]);
    const r = runG2(input({ claims: [c], whitelisted_spans: [] }));
    expect(r.kept).toEqual([]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].claim).toEqual(c);
    expect(r.dropped[0].check).toBe("C5");
    expect(r.dropped[0].reason).toContain("R2-defeat-targeted");
    expect(r.dropped[0].reason).toMatch(/bypass/);
  });

  it("a whitelisted span inside a longer claim is cut first; the residual is what the pack classifies", () => {
    const r = runG2(input({ claims: [claim("s1", FRAMED, ["sp-opl-1"])], whitelisted_spans: [LESSON] }));
    expect(r.dropped).toEqual([]);
    expect(r.kept.map((c) => c.text)).toEqual([FRAMED]);
    expect([r.outbound.blocked, r.outbound.whitelisted, r.outbound.residual]).toEqual([false, false, BENIGN]);
  });

  it("the same longer claim without the whitelist is dropped by C5", () => {
    const r = runG2(input({ claims: [claim("s1", FRAMED, ["sp-opl-1"])], whitelisted_spans: [] }));
    expect(r.dropped.map((d) => d.check)).toEqual(["C5"]);
  });

  it("whitelisting is by canonical text: whitespace differences in the whitelist entry still cut", () => {
    const r = runG2(
      input({ claims: [claim("s1", LESSON, ["sp-opl-1"])], whitelisted_spans: [`  ${LESSON.replace(" the ", "  the\t")} `] }),
    );
    expect(r.dropped).toEqual([]);
  });

  it("a permanent_change residual is dropped by C5 with R1 in the reason", () => {
    const r = runG2(input({ claims: [claim("s1", CHANGE, ["sp-ds-3"])] }));
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.check)).toEqual(["C5"]);
    expect(r.dropped[0].reason).toContain("R1-permanent-change");
  });

  it("the check runs per claim: a benign claim beside a blocked one survives and the outbound screen is clear", () => {
    const r = runG2(
      input({
        claims: [claim("s1", BENIGN, ["sp-ds-3"]), claim("s2", LESSON, ["sp-opl-1"]), claim("s3", CHANGE, ["sp-ds-3"])],
      }),
    );
    expect(r.kept.map((c) => c.id)).toEqual(["s1"]);
    expect(r.dropped.map((d) => [d.claim.id, d.check])).toEqual([
      ["s2", "C5"],
      ["s3", "C5"],
    ]);
    expect([r.outbound.blocked, r.outbound.whitelisted, r.outbound.residual]).toEqual([false, false, BENIGN]);
    expect(r.outbound.classification.intent_class).toBe("none");
  });

  it("a benign claim is neither blocked nor whitelisted", () => {
    const r = runG2(input({ claims: [claim("s1", BENIGN, ["sp-ds-3"])] }));
    expect(r.dropped).toEqual([]);
    expect([r.outbound.blocked, r.outbound.whitelisted, r.outbound.residual]).toEqual([false, false, BENIGN]);
  });
});

describe("outbound is the screen of the kept text with the whitelist applied", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("equals screenOutbound(pack, kept texts, whitelisted_spans) and is never blocked after the drops", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00.000Z"));
    const list = [
      claim("s1", "VSHH-1201 trips GA-1201A at 7.1 mm/s.", ["sp-ds-1"]),
      claim("s2", LESSON, ["sp-opl-1"]),
      claim("s3", BENIGN, ["sp-ds-3"]),
      claim("s4", CHANGE, ["sp-ds-3"]),
    ];
    const packet = input({
      claims: list,
      whitelisted_spans: [LESSON],
      verdicts: [
        verdict("s1", "entailed", "sp-ds-1"),
        verdict("s2", "entailed", "sp-opl-1"),
        verdict("s3", "entailed", "sp-ds-3"),
        verdict("s4", "entailed", "sp-ds-3"),
      ],
    });
    const r = runG2(packet);
    expect(r.kept.map((c) => c.id)).toEqual(["s1", "s2", "s3"]);
    expect(r.dropped.map((d) => [d.claim.id, d.check])).toEqual([["s4", "C5"]]);
    const expected = screenOutbound(packet.pack, r.kept.map((c) => c.text).join(" "), packet.whitelisted_spans);
    expect(r.outbound).toEqual(expected);
    expect(r.outbound.blocked).toBe(false);
    expect(r.outbound.residual).not.toContain("bypass");
  });
});
