// The reads behind the Coverage Console (blueprint 6.2 surface 7, 9.5, 9.9 GET /api/coverage and
// GET /api/coverage/clusters/:id; AC-LOOP-02, AC-LOOP-03) and the Home gap headline. Every figure a surface shows
// comes from one of three bindings (10.3): the coverage_* and debt_cluster rows of the visible corpus version, the
// work_order rows the harness's frozen population rule selects, and the fixture's coverage_labels (the adjudicated
// reading, status machine_drafted_pending_human until OQ-6 closes). Every row leaves through the generated Zod of
// 9.5 (ARCHITECTURE 1.4). Nothing here writes.
//
// Which version: visibleVersionIds() of D-16 (the active lineage, then the sandbox's own never-activated child).
// The sandbox's own version wins when it carries a recount, so a visitor's publication moves the visitor's numbers
// and nobody else's; otherwise the nearest lineage version with a coverage_method row. The active version's
// unplanned-failure summaries travel beside a sandbox recount as the baseline the RecountMoment compares against.
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { visibleVersionIds, type Sandbox } from "@/auth/sandbox";
import { CoverageAssessment, CoverageMethod, CoverageSummary, DebtCluster } from "@/contracts/generated/coverage";
import { Root as FixtureRoot } from "@/contracts/generated/fixtures";
import type { WorkOrder } from "@/contracts/generated/operations";
import { db } from "@/db/client";
import { corpusVersion, coverageAssessment, coverageMethod, coverageSummary, debtCluster, workOrder } from "@/db/schema";
import { fixtures } from "@/lib/fixtures";

/** The population every headline reads: the 57 unplanned-failure records of PRD Appendix C.1 (9.5). */
export const HEADLINE_POPULATION = "unplanned_failure" satisfies CoverageSummary["population"];
export const ALL_POPULATION = "all" satisfies CoverageSummary["population"];

export type Layer = CoverageSummary["layer"];
export const LAYERS: readonly Layer[] = ["generous", "strict"];
/** The layer the debt score is computed over (9.5: the asset's generous-uncovered unplanned-failure work orders). */
export const DEBT_LAYER: Layer = "generous";

export function parseLayer(value: string | string[] | undefined): Layer {
  return value === "strict" ? "strict" : "generous";
}

// ---------------------------------------------------------------------------------------------------------------
// Contract shapes
// ---------------------------------------------------------------------------------------------------------------

/** The fixture's adjudicated reading (10.5 coverage_labels), read through the generated contract slice. */
export const CoverageLabels = FixtureRoot.shape.coverage_labels;
export type CoverageLabels = z.infer<typeof CoverageLabels>;

export type VersionRef = { id: string; label: string; is_active: boolean; corpus_sha256: string };

/** The two populations the surfaces name in words. */
export const POPULATION_LABEL: Record<typeof HEADLINE_POPULATION | typeof ALL_POPULATION, string> = {
  unplanned_failure: "unplanned-failure records",
  all: "work orders of every type",
};

export type LayerPair = { generous: CoverageSummary; strict: CoverageSummary };

export type CoverageConsole = {
  version: VersionRef;
  method: CoverageMethod;
  /** The headline population, both layers; bands live on these rows (the harness writes them on this population only). */
  unplanned: LayerPair;
  /** Every summary row of the version (five populations, two layers), the 9.9 response body of GET /api/coverage. */
  summaries: CoverageSummary[];
  /** The ranked clusters of the version, rank ascending. */
  clusters: DebtCluster[];
  /** The active version's headline rows when the shown version is a sandbox recount; null when they are the same. */
  baseline: { version: VersionRef; unplanned: LayerPair } | null;
  /** The fixture's adjudicated reading, or null when this runtime cannot read the fixture (never a placeholder). */
  labels: CoverageLabels | null;
};

/** One layer's assessment of one work order, as coverage_assessment stores it. */
export type LayerReading = Pick<CoverageAssessment, "covered" | "best_ratio" | "threshold" | "matched_field" | "matched_lesson">;

/** The adjudicated reading of one record: in the fixture's uncovered set or not; null when the fixture is unreadable. */
export type Adjudicated = "uncovered" | "covered" | null;

