// The verifier request as it leaves the process (blueprint 9.13 "the verifier's request never contains the
// question (asserted by a recorded-call test)", 9.16; AC-ANS-18, AC-LOOP-06 in spirit): verify() through the real
// gateway with the provider transport replaced by a recorder. The recorded request body carries the AG-4 prompt and
// the { pairs } envelope only; a question inside the envelope is a schema failure before any request is built. The
// database is the fake (the gateway_call row is recorded, never sent); the budget and the active version are mocks.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AG4VerifyOutput } from "@/contracts/generated/gateway";
import { gatewayCall as gatewayCallTable } from "@/db/schema";
import type { ComposerClaim, EvidenceSpan } from "@/gates/g2";
import { invoke, PROMPTS } from "@/gateway";
import { canonicalJson, sha256Hex } from "@/gateway/config";
import { chunks, entailedReply } from "../../tests/fixtures/answer";
import { argOf, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";
import { verifierPairs, verify } from "./verify";

const provider = vi.hoisted(() => ({ callProvider: vi.fn() }));
vi.mock("@/gateway/provider", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/gateway/provider")>()), callProvider: provider.callProvider }));
vi.mock("@/gateway/budget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/gateway/budget")>()),
  budgetStatus: vi.fn(async (task: string) => ({ role: task, day: "2026-09-06", tokens_used: 0, tokens_per_day: 3_000_000, spend_idr: 0, spend_cap_idr_per_day: 20_000, exhausted: false })),
}));
vi.mock("@/lib/audit", () => ({ activeCorpusVersion: vi.fn(async () => ({ id: "cv-1", label: "v1" })), writeAudit: vi.fn() }));

const QUESTION = "Why did GA-1201A trip on VSHH-1201 in February 2025 and what is the setpoint?";
const spans: EvidenceSpan[] = chunks.map((c) => ({ ...c.citation, text: c.text }));
const spansById = new Map(spans.map((s) => [s.span_id, s] as const));
const claims: ComposerClaim[] = [
  { id: "s1", text: "VSHH-1201 trips GA-1201A at 7.1 mm/s.", span_ids: ["sp-ds-1"] },
  { id: "s2", text: "The set pressure of PSV-1201 is 9.2 barg.", span_ids: ["sp-ds-2"] },
];

type Body = { model: string; messages: Array<{ role: string; content: string }> };

beforeEach(() => {
  resetFakeDb();
  provider.callProvider.mockReset();
  provider.callProvider.mockResolvedValue({ kind: "ok", content: JSON.stringify({ verdicts: entailedReply("s").verdicts.slice(0, 2) }), input_tokens: 10, output_tokens: 5 });
});

describe("the recorded verifier request", () => {
  it("carries the AG-4 prompt and the { pairs } envelope only; the question is nowhere in it", async () => {
    const result = await verify(claims, spansById);
    expect(result.outcome).toBe("ok");
    expect(provider.callProvider).toHaveBeenCalledTimes(1);
    const [task, body] = provider.callProvider.mock.calls[0] as [string, Body];
    expect(task).toBe("AG-4");
    expect(body.model).toBe("glm-5.3-flash");
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(body.messages[0]?.content).toBe(PROMPTS["AG-4"].text);
    const user = JSON.parse(body.messages[1]?.content ?? "{}") as Record<string, unknown>;
    expect(Object.keys(user)).toEqual(["pairs"]);
    expect(user).toEqual({ pairs: verifierPairs(claims, spansById) });
    const recorded = JSON.stringify(body);
    expect(recorded).not.toContain(QUESTION);
    expect(recorded).not.toContain("February");
    expect(recorded).not.toContain('"question"');
  });

  it("writes one gateway_call row for the call with the request hash over the canonical envelope and outcome ok", async () => {
    await verify(claims, spansById);
    const inserts = statements.filter((s) => s[0]?.method === "insert" && s[0]?.args[0] === gatewayCallTable);
    expect(inserts).toHaveLength(1);
    const row = argOf(inserts[0] ?? [], "values") as typeof gatewayCallTable.$inferInsert;
    expect(row.role).toBe("AG-4");
    expect(row.outcome).toBe("ok");
    expect(row.requestSha256).toBe(sha256Hex(canonicalJson({ pairs: verifierPairs(claims, spansById) })));
    expect(row.corpusVersionId).toBe("cv-1");
  });

  it("a question inside the verifier envelope is a schema failure before any request is built", async () => {
    await expect(invoke("AG-4", { pairs: verifierPairs(claims, spansById), question: QUESTION }, AG4VerifyOutput)).rejects.toThrow();
    expect(provider.callProvider).not.toHaveBeenCalled();
    expect(statements).toHaveLength(0);
  });

  it("a reply that does not parse is outcome parse_failed at the gateway and not_entailed for every sentence at the lane", async () => {
    provider.callProvider.mockResolvedValue({ kind: "ok", content: "{ not json", input_tokens: 10, output_tokens: 5 });
    const result = await verify(claims, spansById);
    expect(result.outcome).toBe("parse_failed");
    expect(result.verdicts.map((v) => v.verdict)).toEqual(["not_entailed", "not_entailed"]);
    expect(result.call?.outcome).toBe("parse_failed");
  });
});
