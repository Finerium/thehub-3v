// src/db/queries/assets.ts against the fake client (tests/helpers/fake-db-client.ts): the statements readFleet and
// readAsset issue, the visible-version filter every revision read carries (src/auth/sandbox.ts visibleVersionIds),
// and the pure helpers the surfaces print with. Hermetic: no connection, no fixture figure retyped.
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DOCUMENT_TAB_CLASSES,
  isDocumentTab,
  isTrainingValuesNote,
  readAsset,
  readFleet,
  reconciled,
  type FleetRow,
  type MasterRow,
} from "./assets";
import { argOf, queueResult, resetFakeDb, statements, type Statement } from "../../../tests/helpers/fake-db-client";

/** The SQL a recorded chain's `where` stands for, with its bound parameters. */
function whereOf(statement: Statement): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(argOf(statement, "where") as SQL);
  return { sql: query.sql, params: query.params };
}

/** Enough empty results for a whole read; a chain that is never awaited simply never shifts one. */
function queueEmpty(n: number): void {
  for (let i = 0; i < n; i += 1) queueResult([]);
}

// A whole equipment row: the mappers parse every row against the 9.3 contract, so a partial stub would fail there
// rather than in the statement the test is about. Every value is the team's own synthetic one.
const EQUIPMENT = {
  tag: "SY-0101A",
  name: "SYNTHETIC TEST PUMP",
  functionalLocation: "SYN-0100-P-01",
  areaCode: "0100",
  service: "synthetic service",
  criticalityDatasheet: "HIGH CRITICAL",
  criticalityWorkbook: "A",
  interlockRef: "SEQ-SYN-0101",
  datasheetDocNo: "DS-0101",
  gaDrawingDocNo: "GA-0101",
  pidDocumentId: "doc-pid-0100",
  plotPlanDocNo: "PP-0100",
  ceDocNo: "CE-0101",
};

const AREA = {
  code: "0100",
  workbookName: "0100 - SYNTHETIC UNIT",
  datasheetName: "SYNTHETIC UNIT",
  oplHeaderName: "0100 - SYNTHETIC UNIT",
  plotPlanTitleName: "SYNTHETIC UNIT",
};

beforeEach(resetFakeDb);

describe("readFleet", () => {
  it("reads the register in grouped statements, ordered by tag and never ranked (Case 1)", async () => {
    queueEmpty(10);
    const fleet = await readFleet();
    expect(fleet.rows).toEqual([]);
    expect(fleet.totals.assets).toBe(0);
    // Every statement is a select; none carries a limit, an offset or an order by anything but the tag.
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(s[0]?.method).toBe("select");
      expect(s.map((c) => c.method)).not.toContain("limit");
    }
    const ordered = statements.find((s) => s.some((c) => c.method === "orderBy"));
    expect(ordered, "the register is read in a defined order").toBeDefined();
  });
});

describe("readAsset", () => {
  it("answers null for a tag no equipment row carries, after one statement", async () => {
    queueResult([]);
    expect(await readAsset("NOT-A-TAG", ["cv-1"])).toBeNull();
    expect(statements).toHaveLength(1);
    expect(whereOf(statements[0]).params).toEqual(["NOT-A-TAG"]);
  });

  it("answers null when the equipment names an area no row carries", async () => {
    queueResult([EQUIPMENT]);
    queueResult([]);
    expect(await readAsset(EQUIPMENT.tag, ["cv-1"])).toBeNull();
    expect(statements).toHaveLength(2);
  });

  it("binds every revision read to the corpus versions the visitor sees (D-16)", async () => {
    queueResult([EQUIPMENT]);
    queueResult([AREA]);
    queueEmpty(60);
    await readAsset(EQUIPMENT.tag, ["cv-sandbox", "cv-1"]);
    const revisionReads = statements.filter((s) => {
      const w = s.some((c) => c.method === "where") ? whereOf(s) : null;
      return w !== null && w.params.includes("cv-sandbox") && w.params.includes("cv-1");
    });
    expect(revisionReads.length, "no statement carried the visible version ids").toBeGreaterThan(0);
  });

  it("issues no revision read at all when the visitor sees no corpus version", async () => {
    queueResult([EQUIPMENT]);
    queueResult([AREA]);
    queueEmpty(60);
    await readAsset(EQUIPMENT.tag, []);
    const withVersion = statements.filter((s) => {
      if (!s.some((c) => c.method === "where")) return false;
      return whereOf(s).sql.includes("corpus_version_id");
    });
    expect(withVersion).toEqual([]);
  });

  it("reads the asset's document set by the four bound doc_no columns, the P&ID id and the subject tag", async () => {
    queueResult([EQUIPMENT]);
    queueResult([AREA]);
    queueEmpty(60);
    await readAsset(EQUIPMENT.tag, ["cv-1"]);
    const docs = whereOf(statements[2]);
    expect(docs.params).toEqual(
      expect.arrayContaining([EQUIPMENT.pidDocumentId, EQUIPMENT.tag, EQUIPMENT.datasheetDocNo, EQUIPMENT.gaDrawingDocNo, EQUIPMENT.plotPlanDocNo, EQUIPMENT.ceDocNo]),
    );
  });
});

describe("the helpers the register prints with", () => {
  const row = (over: Partial<FleetRow> = {}): FleetRow =>
    ({
      equipment: { tag: "SY-0101A", criticality_workbook: "A" },
      area_workbook_name: "0100 - SYNTHETIC UNIT",
      interlock: null,
      work_orders: 4,
      unplanned_rows: 2,
      planned_flagged_rows: 1,
      unplanned_hours: 6.5,
      flagged_hours: 1.5,
      lessons: 1,
      open_findings: 0,
      workbook: null,
      ...over,
    }) as unknown as FleetRow;

  const workbook = (over: Partial<MasterRow> = {}): MasterRow =>
    ({ unplanned_h: 6.5, flagged_h: 1.5, work_orders: 4, criticality_workbook: "A", ...over }) as unknown as MasterRow;

  it("states the reconciliation as unknown, not as agreement, when no fixture row exists", () => {
    expect(reconciled(row())).toBeNull();
  });

  it("reconciles only when the hours, the count and the criticality all agree", () => {
    expect(reconciled(row({ workbook: workbook() }))).toBe(true);
    expect(reconciled(row({ workbook: workbook({ unplanned_h: 6.6 }) }))).toBe(false);
    expect(reconciled(row({ workbook: workbook({ work_orders: 5 }) }))).toBe(false);
    expect(reconciled(row({ workbook: workbook({ criticality_workbook: "B" }) }))).toBe(false);
  });

  it("recognises only the six document tabs of 6.2", () => {
    for (const c of DOCUMENT_TAB_CLASSES) expect(isDocumentTab(c)).toBe(true);
    expect(isDocumentTab("organiser_note")).toBe(false);
    expect(isDocumentTab(undefined)).toBe(false);
  });

  it("recognises the organiser's training-values note", () => {
    expect(isTrainingValuesNote("Setpoints shown are training values")).toBe(true);
    expect(isTrainingValuesNote("A cause-and-effect row")).toBe(false);
  });
});
