// POST /api/drafts/:id/repropose (blueprint 9.6 "blocked -> proposed" and "rejected -> proposed", 9.9; AC-LOOP-14,
// AC-LOOP-15). A blocked or rejected draft is never edited back to life: it re-proposes as a new draft in `proposed`
// linked through `previous_draft_id`, carrying the same evidence (the cluster, the asset, the corpus version and the
// sandbox) and the reasons it was blocked for, reserving a lesson id of its own because `opl_id_reserved` is unique.
// The route answers 201 { draft_id } and hands the drafting to runDraft through the invocation's waitUntil, exactly
// as POST /api/drafts does; a draft in any other state, a published one first of all, is a 409 and creates nothing.
//
// Hermetic. `after`, runDraft and the database are replaced. The reads are queued in order after the session: the
// rate-limit window, the sandbox, the previous draft (within the visitor's scope), its redline verdicts and the
// lesson ids the asset already uses. Five reads and no sixth: the audit event binds to the corpus version the
// previous draft carries, so writeAudit() never has to look the active version up again. Every write settles with
// `undefined`.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftState } from "@/contracts/generated/drafts";
import type { Role } from "@/contracts/generated/serving";
import { SANDBOX_COOKIE, SESSION_COOKIE, signSessionId } from "@/auth/cookie";
import { auditLog, draftDocument, draftTransition } from "@/db/schema";
import { LIMITS } from "@/lib/ratelimit";
import { LEASE_SECONDS } from "@/loop/lease";
import {
  CLUSTER_ID,
  CORPUS_VERSION,
  DRAFT_ID,
  REDLINE_BLOCK,
  SANDBOX_ID,
  SANDBOX_ROW,
  SUPERVISOR,
  TAG,
  draftRow,
  queryOf,
  verdictRow,
} from "../../../../../../tests/fixtures/drafting";
import { argOf, queueResult, resetFakeDb, statements } from "../../../../../../tests/helpers/fake-db-client";
import { setRequest } from "../../../../../../tests/helpers/next-headers";
import { POST } from "./route";

const scheduler = vi.hoisted(() => ({ after: vi.fn() }));
const drafter = vi.hoisted(() => ({ runDraft: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: scheduler.after }));
vi.mock("@/loop/draft", () => ({ runDraft: drafter.runDraft, HOUSE_TEMPLATE: {} }));

const REQUEST_ID = "req-repropose";
const OPL_IDS = [{ oplId: "OPL-GA-9901A-01" }, { oplId: "OPL-GA-9901A-02" }];

function signedIn(role: Role = "Reviewing Supervisor") {
  setRequest({
    cookies: { [SESSION_COOKIE]: signSessionId(SUPERVISOR.sessionId), [SANDBOX_COOKIE]: SANDBOX_ID },
    headers: { "x-request-id": REQUEST_ID, "x-request-path": "/api/drafts/:id/repropose" },
  });
  queueResult([{ ...SUPERVISOR, role }]);
}

function queueRepropose(state: DraftState = "blocked", count = 1) {
  queueResult([{ count, windowStart: new Date("2026-09-07T10:00:00.000Z") }]);
  queueResult([SANDBOX_ROW]);
  queueResult([draftRow({ state, oplIdReserved: "OPL-GA-9901A-02" })]);
  queueResult([verdictRow({ round: 2 })]);
  queueResult(OPL_IDS);
}

const request = () => new NextRequest(`http://localhost/api/drafts/${DRAFT_ID}/repropose`, { method: "POST", headers: { "x-request-id": REQUEST_ID } });
const context = (id = DRAFT_ID) => ({ params: Promise.resolve({ id }) });
const insertInto = (table: unknown) => statements.find((s) => s[0]?.method === "insert" && s[0].args[0] === table);
const draftInsert = () => argOf(insertInto(draftDocument)!, "values") as Record<string, unknown>;

beforeEach(() => {
  resetFakeDb();
  scheduler.after.mockReset();
  drafter.runDraft.mockReset();
  drafter.runDraft.mockResolvedValue(undefined);
});

