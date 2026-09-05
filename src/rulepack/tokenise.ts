// The tokeniser of harness/rulepack.py, mirrored token for token (ADR-002). Tokens are lower case; a tag stays
// whole ("vshh-1201", "seq-3401") and also matches its alphabetic prefix, so "psv-8901" matches the generic token
// "psv"; a "*" is the gap token of a lexicon phrase; every other run of ASCII letters or digits is one token, so
// "car-seal" and "car seal" tokenise alike. Python's `\d` on str is any Unicode decimal digit, spelt \p{Nd} here.
const TOKEN = /\*|[a-z]{1,4}-\p{Nd}{2,6}[a-z]?|[a-z0-9]+/gu;
// Python's `\b[A-Z]{2,4}-\d{4,5}[A-Z]?\b` with its Unicode word boundary written out (the JS `\b` is ASCII-only).
const TAG = /(?<![\p{L}\p{N}_])[A-Z]{2,4}-\p{Nd}{4,5}[A-Z]?(?![\p{L}\p{N}_])/gu;

/** The lower-case tokens of a text, in order. */
export function tokens(text: string): string[] {
  return Array.from(text.toLowerCase().matchAll(TOKEN), (m) => m[0]);
}

/** The instrument or equipment tags written in a sheet line, case kept ("ZSO-1201", "GA-1201B"). */
export function tagsIn(text: string): string[] {
  return Array.from(text.matchAll(TAG), (m) => m[0]);
}

/** Per token, the forms a lexicon phrase may match: the token itself and, for a tag, its alphabetic prefix. */
export function alternatives(toks: readonly string[]): Set<string>[] {
  return toks.map((t) => (t.includes("-") ? new Set([t, t.split("-")[0]]) : new Set([t])));
}
