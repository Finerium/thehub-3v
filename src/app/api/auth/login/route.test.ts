// POST /api/auth/login (9.9, ARCHITECTURE section 5): the addr:<ip> rate limit is hit before any lookup and its
// exhaustion is the designed 429 naming the limit and the reset moment; a failed login is one status and one body
// whether the username is unknown or the password is wrong, and it never names a field; a success sets the signed
// session cookie and the browser sandbox cookie (D-16). The database is the fake client; bcrypt is a spy.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "@/auth/password";
import { argOf, queueResult, resetFakeDb, statements } from "../../../../../tests/helpers/fake-db-client";
import { setCookies, setRequest } from "../../../../../tests/helpers/next-headers";
import { SANDBOX_COOKIE, SESSION_COOKIE, verifySessionCookie } from "@/auth/cookie";
import { LANDING_PATH } from "@/auth/session";
import { rateLimitCounter, sandbox, session } from "@/db/schema";
import { LIMITS, WINDOW_SECONDS } from "@/lib/ratelimit";
import { POST } from "./route";

vi.mock("@/auth/password", () => ({
  hashPassword: vi.fn(async () => "uniform-hash"),
  verifyPassword: vi.fn(async () => false),
}));

const ENGINEER = { id: "u-eng", username: "engineer_demo", alias: "ENG-DEMO", role: "Engineer" as const, passwordHash: "stored-hash" };
const CLIENT_IP = "203.0.113.7";
const WINDOW_START = new Date("2026-09-05T08:00:00.000Z");
const OPAQUE_ID = /^[A-Za-z0-9_-]{43}$/;

// The first statement of every login: the addr:<ip> counter upsert, RETURNING count and window_start.
function hitCounter(count = 1) {
  queueResult([{ count, windowStart: WINDOW_START }]);
}

// The recorded chains that insert into `table` (the counter upsert, the session row, the sandbox upsert).
function insertsInto(table: unknown) {
  return statements.filter((s) => s[0]?.method === "insert" && s[0].args[0] === table);
}

function jsonLogin(body: unknown) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req-login",
      "x-forwarded-for": `${CLIENT_IP}, 10.0.0.1`,
    },
    body: JSON.stringify(body),
  });
}

function formLogin(fields: Record<string, string>) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-request-id": "req-login",
      "x-forwarded-for": CLIENT_IP,
    },
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

describe("rate limit (addr:<ip>, before any lookup)", () => {
  it("counts one hit on addr:<client address> from the first x-forwarded-for entry, before the user lookup", async () => {
    hitCounter();
    queueResult([]); // unknown username
    await POST(jsonLogin({ username: "nobody", password: "x" }), undefined);

    const counter = statements[0]!;
    expect(counter[0]!.method).toBe("insert");
    expect(counter[0]!.args[0]).toBe(rateLimitCounter);
    expect(argOf(counter, "values")).toMatchObject({ scope: "addr", key: CLIENT_IP, count: 1 });
    expect(counter.some((c) => c.method === "onConflictDoUpdate")).toBe(true);
  });

  it("answers the designed 429 naming the limit and the reset moment from hit limit + 1, with no lookup and no cookie", async () => {
    hitCounter(LIMITS.addr + 1);
    const res = await POST(jsonLogin({ username: ENGINEER.username, password: "right" }), undefined);

    expect(res.status).toBe(429);
    expect(res.headers.get("x-request-id")).toBe("req-login");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(await res.json()).toEqual({
      error: "rate_limited",
      request_id: "req-login",
      scope: "addr",
      limit: LIMITS.addr,
      resets_at: new Date(WINDOW_START.getTime() + WINDOW_SECONDS * 1000).toISOString(),
    });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(statements).toHaveLength(1);
    expect(setCookies).toHaveLength(0);
  });

  it("still admits the hit at the limit itself", async () => {
    hitCounter(LIMITS.addr);
    queueResult([]);
    const res = await POST(jsonLogin({ username: "nobody", password: "x" }), undefined);
    expect(res.status).toBe(401);
  });
});

