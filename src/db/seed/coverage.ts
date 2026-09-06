// Family: coverage_scores.json and debt.json (blueprint 9.5 CoverageMethod, CoverageAssessment, CoverageSummary,
// DebtCluster). Every row binds to the seeded version id (the bundle carries the label "v1" as a placeholder);
// the method row is one per version and its frozen constants are CHECKed by the schema.
import type { Tx } from "@/db/client";
import { coverageAssessment, coverageMethod, coverageSummary, debtCluster } from "@/db/schema";
import type { Bundle } from "@/gates/g1";
import { upsert, type FamilyResult } from "./upsert";

export async function seedCoverage(tx: Tx, b: Bundle, versionId: string): Promise<FamilyResult> {
  if (b.coverage === null) throw new Error("coverage_scores.json was not read; G1 admits no bundle without it");
  const m = b.coverage.method;
  const method = await upsert(
    tx,
    coverageMethod,
    [
      {
        corpusVersionId: versionId,
        recipeSha256: m.recipe_sha256,
        stopListSha256: m.stop_list_sha256,
        threshold: m.threshold,
        windowMultiplier: m.window_multiplier,
        minContentWords: m.min_content_words,
        comparison: m.comparison,
        extractor: m.extractor,
        strictSections: m.strict_sections,
        strictCutMarker: m.strict_cut_marker,
        labelsStatus: m.labels_status,
        unscoreableIds: m.unscoreable_ids,
      },
    ],
    [coverageMethod.corpusVersionId],
  );
  const assessments = await upsert(
    tx,
    coverageAssessment,
    b.coverage.assessments.map((a) => ({
      woNumber: a.wo_number,
      layer: a.layer,
      covered: a.covered,
      bestRatio: a.best_ratio,
      threshold: a.threshold,
      matchedField: a.matched_field,
      matchedLesson: a.matched_lesson,
      corpusVersionId: versionId,
    })),
    [coverageAssessment.woNumber, coverageAssessment.layer, coverageAssessment.corpusVersionId],
  );
  const summaries = await upsert(
    tx,
    coverageSummary,
    b.coverage.summaries.map((s) => ({
      corpusVersionId: versionId,
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
  const clusters = await upsert(
    tx,
    debtCluster,
    b.debt.map((d) => ({
      id: d.id,
      equipmentTag: d.equipment_tag,
      corpusVersionId: versionId,
      uncoveredWoNumbers: d.uncovered_wo_numbers,
      factors: d.factors,
      coefficients: d.coefficients,
      incompleteUncovered: d.incomplete_uncovered,
      score: d.score,
      rank: d.rank,
    })),
    [debtCluster.id],
  );
  return { rows: { coverage_method: method, coverage_assessment: assessments, coverage_summary: summaries, debt_cluster: clusters } };
}
