// The offline export as a test (blueprint 9.12 and 11.9 AC-DEL-01): `deliverables/TheHub_prototype.html` opens
// from `file://` on a judge's laptop with the wi-fi off, reaches every read-only surface of blueprint 6.2, asks the
// network for nothing at all, and stays inside 2,000,000 bytes.
//
// scripts/export/build.ts runs the same walk before it leaves the file behind, which is the right place for it: a
// build that cannot prove its own output should not write one. This spec is the second reading, over the artefact
// as committed rather than as just composed, and it is the one Tier A can run, because it needs no server, no
// database and no credential. It is a Playwright project of its own for exactly that reason
// (playwright.config.ts, `--project=export`).
//
// Two rules shape the run. The context is `offline: true` AND every route that is not already inside the file is
// aborted and recorded, so a request that a permissive local network would have satisfied is still a failure here.
// And the surfaces are not listed in this file: FAMILY_ORDER is the 6.2 inventory as scripts/export/routes.ts
// holds it, so a family the export stops carrying is a red test rather than a quiet omission.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { FAMILY_ORDER, type Family } from "../../scripts/export/routes";

const EXPORT = path.join(process.cwd(), "deliverables", "TheHub_prototype.html");

/** Blueprint 9.12: the export's own byte budget, inside the 10,000,000 of the whole upload. */
const BYTE_BUDGET = 2_000_000;

/** What a page may already hold. Everything else is a request, whatever scheme it wears. */
const LOCAL = /^(file|data|blob|about):/;

/**
 * The section slugs scripts/export/routes.ts mints per family: an index surface takes the family's own name, a
 * detail surface takes a prefix and the product's own id. Reaching one section of every family is the criterion of
 * 6.2, not reaching every row of the corpus.
 */
const SLUG_OF: Record<Family, RegExp> = {
  home: /^home$/,
  ask: /^ask(-|$)/,
  trace: /^trace-/,
  documents: /^doc-/,
  assets: /^assets$|^asset-/,
  failures: /^failures$|^failure-/,
  coverage: /^coverage(-|$)/,
  clusters: /^cluster-/,
  drafts: /^drafts$|^draft-/,
  integrity: /^integrity$/,
  evaluation: /^evaluation$/,
  loop: /^loop$/,
  landing: /^landing$/,
};

test.describe.configure({ mode: "serial" });

test.describe("the offline export (AC-DEL-01, blueprint 9.12)", () => {
  let page: Page;
  let slugs: string[] = [];
  const requests: string[] = [];
  const pageErrors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    // Never skipped. An export that is not built is an AC-DEL-01 that is not met, and a green run on a missing
    // deliverable would be the one result nobody could act on.
    expect(existsSync(EXPORT), `${EXPORT} is not built; run the export build before this spec`).toBe(true);

    const context = await browser.newContext({ offline: true, viewport: { width: 1440, height: 1000 } });
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (LOCAL.test(url)) return route.continue();
      requests.push(url);
      return route.abort();
    });
    page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("requestfailed", (request) => {
      if (!LOCAL.test(request.url())) requests.push(request.url());
    });
    await page.goto(pathToFileURL(EXPORT).href, { waitUntil: "load" });
    slugs = await page.$$eval("[data-x-route]", (nodes) => nodes.map((node) => node.getAttribute("data-x-route") ?? ""));
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test("is at most 2,000,000 bytes", () => {
    const bytes = statSync(EXPORT).size;
    expect(bytes, `${EXPORT} is ${bytes} bytes, over the ${BYTE_BUDGET} of blueprint 9.12`).toBeLessThanOrEqual(BYTE_BUDGET);
  });

  test("opens from file:// with the network off and raises no page error", async () => {
    expect(page.url().startsWith("file://"), "the export was not opened from file://").toBe(true);
    expect(pageErrors, "the export raised a page error offline").toEqual([]);
    // The runtime routes on load; the first section is the reviewer landing and it must be showing.
    await expect(page.locator('[data-x-route="landing"]')).toBeVisible();
  });

  test("carries a section for every read-only surface family of blueprint 6.2", () => {
    expect(slugs.length, "the file carries no [data-x-route] section at all").toBeGreaterThan(0);
    const missing = FAMILY_ORDER.filter((family) => !slugs.some((slug) => SLUG_OF[family].test(slug)));
    expect(missing, `the export carries no section for these 6.2 families (it carries ${slugs.join(", ")})`).toEqual([]);
  });

  test("renders every one of those sections offline", async () => {
    const blank: string[] = [];
    for (const slug of slugs) {
      await page.evaluate((s) => {
        window.location.hash = `#${s}`;
      }, slug);
      const section = page.locator(`[data-x-route="${slug}"]`);
      await expect(section, `#${slug} did not become the visible section`).toBeVisible();
      const text = ((await section.textContent()) ?? "").trim();
      if (text.length === 0) blank.push(slug);
    }
    expect(blank, "these sections are in the file but render nothing").toEqual([]);
  });

  // Last, so that it accounts for the whole walk and not only for the load.
  test("asks the network for nothing, on load and on every surface it reached", () => {
    expect([...new Set(requests)], "the export asked for a resource it does not carry").toEqual([]);
  });
});
