// authorize() is the one authority (ARCHITECTURE section 5): 401 without a session, 403 with an audit event when
// the role lacks the 9.9 column, the user otherwise. withRoute() maps those to responses that carry x-request-id
// and never a stack trace.
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/contracts/generated/serving";
import { argOf, queueResult, resetFakeDb, statementWith, statements } from "../../tests/helpers/fake-db-client";
import { setRequest } from "../../tests/helpers/next-headers";
import { AuthError, authorize, withRoute } from "./authorize";
import { SESSION_COOKIE, signSessionId } from "./cookie";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function signedIn(role: Role, requestId = "req-1", path = "/drafts") {
  setRequest({
    cookies: { [SESSION_COOKIE]: signSessionId("sess-1") },
    headers: { "x-request-id": requestId, "x-request-path": path },
  });
  queueResult([
    { id: `u-${role}`, username: "demo", alias: `${role.toUpperCase()}-DEMO`, role, sessionId: "sess-1", expiresAt: new Date(Date.now() + 1000) },
  ]);
}

beforeEach(() => {
  resetFakeDb();
  setRequest();
});

describe("authorize", () => {
  it("throws 401 without a session and never queries", async () => {
    await expect(authorize("ask_read")).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
    expect(statements).toHaveLength(0);
  });

  it("returns the user when the role holds the column", async () => {
    signedIn("Engineer");
    const user = await authorize("view_drafts");
    expect(user).toMatchObject({ role: "Engineer", alias: "ENGINEER-DEMO", sessionId: "sess-1" });
  });

  it("throws 403 and writes auth.role_violation, keyed by the request id, when the role lacks the column", async () => {
    signedIn("Engineer", "req-403", "/drafts");
    queueResult([{ id: "cv-1", label: "v1" }]); // activeCorpusVersion()
    queueResult(undefined); // the audit insert
    await expect(authorize("create_draft")).rejects.toMatchObject({ status: 403, code: "forbidden" });

    const insert = statementWith("insert");
    expect(insert).toBeDefined();
    expect(argOf(insert!, "values")).toMatchObject({
      id: "req-403",
      actorAlias: "ENGINEER-DEMO",
      actorRole: "Engineer",
      action: "auth.role_violation",
      entity: "permission",
      entityId: "create_draft",
      payload: { permission: "create_draft", role: "Engineer" },
      traceId: null,
      route: "/drafts",
      corpusVersionId: "cv-1",
    });
  });

  it("uses the route pattern a handler passes instead of the forwarded path", async () => {
    signedIn("Admin", "req-x", "/drafts/abc");
    queueResult([{ id: "cv-1", label: "v1" }]);
    queueResult(undefined);
    await expect(authorize("view_drafts", { route: "/api/drafts/:id" })).rejects.toBeInstanceOf(AuthError);
    expect(argOf(statementWith("insert")!, "values")).toMatchObject({ route: "/api/drafts/:id" });
  });

  it("still throws 403 when the audit write itself fails (the denial never depends on the log)", async () => {
    signedIn("Admin");
    queueResult(new Error("audit unavailable"));
    await expect(authorize("publish")).rejects.toMatchObject({ status: 403 });
  });
});

describe("withRoute", () => {
  const request = (headers: Record<string, string> = {}) => new NextRequest("http://localhost/api/x", { headers });

  it("a public route (permission null) never looks the session up", async () => {
    const GET = withRoute("/api/x", null, async (_req, _ctx, user) => NextResponse.json({ user }));
    const res = await GET(request(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
    expect(statements).toHaveLength(0);
  });

  it("answers 401 JSON carrying the request id in the body and the header", async () => {
    const GET = withRoute("/api/x", "ask_read", async () => NextResponse.json({ never: true }));
    const res = await GET(request({ "x-request-id": "req-401" }), undefined);
    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toBe("req-401");
    expect(await res.json()).toEqual({ error: "unauthenticated", request_id: "req-401" });
  });

  it("answers 403 JSON with the request id when the role lacks the column", async () => {
    signedIn("Engineer", "req-403");
    queueResult([{ id: "cv-1", label: "v1" }]);
    queueResult(undefined);
    const POST = withRoute("/api/drafts", "create_draft", async () => NextResponse.json({ never: true }));
    const res = await POST(request({ "x-request-id": "req-403" }), undefined);
    expect(res.status).toBe(403);
    expect(res.headers.get("x-request-id")).toBe("req-403");
    expect(await res.json()).toEqual({ error: "forbidden", request_id: "req-403" });
  });

  it("maps a thrown error to 500 with the request id and without the message or a stack", async () => {
    const GET = withRoute("/api/x", null, async () => {
      throw new Error("database exploded at /secret/path");
    });
    const res = await GET(request({ "x-request-id": "req-500" }), undefined);
    expect(res.status).toBe(500);
    expect(res.headers.get("x-request-id")).toBe("req-500");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "internal", request_id: "req-500" });
    expect(text).not.toContain("exploded");
    expect(text).not.toContain("/secret/path");
    expect(text).not.toMatch(/\bat \S+ \(/);
  });

  it("mints a UUID request id when the proxy did not forward one", async () => {
    const GET = withRoute("/api/x", "ask_read", async () => NextResponse.json({}));
    const res = await GET(request(), undefined);
    expect(res.headers.get("x-request-id")).toMatch(UUID);
    const body = (await res.json()) as { request_id: string };
    expect(body.request_id).toBe(res.headers.get("x-request-id"));
  });
});
