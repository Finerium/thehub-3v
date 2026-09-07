// POST /api/sme-notes (blueprint 9.9 `add_sme_note`, 9.6 SmeNote; ARCHITECTURE 8.4; AC-LOOP-11). The note fills
// exactly one slot field: `is_slot` true, provenance the fixed "human, dated, unreviewed", the author's alias and
// role, `citeable` false until G3 publishes the carrying lesson. Every role but the Admin may write one; a field
// that is not a slot is 422. The route writes the note and answers from the values it wrote (no RETURNING), so the
// captured_at it stores is the captured_at it answers with. The draft_field row itself is never touched: the slot
// keeps the 9.6 literal and G3 is what reads the note beside it.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { SmeNote } from "@/contracts/generated/drafts";
import type { Role } from "@/contracts/generated/serving";
import { auditLog, draftField, smeNote } from "@/db/schema";
import { argOf, queueResult, resetFakeDb, statements } from "../../../../tests/helpers/fake-db-client";
import { setRequest } from "../../../../tests/helpers/next-headers";
import { BASE_VERSION_ID, DRAFT_ID, fieldRow, signedIn, slotFieldRow } from "../../../../tests/fixtures/loop";
import { POST } from "./route";

const ROUTE = "/api/sme-notes";
const REQUEST_ID = "req-sme-note";
const PROVENANCE = SmeNote.shape.provenance.value; // 9.6, read from the contract so it is never retyped
const TEXT = "Twelve months, from the coupling supplier's service letter held by the shop.";

const SLOT = slotFieldRow();

function post(body: unknown) {
  return new NextRequest("http://localhost/api/sme-notes", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": REQUEST_ID },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = { draft_id: DRAFT_ID, field_id: SLOT.id, text: TEXT };

const chainsOn = (method: string, table: unknown) =>
  statements.filter((s) => s[0]?.method === method && s[0].args[0] === table);
const noteInsert = () => chainsOn("insert", smeNote)[0];
const auditValues = () => chainsOn("insert", auditLog).map((s) => argOf(s, "values") as Record<string, unknown>);

function queueAuditWrite() {
  queueResult([{ id: BASE_VERSION_ID, label: "v1" }]);
  queueResult(undefined);
}

beforeEach(() => {
  resetFakeDb();
  setRequest({ headers: { "x-request-id": REQUEST_ID } });
});

describe("the note", () => {
  it.each(["Engineer", "Reviewing Supervisor", "Manager"] as const)(
    "%s fills the one slot: 201 SmeNote, provenance fixed, citeable false, author alias and role recorded",
    async (role: Role) => {
      signedIn(role, REQUEST_ID);
      queueResult([SLOT]);
      queueAuditWrite();

      const res = await POST(post({ ...validBody, source_reference: "supplier service letter" }), undefined);

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(() => SmeNote.parse(body)).not.toThrow();
      expect(body).toMatchObject({
        draft_id: DRAFT_ID,
        field_id: SLOT.id,
        author_alias: role.toUpperCase().replace(/\s+/g, "_"),
        author_role: role,
        text: TEXT,
        source_reference: "supplier service letter",
        provenance: PROVENANCE,
        citeable: false,
      });

      const written = argOf(noteInsert()!, "values") as Record<string, unknown>;
      expect(written).toMatchObject({
        draftId: DRAFT_ID,
        fieldId: SLOT.id,
        authorRole: role,
        text: TEXT,
        provenance: PROVENANCE,
        citeable: false,
      });
      expect(written.id).toBe(body.id);
      expect(new Date(String(body.captured_at)).toISOString()).toBe(body.captured_at);
    },
  );

  it("writes exactly one note and never touches the draft_field row (the slot keeps its literal)", async () => {
    signedIn("Engineer", REQUEST_ID);
    queueResult([SLOT]);
    queueAuditWrite();

    await POST(post(validBody), undefined);

    expect(chainsOn("insert", smeNote)).toHaveLength(1);
    expect(chainsOn("update", draftField)).toHaveLength(0);
  });

  it("audits sme_note.added with the ids and no note text (9.7)", async () => {
    signedIn("Engineer", REQUEST_ID);
    queueResult([SLOT]);
    queueAuditWrite();

    await POST(post(validBody), undefined);

    const [event] = auditValues();
    expect(event).toMatchObject({ action: "sme_note.added", entity: "sme_note", route: ROUTE, actorRole: "Engineer" });
    expect(JSON.stringify(event?.payload)).not.toContain(TEXT);
    expect(event?.payload).toMatchObject({ draft_id: DRAFT_ID, field_id: SLOT.id });
  });

  it("a field that is not a slot is 422 and writes no note", async () => {
    signedIn("Engineer", REQUEST_ID);
    queueResult([fieldRow()]);

    const res = await POST(post({ ...validBody, field_id: fieldRow().id }), undefined);

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "not_a_slot", request_id: REQUEST_ID });
    expect(noteInsert()).toBeUndefined();
  });

  it("a field that is not on this draft is the designed 404", async () => {
    signedIn("Engineer", REQUEST_ID);
    queueResult([]);

    const res = await POST(post({ ...validBody, field_id: "field-of-another-draft" }), undefined);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found", entity: "draft_field" });
    expect(noteInsert()).toBeUndefined();
  });

  it.each([{}, { draft_id: DRAFT_ID }, { ...validBody, text: "" }, { ...validBody, citeable: true }, "{"])(
    "a body outside the 9.9 shape is 400 invalid_body",
    async (body) => {
      signedIn("Engineer", REQUEST_ID);

      const res = await POST(post(body), undefined);

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_body" });
      expect(noteInsert()).toBeUndefined();
    },
  );
});

describe("the Admin holds no add_sme_note column (9.9, AC-LOOP-08)", () => {
  it("is 403 with auth.role_violation under the request id, and writes no note", async () => {
    signedIn("Admin", REQUEST_ID);
    queueAuditWrite();

    const res = await POST(post(validBody), undefined);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden", request_id: REQUEST_ID });
    expect(noteInsert()).toBeUndefined();
    expect(auditValues()[0]).toMatchObject({
      id: REQUEST_ID,
      actorRole: "Admin",
      action: "auth.role_violation",
      entity: "permission",
      entityId: "add_sme_note",
      route: ROUTE,
    });
  });

  it("no session is 401 and touches nothing", async () => {
    const res = await POST(post(validBody), undefined);

    expect(res.status).toBe(401);
    expect(statements).toHaveLength(0);
  });
});
