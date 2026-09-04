// The session cookie: 8-hour lifetime (9.7 Session.expires_at = created + 8 h), the HMAC signature and its
// rejection of anything forged or from another AUTH_SECRET.
import { afterEach, describe, expect, it } from "vitest";
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

const EIGHT_HOURS_IN_SECONDS = 8 * 60 * 60;
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
const secretAtStart = process.env.AUTH_SECRET;

afterEach(() => {
  process.env.AUTH_SECRET = secretAtStart;
});

describe("session cookie lifetime", () => {
  it("is eight hours, on the constant and on the cookie", () => {
    expect(SESSION_TTL_SECONDS).toBe(EIGHT_HOURS_IN_SECONDS);
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBe(EIGHT_HOURS_IN_SECONDS);
  });

  it("is httpOnly, SameSite=Lax and site-wide (NFR-08)", () => {
    expect(SESSION_COOKIE).toBe("thehub_session");
    expect(SESSION_COOKIE_OPTIONS).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("the sandbox cookie lives thirty days and is httpOnly (D-16)", () => {
    expect(SANDBOX_COOKIE).toBe("thehub_sandbox");
    expect(SANDBOX_COOKIE_OPTIONS).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: THIRTY_DAYS_IN_SECONDS });
  });
});

describe("opaque ids", () => {
  it("are 32 random bytes as base64url, 43 characters without a dot", () => {
    const a = opaqueId();
    const b = opaqueId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe("signature", () => {
  it("round-trips a signed id", () => {
    const id = opaqueId();
    expect(verifySessionCookie(signSessionId(id))).toBe(id);
  });

  it("rejects an absent, empty or dot-less value", () => {
    expect(verifySessionCookie(undefined)).toBeNull();
    expect(verifySessionCookie("")).toBeNull();
    expect(verifySessionCookie("no-dot-here")).toBeNull();
    expect(verifySessionCookie(".signature-only")).toBeNull();
  });

  it("rejects a tampered id and a tampered signature", () => {
    const signed = signSessionId(opaqueId());
    const [id, sig] = signed.split(".");
    expect(verifySessionCookie(`${id.slice(0, -1)}x.${sig}`)).toBeNull();
    expect(verifySessionCookie(`${id}.${sig.slice(0, -1)}x`)).toBeNull();
    expect(verifySessionCookie(`${id}.${sig.slice(0, -2)}`)).toBeNull();
    expect(verifySessionCookie(`${id}.`)).toBeNull();
  });

  it("a rotated AUTH_SECRET invalidates every cookie signed before it", () => {
    const signed = signSessionId(opaqueId());
    process.env.AUTH_SECRET = `${secretAtStart}-rotated`;
    expect(verifySessionCookie(signed)).toBeNull();
  });

  it("refuses to sign without AUTH_SECRET", () => {
    delete process.env.AUTH_SECRET;
    expect(() => signSessionId("id")).toThrow("AUTH_SECRET is not set");
  });
});
