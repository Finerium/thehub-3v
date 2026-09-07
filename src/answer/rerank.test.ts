// The deterministic rerank of ARCHITECTURE 7 step 6 (AC-NFR-06): a total order over (lexical hit, cosine,
// document_revision_id, page, ordinal), so the same candidates in any database order give one identical order; the
// input is never mutated; the lexical score is the closed set the trace records. The served set of k reserves one
// slot for the best chunk of every document class in the pool before it fills the rest in rerank order (the
// diagnosis of 2026-09-07, rank 6: one asset's seven lessons supplied three quarters of its chunks, so the sheet,
// the datasheet and the drawing were crowded out of k = 12).
import { describe, expect, it } from "vitest";
import { compareRank, lexicalOf, rerank, reserveByClass, type RankKey } from "./rerank";

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

// The pool of a lesson-heavy asset: seven opl chunks outrank the one chunk of every other class.
type Candidate = RankKey & { id: string; documentClass: string };

const OPL: Candidate[] = Array.from({ length: 7 }, (_, i) => ({ id: `opl-${i + 1}`, documentClass: "opl", ...key(1, 0.9 - i * 0.01, "rev-opl", 1, i + 1) }));
const OTHERS: Candidate[] = [
  { id: "interlock", documentClass: "interlock", ...key(0, 0.6, "rev-il", 1, 1) },
  { id: "datasheet", documentClass: "datasheet", ...key(0, 0.5, "rev-ds", 1, 1) },
  { id: "ga_drawing", documentClass: "ga_drawing", ...key(0, 0.4, "rev-ga", 1, 1) },
  { id: "plot_plan", documentClass: "plot_plan", ...key(0, 0.3, "rev-pp", 1, 1) },
];
const POOL: Candidate[] = [...OPL, ...OTHERS];

describe("reserveByClass (the served set of k)", () => {
  it("keeps one slot for the best chunk of every document class, then fills the rest of k in rerank order", () => {
    const served = reserveByClass(POOL, 7);
    expect(served.map((c) => c.id)).toEqual(["opl-1", "opl-2", "opl-3", "interlock", "datasheet", "ga_drawing", "plot_plan"]);
    // Without the floor the seven lessons would take the whole set and no other class would be served at all.
    expect(rerank(POOL).slice(0, 7).map((c) => c.documentClass)).toEqual(Array(7).fill("opl"));
  });

  it("serves every class present when k is exactly the number of classes", () => {
    const served = reserveByClass(POOL, 4);
    expect(served.map((c) => c.id)).toEqual(["opl-1", "interlock", "datasheet", "ga_drawing"]);
    expect(new Set(served.map((c) => c.documentClass)).size).toBe(4);
  });

  it("keeps the best-ranked classes when the pool holds more classes than slots", () => {
    expect(reserveByClass(POOL, 2).map((c) => c.id)).toEqual(["opl-1", "interlock"]);
  });

  it("comes back in rerank order and stays identical whatever order the database returned the pool in", () => {
    const first = reserveByClass(POOL, 6);
    expect(first).toEqual(rerank(first));
    for (const seed of [1, 2, 3, 11, 42]) {
      expect(reserveByClass(shuffled(POOL, seed), 6).map((c) => c.id), `seed ${seed}`).toEqual(first.map((c) => c.id));
    }
  });

  it("a pool no larger than k is served whole, in rerank order, and the input is untouched", () => {
    const input = shuffled(POOL, 5);
    const snapshot = structuredClone(input);
    expect(reserveByClass(input, POOL.length).map((c) => c.id)).toEqual(rerank(POOL).map((c) => c.id));
    expect(reserveByClass(input, 99)).toHaveLength(POOL.length);
    expect(input).toEqual(snapshot);
  });
});
