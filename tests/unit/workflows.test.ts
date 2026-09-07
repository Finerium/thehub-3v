// The CI surface as text (deterministic checks as scripts): the keep-alive cadence of D-15, the migration workflow
// of AC-ING-15, the Tier A steps and the production smoke of 11.11 must not drift from what ARCHITECTURE section 10
// records, and no workflow may name a secret the repository does not hold.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflows = path.join(process.cwd(), ".github", "workflows");
const read = (name: string) => readFileSync(path.join(workflows, name), "utf8");

// The repository secrets by name (ARCHITECTURE section 10; the values never appear anywhere in this repository).
const REPOSITORY_SECRETS = [
  "CORPUS_DEPLOY_KEY",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "DEMO_ENGINEER_PASSWORD",
  "DEMO_SUPERVISOR_PASSWORD",
  "DEMO_MANAGER_PASSWORD",
  "ADMIN_PASSWORD",
  "AUTH_SECRET",
  "ZAI_API_KEY",
  "ADMIN_JOB_TOKEN",
  "CI_INGEST_TOKEN",
  "GITHUB_TOKEN",
  // Not a credential: the contents of supplied/team-facts.json, which is in no repository, so the deck job of
  // ci.yml can write it beside the checkout and build the Team Profile page. Optional; without it that job runs
  // its hermetic half and says so.
  "TEAM_FACTS_JSON",
];

