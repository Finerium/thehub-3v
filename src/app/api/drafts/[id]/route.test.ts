// GET /api/drafts/:id (blueprint 9.6, 9.9; ARCHITECTURE 8.2, 8.5; AC-LOOP-13, AC-LOOP-14, AC-LOOP-15). The poll the
// client runs while the invocation drafts: the draft, its fields, its redline verdicts and its transitions, all in
// the spelling of section 9.6, read within the visitor's sandbox scope so one visitor never polls another's draft.
// The poll is also the lease watchdog: before it reads, it asks src/loop/lease.ts to block any draft of that id
// whose lease has run out, so a draft is never stranded and a blocked draft can be re-proposed (ADR-004).
//
// Hermetic. The lease module and the database are replaced; the session cookie is signed by the run's own key. The
// reads are queued in order after the session: the sandbox, the draft, its fields, its verdicts, its transitions.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftDocument, DraftField, DraftTransition, RedlineVerdict } from "@/contracts/generated/drafts";
import type { Role } from "@/contracts/generated/serving";
import { SANDBOX_COOKIE, SESSION_COOKIE, signSessionId } from "@/auth/cookie";
import { draftDocument } from "@/db/schema";
import {
  DRAFT_ID,
  SANDBOX_ID,
  SANDBOX_ROW,
  SUPERVISOR,
  draftRow,
  fieldRow,
  queryOf,
  transitionRow,
  verdictRow,
} from "../../../../../tests/fixtures/drafting";
import { argOf, queueResult, resetFakeDb, statements } from "../../../../../tests/helpers/fake-db-client";
import { setRequest } from "../../../../../tests/helpers/next-headers";
import { GET } from "./route";

const lease = vi.hoisted(() => ({ expireIfPastLease: vi.fn() }));
vi.mock("@/loop/lease", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/loop/lease")>()), expireIfPastLease: lease.expireIfPastLease }));

const REQUEST_ID = "req-draft-detail";

const FIELDS = [fieldRow(), fieldRow({ id: "df-row-2", section: 4, text: "REQUIRES ENGINEER INPUT", isSlot: true, provenance: { type: "slot", ref: null, span_id: null }, numericProvenance: [] })];
const VERDICTS = [verdictRow()];
const TRANSITIONS = [transitionRow(), transitionRow({ id: "dt-2", fromState: "drafted", toState: "redlined" })];

function signedIn(role: Role = "Reviewing Supervisor") {
  setRequest({
    cookies: { [SESSION_COOKIE]: signSessionId(SUPERVISOR.sessionId), [SANDBOX_COOKIE]: SANDBOX_ID },
    headers: { "x-request-id": REQUEST_ID, "x-request-path": "/api/drafts/:id" },
  });
  queueResult([{ ...SUPERVISOR, role }]);
}

function queueDetail(draft = draftRow({ state: "in_review" })) {
  queueResult([SANDBOX_ROW]);
  queueResult([draft]);
  queueResult(FIELDS);
  queueResult(VERDICTS);
  queueResult(TRANSITIONS);
}

const request = () => new NextRequest(`http://localhost/api/drafts/${DRAFT_ID}`, { headers: { "x-request-id": REQUEST_ID } });
const context = (id = DRAFT_ID) => ({ params: Promise.resolve({ id }) });

type Body = { draft: unknown; fields: unknown[]; verdicts: unknown[]; transitions: unknown[] };

beforeEach(() => {
  resetFakeDb();
  lease.expireIfPastLease.mockReset();
  lease.expireIfPastLease.mockResolvedValue(false);
});

describe("the poll", () => {
  it("returns the draft, its fields, its verdicts and its transitions in the spelling of section 9.6", async () => {
    signedIn();
    queueDetail();
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    const body = (await response.json()) as Body;
    expect(DraftDocument.parse(body.draft)).toMatchObject({ id: DRAFT_ID, state: "in_review", session_scope: SANDBOX_ID });
    expect(body.fields.map((f) => DraftField.parse(f).section)).toEqual([3, 4]);
    expect(body.verdicts.map((v) => RedlineVerdict.parse(v).round)).toEqual([1]);
    expect(body.transitions.map((t) => DraftTransition.parse(t).to_state)).toEqual(["drafted", "redlined"]);
  });

  it("reads the draft within the visitor's scope, so another sandbox's draft is not found (AC-LOOP-13)", async () => {
    signedIn();
    queueResult([SANDBOX_ROW]);
    queueResult([]);
    const response = await GET(request(), context());

    const read = statements.at(-1)!;
    expect(read.some((c) => c.method === "from" && c.args[0] === draftDocument)).toBe(true);
    const where = queryOf(argOf(read, "where"));
    expect(where.params).toContain(DRAFT_ID);
    expect(where.params).toContain(SANDBOX_ID);
    expect(where.sql.toLowerCase()).toContain("session_scope");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found", entity: "draft", id: DRAFT_ID });
  });

  it("answers 400 invalid_params for an empty id, before it reads anything", async () => {
    signedIn();
    const response = await GET(request(), context(""));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_params" });
    expect(statements).toHaveLength(1);
  });

  it("answers 403 for Admin, who holds no view_drafts column (9.9)", async () => {
    signedIn("Admin");
    const response = await GET(request(), context());
    expect(response.status).toBe(403);
    expect(lease.expireIfPastLease).not.toHaveBeenCalled();
  });
});

describe("the poll as the lease watchdog (ADR-004, AC-LOOP-15)", () => {
  it("asks the lease module about this draft before it reads it", async () => {
    signedIn();
    queueDetail();
    await GET(request(), context());

    expect(lease.expireIfPastLease).toHaveBeenCalledExactlyOnceWith(DRAFT_ID);
  });

  it("returns the blocked draft with deadline_exceeded when the lease had run out", async () => {
    signedIn();
    lease.expireIfPastLease.mockResolvedValue(true);
    queueDetail(draftRow({ state: "blocked", leaseExpiresAt: new Date("2026-09-07T10:04:00.000Z") }));

    const body = (await (await GET(request(), context())).json()) as Body;
    expect(DraftDocument.parse(body.draft).state).toBe("blocked");
  });

  it("carries the deadline_exceeded transition, which is what makes the draft re-proposable (AC-LOOP-14)", async () => {
    signedIn();
    lease.expireIfPastLease.mockResolvedValue(true);
    queueResult([SANDBOX_ROW]);
    queueResult([draftRow({ state: "blocked" })]);
    queueResult(FIELDS);
    queueResult(VERDICTS);
    queueResult([...TRANSITIONS, transitionRow({ id: "dt-3", fromState: "redlined", toState: "blocked", reason: "deadline_exceeded" })]);

    const body = (await (await GET(request(), context())).json()) as Body;
    const last = DraftTransition.parse(body.transitions.at(-1));
    expect(last).toMatchObject({ to_state: "blocked", reason: "deadline_exceeded", actor_alias: "system", actor_role: "system" });
  });
});
