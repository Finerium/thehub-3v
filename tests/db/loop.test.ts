// The loop against a real database (AC-LOOP-08 direct-write leg, AC-LOOP-09 publish_parallel_10; blueprint 9.6,
// ARCHITECTURE 3.2 and 8.6). Two things only a database can prove: the CHECK constraint on
// draft.draft_transition refuses an illegal pair written straight past src/loop/state.ts, and ten concurrent
// publishes of one accepted draft serialise on the advisory lock into exactly one revision, one child version and
// nine 409s. Runs only when TEST_DATABASE_URL names the disposable database of this lane (tests/db/setup.ts);
// skipped otherwise, so gate:quick stays hermetic. Every row it writes is a row the product writes anyway, labelled
// as this test's and scoped to drafts it created; nothing is deleted and no active corpus version is touched (the
// child version G3 creates is is_active false by construction).
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { beforeAll, describe, expect, it } from "vitest";
import {
  corpusVersion,
  debtCluster,
  documentRevision,
  draftDocument,
  draftField,
  draftTransition,
  opl,
} from "../../src/db/schema";
import { publish } from "../../src/gates/g3";
import { HttpError } from "../../src/lib/errors";

const CHECK_VIOLATION = "23514"; // the SQLSTATE a CHECK constraint answers with
const TIMEOUT_MS = 120_000; // a Neon wake, ten transactions on the lock and one coverage recount
const MANAGER = { alias: "MANAGER", role: "Manager" } as const;

const url = process.env.TEST_DATABASE_URL;

function sqlStateOf(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown } | undefined)?.cause ?? error;
  return (cause as { code?: unknown } | undefined)?.code as string | undefined;
}

