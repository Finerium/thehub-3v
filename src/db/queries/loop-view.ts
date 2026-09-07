// The reads behind the guided loop (blueprint 6.2 surface 11, 9.5, 9.6, 9.7; ARCHITECTURE 8.5, 8.6; AC-LOOP-12,
// AC-LOOP-13). One route walks abstain, request, draft, review, publish and ask again on the visitor's sandbox, so
// this module answers three questions at request time and nothing else:
//
//   1. which corpus version the visitor sees now and what its coverage reads (the "before" of the recount);
//   2. which knowledge-debt cluster the walk targets, and which of its records carry no lesson yet;
//   3. what the visitor already has in this browser's sandbox (a draft on that cluster) and which demo account
//      holds each role, so a step the session cannot take can offer the role switch of D-16.
//
// Every figure leaves as a row of the database read through the generated Zod of 9.5 (ARCHITECTURE 1.4): the
// summaries, the cluster and the records are the same rows the Coverage Console renders, so the loop and the
// Console can never disagree. The "after" half of the recount is not read here: it is what POST
// /api/drafts/:id/publish returns and what GET /api/coverage reads back, which is the point of the moment.
// Nothing here writes.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { visibleVersionIds, type Sandbox } from "@/auth/sandbox";
import { CoverageMethod, CoverageSummary, DebtCluster } from "@/contracts/generated/coverage";
import type { DraftDocument } from "@/contracts/generated/drafts";
import type { Role } from "@/contracts/generated/serving";
import { db } from "@/db/client";
import { toDraftDocument } from "@/db/queries/loop";
import { appUser, corpusVersion, coverageMethod, coverageSummary, debtCluster, draftDocument, workOrder } from "@/db/schema";
import { HEADLINE_POPULATION, type Layer, type VersionRef } from "./coverage";

/** The layer the walk headlines, and the one AC-LOOP-12 counts the fall of one in. */
export const HEADLINE_LAYER: Layer = "generous";

/** One layer's reading of the headline population, as coverage_summary stores it. */
export type LayerReading = Pick<CoverageSummary, "layer" | "threshold" | "uncovered_count" | "population_count" | "bands">;

/** What the recount compares: one corpus version, both layers of the headline population, and the target cluster. */
export type LoopSnapshot = {
  version: VersionRef;
  generous: LayerReading;
  strict: LayerReading;
  /** The target cluster as this version ranks it; null when the version no longer carries one for the asset. */
  cluster: DebtCluster | null;
};

/** One uncovered record of the target cluster, in the record's own words. */
export type UncoveredRecord = {
  wo_number: string;
  equipment_tag: string;
  report_date: string;
  problem_description: string;
  corrective_action: string;
  priority: string;
  closeout_complete: boolean;
};

export type LoopView = {
  /** The reading before the walk: the version the visitor sees and its two layers. */
  before: LoopSnapshot;
  /** The recipe both readings run under; the recount copies it forward and the surface shows its digests. */
  method: CoverageMethod;
  /** The uncovered records of the target cluster, newest first; the walk teaches the first of them. */
  records: UncoveredRecord[];
  /** The visitor's newest draft on that cluster in this browser's sandbox, so a reload resumes the walk. */
  draft: DraftDocument | null;
  /** username by role for the three demo accounts (9.7 AppUser.is_demo), the role switch of D-16. */
  demoUsernames: Partial<Record<Role, string>>;
};

/* Row mappers (snake_case out, validated by the contract of 9.5) ------------------------------------------------ */

