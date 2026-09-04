// Server-side sessions (ADR-003 second branch, ADR-013, D-07, AC-NFR-08, AC-NFR-18): a row in `session`, an
// 8-hour httpOnly SameSite=Lax cookie carrying the signed opaque id, credentials login only, no self-registration
// and no reset path. Also the browser-scoped sandbox cookie of D-16, issued at login and kept across logouts.
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/contracts/generated/serving";
import { db } from "@/db/client";
import { appUser, sandbox, session } from "@/db/schema";
import { getRequestPath } from "@/lib/request-id";
import {
  SANDBOX_COOKIE,
  SANDBOX_COOKIE_OPTIONS,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_TTL_SECONDS,
  opaqueId,
  signSessionId,
  verifySessionCookie,
} from "./cookie";
import { hashPassword, verifyPassword } from "./password";

// After login the user lands on the tour (D-07), unless a safe `next` path was carried.
export const LANDING_PATH = "/tour";

export type SessionUser = {
  id: string;
  username: string;
  alias: string;
  role: Role;
  sessionId: string;
  expiresAt: Date;
};

// The session behind the request's cookie, or null; memoised per request so a layout, a page and authorize()
// share one query. No cookie means no query, so the keep-alive's /login call never touches the database (D-15).
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const id = verifySessionCookie((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const [row] = await db
    .select({
      id: appUser.id,
      username: appUser.username,
      alias: appUser.alias,
      role: appUser.role,
      sessionId: session.id,
      expiresAt: session.expiresAt,
    })
    .from(session)
    .innerJoin(appUser, eq(session.userId, appUser.id))
    .where(and(eq(session.id, id), gt(session.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
});

// For server components: the session, or a redirect to /login carrying the current path.
export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (user) return user;
  redirect(`/login?next=${encodeURIComponent(await getRequestPath())}`);
}

// A hash compared on every failed lookup, so an unknown username costs the same time as a wrong password.
const uniformHash = hashPassword(opaqueId());

// The user for a valid username and password, or null; the failure is uniform (no username enumeration).
export async function authenticate(
  username: string,
  password: string,
): Promise<Pick<SessionUser, "id" | "username" | "alias" | "role"> | null> {
  const [user] = await db
    .select({ id: appUser.id, username: appUser.username, alias: appUser.alias, role: appUser.role, passwordHash: appUser.passwordHash })
    .from(appUser)
    .where(eq(appUser.username, username))
    .limit(1);
  const ok = await verifyPassword(password, user?.passwordHash ?? (await uniformHash));
  if (!user || !ok) return null;
  await db.update(appUser).set({ lastLogin: new Date() }).where(eq(appUser.id, user.id));
  return { id: user.id, username: user.username, alias: user.alias, role: user.role };
}

// Inserts the session row and sets the signed cookie on the response of the calling route handler.
export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = opaqueId();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_SECONDS * 1000);
  await db.insert(session).values({ id, userId, createdAt, expiresAt });
  (await cookies()).set(SESSION_COOKIE, signSessionId(id), SESSION_COOKIE_OPTIONS);
  return { id, expiresAt };
}

// Deletes the row behind the cookie (if any) and clears the cookie; the sandbox cookie is kept (D-16).
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = verifySessionCookie(jar.get(SESSION_COOKIE)?.value);
  if (id) await db.delete(session).where(eq(session.id, id));
  jar.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
}

const SANDBOX_ID = /^[A-Za-z0-9_-]{43}$/;

// The visitor's sandbox id from the cookie, or null before the first login (D-16).
export async function getSandboxId(): Promise<string | null> {
  const value = (await cookies()).get(SANDBOX_COOKIE)?.value;
  return value && SANDBOX_ID.test(value) ? value : null;
}

// At login: issue the browser's sandbox cookie when it has none, upsert its row and refresh the 30 days.
export async function ensureSandbox(): Promise<string> {
  const jar = await cookies();
  const id = (await getSandboxId()) ?? opaqueId();
  await db
    .insert(sandbox)
    .values({ id })
    .onConflictDoUpdate({ target: sandbox.id, set: { lastSeenAt: new Date() } });
  jar.set(SANDBOX_COOKIE, id, SANDBOX_COOKIE_OPTIONS);
  return id;
}

// A `next` value is honoured only as a same-origin path that is not the login page or an API route.
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/api/")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
