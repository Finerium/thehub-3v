// AG-2 compose (blueprint 9.16; ARCHITECTURE 7 step 9 and 9.1; AC-ANS-19): the composer envelope is exactly the
// 9.16 shape with every field declared data, its evidence is the one evidence set of src/answer/evidence.ts (the
// retrieved chunks and the spans the typed facts and the blocks cite, so a typed fact's span_id is always citable),
// the lane assigns the sentence ids s1..sn (r1..rn on the repair round) before the verifier sees them, and a reply
// that is not ok yields no claims and the abstention suggestion so the caller's two-call ceiling holds. The prompt
// the gateway sends with that envelope is pinned here too. The gateway is a mock; nothing here reaches a provider.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AG2Input, AG2Output } from "@/contracts/generated/gateway";
import { db } from "@/db/client";
import { PROMPTS } from "@/gateway/config";
import {
  EVIDENCE_SET_ORDER,
  chunks,
  composerReply,
  evidenceBlocks,
  gatewayCall,
  scope,
  spanSources,
  typedFacts,
  typedFactsWithUnretrieved,
} from "../../tests/fixtures/answer";
import { buildEvidenceSet } from "./evidence";
import { MAX_COMPOSER_CALLS, compose, composerEnvelope, withSentenceIds, type ComposeInput } from "./compose";

const gw = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/gateway", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/gateway")>()), invoke: gw.invoke }));

const q = vi.hoisted(() => ({ spansByIds: vi.fn() }));
vi.mock("@/db/queries/retrieval", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/queries/retrieval")>()),
  spansByIds: q.spansByIds,
}));

const input: ComposeInput = {
  question: "Why did GA-1201A trip on VSHH-1201?",
  template: "trip",
  scope,
  chunks: chunks.map((c) => ({ citation: c.citation, text: c.text })),
  typed_facts: typedFacts,
  repair: null,
};

beforeEach(() => {
  gw.invoke.mockReset();
  q.spansByIds.mockImplementation(async (_db: unknown, ids: readonly string[]) => spanSources(ids));
});

describe("composerEnvelope (9.16)", () => {
  it("is the strict AG2Input: question, template, scope tags, evidence with six fields, typed facts, repair null", () => {
    const envelope = composerEnvelope(input);
    expect(() => AG2Input.parse(envelope)).not.toThrow();
    expect(Object.keys(envelope).sort()).toEqual(["evidence", "question", "repair", "scope", "template", "typed_facts"]);
    expect(envelope.scope).toEqual({ tags: ["GA-1201A"] });
    expect(envelope.repair).toBeNull();
    expect(envelope.evidence).toHaveLength(chunks.length);
    for (const [i, e] of envelope.evidence.entries()) {
      const c = chunks[i];
      if (c === undefined) throw new Error("fixture mismatch");
      expect(Object.keys(e).sort()).toEqual(["approval_status", "doc_no", "page", "revision", "span_id", "text"]);
      expect(e).toEqual({ span_id: c.citation.span_id, doc_no: c.citation.doc_no, revision: c.citation.revision, approval_status: c.citation.approval_status, page: c.citation.page, text: c.text });
    }
    expect(envelope.typed_facts).toEqual(typedFacts);
  });

  it("copies the typed facts and the repair verdicts, so the envelope never aliases the lane's state", () => {
    const verdicts = [{ sentence_id: "s2", verdict: "not_entailed" as const, span_id: null, reason: "not stated" }];
    const envelope = composerEnvelope({ ...input, repair: { verdicts } });
    expect(envelope.repair).toEqual({ verdicts });
    expect(envelope.repair?.verdicts[0]).not.toBe(verdicts[0]);
    const fact = envelope.typed_facts[0];
    if (fact === undefined) throw new Error("no typed fact");
    fact.source.integrity_findings.push("IR-99");
    expect(typedFacts[0]?.source.integrity_findings).toEqual([]);
  });
});

