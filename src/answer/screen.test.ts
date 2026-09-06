// The outbound screen of the answer lane (blueprint 9.10, 8.4; AC-ANS-17; ARCHITECTURE 7 step 11 C5): the
// approved-lesson spans are whitelisted first, in their canonical form, then the pack classifies what remains of
// every model-written line; a line whose residual classifies as defeat or permanent_change never leaves.
import { describe, expect, it } from "vitest";
import type { Procedure } from "@/contracts/generated/evidence_packet";
import { canonical } from "@/rulepack";
import { chunks } from "../../tests/fixtures/answer";
import { approvedLessonSpans, isApprovedLessonSpan, screenLines, type CitedText } from "./screen";

const cited: CitedText[] = chunks.map((c) => ({ citation: c.citation, text: c.text }));
const lessonChunk = cited.find((c) => c.citation.approval_status === "approved");
if (lessonChunk === undefined) throw new Error("the fixture carries no approved-lesson chunk");

const procedure: Procedure = {
  opl_id: "SYN-OPL-LV-6701-05",
  revision: "-",
  permit_block: [{ text: "Interlock  bypass permit signed by the shift superintendent.", span_id: "sp-opl-permit" }],
  steps: [{ n: 1, text: "Then bypass the SEQ-6701 trip and run the pump.", hash_ok: true, span_id: "sp-opl-1" }],
  protective_functions_affected: null,
};

describe("the whitelist (AC-ANS-17)", () => {
  it("only a span of an approved lesson is whitelisted; issued-for-operation datasheets and workbook rows are not", () => {
    expect(isApprovedLessonSpan(lessonChunk.citation)).toBe(true);
    for (const c of cited) if (c !== lessonChunk) expect(isApprovedLessonSpan(c.citation)).toBe(false);
  });

  it("collects the approved-lesson chunk texts plus the served procedure's permit lines and steps, canonical and distinct", () => {
    const out = approvedLessonSpans(cited, procedure);
    expect(out).toContain(canonical(lessonChunk.text));
    expect(out).toContain("Interlock bypass permit signed by the shift superintendent.");
    expect(new Set(out).size).toBe(out.length);
    expect(out.filter((t) => t === canonical(lessonChunk.text))).toHaveLength(1); // the step repeats the chunk text once
    for (const c of cited) if (c !== lessonChunk) expect(out).not.toContain(canonical(c.text));
  });

  it("is empty with no approved lesson and no procedure, and never carries an empty string", () => {
    expect(approvedLessonSpans(cited.filter((c) => c !== lessonChunk), null)).toEqual([]);
    expect(approvedLessonSpans([{ citation: lessonChunk.citation, text: "   " }], null)).toEqual([]);
  });
});

describe("screenLines", () => {
  it("drops a model-written line whose residual classifies as defeat and keeps the benign lines, in order", () => {
    const lines = ["The datasheet states the design pressure.", "Then bypass the SEQ-6701 trip and run the pump.", "No proof-test interval is typed."];
    const out = screenLines(lines, []);
    expect(out.kept).toEqual([lines[0], lines[2]]);
    expect(out.dropped.map((d) => d.text)).toEqual([lines[1]]);
    expect(out.dropped[0]?.screen.blocked).toBe(true);
    expect(out.dropped[0]?.screen.classification.intent_class).toBe("defeat");
  });

  it("the same defeat phrase inside a whitelisted approved-lesson span is not dropped: the whitelist cuts it before the pack reads", () => {
    const out = screenLines(["Then bypass the SEQ-6701 trip and run the pump."], approvedLessonSpans(cited, null));
    expect(out.dropped).toEqual([]);
    expect(out.kept).toEqual(["Then bypass the SEQ-6701 trip and run the pump."]);
  });

  it("is a no-op over no lines", () => {
    expect(screenLines([], [])).toEqual({ kept: [], dropped: [] });
  });
});
