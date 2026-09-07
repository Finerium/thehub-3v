// src/db/queries/traces.ts against the fake client: the designed null for an unknown trace id, the window the
// gateway calls are bound by (a gateway_call row carries no trace id, 9.13) and the basis the surface states for
// it, the count the lane stamped, and the seeded chip a `/ask?chip=` link names. The trace row is built by the
// lane's own insertTrace from the shared fixture, so nothing here hand-writes a row shape that could drift.
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AnswerTrace } from "@/contracts/generated/serving";
import { insertTrace } from "@/answer/trace";
import type { answerTrace } from "@/db/schema";
import { seededTraceStored } from "../../../tests/fixtures/answer";
import { argOf, queueResult, resetFakeDb, statements, type Statement } from "../../../tests/helpers/fake-db-client";
import { seededChipById, traceReplay } from "./traces";

function whereOf(statement: Statement): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(argOf(statement, "where") as SQL);
  return { sql: query.sql, params: query.params };
}

/** The stored row of a trace, as the lane writes it (never hand-typed here). */
async function rowOf(trace: AnswerTrace): Promise<typeof answerTrace.$inferSelect> {
  resetFakeDb();
  queueResult(undefined);
  await insertTrace(trace);
  const values = argOf(statements[0], "values") as typeof answerTrace.$inferSelect;
  resetFakeDb();
  return values;
}

const SERVER_TS = "2026-03-01T10:00:00.000Z";
const trace = (over: Partial<AnswerTrace> = {}): AnswerTrace => ({ ...seededTraceStored, server_ts: SERVER_TS, ...over });

beforeEach(resetFakeDb);

describe("traceReplay", () => {
  it("answers null for an id no trace row carries, after one statement", async () => {
    queueResult([]);
    expect(await traceReplay("trace-gone")).toBeNull();
    expect(statements).toHaveLength(1);
    expect(whereOf(statements[0]).params).toEqual(["trace-gone"]);
    expect(argOf(statements[0], "limit")).toBe(1);
  });

  it("closes the window at the audit event that closed the trace, and says so", async () => {
    const row = await rowOf(trace());
    const closedAt = "2026-03-01T10:00:04.000Z";
    queueResult([row]);
    queueResult([{ id: row.corpusVersionId, label: "v1" }]);
    queueResult([{ at: closedAt }]);
    queueResult([]);
    const replay = await traceReplay(row.id);
    expect(replay?.calls_window.basis).toBe("audit_event");
    expect(replay?.calls_window.from).toBe(SERVER_TS);
    expect(replay?.calls_window.to).toBe(new Date(closedAt).toISOString());
  });

  it("falls back to the ask route's maximum duration when no audit event closes the trace", async () => {
    const row = await rowOf(trace());
    queueResult([row]);
    queueResult([{ id: row.corpusVersionId, label: "v1" }]);
    queueResult([{ at: null }]);
    queueResult([]);
    const replay = await traceReplay(row.id);
    expect(replay?.calls_window.basis).toBe("route_max_duration");
    expect(new Date(replay!.calls_window.to).getTime()).toBeGreaterThan(new Date(SERVER_TS).getTime());
  });

  it("binds the calls to the trace's own corpus version and to that window", async () => {
    const row = await rowOf(trace());
    queueResult([row]);
    queueResult([{ id: row.corpusVersionId, label: "v1" }]);
    queueResult([{ at: null }]);
    queueResult([]);
    await traceReplay(row.id);
    const calls = whereOf(statements[3]);
    expect(calls.params[0]).toBe(row.corpusVersionId);
    expect(calls.params).toHaveLength(3); // the version and the two ends of the window
  });

  it("reports no stamped call count when the trace carries none (a seeded chip composes nothing)", async () => {
    const row = await rowOf(trace());
    queueResult([row]);
    queueResult([]);
    queueResult([{ at: null }]);
    queueResult([]);
    const replay = await traceReplay(row.id);
    expect(replay?.calls_expected).toBeNull();
    expect(replay?.version).toBeNull();
  });

  it("reads the stamped count the lane wrote into model_ids", async () => {
    const row = await rowOf(trace({ model_ids: { ...seededTraceStored.model_ids, gateway_calls: "2" } }));
    queueResult([row]);
    queueResult([]);
    queueResult([{ at: null }]);
    queueResult([]);
    expect((await traceReplay(row.id))?.calls_expected).toBe(2);
  });
});

describe("seededChipById", () => {
  it("answers null while the chips have not been seeded, never a fabricated chip", async () => {
    queueResult([]);
    expect(await seededChipById("chip-1")).toBeNull();
    expect(whereOf(statements[0]).params).toEqual(["chip-1"]);
  });

  it("hands the surface the chip's own fields", async () => {
    queueResult([{ id: "chip-1", equipmentTag: "SY-0101A", question: "a synthetic question", goldenCaseId: null, traceId: "trace-1" }]);
    expect(await seededChipById("chip-1")).toEqual({
      id: "chip-1",
      equipment_tag: "SY-0101A",
      question: "a synthetic question",
      golden_case_id: null,
      trace_id: "trace-1",
    });
  });
});
