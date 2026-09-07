// The P&ID sidecar read (blueprint 9.3 PidSidecar, ARCHITECTURE 7 step 8; deviation D-12 and ADR-007). The eight
// sheets are images: `pdftotext -raw` extracts nothing from them, so a P&ID revision carries no span, no chunk and
// therefore no Citation of its own. What the sheets state reaches the lane only through the adopted sidecars, and
// those were transcribed by an agent under the alias EXEC-1 with review_status "pending": every reading served from
// one says so, and none of them is ever given the citation of another document (INV-3, "provenance or nothing").
//
// This is a keyed read by document id, the same shape as every other read of the answer lane. It lives outside
// src/db/queries/retrieval.ts on purpose: tests/fixtures/answer/asset.ts declares its in-memory fake as
// `typeof import("@/db/queries/retrieval")`, so a new value export there would make that fixture (a test-author
// file) fail to compile and the mocked module would answer undefined at run time.
import { asc, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pidSidecar } from "@/db/schema";

export type PidSidecarRow = typeof pidSidecar.$inferSelect;

/** The sidecars of the given P&ID documents, by set number. An empty id list returns empty without a round trip. */
export async function pidSidecarsOf(db: Db, documentIds: readonly string[]): Promise<PidSidecarRow[]> {
  const distinct = [...new Set(documentIds)];
  if (distinct.length === 0) return [];
  return db
    .select()
    .from(pidSidecar)
    .where(inArray(pidSidecar.documentId, distinct))
    .orderBy(asc(pidSidecar.set));
}
