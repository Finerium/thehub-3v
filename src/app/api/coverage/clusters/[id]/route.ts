// GET /api/coverage/clusters/:id (blueprint 9.9): under ask_read through withRoute(), the DebtCluster of the
// visitor's visible corpus version with its assessments (both layers of every uncovered work order) and the
// matched unit per work order, validated by ClusterDetail on the way out. 400 for a malformed id, 404 designed
// JSON for an id no visible version carries. Read-only; no write path exists here. egress: none
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getSandbox } from "@/auth/sandbox";
import { readCluster, toClusterDetail } from "@/db/queries/coverage";
import { HttpError, NotFound } from "@/lib/errors";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";

export const dynamic = "force-dynamic";

const ROUTE = "/api/coverage/clusters/:id";

const Params = z.object({ id: z.string().min(1).max(200) });

type Context = { params: Promise<{ id: string }> };

export const GET = withRoute(ROUTE, "ask_read", async (request: NextRequest, context: Context) => {
  const params = Params.safeParse(await context.params);
  if (!params.success) throw new HttpError(400, "invalid_params");
  const page = await readCluster(params.data.id, await getSandbox(await cookies()));
  if (!page) throw new NotFound("debt_cluster", params.data.id);
  return NextResponse.json(toClusterDetail(page), {
    headers: { [REQUEST_ID_HEADER]: requestIdOf(request), "cache-control": "private, no-store" },
  });
});
