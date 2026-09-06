// Procedures and permit lines (blueprint 9.8 Procedure, 9.5 Opl.permit_lines, 9.10; AC-ANS-05, AC-ANS-15): a
// lesson's steps render verbatim under source_hash recomputed in the canonical form, a step that no longer hashes
// or no longer resolves blocks the render with the typed HashMismatch, and the permit block carries only the
// lesson's own permit_lines that resolve to a span of that lesson, nothing generated and nothing from another
// document. The functions a job takes out of service and the return-to-service block come from the sheet rows.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Procedure } from "@/contracts/generated/evidence_packet";
import { db } from "@/db/client";
import { HashMismatch } from "@/lib/errors";
import { DOCUMENTED_BYPASS_NOTICE } from "@/lib/fixed-strings";
import { LESSON_1, PERMIT_LINE_1, PERMIT_LINE_NO_SPAN, PERMIT_LINE_OTHER_LESSON, SEQ, STEP_TEXTS, TAG, opls, resetAsset, state } from "../../tests/fixtures/answer/asset";
import { cite, functionsOutOfService, lessonTags, loadSources, procedureOf, returnToService } from "./permit";

vi.mock("@/db/queries/retrieval", async () => (await import("../../tests/fixtures/answer/asset")).fakeQueries);

const lesson = opls[0];
if (lesson === undefined) throw new Error("no fixture lesson");

beforeEach(() => {
  resetAsset();
});

describe("procedureOf (AC-ANS-05, AC-ANS-15)", () => {
  it("serves every step verbatim under its hash with its span and acceptance criterion, the lesson's title span as the citation", async () => {
    const bundle = await procedureOf(db, LESSON_1);
    if (bundle === null) throw new Error("no bundle");
    expect(() => Procedure.parse(bundle.procedure)).not.toThrow();
    expect(bundle.lesson.oplId).toBe(LESSON_1);
    expect(bundle.citation).toMatchObject({ span_id: "sp-opl1-t", doc_no: LESSON_1, approval_status: "approved", page: 1 });
    expect(bundle.procedure.revision).toBe("-");
    expect(bundle.procedure.steps).toEqual(STEP_TEXTS.map((text, i) => ({ n: i + 1, text, hash_ok: true, span_id: `sp-opl1-s${i + 1}` })));
    expect(bundle.steps.map((s) => [s.n, s.text, s.acceptance_criterion, s.hash_ok, s.citation.span_id])).toEqual([
      [1, STEP_TEXTS[0], null, true, "sp-opl1-s1"],
      [2, STEP_TEXTS[1], null, true, "sp-opl1-s2"],
      [3, STEP_TEXTS[2], "Bolts torqued", true, "sp-opl1-s3"],
    ]);
  });

  it("the permit block renders only the lesson's own permit_lines that resolve to a span of that lesson: nothing from another lesson, nothing unresolved, nothing generated", async () => {
    const bundle = await procedureOf(db, LESSON_1);
    if (bundle === null) throw new Error("no bundle");
    expect(bundle.procedure.permit_block).toEqual([{ text: PERMIT_LINE_1, span_id: "sp-opl1-p" }]);
    expect(bundle.permit).toEqual([{ text: PERMIT_LINE_1, source_section: 2, citation: expect.objectContaining({ span_id: "sp-opl1-p", doc_no: LESSON_1 }) }]);
    const own = new Set(lesson.permitLines.map((l) => l.text));
    for (const item of bundle.permit) expect(own.has(item.text)).toBe(true);
    for (const line of bundle.procedure.permit_block) expect(own.has(line.text)).toBe(true);
    const texts = bundle.permit.map((p) => p.text);
    expect(texts).not.toContain(PERMIT_LINE_OTHER_LESSON);
    expect(texts).not.toContain(PERMIT_LINE_NO_SPAN);
  });

  it("names the protective functions the lesson's own tags take out of service, with the pack's permit route wording", async () => {
    const bundle = await procedureOf(db, LESSON_1);
    if (bundle === null) throw new Error("no bundle");
    expect(bundle.procedure.protective_functions_affected).toEqual([
      { seq_id: SEQ, sil: 1, effects_through_isolated_element: ["E1 TRIP MOTOR GA-9901A"], surviving_effects: ["E2 CLOSE XV-9901"], standing_permissive_defeated: null },
    ]);
    expect(bundle.functions_out_of_service[0]).toMatchObject({ seq_id: SEQ, ce_doc_no: "SYN-IL-GA-9901A", isolated_elements: [TAG, "VSHH-9901"], permit_route: DOCUMENTED_BYPASS_NOTICE, citation: expect.objectContaining({ span_id: "sp-il-1" }) });
  });

  it("a step whose text no longer hashes blocks the render with HashMismatch naming the step, never a paraphrase", async () => {
    const tampered = state.steps[1];
    if (tampered === undefined) throw new Error("no step");
    tampered.actionText = `${tampered.actionText} carefully`;
    const failure = await procedureOf(db, LESSON_1).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(HashMismatch);
    if (!(failure instanceof HashMismatch)) throw new Error("expected HashMismatch");
    expect(failure.integrity).toEqual({ opl_id: LESSON_1, step_n: 2, span_id: "sp-opl1-s2" });
    expect(failure.status).toBe(409);
  });

  it("a step whose span no longer resolves blocks the render the same way", async () => {
    const orphan = state.steps[2];
    if (orphan === undefined) throw new Error("no step");
    orphan.spanId = "sp-gone";
    await expect(procedureOf(db, LESSON_1)).rejects.toMatchObject({ integrity: { opl_id: LESSON_1, step_n: 3, span_id: "sp-gone" } });
  });

  it("an unknown lesson is null", async () => {
    expect(await procedureOf(db, "SYN-OPL-NONE-00")).toBeNull();
  });
});

