// AC-UI-06, the measured half: axe-core over wcag2a, wcag2aa, wcag21a and wcag21aa on EVERY surface of blueprint
// 6.2, not a chosen sample of them. The list walked is tests/e2e/inventory.ts, so a surface that is added, renamed
// or lost changes this audit rather than being forgotten by it, and the count assertion below fails if the walk
// ever covers fewer addresses than 6.2 declares.
//
// Serious and critical violations fail. Moderate and minor are printed in the run log so a regression is visible
// without turning the gate into a style opinion. Every run is under prefers-reduced-motion (playwright.config.ts
// use.reducedMotion "reduce"), which is both what section 7 requires to render the complete static experience and
// what keeps a colour from being measured mid-fade.
//
// The ids the audit needs are read from the routes that own them; nothing here types an id of the seeded corpus.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { SURFACES, VIEWS, settled } from "./inventory";

const BLOCKING = new Set(["serious", "critical"]);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function audit(page: Page, href: string, designed?: string): Promise<void> {
  await settled(page, href, designed);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ""));
  const rest = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ""));
  if (rest.length > 0) {
    console.log(`axe ${href}: ${rest.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(", ")}`);
  }
  expect(
    blocking.map(
      (v) =>
        `${v.id} (${v.impact}) on ${v.nodes.length} node(s): ${String(v.nodes[0]?.target)} — ${(v.nodes[0]?.failureSummary ?? "").replace(/\s+/g, " ").trim()}`,
    ),
    `serious or critical axe violations on ${href}`,
  ).toEqual([]);
}

test.describe("axe over every surface of 6.2 (AC-UI-06)", () => {
  test("the audit walks every address 6.2 declares, and the one address D-07 retired is named", () => {
    // Fourteen surfaces, numbered 1 to 14, every one of them audited below or named as retired with its deviation.
    expect(SURFACES.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(SURFACES.filter((s) => s.views.length === 0), "a surface of 6.2 with no address to audit").toEqual([]);
    const retired = SURFACES.flatMap((s) => (s.retired ? [`${s.retired.pattern} (${s.retired.deviation})`] : []));
    expect(retired, "the addresses of 6.2 a deviation removed, each named with its deviation id").toEqual(["/tour/:token (D-07)"]);
    expect(VIEWS.length, "the addresses this file audits").toBe(18);
  });

  for (const { view, title } of VIEWS.filter((v) => !v.view.signedOut)) {
    test(title, async ({ page }) => {
      const opened = await view.open(page.request);
      await audit(page, opened.href, opened.designed);
    });
  }
});

// /login redirects a browser that already holds a session, so surface 14 is audited by a context that holds none.
test.describe("axe over the signed-out surface of 6.2 (AC-UI-06)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const { view, title } of VIEWS.filter((v) => v.view.signedOut)) {
    test(title, async ({ page }) => {
      const opened = await view.open(page.request);
      await audit(page, opened.href, opened.designed);
    });
  }
});

// The component gallery is not a surface of 6.2: it is where the states of 6.3 are drawn from props alone, and the
// state tour reads it. It is audited here so that a state the tour asserts is also a state axe has measured.
test.describe("axe over the component gallery (AC-UI-06, the states of 6.3 drawn from props)", () => {
  test("the gallery", async ({ page }) => audit(page, "/gallery"));
});
