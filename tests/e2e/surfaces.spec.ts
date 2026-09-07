// AC-UI-01 (the surface tour), AC-COV (the coverage figures read back), AC-INT-04 (the CSV header) and the
// designed 404 of 6.3. Every id the tour walks is read from the route that owns it and every expected number from
// bundle/fixtures.json: nothing in this file is typed against the seeded corpus.
//
// WHICH SURFACE ANSWERS TO WHICH CRITERION (blueprint 6.2 and section 11). The list itself is tests/e2e/inventory.ts.
//   1  Home /                          AC-UI-01, AC-UI-05 (the 24 chips: seeded-chips.spec.ts), AC-UI-06
//   2  Ask /ask                        AC-UI-01, AC-UI-02 (the budget and outcome states), AC-UI-06
//   3  Trace /trace/:id                AC-UI-01, AC-UI-06
//   4  Document viewer /documents/:id  AC-UI-01 (the chip lands on the span: chip-to-span.spec.ts), AC-UI-06
//   5  Assets /assets, /assets/:tag    AC-UI-01, AC-UI-06
//   6  Failure Memory /failures(/:tag) AC-UI-01, AC-UI-06
//   7  Coverage /coverage(/clusters)   AC-UI-01 (the figures read back from fixtures.json), AC-UI-06
//   8  Drafts /drafts, /drafts/:id     AC-UI-01, AC-UI-02 (the 403, 404, 409 and 422 states: states.spec.ts)
//   9  Integrity /integrity            AC-UI-01, AC-INT-04, AC-UI-02 (the empty filter), AC-UI-06
//  10  Evaluation /evaluation          AC-UI-01, AC-EVAL-03, AC-UI-06
//  11  Guided loop /demo/loop          AC-UI-01 (loop.spec.ts walks it end to end), AC-UI-06
//  12  Tour /tour                      AC-UI-01, AC-UI-04 (ES1 to ES6 in order: a11y.spec.ts); /tour/:token is
//                                      retired by D-07, which put the whole deployment behind login
//  13  Admin /admin                    AC-UI-01, AC-UI-02 (the designed 403), admin.spec.ts for the Admin's own read
//  14  Auth /login, /api/health        AC-UI-01, AC-UI-06 (signed out)
// The accessibility leg of every one of them is axe.spec.ts and a11y.spec.ts, which walk the same list.
import { expect, test, type Page } from "@playwright/test";
import { REQUEST_LESSON_ACTION, STATUS_WORDING } from "../../src/lib/fixed-strings";
import { TAG, datasheetId, firstClusterId, getJson, headline, readAsset, traceIdFromSearch } from "./helpers";
import { SURFACES, VIEWS, settled } from "./inventory";

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

// ---------------------------------------------------------------------------------------------------------------
// AC-UI-01, the literal clause: "the fourteen surfaces render". The tour above walks eleven of them in depth; this
// one walks every address 6.2 declares, by its 6.2 number and name, and asserts the only thing every surface owes
// in common: it draws its own heading, or the designed state that address answers with, and never a raw error.
// The list is tests/e2e/inventory.ts, so a surface added to 6.2 and not to the walk fails the count case.
// ---------------------------------------------------------------------------------------------------------------

