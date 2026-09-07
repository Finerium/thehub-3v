// src/db/queries/coverage-inputs.ts against the fake client: the four inputs the frozen recipe runs over, read
// from the rows of one lineage (ARCHITECTURE 3.4), the note chunk that carries a lesson's extracted header block,
// and the refusal to read anything without a lineage. Hermetic: no connection, and the coverage figures themselves
// are the equality gate's business, not this file's.
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Tx } from "@/db/client";
import { db } from "@/db/client";
import { readCoverageInputs } from "./coverage-inputs";
import { argOf, queueResult, resetFakeDb, statements, type Statement } from "../../../tests/helpers/fake-db-client";

function whereOf(statement: Statement): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(argOf(statement, "where") as SQL);
  return { sql: query.sql, params: query.params };
}

// The fake client stands in for the transaction handle the G3 recount passes.
const tx = db as unknown as Tx;

const ASSETS = [{ tag: "SY-0101A", name: "SYNTHETIC TEST PUMP", criticality: "HIGH CRITICAL" }];

beforeEach(resetFakeDb);

describe("readCoverageInputs", () => {
  it("refuses to read anything without a lineage rather than scoring an empty corpus", async () => {
    await expect(readCoverageInputs(tx, [])).rejects.toThrow(/lineage/);
    expect(statements).toHaveLength(0);
  });

  it("binds the revisions to the lineage and reads the shared workbook rows unversioned", async () => {
    queueResult([]); // work orders
    queueResult([]); // revisions
    queueResult(ASSETS);
    queueResult([]); // families
    await readCoverageInputs(tx, ["cv-box", "cv-1"]);
    expect(whereOf(statements[1]).params).toEqual(["cv-box", "cv-1"]);
    // The workbook and the asset master carry no corpus version: those statements bind nothing.
    expect(statements[0].some((c) => c.method === "where")).toBe(false);
    expect(statements[2].some((c) => c.method === "where")).toBe(false);
  });

  it("reads no lesson and no note chunk when the lineage carries no current revision", async () => {
    queueResult([]);
    queueResult([]);
    queueResult(ASSETS);
    queueResult([]);
    const inputs = await readCoverageInputs(tx, ["cv-1"]);
    expect(inputs.lessons).toEqual([]);
    expect(statements).toHaveLength(4);
  });

  it("carries the note chunk of each lesson as its header text, and an empty string where none exists", async () => {
    const revisionId = "rev-opl-1";
    queueResult([]); // work orders
    queueResult([{ id: revisionId, documentId: "doc-opl-1", corpusVersionId: "cv-1", revision: "0" }]);
    queueResult(ASSETS);
    queueResult([]); // families
    queueResult([
      {
        documentRevisionId: revisionId,
        oplId: "OPL-SY-0101A-01",
        title: "t",
        discipline: "Mechanical",
        equipmentTag: "SY-0101A",
        areaUnit: "0100",
        relatedInterlockText: "SEQ-SYN-0101",
        pidRef: "SYN-PID-0101",
        classification: "Basic Knowledge",
        aspect: "P",
        sections: [],
        permitLines: [],
        footer: {},
        machineDrafted: false,
        approverAlias: null,
      },
    ]);
    queueResult([
      { revisionId, text: "the extracted header block" },
      { revisionId, text: "a later note that must not win" },
    ]);
    const inputs = await readCoverageInputs(tx, ["cv-1"]);
    expect(inputs.lessons).toHaveLength(1);
    expect(inputs.lessons[0].header_text).toBe("the extracted header block");
    expect(inputs.lessons[0].equipment_name).toBe(ASSETS[0].name);
    // The note read asks for the lesson's revision and for the note unit kind alone.
    expect(whereOf(statements[5]).params).toEqual([revisionId, "note"]);
  });

  it("hands the port the criticality per tag and every work order a family names", async () => {
    queueResult([]);
    queueResult([]);
    queueResult(ASSETS);
    queueResult([{ members: [{ wo_number: "WO-SYN-0001" }, { wo_number: "WO-SYN-0002" }] }]);
    const inputs = await readCoverageInputs(tx, ["cv-1"]);
    expect(inputs.criticalityByTag).toEqual({ "SY-0101A": "HIGH CRITICAL" });
    expect([...inputs.familyMembers].sort()).toEqual(["WO-SYN-0001", "WO-SYN-0002"]);
  });
});
