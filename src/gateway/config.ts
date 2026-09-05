// The gateway role table (blueprint 9.13 GatewayRole, ARCHITECTURE 9.2, ADR-001 under D-05): one provider, one
// model id, one prompt file per task, effort per task, budgets per role. Every row is validated against the
// generated GatewayRole contract at module load, so a drift from 9.13 fails the first import, not a request.
// gateway_config_sha256 is the SHA-256 of the canonical JSON of the whole table and is stamped on every
// gateway_call row; prompt_version is the SHA-256 of the prompt file bytes, read once here.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AG1Input,
  AG2Input,
  AG3Input,
  AG4RedlineInput,
  AG4VerifyInput,
  GatewayRole,
} from "@/contracts/generated/gateway";
import { EMBEDDING_DIM } from "@/db/embedding";

export const PROVIDER_BASE_URL = "https://api.z.ai/api/paas/v4";
export const MODEL_ID = "glm-5.3-flash";
export const EMBEDDING_MODEL = "Xenova/multilingual-e5-small";
export const EMBEDDING_MAX_TOKENS = 512; // the model's position limit; the Python lane refuses longer texts too
export const MODELS_DIR = path.join(process.cwd(), "models");
export const PROMPTS_DIR = path.join(process.cwd(), "prompts");

// A task is one row of the table. AG-4 has two tasks (verify, redline) under the one 9.13 role name "AG-4"
// (ARCHITECTURE 13, decision 8): both write gateway_call.role = "AG-4" and share that role's budget.
export type Task = "AG-1" | "AG-2" | "AG-3" | "AG-4" | "AG-4/redline" | "embedding";
export type ChatTask = Exclude<Task, "embedding">;
export const CHAT_TASKS: readonly ChatTask[] = ["AG-1", "AG-2", "AG-3", "AG-4", "AG-4/redline"];
export const TASKS: readonly Task[] = [...CHAT_TASKS, "embedding"];

export const PROMPT_FILES: Record<ChatTask, string> = {
  "AG-1": "AG-1/v1.md",
  "AG-2": "AG-2/v1.md",
  "AG-3": "AG-3/v1.md",
  "AG-4": "AG-4/verify/v1.md",
  "AG-4/redline": "AG-4/redline/v1.md",
};

// The role input envelopes (9.16); invoke() parses the envelope against its task's schema before any call, so a
// field outside the contract (a question inside a verifier envelope, for one) is a thrown error, never a request.
export const INPUT_SCHEMAS = {
  "AG-1": AG1Input,
  "AG-2": AG2Input,
  "AG-3": AG3Input,
  "AG-4": AG4VerifyInput,
  "AG-4/redline": AG4RedlineInput,
} as const;

export function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Canonical JSON: keys sorted recursively, no whitespace; the form every request and response hash is taken over.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortKeys(source[key]);
    return out;
  }
  return value;
}

export type Prompt = { file: string; text: string; version: string };

function readPrompt(relative: string): Prompt {
  const file = path.join(PROMPTS_DIR, relative);
  const bytes = readFileSync(/*turbopackIgnore: true*/ file);
  return { file: relative, text: bytes.toString("utf8"), version: sha256Hex(bytes) };
}

export const PROMPTS: Record<ChatTask, Prompt> = {
  "AG-1": readPrompt(PROMPT_FILES["AG-1"]),
  "AG-2": readPrompt(PROMPT_FILES["AG-2"]),
  "AG-3": readPrompt(PROMPT_FILES["AG-3"]),
  "AG-4": readPrompt(PROMPT_FILES["AG-4"]),
  "AG-4/redline": readPrompt(PROMPT_FILES["AG-4/redline"]),
};

// ---------------------------------------------------------------------------------------------------------------
// Prices and budgets (ARCHITECTURE 9.3). The prices are the provider's published list prices for glm-5.3-flash,
// read from https://docs.z.ai/guides/overview/pricing on 2026-09-05 (ADR-001 Records); a promotion at half these
// prices runs until 2026-09-09 24:00 UTC+8 and is not relied on. The spend estimate charges every input token at
// the uncached price (gateway_call does not separate cached tokens), so it over-estimates, never under.
// The budgets are configuration policy per role, not measurements; the Admin surface shows them as read from here.
// ---------------------------------------------------------------------------------------------------------------
export const PRICE_SOURCE = { url: "https://docs.z.ai/guides/overview/pricing", read_on: "2026-09-05" } as const;
export const PRICE_USD_PER_1M_TOKENS = { input: 0.15, cached_input: 0.03, output: 0.5 } as const;
export const PROMOTION_USD_PER_1M_TOKENS = {
  input: 0.075,
  cached_input: 0.015,
  output: 0.25,
  ends_at: "2026-09-09T16:00:00Z",
} as const;
export const USD_IDR_RATE_SOURCE = {
  url: "https://open.er-api.com/v6/latest/USD",
  as_of: "2026-09-04T00:02:31Z",
} as const;
export const USD_IDR_RATE = 17656.567526;

