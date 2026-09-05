// POST /api/admin/corpus/activate (9.9, ARCHITECTURE 5 and 10; AC-ING-10, AC-LOOP-13): the Admin session under
// activate_version, or the nightly job under `Authorization: Bearer <ADMIN_JOB_TOKEN>` audited as
// job:nightly-activation; any other role is a 403 with auth.role_violation; no session and no valid token is a 401.
// The audit event id is the request id. The database is the fake client; the token is a value set by this file.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/contracts/generated/serving";
import { argOf, queueResult, resetFakeDb, statements } from "../../../../../../tests/helpers/fake-db-client";
import { setRequest } from "../../../../../../tests/helpers/next-headers";
import { SESSION_COOKIE, signSessionId } from "@/auth/cookie";
import { auditLog, corpusVersion } from "@/db/schema";
import { ACTIVATED_ACTION, ACTIVATE_ROUTE } from "@/db/versions";
import { JOB_ACTOR, POST } from "./route";

const JOB_TOKEN = "job-token-for-this-test-file-only";
const REQUEST_ID = "req-activate";

const VERSIONS = [
  { id: "cv-v1", parentVersionId: null },
  { id: "cv-v2", parentVersionId: "cv-v1" },
];
const PIN = { provider: "zai", model_id: "glm-5.3-flash", prompt_version: null };
const ACTIVATED = {
  id: "cv-v1",
  label: "v0-equipment-master",
  isActive: true,
  manifestSha256: "a".repeat(64),
  corpusSha256: "b".repeat(64),
  extractor: "pdftotext -raw (pdftotext version 26.02.0)",
  embeddingModel: "pending-local-onnx",
  embeddingDim: 384,
  modelPins: { "AG-1": PIN, "AG-2": PIN, "AG-3": PIN, "AG-4": PIN, embedding: { ...PIN, provider: "local_embedding", model_id: "pending-local-onnx" } },
  createdByAlias: "seed",
  createdAt: new Date("2026-09-04T21:00:00.000Z"),
  activatedByAlias: "ADMIN",
  activatedAt: new Date("2026-09-05T17:00:00.000Z"),
  parentVersionId: null,
};

function signedIn(role: Role) {
  setRequest({ cookies: { [SESSION_COOKIE]: signSessionId("sess-1") }, headers: { "x-request-id": REQUEST_ID } });
  queueResult([{ id: `u-${role}`, username: "demo", alias: role.toUpperCase(), role, sessionId: "sess-1", expiresAt: new Date(Date.now() + 1000) }]);
}

// What the activation transaction awaits, in order (src/db/versions.ts activateIn): the lock, the clear, the set
// (RETURNING the row), the is_current clear, the lineage's revisions (none here) and the audit row.
function queueActivation() {
  queueResult(VERSIONS);
  queueResult(undefined);
  queueResult([ACTIVATED]);
  queueResult(undefined);
  queueResult([]);
  queueResult(undefined);
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/admin/corpus/activate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": REQUEST_ID, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const auditInsert = () => statements.find((s) => s[0]?.method === "insert" && s[0].args[0] === auditLog);
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(() => {
  resetFakeDb();
  setRequest({ headers: { "x-request-id": REQUEST_ID } });
  process.env.ADMIN_JOB_TOKEN = JOB_TOKEN;
});

afterEach(() => {
  delete process.env.ADMIN_JOB_TOKEN;
});

describe("the Admin session", () => {
  it("activates the named version: 200 with the CorpusVersion, audited under the request id as the Admin", async () => {
    signedIn("Admin");
    queueActivation();
    const res = await POST(post({ version_id: "cv-v1" }), undefined);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "cv-v1", is_active: true, activated_by_alias: "ADMIN" });
    expect(statements[1]?.some((c) => c.method === "from" && c.args[0] === corpusVersion)).toBe(true);
    expect(argOf(auditInsert()!, "values")).toMatchObject({
      id: REQUEST_ID,
      actorAlias: "ADMIN",
      actorRole: "Admin",
      action: ACTIVATED_ACTION,
      entityId: "cv-v1",
      route: ACTIVATE_ROUTE,
    });
  });

  it("answers 400 invalid_body for a body without version_id, after the session check and before any lock", async () => {
    signedIn("Admin");
    const res = await POST(post({ version: "cv-v1" }), undefined);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
    expect(statements).toHaveLength(1);
  });

  it("answers the designed 404 not_found with the request id for an unknown version", async () => {
    signedIn("Admin");
    queueResult(VERSIONS);
    const res = await POST(post({ version_id: "cv-nope" }), undefined);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(await res.json()).toEqual({ error: "not_found", request_id: REQUEST_ID, entity: "corpus_version", id: "cv-nope" });
    expect(auditInsert()).toBeUndefined();
  });
});

