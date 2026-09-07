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
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The deployment is noindex and unlisted; a run must not be mistaken for a crawler in the access log.
    userAgent: "thehub-3v-e2e (Playwright)",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