export function spendIdr(inputTokens: number, outputTokens: number): number {
  const usd =
    (inputTokens * PRICE_USD_PER_1M_TOKENS.input + outputTokens * PRICE_USD_PER_1M_TOKENS.output) / 1_000_000;
  return usd * USD_IDR_RATE;
}

export type Budget = { tokens_per_day: number; spend_cap_idr_per_day: number };
const AG4_BUDGET: Budget = { tokens_per_day: 3_000_000, spend_cap_idr_per_day: 20_000 }; // shared by both AG-4 tasks
export const BUDGETS: Record<Task, Budget> = {
  "AG-1": { tokens_per_day: 20_000_000, spend_cap_idr_per_day: 150_000 }, // the build-time extraction pass
  "AG-2": { tokens_per_day: 3_000_000, spend_cap_idr_per_day: 20_000 },
  "AG-3": { tokens_per_day: 3_000_000, spend_cap_idr_per_day: 20_000 },
  "AG-4": AG4_BUDGET,
  "AG-4/redline": AG4_BUDGET,
  embedding: { tokens_per_day: 0, spend_cap_idr_per_day: 0 }, // local, no provider, never metered
};

// ---------------------------------------------------------------------------------------------------------------
// The table. RoleConfig spells 9.13 GatewayRole explicitly (the generated Zod type collapses through its
// conditional branches, so the object is typed here and parsed there).
// ---------------------------------------------------------------------------------------------------------------
export type RoleConfig = {
  role: "AG-1" | "AG-2" | "AG-3" | "AG-4" | "embedding";
  provider: "zai" | "local_embedding";
  base_url: string;
  model_id: string;
  api_style: "openai_chat" | "openai_embeddings" | "local_onnx";
  thinking: "always_on" | "n/a";
  effort: "low" | "high" | "max" | "n/a";
  response_format: "json_object" | "n/a";
  temperature: number | null;
  max_tokens: number;
  timeout_ms: number;
  prompt_version: string | null;
  budget: Budget;
};

const ZAI_CHAT = {
  provider: "zai",
  base_url: PROVIDER_BASE_URL,
  model_id: MODEL_ID,
  api_style: "openai_chat",
  thinking: "always_on",
  response_format: "json_object",
  temperature: 0,
} as const;

export const ROLE_TABLE: Record<Task, RoleConfig> = {
  "AG-1": {
    role: "AG-1",
    ...ZAI_CHAT,
    effort: "high",
    max_tokens: 8192,
    timeout_ms: 120_000,
    prompt_version: PROMPTS["AG-1"].version,
    budget: BUDGETS["AG-1"],
  },
  "AG-2": {
    role: "AG-2",
    ...ZAI_CHAT,
    effort: "low",
    max_tokens: 2048,
    timeout_ms: 20_000,
    prompt_version: PROMPTS["AG-2"].version,
    budget: BUDGETS["AG-2"],
  },
  "AG-3": {
    role: "AG-3",
    ...ZAI_CHAT,
    effort: "high",
    max_tokens: 8192,
    timeout_ms: 120_000,
    prompt_version: PROMPTS["AG-3"].version,
    budget: BUDGETS["AG-3"],
  },
  "AG-4": {
    role: "AG-4",
    ...ZAI_CHAT,
    effort: "low",
    max_tokens: 2048,
    timeout_ms: 20_000,
    prompt_version: PROMPTS["AG-4"].version,
    budget: BUDGETS["AG-4"],
  },
  "AG-4/redline": {
    role: "AG-4",
    ...ZAI_CHAT,
    effort: "low",
    max_tokens: 2048,
    timeout_ms: 60_000,
    prompt_version: PROMPTS["AG-4/redline"].version,
    budget: BUDGETS["AG-4/redline"],
  },
  embedding: {
    role: "embedding",
    provider: "local_embedding",
    base_url: path.join(MODELS_DIR, EMBEDDING_MODEL), // loaded from disk; no URL exists for this role (ADR-009)
    model_id: EMBEDDING_MODEL,
    api_style: "local_onnx",
    thinking: "n/a",
    effort: "n/a",
    response_format: "n/a",
    temperature: null,
    max_tokens: EMBEDDING_MAX_TOKENS,
    timeout_ms: 5_000,
    prompt_version: null,
    budget: BUDGETS.embedding,
  },
};

for (const task of TASKS) GatewayRole.parse(ROLE_TABLE[task]); // the contract check at load (9.13)

export const GATEWAY_CONFIG_SHA256 = sha256Hex(canonicalJson(ROLE_TABLE));

// The pinned dimension travels with the table so a consumer of the config never needs a second import.
export const EMBEDDING_DIMENSION: number = EMBEDDING_DIM;