describe.skipIf(!url)("the loop against a real database", () => {
  let db: NeonHttpDatabase;
  let publishable = "";
  let constrained = "";
  let published: Awaited<ReturnType<typeof publish>> | null = null;

  // One synthetic draft: the six sections carry this file's own sentences, no numeral and no slot, so the draft is
  // publishable without an SME note and nothing here reproduces corpus text.
  async function seedDraft(state: "accepted" | "proposed"): Promise<string> {
    const [cluster] = await db
      .select({ id: debtCluster.id, tag: debtCluster.equipmentTag })
      .from(debtCluster)
      .limit(1);
    const [active] = await db
      .select({ id: corpusVersion.id })
      .from(corpusVersion)
      .where(eq(corpusVersion.isActive, true))
      .limit(1);
    expect(cluster, "a seeded database has debt clusters").toBeDefined();
    expect(active, "a seeded database has exactly one active corpus version").toBeDefined();

    const id = `ac-loop-09-${randomUUID()}`;
    await db.insert(draftDocument).values({
      id,
      clusterId: cluster!.id,
      equipmentTag: cluster!.tag,
      state,
      leaseExpiresAt: null,
      corpusVersionId: active!.id,
      oplIdReserved: `OPL-${cluster!.tag}-T${randomUUID().slice(0, 8)}`,
      title: "Synthetic lesson written by tests/db/loop.test.ts",
      classification: "Basic Knowledge",
      aspect: "Reliability",
      createdByAlias: "ci:ac-loop-09",
      modelId: "glm-5.3-flash",
      promptVersion: "v1",
      previousDraftId: null,
      sessionScope: null,
    });
    await db.insert(draftField).values(
      [1, 2, 3, 4, 5, 6].map((section) => ({
        id: `${id}-s${section}`,
        draftId: id,
        section,
        ordinal: 1,
        text: `Section ${"one two three four five six".split(" ")[section - 1]} of the synthetic lesson this test writes.`,
        provenance: { type: "opl_section" as const, ref: null, span_id: null },
        numericProvenance: [],
        quarantined: false,
        isSlot: false,
      })),
    );
    return id;
  }

  beforeAll(async () => {
    db = drizzle(neon(url!));
    publishable = await seedDraft("accepted");
    constrained = await seedDraft("proposed");
  }, TIMEOUT_MS);

  describe("the transition CHECK of ARCHITECTURE 3.2 (AC-LOOP-08)", () => {
    async function insertTransition(from: string, to: string, reason: string | null): Promise<unknown> {
      let failure: unknown;
      await db
        .insert(draftTransition)
        .values({
          id: `ac-loop-08-${randomUUID()}`,
          draftId: constrained,
          fromState: from as "proposed",
          toState: to as "published",
          actorAlias: "ci:ac-loop-08",
          actorRole: "system",
          reason,
          editDiff: null,
          serverTs: new Date(),
        })
        .catch((error: unknown) => (failure = error));
      return failure;
    }

    it(
      "refuses (proposed, published) written straight into draft.draft_transition",
      async () => {
        expect(sqlStateOf(await insertTransition("proposed", "published", null))).toBe(CHECK_VIOLATION);
        const rows = await db
          .select({ id: draftTransition.id })
          .from(draftTransition)
          .where(and(eq(draftTransition.draftId, constrained), eq(draftTransition.toState, "published")));
        expect(rows).toHaveLength(0);
      },
      TIMEOUT_MS,
    );

    it.each([
      ["proposed", "accepted"],
      ["drafted", "published"],
      ["in_review", "published"],
      ["published", "proposed"],
      ["rejected", "published"],
    ])("refuses (%s, %s)", async (from, to) => {
      expect(sqlStateOf(await insertTransition(from, to, null))).toBe(CHECK_VIOLATION);
    }, TIMEOUT_MS);

    it(
      "admits the lease escape of ADR-004 only with the reason deadline_exceeded",
      async () => {
        expect(sqlStateOf(await insertTransition("in_review", "blocked", null))).toBe(CHECK_VIOLATION);
        expect(await insertTransition("in_review", "blocked", "deadline_exceeded")).toBeUndefined();
      },
      TIMEOUT_MS,
    );
  });

  describe("publish_parallel_10 (AC-LOOP-09)", () => {
    it(
      "ten concurrent publishes of one accepted draft: one revision, one child version, nine 409s",
      async () => {
        const settled = await Promise.allSettled(
          Array.from({ length: 10 }, () => publish(publishable, MANAGER)),
        );
        const won = settled.filter((s) => s.status === "fulfilled");
        const lost = settled.filter((s) => s.status === "rejected");

        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(9);
        for (const loser of lost) {
          const error = (loser as PromiseRejectedResult).reason as unknown;
          expect(error).toBeInstanceOf(HttpError);
          expect((error as HttpError).status).toBe(409);
        }

        published = (won[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof publish>>>).value;
        expect(published.document_revision_id).toEqual(expect.any(String));
        expect(published.coverage_recount).toBeDefined();

        const [draft] = await db
          .select({ state: draftDocument.state, oplId: draftDocument.oplIdReserved })
          .from(draftDocument)
          .where(eq(draftDocument.id, publishable));
        expect(draft?.state).toBe("published");

        // Exactly one of each artefact, and exactly one accepted -> published transition row.
        const lessons = await db.select({ id: opl.oplId }).from(opl).where(eq(opl.oplId, draft!.oplId));
        expect(lessons).toHaveLength(1);

        const revisions = await db
          .select({ id: documentRevision.id, versionId: documentRevision.corpusVersionId })
          .from(documentRevision)
          .where(eq(documentRevision.id, published.document_revision_id));
        expect(revisions).toHaveLength(1);
        expect(revisions[0]?.versionId).toBe(published.corpus_version.id);

        const versions = await db
          .select({ id: corpusVersion.id, isActive: corpusVersion.isActive, parent: corpusVersion.parentVersionId })
          .from(corpusVersion)
          .where(eq(corpusVersion.id, published.corpus_version.id));
        expect(versions).toHaveLength(1);
        expect(versions[0]?.isActive, "a sandbox publication never activates its version (D-16)").toBe(false);
        expect(versions[0]?.parent).not.toBeNull();

        const transitions = await db
          .select({ id: draftTransition.id })
          .from(draftTransition)
          .where(and(eq(draftTransition.draftId, publishable), eq(draftTransition.toState, "published")));
        expect(transitions).toHaveLength(1);
      },
      TIMEOUT_MS,
    );

    it(
      "the retried request reads published and gets 409, publishing nothing a second time",
      async () => {
        const error = await publish(publishable, MANAGER).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).status).toBe(409);

        const revisions = await db
          .select({ id: documentRevision.id })
          .from(documentRevision)
          .where(eq(documentRevision.corpusVersionId, published!.corpus_version.id));
        expect(revisions).toHaveLength(1);
      },
      TIMEOUT_MS,
    );
  });
});
