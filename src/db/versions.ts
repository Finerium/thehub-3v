// Corpus versions (blueprint 9.7, ARCHITECTURE 2, 3.4, 8.5; AC-ING-10, AC-LOOP-13): the list, the active one, the
// lineage walk and activation. Activation is one transaction: flip is_active (the partial unique index
// corpus_version_one_active admits exactly one true), stamp activated_at and activated_by_alias, apply the lineage
// rule of ARCHITECTURE 3.4 to document_revision.is_current, write corpus.version_activated. Nothing is ever deleted,
// so a re-activation of the seeded version after a sandbox publication leaves the published lesson in place and
// marks its revision not current.
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { CorpusVersion, type AuditEvent } from "@/contracts/generated/serving";
import { db, withTransaction, type Tx } from "@/db/client";
import { auditLog, corpusVersion, documentRevision } from "@/db/schema";
import { NotFound } from "@/lib/errors";
import { log } from "@/lib/log";

export const ACTIVATE_ROUTE = "/api/admin/corpus/activate";
export const ACTIVATED_ACTION = "corpus.version_activated" as const;

type VersionRow = typeof corpusVersion.$inferSelect;

// The 9.7 shape (snake_case, ISO timestamps), validated by the generated Zod on the way out (ARCHITECTURE 1.4).
export function toCorpusVersion(row: VersionRow): CorpusVersion {
  return CorpusVersion.parse({
    id: row.id,
    label: row.label,
    is_active: row.isActive,
    manifest_sha256: row.manifestSha256,
    corpus_sha256: row.corpusSha256,
    extractor: row.extractor,
    embedding_model: row.embeddingModel,
    embedding_dim: row.embeddingDim,
    model_pins: row.modelPins,
    created_by_alias: row.createdByAlias,
    created_at: new Date(row.createdAt).toISOString(),
    activated_by_alias: row.activatedByAlias,
    activated_at: row.activatedAt === null ? null : new Date(row.activatedAt).toISOString(),
    parent_version_id: row.parentVersionId,
  });
}

