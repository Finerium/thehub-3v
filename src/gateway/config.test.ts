// The role table of blueprint 9.13 as configured (ARCHITECTURE 9.2, ADR-001 under D-05): one provider, one model id,
// the per-task effort, max_tokens, timeout and prompt file; every prompt version is the SHA-256 of the prompt file
// bytes; the AG-4 prompts differ from every authoring prompt by hash (AC-LOOP-06); gateway_config_sha256 is the hash
// of the canonical JSON of the whole table (AC-NFR-09).
//
// The AG-3 row is the one row sized from live runs rather than from the shape of its neighbours, and this file is
// where those numbers are held: its max_tokens and its timeout are what decide whether a draft ever completes
// inside the drafting route, so both are pinned here against the route's own ceiling (ADR-001 Records, ADR-004).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GatewayRole } from "@/contracts/generated/gateway";
import { EMBEDDING_DIM } from "@/db/embedding";
import { MAX_RETRIES, RETRY_BACKOFF_MS } from "./index";
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

  it("pins the per-task effort, max_tokens and timeout of the ADR-001 table", () => {
    const row = (task: ChatTask) => {
      const { effort, max_tokens, timeout_ms } = ROLE_TABLE[task];
      return [effort, max_tokens, timeout_ms];
    };
    expect(row("AG-1")).toEqual(["high", 8192, 120_000]);
    // AG-2 moved on 2026-09-07 with prompt v3 (ADR-001 Records): v3 writes one sentence per distinct fact over the
    // whole evidence list, so its reply is longer than the reply both of v2's ceilings were sized for. Measured over
    // the 372 ok AG-2 calls to that date: output 33 to 1102 tokens, latency 1.2 s to 19.4 s against a 20 s cut.
    // Truncation costs a whole round and a timeout costs three attempts; an unreached ceiling costs nothing.
    expect(row("AG-2")).toEqual(["low", 4096, 35_000]);
    // AG-3 moved on 2026-09-07 (ADR-001 Records): at 8192 three of four live replies stopped at exactly 8192
    // completion tokens, which is a truncated reply that does not parse, and the one complete two-round draft took
    // 352 s against a 300 s route. A complete reply measured 4284 to 6679 completion tokens, so 16384 is over twice
    // the largest of them; 75000 is the timeout the retry ladder below has to close with.
    expect(row("AG-3")).toEqual(["high", 16_384, 75_000]);
    expect(row("AG-4")).toEqual(["low", 2048, 20_000]);
    expect(row("AG-4/redline")).toEqual(["low", 2048, 60_000]);
    for (const task of TASKS) expect(ROLE_TABLE[task].timeout_ms).toBeLessThanOrEqual(300_000);
  });

  // The check that keeps a demo drafting at all. The gateway retries a timeout twice inside one logical call, so
  // one AG-3 call costs up to three timeouts plus the backoff whatever the drafting lane does about it, and all of
  // it runs inside the invocation POST /api/drafts declares. A timeout raised back toward 120000 fails here, which
  // is where it should fail, and not on a live cluster at 352 s.
  it("AG-3's whole retry ladder closes inside the drafting route's maxDuration (ADR-004)", () => {
    const route = readFileSync(path.join(process.cwd(), "src", "app", "api", "drafts", "route.ts"), "utf8");
    const declared = /export const maxDuration = (\d+)/.exec(route)?.[1];
    expect(declared, "POST /api/drafts declares its maxDuration").toBeDefined();
    const routeMs = Number(declared) * 1000;
    expect(routeMs).toBe(300_000); // Vercel Hobby's maximum, ARCHITECTURE 8.2

    const backoff = RETRY_BACKOFF_MS.reduce((a, b) => a + b, 0);
    const ladder = (MAX_RETRIES + 1) * ROLE_TABLE["AG-3"].timeout_ms + backoff;
    expect(ladder).toBe(227_500);
    expect(ladder).toBeLessThan(routeMs);
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

  it("AG-2 runs the composer prompt v3, whose hash is neither v2's nor v1's (the yield revision)", () => {
    expect(PROMPT_FILES["AG-2"]).toBe("AG-2/v3.md");
    const [v1, v2, v3] = ["v1", "v2", "v3"].map((v) => sha256Hex(readFileSync(path.join(PROMPTS_DIR, `AG-2/${v}.md`))));
    expect(ROLE_TABLE["AG-2"].prompt_version).toBe(v3);
    expect(ROLE_TABLE["AG-2"].prompt_version).not.toBe(v2);
    expect(ROLE_TABLE["AG-2"].prompt_version).not.toBe(v1);
    expect([v1, v2, v3].every((v) => HEX64.test(v))).toBe(true);
    expect(new Set([v1, v2, v3]).size).toBe(3);
    // v1 and v2 stay on disk as history and are named by no row: a version not in the table is in no hash.
    for (const task of CHAT_TASKS) expect([v1, v2]).not.toContain(PROMPTS[task].version);
    // What v3 adds over v2, and the three failure classes the golden run of 2026-09-07 measured it against: an
    // empty claims array over a non-empty evidence set (rank 3), one sentence per distinct fact rather than one
    // sentence for the whole answer, and the whole evidence list read rather than the first document that answers.
    expect(PROMPTS["AG-2"].text).toContain("prompt version 3");
    expect(PROMPTS["AG-2"].text).toContain("Never answer with nothing.");
    expect(PROMPTS["AG-2"].text).toContain("One sentence, one fact.");
    expect(PROMPTS["AG-2"].text).toContain("Cover the question across the whole evidence list");
    // v2's rules are kept, not replaced: a citation comes only from the evidence list, a typed fact may be stated
    // with its own span, and document metadata is never a claim (which is what put AG-4 in conflict under v1).
    expect(PROMPTS["AG-2"].text).toContain("Document metadata is never a claim.");
    expect(PROMPTS["AG-2"].text).toContain("Cite only span_ids that appear in the `evidence` list.");
  });

  // The ceiling the AG-2 row has to close inside, the way AG-3's ladder closes inside the drafting route. One
  // answer is at most composer, verify, repair, verify (MAX_COMPOSER_CALLS = 2 in src/answer/compose.ts), and all
  // of it runs inside the invocation POST /api/ask declares. A timeout raised further fails here, not on a live
  // question. The gateway's own retries are not counted: a retried timeout is one of them replacing the other.
  it("the answer lane's slow path closes inside the ask route's maxDuration (AC-NFR-04, ARCHITECTURE 8.2)", () => {
    const route = readFileSync(path.join(process.cwd(), "src", "app", "api", "ask", "route.ts"), "utf8");
    const declared = /export const maxDuration = (\d+)/.exec(route)?.[1];
    expect(declared, "POST /api/ask declares its maxDuration").toBeDefined();
    const routeMs = Number(declared) * 1000;
    const slowPath = 2 * ROLE_TABLE["AG-2"].timeout_ms + 2 * ROLE_TABLE["AG-4"].timeout_ms;
    expect(slowPath).toBe(110_000);
    expect(slowPath).toBeLessThan(routeMs);
  });

  it("AG-3 runs the drafter prompt v2, whose hash is not v1's and is not any other role's", () => {
    expect(PROMPT_FILES["AG-3"]).toBe("AG-3/v2.md");
    const v1 = sha256Hex(readFileSync(path.join(PROMPTS_DIR, "AG-3/v1.md")));
    const v2 = sha256Hex(readFileSync(path.join(PROMPTS_DIR, "AG-3/v2.md")));
    expect(ROLE_TABLE["AG-3"].prompt_version).toBe(v2);
    expect(ROLE_TABLE["AG-3"].prompt_version).not.toBe(v1);
    expect(v1).toMatch(HEX64);
    // v1 stays on disk as history and is named by no row: a version that is not in the table is not in any hash.
    for (const task of CHAT_TASKS) expect(PROMPTS[task].version).not.toBe(v1);
    const others = CHAT_TASKS.filter((task) => task !== "AG-3").map((task) => PROMPTS[task].version);
    expect(others).not.toContain(v2);
    // What v2 adds over v1 and why the row's max_tokens could be raised without the reply growing: the output
    // budget the six-section house template implies, and reading an approved lesson from its steps rather than
    // restating it, which is also what src/loop/evidence.ts sheds when the envelope is over budget (9.16 rule 5).
    expect(PROMPTS["AG-3"].text).toContain("## Output budget");
    expect(PROMPTS["AG-3"].text).toContain("Read what it teaches from `opl_steps`");
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
