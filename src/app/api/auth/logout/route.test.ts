// POST /api/auth/logout (9.9, D-16): the session row goes and thehub_session is cleared; thehub_sandbox is never
// touched, so the next login in the same browser resumes the same sandbox. A form post (the guided route's role
// switch, ARCHITECTURE 8.5) goes back to /login with the username prefilled and a safe `next` carried.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { queueResult, resetFakeDb, statementWith, statements } from "../../../../../tests/helpers/fake-db-client";
import { setCookies, setRequest } from "../../../../../tests/helpers/next-headers";
import { SANDBOX_COOKIE, SESSION_COOKIE, signSessionId } from "@/auth/cookie";
import { POST } from "./route";

const SANDBOX_ID = "s".repeat(43);

function logout(init: { form?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "x-request-id": "req-logout" };
  let body: string | undefined;
  if (init.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.form).toString();
  }
  return new NextRequest("http://localhost/api/auth/logout", { method: "POST", headers, body });
}

beforeEach(() => {
  resetFakeDb();
  setRequest({ cookies: { [SESSION_COOKIE]: signSessionId("sess-1"), [SANDBOX_COOKIE]: SANDBOX_ID } });
});

describe("POST /api/auth/logout", () => {
  it("deletes the session row, clears thehub_session only and leaves thehub_sandbox alone (D-16)", async () => {
    queueResult(undefined);
    const res = await POST(logout(), undefined);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(statementWith("delete")).toBeDefined();
    expect(setCookies).toEqual([{ name: SESSION_COOKIE, value: "", options: expect.objectContaining({ maxAge: 0 }) }]);
    expect(setCookies.some((c) => c.name === SANDBOX_COOKIE)).toBe(false);
  });

  it("without a valid session cookie still answers ok, clears the cookie and queries nothing", async () => {
    setRequest({ cookies: { [SANDBOX_COOKIE]: SANDBOX_ID } });
    const res = await POST(logout(), undefined);
    expect(res.status).toBe(200);
    expect(statements).toHaveLength(0);
    expect(setCookies.map((c) => c.name)).toEqual([SESSION_COOKIE]);
  });

  it("a form post (the role switch) goes back to /login with the username and a safe next, the sandbox kept", async () => {
    queueResult(undefined);
    const res = await POST(logout({ form: { username: "manager_demo", next: "/demo/loop" } }), undefined);

    expect(res.status).toBe(303);
    const back = new URL(res.headers.get("location")!);
    expect(back.pathname).toBe("/login");
    expect(back.searchParams.get("username")).toBe("manager_demo");
    expect(back.searchParams.get("next")).toBe("/demo/loop");
    expect(setCookies.some((c) => c.name === SANDBOX_COOKIE)).toBe(false);
  });

  it("drops an unsafe next and an over-long username from the redirect", async () => {
    queueResult(undefined);
    const res = await POST(logout({ form: { username: "u".repeat(65), next: "https://evil.example/" } }), undefined);
    const back = new URL(res.headers.get("location")!);
    expect(back.pathname).toBe("/login");
    expect([...back.searchParams.keys()]).toEqual([]);
  });
});
