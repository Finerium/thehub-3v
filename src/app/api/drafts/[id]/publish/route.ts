// POST /api/drafts/:id/publish (blueprint 9.9, INV-3; ARCHITECTURE 8.6; AC-LOOP-08, AC-LOOP-09). The one door to
// G3, and the Manager is the only role that reaches it. A role without the `publish` column is refused here, before
// the gate, and audited twice: `auth.role_violation` is the auth fact of 9.7 and `publication.rejected` is the
// publication fact AC-LOOP-09 names; both carry the request id, so `x-request-id` finds either row.
//
// The session is read once and the matrix asked directly (rather than through withRoute's authorize) because the
// second audit event needs the user the refusal is about. Everything past the check is src/gates/g3.ts: one
// transaction under an advisory lock, whose designed refusals (409 already published, 422 { gate: "G3", reason })
// are typed errors withRoute renders unchanged. egress: none
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, recordRoleViolation, withRoute } from "@/auth/authorize";
import { can } from "@/auth/matrix";
import { getSession } from "@/auth/session";
import { publish } from "@/gates/g3";
import { writeAudit } from "@/lib/audit";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";

export const dynamic = "force-dynamic";
// The route carries the embedding runtime (ARCHITECTURE 6): G3 embeds the published lesson's chunks in the Node lane.
export const maxDuration = 300;

const ROUTE = "/api/drafts/:id/publish";

type Context = { params: Promise<{ id: string }> };

export const POST = withRoute(ROUTE, null, async (request: NextRequest, context: Context) => {
  const requestId = requestIdOf(request);
  const { id } = await context.params;

  const user = await getSession();
  if (!user) throw new AuthError(401);
  if (!can(user.role, "publish")) {
    await recordRoleViolation(user, "publish", ROUTE);
    await writeAudit({
      id: requestId,
      actor_alias: user.alias,
      actor_role: user.role,
      action: "publication.rejected",
      entity: "draft",
      entity_id: id,
      payload: { draft_id: id },
      trace_id: null,
      route: ROUTE,
    });
    throw new AuthError(403);
  }

  const published = await publish(id, { alias: user.alias, role: user.role });
  return NextResponse.json(published, {
    headers: { [REQUEST_ID_HEADER]: requestId, "cache-control": "private, no-store" },
  });
});
