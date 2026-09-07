// The knowledge-debt ranking of blueprint 9.5 (harness/debt.py `rank` at 19-54), in the fixture spelling of
// harness/entities.py `debt_clusters` at 1110-1133.
//
//   score = 0.4 D/Dmax + 0.3 C/Cmax + 0.2 k + 0.1 r
//
// over the generous-uncovered unplanned-failure work orders of the asset: D is their unplanned-breakdown downtime,
// C their recorded cost, k the datasheet criticality and r the share of the asset's unplanned-failure rows that
// belong to any failure family. A row with an incomplete closeout contributes zero to C and one to
// `incomplete_uncovered` while staying an event of r (harness/debt.py:33, 36). The four coefficients are a product
// decision and carry the basis ASSUMPTION on every surface that prints them; they are not a measured quantity.
//
// Frozen rules, ported field by field: every asset of criticalityByTag appears whether or not it has an uncovered
// row, the uncovered ids are sorted (and summed in that order, so the float total is the reference's), a zero fleet
// maximum makes that term zero rather than NaN, the score is rounded to 4 dp, and the ranking is score descending
// with ties broken by tag ascending.
import type * as coverage from "@/contracts/generated/coverage";
import type * as operations from "@/contracts/generated/operations";
import { ASSUMPTION_LABEL } from "@/lib/fixed-strings";
import { round4 } from "./score";
import { populationsOf } from "./summary";

/** harness/debt.py:14-15, renamed at harness/analyze_corpus.py:340-347: D, C, k, r and the basis they carry. */
export const COEFFICIENTS: coverage.DebtCluster["coefficients"] = {
  a: 0.4,
  b: 0.3,
  c: 0.2,
  d: 0.1,
  basis: ASSUMPTION_LABEL,
};

/** harness/debt.py:16: the datasheet criticality as the k term. */
export const K_BY_CRITICALITY: Readonly<Record<string, number>> = {
  "HIGH CRITICAL": 1,
  "LOW CRITICAL": 0.5,
  "NON CRITICAL": 0.25,
};

/** One ranked asset before a corpus version owns it; recount.ts adds `id`, `corpus_version_id` and `coefficients`. */
export type DebtRow = Omit<coverage.DebtCluster, "id" | "corpus_version_id" | "coefficients">;

export type DebtInput = {
  /** Every work order of the version: the r term reads the asset's whole unplanned-failure population, not the uncovered part. */
  workOrders: readonly operations.WorkOrder[];
  /** The generous-uncovered unplanned-failure work orders at t (harness/debt.py:22). */
  uncoveredWoNumbers: readonly string[];
  /** Datasheet criticality per tag; every asset of the fleet must be present, uncovered or not. */
  criticalityByTag: Readonly<Record<string, string>>;
  /** Every work order that belongs to any failure family (harness/master.py:308-315). */
  familyMembers: ReadonlySet<string>;
};

/** r: the share of the asset's unplanned-failure rows that belong to any family, at 4 dp (harness/master.py:315). */
export function familyShare(
  unplannedFailureOfAsset: readonly operations.WorkOrder[],
  familyMembers: ReadonlySet<string>,
): number {
  if (unplannedFailureOfAsset.length === 0) return 0;
  const inFamily = unplannedFailureOfAsset.filter((w) => familyMembers.has(w.wo_number)).length;
  return round4(inFamily / unplannedFailureOfAsset.length);
}

function kOf(criticality: string): number {
  const k: number | undefined = K_BY_CRITICALITY[criticality];
  if (k === undefined) {
    throw new Error(`no k term for the datasheet criticality ${JSON.stringify(criticality)} (harness/debt.py:16)`);
  }
  return k;
}

/** The eight assets ranked, in rank order (harness/debt.py:19). */
export function rankDebt({ workOrders, uncoveredWoNumbers, criticalityByTag, familyMembers }: DebtInput): DebtRow[] {
  const tags = Object.keys(criticalityByTag).sort();
  if (tags.length === 0) return [];

  const byWo = new Map(workOrders.map((w) => [w.wo_number, w]));
  // harness/debt.py:28: the uncovered rows in sorted id order, which is also the order D and C are summed in.
  const uncovered = [...uncoveredWoNumbers].sort().map((wo) => {
    const row = byWo.get(wo);
    if (row === undefined) throw new Error(`uncovered work order ${wo} is not among the work orders of this version`);
    return row;
  });
  const unplannedFailure = populationsOf(workOrders).unplanned_failure;

  const per = tags.map((tag) => {
    const mine = uncovered.filter((w) => w.equipment_tag === tag);
    return {
      equipment_tag: tag,
      uncovered_wo_numbers: mine.map((w) => w.wo_number),
      D_hours: mine
        .filter((w) => w.breakdown_kind === "unplanned")
        .reduce((total, w) => total + (w.downtime_hours ?? 0), 0),
      C_idr: mine.filter((w) => w.closeout_complete).reduce((total, w) => total + (w.total_cost_idr ?? 0), 0),
      k: kOf(criticalityByTag[tag]),
      r: familyShare(
        unplannedFailure.filter((w) => w.equipment_tag === tag),
        familyMembers,
      ),
      incomplete_uncovered: mine.filter((w) => !w.closeout_complete).length,
    };
  });

  const dMax = Math.max(...per.map((p) => p.D_hours));
  const cMax = Math.max(...per.map((p) => p.C_idr));
  const scored = per.map((p) => ({
    equipment_tag: p.equipment_tag,
    uncovered_wo_numbers: p.uncovered_wo_numbers,
    factors: { D_hours: p.D_hours, D_max: dMax, C_idr: p.C_idr, C_max: cMax, k: p.k, r: p.r },
    incomplete_uncovered: p.incomplete_uncovered,
    // harness/debt.py:41-45, term by term and in this order: the float sum is the reference's, not a rearrangement.
    score: round4(
      COEFFICIENTS.a * (dMax ? p.D_hours / dMax : 0) +
        COEFFICIENTS.b * (cMax ? p.C_idr / cMax : 0) +
        COEFFICIENTS.c * p.k +
        COEFFICIENTS.d * p.r,
    ),
  }));

  // harness/debt.py:46: score descending, ties broken by tag ascending.
  return scored
    .sort((a, b) => b.score - a.score || (a.equipment_tag < b.equipment_tag ? -1 : 1))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
