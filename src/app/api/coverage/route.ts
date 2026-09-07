// GET /api/coverage (blueprint 9.9): under ask_read through withRoute(), { method, summaries, clusters } of the
// corpus version the visitor sees (the active lineage, or the browser's sandbox recount, D-16), every row validated
// by the generated Zod of 9.5 on the way out. 404 designed JSON when no visible version carries coverage rows.
// Read-only; no write path exists here. egress: none
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getSandbox } from "@/auth/sandbox";
import { CoverageMethod, CoverageSummary, DebtCluster } from "@/contracts/generated/coverage";
import { readCoverageConsole } from "@/db/queries/coverage";
import { NotFound } from "@/lib/errors";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";

export const dynamic = "force-dynamic";

const ROUTE = "/api/coverage";

const CoverageResponse = z
  .object({ method: CoverageMethod, summaries: z.array(CoverageSummary), clusters: z.array(DebtCluster) })
  .strict();

export const GET = withRoute(ROUTE, "ask_read", async (request: NextRequest) => {
  const box = await getSandbox(await cookies());
  const data = await readCoverageConsole(box);
  if (!data) throw new NotFound("coverage_summary");
  const body = CoverageResponse.parse({ method: data.method, summaries: data.summaries, clusters: data.clusters });
  return NextResponse.json(body, {
    headers: { [REQUEST_ID_HEADER]: requestIdOf(request), "cache-control": "private, no-store" },
  });
});
