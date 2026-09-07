// AG-4 redline (blueprint section 1 invariant 4, 9.6 RedlineVerdict, 9.16 "the redliner has no edit field in its
// schema"; ARCHITECTURE 8.3; AC-LOOP-06). The redliner returns a verdict and reasons and never an edited draft:
// its output contract has no edit field, so a reply carrying one does not parse and the round counts as a block;
// the draft object the caller holds is byte-identical before and after the call; its prompt file differs from every
// authoring prompt. The real gateway runs here with the provider transport replaced by a recorder, so the assertions
// are about the request as it would leave the process. The database is the fake client; no network, no corpus text.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AG4RedlineInput, AG4RedlineOutput } from "@/contracts/generated/gateway";
import { gatewayCall as gatewayCallTable } from "@/db/schema";
import { MAX_RETRIES, PROMPTS } from "@/gateway";
import { ROLE_TABLE, canonicalJson, sha256Hex } from "@/gateway/config";
import { CLEAN_OUTPUT, REDLINE_BLOCK, REDLINE_PASS } from "../../tests/fixtures/drafting";
import { argOf, resetFakeDb, statementWith } from "../../tests/helpers/fake-db-client";
import { redline } from "./redline";

const provider = vi.hoisted(() => ({ callProvider: vi.fn() }));
vi.mock("@/gateway/provider", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/gateway/provider")>()), callProvider: provider.callProvider }));
vi.mock("@/gateway/budget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/gateway/budget")>()),
  budgetStatus: vi.fn(async (task: string) => ({ role: task, day: "2026-09-07", tokens_used: 0, tokens_per_day: 3_000_000, spend_idr: 0, spend_cap_idr_per_day: 20_000, exhausted: false })),
}));
vi.mock("@/lib/audit", () => ({ activeCorpusVersion: vi.fn(async () => ({ id: "cv-1", label: "v1" })), writeAudit: vi.fn() }));

type Body = { model: string; messages: Array<{ role: string; content: string }> };

const EVIDENCE_REFS = [{ kind: "work_order", ref: "WO-990001" }, { kind: "datasheet_param", ref: "dp-syn-1" }];
const TEMPLATE_RULES = ["sections 1, 2, 3, 4 and 6 never reproduce a work-order narrative field verbatim"];

function replied(payload: unknown) {
  provider.callProvider.mockResolvedValue({ kind: "ok", content: JSON.stringify(payload), input_tokens: 40, output_tokens: 12 });
}

beforeEach(() => {
  resetFakeDb();
  provider.callProvider.mockReset();
  replied(REDLINE_PASS);
});

describe("the redline envelope as it leaves the process", () => {
  it("carries the AG-4 redline prompt and exactly { draft, evidence_refs, template_rules }", async () => {
    await redline(CLEAN_OUTPUT, EVIDENCE_REFS, TEMPLATE_RULES, 1);

    expect(provider.callProvider).toHaveBeenCalledTimes(1);
    const [task, body] = provider.callProvider.mock.calls[0] as [string, Body];
    expect(task).toBe("AG-4/redline");
    expect(body.messages[0]?.content).toBe(PROMPTS["AG-4/redline"].text);
    const envelope = JSON.parse(body.messages[1]?.content ?? "{}") as Record<string, unknown>;
    expect(Object.keys(envelope).sort()).toEqual(["draft", "evidence_refs", "template_rules"]);
    expect(envelope).toEqual({ draft: CLEAN_OUTPUT, evidence_refs: EVIDENCE_REFS, template_rules: TEMPLATE_RULES });
    expect(AG4RedlineInput.safeParse(envelope).success).toBe(true);
  });

  it("carries no edit field, no round and no question", async () => {
    await redline(CLEAN_OUTPUT, EVIDENCE_REFS, TEMPLATE_RULES, 2);
    const [, body] = provider.callProvider.mock.calls[0] as [string, Body];
    const recorded = JSON.stringify(body);
    for (const forbidden of ['"edit"', '"edits"', '"edited_draft"', '"question"', '"round"']) {
      expect(recorded, forbidden).not.toContain(forbidden);
    }
  });

  it("writes one gateway_call row under the AG-4 role with the redline prompt version", async () => {
    await redline(CLEAN_OUTPUT, EVIDENCE_REFS, TEMPLATE_RULES, 1);
    expect(argOf(statementWith("insert")!, "values")).toMatchObject({
      role: "AG-4",
      promptVersion: PROMPTS["AG-4/redline"].version,
      outcome: "ok",
    });
    expect(statementWith("insert")?.[0]?.args[0]).toBe(gatewayCallTable);
  });
});

