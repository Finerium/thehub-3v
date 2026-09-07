// Section 5 of a draft (blueprint 9.6 "Opl carries TroubleshootingRow", 9.5 TroubleshootingRow, 9.16 AG-3
// `troubleshooting_rows`; AC-LOOP-04). The two ends of the loop meet in src/loop/rows.ts: the drafting lane writes
// the rows of the round it drafted, G3 reads them back on the publishing transaction. What is proved here is the
// round trip between them, because everything AC-LOOP-04 asks of a published section 5 rides on it: the table is
// the rows AG-3 returned, in the order it returned them, and every row still names the work order it quotes.
//
// Hermetic: the database is the fake client, which records each awaited chain and settles it with the next queued
// value. The round trip is therefore literal rather than circular: the writer's own insert values are read back
// out of the recorded statement and queued as the reader's rows, so a mapping that drops or renames a column on
// either side fails here. What the fake cannot prove is that the database returns them in `n` order, so the
// reader's ORDER BY is asserted as SQL and the real ordering is proved in tests/db/loop.test.ts.
//
// Scope: this file proves the writer and the reader. That a drafting round calls the writer belongs to the round,
// beside the draft_field write it mirrors (src/loop/draft.ts), and is not asserted here.
import { beforeEach, describe, expect, it } from "vitest";
import { AG3Output } from "@/contracts/generated/gateway";
import { db } from "@/db/client";
import { draftTroubleshootingRow } from "@/db/schema";
import { saveTroubleshootingRows, troubleshootingRows, type DraftedTroubleshootingRow } from "./rows";
import { DRAFT_ID, queryOf } from "../../tests/fixtures/drafting";
import { argOf, queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";

type RowValues = typeof draftTroubleshootingRow.$inferInsert;
type StoredRow = typeof draftTroubleshootingRow.$inferSelect;

/**
 * Three rows as AG-3 returns them (9.16), in this file's own words: no corpus text and no corpus work-order number.
 * They are deliberately not in work-order order, so the order under test is the order AG-3 returned rather than any
 * order the data would sort itself into.
 */
const DRAFTED: readonly DraftedTroubleshootingRow[] = AG3Output.shape.troubleshooting_rows.parse([
  { problem: "Vibration rises at load", cause: "Coupling element hardened", action: "Replace the element", quoted_wo_number: "WO-990002" },
  { problem: "Bearing runs warm", cause: "Lubricant degraded", action: "Drain, flush and refill", quoted_wo_number: "WO-990001" },
  { problem: "Guard fouls the shaft", cause: "Guard refitted out of line", action: "Refit the guard to its dowels", quoted_wo_number: "WO-990003" },
]);

/** The values of the one insert the writer made, in the order it wrote them. */
function insertedValues(): RowValues[] {
  const insert = statements.find((s) => s[0]?.method === "insert" && s[0].args[0] === draftTroubleshootingRow);
  expect(insert, "the writer inserts into draft.draft_troubleshooting_row").toBeDefined();
  return argOf(insert!, "values") as RowValues[];
}

/** The written values as the database hands them back: every column present, nothing renamed. */
function storedFrom(values: readonly RowValues[]): StoredRow[] {
  return values.map((value) => ({
    draftId: value.draftId,
    n: value.n,
    problem: value.problem,
    cause: value.cause,
    action: value.action,
    quotedWoNumber: value.quotedWoNumber ?? null,
    truncated: value.truncated,
  }));
}

beforeEach(resetFakeDb);

describe("saveTroubleshootingRows (the drafting lane writes the round's section 5)", () => {
  it("round trips the rows AG-3 returned, in its order, each still naming its work order", async () => {
    queueResult(undefined); // the delete
    queueResult(undefined); // the insert
    await saveTroubleshootingRows(db, DRAFT_ID, DRAFTED);

    const written = insertedValues();
    expect(written).toEqual(
      DRAFTED.map((row, index) => ({
        draftId: DRAFT_ID,
        n: index + 1,
        problem: row.problem,
        cause: row.cause,
        action: row.action,
        quotedWoNumber: row.quoted_wo_number,
        truncated: false,
      })),
    );

    // Back out through the reader: what the writer stored is what G3 gets, column for column and in table order.
    queueResult(storedFrom(written));
    const read = await troubleshootingRows(db, DRAFT_ID);

    expect(read.map((row) => row.n)).toEqual([1, 2, 3]);
    expect(read.map((row) => row.problem)).toEqual(DRAFTED.map((row) => row.problem));
    expect(read.map((row) => row.cause)).toEqual(DRAFTED.map((row) => row.cause));
    expect(read.map((row) => row.action)).toEqual(DRAFTED.map((row) => row.action));
    // AC-LOOP-04: section 5 names the work order of every row, and the id is carried character for character.
    expect(read.map((row) => row.quotedWoNumber)).toEqual(["WO-990002", "WO-990001", "WO-990003"]);
  });

  it("numbers from 1 in AG-3's order and marks nothing truncated (a drafted row is composed, never extracted)", async () => {
    queueResult(undefined);
    queueResult(undefined);
    await saveTroubleshootingRows(db, DRAFT_ID, DRAFTED);

    const written = insertedValues();
    expect(written.map((row) => row.n)).toEqual([1, 2, 3]);
    expect(written.every((row) => row.truncated === false)).toBe(true);
    expect(new Set(written.map((row) => row.draftId))).toEqual(new Set([DRAFT_ID]));
  });

  it("replaces the previous round's rows, scoped to this draft, exactly as the round rewrites draft_field", async () => {
    queueResult(undefined);
    queueResult(undefined);
    await saveTroubleshootingRows(db, DRAFT_ID, DRAFTED);

    const remove = statements[0]!;
    expect(remove[0]?.method).toBe("delete");
    expect(remove[0]?.args[0]).toBe(draftTroubleshootingRow);
    expect(queryOf(argOf(remove, "where")).params).toEqual([DRAFT_ID]);
    // The delete happens before the insert, so a second round never leaves the first round's rows behind it.
    expect(statements[1]?.[0]?.method).toBe("insert");
  });

  it("a round with nothing to quote leaves the draft with no section 5, and writes no empty insert", async () => {
    queueResult(undefined);
    await saveTroubleshootingRows(db, DRAFT_ID, []);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.[0]?.method).toBe("delete");
  });
});

