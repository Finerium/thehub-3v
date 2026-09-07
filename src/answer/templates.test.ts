// Moment templates (ARCHITECTURE 7 step 8; blueprint 9.8 TypedFact and Block; AC-ANS-16): the typed layer is built
// from the scope's own rows whatever moment was inferred and the template only orders it (the diagnosis of
// 2026-09-07, rank 1), the block order per template is the one the golden set pins, every block is cited, a block
// with no evidence is omitted, every value is a row's own column with the sheet's own qualifier, every item carries
// its row's own identity (rank 4), the procedure is bound to the question's task (rank 10), the permit block renders
// only the cited lesson's own permit_lines and leads a documented bypass (rank 17), a text-valued datasheet row
// renders when the question names its field (rank 20), the readiness template serves the last proof test per class,
// and the reading template's ladder omits the relief layer at a vibration reading. The query module is the in-memory
// fake over the synthetic asset.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Block, type Citation } from "@/contracts/generated/evidence_packet";
import { db } from "@/db/client";
import { LESSON_1, LESSON_2, PERMIT_LINE_1, PERMIT_LINE_OTHER_LESSON, SEQ, STEP_TEXTS, TAG, opls, resetAsset, spans } from "../../tests/fixtures/answer/asset";
import { citationOf } from "./retrieve";
import {
  BLOCK_LABEL,
  BLOCK_ORDER,
  BYPASS_ORDER,
  DEFAULT_ORDER,
  blockOf,
  bypassBlocks,
  contradictionsOf,
  lessonIdIn,
  orderFor,
  typedFacts,
  variableOf,
  withBypassBlocks,
} from "./templates";
import { procedureOf } from "./permit";
import type { InterlockRowItem, LadderItem, LessonItem, Retrieval, Scope, Template, WorkOrderItem } from "./types";

vi.mock("@/db/queries/retrieval", async () => (await import("../../tests/fixtures/answer/asset")).fakeQueries);

const scope: Scope = { tags: [TAG], instrument_tags: [], document_ids: [], revision_ids: [], basis: [], family_ids: [] };
const withInstrument: Scope = { ...scope, instrument_tags: ["VSHH-9901"] };
const EMPTY: Scope = { tags: [], instrument_tags: [], document_ids: [], revision_ids: [], basis: [], family_ids: [] };

function lessonRetrieval(): Retrieval {
  const title = spans.find((s) => s.spanId === "sp-opl1-t");
  if (title === undefined) throw new Error("no lesson title span");
  return { evidence: [citationOf(title, [])], chunks: [] };
}

/** The citation an item carries: its own, its fact's source, its source, or (a ladder) every stated layer's source. */
function citationsOfItem(item: unknown): Citation[] {
  const o = item as { citation?: Citation | null; fact?: { source: Citation }; source?: Citation; layers?: Record<string, { source: Citation } | null> };
  if (o.citation) return [o.citation];
  if (o.fact) return [o.fact.source];
  if (o.source) return [o.source];
  if (o.layers) return Object.values(o.layers).flatMap((l) => (l ? [l.source] : []));
  return [];
}

/**
 * Every block is contract-valid, cited, non-empty, labelled and numbered by its position in the one order the
 * template produces: the moment's own kinds first, then the rest of the typed layer in the default order.
 */
function expectWellFormed(blocks: Block[], template: Template | null): void {
  const order = orderFor(template);
  const kinds = blocks.map((b) => b.kind);
  expect(kinds).toEqual(order.filter((k) => kinds.includes(k)));
  for (const b of blocks) {
    expect(() => Block.parse(b)).not.toThrow();
    expect(b.order).toBe(order.indexOf(b.kind) + 1);
    expect(b.label).toBe(BLOCK_LABEL[b.kind]);
    expect(b.items.length).toBeGreaterThan(0);
    for (const item of b.items) expect(citationsOfItem(item).length, `${b.kind} item is cited`).toBeGreaterThan(0);
  }
}

