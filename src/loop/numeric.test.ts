// The numeric check (blueprint section 1 guarantee "no number is generated", 9.6 DraftField.numeric_provenance,
// 9.16 AG-3 rule "a numeral appears only with a numeric_provenance entry"; ARCHITECTURE 8.2, AC-LOOP-05). Every
// numeral of a non-slot element must carry a numeric_provenance entry naming that numeral, its source_ref and its
// unit; an entry without a source_ref is not provenance. A numeral is a whole token of the canonical text carrying
// a digit and not shaped like a tag or a document number, the same reading the answer lane's C3 gate applies
// (src/gates/g2/c3.ts tokensOf), so GA-9901A and OPL-GA-9901A-01 are never numerals on either side. A slot element
// is exempt: the engineer fills it, the drafter never does. Pure: no database, no gateway, no corpus text.
import { describe, expect, it } from "vitest";
import { numeralsOf, numericViolations } from "./numeric";
import { DATASHEET_PARAM, SET_POINT_PROVENANCE, field, slotField } from "../../tests/fixtures/drafting";
import { SLOT_TEXT } from "@/lib/fixed-strings";

const SET_POINT_TEXT = "The alarm set point is 7.1 mm/s.";

describe("numeralsOf", () => {
  it("reads a decimal, an integer, a date and a voting token as numerals", () => {
    expect(numeralsOf("The set point is 7.1 mm/s, tested 2025-03-04 at 1oo2 after 18 months.")).toEqual(
      expect.arrayContaining(["7.1", "2025-03-04", "1oo2", "18"]),
    );
  });

  it("reads no numeral out of an equipment tag, a work-order number or a lesson id", () => {
    expect(numeralsOf("GA-9901A carries OPL-GA-9901A-01 and WO-990001.")).toEqual([]);
  });

  it("reads no numeral out of a sentence without one, and none out of the slot literal", () => {
    expect(numeralsOf("Replace the coupling element and realign the driver.")).toEqual([]);
    expect(numeralsOf(SLOT_TEXT)).toEqual([]);
  });
});

describe("a numeral without numeric_provenance", () => {
  it("blocks, naming the numeral, the field and the section (AC-LOOP-05)", () => {
    const offender = field({ section: 3, text: "Replace the coupling element every 18 months." });
    const [violation, ...rest] = numericViolations([offender]);

    expect(rest).toEqual([]);
    expect(violation).toMatchObject({ field_id: offender.id, section: 3, numeral: "18" });
    expect(violation?.text).toContain("18");
    expect(violation?.text).toContain(offender.id);
  });

  it("blocks when the entry names another numeral than the one written", () => {
    const offender = field({ section: 3, text: SET_POINT_TEXT, numeric_provenance: [{ numeral: "7.2", source_ref: DATASHEET_PARAM.id, unit: "mm/s" }] });
    expect(numericViolations([offender]).map((v) => v.numeral)).toEqual(["7.1"]);
  });

  it("blocks when the entry carries an empty source_ref: a numeral without a source is not typed", () => {
    const offender = field({ section: 3, text: SET_POINT_TEXT, numeric_provenance: [{ numeral: "7.1", source_ref: "", unit: "mm/s" }] });
    expect(numericViolations([offender]).map((v) => v.numeral)).toEqual(["7.1"]);
  });

  it("reports each unsourced numeral of a field once, in the order written", () => {
    const offender = field({ section: 6, text: "Torque to 120 Nm, then re-check at 120 Nm after 24 hours." });
    expect(numericViolations([offender]).map((v) => v.numeral)).toEqual(["120", "24"]);
  });

  it("checks every section, section 5 included: the rule is about the element, not the section", () => {
    const violations = numericViolations([field({ section: 5, text: "Vibration above 7.1 mm/s on the driven end." })]);
    expect(violations.map((v) => v.section)).toEqual([5]);
  });
});

describe("what the rule allows", () => {
  it("passes a numeral whose entry names it with its source_ref and unit (the typed-value contrast case)", () => {
    const typed = field({ section: 3, text: SET_POINT_TEXT, numeric_provenance: [SET_POINT_PROVENANCE] });
    expect(numericViolations([typed])).toEqual([]);
  });

  it("passes a slot element: the exemption is the is_slot flag, and the drafter never writes the slot's text", () => {
    expect(numericViolations([slotField(4)])).toEqual([]);
    const wrong = field({ section: 4, text: "Interval: 18 months.", is_slot: true, provenance: { type: "slot", ref: null, span_id: null } });
    expect(numericViolations([wrong])).toEqual([]);
  });

  it("passes an element with no numeral, and an empty field list", () => {
    expect(numericViolations([field({ section: 1, text: "Isolate the driver before opening the coupling guard." })])).toEqual([]);
    expect(numericViolations([])).toEqual([]);
  });

  it("passes a tag, a work-order number and a lesson id written into the text without any entry", () => {
    expect(numericViolations([field({ section: 2, text: "GA-9901A, WO-990001 and OPL-GA-9901A-01 are named here." })])).toEqual([]);
  });
});
