// The reads of surface 8 (blueprint 6.2 surface 8, 9.6, 9.9; ARCHITECTURE 8.2, 8.4, 8.5, 8.6). The queue and the
// detail sheet compose their data here and touch Drizzle nowhere else, so the sandbox predicate of D-16 is applied
// in one place and the surface cannot read past it: `visibleScope(box)` is `session_scope IS NULL OR session_scope =
// this browser's sandbox`, exactly the predicate GET /api/drafts and GET /api/drafts/:id carry.
//
// Almost nothing here is new SQL. The draft, its elements, its section 5 rows, its redline rounds, its transitions
// and its notes are read through src/db/queries/loop.ts, the shared reader of the loop lane, and mapped into the
// spelling of 9.6 by its own mappers; the review queue is `queueInScope` of src/loop/queries.ts, ordered so the work
// waiting on a person sits above the finished work; the evidence panel is `loadCluster` and `loadEvidence` of
// src/loop/evidence.ts, which is the envelope AG-3 was actually given, shed of the approved lessons' bodies exactly
// as the drafter received it. What this module owns is the three joins a surface needs and the lane does not: the
// corpus version the draft is bound to, the document a publication created, and the numbers a queue row shows.
// Nothing here writes.
import { count, eq } from "drizzle-orm";
import type { Sandbox } from "@/auth/sandbox";
import type { DebtCluster } from "@/contracts/generated/coverage";
import type {
  DraftDocument,
  DraftField,
  DraftState,
  DraftTransition,
  RedlineVerdict,
  SmeNote,
} from "@/contracts/generated/drafts";
import type { CorpusVersion } from "@/contracts/generated/serving";
import { db } from "@/db/client";
import {
  readDraft,
  readFields,
  readNotes,
  readTransitions,
  readTroubleshootingRows,
  readVerdicts,
  toDraftDocument,
  toDraftField,
  toDraftTransition,
  toRedlineVerdict,
  toSmeNote,
  type TroubleshootingRowRow,
} from "@/db/queries/loop";
import { corpusVersion, documentTable, opl } from "@/db/schema";
import { toCorpusVersion } from "@/db/versions";
import { evidenceRefs, loadCluster, loadEvidence, type Evidence } from "@/loop/evidence";
import { queueInScope } from "@/loop/queries";
import { visibleScope } from "@/loop/scope";

/* The queue ---------------------------------------------------------------------------------------------------- */

/** 9.6 DraftState in the order the queue puts them: what waits on a person first, what is finished last. */
export const QUEUE_STATES: readonly DraftState[] = [
  "in_review",
  "accepted",
  "blocked",
  "rejected",
  "proposed",
  "drafted",
  "redlined",
  "published",
];

/** What each state means on the board, in the words of 9.6's transition table. */
export const STATE_MEANING: Readonly<Record<DraftState, string>> = {
  proposed: "requested; the drafting invocation holds the lease",
  drafted: "AG-3 has written the body; the redliner has not run",
  redlined: "the redliner has returned a verdict",
  in_review: "waiting on the Reviewing Supervisor",
  accepted: "waiting on the Manager to publish",
  published: "published through G3 into a new corpus version",
  blocked: "blocked by the redliner's second round or by an expired lease",
  rejected: "rejected by a reviewer; re-proposable",
};

export type QueueRow = {
  draft: DraftDocument;
  /** True when the row is this browser's own draft; false for a seeded replay source (`session_scope` null). */
  own: boolean;
  /** True when a non-terminal draft is past its lease: the next poll of its detail blocks it (ADR-004). */
  leaseRanOut: boolean;
};

export type QueueView = {
  rows: QueueRow[];
  counts: Record<DraftState, number>;
  sandboxId: string | null;
  ownCount: number;
  seededCount: number;
};

/** 9.6: `published`, `blocked` and `rejected` are terminal; a lease runs only on the rest. */
const NON_TERMINAL: readonly DraftState[] = ["proposed", "drafted", "redlined", "in_review", "accepted"];

function pastLease(draft: DraftDocument, now: number): boolean {
  if (draft.lease_expires_at === null) return false;
  if (!NON_TERMINAL.includes(draft.state)) return false;
  return Date.parse(draft.lease_expires_at) < now;
}