/** The kinds the moment leads with, in the pinned order, as far as the scope's rows support them. */
function expectLeadsWith(blocks: Block[], template: Template): void {
  const kinds = blocks.map((b) => b.kind);
  const lead = BLOCK_ORDER[template].filter((k) => kinds.includes(k));
  expect(kinds.slice(0, lead.length)).toEqual(lead);
}

beforeEach(() => {
  resetAsset();
});

describe("the block orders (AC-ANS-16)", () => {
  it("pins the four moment orders and the bypass order", () => {
    expect(BLOCK_ORDER).toEqual({
      readiness: ["permissives", "proof_tests", "standing_bypasses", "steps", "permit"],
      trip: ["initiator_row", "effects", "reset_note", "permissives", "related_work_orders", "causal_chain", "lessons"],
      job: ["datasheet_limits", "bom_parts", "related_work_orders", "steps", "permit", "functions_out_of_service", "return_to_service"],
      reading: ["ladder", "documented_response", "precedent"],
    });
    expect(BYPASS_ORDER).toEqual(["permit", "steps", "functions_out_of_service"]);
  });

  it("blockOf omits an empty block and a kind outside the order; otherwise the order is the position in the template", () => {
    expect(blockOf("permit", BLOCK_ORDER.job, [])).toBeNull();
    expect(blockOf("ladder", BLOCK_ORDER.job, [{}])).toBeNull();
    expect(blockOf("permit", BLOCK_ORDER.job, [{ text: "x" }])).toEqual({ kind: "permit", order: 5, label: BLOCK_LABEL.permit, items: [{ text: "x" }] });
  });

  it("no asset in scope: no facts, no blocks, no procedure", async () => {
    expect(await typedFacts(db, EMPTY, "trip", { question: "Why did GA-9901B trip?" })).toEqual({ typed_facts: [], blocks: [], procedure: null, contradictions: [] });
  });
});

