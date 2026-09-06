// Synthetic fixtures for the answer-lane tests (src/answer/*.test.ts, src/app/api/ask/route.test.ts; ARCHITECTURE
// section 7; blueprint 9.7, 9.8, 9.16). The retrieved chunks reuse the SYN- spans of tests/fixtures/g2 (hash-exact,
// contract-validated, no corpus text) so the same claims and verdicts that the gate tests pin pass the lane end to
// end; this module adds the composer and verifier replies, the scope, the seeded trace and the gateway call shape.
// Every packet and trace built here is parsed against the generated Zod on load, so a fixture that drifts from the
// contract fails before any lane test runs.
import { z } from "zod";
import type { RetrievedChunk, Retrieval, Scope } from "@/answer/types";
import { Citation, EvidencePacket, TypedFact } from "@/contracts/generated/evidence_packet";
import { AG2Output, AG4VerifyOutput, GatewayCall } from "@/contracts/generated/gateway";
import { AnswerTrace } from "@/contracts/generated/serving";
import { AS_BUILT_CAVEAT } from "@/lib/fixed-strings";
import { citation, claims as gateClaims, span, typedFacts as gateFacts, verdicts as gateVerdicts } from "../g2";

export { citation, span };

export const CORPUS_VERSION = { id: "cv-1", label: "v1" } as const;
export const TRACE_ID = "trace-fixture-0001";
export const USER = { id: "u-eng", username: "engineer_demo", alias: "ENG-DEMO", role: "Engineer" as const, sessionId: "s-1", expiresAt: new Date("2099-01-01T00:00:00.000Z") };

/** A question the pack classifies as none, moment trip, protective function SEQ-1201 (src/rulepack/matcher.test.ts). */
export const TRIP_QUESTION = "Why did GA-1201A trip on VSHH-1201 in February 2025 and what is the setpoint?";

/** The served, current SYN- spans as retrieved chunks, in rerank order: five documents, so three nearest exist. */
const CHUNK_SPANS: ReadonlyArray<[string, RetrievedChunk["unit_kind"], 0 | 1 | 2, number]> = [
  ["sp-ds-1", "datasheet_group", 2, 0.91],
  ["sp-ds-2", "datasheet_group", 2, 0.88],
  ["sp-ce-1", "ce_row", 2, 0.85],
  ["sp-opl-1", "opl_step", 1, 0.8],
  ["sp-ct-0", "datasheet_group", 0, 0.7],
  ["sp-wo-1", "wo_field", 0, 0.66],
  ["sp-ds-3", "note", 0, 0.6],
];

export function chunkOf(spanId: string, unitKind: RetrievedChunk["unit_kind"], lexical: 0 | 1 | 2, cosine: number, n: number): RetrievedChunk {
  const s = span(spanId);
  const { text, ...rest } = s;
  return {
    chunk_id: `rev-syn${String(n).padStart(3, "0")}/c${String(n).padStart(3, "0")}`,
    unit_kind: unitKind,
    text,
    citation: Citation.parse(rest),
    anchor_text: text,
    rank: { lexical, cosine },
  };
}

export const chunks: RetrievedChunk[] = CHUNK_SPANS.map(([id, kind, lexical, cosine], i) => chunkOf(id, kind, lexical, cosine, i + 1));

export function retrievalOf(list: readonly RetrievedChunk[] = chunks): Retrieval {
  return { evidence: list.map((c) => structuredClone(c.citation)), chunks: list.map((c) => structuredClone(c)) };
}

export const retrieval: Retrieval = retrievalOf();

export const scope: Scope = {
  tags: ["GA-1201A"],
  instrument_tags: ["VSHH-1201"],
  document_ids: [...new Set(chunks.map((c) => c.citation.document_id))].sort(),
  revision_ids: ["rev-syn001", "rev-syn002", "rev-syn003", "rev-syn004", "rev-syn005"],
  basis: [
    "equipment tag GA-1201A named in the question",
    "instrument tag VSHH-1201 (initiator) named in the question",
    "documents of GA-1201A by subject_tag and typed references: 5",
    "current revisions in versions cv-1: 5",
  ],
  family_ids: [],
};

/** The typed facts of the gate fixture; the first is a ce_row (the caveat trigger of outcome.ts caveatFor). */
export const typedFacts: TypedFact[] = gateFacts.map((f) => structuredClone(f));

/** The AG-2 reply that the gate keeps in full: the gate fixture's five claims without their lane-assigned ids. */
export const composerReply: AG2Output = AG2Output.parse({
  claims: gateClaims.map((c) => ({ text: c.text, span_ids: [...c.span_ids] })),
  gaps: [],
  suggested_outcome: "answer",
});

