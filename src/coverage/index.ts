// The coverage and debt port of blueprint 9.5 (ADR-002, ARCHITECTURE 8.1): the TypeScript reading of the frozen
// recipe, field by field against thehub-harness/harness/coverage.py, opl.py, workbook.py and debt.py. Nothing here
// reads a database or calls a provider; tests/equality/coverage.test.ts runs it over the seeded corpus and compares
// it with the harness bundle byte for byte, so a divergence between the two lanes fails the build.
import type * as operations from "@/contracts/generated/operations";
import type { LessonText } from "./layers";
import { scoreWorkOrder, type WorkOrderScore } from "./score";
import type { ScoresByLayer } from "./summary";
import { stopList } from "./tokenise";

export { contentWords, stopList, stopListSha256 } from "./tokenise";
export { fieldScore, MIN_CONTENT_WORDS, WINDOW_MULTIPLIER } from "./window";
export { generousText, layerText, strictText, STRICT_CUT_MARKER, STRICT_SECTIONS } from "./layers";
export type { Layer, LessonText } from "./layers";
export { NARRATIVE_FIELDS, round4, scoreWorkOrder, toAssessment, THRESHOLD } from "./score";
export type { MatchedField, WorkOrderScore } from "./score";
export { bandsOf, POPULATIONS, populationsOf, SENSITIVITY_LADDER, summarise, uncoveredWoNumbers } from "./summary";
export type { Bands, Population, Scores, ScoresByLayer, Summary } from "./summary";
export { COEFFICIENTS, familyShare, K_BY_CRITICALITY, rankDebt } from "./debt";
export type { DebtInput, DebtRow } from "./debt";

/**
 * Every work order scored in both layers, keyed by wo_number (harness/coverage.py:253). The asset's lessons are
 * the only ones a work order is scored against (harness/coverage.py:68 `lessons_by_tag`); scoreWorkOrder puts them
 * in sorted opl_id order, so the matched unit of a tie does not depend on the order the rows arrived in.
 */
export function scoreAll(
  workOrders: readonly operations.WorkOrder[],
  lessons: readonly LessonText[],
  stop: readonly string[] = stopList(),
): ScoresByLayer {
  const byTag = new Map<string, LessonText[]>();
  for (const lesson of lessons) {
    const held = byTag.get(lesson.equipment_tag);
    if (held === undefined) byTag.set(lesson.equipment_tag, [lesson]);
    else held.push(lesson);
  }
  const generous = new Map<string, WorkOrderScore>();
  const strict = new Map<string, WorkOrderScore>();
  for (const workOrder of workOrders) {
    const mine = byTag.get(workOrder.equipment_tag) ?? [];
    generous.set(workOrder.wo_number, scoreWorkOrder(workOrder, mine, "generous", stop));
    strict.set(workOrder.wo_number, scoreWorkOrder(workOrder, mine, "strict", stop));
  }
  return { generous, strict };
}
