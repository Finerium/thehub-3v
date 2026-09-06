// answer_trace rows (blueprint 9.7 AnswerTrace; ARCHITECTURE 7 step 14; AC-ANS-11, AC-NFR-09): the gate results
// name what each check dropped or "not run", the prompts and model ids of the roles used carry the prompt version
// and the gateway configuration hash, every row goes through the generated Zod on the way in and out, and there is
// one insert and never an update. The database is the fake; the gateway configuration is the real table.
import { beforeEach, describe, expect, it } from "vitest";
import { seededTraceStored } from "../../tests/fixtures/answer";
import { argOf, queueResult, resetFakeDb, statementWith, statements } from "../../tests/helpers/fake-db-client";
import { answerTrace } from "@/db/schema";
import { GATEWAY_CONFIG_SHA256, PROMPTS, ROLE_TABLE } from "@/gateway";
import { gateResults, insertTrace, modelIdsOf, promptsOf, readTrace, toAnswerTrace } from "./trace";

const claim = (id: string) => ({ id, text: "x", span_ids: ["sp-ds-1"] });

beforeEach(() => {
  resetFakeDb();
});

describe("gateResults (9.7)", () => {
  it("is 'not run' on every check when the gate never ran (a refusal, a search, a composer that never answered)", () => {
    const r = gateResults([], false);
    expect(Object.keys(r)).toEqual(["C1", "C2", "C3", "C4", "C5", "C6"]);
    expect(Object.values(r)).toEqual(Array<{ pass: boolean; detail: string }>(6).fill({ pass: true, detail: "not run" }));
  });

  it("passes every check that dropped nothing and names the dropped sentences on the check that failed them", () => {
    const r = gateResults(
      [
        { claim: claim("s2"), check: "C6", reason: "not_entailed: the span does not state it" },
        { claim: claim("s4"), check: "C3", reason: "stray numeral: 9.0" },
        { claim: claim("s5"), check: "C6", reason: "no verdict for s5" },
      ],
      true,
    );
    expect(r.C1).toEqual({ pass: true, detail: "no sentence dropped" });
    expect(r.C3).toEqual({ pass: false, detail: "s4: stray numeral: 9.0" });
    expect(r.C6).toEqual({ pass: false, detail: "s2: not_entailed: the span does not state it | s5: no verdict for s5" });
  });
});

describe("promptsOf and modelIdsOf (AC-NFR-09)", () => {
  it("names each role's prompt file version and the sha256 of its bytes", () => {
    expect(promptsOf(["AG-2", "AG-4"])).toEqual([
      { role: "AG-2", version: "v1", sha256: PROMPTS["AG-2"].version },
      { role: "AG-4", version: "v1", sha256: PROMPTS["AG-4"].version },
    ]);
    expect(promptsOf([])).toEqual([]);
  });

  it("carries the gateway configuration hash and, per role, the model id and the prompt version", () => {
    expect(modelIdsOf(["AG-2"])).toEqual({
      gateway_config_sha256: GATEWAY_CONFIG_SHA256,
      "AG-2": ROLE_TABLE["AG-2"].model_id,
      "AG-2:prompt_version": ROLE_TABLE["AG-2"].prompt_version,
    });
    expect(modelIdsOf([])).toEqual({ gateway_config_sha256: GATEWAY_CONFIG_SHA256 });
    expect(GATEWAY_CONFIG_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("insertTrace and readTrace (AC-ANS-11)", () => {
  it("parses the trace against 9.7 and writes one insert with the 9.7 fields as columns and server_ts as a Date", async () => {
    await insertTrace(seededTraceStored);
    const insert = statementWith("insert");
    expect(insert?.[0]?.args[0]).toBe(answerTrace);
    expect(statements.filter((s) => s.some((c) => c.method === "update"))).toHaveLength(0);
    const values = argOf(insert ?? [], "values") as typeof answerTrace.$inferInsert;
    expect(values.id).toBe(seededTraceStored.id);
    expect(values.packet).toEqual(seededTraceStored.packet);
    expect(values.gateResults).toEqual(seededTraceStored.gate_results);
    expect(values.repairRounds).toBe(0);
    expect(values.modelIds).toEqual({});
    expect(values.serverTs).toEqual(new Date(seededTraceStored.server_ts));
  });

  it("refuses a trace outside the contract before any statement (repair_rounds may only be 0 or 1)", async () => {
    await expect(insertTrace({ ...seededTraceStored, repair_rounds: 2 as unknown as 0 })).rejects.toThrow();
    expect(statements).toHaveLength(0);
  });

  it("toAnswerTrace round-trips a stored row through the contract", () => {
    const row: typeof answerTrace.$inferSelect = {
      id: seededTraceStored.id,
      question: seededTraceStored.question,
      languageDetected: seededTraceStored.language_detected,
      template: seededTraceStored.template,
      scope: seededTraceStored.scope,
      rulepack: seededTraceStored.rulepack,
      retrievedChunkIds: seededTraceStored.retrieved_chunk_ids,
      prompts: seededTraceStored.prompts,
      verifierVerdicts: seededTraceStored.verifier_verdicts,
      gateResults: seededTraceStored.gate_results,
      repairRounds: seededTraceStored.repair_rounds,
      confidence: seededTraceStored.confidence,
      outcome: seededTraceStored.outcome,
      packet: seededTraceStored.packet,
      modelIds: seededTraceStored.model_ids,
      corpusVersionId: seededTraceStored.corpus_version_id,
      userAlias: seededTraceStored.user_alias,
      serverTs: new Date(seededTraceStored.server_ts),
    };
    expect(toAnswerTrace(row)).toEqual(seededTraceStored);
  });

  it("readTrace is null for an unknown id and the stored trace for a known one", async () => {
    queueResult([]);
    expect(await readTrace("trace-unknown")).toBeNull();
    queueResult([
      {
        id: seededTraceStored.id,
        question: seededTraceStored.question,
        languageDetected: "en",
        template: "trip",
        scope: seededTraceStored.scope,
        rulepack: seededTraceStored.rulepack,
        retrievedChunkIds: seededTraceStored.retrieved_chunk_ids,
        prompts: [],
        verifierVerdicts: [],
        gateResults: seededTraceStored.gate_results,
        repairRounds: 0,
        confidence: seededTraceStored.confidence,
        outcome: "answer",
        packet: seededTraceStored.packet,
        modelIds: {},
        corpusVersionId: "cv-1",
        userAlias: "SEED",
        serverTs: new Date(seededTraceStored.server_ts),
      },
    ]);
    expect(await readTrace(seededTraceStored.id)).toEqual(seededTraceStored);
  });
});
