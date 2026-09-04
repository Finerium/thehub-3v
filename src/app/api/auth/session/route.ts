// GET /api/auth/session (9.9): { alias, role, expires_at } for the request's session, or 401.
import { NextResponse } from "next/server";
import { AuthError, withRoute } from "@/auth/authorize";
import { getSession } from "@/auth/session";

export const GET = withRoute("/api/auth/session", null, async () => {
  const user = await getSession();
  if (!user) throw new AuthError(401);
  return NextResponse.json({ alias: user.alias, role: user.role, expires_at: user.expiresAt.toISOString() });
});
