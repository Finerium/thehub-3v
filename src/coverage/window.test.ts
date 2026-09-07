// The window of the frozen coverage recipe (blueprint 9.5, harness/coverage.py `contain_doc` at lines 48-64, the
// verbatim port of the audit's recipe_check.py). It pins the shape src/coverage/window.ts must land:
//
//   WINDOW_MULTIPLIER = 2                                the frozen multiplier (harness/coverage.py:28)
//   MIN_CONTENT_WORDS = 3                                the frozen skip rule (harness/coverage.py:29)
//   fieldScore(fieldWords, lessonWords): number          the largest share of the field's DISTINCT content words
//                                                        inside one window, unrounded
//
// Frozen rules pinned here: the window is twice the field's content-word count counting duplicates, it advances one
// token at a time, the score counts distinct words, a document no longer than the window is one window, and a field
// with fewer than three content words is skipped (it scores 0, which can never win the strict `c > best` of
// harness/coverage.py:92, so skipping and scoring 0 are the same thing).
import { describe, expect, it } from "vitest";
import { fieldScore, MIN_CONTENT_WORDS, WINDOW_MULTIPLIER } from "./window";

const filler = (n: number): string[] => Array.from({ length: n }, (_, i) => `filler${i}`);

describe("the frozen constants", () => {
  it("are the multiplier 2 and the minimum of 3 content words (harness/coverage.py:28-29)", () => {
    expect(WINDOW_MULTIPLIER).toBe(2);
    expect(MIN_CONTENT_WORDS).toBe(3);
  });
});

describe("fieldScore", () => {
  it("skips a field under three content words even when the lesson holds every word (method.skip_rule)", () => {
    expect(fieldScore(["seal", "flush"], ["seal", "flush"])).toBe(0);
    expect(fieldScore([], ["seal"])).toBe(0);
  });

  it("scores a document no longer than the window as one window (harness/coverage.py:54)", () => {
    // Three content words, so the window is six tokens and the six-token lesson is exactly one window.
    expect(fieldScore(["seal", "flush", "orifice"], ["seal", "flush", ...filler(4)])).toBe(2 / 3);
  });

  it("counts distinct words, not occurrences (harness/coverage.py:52 `F = set(ftoks)`)", () => {
    // Three content words but one distinct word: finding it once is the whole share.
    expect(fieldScore(["seal", "seal", "seal"], ["seal", ...filler(20)])).toBe(1);
  });

  it("returns the raw share, unrounded: the rounding to 4 dp belongs to scoreWorkOrder", () => {
    expect(fieldScore(["seal", "flush", "orifice"], ["seal", "flush", ...filler(4)])).not.toBe(0.6667);
  });

  it("advances the window one token at a time, so the best window need not start at the first token", () => {
    // alpha at 0 and gamma at 8 are nine tokens apart, so no six-token window holds all three; the window that
    // starts at token 3 holds beta and gamma, and only a one-token advance reaches it.
    const lesson = ["alpha", ...filler(6), "beta", "gamma", ...filler(3)];
    expect(lesson.length).toBeGreaterThan(6);
    expect(fieldScore(["alpha", "beta", "gamma"], lesson)).toBe(2 / 3);
  });

  it("sizes the window from the content-word count with duplicates, not from the distinct count", () => {
    // Four content words, two distinct: the window is eight tokens, which spans alpha at 0 and beta at 7. A window
    // sized from the two distinct words would be four tokens and would score 1/2.
    const lesson = ["alpha", ...filler(6), "beta", ...filler(4)];
    expect(fieldScore(["alpha", "alpha", "alpha", "beta"], lesson)).toBe(1);
  });

  it("scores zero when the lesson holds no word of the field", () => {
    expect(fieldScore(["alpha", "beta", "gamma"], filler(50))).toBe(0);
  });

  it("scores zero against an empty lesson", () => {
    expect(fieldScore(["alpha", "beta", "gamma"], [])).toBe(0);
  });
});