/** One row of the per-work-order table: the record's own fields beside both layers' readings. */
export type AssessmentRow = {
  wo_number: string;
  equipment_tag: string;
  report_date: string;
  work_type: WorkOrder["work_type"];
  breakdown_kind: WorkOrder["breakdown_kind"];
  priority: WorkOrder["priority"];
  downtime_hours: number | null;
  total_cost_idr: number | null;
  closeout_complete: boolean;
  completeness_flags: WorkOrder["completeness_flags"];
  generous: LayerReading | null;
  strict: LayerReading | null;
  adjudicated: Adjudicated;
};

/** GET /api/coverage/clusters/:id (9.9): the cluster with its assessments and the matched units of its work orders. */
export const ClusterDetail = DebtCluster.extend({
  assessments: z.array(CoverageAssessment),
  work_orders: z.array(
    z
      .object({
        wo_number: z.string(),
        equipment_tag: z.string(),
        generous: z.object({ matched_field: CoverageAssessment.shape.matched_field, matched_lesson: CoverageAssessment.shape.matched_lesson }).nullable(),
        strict: z.object({ matched_field: CoverageAssessment.shape.matched_field, matched_lesson: CoverageAssessment.shape.matched_lesson }).nullable(),
      })
      .strict(),
  ),
});
export type ClusterDetail = z.infer<typeof ClusterDetail>;

// ---------------------------------------------------------------------------------------------------------------
// Row mappers (snake_case out, validated)
// ---------------------------------------------------------------------------------------------------------------

function toSummary(r: typeof coverageSummary.$inferSelect): CoverageSummary {
  return CoverageSummary.parse({
    corpus_version_id: r.corpusVersionId,
    population: r.population,
    layer: r.layer,
    threshold: r.threshold,
    uncovered_count: r.uncoveredCount,
    population_count: r.populationCount,
    uncovered_breakdowns: r.uncoveredBreakdowns,
    uncovered_downtime_hours: r.uncoveredDowntimeHours,
    uncovered_cost_idr: r.uncoveredCostIdr,
    bands: r.bands ?? null,
    sensitivity: r.sensitivity,
  });
}

function toMethod(r: typeof coverageMethod.$inferSelect): CoverageMethod {
  return CoverageMethod.parse({
    recipe_sha256: r.recipeSha256,
    stop_list_sha256: r.stopListSha256,
    threshold: r.threshold,
    window_multiplier: r.windowMultiplier,
    min_content_words: r.minContentWords,
    comparison: r.comparison,
    extractor: r.extractor,
    strict_sections: r.strictSections,
    strict_cut_marker: r.strictCutMarker,
    labels_status: r.labelsStatus,
    unscoreable_ids: r.unscoreableIds,
  });
}

function toCluster(r: typeof debtCluster.$inferSelect): DebtCluster {
  return DebtCluster.parse({
    id: r.id,
    equipment_tag: r.equipmentTag,
    corpus_version_id: r.corpusVersionId,
    uncovered_wo_numbers: r.uncoveredWoNumbers,
    factors: r.factors,
    coefficients: r.coefficients,
    incomplete_uncovered: r.incompleteUncovered,
    score: r.score,
    rank: r.rank,
  });
}

function toAssessment(r: typeof coverageAssessment.$inferSelect): CoverageAssessment {
  return CoverageAssessment.parse({
    wo_number: r.woNumber,
    layer: r.layer,
    covered: r.covered,
    best_ratio: r.bestRatio,
    threshold: r.threshold,
    matched_field: r.matchedField,
    matched_lesson: r.matchedLesson,
    corpus_version_id: r.corpusVersionId,
  });
}

/** Both layers of one population out of a version's summary rows, or null when either is missing. */
export function layerPair(rows: CoverageSummary[], population: CoverageSummary["population"]): LayerPair | null {
  const generous = rows.find((s) => s.population === population && s.layer === "generous");
  const strict = rows.find((s) => s.population === population && s.layer === "strict");
  return generous && strict ? { generous, strict } : null;
}

