// The gateway (INV-4, ADR-001, ARCHITECTURE 9, blueprint 9.13 and 9.16): the one module that calls the provider.
// invoke(task, envelope, outputSchema) validates the envelope against its task's input contract, checks the daily
// budget, posts the prompt file plus the envelope as JSON data, validates the parsed reply against outputSchema and
// writes one gateway_call row per attempt: retries with backoff 500 ms then 2000 ms on timeout, 5xx and 429, at
// most two retries, each failed attempt its own row (timeout, provider_error) and one ok row per logical call. A
// parse or schema failure is outcome parse_failed and the caller's rule applies (AG-4: not_entailed; AG-3: retry
// once then block; AG-2: one retry then abstention). embed() loads the local model lazily (ADR-009).
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { GatewayCall } from "@/contracts/generated/gateway";
import { db } from "@/db/client";
import { gatewayCall } from "@/db/schema";
import { activeCorpusVersion } from "@/lib/audit";
import { log } from "@/lib/log";
import { budgetStatus } from "./budget";
import {
  GATEWAY_CONFIG_SHA256,
  INPUT_SCHEMAS,
  ROLE_TABLE,
  canonicalJson,
  sha256Hex,
  type ChatTask,
} from "./config";
import { buildRequestBody, callProvider, stripJsonFence } from "./provider";
import { record, recordMode, replay } from "./record";

export { BudgetExhaustedError, ReplayMismatchError } from "./errors";
export { budgetStatus, type BudgetStatus } from "./budget";
export {
  BUDGETS,
  CHAT_TASKS,
  GATEWAY_CONFIG_SHA256,
  MODEL_ID,
  PROMPTS,
  PROVIDER_BASE_URL,
  ROLE_TABLE,
  TASKS,
  type ChatTask,
  type RoleConfig,
  type Task,
} from "./config";
export { CITATION_MAX_CHARS, recordMode, replay } from "./record";

export type InvokeOutcome = GatewayCall["outcome"];
export type InvokeResult<T> = { outcome: InvokeOutcome; data: T | null; call: GatewayCall };
export type InvokeOptions = { case_id?: string };

export const MAX_RETRIES = 2;
export const RETRY_BACKOFF_MS: readonly number[] = [500, 2000];
const NO_RESPONSE_SHA256 = sha256Hex("");

async function corpusVersionId(): Promise<string> {
  const active = await activeCorpusVersion();
  if (!active) throw new Error("gateway: no active corpus version to bind the call to");
  return active.id;
}

type CallDraft = Omit<GatewayCall, "role" | "model_id" | "prompt_version" | "gateway_config_sha256" | "corpus_version_id">;

