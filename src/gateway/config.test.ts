// The role table of blueprint 9.13 as configured (ARCHITECTURE 9.2, ADR-001 under D-05): one provider, one model id,
// the per-task effort, max_tokens, timeout and prompt file; every prompt version is the SHA-256 of the prompt file
// bytes; the AG-4 prompts differ from every authoring prompt by hash (AC-LOOP-06); gateway_config_sha256 is the hash
// of the canonical JSON of the whole table (AC-NFR-09).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GatewayRole } from "@/contracts/generated/gateway";
import { EMBEDDING_DIM } from "@/db/embedding";
import {
  BUDGETS,
  canonicalJson,
  CHAT_TASKS,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL,
  GATEWAY_CONFIG_SHA256,
  MODEL_ID,
  PRICE_USD_PER_1M_TOKENS,
  PROMPT_FILES,
  PROMPTS,
  PROMPTS_DIR,
  PROVIDER_BASE_URL,
  ROLE_TABLE,
  sha256Hex,
  spendIdr,
  TASKS,
  USD_IDR_RATE,
  type ChatTask,
} from "./config";

const AUTHORING: readonly ChatTask[] = ["AG-1", "AG-2", "AG-3"];
const HEX64 = /^[0-9a-f]{64}$/;

describe("the role table (9.13, ARCHITECTURE 9.2)", () => {
  it("every row parses against the GatewayRole contract", () => {
    for (const task of TASKS) expect(() => GatewayRole.parse(ROLE_TABLE[task])).not.toThrow();
    expect(TASKS).toEqual(["AG-1", "AG-2", "AG-3", "AG-4", "AG-4/redline", "embedding"]);
    expect(CHAT_TASKS).toEqual(["AG-1", "AG-2", "AG-3", "AG-4", "AG-4/redline"]);
  });

  it("runs every chat task on the one provider and the one model id, JSON mode, thinking on, temperature 0 (D-05)", () => {
    expect(PROVIDER_BASE_URL).toBe("https://api.z.ai/api/paas/v4");
    expect(MODEL_ID).toBe("glm-5.3-flash");
    for (const task of CHAT_TASKS) {
      expect(ROLE_TABLE[task]).toMatchObject({
        provider: "zai",
        base_url: PROVIDER_BASE_URL,
        model_id: MODEL_ID,
        api_style: "openai_chat",
        thinking: "always_on",
        response_format: "json_object",
        temperature: 0,
        prompt_version: PROMPTS[task].version,
        budget: BUDGETS[task],
      });
    }
  });

  it("pins the per-task effort, max_tokens and timeout of the ARCHITECTURE 9.2 table", () => {
    const row = (task: ChatTask) => {
      const { effort, max_tokens, timeout_ms } = ROLE_TABLE[task];
      return [effort, max_tokens, timeout_ms];
    };
    expect(row("AG-1")).toEqual(["high", 8192, 120_000]);
    expect(row("AG-2")).toEqual(["low", 2048, 20_000]);
    expect(row("AG-3")).toEqual(["high", 8192, 120_000]);
    expect(row("AG-4")).toEqual(["low", 2048, 20_000]);
    expect(row("AG-4/redline")).toEqual(["low", 2048, 60_000]);
    for (const task of TASKS) expect(ROLE_TABLE[task].timeout_ms).toBeLessThanOrEqual(300_000);
  });

  it("the two AG-4 tasks share the 9.13 role name AG-4 and its budget", () => {
    expect(ROLE_TABLE["AG-4"].role).toBe("AG-4");
    expect(ROLE_TABLE["AG-4/redline"].role).toBe("AG-4");
    expect(BUDGETS["AG-4/redline"]).toBe(BUDGETS["AG-4"]);
  });

  it("the embedding role is local, never metered, on the pinned model and dimension (ADR-009)", () => {
    expect(ROLE_TABLE.embedding).toMatchObject({
      role: "embedding",
      provider: "local_embedding",
      model_id: EMBEDDING_MODEL,
      api_style: "local_onnx",
      thinking: "n/a",
      effort: "n/a",
      response_format: "n/a",
      temperature: null,
      prompt_version: null,
      budget: { tokens_per_day: 0, spend_cap_idr_per_day: 0 },
    });
    expect(EMBEDDING_MODEL).toBe("Xenova/multilingual-e5-small");
    expect(EMBEDDING_DIMENSION).toBe(EMBEDDING_DIM);
  });
});

describe("prompt versions (9.16: every prompt is a versioned file)", () => {
  it("each version is the SHA-256 of the prompt file bytes under prompts/", () => {
    for (const task of CHAT_TASKS) {
      const bytes = readFileSync(path.join(PROMPTS_DIR, PROMPT_FILES[task]));
      expect(PROMPTS[task].file).toBe(PROMPT_FILES[task]);
      expect(PROMPTS[task].text).toBe(bytes.toString("utf8"));
      expect(PROMPTS[task].version).toBe(sha256Hex(bytes));
      expect(PROMPTS[task].version).toMatch(HEX64);
    }
  });

  it("the AG-4 verify and redline prompts differ from every authoring prompt and from each other (AC-LOOP-06)", () => {
    const authoring = AUTHORING.map((task) => PROMPTS[task].version);
    expect(authoring).not.toContain(PROMPTS["AG-4"].version);
    expect(authoring).not.toContain(PROMPTS["AG-4/redline"].version);
    expect(PROMPTS["AG-4"].version).not.toBe(PROMPTS["AG-4/redline"].version);
    expect(new Set(CHAT_TASKS.map((task) => PROMPTS[task].version)).size).toBe(CHAT_TASKS.length);
  });

  it("the verifier prompt never mentions a question and the redliner prompt declares no edit field", () => {
    expect(PROMPTS["AG-4"].text.toLowerCase()).not.toContain("question");
    expect(PROMPTS["AG-4"].text).toContain('{ "pairs": [');
    expect(PROMPTS["AG-4/redline"].text).toContain("You have no edit field");
  });
});

describe("hashes and prices", () => {
  it("gateway_config_sha256 is the SHA-256 of the canonical JSON of the whole table", () => {
    expect(GATEWAY_CONFIG_SHA256).toMatch(HEX64);
    expect(GATEWAY_CONFIG_SHA256).toBe(sha256Hex(canonicalJson(ROLE_TABLE)));
  });

  it("canonicalJson sorts keys recursively, inside arrays too, with no whitespace", () => {
    expect(canonicalJson({ b: [{ z: 1, a: null }], a: "x" })).toBe('{"a":"x","b":[{"a":null,"z":1}]}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("spendIdr prices input and output tokens at the recorded list prices and rate", () => {
    expect(spendIdr(1_000_000, 0)).toBeCloseTo(PRICE_USD_PER_1M_TOKENS.input * USD_IDR_RATE, 6);
    expect(spendIdr(0, 1_000_000)).toBeCloseTo(PRICE_USD_PER_1M_TOKENS.output * USD_IDR_RATE, 6);
    expect(spendIdr(0, 0)).toBe(0);
  });
});
