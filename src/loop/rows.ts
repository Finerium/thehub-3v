// Section 5 of a draft (blueprint 9.6 "Opl carries TroubleshootingRow", 9.5 TroubleshootingRow, 9.16 AG-3
// `troubleshooting_rows`; AC-LOOP-04). AG-3 returns the troubleshooting table as rows rather than as elements,
// because a row is three quoted cells and the work order they came from, not one sentence under one provenance, so
// it does not fit draft_field. Both ends of the loop meet here: the drafting lane writes the rows of the round it
// just drafted, and G3 reads them back to compose and publish the lesson's section 5.
//
// The two handles are deliberate. The drafting lane writes through the HTTP client, one statement at a time, the
// same way it writes draft_field; G3 reads inside its own transaction, so the rows it publishes are the rows the
// locked draft carries. Both are Drizzle handles over the same schema, so one union serves both.
import { asc, eq } from "drizzle-orm";
import type { AG3Output } from "@/contracts/generated/gateway";
import type { Db, Tx } from "@/db/client";
import { draftTroubleshootingRow } from "@/db/schema";

/** The request-scoped client or an open transaction: every caller of this module holds one or the other. */
type Handle = Db | Tx;

/** One stored row, in the column spelling of the table. */
export type TroubleshootingRowRow = typeof draftTroubleshootingRow.$inferSelect;

/** One row as AG-3 returns it (9.16): the three cells and the work order every one of them quotes. */
export type DraftedTroubleshootingRow = AG3Output["troubleshooting_rows"][number];

/**
 * Replace the draft's section 5 with `rows`, numbered from 1 in the order AG-3 returned them. A redline round
 * rewrites the whole body, so this replaces the previous round's rows exactly as src/loop/draft.ts replaces the
 * previous round's fields; calling it with an empty list leaves the draft with no section 5, which is what a
 * cluster with nothing to quote produces.
 *
 * `truncated` is false on every row. The flag of 9.5 marks a row the extractor cut at the page-bottom watermark,
 * and a drafted row is composed rather than extracted, so nothing here can be cut.
 */
export async function saveTroubleshootingRows(
  tx: Handle,
  draftId: string,
  rows: readonly DraftedTroubleshootingRow[],
): Promise<void> {
  await tx.delete(draftTroubleshootingRow).where(eq(draftTroubleshootingRow.draftId, draftId));
  if (rows.length === 0) return;
  await tx.insert(draftTroubleshootingRow).values(
    rows.map((row, index) => ({
      draftId,
      n: index + 1,
      problem: row.problem,
      cause: row.cause,
      action: row.action,
      quotedWoNumber: row.quoted_wo_number,
      truncated: false,
    })),
  );
}

/** The draft's section 5 rows in table order. */
export async function troubleshootingRows(handle: Handle, draftId: string): Promise<TroubleshootingRowRow[]> {
  return handle
    .select()
    .from(draftTroubleshootingRow)
    .where(eq(draftTroubleshootingRow.draftId, draftId))
    .orderBy(asc(draftTroubleshootingRow.n));
}
