// The tokeniser of the frozen coverage recipe (blueprint 9.5; harness/coverage.py `tokens` at line 41, itself the
// verbatim port of the audit's analyze_corpus.py), and the digest that proves which stop list produced a figure.
//
// Frozen rules, ported field by field: the canonical form of 9.2 is applied first (the harness always writes
// `tokens(canonical(x))`, so applying it inside contentWords is what keeps a call site from skipping it), the text
// is lower-cased, the runs `[a-z0-9]+([-./][a-z0-9]+)*` are taken in order so a tag-like token (VSHH-1201,
// 0.05mm/100mm, TJC-LLD-PID-0101) stays one word, every stop-list member is removed as a whole token, and every
// single-character token is dropped. Order and duplicates are kept: the window of window.ts slides over the
// sequence and is sized by the count with duplicates.
//
// The stop list itself is data, not code (D-19): both lanes read `method.stop_list` of the harness fixture and
// neither ships a `bundle/coverage/stop_list.txt`. `stopList()` reads it once, on first use, and refuses a list
// whose digest is not the `method.stop_list_sha256` the same file publishes, so a tampered or stale fixture fails
// closed instead of moving a published number (ARCHITECTURE 8.1).
import { readFileSync } from "node:fs";
import { z } from "zod";
import { canonical } from "@/lib/canonical";
import { sha256Hex } from "@/lib/hash";
import { FIXTURES_PATH } from "@/lib/fixtures";

/** harness/coverage.py:44: alphanumeric runs joined by a hyphen, a dot or a slash, over the lower-cased text. */
const WORD = /[a-z0-9]+(?:[-./][a-z0-9]+)*/g;

/** The content words of a text, in order, duplicates kept (harness/coverage.py:41-44). */
export function contentWords(text: string, stopList: readonly string[]): string[] {
  const stop = new Set(stopList);
  const found = canonical(text).toLowerCase().match(WORD);
  if (found === null) return [];
  return found.filter((word) => word.length > 1 && !stop.has(word));
}

/**
 * sha256 over the list joined by newline, UTF-8, hex (fixtures.method.stop_list_sha256_of, harness/coverage.py:307).
 * The list is digested as given and never sorted, so a shipped list in another order digests to another value and
 * cannot pass the gate that compares this digest with the one the fixture publishes.
 */
export function stopListSha256(list: readonly string[]): string {
  return sha256Hex(Buffer.from(list.join("\n"), "utf8"));
}

// Only the slice this module needs; the rest of the fixture is another module's boundary (blueprint 10.5).
const StopListSlice = z.object({
  method: z.object({
    stop_list: z.array(z.string()).min(1),
    stop_list_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
});

let loaded: readonly string[] | null = null;

/**
 * The shipped stop list, read once from `method.stop_list` of the harness fixture and checked against the digest
 * that file publishes. Throws with the path named when the file is unreadable or the digest disagrees: a recount
 * under the wrong stop list would silently move every published figure.
 */
export function stopList(): readonly string[] {
  if (loaded !== null) return loaded;
  let raw: string;
  try {
    raw = readFileSync(/*turbopackIgnore: true*/ FIXTURES_PATH, "utf8");
  } catch {
    throw new Error(`the coverage stop list needs method.stop_list of ${FIXTURES_PATH}, which cannot be read (D-19)`);
  }
  const { method } = StopListSlice.parse(JSON.parse(raw));
  const digest = stopListSha256(method.stop_list);
  if (digest !== method.stop_list_sha256) {
    throw new Error(
      `method.stop_list of ${FIXTURES_PATH} digests to ${digest}, not the published ${method.stop_list_sha256} (D-19)`,
    );
  }
  loaded = Object.freeze([...method.stop_list]);
  return loaded;
}
