// The two layers of the frozen coverage recipe (blueprint 9.5; harness/coverage.py:252 `layers`, harness/opl.py
// `strict_text` at 110-121 and `_between` at 30-44).
//
// Generous is what a lesson CONTAINS: the whole lesson text, section 5 kept and no cut at the page watermark. The
// harness passes the canonical `pdftext.opl_texts` through untouched; the product holds the same text parsed, so
// the layer is recomposed from the parts that together are the whole: the extracted header block (the one chunk of
// unit_kind "note" the ingestion writes per lesson, the part no parsed field reproduces) then every section as its
// heading and its body, in ascending section order. Composing it out of the parsed fields instead moves the
// published `all` figure at t = 0.62 from 143 uncovered to 146, which is AC-LOOP-01's number.
//
// Strict is what a lesson TEACHES: the seven header fields REBUILT from the parse (harness/opl.py:104), never the
// header block as the extractor emits it, then sections 1, 2, 3, 4 and 6 in that order, each cut at the page
// watermark. It is composed and not stripped because stripping removes only what the extractor happens to place
// between two headings, and the extractor puts copied work-order rows outside that span (harness/opl.py:111-117).
//
// An empty part is dropped rather than emitted as a double space: harness/opl.py:121 filters falsy parts first.
import type * as coverage from "@/contracts/generated/coverage";

/** A lesson row widened with the two strings the strict head and the generous text need (neither is a `coverage.Opl` field). */
export type LessonText = coverage.Opl & { header_text: string; equipment_name: string };

type Section = coverage.Opl["sections"][number];
type SectionNumber = Section["n"];

const ALL_SECTIONS: readonly SectionNumber[] = [1, 2, 3, 4, 5, 6];

/** harness/opl.py:105-107 and fixtures.method.strict_sections: the taught sections, section 5 excluded. */
export const STRICT_SECTIONS = [1, 2, 3, 4, 6] as const;

/** harness/opl.py:27: the page-bottom watermark every lesson carries once; nothing after it is section prose. */
export const STRICT_CUT_MARKER = "This is sample data provided for CALIBER purposes only";

function sectionsByNumber(lesson: LessonText): Map<SectionNumber, Section> {
  return new Map(lesson.sections.map((s) => [s.n, s]));
}

/** The whole lesson text: the header block, then every section as its heading and its body, in ascending order. */
export function generousText(lesson: LessonText): string {
  const byNumber = sectionsByNumber(lesson);
  const parts: string[] = [lesson.header_text];
  for (const n of ALL_SECTIONS) {
    const section = byNumber.get(n);
    if (section === undefined) continue;
    parts.push(section.heading, section.body_text);
  }
  return parts.filter((part) => part !== "").join(" ");
}

/** harness/opl.py:30-44: the body up to the watermark, trimmed; every section routes through here. */
function cutAtMarker(body: string): string {
  const at = body.indexOf(STRICT_CUT_MARKER);
  return (at >= 0 ? body.slice(0, at) : body).trim();
}

/** The seven rebuilt header fields then sections 1, 2, 3, 4 and 6, each cut at the watermark (harness/opl.py:110). */
export function strictText(lesson: LessonText): string {
  const byNumber = sectionsByNumber(lesson);
  const parts: string[] = [
    lesson.opl_id,
    lesson.title,
    lesson.equipment_name, // harness/opl.py:104 `equipment` is the equipment NAME, not the tag
    lesson.area_unit,
    lesson.related_interlock_text,
    lesson.pid_ref,
    lesson.classification,
  ];
  for (const n of STRICT_SECTIONS) {
    const section = byNumber.get(n);
    if (section === undefined) continue;
    parts.push(cutAtMarker(section.body_text));
  }
  return parts.filter((part) => part !== "").join(" ");
}

export type Layer = "generous" | "strict";

/** The text of one layer; the layer is a value the caller passes, so both are computed by the same recipe. */
export function layerText(lesson: LessonText, layer: Layer): string {
  return layer === "generous" ? generousText(lesson) : strictText(lesson);
}