/** The fixture's adjudicated reading, or null when the runtime cannot read the fixture or the slice does not parse. */
export function coverageLabels(): CoverageLabels | null {
  const parsed = CoverageLabels.safeParse(fixtures?.coverage_labels);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Version resolution
// ---------------------------------------------------------------------------------------------------------------

async function versionsWithCoverage(ids: string[]): Promise<Map<string, VersionRef>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: corpusVersion.id, label: corpusVersion.label, isActive: corpusVersion.isActive, corpusSha256: corpusVersion.corpusSha256 })
    .from(corpusVersion)
    .innerJoin(coverageMethod, eq(coverageMethod.corpusVersionId, corpusVersion.id))
    .where(inArray(corpusVersion.id, ids));
  return new Map(rows.map((r) => [r.id, { id: r.id, label: r.label, is_active: r.isActive, corpus_sha256: r.corpusSha256 }]));
}

/**
 * The version whose coverage the visitor sees and, when that is a sandbox recount, the active version as the
 * baseline. Null when no visible version carries coverage rows (the designed "not yet computed" state).
 */
export async function resolveCoverageVersion(box: Pick<Sandbox, "corpusVersionId"> | null): Promise<{ shown: VersionRef; active: VersionRef | null } | null> {
  const ids = await visibleVersionIds(box);
  const known = await versionsWithCoverage(ids);
  const own = box?.corpusVersionId ?? null;
  const shown = (own !== null ? known.get(own) : undefined) ?? ids.map((id) => known.get(id)).find((v) => v !== undefined) ?? null;
  if (!shown) return null;
  const active = [...known.values()].find((v) => v.is_active) ?? null;
  return { shown, active };
}

// ---------------------------------------------------------------------------------------------------------------
// The Console and the Home headline
// ---------------------------------------------------------------------------------------------------------------

async function summariesOf(versionId: string): Promise<CoverageSummary[]> {
  const rows = await db
    .select()
    .from(coverageSummary)
    .where(eq(coverageSummary.corpusVersionId, versionId))
    .orderBy(asc(coverageSummary.population), asc(coverageSummary.layer));
  return rows.map(toSummary);
}

