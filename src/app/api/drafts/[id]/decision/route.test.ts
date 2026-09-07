// POST /api/drafts/:id/decision (blueprint 9.9 `decide`, 9.6 transitions; ARCHITECTURE 8.4; AC-LOOP-08).
// The Reviewing Supervisor accepts, edits (in_review -> in_review, the edits applied to draft_field.text and the
// diff recorded on the transition row) and rejects; the Manager rejects from `accepted` and nothing else; the
// Admin holds no decide column at all. The state machine is mocked here (src/loop/state.test.ts owns the pairs and
// the actors): this file pins what the route asks it for, the 403s and their audit rows, and the 9.6 body it answers.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftState } from "@/contracts/generated/drafts";
import type { Role } from "@/contracts/generated/serving";
import { auditLog, draftField } from "@/db/schema";
import { transition } from "@/loop/state";
import { argOf, queueResult, resetFakeDb, statements } from "../../../../../../tests/helpers/fake-db-client";
import { setRequest } from "../../../../../../tests/helpers/next-headers";
import { BASE_VERSION_ID, DRAFT_ID, draftRow, fieldRow, signedIn } from "../../../../../../tests/fixtures/loop";
import { POST } from "./route";

// Only transition() is faked; IllegalTransition, SYSTEM_ACTOR and anything else the route imports stay real.
vi.mock("@/loop/state", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  transition: vi.fn(),
}));

const ROUTE = "/api/drafts/:id/decision";
const REQUEST_ID = "req-decision";

const SUPERVISOR = { alias: "REVIEWING_SUPERVISOR", role: "Reviewing Supervisor" };
const MANAGER = { alias: "MANAGER", role: "Manager" };

const context = { params: Promise.resolve({ id: DRAFT_ID }) };

