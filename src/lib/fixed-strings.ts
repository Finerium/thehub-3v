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

/** 6.4 Ladder: the absence statement where a layer has no source, naming the classes read. */
export function ladderAbsence(layer: string, classesRead: readonly string[]): string {
  const read = classesRead.length > 0 ? classesRead.join(", ") : "no source";
  return `No ${layer} value is stated in the documents read (${read}).`;
}

/** 6.4 Ladder: the relief layer is omitted at a non-pressure variable. */
export function reliefOmitted(variable: string): string {
  return `No relief layer at a ${variable} variable.`;
}
