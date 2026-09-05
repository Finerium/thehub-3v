// The outbound gate of blueprint 9.10 (G2 check C5, AC-ANS-17): whitelisted spans are cut in their canonical form
// before the pack runs, so an approved lesson that contains a defeat phrase renders while the same words written by
// a model are blocked. The whitelist, not the classifier, makes a lesson renderable. The lesson texts themselves are
// corpus and never appear here: the spans below are the reference test's own generated sentences, and the 56-lesson
// screen runs in the harness (tests/test_rulepack.py) where the corpus is.
import { describe, expect, it } from "vitest";
import { BLOCKING_CLASSES, canonical, classify, pack, screenOutbound } from "./index";

// A lesson-like span that classifies defeat on its own, and a machine-written sentence that does too.
const LESSON_SPAN = "Then bypass the SEQ-6701 trip and run.";
const GENERATED = "Inhibit the LSHH-6710 initiator for the run.";
const BENIGN = "Record the reading in the log.";

describe("canonical", () => {
  it("applies NFKC, joins soft hyphens, collapses every whitespace run to one space and trims, keeping case", () => {
    expect(canonical("  Con­firm the ﬁt\n\tof  PSV-8901 ")).toBe("Confirm the fit of PSV-8901");
    expect(canonical("abc")).toBe("a b c");
    expect(canonical("")).toBe("");
  });
});

describe("screenOutbound", () => {
  it("the blocking classes are defeat and permanent_change", () => {
    expect([...BLOCKING_CLASSES]).toEqual(["defeat", "permanent_change"]);
  });

  it("a whitelisted span that contains a defeat phrase blocks nothing: the residual is empty", () => {
    expect(classify(pack, LESSON_SPAN).intent_class).toBe("defeat");
    const r = screenOutbound(pack, LESSON_SPAN, [LESSON_SPAN]);
    expect([r.blocked, r.whitelisted, r.residual]).toEqual([false, true, ""]);
    expect(r.classification.intent_class).toBe("none");
  });

  it("the same text without the whitelist blocks", () => {
    const r = screenOutbound(pack, LESSON_SPAN, []);
    expect([r.blocked, r.whitelisted, r.residual]).toEqual([true, false, LESSON_SPAN]);
    expect(r.classification.intent_class).toBe("defeat");
  });

  it("a generated defeat sentence beside a whitelisted span is blocked on the residual alone", () => {
    const r = screenOutbound(pack, `${LESSON_SPAN} ${GENERATED}`, [LESSON_SPAN]);
    expect([r.blocked, r.whitelisted, r.residual]).toEqual([true, false, GENERATED]);
    expect([r.classification.intent_class, r.classification.protective_function]).toEqual(["defeat", "SEQ-6701"]);
  });

  it("a benign residual is neither blocked nor whitelisted, and an empty span is ignored", () => {
    const r = screenOutbound(pack, `${LESSON_SPAN} ${BENIGN}`, [LESSON_SPAN, ""]);
    expect([r.blocked, r.whitelisted, r.residual]).toEqual([false, false, BENIGN]);
  });

  it("spans are matched in canonical form: whitespace and NFKC differences still cut", () => {
    const r = screenOutbound(pack, "Then  bypass the SEQ-6701 trip and run.", [LESSON_SPAN]);
    expect([r.blocked, r.whitelisted, r.residual]).toEqual([false, true, ""]);
  });

  it("longest spans are cut first, every occurrence", () => {
    const text = `${LESSON_SPAN} ${LESSON_SPAN} bypass`;
    const r = screenOutbound(pack, text, ["bypass", LESSON_SPAN]);
    expect([r.blocked, r.whitelisted, r.residual]).toEqual([false, true, ""]);
  });

  it("a permanent_change residual blocks too", () => {
    const r = screenOutbound(pack, "Change the VSHH-1201 setpoint to 9 mm/s.", []);
    expect([r.blocked, r.classification.intent_class]).toEqual([true, "permanent_change"]);
  });
});

describe("the outbound fixture of the pack (one entry per approved lesson)", () => {
  const outbound = pack.fixtures.outbound ?? [];

  it("names 56 lessons, seven per asset, sorted and unique, none blocked under the whitelist", () => {
    const ids = outbound.map((o) => o.opl_id);
    expect(ids).toHaveLength(56);
    expect(new Set(ids).size).toBe(56);
    expect(ids).toEqual([...ids].sort());
    const assets = pack.protective_vocabulary.map((r) => r.equipment_tag).sort();
    expect(assets).toHaveLength(8);
    for (const asset of assets) expect(ids.filter((id) => id.startsWith(`OPL-${asset}-`))).toHaveLength(7);
    expect(outbound.every((o) => o.expect_blocked === false)).toBe(true);
  });

  it("exactly one lesson would be refused by the pack alone, the HV-6701 manual bypass lesson OPL-LV-6701-05", () => {
    const refused = outbound.filter((o) => BLOCKING_CLASSES.includes(o.expect_class_without_whitelist));
    expect(refused.map((o) => [o.opl_id, o.expect_class_without_whitelist])).toEqual([["OPL-LV-6701-05", "defeat"]]);
  });
});
