// The verbatim check (blueprint 9.16 AG-3 rule "sections 1, 2, 3, 4 and 6 may not reproduce a work-order narrative
// field verbatim", ARCHITECTURE 8.2, AC-LOOP-04). The rule is the harness rule of coverage.py verbatim(): a
// canonical narrative field of at least VERBATIM_MIN_CHARS characters found as an exact substring of the composed
// strict text. Here the strict text is composed from the draft's own fields of sections 1, 2, 3, 4 and 6 in
// (section, ordinal) order joined by one space, so a reproduction split across two adjacent fields is caught too;
// the violation names the field and the section, which is what blocks the draft. Section 5 is the troubleshooting
// table and quotes rows with their work-order ids, so it is outside the composed strict text and never a violation.
// Pure: no database, no gateway, no corpus text.
import { describe, expect, it } from "vitest";
import { VERBATIM_MIN_CHARS, verbatimViolations } from "./verbatim";
import { NARRATIVE_FIELDS, WORK_ORDERS, field, slotField } from "../../tests/fixtures/drafting";

const wo = WORK_ORDERS[0]!;
const ROOT_CAUSE = wo.root_cause;
const STRICT_SECTIONS = [1, 2, 3, 4, 6] as const;

describe("a work-order narrative reproduced in the composed strict text", () => {
  it("is a violation that names the field, the section, the work order and the narrative field (AC-LOOP-04)", () => {
    const offender = field({ section: 2, text: `Background: ${ROOT_CAUSE}` });
    const [violation, ...rest] = verbatimViolations([offender, field({ section: 1, text: "A line of its own." })], WORK_ORDERS);

    expect(rest).toEqual([]);
    expect(violation).toMatchObject({ field_id: offender.id, section: 2, wo_number: wo.wo_number, wo_field: "root_cause" });
    expect(violation?.text).toContain(offender.id);
    expect(violation?.text).toContain("2");
    expect(violation?.text).toContain(wo.wo_number);
    expect(violation?.text).toContain("root_cause");
  });

  it.each(STRICT_SECTIONS)("is caught in section %i, the five strict sections of the recipe", (section) => {
    const violations = verbatimViolations([field({ section, text: ROOT_CAUSE })], WORK_ORDERS);
    expect(violations.map((v) => v.section)).toEqual([section]);
  });

  it.each(NARRATIVE_FIELDS)("is caught for the %s field of the record", (name) => {
    const violations = verbatimViolations([field({ section: 1, text: `Note. ${wo[name]}` })], WORK_ORDERS);
    expect(violations.map((v) => v.wo_field)).toEqual([name]);
  });

  it("is caught when it straddles two adjacent fields, attributed to the field the match starts in", () => {
    const head = "The coupling element had hardened and";
    const tail = ROOT_CAUSE.slice(head.length + 1);
    expect(`${head} ${tail}`).toBe(ROOT_CAUSE);
    const first = field({ section: 1, ordinal: 1, text: `Context. ${head}` });
    const second = field({ section: 1, ordinal: 2, text: tail });

    const violations = verbatimViolations([second, first], WORK_ORDERS); // unordered input, composed by (section, ordinal)
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ field_id: first.id, section: 1, wo_field: "root_cause" });
  });

  it("is caught through the canonical form: a line break inside the reproduction is still the same text", () => {
    const broken = ROOT_CAUSE.replace(" beyond ", "\n   beyond\t");
    const violations = verbatimViolations([field({ section: 6, text: broken })], WORK_ORDERS);
    expect(violations).toHaveLength(1);
  });

  it("reports one violation per field and narrative field, so a field reproducing two narratives names both", () => {
    const offender = field({ section: 3, text: `${wo.problem_description} ${wo.corrective_action}` });
    const violations = verbatimViolations([offender], WORK_ORDERS);
    expect(violations.map((v) => v.wo_field).sort()).toEqual(["corrective_action", "problem_description"]);
    expect(new Set(violations.map((v) => v.field_id))).toEqual(new Set([offender.id]));
  });
});

describe("what the rule allows", () => {
  it("allows a section 5 row that quotes the record with its work-order id (the troubleshooting table)", () => {
    const quote = field({ section: 5, text: `${wo.wo_number}: ${ROOT_CAUSE}` });
    expect(verbatimViolations([quote], WORK_ORDERS)).toEqual([]);
  });

  it("allows a narrative shorter than VERBATIM_MIN_CHARS canonical characters, quoted anywhere", () => {
    const short = WORK_ORDERS[2]!;
    expect(short.root_cause.length).toBeLessThan(VERBATIM_MIN_CHARS);
    expect(VERBATIM_MIN_CHARS).toBe(20);
    expect(verbatimViolations([field({ section: 1, text: `Root cause. ${short.root_cause}` })], WORK_ORDERS)).toEqual([]);
  });

  it("allows a rewrite: the same facts in other words are not an exact substring", () => {
    const rewrite = field({ section: 2, text: "The coupling element hardened in service and cracked before the next inspection." });
    expect(verbatimViolations([rewrite], WORK_ORDERS)).toEqual([]);
  });

  it("allows a case change, because the canonical form keeps case (9.2)", () => {
    expect(verbatimViolations([field({ section: 2, text: ROOT_CAUSE.toUpperCase() })], WORK_ORDERS)).toEqual([]);
  });

  it("allows a slot: its text is the fixed literal and carries no narrative", () => {
    expect(verbatimViolations([slotField(4)], WORK_ORDERS)).toEqual([]);
  });

  it("returns an empty list for a draft that reproduces nothing, and for no work orders at all", () => {
    const clean = STRICT_SECTIONS.map((section) => field({ section, text: `Section ${section} written from the record.` }));
    expect(verbatimViolations(clean, WORK_ORDERS)).toEqual([]);
    expect(verbatimViolations([field({ section: 2, text: ROOT_CAUSE })], [])).toEqual([]);
  });
});
