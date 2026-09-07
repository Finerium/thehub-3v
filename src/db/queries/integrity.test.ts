// src/db/queries/integrity.ts against the fake client: the version the register is read from (one version, never a
// union), the filter each listing binds, the observation rules that stay outside an unfiltered listing, the page
// window against the whole-register export, and the ordering helpers. Hermetic: no connection, no corpus text.
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { NO_DISCIPLINE, OBSERVATION_RULES, SEVERITIES, STATES, allFindings, byRuleNumber, listFindings, registerVersion, ruleMeta } from "./integrity";
import { argOf, queueResult, resetFakeDb, statements, type Statement } from "../../../tests/helpers/fake-db-client";

function whereOf(statement: Statement): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(argOf(statement, "where") as SQL);
  return { sql: query.sql, params: query.params };
}

const methodsOf = (statement: Statement) => statement.map((c) => c.method);

beforeEach(resetFakeDb);

describe("registerVersion", () => {
  it("takes the first version in preference order that carries findings", async () => {
    queueResult([
      { id: "cv-1", n: 4 },
      { id: "cv-sandbox", n: 2 },
    ]);
    expect(await registerVersion(["cv-sandbox", "cv-1"])).toBe("cv-sandbox");
    expect(whereOf(statements[0]).params).toEqual(["cv-sandbox", "cv-1"]);
  });

  it("skips a version that carries no finding", async () => {
    queueResult([{ id: "cv-1", n: 4 }]);
    expect(await registerVersion(["cv-sandbox", "cv-1"])).toBe("cv-1");
  });

  it("answers null, and reads nothing, when the visitor sees no version", async () => {
    expect(await registerVersion([])).toBeNull();
    expect(statements).toHaveLength(0);
  });
});

describe("listFindings", () => {
  it("binds the version, hides the observation rules and windows the page", async () => {
    queueResult([]); // the rows
    queueResult([{ n: 0 }]); // the count
    const page = await listFindings({}, "cv-1", 3, 25);
    expect(page).toEqual({ rows: [], total: 0 });

    const rows = statements[0];
    const where = whereOf(rows);
    expect(where.params).toContain("cv-1");
    // observation_only = false, the default listing (AC-INT-02)
    expect(where.params).toContain(false);
    expect(methodsOf(rows)).toContain("orderBy");
    expect(argOf(rows, "limit")).toBe(25);
    expect(argOf(rows, "offset")).toBe(50);
  });

  it("lists an observation rule when the rule filter names one", async () => {
    queueResult([]);
    queueResult([{ n: 0 }]);
    await listFindings({ rule: OBSERVATION_RULES[0] }, "cv-1", 1, 50);
    const where = whereOf(statements[0]);
    expect(where.params).toContain(OBSERVATION_RULES[0]);
    expect(where.params).not.toContain(false);
  });

  it("binds every filter of 9.9, and a discipline of none as an is-null", async () => {
    queueResult([]);
    queueResult([{ n: 0 }]);
    await listFindings({ severity: "high", state: "open", document: "doc-1", discipline: "instrument", observations: true }, "cv-1", 1, 50);
    const where = whereOf(statements[0]);
    expect(where.params).toEqual(expect.arrayContaining(["cv-1", "high", "open", "doc-1", "instrument"]));

    resetFakeDb();
    queueResult([]);
    queueResult([{ n: 0 }]);
    await listFindings({ discipline: NO_DISCIPLINE }, "cv-1", 1, 50);
    expect(whereOf(statements[0]).sql).toContain("is null");
  });
});

describe("allFindings", () => {
  it("reads the whole filtered register with no limit and no offset (the CSV export)", async () => {
    queueResult([]);
    await allFindings({}, "cv-1");
    expect(methodsOf(statements[0])).not.toContain("limit");
    expect(methodsOf(statements[0])).not.toContain("offset");
    expect(whereOf(statements[0]).params).toContain("cv-1");
  });
});

describe("the register's own vocabulary and order", () => {
  it("orders rule ids by their number, not as strings", () => {
    expect(["CD-10", "CD-2", "CD-1", "CD-18"].sort(byRuleNumber)).toEqual(["CD-1", "CD-2", "CD-10", "CD-18"]);
  });

  it("names the three severities and the two lifecycle states of 6.2 surface 9", () => {
    expect(SEVERITIES).toEqual(["high", "medium", "low"]);
    expect(STATES).toEqual(["open", "resolved"]);
    expect(OBSERVATION_RULES).toEqual(["CD-15", "CD-16"]);
  });

  it("answers null for a rule the fixture does not name, never a placeholder block", () => {
    expect(ruleMeta(null, "CD-1")).toBeNull();
    expect(ruleMeta({ integrity: {} } as never, "CD-1")).toBeNull();
  });
});
