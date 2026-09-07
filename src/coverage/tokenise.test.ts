// The tokeniser of the frozen coverage recipe (blueprint 9.5, harness/coverage.py `tokens` at line 41, itself the
// verbatim port of the audit's analyze_corpus.py). It pins the shape src/coverage/tokenise.ts must land:
//
//   contentWords(text, stopList): string[]   the content words of a text, in order, duplicates kept
//   stopListSha256(list): string             sha256 over the list joined by newline, UTF-8, hex
//
// The rules pinned here are frozen: lower case, the run `[a-z0-9]+([-./][a-z0-9]+)*` so a tag-like token stays whole,
// every stop-list member removed, every single-character token dropped. The canonical form of 9.2 is applied inside
// contentWords, not by its callers, so no call site can skip it (harness/coverage.py always writes tokens(canonical(x))).
import { describe, expect, it } from "vitest";
import { STOP } from "../../tests/fixtures/coverage";
import { contentWords, stopListSha256 } from "./tokenise";

describe("contentWords", () => {
  it("lower-cases and keeps a tag-like token whole (harness/coverage.py:44)", () => {
    expect(contentWords("Replaced VSHH-1201 sensor at the gland", STOP)).toEqual([
      "replaced",
      "vshh-1201",
      "sensor",
      "gland",
    ]);
  });

  it("keeps a token joined by a hyphen, a dot or a slash whole (harness/coverage.py:44)", () => {
    expect(contentWords("clearance 0.05mm/100mm on TJC-LLD-PID-0101", STOP)).toEqual([
      "clearance",
      "0.05mm/100mm",
      "on",
      "tjc-lld-pid-0101",
    ]);
  });

  it("drops every single-character token, digits included (harness/coverage.py:44 `len(t) > 1`)", () => {
    expect(contentWords("a b cd 1 22 x9", STOP)).toEqual(["cd", "22", "x9"]);
  });

  it("removes a stop word only as a whole token, so a stop word inside a tag survives", () => {
    expect(contentWords("at the AT-0101 valve", STOP)).toEqual(["at-0101", "valve"]);
  });

  it("keeps order and duplicates, because the window slides over the sequence (harness/coverage.py:48)", () => {
    expect(contentWords("seal seal flush seal", STOP)).toEqual(["seal", "seal", "flush", "seal"]);
  });

  it("applies the canonical form of 9.2 first: NFKC and the soft hyphen joined", () => {
    // U+FB01 is the fi ligature, U+00AD the soft hyphen, and the full-width run normalises to ASCII.
    expect(contentWords("ﬁlter", STOP)).toEqual(["filter"]);
    expect(contentWords("bar­screen", STOP)).toEqual(["barscreen"]);
    expect(contentWords("ＲＯ-1201", STOP)).toEqual(["ro-1201"]);
  });

  it("returns nothing for text with no content word", () => {
    expect(contentWords("", STOP)).toEqual([]);
    expect(contentWords("   the   of  ", STOP)).toEqual([]);
  });
});

describe("stopListSha256", () => {
  it("digests the list joined by newline as UTF-8 (fixtures.method.stop_list_sha256_of, harness/coverage.py:307)", () => {
    expect(stopListSha256(STOP)).toBe("3e6759d2b83f666f0d48493a1c0eb901ecaf22f3c9c06d506bb0a398f4969f22");
  });

  it("does not sort the list, so a mis-ordered shipped list cannot pass the gate", () => {
    expect(stopListSha256([...STOP].reverse())).toBe(
      "cb3e91472a8a9dfcee8cb62b20436422abf9e593724f3264a803718e2e3a2021",
    );
  });

  it("digests an empty list as the empty string", () => {
    expect(stopListSha256([])).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
