// The route gate (Next.js 16 proxy, Node runtime; the file that was middleware.ts). Every path needs a session
// cookie with a valid signature except the public set of 9.9 under D-07; an unauthenticated page request goes to
// /login?next=<path>, an unauthenticated API request gets 401 JSON. This is a cheap gate, never the authority:
// authorize() in src/auth/authorize.ts reads the session row and the matrix on every handler and server component.
// Every response carries x-request-id; the same id and the pathname travel to handlers as request headers.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionCookie } from "@/auth/cookie";
import { REQUEST_ID_HEADER, REQUEST_PATH_HEADER } from "@/lib/request-id";

// 6.2 surface 14 and 9.9: the reviewer-link route GET /api/auth/tour/:token is not built (D-07).
// POST /api/evaluation/runs is the CI principal's one route (9.9): it authenticates by Bearer CI_INGEST_TOKEN
// inside the handler, compared in constant time, so the cookie gate would refuse it before that check could run.
// POST /api/admin/corpus/activate is the nightly job principal's one route (ARCHITECTURE 10): it authenticates by
// Bearer ADMIN_JOB_TOKEN, compared in constant time inside the route, and is listed here for the same reason as
// the ingest route. Without it this gate answered the job 401 before its own check ever ran, which is what the
// nightly re-assertion had been failing on.
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/health",
  "/robots.txt",
  "/api/evaluation/runs",
  "/api/admin/corpus/activate",
]);

export function proxy(request: NextRequest): NextResponse {
  const requestId = crypto.randomUUID();
  const { pathname, search } = request.nextUrl;
  const authenticated = verifySessionCookie(request.cookies.get(SESSION_COOKIE)?.value) !== null;

  let response: NextResponse;
  if (authenticated || PUBLIC_PATHS.has(pathname)) {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    headers.set(REQUEST_PATH_HEADER, pathname);
    response = NextResponse.next({ request: { headers } });
  } else if (pathname.startsWith("/api/")) {
    response = NextResponse.json({ error: "unauthenticated", request_id: requestId }, { status: 401 });
  } else {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", `${pathname}${search}`);
    response = NextResponse.redirect(login);
  }
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  // Everything except Next's static output, the image optimiser, the favicon and static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf)$).*)"],
};
