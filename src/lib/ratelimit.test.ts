// Rate limits in Postgres (blueprint 9.9, ARCHITECTURE 3.4, ADR-011, AC-NFR-11, AC-NFR-18): one upsert per hit on
// the fixed 60 s window of the database clock, the count carried back by RETURNING, `allowed` false from hit
// limit + 1 on, the reset moment window_start + 60 s. The window is part of the primary key, so a hit in the next
// minute starts a fresh count without any memory. The database is the fake client.
import type { SQL } from "drizzle-orm";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import { argOf, queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";
import { rateLimitCounter } from "@/db/schema";
import { LIMITS, WINDOW_SECONDS, clientAddress, limit } from "./ratelimit";

const WINDOW_START = new Date("2026-09-05T08:00:00.000Z");
const NEXT_WINDOW = new Date("2026-09-05T08:01:00.000Z");

const compile = (fragment: unknown) => new PgDialect().sqlToQuery(fragment as SQL);

beforeEach(() => {
  resetFakeDb();
});

describe("the 9.9 limits", () => {
  it("are 30 asks and 5 draft creations per minute per account and 120 requests per minute per address", () => {
    expect(LIMITS).toEqual({ ask: 30, draft: 5, addr: 120 });
    expect(WINDOW_SECONDS).toBe(60);
  });

  it("key one counter per scope, key and window (the primary key of rate_limit_counter)", () => {
    const [pk] = getTableConfig(rateLimitCounter).primaryKeys;
    expect(pk?.columns.map((c) => c.name)).toEqual(["scope", "key", "window_start"]);
  });
});

describe("limit()", () => {
  it("upserts one hit on <scope>:<key> in the current minute of the database clock and reads the count back", async () => {
    queueResult([{ count: 1, windowStart: WINDOW_START }]);
    const result = await limit("ask", "u-eng");

    expect(statements).toHaveLength(1);
    const chain = statements[0]!;
    expect(chain[0]).toMatchObject({ method: "insert", args: [rateLimitCounter] });
    const values = argOf(chain, "values") as { scope: string; key: string; count: number; windowStart: unknown };
    expect(values).toMatchObject({ scope: "ask", key: "u-eng", count: 1 });
    expect(compile(values.windowStart).sql).toBe("date_trunc('minute', now())");

    const conflict = argOf(chain, "onConflictDoUpdate") as { target: unknown[]; set: { count: unknown } };
    expect(conflict.target).toEqual([rateLimitCounter.scope, rateLimitCounter.key, rateLimitCounter.windowStart]);
    expect(compile(conflict.set.count).sql).toBe('"rate_limit_counter"."count" + 1');
    expect(chain.some((c) => c.method === "returning")).toBe(true);

    expect(result).toEqual({ allowed: true, count: 1, limit: LIMITS.ask, resets_at: new Date(WINDOW_START.getTime() + 60_000) });
  });

  it("admits the hit at the limit and refuses from limit + 1 on, naming the limit", async () => {
    queueResult([{ count: LIMITS.draft, windowStart: WINDOW_START }]);
    expect(await limit("draft", "u-sup")).toMatchObject({ allowed: true, count: 5, limit: 5 });

    queueResult([{ count: LIMITS.draft + 1, windowStart: WINDOW_START }]);
    expect(await limit("draft", "u-sup")).toMatchObject({ allowed: false, count: 6, limit: 5 });
  });

  it("resets on the next fixed window: a later window_start moves resets_at by the same minute", async () => {
    queueResult([{ count: 121, windowStart: WINDOW_START }]);
    const exhausted = await limit("addr", "203.0.113.7");
    queueResult([{ count: 1, windowStart: NEXT_WINDOW }]);
    const fresh = await limit("addr", "203.0.113.7");

    expect(exhausted.allowed).toBe(false);
    expect(exhausted.resets_at).toEqual(NEXT_WINDOW);
    expect(fresh).toMatchObject({ allowed: true, count: 1, resets_at: new Date(NEXT_WINDOW.getTime() + 60_000) });
  });

  it("takes an explicit maximum over the scope's default", async () => {
    queueResult([{ count: 3, windowStart: WINDOW_START }]);
    expect(await limit("ask", "u-eng", 2)).toMatchObject({ allowed: false, limit: 2 });
  });

  it("fails loudly when the upsert returns no row (never a silent allow)", async () => {
    queueResult([]);
    await expect(limit("ask", "u-eng")).rejects.toThrow("rate_limit_counter upsert returned no row");
  });
});

describe("clientAddress()", () => {
  const request = (headers: Record<string, string>) => new Request("http://localhost/api/ask", { headers });

  it("is the first x-forwarded-for entry, trimmed", () => {
    expect(clientAddress(request({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientAddress(request({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it('is "unknown" without the header or with an empty one', () => {
    expect(clientAddress(request({}))).toBe("unknown");
    expect(clientAddress(request({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});
