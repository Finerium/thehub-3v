// src/db/queries/failures.ts against the fake client: the preference order the visible versions are read in, the
// version each versioned family is resolved to, the history filters and the page window, and the designed null for
// an unknown tag. Hermetic: no connection, no corpus text, no published figure retyped.
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { TEST_CLASSES, WORK_TYPES, assetFailureMemory, preferenceOrder, preferredVersion, versionLabel } from "./failures";
import { workOrder } from "@/db/schema";
import { argOf, queueResult, resetFakeDb, statements, type Statement } from "../../../tests/helpers/fake-db-client";

function whereOf(statement: Statement): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(argOf(statement, "where") as SQL);
  return { sql: query.sql, params: query.params };
}

beforeEach(resetFakeDb);

describe("preferenceOrder", () => {
  it("puts the visitor's own sandbox version first and keeps the lineage behind it (D-16)", () => {
    expect(preferenceOrder(["cv-1", "cv-0", "cv-box"], "cv-box")).toEqual(["cv-box", "cv-1", "cv-0"]);
  });

  it("leaves the lineage untouched when the visitor has no sandbox version of its own", () => {
    expect(preferenceOrder(["cv-1", "cv-0"], null)).toEqual(["cv-1", "cv-0"]);
    expect(preferenceOrder(["cv-1", "cv-0"], "cv-elsewhere")).toEqual(["cv-1", "cv-0"]);
  });

  it("copies rather than aliases, so a caller cannot reorder the visitor's own list", () => {
    const visible = ["cv-1"];
    expect(preferenceOrder(visible, null)).not.toBe(visible);
  });
});

describe("preferredVersion", () => {
  it("takes the first version of the preference order that carries a row, never a union", async () => {
    queueResult([
      { id: "cv-1", n: 3 },
      { id: "cv-box", n: 1 },
    ]);
    expect(await preferredVersion(["cv-box", "cv-1"], workOrder, workOrder.equipmentTag)).toBe("cv-box");
    expect(whereOf(statements[0]).params).toEqual(["cv-box", "cv-1"]);
    expect(statements[0].map((c) => c.method)).toContain("groupBy");
  });

  it("skips a version whose count is zero", async () => {
    queueResult([
      { id: "cv-box", n: 0 },
      { id: "cv-1", n: 3 },
    ]);
    expect(await preferredVersion(["cv-box", "cv-1"], workOrder, workOrder.equipmentTag)).toBe("cv-1");
  });

  it("answers null, and reads nothing, for an empty preference order", async () => {
    expect(await preferredVersion([], workOrder, workOrder.equipmentTag)).toBeNull();
    expect(statements).toHaveLength(0);
  });
});

describe("versionLabel", () => {
  it("reads one corpus_version row by id and answers null when it is gone", async () => {
    queueResult([]);
    expect(await versionLabel("cv-gone")).toBeNull();
    expect(whereOf(statements[0]).params).toEqual(["cv-gone"]);
    expect(argOf(statements[0], "limit")).toBe(1);
  });
});

describe("assetFailureMemory", () => {
  it("answers null for a tag no equipment row carries, after one statement", async () => {
    queueResult([]);
    expect(await assetFailureMemory("NOT-A-TAG", {}, ["cv-1"])).toBeNull();
    expect(statements).toHaveLength(1);
    expect(whereOf(statements[0]).params).toEqual(["NOT-A-TAG"]);
  });

  it("binds the work type and the breakdown flag of the filtered history, and windows the page", async () => {
    queueResult([{ tag: "SY-0101A", name: "SYNTHETIC TEST PUMP", service: "s", criticalityDatasheet: "HIGH CRITICAL", areaCode: "0100", areaWorkbookName: "0100 - SYNTHETIC UNIT" }]);
    for (let i = 0; i < 60; i += 1) queueResult([]);
    await assetFailureMemory("SY-0101A", { work_type: "Corrective", breakdown: true }, ["cv-1"], 2, 10).catch(() => undefined);

    // The paginated history read: the filters bound, ordered newest first, one page wide.
    const history = statements.find((s) => s.some((c) => c.method === "limit") && s.some((c) => c.method === "offset"));
    expect(history, "no paginated history read was issued").toBeDefined();
    expect(whereOf(history!).params).toEqual(expect.arrayContaining(["SY-0101A", "Corrective", true]));
    expect(argOf(history!, "limit")).toBe(10);
    expect(argOf(history!, "offset")).toBe(10);
  });
});

describe("the vocabulary the surface filters by", () => {
  it("names the work types and the proof-test classes of the contract, not a retyped list", () => {
    expect(WORK_TYPES.length).toBeGreaterThan(0);
    expect(TEST_CLASSES.length).toBeGreaterThan(0);
    expect(new Set(WORK_TYPES).size).toBe(WORK_TYPES.length);
  });
});
