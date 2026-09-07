// AC-UI (accessibility): axe-core over the M1 surfaces. Serious and critical violations fail; moderate and minor
// are reported in the run log so a regression is visible without turning the gate into a style opinion. The ids the
// tour needs are read from the routes that own them, the same way the surface tour reads them.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { TAG, datasheetId, firstClusterId, readAsset, traceIdFromSearch } from "./helpers";

const BLOCKING = new Set(["serious", "critical"]);

async function auditable(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ""));
  const rest = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ""));
  if (rest.length > 0) {
    console.log(`axe ${path}: ${rest.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(", ")}`);
  }
  expect(
    blocking.map(
      (v) =>
        `${v.id} (${v.impact}) on ${v.nodes.length} node(s): ${String(v.nodes[0]?.target)} — ${(v.nodes[0]?.failureSummary ?? "").replace(/\s+/g, " ").trim()}`,
    ),
    `serious or critical axe violations on ${path}`,
  ).toEqual([]);
}

test.describe("axe over the M1 surfaces", () => {
  test("Home", async ({ page }) => auditable(page, "/"));
  test("Assets", async ({ page }) => auditable(page, "/assets"));
  test("the asset sheet", async ({ page }) => auditable(page, `/assets/${TAG}`));
  test("Failure Memory", async ({ page }) => auditable(page, "/failures"));
  test("the asset's failure memory", async ({ page }) => auditable(page, `/failures/${TAG}`));
  test("the Integrity Register", async ({ page }) => auditable(page, "/integrity"));
  test("the Coverage Console", async ({ page }) => auditable(page, "/coverage"));
  test("Ask", async ({ page }) => auditable(page, "/ask"));

  test("the document viewer", async ({ page }) => {
    const asset = await readAsset(page.request);
    await auditable(page, `/documents/${encodeURIComponent(datasheetId(asset))}`);
  });

  test("a debt cluster", async ({ page }) => {
    const id = await firstClusterId(page.request);
    await auditable(page, `/coverage/clusters/${encodeURIComponent(id)}`);
  });

  test("a trace", async ({ page }) => {
    const id = await traceIdFromSearch(page.request, `${TAG} datasheet`);
    await auditable(page, `/trace/${encodeURIComponent(id)}`);
  });
});
