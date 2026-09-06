// AG-2 compose (blueprint 9.16, 9.13; ARCHITECTURE 7 steps 9 and 12, 9.1; AC-ANS-19): the composer envelope of 9.16
// { question, template, scope, evidence, typed_facts, repair } through the one gateway. The lane assigns the sentence
// ids s1..sn in claim order before AG-4 sees them; on the one repair round the envelope carries the verdicts of the
// sentences to drop or reword and the composer may touch only those. A reply that does not parse is retried once
// (ARCHITECTURE 9.1), so an answer never makes more than two composer calls: first plus retry, or first plus repair.
import type { TypedFact } from "@/contracts/generated/evidence_packet";
import { AG2Output, type AG2Input, type GatewayCall } from "@/contracts/generated/gateway";
import type { ComposerClaim, VerifierVerdict } from "@/gates/g2";
import { invoke, type InvokeOptions, type InvokeOutcome } from "@/gateway";
import type { CitedText } from "./screen";
import type { Scope, Template } from "./types";

export const MAX_COMPOSER_CALLS = 2;

export type ComposeResult = {
  claims: ComposerClaim[];
  gaps: string[];
  suggested_outcome: AG2Output["suggested_outcome"];
  call: GatewayCall;
  outcome: InvokeOutcome;
};

export type ComposeInput = {
  question: string;
  template: Template | null;
  scope: Scope;
  chunks: readonly CitedText[];
  typed_facts: readonly TypedFact[];
  repair: { verdicts: VerifierVerdict[] } | null;
};

/** The 9.16 composer envelope: every field is declared data; the gateway parses it against AG2Input before sending. */
export function composerEnvelope(input: ComposeInput): AG2Input {
  return {
    question: input.question,
    template: input.template,
    scope: { tags: input.scope.tags },
    evidence: input.chunks.map((c) => ({
      span_id: c.citation.span_id,
      doc_no: c.citation.doc_no,
      revision: c.citation.revision,
      approval_status: c.citation.approval_status,
      page: c.citation.page,
      text: c.text,
    })),
    typed_facts: input.typed_facts.map((f) => ({ ...f, source: { ...f.source, integrity_findings: [...f.source.integrity_findings] } })),
    repair: input.repair === null ? null : { verdicts: input.repair.verdicts.map((v) => ({ ...v })) },
  };
}

/** Sentence ids in claim order: s1..sn on the first round, r1..rn on the repair round (AC-ANS-19). */
export function withSentenceIds(claims: AG2Output["claims"], round: 0 | 1): ComposerClaim[] {
  const prefix = round === 0 ? "s" : "r";
  return claims.map((c, i) => ({ id: `${prefix}${i + 1}`, text: c.text, span_ids: [...c.span_ids] }));
}

/** One composer call; `round` names which ids the claims get. The caller counts calls against MAX_COMPOSER_CALLS. */
export async function compose(input: ComposeInput, round: 0 | 1, options: InvokeOptions = {}): Promise<ComposeResult> {
  const result = await invoke("AG-2", composerEnvelope(input), AG2Output, options);
  if (result.outcome !== "ok" || result.data === null) {
    return { claims: [], gaps: [], suggested_outcome: "abstention", call: result.call, outcome: result.outcome };
  }
  return {
    claims: withSentenceIds(result.data.claims, round),
    gaps: result.data.gaps,
    suggested_outcome: result.data.suggested_outcome,
    call: result.call,
    outcome: "ok",
  };
}
