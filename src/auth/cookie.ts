// Cookie names, attributes and the session-cookie signature. No database import: src/proxy.ts uses this module to
// verify cookie presence and signature before a request reaches a handler (ARCHITECTURE section 5, decision 11).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// 9.7 Session.expires_at = created + 8 h; the cookie carries the same lifetime (NFR-08, ADR-003).
export const SESSION_COOKIE = "thehub_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

// D-16: the guided-loop sandbox is scoped to the visitor's browser, not the login session; issued at first login,
// kept across logouts, 30 days.
export const SANDBOX_COOKIE = "thehub_sandbox";
export const SANDBOX_TTL_SECONDS = 30 * 24 * 60 * 60;

// Secure is dropped only for `next dev` over plain http; every deployment is https.
const secure = process.env.NODE_ENV === "production";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
} as const;

export const SANDBOX_COOKIE_OPTIONS = {
  httpOnly: true,
  secure,
  sameSite: "lax",
  path: "/",
  maxAge: SANDBOX_TTL_SECONDS,
} as const;

// 32 random bytes, base64url (43 characters, no dot), the opaque id of a session or a sandbox.
export function opaqueId(): string {
  return randomBytes(32).toString("base64url");
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

function signature(id: string): string {
  return createHmac("sha256", authSecret()).update(id).digest("base64url");
}

// Cookie value `<id>.<hmac_sha256(id, AUTH_SECRET)>`: rotating AUTH_SECRET invalidates every cookie at once.
export function signSessionId(id: string): string {
  return `${id}.${signature(id)}`;
}

// The session id carried by a cookie value, or null when the value is absent, malformed or forged.
export function verifySessionCookie(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(signature(id));
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? id : null;
}
