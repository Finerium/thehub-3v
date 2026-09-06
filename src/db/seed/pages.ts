// Family: pages/ (ARCHITECTURE 3.1 page_derivative; ADR-010, ADR-011), a seed-time artefact (D-17): the
// metadata-free renders at one width, one row per page, bytes from pages/<document_id>/<n>.<format>, keyed by
// pages/index.json (document_id, source_sha256, page_count). Stale directories not named by the index are
// ignored. Absent under --public-only.
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { pageDerivative } from "@/db/schema";
import type { Bundle } from "@/gates/g1";
import { upsert, type FamilyResult } from "./upsert";

// One render is up to about 200 KB; five rows keep a statement near one megabyte.
const PAGE_BATCH = 5;
const SAFE_ID = /^[A-Za-z0-9_.-]+$/;

export async function seedPages(tx: Tx, b: Bundle): Promise<FamilyResult> {
  if (b.pagesIndex === null) return { rows: { page_derivative: 0 }, notes: ["pages/ absent (public release): no page derivative written"] };
  const { width, format } = b.pagesIndex;
  const rows: (typeof pageDerivative.$inferInsert)[] = [];
  for (const d of b.pagesIndex.documents) {
    if (!SAFE_ID.test(d.document_id)) throw new Error(`pages/index.json names a document id that is not a plain name: ${d.document_id}`);
    for (let n = 1; n <= d.page_count; n += 1) {
      const file = path.join(b.dir, "pages", d.document_id, `${n}.${format}`);
      rows.push({ documentId: d.document_id, page: n, width, format, sourceSha256: d.source_sha256, bytes: readFileSync(file) });
    }
  }
  const n = await upsert(tx, pageDerivative, rows, [pageDerivative.documentId, pageDerivative.page, pageDerivative.width], { batch: PAGE_BATCH });
  // Round trip of the first render: the stored byte count equals the file's, so the bytea encoding is right.
  const first = rows[0];
  if (first) {
    const [stored] = await tx
      .select({ length: sql<number>`length(${pageDerivative.bytes})`.mapWith(Number) })
      .from(pageDerivative)
      .where(and(eq(pageDerivative.documentId, first.documentId), eq(pageDerivative.page, first.page), eq(pageDerivative.width, first.width)));
    if (stored?.length !== first.bytes.length) {
      throw new Error(`page_derivative ${first.documentId} page ${first.page}: ${stored?.length ?? "no"} bytes stored, ${first.bytes.length} read`);
    }
  }
  return { rows: { page_derivative: n } };
}
