// G3, the publication gate (blueprint 9.9 POST /api/drafts/:id/publish, INV-3; ARCHITECTURE 8.6; AC-LOOP-09,
// AC-LOOP-12). One Drizzle transaction, in the order 8.6 sets out:
//
//   1. pg_advisory_xact_lock('thehub.g3'), so one publisher runs at a time across instances;
//   2. the draft re-read FOR UPDATE, and the three refusals: published -> 409, not accepted -> 422 { gate, reason },
//      a slot with no SME note -> 422 outstanding_slot; each happens before anything of the corpus is written;
//   3. the lesson: document, revision, spans, chunks, the opl row and its steps, the provenance edges;
//   4. the child corpus version, never activated, and the coverage recount over its lineage;
//   5. the notes become citeable, the sandbox points at the new version, and the state machine moves the draft to
//      `published`, writing the transition row and the `draft.published` audit event bound to that version;
//   6. commit, and answer { document_revision_id, corpus_version, coverage_recount }.
//
// Only the Manager reaches any of it: the check is the first line of the function, before the lock and before any
// read, so a non-privileged call costs nothing and can never leave a lock held (INV-3). Ten concurrent publishes of
// one accepted draft therefore produce one revision, one version and nine 409s, and a retried request reads
// `published` and gets its 409 (tests/db/loop.test.ts).
import { asc, eq, sql } from "drizzle-orm";
import type { CorpusVersion, Role } from "@/contracts/generated/serving";
import { withTransaction, type Tx } from "@/db/client";
import { flipNotesCiteable, lockDraft, type FieldRow } from "@/db/queries/loop";
import { draftField, sandbox, smeNote } from "@/db/schema";
import { toCorpusVersion } from "@/db/versions";
import { Forbidden, HttpError, NotFound } from "@/lib/errors";
import { getRequestId } from "@/lib/request-id";
import { recount, type CoverageRecount } from "@/loop/recount";
import { transition } from "@/loop/state";
import { writeLesson } from "./g3/lesson";
import { createChildVersion } from "./g3/version";

/** The 9.9 route pattern the audit event of a publication carries. */
export const PUBLISH_ROUTE = "/api/drafts/:id/publish";
/** The gate this file is, as the 422 body names it. */
const GATE = "G3";

export type Actor = { alias: string; role: Role };

/** The 8.6 step 6 body of a publication. */
export type PublishResult = {
  document_revision_id: string;
  corpus_version: CorpusVersion;
  coverage_recount: CoverageRecount;
};

export async function publish(draftId: string, actor: Actor): Promise<PublishResult> {
  // INV-3: only a human Manager publishes, and the refusal costs no lock and no read.
  if (actor.role !== "Manager") throw new Forbidden();
  const auditId = await getRequestId();
  return withTransaction((tx) => publishIn(tx, draftId, actor, auditId));
}

async function publishIn(tx: Tx, draftId: string, actor: Actor, auditId: string): Promise<PublishResult> {
  // Step 1. One publisher at a time, for the life of this transaction; every loser waits here and then reads
  // `published` at step 2. The lock name is a constant, so hashtext gives every instance the same key.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('thehub.g3'))`);

  // Step 2. The draft as it is now, locked, and the three refusals.
  const draft = await lockDraft(tx, draftId);
  if (!draft) throw new NotFound("draft", draftId);
  if (draft.state === "published") throw new HttpError(409, "already_published", { draft_id: draftId });
  if (draft.state !== "accepted") {
    throw new HttpError(422, "gate_refused", { gate: GATE, reason: "not_accepted", state: draft.state });
  }

  const fields: FieldRow[] = await tx
    .select()
    .from(draftField)
    .where(eq(draftField.draftId, draftId))
    .orderBy(asc(draftField.section), asc(draftField.ordinal));
  const notes = await tx.select().from(smeNote).where(eq(smeNote.draftId, draftId));
  const noted = new Set(notes.map((n) => n.fieldId));
  const outstanding = fields.find((f) => f.isSlot && !noted.has(f.id));
  if (outstanding) {
    throw new HttpError(422, "gate_refused", { gate: GATE, reason: "outstanding_slot", field_id: outstanding.id });
  }

  // Steps 3 and 4. The version first: every row of the lesson binds to it.
  const version = await createChildVersion(tx, draft.corpusVersionId, actor, draft.oplIdReserved);
  const lesson = await writeLesson(tx, draft, fields, actor, version.id);
  const coverage = await recount(tx, version.id);

  // Step 5. The note that filled a slot is citeable from the moment its lesson is published (9.6).
  await flipNotesCiteable(
    tx,
    draftId,
    notes.map((n) => n.id),
  );
  // D-16: the visitor's sandbox now sees its own version, and no other visitor's numbers move.
  if (draft.sessionScope !== null) {
    await tx.update(sandbox).set({ corpusVersionId: version.id }).where(eq(sandbox.id, draft.sessionScope));
  }
  // The one writer of the state, which also writes the transition row and the audit event bound to the new version.
  await transition(tx, draftId, "published", actor, null, null, {
    route: PUBLISH_ROUTE,
    auditId,
    corpusVersionId: version.id,
  });

  return {
    document_revision_id: lesson.documentRevisionId,
    corpus_version: toCorpusVersion(version),
    coverage_recount: coverage,
  };
}