describe("functionsOutOfService and returnToService (9.8 Procedure.protective_functions_affected, AC-ANS-16 job blocks)", () => {
  it("splits the marked effects by whether their final element names an isolated tag; unmarked effects never appear", async () => {
    const out = await functionsOutOfService(db, [TAG], ["XV-9901"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ seq_id: SEQ, sil: 1, effects_through_isolated_element: [{ effect_id: "E2", final_element: "CLOSE XV-9901" }], surviving_effects: [{ effect_id: "E1", final_element: "TRIP MOTOR GA-9901A" }], standing_permissive_defeated: null });
    expect(JSON.stringify(out)).not.toContain("E3");
  });

  it("an isolation that names a permissive's signal tag defeats that standing permissive, verbatim", async () => {
    const out = await functionsOutOfService(db, [TAG], ["PDI-9901"]);
    expect(out).toHaveLength(1);
    expect(out[0]?.standing_permissive_defeated).toBe("Seal flush established PDI-9901");
    expect(out[0]?.effects_through_isolated_element).toEqual([]);
  });

  it("is empty when nothing is affected, when no tag is isolated, or when no asset is in scope", async () => {
    expect(await functionsOutOfService(db, [TAG], ["ZZ-0000"])).toEqual([]);
    expect(await functionsOutOfService(db, [TAG], [])).toEqual([]);
    expect(await functionsOutOfService(db, [], ["XV-9901"])).toEqual([]);
  });

  it("returnToService lists, per function, the permissives that must be TRUE with their citations and the latched-reset note", async () => {
    const out = await returnToService(db, [TAG]);
    expect(out).toHaveLength(1);
    const item = out[0];
    if (item === undefined) throw new Error("no item");
    expect(item.seq_id).toBe(SEQ);
    expect(item.permissive_gate).toBe("AND");
    expect(item.permissives.map((p) => [p.n, p.text, p.signal_tag, p.standing_bypass_state, p.citation.span_id])).toEqual([
      [1, "Suction valve OPEN ZSO-9901", "ZSO-9901", null, "sp-il-5"],
      [2, "Seal flush established PDI-9901", "PDI-9901", "bypassed in DCS since 2025-01-10", "sp-il-6"],
    ]);
    expect(item.reset_notes).toEqual([{ n: 2, text: "Note 2: A trip is latched and requires a manual reset once the cause has cleared.", citation: expect.objectContaining({ span_id: "sp-il-8" }) }]);
    expect(item.citation.span_id).toBe("sp-il-5");
  });
});

describe("lessonTags and cite", () => {
  it("lessonTags are the instrument and valve tags of the title and related-interlock line, never a SEQ id", () => {
    expect(lessonTags(lesson)).toEqual([TAG, "VSHH-9901"]);
  });

  it("cite resolves a span to its Citation with the document's open findings, and null for an unknown span", async () => {
    const sources = await loadSources(db, ["sp-ds-1", "sp-gone"]);
    expect(cite(sources, "sp-ds-1")).toMatchObject({ span_id: "sp-ds-1", doc_no: "SYN-DS-GA-9901A", integrity_findings: ["IR-03"], superseded: false });
    expect(cite(sources, "sp-gone")).toBeNull();
  });
});
