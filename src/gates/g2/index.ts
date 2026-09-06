// G2, the answer gate (blueprint 8.4, 9.8; ARCHITECTURE section 7 step 11; AC-ANS-03 to 07, 17, 19; AC-NFR-06):
// runG2 takes the composer's claims, the retrieved spans with their texts, the typed facts, the verifier's verdicts,
// the pack and the approved-lesson whitelist, and returns the 9.8 Claims it kept, the claims it dropped with the
// first check that failed them in C1 to C6 order, and the outbound screen of what is left. Deterministic code over
// stored data and the verdicts: no provider, no database, no network (INV-4; the audit test refuses those imports).
// The gate decides, the verifier never does. The input is never mutated.
import type { Citation, Claim, TypedFact } from "@/contracts/generated/evidence_packet";
import type { AG4VerifyOutput } from "@/contracts/generated/gateway";
import type { RulePack } from "@/contracts/generated/rulepack";
import { ENTAILED } from "@/lib/fixed-strings";
import { screenOutbound, type OutboundScreen } from "@/rulepack/screen";
import { resolveSpans } from "./c1";
import { c2 } from "./c2";
import { c3 } from "./c3";
import { c4 } from "./c4";
import { c5 } from "./c5";
import { c6 } from "./c6";

/** A retrieved span as the gate receives it: the Citation of 9.8 with the span text beside it. */
export type EvidenceSpan = Citation & { text: string };
/** An AG-2 claim with the sentence id the lane assigned before AG-4 saw it. */
export interface ComposerClaim {
  id: string;
  text: string;
  span_ids: string[];
}
export type VerifierVerdict = AG4VerifyOutput["verdicts"][number];
export type GateCheck = "C1" | "C2" | "C3" | "C4" | "C5" | "C6";
export const GATE_CHECKS: readonly GateCheck[] = ["C1", "C2", "C3", "C4", "C5", "C6"];

export interface G2Input {
  claims: ComposerClaim[];
  evidence: EvidenceSpan[];
  typed_facts: TypedFact[];
  verdicts: VerifierVerdict[];
  pack: RulePack;
  /** Canonical texts of the approved-lesson spans, cut before the pack classifies (C5, AC-ANS-17). */
  whitelisted_spans: string[];
  /** True only when the labelled history toggle was traced (AC-ANS-14); omitted means false. */
  include_superseded?: boolean;
}

export interface Dropped {
  claim: ComposerClaim;
  check: GateCheck;
  reason: string;
}

export interface G2Result {
  kept: Claim[];
  dropped: Dropped[];
  outbound: OutboundScreen;
}

/** C4: the statuses of current revisions in the seeded corpus; a superseded revision never passes without the toggle. */
export const SERVED_APPROVAL_STATUSES: readonly Citation["approval_status"][] = [
  "approved",
  "issued_for_construction",
  "issued_for_operation",
  "unknown",
];

function citationOf(s: EvidenceSpan): Citation {
  return {
    doc_no: s.doc_no,
    document_id: s.document_id,
    revision: s.revision,
    approval_status: s.approval_status,
    approval_status_text: s.approval_status_text,
    page: s.page,
    span_id: s.span_id,
    quote_hash: s.quote_hash,
    integrity_findings: [...s.integrity_findings],
    superseded: s.superseded,
  };
}

export function runG2(input: G2Input): G2Result {
  const kept: Claim[] = [];
  const dropped: Dropped[] = [];
  const includeSuperseded = input.include_superseded === true;
  for (const claim of input.claims) {
    const resolved = resolveSpans(claim, input.evidence);
    const checks: Array<[GateCheck, () => string | null]> = [
      ["C1", () => resolved.reason],
      ["C2", () => c2(resolved.spans)],
      ["C3", () => c3(claim.text, resolved.spans, input.typed_facts)],
      ["C4", () => c4(resolved.spans, includeSuperseded)],
      ["C5", () => c5(claim.text, input.pack, input.whitelisted_spans)],
      ["C6", () => c6(claim.id, input.verdicts)],
    ];
    const failed = checks.map(([check, run]) => ({ check, reason: run() })).find((r) => r.reason !== null);
    if (failed !== undefined) dropped.push({ claim, check: failed.check, reason: failed.reason ?? "" });
    else kept.push({ id: claim.id, text: claim.text, citations: resolved.spans.map(citationOf), entailment: ENTAILED });
  }
  const outbound = screenOutbound(input.pack, kept.map((c) => c.text).join(" "), input.whitelisted_spans);
  return { kept, dropped, outbound };
}
