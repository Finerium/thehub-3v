// answer_trace rows (blueprint 9.7 AnswerTrace; ARCHITECTURE 7 step 14; AC-ANS-11, AC-NFR-09): immutable, one
// insert and never an update, the packet as jsonb, the corpus version, the mode inside the packet, the model ids with
// their prompt versions and the gateway configuration hash, the rule-pack decision whose decided_at precedes every
// gateway timestamp of the trace (AC-ANS-08), repair_rounds 0 or 1. Every row leaves and enters through the generated
// Zod of 9.7, so a trace that drifts from the contract is refused before it reaches the database.
import { eq } from "drizzle-orm";
import { AnswerTrace } from "@/contracts/generated/serving";
import { db } from "@/db/client";
import { answerTrace } from "@/db/schema";
import { GATE_CHECKS, type Dropped, type GateCheck } from "@/gates/g2";
import { GATEWAY_CONFIG_SHA256, PROMPTS, ROLE_TABLE, type ChatTask } from "@/gateway";

export type GateResults = AnswerTrace["gate_results"];

/** The 9.7 gate_results: a check passes when it dropped nothing; the detail names what it dropped, or "not run". */
export function gateResults(dropped: readonly Dropped[], ran: boolean): GateResults {
  const entry = (check: GateCheck) => {
    if (!ran) return { pass: true, detail: "not run" };
    const mine = dropped.filter((d) => d.check === check);
    return mine.length === 0
      ? { pass: true, detail: "no sentence dropped" }
      : { pass: false, detail: mine.map((d) => `${d.claim.id}: ${d.reason}`).join(" | ") };
  };
  return Object.fromEntries(GATE_CHECKS.map((c) => [c, entry(c)])) as GateResults;
}

/** The prompts of the roles the trace used: the file's version label and the sha256 of its bytes (9.13). */
export function promptsOf(tasks: readonly ChatTask[]): AnswerTrace["prompts"] {
  return tasks.map((task) => {
    const prompt = PROMPTS[task];
    return { role: ROLE_TABLE[task].role, version: prompt.file.replace(/^.*\//, "").replace(/\.md$/, ""), sha256: prompt.version };
  });
}

/** model_ids: the model id per role, its prompt version beside it, and the gateway configuration hash (AC-NFR-09). */
export function modelIdsOf(tasks: readonly ChatTask[]): Record<string, string> {
  const out: Record<string, string> = { gateway_config_sha256: GATEWAY_CONFIG_SHA256 };
  for (const task of tasks) {
    const cfg = ROLE_TABLE[task];
    out[cfg.role] = cfg.model_id;
    out[`${cfg.role}:prompt_version`] = cfg.prompt_version ?? "";
  }
  return out;
}

/** One insert; the row is never updated (AC-ANS-11). */
export async function insertTrace(trace: AnswerTrace): Promise<void> {
  const t = AnswerTrace.parse(trace);
  await db.insert(answerTrace).values({
    id: t.id,
    question: t.question,
    languageDetected: t.language_detected,
    template: t.template,
    scope: t.scope,
    rulepack: t.rulepack,
    retrievedChunkIds: t.retrieved_chunk_ids,
    prompts: t.prompts,
    verifierVerdicts: t.verifier_verdicts,
    gateResults: t.gate_results,
    repairRounds: t.repair_rounds,
    confidence: t.confidence,
    outcome: t.outcome,
    packet: t.packet,
    modelIds: t.model_ids,
    corpusVersionId: t.corpus_version_id,
    userAlias: t.user_alias,
    serverTs: new Date(t.server_ts),
  });
}

export function toAnswerTrace(row: typeof answerTrace.$inferSelect): AnswerTrace {
  return AnswerTrace.parse({
    id: row.id,
    question: row.question,
    language_detected: row.languageDetected,
    template: row.template,
    scope: row.scope,
    rulepack: row.rulepack,
    retrieved_chunk_ids: row.retrievedChunkIds,
    prompts: row.prompts,
    verifier_verdicts: row.verifierVerdicts,
    gate_results: row.gateResults,
    repair_rounds: row.repairRounds,
    confidence: row.confidence,
    outcome: row.outcome,
    packet: row.packet,
    model_ids: row.modelIds,
    corpus_version_id: row.corpusVersionId,
    user_alias: row.userAlias,
    server_ts: new Date(row.serverTs).toISOString(),
  });
}

/** The stored trace with its packet and gate decisions, or null (GET /api/trace/:id). */
export async function readTrace(id: string): Promise<AnswerTrace | null> {
  const [row] = await db.select().from(answerTrace).where(eq(answerTrace.id, id)).limit(1);
  return row ? toAnswerTrace(row) : null;
}
