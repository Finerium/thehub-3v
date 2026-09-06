// `pnpm db:seed --bundle <dir>` (ARCHITECTURE 2; AC-ING-09, AC-ING-10, AC-ING-15): G1 first, then the seed.
// G1 (src/gates/g1.ts) admits the bundle directory or prints every violation by kind and file and exits 1 before
// any database connection is opened. An admitted bundle is seeded by src/db/seed (one transaction per family,
// upserts only, nothing deleted) and its corpus version is activated through src/db/versions.ts. The run ends
// with the rows written per table, the row counts of every seeded table, the version id and the wall time.
//
//   --bundle <dir>   the bundle directory (default: bundle/ of this repository, the pulled public release)
//   --public-only    the seed-time files chunks.jsonl, pages/ and opls.json may be absent (D-17)
//   --dry-run        G1 only: admit or reject, no database
//
// dotenv-cli loads the development env file; this file reads process.env only through src/db/client.ts and
// never prints a value.
import path from "node:path";
import { seedBundle, seededTableCounts } from "../../src/db/seed";
import { admit, formatViolations } from "../../src/gates/g1";

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

async function main(): Promise<void> {
  const started = performance.now();
  const bundleDir = path.resolve(option("--bundle") ?? "bundle");
  const publicOnly = flag("--public-only");

  const admission = await admit(bundleDir, { publicOnly });
  const g1Ms = Math.round(performance.now() - started);
  if (!admission.ok) {
    console.error(`G1: REJECT ${bundleDir}: ${admission.violations.length} violation(s) after ${admission.checks.length} checks (${g1Ms} ms)`);
    console.error(formatViolations(admission.violations));
    process.exit(1);
  }
  console.log(`G1: ADMIT bundle ${admission.manifest.bundle_version} at ${bundleDir} (${admission.checks.length} checks, ${admission.manifest.files.length} files, ${g1Ms} ms)`);
  if (flag("--dry-run")) return;

  const result = await seedBundle(admission.bundle, { log: console.log });
  const counts = await seededTableCounts();

  console.log("");
  console.log("rows written per table");
  for (const [table, n] of Object.entries(result.written)) console.log(`  ${table} ${n}`);
  console.log("row counts (every seeded table)");
  for (const [table, n] of counts) console.log(`  ${table} ${n}`);
  console.log("");
  console.log(`corpus_version ${result.versionId} (${result.label}) active`);
  console.log(`families: ${result.families.map((f) => `${f.name} ${f.ms} ms`).join(", ")}`);
  for (const note of result.notes) console.log(`note ${note}`);
  if (result.revisionDivergence.length > 0) {
    console.log(`WARNING current revision divergence after activation: ${result.revisionDivergence.length} documents (${result.revisionDivergence.slice(0, 3).join(", ")})`);
  } else {
    console.log("current revisions after activation equal the bundle's (0 documents diverge)");
  }
  console.log(`wall time ${((performance.now() - started) / 1000).toFixed(1)} s (process ${process.uptime().toFixed(1)} s)`);
}

main().catch((error: unknown) => {
  console.error(`db:seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
