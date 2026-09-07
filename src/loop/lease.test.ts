// The drafting lease (ADR-004, blueprint 9.6 "any non-terminal -> blocked with reason deadline_exceeded (system,
// lease expiry)"; ARCHITECTURE 8.2; AC-LOOP-14, AC-LOOP-15). POST /api/drafts writes lease_expires_at = now + 240 s
// and returns 202; the client polls GET /api/drafts/:id, and a poll that finds a non-terminal draft past its lease
// moves it to blocked with reason deadline_exceeded, so no draft is ever stranded and the blocked draft is
// re-proposable. The move goes through src/loop/state.ts transition(), which is the one writer of the state and
// writes the draft_transition row and the audit event; this module decides only whether the lease is up. The
// comparison is made by the database clock (now() inside the predicate), never by the process clock, so a lease
// written by one invocation and read by another cannot disagree. The database is the fake client, state is mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftState } from "@/contracts/generated/drafts";
import { draftDocument } from "@/db/schema";
import { DEADLINE_REASON, LEASE_SECONDS, NON_TERMINAL_STATES, expireIfPastLease } from "./lease";
import { DRAFT_ID, draftRow, queryOf } from "../../tests/fixtures/drafting";
import { argOf, queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";

const state = vi.hoisted(() => ({ transition: vi.fn() }));
vi.mock("@/loop/state", () => ({ transition: state.transition }));

const TERMINAL: DraftState[] = ["blocked", "published", "rejected"];

beforeEach(() => {
  resetFakeDb();
  state.transition.mockReset();
  state.transition.mockResolvedValue(undefined);
});

describe("the constants the lane is built on", () => {
  it("leases a draft for 240 seconds and blocks with the frozen reason", () => {
    expect(LEASE_SECONDS).toBe(240);
    expect(DEADLINE_REASON).toBe("deadline_exceeded");
  });

  it("counts the five states of the 9.6 lease-expiry pair as non-terminal", () => {
    expect([...NON_TERMINAL_STATES].sort()).toEqual(["accepted", "drafted", "in_review", "proposed", "redlined"]);
    for (const terminal of TERMINAL) expect(NON_TERMINAL_STATES).not.toContain(terminal);
  });
});

describe("a poll that finds the lease up", () => {
  it("moves the draft to blocked with deadline_exceeded as the system actor, and says it did", async () => {
    queueResult([draftRow({ state: "drafted" })]);
    await expect(expireIfPastLease(DRAFT_ID)).resolves.toBe(true);

    expect(state.transition).toHaveBeenCalledTimes(1);
    expect(state.transition).toHaveBeenCalledWith(
      DRAFT_ID,
      "blocked",
      expect.objectContaining({ alias: "system", role: "system" }),
      DEADLINE_REASON,
    );
  });

  it("asks the database for the draft under the database clock and the non-terminal states only", async () => {
    queueResult([draftRow({ state: "in_review" })]);
    await expireIfPastLease(DRAFT_ID);

    const [read] = statements;
    expect(read?.some((c) => c.method === "from" && c.args[0] === draftDocument)).toBe(true);
    const where = queryOf(argOf(read!, "where"));
    expect(where.sql).toContain("now()"); // the lease is compared to the database clock, never to Date.now()
    expect(where.params).toContain(DRAFT_ID);
    for (const nonTerminal of NON_TERMINAL_STATES) expect(where.params).toContain(nonTerminal);
    for (const terminal of TERMINAL) expect(where.params).not.toContain(terminal);
  });
});

describe("a poll that leaves the draft alone", () => {
  it("does nothing when the predicate matches no row: the lease still runs, or the state is terminal", async () => {
    queueResult([]);
    await expect(expireIfPastLease(DRAFT_ID)).resolves.toBe(false);
    expect(state.transition).not.toHaveBeenCalled();
  });

  it("does nothing for a draft id the sandbox does not carry", async () => {
    queueResult([]);
    await expect(expireIfPastLease("dr-does-not-exist")).resolves.toBe(false);
    expect(state.transition).not.toHaveBeenCalled();
  });

  it("does not block a second time when a concurrent poll won the race: the state module refuses the pair", async () => {
    queueResult([draftRow({ state: "drafted" })]);
    state.transition.mockRejectedValue(new Error("illegal transition blocked -> blocked"));
    await expect(expireIfPastLease(DRAFT_ID)).rejects.toThrow(/blocked/);
  });

  it("reads once and writes nothing itself: the transition row and the audit row belong to state.ts", async () => {
    queueResult([draftRow({ state: "proposed" })]);
    await expireIfPastLease(DRAFT_ID);
    expect(statements.filter((s) => s.some((c) => c.method === "insert" || c.method === "update"))).toEqual([]);
  });
});
