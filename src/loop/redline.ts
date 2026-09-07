// AG-4 redline (blueprint section 1 invariant 4, 9.6 RedlineVerdict, 9.16 "the redliner has no edit field in its
// schema"; ARCHITECTURE 8.3; AC-LOOP-06). One call per round through the gateway with the envelope
// { draft, evidence_refs, template_rules } and its own prompt file, which no authoring role shares. The output
// contract carries a verdict and reasons and nothing else, so a reply that returns an edited draft does not parse
// and the round counts as a block; the draft object handed in is never touched, and no reply text ever reaches the
// result. A call that does not return is a block too: an unreachable redliner never passes a draft.
import { AG4RedlineOutput, type AG3Output, type GatewayCall } from "@/contracts/generated/gateway";
import { invoke, type InvokeOutcome } from "@/gateway";

export type RedlineRound = 1 | 2;

export type RedlineResult = {
  verdict: AG4RedlineOutput["verdict"];
  reasons: AG4RedlineOutput["reasons"];
  round: RedlineRound;
  outcome: InvokeOutcome;
  call: GatewayCall;
};

// A round that produced no parsed verdict is a block; the reason names the outcome and never the reply.
function noVerdict(outcome: InvokeOutcome): AG4RedlineOutput["reasons"] {
  return [
    {
      category: "technical_plausibility",
      text: `The redline round returned no verdict that parses (outcome ${outcome}); an unreviewed draft is never passed.`,
      field_id: null,
    },
  ];
}

export async function redline(
  draft: AG3Output,
  evidenceRefs: readonly unknown[],
  templateRules: readonly string[],
  round: RedlineRound,
): Promise<RedlineResult> {
  const envelope = { draft, evidence_refs: evidenceRefs, template_rules: templateRules };
  const result = await invoke("AG-4/redline", envelope, AG4RedlineOutput);
  if (result.outcome === "ok" && result.data) {
    return { verdict: result.data.verdict, reasons: result.data.reasons, round, outcome: result.outcome, call: result.call };
  }
  return { verdict: "block", reasons: noVerdict(result.outcome), round, outcome: result.outcome, call: result.call };
}
