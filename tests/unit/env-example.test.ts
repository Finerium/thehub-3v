// `.env.example` as a checked artefact (AC-NFR-22: "12-factor configuration: every environment-specific value
// comes from the environment; `.env.example` lists every variable with a placeholder; no secret in code").
// docs/ARCHITECTURE.md asserts the file exists in three places (the deliverable list, the app-role paragraph and
// the secrets row of section 10); this test is what keeps that assertion true.
//
// Three things can rot: a name the code starts reading and nobody adds to the file; a real value pasted into it;
// and the file itself falling back under an ignore rule, which is how it went missing in the first place. Each has
// an assertion below. The list of blueprint 9.15 names is written out here because section 9 is frozen: a name
// that disappears from the example file has to fail here even if no code reads it any more.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const EXAMPLE_PATH = path.join(root, ".env.example");
const EXAMPLE = readFileSync(EXAMPLE_PATH, "utf8");

/** The assignments of the example file, in order: NAME and the placeholder that follows it. */
const assignments: Array<{ name: string; value: string }> = EXAMPLE.split("\n")
  .map((line) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line))
  .filter((m): m is RegExpExecArray => m !== null)
  .map((m) => ({ name: m[1] as string, value: (m[2] as string).trim() }));

const listed = new Set(assignments.map((a) => a.name));

// Blueprint 9.15, frozen, plus the role password D-20 added and ARCHITECTURE section 10 records.
const BLUEPRINT_9_15 = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "ZAI_API_KEY",
  "AUTH_SECRET",
  "REVIEWER_LINK_SECRET",
  "CI_INGEST_TOKEN",
  "ADMIN_JOB_TOKEN",
  "CORPUS_DEPLOY_KEY",
  "DEMO_ENGINEER_PASSWORD",
  "DEMO_SUPERVISOR_PASSWORD",
  "DEMO_MANAGER_PASSWORD",
  "ADMIN_PASSWORD",
  "APP_ROLE_PASSWORD",
];

// Injected by the platform, the runner or the toolchain, never by a person filling in a configuration file, so
// listing them would be noise rather than documentation.
// A knob the test run itself sets, never the deployment: it may be read only under tests/, and the assertion
// below holds it to that, so this list can never become a way to keep a deployment variable off the example file.
const TEST_RUN_KNOBS = new Set([
  "VISUAL_EXPORT_PATH", // tests/e2e/visual.spec.ts: points the walk at a copy, to prove a check reddens
]);

const PROVIDED_BY_THE_PLATFORM = new Set([
  "CI", // GitHub Actions
  "NODE_ENV", // node and next
  "NEXT_PHASE", // next, during the production build
  "VERCEL_GIT_COMMIT_SHA", // Vercel
  "GITHUB_SHA", // GitHub Actions
  "GITHUB_RUN_ID", // GitHub Actions
  "PLAYWRIGHT_BROWSERS_PATH", // the Playwright installer and the CI cache step
]);

/** Every NAME the code reads as `process.env.NAME` or `process.env["NAME"]`. */
function namesReadByTheCode(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const skip = new Set(["node_modules", ".next", ".git", ".venv", "test-results", "bundle", "recordings", "graphify-out"]);
  const roots = ["src", "scripts", "tools", "tests", "video", "deck", "drizzle"];
  const configs = ["drizzle.config.ts", "next.config.ts", "playwright.config.ts", "vitest.config.ts"];

  const scan = (file: string): void => {
    // This file names the read it is looking for in its own prose, and reads nothing from the environment itself.
    if (path.basename(file) === "env-example.test.ts") return;
    const source = readFileSync(file, "utf8");
    const where = path.relative(root, file);
    for (const pattern of [/process\.env\.([A-Z][A-Z0-9_]*)/g, /process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g]) {
      for (const match of source.matchAll(pattern)) {
        const name = match[1] as string;
        found.set(name, [...(found.get(name) ?? []), where]);
      }
    }
  };

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry) || entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mts|mjs|js)$/.test(entry)) scan(full);
    }
  };

  for (const dir of roots) if (existsSync(path.join(root, dir))) walk(path.join(root, dir));
  for (const file of configs) if (existsSync(path.join(root, file))) scan(path.join(root, file));
  return found;
}

describe(".env.example (AC-NFR-22)", () => {
  it("lists every name of the frozen blueprint 9.15, plus the thehub_app role password of D-20", () => {
    expect(BLUEPRINT_9_15.filter((name) => !listed.has(name))).toEqual([]);
  });

  it("lists every name the code reads from the environment", () => {
    // Ceiling: a name reached through a variable (`process.env[ZAI_API_KEY_NAME]` in src/gateway/provider.ts) is
    // invisible to a text scan. Those names are the 9.15 list above, which is asserted whole.
    const missing = [...namesReadByTheCode().entries()]
      .filter(([name]) => !listed.has(name) && !PROVIDED_BY_THE_PLATFORM.has(name) && !TEST_RUN_KNOBS.has(name))
      .map(([name, files]) => `${name} (read in ${files[0]})`);
    expect(missing).toEqual([]);
  });

  it("keeps every test-run knob inside tests/, so the list above cannot hide a deployment variable", () => {
    const read = namesReadByTheCode();
    for (const name of TEST_RUN_KNOBS) {
      const files = read.get(name) ?? [];
      expect(files, `${name} is listed as a test-run knob and nothing reads it`).not.toEqual([]);
      expect(files.filter((f) => !f.startsWith("tests/")), `${name} is read outside tests/`).toEqual([]);
    }
  });

  it("carries a placeholder and never a value: every assignment names what to put there, in angle brackets", () => {
    expect(assignments.length).toBeGreaterThanOrEqual(BLUEPRINT_9_15.length);
    for (const { name, value } of assignments) {
      expect(value, `${name} has no placeholder`).toMatch(/<[^>]+>/);
    }
  });

  it("holds nothing shaped like a credential, by the audit that sweeps every tracked file (AC-NFR-20)", () => {
    const result = spawnSync("bash", [path.join(root, "scripts", "audits", "secret-scan.sh"), EXAMPLE_PATH], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.stdout + result.stderr).toContain("secret-scan: clean");
    expect(result.status).toBe(0);
  }, 30_000);

  it("is trackable: the ignore rules let git see it, or the file exists for nobody", () => {
    // `git check-ignore` exits 1 when the path is not ignored. `.env*` in the capture block of .gitignore used to
    // win over the `!.env.example` exception above it, which is why the file was missing from the repository.
    const ignored = spawnSync("git", ["check-ignore", ".env.example"], { cwd: root, encoding: "utf8" });
    expect(ignored.status, "the example file is ignored by .gitignore").toBe(1);
  });
});
