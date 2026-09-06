// The confidence band (ARCHITECTURE 7 step 13 and 13 decision 4; blueprint 9.7 AnswerTrace.confidence; AC-ANS-07,
// AC-NFR-06): a pure function of three inputs computed from stored data, traced beside the band. high when
// question_coverage >= 0.8, source_count >= 2 and approval_share >= 0.8; low when question_coverage < 0.5 or
// approval_share < 0.5; otherwise medium. The inputs: the share of the question's content terms found in the
// retrieved chunks, the number of distinct documents cited, and the share of citations on a revision whose status is
// approved or issued for operation (the served set of retrieve.ts is wider: construction issues and sheets that
// parse as unknown are served, and they lower the band rather than vanish).
import type { Citation } from "@/contracts/generated/evidence_packet";
import { tokens } from "@/rulepack";
import { contentTerms } from "./scope";
import { ConfidenceInputs, type Band, type RetrievedChunk } from "./types";

/** The statuses that count toward approval_share. */
export const APPROVED_STATUSES: readonly Citation["approval_status"][] = ["issued_for_operation", "approved"];

/** ARCHITECTURE 13 decision 4, verbatim as numbers. */
export const THRESHOLDS = {
  high: { question_coverage: 0.8, source_count: 2, approval_share: 0.8 },
  low: { question_coverage: 0.5, approval_share: 0.5 },
} as const;

export function confidenceBand(inputs: ConfidenceInputs): Band {
  const i = ConfidenceInputs.parse(inputs);
  const { high, low } = THRESHOLDS;
  if (i.question_coverage >= high.question_coverage && i.source_count >= high.source_count && i.approval_share >= high.approval_share) {
    return "high";
  }
  if (i.question_coverage < low.question_coverage || i.approval_share < low.approval_share) return "low";
  return "medium";
}

/** The three inputs from what retrieval returned; a citation list wider than the chunks (typed facts) may be passed. */
export function confidenceInputs(question: string, chunks: readonly RetrievedChunk[], citations: readonly Citation[]): ConfidenceInputs {
  const terms = contentTerms(question);
  const seen = new Set<string>();
  for (const c of chunks) for (const t of tokens(c.text)) seen.add(t);
  const covered = terms.filter((t) => seen.has(t)).length;
  const documents = new Set(citations.map((c) => c.document_id));
  const approved = citations.filter((c) => APPROVED_STATUSES.includes(c.approval_status)).length;
  return ConfidenceInputs.parse({
    question_coverage: terms.length === 0 ? 0 : round(covered / terms.length),
    source_count: documents.size,
    approval_share: citations.length === 0 ? 0 : round(approved / citations.length),
  });
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
