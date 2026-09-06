// C6, entailment from the verifier's verdicts (blueprint section 1 invariant 4, 8.4, 9.16 AG-4; AC-ANS-19): a
// sentence is kept only with an "entailed" verdict for its sentence id; not_entailed and contradicted drop it with the
// verdict and the verifier's reason carried into the gate's reason; a sentence with no verdict is dropped as missing
// (a parse failure upstream reaches the gate as no verdicts at all). Verdicts are read by sentence id, never by
// position; a verdict for an unknown id changes nothing.
import { ENTAILED } from "@/lib/fixed-strings";
import type { VerifierVerdict } from "./index";

export function c6(sentenceId: string, verdicts: readonly VerifierVerdict[]): string | null {
  const verdict = verdicts.find((v) => v.sentence_id === sentenceId);
  if (verdict === undefined) return `no verdict for ${sentenceId}: the verifier's reply is missing this sentence`;
  return verdict.verdict === ENTAILED ? null : `${verdict.verdict}: ${verdict.reason}`;
}
