// GET /api/documents/:id/pages/:n (blueprint 9.9; INV-7, AC-CTX-09, AC-NFR-21): one page derivative per request,
// under the ask_read column through authorize(). The stored metadata-free bytes of the seeded page_derivative row
// (one width, ADR-010) leave as image/webp (or image/png) with Cache-Control private, no-store, so no shared cache
// ever holds a corpus page. 404 designed JSON when the document or the page has no derivative; 400 for a malformed
// id or page number. No bulk, archive or listing route exists beside this one.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getPageDerivative } from "@/db/queries/documents";
import { HttpError, NotFound } from "@/lib/errors";

const Params = z.object({ id: z.string().min(1).max(200), n: z.coerce.number().int().min(1) });

type Context = { params: Promise<{ id: string; n: string }> };

export const GET = withRoute("/api/documents/:id/pages/:n", "ask_read", async (_request: NextRequest, context: Context) => {
  const params = Params.safeParse(await context.params);
  if (!params.success) throw new HttpError(400, "invalid_params");
  const page = await getPageDerivative(params.data.id, params.data.n);
  if (!page) throw new NotFound("page_derivative", `${params.data.id}/${params.data.n}`);
  return new Response(new Uint8Array(page.bytes), {
    headers: {
      "content-type": `image/${page.format}`,
      "content-length": String(page.bytes.byteLength),
      "cache-control": "private, no-store",
    },
  });
});
