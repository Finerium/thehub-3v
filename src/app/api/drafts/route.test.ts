// POST /api/drafts and GET /api/drafts (blueprint 9.6, 9.9, ADR-004; ARCHITECTURE 8.2, 8.5; AC-LOOP-13,
// AC-LOOP-15). POST is the only entry to the drafting loop: under `create_draft` and the `draft:<user_id>` limit of
// five a minute, it inserts the draft in `proposed` with a 240 s lease, the asset's next lesson id reserved and the
// visitor's sandbox as `session_scope`, answers 202 { draft_id, state } inside the handler and hands the work to
// runDraft through the invocation's waitUntil (`after`), which the test replaces so nothing runs after the response.
// GET is the queue, read within the same scope: the seeded drafts (`session_scope IS NULL`) and the visitor's own.
//
// Hermetic. `after`, runDraft and the database are replaced; the session cookie is signed by the run's own key.
// The reads the handlers make, in order, are queued below; every write settles with `undefined`, so neither handler
// may destructure the result of a write.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftDocument } from "@/contracts/generated/drafts";
import type { Role } from "@/contracts/generated/serving";
import { SANDBOX_COOKIE, SESSION_COOKIE, signSessionId } from "@/auth/cookie";
import { auditLog, draftDocument } from "@/db/schema";
import { MODEL_ID, PROMPTS } from "@/gateway";
import { LIMITS } from "@/lib/ratelimit";
import { LEASE_SECONDS } from "@/loop/lease";
import {
  CLUSTER,
  CLUSTER_ID,
  CORPUS_VERSION,
  SANDBOX_ID,
  SANDBOX_ROW,
  SUPERVISOR,
  TAG,
  draftRow,
  queryOf,
  rowOf,
} from "../../../../tests/fixtures/drafting";
import { argOf, queueResult, resetFakeDb, statements } from "../../../../tests/helpers/fake-db-client";
import { setRequest } from "../../../../tests/helpers/next-headers";
import { GET, POST, maxDuration } from "./route";

const scheduler = vi.hoisted(() => ({ after: vi.fn() }));
const drafter = vi.hoisted(() => ({ runDraft: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: scheduler.after }));
vi.mock("@/loop/draft", () => ({ runDraft: drafter.runDraft, HOUSE_TEMPLATE: {} }));

const REQUEST_ID = "req-drafts";
const OPL_IDS = [{ oplId: "OPL-GA-9901A-01" }, { oplId: "OPL-GA-9901A-02" }];

function signedIn(role: Role = "Reviewing Supervisor") {
  setRequest({
    cookies: { [SESSION_COOKIE]: signSessionId(SUPERVISOR.sessionId), [SANDBOX_COOKIE]: SANDBOX_ID },
    headers: { "x-request-id": REQUEST_ID, "x-request-path": "/api/drafts" },
  });
  queueResult([{ ...SUPERVISOR, role }]);
}

/** What POST reads, in order after the session: the rate-limit window, the sandbox, the cluster, the lesson ids in
 *  use by the asset (published lessons and the ids other drafts already reserve, which is a unique column). Four
 *  reads and no fifth: the audit event binds to the corpus version the cluster names, so writeAudit() never has to
 *  look the active version up again. */
