// The two layers of the frozen coverage recipe (blueprint 9.5; harness/coverage.py:252 `layers`, harness/opl.py
// `strict_text` at 110-121 and `_between` at 30-44). It pins the shape src/coverage/layers.ts must land:
//
//   STRICT_SECTIONS = [1, 2, 3, 4, 6]                     harness/opl.py:105-107, fixtures.method.strict_sections
//   STRICT_CUT_MARKER = "This is sample data ..."         harness/opl.py:27, fixtures.method.strict_cut_marker
//   type LessonText = coverage.Opl & { header_text: string; equipment_name: string }
//   generousText(lesson: LessonText): string              the whole lesson text
//   strictText(lesson: LessonText): string                the rebuilt header fields plus sections 1, 2, 3, 4, 6
//
// Why LessonText carries two strings a `coverage.Opl` row cannot hold, both proved by tests/equality/coverage.test.ts:
//
//   header_text     the lesson's extracted header block, the one chunk of unit_kind "note" the ingestion writes per
//                   lesson. The generous layer is the WHOLE lesson text (harness/coverage.py:252 passes the canonical
//                   `pdftext.opl_texts` through untouched), and the header block is the part of it that no parsed
//                   field reproduces: the form labels and their order. Composing the generous text out of the parsed
//                   fields instead moves the published `all` figure at t = 0.62 from 143 uncovered to 146, which is
//                   AC-LOOP-01's number, and moves four best_ratio values.
//   equipment_name  `equipment.name`, the third of the seven rebuilt header fields of harness/opl.py:104
//                   STRICT_HEAD_FIELDS, whose `equipment` is the equipment NAME and not its tag. Dropping it moves no
//                   strict ratio but moves matched_lesson on WO-240126, WO-240127 and WO-240128 from OPL-EA-5601-06
//                   to OPL-EA-5601-03, and the equality gate compares matched_lesson.
//
// Frozen rules pinned here: the generous text is the header block then every section, each section its heading then
// its body, in ascending section order, with section 5 kept and no cut at the watermark; the strict text is the
// seven rebuilt header fields then sections 1, 2, 3, 4 and 6 in that order, each cut at the watermark; an empty part
// is dropped rather than emitted as a double space, because harness/opl.py:121 filters falsy parts before joining.
import { describe, expect, it } from "vitest";
import { lesson, lessonText, SECTION_HEADINGS, section, SYN } from "../../tests/fixtures/coverage";
import { generousText, STRICT_CUT_MARKER, STRICT_SECTIONS, strictText } from "./layers";

const bodies = {
  1: "Purpose body",
  2: "Safety body",
  3: "Tools body",
  4: "Steps body",
  5: "Troubleshooting body",
  6: "Learning body",
} as const;

const opl = lessonText(SYN.oplId(1), bodies);

describe("the frozen constants", () => {
  it("are sections 1, 2, 3, 4 and 6 and the page watermark (harness/opl.py:27, 105-107)", () => {
    expect(STRICT_SECTIONS).toEqual([1, 2, 3, 4, 6]);
    expect(STRICT_CUT_MARKER).toBe("This is sample data provided for CALIBER purposes only");
  });
});

describe("generousText", () => {
  it("is the header block then every section as its heading and its body, in ascending order", () => {
    expect(generousText(opl)).toBe(
      [
        "ONE POINT LESSON header block",
        `${SECTION_HEADINGS[1]} Purpose body`,
        `${SECTION_HEADINGS[2]} Safety body`,
        `${SECTION_HEADINGS[3]} Tools body`,
        `${SECTION_HEADINGS[4]} Steps body`,
        `${SECTION_HEADINGS[5]} Troubleshooting body`,
        `${SECTION_HEADINGS[6]} Learning body`,
      ].join(" "),
    );
  });

  it("keeps the section headings, whose words are content words of the lesson text", () => {
    // The equality gate proves the headings are load-bearing: dropping them moves WO-240093's generous best_ratio
    // from 0.3333 to 0.375, because a heading's words sit between two bodies and change what one window spans.
    expect(generousText(opl)).toContain(SECTION_HEADINGS[4]);
  });

  it("keeps section 5, the copied-row section the strict layer drops", () => {
    expect(generousText(opl)).toContain("Troubleshooting body");
  });

  it("reads the sections by their number, not by their position in the array", () => {
    const shuffled = { ...opl, sections: [...opl.sections].reverse() };
    expect(generousText(shuffled)).toBe(generousText(opl));
  });

  it("does not cut at the watermark: the generous layer is the whole lesson text", () => {
    const marked = {
      ...opl,
      sections: [section(1, `Purpose body ${STRICT_CUT_MARKER} copied row text`), ...opl.sections.slice(1)],
    };
    expect(generousText(marked)).toContain("copied row text");
    expect(generousText(marked)).toContain(STRICT_CUT_MARKER);
  });

  it("drops an empty header block, heading or body rather than emitting a double space", () => {
    const sparse = { ...lessonText(SYN.oplId(2), { 1: "Purpose body" }, { header_text: "" }), sections: [section(1, "Purpose body", "")] };
    expect(generousText(sparse)).toBe("Purpose body");
  });

  it("does not read the equipment name: only the strict head rebuilds it", () => {
    expect(generousText({ ...opl, equipment_name: "" })).toBe(generousText(opl));
  });
});

