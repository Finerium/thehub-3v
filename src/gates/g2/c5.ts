// C5, rule-pack clearance of the outbound text (blueprint 9.10, 8.4; AC-ANS-17): the approved-lesson spans are cut
// first, in their canonical form, and the pack classifies what remains of the claim. A defeat phrase inside a
// whitelisted span passes; the same phrase outside the whitelist, or a permanent_change residual, drops the claim
// with the rule id and the matched phrase in the reason. The whitelist, not the classifier, makes a lesson renderable.
import type { RulePack } from "@/contracts/generated/rulepack";
import { screenOutbound } from "@/rulepack/screen";

export function c5(text: string, pack: RulePack, whitelistedSpans: readonly string[]): string | null {
  const screen = screenOutbound(pack, text, whitelistedSpans);
  if (!screen.blocked) return null;
  const c = screen.classification;
  return `${c.rule_id}: "${c.matched_phrase ?? ""}" classifies the outbound text as ${c.intent_class}`;
}
