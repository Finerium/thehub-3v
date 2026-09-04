// POST /api/auth/login (9.9, public). JSON { username, password } -> session cookie + { alias, role };
// the login page posts the same fields form-encoded and is answered with a 303 (back to /login with the error
// flag, or on to `next` or the landing). The failure is uniform: one status, one wording, no field named.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { LANDING_PATH, authenticate, createSession, ensureSandbox, safeNextPath } from "@/auth/session";
import { log } from "@/lib/log";
import { requestIdOf } from "@/lib/request-id";

const Credentials = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

function isForm(request: NextRequest): boolean {
  const type = request.headers.get("content-type") ?? "";
  return type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
}

async function readBody(request: NextRequest, form: boolean): Promise<Record<string, unknown>> {
  if (form) return Object.fromEntries((await request.formData()).entries());
  const body: unknown = await request.json().catch(() => null);
  return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

export const POST = withRoute("/api/auth/login", null, async (request) => {
  // TODO(T3, AC-NFR-11): rate-limit this route under addr:<ip> (120 per minute) through src/lib/ratelimit.ts;
  // exhaustion renders the designed 429 naming the limit and the reset moment; the failure stays uniform.
  const form = isForm(request);
  const body = await readBody(request, form);
  const next = safeNextPath(body.next);
  const parsed = Credentials.safeParse(body);

  if (!parsed.success && !form) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const user = parsed.success ? await authenticate(parsed.data.username, parsed.data.password) : null;
  if (!user) {
    log.info({ event: "auth.login_failed", request_id: requestIdOf(request) });
    if (!form) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    const back = new URL("/login", request.nextUrl);
    back.searchParams.set("error", "1");
    if (typeof body.username === "string" && body.username.length <= 64) back.searchParams.set("username", body.username);
    if (next) back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  }

  await createSession(user.id);
  await ensureSandbox();
  log.info({ event: "auth.login", request_id: requestIdOf(request), role_alias: user.alias, role: user.role });
  if (form) return NextResponse.redirect(new URL(next ?? LANDING_PATH, request.nextUrl), 303);
  return NextResponse.json({ alias: user.alias, role: user.role });
});
