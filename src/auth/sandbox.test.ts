// The visitor's browser-scoped sandbox (D-16, ARCHITECTURE 8.5, AC-LOOP-13): the thehub_sandbox cookie is an
// opaque id, HttpOnly, SameSite=Lax, site-wide, 30 days, Secure on every deployment; the row behind it is upserted
// at login and read anywhere else; visibleVersionIds() is the active lineage plus the sandbox's own version, so one
// visitor's publication never reaches another's numbers. The database is the fake client.
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { argOf, queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";
import { cookies, setCookies, setRequest } from "../../tests/helpers/next-headers";
import { SANDBOX_COOKIE, SANDBOX_COOKIE_OPTIONS, SANDBOX_TTL_SECONDS } from "./cookie";
import { getOrCreateSandbox, getSandbox, visibleVersionIds } from "./sandbox";
import { corpusVersion, sandbox } from "@/db/schema";

const OPAQUE_ID = /^[A-Za-z0-9_-]{43}$/;
const EXISTING = "b".repeat(43);
const NOW = new Date("2026-09-05T08:00:00.000Z");
const row = (id: string, corpusVersionId: string | null = null) => ({ id, corpusVersionId, createdAt: NOW, lastSeenAt: NOW });

const compile = (fragment: unknown) => new PgDialect().sqlToQuery(fragment as SQL);

beforeEach(() => {
  resetFakeDb();
  setRequest();
});

describe("the cookie (D-16)", () => {
  it("is HttpOnly, SameSite=Lax, site-wide and lives thirty days", () => {
    expect(SANDBOX_COOKIE).toBe("thehub_sandbox");
    expect(SANDBOX_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(SANDBOX_COOKIE_OPTIONS).toEqual({ httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: SANDBOX_TTL_SECONDS });
  });

  it("is Secure on a deployment (NODE_ENV=production), where every origin is https", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    try {
      const production = await import("./cookie");
      expect(production.SANDBOX_COOKIE_OPTIONS).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SANDBOX_TTL_SECONDS });
      expect(production.SESSION_COOKIE_OPTIONS.secure).toBe(true);
    } finally {
      vi.unstubAllEnvs(); // restores the original NODE_ENV
      vi.resetModules();
    }
  });
});

describe("getOrCreateSandbox (at login)", () => {
  it("mints an opaque id when the browser has none, upserts the row and sets the cookie with the fixed attributes", async () => {
    queueResult([row("set-by-the-database")]);
    const box = await getOrCreateSandbox(await cookies());

    expect(box.id).toBe("set-by-the-database");
    const [chain] = statements;
    expect(chain?.[0]).toMatchObject({ method: "insert", args: [sandbox] });
    const values = argOf(chain!, "values") as { id: string };
    expect(values.id).toMatch(OPAQUE_ID);
    const conflict = argOf(chain!, "onConflictDoUpdate") as { target: unknown; set: { lastSeenAt: unknown } };
    expect(conflict.target).toBe(sandbox.id);
    expect(compile(conflict.set.lastSeenAt).sql).toBe("now()");
    expect(chain!.some((c) => c.method === "returning")).toBe(true);

    expect(setCookies).toEqual([{ name: SANDBOX_COOKIE, value: values.id, options: SANDBOX_COOKIE_OPTIONS }]);
  });

  it("keeps the browser's existing id, refreshes last_seen_at and renews the thirty days", async () => {
    setRequest({ cookies: { [SANDBOX_COOKIE]: EXISTING } });
    queueResult([row(EXISTING)]);
    const box = await getOrCreateSandbox(await cookies());

    expect(box.id).toBe(EXISTING);
    expect(argOf(statements[0]!, "values")).toEqual({ id: EXISTING });
    expect(setCookies).toEqual([{ name: SANDBOX_COOKIE, value: EXISTING, options: SANDBOX_COOKIE_OPTIONS }]);
  });

  it("ignores a malformed cookie value and mints a fresh id", async () => {
    setRequest({ cookies: { [SANDBOX_COOKIE]: "not-an-opaque-id" } });
    queueResult([row("fresh")]);
    await getOrCreateSandbox(await cookies());
    const values = argOf(statements[0]!, "values") as { id: string };
    expect(values.id).not.toBe("not-an-opaque-id");
    expect(values.id).toMatch(OPAQUE_ID);
  });

  it("fails loudly when the upsert returns no row", async () => {
    queueResult([]);
    await expect(getOrCreateSandbox(await cookies())).rejects.toThrow("sandbox upsert returned no row");
  });
});

