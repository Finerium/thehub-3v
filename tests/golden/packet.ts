// Synthetic packets for the check-module tests. Nothing here is corpus text: the strings are invented for the
// test and the document numbers are made up, so a test file never carries a claim, a span or a question.
import type { Citation, EvidencePacket } from "@/contracts/generated/evidence_packet";
import type { AnswerTrace } from "@/contracts/generated/serving";
import type { Answer } from "../../scripts/golden/view";

export function citation(overrides: Partial<Citation> = {}): Citation {
  return {
    doc_no: "TEST-DOC-1",
    document_id: "doc-1",
    revision: "0",
    approval_status: "approved",
    approval_status_text: "Approved",
    page: 1,
    span_id: "span-1",
    quote_hash: "0".repeat(64),
    integrity_findings: [],
    superseded: false,
    ...overrides,
  };
}

export function packet(overrides: Partial<EvidencePacket> = {}): EvidencePacket {
  return {
    trace_id: "trace-1",
    corpus_version: "v1",
    outcome: "answer",
    template: null,
    rulepack: { version: "1", class: "none" },
    claims: [{ id: "c1", text: "The test claim states 7.4 units.", citations: [citation()], entailment: "entailed" }],
    typed_facts: [],
    blocks: [],
    procedure: null,
    contradictions: [],
    abstention: null,
    refusal: null,
    gaps_declared: [],
    confidence: { band: "high" },
    caveat: null,
    safety_notice: null,
    mode: "live",
    ...overrides,
  };
}

export function trace(overrides: Partial<AnswerTrace> = {}): AnswerTrace {
  return {
    id: "trace-1",
    question: "a question the report never prints",
    language_detected: "en",
    template: null,
    scope: { tags: ["TEST-1"], basis: "tag in the question" },
    rulepack: { version: "1", class: "none", rule_id: null, matched_phrase: null, decided_at: "2026-09-07T00:00:00.000Z" },
    retrieved_chunk_ids: ["chunk-1"],
    prompts: [],
    verifier_verdicts: [],
    gate_results: {
      C1: { pass: true, detail: "" },
      C2: { pass: true, detail: "" },
      C3: { pass: true, detail: "" },
      C4: { pass: true, detail: "" },
      C5: { pass: true, detail: "" },
      C6: { pass: true, detail: "" },
    },
    repair_rounds: 0,
    confidence: { band: "high", inputs: { question_coverage: 1, source_count: 1, approval_share: 1 } },
    outcome: "answer",
    packet: packet(),
    model_ids: { "AG-2": "test-model" },
    corpus_version_id: "cv-1",
    user_alias: "ENG-DEMO",
    server_ts: "2026-09-07T00:00:01.000Z",
    ...overrides,
  };
}

export function answer(p: EvidencePacket = packet(), t: AnswerTrace | null = trace()): Answer {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const claim of p.claims) {
    for (const c of claim.citations) {
      const key = `${c.document_id}#${c.span_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        citations.push(c);
      }
    }
  }
  for (const fact of p.typed_facts) {
    const key = `${fact.source.document_id}#${fact.source.span_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push(fact.source);
    }
  }
  return { packet: p, citations, trace: t };
}
