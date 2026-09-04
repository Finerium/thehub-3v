// Playwright (tests/e2e, `pnpm test:e2e`; T5 smoke, state tour, chip-to-span, axe and keyboard walk). The target is
// PLAYWRIGHT_BASE_URL (a preview or the production URL, behind login per D-07); a local `next start` on 3000 is
// the default. @playwright/test is not a dependency yet: this object is the shape its defineConfig() takes and is
// wrapped in it, with the browser project added, once the package is installed.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const ci = process.env.CI === "true";

const config = {
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: 1,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "test-results",
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
};

export default config;
