// Corpus versions (blueprint 9.7, ARCHITECTURE 2, 3.4; AC-ING-10, AC-LOOP-13): the lineage walk, the lineage rule
// of ARCHITECTURE 3.4 (per document, the latest revision whose version is in the lineage), and activation as one
// transaction that clears every other is_active before setting exactly one, re-marks document_revision.is_current
// from the lineage, writes corpus.version_activated under the request id and deletes nothing. The transaction is
// the fake client's recording chain.
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import { argOf, queueResult, resetFakeDb, statements, withTransaction } from "../../tests/helpers/fake-db-client";
import { auditLog, corpusVersion, documentRevision } from "./schema";
import { ACTIVATED_ACTION, ACTIVATE_ROUTE, activateIn, currentRevisionIds, lineageOf, toCorpusVersion } from "./versions";

const compile = (fragment: unknown) => new PgDialect().sqlToQuery(fragment as SQL);

// v1 (seeded) <- v2 <- v3; s1 is a sandbox's never-activated child of v1.
const VERSIONS = [
  { id: "cv-v1", parentVersionId: null },
  { id: "cv-v2", parentVersionId: "cv-v1" },
  { id: "cv-v3", parentVersionId: "cv-v2" },
  { id: "cv-s1", parentVersionId: "cv-v1" },
];

const PIN = { provider: "zai", model_id: "glm-5.3-flash", prompt_version: null };
const ROW = {
  id: "cv-v1",
  label: "v0-equipment-master",
  isActive: true,
  manifestSha256: "a".repeat(64),
  corpusSha256: "b".repeat(64),
  extractor: "pdftotext -raw (pdftotext version 26.02.0)",
  embeddingModel: "pending-local-onnx",
  embeddingDim: 384,
  modelPins: { "AG-1": PIN, "AG-2": PIN, "AG-3": PIN, "AG-4": PIN, embedding: { ...PIN, provider: "local_embedding", model_id: "pending-local-onnx" } },
  createdByAlias: "seed",
  createdAt: new Date("2026-09-04T21:00:00.000Z"),
  activatedByAlias: "job:nightly-activation",
  activatedAt: new Date("2026-09-05T17:00:00.000Z"),
  parentVersionId: null,
};

const ADMIN = { alias: "ADMIN", role: "Admin" as const };

beforeEach(() => {
  resetFakeDb();
});

describe("lineageOf", () => {
  it("walks from the start through parent_version_id to the root, nearest first", () => {
    expect(lineageOf(VERSIONS, "cv-v3")).toEqual(["cv-v3", "cv-v2", "cv-v1"]);
    expect(lineageOf(VERSIONS, "cv-s1")).toEqual(["cv-s1", "cv-v1"]);
    expect(lineageOf(VERSIONS, "cv-v1")).toEqual(["cv-v1"]);
  });

  it("is empty for no start or an unknown start, and stops at a dangling parent or a cycle", () => {
    expect(lineageOf(VERSIONS, null)).toEqual([]);
    expect(lineageOf(VERSIONS, undefined)).toEqual([]);
    expect(lineageOf(VERSIONS, "cv-nope")).toEqual([]);
    expect(lineageOf([{ id: "a", parentVersionId: "gone" }], "a")).toEqual(["a"]);
    expect(lineageOf([{ id: "a", parentVersionId: "b" }, { id: "b", parentVersionId: "a" }], "a")).toEqual(["a", "b"]);
  });
});

describe("currentRevisionIds (the lineage rule of ARCHITECTURE 3.4)", () => {
  const lineage = ["cv-v3", "cv-v2", "cv-v1"];

  it("keeps, per document, the revision from the nearest version in the lineage", () => {
    const revisions = [
      { id: "r-d1-v1", documentId: "d1", corpusVersionId: "cv-v1", revision: "A" },
      { id: "r-d1-v3", documentId: "d1", corpusVersionId: "cv-v3", revision: "A" },
      { id: "r-d2-v1", documentId: "d2", corpusVersionId: "cv-v1", revision: "0" },
      { id: "r-d2-v2", documentId: "d2", corpusVersionId: "cv-v2", revision: "1" },
    ];
    expect(currentRevisionIds(revisions, lineage)).toEqual(["r-d1-v3", "r-d2-v2"]);
  });

  it("ignores every revision outside the lineage (another sandbox's publication)", () => {
    const revisions = [
      { id: "r-d1-v1", documentId: "d1", corpusVersionId: "cv-v1", revision: "A" },
      { id: "r-d1-s1", documentId: "d1", corpusVersionId: "cv-s1", revision: "B" },
      { id: "r-d9-s1", documentId: "d9", corpusVersionId: "cv-s1", revision: "A" },
    ];
    expect(currentRevisionIds(revisions, lineage)).toEqual(["r-d1-v1"]);
  });

  it("within one version orders revision labels numerically aware, then by id", () => {
    const sameVersion = (id: string, revision: string) => ({ id, documentId: "d1", corpusVersionId: "cv-v1", revision });
    expect(currentRevisionIds([sameVersion("r9", "9"), sameVersion("r10", "10")], lineage)).toEqual(["r10"]);
    expect(currentRevisionIds([sameVersion("rB", "B"), sameVersion("rA", "A")], lineage)).toEqual(["rB"]);
    expect(currentRevisionIds([sameVersion("rA", "A"), sameVersion("r0", "0"), sameVersion("rB", "B")], lineage)).toEqual(["r0"]);
    expect(currentRevisionIds([sameVersion("r1", "1"), sameVersion("rC", "C")], lineage)).toEqual(["r1"]);
    expect(currentRevisionIds([sameVersion("r-a", "1"), sameVersion("r-b", "1")], lineage)).toEqual(["r-b"]);
  });

  it("is empty for no revisions or an empty lineage", () => {
    expect(currentRevisionIds([], lineage)).toEqual([]);
    expect(currentRevisionIds([{ id: "r", documentId: "d", corpusVersionId: "cv-v1", revision: "A" }], [])).toEqual([]);
  });
});