describe("job", () => {
  it("renders limits, area classification, Ex protection, service, BOM parts, work orders, steps, permit, functions out of service and return to service, in that order", async () => {
    const out = await typedFacts(db, scope, "job", { question: "Which job steps replace the coupling element on GA-9901A?", retrieval: lessonRetrieval() });
    expect(out.blocks.map((b) => b.kind).slice(0, BLOCK_ORDER.job.length)).toEqual([...BLOCK_ORDER.job]);
    expectWellFormed(out.blocks, "job");
    const limits = out.blocks.find((b) => b.kind === "datasheet_limits");
    expect(out.typed_facts.map((f) => f.label)).toEqual(["design: Design pressure", "vibration: Vibration normal", "header: Area classification", "header: Ex protection", "header: Service", "design: PSV set pressure", "design: Design pressure"]);
    expect(limits?.items).toEqual(out.typed_facts);
    for (const f of out.typed_facts) expect(f.source_class).toBe("datasheet_param");
    const parts = out.blocks.find((b) => b.kind === "bom_parts");
    expect(parts?.items).toEqual([expect.objectContaining({ wo_number: "WO-990010", part_string: "coupling element", status: "matched", item_no: 12, description: "Coupling element", material: "Polyurethane", quantity: "1", citation: expect.objectContaining({ span_id: "sp-ga-1" }) })]);
    const wos = out.blocks.find((b) => b.kind === "related_work_orders");
    expect(wos?.items.map((w) => (w as { wo_number: string }).wo_number)).toEqual(["WO-990010"]);
    const functions = out.blocks.find((b) => b.kind === "functions_out_of_service");
    expect(functions?.items).toEqual([expect.objectContaining({ seq_id: SEQ, effects_through_isolated_element: [{ effect_id: "E1", final_element: "TRIP MOTOR GA-9901A" }] })]);
    const rts = out.blocks.find((b) => b.kind === "return_to_service");
    expect(rts?.items).toEqual([expect.objectContaining({ seq_id: SEQ, permissive_gate: "AND" })]);
  });

  it("the permit block renders only the cited lesson's own permit_lines, above the steps, and the procedure is served verbatim", async () => {
    const out = await typedFacts(db, scope, "job", { question: "Which job steps replace the coupling element on GA-9901A?", retrieval: lessonRetrieval() });
    const permit = out.blocks.find((b) => b.kind === "permit");
    const steps = out.blocks.find((b) => b.kind === "steps");
    expect(permit?.items).toEqual([expect.objectContaining({ text: PERMIT_LINE_1, source_section: 2 })]);
    const own = new Set((opls[0]?.permitLines ?? []).map((l) => l.text));
    for (const item of permit?.items ?? []) expect(own.has((item as { text: string }).text)).toBe(true);
    expect(steps?.items).toHaveLength(3);
    for (const item of steps?.items ?? []) expect((item as { hash_ok: boolean }).hash_ok).toBe(true);
    expect(out.procedure?.opl_id).toBe(LESSON_1);
    expect(out.procedure?.permit_block).toEqual([{ text: PERMIT_LINE_1, span_id: "sp-opl1-p" }]);
    // The golden set pins the job blocks as steps then permit (cases.yaml GS job case); the Procedure of 9.8 keeps
    // permit_block above steps, which is what a verbatim render reads.
    expect([steps?.order, permit?.order]).toEqual([4, 5]);
    expect(Object.keys(out.procedure ?? {})).toEqual(["opl_id", "revision", "permit_block", "steps", "protective_functions_affected"]);
  });

  it("with no lesson cited, the steps and permit blocks are omitted and the functions come from the question's own tags", async () => {
    // The question names the valve only; naming the pump itself would make every effect on the pump an isolated one.
    const out = await typedFacts(db, scope, "job", { question: "Replace the XV-9901 valve: which trips are affected?" });
    expect(out.blocks.map((b) => b.kind)).not.toContain("steps");
    expect(out.blocks.map((b) => b.kind)).not.toContain("permit");
    expect(out.procedure).toBeNull();
    const functions = out.blocks.find((b) => b.kind === "functions_out_of_service");
    expect(functions?.items).toEqual([expect.objectContaining({ effects_through_isolated_element: [{ effect_id: "E2", final_element: "CLOSE XV-9901" }] })]);
    expectWellFormed(out.blocks, "job");
  });
});

describe("readiness", () => {
  it("renders the permissives, the last proof test per class and the standing bypasses; no steps or permit without a cited lesson", async () => {
    const out = await typedFacts(db, scope, "readiness", { question: "Is GA-9901A ready to start tonight: permissives and last proof test?" });
    expect(out.blocks.map((b) => b.kind).slice(0, 3)).toEqual(["permissives", "proof_tests", "standing_bypasses"]);
    expectWellFormed(out.blocks, "readiness");
    expectLeadsWith(out.blocks, "readiness");
    const tests = out.blocks.find((b) => b.kind === "proof_tests");
    expect(tests?.items.map((t) => (t as { wo_number: string; test_class: string; completion_date: string }).wo_number)).toEqual(["WO-990003", "WO-990001"]);
    expect(JSON.stringify(tests)).not.toContain("WO-990002"); // the older test of the same class, never the last
    expect(out.typed_facts).toEqual([
      expect.objectContaining({ label: "Last Calibration proof test (VSHH-9901)", value_text: "2025-05-01", unit: "date", qualifier: "Pass", source_class: "proof_test" }),
      expect.objectContaining({ label: `Last SIS proof test (${SEQ})`, value_text: "2025-03-01", unit: "date", qualifier: "Pass", source_class: "proof_test" }),
    ]);
    const bypasses = out.blocks.find((b) => b.kind === "standing_bypasses");
    expect(bypasses?.items).toEqual([expect.objectContaining({ n: 2, standing_bypass_state: "bypassed in DCS since 2025-01-10" })]);
    expect(out.blocks.find((b) => b.kind === "permissives")?.items).toHaveLength(2);
  });
});

