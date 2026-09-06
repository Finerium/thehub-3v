// The seed and the schema against a real database (ARCHITECTURE 2, 3 and 3.4; AC-ING-10, AC-ING-15, AC-NFR-13,
// AC-CTX-09): the synthetic bundle of tests/fixtures/bundle/synthetic.ts admitted by G1 and seeded twice through
// src/db/seed with the real client (the `db` project of vitest.config.ts); the constraints the database itself
// refuses; activate_v1_after_publish; and the page route serving one seeded render. Runs only when TEST_DATABASE_URL
// names a disposable database (localhost, 127.0.0.1 or db.localtest.me: the service container of ci.yml or the
// docker pair started locally, tests/db/setup.ts) and skips itself otherwise; a Neon URL is refused here, so the
// synthetic rows can never reach the production database. Nothing here deletes a row: every refused write rolls
// back inside its own transaction, and the version active before the file ran is re-activated at the end.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, signSessionId } from "@/auth/cookie";
import type { Tx } from "@/db/client";
import { appUser, auditLog, chunk, corpusVersion, documentRevision, draftDocument, draftField, pageDerivative, session, span } from "@/db/schema";
import { formatViolations, type Bundle } from "@/gates/g1";
import { seededVersionFromBundle } from "@/lib/version-id";
import { SYN, writeSyntheticBundle } from "../fixtures/bundle/synthetic";
import { setRequest } from "../helpers/next-headers";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "db.localtest.me"]);
const url = process.env.TEST_DATABASE_URL;

function disposable(candidate: string | undefined): boolean {
  if (!candidate) return false;
  try {
    return DISPOSABLE_HOSTS.has(new URL(candidate).hostname);
  } catch {
    return false;
  }
}

const runnable = disposable(url);
if (url && !runnable) console.warn("tests/db/seed skipped: TEST_DATABASE_URL must name a disposable database (localhost, 127.0.0.1 or db.localtest.me); it does not");

// Drizzle wraps a failed query with the driver's error as `cause`; the SQLSTATE lives on the driver's error.
function sqlStateOf(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown } | undefined)?.cause ?? error;
  return (cause as { code?: unknown } | undefined)?.code as string | undefined;
}

class Rollback extends Error {}

const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const DATA_EXCEPTION = "22000"; // pgvector: expected 384 dimensions

