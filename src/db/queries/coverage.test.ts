// src/db/queries/coverage.ts against the fake client: the version the console is read from (the sandbox recount
// first, the active lineage otherwise, D-16), the designed "not yet computed" null, the statements each read
// issues, and the display helpers the Console and the Home headline print with. Hermetic: every figure here is the
// team's own synthetic one; the published coverage numbers are asserted against the fixture in tests/e2e.
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { CoverageSummary } from "@/contracts/generated/coverage";
import {
  LAYERS,
  hoursText,
  idrText,
  layerPair,
  parseLayer,
  percentOf,
  readCluster,
  readCoverageConsole,
  reportedAt,
  resolveCoverageVersion,
  sensitivityBand,
} from "./coverage";
import { argOf, queueResult, resetFakeDb, statements, type Statement } from "../../../tests/helpers/fake-db-client";

function whereOf(statement: Statement): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(argOf(statement, "where") as SQL);
  return { sql: query.sql, params: query.params };
}

const versionRow = (id: string, isActive: boolean) => ({ id, label: `v-${id}`, isActive, corpusSha256: "e".repeat(64) });

/** visibleVersionIds() reads corpus_version first; this is what that select returns. */
const lineage = (rows: Array<{ id: string; parentVersionId: string | null; isActive: boolean }>) => rows;

const summary = (layer: "generous" | "strict", over: Partial<CoverageSummary> = {}): CoverageSummary => ({
  corpus_version_id: "cv-1",
  population: "unplanned_failure",
  layer,
  threshold: 0.62,
  uncovered_count: 3,
  population_count: 9,
  uncovered_breakdowns: 1,
  uncovered_downtime_hours: 2.5,
  uncovered_cost_idr: 1_000,
  bands: null,
  sensitivity: [],
  ...over,
});

beforeEach(resetFakeDb);

describe("resolveCoverageVersion", () => {
  it("shows the active version when the visitor has no sandbox recount", async () => {
    queueResult(lineage([{ id: "cv-1", parentVersionId: null, isActive: true }])); // visibleVersionIds
    queueResult([versionRow("cv-1", true)]); // versions that carry coverage
    const resolved = await resolveCoverageVersion(null);
    expect(resolved?.shown.id).toBe("cv-1");
    expect(resolved?.active?.id).toBe("cv-1");
  });

  it("prefers the visitor's own sandbox version and keeps the active one as the baseline (D-16)", async () => {
    queueResult(lineage([{ id: "cv-1", parentVersionId: null, isActive: true }]));
    queueResult([versionRow("cv-1", true), versionRow("cv-sandbox", false)]);
    const resolved = await resolveCoverageVersion({ corpusVersionId: "cv-sandbox" });
    expect(resolved?.shown.id).toBe("cv-sandbox");
    expect(resolved?.active?.id).toBe("cv-1");
    // The lookup asked for the lineage and the sandbox's own version, and for nothing else.
    expect(whereOf(statements[1]).params).toEqual(["cv-1", "cv-sandbox"]);
  });

  it("answers null when no visible version carries coverage rows", async () => {
    queueResult(lineage([{ id: "cv-1", parentVersionId: null, isActive: true }]));
    queueResult([]);
    expect(await resolveCoverageVersion(null)).toBeNull();
  });
});

describe("readCoverageConsole", () => {
  it("answers null, not an empty console, when no version carries coverage", async () => {
    queueResult(lineage([{ id: "cv-1", parentVersionId: null, isActive: true }]));
    queueResult([]);
    expect(await readCoverageConsole(null)).toBeNull();
    // Nothing was read beyond the two version statements.
    expect(statements).toHaveLength(2);
  });

  it("reads the summaries, the method and the clusters of the shown version alone", async () => {
    queueResult(lineage([{ id: "cv-1", parentVersionId: null, isActive: true }]));
    queueResult([versionRow("cv-1", true)]);
    queueResult([]); // summaries
    queueResult([]); // method
    queueResult([]); // clusters
    await readCoverageConsole(null).catch(() => undefined);
    for (const s of statements.slice(2)) {
      expect(whereOf(s).params).toContain("cv-1");
    }
  });
});

describe("readCluster", () => {
  it("answers null for an id the shown version does not carry (the designed 404)", async () => {
    queueResult(lineage([{ id: "cv-1", parentVersionId: null, isActive: true }]));
    queueResult([versionRow("cv-1", true)]);
    queueResult([]); // the cluster row
    expect(await readCluster("not-a-cluster", null)).toBeNull();
    expect(whereOf(statements[2]).params).toEqual(["not-a-cluster", "cv-1"]);
  });
});

describe("the display helpers", () => {
  it("reads the layer of a query string and defaults to the generous one", () => {
    expect(parseLayer("strict")).toBe("strict");
    expect(parseLayer("generous")).toBe("generous");
    expect(parseLayer(undefined)).toBe("generous");
    expect(parseLayer(["strict"])).toBe("generous"); // an array is not a layer name
    expect(LAYERS).toEqual(["generous", "strict"]);
  });

  it("pairs the two layers of one population and answers null when either is missing", () => {
    const rows = [summary("generous"), summary("strict")];
    expect(layerPair(rows, "unplanned_failure")?.strict.layer).toBe("strict");
    expect(layerPair([summary("generous")], "unplanned_failure")).toBeNull();
    expect(layerPair(rows, "all")).toBeNull();
  });

  it("prints a percentage at one decimal, and says so in words when there is no population", () => {
    expect(percentOf(3, 9)).toBe("33.3 percent");
    expect(percentOf(0, 0)).toBe("no records");
  });

  it("prints hours at the column's one decimal and rupiah grouped", () => {
    expect(hoursText(74.5)).toBe("74.5 h");
    expect(hoursText(0)).toBe("0.0 h");
    expect(idrText(93_721_000)).toBe("IDR 93,721,000");
  });

  it("splits the workbook's own report date without dropping a character", () => {
    expect(reportedAt("2026-01-05T07:30")).toEqual({ date: "2026-01-05", time: "07:30" });
    expect(reportedAt("2026-01-05")).toEqual({ date: "2026-01-05", time: "" });
  });

  it("bands a figure from the ladder's lowest threshold to the last one that holds the count", () => {
    const s = summary("generous", {
      threshold: 0.62,
      uncovered_count: 4,
      population_count: 10,
      sensitivity: [
        { t: 0.5, uncovered_count: 3 },
        { t: 0.62, uncovered_count: 4 },
        { t: 0.65, uncovered_count: 4 },
        { t: 0.7, uncovered_count: 8 },
      ],
    });
    expect(sensitivityBand(s)).toEqual({ low: "30.0", high: "40.0", from: "0.50", to: "0.65" });
  });

  it("states no band when the ladder does not carry the row's own threshold", () => {
    expect(sensitivityBand(summary("strict", { sensitivity: [] }))).toBeNull();
    expect(sensitivityBand(summary("strict", { threshold: 0.62, sensitivity: [{ t: 0.5, uncovered_count: 1 }] }))).toBeNull();
  });
});
