// GET /api/assets?page=&page_size= (blueprint 9.9, 6.2 surface 5; AC-CTX-01): under the ask_read column through
// withRoute (every role holds it), the fleet register as the joined Equipment summary the surface renders: the
// equipment row of 9.3, the area's workbook name, the cause-and-effect sheet's LOGIC No, kind and SIL, the counted
// work orders, the recorded unplanned and breakdown-flagged hours of the failure_event rows, the lesson and open
// finding counts, and the workbook row of fixtures.json each line reconciles against. Ordered by tag and never
// ranked (Case 1). Paginated like every list route (default 50, maximum 200); 400 for a malformed query.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { readFleet, reconciled } from "@/db/queries/assets";
import { HttpError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const Query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = withRoute("/api/assets", "ask_read", async (request: NextRequest) => {
  const query = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) throw new HttpError(400, "invalid_query");
  const { page, page_size } = query.data;

  const fleet = await readFleet();
  const start = (page - 1) * page_size;
  return NextResponse.json(
    {
      assets: fleet.rows.slice(start, start + page_size).map((row) => ({
        equipment: row.equipment,
        area_workbook_name: row.area_workbook_name,
        interlock: row.interlock,
        work_orders: row.work_orders,
        unplanned_rows: row.unplanned_rows,
        planned_flagged_rows: row.planned_flagged_rows,
        unplanned_hours: row.unplanned_hours,
        flagged_hours: row.flagged_hours,
        lessons: row.lessons,
        open_findings: row.open_findings,
        workbook: row.workbook,
        reconciled: reconciled(row),
      })),
      totals: fleet.totals,
      fixture_available: fleet.fixture_available,
      page,
      page_size,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
});