function queueCreate(count = 1) {
  queueResult([{ count, windowStart: new Date("2026-09-07T10:00:00.000Z") }]);
  queueResult([SANDBOX_ROW]);
  queueResult([rowOf(CLUSTER)]);
  queueResult(OPL_IDS);
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/drafts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": REQUEST_ID },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const get = (search = "") => new NextRequest(`http://localhost/api/drafts${search}`, { headers: { "x-request-id": REQUEST_ID } });
const insertInto = (table: unknown) => statements.find((s) => s[0]?.method === "insert" && s[0].args[0] === table);
const draftInsert = () => argOf(insertInto(draftDocument)!, "values") as Record<string, unknown>;

beforeEach(() => {
  resetFakeDb();
  scheduler.after.mockReset();
  drafter.runDraft.mockReset();
  drafter.runDraft.mockResolvedValue(undefined);
});

describe("POST /api/drafts", () => {
  it("answers 202 { draft_id, state } with the request id, and never waits for the drafting", async () => {
    signedIn();
    queueCreate();
    const response = await POST(post({ cluster_id: CLUSTER_ID }), undefined);

    expect(response.status).toBe(202);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    const body = (await response.json()) as { draft_id: string; state: string };
    expect(body.state).toBe("proposed");
    expect(body.draft_id).toEqual(expect.any(String));
    expect(body.draft_id).toBe(draftInsert().id);
    expect(drafter.runDraft).not.toHaveBeenCalled();
  });

  it("hands runDraft to the invocation's waitUntil exactly once, for the draft it just created (ADR-004)", async () => {
    signedIn();
    queueCreate();
    const response = await POST(post({ cluster_id: CLUSTER_ID }), undefined);
    const { draft_id } = (await response.json()) as { draft_id: string };

    expect(scheduler.after).toHaveBeenCalledTimes(1);
    const scheduled = scheduler.after.mock.calls[0]?.[0] as () => unknown;
    expect(typeof scheduled).toBe("function"); // a callback, so the response is never blocked on the drafting
    await scheduled();
    expect(drafter.runDraft).toHaveBeenCalledExactlyOnceWith(draft_id);
  });

  it("declares the maximum duration the plan allows, which bounds the drafting work", () => {
    expect(maxDuration).toBe(300);
  });

  it("inserts the draft in proposed with a 240 s lease taken from the database clock", async () => {
    signedIn();
    queueCreate();
    await POST(post({ cluster_id: CLUSTER_ID }), undefined);

    const values = draftInsert();
    expect(values).toMatchObject({ state: "proposed", clusterId: CLUSTER_ID, equipmentTag: TAG, corpusVersionId: CORPUS_VERSION.id });
    expect(LEASE_SECONDS).toBe(240);
    expect(JSON.stringify(queryOf(values.leaseExpiresAt))).toContain(String(LEASE_SECONDS));
    expect(queryOf(values.leaseExpiresAt).sql).toContain("now()");
  });

  it("scopes the draft to the visitor's sandbox and reserves the asset's next lesson id (D-16)", async () => {
    signedIn();
    queueCreate();
    await POST(post({ cluster_id: CLUSTER_ID }), undefined);

    expect(draftInsert()).toMatchObject({ sessionScope: SANDBOX_ID, oplIdReserved: "OPL-GA-9901A-03" });
  });

  it("stamps the drafting pins and the alias of the person who asked, with a provisional header", async () => {
    signedIn();
    queueCreate();
    await POST(post({ cluster_id: CLUSTER_ID }), undefined);

    const values = draftInsert();
    expect(values).toMatchObject({ createdByAlias: SUPERVISOR.alias, modelId: MODEL_ID, promptVersion: PROMPTS["AG-3"].version, previousDraftId: null });
    for (const key of ["title", "classification", "aspect"] as const) expect(String(values[key]).length).toBeGreaterThan(0);
  });

  it("writes draft.created under the request id, with no draft body in the payload (9.7)", async () => {
    signedIn();
    queueCreate();
    await POST(post({ cluster_id: CLUSTER_ID }), undefined);

    const audit = argOf(insertInto(auditLog)!, "values") as Record<string, unknown>;
    expect(audit).toMatchObject({
      id: REQUEST_ID,
      actorAlias: SUPERVISOR.alias,
      actorRole: "Reviewing Supervisor",
      action: "draft.created",
      entity: "draft",
      route: "/api/drafts",
      corpusVersionId: CORPUS_VERSION.id,
    });
    expect(audit.entityId).toBe(draftInsert().id);
  });

  it("counts the hit against draft:<user_id> and renders the designed 429 above five a minute (9.9)", async () => {
    signedIn();
    queueCreate(LIMITS.draft + 1);
    const response = await POST(post({ cluster_id: CLUSTER_ID }), undefined);

    expect(LIMITS.draft).toBe(5);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limited", scope: "draft", limit: 5, resets_at: expect.any(String) });
    expect(response.headers.get("retry-after")).toEqual(expect.any(String));
    expect(argOf(statements[1]!, "values")).toMatchObject({ scope: "draft", key: SUPERVISOR.id });
    expect(insertInto(draftDocument)).toBeUndefined();
    expect(scheduler.after).not.toHaveBeenCalled();
  });

  it("answers 400 invalid_body for a body without cluster_id, before it touches anything else", async () => {
    signedIn();
    const response = await POST(post({ cluster: CLUSTER_ID }), undefined);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_body" });
    expect(statements).toHaveLength(1);
  });

  it("answers the designed 404 for a cluster id no version carries, creating nothing", async () => {
    signedIn();
    queueResult([{ count: 1, windowStart: new Date("2026-09-07T10:00:00.000Z") }]);
    queueResult([SANDBOX_ROW]);
    queueResult([]);
    const response = await POST(post({ cluster_id: "dc-nope" }), undefined);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found", entity: "debt_cluster", id: "dc-nope" });
    expect(insertInto(draftDocument)).toBeUndefined();
    expect(scheduler.after).not.toHaveBeenCalled();
  });

  it.each(["Engineer", "Manager", "Admin"] as const)("answers 403 for %s and audits auth.role_violation (9.9)", async (role) => {
    signedIn(role);
    queueResult([{ id: CORPUS_VERSION.id, label: CORPUS_VERSION.label }]); // writeAudit resolves the active version
    const response = await POST(post({ cluster_id: CLUSTER_ID }), undefined);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "forbidden" });
    expect(argOf(insertInto(auditLog)!, "values")).toMatchObject({ id: REQUEST_ID, action: "auth.role_violation", entityId: "create_draft" });
    expect(insertInto(draftDocument)).toBeUndefined();
    expect(scheduler.after).not.toHaveBeenCalled();
  });

  it("answers 401 without a session, touching nothing", async () => {
    setRequest({ headers: { "x-request-id": REQUEST_ID } });
    const response = await POST(post({ cluster_id: CLUSTER_ID }), undefined);

    expect(response.status).toBe(401);
    expect(statements).toHaveLength(0);
  });
});