describe("re-proposing a blocked or a rejected draft (AC-LOOP-14)", () => {
  it.each(["blocked", "rejected"] as const)("answers 201 { draft_id } from %s, for a draft that is not the old one", async (state) => {
    signedIn();
    queueRepropose(state);
    const response = await POST(request(), context());

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    const body = (await response.json()) as { draft_id: string };
    expect(body.draft_id).toBe(draftInsert().id);
    expect(body.draft_id).not.toBe(DRAFT_ID);
  });

  it("links the new draft to the old one and carries the same evidence: cluster, asset, version and sandbox", async () => {
    signedIn();
    queueRepropose();
    await POST(request(), context());

    expect(draftInsert()).toMatchObject({
      state: "proposed",
      previousDraftId: DRAFT_ID,
      clusterId: CLUSTER_ID,
      equipmentTag: TAG,
      corpusVersionId: CORPUS_VERSION.id,
      sessionScope: SANDBOX_ID,
      createdByAlias: SUPERVISOR.alias,
    });
  });

  it("reserves a lesson id of its own, because opl_id_reserved is unique across drafts", async () => {
    signedIn();
    queueRepropose();
    await POST(request(), context());

    expect(draftInsert().oplIdReserved).toBe("OPL-GA-9901A-03");
    expect(draftInsert().oplIdReserved).not.toBe("OPL-GA-9901A-02");
  });

  it("takes a lease of its own, so the new draft is watched like any other (ADR-004)", async () => {
    signedIn();
    queueRepropose();
    await POST(request(), context());

    expect(JSON.stringify(queryOf(draftInsert().leaseExpiresAt))).toContain(String(LEASE_SECONDS));
  });

  it("writes the 9.6 transition on the new draft, carrying the reasons the old one was blocked for", async () => {
    signedIn();
    queueRepropose();
    await POST(request(), context());

    const transition = argOf(insertInto(draftTransition)!, "values") as Record<string, unknown>;
    expect(transition).toMatchObject({
      draftId: draftInsert().id,
      fromState: "blocked",
      toState: "proposed",
      actorAlias: SUPERVISOR.alias,
      actorRole: "Reviewing Supervisor",
    });
    expect(String(transition.reason)).toContain(REDLINE_BLOCK.reasons[0]!.text);
  });

  it("audits draft.reproposed on the new draft, naming the one it came from and no draft body (9.7)", async () => {
    signedIn();
    queueRepropose();
    await POST(request(), context());

    const audit = argOf(insertInto(auditLog)!, "values") as Record<string, unknown>;
    expect(audit).toMatchObject({
      id: REQUEST_ID,
      actorAlias: SUPERVISOR.alias,
      action: "draft.reproposed",
      entity: "draft",
      entityId: draftInsert().id,
      route: "/api/drafts/:id/repropose",
      corpusVersionId: CORPUS_VERSION.id,
    });
    expect(JSON.stringify(audit.payload)).toContain(DRAFT_ID);
  });

  it("hands the new draft to runDraft through the invocation's waitUntil, once", async () => {
    signedIn();
    queueRepropose();
    await POST(request(), context());

    expect(scheduler.after).toHaveBeenCalledTimes(1);
    const scheduled = scheduler.after.mock.calls[0]?.[0] as () => unknown;
    await scheduled();
    expect(drafter.runDraft).toHaveBeenCalledExactlyOnceWith(draftInsert().id);
  });
});

describe("what re-proposal refuses", () => {
  it.each(["published", "accepted", "in_review", "proposed", "drafted", "redlined"] as const)(
    "answers 409 for a draft in %s and creates nothing (9.9: 409 on a published draft)",
    async (state) => {
      signedIn();
      queueRepropose(state);
      const response = await POST(request(), context());

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "conflict", state });
      expect(insertInto(draftDocument)).toBeUndefined();
      expect(scheduler.after).not.toHaveBeenCalled();
    },
  );

  it("answers the designed 404 for a draft the visitor's scope does not carry", async () => {
    signedIn();
    queueResult([{ count: 1, windowStart: new Date("2026-09-07T10:00:00.000Z") }]);
    queueResult([SANDBOX_ROW]);
    queueResult([]);
    const response = await POST(request(), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found", entity: "draft", id: DRAFT_ID });
    expect(insertInto(draftDocument)).toBeUndefined();
  });

  it("counts against the same draft:<user_id> limit and renders the designed 429 (9.9)", async () => {
    signedIn();
    queueRepropose("blocked", LIMITS.draft + 1);
    const response = await POST(request(), context());

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limited", scope: "draft", limit: LIMITS.draft });
    expect(argOf(statements[1]!, "values")).toMatchObject({ scope: "draft", key: SUPERVISOR.id });
    expect(insertInto(draftDocument)).toBeUndefined();
  });

  it.each(["Engineer", "Manager", "Admin"] as const)("answers 403 for %s, who does not hold create_draft (9.9)", async (role) => {
    signedIn(role);
    queueResult([{ id: CORPUS_VERSION.id, label: CORPUS_VERSION.label }]); // writeAudit resolves the active version
    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(argOf(insertInto(auditLog)!, "values")).toMatchObject({ action: "auth.role_violation", entityId: "create_draft" });
    expect(insertInto(draftDocument)).toBeUndefined();
  });
});
