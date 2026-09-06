// AG-4 verify (blueprint section 1 invariant 4, 9.16; ARCHITECTURE 7 step 10; AC-ANS-18, AC-ANS-19): the
// envelope is exactly { pairs } built from the sentences and the texts of the spans they cite, the question has no
// way in, and a reply that does not parse or does not return is not_entailed for every sentence so the gate drops
// them. The gateway is a mock here; verify.gateway.test.ts sends the same envelope through the real gateway.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AG4VerifyInput, AG4VerifyOutput } from "@/contracts/generated/gateway";
import type { ComposerClaim, EvidenceSpan } from "@/gates/g2";
import { chunks, entailedReply, gatewayCall } from "../../tests/fixtures/answer";
import { verifierPairs, verify } from "./verify";

const gw = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/gateway", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/gateway")>()), invoke: gw.invoke }));

const spans: EvidenceSpan[] = chunks.map((c) => ({ ...c.citation, text: c.text }));
const spansById = new Map(spans.map((s) => [s.span_id, s] as const));
const claims: ComposerClaim[] = [
  { id: "s1", text: "VSHH-1201 trips GA-1201A at 7.1 mm/s.", span_ids: ["sp-ds-1", "sp-ds-1", "sp-ds-2"] },
  { id: "s2", text: "The set pressure of PSV-1201 is 9.2 barg.", span_ids: ["sp-ds-2", "sp-missing"] },
];

beforeEach(() => {
  gw.invoke.mockReset();
});

describe("verifierPairs (9.16)", () => {
  it("pairs each sentence with the texts of the spans it cites, in citation order, distinct, unknown ids dropped", () => {
    const pairs = verifierPairs(claims, spansById);
    expect(() => AG4VerifyInput.parse({ pairs })).not.toThrow();
    expect(pairs).toEqual([
      { sentence_id: "s1", sentence: claims[0]?.text, spans: [{ span_id: "sp-ds-1", text: spansById.get("sp-ds-1")?.text }, { span_id: "sp-ds-2", text: spansById.get("sp-ds-2")?.text }] },
      { sentence_id: "s2", sentence: claims[1]?.text, spans: [{ span_id: "sp-ds-2", text: spansById.get("sp-ds-2")?.text }] },
    ]);
    for (const p of pairs) expect(Object.keys(p).sort()).toEqual(["sentence", "sentence_id", "spans"]);
  });
});

describe("verify", () => {
  it("makes no call with no claims: skipped, no verdicts, no gateway_call", async () => {
    expect(await verify([], spansById)).toEqual({ verdicts: [], call: null, outcome: "skipped" });
    expect(gw.invoke).not.toHaveBeenCalled();
  });

  it("sends exactly { pairs } as AG-4 with the AG4VerifyOutput schema and returns the verdicts as the verifier wrote them", async () => {
    const reply = entailedReply("s");
    gw.invoke.mockResolvedValue({ outcome: "ok", data: reply, call: gatewayCall("AG-4", "ok") });
    const result = await verify(claims, spansById, { case_id: "GS-01" });
    const [task, envelope, schema, options] = gw.invoke.mock.calls[0] ?? [];
    expect(task).toBe("AG-4");
    expect(Object.keys(envelope as object)).toEqual(["pairs"]);
    expect(envelope).toEqual({ pairs: verifierPairs(claims, spansById) });
    expect(schema).toBe(AG4VerifyOutput);
    expect(options).toEqual({ case_id: "GS-01" });
    expect(result.outcome).toBe("ok");
    expect(result.verdicts).toEqual(reply.verdicts);
    expect(result.call?.role).toBe("AG-4");
  });

  it.each(["parse_failed", "timeout", "provider_error", "budget_exhausted"] as const)("a %s reply is not_entailed for every sentence, with the outcome in the reason, so C6 drops them all", async (outcome) => {
    gw.invoke.mockResolvedValue({ outcome, data: null, call: gatewayCall("AG-4", outcome) });
    const result = await verify(claims, spansById);
    expect(result.outcome).toBe(outcome);
    expect(result.verdicts).toEqual(claims.map((c) => ({ sentence_id: c.id, verdict: "not_entailed", span_id: null, reason: `verifier ${outcome}: no verdict was returned` })));
    expect(result.call?.outcome).toBe(outcome);
  });
});