describe("the job principal (ADMIN_JOB_TOKEN)", () => {
  it("activates without a session, audited as job:nightly-activation with role job", async () => {
    queueActivation();
    const res = await POST(post({ version_id: "cv-v1" }, bearer(JOB_TOKEN)), undefined);

    expect(res.status).toBe(200);
    expect(JOB_ACTOR).toEqual({ alias: "job:nightly-activation", role: "job" });
    expect(statements[0]?.some((c) => c.method === "for" && c.args[0] === "update")).toBe(true);
    expect(argOf(auditInsert()!, "values")).toMatchObject({
      id: REQUEST_ID,
      actorAlias: "job:nightly-activation",
      actorRole: "job",
      action: ACTIVATED_ACTION,
      entityId: "cv-v1",
      route: ACTIVATE_ROUTE,
    });
  });

  it("answers 401 for a wrong token, a token of another length, an empty bearer and a non-bearer scheme, touching nothing", async () => {
    for (const authorization of ["Bearer wrong-token-of-the-very-same-length", "Bearer short", "Bearer ", `Basic ${JOB_TOKEN}`]) {
      resetFakeDb();
      const res = await POST(post({ version_id: "cv-v1" }, { authorization }), undefined);
      expect(res.status, authorization).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthenticated", request_id: REQUEST_ID });
      expect(statements).toHaveLength(0);
    }
  });

  it("answers 401 for the right token when no ADMIN_JOB_TOKEN is configured", async () => {
    delete process.env.ADMIN_JOB_TOKEN;
    const res = await POST(post({ version_id: "cv-v1" }, bearer(JOB_TOKEN)), undefined);
    expect(res.status).toBe(401);
    expect(statements).toHaveLength(0);
  });

  it("a wrong token never widens or narrows a session: the Admin still activates, an Engineer is still refused", async () => {
    signedIn("Admin");
    queueActivation();
    expect((await POST(post({ version_id: "cv-v1" }, bearer("wrong")), undefined)).status).toBe(200);

    resetFakeDb();
    signedIn("Engineer");
    queueResult([{ id: "cv-v1", label: "v0-equipment-master" }]);
    queueResult(undefined);
    expect((await POST(post({ version_id: "cv-v1" }, bearer("wrong")), undefined)).status).toBe(403);
  });
});

describe("every other role", () => {
  it.each(["Engineer", "Reviewing Supervisor", "Manager"] as const)("%s is a 403 with auth.role_violation under the request id, and no activation", async (role) => {
    signedIn(role);
    queueResult([{ id: "cv-v1", label: "v0-equipment-master" }]); // activeCorpusVersion() for the audit row
    queueResult(undefined); // the audit insert
    const res = await POST(post({ version_id: "cv-v1" }), undefined);

    expect(res.status).toBe(403);
    expect(res.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(await res.json()).toEqual({ error: "forbidden", request_id: REQUEST_ID });
    expect(argOf(auditInsert()!, "values")).toMatchObject({
      id: REQUEST_ID,
      actorAlias: role.toUpperCase(),
      actorRole: role,
      action: "auth.role_violation",
      entity: "permission",
      entityId: "activate_version",
      payload: { permission: "activate_version", role },
      route: ACTIVATE_ROUTE,
      corpusVersionId: "cv-v1",
    });
    expect(statements.some((s) => s.some((c) => c.method === "for"))).toBe(false);
  });

  it("no session and no token is a 401", async () => {
    const res = await POST(post({ version_id: "cv-v1" }), undefined);
    expect(res.status).toBe(401);
    expect(statements).toHaveLength(0);
  });
});