async function writeCall(task: ChatTask, versionId: string, draft: CallDraft): Promise<GatewayCall> {
  const cfg = ROLE_TABLE[task];
  const call = GatewayCall.parse({
    role: cfg.role,
    model_id: cfg.model_id,
    prompt_version: cfg.prompt_version,
    gateway_config_sha256: GATEWAY_CONFIG_SHA256,
    corpus_version_id: versionId,
    ...draft,
  });
  await db.insert(gatewayCall).values({
    id: randomUUID(),
    role: call.role,
    requestSha256: call.request_sha256,
    responseSha256: call.response_sha256,
    modelId: call.model_id,
    promptVersion: call.prompt_version,
    gatewayConfigSha256: call.gateway_config_sha256,
    corpusVersionId: call.corpus_version_id,
    latencyMs: call.latency_ms,
    inputTokens: call.input_tokens,
    outputTokens: call.output_tokens,
    outcome: call.outcome,
  });
  return call;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function invoke<T>(
  task: ChatTask,
  envelope: Record<string, unknown>,
  outputSchema: z.ZodType<T>,
  options: InvokeOptions = {},
): Promise<InvokeResult<T>> {
  const cfg = ROLE_TABLE[task];
  INPUT_SCHEMAS[task].parse(envelope); // the envelope contract (9.16); a field outside it never leaves the process
  const requestSha256 = sha256Hex(canonicalJson(envelope));
  const versionId = await corpusVersionId();
  const mode = recordMode();
  const logBase = { event: "gateway_call", task, role: cfg.role, case_id: options.case_id ?? null };

  if (mode === "replay" && options.case_id) {
    const recorded = replay(task, envelope, options.case_id);
    const parsed = outputSchema.safeParse(recorded);
    const call = await writeCall(task, versionId, {
      request_sha256: requestSha256,
      response_sha256: sha256Hex(canonicalJson(recorded)),
      latency_ms: 0,
      input_tokens: 0,
      output_tokens: 0,
      outcome: parsed.success ? "ok" : "parse_failed",
    });
    log.info({ ...logBase, outcome: call.outcome, latency_ms: 0, replay: true });
    return { outcome: call.outcome, data: parsed.success ? parsed.data : null, call };
  }

  const budget = await budgetStatus(task);
  if (budget.exhausted) {
    const call = await writeCall(task, versionId, {
      request_sha256: requestSha256,
      response_sha256: NO_RESPONSE_SHA256,
      latency_ms: 0,
      input_tokens: 0,
      output_tokens: 0,
      outcome: "budget_exhausted",
    });
    log.warn({ ...logBase, outcome: "budget_exhausted", tokens_used: budget.tokens_used, day: budget.day });
    return { outcome: "budget_exhausted", data: null, call };
  }

  const body = buildRequestBody(task, envelope);
  let last: InvokeResult<T> | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const started = performance.now();
    const result = await callProvider(task, body);
    const latencyMs = Math.round(performance.now() - started);

    if (result.kind !== "ok") {
      const outcome: InvokeOutcome = result.kind === "timeout" ? "timeout" : "provider_error";
      const call = await writeCall(task, versionId, {
        request_sha256: requestSha256,
        response_sha256: NO_RESPONSE_SHA256,
        latency_ms: latencyMs,
        input_tokens: 0,
        output_tokens: 0,
        outcome,
      });
      const retryable = result.kind === "timeout" || result.retryable;
      log.warn({
        ...logBase,
        outcome,
        latency_ms: latencyMs,
        attempt,
        status: result.kind === "provider_error" ? result.status : null,
        retry: retryable && attempt <= MAX_RETRIES,
      });
      last = { outcome, data: null, call };
      if (!retryable || attempt > MAX_RETRIES) break;
      await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1] ?? 0);
      continue;
    }

    let parsedJson: unknown;
    let parsedOk = false;
    try {
      parsedJson = JSON.parse(stripJsonFence(result.content));
      parsedOk = true;
    } catch {
      parsedJson = null;
    }
    const validated = parsedOk ? outputSchema.safeParse(parsedJson) : null;
    const ok = validated?.success === true;
    const call = await writeCall(task, versionId, {
      request_sha256: requestSha256,
      response_sha256: ok ? sha256Hex(canonicalJson(validated.data)) : sha256Hex(result.content),
      latency_ms: latencyMs,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      outcome: ok ? "ok" : "parse_failed",
    });
    log.info({
      ...logBase,
      outcome: call.outcome,
      latency_ms: latencyMs,
      attempt,
      input_tokens: call.input_tokens,
      output_tokens: call.output_tokens,
    });
    if (ok && mode === "record" && options.case_id && parsedJson !== null && typeof parsedJson === "object") {
      record({
        case_id: options.case_id,
        task,
        envelope,
        request_sha256: requestSha256,
        response: parsedJson as Record<string, unknown>,
      });
    }
    return { outcome: call.outcome, data: ok ? validated.data : null, call };
  }
  if (!last) throw new Error("gateway: no attempt was made"); // unreachable: the loop runs at least once
  return last;
}

// The local embedding role (ADR-009), loaded on first use so a function that never embeds never loads the runtime.
export async function embed(texts: string[], kind: "query" | "passage"): Promise<number[][]> {
  const embedding = await import("./embedding");
  return embedding.embed(texts, kind);
}
