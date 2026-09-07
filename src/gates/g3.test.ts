// G3, the publication gate (blueprint 9.9 POST /api/drafts/:id/publish, INV-3; ARCHITECTURE 8.6; AC-LOOP-09).
// `publish(draftId, actor)` runs one transaction: the advisory lock first, then the draft re-read FOR UPDATE, then
// the three refusals of 8.6 step 2 before anything of the corpus is written. This file owns the refusals and the
// order they happen in; the accepted path (documents, the child version, the recount, the sandbox) is proved end to
// end in the database lane, tests/db/loop.test.ts, where the constraints and the parallel race are real.
//
// What publish() reads, in this order, so the fake client can settle it: the lock (no rows), the draft row
// FOR UPDATE, the draft's slot fields, the draft's SME notes. A refusal happens before the reads it does not need.
//
// Step 3, the lesson itself, is exercised here through `writeLesson` for the one part of it that is not made of
// draft fields: section 5, the troubleshooting table (AC-LOOP-04). The rest of step 3 stays with the database lane.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTransaction } from "@/db/client";
import { corpusVersion, documentRevision, draftDocument, opl, troubleshootingRow } from "@/db/schema";
import { Forbidden, HttpError, NotFound } from "@/lib/errors";
import { argOf, queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";
import { DRAFT_ID, draftRow, fieldRow, noteRow, OPL_ID_RESERVED, slotFieldRow } from "../../tests/fixtures/loop";
import { publish } from "./g3";
import { writeLesson } from "./g3/lesson";

const gateway = vi.hoisted(() => ({ embed: vi.fn() }));
vi.mock("@/gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/gateway")>()),
  embed: gateway.embed,
}));

const MANAGER = { alias: "MANAGER", role: "Manager" } as const;

const chainOn = (method: string, table: unknown) =>
  statements.find((s) => s[0]?.method === method && s[0].args[0] === table);

/** Nothing of the corpus was written: no revision, no child version (a refused publish rolls back to nothing). */
function wroteNoCorpus(): void {
  expect(chainOn("insert", documentRevision)).toBeUndefined();
  expect(chainOn("insert", corpusVersion)).toBeUndefined();
}

async function refusal(promise: Promise<unknown>): Promise<HttpError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(HttpError);
  return error as HttpError;
}

beforeEach(resetFakeDb);

describe("the transaction opens under the advisory lock (ARCHITECTURE 8.6 step 1)", () => {
  it("takes pg_advisory_xact_lock('thehub.g3') before it reads the draft", async () => {
    queueResult(undefined);
    queueResult([draftRow({ state: "published" })]);
    await refusal(publish(DRAFT_ID, MANAGER));

    const lock = JSON.stringify(argOf(statements[0]!, "execute"));
    expect(lock).toContain("pg_advisory_xact_lock");
    expect(lock).toContain("thehub.g3");
    expect(statements[1]?.some((c) => c.method === "from" && c.args[0] === draftDocument)).toBe(true);
    expect(statements[1]?.some((c) => c.method === "for" && c.args[0] === "update")).toBe(true);
  });
});

describe("the refusals of 8.6 step 2", () => {
  it("409 on a draft already published: the retried request publishes nothing a second time (AC-LOOP-09)", async () => {
    queueResult(undefined);
    queueResult([draftRow({ state: "published" })]);

    const error = await refusal(publish(DRAFT_ID, MANAGER));
    expect(error.status).toBe(409);
    expect(error.code).toBe("already_published");
    wroteNoCorpus();
  });

  it.each(["proposed", "drafted", "redlined", "in_review", "blocked", "rejected"] as const)(
    "422 { gate: G3, reason } on state %s",
    async (state) => {
      queueResult(undefined);
      queueResult([draftRow({ state })]);

      const error = await refusal(publish(DRAFT_ID, MANAGER));
      expect(error.status).toBe(422);
      expect(error.code).toBe("gate_refused");
      expect(error.fields).toMatchObject({ gate: "G3", reason: "not_accepted" });
      wroteNoCorpus();
    },
  );

  it("422 outstanding_slot when a slot field carries no SME note (9.6, AC-LOOP-11)", async () => {
    queueResult(undefined);
    queueResult([draftRow({ state: "accepted" })]);
    queueResult([slotFieldRow()]);
    queueResult([]);

    const error = await refusal(publish(DRAFT_ID, MANAGER));
    expect(error.status).toBe(422);
    expect(error.fields).toMatchObject({ gate: "G3", reason: "outstanding_slot" });
    wroteNoCorpus();
  });

  it("a slot whose note exists is not outstanding: the gate is past step 2 and has read the notes", async () => {
    queueResult(undefined);
    queueResult([draftRow({ state: "accepted" })]);
    queueResult([slotFieldRow()]);
    queueResult([noteRow({ fieldId: slotFieldRow().id })]);

    // The queue is exhausted here on purpose: whatever step 3 does next, it is not one of the step 2 refusals.
    const error = await publish(DRAFT_ID, MANAGER).catch((e: unknown) => e);
    const refused = error instanceof HttpError && (error.status === 422 || error.status === 409);
    expect(refused, "a noted slot must not be refused as outstanding").toBe(false);
  });

  it("an unknown draft is the typed NotFound", async () => {
    queueResult(undefined);
    queueResult([]);

    const error = await publish("draft-nope", MANAGER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFound);
    wroteNoCorpus();
  });
});

