// The populations, the sensitivity ladder and the bands of blueprint 9.5 (harness/workbook.py `populations` at
// 59-67, harness/coverage.py `table` at 98-113 and the band block at 255-260), in the fixture spelling of
// harness/entities.py `coverage_summaries` at 1081-1106.
//
// Frozen rules, ported field by field: a failure is Work_Type Corrective or Overhaul or the breakdown flag;
// unplanned_failure is the failure population minus the rows whose problem description OPENS with a planned prefix
// (matched case-insensitively, harness/workbook.py:18); the two flagged populations read breakdown_kind; a row is
// uncovered when its rounded score is at or below t; the breakdown, downtime and cost columns count only the
// uncovered rows whose breakdown_kind is "unplanned", a null downtime or cost counting as zero; and the three
// bands hang on the unplanned-failure row and nowhere else.
import type * as coverage from "@/contracts/generated/coverage";
import type * as operations from "@/contracts/generated/operations";
import type { Layer } from "./layers";
import { THRESHOLD, type WorkOrderScore } from "./score";

/** The five populations of 9.5, in the sorted order harness/coverage.py:254 writes them. */
export const POPULATIONS = ["all", "failure", "planned_flagged", "unplanned_breakdowns", "unplanned_failure"] as const;
export type Population = (typeof POPULATIONS)[number];

/** harness/coverage.py:27: the rungs every summary is reported at, t itself among them. */
export const SENSITIVITY_LADDER = [0.5, 0.55, 0.6, 0.62, 0.65, 0.7, 0.75] as const;

/** harness/workbook.py:18: a problem description that OPENS with one of these is planned work, not a failure event. */
const PLANNED_PREFIX = /^(Scheduled|Statutory|Turnaround|Grid inspection)/i;

const LAYERS = ["generous", "strict"] as const;

export type Scores = ReadonlyMap<string, WorkOrderScore>;
export type ScoresByLayer = Readonly<Record<Layer, Scores>>;
export type Bands = NonNullable<coverage.CoverageSummary["bands"]>;

/** One summary row before a corpus version owns it; recount.ts adds `corpus_version_id`. */
export type Summary = Omit<coverage.CoverageSummary, "corpus_version_id">;

const isPlanned = (w: operations.WorkOrder): boolean => PLANNED_PREFIX.test(w.problem_description);
const isFailure = (w: operations.WorkOrder): boolean =>
  w.work_type === "Corrective" || w.work_type === "Overhaul" || w.breakdown;

/** The five populations of harness/workbook.py:59-67, each keeping the order the rows arrived in. */
export function populationsOf(workOrders: readonly operations.WorkOrder[]): Record<Population, operations.WorkOrder[]> {
  const failure = workOrders.filter(isFailure);
  return {
    all: [...workOrders],
    failure,
    planned_flagged: workOrders.filter((w) => w.breakdown_kind === "planned_flagged"),
    unplanned_breakdowns: workOrders.filter((w) => w.breakdown_kind === "unplanned"),
    unplanned_failure: failure.filter((w) => !isPlanned(w)),
  };
}

/** harness/coverage.py:103: uncovered is score <= t, the score being the rounded one the assessment stores. */
function uncoveredIn(rows: readonly operations.WorkOrder[], scores: Scores, threshold: number): operations.WorkOrder[] {
  return rows.filter((w) => (scores.get(w.wo_number)?.best_ratio ?? 0) <= threshold);
}

/**
 * The three bands of harness/coverage.py:255-260, renamed at harness/analyze_corpus.py:246-253: a record with no
 * lesson at all (uncovered generously), one taught only by a copied row (uncovered strictly but not generously),
 * and one genuinely taught (uncovered in neither layer).
 */
export function bandsOf(
  rows: readonly operations.WorkOrder[],
  generous: Scores,
  strict: Scores,
  threshold: number,
): Bands {
  const none = new Set(uncoveredIn(rows, generous, threshold).map((w) => w.wo_number));
  const strictly = uncoveredIn(rows, strict, threshold).map((w) => w.wo_number);
  const copiedRowOnly = strictly.filter((wo) => !none.has(wo));
  return {
    no_lesson: none.size,
    copied_row_only: copiedRowOnly.length,
    taught: rows.length - none.size - copiedRowOnly.length,
  };
}

/** The ten summary rows of a corpus version: the generous layer first, the populations sorted (harness/entities.py:1081). */
export function summarise(
  workOrders: readonly operations.WorkOrder[],
  scores: ScoresByLayer,
  threshold: number = THRESHOLD,
): Summary[] {
  const populations = populationsOf(workOrders);
  // The bands are computed once, on the unplanned-failure population, and travel on that row of both layers.
  const bands = bandsOf(populations.unplanned_failure, scores.generous, scores.strict, threshold);

  const rows: Summary[] = [];
  for (const layer of LAYERS) {
    for (const population of POPULATIONS) {
      const members = populations[population];
      const uncovered = uncoveredIn(members, scores[layer], threshold);
      // harness/coverage.py:104-109: only the uncovered rows flagged as unplanned breakdowns carry the three totals.
      const breakdowns = uncovered.filter((w) => w.breakdown_kind === "unplanned");
      rows.push({
        population,
        layer,
        threshold,
        uncovered_count: uncovered.length,
        population_count: members.length,
        uncovered_breakdowns: breakdowns.length,
        uncovered_downtime_hours: breakdowns.reduce((total, w) => total + (w.downtime_hours ?? 0), 0),
        uncovered_cost_idr: breakdowns.reduce((total, w) => total + (w.total_cost_idr ?? 0), 0),
        bands: population === "unplanned_failure" ? bands : null,
        sensitivity: SENSITIVITY_LADDER.map((t) => ({
          t,
          uncovered_count: uncoveredIn(members, scores[layer], t).length,
        })),
      });
    }
  }
  return rows;
}

/** The generous-uncovered work orders of a population at t, in population order (the debt input of 9.5). */
export function uncoveredWoNumbers(
  rows: readonly operations.WorkOrder[],
  scores: Scores,
  threshold: number = THRESHOLD,
): string[] {
  return uncoveredIn(rows, scores, threshold).map((w) => w.wo_number);
}
