// The two artefacts of a run: the JSON report the Evaluation page ingests (9.7 EvaluationRun and EvaluationResult
// carry the same fields) and the Markdown summary a reviewer reads, per category, the two hard-gated categories
// first (AC-EVAL-03's order, kept here so the file and the page agree).
//
// Three verdicts, per 9.7: pass, fail, skipped. A check the runner cannot evaluate is neither a pass nor a fail;
// it is counted as unsupported on its case and totalled at the head of the summary, so the report never reads
// greener than the runner is. A case is skipped when its setup is not one the runner can satisfy, or when not one
// of its checks could be evaluated. Nothing printed here is a claim text, a span or a question: failures name the
// check, the field path and the counts.
import { writeFileSync } from "node:fs";
import { EvaluationResult, EvaluationRun } from "../../src/contracts/generated/serving";
import { CATEGORIES, HARD_GATED_CATEGORIES } from "./cases";

export type Failure = { check: string; detail: string };

export type Result = {
  case_id: string;
  category: string;
  hard_gate: boolean;
  tier: "A" | "B";
  /** The case's expected outcome, carried through to EvaluationResult.expected (9.7). */
  expected: string;
  pass: boolean;
  verdict: "pass" | "fail" | "skipped";
  failures: Failure[];
  unsupported: Failure[];
  notes: string[];
  skipped_reason: string | null;
  trace_id: string | null;
  latency_ms: number;
  line1_ms: number | null;
};

export type Run = {
  tier: "A" | "B" | "all";
  base_url: string;
  started_at: string;
  finished_at: string;
  model_ids: Record<string, string>;
  prompt_versions: Record<string, string>;
  rulepack_version: string;
  corpus_version: string;
  harness_commit: string;
  git_sha: string;
};

export type Report = { run: Run; results: Result[] };

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[at] ?? null;
}

/** The categories present, the two hard-gated ones first, then the rest in the order of 9.11. */
export function categoryOrder(results: Result[]): string[] {
  const present = new Set(results.map((r) => r.category));
  const known = CATEGORIES.filter((c) => present.has(c));
  const unknown = [...present].filter((c) => !CATEGORIES.includes(c as (typeof CATEGORIES)[number])).sort();
  return [...known, ...unknown];
}

export function hardGateTally(results: Result[]): { passed: number; total: number; failed: string[]; skipped: string[] } {
  const hard = results.filter((r) => r.hard_gate);
  return {
    passed: hard.filter((r) => r.verdict === "pass").length,
    total: hard.length,
    failed: hard.filter((r) => r.verdict === "fail").map((r) => r.case_id),
    skipped: hard.filter((r) => r.verdict === "skipped").map((r) => r.case_id),
  };
}

// One table row per case; the failure and not-evaluated lines go under the table, where they are readable.
function row(r: Result): string {
  const detail = r.verdict === "skipped" ? (r.skipped_reason ?? "skipped") : r.failures.length === 0 ? "" : `${r.failures.length} failing`;
  const gaps = r.unsupported.length === 0 ? "" : String(r.unsupported.length);
  return `| ${r.case_id} | ${r.tier} | ${r.hard_gate ? "yes" : "no"} | ${r.verdict} | ${r.line1_ms ?? ""} | ${r.latency_ms} | ${gaps} | ${detail.replace(/\|/g, "/")} |`;
}

