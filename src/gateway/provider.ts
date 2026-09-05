// The only fetch toward a provider in the repository (INV-4, AC-NFR-10; scripts/audits/provider-egress.sh asserts
// it). One request shape for every chat task: the prompt file is the system message, the envelope is the user
// message as canonical JSON text, nothing is concatenated into an instruction (AC-ANS-18). JSON mode, explicit
// reasoning effort (GLM reasoning cannot be switched off, ADR-001), temperature 0, the task's max_tokens and an
// AbortSignal timeout. The key is read from the environment at call time and never logged or returned.
import { z } from "zod";
import { PROMPTS, ROLE_TABLE, canonicalJson, type ChatTask } from "./config";

export const ZAI_API_KEY_NAME = "ZAI_API_KEY";

export type ChatRequestBody = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format: { type: "json_object" };
  thinking: { type: "enabled" };
  reasoning_effort: "low" | "high" | "max";
  temperature: number;
  max_tokens: number;
  stream: false;
};

export function buildRequestBody(task: ChatTask, envelope: Record<string, unknown>): ChatRequestBody {
  const cfg = ROLE_TABLE[task];
  if (cfg.effort === "n/a" || cfg.temperature === null) throw new Error(`${task} is not a chat task`);
  return {
    model: cfg.model_id,
    messages: [
      { role: "system", content: PROMPTS[task].text },
      { role: "user", content: canonicalJson(envelope) },
    ],
    response_format: { type: "json_object" },
    thinking: { type: "enabled" },
    reasoning_effort: cfg.effort,
    temperature: cfg.temperature,
    max_tokens: cfg.max_tokens,
    stream: false,
  };
}

// The OpenAI-compatible completion, loosely: only the fields the gateway reads are named.
const ChatCompletion = z
  .object({
    choices: z
      .array(z.object({ message: z.object({ content: z.string().nullable().optional() }).loose() }).loose())
      .min(1),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative(),
        completion_tokens: z.number().int().nonnegative(),
      })
      .loose()
      .optional(),
  })
  .loose();

export type ProviderAttempt =
  | { kind: "ok"; content: string; input_tokens: number; output_tokens: number }
  | { kind: "timeout" }
  | { kind: "provider_error"; status: number | null; retryable: boolean };

export async function callProvider(task: ChatTask, body: ChatRequestBody): Promise<ProviderAttempt> {
  const key = process.env[ZAI_API_KEY_NAME];
  if (!key) throw new Error(`${ZAI_API_KEY_NAME} is not set`);
  const cfg = ROLE_TABLE[task];
  let status: number | null = null;
  let json: unknown;
  try {
    const response = await fetch(`${cfg.base_url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeout_ms),
    });
    status = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      return { kind: "provider_error", status, retryable: status === 429 || status >= 500 };
    }
    json = await response.json();
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { kind: "timeout" };
    }
    // a transport failure or a body that is not JSON; retryable only when nothing was received
    return { kind: "provider_error", status, retryable: status === null };
  }
  const parsed = ChatCompletion.safeParse(json);
  if (!parsed.success) return { kind: "provider_error", status, retryable: false };
  return {
    kind: "ok",
    content: parsed.data.choices[0]?.message.content ?? "",
    input_tokens: parsed.data.usage?.prompt_tokens ?? 0,
    output_tokens: parsed.data.usage?.completion_tokens ?? 0,
  };
}

// JSON mode returns a bare object; a fenced block is tolerated because the fence is not content.
export function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match?.[1] ?? trimmed;
}