describe("step 3 publishes the draft's section 5 (AC-LOOP-04)", () => {
  /** Three stored rows in table order, in this file's own words; the third names no work order, which 9.5 allows. */
  const ROWS = [
    { draftId: DRAFT_ID, n: 1, problem: "Vibration rises at load", cause: "Coupling element hardened", action: "Replace the element", quotedWoNumber: "WO-990002", truncated: false },
    { draftId: DRAFT_ID, n: 2, problem: "Bearing runs warm", cause: "Lubricant degraded", action: "Drain, flush and refill", quotedWoNumber: "WO-990001", truncated: false },
    { draftId: DRAFT_ID, n: 3, problem: "Guard fouls the shaft", cause: "Guard refitted out of line", action: "Refit the guard to its dowels", quotedWoNumber: null, truncated: false },
  ];

  const FIELDS = [fieldRow({ id: "field-s1", section: 1 }), fieldRow({ id: "field-s4", section: 4 })];

  /** What writeLesson reads, in order: the asset header, the asset's discipline, then the draft's section 5 rows. */
  async function publishLesson(rows = ROWS) {
    gateway.embed.mockResolvedValue(rows.map(() => [0]));
    queueResult([{ areaUnit: "Unit 99", interlockRef: "None", pidRef: "PID-SYN-99" }]);
    queueResult([{ discipline: "Mechanical", n: 2 }]);
    queueResult(rows);
    // document, revision, spans, chunks, opl, then the rows if there are any, then the procedure steps.
    for (let i = 0; i < (rows.length > 0 ? 7 : 6); i++) queueResult(undefined);
    queueResult([]); // the edge targets of the draft's own provenance spans
    // The fake client hands writeLesson the same recorded chain it hands G3 inside its real transaction.
    return withTransaction((tx) => writeLesson(tx, draftRow(), FIELDS, MANAGER, "cv-loop-child"));
  }

  const valuesOf = (table: unknown): unknown => argOf(chainOn("insert", table)!, "values");

  it("writes the draft's rows as the lesson's typed rows, in order, under the reserved lesson id", async () => {
    await publishLesson();

    expect(valuesOf(troubleshootingRow)).toEqual(
      ROWS.map((row) => ({
        oplId: OPL_ID_RESERVED,
        n: row.n,
        problem: row.problem,
        cause: row.cause,
        action: row.action,
        quotedWoNumber: row.quotedWoNumber,
        truncated: false,
      })),
    );
  });

  it("composes them into the lesson's section 5 body in the same order, each naming its work order", async () => {
    await publishLesson();

    const sections = (valuesOf(opl) as { sections: { n: number; body_text: string }[] }).sections;
    const five = sections.find((section) => section.n === 5);
    expect(five?.body_text).toBe(
      "Vibration rises at load Coupling element hardened Replace the element (WO-990002) " +
        "Bearing runs warm Lubricant degraded Drain, flush and refill (WO-990001) " +
        "Guard fouls the shaft Guard refitted out of line Refit the guard to its dowels",
    );
    // The rows are not draft fields, so section 5 exists even though no field carries it, and the sections that do
    // come from fields are unchanged beside it.
    expect(sections.map((section) => section.n)).toEqual([1, 4, 5]);
  });

  it("a draft with no rows publishes no section 5 and writes no empty table", async () => {
    await publishLesson([]);

    const sections = (valuesOf(opl) as { sections: { n: number }[] }).sections;
    expect(sections.map((section) => section.n)).toEqual([1, 4]);
    expect(chainOn("insert", troubleshootingRow)).toBeUndefined();
  });
});

describe("only the Manager publishes (INV-3)", () => {
  it.each(["Engineer", "Reviewing Supervisor", "Admin"] as const)(
    "%s is refused by the gate itself, before the lock and before any read",
    async (role) => {
      const error = await publish(DRAFT_ID, { alias: role.toUpperCase(), role }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Forbidden);
      expect((error as Forbidden).status).toBe(403);
      expect(statements).toHaveLength(0);
    },
  );
});
