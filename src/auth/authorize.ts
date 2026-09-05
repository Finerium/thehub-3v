// The one authority (ARCHITECTURE section 5): authorize(permission) reads the session and the 9.9 matrix; a
// missing session is a typed 401, a role without the column is a typed 403 that first writes auth.role_violation
// (9.7). withRoute() wraps a route handler with authorize, the request id, the one log line per request and the
// mapping of typed errors to responses, so no handler repeats that and no 5xx ever carries a stack trace.
import { NextResponse, type NextRequest } from "next/server";
import { writeAudit } from "@/lib/audit";
import { HttpError } from "@/lib/errors";
import { logError, logRequest } from "@/lib/log";
import { REQUEST_ID_HEADER, getRequestId, getRequestPath, requestIdOf } from "@/lib/request-id";
import { can, type Permission } from "./matrix";
import { getSession, type SessionUser } from "./session";

export class AuthError extends Error {
  readonly status: 401 | 403;
  readonly code: "unauthenticated" | "forbidden";

  constructor(status: 401 | 403) {
    const code = status === 401 ? "unauthenticated" : "forbidden";
    super(code);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }

  toResponse(requestId: string): NextResponse {
    return NextResponse.json(
      { error: this.code, request_id: requestId },
      { status: this.status, headers: { [REQUEST_ID_HEADER]: requestId } },
    );
  }
}

// The audit event behind every 403; its id is the request id, so x-request-id names the audit row (9.9).
// A page that renders the designed 403 state instead of throwing calls this itself.
export async function recordRoleViolation(user: SessionUser, permission: Permission, route: string): Promise<void> {
  const requestId = await getRequestId();
  try {
    await writeAudit({
      id: requestId,
      actor_alias: user.alias,
      actor_role: user.role,
      action: "auth.role_violation",
      entity: "permission",
      entity_id: permission,
      payload: { permission, role: user.role },
      trace_id: null,
      route,
    });
  } catch (error) {
    logError(requestId, route, error);
  }
}

// Returns the user holding the permission, or throws AuthError (401 without a session, 403 without the column).
// `route` defaults to the pathname the proxy forwarded; a route handler passes its pattern instead.
export async function authorize(permission: Permission, options: { route?: string } = {}): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new AuthError(401);
  if (!can(user.role, permission)) {
    await recordRoleViolation(user, permission, options.route ?? (await getRequestPath()));
    throw new AuthError(403);
  }
  return user;
}

type RouteHandler<Ctx> = (request: NextRequest, context: Ctx) => Promise<Response>;
type UserFor<P extends Permission | null> = P extends null ? null : SessionUser;

// withRoute("/api/drafts", "create_draft", async (request, context, user) => ...): the user is typed non-null
// when a permission is named; a public route (permission null) gets null and never looks the session up, so
// /api/health holds no session (6.2 surface 14).
export function withRoute<Ctx, P extends Permission | null>(
  route: string,
  permission: P,
  handler: (request: NextRequest, context: Ctx, user: UserFor<P>) => Promise<Response>,
): RouteHandler<Ctx> {
  return async (request, context) => {
    const started = performance.now();
    const requestId = requestIdOf(request);
    let status = 500;
    let alias: string | null = null;
    try {
      const user = (permission === null ? null : await authorize(permission, { route })) as UserFor<P>;
      alias = user?.alias ?? null;
      const response = await handler(request, context, user);
      status = response.status;
      return response;
    } catch (error) {
      if (error instanceof AuthError || error instanceof HttpError) {
        status = error.status;
        return error.toResponse(requestId);
      }
      logError(requestId, route, error);
      return NextResponse.json(
        { error: "internal", request_id: requestId },
        { status: 500, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    } finally {
      logRequest({
        request_id: requestId,
        route,
        method: request.method,
        status,
        role_alias: alias,
        duration_ms: Math.round(performance.now() - started),
      });
    }
  };
}
