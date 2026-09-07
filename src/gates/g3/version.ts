// G3 step 4 (ARCHITECTURE 8.6, blueprint 9.7; AC-LOOP-12, D-16): the child corpus version a publication creates.
// It is never activated: the visitor sees it because `visibleVersionIds()` adds the sandbox's own version to the
// active lineage, and the nightly activation re-asserts the seeded version without deleting anything. The parent is
// the version the draft was drafted against, so the lineage rule of ARCHITECTURE 3.4 keeps every earlier revision
// readable and merely not current.
//
// Everything a version states about how it was built is copied from the parent, unchanged: the manifest and corpus
// digests, the extractor pin, the embedding pin and dimension, and the model pins. A publication adds a lesson; it
// does not change the corpus the version was cut from, and it must not be able to claim otherwise. The label is the
// next `v<n>` and the id carries it beside a digest of the parent and the lesson, so the same lesson published from
// the same parent names the same version rather than a second one.
import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { corpusVersion } from "@/db/schema";
import { NotFound } from "@/lib/errors";
import { sha256Hex } from "@/lib/hash";

export type VersionRow = typeof corpusVersion.$inferSelect;

const LABEL = /^v(\d+)$/;

/** The next `v<n>` above every label the table holds; a label of another shape is ignored, never renamed. */
export function nextLabel(labels: readonly string[]): string {
  const highest = labels.reduce((best, label) => {
    const match = LABEL.exec(label);
    return match ? Math.max(best, Number(match[1])) : best;
  }, 0);
  return `v${highest + 1}`;
}

export async function createChildVersion(
  tx: Tx,
  parentVersionId: string,
  actor: { alias: string },
  oplId: string,
): Promise<VersionRow> {
  const [parent] = await tx.select().from(corpusVersion).where(eq(corpusVersion.id, parentVersionId)).limit(1);
  if (!parent) throw new NotFound("corpus_version", parentVersionId);

  const labels = await tx.select({ label: corpusVersion.label }).from(corpusVersion);
  const label = nextLabel(labels.map((l) => l.label));
  const id = `cv-${label}-${sha256Hex(`${parentVersionId}/${oplId}`).slice(0, 12)}`;

  const [row] = await tx
    .insert(corpusVersion)
    .values({
      id,
      label,
      isActive: false, // a publication never activates: only the Admin's audited activation does (INV-3, D-16)
      manifestSha256: parent.manifestSha256,
      corpusSha256: parent.corpusSha256,
      extractor: parent.extractor,
      embeddingModel: parent.embeddingModel,
      embeddingDim: parent.embeddingDim,
      modelPins: parent.modelPins,
      createdByAlias: actor.alias,
      createdAt: new Date(),
      activatedByAlias: null,
      activatedAt: null,
      parentVersionId,
    })
    .returning();
  if (!row) throw new Error(`corpus_version ${id} was not written`);
  return row;
}