describe("strictText", () => {
  it("composes the seven rebuilt header fields then sections 1, 2, 3, 4, 6 (harness/opl.py:104, 119-121)", () => {
    expect(strictText(opl)).toBe(
      [
        opl.opl_id,
        opl.title,
        opl.equipment_name,
        opl.area_unit,
        opl.related_interlock_text,
        opl.pid_ref,
        opl.classification,
        "Purpose body",
        "Safety body",
        "Tools body",
        "Steps body",
        "Learning body",
      ].join(" "),
    );
  });

  it("rebuilds the head from the parsed fields and never from the extracted header block (harness/opl.py:100-102)", () => {
    expect(strictText({ ...opl, header_text: "ONE POINT LESSON header block" })).not.toContain("ONE POINT LESSON");
  });

  it("uses the equipment NAME where harness/opl.py:104 names `equipment`, not the tag", () => {
    // The lesson id embeds the tag, so the tag cannot be excluded by substring; the head opens with id, title, name.
    expect(strictText(opl).startsWith(`${opl.opl_id} ${opl.title} ${SYN.equipmentName} `)).toBe(true);
    expect(strictText({ ...opl, equipment_name: "" })).not.toContain(SYN.equipmentName);
  });

  it("carries no section heading: the strict head is fields, the strict body is bodies", () => {
    expect(strictText(opl)).not.toContain(SECTION_HEADINGS[1]);
    expect(strictText(opl)).not.toContain(SECTION_HEADINGS[4]);
  });

  it("excludes section 5 wherever the extractor placed it (harness/opl.py:107)", () => {
    expect(strictText(opl)).not.toContain("Troubleshooting body");
  });

  it("cuts a section body at the watermark and drops everything after it (harness/opl.py:30-44)", () => {
    const marked = lessonText(SYN.oplId(3), { ...bodies, 4: `Steps body ${STRICT_CUT_MARKER} copied row text` });
    expect(strictText(marked)).toContain("Steps body");
    expect(strictText(marked)).not.toContain("copied row text");
    expect(strictText(marked)).not.toContain(STRICT_CUT_MARKER);
  });

  it("cuts every section, not only the one where the leak happened to land (harness/opl.py:36-44)", () => {
    for (const n of STRICT_SECTIONS) {
      const marked = lessonText(SYN.oplId(4), { [n]: `Body ${STRICT_CUT_MARKER} copied row text` });
      expect(strictText(marked)).not.toContain("copied row text");
    }
  });

  it("drops an empty part rather than emitting a double space (harness/opl.py:121)", () => {
    const sparse = lessonText(SYN.oplId(5), { 1: "Purpose body", 6: "Learning body" });
    expect(strictText(sparse)).toBe(
      [
        sparse.opl_id,
        sparse.title,
        sparse.equipment_name,
        sparse.area_unit,
        sparse.related_interlock_text,
        sparse.pid_ref,
        sparse.classification,
        "Purpose body",
        "Learning body",
      ].join(" "),
    );
  });

  it("accepts a plain contract Opl widened with the two strings, and nothing else", () => {
    const widened = { ...lesson(SYN.oplId(6), bodies), header_text: "", equipment_name: SYN.equipmentName };
    expect(strictText(widened)).toContain("Purpose body");
  });
});
