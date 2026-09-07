// The recount of G3 step 4 (ARCHITECTURE 8.6, blueprint 9.5; AC-LOOP-12): after a publication has added a lesson
// to a new corpus version, every coverage row of that version is recomputed by the port of ARCHITECTURE 8.1 from
// the database rows of the version's lineage. Nothing is copied from a fixture and no figure is edited by hand:
// the numbers a visitor sees after publishing are the same recipe run again over one more lesson.
//
// What "the same recipe" means here, and why it is checked rather than assumed. The baseline is the nearest
// ANCESTOR of this version that already carries a `coverage_method` row (a version carries coverage exactly when it
// carries that row, which is how src/db/queries/coverage.ts decides what to show). Its `recipe_sha256` travels
// forward unchanged, because the recipe is the harness source and this lane cannot recompute that digest; its
// `stop_list_sha256` is COMPARED with the digest of the stop list this recount actually tokenised with, and a
// disagreement throws before a single row is written. A recount under another stop list would move every published
// figure silently, which is the one failure AC-LOOP-12 exists to catch.
//
// Every write is an upsert on the row's own key, so a retried G3 transaction recomputes the same rows and deletes
// nothing (ARCHITECTURE 2). The recount is a pure function of the lineage's rows, so a retry lands the same values.
import { and, eq, inArray } from "drizzle-orm";
import { populationsOf, rankDebt, scoreAll, summarise, uncoveredWoNumbers, COEFFICIENTS } from "@/coverage";
import { stopList, stopListSha256 } from "@/coverage/tokenise";
import type { Tx } from "@/db/client";
import { readCoverageInputs } from "@/db/queries/coverage-inputs";
import { corpusVersion, coverageAssessment, coverageMethod, coverageSummary, debtCluster } from "@/db/schema";
import { upsert } from "@/db/seed/upsert";
import { lineageOf } from "@/db/versions";
import { NotFound } from "@/lib/errors";

/** The population every headline is taken over (blueprint 9.5, AC-LOOP-01). */
const HEADLINE_POPULATION = "unplanned_failure";
const HEADLINE_LAYER = "generous";

/** The 8.6 step 6 body: the count before, the count after, the population, and the two digests it ran under. */
export type CoverageRecount = {
  uncovered_before: number;
  uncovered_after: number;
  population_count: number;
  recipe_sha256: string;
  stop_list_sha256: string;
};

