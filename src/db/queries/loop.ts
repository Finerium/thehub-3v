// The reads the loop lane shares (blueprint 9.6, 9.9; ARCHITECTURE 8.2, 8.4, 8.6): the draft, its fields, its
// section 5 rows, its redline verdicts, its transitions and its SME notes, plus the five mappers that put a Drizzle
// row into the spelling of section 9.6 and validate it through the generated Zod on the way out (ARCHITECTURE 1.4).
// The rows have no mapper: 9.6 names no envelope shape of their own, and their one contract is AG-3's
// `troubleshooting_rows`, which src/loop/rows.ts already parses through the generated Zod before it writes. Both the
// drafting lane (POST /api/drafts, the poll, re-proposal) and the review lane (decision, publish, the SME note)
// read through this module, so a column name lives here once.
//
// Nothing here writes except `flipNotesCiteable`, which G3 calls inside its transaction; every state write goes
// through src/loop/state.ts, the one writer of draft_document.state. `lockDraft` is the FOR UPDATE re-read both
// the state machine and G3 open with, so it takes the transaction; every other read is request-scoped and takes
// the HTTP client. INV-1: no module under src/answer/ imports this file.
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { DraftDocument, DraftField, DraftTransition, RedlineVerdict, SmeNote } from "@/contracts/generated/drafts";
import { db, type Tx } from "@/db/client";
import { draftDocument, draftField, draftTransition, redlineVerdict, smeNote } from "@/db/schema";

export type DraftRow = typeof draftDocument.$inferSelect;
export type FieldRow = typeof draftField.$inferSelect;
export type VerdictRow = typeof redlineVerdict.$inferSelect;
export type TransitionRow = typeof draftTransition.$inferSelect;
export type NoteRow = typeof smeNote.$inferSelect;

const iso = (at: Date): string => new Date(at).toISOString();
const isoOrNull = (at: Date | null): string | null => (at === null ? null : iso(at));

// ---------------------------------------------------------------------------------------------------------------
// Row mappers (snake_case out, validated by the contract of 9.6)
// ---------------------------------------------------------------------------------------------------------------

export function toDraftDocument(row: DraftRow): DraftDocument {
  return DraftDocument.parse({
    id: row.id,
    cluster_id: row.clusterId,
    equipment_tag: row.equipmentTag,
    state: row.state,
    lease_expires_at: isoOrNull(row.leaseExpiresAt),
    corpus_version_id: row.corpusVersionId,
    opl_id_reserved: row.oplIdReserved,
    title: row.title,
    classification: row.classification,
    aspect: row.aspect,
    created_by_alias: row.createdByAlias,
    model_id: row.modelId,
    prompt_version: row.promptVersion,
    previous_draft_id: row.previousDraftId,
    session_scope: row.sessionScope,
  });
}

export function toDraftField(row: FieldRow): DraftField {
  return DraftField.parse({
    id: row.id,
    draft_id: row.draftId,
    section: row.section,
    ordinal: row.ordinal,
    text: row.text,
    provenance: row.provenance,
    numeric_provenance: row.numericProvenance,
    quarantined: row.quarantined,
    is_slot: row.isSlot,
  });
}

export function toRedlineVerdict(row: VerdictRow): RedlineVerdict {
  return RedlineVerdict.parse({
    draft_id: row.draftId,
    round: row.round,
    verdict: row.verdict,
    reasons: row.reasons,
    model_id: row.modelId,
    prompt_version: row.promptVersion,
    created_at: iso(row.createdAt),
  });
}

export function toDraftTransition(row: TransitionRow): DraftTransition {
  return DraftTransition.parse({
    id: row.id,
    draft_id: row.draftId,
    from_state: row.fromState,
    to_state: row.toState,
    actor_alias: row.actorAlias,
    actor_role: row.actorRole,
    reason: row.reason,
    edit_diff: row.editDiff,
    server_ts: iso(row.serverTs),
  });
}

