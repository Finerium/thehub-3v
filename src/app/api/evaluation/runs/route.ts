// POST /api/evaluation/runs (blueprint 9.7, 9.9, 9.11; ARCHITECTURE 5 principals, 10, 12; AC-EVAL-02, AC-EVAL-03):
// the CI principal only, `Authorization: Bearer <CI_INGEST_TOKEN>` compared with crypto.timingSafeEqual. Body
// { run: EvaluationRun, results: EvaluationResult[] }, both validated by the generated Zod of 9.7 (strict, so a
// field 9.7 does not name is a 400, never a silent drop). 201 on a fresh ingest, audited as evaluation.run_ingested
// with actor "ci"; 200 with ingested false on a repeat of a run id already stored (idempotent: a retried CI post
// never duplicates or rewrites a stored result). No token and no session is a 401 that is audited first
// (AC-EVAL-03). The token is compared and never logged, never echoed and never carried in a response.
// egress: none. Nothing here computes a pass rate; GET /api/evaluation/latest derives them from the stored rows.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthError, withRoute } from "@/auth/authorize";
import { EvaluationResult, EvaluationRun } from "@/contracts/generated/serving";
import { corpusVersionExists, ingestRun } from "@/db/queries/evaluation";
import { writeAudit } from "@/lib/audit";
import { HttpError, NotFound } from "@/lib/errors";
import { logError } from "@/lib/log";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";

const ROUTE = "/api/evaluation/runs";

const Body = z.object({ run: EvaluationRun, results: z.array(EvaluationResult) }).strict();

// True only for the CI principal: a Bearer value equal, in constant time, to the configured CI_INGEST_TOKEN.
// (The same eight lines guard the job principal in api/admin/corpus/activate; one shared helper when a third
// principal exists, not before.)
function isCi(request: NextRequest): boolean {
  const token = process.env.CI_INGEST_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The audit row behind the 401 (AC-EVAL-03: an unauthenticated post is rejected and audited). Its id is the request
// id, so x-request-id names the audit row. It records that the CI principal was claimed and refused, never the
// presented value. A failed write is logged and never swallows the 401, as recordRoleViolation does for a 403.
async function rejectUnauthenticated(requestId: string): Promise<never> {
  try {
    await writeAudit({
      id: requestId,
      actor_alias: "unauthenticated",
      actor_role: "system",
      action: "auth.role_violation",
      entity: "principal",
      entity_id: "ci",
      payload: { principal: "ci" },
      trace_id: null,
      route: ROUTE,
    });
  } catch (error) {
    logError(requestId, ROUTE, error);
  }
  throw new AuthError(401);
}

export const POST = withRoute(ROUTE, null, async (request: NextRequest) => {
  const requestId = requestIdOf(request);
  if (!isCi(request)) await rejectUnauthenticated(requestId);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body");
  const { run, results } = parsed.data;
  if (results.some((r) => r.run_id !== run.id)) throw new HttpError(400, "run_id_mismatch");
  if (new Set(results.map((r) => r.case_id)).size !== results.length) throw new HttpError(400, "duplicate_case_id");
  if (!(await corpusVersionExists(run.corpus_version_id))) throw new NotFound("corpus_version", run.corpus_version_id);

  const ingested = await ingestRun(run, results);
  if (ingested) {
    await writeAudit({
      id: requestId,
      actor_alias: "ci",
      actor_role: "ci",
      action: "evaluation.run_ingested",
      entity: "evaluation_run",
      entity_id: run.id,
      payload: { run_id: run.id, tier: run.tier, cases: results.length },
      trace_id: null,
      route: ROUTE,
      corpus_version_id: run.corpus_version_id,
    });
  }

  return NextResponse.json(
    { run_id: run.id, results: results.length, ingested },
    { status: ingested ? 201 : 200, headers: { [REQUEST_ID_HEADER]: requestId } },
  );
});
