// GET /api/assets/:tag/failures?page=&page_size=&work_type=&breakdown= (blueprint 9.9, 6.2 surface 6; AC-FM-01 to
// 07): under the ask_read column through withRoute (every role holds it), { history: WorkOrder[], events:
// FailureEvent[], chains: CausalLink[], families: FailureFamily[], precedent } read from the seeded database. The
// history is paginated like every list route (default 50, maximum 200) and filterable by work type and breakdown
// flag, the way the surface filters it; the package artefacts (links, families, precedent) travel whole and are
// never computed here. 404 designed JSON for an unknown tag; 400 for a malformed query.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getSandbox, visibleVersionIds } from "@/auth/sandbox";
import { WORK_TYPES, assetFailureMemory, preferenceOrder } from "@/db/queries/failures";
import { HttpError, NotFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

const Params = z.object({ tag: z.string().min(1).max(64) });
const Query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  work_type: z.enum(WORK_TYPES).optional(),
  breakdown: z.enum(["true", "false", "1", "0"]).optional(),
});

type Context = { params: Promise<{ tag: string }> };

export const GET = withRoute("/api/assets/:tag/failures", "ask_read", async (request: NextRequest, context: Context) => {
  const params = Params.safeParse(await context.params);
  if (!params.success) throw new HttpError(400, "invalid_params");
  const query = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) throw new HttpError(400, "invalid_query");
  const { page, page_size, work_type, breakdown } = query.data;

  const box = await getSandbox(await cookies());
  const versions = preferenceOrder(await visibleVersionIds(box), box?.corpusVersionId ?? null);
  const memory = await assetFailureMemory(
    params.data.tag,
    { work_type, breakdown: breakdown === undefined ? undefined : breakdown === "true" || breakdown === "1" },
    versions,
    page,
    page_size,
  );
  if (!memory) throw new NotFound("equipment", params.data.tag);

  return NextResponse.json(
    {
      history: memory.history.map((h) => h.record),
      events: memory.events,
      chains: memory.chains,
      families: memory.families,
      precedent: memory.precedent,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
});
