// The designed API error states of blueprint 6.3 as JSON (ARCHITECTURE 3.4, 7, 9.3): one body shape
// { error, request_id, ...fields }, codes and fields only, the request id on the body and the header. The 429 of
// AC-NFR-11 names the limit and the reset moment and carries retry-after in whole seconds, never below one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExhausted, Forbidden, HashMismatch, HttpError, NotFound, RateLimited } from "./errors";

const NOW = new Date("2026-09-05T08:00:30.000Z");
const RESETS_AT = new Date("2026-09-05T08:01:00.000Z");

async function rendered(error: HttpError, requestId = "req-1") {
  const res = error.toResponse(requestId);
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HttpError", () => {
  it("renders { error, request_id, ...fields } with the status, x-request-id and any extra header, and no prose", async () => {
    const res = await rendered(new HttpError(418, "teapot", { cups: 2 }, { "x-extra": "yes" }), "req-t");
    expect(res.status).toBe(418);
    expect(res.headers["x-request-id"]).toBe("req-t");
    expect(res.headers["x-extra"]).toBe("yes");
    expect(res.body).toEqual({ error: "teapot", request_id: "req-t", cups: 2 });
  });

  it("is an Error named after its class, with the code as message", () => {
    const error = new NotFound("draft", "d-1");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.name).toBe("NotFound");
    expect(error.message).toBe("not_found");
  });
});

describe("RateLimited (the designed 429, 9.9, AC-NFR-11)", () => {
  it("names the scope, the limit and the reset moment, and carries retry-after in whole seconds until then", async () => {
    const res = await rendered(new RateLimited("ask", 30, RESETS_AT), "req-429");
    expect(res.status).toBe(429);
    expect(res.headers["x-request-id"]).toBe("req-429");
    expect(res.headers["retry-after"]).toBe("30");
    expect(res.body).toEqual({
      error: "rate_limited",
      request_id: "req-429",
      scope: "ask",
      limit: 30,
      resets_at: "2026-09-05T08:01:00.000Z",
    });
  });

  it("rounds retry-after up and never below one second, even when the window has already turned", async () => {
    vi.setSystemTime(new Date("2026-09-05T08:00:59.100Z"));
    expect((await rendered(new RateLimited("addr", 120, RESETS_AT))).headers["retry-after"]).toBe("1");
    vi.setSystemTime(new Date("2026-09-05T08:01:05.000Z"));
    expect((await rendered(new RateLimited("draft", 5, RESETS_AT))).headers["retry-after"]).toBe("1");
  });
});

describe("the other designed states", () => {
  it("BudgetExhausted is a 429 naming the role, its budget and the next UTC day", async () => {
    const budget = { tokens_per_day: 100_000, spend_cap_idr_per_day: 50_000 };
    const res = await rendered(new BudgetExhausted("AG-2", budget, RESETS_AT));
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "budget_exhausted", request_id: "req-1", role: "AG-2", budget, resets_at: RESETS_AT.toISOString() });
    expect(res.headers["retry-after"]).toBeUndefined();
  });

  it("Forbidden is a 403 with an optional reason", async () => {
    expect((await rendered(new Forbidden())).body).toEqual({ error: "forbidden", request_id: "req-1" });
    const res = await rendered(new Forbidden("not_accepted"));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", request_id: "req-1", reason: "not_accepted" });
  });

  it("NotFound is a 404 naming the entity and, when known, the id", async () => {
    expect((await rendered(new NotFound("corpus_version", "cv-x"))).body).toEqual({ error: "not_found", request_id: "req-1", entity: "corpus_version", id: "cv-x" });
    const res = await rendered(new NotFound("trace"));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found", request_id: "req-1", entity: "trace" });
  });

  it("HashMismatch is a 409 naming the procedure step whose text no longer hashes to its source", async () => {
    const integrity = { opl_id: "opl-7", step_n: 3, span_id: null };
    const res = await rendered(new HashMismatch(integrity));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "hash_mismatch", request_id: "req-1", ...integrity });
  });
});