describe.skipIf(!runnable)("the seed of the synthetic bundle against a disposable database", () => {
  let client: typeof import("@/db/client");
  let seed: typeof import("@/db/seed");
  let versions: typeof import("@/db/versions");
  let g1: typeof import("@/gates/g1");
  let documents: typeof import("@/db/queries/documents");
  let pageRoute: typeof import("@/app/api/documents/[id]/pages/[n]/route");
  let dir: string;
  let bundle: Bundle;
  let versionId: string;
  let activeBefore: string | null = null;
  const actor = { alias: "ci:tests-db-seed", role: "system" as const };
  const route = "tests/db/seed.test.ts";

  beforeAll(async () => {
    [client, seed, versions, g1, documents, pageRoute] = await Promise.all([
      import("@/db/client"),
      import("@/db/seed"),
      import("@/db/versions"),
      import("@/gates/g1"),
      import("@/db/queries/documents"),
      import("@/app/api/documents/[id]/pages/[n]/route"),
    ]);
    dir = mkdtempSync(path.join(os.tmpdir(), "thehub-seed-"));
    writeSyntheticBundle(dir);
    const admission = await g1.admit(dir);
    if (!admission.ok) throw new Error(`G1 refused the synthetic bundle:\n${formatViolations(admission.violations)}`);
    bundle = admission.bundle;
    versionId = seededVersionFromBundle(dir).id;
    activeBefore = (await versions.activeVersion())?.id ?? null;
  });

  afterAll(async () => {
    if (activeBefore && activeBefore !== versionId) await versions.activate(activeBefore, actor, { route });
    rmSync(dir, { recursive: true, force: true });
  });

  // Runs one write inside its own transaction, returns the SQLSTATE the database refused it with, and rolls back.
  async function refused(write: (tx: Tx) => Promise<unknown>): Promise<string | undefined> {
    let code: string | undefined;
    await client
      .withTransaction(async (tx) => {
        try {
          await write(tx);
        } catch (error) {
          code = sqlStateOf(error);
        }
        throw new Rollback("rolled back on purpose");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    return code;
  }

  it("seeds twice: the same rows, equal counts, is_active unchanged by the second run, no divergence (AC-ING-10, AC-ING-15)", async () => {
    const first = await seed.seedBundle(bundle);
    const countsAfterFirst = await seed.seededTableCounts();
    const versionsAfterFirst = await versions.listVersions(1, 200);

    const second = await seed.seedBundle(bundle);
    const countsAfterSecond = await seed.seededTableCounts();
    const versionsAfterSecond = await versions.listVersions(1, 200);

    expect(first.versionId).toBe(versionId);
    expect(second.versionId).toBe(versionId);
    expect(first.label).toBe("v1");
    expect(second.written).toEqual(first.written);
    expect(first.written).toMatchObject({ document: SYN.files, work_order: SYN.workOrders, opl: SYN.lessons, chunk: 2, page_derivative: 1 });
    expect(countsAfterSecond).toEqual(countsAfterFirst);
    expect(first.revisionDivergence).toEqual([]);
    expect(second.revisionDivergence).toEqual([]);

    const activity = (list: Array<{ id: string; is_active: boolean }>) => list.map((v) => [v.id, v.is_active]).sort();
    expect(activity(versionsAfterSecond)).toEqual(activity(versionsAfterFirst));
    expect(versionsAfterSecond.filter((v) => v.is_active).map((v) => v.id)).toEqual([versionId]);

    const seeded = await versions.activeVersion();
    expect(seeded).toMatchObject({ id: versionId, manifest_sha256: bundle.manifestSha256, corpus_sha256: SYN.corpusSha256, extractor: SYN.extractor, embedding_dim: 384 });
    expect(seeded?.model_pins["AG-4"]).toEqual({ provider: "zai", model_id: "glm-5.3-flash", prompt_version: null });
    expect(seeded?.activated_by_alias).toBe("seed");

    const [chunks] = await client.db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(chunk).where(like(chunk.id, "chunk-syn-%"));
    expect(chunks?.n).toBe(2);
    const [render] = await client.db
      .select({ format: pageDerivative.format, width: pageDerivative.width, length: sql<number>`length(${pageDerivative.bytes})`.mapWith(Number) })
      .from(pageDerivative)
      .where(and(eq(pageDerivative.documentId, SYN.pageDocumentId), eq(pageDerivative.page, 1)));
    expect(render).toEqual({ format: "webp", width: 1200, length: readFileSync(path.join(dir, "pages", SYN.pageDocumentId, "1.webp")).length });
  });

  it("AC-NFR-13: the database refuses a 3-dimensional vector, a span on no revision, a second active version, a second current revision and a slot with the wrong text", async () => {
    const shortVector = await refused((tx) =>
      tx.insert(chunk).values({
        id: `chunk-test-${randomUUID()}`,
        documentRevisionId: SYN.revId("opl", 1),
        page: 1,
        ordinal: 9,
        unitKind: "note",
        text: "three numbers are not a vector of the pinned dimension",
        quoteHash: "0".repeat(64),
        embedding: [0.1, 0.2, 0.3],
      }),
    );
    expect(shortVector, "chunk.embedding is vector(384)").toBe(DATA_EXCEPTION);

    const orphanSpan = await refused((tx) =>
      tx.insert(span).values({
        id: `span-test-${randomUUID()}`,
        documentRevisionId: "rev-test-does-not-exist",
        page: 1,
        anchorText: "a span must sit on a revision",
        quoteHash: "0".repeat(64),
        startOrdinal: 0,
        endOrdinal: 1,
      }),
    );
    expect(orphanSpan, "span.document_revision_id is a foreign key").toBe(FOREIGN_KEY_VIOLATION);

    const secondActive = await refused((tx) =>
      tx.insert(corpusVersion).values({
        id: `cv-test-${randomUUID()}`,
        label: "second-active",
        isActive: true,
        manifestSha256: "1".repeat(64),
        corpusSha256: "2".repeat(64),
        extractor: SYN.extractor,
        embeddingModel: "test",
        embeddingDim: 384,
        modelPins: bundleVersionPins(),
        createdByAlias: actor.alias,
        createdAt: new Date(),
        activatedByAlias: null,
        activatedAt: null,
        parentVersionId: null,
      }),
    );
    expect(secondActive, "corpus_version_one_active").toBe(UNIQUE_VIOLATION);

    const secondCurrent = await refused((tx) =>
      tx.insert(documentRevision).values({
        id: `rev-test-${randomUUID()}`,
        documentId: SYN.datasheetDocumentId,
        revision: "Z",
        approvalStatus: "issued_for_review",
        approvalStatusText: "Issued for Review",
        revisionDate: null,
        preparedByAlias: null,
        reviewedByAlias: null,
        approvedByAlias: null,
        dateOfSharing: null,
        isCurrent: true,
        corpusVersionId: versionId,
      }),
    );
    expect(secondCurrent, "one_current_revision").toBe(UNIQUE_VIOLATION);

    const wrongSlot = await refused(async (tx) => {
      const draftId = `draft-test-${randomUUID()}`;
      await tx.insert(draftDocument).values({
        id: draftId,
        clusterId: `debt-syn-${SYN.equipmentTag}`,
        equipmentTag: SYN.equipmentTag,
        state: "drafted",
        leaseExpiresAt: null,
        corpusVersionId: versionId,
        oplIdReserved: `OPL-TEST-${randomUUID()}`,
        title: "test draft",
        classification: "Basic Knowledge",
        aspect: "Reliability",
        createdByAlias: actor.alias,
        modelId: "glm-5.3-flash",
        promptVersion: "test",
        previousDraftId: null,
        sessionScope: null,
      });
      await tx.insert(draftField).values({
        id: `field-test-${randomUUID()}`,
        draftId,
        section: 1,
        ordinal: 1,
        text: "a slot with any other text",
        provenance: { type: "slot", ref: null, span_id: null },
        numericProvenance: [],
        quarantined: false,
        isSlot: true,
      });
    });
    expect(wrongSlot, "draft_field_slot_or_provenance").toBe(CHECK_VIOLATION);
  });

  it("activate_v1_after_publish (AC-ING-10): a child version created after v1, then v1 re-activated, leaves every row and makes v1's revisions current", async () => {
    const child = `cv-test-child-${randomUUID().slice(0, 8)}`;
    const childRevision = `rev-test-${child}`;
    const [{ n: revisionsBefore }] = await client.db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(documentRevision);

    // The sandbox publication of G3, reduced to its rows: a child version and a re-issued revision of one document.
    await client.db.insert(corpusVersion).values({
      id: child,
      label: "sandbox-test",
      isActive: false,
      manifestSha256: bundle.manifestSha256,
      corpusSha256: SYN.corpusSha256,
      extractor: SYN.extractor,
      embeddingModel: "test",
      embeddingDim: 384,
      modelPins: bundleVersionPins(),
      createdByAlias: actor.alias,
      createdAt: new Date(),
      activatedByAlias: null,
      activatedAt: null,
      parentVersionId: versionId,
    });
    await client.db.insert(documentRevision).values({
      id: childRevision,
      documentId: SYN.datasheetDocumentId,
      revision: "C",
      approvalStatus: "approved",
      approvalStatusText: "Approved",
      revisionDate: null,
      preparedByAlias: actor.alias,
      reviewedByAlias: null,
      approvedByAlias: null,
      dateOfSharing: null,
      isCurrent: false,
      corpusVersionId: child,
    });

    const activatedChild = await versions.activate(child, actor, { route, auditId: `req-${child}-child` });
    expect(activatedChild).toMatchObject({ id: child, is_active: true, parent_version_id: versionId });
    const underChild = await documents.getDocument(SYN.datasheetDocumentId, true);
    expect(underChild?.revisions.filter((r) => r.is_current).map((r) => r.id)).toEqual([childRevision]);

    const reasserted = await versions.activate(versionId, actor, { route, auditId: `req-${child}-v1` });
    expect(reasserted).toMatchObject({ id: versionId, is_active: true });
    const active = await versions.listVersions(1, 200);
    expect(active.filter((v) => v.is_active).map((v) => v.id)).toEqual([versionId]);
    expect(active.find((v) => v.id === child)?.is_active).toBe(false);

    // Earlier runs of this file on the same disposable database left their own child revisions behind (nothing is
    // ever deleted), so the assertion is on the rows this run knows and on the one current revision.
    const underV1 = await documents.getDocument(SYN.datasheetDocumentId, true);
    const state = new Map(underV1?.revisions.map((r) => [r.id, r.is_current] as const));
    expect(state.get(SYN.revId("datasheet", 1))).toBe(true);
    expect(state.get(childRevision)).toBe(false);
    expect(state.get(SYN.superseded.id)).toBe(false);
    expect([...state.values()].filter(Boolean)).toHaveLength(1);
    expect((await documents.getDocument(SYN.datasheetDocumentId, false))?.revisions.map((r) => r.revision)).toEqual(["B"]);

    const [{ n: revisionsAfter }] = await client.db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(documentRevision);
    expect(revisionsAfter).toBe(revisionsBefore + 1);
    // Under the audit ids of this run: earlier runs of this file left their own corpus.version_activated rows behind.
    const audited = await client.db
      .select({ id: auditLog.id, entityId: auditLog.entityId, actorAlias: auditLog.actorAlias, route: auditLog.route })
      .from(auditLog)
      .where(and(eq(auditLog.action, "corpus.version_activated"), inArray(auditLog.id, [`req-${child}-child`, `req-${child}-v1`])));
    expect(audited.map((a) => [a.id, a.entityId, a.actorAlias, a.route]).sort()).toEqual([
      [`req-${child}-child`, child, actor.alias, route],
      [`req-${child}-v1`, versionId, actor.alias, route],
    ]);
  });

  it("GET /api/documents/:id/pages/:n serves the seeded render as image/webp, private and uncached, and the designed 404 for an absent page", async () => {
    const userId = `u-test-${randomUUID().slice(0, 8)}`;
    const sessionId = `sess-test-${randomUUID()}`;
    await client.db.insert(appUser).values({ id: userId, alias: "TEST-ENGINEER", role: "Engineer", username: userId, passwordHash: "no-login", isDemo: false, lastLogin: null });
    await client.db.insert(session).values({ id: sessionId, userId, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000), reviewerLinkId: null });
    setRequest({ cookies: { [SESSION_COOKIE]: signSessionId(sessionId) }, headers: { "x-request-id": "req-page-test" } });

    const request = (n: string) => new NextRequest(`http://localhost/api/documents/${SYN.pageDocumentId}/pages/${n}`, { headers: { "x-request-id": "req-page-test" } });
    const context = (n: string) => ({ params: Promise.resolve({ id: SYN.pageDocumentId, n }) });

    const served = await pageRoute.GET(request("1"), context("1"));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");
    expect(served.headers.get("cache-control")).toBe("private, no-store");
    const bytes = Buffer.from(await served.arrayBuffer());
    expect(bytes.equals(readFileSync(path.join(dir, "pages", SYN.pageDocumentId, "1.webp")))).toBe(true);
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");

    const absent = await pageRoute.GET(request("2"), context("2"));
    expect(absent.status).toBe(404);
    expect(await absent.json()).toEqual({ error: "not_found", request_id: "req-page-test", entity: "page_derivative", id: `${SYN.pageDocumentId}/2` });
  });

  function bundleVersionPins() {
    const pin = { provider: "zai", model_id: "glm-5.3-flash", prompt_version: null };
    return { "AG-1": pin, "AG-2": pin, "AG-3": pin, "AG-4": pin, embedding: { provider: "local_embedding", model_id: "test", prompt_version: null } };
  }
});