/** Recompute coverage_method, coverage_assessment, coverage_summary and debt_cluster for one corpus version. */
export async function recount(tx: Tx, corpusVersionId: string): Promise<CoverageRecount> {
  const versions = await tx
    .select({ id: corpusVersion.id, parentVersionId: corpusVersion.parentVersionId })
    .from(corpusVersion);
  const lineage = lineageOf(versions, corpusVersionId);
  if (lineage.length === 0) throw new NotFound("corpus_version", corpusVersionId);

  // The baseline: the nearest ancestor that carries a method row. The version being recounted is excluded, so a
  // retried recount measures itself against the same ancestor and reports the same "before" as the first run.
  const ancestors = lineage.slice(1);
  const methodRows =
    ancestors.length === 0
      ? []
      : await tx.select().from(coverageMethod).where(inArray(coverageMethod.corpusVersionId, ancestors));
  const byVersion = new Map(methodRows.map((m) => [m.corpusVersionId, m]));
  const baseline = ancestors.map((id) => byVersion.get(id)).find((m) => m !== undefined);
  if (baseline === undefined) {
    throw new Error(`no coverage_method in the lineage above ${corpusVersionId}: there is no baseline to recount from`);
  }

  // AC-LOOP-12: the recount runs under the baseline's stop list, or it does not run.
  const stop = stopList();
  const stopSha = stopListSha256(stop);
  if (stopSha !== baseline.stopListSha256) {
    throw new Error(
      `the recount stop list digests to ${stopSha}, not the baseline ${baseline.stopListSha256} of ${baseline.corpusVersionId} (D-19)`,
    );
  }

  const threshold = baseline.threshold;
  const inputs = await readCoverageInputs(tx, lineage);
  const scores = scoreAll(inputs.workOrders, inputs.lessons, stop);
  const summaries = summarise(inputs.workOrders, scores, threshold);
  const populations = populationsOf(inputs.workOrders);
  const uncovered = uncoveredWoNumbers(populations[HEADLINE_POPULATION], scores[HEADLINE_LAYER], threshold);
  const clusters = rankDebt({
    workOrders: inputs.workOrders,
    uncoveredWoNumbers: uncovered,
    criticalityByTag: inputs.criticalityByTag,
    familyMembers: inputs.familyMembers,
  });

  // The method row is what makes this version carry coverage at all: written first and copied field by field, so
  // the version states the recipe it was counted under and nothing else can be inferred about it.
  await upsert(
    tx,
    coverageMethod,
    [
      {
        corpusVersionId,
        recipeSha256: baseline.recipeSha256,
        stopListSha256: baseline.stopListSha256,
        threshold: baseline.threshold,
        windowMultiplier: baseline.windowMultiplier,
        minContentWords: baseline.minContentWords,
        comparison: baseline.comparison,
        extractor: baseline.extractor,
        strictSections: baseline.strictSections,
        strictCutMarker: baseline.strictCutMarker,
        labelsStatus: baseline.labelsStatus,
        unscoreableIds: baseline.unscoreableIds,
      },
    ],
    [coverageMethod.corpusVersionId],
  );

  await upsert(
    tx,
    coverageAssessment,
    inputs.workOrders.flatMap((w) =>
      (["generous", "strict"] as const).map((layer) => {
        const score = scores[layer].get(w.wo_number);
        if (score === undefined) throw new Error(`no ${layer} score for ${w.wo_number}`);
        return {
          woNumber: w.wo_number,
          layer,
          covered: score.covered,
          bestRatio: score.best_ratio,
          threshold,
          matchedField: score.matched_field,
          matchedLesson: score.matched_lesson,
          corpusVersionId,
        };
      }),
    ),
    [coverageAssessment.woNumber, coverageAssessment.layer, coverageAssessment.corpusVersionId],
  );

  await upsert(
    tx,
    coverageSummary,
    summaries.map((s) => ({
      corpusVersionId,
      population: s.population,
      layer: s.layer,
      threshold: s.threshold,
      uncoveredCount: s.uncovered_count,
      populationCount: s.population_count,
      uncoveredBreakdowns: s.uncovered_breakdowns,
      uncoveredDowntimeHours: s.uncovered_downtime_hours,
      uncoveredCostIdr: s.uncovered_cost_idr,
      bands: s.bands,
      sensitivity: s.sensitivity,
    })),
    [coverageSummary.corpusVersionId, coverageSummary.population, coverageSummary.layer],
  );

  // The cluster id carries the version: `debt_cluster.id` is the primary key across every version, and the seeded
  // rows already hold the bundle's `DEBT-<tag>` (a draft's cluster_id points at one of those).
  await upsert(
    tx,
    debtCluster,
    clusters.map((c) => ({
      id: `DEBT-${corpusVersionId}-${c.equipment_tag}`,
      equipmentTag: c.equipment_tag,
      corpusVersionId,
      uncoveredWoNumbers: c.uncovered_wo_numbers,
      factors: c.factors,
      coefficients: COEFFICIENTS,
      incompleteUncovered: c.incomplete_uncovered,
      score: c.score,
      rank: c.rank,
    })),
    [debtCluster.id],
  );

  const after = summaries.find((s) => s.population === HEADLINE_POPULATION && s.layer === HEADLINE_LAYER);
  if (after === undefined) throw new Error(`the recount produced no ${HEADLINE_LAYER} ${HEADLINE_POPULATION} summary`);
  const [before] = await tx
    .select({ uncoveredCount: coverageSummary.uncoveredCount })
    .from(coverageSummary)
    .where(
      and(
        eq(coverageSummary.corpusVersionId, baseline.corpusVersionId),
        eq(coverageSummary.population, HEADLINE_POPULATION),
        eq(coverageSummary.layer, HEADLINE_LAYER),
      ),
    )
    .limit(1);
  if (before === undefined) {
    throw new Error(
      `${baseline.corpusVersionId} carries a coverage_method but no ${HEADLINE_LAYER} ${HEADLINE_POPULATION} summary: there is no count to report as the one before`,
    );
  }

  return {
    uncovered_before: before.uncoveredCount,
    uncovered_after: after.uncovered_count,
    population_count: after.population_count,
    recipe_sha256: baseline.recipeSha256,
    stop_list_sha256: baseline.stopListSha256,
  };
}
