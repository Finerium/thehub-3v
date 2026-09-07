// The draft state machine (blueprint 9.6 transitions, 9.7 audit actions; ARCHITECTURE 3.2 and 8.4; AC-LOOP-08).
// `src/loop/state.ts` is the ONE writer of draft_document.state: transition() re-reads the row FOR UPDATE inside
// the caller's transaction, checks the 9.6 pair AND the actor's legality, then writes one draft_transition row and
// one audit_log row. A pair the 9.6 table does not name, or a legal pair attempted by the wrong actor, throws
// IllegalTransition and writes nothing; an unknown draft is the typed NotFound. Hermetic: the fake client records
// every chain, so what is written and what is not is read off `statements`.
//
// The signature ARCHITECTURE 8.4 names carries one options argument beyond it, because the audit row it writes
// cannot be derived inside a transaction: `{ route, auditId?, corpusVersionId? }`. `route` is the 9.9 route
// pattern (never the concrete pathname), `auditId` is the request id, so x-request-id equals the audit event id
// (9.9), and `corpusVersionId` overrides the draft's own version, which is how the published event binds to the
// child version G3 creates rather than to the active one (AC-LOOP-12); absent, the draft's version is used.
//
// The audit action per pair (9.7 closes the enum at six draft actions, so each pair maps onto one of them):
//   to `drafted` and the in_review edit -> draft.created   (the draft body is written or rewritten)
//   every redline outcome               -> draft.redlined  (drafted->redlined, redlined->in_review, redlined->blocked)
//   in_review->accepted                 -> draft.accepted
//   any rejection and a lease block     -> draft.rejected
//   blocked|rejected -> proposed        -> draft.reproposed
//   accepted->published                 -> draft.published
import { beforeEach, describe, expect, it } from "vitest";
import type { DraftState } from "@/contracts/generated/drafts";
import type { AuditAction } from "@/contracts/generated/serving";
import { withTransaction } from "@/db/client";
import { auditLog, draftDocument, draftTransition } from "@/db/schema";
import { NotFound } from "@/lib/errors";
import { argOf, queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";
import { BASE_VERSION_ID, CHILD_VERSION_ID, DRAFT_ID, draftRow } from "../../tests/fixtures/loop";
import { IllegalTransition, SYSTEM_ACTOR, transition, type Actor } from "./state";

const ROUTE = "/api/drafts/:id/decision";

const SUPERVISOR: Actor = { alias: "SUPERVISOR", role: "Reviewing Supervisor" };
const MANAGER: Actor = { alias: "MANAGER", role: "Manager" };
const ENGINEER: Actor = { alias: "ENGINEER", role: "Engineer" };
const ADMIN: Actor = { alias: "ADMIN", role: "Admin" };

// Blueprint 9.6, verbatim as a table: from, to, the one actor that may do it, the audit action it writes.
const LEGAL: ReadonlyArray<[DraftState, DraftState, Actor, AuditAction]> = [
  ["proposed", "drafted", SYSTEM_ACTOR, "draft.created"],
  ["drafted", "redlined", SYSTEM_ACTOR, "draft.redlined"],
  ["redlined", "in_review", SYSTEM_ACTOR, "draft.redlined"],
  ["redlined", "drafted", SYSTEM_ACTOR, "draft.created"],
  ["redlined", "blocked", SYSTEM_ACTOR, "draft.redlined"],
  ["in_review", "in_review", SUPERVISOR, "draft.created"],
  ["in_review", "accepted", SUPERVISOR, "draft.accepted"],
  ["in_review", "rejected", SUPERVISOR, "draft.rejected"],
  ["accepted", "published", MANAGER, "draft.published"],
  ["accepted", "rejected", MANAGER, "draft.rejected"],
  ["blocked", "proposed", SUPERVISOR, "draft.reproposed"],
  ["rejected", "proposed", SUPERVISOR, "draft.reproposed"],
];

// ADR-004: any non-terminal state to blocked, by the system, with this reason and no other.
const DEADLINE = "deadline_exceeded";
const NON_TERMINAL: ReadonlyArray<DraftState> = ["proposed", "drafted", "redlined", "in_review", "accepted"];

const EVERY_ACTOR: ReadonlyArray<Actor> = [SYSTEM_ACTOR, SUPERVISOR, MANAGER, ENGINEER, ADMIN];

function run(
  from: DraftState,
  to: DraftState,
  actor: Actor,
  reason: string | null = null,
  editDiff: string | null = null,
  options: { route: string; auditId?: string; corpusVersionId?: string } = { route: ROUTE },
) {
  queueResult([draftRow({ state: from })]);
  return withTransaction((tx) => transition(tx, DRAFT_ID, to, actor, reason, editDiff, options));
}

const chainOn = (method: string, table: unknown) =>
  statements.find((s) => s[0]?.method === method && s[0].args[0] === table);
const transitionInsert = () => chainOn("insert", draftTransition);
const auditInsert = () => chainOn("insert", auditLog);
const stateUpdate = () => chainOn("update", draftDocument);
const wroteNothing = () => statements.every((s) => s[0]?.method === "select");

beforeEach(resetFakeDb);

describe("the legal pairs of 9.6", () => {
  it.each(LEGAL)("%s -> %s by its actor: state written, one transition row, one audit row", async (from, to, actor, action) => {
    const result = await run(from, to, actor, from === to ? "edit with reasons" : null);

    expect(result).toEqual({ from, to });

    // The row is re-read FOR UPDATE before anything is decided (ARCHITECTURE 8.4).
    expect(statements[0]?.some((c) => c.method === "from" && c.args[0] === draftDocument)).toBe(true);
    expect(statements[0]?.some((c) => c.method === "for" && c.args[0] === "update")).toBe(true);

    expect(argOf(stateUpdate()!, "set")).toEqual({ state: to });

    const row = argOf(transitionInsert()!, "values") as Record<string, unknown>;
    expect(row).toMatchObject({
      draftId: DRAFT_ID,
      fromState: from,
      toState: to,
      actorAlias: actor.alias,
      actorRole: actor.role,
      editDiff: null,
    });
    expect(typeof row.id).toBe("string");
    expect(row.serverTs).toBeDefined();

    expect(argOf(auditInsert()!, "values")).toMatchObject({
      actorAlias: actor.alias,
      actorRole: actor.role,
      action,
      entity: "draft",
      entityId: DRAFT_ID,
      route: ROUTE,
      corpusVersionId: BASE_VERSION_ID,
    });
  });

  it("the audit payload carries the draft id and the states only, never a body (9.7)", async () => {
    await run("in_review", "accepted", SUPERVISOR, "clear enough to publish");
    const values = argOf(auditInsert()!, "values") as { payload: Record<string, unknown> };
    expect(values.payload).toEqual({
      draft_id: DRAFT_ID,
      from_state: "in_review",
      to_state: "accepted",
      reason: "clear enough to publish",
    });
  });

  it("the in_review edit records its diff on the transition row and keeps the state in review", async () => {
    const diff = "field-loop-1: - old sentence + new sentence";
    await run("in_review", "in_review", SUPERVISOR, "wording", diff);
    expect(argOf(transitionInsert()!, "values")).toMatchObject({ toState: "in_review", editDiff: diff });
    expect(argOf(stateUpdate()!, "set")).toEqual({ state: "in_review" });
  });

  it("accepted -> published binds its audit row to the version G3 names (AC-LOOP-12)", async () => {
    await run("accepted", "published", MANAGER, null, null, {
      route: "/api/drafts/:id/publish",
      auditId: "req-publish",
      corpusVersionId: CHILD_VERSION_ID,
    });
    expect(argOf(auditInsert()!, "values")).toMatchObject({
      id: "req-publish",
      action: "draft.published",
      route: "/api/drafts/:id/publish",
      corpusVersionId: CHILD_VERSION_ID,
    });
  });
});

describe("the lease expiry of ADR-004", () => {
  it.each(NON_TERMINAL)("%s -> blocked with reason deadline_exceeded by the system", async (from) => {
    await run(from, "blocked", SYSTEM_ACTOR, DEADLINE);
    expect(argOf(transitionInsert()!, "values")).toMatchObject({
      fromState: from,
      toState: "blocked",
      actorAlias: "system",
      actorRole: "system",
      reason: DEADLINE,
    });
    expect(argOf(auditInsert()!, "values")).toMatchObject({ action: "draft.rejected" });
  });

  it.each(NON_TERMINAL.filter((s) => s !== "redlined"))(
    "%s -> blocked without that reason is illegal and writes nothing",
    async (from) => {
      await expect(run(from, "blocked", SYSTEM_ACTOR, null)).rejects.toBeInstanceOf(IllegalTransition);
      expect(wroteNothing()).toBe(true);
    },
  );

  it.each([SUPERVISOR, MANAGER, ENGINEER, ADMIN].map((a) => [a.role, a] as const))(
    "only the system may block on the lease: %s is refused",
    async (_role, actor) => {
      await expect(run("in_review", "blocked", actor, DEADLINE)).rejects.toBeInstanceOf(IllegalTransition);
      expect(wroteNothing()).toBe(true);
    },
  );

  it.each(["published", "blocked", "rejected"] as const)(
    "a terminal state (%s) never blocks on the lease",
    async (from) => {
      await expect(run(from, "blocked", SYSTEM_ACTOR, DEADLINE)).rejects.toBeInstanceOf(IllegalTransition);
      expect(wroteNothing()).toBe(true);
    },
  );
});

describe("a pair 9.6 does not name", () => {
  const ILLEGAL: ReadonlyArray<[DraftState, DraftState]> = [
    ["proposed", "published"],
    ["proposed", "accepted"],
    ["proposed", "in_review"],
    ["drafted", "published"],
    ["drafted", "in_review"],
    ["redlined", "accepted"],
    ["in_review", "published"],
    ["accepted", "drafted"],
    ["accepted", "in_review"],
    ["blocked", "published"],
    ["rejected", "published"],
    ["published", "rejected"],
    ["published", "proposed"],
    ["published", "published"],
  ];

  it.each(ILLEGAL)("%s -> %s is refused for every actor and writes nothing", async (from, to) => {
    for (const actor of EVERY_ACTOR) {
      resetFakeDb();
      await expect(run(from, to, actor, null)).rejects.toBeInstanceOf(IllegalTransition);
      expect(wroteNothing(), `${from} -> ${to} by ${actor.role}`).toBe(true);
    }
  });

  it("names the pair it refused", async () => {
    const error = await run("proposed", "published", MANAGER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IllegalTransition);
    expect(error).toMatchObject({ from: "proposed", to: "published", violation: "pair" });
  });
});

describe("a legal pair by the wrong actor", () => {
  // Every actor that 9.6 does not name for the pair, including the system where a person is required and the
  // reverse. The Admin holds no drafting, review or publication right at all (INV-3, AC-LOOP-08).
  const WRONG: ReadonlyArray<[DraftState, DraftState, string, Actor]> = LEGAL.flatMap(([from, to, owner]) =>
    EVERY_ACTOR.filter((a) => a.role !== owner.role).map((a) => [from, to, a.role, a] as [DraftState, DraftState, string, Actor]),
  );

  it.each(WRONG)("%s -> %s by %s is refused and writes nothing", async (from, to, _role, actor) => {
    await expect(run(from, to, actor, from === to ? "edit" : null)).rejects.toBeInstanceOf(IllegalTransition);
    expect(wroteNothing()).toBe(true);
  });

  it("names the actor it refused", async () => {
    const error = await run("accepted", "published", SUPERVISOR).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IllegalTransition);
    expect(error).toMatchObject({ from: "accepted", to: "published", violation: "actor" });
  });

  it.each(LEGAL)("the Admin may not drive %s -> %s (AC-LOOP-08)", async (from, to) => {
    await expect(run(from, to, ADMIN, from === to ? "edit" : null)).rejects.toBeInstanceOf(IllegalTransition);
    expect(wroteNothing()).toBe(true);
  });
});

describe("the draft itself", () => {
  it("an unknown draft is the typed NotFound and writes nothing", async () => {
    queueResult([]);
    await expect(withTransaction((tx) => transition(tx, "draft-nope", "accepted", SUPERVISOR, null, null, { route: ROUTE }))).rejects.toBeInstanceOf(NotFound);
    expect(wroteNothing()).toBe(true);
  });

  it("the system actor is the frozen literal pair of 9.6", () => {
    expect(SYSTEM_ACTOR).toEqual({ alias: "system", role: "system" });
  });
});
