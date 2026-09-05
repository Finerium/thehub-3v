// The outbound gate of blueprint 9.10 (G2 check C5, AC-ANS-17): every whitelisted span, the canonical text of an
// approved lesson or a span of one, is cut from the artefact before the pack runs, and the pack classifies what
// remains. The whitelist, not the classifier, is what makes an approved lesson renderable.
import type { RulePack } from "../contracts/generated/rulepack";
import { classify, type Classification } from "./matcher";

// ponytail: the canonical form of 9.2 (harness/pdftext.py `canonical`), kept here until src/lib/canonical.ts lands
// (ARCHITECTURE section 4); switch the import then. Python's `\s` on str is str.isspace(), which the JS `\s`
// misses at U+001C to U+001F and U+0085 and exceeds at U+FEFF, so the class is written out.
const WHITESPACE_RUN = /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g;
const SOFT_HYPHEN = /\u00ad/g;

/** NFKC, soft hyphens joined, whitespace runs collapsed to one space, trimmed; case and punctuation kept. */
export function canonical(s: string): string {
  return s.normalize("NFKC").replace(SOFT_HYPHEN, "").replace(WHITESPACE_RUN, " ").replace(/^ | $/g, "");
}

/** The classes that block an outbound artefact. */
export const BLOCKING_CLASSES: readonly Classification["intent_class"][] = ["defeat", "permanent_change"];

export interface OutboundScreen {
  /** The residual classifies defeat or permanent_change: the artefact must not leave. */
  blocked: boolean;
  /** Nothing remained after the whitelisted spans were cut. */
  whitelisted: boolean;
  /** The canonical text that remained after the cut, the text the classification was taken over. */
  residual: string;
  classification: Classification;
}

/** The reference's `screen_outbound`: longest spans cut first, every occurrence, then the residual classified. */
export function screenOutbound(pack: RulePack, text: string, whitelistedSpans: readonly string[]): OutboundScreen {
  const codePoints = (s: string): number => Array.from(s).length; // Python len() counts code points
  let t = canonical(text);
  const spans = whitelistedSpans.map(canonical).sort((a, b) => codePoints(b) - codePoints(a));
  for (const span of spans) if (span !== "") t = t.replaceAll(span, " ");
  const residual = canonical(t);
  const classification = classify(pack, residual);
  return {
    blocked: BLOCKING_CLASSES.includes(classification.intent_class),
    whitelisted: residual === "",
    residual,
    classification,
  };
}