export function markdown(report: Report): string {
  const { run, results } = report;
  const hard = hardGateTally(results);
  const passed = results.filter((r) => r.verdict === "pass").length;
  const failed = results.filter((r) => r.verdict === "fail").length;
  const skipped = results.filter((r) => r.verdict === "skipped").length;
  const notEvaluated = results.reduce((n, r) => n + r.unsupported.length, 0);
  const line1 = results.map((r) => r.line1_ms).filter((v): v is number => v !== null);
  const total = results.map((r) => r.latency_ms);

  const out: string[] = [
    `# Golden set, tier ${run.tier}`,
    "",
    `- base URL: ${run.base_url}`,
    `- corpus version: ${run.corpus_version}; rule pack: ${run.rulepack_version}; harness commit: ${run.harness_commit.slice(0, 12)}`,
    `- application commit: ${run.git_sha.slice(0, 12)}`,
    `- model ids: ${Object.entries(run.model_ids).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    `- prompt versions: ${Object.entries(run.prompt_versions).map(([k, v]) => `${k}=${v.slice(0, 12)}`).join(", ")}`,
    `- started ${run.started_at}, finished ${run.finished_at}`,
    "",
    `**${passed} passed, ${failed} failed, ${skipped} skipped of ${results.length}.** Hard gates ${hard.passed} of ${hard.total}.`,
    "",
    `${notEvaluated} check(s) were not evaluated by the runner (arguments outside the ask lane); they are listed per case below and count as neither a pass nor a fail.`,
    "",
    `Line 1 (AC-NFR-04, the evidence list): p50 ${percentile(line1, 50) ?? "n/a"} ms, p95 ${percentile(line1, 95) ?? "n/a"} ms. Whole packet: p50 ${percentile(total, 50) ?? "n/a"} ms, p95 ${percentile(total, 95) ?? "n/a"} ms.`,
    "",
  ];
  if (hard.failed.length > 0) out.push(`Hard-gated failures: ${hard.failed.join(", ")}.`, "");
  if (hard.skipped.length > 0) out.push(`Hard-gated cases skipped (the gate is not proved): ${hard.skipped.join(", ")}.`, "");

  for (const category of categoryOrder(results)) {
    const inCategory = results.filter((r) => r.category === category);
    const green = inCategory.filter((r) => r.verdict === "pass").length;
    const gate = HARD_GATED_CATEGORIES.includes(category as (typeof HARD_GATED_CATEGORIES)[number]) ? " (hard gate)" : "";
    out.push(
      `## ${category}${gate}: ${green} of ${inCategory.length}`,
      "",
      "| case | tier | hard gate | verdict | line 1 ms | total ms | not evaluated | detail |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...inCategory.map(row),
      "",
    );
    const failures = inCategory.flatMap((r) => r.failures.map((f) => `- ${r.case_id} ${f.check}: ${f.detail}`));
    if (failures.length > 0) out.push("Failures:", ...failures, "");
    const notes = inCategory.flatMap((r) => r.notes.map((n) => `- ${r.case_id}: ${n}`));
    if (notes.length > 0) out.push("Notes:", ...notes, "");
    const gaps = inCategory.flatMap((r) => r.unsupported.map((u) => `- ${r.case_id} ${u.check}: ${u.detail}`));
    if (gaps.length > 0) out.push("Not evaluated:", ...gaps, "");
  }
  return out.join("\n");
}

// The report as POST /api/evaluation/runs takes it (9.7, strict): EvaluationRun plus one EvaluationResult per case.
// The corpus version id is derived from bundle/manifest.json by the same rule the seed uses (src/lib/version-id.ts),
// so the runner never guesses it from a label. The run id is stable inside one CI run, so a retried post is the
// idempotent repeat the route answers with 200 and `ingested: false` rather than a second row.
export function evaluationPayload(report: Report, corpusVersionId: string): { run: EvaluationRun; results: EvaluationResult[] } {
  const sha = report.run.git_sha.slice(0, 12) || "local";
  const id = `${report.run.tier}-${sha}-${process.env.GITHUB_RUN_ID ?? report.run.started_at}`;
  const run = EvaluationRun.parse({
    id,
    corpus_version_id: corpusVersionId,
    harness_commit: report.run.harness_commit,
    model_pins: report.run.model_ids,
    prompt_versions: report.run.prompt_versions,
    rulepack_version: report.run.rulepack_version,
    started_at: report.run.started_at,
    finished_at: report.run.finished_at,
    tier: report.run.tier === "all" ? "full" : report.run.tier,
    ingested_by: "ci",
  });
  const results = report.results.map((r) =>
    EvaluationResult.parse({
      run_id: id,
      case_id: r.case_id,
      category: r.category,
      hard_gate: r.hard_gate,
      verdict: r.verdict,
      expected: r.expected,
      failure_reason:
        r.verdict === "skipped"
          ? r.skipped_reason
          : r.failures.length === 0
            ? null
            : r.failures.map((f) => `${f.check}: ${f.detail}`).join("; "),
    }),
  );
  return { run, results };
}

export function write(report: Report, jsonPath: string, markdownPath: string): void {
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, `${markdown(report)}\n`);
}
