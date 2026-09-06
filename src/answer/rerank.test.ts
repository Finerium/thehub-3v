// The deterministic rerank of ARCHITECTURE 7 step 6 (AC-NFR-06): a total order over (lexical hit, cosine,
// document_revision_id, page, ordinal), so the same candidates in any database order give one identical order; the
// input is never mutated; the lexical score is the closed set the trace records.
import { describe, expect, it } from "vitest";
import { compareRank, lexicalOf, rerank, type RankKey } from "./rerank";

const key = (lexical: number, cosine: number, revisionId: string, page: number, ordinal: number): RankKey => ({ lexical, cosine, revisionId, page, ordinal });

// Written in the expected order, then handed to rerank in every other order the tests try.
const ORDERED: Array<RankKey & { id: string }> = [
  { id: "tag-hit-high", ...key(2, 0.7, "rev-b", 3, 9) },
  { id: "tag-hit-low", ...key(2, 0.4, "rev-a", 1, 1) },
  { id: "term-hit", ...key(1, 0.99, "rev-c", 1, 1) },
  { id: "vector-only-a-p1-o1", ...key(0, 0.9, "rev-a", 1, 1) },
  { id: "vector-only-a-p1-o2", ...key(0, 0.9, "rev-a", 1, 2) },
  { id: "vector-only-a-p2-o1", ...key(0, 0.9, "rev-a", 2, 1) },
  { id: "vector-only-b-p1-o1", ...key(0, 0.9, "rev-b", 1, 1) },
  { id: "vector-only-lower", ...key(0, 0.5, "rev-a", 1, 1) },
];

function shuffled<T>(list: readonly T[], seed: number): T[] {
  // A fixed linear congruential permutation so a failure reproduces.
  const out = [...list];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

describe("rerank (AC-NFR-06)", () => {
  it("orders by lexical hit first, then cosine, then revision id, page and ordinal", () => {
    expect(rerank(shuffled(ORDERED, 7)).map((c) => c.id)).toEqual(ORDERED.map((c) => c.id));
  });

  it.each([1, 2, 3, 11, 42])("gives the same order from database order %i", (seed) => {
    const a = rerank(shuffled(ORDERED, seed)).map((c) => c.id);
    const b = rerank(shuffled(ORDERED, seed + 100)).map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).toEqual(ORDERED.map((c) => c.id));
  });

  it("returns a new array and leaves the input untouched", () => {
    const input = shuffled(ORDERED, 5);
    const snapshot = structuredClone(input);
    const out = rerank(input);
    expect(out).not.toBe(input);
    expect(input).toEqual(snapshot);
  });

  it("compareRank is a strict total order over distinct keys: antisymmetric and never zero", () => {
    for (const a of ORDERED) {
      for (const b of ORDERED) {
        if (a === b) {
          expect(compareRank(a, b)).toBe(0);
          continue;
        }
        expect(Math.sign(compareRank(a, b))).toBe(-Math.sign(compareRank(b, a)));
        expect(compareRank(a, b)).not.toBe(0);
      }
    }
  });

  it("a higher lexical score outranks any cosine; equal keys tie only on identical positions", () => {
    expect(compareRank(key(1, 0.01, "rev-z", 9, 9), key(0, 0.99, "rev-a", 1, 1))).toBeLessThan(0);
    expect(compareRank(key(0, 0.9, "rev-a", 1, 1), key(0, 0.9, "rev-a", 1, 1))).toBe(0);
  });

  it("lexicalOf maps the engine's score onto the closed set 2 exact tag, 1 tsquery hit, 0 none", () => {
    expect([lexicalOf(0), lexicalOf(0.5), lexicalOf(1), lexicalOf(1.5), lexicalOf(2), lexicalOf(7)]).toEqual([0, 0, 1, 1, 2, 2]);
  });
});
