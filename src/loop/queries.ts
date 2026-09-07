// What the drafting routes need beyond the shared reader (blueprint 9.6, 9.9; ARCHITECTURE 8.2, 8.5). The draft,
// its fields, its verdicts, its transitions and the five row mappers live in src/db/queries/loop.ts and are read
// through it; only three things are the drafting lane's own and live here: the lease a new draft takes, the review
// queue with its ordering, and the lesson id a new draft reserves.
import { eq, sql, type SQL } from "drizzle-orm";
import type { Sandbox } from "@/auth/sandbox";
import type { DraftState } from "@/contracts/generated/drafts";
import { db } from "@/db/client";
import type { DraftRow } from "@/db/queries/loop";
import { draftDocument, opl } from "@/db/schema";
import { LEASE_SECONDS } from "./lease";
import { visibleScope } from "./scope";

/** The lease every new draft takes, measured by the database clock, never by the process clock (ADR-004). */
export function leaseExpiry(): SQL {
  return sql`now() + make_interval(secs => ${LEASE_SECONDS})`;
}

// The queue puts the work waiting on a person first and the finished work last, so a state that needs a decision is
// never buried under published drafts.
const QUEUE_ORDER = sql`case ${draftDocument.state}
  when 'in_review' then 0 when 'accepted' then 1 when 'blocked' then 2 when 'rejected' then 3
  when 'proposed' then 4 when 'drafted' then 5 when 'redlined' then 6 else 7 end`;

export async function queueInScope(box: Pick<Sandbox, "id"> | null): Promise<DraftRow[]> {
  return db.select().from(draftDocument).where(visibleScope(box)).orderBy(QUEUE_ORDER, draftDocument.id);
}

// The lesson ids the asset already uses: its published lessons and the ids other drafts reserve. One read, because
// opl_id_reserved is unique across drafts and a new draft may take neither.
export async function usedOplIds(equipmentTag: string): Promise<string[]> {
  const rows = await db
    .select({ oplId: opl.oplId })
    .from(opl)
    .where(eq(opl.equipmentTag, equipmentTag))
    .union(
      db
        .select({ oplId: draftDocument.oplIdReserved })
        .from(draftDocument)
        .where(eq(draftDocument.equipmentTag, equipmentTag)),
    );
  return rows.map((row) => row.oplId);
}

// ponytail: two visitors reserving at the same moment race, and the unique column refuses the loser; a retry around
// the insert is the upgrade if the demo ever runs two browsers against one asset in the same second.
export function nextOplId(equipmentTag: string, used: readonly string[]): string {
  const prefix = `OPL-${equipmentTag}-`;
  const highest = used.reduce((max, id) => {
    const n = id.startsWith(prefix) ? Number.parseInt(id.slice(prefix.length), 10) : Number.NaN;
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(2, "0")}`;
}

/** 9.6: the two states a draft may be re-proposed from. */
export const REPROPOSABLE: readonly DraftState[] = ["blocked", "rejected"];
