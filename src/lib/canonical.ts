// The canonical text form of blueprint 9.2, frozen as canonical_form_version "1", ported from harness/canonical.py
// (the one implementation is harness/pdftext.py canonical): Unicode NFKC, every soft hyphen (U+00AD) removed so a
// word broken across a line becomes one token, every run of whitespace collapsed to one space, then trimmed; case
// and punctuation kept. Whitespace is Python's str.isspace set, which JavaScript's \s is not: U+0085 and U+001C to
// U+001F are whitespace here, U+200B and U+FEFF are not, so neither \s nor trim() is used. A soft hyphen followed by
// a line break leaves the break as one space (the halves stay two tokens), exactly as the harness does. The 40 cases
// of thehub-harness/contracts/fixtures/canonical_cases.json pin both lanes.
export const CANONICAL_FORM_VERSION = "1";

// Python str.isspace: bidirectional types WS, B and S plus category Zs (the harness rule file lists the same set).
const WHITESPACE = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const RUN = new RegExp(`[${WHITESPACE}]+`, "g");
const EDGES = new RegExp(`^[${WHITESPACE}]+|[${WHITESPACE}]+$`, "g");

export function canonical(s: string): string {
  return s.normalize("NFKC").replace(/\u00ad/g, "").replace(RUN, " ").replace(EDGES, "");
}