describe("failed login", () => {
  it("answers the same 401 for an unknown username and for a wrong password, naming no field", async () => {
    hitCounter();
    queueResult([]); // unknown username
    const unknown = await snapshot(await POST(jsonLogin({ username: "nobody", password: "x" }), undefined));

    hitCounter();
    queueResult([ENGINEER]); // known username, verifyPassword says no
    const wrong = await snapshot(await POST(jsonLogin({ username: ENGINEER.username, password: "x" }), undefined));

    expect(unknown.status).toBe(401);
    expect(unknown).toEqual(wrong);
    expect(JSON.parse(unknown.body)).toEqual({ error: "invalid_credentials" });
    for (const word of ["username", "password", "field", "unknown", "wrong"]) expect(unknown.body).not.toContain(word);
    expect(setCookies).toHaveLength(0);
    expect(insertsInto(session)).toHaveLength(0);
    expect(insertsInto(sandbox)).toHaveLength(0);
  });

  it("sends a form post back to /login with the error flag and the username, never a field hint", async () => {
    hitCounter();
    queueResult([]);
    const unknown = await POST(formLogin({ username: "nobody", password: "x", next: "/demo/loop" }), undefined);
    hitCounter();
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
    hitCounter();
    const res = await POST(jsonLogin({ username: "engineer_demo" }), undefined);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(statements).toHaveLength(1); // the counter hit only
  });
});

describe("successful login", () => {
  function acceptEngineer() {
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    hitCounter();
    queueResult([ENGINEER]); // the user row
    queueResult(undefined); // last_login update
    queueResult(undefined); // the session insert
    queueResult([{ id: "set-by-the-row", corpusVersionId: null, createdAt: WINDOW_START, lastSeenAt: WINDOW_START }]); // the sandbox upsert, RETURNING
  }

  it("answers { alias, role } and sets the signed session cookie and the browser sandbox cookie", async () => {
    acceptEngineer();
    const res = await POST(jsonLogin({ username: ENGINEER.username, password: "right" }), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ alias: "ENG-DEMO", role: "Engineer" });

    const sessionCookie = setCookies.find((c) => c.name === SESSION_COOKIE);
    const sandboxCookie = setCookies.find((c) => c.name === SANDBOX_COOKIE);
    expect(sessionCookie).toBeDefined();
    expect(verifySessionCookie(sessionCookie!.value)).toMatch(OPAQUE_ID);
    expect(sessionCookie!.options).toMatchObject({ httpOnly: true, maxAge: 8 * 60 * 60 });
    expect(sandboxCookie).toBeDefined();
    expect(sandboxCookie!.value).toMatch(OPAQUE_ID);
    expect(sandboxCookie!.options).toMatchObject({ httpOnly: true, maxAge: 30 * 24 * 60 * 60 });

    // The sandbox row is upserted under the id the cookie carries (D-16).
    const upsert = insertsInto(sandbox);
    expect(upsert).toHaveLength(1);
    expect(argOf(upsert[0]!, "values")).toEqual({ id: sandboxCookie!.value });
    expect(upsert[0]!.some((c) => c.method === "onConflictDoUpdate")).toBe(true);
    expect(insertsInto(session)).toHaveLength(1);
  });

  it("keeps the browser's existing sandbox id across logins (D-16)", async () => {
    const existing = "a".repeat(43);
    setRequest({ cookies: { [SANDBOX_COOKIE]: existing } });
    acceptEngineer();
    await POST(jsonLogin({ username: ENGINEER.username, password: "right" }), undefined);
    expect(setCookies.find((c) => c.name === SANDBOX_COOKIE)).toMatchObject({ value: existing });
    expect(argOf(insertsInto(sandbox)[0]!, "values")).toEqual({ id: existing });
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
