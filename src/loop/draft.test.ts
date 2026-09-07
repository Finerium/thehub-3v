// runDraft, the drafting work of one invocation (ADR-004, blueprint 9.6, 9.16 AG-3; ARCHITECTURE 8.2; AC-LOOP-04,
// AC-LOOP-05, AC-LOOP-15). POST /api/drafts inserts the draft in `proposed` and hands the draft id to runDraft
// through waitUntil; runDraft is idempotent per draft id, so a second call on a draft past `proposed` returns
// having called nothing. One pass is: AG-3 with { cluster, evidence, template } -> draft_field rows (provenance or
// the literal slot text, numeric_provenance derived from the evidence, never from the model) -> `drafted`; the
// verbatim and numeric checks; the AG-4 redline of the round; `redlined`; pass -> `in_review`, block -> `drafted`
// and one more pass (round 2) -> `in_review` or `blocked`. The deterministic checks decide with the redliner and
// never through it: their violations make the round a block whatever the model returned, which is what blocks a
// draft with the field and the section named.
//
// Hermetic. The gateway, the redline module and the state module are mocks; the database is the fake client, which
// settles every awaited chain with the next queued value. runDraft reads everything it needs before it writes
// anything, so a test queues the eight reads below in order and every write settles with `undefined`: runDraft must
// therefore never destructure the result of a write (it generates its own ids).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AG3Input, AG3Output } from "@/contracts/generated/gateway";
import { draftField as draftFieldTable, redlineVerdict as redlineVerdictTable } from "@/db/schema";
import { SLOT_TEXT } from "@/lib/fixed-strings";
import { HOUSE_TEMPLATE, runDraft } from "./draft";
import {
  CLEAN_OUTPUT,
  CLUSTER,
  DATASHEET_PARAM,
  DRAFT_ID,
  EVIDENCE,
  LESSON,
  OPL_STEP,
  REDLINE_BLOCK,
  REDLINE_PASS,
  SECTION_5_QUOTE_OUTPUT,
  SET_POINT_PROVENANCE,
  UNSOURCED_NUMERAL_OUTPUT,
  VERBATIM_OUTPUT,
  WORK_ORDERS,
  ag3Output,
  draftRow,
  gatewayCall,
  rowOf,
} from "../../tests/fixtures/drafting";
import { argOf, queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";

const gateway = vi.hoisted(() => ({ invoke: vi.fn() }));
const redliner = vi.hoisted(() => ({ redline: vi.fn() }));
const state = vi.hoisted(() => ({ transition: vi.fn() }));
vi.mock("@/gateway", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/gateway")>()), invoke: gateway.invoke }));
vi.mock("@/loop/redline", () => ({ redline: redliner.redline }));
vi.mock("@/loop/state", () => ({ transition: state.transition }));

type FieldRow = typeof draftFieldTable.$inferInsert;
type VerdictRow = typeof redlineVerdictTable.$inferInsert;

// The eight reads runDraft makes, in order, before it writes anything: the draft, its cluster, then the six
// evidence kinds in the order the AG-3 envelope names them (9.16).
function queueLoad(draft = draftRow({ state: "proposed" })) {
  queueResult([draft]);
  queueResult([rowOf(CLUSTER)]);
  queueResult(WORK_ORDERS.map(rowOf));
  queueResult([rowOf(DATASHEET_PARAM)]);
  queueResult([]);
  queueResult([]);
  queueResult([rowOf(OPL_STEP)]);
  queueResult([rowOf(LESSON)]);
}

function ag3Returns(...outputs: AG3Output[]) {
  for (const data of outputs) gateway.invoke.mockResolvedValueOnce({ outcome: "ok", data, call: gatewayCall("AG-3") });
}

function redlineReturns(...verdicts: Array<typeof REDLINE_PASS>) {
  verdicts.forEach((v, i) => redliner.redline.mockResolvedValueOnce({ ...v, round: i + 1, outcome: "ok", call: gatewayCall("AG-4") }));
}

function rowsInserted<T>(table: unknown): T[][] {
  return statements
    .filter((s) => s[0]?.method === "insert" && s[0].args[0] === table)
    .map((s) => {
      const values = argOf(s, "values");
      return (Array.isArray(values) ? values : [values]) as T[];
    });
}

const fieldsInserted = () => rowsInserted<FieldRow>(draftFieldTable);
const verdictsInserted = () => rowsInserted<VerdictRow>(redlineVerdictTable).flat();
const statesReached = () => state.transition.mock.calls.map((c) => c[1] as string);

beforeEach(() => {
  resetFakeDb();
  gateway.invoke.mockReset();
  redliner.redline.mockReset();
  state.transition.mockReset();
  state.transition.mockResolvedValue(undefined);
});

describe("idempotence per draft id (ADR-004)", () => {
  it.each(["drafted", "redlined", "in_review", "accepted", "published", "blocked", "rejected"] as const)(
    "returns without a model call when the draft is already %s",
    async (draftState) => {
      queueResult([draftRow({ state: draftState })]);
      await runDraft(DRAFT_ID);

      expect(gateway.invoke).not.toHaveBeenCalled();
      expect(redliner.redline).not.toHaveBeenCalled();
      expect(state.transition).not.toHaveBeenCalled();
      expect(statements).toHaveLength(1);
    },
  );

  it("returns without a model call when the draft id names no row", async () => {
    queueResult([]);
    await runDraft(DRAFT_ID);
    expect(gateway.invoke).not.toHaveBeenCalled();
  });
});

describe("the AG-3 envelope (9.16)", () => {
  beforeEach(() => {
    queueLoad();
    ag3Returns(CLEAN_OUTPUT);
    redlineReturns(REDLINE_PASS);
  });

  it("is exactly { cluster, evidence, template }, parses against the frozen input contract, and asks for AG3Output", async () => {
    await runDraft(DRAFT_ID);

    expect(gateway.invoke).toHaveBeenCalledTimes(1);
    const [task, envelope, schema] = gateway.invoke.mock.calls[0] as [string, Record<string, unknown>, unknown];
    expect(task).toBe("AG-3");
    expect(Object.keys(envelope).sort()).toEqual(["cluster", "evidence", "template"]);
    expect(AG3Input.safeParse(envelope).success).toBe(true);
    expect(schema).toBe(AG3Output);
  });

  it("carries the cluster and the evidence in the contract's own spelling, mapped from the database rows", async () => {
    await runDraft(DRAFT_ID);
    const [, envelope] = gateway.invoke.mock.calls[0] as [string, AG3Input];

    expect(envelope.cluster).toEqual(CLUSTER);
    expect(envelope.evidence).toEqual(EVIDENCE);
  });

  it("carries the six-section house template with its header fields, the one the module publishes", async () => {
    await runDraft(DRAFT_ID);
    const [, envelope] = gateway.invoke.mock.calls[0] as [string, AG3Input];
    const template = HOUSE_TEMPLATE as unknown as { header: Record<string, unknown>; sections: Array<{ n: number }> };

    expect(envelope.template).toBe(HOUSE_TEMPLATE);
    expect(template.sections.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Object.keys(template.header).length).toBeGreaterThan(0);
  });
});

describe("the draft_field rows runDraft stores", () => {
  it("stores one row per element, in order, with the element's provenance and no quarantine", async () => {
    queueLoad();
    ag3Returns(CLEAN_OUTPUT);
    redlineReturns(REDLINE_PASS);
    await runDraft(DRAFT_ID);

    const rows = fieldsInserted().flat();
    expect(rows).toHaveLength(CLEAN_OUTPUT.sections.reduce((n, s) => n + s.elements.length, 0));
    expect(rows.every((r) => r.draftId === DRAFT_ID && r.quarantined === false)).toBe(true);
    expect(rows.map((r) => r.section)).toEqual([1, 2, 3, 4, 5, 6]);
    const setPoint = rows.find((r) => r.section === 3);
    expect(setPoint?.provenance).toEqual({ type: "datasheet_param", ref: DATASHEET_PARAM.id, span_id: null });
  });

  it("derives numeric_provenance from the evidence, never from the model: the set point is typed with its unit", async () => {
    queueLoad();
    ag3Returns(CLEAN_OUTPUT);
    redlineReturns(REDLINE_PASS);
    await runDraft(DRAFT_ID);

    const setPoint = fieldsInserted().flat().find((r) => r.section === 3);
    expect(setPoint?.numericProvenance).toEqual([SET_POINT_PROVENANCE]);
  });

  it("never writes a slot's text: an element flagged as a slot is stored as the fixed literal (AC-LOOP-05, AC-LOOP-11)", async () => {
    queueLoad();
    ag3Returns(ag3Output({ 4: [{ text: "Interval: 18 months.", provenance: { type: "slot", ref: null, span_id: null }, is_slot: true }] }));
    redlineReturns(REDLINE_PASS);
    await runDraft(DRAFT_ID);

    const slots = fieldsInserted().flat().filter((r) => r.isSlot);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.text).toBe(SLOT_TEXT);
    expect(slots[0]?.numericProvenance).toEqual([]);
    expect(JSON.stringify(fieldsInserted())).not.toContain("Interval: 18 months.");
  });
});

describe("a clean draft", () => {
  it("walks proposed to drafted to redlined to in_review with one AG-3 call and one redline round", async () => {
    queueLoad();
    ag3Returns(CLEAN_OUTPUT);
    redlineReturns(REDLINE_PASS);
    await runDraft(DRAFT_ID);

    expect(statesReached()).toEqual(["drafted", "redlined", "in_review"]);
    expect(gateway.invoke).toHaveBeenCalledTimes(1);
    expect(redliner.redline).toHaveBeenCalledTimes(1);
    expect(verdictsInserted()).toEqual([expect.objectContaining({ draftId: DRAFT_ID, round: 1, verdict: "pass", reasons: [] })]);
  });

  it("hands the redliner the AG-3 output, the evidence references and the template rules for the round", async () => {
    queueLoad();
    ag3Returns(CLEAN_OUTPUT);
    redlineReturns(REDLINE_PASS);
    await runDraft(DRAFT_ID);

    const [draft, evidenceRefs, templateRules, round] = redliner.redline.mock.calls[0] as [AG3Output, unknown[], unknown[], number];
    expect(draft).toEqual(CLEAN_OUTPUT);
    expect(round).toBe(1);
    expect(Array.isArray(evidenceRefs) && Array.isArray(templateRules)).toBe(true);
    expect(JSON.stringify(evidenceRefs)).toContain(WORK_ORDERS[0]!.wo_number);
    expect(JSON.stringify(evidenceRefs)).toContain(DATASHEET_PARAM.id);
    expect(templateRules.length).toBeGreaterThan(0);
  });

  it("passes a section 5 row that quotes a record with its work-order id", async () => {
    queueLoad();
    ag3Returns(SECTION_5_QUOTE_OUTPUT);
    redlineReturns(REDLINE_PASS);
    await runDraft(DRAFT_ID);

    expect(statesReached()).toEqual(["drafted", "redlined", "in_review"]);
  });
});

describe("the verbatim check blocks the draft (AC-LOOP-04)", () => {
  beforeEach(() => {
    queueLoad();
    ag3Returns(VERBATIM_OUTPUT, VERBATIM_OUTPUT);
    redlineReturns(REDLINE_PASS, REDLINE_PASS); // the redliner passes; the deterministic check decides anyway
  });

  it("names the field and the section in the round's reasons and ends blocked", async () => {
    await runDraft(DRAFT_ID);

    const offender = fieldsInserted().at(-1)?.find((r) => r.section === 2);
    const verdict = verdictsInserted().at(-1);
    expect(verdict?.verdict).toBe("block");
    const reason = verdict?.reasons?.find((r) => r.field_id === offender?.id);
    expect(reason?.category).toBe("template_conformance");
    expect(reason?.text).toContain(WORK_ORDERS[0]!.wo_number);
    expect(reason?.text).toContain("root_cause");
    expect(statesReached().at(-1)).toBe("blocked");
  });

  it("blocks with the reason carried on the transition, so the drafting history says why", async () => {
    await runDraft(DRAFT_ID);
    const blocking = state.transition.mock.calls.at(-1) as [string, string, unknown, string];
    expect(blocking[1]).toBe("blocked");
    expect(String(blocking[3])).not.toBe("");
  });
});

describe("the numeric check blocks the draft (AC-LOOP-05)", () => {
  it("blocks a numeral no evidence types, naming the numeral and the field", async () => {
    queueLoad();
    ag3Returns(UNSOURCED_NUMERAL_OUTPUT, UNSOURCED_NUMERAL_OUTPUT);
    redlineReturns(REDLINE_PASS, REDLINE_PASS);
    await runDraft(DRAFT_ID);

    const offender = fieldsInserted().at(-1)?.find((r) => r.section === 3);
    expect(offender?.numericProvenance).toEqual([]);
    const reason = verdictsInserted().at(-1)?.reasons?.find((r) => r.field_id === offender?.id);
    expect(reason?.text).toContain("18");
    expect(statesReached().at(-1)).toBe("blocked");
  });
});

describe("the one retry (9.6, ARCHITECTURE 8.2)", () => {
  it("goes back to drafted, drafts again and redlines as round 2, reaching in_review when round 2 passes", async () => {
    queueLoad();
    ag3Returns(CLEAN_OUTPUT, CLEAN_OUTPUT);
    redlineReturns(REDLINE_BLOCK, REDLINE_PASS);
    await runDraft(DRAFT_ID);

    expect(statesReached()).toEqual(["drafted", "redlined", "drafted", "redlined", "in_review"]);
    expect(gateway.invoke).toHaveBeenCalledTimes(2);
    expect(redliner.redline.mock.calls.map((c) => c[3])).toEqual([1, 2]);
    expect(verdictsInserted().map((v) => [v.round, v.verdict])).toEqual([[1, "block"], [2, "pass"]]);
  });

  it("blocks after the second block and never runs a third round", async () => {
    queueLoad();
    ag3Returns(CLEAN_OUTPUT, CLEAN_OUTPUT);
    redlineReturns(REDLINE_BLOCK, REDLINE_BLOCK);
    await runDraft(DRAFT_ID);

    expect(statesReached()).toEqual(["drafted", "redlined", "drafted", "redlined", "blocked"]);
    expect(redliner.redline).toHaveBeenCalledTimes(2);
    expect(verdictsInserted().at(-1)?.reasons).toEqual(REDLINE_BLOCK.reasons);
  });

  it("stores the redliner's model id and prompt version on every verdict row", async () => {
    queueLoad();
    ag3Returns(CLEAN_OUTPUT);
    redlineReturns(REDLINE_PASS);
    await runDraft(DRAFT_ID);

    expect(verdictsInserted()[0]).toMatchObject({ modelId: "glm-5.3-flash", promptVersion: "fixture" });
  });
});

describe("an AG-3 call that returns nothing usable", () => {
  it("retries once and then leaves the draft in proposed, where the lease expiry blocks it (ADR-004)", async () => {
    queueLoad();
    gateway.invoke.mockResolvedValue({ outcome: "parse_failed", data: null, call: gatewayCall("AG-3", "parse_failed") });
    await runDraft(DRAFT_ID);

    expect(gateway.invoke).toHaveBeenCalledTimes(2);
    expect(redliner.redline).not.toHaveBeenCalled();
    expect(fieldsInserted()).toEqual([]);
    expect(state.transition).not.toHaveBeenCalled(); // proposed -> blocked is not a legal pair outside lease expiry
  });

  it("drafts on the second call when the first did not parse", async () => {
    queueLoad();
    gateway.invoke.mockResolvedValueOnce({ outcome: "parse_failed", data: null, call: gatewayCall("AG-3", "parse_failed") });
    ag3Returns(CLEAN_OUTPUT);
    redlineReturns(REDLINE_PASS);
    await runDraft(DRAFT_ID);

    expect(statesReached()).toEqual(["drafted", "redlined", "in_review"]);
  });
});

describe("the drafter stays inside its lane", () => {
  it("writes no sme_note and reaches no table outside the draft schema", async () => {
    queueLoad();
    ag3Returns(CLEAN_OUTPUT);
    redlineReturns(REDLINE_PASS);
    await runDraft(DRAFT_ID);

    const written = statements.filter((s) => s[0]?.method === "insert" || s[0]?.method === "update").map((s) => s[0]?.args[0]);
    expect(new Set(written)).toEqual(new Set([draftFieldTable, redlineVerdictTable]));
  });

  it("stores every element with provenance or as a slot, which is what the CHECK constraint enforces", async () => {
    queueLoad();
    ag3Returns(CLEAN_OUTPUT);
    redlineReturns(REDLINE_PASS);
    await runDraft(DRAFT_ID);

    for (const row of fieldsInserted().flat()) {
      if (row.isSlot) expect(row.text).toBe(SLOT_TEXT);
      else expect(row.provenance).toBeTruthy();
    }
  });
});
