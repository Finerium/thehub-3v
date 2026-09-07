// The AG-4 confirmation run of AC-EVAL-05 (blueprint 11.7): 30 labelled entailment pairs, 15 supported and 15
// unsupported, drawn from the golden set plus the WO-240007 drafting case. AG-4 on its pin must agree with the
// labels on at least 27 of 30 with at most one false accept.
//
// This file is the instrument, not the run. It holds the pair set, resolves each pair's text from the bundle, and
// scores a set of verdicts against the labels. It calls nothing: `runConfirmation` takes the verdict source as an
// argument, so the live run passes `verify` from @/answer/verify (one batched, question-blind AG-4 call on its
// pin) and the test passes a stub. That is what makes the scoring falsifiable without a provider.
//
// Why references and not text. Every pair names a claim id and a span id and nothing else; the sentences and the
// anchor texts are read from bundle/claims.json at run time. The corpus is the organiser's property (invariant 7),
// so no corpus sentence is retyped into this repository by this set, and a bundle that moves a claim breaks the
// set loudly rather than silently measuring stale text.
//
// How the 30 were drawn, so a reader can redraw them:
//   candidates  every corpus claim (9.2) whose entity_binding is named in a golden case's `must_cite`, whose
//               value_text is at least 40 characters, and whose span has a sibling span in the same revision;
//   supported   the claim paired with its own span, the pairing the answer lane would make;
//   unsupported the same claim paired with the nearest sibling span of the same document revision whose anchor
//               text neither contains nor is contained by the claim: a near miss from the same sheet (for the
//               workbook rows, another record's own sentence), never an unrelated document, so a false accept
//               means the verifier read the span rather than the topic;
//   spread      one claim per document and one per distinct sentence, round-robin across claim kinds, so no two
//               pairs lean on the same words; the WO-240007 drafting case is taken first and always present.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ComposerClaim, EvidenceSpan, VerifierVerdict } from "@/gates/g2";

export type PairLabel = "supported" | "unsupported";

export type EntailmentPair = {
  /** EP-nn-S is the supported pairing of claim nn, EP-nn-U its near-miss sibling. */
  id: string;
  claim_id: string;
  span_id: string;
  label: PairLabel;
  /** The entity the claim is bound to: the golden set's `must_cite` name, or WO-240007. */
  drawn_from: string;
};

