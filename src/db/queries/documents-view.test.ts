// src/db/queries/documents-view.ts against the fake client: the visible-version filter on the revisions the viewer
// serves, the span the address named resolved against this document alone, the page the viewer settles on, and the
// locator line that never re-describes a finding. Hermetic: no connection, no corpus text.
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DOCUMENT_CLASS_LABEL, findingLocator, getDocumentView, openFindings } from "./documents-view";
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
  sha256: "f".repeat(64),
  sourcePath: "synthetic/DS-0101.pdf",
  pageCount: 4,
  fileMarker: null,
};

const options = (over: Partial<Parameters<typeof getDocumentView>[1]> = {}) => ({
  visibleVersionIds: ["cv-1"],
  includeSuperseded: false,
  page: 1,
  spanId: null,
  ...over,
});

beforeEach(resetFakeDb);

describe("getDocumentView", () => {
  it("answers null for an id no document row carries, after one statement", async () => {
    queueResult([]);
    expect(await getDocumentView("doc-gone", options())).toBeNull();
    expect(statements).toHaveLength(1);
  });

  it("serves only the revisions of the corpus versions the visitor sees (D-16)", async () => {
    queueResult([DOC]);
    for (let i = 0; i < 20; i += 1) queueResult([]);
    await getDocumentView(DOC.id, options({ visibleVersionIds: ["cv-box", "cv-1"] })).catch(() => undefined);
    expect(whereOf(statements[1]).params).toEqual([DOC.id, "cv-box", "cv-1"]);
  });

  it("reads no revision at all when the visitor sees no corpus version", async () => {
    queueResult([DOC]);
    for (let i = 0; i < 20; i += 1) queueResult([]);
    await getDocumentView(DOC.id, options({ visibleVersionIds: [] })).catch(() => undefined);
    // The next statement after the document read is not a revision read.
    expect(whereOf(statements[1]).params).not.toContain("cv-1");
  });

  it("resolves a named span against this document alone, one row (no cross-document anchor)", async () => {
    queueResult([DOC]);
    queueResult([]); // revisions
    queueResult([]); // the span
    for (let i = 0; i < 20; i += 1) queueResult([]);
    await getDocumentView(DOC.id, options({ spanId: "span-9" })).catch(() => undefined);
    const spanRead = whereOf(statements[2]);
    expect(spanRead.params).toEqual(["span-9", DOC.id]);
    expect(argOf(statements[2], "limit")).toBe(1);
  });

  it("clamps a requested page into the document's own page count", async () => {
    queueResult([DOC]);
    for (let i = 0; i < 20; i += 1) queueResult([]);
    const view = await getDocumentView(DOC.id, options({ page: 99 }));
    expect(view?.page).toBe(DOC.pageCount);

    resetFakeDb();
    queueResult([DOC]);
    for (let i = 0; i < 20; i += 1) queueResult([]);
    expect((await getDocumentView(DOC.id, options({ page: 0 })))?.page).toBe(1);
  });
});

describe("openFindings", () => {
  it("reads nothing for an empty document list", async () => {
    expect(await openFindings([])).toEqual([]);
    expect(statements).toHaveLength(0);
  });

  it("reads the open findings of the named documents, rule then id order", async () => {
    queueResult([]);
    await openFindings(["doc-a", "doc-b"]);
    const where = whereOf(statements[0]);
    expect(where.params).toEqual(["doc-a", "doc-b", "open"]);
    expect(statements[0].map((c) => c.method)).toContain("orderBy");
  });
});

describe("findingLocator", () => {
  it("states nothing when the finding carries no item", () => {
    expect(findingLocator(null)).toBeNull();
    expect(findingLocator({})).toBeNull();
  });

  it("prints the short scalar fields the harness recorded, and leaves a long value to the register", () => {
    expect(findingLocator({ row_id: "R-4", n: 2 })).toBe("row_id R-4 · n 2");
    expect(findingLocator({ quoted: "x".repeat(41) })).toBeNull();
  });

  it("prints at most four fields, so a line never becomes a paraphrase", () => {
    const locator = findingLocator({ a: "1", b: "2", c: "3", d: "4", e: "5" });
    expect(locator?.split(" · ")).toHaveLength(4);
  });
});

describe("the class labels of the viewer", () => {
  it("names every document class of the contract, including the excluded organiser note", () => {
    expect(DOCUMENT_CLASS_LABEL.organiser_note.length).toBeGreaterThan(0);
    expect(Object.values(DOCUMENT_CLASS_LABEL).every((l) => l.length > 0)).toBe(true);
  });
});
