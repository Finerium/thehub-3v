// POST /api/auth/logout (9.9): deletes the session row and clears thehub_session; thehub_sandbox stays (D-16).
// A form post (the guided route's role switch, ARCHITECTURE 8.5) is sent back to /login with the username
// prefilled and the `next` path carried; a JSON client gets { ok: true }.
import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/auth/authorize";
import { destroySession, safeNextPath } from "@/auth/session";

export const POST = withRoute("/api/auth/logout", null, async (request: NextRequest) => {
  const type = request.headers.get("content-type") ?? "";
  const form = type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
  await destroySession();
  if (!form) return NextResponse.json({ ok: true });

  const fields = await request.formData();
  const login = new URL("/login", request.nextUrl);
  const username = fields.get("username");
  const next = safeNextPath(fields.get("next"));
  if (typeof username === "string" && username.length > 0 && username.length <= 64) login.searchParams.set("username", username);
  if (next) login.searchParams.set("next", next);
  return NextResponse.redirect(login, 303);
});