describe("trip", () => {
  it("renders the initiator row, the effects, the reset note, then the permissives, the work orders, the chain and the lessons", async () => {
    // The pump tag is a content term, so a question naming it matches every lesson title; the initiator alone selects.
    const out = await typedFacts(db, withInstrument, "trip", { question: "Why did it trip on VSHH-9901?" });
    expect(out.blocks.map((b) => b.kind).slice(0, BLOCK_ORDER.trip.length)).toEqual([...BLOCK_ORDER.trip]);
    expectWellFormed(out.blocks, "trip");
    const initiator = out.blocks.find((b) => b.kind === "initiator_row");
    expect(initiator?.items).toHaveLength(1);
    expect(out.typed_facts).toEqual([
      expect.objectContaining({ label: "R1 High-high vibration (VSHH-9901)", value_text: "7.1", value_num: 7.1, unit: "mm/s", comparator: ">", qualifier: "Note 1: Trip set points are training values.", source_class: "ce_row" }),
    ]);
    expect(out.typed_facts[0]?.source.span_id).toBe("sp-il-1");
    expect(out.blocks.find((b) => b.kind === "effects")?.items).toEqual([expect.objectContaining({ row_id: "R1", effects_basis: "marked X in the sheet" })]);
    expect(out.blocks.find((b) => b.kind === "reset_note")?.items).toEqual([expect.objectContaining({ n: 2, text: expect.stringContaining("manual reset") })]);
    const wos = (out.blocks.find((b) => b.kind === "related_work_orders")?.items ?? []).map((w) => (w as { wo_number: string }).wo_number);
    expect(wos).toContain("WO-990010");
    expect(wos).not.toContain("WO-990011");
    expect(wos).not.toContain("WO-990002"); // no workbook span, so never cited
    expect(out.blocks.find((b) => b.kind === "causal_chain")?.items).toEqual([expect.objectContaining({ id: "cl-1", from_wo: "WO-990011", to_wo: "WO-990010", mechanism_noun: "misalignment" })]);
    expect(out.blocks.find((b) => b.kind === "lessons")?.items).toEqual([expect.objectContaining({ opl_id: LESSON_1, machine_drafted: false, approver_alias: "APR-01" })]);
  });
});

describe("reading", () => {
  it("a vibration reading renders the ladder with its alarm source class and omits the relief layer, then the documented response and the precedent", async () => {
    const out = await typedFacts(db, scope, "reading", { question: "What is the vibration reading on GA-9901A right now?" });
    expect(out.blocks.map((b) => b.kind).slice(0, 3)).toEqual(["ladder", "documented_response", "precedent"]);
    expectWellFormed(out.blocks, "reading");
    expectLeadsWith(out.blocks, "reading");
    const ladder = out.blocks.find((b) => b.kind === "ladder")?.items[0] as LadderItem;
    expect(ladder.variable).toBe("vibration");
    expect(ladder.pressure).toBe(false);
    expect(ladder.layers.normal).toMatchObject({ value_text: "2.0", unit: "mm/s", source_class: "datasheet_param" });
    expect(ladder.layers.alarm).toMatchObject({ value_text: "4.5", unit: "mm/s", source_class: "ce_row" });
    expect(ladder.layers.trip).toMatchObject({ value_text: "7.1", unit: "mm/s", source_class: "ce_row" });
    expect(ladder.layers.relief).toBeNull();
    expect(ladder.alarm_source_class).toBe("alarm row R2 of SYN-IL-GA-9901A");
    expect(ladder.classes_read).toEqual(["datasheet", "interlock"]);
    expect(out.typed_facts.map((f) => f.value_text)).toEqual(["2.0", "4.5", "7.1"]);
    expect(out.blocks.find((b) => b.kind === "documented_response")?.items).toEqual([expect.objectContaining({ opl_id: LESSON_1, n: 1, quoted_wo_number: "WO-990010", truncated: false })]);
    expect(out.blocks.find((b) => b.kind === "precedent")?.items).toEqual([expect.objectContaining({ family_id: "FF-01", member_wo_numbers: ["WO-990010"], review_status: "reviewed" })]);
  });

  it("a pressure reading carries the relief layer from the sheet's mechanical row", async () => {
    const out = await typedFacts(db, scope, "reading", { question: "What is the pressure reading on GA-9901A today?" });
    const ladder = out.blocks.find((b) => b.kind === "ladder")?.items[0] as LadderItem;
    expect(ladder.pressure).toBe(true);
    expect(ladder.layers.normal).toMatchObject({ value_text: "8.5", unit: "barg" });
    expect(ladder.layers.alarm).toBeNull();
    expect(ladder.layers.trip).toMatchObject({ value_text: "1.2", unit: "barg", comparator: "<" });
    expect(ladder.layers.relief).toMatchObject({ value_text: "10", unit: "barg", source_class: "ce_row" });
  });

  it("variableOf reads the instrument prefix first, then the question's word in either language", () => {
    expect(variableOf("What is the reading?", ["PSLL-9901"])).toBe("pressure");
    expect(variableOf("Berapa getaran pompa?", [])).toBe("vibration");
    expect(variableOf("What is the reading?", [])).toBeNull();
  });
});