/** The frozen set. 30 pairs, 15 supported and 15 unsupported, over 15 claims and 15 documents. */
export const PAIRS: readonly EntailmentPair[] = [
  { id: "EP-01-S", claim_id: "CLM-00015", span_id: "rev-08fcf7ac5d78/p1/1068-1149", label: "supported", drawn_from: "OPL-YD-2301-07" },
  { id: "EP-01-U", claim_id: "CLM-00015", span_id: "rev-08fcf7ac5d78/p1/1151-1236", label: "unsupported", drawn_from: "OPL-YD-2301-07" },
  { id: "EP-02-S", claim_id: "CLM-00034", span_id: "rev-0f19e6b566c4/p1/1715-1792", label: "supported", drawn_from: "OPL-GA-1201A-03" },
  { id: "EP-02-U", claim_id: "CLM-00034", span_id: "rev-0f19e6b566c4/p1/1793-1875", label: "unsupported", drawn_from: "OPL-GA-1201A-03" },
  { id: "EP-03-S", claim_id: "CLM-00094", span_id: "rev-1a392e2eebbf/p1/216-277", label: "supported", drawn_from: "OPL-GA-1201A-06" },
  { id: "EP-03-U", claim_id: "CLM-00094", span_id: "rev-1a392e2eebbf/p1/940-1017", label: "unsupported", drawn_from: "OPL-GA-1201A-06" },
  { id: "EP-04-S", claim_id: "CLM-00121", span_id: "rev-1c06cc06b083/p1/1042-1117", label: "supported", drawn_from: "OPL-KC-4501-05" },
  { id: "EP-04-U", claim_id: "CLM-00121", span_id: "rev-1c06cc06b083/p1/1119-1196", label: "unsupported", drawn_from: "OPL-KC-4501-05" },
  { id: "EP-05-S", claim_id: "CLM-00141", span_id: "rev-1d71e82f28f0/p1/1810-1893", label: "supported", drawn_from: "OPL-FA-8901-06" },
  { id: "EP-05-U", claim_id: "CLM-00141", span_id: "rev-1d71e82f28f0/p1/1894-1969", label: "unsupported", drawn_from: "OPL-FA-8901-06" },
  { id: "EP-06-S", claim_id: "CLM-00159", span_id: "rev-1e985621f95e/p1/214-275", label: "supported", drawn_from: "OPL-YD-2301-02" },
  { id: "EP-06-U", claim_id: "CLM-00159", span_id: "rev-1e985621f95e/p1/1027-1100", label: "unsupported", drawn_from: "OPL-YD-2301-02" },
  { id: "EP-07-S", claim_id: "CLM-00205", span_id: "rev-2badb0699e9d/p1/1017-1101", label: "supported", drawn_from: "OPL-CT-7801-06" },
  { id: "EP-07-U", claim_id: "CLM-00205", span_id: "rev-2badb0699e9d/p1/1103-1178", label: "unsupported", drawn_from: "OPL-CT-7801-06" },
  { id: "EP-08-S", claim_id: "CLM-00283", span_id: "rev-42f18445dba0/p1/1690-1764", label: "supported", drawn_from: "OPL-DC-3401A-02" },
  { id: "EP-08-U", claim_id: "CLM-00283", span_id: "rev-42f18445dba0/p1/1765-1852", label: "unsupported", drawn_from: "OPL-DC-3401A-02" },
  { id: "EP-09-S", claim_id: "CLM-00369", span_id: "rev-5abdd24159fd/p1/280-341", label: "supported", drawn_from: "OPL-FA-8901-04" },
  { id: "EP-09-U", claim_id: "CLM-00369", span_id: "rev-5abdd24159fd/p1/1064-1141", label: "unsupported", drawn_from: "OPL-FA-8901-04" },
  { id: "EP-10-S", claim_id: "CLM-00442", span_id: "rev-62208bb3dd10/p113/62-112", label: "supported", drawn_from: "WO-240028" },
  { id: "EP-10-U", claim_id: "CLM-00442", span_id: "rev-62208bb3dd10/p169/10-60", label: "unsupported", drawn_from: "WO-240028" },
  { id: "EP-11-S", claim_id: "CLM-00456", span_id: "rev-62208bb3dd10/p124/65-128", label: "supported", drawn_from: "WO-240004" },
  { id: "EP-11-U", claim_id: "CLM-00456", span_id: "rev-62208bb3dd10/p169/10-60", label: "unsupported", drawn_from: "WO-240004" },
  { id: "EP-12-S", claim_id: "CLM-00508", span_id: "rev-62208bb3dd10/p169/10-60", label: "supported", drawn_from: "WO-240007" },
  { id: "EP-12-U", claim_id: "CLM-00508", span_id: "rev-62208bb3dd10/p48/61-107", label: "unsupported", drawn_from: "WO-240007" },
  { id: "EP-13-S", claim_id: "CLM-00592", span_id: "rev-62208bb3dd10/p48/61-107", label: "supported", drawn_from: "WO-240084" },
  { id: "EP-13-U", claim_id: "CLM-00592", span_id: "rev-62208bb3dd10/p169/10-60", label: "unsupported", drawn_from: "WO-240084" },
  { id: "EP-14-S", claim_id: "CLM-00650", span_id: "rev-682c7aa0e205/p1/1053-1126", label: "supported", drawn_from: "OPL-EA-5601-04" },
  { id: "EP-14-U", claim_id: "CLM-00650", span_id: "rev-682c7aa0e205/p1/1128-1200", label: "unsupported", drawn_from: "OPL-EA-5601-04" },
  { id: "EP-15-S", claim_id: "CLM-00669", span_id: "rev-6a2af0c157be/p1/1727-1812", label: "supported", drawn_from: "OPL-LV-6701-03" },
  { id: "EP-15-U", claim_id: "CLM-00669", span_id: "rev-6a2af0c157be/p1/1813-1886", label: "unsupported", drawn_from: "OPL-LV-6701-03" },
];

/** The acceptance of AC-EVAL-05: at least 27 of 30 agreements, at most one false accept. */
export const MIN_AGREEMENTS = 27;
export const MAX_FALSE_ACCEPTS = 1;

type BundleClaim = { id: string; value_text: string; span_id: string; entity_binding: string };
type BundleSpan = { id: string; anchor_text: string; document_revision_id: string; page: number; quote_hash: string };

