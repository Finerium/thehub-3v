// C1, citation resolution (blueprint 8.4, 9.8; AC-ANS-03): every span_id a claim names resolves to a span of the
// evidence set, one Citation per distinct cited span in first-mention order. A claim with no citation, or with a
// span_id the evidence does not carry, is dropped with the missing ids named: provenance or nothing.
import type { ComposerClaim, EvidenceSpan } from "./index";

export interface Resolved {
  spans: EvidenceSpan[];
  reason: string | null;
}

export function resolveSpans(claim: ComposerClaim, evidence: readonly EvidenceSpan[]): Resolved {
  if (claim.span_ids.length === 0) return { spans: [], reason: "no citation: the claim names no span_id" };
  const byId = new Map<string, EvidenceSpan>();
  for (const s of evidence) if (!byId.has(s.span_id)) byId.set(s.span_id, s);
  const ids = [...new Set(claim.span_ids)];
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) return { spans: [], reason: `unresolved citation: ${missing.join(", ")} not in the evidence set` };
  return { spans: ids.flatMap((id) => byId.get(id) ?? []), reason: null };
}
