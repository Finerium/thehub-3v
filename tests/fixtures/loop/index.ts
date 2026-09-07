// Synthetic rows for the loop lane (blueprint 9.6; AC-LOOP-08, 09, 11, 12). Nothing here is corpus text: the
// bodies are this file's own sentences, the equipment tag and the reserved lesson id are shapes, not a supplied
// document, and no number binds to a fixture. The row builders return Drizzle select rows (camelCase), so a test
// queues them straight into the fake client; `signedIn()` is the session the route tests share.
import type { Role } from "@/contracts/generated/serving";
import type { corpusVersion, draftDocument, draftField, redlineVerdict, smeNote } from "@/db/schema";
import { SESSION_COOKIE, signSessionId } from "@/auth/cookie";
import { SLOT_TEXT } from "@/lib/fixed-strings";
import { sha256Hex } from "@/lib/hash";
import { queueResult } from "../../helpers/fake-db-client";
import { setRequest } from "../../helpers/next-headers";

export type DraftRow = typeof draftDocument.$inferSelect;
export type FieldRow = typeof draftField.$inferSelect;
export type VerdictRow = typeof redlineVerdict.$inferSelect;
export type NoteRow = typeof smeNote.$inferSelect;
export type VersionRow = typeof corpusVersion.$inferSelect;

export const DRAFT_ID = "draft-loop-1";
export const CLUSTER_ID = "cluster-loop-1";
export const EQUIPMENT_TAG = "GA-9901A"; // the invented asset of tests/fixtures/drafting, never a corpus tag
export const OPL_ID_RESERVED = "OPL-GA-9901A-99";
export const BASE_VERSION_ID = "cv-loop-base";
export const CHILD_VERSION_ID = "cv-loop-child";
export const MODEL_ID = "glm-5.3-flash";
export const PROMPT_VERSION = "v1";

/** The one slot's text is the fixed literal of 9.6, read from fixed-strings so it is never retyped; every other
 * body is this file's own sentence. */
export const SLOT_LITERAL = SLOT_TEXT;

export function draftRow(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: DRAFT_ID,
    clusterId: CLUSTER_ID,
    equipmentTag: EQUIPMENT_TAG,
    state: "accepted",
    leaseExpiresAt: null,
    corpusVersionId: BASE_VERSION_ID,
    oplIdReserved: OPL_ID_RESERVED,
    title: "Synthetic lesson for the loop tests",
    classification: "Basic Knowledge",
    aspect: "Reliability",
    createdByAlias: "SUPERVISOR",
    modelId: MODEL_ID,
    promptVersion: PROMPT_VERSION,
    previousDraftId: null,
    sessionScope: null,
    ...overrides,
  };
}

export function fieldRow(overrides: Partial<FieldRow> = {}): FieldRow {
  return {
    id: "field-loop-1",
    draftId: DRAFT_ID,
    section: 1,
    ordinal: 1,
    text: "Synthetic element text written by this fixture, not by the corpus.",
    provenance: { type: "opl_step", ref: "step-1", span_id: "span-1" },
    numericProvenance: [],
    quarantined: false,
    isSlot: false,
    ...overrides,
  };
}

/** A slot: `is_slot` true and the text exactly the 9.6 literal, which the draft_field CHECK requires. */
export function slotFieldRow(overrides: Partial<FieldRow> = {}): FieldRow {
  return fieldRow({
    id: "field-loop-slot",
    section: 4,
    ordinal: 2,
    text: SLOT_LITERAL,
    provenance: { type: "slot", ref: null, span_id: null },
    isSlot: true,
    ...overrides,
  });
}

export function verdictRow(overrides: Partial<VerdictRow> = {}): VerdictRow {
  return {
    draftId: DRAFT_ID,
    round: 1,
    verdict: "pass",
    reasons: [],
    modelId: MODEL_ID,
    promptVersion: PROMPT_VERSION,
    createdAt: new Date("2026-09-07T09:00:00.000Z"),
    ...overrides,
  };
}

export function noteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: "note-loop-1",
    draftId: DRAFT_ID,
    fieldId: "field-loop-slot",
    authorAlias: "ENGINEER",
    authorRole: "Engineer",
    capturedAt: new Date("2026-09-07T09:30:00.000Z"),
    text: "Synthetic engineer judgement recorded by this fixture.",
    sourceReference: null,
    provenance: "human, dated, unreviewed",
    citeable: false,
    ...overrides,
  };
}

const PIN = { provider: "zai", model_id: MODEL_ID, prompt_version: PROMPT_VERSION };

export function versionRow(overrides: Partial<VersionRow> = {}): VersionRow {
  return {
    id: CHILD_VERSION_ID,
    label: "v2",
    isActive: false,
    manifestSha256: "a".repeat(64),
    corpusSha256: "b".repeat(64),
    extractor: "pdftotext -raw (pdftotext version 26.02.0)",
    embeddingModel: "pending-local-onnx",
    embeddingDim: 384,
    modelPins: {
      "AG-1": PIN,
      "AG-2": PIN,
      "AG-3": PIN,
      "AG-4": PIN,
      embedding: { provider: "local_embedding", model_id: "pending-local-onnx", prompt_version: null },
    },
    createdByAlias: "MANAGER",
    createdAt: new Date("2026-09-07T10:00:00.000Z"),
    activatedByAlias: null,
    activatedAt: null,
    parentVersionId: BASE_VERSION_ID,
    ...overrides,
  };
}

/**
 * The recount shape G3 answers with (ARCHITECTURE 8.6 step 6): the count before, the count after, the population it
 * was taken over, and the two method digests AC-LOOP-12 requires to equal the baseline's. Every value here is this
 * file's own synthetic one, deliberately not the seeded corpus's figures, so a fixture literal can never be mistaken
 * for a fixture-bound number on a surface; the real recount of the seeded corpus (14 of 57 falling to 13) is
 * recomputed by src/coverage over the child version and proved in tests/db/loop.test.ts.
 */
export const COVERAGE_RECOUNT = {
  uncovered_before: 9,
  uncovered_after: 8,
  population_count: 40,
  recipe_sha256: sha256Hex("loop fixture recipe"),
  stop_list_sha256: sha256Hex("loop fixture stop list"),
};

/**
 * A signed-in session for a route test: the request scope (session cookie and x-request-id) plus the one row
 * `getSession()` reads. Call it first, then queue what the route itself reads.
 */
export function signedIn(role: Role, requestId: string, alias = role.toUpperCase().replace(/\s+/g, "_")): void {
  setRequest({ cookies: { [SESSION_COOKIE]: signSessionId("sess-loop") }, headers: { "x-request-id": requestId } });
  queueResult([
    {
      id: `u-${role}`,
      username: "demo",
      alias,
      role,
      sessionId: "sess-loop",
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  ]);
}
