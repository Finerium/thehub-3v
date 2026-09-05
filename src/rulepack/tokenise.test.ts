// The tokeniser mirrored from harness/rulepack.py (ADR-002): lower-case tokens, a tag kept whole with its alphabetic
// prefix as an alternative, "*" as the gap token, Unicode digits as Python's \d, and the tag regex with its Unicode
// word boundary written out.
import { describe, expect, it } from "vitest";
import { alternatives, tagsIn, tokens } from "./index";

describe("tokens", () => {
  it("lower-cases, keeps a tag whole and splits every other run of letters or digits", () => {
    expect(tokens("Jumper VSHH-1201 out so GA-1201A never trips again.")).toEqual([
      "jumper",
      "vshh-1201",
      "out",
      "so",
      "ga-1201a",
      "never",
      "trips",
      "again",
    ]);
  });

  it("tokenises car-seal and car seal alike, keeps the gap token and reads any Unicode decimal digit", () => {
    expect(tokens("car-seal bypass * trip SEQ-١٢٠١")).toEqual(["car", "seal", "bypass", "*", "trip", "seq-١٢٠١"]);
    expect(tokens("car seal")).toEqual(["car", "seal"]);
    expect(tokens("")).toEqual([]);
  });
});

describe("tagsIn", () => {
  it("finds the upper-case instrument and equipment tags of a sheet line and nothing that touches a letter", () => {
    expect(tagsIn("Suction valve OPEN ZSO-1201 GA-1201A zso-1201 ABCDE-1201 ÉZSO-1201 ZSO-12015678")).toEqual([
      "ZSO-1201",
      "GA-1201A",
    ]);
    expect(tagsIn("No active trip / reset done DCS reset")).toEqual([]);
  });
});

describe("alternatives", () => {
  it("adds the alphabetic prefix of a tag so psv-8901 matches the generic token psv", () => {
    expect(alternatives(["psv-8901", "trip"])).toEqual([new Set(["psv-8901", "psv"]), new Set(["trip"])]);
  });
});