describe("every workflow", () => {
  const files = readdirSync(workflows).filter((f) => f.endsWith(".yml"));

  it("is one of the three M0 workflows, the nightly or a golden tier", () => {
    expect(files.sort()).toEqual([
      "ci.yml",
      "db-migrate-production.yml",
      "keep-alive.yml",
      "nightly.yml",
      "tier-a.yml",
      "tier-b.yml",
    ]);
  });

  for (const file of files) {
    it(`${file} references repository secrets by a known name only`, () => {
      const named = [...read(file).matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
      for (const name of named) expect(REPOSITORY_SECRETS, `secrets.${name}`).toContain(name);
    });
  }
});

describe("keep-alive.yml (D-15)", () => {
  const text = read("keep-alive.yml");

  it("runs two schedules, every 10 and every 30 minutes, and by hand", () => {
    expect(text).toContain('- cron: "*/10 * * * *"');
    expect(text).toContain('- cron: "*/30 * * * *"');
    expect(text).toContain("workflow_dispatch:");
  });

  it("warms the function through /login on every run and touches /api/health only on the 30-minute schedule", () => {
    expect(text).toContain("https://thehub-3v.vercel.app");
    expect(text).toContain('"$BASE_URL/login"');
    const health = text.indexOf('"$BASE_URL/api/health"');
    expect(health).toBeGreaterThan(0);
    const guard = text.slice(text.lastIndexOf("if:", health), health);
    expect(guard).toContain("github.event.schedule == '*/30 * * * *'");
  });

  it("stops after the final-round window", () => {
    expect(text).toContain('LAST_DAY: "2026-11-07"');
    expect(text.indexOf("Stop after the final-round window")).toBeLessThan(text.indexOf("Warm the function"));
  });
});

describe("db-migrate-production.yml (AC-ING-15)", () => {
  const text = read("db-migrate-production.yml");

  it("migrates on dispatch and on a push to main over the unpooled owner URL from the repository secret", () => {
    expect(text).toContain("workflow_dispatch:");
    expect(text).toMatch(/push:\n\s+branches: \[main\]/);
    expect(text).toContain("run: pnpm db:migrate");
    expect(text).toContain("DATABASE_URL_UNPOOLED: ${{ secrets.DATABASE_URL_UNPOOLED }}");
    expect(text).toContain("seed");
  });

  it("names a failed connection before the migrate step, which drizzle-kit would swallow, and prints no value", () => {
    const preflight = text.indexOf("select current_user as role");
    expect(preflight).toBeGreaterThan(0);
    expect(preflight).toBeLessThan(text.indexOf("run: pnpm db:migrate"));
    expect(text).toContain('console.error("preflight failed: " + error.message)');
    expect(text).not.toMatch(/console\.log\([^)]*(raw|href|password)\b/);
  });
});

describe("nightly.yml (ARCHITECTURE 10; D-16, D-20; AC-LOOP-13)", () => {
  const text = read("nightly.yml");

  it("runs at 17:00 UTC and by hand, one run at a time", () => {
    expect(text).toContain('- cron: "0 17 * * *"');
    expect(text).toContain("workflow_dispatch:");
    expect(text).toContain("group: nightly");
    expect(text).toContain("cancel-in-progress: false");
  });

  it("resolves the seeded version id by the seed's own derivation: the tsx script over the manifest, else the v0 rule", () => {
    expect(text).toContain("[ -f scripts/seeded-version-id.ts ] && [ -f bundle/manifest.json ]");
    expect(text).toContain("pnpm exec tsx scripts/seeded-version-id.ts");
    expect(text).toContain('id="cv-v0-$(sha256sum bundle/fixtures.json | cut -c1-12)"');
  });

  it("re-asserts it through POST /api/admin/corpus/activate as the job principal, the token never on a command line", () => {
    expect(text).toContain("ADMIN_JOB_TOKEN: ${{ secrets.ADMIN_JOB_TOKEN }}");
    expect(text).toContain('"$BASE_URL/api/admin/corpus/activate"');
    expect(text).toContain('-H @"$RUNNER_TEMP/authorization.txt"');
    expect(text).not.toMatch(/-H ["']authorization: Bearer \$/);
    expect(text).toContain('[ "$code" = "200" ]');
  });

  it("checks that /api/health reports the re-asserted label, then runs retention as the owner", () => {
    const activate = text.indexOf('"$BASE_URL/api/admin/corpus/activate"');
    const health = text.indexOf('"$BASE_URL/api/health"');
    const retention = text.indexOf("run: pnpm db:retention");
    expect(activate).toBeGreaterThan(0);
    expect(health).toBeGreaterThan(activate);
    expect(retention).toBeGreaterThan(health);
    expect(text).toContain("DATABASE_URL_UNPOOLED: ${{ secrets.DATABASE_URL_UNPOOLED }}");
  });

  it("names the two job secrets and no other", () => {
    const named = [...text.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(named.sort()).toEqual(["ADMIN_JOB_TOKEN", "DATABASE_URL_UNPOOLED"]);
  });
});

describe("ci.yml (Tier A)", () => {
  const text = read("ci.yml");

  it("runs on pull requests and pushes to main", () => {
    expect(text).toContain("pull_request:");
    expect(text).toMatch(/push:\n\s+branches: \[main\]/);
  });

  it("checks the contracts by pointer, runs gate:quick, gitleaks, the banned-strings grep and the A7 corpus scan", () => {
    expect(text).toContain("pnpm install --frozen-lockfile");
    expect(text).toContain("CONTRACTS_DIR: ../thehub-harness/contracts");
    expect(text).toContain("run: pnpm contracts:check");
    expect(text).toContain("run: pnpm gate:quick");
    expect(text).toContain("uses: gitleaks/gitleaks-action@");
    expect(text).toContain("grep -rnIiwE");
    expect(text).toContain("poppler=26.02.0");
    expect(text).toContain("tools/no_corpus_in_repo.py --repo");
    expect(text).toContain("CASE1_CORPUS:");
  });

  it("enforces the coverage thresholds and runs the audits against the harness checkout (AC-EVAL-08, AC-NFR-10, AC-ANS-10)", () => {
    const checks = text.slice(text.indexOf("\n  checks:"), text.indexOf("\n  no-corpus-text:"));
    expect(checks).toContain("uses: astral-sh/setup-uv@");
    expect(checks).toContain('uv sync --frozen --directory "$GITHUB_WORKSPACE/../thehub-harness"');
    expect(checks).toContain("run: pnpm exec vitest run --coverage");
    expect(checks).toContain("run: pnpm run audit"); // `pnpm audit` is pnpm's own vulnerability command, not the script
    expect(checks).toContain("HARNESS_DIR: ${{ github.workspace }}/../thehub-harness");
    expect(checks.indexOf("uv sync --frozen")).toBeLessThan(checks.indexOf("run: pnpm gate:quick"));
  });

  it("never clones the corpus into the repository tree", () => {
    expect(text).toContain('git clone -q --depth 1 git@github.com:Finerium/thehub-corpus.git "$RUNNER_TEMP/thehub-corpus"');
  });

  describe("production-smoke (11.11, AC-M0-01 to AC-M0-06)", () => {
    const job = text.slice(text.indexOf("production-smoke:"));

    it("runs on a push only, against the production URL", () => {
      expect(job).toContain("if: github.event_name == 'push'");
      expect(job).toContain("BASE_URL: https://thehub-3v.vercel.app");
    });

    it("waits up to ten minutes for /api/health to report the pushed commit", () => {
      const attempts = Number(/POLL_ATTEMPTS: "(\d+)"/.exec(job)?.[1]);
      const seconds = Number(/POLL_SECONDS: "(\d+)"/.exec(job)?.[1]);
      expect(attempts * seconds).toBe(10 * 60);
      expect(job).toContain('"$BASE_URL/api/health"');
      expect(job).toContain('[ "$commit" = "$GITHUB_SHA" ]');
    });

    it("runs scripts/smoke.sh with the demo Engineer password from the repository secret and keeps the JSON", () => {
      expect(job).toContain("DEMO_ENGINEER_PASSWORD: ${{ secrets.DEMO_ENGINEER_PASSWORD }}");
      expect(job).toContain('run: bash scripts/smoke.sh "$BASE_URL" "$RUNNER_TEMP/m0-smoke.json"');
      expect(job).toContain("uses: actions/upload-artifact@");
      expect(job).toContain("path: ${{ runner.temp }}/m0-smoke.json");
    });
  });
});

describe("tier-a.yml (the golden set, AC-EVAL-02, 04, 07)", () => {
  const text = read("tier-a.yml");

  it("runs on every pull request and every push to main, and not on a fork's pull request", () => {
    expect(text).toContain("pull_request:");
    expect(text).toMatch(/push:\n\s+branches: \[main\]/);
    expect(text).toContain("github.event.pull_request.head.repo.full_name == github.repository");
  });

  it("seeds a disposable database, starts next and runs Tier A against it with the ingest", () => {
    expect(text).toContain("image: pgvector/pgvector:pg17");
    expect(text).toContain("pnpm db:seed --bundle ../thehub-harness/bundle");
    expect(text).toContain('pnpm exec next start -p "$APP_PORT"');
    expect(text).toContain("scripts/golden/run.ts --tier A");
    expect(text).toContain("--ingest");
    expect(text.indexOf("pnpm db:seed")).toBeLessThan(text.indexOf("scripts/golden/run.ts --tier A"));
  });

  it("runs the tier twice and diffs the check results (AC-EVAL-07)", () => {
    expect(text).toContain('--out "$RUNNER_TEMP/golden-2"');
    expect(text).toContain("diff <(shape");
    expect(text).toContain("failed: ([.failures[].check] | sort)");
  });

  it("never clones the corpus into the repository tree and keeps the report as an artifact", () => {
    expect(text).toContain('git clone -q --depth 1 git@github.com:Finerium/thehub-corpus.git "$RUNNER_TEMP/thehub-corpus"');
    expect(text).toContain("uses: actions/upload-artifact@");
  });

  // AC-EVAL-02's expectation is "CI artefacts present", and a golden tier is EXPECTED to exit non-zero while a
  // hard-gated case fails, so the upload must survive the failure that produced it. Without `if: always()` on the
  // upload step, every red run would leave no per-category report at all and the criterion would die silently.
  it("keeps the report even when the tier itself fails", () => {
    const upload = text.slice(text.indexOf("Keep the report"), text.indexOf("if-no-files-found"));
    expect(upload).toContain("if: always()");
    expect(upload).toContain("name: golden-a-${{ github.sha }}");
    expect(upload).toContain("${{ runner.temp }}/golden");
  });

  // The runner writes golden-<tier>.json and .md into --out; the upload names --out. A rename on either side
  // would upload an empty directory, which `if-no-files-found: warn` would not fail on.
  it("uploads the directory the runner actually writes its report into", () => {
    const runner = readFileSync(path.join(process.cwd(), "scripts", "golden", "run.ts"), "utf8");
    expect(runner).toContain("`golden-${suffix}.json`");
    expect(runner).toContain("`golden-${suffix}.md`");
    expect(runner).toContain("path.join(options.out,");
    expect(text).toContain('--out "$RUNNER_TEMP/golden"');
    expect(text).toContain("${{ runner.temp }}/golden");
  });

  // The lane died eleven times in a row before reaching the golden step because the account seed refuses to run
  // without its passwords. The half that lives in this repository is the step's own env block: every variable the
  // seed refuses to run without is declared on the step that runs it.
  it("declares every account variable the seed refuses to run without", () => {
    const seed = readFileSync(path.join(process.cwd(), "scripts", "db", "seed-m0.ts"), "utf8");
    const required = [...seed.matchAll(/env: "([A-Z0-9_]+)"/g)].map((m) => m[1] as string);
    expect(required.length, "seed-m0.ts named no account variable, so this check proves nothing").toBeGreaterThan(0);
    const step = text.slice(text.indexOf("Migrate, create the application role"), text.indexOf("The embedder files"));
    expect(step).toContain("pnpm db:seed:m0");
    const declared = new Set([...text.matchAll(/^\s+([A-Z0-9_]+): \$\{\{ secrets\.[A-Z0-9_]+ \}\}$/gm)].map((m) => m[1] as string));
    for (const name of required) expect([...declared], `the seed reads ${name} and no step declares it`).toContain(name);
  });
});

describe("tier-b.yml (recorded replay and the live run, 9.16)", () => {
  const text = read("tier-b.yml");

  it("runs nightly, by hand, and on a pull request touching the rule pack, the gates or the prompts", () => {
    expect(text).toContain("- cron:");
    expect(text).toContain("workflow_dispatch:");
    for (const path of ["src/rulepack/**", "src/gates/**", "prompts/**", "bundle/rulepack/**"]) {
      expect(text).toContain(`- "${path}"`);
    }
  });

  it("sets RECORD_MODE and RECORD_DIR on the application, not on the runner, and keeps the key out of replay", () => {
    const start = text.slice(text.indexOf("Start next on"), text.indexOf("golden:b ("));
    expect(start).toContain("RECORD_DIR: ${{ github.workspace }}/recordings");
    expect(start).toContain("RECORD_MODE: ${{ matrix.mode == 'replay' && 'replay' || 'record' }}");
    expect(start).toContain("ZAI_API_KEY: ${{ matrix.mode == 'live' && secrets.ZAI_API_KEY || '' }}");
  });

  it("runs Tier B and ingests a scheduled live run into production", () => {
    expect(text).toContain("scripts/golden/run.ts --tier B");
    expect(text).toContain("PRODUCTION_URL: https://thehub-3v.vercel.app");
    expect(text).toContain('--ingest --ingest-url "$PRODUCTION_URL"');
    expect(text).toContain('[ "${{ github.event_name }}" != "pull_request" ]');
  });

  it("keeps the recordings as an artifact for the reviewed re-recording", () => {
    expect(text).toContain("${{ github.workspace }}/recordings");
    expect(text).toContain("uses: actions/upload-artifact@");
  });

  it("keeps the report even when the tier itself fails, under a name that separates the two modes", () => {
    const upload = text.slice(text.indexOf("Keep the report"), text.indexOf("if-no-files-found"));
    expect(upload).toContain("if: always()");
    expect(upload).toContain("name: golden-b-${{ matrix.mode }}-${{ github.sha }}");
    expect(upload).toContain("${{ runner.temp }}/golden");
    expect(text).toContain('--out "$RUNNER_TEMP/golden"');
  });
});
