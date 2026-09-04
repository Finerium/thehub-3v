// POST /api/auth/login (9.9, ARCHITECTURE section 5): a failed login is one status and one body whether the
// username is unknown or the password is wrong, and it never names a field; a success sets the signed session
// cookie and the browser sandbox cookie. The database is the fake client; bcrypt is a spy.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "@/auth/password";
import { queueResult, resetFakeDb, statementWith } from "../../../../../tests/helpers/fake-db-client";
import { setCookies, setRequest } from "../../../../../tests/helpers/next-headers";
import { SANDBOX_COOKIE, SESSION_COOKIE, verifySessionCookie } from "@/auth/cookie";
import { LANDING_PATH } from "@/auth/session";
import { POST } from "./route";

vi.mock("@/auth/password", () => ({
  hashPassword: vi.fn(async () => "uniform-hash"),
  verifyPassword: vi.fn(async () => false),
}));

const ENGINEER = { id: "u-eng", username: "engineer_demo", alias: "ENG-DEMO", role: "Engineer" as const, passwordHash: "stored-hash" };

function jsonLogin(body: unknown) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "req-login" },
    body: JSON.stringify(body),
  });
}

function formLogin(fields: Record<string, string>) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-request-id": "req-login" },
    body: new URLSearchParams(fields).toString(),
  });
}

async function snapshot(res: Response) {
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text() };
}

beforeEach(() => {
  resetFakeDb();
  setRequest();
});

describe("failed login", () => {
  it("answers the same 401 for an unknown username and for a wrong password, naming no field", async () => {
    queueResult([]); // unknown username
    const unknown = await snapshot(await POST(jsonLogin({ username: "nobody", password: "x" }), undefined));

    queueResult([ENGINEER]); // known username, verifyPassword says no
    const wrong = await snapshot(await POST(jsonLogin({ username: ENGINEER.username, password: "x" }), undefined));

    expect(unknown.status).toBe(401);
    expect(unknown).toEqual(wrong);
    expect(JSON.parse(unknown.body)).toEqual({ error: "invalid_credentials" });
    for (const word of ["username", "password", "field", "unknown", "wrong"]) expect(unknown.body).not.toContain(word);
    expect(setCookies).toHaveLength(0);
    expect(statementWith("insert")).toBeUndefined();
  });

  it("sends a form post back to /login with the error flag and the username, never a field hint", async () => {
    queueResult([]);
    const unknown = await POST(formLogin({ username: "nobody", password: "x", next: "/demo/loop" }), undefined);
    queueResult([{ ...ENGINEER, username: "nobody" }]);
    const wrong = await POST(formLogin({ username: "nobody", password: "x", next: "/demo/loop" }), undefined);

    expect(unknown.status).toBe(303);
    expect(unknown.headers.get("location")).toBe(wrong.headers.get("location"));
    const back = new URL(unknown.headers.get("location")!);
    expect(back.pathname).toBe("/login");
    expect(back.searchParams.get("error")).toBe("1");
    expect(back.searchParams.get("username")).toBe("nobody");
    expect(back.searchParams.get("next")).toBe("/demo/loop");
    expect([...back.searchParams.keys()].sort()).toEqual(["error", "next", "username"]);
  });

  it("rejects a JSON body without the two fields as 400 invalid_body before any lookup", async () => {
    const res = await POST(jsonLogin({ username: "engineer_demo" }), undefined);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
    expect(verifyPassword).not.toHaveBeenCalled();
  });
});

describe("successful login", () => {
  function acceptEngineer() {
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    queueResult([ENGINEER]); // the user row
    queueResult(undefined); // last_login update
    queueResult(undefined); // the session insert
    queueResult(undefined); // the sandbox upsert
  }

  it("answers { alias, role } and sets the signed session cookie and the browser sandbox cookie", async () => {
    acceptEngineer();
    const res = await POST(jsonLogin({ username: ENGINEER.username, password: "right" }), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ alias: "ENG-DEMO", role: "Engineer" });

    const session = setCookies.find((c) => c.name === SESSION_COOKIE);
    const sandbox = setCookies.find((c) => c.name === SANDBOX_COOKIE);
    expect(session).toBeDefined();
    expect(verifySessionCookie(session!.value)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session!.options).toMatchObject({ httpOnly: true, maxAge: 8 * 60 * 60 });
    expect(sandbox).toBeDefined();
    expect(sandbox!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sandbox!.options).toMatchObject({ httpOnly: true, maxAge: 30 * 24 * 60 * 60 });
  });

  it("a form post lands on a safe next path, or on the landing when next is unsafe", async () => {
    acceptEngineer();
    const onward = await POST(formLogin({ username: ENGINEER.username, password: "right", next: "/demo/loop" }), undefined);
    expect(onward.status).toBe(303);
    expect(new URL(onward.headers.get("location")!).pathname).toBe("/demo/loop");

    acceptEngineer();
    const unsafe = await POST(formLogin({ username: ENGINEER.username, password: "right", next: "https://evil.example/" }), undefined);
    expect(new URL(unsafe.headers.get("location")!).pathname).toBe(LANDING_PATH);
  });
});