describe("troubleshootingRows (G3 reads the locked draft's section 5)", () => {
  it("reads this draft's rows in table order", async () => {
    queueResult([]);
    await troubleshootingRows(db, DRAFT_ID);

    const read = statements[0]!;
    expect(read.find((call) => call.method === "from")?.args[0]).toBe(draftTroubleshootingRow);
    expect(queryOf(argOf(read, "where")).params).toEqual([DRAFT_ID]);
    // The fake settles a chain with what was queued, so the ordering is asserted as the SQL that asks for it.
    expect(queryOf(argOf(read, "orderBy")).sql).toContain('"n" asc');
  });

  it("accepts a stored row that names no work order (9.5 allows it, and the column is nullable)", async () => {
    queueResult(undefined);
    queueResult(undefined);
    await saveTroubleshootingRows(db, DRAFT_ID, [DRAFTED[0]!]);
    const [stored] = storedFrom(insertedValues());

    resetFakeDb();
    queueResult([{ ...stored!, quotedWoNumber: null }]);
    const [row] = await troubleshootingRows(db, DRAFT_ID);

    // Not coerced to an empty string and not dropped: G3 publishes the row and composes its line without a
    // dangling reference (src/gates/g3/lesson.ts rowLine).
    expect(row?.quotedWoNumber).toBeNull();
    expect(row?.problem).toBe(DRAFTED[0]!.problem);
    expect(row?.truncated).toBe(false);
  });
});
