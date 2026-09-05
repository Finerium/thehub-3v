// POST /api/admin/corpus/activate { version_id } (9.9, ARCHITECTURE 2, 5, 10; AC-ING-10, AC-LOOP-13): the Admin
// session under the activate_version column, or the nightly job under `Authorization: Bearer <ADMIN_JOB_TOKEN>`
// (crypto.timingSafeEqual), audited as actor "job:nightly-activation" with role "job". Any other role is a 403 with
// auth.role_violation from authorize(); no session and no valid token is a 401. 200 with the activated
// CorpusVersion; 404 not_found for an unknown id. The audit event id is the request id, so x-request-id names it.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { ACTIVATE_ROUTE, activate, type Actor } from "@/db/versions";
import { HttpError } from "@/lib/errors";
import { requestIdOf } from "@/lib/request-id";

const Body = z.object({ version_id: z.string().min(1).max(200) });

export const JOB_ACTOR: Actor = { alias: "job:nightly-activation", role: "job" };

// True only for the job principal: a Bearer value equal, in constant time, to the configured ADMIN_JOB_TOKEN.
function isJob(request: NextRequest): boolean {
  const token = process.env.ADMIN_JOB_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: NextRequest, actor: Actor): Promise<Response> {
  const requestId = requestIdOf(request);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    return NextResponse.json(await activate(body.data.version_id, actor, { auditId: requestId, route: ACTIVATE_ROUTE }));
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse(requestId);
    throw error;
  }
}

const asJob = withRoute(ACTIVATE_ROUTE, null, (request) => run(request, JOB_ACTOR));
const asAdmin = withRoute(ACTIVATE_ROUTE, "activate_version", (request, _context, user) =>
  run(request, { alias: user.alias, role: user.role }),
);

export const POST = (request: NextRequest, context: unknown): Promise<Response> =>
  (isJob(request) ? asJob : asAdmin)(request, context);
