// AG-2 compose (blueprint 9.16; ARCHITECTURE 7 step 9 and 9.1; AC-ANS-19): the composer envelope is exactly the
// 9.16 shape with every field declared data, the lane assigns the sentence ids s1..sn (r1..rn on the repair round)
// before the verifier sees them, and a reply that is not ok yields no claims and the abstention suggestion so the
// caller's two-call ceiling holds. The gateway is a mock; nothing here reaches a provider.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AG2Input, AG2Output } from "@/contracts/generated/gateway";
import { chunks, composerReply, gatewayCall, scope, typedFacts } from "../../tests/fixtures/answer";
import { MAX_COMPOSER_CALLS, compose, composerEnvelope, withSentenceIds, type ComposeInput } from "./compose";

const gw = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/gateway", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/gateway")>()), invoke: gw.invoke }));

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
