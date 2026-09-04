// The CI surface as text (deterministic checks as scripts): the keep-alive cadence of D-15, the migration workflow
// of AC-ING-15 and the Tier A steps must not drift from what ARCHITECTURE section 10 records.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflows = path.join(process.cwd(), ".github", "workflows");
const read = (name: string) => readFileSync(path.join(workflows, name), "utf8");

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

  it("never clones the corpus into the repository tree", () => {
    expect(text).toContain('git clone -q --depth 1 git@github.com:Finerium/thehub-corpus.git "$RUNNER_TEMP/thehub-corpus"');
  });
});
