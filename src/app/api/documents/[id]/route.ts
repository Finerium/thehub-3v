// GET /api/documents/:id?include_superseded= (blueprint 9.9, 6.2 surface 4; INV-7, AC-CTX-09): under the ask_read
// column through authorize() (every role holds it), { document, revisions, assets, integrity_findings, page_anchors }
// from the seeded database and never file bytes. revisions carries the current revision only; include_superseded=true
// adds the superseded history, which 9.2 makes reachable only through the labelled history toggle. 404 designed JSON
// for an unknown id; 400 for a malformed id or query.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getDocument } from "@/db/queries/documents";
import { HttpError, NotFound } from "@/lib/errors";

const Params = z.object({ id: z.string().min(1).max(200) });
const Query = z.object({ include_superseded: z.enum(["true", "false", "1", "0"]).default("false") });

type Context = { params: Promise<{ id: string }> };

export const GET = withRoute("/api/documents/:id", "ask_read", async (request: NextRequest, context: Context) => {
  const params = Params.safeParse(await context.params);
  if (!params.success) throw new HttpError(400, "invalid_params");
  const query = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) throw new HttpError(400, "invalid_query");
  const includeSuperseded = query.data.include_superseded === "true" || query.data.include_superseded === "1";
  const detail = await getDocument(params.data.id, includeSuperseded);
  if (!detail) throw new NotFound("document", params.data.id);
  return NextResponse.json(detail, { headers: { "cache-control": "private, no-store" } });
});
