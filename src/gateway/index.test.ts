// invoke() (INV-4, ARCHITECTURE 9, blueprint 9.13 and 9.16; AC-NFR-09, AC-NFR-19, AC-LOOP-06): the envelope is
// parsed against its task's contract before anything leaves the process; a parse or schema failure of the reply is
// outcome parse_failed with the caller's rule left to the caller; a timeout, a 429 or a 5xx retries with 500 ms then
// 2000 ms backoff at most twice with one gateway_call row per attempt; any other 4xx does not retry; the budget check
// answers budget_exhausted without a fetch; every row carries model_id, prompt_version, gateway_config_sha256 and
// corpus_version_id; a verify envelope never carries a question; a recording replays on a hash match and throws on a
// mismatch naming both hashes. Hermetic: fetch is a spy, the database is the fake client, timers are fake.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AG2Output, AG4VerifyOutput } from "@/contracts/generated/gateway";
import { gatewayCall } from "@/db/schema";
import { argOf, queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";
import { canonicalJson, sha256Hex } from "./config";
import { ZAI_API_KEY_NAME } from "./provider";
import { quoteHash } from "./record";
import {
  CHAT_TASKS,
  GATEWAY_CONFIG_SHA256,
  invoke,
  MAX_RETRIES,
  MODEL_ID,
  PROMPTS,
  ReplayMismatchError,
  RETRY_BACKOFF_MS,
  ROLE_TABLE,
} from "./index";

const keyAtStart = process.env[ZAI_API_KEY_NAME];
const ACTIVE = [{ id: "cv-1", label: "v1" }];
const NO_SPEND = [{ input: 0, output: 0 }];

const AG2_ENVELOPE = {
  question: "why did GA-1201A trip on VSHH-1201?",
  template: null,
  scope: { tags: ["GA-1201A"] },
  evidence: [],
  typed_facts: [],
  repair: null,
};
const AG2_REPLY = { claims: [{ text: "GA-1201A tripped on VSHH-1201.", span_ids: ["sp-1"] }], gaps: [], suggested_outcome: "answer" };
const SPAN_TEXT = "GA-1201A tripped on VSHH-1201 at 7.1 mm/s.";
const AG4_ENVELOPE = {
  pairs: [{ sentence_id: "s1", sentence: "GA-1201A tripped on VSHH-1201.", spans: [{ span_id: "sp-1", text: SPAN_TEXT }] }],
};
const AG4_REPLY = { verdicts: [{ sentence_id: "s1", verdict: "entailed", span_id: "sp-1", reason: "The span states the trip." }] };

function completion(content: string, usage = { prompt_tokens: 120, completion_tokens: 30 }): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const httpStatus = (status: number) => new Response("", { status });
const timeoutError = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");
const spyFetch = () => vi.spyOn(globalThis, "fetch");
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

type Row = Record<string, unknown>;
const rows = (): Row[] =>
  statements.filter((s) => s[0]?.method === "insert" && s[0].args[0] === gatewayCall).map((s) => argOf(s, "values") as Row);

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) keysDeep(v, out);
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

beforeAll(() => {
  process.env[ZAI_API_KEY_NAME] = "test";
});

afterAll(() => {
  if (keyAtStart === undefined) delete process.env[ZAI_API_KEY_NAME];
  else process.env[ZAI_API_KEY_NAME] = keyAtStart;
});