export function toSmeNote(row: NoteRow): SmeNote {
  return SmeNote.parse({
    id: row.id,
    draft_id: row.draftId,
    field_id: row.fieldId,
    author_alias: row.authorAlias,
    author_role: row.authorRole,
    captured_at: iso(row.capturedAt),
    text: row.text,
    source_reference: row.sourceReference,
    provenance: row.provenance,
    citeable: row.citeable,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------------------

/** The draft, or null. `scope` is the sandbox predicate of src/loop/scope.ts where the caller is a surface (D-16). */
export async function readDraft(id: string, scope?: SQL | undefined): Promise<DraftRow | null> {
  const [row] = await db
    .select()
    .from(draftDocument)
    .where(scope === undefined ? eq(draftDocument.id, id) : and(eq(draftDocument.id, id), scope))
    .limit(1);
  return row ?? null;
}

/**
 * The draft re-read FOR UPDATE inside an open transaction: the first statement of every state write
 * (ARCHITECTURE 8.4) and of G3 after the advisory lock (8.6 step 2). Two writers on one draft serialise here.
 */
export async function lockDraft(tx: Tx, id: string): Promise<DraftRow | null> {
  const [row] = await tx.select().from(draftDocument).where(eq(draftDocument.id, id)).limit(1).for("update");
  return row ?? null;
}

/** The draft's elements in template order (section, then ordinal). */
export async function readFields(draftId: string): Promise<FieldRow[]> {
  return db
    .select()
    .from(draftField)
    .where(eq(draftField.draftId, draftId))
    .orderBy(asc(draftField.section), asc(draftField.ordinal));
}

/**
 * The draft's section 5 rows in table order (9.6: an Opl carries TroubleshootingRow of 9.5; AC-LOOP-04). The read
 * and the write both live in src/loop/rows.ts, where the drafting lane calls the writer; the read is re-exported
 * here under the naming of its neighbours, so a surface that reads a draft reads its whole body through one module.
 */
export { troubleshootingRows as readTroubleshootingRows, type TroubleshootingRowRow } from "@/loop/rows";

/** The redline rounds of the draft, round 1 first (9.6 RedlineVerdict). */
export async function readVerdicts(draftId: string): Promise<VerdictRow[]> {
  return db.select().from(redlineVerdict).where(eq(redlineVerdict.draftId, draftId)).orderBy(asc(redlineVerdict.round));
}

/** The draft's history, oldest first. */
export async function readTransitions(draftId: string): Promise<TransitionRow[]> {
  return db
    .select()
    .from(draftTransition)
    .where(eq(draftTransition.draftId, draftId))
    .orderBy(asc(draftTransition.serverTs), asc(draftTransition.id));
}

/** The SME notes captured against the draft, oldest first. */
export async function readNotes(draftId: string): Promise<NoteRow[]> {
  return db.select().from(smeNote).where(eq(smeNote.draftId, draftId)).orderBy(asc(smeNote.capturedAt));
}

/** One element of one draft: the check POST /api/sme-notes makes before it writes a note (9.6, AC-LOOP-11). */
export async function readField(draftId: string, fieldId: string): Promise<FieldRow | null> {
  const [row] = await db
    .select()
    .from(draftField)
    .where(and(eq(draftField.draftId, draftId), eq(draftField.id, fieldId)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// The one write outside src/loop/state.ts
// ---------------------------------------------------------------------------------------------------------------

/** G3 step 5: the notes of a published lesson become citeable (9.6 `citeable`: false until publication). */
export async function flipNotesCiteable(tx: Tx, draftId: string, noteIds: readonly string[]): Promise<void> {
  if (noteIds.length === 0) return;
  await tx
    .update(smeNote)
    .set({ citeable: true })
    .where(and(eq(smeNote.draftId, draftId), inArray(smeNote.id, [...noteIds])));
}
