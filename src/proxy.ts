// The route gate (Next.js 16 proxy, Node runtime; the file that was middleware.ts). Every path needs a session
// cookie with a valid signature except the public set of 9.9 under D-07; an unauthenticated page request goes to
// /login?next=<path>, an unauthenticated API request gets 401 JSON. This is a cheap gate, never the authority:
// authorize() in src/auth/authorize.ts reads the session row and the matrix on every handler and server component.
// Every response carries x-request-id; the same id and the pathname travel to handlers as request headers.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionCookie } from "@/auth/cookie";
import { REQUEST_ID_HEADER, REQUEST_PATH_HEADER } from "@/lib/request-id";

// 6.2 surface 14 and 9.9: the reviewer-link route GET /api/auth/tour/:token is not built (D-07).
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/health", "/robots.txt"]);

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
