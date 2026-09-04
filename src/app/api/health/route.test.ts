// GET /api/health (9.9, AC-M0-01): { ok: true, corpus_version, commit } from SELECT 1 and the active version;
// 503 with { ok: false, reason } otherwise, never a message or a stack. The database is the fake client.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { queueResult, resetFakeDb, statements } from "../../../../tests/helpers/fake-db-client";
import { setRequest } from "../../../../tests/helpers/next-headers";
import { GET } from "./route";

const commitAtStart = process.env.VERCEL_GIT_COMMIT_SHA;
const request = () => new NextRequest("http://localhost/api/health", { headers: { "x-request-id": "req-h" } });

beforeEach(() => {
  resetFakeDb();
  setRequest();
});

afterEach(() => {
  if (commitAtStart === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = commitAtStart;
});

describe("GET /api/health", () => {
  it("answers 200 { ok, corpus_version, commit } and no-store, without a session lookup", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "0123456789abcdef";
    queueResult(undefined); // select 1
    queueResult([{ id: "cv-1", label: "v0-equipment-master" }]); // the active version
    const res = await GET(request(), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, corpus_version: "v0-equipment-master", commit: "0123456789abcdef" });
    // SELECT 1 and the active version: two statements, no session read
    expect(statements).toHaveLength(2);
    expect(statements[0][0].method).toBe("execute");
  });

  it("reports the commit as local outside the platform", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    queueResult(undefined);
    queueResult([{ id: "cv-1", label: "v1" }]);
    const res = await GET(request(), undefined);
    expect(await res.json()).toMatchObject({ ok: true, commit: "local" });
  });

  it("answers 503 { ok: false, reason: no_active_version } when no version is active", async () => {
    queueResult(undefined);
    queueResult([]);
    const res = await GET(request(), undefined);
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: false, reason: "no_active_version" });
  });

  it("answers 503 { ok: false, reason: database } when the database does not answer, without the error text", async () => {
    queueResult(new Error("connection refused at 10.0.0.1:5432"));
    const res = await GET(request(), undefined);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, reason: "database" });
    expect(text).not.toContain("10.0.0.1");
    expect(text).not.toContain("refused");
  });
});
