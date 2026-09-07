// The evaluation reads and the one ingest write (blueprint 9.7 EvaluationRun and EvaluationResult, 9.9, 6.2
// surface 10; AC-EVAL-03, AC-EVAL-04, AC-EVAL-06): CI posts a finished run with one row per golden case, the
// Evaluation page reads the latest ingested run with its pins, its per-category pass rates and its full failure
// list. Every row leaves through the generated Zod of 9.7 (ARCHITECTURE 1.4); Drizzle only, parameterised.
//
// Two decisions worth stating, both forced by the frozen 9.7 shapes:
//   - the pass rates are computed here, on read, from the stored result rows, not stamped on the run at ingest:
//     `evaluation_run` holds no rate column (9.7 is frozen) and a rate derived from stored rows is a pure function
//     of stored data, so two reads of one run agree for ever (AC-NFR-06). The page still computes nothing itself.
//   - the category list is the eleven of 9.11, always all eleven, so a category the run holds no case for says so
//     with the one fixed sentence (6.2 surface 10). A category name a run carries that 9.11 does not know is kept
//     and appended rather than dropped, because dropping it would make the totals lie.
// Row volume is bounded by the golden set (102 cases at v1), so a run's rows are read whole and aggregated here.
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { GoldenCase } from "@/contracts/generated/golden_case";
import { EvaluationResult, EvaluationRun } from "@/contracts/generated/serving";
import { db, withTransaction } from "@/db/client";
import { corpusVersion, evaluationResult, evaluationRun } from "@/db/schema";
import { NO_CASES_IN_CATEGORY } from "@/lib/fixed-strings";

/** The eleven categories of 9.11, in the frozen order of the contract. */
export const CATEGORIES = GoldenCase.shape.category.options;
type Category = (typeof CATEGORIES)[number];

/** 9.11: `hard_gate` is true for every case of the two safety categories. A rename in the contract breaks here. */
export const HARD_GATE_CATEGORIES: readonly Category[] = ["Safety refusal", "Safety-adjacent served"];

/** One row of the per-category table of surface 10. `pass_rate` is null exactly when the run holds no case. */
export const EvaluationCategory = z
  .object({
    category: z.string(),
    hard_gate: z.boolean(),
    cases: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
    /** passed / cases, the denominator counting skipped cases: a skipped case is not a pass (AC-EVAL-06). */
    pass_rate: z.number().nullable(),
    /** The fixed sentence when the run holds no case of this category, null otherwise. */
    no_cases: z.string().nullable(),
  })
  .strict();
export type EvaluationCategory = z.infer<typeof EvaluationCategory>;

/** The 9.9 response of GET /api/evaluation/latest. `failures` carries every row whose verdict is not "pass"; each
 *  row states its own verdict, so a skipped case is published as skipped and never hidden. */
export const EvaluationLatest = z
  .object({ run: EvaluationRun, categories: z.array(EvaluationCategory), failures: z.array(EvaluationResult) })
  .strict();
export type EvaluationLatest = z.infer<typeof EvaluationLatest>;

function toRun(row: typeof evaluationRun.$inferSelect): EvaluationRun {
  return EvaluationRun.parse({
    id: row.id,
    corpus_version_id: row.corpusVersionId,
    harness_commit: row.harnessCommit,
    model_pins: row.modelPins,
    prompt_versions: row.promptVersions,
    rulepack_version: row.rulepackVersion,
    started_at: new Date(row.startedAt).toISOString(),
    finished_at: new Date(row.finishedAt).toISOString(),
    tier: row.tier,
    ingested_by: row.ingestedBy,
  });
}

function toResult(row: typeof evaluationResult.$inferSelect): EvaluationResult {
  return EvaluationResult.parse({
    run_id: row.runId,
    case_id: row.caseId,
    category: row.category,
    hard_gate: row.hardGate,
    verdict: row.verdict,
    expected: row.expected,
    failure_reason: row.failureReason,
  });
}

/** The position of a category in the frozen order of 9.11; anything 9.11 does not name sorts after all of them. */
function position(category: string): number {
  const known = CATEGORIES.indexOf(category as Category);
  return known === -1 ? CATEGORIES.length : known;
}

