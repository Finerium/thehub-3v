// C3, numeric fidelity (blueprint section 1 "no number is generated", 8.4, 9.16 AG-2 rule 3; AC-ANS-04): every
// numeral of a claim must appear, with the unit written after it, in a span the claim cites or in a typed fact
// (value_text and unit). Matching is on whole tokens of the canonical text, never on substrings, so "mm/sec" is not
// "mm/s" and "bar g" is not "barg". Digits inside an identifier are not numerals on either side: a tag or a document
// number (GA-1201A, OPL-LV-6701-05), the same written with a possessive (GA-1201A's), and a hyphenated name that
// opens with digits and carries a letter (12-GA-1201A, 2-out-of-3). A pure numeral followed by a token needs that
// bigram in a cited span (7.1 mm/s); a label written before it also carries it (Rev 3, SIL 1); a numeral that ends
// the sentence, and any token that mixes digits with letters (1oo2, 2025-02-23), must appear as that whole token.
// A stray numeral drops the sentence, named.
import type { TypedFact } from "@/contracts/generated/evidence_packet";
import { canonical } from "@/lib/canonical";
import type { EvidenceSpan } from "./index";

const TAG = /^[A-Za-z]{1,6}(?:-[A-Za-z0-9]+)+$/;
// A hyphenated name that opens with digits: the workbook's functional location (12-GA-1201A) and a voting
// arrangement written in words (2-out-of-3). It is an identifier only when it carries a letter, so a hyphenated run
// of digits alone stays a numeral and a date (2025-02-23) or a range (4-20) is still matched against the sources.
const DIGIT_INITIAL = /^\p{Nd}+(?:-[A-Za-z0-9]+)+$/u;
const LETTER = /[A-Za-z]/;
// The possessive an English sentence writes a tag with ("GA-1201A's setpoint"), straight or typographic.
const POSSESSIVE = /['’]s$/;
const PURE_NUMERAL = /^[+-]?\p{Nd}+(?:[.,]\p{Nd}+)*%?$/u;
const LABEL = /^\p{Lu}[\p{L}]*$/u;

/** Whole tokens of the canonical text, edge punctuation stripped ("(1oo2" -> "1oo2", "barg." -> "barg"). */
export function tokensOf(text: string): string[] {
  return canonical(text)
    .split(" ")
    .map((t) => t.replace(/^[^\p{L}\p{N}+#-]+|[^\p{L}\p{N}%#]+$/gu, ""))
    .filter((t) => t !== "");
}

/**
 * A tag, document number, lesson id or functional location: a name that happens to carry digits, never a value the
 * sentence states. The three forms mirror the IDENTIFIER pattern of scripts/golden/view.ts. Exported because
 * src/loop/numeric.ts carries a second copy of this rule and should read this one instead.
 */
export function isIdentifier(token: string): boolean {
  const bare = token.replace(POSSESSIVE, "");
  return TAG.test(bare) || (DIGIT_INITIAL.test(bare) && LETTER.test(bare));
}

function isNumeral(token: string): boolean {
  return /\p{Nd}/u.test(token) && !isIdentifier(token);
}

function hasBigram(tokens: readonly string[], a: string, b: string): boolean {
  return tokens.some((t, i) => t === a && tokens[i + 1] === b);
}

export function c3(claimText: string, spans: readonly EvidenceSpan[], typedFacts: readonly TypedFact[]): string | null {
  const claim = tokensOf(claimText);
  const sources = spans.map((s) => tokensOf(s.text));
  const stray = claim.filter((token, i) => {
    if (!isNumeral(token)) return false;
    const prev = i > 0 ? claim[i - 1] : undefined;
    const next = claim[i + 1];
    if (PURE_NUMERAL.test(token) && next !== undefined) {
      const inSpan = sources.some((s) => hasBigram(s, token, next) || (prev !== undefined && LABEL.test(prev) && hasBigram(s, prev, token)));
      const inFact = typedFacts.some((f) => f.value_text === token && (f.unit === next || (prev !== undefined && f.unit === prev)));
      return !inSpan && !inFact;
    }
    const inSpan = sources.some((s) => s.includes(token));
    const inFact = typedFacts.some((f) => f.value_text === token && (f.unit === null || !PURE_NUMERAL.test(token)));
    return !inSpan && !inFact;
  });
  return stray.length === 0 ? null : `stray numeral: ${stray.join(", ")} is not typed with its unit in a cited span or a typed fact`;
}
