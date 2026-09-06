// The one home of every fixed wording (blueprint 6.3, 6.4 StatusBadge and CaveatLine, 9.6, 9.8; AC-UI-03:
// string-matched in CI by scripts/audits/fixed-wordings.sh). A component or a surface imports the constant it
// needs and never retypes the sentence; the audit fails on a retyped copy anywhere outside this file. The two
// contract-fixed sentences and the two contract-fixed labels are read from the generated Zod literals, so the
// harness contract stays the single source and this file cannot drift from it.
import { DebtCluster } from "@/contracts/generated/coverage";
import { FixedStrings as DraftFixedStrings } from "@/contracts/generated/drafts";
import { Claim, FixedStrings as PacketFixedStrings } from "@/contracts/generated/evidence_packet";

/** 9.8: closes every protective-function answer and every setpoint ladder. */
export const AS_BUILT_CAVEAT = PacketFixedStrings.shape.as_built_caveat.value;

/** 9.6: rendered under every published SME note. */
export const UNVERIFIED_VALUE_LINE = DraftFixedStrings.shape.unverified_value_line.value;

/** 9.5: the label on the debt coefficients wherever they are shown. */
export const ASSUMPTION_LABEL = DebtCluster.shape.coefficients.shape.basis.value;

/** 9.8: the entailment mark on every served claim. */
export const ENTAILED = Claim.shape.entailment.value;

/** 9.6 DraftField: the literal text of an unfilled slot. */
export const SLOT_TEXT = "REQUIRES ENGINEER INPUT";

/** 6.4 StatusBadge: the badge wordings, keyed by StatusBadge's `kind`. */
export const STATUS_WORDING = {
  machine_drafted: "machine-drafted",
  incomplete_closeout: "incomplete closeout",
  simulated: "SIMULATED",
  specified_not_connected: "specified, not connected",
  reviewer_mode: "Reviewer mode",
} as const;

/** 6.2 surfaces 2 and 7: the request-a-lesson action on an abstention and on a cluster. */
export const REQUEST_LESSON_ACTION = "Request a lesson";

/** 6.4 ProofTestCard: stated on every card, per test class. */
export const NO_INTERVAL_STATEMENT = "No supplied document types an interval for this test class.";

/** 6.4 ChainHop: the basis line under every hop; the noun is the record's own word. */
export const CHAIN_BASIS_LINE = "Basis: a shared degradation noun inside the window. Not a claim of cause.";

/** 6.4 Ladder: the fixed fragment of the absence statement (the layer and the classes read are the ladder's own). */
export const LADDER_ABSENCE_FRAGMENT = "value is stated in the documents read";

/** 6.4 Ladder: the fixed fragment of the relief-omission statement (the variable is the ladder's own). */
export const RELIEF_OMITTED_FRAGMENT = "No relief layer at a";

/** 6.4 Ladder: the absence statement where a layer has no source, naming the classes read. */
export function ladderAbsence(layer: string, classesRead: readonly string[]): string {
  const read = classesRead.length > 0 ? classesRead.join(", ") : "no source";
  return `No ${layer} ${LADDER_ABSENCE_FRAGMENT} (${read}).`;
}

/** 6.4 Ladder: the relief layer is omitted at a non-pressure variable. */
export function reliefOmitted(variable: string): string {
  return `${RELIEF_OMITTED_FRAGMENT} ${variable} variable.`;
}

/** 9.8, ARCHITECTURE 13 decision 5: the one gap of a search-mode packet (outcome partial, no claims). */
export const SEARCH_MODE_GAP = "Search mode: evidence listed, no answer composed";

/** 9.8 Refusal.moc_text, carried on a permanent_change refusal only: the pack's own Management of Change sentence. */
export const MOC_TEXT =
  "A permanent change to a protective function goes through Management of Change with a revised cause-and-effect sheet and re-validation of the function; until the change is approved the current sheet applies.";

/** 6.3 provider unreachable: the abstention reason of a live packet whose provider call did not return (seeded chips keep working). */
export const PROVIDER_UNREACHABLE_REASON =
  "The model provider did not answer. The retrieved evidence is listed without a composed answer; seeded questions keep working.";

/** 9.8 Abstention.reason when the composer returned nothing the gate could keep. */
export const NO_ENTAILED_CLAIM_REASON =
  "No sentence entailed by a cited span of an approved current revision answers the question.";

/** 9.8 Abstention.reason when the composer's reply did not parse on either of its two calls (ARCHITECTURE 9.1). */
export const COMPOSER_FAILED_REASON =
  "The composer returned no parsable claims; the retrieved evidence is listed without a composed answer.";

/** 9.8 EvidencePacket.gaps_declared: the line that stands for the sentences the gate removed after the one repair round. */
export function droppedSentencesGap(n: number): string {
  return `${n} sentence${n === 1 ? "" : "s"} removed by the gate: not entailed by the cited spans or carrying a numeral no source types.`;
}

/** 9.8 EvidencePacket.safety_notice on a documented bypass served verbatim (the 9.10 routing wording). */
export const DOCUMENTED_BYPASS_NOTICE =
  "Served verbatim from the approved lesson with its permit lines. A temporary bypass runs only under an interlock bypass or override permit, time-boxed, with compensating measures and an entry in the bypass register.";

/** 9.8 Abstention.reason when a documented-bypass entity resolves to more than one lesson for the assets in scope. */
export const AMBIGUOUS_LESSON_REASON =
  "The named permit or discipline is taught by more than one approved lesson; name the equipment tag to select one.";

/** 9.8 Abstention.reason when scope resolution (AC-ANS-01) matched no equipment tag, instrument tag or area alias. */
export const NO_ASSET_IN_SCOPE_REASON =
  "The question names no equipment tag, instrument tag or area the corpus covers; name the tag to scope the answer.";

/** 9.8 Abstention.reason when the scope resolved but retrieval found no chunk of a served current revision. */
export const NO_EVIDENCE_IN_SCOPE_REASON = "No current document of the assets in scope states this.";

/** 9.8 Abstention.reason on a live-reading question (AC-ANS-06): the typed ladder is served beside it. */
export const LIVE_READING_REASON =
  "The Hub holds no live or as-built readings. The typed setpoint ladder of the cited documents is served beside this note.";

/** AC-ANS-14: the scope basis line written when the labelled history toggle admitted superseded revisions. */
export const HISTORY_TOGGLE_BASIS = "history toggle: superseded revisions included and labelled";

/** AC-ANS-01: the basis line of a family link, the one way a question reaches another asset's documents. */
export function familyLinkBasis(familyId: string, label: string, tags: readonly string[]): string {
  return `family link ${familyId} (${label}) named in the question: members on ${tags.join(", ")}`;
}
