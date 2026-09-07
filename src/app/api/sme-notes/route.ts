// POST /api/sme-notes (blueprint 9.9 `add_sme_note`, 9.6 SmeNote; ARCHITECTURE 8.4; AC-LOOP-11). The engineer's
// judgement that fills one slot the drafter left: the field must belong to the named draft and must be a slot
// (`is_slot` true), and the note is written with the fixed provenance of 9.6, the author's alias and role, and
// `citeable` false until G3 publishes the carrying lesson. The draft_field row is never touched, so the slot keeps
// its literal and the drafter never writes a slot; after publication the note renders with the fixed
// unverified-value line (src/lib/fixed-strings.ts).
//
// Every role but the Admin holds the column (9.9), which authorize() enforces before this handler runs. The audit
// event carries the two ids and no note text (9.7). egress: none
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { SmeNote } from "@/contracts/generated/drafts";
import { db } from "@/db/client";
import { readField, toSmeNote, type NoteRow } from "@/db/queries/loop";
import { smeNote } from "@/db/schema";
import { activeCorpusVersion, writeAudit } from "@/lib/audit";
import { HttpError, NotFound } from "@/lib/errors";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";

export const dynamic = "force-dynamic";

const ROUTE = "/api/sme-notes";

/** 9.6: the one provenance an SME note may carry, read from the contract so the wording is never retyped. */
const PROVENANCE = SmeNote.shape.provenance.value;

// 9.9 `{ draft_id, field_id, text, source_reference? }`. `citeable` is not the caller's to set (9.6: false until
// publication), so a body carrying it is refused by `.strict()` rather than silently ignored.
const Body = z
  .object({
    draft_id: z.string().min(1).max(200),
    field_id: z.string().min(1).max(200),
    text: z.string().min(1).max(4000),
    source_reference: z.string().min(1).max(500).optional(),
  })
  .strict();

export const POST = withRoute(ROUTE, "add_sme_note", async (request: NextRequest, _context: unknown, user) => {
  const requestId = requestIdOf(request);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body");
  const { draft_id: draftId, field_id: fieldId, text } = parsed.data;

  const field = await readField(draftId, fieldId);
  if (!field) throw new NotFound("draft_field", fieldId);
  if (!field.isSlot) throw new HttpError(422, "not_a_slot", { draft_id: draftId, field_id: fieldId });

  const version = await activeCorpusVersion();
  const row: NoteRow = {
    id: crypto.randomUUID(),
    draftId,
    fieldId,
    authorAlias: user.alias,
    authorRole: user.role,
    capturedAt: new Date(),
    text,
    sourceReference: parsed.data.source_reference ?? null,
    provenance: PROVENANCE,
    citeable: false,
  };
  await db.insert(smeNote).values(row);
  await writeAudit({
    id: requestId,
    actor_alias: user.alias,
    actor_role: user.role,
    action: "sme_note.added",
    entity: "sme_note",
    entity_id: row.id,
    payload: { draft_id: draftId, field_id: fieldId },
    trace_id: null,
    route: ROUTE,
    corpus_version_id: version?.id,
  });

  return NextResponse.json(toSmeNote(row), {
    status: 201,
    headers: { [REQUEST_ID_HEADER]: requestId, "cache-control": "private, no-store" },
  });
});
