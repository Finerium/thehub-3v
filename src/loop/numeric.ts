// The numeric check (blueprint section 1 guarantee "no number is generated", 9.6 DraftField.numeric_provenance,
// 9.16 AG-3 rule "a numeral appears only with a numeric_provenance entry"; ARCHITECTURE 8.2; AC-LOOP-05). Every
// numeral of a non-slot element must carry a numeric_provenance entry naming that numeral with a source_ref; an
// entry without a source_ref is not provenance. A slot element is exempt: the engineer fills it, the drafter never
// does. What counts as a numeral is the one reading of the answer lane's C3 gate, whose tokeniser is imported
// rather than copied, so the two "no number is generated" checks cannot drift: a whole token of the canonical text
// carrying a digit and not shaped like a tag or a document number, which keeps GA-1201A and OPL-GA-1201A-01 out on
// both sides. Pure: no database, no gateway, no corpus text.
import type { DraftField } from "@/contracts/generated/drafts";
import { tokensOf } from "@/gates/g2/c3";

const TAG = /^[A-Za-z]{1,6}(?:-[A-Za-z0-9]+)+$/;

export type NumericViolation = {
  field_id: string;
  section: DraftField["section"];
  numeral: string;
  text: string;
};

/** The numerals of a text, in the order written, duplicates kept (the caller decides what to do with them). */
export function numeralsOf(text: string): string[] {
  return tokensOf(text).filter((token) => /\p{Nd}/u.test(token) && !TAG.test(token));
}

function typed(field: DraftField, numeral: string): boolean {
  return field.numeric_provenance.some((entry) => entry.numeral === numeral && entry.source_ref.trim() !== "");
}

/** One violation per unsourced numeral of a field, in the order written. */
export function numericViolations(fields: readonly DraftField[]): NumericViolation[] {
  const violations: NumericViolation[] = [];
  for (const field of fields) {
    if (field.is_slot) continue;
    for (const numeral of new Set(numeralsOf(field.text))) {
      if (typed(field, numeral)) continue;
      violations.push({
        field_id: field.id,
        section: field.section,
        numeral,
        text: `Field ${field.id} in section ${field.section} writes the numeral ${numeral}, which no evidence item types: a numeral appears only with a numeric_provenance entry naming it.`,
      });
    }
  }
  return violations;
}