/** An AG-4 reply: every sentence entailed on its first cited span, ids as the lane assigns them (s1..sn or r1..rn). */
export function entailedReply(prefix: "s" | "r" = "s"): AG4VerifyOutput {
  return AG4VerifyOutput.parse({ verdicts: gateVerdicts.entailed.map((v) => ({ ...v, sentence_id: v.sentence_id.replace(/^s/, prefix) })) });
}

/** An AG-4 reply with the named sentence ids not entailed and the rest entailed. */
export function replyWithNotEntailed(notEntailed: readonly string[], prefix: "s" | "r" = "s"): AG4VerifyOutput {
  const base = entailedReply(prefix);
  return AG4VerifyOutput.parse({
    verdicts: base.verdicts.map((v) =>
      notEntailed.includes(v.sentence_id) ? { sentence_id: v.sentence_id, verdict: "not_entailed", span_id: null, reason: "The span does not state the value." } : v,
    ),
  });
}

/** A 9.13 GatewayCall as the mocked gateway hands it back; the ids are fixture values, never a provider's. */
export function gatewayCall(role: "AG-2" | "AG-4", outcome: GatewayCall["outcome"]): GatewayCall {
  return GatewayCall.parse({
    role,
    request_sha256: "0".repeat(64),
    response_sha256: "0".repeat(64),
    model_id: "glm-5.3-flash",
    prompt_version: "fixture",
    gateway_config_sha256: "0".repeat(64),
    corpus_version_id: CORPUS_VERSION.id,
    latency_ms: 1,
    input_tokens: 0,
    output_tokens: 0,
    outcome,
  });
}

const PASS = { pass: true, detail: "no sentence dropped" } as const;

/** A stored seeded answer (9.17): the packet of GS-01's shape with mode seeded and one entailed claim of the fixture. */
export const SEEDED_QUESTION = "Why did GA-1201A trip in February 2025 and what is the setpoint?";

export const seededPacket: EvidencePacket = EvidencePacket.parse({
  trace_id: "trace-seeded-gs-01",
  corpus_version: CORPUS_VERSION.label,
  outcome: "answer",
  template: "trip",
  rulepack: { version: "1", class: "none" },
  claims: [{ id: "s1", text: gateClaims[0]?.text ?? "", citations: [citation("sp-ds-1")], entailment: "entailed" }],
  typed_facts: [typedFacts[0]],
  blocks: [],
  procedure: null,
  contradictions: [],
  abstention: null,
  refusal: null,
  gaps_declared: [],
  confidence: { band: "high" },
  caveat: AS_BUILT_CAVEAT,
  safety_notice: null,
  mode: "seeded",
});

export const seededTraceStored: AnswerTrace = AnswerTrace.parse({
  id: "trace-seeded-gs-01",
  question: SEEDED_QUESTION,
  language_detected: "en",
  template: "trip",
  scope: { tags: ["GA-1201A"], basis: "equipment tag GA-1201A named in the question" },
  rulepack: { version: "1", class: "none", rule_id: "R5-none", matched_phrase: null, decided_at: "2026-09-05T00:00:00.000Z" },
  retrieved_chunk_ids: chunks.slice(0, 3).map((c) => c.chunk_id),
  prompts: [],
  verifier_verdicts: [],
  gate_results: { C1: PASS, C2: PASS, C3: PASS, C4: PASS, C5: PASS, C6: PASS },
  repair_rounds: 0,
  confidence: { band: "high", inputs: { question_coverage: 1, source_count: 2, approval_share: 1 } },
  outcome: "answer",
  packet: seededPacket,
  model_ids: {},
  corpus_version_id: CORPUS_VERSION.id,
  user_alias: "SEED",
  server_ts: "2026-09-05T00:00:00.000Z",
});

export const seeded = {
  chip: { id: "chip-ga-1201a-gs-01", equipment_tag: "GA-1201A", question: SEEDED_QUESTION, golden_case_id: "GS-01", trace_id: seededTraceStored.id },
  trace: seededTraceStored,
};

/** One ndjson line as the test reads it back: parsed JSON, shape checked by the caller against AskStream. */
export const NdjsonLine = z.object({ stage: z.enum(["evidence", "packet"]) }).loose();
export type NdjsonLine = z.infer<typeof NdjsonLine>;

export async function readLines(response: Response): Promise<NdjsonLine[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => NdjsonLine.parse(JSON.parse(line)));
}
