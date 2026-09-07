// GET /api/assets/:tag (blueprint 9.9, 6.2 surface 5; AC-CTX-01 to 03): under the ask_read column through
// withRoute (every role holds it), the asset page's own read: { equipment, area, documents, edges, interlock,
// rows, permissives, params, tags, hotspots, lessons, integrity_findings, citations } from the seeded database of
// the corpus versions this visitor sees (the active lineage plus the browser's own sandbox version, D-16). The
// hotspots and their provenance travel from the P&ID sidecar; `pid_page_available` says whether the underlay has a
// stored derivative, which GET /api/documents/:id/pages/:n serves one page at a time (INV-7) and never this route.
//
// The 9.9 shape also lists operational_context, ladders, proof_tests, bom_matches, connectors and simulated: those
// panels are read by the tracks that own them (proof tests and bill-of-material matches already travel on
// GET /api/assets/:tag/failures), so this route emits the keys its own surface renders and invents none.
// 404 designed JSON for an unknown tag; 400 for a malformed tag.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getSandbox, visibleVersionIds } from "@/auth/sandbox";
import { readAsset } from "@/db/queries/assets";
import { preferenceOrder } from "@/db/queries/failures";
import { HttpError, NotFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

const Params = z.object({ tag: z.string().min(1).max(64) });

type Context = { params: Promise<{ tag: string }> };

export const GET = withRoute("/api/assets/:tag", "ask_read", async (_request: NextRequest, context: Context) => {
  const params = Params.safeParse(await context.params);
  if (!params.success) throw new HttpError(400, "invalid_params");

  const box = await getSandbox(await cookies());
  const versions = preferenceOrder(await visibleVersionIds(box), box?.corpusVersionId ?? null);
  const asset = await readAsset(params.data.tag, versions);
  if (!asset) throw new NotFound("equipment", params.data.tag);

  return NextResponse.json(
    {
      equipment: asset.equipment,
      area: asset.area,
      documents: asset.documents,
      edges: asset.edges,
      interlock: asset.interlock,
      rows: asset.rows,
      permissives: asset.permissives,
      params: asset.params,
      tags: asset.tags,
      hotspots: asset.sidecar,
      pid_page_available: asset.pid_page_available,
      lessons: asset.lessons,
      integrity_findings: asset.integrity_findings,
      citations: asset.citations,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
});