/** The review queue inside the visitor's sandbox scope (D-16), in the state order of 9.6. */
export async function readQueue(box: Pick<Sandbox, "id"> | null): Promise<QueueView> {
  const rows = (await queueInScope(box)).map(toDraftDocument);
  const now = Date.now();
  const counts = Object.fromEntries(QUEUE_STATES.map((s) => [s, 0])) as Record<DraftState, number>;
  for (const draft of rows) counts[draft.state] += 1;
  const own = rows.filter((d) => d.session_scope !== null).length;
  return {
    rows: rows.map((draft) => ({
      draft,
      own: draft.session_scope !== null,
      leaseRanOut: pastLease(draft, now),
    })),
    counts,
    sandboxId: box?.id ?? null,
    ownCount: own,
    seededCount: rows.length - own,
  };
}

/* The detail sheet --------------------------------------------------------------------------------------------- */

export type DraftView = {
  draft: DraftDocument;
  fields: DraftField[];
  rows: TroubleshootingRowRow[];
  verdicts: RedlineVerdict[];
  transitions: DraftTransition[];
  notes: SmeNote[];
  /** The corpus version the draft was written against (9.6 `corpus_version_id`). */
  version: CorpusVersion | null;
  /** The document a publication created, found by the lesson id the draft reserved; null until published. */
  publishedDocumentId: string | null;
  /** True when the reserved lesson id is already an `opl` row: the publication landed. */
  published: boolean;
  leaseRanOut: boolean;
};

/** The whole detail of one draft, or null when this browser's sandbox cannot see it (D-16). */
export async function readDraftView(id: string, box: Pick<Sandbox, "id"> | null): Promise<DraftView | null> {
  const row = await readDraft(id, visibleScope(box));
  if (!row) return null;
  const draft = toDraftDocument(row);

  const [fields, rows, verdicts, transitions, notes, versions] = await Promise.all([
    readFields(id),
    readTroubleshootingRows(db, id),
    readVerdicts(id),
    readTransitions(id),
    readNotes(id),
    db.select().from(corpusVersion).where(eq(corpusVersion.id, draft.corpus_version_id)).limit(1),
  ]);

  // The lesson id the draft reserved is the published document's doc_no (ARCHITECTURE 8.6 step 3), so one lookup
  // says whether this draft reached the corpus and where its lesson can be read.
  const [document] = await db
    .select({ id: documentTable.id })
    .from(documentTable)
    .where(eq(documentTable.docNo, draft.opl_id_reserved))
    .limit(1);
  const [lesson] = await db
    .select({ n: count() })
    .from(opl)
    .where(eq(opl.oplId, draft.opl_id_reserved))
    .limit(1);

  const version = versions[0];
  return {
    draft,
    fields: fields.map(toDraftField),
    rows,
    verdicts: verdicts.map(toRedlineVerdict),
    transitions: transitions.map(toDraftTransition),
    notes: notes.map(toSmeNote),
    version: version ? toCorpusVersion(version) : null,
    publishedDocumentId: document?.id ?? null,
    published: (lesson?.n ?? 0) > 0,
    leaseRanOut: pastLease(draft, Date.now()),
  };
}

/* The evidence panel the drafter received ---------------------------------------------------------------------- */

/** One evidence kind of the AG-3 envelope (9.16) with the identifiers the redliner was shown. */
export type EvidenceGroup = { kind: string; refs: string[] };

export type DraftEvidence = {
  cluster: DebtCluster;
  /** The cluster's uncovered work orders as the envelope carried them, most recent first. */
  workOrders: Evidence["work_orders"];
  /** The typed sources, grouped by kind, in the contract's own order. */
  groups: EvidenceGroup[];
  /** True when the envelope shed the approved lessons' section bodies under the byte budget of src/loop/evidence.ts. */
  lessonBodiesShed: boolean;
};

/** The cluster and the six evidence kinds AG-3 was given for it, or null when the cluster is gone. */
export async function readDraftEvidence(clusterId: string): Promise<DraftEvidence | null> {
  const cluster = await loadCluster(clusterId);
  if (!cluster) return null;
  const evidence = await loadEvidence(cluster);
  const groups: EvidenceGroup[] = [];
  for (const ref of evidenceRefs(evidence)) {
    const group = groups.find((g) => g.kind === ref.kind);
    if (group) group.refs.push(ref.ref);
    else groups.push({ kind: ref.kind, refs: [ref.ref] });
  }
  return {
    cluster,
    workOrders: evidence.work_orders,
    groups,
    lessonBodiesShed: evidence.lessons.length > 0 && evidence.lessons.every((l) => l.sections.length === 0),
  };
}