// Newest first; paginated like every list route (9.9: default 50, maximum 200, enforced by the route).
export async function listVersions(page = 1, pageSize = 50): Promise<CorpusVersion[]> {
  const rows = await db
    .select()
    .from(corpusVersion)
    .orderBy(desc(corpusVersion.createdAt), corpusVersion.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return rows.map(toCorpusVersion);
}

export async function activeVersion(): Promise<CorpusVersion | null> {
  const [row] = await db.select().from(corpusVersion).where(eq(corpusVersion.isActive, true)).limit(1);
  return row ? toCorpusVersion(row) : null;
}

type ParentLink = { id: string; parentVersionId: string | null };

// `startId` and its ancestors through parent_version_id, nearest first; a dangling parent or a cycle ends the walk.
// The table holds a handful of rows, so one select and this walk replace a recursive CTE.
export function lineageOf(rows: ReadonlyArray<ParentLink>, startId: string | null | undefined): string[] {
  const parentOf = new Map(rows.map((r) => [r.id, r.parentVersionId] as const));
  const ids: string[] = [];
  let id = startId ?? null;
  while (id !== null && parentOf.has(id) && !ids.includes(id)) {
    ids.push(id);
    id = parentOf.get(id) ?? null;
  }
  return ids;
}

export type RevisionLink = { id: string; documentId: string; corpusVersionId: string; revision: string };

// The lineage rule of ARCHITECTURE 3.4: per document, the latest revision whose version is in the lineage. Latest
// means the revision from the nearest version (a child's revision supersedes its parent's), then the higher revision
// label compared numerically aware ("10" above "9", "B" above "A"), then the id; revision_date is free text from
// the sheet and never orders anything.
export function currentRevisionIds(revisions: ReadonlyArray<RevisionLink>, lineage: ReadonlyArray<string>): string[] {
  const rank = new Map(lineage.map((id, i) => [id, i] as const));
  const best = new Map<string, RevisionLink>();
  for (const r of revisions) {
    if (!rank.has(r.corpusVersionId)) continue;
    const held = best.get(r.documentId);
    if (!held || supersedes(r, held, rank)) best.set(r.documentId, r);
  }
  return [...best.values()].map((r) => r.id).sort();
}

// Drawing convention (9.2, the GA drawings and plot plans carry A, B then 0): an alphabetic label is a pre-issue
// revision and a numeric label an issue, so any numeric label supersedes any alphabetic one; numerics compare as
// numbers ("10" above "9"), letters alphabetically ("B" above "A"); revision_date is free text and never orders.
function compareRevisionLabels(a: string, b: string): number {
  const na = /^\d+$/.test(a.trim());
  const nb = /^\d+$/.test(b.trim());
  if (na && nb) return Number(a) - Number(b);
  if (na !== nb) return na ? 1 : -1;
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

function supersedes(a: RevisionLink, b: RevisionLink, rank: ReadonlyMap<string, number>): boolean {
  const byVersion = (rank.get(a.corpusVersionId) ?? Infinity) - (rank.get(b.corpusVersionId) ?? Infinity);
  if (byVersion !== 0) return byVersion < 0;
  const byRevision = compareRevisionLabels(a.revision, b.revision);
  if (byRevision !== 0) return byRevision > 0;
  return a.id > b.id;
}

export type Actor = { alias: string; role: AuditEvent["actor_role"] };
export type ActivateOptions = { auditId?: string; route?: string };

export async function activate(versionId: string, actor: Actor, options: ActivateOptions = {}): Promise<CorpusVersion> {
  return withTransaction((tx) => activateIn(tx, versionId, actor, options));
}

// The transaction body. `auditId` is the request id, so x-request-id names the audit row (9.9).
export async function activateIn(tx: Tx, versionId: string, actor: Actor, options: ActivateOptions = {}): Promise<CorpusVersion> {
  // Every version row locked: the flip and the lineage walk see one consistent set, and two activations serialise.
  const versions = await tx
    .select({ id: corpusVersion.id, parentVersionId: corpusVersion.parentVersionId })
    .from(corpusVersion)
    .for("update");
  if (!versions.some((v) => v.id === versionId)) throw new NotFound("corpus_version", versionId);
  const lineage = lineageOf(versions, versionId);

  // Clear first, then set: the partial unique index admits exactly one active row per statement boundary.
  await tx
    .update(corpusVersion)
    .set({ isActive: false })
    .where(and(eq(corpusVersion.isActive, true), ne(corpusVersion.id, versionId)));
  const [activated] = await tx
    .update(corpusVersion)
    .set({ isActive: true, activatedAt: sql`now()`, activatedByAlias: actor.alias })
    .where(eq(corpusVersion.id, versionId))
    .returning();
  if (!activated) throw new NotFound("corpus_version", versionId);

  // The lineage rule, the same way: clear (one_current_revision is a partial unique index), then set the chosen.
  await tx.update(documentRevision).set({ isCurrent: false }).where(eq(documentRevision.isCurrent, true));
  const revisions = await tx
    .select({
      id: documentRevision.id,
      documentId: documentRevision.documentId,
      corpusVersionId: documentRevision.corpusVersionId,
      revision: documentRevision.revision,
    })
    .from(documentRevision)
    .where(inArray(documentRevision.corpusVersionId, lineage));
  const current = currentRevisionIds(revisions, lineage);
  if (current.length > 0) {
    await tx.update(documentRevision).set({ isCurrent: true }).where(inArray(documentRevision.id, current));
  }

  const auditId = options.auditId ?? crypto.randomUUID();
  const route = options.route ?? ACTIVATE_ROUTE;
  await tx.insert(auditLog).values({
    id: auditId,
    actorAlias: actor.alias,
    actorRole: actor.role,
    action: ACTIVATED_ACTION,
    entity: "corpus_version",
    entityId: versionId,
    payload: { version_id: versionId },
    traceId: null,
    route,
    corpusVersionId: versionId,
  });
  log.info({
    event: "audit",
    audit_id: auditId,
    action: ACTIVATED_ACTION,
    entity: "corpus_version",
    entity_id: versionId,
    actor_alias: actor.alias,
    actor_role: actor.role,
    route,
    trace_id: null,
    corpus_version_id: versionId,
  });
  return toCorpusVersion(activated);
}
