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
];

describe("every workflow", () => {
  const files = readdirSync(workflows).filter((f) => f.endsWith(".yml"));

  it("is one of the three M0 workflows or the nightly", () => {
    expect(files.sort()).toEqual(["ci.yml", "db-migrate-production.yml", "keep-alive.yml", "nightly.yml"]);
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
