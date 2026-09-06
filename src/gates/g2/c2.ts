// C2, quote fidelity (blueprint 9.2 Span.quote_hash, 8.4; AC-ANS-05): a cited span's stored quote_hash must equal
// sha256 over the UTF-8 bytes of canonical(text), recomputed here over the text the composer and the verifier saw.
// The canonical form is src/lib/canonical.ts, so whitespace runs and soft hyphens never fail the check.
import { quoteHash } from "@/lib/hash";
import type { EvidenceSpan } from "./index";

export function c2(spans: readonly EvidenceSpan[]): string | null {
  const bad = spans.filter((s) => quoteHash(s.text) !== s.quote_hash).map((s) => s.span_id);
  return bad.length === 0 ? null : `quote hash mismatch: ${bad.join(", ")} does not hash to its stored quote_hash`;
}
