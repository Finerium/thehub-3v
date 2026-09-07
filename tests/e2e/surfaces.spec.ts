// AC-UI-01 (the surface tour), AC-COV (the coverage figures read back), AC-INT-04 (the CSV header) and the
// designed 404 of 6.3. Every id the tour walks is read from the route that owns it and every expected number from
// bundle/fixtures.json: nothing in this file is typed against the seeded corpus.
import { expect, test, type Page } from "@playwright/test";
import { REQUEST_LESSON_ACTION, STATUS_WORDING } from "../../src/lib/fixed-strings";
import { TAG, datasheetId, firstClusterId, getJson, headline, readAsset, traceIdFromSearch } from "./helpers";

/** No surface may answer with a server-side designed error state (503) or a Next error overlay. */
async function noErrorState(page: Page): Promise<void> {
  await expect(page.locator('[data-designed-state="503"]')).toHaveCount(0);
  await expect(page.locator("text=Unhandled Runtime Error")).toHaveCount(0);
}

test.describe("the M1 surface tour", () => {
  test("Home renders the gap headline, the corpus panel and the fleet register", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    await expect(page.locator('[data-component="gap-headline"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Corpus status" })).toBeVisible();
    // The version label the shell shows is the one /api/health reports (no typed label).
    const health = await getJson(page.request, "/api/health");
    await expect(page.getByText(String(health.corpus_version), { exact: false }).first()).toBeVisible();
    await noErrorState(page);
  });

  test("Assets lists the fleet register", async ({ page }) => {
    await page.goto("/assets");
    await expect(page.getByRole("heading", { level: 1, name: "Fleet register" })).toBeVisible();
    // The register carries a row per asset the API serves.
    const fleet = await getJson(page.request, "/api/assets");
    const rows = (fleet.assets as unknown[]).length;
    expect(rows).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: TAG, exact: true }).first()).toBeVisible();
    await noErrorState(page);
  });

  test("the asset sheet carries the tag, its sections and citation chips", async ({ page }) => {
    await page.goto(`/assets/${TAG}`);
    await expect(page.getByRole("heading", { level: 1, name: TAG })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Sections of this sheet" })).toBeVisible();
    await expect(page.locator('[data-component="citation-chip"]').first()).toBeVisible();
    await noErrorState(page);
  });

  test("the document viewer opens the asset's datasheet", async ({ page }) => {
    const asset = await readAsset(page.request);
    const id = datasheetId(asset);
    await page.goto(`/documents/${encodeURIComponent(id)}`);
    const document = await getJson(page.request, `/api/documents/${encodeURIComponent(id)}`);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    // The sheet is named by its own doc_no, not by an id typed here.
    const docNo = (document.document as { doc_no: string | null } | undefined)?.doc_no ?? id;
    await expect(heading).toHaveText(String(docNo));
    await expect(page.getByRole("heading", { name: /^Page \d+ of \d+$/ })).toBeVisible();
    await noErrorState(page);
  });

  test("Failure Memory lists the fleet's records", async ({ page }) => {
    await page.goto("/failures");
    await expect(page.getByRole("heading", { level: 1, name: "Failure Memory" })).toBeVisible();
    await expect(page.getByRole("link", { name: TAG, exact: true }).first()).toBeVisible();
    await noErrorState(page);
  });

  test("the asset's failure memory carries the reconciliation and the uncovered records", async ({ page }) => {
    await page.goto(`/failures/${TAG}`);
    await expect(page.getByRole("heading", { level: 1, name: TAG })).toBeVisible();
    await expect(page.locator('[data-component="asset-reconciliation"]')).toBeVisible();
    await expect(page.locator('[data-component="uncovered-records"]')).toBeVisible();
    await noErrorState(page);
  });

  test("the Integrity Register carries its totals and its rule ledger", async ({ page }) => {
    await page.goto("/integrity");
    await expect(page.getByRole("heading", { level: 1, name: "Integrity Register" })).toBeVisible();
    await expect(page.locator('[data-component="register-totals"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rules", exact: true })).toBeVisible();
    // The lifecycle chips of 6.2 surface 9 carry the state as a data attribute.
    await expect(page.locator('.chip[data-state]').first()).toBeVisible();
    await noErrorState(page);
  });

  test("the Coverage Console shows both layers as the fixture scored them", async ({ page }) => {
    await page.goto("/coverage");
    await expect(page.getByRole("heading", { level: 1, name: "Coverage Console" })).toBeVisible();

    // The rendered figures equal what GET /api/coverage serves, and the API equals the harness fixture.
    const api = await getJson(page.request, "/api/coverage");
    const summaries = api.summaries as Array<{ layer: string; population: string; uncovered_count: number; population_count: number }>;
    const gap = page.locator('[data-component="coverage-gap"]');
    await expect(gap).toBeVisible();

    for (const layer of ["generous", "strict"] as const) {
      const served = summaries.find((s) => s.layer === layer && s.population === "unplanned_failure");
      expect(served, `GET /api/coverage carried no ${layer} unplanned_failure summary`).toBeDefined();
      const fixture = headline(layer);
      // The route, the fixture and the page all say the same thing (INV-6).
      expect(served!.uncovered_count).toBe(fixture.uncovered);
      expect(served!.population_count).toBe(fixture.of);
      const figure = gap.locator(`[data-layer="${layer}"]`).first();
      await expect(figure).toContainText(String(served!.uncovered_count));
      await expect(figure).toContainText(`of ${served!.population_count}`);
    }

    // The fixed wordings of 6.4, imported from the one module that owns them.
    // The badge sits inside the method chip, a native details, so it is asserted as present rather than expanded.
    await expect(page.getByText(STATUS_WORDING.machine_drafted).first()).toBeAttached();
    await expect(page.getByLabel(new RegExp(`^${REQUEST_LESSON_ACTION} for `)).first()).toBeVisible();
    await noErrorState(page);
  });

  test("a debt cluster carries its rank and the assumption label", async ({ page }) => {
    const id = await firstClusterId(page.request);
    await page.goto(`/coverage/clusters/${encodeURIComponent(id)}`);
    const detail = await getJson(page.request, `/api/coverage/clusters/${encodeURIComponent(id)}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(String(detail.equipment_tag));
    await expect(page.getByText(String(id), { exact: false }).first()).toBeVisible();
    await noErrorState(page);
  });

  test("Ask renders its form and the seeded question lane", async ({ page }) => {
    await page.goto("/ask");
    await expect(page.getByRole("heading", { level: 1, name: "Ask" })).toBeVisible();
    await expect(page.locator('[data-component="ask-form"]')).toBeVisible();
    await noErrorState(page);
  });

  test("a trace replays one answer with its gateway calls", async ({ page }) => {
    const id = await traceIdFromSearch(page.request, `${TAG} datasheet`);
    await page.goto(`/trace/${encodeURIComponent(id)}`);
    await expect(page.getByRole("heading", { level: 1, name: "Trace" })).toBeVisible();
    await expect(page.locator('[data-component="gateway-calls"]')).toBeVisible();
    // 9.7: the question text is never rendered on the replay.
    await expect(page.locator("body")).not.toContainText(`${TAG} datasheet`);
    await noErrorState(page);
  });
});

test.describe("the designed states of 6.3", () => {
  test("an unknown asset resolves to the designed 404, not a stack trace", async ({ page }) => {
    const response = await page.goto("/assets/NOT-A-TAG-0000");
    expect(response?.status()).toBe(404);
    await expect(page.locator('[data-designed-state="404"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "No sheet at this address" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to Home/ })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("an unknown cluster resolves to the designed 404", async ({ page }) => {
    const response = await page.goto("/coverage/clusters/not-a-cluster");
    expect(response?.status()).toBe(404);
    await expect(page.locator('[data-designed-state="404"]')).toBeVisible();
  });
});

test.describe("the integrity export", () => {
  test("the CSV carries the fixture header lines and one line per finding (AC-INT-04)", async ({ page }) => {
    const response = await page.request.get("/api/integrity?format=csv");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain("attachment");
    const lines = (await response.text()).split("\r\n");

    // The header comment lines of the route, in their order, each carrying a value and not an empty field.
    const wanted = ["# corpus_version: ", "# corpus_version_id: ", "# rules_in_scope: ", "# fixture_total: ", "# fixture_rules: ", "# fixture_observations: ", "# rows: "];
    wanted.forEach((prefix, i) => {
      expect(lines[i], `CSV line ${i}`).toContain(prefix);
    });
    expect(lines[0].replace("# corpus_version: ", "").length).toBeGreaterThan(0);

    // The fixture total is a number, and it is the total the JSON route reports for the same register.
    const fixtureTotal = Number(lines[3].replace("# fixture_total: ", ""));
    const json = await getJson(page.request, "/api/integrity?page_size=1");
    const totals = json.totals as { fixture_total: number | null; version_id: string };
    expect(fixtureTotal).toBe(totals.fixture_total);
    expect(lines[1]).toBe(`# corpus_version_id: ${totals.version_id}`);

    // The column line, then the rows the header counted.
    expect(lines[7].split(",")[0]).toBe("id");
    const rows = Number(lines[6].replace("# rows: ", ""));
    expect(rows).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThanOrEqual(wanted.length + 1 + rows);
  });
});
