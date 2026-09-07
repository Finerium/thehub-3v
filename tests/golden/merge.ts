// Merge the id-scoped chunk reports of one tier into the tier's report of record, and post a report to
// POST /api/evaluation/runs (blueprint 9.7, 9.11; AC-EVAL-02).
//
//   pnpm exec tsx tests/golden/merge.ts --tier B --in dir1,dir2,dir3 --out .golden/b
//   pnpm exec tsx tests/golden/merge.ts --tier A --in .golden/a --ingest-url https://...
//
// Tier B is run in id-scoped chunks so a provider stall costs one chunk rather than the tier. Every chunk writes
// the same shape through scripts/golden/report.ts, so the merge is a concatenation in the order the chunks were
// given, written back through that same writer: the merged Markdown and JSON are the runner's own, not a second
// rendering that could disagree with it. Nothing here re-evaluates a case, changes a verdict or drops a failure;
// a case id appearing in two chunks keeps its last reading and is reported on stderr.
//
// The ingest is the runner's, lifted here only so the merged Tier B report can be posted and so the status the
// route answered is printed rather than swallowed by a throw. The token is read from the environment into the
// header and is never printed, logged or written to a report.
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { seededVersionFromBundle } from "../../src/lib/version-id";
import { evaluationPayload, write, type Report, type Result } from "../../scripts/golden/report";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

function value(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag);
  return at === -1 ? null : (argv[at + 1] ?? null);
}

function readReport(dir: string, suffix: string): Report {
  return JSON.parse(readFileSync(path.join(dir, `golden-${suffix}.json`), "utf8")) as Report;
}

export function merge(reports: Report[]): Report {
  const first = reports[0];
  if (!first) throw new Error("no chunk report to merge");
  const byCase = new Map<string, Result>();
  for (const report of reports) {
    for (const result of report.results) {
      if (byCase.has(result.case_id)) console.error(`${result.case_id} appears in more than one chunk; the last reading is kept`);
      byCase.set(result.case_id, result);
    }
  }
  const started = reports.map((r) => r.run.started_at).sort();
  const finished = reports.map((r) => r.run.finished_at).sort();
  return {
    run: { ...first.run, started_at: started[0] ?? first.run.started_at, finished_at: finished[finished.length - 1] ?? first.run.finished_at },
    results: [...byCase.values()],
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const tier = value(argv, "--tier");
  if (tier !== "A" && tier !== "B") throw new Error("--tier must be A or B");
  const suffix = tier.toLowerCase();
  const dirs = (value(argv, "--in") ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (dirs.length === 0) throw new Error("--in takes a comma-separated list of chunk directories");
  const out = value(argv, "--out") ?? dirs[0];
  if (!out) throw new Error("--out is required");

  const report = merge(dirs.map((dir) => readReport(dir, suffix)));
  mkdirSync(out, { recursive: true });
  const jsonPath = path.join(out, `golden-${suffix}.json`);
  write(report, jsonPath, path.join(out, `golden-${suffix}.md`));
  console.log(`merged ${dirs.length} chunk(s), ${report.results.length} case(s) -> ${jsonPath}`);

  const ingestUrl = value(argv, "--ingest-url");
  if (ingestUrl === null) return;
  const token = process.env.CI_INGEST_TOKEN;
  if (!token) throw new Error("CI_INGEST_TOKEN is not set in the environment");
  const bundleDir = value(argv, "--bundle") ?? path.join(ROOT, "bundle");
  const payload = evaluationPayload(report, seededVersionFromBundle(bundleDir).id);
  const response = await fetch(`${ingestUrl.replace(/\/$/, "")}/api/evaluation/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  console.log(`ingest run_id ${payload.run.id}: POST /api/evaluation/runs -> ${response.status} ${JSON.stringify(body)}`);
  if (response.status !== 200 && response.status !== 201) process.exitCode = 1;
}

// Only when this file is the process entry: ./merge.test.ts imports merge() and must not start a run.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === import.meta.filename) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
