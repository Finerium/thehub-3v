// The AG-3 evidence envelope (blueprint 9.16 AG-3 input, 9.5; ARCHITECTURE 8.2). Two things are tested here that a
// live run cannot prove cheaply: the envelope is the six evidence kinds in the contract's order, parsed against the
// generated Zod, and it is bounded. The bound is the point. Measured on the seeded corpus the GA-1201A cluster's
// envelope reached about 22,000 input tokens, at which one AG-3 reply ran 122 to 146 s and a two-round draft ran
// past the route's 300 s ceiling, so a draft never completed; the two caps of src/loop/evidence.ts are what brings
// it back inside the route. Pinning them here is pinning the reason the demo can draft at all: the work-order cap
// by its constant, and the byte budget by what it sheds, which is the one part of the envelope 9.16 AG-3 rule 5
// forbids the drafter to use (an approved lesson's section bodies, referred to by opl_id and read step by step from
// opl_steps) and never a provenance ref the numeric check needs.
//
// Hermetic: the database is the fake client, which settles every awaited chain with the next queued value, so the
// six reads are queued in the order loadEvidence makes them.
import { beforeEach, describe, expect, it } from "vitest";
import { AG3Input } from "@/contracts/generated/gateway";
import {
  evidenceRefs,
  loadCluster,
  loadEvidence,
  MAX_EVIDENCE_BYTES,
  MAX_WORK_ORDERS,
  numeralSources,
  type Evidence,
} from "./evidence";
import { HOUSE_TEMPLATE } from "./template";
import {
  CLUSTER,
  CLUSTER_ID,
  DATASHEET_PARAM,
  LESSON,
  OPL_STEP,
  WORK_ORDERS,
  queryOf,
  rowOf,
} from "../../tests/fixtures/drafting";
import { argOf, queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";

/** A numeral written in one lesson body and nowhere else in the evidence, to follow what shedding removes. */
const BODY_ONLY_NUMERAL = "4242";

/** The six reads of loadEvidence, in the order the contract names them (9.16). */
function queueEvidence(lessons: unknown[] = [rowOf(LESSON)]): void {
  queueResult(WORK_ORDERS.map(rowOf));
  queueResult([rowOf(DATASHEET_PARAM)]);
  queueResult([]);
  queueResult([]);
  queueResult([rowOf(OPL_STEP)]);
  queueResult(lessons);
}

/** The same lesson with bodies long enough to push the envelope past the byte budget, in this file's own words. */
function heavyLesson(): Record<string, unknown> {
  const filler = "This sentence is written by the test to make the lesson body long. ".repeat(120);
  return rowOf({
    ...LESSON,
    sections: LESSON.sections.map((section) => ({
      ...section,
      body_text: `${filler}The body states ${BODY_ONLY_NUMERAL} and nothing else in the evidence does.`,
    })),
  });
}

const bytesOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");

beforeEach(resetFakeDb);

describe("loadCluster (9.5 DebtCluster)", () => {
  it("returns the row in the contract's own spelling, and null when the cluster is unknown", async () => {
    queueResult([rowOf(CLUSTER)]);
    expect(await loadCluster(CLUSTER_ID)).toEqual(CLUSTER);

    queueResult([]);
    expect(await loadCluster("dc-nope")).toBeNull();
  });
});

describe("the envelope (9.16 AG-3 input)", () => {
  it("carries the six evidence kinds in the contract's order and parses against the AG-3 input schema", async () => {
    queueEvidence();
    const evidence = await loadEvidence(CLUSTER);

    expect(Object.keys(evidence)).toEqual([
      "work_orders",
      "datasheet_params",
      "interlock_rows",
      "bom_items",
      "opl_steps",
      "lessons",
    ]);
    expect(() => AG3Input.parse({ cluster: CLUSTER, evidence, template: HOUSE_TEMPLATE })).not.toThrow();
    expect(evidence.work_orders.map((w) => w.wo_number)).toEqual(WORK_ORDERS.map((w) => w.wo_number));
    expect(evidence.lessons[0]?.sections).toHaveLength(6);
  });

  it("reads the work orders of this cluster's own uncovered set, capped at MAX_WORK_ORDERS by the query", async () => {
    queueEvidence();
    await loadEvidence(CLUSTER);

    // The cap is the SQL limit, not a slice of a larger answer: the database never returns more than the cap.
    expect(MAX_WORK_ORDERS).toBe(8);
    expect(argOf(statements[0]!, "limit")).toBe(MAX_WORK_ORDERS);
    expect(queryOf(argOf(statements[0]!, "where")).params).toEqual([...CLUSTER.uncovered_wo_numbers]);
    // Ordered most recent first, then the heaviest, then by id: three clauses, so the cap keeps the same rows on
    // every run and drops the oldest and lightest ones.
    expect(statements[0]!.find((c) => c.method === "orderBy")?.args).toHaveLength(3);
  });
});

describe("the byte budget (the drafting round has to fit the route)", () => {
  it("sends everything when the envelope is inside MAX_EVIDENCE_BYTES", async () => {
    queueEvidence();
    const evidence = await loadEvidence(CLUSTER);

    expect(MAX_EVIDENCE_BYTES).toBe(40_000);
    expect(bytesOf(evidence)).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
    expect(evidence.lessons[0]?.sections.map((s) => s.body_text)).toEqual(
      LESSON.sections.map((s) => s.body_text),
    );
  });

  it("sheds the lesson bodies over it, and nothing else: the lesson stays, its steps stay", async () => {
    queueEvidence([heavyLesson()]);
    const evidence = await loadEvidence(CLUSTER);

    expect(bytesOf(evidence)).toBeLessThan(MAX_EVIDENCE_BYTES);
    // What goes: the section bodies alone (9.16 AG-3 rule 5: a lesson is referred to by opl_id, never restated).
    expect(evidence.lessons).toHaveLength(1);
    expect(evidence.lessons[0]?.sections).toEqual([]);
    // What stays: the lesson's header, the permit lines rule 5 does carry verbatim, and its footer.
    expect(evidence.lessons[0]).toMatchObject({
      opl_id: LESSON.opl_id,
      title: LESSON.title,
      permit_lines: LESSON.permit_lines,
      footer: LESSON.footer,
    });
    // And what the drafter reads a lesson from instead: the steps, whole, each with its own span id.
    expect(evidence.opl_steps).toEqual([OPL_STEP]);
    expect(evidence.work_orders).toHaveLength(WORK_ORDERS.length);
    expect(evidence.datasheet_params).toEqual([DATASHEET_PARAM]);
    expect(() => AG3Input.parse({ cluster: CLUSTER, evidence, template: HOUSE_TEMPLATE })).not.toThrow();
  });

  it("keeps every provenance ref the shed envelope can still cite", async () => {
    queueEvidence([heavyLesson()]);
    const evidence = await loadEvidence(CLUSTER);

    expect(evidenceRefs(evidence)).toEqual([
      ...WORK_ORDERS.map((w) => ({ kind: "work_order", ref: w.wo_number })),
      { kind: "datasheet_param", ref: DATASHEET_PARAM.id },
      { kind: "opl_step", ref: `${OPL_STEP.opl_id}#${OPL_STEP.n}` },
      { kind: "opl_section", ref: LESSON.opl_id },
    ]);
  });

  it("stops typing the numerals of a body it no longer sends (what the drafter cannot read it cannot cite)", async () => {
    queueEvidence([heavyLesson()]);
    const shed = numeralSources(await loadEvidence(CLUSTER));

    expect(shed.some((s) => s.numerals.has(BODY_ONLY_NUMERAL))).toBe(false);
    // The evidence that is still sent types its own numerals, with its own unit: the numeric check is unweakened.
    expect(shed.find((s) => s.ref === DATASHEET_PARAM.id)).toMatchObject({ unit: DATASHEET_PARAM.unit });
    expect(shed.find((s) => s.ref === DATASHEET_PARAM.id)?.numerals.has("7.1")).toBe(true);
  });

  it("types that numeral while the body is still inside the budget (the contrast case)", async () => {
    const lesson = LESSON.sections.map((section) => ({
      ...section,
      body_text: `The body states ${BODY_ONLY_NUMERAL}.`,
    }));
    queueEvidence([rowOf({ ...LESSON, sections: lesson })]);
    const evidence: Evidence = await loadEvidence(CLUSTER);

    expect(evidence.lessons[0]?.sections).toHaveLength(6);
    expect(numeralSources(evidence).some((s) => s.numerals.has(BODY_ONLY_NUMERAL))).toBe(true);
  });
});
