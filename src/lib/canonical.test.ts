// The canonical text form of blueprint 9.2, canonical_form_version "1" (ARCHITECTURE 4): every case of
// thehub-harness/contracts/fixtures/canonical_cases.json reproduces in this lane, string and sha256 identity alike,
// so a span hashed by the harness verifies under src/lib/hash.ts quoteHash. The cases are read at test time from the
// sibling harness checkout (HARNESS_DIR, else ../thehub-harness) and the suite skips itself, with a message, when the
// checkout is absent. The fixed cases below pin the two documented departures from JavaScript's \s.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defaultHarnessDir } from "@/gates/g1/bundle";
import { CANONICAL_FORM_VERSION, canonical } from "./canonical";
import { quoteHash } from "./hash";

const CASES_PATH = path.join(defaultHarnessDir(), "contracts", "fixtures", "canonical_cases.json");

const CanonicalCases = z
  .object({
    canonical_form_version: z.literal("1"),
    cases: z
      .array(z.object({ id: z.string(), note: z.string(), input: z.string(), expected: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict())
      .min(1),
  })
  .loose();

const present = existsSync(CASES_PATH);
if (!present) console.warn(`canonical cases skipped: ${CASES_PATH} not found (check out thehub-harness beside the application or set HARNESS_DIR)`);

describe.skipIf(!present)("canonical_cases.json of the harness (both lanes pinned)", () => {
  const file = present ? CanonicalCases.parse(JSON.parse(readFileSync(CASES_PATH, "utf8"))) : null;

  it("carries the version this port implements and at least the 40 cases the run notes record", () => {
    expect(file?.canonical_form_version).toBe(CANONICAL_FORM_VERSION);
    expect(file?.cases.length).toBeGreaterThanOrEqual(40);
  });

  it("reproduces every case: the canonical string and its sha256 identity", () => {
    const failures = (file?.cases ?? []).flatMap((c) => {
      const got = canonical(c.input);
      const hash = quoteHash(c.input);
      return got === c.expected && hash === c.sha256 ? [] : [`${c.id} (${c.note}): got ${JSON.stringify(got)} ${hash.slice(0, 12)}, expected ${JSON.stringify(c.expected)} ${c.sha256.slice(0, 12)}`];
    });
    expect(failures).toEqual([]);
  });
});

describe("the rule (harness/canonical.py, Python str.isspace, not \\s)", () => {
  it("NFKC, soft hyphens removed, whitespace runs collapsed, edges trimmed, case and punctuation kept", () => {
    expect(canonical("  Hexane   feed\tpump  ")).toBe("Hexane feed pump");
    expect(canonical("ﬁlter")).toBe("filter"); // U+FB01 ligature under NFKC
    expect(canonical("pres­sure")).toBe("pressure");
    expect(canonical("pres­\nsure")).toBe("pres sure"); // the break after a removed soft hyphen stays one space
    expect(canonical("Trip, Setpoint!")).toBe("Trip, Setpoint!");
  });

  it("treats U+0085 and U+001C to U+001F as whitespace, and U+200B and U+FEFF as characters", () => {
    expect(canonical("ab")).toBe("a b");
    expect(canonical("abc")).toBe("a b c");
    expect(canonical("a​b")).toBe("a​b");
    expect(canonical("﻿a")).toBe("﻿a");
  });

  it("is idempotent and hashes as sha256 over the UTF-8 bytes of the canonical string", () => {
    const text = "  Suction   pressure 4.5 barg  ";
    expect(canonical(canonical(text))).toBe(canonical(text));
    expect(quoteHash(text)).toBe(quoteHash("Suction pressure 4.5 barg"));
    expect(quoteHash(text)).toMatch(/^[0-9a-f]{64}$/);
  });
});