// The diagnosis of 2026-09-07, rank 1: the moment used to gate the existence of the typed layer, so a question that
// inferred no template emitted no block, no procedure and almost no fact. The layer is the scope's rows; the
// template only orders them.
describe("no moment: the typed layer still renders, in the default order", () => {
  const QUESTION = "Why did it trip on VSHH-9901?";

  it("builds the blocks, the facts and the procedure from the scope's rows with no template at all", async () => {
    const out = await typedFacts(db, withInstrument, null, { question: QUESTION });
    expect(out.blocks.length).toBeGreaterThan(0);
    expectWellFormed(out.blocks, null);
    expect(out.blocks.map((b) => b.kind)).toEqual(DEFAULT_ORDER.filter((k) => out.blocks.some((b) => b.kind === k)));
    // The row the question's own tag names leads the facts, then the values of every block of the default order.
    expect(out.typed_facts[0]).toMatchObject({ label: "R1 High-high vibration (VSHH-9901)", value_text: "7.1", source_class: "ce_row" });
    expect(out.typed_facts.length).toBeGreaterThan(1);
    expect(out.procedure?.opl_id).toBe(LESSON_1);
  });

  it("the template orders the same rows and never removes one: every block a moment renders is rendered without it, item for item", async () => {
    const none = await typedFacts(db, withInstrument, null, { question: QUESTION });
    const trip = await typedFacts(db, withInstrument, "trip", { question: QUESTION });
    expect(trip.blocks.length).toBeGreaterThan(0);
    for (const b of trip.blocks) {
      const same = none.blocks.find((x) => x.kind === b.kind);
      expect(same?.items, `${b.kind} renders without a template`).toEqual(b.items);
    }
    expect(trip.blocks.map((b) => b.kind).slice(0, BLOCK_ORDER.trip.length)).toEqual([...BLOCK_ORDER.trip]);
    expect(orderFor("trip")).toEqual([...BLOCK_ORDER.trip, ...DEFAULT_ORDER.filter((k) => !BLOCK_ORDER.trip.includes(k))]);
    expect(orderFor(null)).toEqual([...DEFAULT_ORDER]);
    // Every kind of 9.8 appears exactly once in the default order, so no kind can be lost by ordering.
    expect(new Set(DEFAULT_ORDER).size).toBe(DEFAULT_ORDER.length);
    for (const template of ["readiness", "trip", "job", "reading"] as const) {
      for (const kind of BLOCK_ORDER[template]) expect(DEFAULT_ORDER).toContain(kind);
    }
  });
});

