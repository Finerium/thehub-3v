// The one fetch toward the provider (INV-4, AC-NFR-10, AC-NFR-19): the request shape of ARCHITECTURE 9.1 (prompt file
// as the system message, the envelope as canonical JSON in the user message, JSON mode, explicit effort, temperature
// 0, the task's max_tokens, an AbortSignal timeout, the key from the environment at call time), and every attempt
// outcome: ok with usage, timeout, 429 and 5xx retryable, other 4xx not, transport failure retryable only when
// nothing was received, a body that is not the completion shape not retryable. fetch is a spy; nothing leaves.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { canonicalJson, PROMPTS, ROLE_TABLE } from "./config";
import { buildRequestBody, callProvider, stripJsonFence, ZAI_API_KEY_NAME } from "./provider";

const keyAtStart = process.env[ZAI_API_KEY_NAME];
const ENVELOPE = { pairs: [{ sentence_id: "s1", sentence: "x", spans: [{ span_id: "sp1", text: "x" }] }] };

function completion(content: string | null, usage?: { prompt_tokens: number; completion_tokens: number }) {
  return new Response(JSON.stringify({ id: "c1", choices: [{ index: 0, message: { role: "assistant", content } }], usage }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeAll(() => {
  process.env[ZAI_API_KEY_NAME] = "test";
});

afterAll(() => {
  if (keyAtStart === undefined) delete process.env[ZAI_API_KEY_NAME];
  else process.env[ZAI_API_KEY_NAME] = keyAtStart;
});

describe("buildRequestBody", () => {
  it("puts the prompt file in the system message and the envelope as canonical JSON in the user message, nothing concatenated", () => {
    const body = buildRequestBody("AG-4", ENVELOPE);
    expect(body).toEqual({
      model: "glm-5.3-flash",
      messages: [
        { role: "system", content: PROMPTS["AG-4"].text },
        { role: "user", content: canonicalJson(ENVELOPE) },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "enabled" },
      reasoning_effort: "low",
      temperature: 0,
      max_tokens: 2048,
      stream: false,
    });
    expect(JSON.parse(body.messages[1].content)).toEqual(ENVELOPE);
  });

  it("takes effort and max_tokens from the task's row", () => {
    const body = buildRequestBody("AG-3", { cluster: {} });
    expect([body.reasoning_effort, body.max_tokens]).toEqual([ROLE_TABLE["AG-3"].effort, ROLE_TABLE["AG-3"].max_tokens]);
  });
});

describe("callProvider", () => {
  const body = buildRequestBody("AG-2", ENVELOPE);
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    process.env[ZAI_API_KEY_NAME] = "test";
  });

  it("posts to <base_url>/chat/completions with the bearer key, a JSON body and a timeout signal", async () => {
    fetchSpy.mockResolvedValueOnce(completion("{}", { prompt_tokens: 10, completion_tokens: 2 }));
    const result = await callProvider("AG-2", body);
    expect(result).toEqual({ kind: "ok", content: "{}", input_tokens: 10, output_tokens: 2 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${ROLE_TABLE["AG-2"].base_url}/chat/completions`);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json", authorization: "Bearer test" });
    expect(JSON.parse(String(init?.body))).toEqual(body);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws before any fetch when the key is not set", async () => {
    delete process.env[ZAI_API_KEY_NAME];
    await expect(callProvider("AG-2", body)).rejects.toThrow(`${ZAI_API_KEY_NAME} is not set`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads an empty content and a missing usage as empty and zero", async () => {
    fetchSpy.mockResolvedValueOnce(completion(null));
    expect(await callProvider("AG-2", body)).toEqual({ kind: "ok", content: "", input_tokens: 0, output_tokens: 0 });
  });

  it.each([
    ["TimeoutError", "timed out"],
    ["AbortError", "aborted"],
  ])("a %s from the signal is a timeout", async (name, message) => {
    fetchSpy.mockRejectedValueOnce(new DOMException(message, name));
    expect(await callProvider("AG-2", body)).toEqual({ kind: "timeout" });
  });

  it.each([
    [429, true],
    [500, true],
    [502, true],
    [503, true],
    [400, false],
    [401, false],
    [404, false],
    [422, false],
  ])("HTTP %i is a provider_error, retryable %s", async (status, retryable) => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status }));
    expect(await callProvider("AG-2", body)).toEqual({ kind: "provider_error", status, retryable });
  });

  it("a transport failure with nothing received is retryable", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await callProvider("AG-2", body)).toEqual({ kind: "provider_error", status: null, retryable: true });
  });

  it("a 200 whose body is not JSON, or not a completion, is a provider_error that is not retried", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    expect(await callProvider("AG-2", body)).toEqual({ kind: "provider_error", status: 200, retryable: false });
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    expect(await callProvider("AG-2", body)).toEqual({ kind: "provider_error", status: 200, retryable: false });
  });
});

describe("stripJsonFence", () => {
  it("removes a markdown fence with or without the json tag and leaves bare content alone", () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFence('  {"a":1}  ')).toBe('{"a":1}');
    expect(stripJsonFence("not json")).toBe("not json");
  });
});
