// AG-4 verify (blueprint section 1 invariant 4, 9.16, 9.13; ARCHITECTURE 7 step 10; AC-ANS-18, AC-ANS-19): one
// batched, question-blind call per artefact. The envelope is exactly { pairs: [{ sentence_id, sentence, spans }] };
// the question is never present, and the gateway parses the envelope against the strict AG4VerifyInput before any
// request leaves, so an extra field is a thrown error, never a request. The verifier returns verdicts and edits
// nothing; a reply that does not parse, or a call that does not return, is not_entailed for every sentence, and the
// gate (src/gates/g2 C6) makes every decision.
import { AG4VerifyOutput, type AG4VerifyInput, type GatewayCall } from "@/contracts/generated/gateway";
import type { ComposerClaim, EvidenceSpan, VerifierVerdict } from "@/gates/g2";
import { invoke, type InvokeOptions, type InvokeOutcome } from "@/gateway";

export type VerifyResult = {
  verdicts: VerifierVerdict[];
  /** null when there was nothing to verify (no claims), so no call was made. */
  call: GatewayCall | null;
  outcome: InvokeOutcome | "skipped";
};

/** The 9.16 pairs: each sentence with the texts of the spans it cites, in citation order; nothing else. */
export function verifierPairs(claims: readonly ComposerClaim[], spansById: ReadonlyMap<string, EvidenceSpan>): AG4VerifyInput["pairs"] {
  return claims.map((c) => ({
    sentence_id: c.id,
    sentence: c.text,
    spans: [...new Set(c.span_ids)].flatMap((id) => {
      const span = spansById.get(id);
      return span === undefined ? [] : [{ span_id: id, text: span.text }];
    }),
  }));
}

function notEntailed(claims: readonly ComposerClaim[], reason: string): VerifierVerdict[] {
  return claims.map((c) => ({ sentence_id: c.id, verdict: "not_entailed", span_id: null, reason }));
}

export async function verify(
  claims: readonly ComposerClaim[],
  spansById: ReadonlyMap<string, EvidenceSpan>,
  options: InvokeOptions = {},
): Promise<VerifyResult> {
  if (claims.length === 0) return { verdicts: [], call: null, outcome: "skipped" };
  const envelope: AG4VerifyInput = { pairs: verifierPairs(claims, spansById) };
  const result = await invoke("AG-4", envelope, AG4VerifyOutput, options);
  if (result.outcome !== "ok" || result.data === null) {
    return { verdicts: notEntailed(claims, `verifier ${result.outcome}: no verdict was returned`), call: result.call, outcome: result.outcome };
  }
  // A sentence the reply skipped is missing at C6; a verdict for an unknown id is ignored there.
  return { verdicts: result.data.verdicts, call: result.call, outcome: "ok" };
}
