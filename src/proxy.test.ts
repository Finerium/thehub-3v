// src/proxy.ts: the cookie-presence gate of D-07 and the request id every response carries (9.9).
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, signSessionId } from "@/auth/cookie";
import { proxy } from "./proxy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const at = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } } : undefined);

describe("request id", () => {
  it("is a UUID on every response, and forwarded to the handler with the pathname", () => {
    const res = proxy(at("/api/health"));
    const id = res.headers.get("x-request-id");
    expect(id).toMatch(UUID);
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe(id);
    expect(res.headers.get("x-middleware-request-x-request-path")).toBe("/api/health");
  });

  it("differs between two requests", () => {
    expect(proxy(at("/login")).headers.get("x-request-id")).not.toBe(proxy(at("/login")).headers.get("x-request-id"));
  });
});

describe("unauthenticated", () => {
  it("sends a page request to /login carrying the path and query as next", () => {
    const res = proxy(at("/drafts?page=2"));
    expect(res.status).toBe(307);
    const login = new URL(res.headers.get("location")!);
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("next")).toBe("/drafts?page=2");
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });

  it("answers 401 JSON to an API request, with the request id in the body and the header", async () => {
    const res = proxy(at("/api/drafts"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; request_id: string };
    expect(body.error).toBe("unauthenticated");
    expect(body.request_id).toBe(res.headers.get("x-request-id"));
  });

  it("lets exactly the public set through: /login, /api/auth/login, /api/health, /robots.txt", () => {
    for (const path of ["/login", "/api/auth/login", "/api/health", "/robots.txt"]) {
      const res = proxy(at(path));
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location"), path).toBeNull();
    }
    expect(proxy(at("/api/auth/session")).status).toBe(401);
    expect(proxy(at("/api/auth/tour/abc")).status).toBe(401);
    expect(proxy(at("/tour")).status).toBe(307);
  });

  it("treats a forged cookie as no cookie", () => {
    expect(proxy(at("/drafts", "sess-1.forged")).status).toBe(307);
    expect(proxy(at("/api/drafts", "garbage")).status).toBe(401);
  });
});

describe("authenticated", () => {
  it("passes a request with a validly signed cookie through with the forwarded headers", () => {
    const res = proxy(at("/drafts", signSessionId("sess-1")));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-request-path")).toBe("/drafts");
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe(res.headers.get("x-request-id"));
  });
});
