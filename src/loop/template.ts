// The six-section house template (blueprint 9.5 Opl, 9.16 AG-3 "the six-section house template with header fields";
// ARCHITECTURE 8.2). One object, published to two readers: AG-3 receives it as the `template` member of its
// envelope, and the redliner receives TEMPLATE_RULES as `template_rules`, so the rules the drafter is given and the
// rules the redliner checks are the same text. The headings are the structural labels of the plant's One Point
// Lesson form, which every lesson of the corpus carries and which a published draft must reproduce; the header
// fields are the Opl header of 9.5. Nothing here is drafted content and nothing here is a number.
import type { DraftField } from "@/contracts/generated/drafts";

export type TemplateSection = {
  n: DraftField["section"];
  heading: string;
  purpose: string;
};

export const SECTION_HEADINGS: Readonly<Record<DraftField["section"], string>> = {
  1: "PURPOSE / OBJECTIVE",
  2: "SAFETY PRECAUTIONS",
  3: "TOOLS & MATERIALS REQUIRED",
  4: "DETAILED PROCEDURE / STEPS",
  5: "COMMON PROBLEMS & TROUBLESHOOTING",
  6: "KEY LEARNING POINTS",
};

const SECTIONS: readonly TemplateSection[] = [
  { n: 1, heading: SECTION_HEADINGS[1], purpose: "Why this lesson exists and what the reader will be able to do." },
  { n: 2, heading: SECTION_HEADINGS[2], purpose: "The isolation, permit and protective-function conditions the work runs under, from the interlock rows and the approved lessons." },
  { n: 3, heading: SECTION_HEADINGS[3], purpose: "The tools, spare parts and datasheet values the work needs, each pointing at the evidence item that states it." },
  { n: 4, heading: SECTION_HEADINGS[4], purpose: "The steps in order, one action per element; where the evidence states no value, a slot." },
  { n: 5, heading: SECTION_HEADINGS[5], purpose: "The troubleshooting table: each row quotes its work order and names it in quoted_wo_number." },
  { n: 6, heading: SECTION_HEADINGS[6], purpose: "What the reader must remember, in the reader's own terms." },
];

const HEADER_FIELDS = {
  opl_id: "the lesson id reserved for this draft; never invented",
  title: "the work the lesson teaches, in the plant's own words",
  discipline: "Mechanical, Instrument, Electrical or Process, from the work orders of the cluster",
  equipment_tag: "the cluster's equipment tag, exactly as the evidence spells it",
  area_unit: "the unit the asset sits in, from the evidence",
  related_interlock_text: "the protective function this work touches, from the interlock rows, or None",
  pid_ref: "the P&ID the asset appears on, from the evidence",
  classification: "Basic Knowledge, Improvement or Trouble Case",
  aspect: "the aspect of plant integrity the lesson serves",
} as const;

/** The one object AG-3 receives as `template`. */
export const HOUSE_TEMPLATE = {
  header: HEADER_FIELDS,
  sections: SECTIONS,
} as const;

/** The rules of the house template as text; the redliner reads exactly these as `template_rules` (9.16). */
export const TEMPLATE_RULES: readonly string[] = [
  "the six sections appear once each, in order 1 to 6, under the headings of the house template",
  "every header field of the template is filled, and no header field is invented",
  "every element carries provenance pointing at one evidence item, or is a slot whose text is exactly REQUIRES ENGINEER INPUT",
  "a numeral appears in an element only with a numeric_provenance entry naming that numeral and its source",
  "sections 1, 2, 3, 4 and 6 never reproduce a work-order narrative field verbatim",
  "section 5 quotes the records it uses and names the work order of every troubleshooting row",
  "a protective function, a setpoint, a trip, a voting arrangement or a permissive is never bypassed, inhibited, forced or changed",
  "a permit-controlled action refers to the approved lesson that documents it and carries its permit lines verbatim",
  "the drafter never fills a slot and never writes an SME note",
];

/** The header written when the draft is created, before AG-3 has run; the drafted header replaces it in review. */
export const PROVISIONAL_HEADER = {
  title: (equipmentTag: string) => `Uncovered maintenance work on ${equipmentTag}`,
  classification: "Trouble Case",
  aspect: "Equipment reliability",
} as const;