describe("getSandbox (anywhere else)", () => {
  it("is null without a cookie, before the first login, and never queries", async () => {
    expect(await getSandbox(await cookies())).toBeNull();
    expect(statements).toHaveLength(0);
  });

  it("reads the row behind the cookie by id and sets nothing", async () => {
    setRequest({ cookies: { [SANDBOX_COOKIE]: EXISTING } });
    queueResult([row(EXISTING, "cv-sandbox")]);
    expect(await getSandbox(await cookies())).toEqual(row(EXISTING, "cv-sandbox"));

    const [chain] = statements;
    expect(chain?.some((c) => c.method === "from" && c.args[0] === sandbox)).toBe(true);
    const where = compile(argOf(chain!, "where"));
    expect(where.sql).toBe('"sandbox"."id" = $1');
    expect(where.params).toEqual([EXISTING]);
    expect(setCookies).toHaveLength(0);
  });

  it("is null when the row is gone", async () => {
    setRequest({ cookies: { [SANDBOX_COOKIE]: EXISTING } });
    queueResult([]);
    expect(await getSandbox(await cookies())).toBeNull();
  });
});

describe("visibleVersionIds (the active lineage plus the sandbox's own version)", () => {
  // v1 (seeded) <- v2 <- v3 (active); s-own is a sandbox's never-activated child of v3; s-other belongs to another browser.
  const versions = [
    { id: "cv-v1", parentVersionId: null, isActive: false },
    { id: "cv-v2", parentVersionId: "cv-v1", isActive: false },
    { id: "cv-v3", parentVersionId: "cv-v2", isActive: true },
    { id: "cv-s-own", parentVersionId: "cv-v3", isActive: false },
    { id: "cv-s-other", parentVersionId: "cv-v3", isActive: false },
  ];

  it("walks the active version to its root, nearest first, then adds the sandbox's version last", async () => {
    queueResult(versions);
    expect(await visibleVersionIds({ corpusVersionId: "cv-s-own" })).toEqual(["cv-v3", "cv-v2", "cv-v1", "cv-s-own"]);
    expect(statements[0]?.some((c) => c.method === "from" && c.args[0] === corpusVersion)).toBe(true);
  });

  it("never includes another browser's version", async () => {
    queueResult(versions);
    expect(await visibleVersionIds({ corpusVersionId: "cv-s-own" })).not.toContain("cv-s-other");
  });

  it("is the lineage alone for a sandbox without a publication and for no sandbox at all", async () => {
    queueResult(versions);
    expect(await visibleVersionIds({ corpusVersionId: null })).toEqual(["cv-v3", "cv-v2", "cv-v1"]);
    queueResult(versions);
    expect(await visibleVersionIds(null)).toEqual(["cv-v3", "cv-v2", "cv-v1"]);
  });

  it("does not repeat the sandbox's version when it is already in the lineage", async () => {
    queueResult(versions);
    expect(await visibleVersionIds({ corpusVersionId: "cv-v2" })).toEqual(["cv-v3", "cv-v2", "cv-v1"]);
  });

  it("is the sandbox's version alone when no version is active", async () => {
    queueResult(versions.map((v) => ({ ...v, isActive: false })));
    expect(await visibleVersionIds({ corpusVersionId: "cv-s-own" })).toEqual(["cv-s-own"]);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