export async function readCoverageConsole(box: Pick<Sandbox, "corpusVersionId"> | null): Promise<CoverageConsole | null> {
  const resolved = await resolveCoverageVersion(box);
  if (!resolved) return null;
  const { shown, active } = resolved;
  const [summaries, methodRows, clusterRows] = await Promise.all([
    summariesOf(shown.id),
    db.select().from(coverageMethod).where(eq(coverageMethod.corpusVersionId, shown.id)).limit(1),
    db.select().from(debtCluster).where(eq(debtCluster.corpusVersionId, shown.id)).orderBy(asc(debtCluster.rank), asc(debtCluster.equipmentTag)),
  ]);
  const method = methodRows[0];
  const unplanned = layerPair(summaries, HEADLINE_POPULATION);
  if (!method || !unplanned) return null;

  let baseline: CoverageConsole["baseline"] = null;
  if (active && active.id !== shown.id) {
    const base = layerPair(await summariesOf(active.id), HEADLINE_POPULATION);
    if (base) baseline = { version: active, unplanned: base };
  }

  return {
    version: shown,
    method: toMethod(method),
    unplanned,
    summaries,
    clusters: clusterRows.map(toCluster),
    baseline,
    labels: coverageLabels(),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The per-work-order assessment table
// ---------------------------------------------------------------------------------------------------------------

// The frozen population rule of the harness (thehub-harness/harness/workbook.py, Revision Plan 5.4): failure is
// Work_Type in {Corrective, Overhaul} or Breakdown yes; unplanned_failure is failure minus the rows whose
// Problem_Description starts with Scheduled, Statutory, Turnaround or Grid inspection (case-insensitive). The
// population_count of the summary row is the authority; the surface states a divergence when the rule's row count
// differs from it instead of hiding either figure.
const PLANNED_PREFIX = "^(Scheduled|Statutory|Turnaround|Grid inspection)";
const unplannedFailure = and(
  or(inArray(workOrder.workType, ["Corrective", "Overhaul"]), eq(workOrder.breakdown, true)),
  sql`${workOrder.problemDescription} !~* ${PLANNED_PREFIX}`,
);

function reading(a: typeof coverageAssessment.$inferSelect): LayerReading {
  const parsed = toAssessment(a);
  return { covered: parsed.covered, best_ratio: parsed.best_ratio, threshold: parsed.threshold, matched_field: parsed.matched_field, matched_lesson: parsed.matched_lesson };
}

async function assessmentRows(versionId: string, only: string[] | null, labels: CoverageLabels | null): Promise<AssessmentRow[]> {
  if (only !== null && only.length === 0) return [];
  const rows = await db
    .select({ wo: workOrder, a: coverageAssessment })
    .from(workOrder)
    .leftJoin(coverageAssessment, and(eq(coverageAssessment.woNumber, workOrder.woNumber), eq(coverageAssessment.corpusVersionId, versionId)))
    .where(only === null ? unplannedFailure : and(unplannedFailure, inArray(workOrder.woNumber, only)))
    .orderBy(asc(workOrder.woNumber), asc(coverageAssessment.layer));
  const uncoveredByLabel = labels ? new Set(labels.uncovered_ids) : null;
  const byWo = new Map<string, AssessmentRow>();
  for (const { wo, a } of rows) {
    let row = byWo.get(wo.woNumber);
    if (!row) {
      row = {
        wo_number: wo.woNumber,
        equipment_tag: wo.equipmentTag,
        report_date: wo.reportDate,
        work_type: wo.workType,
        breakdown_kind: wo.breakdownKind,
        priority: wo.priority,
        downtime_hours: wo.downtimeHours,
        total_cost_idr: wo.totalCostIdr,
        closeout_complete: wo.closeoutComplete,
        completeness_flags: wo.completenessFlags,
        generous: null,
        strict: null,
        adjudicated: uncoveredByLabel === null ? null : uncoveredByLabel.has(wo.woNumber) ? "uncovered" : "covered",
      };
      byWo.set(wo.woNumber, row);
    }
    if (a) row[a.layer] = reading(a);
  }
  return [...byWo.values()];
}

/** The 57 rows of the headline population with both layers' readings, work-order order. */
export async function readAssessmentTable(versionId: string, labels: CoverageLabels | null): Promise<AssessmentRow[]> {
  return assessmentRows(versionId, null, labels);
}

// ---------------------------------------------------------------------------------------------------------------
// One cluster
// ---------------------------------------------------------------------------------------------------------------

export type ClusterPage = { version: VersionRef; cluster: DebtCluster; clusterCount: number; rows: AssessmentRow[]; labels: CoverageLabels | null };

/** The cluster by id on the visible version with its uncovered work orders as rows, or null (the designed 404). */
export async function readCluster(id: string, box: Pick<Sandbox, "corpusVersionId"> | null): Promise<ClusterPage | null> {
  const resolved = await resolveCoverageVersion(box);
  if (!resolved) return null;
  const { shown } = resolved;
  const [row] = await db
    .select()
    .from(debtCluster)
    .where(and(eq(debtCluster.id, id), eq(debtCluster.corpusVersionId, shown.id)))
    .limit(1);
  if (!row) return null;
  const cluster = toCluster(row);
  const labels = coverageLabels();
  const [rows, [count]] = await Promise.all([
    assessmentRows(shown.id, cluster.uncovered_wo_numbers, labels),
    db.select({ n: sql<number>`count(*)::int` }).from(debtCluster).where(eq(debtCluster.corpusVersionId, shown.id)),
  ]);
  // The cluster's own order (the harness sorted them), not the table's.
  const byWo = new Map(rows.map((r) => [r.wo_number, r]));
  const ordered = cluster.uncovered_wo_numbers.map((wo) => byWo.get(wo)).filter((r): r is AssessmentRow => r !== undefined);
  return { version: shown, cluster, clusterCount: count?.n ?? 0, rows: ordered, labels };
}

/** The 9.9 body of GET /api/coverage/clusters/:id from a ClusterPage. */
export function toClusterDetail(page: ClusterPage): ClusterDetail {
  const assessments: CoverageAssessment[] = [];
  for (const r of page.rows) {
    for (const layer of LAYERS) {
      const l = r[layer];
      if (l) assessments.push({ wo_number: r.wo_number, layer, ...l, corpus_version_id: page.version.id });
    }
  }
  return ClusterDetail.parse({
    ...page.cluster,
    assessments,
    work_orders: page.rows.map((r) => ({
      wo_number: r.wo_number,
      equipment_tag: r.equipment_tag,
      generous: r.generous ? { matched_field: r.generous.matched_field, matched_lesson: r.generous.matched_lesson } : null,
      strict: r.strict ? { matched_field: r.strict.matched_field, matched_lesson: r.strict.matched_lesson } : null,
    })),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Display helpers shared by the Console, the cluster page and the Home headline (pure; no figure is typed here)
// ---------------------------------------------------------------------------------------------------------------

const grouped = new Intl.NumberFormat("en-US");

/** "24.6 percent": one decimal of a bound ratio; the caller prints it beside the layer and the threshold, never alone. */
export function percentOf(n: number, of: number): string {
  return of > 0 ? `${((100 * n) / of).toFixed(1)} percent` : "no records";
}

/** The share alone, one decimal, for a band's two ends; never rendered without the word the caller adds. */
function share(n: number, of: number): string {
  return of > 0 ? `${((100 * n) / of).toFixed(1)}` : "no records";
}

/**
 * The sensitivity band a figure is quoted with (6.2 surface 7: never a bare percentage). The row's own ladder,
 * read from its lowest threshold up to the last one that leaves the uncovered count unchanged; above that the
 * figure enters another regime and the band would hide the jump. All-order generous: 66.8 to 67.8 over 0.50 to
 * 0.65 (AC-LOOP-02). Null when the ladder does not carry the row's own threshold.
 */
export type SensitivityBand = { low: string; high: string; from: string; to: string };

const T_DIGITS = 2;

export function sensitivityBand(s: CoverageSummary): SensitivityBand | null {
  const here = s.sensitivity.find((r) => r.t === s.threshold);
  const first = s.sensitivity[0];
  if (!here || !first) return null;
  const hold = s.sensitivity.filter((r) => r.uncovered_count === here.uncovered_count);
  const to = hold[hold.length - 1] ?? here;
  const within = s.sensitivity.filter((r) => r.t <= to.t);
  const counts = within.map((r) => r.uncovered_count);
  return {
    low: share(Math.min(...counts), s.population_count),
    high: share(Math.max(...counts), s.population_count),
    from: first.t.toFixed(T_DIGITS),
    to: to.t.toFixed(T_DIGITS),
  };
}

/** The stored report_date split for a dense column; every character of the workbook's own string is kept. */
export function reportedAt(reportDate: string): { date: string; time: string } {
  const [date, time = ""] = reportDate.split("T");
  return { date: date ?? reportDate, time };
}

/** Hours at the column's one decimal (numeric(6,1)). */
export function hoursText(h: number): string {
  return `${h.toFixed(1)} h`;
}

/** Rupiah with digit grouping. */
export function idrText(idr: number): string {
  return `IDR ${grouped.format(idr)}`;
}

/** The record's narrative field as the workbook names it. */
export const FIELD_LABEL: Record<NonNullable<CoverageAssessment["matched_field"]>, string> = {
  problem_description: "Problem_Description",
  root_cause: "Root_Cause",
  corrective_action: "Corrective_Action",
};

/** 6.3: a cluster whose asset carries no uncovered record is a designed statement, never an empty list. */
export const NO_UNCOVERED_STATEMENT =
  "No record of this asset is uncovered under the generous layer on this version; the score carries the criticality and family-share factors alone.";

/** The labels status of 9.5 in words; the machine-drafted wording itself is the StatusBadge's. */
export const LABELS_STATUS_TEXT: Record<CoverageMethod["labels_status"], string> = {
  machine_drafted_pending_human: "pending human adjudication (OQ-6)",
  human_adjudicated: "human-adjudicated",
};
