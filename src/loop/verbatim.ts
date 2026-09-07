// The verbatim check (blueprint 9.16 AG-3 rule "sections 1, 2, 3, 4 and 6 may not reproduce a work-order narrative
// field verbatim"; ARCHITECTURE 8.2; AC-LOOP-04). The rule is the harness rule of coverage.py verbatim(): a
// canonical narrative field of at least VERBATIM_MIN_CHARS characters found as an exact substring of the composed
// strict text. The strict text is the draft's own fields of sections 1, 2, 3, 4 and 6 in (section, ordinal) order
// joined by one space, so a reproduction split across two adjacent fields is caught too and is attributed to the
// field the match starts in. Section 5 is the troubleshooting table, which quotes rows with their work-order ids,
// so it is outside the composed text and never a violation. Pure: no database, no gateway, no corpus text.
import type { DraftField } from "@/contracts/generated/drafts";
import type { WorkOrder } from "@/contracts/generated/operations";
import { canonical } from "@/lib/canonical";

/** harness coverage.py VERBATIM_MIN_CHARS: shorter than this, a shared phrase is not a reproduction. */
export const VERBATIM_MIN_CHARS = 20;

/** The three narrative fields of a work order the rule reads (harness coverage.py NARR). */
export const NARRATIVE_FIELDS = ["problem_description", "root_cause", "corrective_action"] as const;
export type NarrativeField = (typeof NARRATIVE_FIELDS)[number];

/** The five sections the recipe reads strictly; section 5 quotes and is excluded. */
export const STRICT_SECTIONS: readonly DraftField["section"][] = [1, 2, 3, 4, 6];

export type VerbatimViolation = {
  field_id: string;
  section: DraftField["section"];
  wo_number: string;
  wo_field: NarrativeField;
  text: string;
};

type Part = { field: DraftField; start: number };

/** The composed strict text and where each field starts in it. */
function compose(fields: readonly DraftField[]): { text: string; parts: Part[] } {
  const strict = fields
    .filter((f) => STRICT_SECTIONS.includes(f.section))
    .toSorted((a, b) => a.section - b.section || a.ordinal - b.ordinal);
  const parts: Part[] = [];
  let text = "";
  for (const field of strict) {
    if (text !== "") text += " ";
    parts.push({ field, start: text.length });
    text += canonical(field.text);
  }
  return { text, parts };
}

function fieldAt(parts: readonly Part[], index: number): Part | undefined {
  return parts.findLast((p) => p.start <= index);
}

/** One violation per (field, work order, narrative field), named so the block says exactly what was reproduced. */
export function verbatimViolations(
  fields: readonly DraftField[],
  workOrders: readonly WorkOrder[],
): VerbatimViolation[] {
  const { text, parts } = compose(fields);
  if (text === "") return [];

  const violations: VerbatimViolation[] = [];
  for (const wo of workOrders) {
    for (const name of NARRATIVE_FIELDS) {
      const narrative = canonical(wo[name]);
      if (narrative.length < VERBATIM_MIN_CHARS) continue;
      const at = text.indexOf(narrative);
      if (at < 0) continue;
      const part = fieldAt(parts, at);
      if (!part) continue;
      violations.push({
        field_id: part.field.id,
        section: part.field.section,
        wo_number: wo.wo_number,
        wo_field: name,
        text: `Field ${part.field.id} in section ${part.field.section} reproduces the ${name} of ${wo.wo_number} verbatim; sections 1, 2, 3, 4 and 6 describe a record in their own words.`,
      });
    }
  }
  return violations;
}