function toReading(r: typeof coverageSummary.$inferSelect): LayerReading {
  const parsed = CoverageSummary.parse({
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
  return { layer: parsed.layer, threshold: parsed.threshold, uncovered_count: parsed.uncovered_count, population_count: parsed.population_count, bands: parsed.bands };
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

/* Reads --------------------------------------------------------------------------------------------------------- */

/** The version the visitor's coverage is read from: the sandbox's own recount when it has one, else the lineage. */
async function shownVersion(box: Pick<Sandbox, "corpusVersionId"> | null): Promise<VersionRef | null> {
  const ids = await visibleVersionIds(box);
  if (ids.length === 0) return null;
  const rows = await db
    .select({ id: corpusVersion.id, label: corpusVersion.label, isActive: corpusVersion.isActive, corpusSha256: corpusVersion.corpusSha256 })
    .from(corpusVersion)
    .innerJoin(coverageMethod, eq(coverageMethod.corpusVersionId, corpusVersion.id))
    .where(inArray(corpusVersion.id, ids));
  const withCoverage = new Map(rows.map((r) => [r.id, { id: r.id, label: r.label, is_active: r.isActive, corpus_sha256: r.corpusSha256 }] as const));
  const own = box?.corpusVersionId ?? null;
  return (own !== null ? withCoverage.get(own) : undefined) ?? ids.map((id) => withCoverage.get(id)).find((v) => v !== undefined) ?? null;
}

/** Both layers of the headline population for one version, or null when either row is missing. */
async function headlineOf(versionId: string): Promise<{ generous: LayerReading; strict: LayerReading } | null> {
  const rows = await db
    .select()
    .from(coverageSummary)
    .where(and(eq(coverageSummary.corpusVersionId, versionId), eq(coverageSummary.population, HEADLINE_POPULATION)));
  const readings = rows.map(toReading);
  const generous = readings.find((r) => r.layer === "generous");
  const strict = readings.find((r) => r.layer === "strict");
  return generous && strict ? { generous, strict } : null;
}

/** The three demo accounts by role (9.7 AppUser); the Admin account is not a demo account and never appears. */
export async function demoUsernames(): Promise<Partial<Record<Role, string>>> {
  const rows = await db.select({ role: appUser.role, username: appUser.username }).from(appUser).where(eq(appUser.isDemo, true));
  return Object.fromEntries(rows.map((r) => [r.role, r.username] as const));
}

/**
 * The whole sheet the guided route opens on, or null when no visible version carries coverage rows or the version
 * ranks no cluster (the designed "nothing to walk" state; never a placeholder).
 */
export async function readLoopView(box: Pick<Sandbox, "id" | "corpusVersionId"> | null): Promise<LoopView | null> {
  const version = await shownVersion(box);
  if (!version) return null;

  const [headline, methodRows, clusterRows] = await Promise.all([
    headlineOf(version.id),
    db.select().from(coverageMethod).where(eq(coverageMethod.corpusVersionId, version.id)).limit(1),
    db
      .select()
      .from(debtCluster)
      .where(eq(debtCluster.corpusVersionId, version.id))
      .orderBy(asc(debtCluster.rank), asc(debtCluster.equipmentTag))
      .limit(1),
  ]);
  const methodRow = methodRows[0];
  const clusterRow = clusterRows[0];
  if (!headline || !methodRow || !clusterRow) return null;
  const cluster = toCluster(clusterRow);

  // The records the cluster names, newest first: the walk teaches the first of them and the recount moves it.
  const recordRows =
    cluster.uncovered_wo_numbers.length === 0
      ? []
      : await db
          .select({
            woNumber: workOrder.woNumber,
            equipmentTag: workOrder.equipmentTag,
            reportDate: workOrder.reportDate,
            problemDescription: workOrder.problemDescription,
            correctiveAction: workOrder.correctiveAction,
            priority: workOrder.priority,
            closeoutComplete: workOrder.closeoutComplete,
          })
          .from(workOrder)
          .where(inArray(workOrder.woNumber, cluster.uncovered_wo_numbers))
          .orderBy(desc(workOrder.reportDate));

  // D-16: the sandbox is the browser, so the walk resumes from the draft this browser owns on that cluster. The
  // reserved lesson id is the asset's own increasing counter (src/loop/queries.ts nextOplId), so ordering on it
  // descending is the newest draft without a created_at column the 9.6 shape does not have.
  const draftRows =
    box === null
      ? []
      : await db
          .select()
          .from(draftDocument)
          .where(and(eq(draftDocument.clusterId, cluster.id), eq(draftDocument.sessionScope, box.id)))
          .orderBy(desc(draftDocument.oplIdReserved))
          .limit(1);

  return {
    before: { version, generous: headline.generous, strict: headline.strict, cluster },
    method: toMethod(methodRow),
    records: recordRows.map((r) => ({
      wo_number: r.woNumber,
      equipment_tag: r.equipmentTag,
      report_date: r.reportDate,
      problem_description: r.problemDescription,
      corrective_action: r.correctiveAction,
      priority: r.priority,
      closeout_complete: r.closeoutComplete,
    })),
    draft: draftRows[0] ? toDraftDocument(draftRows[0]) : null,
    demoUsernames: await demoUsernames(),
  };
}
