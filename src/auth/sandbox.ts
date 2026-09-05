// The visitor's browser-scoped sandbox (D-16, ARCHITECTURE 8.5, AC-LOOP-13): a row in `sandbox` named by the
// thehub_sandbox cookie (32 random bytes base64url; HttpOnly, Secure in production, SameSite=Lax, Path=/, 30 days),
// issued at login and kept across logouts (src/auth/cookie.ts holds the attributes). visibleVersionIds() is the one
// definition of which corpus versions a visitor sees: the active lineage plus the sandbox's own never-activated
// child version, so one visitor's publication never reaches another's numbers.
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { corpusVersion, sandbox } from "@/db/schema";
import { lineageOf } from "@/db/versions";
import { SANDBOX_COOKIE, SANDBOX_COOKIE_OPTIONS, opaqueId } from "./cookie";

export type Sandbox = typeof sandbox.$inferSelect;

// What this module needs of a cookie jar: the request's jar (next/headers) in a route handler, the fake under Vitest.
export type CookieJar = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: typeof SANDBOX_COOKIE_OPTIONS): unknown;
};

const SANDBOX_ID = /^[A-Za-z0-9_-]{43}$/;

function cookieId(jar: Pick<CookieJar, "get">): string | null {
  const value = jar.get(SANDBOX_COOKIE)?.value;
  return value && SANDBOX_ID.test(value) ? value : null;
}

// At login (a route handler, where a cookie can be set): the row behind the cookie with last_seen_at refreshed, or a
// new row and cookie when the browser has none; the cookie's 30 days are renewed either way.
export async function getOrCreateSandbox(jar: CookieJar): Promise<Sandbox> {
  const id = cookieId(jar) ?? opaqueId();
  const [row] = await db
    .insert(sandbox)
    .values({ id })
    .onConflictDoUpdate({ target: sandbox.id, set: { lastSeenAt: sql`now()` } })
    .returning();
  if (!row) throw new Error("sandbox upsert returned no row");
  jar.set(SANDBOX_COOKIE, id, SANDBOX_COOKIE_OPTIONS);
  return row;
}

// Anywhere else (a server component cannot set a cookie): the row behind the cookie, or null before the first login.
export async function getSandbox(jar: Pick<CookieJar, "get">): Promise<Sandbox | null> {
  const id = cookieId(jar);
  if (!id) return null;
  const [row] = await db.select().from(sandbox).where(eq(sandbox.id, id)).limit(1);
  return row ?? null;
}

// The active version and its ancestors (nearest first), then the sandbox's own version when it has one.
export async function visibleVersionIds(box: Pick<Sandbox, "corpusVersionId"> | null): Promise<string[]> {
  const rows = await db
    .select({ id: corpusVersion.id, parentVersionId: corpusVersion.parentVersionId, isActive: corpusVersion.isActive })
    .from(corpusVersion);
  const ids = lineageOf(rows, rows.find((r) => r.isActive)?.id);
  const own = box?.corpusVersionId ?? null;
  if (own !== null && !ids.includes(own)) ids.push(own);
  return ids;
}
