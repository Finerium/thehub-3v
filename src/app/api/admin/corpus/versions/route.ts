// GET /api/admin/corpus/versions (9.9, 6.2 surface 13): CorpusVersion[] under the activate_version column, which
// only Admin holds; any other role is a 403 with auth.role_violation from authorize(). Paginated like every list
// route (?page=&page_size=, default 50, maximum 200).
import { NextResponse } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { listVersions } from "@/db/versions";

const Query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = withRoute("/api/admin/corpus/versions", "activate_version", async (request) => {
  const query = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  return NextResponse.json(await listVersions(query.data.page, query.data.page_size));
});