describe("withSentenceIds", () => {
  it("assigns s1..sn in claim order on the first round and r1..rn on the repair round, copying the span ids", () => {
    const first = withSentenceIds(composerReply.claims, 0);
    expect(first.map((c) => c.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(withSentenceIds(composerReply.claims, 1).map((c) => c.id)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(first[0]?.text).toBe(composerReply.claims[0]?.text);
    expect(first[0]?.span_ids).toEqual(composerReply.claims[0]?.span_ids);
    expect(first[0]?.span_ids).not.toBe(composerReply.claims[0]?.span_ids);
  });
});

describe("compose", () => {
  it("MAX_COMPOSER_CALLS is two: first plus retry, or first plus repair, never a third", () => {
    expect(MAX_COMPOSER_CALLS).toBe(2);
  });

  it("calls the gateway once as AG-2 with the envelope and the AG2Output schema, and returns the ids of the round", async () => {
    gw.invoke.mockResolvedValue({ outcome: "ok", data: composerReply, call: gatewayCall("AG-2", "ok") });
    const result = await compose(input, 1, { case_id: "GS-01" });
    expect(gw.invoke).toHaveBeenCalledTimes(1);
    const [task, envelope, schema, options] = gw.invoke.mock.calls[0] ?? [];
    expect(task).toBe("AG-2");
    expect(envelope).toEqual(composerEnvelope(input));
    expect(schema).toBe(AG2Output);
    expect(options).toEqual({ case_id: "GS-01" });
    expect(result.outcome).toBe("ok");
    expect(result.claims.map((c) => c.id)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(result.gaps).toEqual([]);
    expect(result.suggested_outcome).toBe("answer");
    expect(result.call.role).toBe("AG-2");
  });

  it.each(["parse_failed", "timeout", "provider_error", "budget_exhausted"] as const)("a %s reply is no claims, no gaps, suggested abstention and the outcome kept", async (outcome) => {
    gw.invoke.mockResolvedValue({ outcome, data: null, call: gatewayCall("AG-2", outcome) });
    const result = await compose(input, 0);
    expect(result).toMatchObject({ claims: [], gaps: [], suggested_outcome: "abstention", outcome });
    expect(result.call.outcome).toBe(outcome);
  });
});

describe("the envelope's evidence is the one evidence set (blueprint 9.8, 9.16; AC-ANS-03)", () => {
  it("is one entry per set item, in set order, with the text behind that item's quote_hash", async () => {
    const set = await buildEvidenceSet(db, { retrieved: chunks, typed_facts: typedFactsWithUnretrieved, blocks: evidenceBlocks });
    const envelope = composerEnvelope({ ...input, chunks: set.map(({ text, ...citation }) => ({ citation, text })), typed_facts: typedFactsWithUnretrieved });
    expect(() => AG2Input.parse(envelope)).not.toThrow();
    expect(envelope.evidence.map((e) => e.span_id)).toEqual(EVIDENCE_SET_ORDER);
    expect(envelope.evidence).toHaveLength(set.length);
    for (const [i, e] of envelope.evidence.entries()) {
      const item = set[i];
      if (item === undefined) throw new Error("set mismatch");
      expect(e).toEqual({ span_id: item.span_id, doc_no: item.doc_no, revision: item.revision, approval_status: item.approval_status, page: item.page, text: item.text });
    }
  });

  it("carries the source span of every typed fact, so the composer may cite a value it is given (the UC-1 defect)", async () => {
    const set = await buildEvidenceSet(db, { retrieved: chunks, typed_facts: typedFactsWithUnretrieved, blocks: [] });
    const envelope = composerEnvelope({ ...input, chunks: set.map(({ text, ...citation }) => ({ citation, text })), typed_facts: typedFactsWithUnretrieved });
    const listed = new Set(envelope.evidence.map((e) => e.span_id));
    for (const fact of envelope.typed_facts) expect(listed.has(fact.source.span_id), fact.label).toBe(true);
    const offChunk = envelope.typed_facts.filter((f) => !chunks.some((c) => c.citation.span_id === f.source.span_id));
    expect(offChunk.length).toBeGreaterThan(0);
  });
});

describe("the AG-2 prompt the gateway sends with that envelope (prompts/AG-2/v2.md)", () => {
  const text = PROMPTS["AG-2"].text;

  it("is version 2 and states that the evidence list is the whole set, typed-fact spans included", () => {
    expect(text).toContain("# AG-2 Composer, prompt version 2");
    expect(text).toContain(
      "`evidence` is the whole evidence set of this answer: the retrieved passages first, then the span each typed fact was read from, each with the text of that span.",
    );
  });

  it("carries the three rules of the evidence-set revision, verbatim", () => {
    expect(text).toContain("Cite only span_ids that appear in the `evidence` list.");
    expect(text).toContain("A typed fact's value may be stated with its span_id.");
    expect(text).toContain("Document metadata is never a claim.");
  });

  it("never asks for a claim about approval status, which v1 did (rule 5 of v1 is gone)", () => {
    expect(text).not.toContain("Approval status is part of the evidence.");
    expect(text).toContain("Never write a claim whose subject is one of them");
  });
});