describe("the redliner never edits", () => {
  it("has no edit field in its output contract: a verdict carrying one does not parse", () => {
    expect(AG4RedlineOutput.safeParse({ verdict: "pass", reasons: [] }).success).toBe(true);
    expect(AG4RedlineOutput.safeParse({ verdict: "pass", reasons: [], edit: "rewritten section 2" }).success).toBe(false);
    expect(AG4RedlineOutput.safeParse({ verdict: "pass", reasons: [], draft: CLEAN_OUTPUT }).success).toBe(false);
    expect(Object.keys(AG4RedlineOutput.shape).sort()).toEqual(["reasons", "verdict"]);
  });

  it("leaves the draft byte-identical: the same object, the same canonical hash, no draft on the result", async () => {
    const before = sha256Hex(canonicalJson(CLEAN_OUTPUT));
    const copy = structuredClone(CLEAN_OUTPUT);

    const result = await redline(CLEAN_OUTPUT, EVIDENCE_REFS, TEMPLATE_RULES, 1);

    expect(sha256Hex(canonicalJson(CLEAN_OUTPUT))).toBe(before);
    expect(CLEAN_OUTPUT).toEqual(copy);
    expect(Object.keys(result).sort()).toEqual(["call", "outcome", "reasons", "round", "verdict"]);
  });

  it("blocks when the reply carries an edited draft: the extra field is a parse failure, never an applied edit", async () => {
    replied({ ...REDLINE_PASS, edited_draft: { ...CLEAN_OUTPUT, header: { title: "rewritten by the redliner" } } });
    const result = await redline(CLEAN_OUTPUT, EVIDENCE_REFS, TEMPLATE_RULES, 1);

    expect(result.outcome).toBe("parse_failed");
    expect(result.verdict).toBe("block");
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("rewritten by the redliner");
  });
});

describe("the verdict the caller stores", () => {
  it("returns the reply's verdict, its reasons unchanged and the round it was asked for", async () => {
    replied(REDLINE_BLOCK);
    const result = await redline(CLEAN_OUTPUT, EVIDENCE_REFS, TEMPLATE_RULES, 2);

    expect(result).toMatchObject({ verdict: "block", round: 2, outcome: "ok", reasons: REDLINE_BLOCK.reasons });
    expect(result.call.role).toBe("AG-4");
  });

  it("returns pass with no reason when the redliner passes", async () => {
    const result = await redline(CLEAN_OUTPUT, EVIDENCE_REFS, TEMPLATE_RULES, 1);
    expect(result).toMatchObject({ verdict: "pass", reasons: [], round: 1, outcome: "ok" });
  });

  // A timeout is retryable, so invoke() spends its real backoffs across this role's own ladder before it gives up;
  // the case is given room for that rather than racing the default per-test budget. The redline takes one attempt
  // of 60 s rather than three, so that a draft and its redline together stay inside the 240 s lease.
  it("blocks when the call does not return, so an unreachable redliner never passes a draft", async () => {
    provider.callProvider.mockResolvedValue({ kind: "timeout" });
    const result = await redline(CLEAN_OUTPUT, EVIDENCE_REFS, TEMPLATE_RULES, 1);

    expect(provider.callProvider).toHaveBeenCalledTimes((ROLE_TABLE["AG-4/redline"].retries ?? MAX_RETRIES) + 1);
    expect(result.outcome).toBe("timeout");
    expect(result.verdict).toBe("block");
    expect(result.reasons[0]?.category).toBe("technical_plausibility");
  }, 15_000);
});

describe("redline independence (AC-LOOP-06)", () => {
  it("runs a prompt file of its own that differs from every authoring prompt and from the verifier prompt", () => {
    expect(PROMPTS["AG-4/redline"].file).toBe("AG-4/redline/v1.md");
    const others = ["AG-1", "AG-2", "AG-3", "AG-4"] as const;
    for (const task of others) {
      expect(PROMPTS["AG-4/redline"].version, task).not.toBe(PROMPTS[task].version);
      expect(PROMPTS["AG-4/redline"].text, task).not.toBe(PROMPTS[task].text);
    }
  });
});
