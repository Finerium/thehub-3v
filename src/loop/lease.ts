// The drafting lease (ADR-004, blueprint 9.6 "any non-terminal -> blocked with reason deadline_exceeded (system,
// lease expiry)"; ARCHITECTURE 8.2; AC-LOOP-14, AC-LOOP-15). POST /api/drafts writes lease_expires_at = now + 240 s
// and answers 202; the client polls GET /api/drafts/:id, and a poll that finds a non-terminal draft past its lease
// moves it to blocked with reason deadline_exceeded, so no draft is stranded by an invocation that died and the
// blocked draft is re-proposable. The move goes through src/loop/state.ts, the one writer of the state, which
// writes the draft_transition row and the audit event; this module decides only whether the lease is up. The
// comparison is made by the database clock (now() inside the predicate), never by the process clock, so a lease
// written by one invocation and read by another cannot disagree.
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { DraftState } from "@/contracts/generated/drafts";
import { db } from "@/db/client";
import { draftDocument } from "@/db/schema";
import { transition } from "@/loop/state";

/** ADR-004: the invocation gets 240 s of the 300 s maximum duration to draft. */
export const LEASE_SECONDS = 240;

/** 9.6: the only reason a non-terminal state may go straight to blocked. */
export const DEADLINE_REASON = "deadline_exceeded";

/** The five states of the 9.6 lease-expiry pair; blocked, published and rejected are terminal. */
export const NON_TERMINAL_STATES: readonly DraftState[] = [
  "proposed",
  "drafted",
  "redlined",
  "in_review",
  "accepted",
];

// 9.6: the actor of a lease block is the system, never a person. Declared here rather than imported from
// src/loop/state.ts so this module owns the value it passes and a unit test can replace that module wholesale.
export const SYSTEM_ACTOR = { alias: "system", role: "system" } as const;

/** True when this poll blocked the draft; false when the lease still runs, or the state is already terminal. */
export async function expireIfPastLease(draftId: string): Promise<boolean> {
  const [expired] = await db
    .select({ id: draftDocument.id })
    .from(draftDocument)
    .where(
      and(
        eq(draftDocument.id, draftId),
        inArray(draftDocument.state, [...NON_TERMINAL_STATES]),
        lt(draftDocument.leaseExpiresAt, sql`now()`),
      ),
    )
    .limit(1);
  if (!expired) return false;
  await transition(draftId, "blocked", SYSTEM_ACTOR, DEADLINE_REASON);
  return true;
}