describe("toCorpusVersion", () => {
  it("renders the 9.7 shape in snake_case with ISO timestamps", () => {
    expect(toCorpusVersion(ROW)).toEqual({
      id: "cv-v1",
      label: "v0-equipment-master",
      is_active: true,
      manifest_sha256: ROW.manifestSha256,
      corpus_sha256: ROW.corpusSha256,
      extractor: ROW.extractor,
      embedding_model: "pending-local-onnx",
      embedding_dim: 384,
      model_pins: ROW.modelPins,
      created_by_alias: "seed",
      created_at: "2026-09-04T21:00:00.000Z",
      activated_by_alias: "job:nightly-activation",
      activated_at: "2026-09-05T17:00:00.000Z",
      parent_version_id: null,
    });
    expect(toCorpusVersion({ ...ROW, activatedByAlias: null, activatedAt: null })).toMatchObject({ activated_by_alias: null, activated_at: null });
  });
});

describe("activateIn (one transaction)", () => {
  // The chain the transaction body awaits, in order; every value queued here settles one of them.
  function queueActivation(versionId: string, revisions: Array<{ id: string; documentId: string; corpusVersionId: string; revision: string }>) {
    queueResult(VERSIONS); // select ... for update
    queueResult(undefined); // clear is_active elsewhere
    queueResult([{ ...ROW, id: versionId, isActive: true }]); // set is_active, returning
    queueResult(undefined); // clear is_current
    queueResult(revisions); // revisions in the lineage
    if (currentRevisionIds(revisions, lineageOf(VERSIONS, versionId)).length > 0) queueResult(undefined); // set is_current
    queueResult(undefined); // the audit row
  }

  const named = (method: string) => statements.filter((s) => s.some((c) => c.method === method));
  const updatesOf = (table: unknown) => statements.filter((s) => s[0]?.method === "update" && s[0].args[0] === table);

  it("locks every version row, clears is_active everywhere else, then sets it on the named version only", async () => {
    queueActivation("cv-v2", []);
    const result = await withTransaction((tx) => activateIn(tx, "cv-v2", ADMIN, { auditId: "req-act" }));

    const lock = statements[0]!;
    expect(lock[0]).toMatchObject({ method: "select" });
    expect(lock.some((c) => c.method === "from" && c.args[0] === corpusVersion)).toBe(true);
    expect(lock.some((c) => c.method === "for" && c.args[0] === "update")).toBe(true);

    const [clear, set] = updatesOf(corpusVersion);
    expect(argOf(clear!, "set")).toEqual({ isActive: false });
    const clearWhere = compile(argOf(clear!, "where"));
    expect(clearWhere.sql).toBe('("corpus_version"."is_active" = $1 and "corpus_version"."id" <> $2)');
    expect(clearWhere.params).toEqual([true, "cv-v2"]);

    const setValues = argOf(set!, "set") as { isActive: boolean; activatedAt: unknown; activatedByAlias: string };
    expect(setValues).toMatchObject({ isActive: true, activatedByAlias: "ADMIN" });
    expect(compile(setValues.activatedAt).sql).toBe("now()");
    const setWhere = compile(argOf(set!, "where"));
    expect(setWhere.sql).toBe('"corpus_version"."id" = $1');
    expect(setWhere.params).toEqual(["cv-v2"]);
    expect(set!.some((c) => c.method === "returning")).toBe(true);
    expect(statements.indexOf(clear!)).toBeLessThan(statements.indexOf(set!));

    expect(result).toMatchObject({ id: "cv-v2", is_active: true });
  });

  it("applies the lineage rule: clears is_current, reads the revisions of the lineage only, sets the chosen ones", async () => {
    const revisions = [
      { id: "r-d1-v1", documentId: "d1", corpusVersionId: "cv-v1", revision: "A" },
      { id: "r-d1-v2", documentId: "d1", corpusVersionId: "cv-v2", revision: "B" },
      { id: "r-d2-v1", documentId: "d2", corpusVersionId: "cv-v1", revision: "0" },
    ];
    queueActivation("cv-v2", revisions);
    await withTransaction((tx) => activateIn(tx, "cv-v2", ADMIN));

    const [clear, set] = updatesOf(documentRevision);
    expect(argOf(clear!, "set")).toEqual({ isCurrent: false });
    expect(compile(argOf(clear!, "where")).sql).toBe('"document_revision"."is_current" = $1');

    const read = statements.find((s) => s.some((c) => c.method === "from" && c.args[0] === documentRevision))!;
    const readWhere = compile(argOf(read, "where"));
    expect(readWhere.sql).toBe('"document_revision"."corpus_version_id" in ($1, $2)');
    expect(readWhere.params).toEqual(["cv-v2", "cv-v1"]);

    expect(argOf(set!, "set")).toEqual({ isCurrent: true });
    const setWhere = compile(argOf(set!, "where"));
    expect(setWhere.sql).toBe('"document_revision"."id" in ($1, $2)');
    expect(setWhere.params).toEqual(["r-d1-v2", "r-d2-v1"]);
  });

  it("skips the is_current set when the lineage holds no revision, and never deletes anything", async () => {
    queueActivation("cv-v1", []);
    await withTransaction((tx) => activateIn(tx, "cv-v1", ADMIN));
    expect(updatesOf(documentRevision)).toHaveLength(1);
    expect(named("delete")).toHaveLength(0);
  });

  it("writes corpus.version_activated under the request id, bound to the activated version and the route", async () => {
    queueActivation("cv-v3", []);
    await withTransaction((tx) => activateIn(tx, "cv-v3", { alias: "job:nightly-activation", role: "job" }, { auditId: "req-nightly" }));

    const [insert] = named("insert");
    expect(insert?.[0]).toMatchObject({ method: "insert", args: [auditLog] });
    expect(argOf(insert!, "values")).toEqual({
      id: "req-nightly",
      actorAlias: "job:nightly-activation",
      actorRole: "job",
      action: ACTIVATED_ACTION,
      entity: "corpus_version",
      entityId: "cv-v3",
      payload: { version_id: "cv-v3" },
      traceId: null,
      route: ACTIVATE_ROUTE,
      corpusVersionId: "cv-v3",
    });
    expect(ACTIVATED_ACTION).toBe("corpus.version_activated");
    expect(ACTIVATE_ROUTE).toBe("/api/admin/corpus/activate");
  });

  it("mints a UUID audit id and keeps the default route when the caller names none", async () => {
    queueActivation("cv-v1", []);
    await withTransaction((tx) => activateIn(tx, "cv-v1", ADMIN));
    const values = argOf(named("insert")[0]!, "values") as { id: string; route: string };
    expect(values.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(values.route).toBe(ACTIVATE_ROUTE);
  });

  it("activate_v1_after_publish (AC-ING-10): re-activating v1 under a later child reads v1's lineage only, re-marks v1's revisions current and deletes nothing", async () => {
    // d1 was re-issued by a sandbox publication into cv-s1 (child of cv-v1); d2 exists in v1 only.
    const v1Revisions = [
      { id: "r-d1-v1", documentId: "d1", corpusVersionId: "cv-v1", revision: "A" },
      { id: "r-d2-v1", documentId: "d2", corpusVersionId: "cv-v1", revision: "0" },
    ];
    queueActivation("cv-v1", v1Revisions);
    const result = await withTransaction((tx) => activateIn(tx, "cv-v1", { alias: "job:nightly-activation", role: "job" }, { auditId: "req-reassert" }));

    expect(result).toMatchObject({ id: "cv-v1", is_active: true });
    const read = statements.find((s) => s.some((c) => c.method === "from" && c.args[0] === documentRevision))!;
    const readWhere = compile(argOf(read, "where"));
    expect(readWhere.sql).toBe('"document_revision"."corpus_version_id" in ($1)');
    expect(readWhere.params).toEqual(["cv-v1"]); // the child's revision is outside the lineage and stays not current
    const [clear, set] = updatesOf(documentRevision);
    expect(argOf(clear!, "set")).toEqual({ isCurrent: false });
    expect(compile(argOf(set!, "where")).params).toEqual(["r-d1-v1", "r-d2-v1"]);
    expect(named("delete")).toHaveLength(0);
    expect(argOf(named("insert")[0]!, "values")).toMatchObject({ id: "req-reassert", action: ACTIVATED_ACTION, entityId: "cv-v1" });
  });

  it("answers not_found for an unknown version after the lock and writes nothing", async () => {
    queueResult(VERSIONS);
    await expect(withTransaction((tx) => activateIn(tx, "cv-nope", ADMIN))).rejects.toMatchObject({
      status: 404,
      code: "not_found",
      fields: { entity: "corpus_version", id: "cv-nope" },
    });
    expect(statements).toHaveLength(1);
    expect(named("update")).toHaveLength(0);
    expect(named("insert")).toHaveLength(0);
  });
});