// The diagnosis of 2026-09-07, rank 4: a block item carried the row's metadata but not the row's own sentence or
// identity, so the reader was handed a citation to a document nobody could read back.
describe("a block item carries its row's own identity", () => {
  it("an interlock row and its effects state the sheet's own SIL as text", async () => {
    const out = await typedFacts(db, withInstrument, "trip", { question: "Why did it trip on VSHH-9901?" });
    const row = out.blocks.find((b) => b.kind === "initiator_row")?.items[0] as InterlockRowItem;
    expect(row).toMatchObject({ row_id: "R1", row_kind: "trip", seq_id: SEQ, initiator: "High-high vibration", instrument_tag: "VSHH-9901", voting: "1oo2", sil_text: "SIL 1", setpoint_text: "7.1" });
    expect(out.blocks.find((b) => b.kind === "effects")?.items[0]).toMatchObject({ row_id: "R1", sil_text: "SIL 1", initiator: "High-high vibration" });
  });

  it("a work order carries its four narrative fields", async () => {
    const out = await typedFacts(db, withInstrument, "trip", { question: "Why did it trip on VSHH-9901?" });
    const items = (out.blocks.find((b) => b.kind === "related_work_orders")?.items ?? []) as WorkOrderItem[];
    const wo = items.find((w) => w.wo_number === "WO-990010");
    expect(wo).toMatchObject({
      problem_description: "Coupling element worn, high vibration VSHH-9901",
      root_cause: "misalignment",
      corrective_action: "Replaced coupling element",
      spare_parts_used: "coupling element",
      report_date: "2025-02-10",
      work_type: "Corrective",
      discipline: "Mechanical",
      breakdown_kind: "unplanned",
      closeout_complete: true,
      related_interlock: SEQ,
    });
  });

  it("a lesson carries its title, its classification and its own sections", async () => {
    const out = await typedFacts(db, withInstrument, "trip", { question: "Why did it trip on VSHH-9901?" });
    const lesson = out.blocks.find((b) => b.kind === "lessons")?.items[0] as LessonItem;
    expect(lesson).toMatchObject({
      opl_id: LESSON_1,
      title: "Coupling element inspection and replacement GA-9901A",
      classification: "Basic Knowledge",
      aspect: "Reliability",
      discipline: "Mechanical",
      related_interlock_text: `${SEQ} (VSHH-9901)`,
      machine_drafted: false,
      approver_alias: "APR-01",
    });
    expect(lesson.sections).toEqual([{ n: 1, heading: "Purpose", body_text: "A worn coupling element raises vibration at VSHH-9901 and ends in a trip." }]);
    expect(lesson.footer).toMatchObject({ prepared_by: "PRP-01", reviewed_by_alias: "REV-01", approved_by_alias: "APR-01", date_of_sharing: "2025-06-01" });
  });
});

// The diagnosis of 2026-09-07, rank 10: the procedure was bound to whatever retrieval ranked first, so a question
// about one task was answered with another task's steps.
describe("the procedure is bound to the question's own task", () => {
  it("the lesson whose title names the task wins over the lesson retrieval ranked first", async () => {
    const out = await typedFacts(db, scope, "job", { question: "Which steps line up the seal flush before a start on GA-9901A?", retrieval: lessonRetrieval() });
    expect(out.procedure?.opl_id).toBe(LESSON_2);
    expect(out.blocks.find((b) => b.kind === "permit")?.items).toEqual([expect.objectContaining({ text: PERMIT_LINE_OTHER_LESSON })]);
    // The other lesson's steps are never served under this question, whatever the retrieval order was.
    expect(JSON.stringify(out.procedure)).not.toContain(STEP_TEXTS[0]);
  });

  it("a question naming a lesson by its id is served that lesson, before any ranking", async () => {
    expect(lessonIdIn(`Render ${LESSON_2} verbatim.`)).toBe(LESSON_2);
    expect(lessonIdIn("Which steps replace the coupling element?")).toBeNull();
    const out = await typedFacts(db, scope, "job", { question: `Render ${LESSON_2} verbatim.`, retrieval: lessonRetrieval() });
    expect(out.procedure?.opl_id).toBe(LESSON_2);
    const byCaller = await typedFacts(db, scope, "job", { question: "Which steps replace the coupling element on GA-9901A?", opl_id: LESSON_2 });
    expect(byCaller.procedure?.opl_id).toBe(LESSON_2);
  });
});

