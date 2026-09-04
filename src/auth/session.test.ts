// Sessions (ARCHITECTURE section 5, D-15, D-16): the 8-hour expiry written at creation and enforced at every read,
// no database touch without a cookie, uniform failure on a bad login, the sandbox cookie kept across logouts.
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { argOf, queueResult, resetFakeDb, statementWith, statements } from "../../tests/helpers/fake-db-client";
import { setCookies, setRequest } from "../../tests/helpers/next-headers";
import { SANDBOX_COOKIE, SESSION_COOKIE, signSessionId, verifySessionCookie } from "./cookie";
import { verifyPassword } from "./password";
import { authenticate, createSession, destroySession, ensureSandbox, getSession, safeNextPath } from "./session";

// bcrypt at cost 12 is not what these tests measure; the comparison is a spy so its calls can be counted.
vi.mock("@/auth/password", () => ({
  hashPassword: vi.fn(async () => "uniform-hash"),
  verifyPassword: vi.fn(async () => false),
}));

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const NOW = new Date("2026-09-03T08:00:00.000Z");
const ENGINEER = { id: "u-eng", username: "engineer_demo", alias: "ENG-DEMO", role: "Engineer" as const };

beforeEach(() => {
  resetFakeDb();
  setRequest();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSession", () => {
  it("inserts a row that expires exactly eight hours after creation and sets the signed cookie", async () => {
    queueResult(undefined);
    const { id, expiresAt } = await createSession(ENGINEER.id);

    expect(expiresAt.getTime() - NOW.getTime()).toBe(EIGHT_HOURS_MS);
    const insert = statementWith("insert");
    expect(insert).toBeDefined();
    const values = argOf(insert!, "values") as { id: string; userId: string; createdAt: Date; expiresAt: Date };
    expect(values.id).toBe(id);
    expect(values.userId).toBe(ENGINEER.id);
    expect(values.expiresAt.getTime() - values.createdAt.getTime()).toBe(EIGHT_HOURS_MS);

    const cookie = setCookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(verifySessionCookie(cookie!.value)).toBe(id);
    expect(cookie!.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  });
});

describe("getSession", () => {
  it("returns null without a cookie and never queries (the keep-alive's /login call, D-15)", async () => {
    expect(await getSession()).toBeNull();
    expect(statements).toHaveLength(0);
  });

  it("returns null for a forged cookie and never queries", async () => {
    setRequest({ cookies: { [SESSION_COOKIE]: "sess-1.not-a-signature" } });
    expect(await getSession()).toBeNull();
    expect(statements).toHaveLength(0);
  });

  it("reads the session joined to its user and only while expires_at is still in the future", async () => {
    setRequest({ cookies: { [SESSION_COOKIE]: signSessionId("sess-1") } });
    const row = { ...ENGINEER, sessionId: "sess-1", expiresAt: new Date(NOW.getTime() + 1000) };
    queueResult([row]);

    expect(await getSession()).toEqual(row);
    expect(statements).toHaveLength(1);
    const query = new PgDialect().sqlToQuery(argOf(statements[0], "where") as SQL);
    expect(query.sql).toMatch(/"session"\."id" = \$1 and "session"\."expires_at" > \$2/);
    expect(query.params).toEqual(["sess-1", NOW.toISOString()]);
  });

  it("returns null when no live row matches", async () => {
    setRequest({ cookies: { [SESSION_COOKIE]: signSessionId("sess-expired") } });
    queueResult([]);
    expect(await getSession()).toBeNull();
  });
});

describe("authenticate (uniform failure, no username enumeration)", () => {
  it("an unknown username costs one hash comparison and returns null", async () => {
    queueResult([]);
    expect(await authenticate("nobody", "whatever")).toBeNull();
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword).toHaveBeenCalledWith("whatever", "uniform-hash");
    expect(statementWith("update")).toBeUndefined();
  });

  it("a wrong password costs one hash comparison against the stored hash and returns null", async () => {
    queueResult([{ ...ENGINEER, passwordHash: "stored-hash" }]);
    expect(await authenticate(ENGINEER.username, "wrong")).toBeNull();
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword).toHaveBeenCalledWith("wrong", "stored-hash");
    expect(statementWith("update")).toBeUndefined();
  });

  it("a valid pair returns the user without the hash and records last_login", async () => {
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    queueResult([{ ...ENGINEER, passwordHash: "stored-hash" }]);
    queueResult(undefined);
    expect(await authenticate(ENGINEER.username, "right")).toEqual(ENGINEER);
    const update = statementWith("update");
    expect(update).toBeDefined();
    expect(argOf(update!, "set")).toEqual({ lastLogin: NOW });
  });
});

describe("destroySession", () => {
  it("deletes the row behind a valid cookie and clears the session cookie only (the sandbox stays, D-16)", async () => {
    setRequest({ cookies: { [SESSION_COOKIE]: signSessionId("sess-1"), [SANDBOX_COOKIE]: "s".repeat(43) } });
    queueResult(undefined);
    await destroySession();
    expect(statementWith("delete")).toBeDefined();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toMatchObject({ name: SESSION_COOKIE, value: "", options: { maxAge: 0 } });
  });

  it("clears the cookie without a query when the cookie is forged or absent", async () => {
    setRequest({ cookies: { [SESSION_COOKIE]: "forged.forged" } });
    await destroySession();
    expect(statements).toHaveLength(0);
    expect(setCookies[0]).toMatchObject({ name: SESSION_COOKIE, value: "", options: { maxAge: 0 } });
  });
});

describe("ensureSandbox (D-16)", () => {
  it("issues a new browser sandbox id when the browser has none", async () => {
    queueResult(undefined);
    const id = await ensureSandbox();
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const insert = statementWith("insert");
    expect(argOf(insert!, "values")).toEqual({ id });
    expect(insert!.some((c) => c.method === "onConflictDoUpdate")).toBe(true);
    expect(setCookies[0]).toMatchObject({ name: SANDBOX_COOKIE, value: id, options: { httpOnly: true, maxAge: 30 * 24 * 60 * 60 } });
  });

  it("keeps the browser's existing sandbox id and refreshes it", async () => {
    const existing = "a".repeat(43);
    setRequest({ cookies: { [SANDBOX_COOKIE]: existing } });
    queueResult(undefined);
    expect(await ensureSandbox()).toBe(existing);
    expect(setCookies[0]).toMatchObject({ name: SANDBOX_COOKIE, value: existing });
  });

  it("ignores a malformed sandbox cookie and mints a fresh id", async () => {
    setRequest({ cookies: { [SANDBOX_COOKIE]: "short" } });
    queueResult(undefined);
    expect(await ensureSandbox()).not.toBe("short");
  });
});

describe("safeNextPath", () => {
  it("honours only a same-origin path that is neither the login page nor an API route", () => {
    expect(safeNextPath("/demo/loop")).toBe("/demo/loop");
    expect(safeNextPath("/drafts?page=2")).toBe("/drafts?page=2");
    for (const bad of ["", "https://evil.example", "//evil.example", "/\\evil", "/login", "/login?x=1", "/api/health", "/a\nb", 42, null]) {
      expect(safeNextPath(bad)).toBeNull();
    }
    expect(safeNextPath(`/${"a".repeat(2048)}`)).toBeNull();
  });
});
