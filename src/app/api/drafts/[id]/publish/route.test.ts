// POST /api/drafts/:id/publish (blueprint 9.9, INV-3; ARCHITECTURE 8.6; AC-LOOP-08, AC-LOOP-09). The Manager is
// the only role that reaches G3; every other role is 403, audited twice on purpose: `auth.role_violation` is the
// auth fact of 9.7 and `publication.rejected` is the publication fact AC-LOOP-09 names. The gate itself is mocked
// here (src/gates/g3.test.ts and tests/db/loop.test.ts own it): this file pins the wiring, the status codes and
// the body of 9.9, and that a refused attempt never calls the gate.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/contracts/generated/serving";
import { auditLog } from "@/db/schema";
import { toCorpusVersion } from "@/db/versions";
import { publish } from "@/gates/g3";
import { HttpError } from "@/lib/errors";
import { argOf, queueResult, resetFakeDb, statements } from "../../../../../../tests/helpers/fake-db-client";
import { setRequest } from "../../../../../../tests/helpers/next-headers";
import {
  BASE_VERSION_ID,
  COVERAGE_RECOUNT,
  DRAFT_ID,
  signedIn,
  versionRow,
} from "../../../../../../tests/fixtures/loop";
import { POST } from "./route";

// Only publish() is faked; anything else the route imports from the gate stays real.
vi.mock("@/gates/g3", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  publish: vi.fn(),
}));

const ROUTE = "/api/drafts/:id/publish";
const REQUEST_ID = "req-publish";

const RESULT = {
  document_revision_id: "rev-loop-1",
  corpus_version: toCorpusVersion(versionRow()),
  coverage_recount: COVERAGE_RECOUNT,
};

function post() {
  return new NextRequest(`http://localhost/api/drafts/${DRAFT_ID}/publish`, {
    method: "POST",
    headers: { "x-request-id": REQUEST_ID },
  });
}

const context = { params: Promise.resolve({ id: DRAFT_ID }) };

const auditRows = () =>
  statements
    .filter((s) => s[0]?.method === "insert" && s[0].args[0] === auditLog)
    .map((s) => argOf(s, "values") as Record<string, unknown>);
const auditFor = (action: string) => auditRows().find((v) => v.action === action);

/** What writeAudit() reads before each row it writes: the active version, then the insert. */
function queueAuditWrites(n: number) {
  for (let i = 0; i < n; i += 1) {
    queueResult([{ id: BASE_VERSION_ID, label: "v1" }]);
    queueResult(undefined);
  }
}

beforeEach(() => {
  resetFakeDb();
  setRequest({ headers: { "x-request-id": REQUEST_ID } });
});

describe("the Manager", () => {
  it("publishes: 200 { document_revision_id, corpus_version, coverage_recount } from G3", async () => {
    signedIn("Manager", REQUEST_ID);
    vi.mocked(publish).mockResolvedValue(RESULT);

    const res = await POST(post(), context);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
    expect(publish).toHaveBeenCalledWith(DRAFT_ID, { alias: "MANAGER", role: "Manager" });
  });

  it("renders the gate's 409 on a draft already published, and on the retried request (AC-LOOP-09)", async () => {
    signedIn("Manager", REQUEST_ID);
    vi.mocked(publish).mockRejectedValue(new HttpError(409, "already_published", { draft_id: DRAFT_ID }));

    const res = await POST(post(), context);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "already_published", request_id: REQUEST_ID });
  });

  it("renders the gate's 422 with { gate: G3, reason } on a draft that is not accepted", async () => {
    signedIn("Manager", REQUEST_ID);
    vi.mocked(publish).mockRejectedValue(new HttpError(422, "gate_refused", { gate: "G3", reason: "not_accepted" }));

    const res = await POST(post(), context);

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "gate_refused", gate: "G3", reason: "not_accepted", request_id: REQUEST_ID });
  });

  it("renders the gate's 422 outstanding_slot", async () => {
    signedIn("Manager", REQUEST_ID);
    vi.mocked(publish).mockRejectedValue(new HttpError(422, "gate_refused", { gate: "G3", reason: "outstanding_slot" }));

    const res = await POST(post(), context);

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ gate: "G3", reason: "outstanding_slot" });
  });
});

describe("every role but the Manager (AC-LOOP-08, AC-LOOP-09)", () => {
  it.each(["Engineer", "Reviewing Supervisor", "Admin"] as const)(
    "%s is 403, audited as auth.role_violation and publication.rejected, and never reaches G3",
    async (role: Role) => {
      signedIn(role, REQUEST_ID);
      queueAuditWrites(2);

      const res = await POST(post(), context);

      expect(res.status).toBe(403);
      expect(res.headers.get("x-request-id")).toBe(REQUEST_ID);
      expect(await res.json()).toEqual({ error: "forbidden", request_id: REQUEST_ID });
      expect(publish).not.toHaveBeenCalled();

      expect(auditFor("auth.role_violation")).toMatchObject({
        id: REQUEST_ID,
        actorRole: role,
        entity: "permission",
        entityId: "publish",
        route: ROUTE,
      });
      expect(auditFor("publication.rejected")).toMatchObject({
        actorRole: role,
        entity: "draft",
        entityId: DRAFT_ID,
        route: ROUTE,
      });
    },
  );

  it("no session is 401 and touches neither the database nor the gate", async () => {
    const res = await POST(post(), context);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated", request_id: REQUEST_ID });
    expect(statements).toHaveLength(0);
    expect(publish).not.toHaveBeenCalled();
  });
});