export type PairText = { pair: EntailmentPair; claim: ComposerClaim; span: EvidenceSpan };

/**
 * Every pair with the text the verifier would see. The claim carries the pair id as its sentence id, so a verdict
 * names the pair it answers; the span carries the bundle's own anchor text and quote hash.
 *
 * Throws when a reference does not resolve: a pair set that silently drops a pair would report 29 of 29.
 */
export function resolvePairs(bundleDir: string, pairs: readonly EntailmentPair[] = PAIRS): PairText[] {
  const raw = JSON.parse(readFileSync(path.join(bundleDir, "claims.json"), "utf8")) as { claims: BundleClaim[]; spans: BundleSpan[] };
  const claims = new Map(raw.claims.map((c) => [c.id, c]));
  const spans = new Map(raw.spans.map((s) => [s.id, s]));
  return pairs.map((pair) => {
    const claim = claims.get(pair.claim_id);
    const span = spans.get(pair.span_id);
    if (claim === undefined) throw new Error(`${pair.id}: the bundle carries no claim ${pair.claim_id}`);
    if (span === undefined) throw new Error(`${pair.id}: the bundle carries no span ${pair.span_id}`);
    return {
      pair,
      claim: { id: pair.id, text: claim.value_text, span_ids: [span.id] },
      span: {
        doc_no: pair.drawn_from,
        document_id: span.document_revision_id,
        revision: span.document_revision_id,
        approval_status: "unknown",
        approval_status_text: "",
        page: span.page,
        span_id: span.id,
        quote_hash: span.quote_hash,
        integrity_findings: [],
        superseded: false,
        text: span.anchor_text,
      },
    };
  });
}

export type ConfirmationResult = {
  agreements: number;
  disagreements: string[];
  /** An unsupported pair the verifier called entailed: the failure mode the criterion caps at one. */
  false_accepts: string[];
  /** A supported pair the verifier called not entailed or contradicted. */
  false_rejects: string[];
  /** A pair the verifier returned no verdict for; counted as a disagreement, never as a pass. */
  missing: string[];
  passed: boolean;
};

/**
 * The labels against the verdicts. A verdict of `entailed` is the verifier saying supported; `not_entailed` and
 * `contradicted` are both it saying unsupported. A pair with no verdict is a disagreement, because a verifier that
 * answers nothing has confirmed nothing.
 */
export function scoreConfirmation(pairs: readonly EntailmentPair[], verdicts: readonly VerifierVerdict[]): ConfirmationResult {
  const answered = new Map(verdicts.map((v) => [v.sentence_id, v.verdict]));
  const disagreements: string[] = [];
  const false_accepts: string[] = [];
  const false_rejects: string[] = [];
  const missing: string[] = [];
  for (const pair of pairs) {
    const verdict = answered.get(pair.id);
    if (verdict === undefined) {
      missing.push(pair.id);
      disagreements.push(pair.id);
      continue;
    }
    const said = verdict === "entailed" ? "supported" : "unsupported";
    if (said === pair.label) continue;
    disagreements.push(pair.id);
    if (pair.label === "unsupported") false_accepts.push(pair.id);
    else false_rejects.push(pair.id);
  }
  const agreements = pairs.length - disagreements.length;
  return {
    agreements,
    disagreements,
    false_accepts,
    false_rejects,
    missing,
    passed: agreements >= MIN_AGREEMENTS && false_accepts.length <= MAX_FALSE_ACCEPTS,
  };
}

/** The verdict source. The live run passes `verify` from @/answer/verify; a test passes a stub. */
export type VerdictSource = (claims: ComposerClaim[], spansById: Map<string, EvidenceSpan>) => Promise<VerifierVerdict[]>;

/**
 * One confirmation run. The pairs are sent as one batched, question-blind artefact, which is the shape AG-4 answers
 * in production (9.16), so the measurement is of the pin as it actually runs and not of a special path.
 */
export async function runConfirmation(bundleDir: string, ask: VerdictSource, pairs: readonly EntailmentPair[] = PAIRS): Promise<ConfirmationResult> {
  const resolved = resolvePairs(bundleDir, pairs);
  const verdicts = await ask(
    resolved.map((r) => r.claim),
    new Map(resolved.map((r) => [r.span.span_id, r.span])),
  );
  return scoreConfirmation(pairs, verdicts);
}
