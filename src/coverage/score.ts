// The per-work-order score of the frozen coverage recipe (blueprint 9.5; harness/coverage.py `score` at 81-95).
//
// Frozen rules, ported field by field: the three narrative fields of harness/workbook.py:13 are tried in that
// order, the asset's lessons in sorted opl_id order, and only a STRICTLY greater score replaces the best, so both
// orders decide a tie and the matched unit is independent of the order the rows arrived in (harness/coverage.py:88,
// 92). A work order with no scoreable field, or none of whose words reach any lesson, scores 0 with a null unit
// (harness/coverage.py:84). The ratio is rounded to 4 dp the way Python's round does it, and the work order is
// UNCOVERED when the rounded score is at or below the threshold (fixtures.method.comparison).
import type * as coverage from "@/contracts/generated/coverage";
import type * as operations from "@/contracts/generated/operations";
import { layerText, type Layer, type LessonText } from "./layers";
import { contentWords, stopList } from "./tokenise";
import { fieldScore } from "./window";

/** harness/workbook.py:13 (NARR), in the fixture spelling of the 9.5 contract. */
export const NARRATIVE_FIELDS = ["problem_description", "root_cause", "corrective_action"] as const;

/** harness/coverage.py:26. */
export const THRESHOLD = 0.62;

export type MatchedField = (typeof NARRATIVE_FIELDS)[number];

export type WorkOrderScore = {
  best_ratio: number;
  matched_field: MatchedField | null;
  matched_lesson: string | null;
  covered: boolean;
};

/**
 * Python's `round(x, 4)`: correctly rounded at 4 decimal places, an exact tie going to the even digit
 * (harness/coverage.py:94). A tie is exact only when the double itself is one, which is why the scaling below can
 * decide it: every ratio the recipe produces is p/q with a small q, so the scaled product is far from a tie
 * boundary unless it is exactly on it (1/32, 3/32, 5/32 and their kin).
 */
export function round4(x: number): number {
  const scaled = x * 1e4;
  const below = Math.floor(scaled);
  const rest = scaled - below;
  if (rest > 0.5) return (below + 1) / 1e4;
  if (rest < 0.5) return below / 1e4;
  return (below % 2 === 0 ? below : below + 1) / 1e4;
}

type Unit = { field: MatchedField; lesson: string };

/** The best score over the work order's three narrative fields and the asset's lessons, in one layer. */
export function scoreWorkOrder(
  workOrder: operations.WorkOrder,
  lessonsOfAsset: readonly LessonText[],
  layer: Layer,
  stop: readonly string[] = stopList(),
): WorkOrderScore {
  // harness/coverage.py:88: the asset's lessons visited in sorted opl_id order, each tokenised once per call.
  const documents = [...lessonsOfAsset]
    .sort((a, b) => (a.opl_id < b.opl_id ? -1 : a.opl_id > b.opl_id ? 1 : 0))
    .map((lesson) => ({ lesson: lesson.opl_id, content: contentWords(layerText(lesson, layer), stop) }));

  let best = 0;
  let unit: Unit | null = null;
  for (const field of NARRATIVE_FIELDS) {
    // The skip rule of harness/coverage.py:78 lives in fieldScore: a field under three content words scores 0,
    // which the strict comparison below can never accept, so a skipped field and a zero field are the same thing.
    const content = contentWords(workOrder[field] ?? "", stop);
    for (const document of documents) {
      const share = fieldScore(content, document.content);
      if (share > best) {
        best = share;
        unit = { field, lesson: document.lesson };
      }
    }
  }

  const bestRatio = round4(best);
  return {
    best_ratio: bestRatio,
    matched_field: unit === null ? null : unit.field,
    matched_lesson: unit === null ? null : unit.lesson,
    covered: bestRatio > THRESHOLD,
  };
}

/** The 9.5 row this score becomes once a corpus version owns it (harness/entities.py:1060). */
export function toAssessment(
  woNumber: string,
  layer: Layer,
  score: WorkOrderScore,
  corpusVersionId: string,
  threshold: number = THRESHOLD,
): coverage.CoverageAssessment {
  return {
    wo_number: woNumber,
    layer,
    covered: score.covered,
    best_ratio: score.best_ratio,
    threshold,
    matched_field: score.matched_field,
    matched_lesson: score.matched_lesson,
    corpus_version_id: corpusVersionId,
  };
}
