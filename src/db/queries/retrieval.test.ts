// The retrieval pool of ARCHITECTURE 7 step 6 (blueprint 8.4; AC-ANS-02, AC-NFR-06). Every other query of this
// module is a plain read that the answer-lane tests already drive through the in-memory fake; the one piece of
// logic here is candidateChunks, which runs two statements and hands the caller their union: the top k of the
// rank, and the best chunk of each document class present. Without the second statement one asset's seven lessons
// fill k = 12 on their own and answer/rerank.ts reserveByClass has no sheet, datasheet or drawing left to reserve a
// slot for (the diagnosis of 2026-09-07, rank 6). The database is the fake client of tests/helpers; nothing here
// opens a connection.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { queueResult, resetFakeDb, statements } from "../../../tests/helpers/fake-db-client";
import { candidateChunks, type ChunkCandidate, type ChunkQuery } from "./retrieval";

const query: ChunkQuery = {
  revisionIds: ["rev-il-2", "rev-opl1"],
  servedStatuses: ["issued_for_operation", "approved"],
  includeSuperseded: false,
  visibleVersionIds: ["cv-1"],
  queryVector: [0.1, 0.2, 0.3],
  terms: "trip vibration",
  tags: ["GA-9901A"],
  k: 2,
};

/** A row as the driver returns it: the two computed columns come back as strings on some casts, numbers on others. */
function row(chunkId: string, documentClass: string, lexical: number | string, cosine: number | string): Record<string, unknown> {
  return {
    chunkId,
    revisionId: "rev-opl1",
    page: 1,
    ordinal: 1,
    unitKind: "opl_step",
    text: "a synthetic chunk",
    quoteHash: "0".repeat(64),
    lexical,
    cosine,
    revision: "-",
    approvalStatus: "approved",
    approvalStatusText: "APPROVED",
    isCurrent: true,
    documentId: "doc-opl-1",
    docNo: "SYN-OPL-1",
    documentClass,
    subjectTag: "GA-9901A",
  };
}

beforeEach(() => {
  resetFakeDb();
});

describe("candidateChunks", () => {
  it("returns the top k and the best chunk of every document class, deduplicated by chunk id", async () => {
    queueResult([row("opl-1", "opl", 1, 0.9), row("opl-2", "opl", 1, 0.89)]);
    queueResult([row("opl-1", "opl", 1, 0.9), row("il-1", "interlock", 0, 0.6), row("ds-1", "datasheet", 0, 0.5)]);
    const pool = await candidateChunks(db, query);
    expect(pool.map((c) => c.chunkId)).toEqual(["opl-1", "opl-2", "il-1", "ds-1"]);
    // The pool is larger than k on purpose: the caller keeps k of it and reserves one slot per class.
    expect(pool.length).toBeGreaterThan(query.k);
    expect(new Set(pool.map((c) => c.documentClass))).toEqual(new Set(["opl", "interlock", "datasheet"]));
    expect(statements).toHaveLength(2);
  });

  it("pins the two computed columns to numbers whichever way the driver returned them", async () => {
    queueResult([row("opl-1", "opl", "2", "0.91")]);
    queueResult([row("il-1", "interlock", 0, 0.6)]);
    const pool = await candidateChunks(db, query);
    expect(pool.map((c) => [c.lexical, c.cosine])).toEqual([
      [2, 0.91],
      [0, 0.6],
    ]);
    for (const c of pool) {
      expect(typeof c.lexical).toBe("number");
      expect(typeof c.cosine).toBe("number");
    }
  });

  it("reads nothing at all when there is nothing to read", async () => {
    const empty: ChunkCandidate[] = [];
    expect(await candidateChunks(db, { ...query, revisionIds: [] })).toEqual(empty);
    expect(await candidateChunks(db, { ...query, visibleVersionIds: [] })).toEqual(empty);
    expect(await candidateChunks(db, { ...query, k: 0 })).toEqual(empty);
    expect(statements).toEqual([]);
  });
});