// The diagnosis of 2026-09-07, rank 20: a text-valued datasheet row is neither a limit nor a header field the lane
// always serves, so a material, a fail action or a service reached no reader at all.
describe("a text-valued datasheet row", () => {
  const packing = { label: "materials: Packing", value_text: "Graphite braided", value_num: null, unit: null, source_class: "datasheet_param" };

  it("renders when the question's own terms name its field", async () => {
    const out = await typedFacts(db, scope, null, { question: "What is the packing material of GA-9901A?" });
    expect(out.blocks.find((b) => b.kind === "datasheet_limits")?.items).toContainEqual(expect.objectContaining(packing));
  });

  it("stays out when the question names another field", async () => {
    const out = await typedFacts(db, scope, null, { question: "What is the design pressure of GA-9901A?" });
    const items = out.blocks.find((b) => b.kind === "datasheet_limits")?.items ?? [];
    expect(items).not.toContainEqual(expect.objectContaining(packing));
    expect(items.length).toBeGreaterThan(0);
  });
});

describe("the contradictions and the bypass blocks", () => {
  it("the datasheet's own contradiction is reported with both readings and the governing document (GS-21)", async () => {
    const out = await typedFacts(db, scope, "job", { question: "What is the design pressure of GA-9901A?" });
    expect(out.contradictions).toEqual([
      {
        subject: `${TAG} Design pressure`,
        readings: [
          { text: "8.5", citation: expect.objectContaining({ span_id: "sp-ds-1" }) },
          { text: "8.0", citation: expect.objectContaining({ span_id: "sp-ds-7" }) },
        ],
        governing_document: expect.objectContaining({ span_id: "sp-ds-1" }),
      },
    ]);
    expect(contradictionsOf({ params: [], sources: { spans: new Map(), findings: new Map() } })).toEqual([]);
  });

  it("bypassBlocks renders the permit above the steps, then the functions out of service, each block cited", async () => {
    const bundle = await procedureOf(db, LESSON_1);
    if (bundle === null) throw new Error("no bundle");
    const blocks = bypassBlocks(bundle);
    expect(blocks.map((b) => [b.kind, b.order])).toEqual([
      ["permit", 1],
      ["steps", 2],
      ["functions_out_of_service", 3],
    ]);
    for (const b of blocks) for (const item of b.items) expect(citationsOfItem(item).length).toBeGreaterThan(0);
  });

  // AC-ANS-15 and the diagnosis of 2026-09-07, rank 17: the documented-bypass block shape was dead code, so the
  // served lesson reached the reader with its steps above its permit lines.
  it("a documented bypass leads with the permit above the steps and renumbers the typed layer after them", async () => {
    const bundle = await procedureOf(db, LESSON_1, ["VSHH-9901"]);
    if (bundle === null) throw new Error("no bundle");
    const rest = (await typedFacts(db, scope, null, { question: "How is the standing bypass of GA-9901A documented?", opl_id: LESSON_1 })).blocks;
    expect(rest.map((b) => b.kind)).toContain("steps");
    const blocks = withBypassBlocks(bundle, rest);
    const kinds = blocks.map((b) => b.kind);
    expect(kinds.slice(0, BYPASS_ORDER.length)).toEqual([...BYPASS_ORDER]);
    expect(kinds.indexOf("permit")).toBeLessThan(kinds.indexOf("steps"));
    expect(blocks.map((b) => b.order)).toEqual(blocks.map((_b, i) => i + 1));
    // No kind is served twice: the typed layer's own permit, steps and functions blocks give way to the bypass's.
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(blocks.find((b) => b.kind === "permit")?.items).toEqual([expect.objectContaining({ text: PERMIT_LINE_1 })]);
    expect(blocks.find((b) => b.kind === "steps")?.items.map((s) => (s as { text: string }).text)).toEqual([...STEP_TEXTS]);
    for (const b of blocks) for (const item of b.items) expect(citationsOfItem(item).length, `${b.kind} item is cited`).toBeGreaterThan(0);
  });
});
