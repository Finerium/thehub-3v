// src/db/queries/documents.ts against the fake client: the history toggle (a superseded revision is read only when
// it is asked for and then labelled, AC-ANS-14), the bindings that put a document on an asset, and the one page
// derivative a request may take (INV-7: one page at a time, never a bulk route). Hermetic: no connection.
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDocument, getPageDerivative } from "./documents";
import { argOf, queueResult, resetFakeDb, statements, type Statement } from "../../../tests/helpers/fake-db-client";

function whereOf(statement: Statement): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(argOf(statement, "where") as SQL);
  return { sql: query.sql, params: query.params };
}

const DOC = {
  id: "doc-ds-0101",
  docNo: "DS-0101",
  class: "datasheet",
  subjectTag: "SY-0101A",
  title: "SYNTHETIC DATASHEET",
  pageCount: 2,
  sha256: "f".repeat(64),
  sourcePath: "synthetic/DS-0101.pdf",
  excludedFromRetrieval: false,
};

beforeEach(resetFakeDb);

describe("getDocument", () => {
  it("answers null for an id no document row carries, after one statement", async () => {
    queueResult([]);
    expect(await getDocument("doc-gone", false)).toBeNull();
    expect(statements).toHaveLength(1);
    expect(whereOf(statements[0]).params).toEqual(["doc-gone"]);
  });

  it("reads the current revision alone while the history toggle is closed", async () => {
    queueResult([DOC]);
    queueResult([]); // revisions
    queueResult([]); // assets
    queueResult([]); // findings
    await getDocument(DOC.id, false).catch(() => undefined);
    const revisions = whereOf(statements[1]);
    expect(revisions.params).toEqual([DOC.id, true]);
    expect(revisions.sql).toContain("is_current");
  });

  it("reads every revision of the lineage when the toggle is open (AC-ANS-14)", async () => {
    queueResult([DOC]);
    queueResult([]);
    queueResult([]);
    queueResult([]);
    await getDocument(DOC.id, true).catch(() => undefined);
    const revisions = whereOf(statements[1]);
    expect(revisions.params).toEqual([DOC.id]);
    expect(revisions.sql).not.toContain("is_current");
  });

  it("binds the asset by the P&ID id, the four typed doc_no columns and the subject tag", async () => {
    queueResult([DOC]);
    queueResult([]);
    queueResult([]);
    queueResult([]);
    await getDocument(DOC.id, false).catch(() => undefined);
    expect(whereOf(statements[2]).params).toEqual([DOC.id, DOC.docNo, DOC.docNo, DOC.docNo, DOC.docNo, DOC.subjectTag]);
  });

  it("binds the asset by the id alone when the document carries neither a doc_no nor a subject tag", async () => {
    queueResult([{ ...DOC, docNo: null, subjectTag: null }]);
    queueResult([]);
    queueResult([]);
    queueResult([]);
    await getDocument(DOC.id, false).catch(() => undefined);
    expect(whereOf(statements[2]).params).toEqual([DOC.id]);
  });

  it("reads no span at all when the document carries no visible revision", async () => {
    queueResult([DOC]);
    queueResult([]); // no revision
    queueResult([]);
    queueResult([]);
    await getDocument(DOC.id, false).catch(() => undefined);
    expect(statements).toHaveLength(4);
  });
});

describe("getPageDerivative", () => {
  it("takes one page, the widest stored derivative of it, and never more than one row (INV-7)", async () => {
    queueResult([]);
    expect(await getPageDerivative(DOC.id, 2)).toBeNull();
    expect(whereOf(statements[0]).params).toEqual([DOC.id, 2]);
    expect(argOf(statements[0], "limit")).toBe(1);
    expect(statements[0].map((c) => c.method)).toContain("orderBy");
  });
});