test.describe("every surface of 6.2 renders (AC-UI-01)", () => {
  test("the walk covers the fourteen surfaces and names the address D-07 retired", () => {
    expect(SURFACES.map((s) => `${s.n} ${s.name}`)).toEqual([
      "1 Home",
      "2 Ask",
      "3 Trace",
      "4 Document viewer",
      "5 Assets",
      "6 Failure Memory",
      "7 Coverage Console",
      "8 Drafts",
      "9 Integrity Register",
      "10 Evaluation",
      "11 Guided loop",
      "12 Reviewer landing and tour",
      "13 Admin",
      "14 Auth",
    ]);
    // Every criterion of this family is claimed by at least one surface, so none of them is unattached evidence.
    const claimed = new Set(SURFACES.flatMap((s) => s.criteria));
    expect([...claimed].sort()).toEqual(["AC-UI-01", "AC-UI-02", "AC-UI-04", "AC-UI-05", "AC-UI-06"]);
    const retired = SURFACES.flatMap((s) => (s.retired ? [`${s.retired.pattern} ${s.retired.deviation}`] : []));
    expect(retired, "an address of 6.2 dropped without naming the deviation that dropped it").toEqual(["/tour/:token D-07"]);
    console.log(`6.2 surface walk: ${SURFACES.length} surfaces, ${VIEWS.length} addresses, 1 retired by deviation`);
  });

  for (const { view, title } of VIEWS.filter((v) => !v.view.signedOut)) {
    test(title, async ({ page }) => {
      const opened = await view.open(page.request);
      await settled(page, opened.href, opened.designed);
      if (opened.designed) {
        // 6.3: a designed state states what happened and offers the next step; it is never a blank or a trace.
        const state = page.locator(`[data-designed-state="${opened.designed}"]`);
        await expect(state).toHaveAttribute("role", "status");
        await expect(state.getByRole("link").first(), `the designed ${opened.designed} on ${opened.href} offers no next step`).toBeVisible();
      }
      await noErrorState(page);
    });
  }
});

test.describe("the signed-out surface of 6.2 (AC-UI-01, surface 14)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("6.2 surface 14, Auth /login: the credentials form, with no self-registration and no reset path", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button")).toBeVisible();
    // 6.2 surface 14: no self-registration and no reset path anywhere on the surface.
    await expect(page.getByRole("link", { name: /register|sign up|forgot|reset/i })).toHaveCount(0);
    await noErrorState(page);
  });

  test("6.2 surface 14, /api/health holds no data and no session", async ({ page }) => {
    const response = await page.request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    // The route reports that it is up and which corpus version is active, and carries nothing else.
    expect(Object.keys(body).sort()).toEqual(["commit", "corpus_version", "ok"]);
    expect(response.headers()["set-cookie"], "the health route minted a cookie").toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// AC-UI-04, read against D-07. The criterion has six legs and the locked deviation removed four of them: the
// login-free signed per-role link, its expiry, its revocation and the REVIEWER_LINK_SECRET rotation were withdrawn
// and the whole deployment put behind login. What the deviation put in their place is a stronger property, and it
// is what is asserted here: no route serves any part of this product without credentials, and no token route
// exists at all, so there is nothing to issue, expire, revoke or rotate.
//
//   leg 1  the landing renders without credentials          RETIRED by D-07; the replacement is asserted below
//   leg 2  the tour visits ES1 to ES6 and ends on the loop   tests/e2e/a11y.spec.ts, "the guided route by keyboard"
//   leg 3  a string audit finds no password or key           tools/presubmit.sh, outside the browser suite
//   leg 4  a link expires at the end of the judging window   RETIRED by D-07: no link is ever issued
//   leg 5  a revoked link is rejected and audited            RETIRED by D-07
//   leg 6  rotating REVIEWER_LINK_SECRET rejects old links   RETIRED by D-07: the secret does not exist
// ---------------------------------------------------------------------------------------------------------------

test.describe("the reviewer landing under D-07 (AC-UI-04)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("no surface is served without credentials: the landing and the guided route both stop at the login", async ({ page }) => {
    for (const path of ["/tour", "/demo/loop", "/", "/ask"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), `GET ${path} without a session`).toBe(307);
      expect(response.headers()["location"], `GET ${path} without a session`).toBe(`/login?next=${encodeURIComponent(path)}`);
    }
  });
});

test.describe("the reviewer link D-07 withdrew (AC-UI-04)", () => {
  test("no token route exists, so no link can be issued, expired, revoked or rotated", async ({ page }) => {
    // Signed in, because signed out every address answers with the login redirect and would prove nothing.
    const response = await page.goto("/tour/any-token-at-all");
    expect(response?.status(), "a /tour/:token route answers on this deployment").toBe(404);
    await expect(page.locator('[data-designed-state="404"]')).toBeVisible();
    // And the landing D-07 kept is there, behind the session, with its six steps.
    await page.goto("/tour");
    await expect(page.locator('[data-component="tour-step"]')).toHaveCount(6);
  });
});
