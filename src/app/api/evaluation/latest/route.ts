// GET /api/evaluation/latest (blueprint 9.7, 9.9, 6.2 surface 10; AC-EVAL-03, AC-EVAL-04, AC-EVAL-06): under
// ask_read through withRoute(), the latest ingested run as { run, categories, failures } exactly as 9.9 pins it.
// `run` is the frozen EvaluationRun, so the surface reads the model ids, prompt versions, rule-pack version,
// corpus version and harness commit from it; `categories` carries all eleven categories of 9.11 with the two
// hard-gated ones first, each with its counts and its pass rate, a category the run holds no case for carrying the
// one fixed sentence; `failures` carries every row whose verdict is not "pass", with its case id, its verdict and
// its reason. The page renders these numbers and computes none of its own. 404 designed JSON while no run is
// ingested. Read-only; the ingest path is POST /api/evaluation/runs under the CI token. egress: none
import { NextResponse, type NextRequest } from "next/server";
import { withRoute } from "@/auth/authorize";
import { EvaluationLatest, latestEvaluation } from "@/db/queries/evaluation";
import { NotFound } from "@/lib/errors";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";

export const dynamic = "force-dynamic";

const ROUTE = "/api/evaluation/latest";

export const GET = withRoute(ROUTE, "ask_read", async (request: NextRequest) => {
  const latest = await latestEvaluation();
  if (!latest) throw new NotFound("evaluation_run");
  return NextResponse.json(EvaluationLatest.parse(latest), {
    headers: { [REQUEST_ID_HEADER]: requestIdOf(request), "cache-control": "private, no-store" },
  });
});
