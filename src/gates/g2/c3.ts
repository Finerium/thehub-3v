// C3, numeric fidelity (blueprint section 1 "no number is generated", 8.4, 9.16 AG-2 rule 3; AC-ANS-04): every
// numeral of a claim must appear, with the unit written after it, in a span the claim cites or in a typed fact
// (value_text and unit). Matching is on whole tokens of the canonical text, never on substrings, so "mm/sec" is not
// "mm/s" and "bar g" is not "barg". Digits inside a tag or a document number (GA-1201A, OPL-LV-6701-05) are not
// numerals on either side. A pure numeral followed by a token needs that bigram in a cited span (7.1 mm/s); a label
// written before it also carries it (Rev 3, SIL 1); a numeral that ends the sentence, and any token that mixes digits
// with letters (1oo2, 2025-02-23), must appear as that whole token. A stray numeral drops the sentence, named.
import type { TypedFact } from "@/contracts/generated/evidence_packet";
import { canonical } from "@/lib/canonical";
import type { EvidenceSpan } from "./index";

const TAG = /^[A-Za-z]{1,6}(?:-[A-Za-z0-9]+)+$/;
const PURE_NUMERAL = /^[+-]?\p{Nd}+(?:[.,]\p{Nd}+)*%?$/u;
const LABEL = /^\p{Lu}[\p{L}]*$/u;

/** Whole tokens of the canonical text, edge punctuation stripped ("(1oo2" -> "1oo2", "barg." -> "barg"). */
export function tokensOf(text: string): string[] {
  return canonical(text)
    .split(" ")
    .map((t) => t.replace(/^[^\p{L}\p{N}+#-]+|[^\p{L}\p{N}%#]+$/gu, ""))
    .filter((t) => t !== "");
}

function isNumeral(token: string): boolean {
  return /\p{Nd}/u.test(token) && !TAG.test(token);
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
