// The reads behind surface 8 (blueprint 6.2 surface 8, 6.3, 9.6; ARCHITECTURE 8.5; AC-LOOP-13, AC-LOOP-14). Two
// things in this module decide what a person sees and neither is SQL: the queue's own arithmetic (which row is this
// browser's, which row is seeded, which non-terminal draft is past its lease and will be blocked by the next poll)
// and the sandbox filter's answer for a draft this browser may not see, which must read as absence and not as a
// refusal (D-16).
//
// Hermetic: `@/db/client` is the fake of tests/helpers, so every read below is a queued row set and no connection is
// opened. The rows are the synthetic drafts of tests/fixtures/drafting; no figure here binds to the seeded corpus.
import { beforeEach, describe, expect, it } from "vitest";
import { SANDBOX_ID, SANDBOX_ROW, draftRow } from "../../../tests/fixtures/drafting";
import { queueResult, resetFakeDb } from "../../../tests/helpers/fake-db-client";
import { QUEUE_STATES, readDraftView, readQueue } from "./drafts-view";

const MINUTE = 60_000;
const past = (): Date => new Date(Date.now() - MINUTE);
const future = (): Date => new Date(Date.now() + MINUTE);

beforeEach(() => {
  resetFakeDb();
});

describe("readQueue", () => {
  it("separates this browser's drafts from the seeded ones, and counts every state of 9.6", async () => {
    queueResult([
      draftRow({ id: "d-own", state: "in_review", sessionScope: SANDBOX_ID }),
      draftRow({ id: "d-seeded", state: "published", sessionScope: null }),
      draftRow({ id: "d-own-2", state: "in_review", sessionScope: SANDBOX_ID }),
    ]);

    const view = await readQueue(SANDBOX_ROW);

    expect(view.rows.map((r) => r.own)).toEqual([true, false, true]);
    expect(view.ownCount).toBe(2);
    expect(view.seededCount).toBe(1);
    expect(view.sandboxId).toBe(SANDBOX_ID);
    expect(view.counts.in_review).toBe(2);
    expect(view.counts.published).toBe(1);
    // Every state of the board carries a count, so a state with no draft renders a zero rather than nothing.
    expect(Object.keys(view.counts).sort()).toEqual([...QUEUE_STATES].sort());
    expect(QUEUE_STATES.filter((s) => view.counts[s] === 0).length).toBe(QUEUE_STATES.length - 2);
  });

  it("marks a non-terminal draft past its lease, which is what the next poll blocks (ADR-004)", async () => {
    queueResult([
      draftRow({ id: "d-stranded", state: "proposed", leaseExpiresAt: past() }),
      draftRow({ id: "d-working", state: "proposed", leaseExpiresAt: future() }),
    ]);

    const view = await readQueue(SANDBOX_ROW);

    expect(view.rows.map((r) => r.leaseRanOut)).toEqual([true, false]);
  });

  it("never marks a terminal draft or one without a lease: 9.6 runs a lease on neither", async () => {
    queueResult([
      draftRow({ id: "d-published", state: "published", leaseExpiresAt: past() }),
      draftRow({ id: "d-blocked", state: "blocked", leaseExpiresAt: past() }),
      draftRow({ id: "d-rejected", state: "rejected", leaseExpiresAt: past() }),
      draftRow({ id: "d-no-lease", state: "in_review", leaseExpiresAt: null }),
    ]);

    const view = await readQueue(SANDBOX_ROW);

    expect(view.rows.every((r) => r.leaseRanOut === false)).toBe(true);
  });

  it("reads before the first login too: no sandbox is the seeded queue alone", async () => {
    queueResult([draftRow({ id: "d-seeded", sessionScope: null })]);

    const view = await readQueue(null);

    expect(view.sandboxId).toBeNull();
    expect(view.ownCount).toBe(0);
    expect(view.seededCount).toBe(1);
  });
});

describe("readDraftView", () => {
  it("a draft outside this browser's sandbox is absence, not a refusal (D-16)", async () => {
    queueResult([]); // the scoped read returns nothing: another browser's draft reads as one that was never written

    await expect(readDraftView("dr-from-another-browser", SANDBOX_ROW)).resolves.toBeNull();
  });
});