function post(body: unknown) {
  return new NextRequest(`http://localhost/api/drafts/${DRAFT_ID}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": REQUEST_ID },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const auditRows = () =>
  statements
    .filter((s) => s[0]?.method === "insert" && s[0].args[0] === auditLog)
    .map((s) => argOf(s, "values") as Record<string, unknown>);
const fieldUpdates = () =>
  statements.filter((s) => s[0]?.method === "update" && s[0].args[0] === draftField).map((s) => argOf(s, "set"));

function queueAuditWrite() {
  queueResult([{ id: BASE_VERSION_ID, label: "v1" }]);
  queueResult(undefined);
}

// The 9.6 DraftDocument the route answers with: the draft it read, carrying the state the transition moved it to.
function expectedBody(state: DraftState) {
  const row = draftRow();
  return {
    id: row.id,
    cluster_id: row.clusterId,
    equipment_tag: row.equipmentTag,
    state,
    lease_expires_at: null,
    corpus_version_id: row.corpusVersionId,
    opl_id_reserved: row.oplIdReserved,
    title: row.title,
    classification: row.classification,
    aspect: row.aspect,
    created_by_alias: row.createdByAlias,
    model_id: row.modelId,
    prompt_version: row.promptVersion,
    previous_draft_id: null,
    session_scope: null,
  };
}

/** transition() answers the state machine's shape; the route composes the body from it and the row it read. */
function transitionMoves(from: DraftState, to: DraftState) {
  vi.mocked(transition).mockResolvedValue({ from, to });
}

beforeEach(() => {
  resetFakeDb();
  setRequest({ headers: { "x-request-id": REQUEST_ID } });
});

describe("the Reviewing Supervisor", () => {
  it("accepts a draft in review: in_review -> accepted, 200 with the 9.6 draft", async () => {
    signedIn("Reviewing Supervisor", REQUEST_ID);
    queueResult([draftRow({ state: "in_review" })]);
    transitionMoves("in_review", "accepted");

    const res = await POST(post({ decision: "accept", reason: "the evidence carries it" }), context);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expectedBody("accepted"));
    expect(transition).toHaveBeenCalledWith(
      expect.anything(),
      DRAFT_ID,
      "accepted",
      SUPERVISOR,
      "the evidence carries it",
      null,
      expect.objectContaining({ route: ROUTE, auditId: REQUEST_ID }),
    );
  });

  it("rejects a draft in review: in_review -> rejected with the reason", async () => {
    signedIn("Reviewing Supervisor", REQUEST_ID);
    queueResult([draftRow({ state: "in_review" })]);
    transitionMoves("in_review", "rejected");

    const res = await POST(post({ decision: "reject", reason: "section 4 is not supported" }), context);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expectedBody("rejected"));
    expect(vi.mocked(transition).mock.calls[0]?.[2]).toBe("rejected");
    expect(vi.mocked(transition).mock.calls[0]?.[4]).toBe("section 4 is not supported");
  });

  it("edits: the text is written to draft_field, the diff is recorded and the draft stays in review", async () => {
    const field = fieldRow();
    const edited = "The replacement sentence this test writes.";
    signedIn("Reviewing Supervisor", REQUEST_ID);
    queueResult([draftRow({ state: "in_review" })]);
    queueResult([field]);
    transitionMoves("in_review", "in_review");

    const res = await POST(
      post({ decision: "edit", edits: [{ field_id: field.id, text: edited, reason: "wording" }] }),
      context,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expectedBody("in_review"));
    expect(fieldUpdates()).toEqual([{ text: edited }]);

    const call = vi.mocked(transition).mock.calls[0];
    expect(call?.[2]).toBe("in_review");
    const diff = String(call?.[5]);
    expect(diff).toContain(field.id);
    expect(diff).toContain(field.text);
    expect(diff).toContain(edited);
  });

  it("an edit with no edits[] is 400 invalid_body and touches no field", async () => {
    signedIn("Reviewing Supervisor", REQUEST_ID);

    const res = await POST(post({ decision: "edit" }), context);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_body" });
    expect(fieldUpdates()).toHaveLength(0);
    expect(transition).not.toHaveBeenCalled();
  });

  it("may not decide on a draft that is not in review: 403, audited, no transition", async () => {
    signedIn("Reviewing Supervisor", REQUEST_ID);
    queueResult([draftRow({ state: "accepted" })]);
    queueAuditWrite();

    const res = await POST(post({ decision: "accept" }), context);

    expect(res.status).toBe(403);
    expect(transition).not.toHaveBeenCalled();
    expect(auditRows()[0]).toMatchObject({ action: "auth.role_violation", entityId: "decide", route: ROUTE });
  });

  it("an unknown draft is the designed 404", async () => {
    signedIn("Reviewing Supervisor", REQUEST_ID);
    queueResult([]);

    const res = await POST(post({ decision: "accept" }), context);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found", entity: "draft", id: DRAFT_ID });
    expect(transition).not.toHaveBeenCalled();
  });

  it("a body outside the 9.9 shape is 400 invalid_body", async () => {
    for (const body of [{ decision: "publish" }, { decision: "accept", edits: "no" }, "{", {}]) {
      resetFakeDb();
      signedIn("Reviewing Supervisor", REQUEST_ID);
      const res = await POST(post(body), context);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(transition).not.toHaveBeenCalled();
  });
});

describe("the Manager holds reject-from-accepted only (9.9)", () => {
  it("rejects an accepted draft: accepted -> rejected", async () => {
    signedIn("Manager", REQUEST_ID);
    queueResult([draftRow({ state: "accepted" })]);
    transitionMoves("accepted", "rejected");

    const res = await POST(post({ decision: "reject", reason: "not this revision" }), context);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expectedBody("rejected"));
    expect(transition).toHaveBeenCalledWith(
      expect.anything(),
      DRAFT_ID,
      "rejected",
      MANAGER,
      "not this revision",
      null,
      expect.objectContaining({ route: ROUTE, auditId: REQUEST_ID }),
    );
  });

  it.each([
    ["accept", "in_review"],
    ["accept", "accepted"],
    ["edit", "in_review"],
    ["reject", "in_review"],
  ] as const)("%s on a draft in state %s is 403 with auth.role_violation and no transition (AC-LOOP-08)", async (decision, state) => {
    signedIn("Manager", REQUEST_ID);
    queueResult([draftRow({ state })]);
    queueAuditWrite();

    const body =
      decision === "edit"
        ? { decision, edits: [{ field_id: fieldRow().id, text: "x", reason: "y" }] }
        : { decision };
    const res = await POST(post(body), context);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden", request_id: REQUEST_ID });
    expect(transition).not.toHaveBeenCalled();
    expect(auditRows()[0]).toMatchObject({
      id: REQUEST_ID,
      actorRole: "Manager",
      action: "auth.role_violation",
      entity: "permission",
      entityId: "decide",
      route: ROUTE,
    });
  });
});

describe("the roles without the decide column", () => {
  it.each(["Engineer", "Admin"] as const)(
    "%s is 403 with auth.role_violation before any draft is read (AC-LOOP-08)",
    async (role: Role) => {
      signedIn(role, REQUEST_ID);
      queueAuditWrite();

      const res = await POST(post({ decision: "accept" }), context);

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden", request_id: REQUEST_ID });
      expect(transition).not.toHaveBeenCalled();
      expect(auditRows()[0]).toMatchObject({
        id: REQUEST_ID,
        actorRole: role,
        action: "auth.role_violation",
        entity: "permission",
        entityId: "decide",
        route: ROUTE,
      });
    },
  );

  it("no session is 401 and touches nothing", async () => {
    const res = await POST(post({ decision: "accept" }), context);

    expect(res.status).toBe(401);
    expect(statements).toHaveLength(0);
    expect(transition).not.toHaveBeenCalled();
  });
});
