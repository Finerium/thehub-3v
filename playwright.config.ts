// Playwright (tests/e2e, `pnpm test:e2e`): the M1 surface tour, chip-to-span (AC-UI-02), the integrity CSV header,
// the coverage figures read back against bundle/fixtures.json, the designed 404, the keyboard walk and axe.
// The target is PLAYWRIGHT_BASE_URL (a local `next start`, a preview, or the production URL, all behind login per
// D-07); http://localhost:3000 is the default. tests/e2e/global-setup.ts logs in once as engineer_demo with
// DEMO_ENGINEER_PASSWORD from the environment and writes the storage state to STATE_PATH, outside the repository
// tree and outside outputDir (which the runner clears), so no credential and no cookie is ever tracked or printed.
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const ci = process.env.CI === "true";

/** The signed-in state minted by the global setup; the setup writes it, every test reads it. */
export const STATE_PATH = process.env.PLAYWRIGHT_STATE_PATH ?? path.join(os.tmpdir(), "thehub-3v-e2e", "state.json");

/**
 * The offline export (AC-DEL-01) is a file on disk, not a deployment: tests/e2e/export.spec.ts opens
 * `deliverables/TheHub_prototype.html` from `file://` with every network route aborted and holds no session at
 * all. It is a project of its own so that `--project=export` reaches no server and needs no credential, which is
 * what lets Tier A check the export on a runner that has neither. The global setup signs in to nothing when this
 * is the only project selected.
 */
export const OFFLINE_PROJECT = "export";
const OFFLINE_SPEC = /export\.spec\.ts$/;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // One worker against one seeded database: the surfaces are read-only, but a shared rate limit is not.
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: ci ? [["list"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "test-results",
  use: {
    baseURL,
    storageState: STATE_PATH,
    viewport: { width: 1440, height: 900 },
    // The reveal of 7.2 fades opacity in over 0.4 s, so a colour measured mid-animation is a blend of ink and
    // paper and axe reads a false contrast failure. Reduced motion is also the state section 7 requires to render
    // the complete static experience, so every run measures the settled page and exercises that path.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The deployment is noindex and unlisted; a run must not be mistaken for a crawler in the access log.
    userAgent: "thehub-3v-e2e (Playwright)",
  },
  projects: [
    { name: "chromium", testIgnore: OFFLINE_SPEC, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      name: OFFLINE_PROJECT,
      testMatch: OFFLINE_SPEC,
      // No base address and no stored session: the one artefact under test is a file, and a context that carried
      // a cookie jar for a deployment would be a context that could reach one. The empty state is written out
      // rather than left undefined, because an undefined value in a project inherits the top-level one, which is
      // the path the signed-in projects use and which a checkout that never signed in does not have.
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        baseURL: undefined,
        storageState: { cookies: [], origins: [] },
      },
    },
  ],
});