describe("GET /api/drafts, the queue", () => {
  const QUEUE = [draftRow({ id: "dr-seeded", state: "in_review", sessionScope: null }), draftRow({ id: "dr-mine", state: "proposed" })];

  function queueList() {
    queueResult([SANDBOX_ROW]);
    queueResult(QUEUE);
  }

  it("returns the drafts in the contract's spelling", async () => {
    signedIn();
    queueList();
    const response = await GET(get(), undefined);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { drafts: unknown[] };
    expect(body.drafts.map((d) => DraftDocument.parse(d).id)).toEqual(["dr-seeded", "dr-mine"]);
  });

  it("reads within the visitor's scope: the seeded drafts and its own sandbox, never another (AC-LOOP-13)", async () => {
    signedIn();
    queueList();
    await GET(get(), undefined);

    const read = statements.at(-1)!;
    expect(read.some((c) => c.method === "from" && c.args[0] === draftDocument)).toBe(true);
    const where = queryOf(argOf(read, "where"));
    expect(where.sql.toLowerCase()).toContain("session_scope");
    expect(where.sql.toLowerCase()).toContain("is null");
    expect(where.params).toContain(SANDBOX_ID);
  });

  it("orders the queue by state so the work waiting on a person is not buried", async () => {
    signedIn();
    queueList();
    await GET(get(), undefined);

    const read = statements.at(-1)!;
    expect(read.some((c) => c.method === "orderBy")).toBe(true);
  });

  it("answers 403 for Admin, who holds no view_drafts column (9.9)", async () => {
    signedIn("Admin");
    const response = await GET(get(), undefined);
    expect(response.status).toBe(403);
  });
});