beforeEach(() => {
  resetFakeDb();
  queueResult(ACTIVE); // the active corpus version the call binds to
  queueResult(NO_SPEND); // today's tokens of the role
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a call that succeeds", () => {
  it("posts the prompt and the envelope as data, validates the reply and writes one ok row with the four reproducibility fields (AC-NFR-09)", async () => {
    const fetchSpy = spyFetch().mockResolvedValueOnce(completion(JSON.stringify(AG2_REPLY)));
    const result = await invoke("AG-2", AG2_ENVELOPE, AG2Output);

    expect(result.outcome).toBe("ok");
    expect(result.data).toEqual(AG2_REPLY);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${ROLE_TABLE["AG-2"].base_url}/chat/completions`);
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> } & Row;
    expect(body.messages).toEqual([
      { role: "system", content: PROMPTS["AG-2"].text },
      { role: "user", content: canonicalJson(AG2_ENVELOPE) },
    ]);
    expect(body).toMatchObject({
      model: MODEL_ID,
      response_format: { type: "json_object" },
      thinking: { type: "enabled" },
      reasoning_effort: "low",
      temperature: 0,
      max_tokens: 2048,
      stream: false,
    });
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test");
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    const written = rows();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      role: "AG-2",
      requestSha256: sha256Hex(canonicalJson(AG2_ENVELOPE)),
      responseSha256: sha256Hex(canonicalJson(AG2_REPLY)),
      modelId: MODEL_ID,
      promptVersion: PROMPTS["AG-2"].version,
      gatewayConfigSha256: GATEWAY_CONFIG_SHA256,
      corpusVersionId: "cv-1",
      inputTokens: 120,
      outputTokens: 30,
      outcome: "ok",
    });
    expect(typeof written[0].id).toBe("string");
    expect(result.call).toEqual({
      role: "AG-2",
      request_sha256: sha256Hex(canonicalJson(AG2_ENVELOPE)),
      response_sha256: sha256Hex(canonicalJson(AG2_REPLY)),
      model_id: MODEL_ID,
      prompt_version: PROMPTS["AG-2"].version,
      gateway_config_sha256: GATEWAY_CONFIG_SHA256,
      corpus_version_id: "cv-1",
      latency_ms: expect.any(Number),
      input_tokens: 120,
      output_tokens: 30,
      outcome: "ok",
    });
  });

  it("tolerates a fenced JSON reply", async () => {
    spyFetch().mockResolvedValueOnce(completion("```json\n" + JSON.stringify(AG2_REPLY) + "\n```"));
    const result = await invoke("AG-2", AG2_ENVELOPE, AG2Output);
    expect([result.outcome, result.data]).toEqual(["ok", AG2_REPLY]);
  });

  it("throws before any fetch when no corpus version is active", async () => {
    resetFakeDb();
    queueResult([]);
    const fetchSpy = spyFetch();
    await expect(invoke("AG-2", AG2_ENVELOPE, AG2Output)).rejects.toThrow("no active corpus version");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });
});

describe("a reply that does not parse", () => {
  it.each([
    ["text that is not JSON", "the SEQ-1201 trip was healthy"],
    ["JSON outside the output contract", JSON.stringify({ claims: "none" })],
  ])("%s is outcome parse_failed, not retried, not thrown: the caller's rule applies", async (_name, content) => {
    const fetchSpy = spyFetch().mockResolvedValueOnce(completion(content));
    const result = await invoke("AG-2", AG2_ENVELOPE, AG2Output);
    expect(result.outcome).toBe("parse_failed");
    expect(result.data).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(rows().map((r) => r.outcome)).toEqual(["parse_failed"]);
    expect(rows()[0]).toMatchObject({ responseSha256: sha256Hex(content), inputTokens: 120, outputTokens: 30 });
  });
});

describe("retries (AC-NFR-19)", () => {
  it("pins the policy: at most two retries, 500 ms then 2000 ms", () => {
    expect(MAX_RETRIES).toBe(2);
    expect([...RETRY_BACKOFF_MS]).toEqual([500, 2000]);
  });

  it("a timeout retries after 500 ms and again after 2000 ms, then stops: three timeout rows, one per attempt", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchSpy = spyFetch().mockImplementation(() => Promise.reject(timeoutError()));
    const pending = invoke("AG-2", AG2_ENVELOPE, AG2Output);

    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const result = await pending;
    expect([result.outcome, result.data]).toEqual(["timeout", null]);
    expect(vi.getTimerCount()).toBe(0);
    const written = rows();
    expect(written.map((r) => r.outcome)).toEqual(["timeout", "timeout", "timeout"]);
    for (const row of written) {
      expect(row).toMatchObject({
        role: "AG-2",
        modelId: MODEL_ID,
        promptVersion: PROMPTS["AG-2"].version,
        gatewayConfigSha256: GATEWAY_CONFIG_SHA256,
        corpusVersionId: "cv-1",
        responseSha256: sha256Hex(""),
        inputTokens: 0,
        outputTokens: 0,
      });
    }
  });

  it.each([429, 500, 503])("HTTP %i retries: three attempts, three provider_error rows", async (status) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchSpy = spyFetch().mockImplementation(() => Promise.resolve(httpStatus(status)));
    const pending = invoke("AG-2", AG2_ENVELOPE, AG2Output);
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    const result = await pending;
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result.outcome).toBe("provider_error");
    expect(rows().map((r) => r.outcome)).toEqual(["provider_error", "provider_error", "provider_error"]);
  });

  it.each([400, 401, 404, 422])("HTTP %i does not retry: one attempt, one provider_error row, no throw", async (status) => {
    const fetchSpy = spyFetch().mockResolvedValueOnce(httpStatus(status));
    const result = await invoke("AG-2", AG2_ENVELOPE, AG2Output);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect([result.outcome, result.data]).toEqual(["provider_error", null]);
    expect(rows().map((r) => r.outcome)).toEqual(["provider_error"]);
  });

  it("a retry that succeeds is one logical call: a provider_error row then the ok row", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchSpy = spyFetch()
      .mockResolvedValueOnce(httpStatus(503))
      .mockResolvedValueOnce(completion(JSON.stringify(AG2_REPLY)));
    const pending = invoke("AG-2", AG2_ENVELOPE, AG2Output);
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    const result = await pending;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect([result.outcome, result.data]).toEqual(["ok", AG2_REPLY]);
    expect(rows().map((r) => r.outcome)).toEqual(["provider_error", "ok"]);
  });
});

describe("the daily budget (ARCHITECTURE 9.3, AC-ANS-20)", () => {
  it("returns budget_exhausted without a fetch when today's tokens reach the role's constant, writing one row", async () => {
    resetFakeDb();
    queueResult(ACTIVE);
    queueResult([{ input: ROLE_TABLE["AG-2"].budget.tokens_per_day, output: 0 }]);
    const fetchSpy = spyFetch();
    const result = await invoke("AG-2", AG2_ENVELOPE, AG2Output);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect([result.outcome, result.data]).toEqual(["budget_exhausted", null]);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      outcome: "budget_exhausted",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      responseSha256: sha256Hex(""),
      modelId: MODEL_ID,
      promptVersion: PROMPTS["AG-2"].version,
      gatewayConfigSha256: GATEWAY_CONFIG_SHA256,
      corpusVersionId: "cv-1",
    });
  });

  it("calls the provider one token below the constant", async () => {
    resetFakeDb();
    queueResult(ACTIVE);
    queueResult([{ input: ROLE_TABLE["AG-2"].budget.tokens_per_day - 1, output: 0 }]);
    const fetchSpy = spyFetch().mockResolvedValueOnce(completion(JSON.stringify(AG2_REPLY)));
    expect((await invoke("AG-2", AG2_ENVELOPE, AG2Output)).outcome).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("AG-4 is question-blind (AC-LOOP-06, 9.16)", () => {
  it("a verify envelope that carries a question is refused by the contract before any fetch or row", async () => {
    const fetchSpy = spyFetch();
    await expect(invoke("AG-4", { ...AG4_ENVELOPE, question: "why did it trip?" }, AG4VerifyOutput)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(statements).toHaveLength(0);
  });

  it("the request sent for a verify call is the pairs envelope under the verifier prompt, with no question key at any depth", async () => {
    const fetchSpy = spyFetch().mockResolvedValueOnce(completion(JSON.stringify(AG4_REPLY)));
    const result = await invoke("AG-4", AG4_ENVELOPE, AG4VerifyOutput);
    expect([result.outcome, result.data]).toEqual(["ok", AG4_REPLY]);
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[0].content).toBe(PROMPTS["AG-4"].text);
    const user: unknown = JSON.parse(body.messages[1].content);
    expect(user).toEqual(AG4_ENVELOPE);
    expect(keysDeep(user)).not.toContain("question");
    expect(rows()[0]).toMatchObject({ role: "AG-4", promptVersion: PROMPTS["AG-4"].version });
  });

  it("the AG-4 prompts differ from every authoring prompt by hash", () => {
    const authoring = (["AG-1", "AG-2", "AG-3"] as const).map((task) => PROMPTS[task].version);
    expect(authoring).not.toContain(PROMPTS["AG-4"].version);
    expect(authoring).not.toContain(PROMPTS["AG-4/redline"].version);
    expect(new Set(CHAT_TASKS.map((task) => PROMPTS[task].version)).size).toBe(CHAT_TASKS.length);
  });
});

describe("recorded replay (9.16, ARCHITECTURE 9.4)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "thehub-gateway-recordings-"));
    process.env.RECORD_DIR = dir;
    delete process.env.RECORD_MODE;
  });

  afterEach(() => {
    delete process.env.RECORD_DIR;
    delete process.env.RECORD_MODE;
    rmSync(dir, { recursive: true, force: true });
  });

  it("records an ok verify call without the question and without corpus text, then replays it on a hash match and refuses a mismatch naming both hashes", async () => {
    const fetchSpy = spyFetch().mockResolvedValueOnce(completion(JSON.stringify(AG4_REPLY)));
    const recorded = await invoke("AG-4", AG4_ENVELOPE, AG4VerifyOutput, { case_id: "GS-01" });
    expect(recorded.outcome).toBe("ok");
    const file = path.join(dir, "GS-01", "AG-4.json");
    const text = readFileSync(file, "utf8");
    const recording = JSON.parse(text) as { request_sha256: string; request: unknown; response: unknown };
    expect(recording).toMatchObject({
      request_sha256: sha256Hex(canonicalJson(AG4_ENVELOPE)),
      model_id: MODEL_ID,
      prompt_version: PROMPTS["AG-4"].version,
      response: AG4_REPLY,
    });
    expect(recording.request).toEqual({
      pairs: [{ sentence_id: "s1", sentence: "GA-1201A tripped on VSHH-1201.", spans: [{ span_id: "sp-1", text: { span_id: "sp-1", quote_hash: quoteHash(SPAN_TEXT) } }] }],
    });
    expect(keysDeep(recording)).not.toContain("question");
    expect(text).not.toContain(SPAN_TEXT);

    process.env.RECORD_MODE = "replay";
    resetFakeDb();
    queueResult(ACTIVE);
    const replayed = await invoke("AG-4", AG4_ENVELOPE, AG4VerifyOutput, { case_id: "GS-01" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect([replayed.outcome, replayed.data]).toEqual(["ok", AG4_REPLY]);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ outcome: "ok", latencyMs: 0, inputTokens: 0, outputTokens: 0, corpusVersionId: "cv-1", responseSha256: sha256Hex(canonicalJson(AG4_REPLY)) });

    resetFakeDb();
    queueResult(ACTIVE);
    const other = { pairs: [{ ...AG4_ENVELOPE.pairs[0], sentence: "GA-1201A never tripped." }] };
    const thrown: unknown = await invoke("AG-4", other, AG4VerifyOutput, { case_id: "GS-01" }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(ReplayMismatchError);
    const mismatch = thrown as ReplayMismatchError;
    expect(mismatch.recomputed_sha256).toBe(sha256Hex(canonicalJson(other)));
    expect(mismatch.recorded_sha256).toEqual([recording.request_sha256]);
    expect(mismatch.message).toContain(mismatch.recomputed_sha256);
    expect(mismatch.message).toContain(recording.request_sha256);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(0);
  });

  it("records nothing without a case id, and nothing for a reply that failed to parse", async () => {
    const fetchSpy = spyFetch().mockResolvedValueOnce(completion(JSON.stringify(AG4_REPLY))).mockResolvedValueOnce(completion("not json"));
    await invoke("AG-4", AG4_ENVELOPE, AG4VerifyOutput);
    resetFakeDb();
    queueResult(ACTIVE);
    queueResult(NO_SPEND);
    expect((await invoke("AG-4", AG4_ENVELOPE, AG4VerifyOutput, { case_id: "GS-02" })).outcome).toBe("parse_failed");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(() => readFileSync(path.join(dir, "GS-02", "AG-4.json"))).toThrow();
  });
});