/** Hard-gated categories first, then the frozen order of 9.11 (6.2 surface 10, AC-EVAL-03). */
function byCategory(a: { category: string; hard_gate: boolean }, b: { category: string; hard_gate: boolean }): number {
  return Number(a.hard_gate === false) - Number(b.hard_gate === false) || position(a.category) - position(b.category);
}

function summarise(category: string, rows: readonly EvaluationResult[]): EvaluationCategory {
  const hardGate = HARD_GATE_CATEGORIES.includes(category as Category) || rows.some((r) => r.hard_gate);
  const passed = rows.filter((r) => r.verdict === "pass").length;
  const failed = rows.filter((r) => r.verdict === "fail").length;
  return {
    category,
    hard_gate: hardGate,
    cases: rows.length,
    passed,
    failed,
    skipped: rows.length - passed - failed,
    pass_rate: rows.length === 0 ? null : passed / rows.length,
    no_cases: rows.length === 0 ? NO_CASES_IN_CATEGORY : null,
  };
}

/** The per-category table of surface 10: all eleven categories of 9.11 plus any the run named that 9.11 does not,
 *  hard-gated first. Pure, so it is checked without a database. */
export function categoriesOf(results: readonly EvaluationResult[]): EvaluationCategory[] {
  const names = [...CATEGORIES, ...results.map((r) => r.category).filter((c) => !CATEGORIES.includes(c as Category))];
  return [...new Set(names)]
    .map((name) =>
      summarise(
        name,
        results.filter((r) => r.category === name),
      ),
    )
    .sort(byCategory);
}

/** Every row whose verdict is not "pass", hard-gated categories first, then the 9.11 order, then the case id. */
export function failuresOf(results: readonly EvaluationResult[]): EvaluationResult[] {
  return results
    .filter((r) => r.verdict !== "pass")
    .sort((a, b) => byCategory(a, b) || a.case_id.localeCompare(b.case_id));
}

/** The latest ingested run with its per-category rates and its failure list, or null while none is ingested. */
export async function latestEvaluation(): Promise<EvaluationLatest | null> {
  const [row] = await db
    .select()
    .from(evaluationRun)
    .orderBy(desc(evaluationRun.finishedAt), desc(evaluationRun.id))
    .limit(1);
  if (!row) return null;

  const rows = await db
    .select()
    .from(evaluationResult)
    .where(eq(evaluationResult.runId, row.id))
    .orderBy(asc(evaluationResult.caseId));
  const results = rows.map(toResult);

  return { run: toRun(row), categories: categoriesOf(results), failures: failuresOf(results) };
}

/** True when the run's corpus version exists, so the ingest answers a designed 404 instead of a foreign-key 500. */
export async function corpusVersionExists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: corpusVersion.id }).from(corpusVersion).where(eq(corpusVersion.id, id)).limit(1);
  return row !== undefined;
}

/** Ingests a finished run and its rows in one transaction. Idempotent on the run id: a repeat of a run already
 *  stored writes nothing and returns false, so a retried CI post never duplicates or rewrites a stored result. */
export async function ingestRun(run: EvaluationRun, results: readonly EvaluationResult[]): Promise<boolean> {
  return withTransaction(async (tx) => {
    const [inserted] = await tx
      .insert(evaluationRun)
      .values({
        id: run.id,
        corpusVersionId: run.corpus_version_id,
        harnessCommit: run.harness_commit,
        modelPins: run.model_pins,
        promptVersions: run.prompt_versions,
        rulepackVersion: run.rulepack_version,
        startedAt: new Date(run.started_at),
        finishedAt: new Date(run.finished_at),
        tier: run.tier,
        ingestedBy: run.ingested_by,
      })
      .onConflictDoNothing()
      .returning({ id: evaluationRun.id });
    if (!inserted) return false;

    if (results.length > 0) {
      await tx.insert(evaluationResult).values(
        results.map((r) => ({
          runId: run.id,
          caseId: r.case_id,
          category: r.category,
          hardGate: r.hard_gate,
          verdict: r.verdict,
          expected: r.expected,
          failureReason: r.failure_reason,
        })),
      );
    }
    return true;
  });
}
