// AC-UI-06, the three legs axe cannot measure, and AC-UI-04's tour leg.
//
//   1. The keyboard-only walk of the fourteen surfaces of 6.2 and the guided route (tests/e2e/inventory.ts is the
//      list). On every address: no positive tabindex, so the tab order is the document order (WCAG 2.4.3); every
//      rendered, enabled control takes focus, so nothing is operable by pointer alone; Tab from the top of the
//      document lands on a control; and twenty-five presses never park on one element, so no surface is a trap.
//      The chip leg of the walk (Tab to a citation chip, Enter opens the drawer at its span, Escape returns focus
//      to the chip) is chip-to-span.spec.ts, which is where the chip's own journey is asserted.
//   2. The decision controls of 6.4 (StateRail and DecisionButtons) as a keyboard reaches them: native buttons with
//      an accessible name that take focus, drawn from props in the gallery so the walk costs no draft.
//   3. The abstention and refusal states as a screen reader meets them: the roles and the live regions of 6.4, and
//      the designed states of 6.3 announcing themselves.
//   4. prefers-reduced-motion as the complete static experience: the media query the whole suite runs under, and
//      every revealed element settled at its final opacity with no residual transform.
//
// The walk is recorded: this file runs with video on, so each case leaves a webm beside its trace under
// test-results/, which the CI job uploads as the e2e report artefact. Nothing here calls the answer lane: the
// gallery draws from props, and every surface is opened read-only.
import { expect, test, type Page } from "@playwright/test";
import { STATUS_WORDING } from "../../src/lib/fixed-strings";
import { TAG } from "./helpers";
import { VIEWS, settled } from "./inventory";

test.use({ video: "on" });

/** Tag every element with an identity the walk can compare, so two identical controls are two distinct stops. */
async function tagElements(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("*").forEach((el, i) => el.setAttribute("data-kb", String(i)));
  });
}

/** The element focus is on now, by its walk identity, or null when focus sits on nothing. */
async function focused(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    return `${el.tagName.toLowerCase()}#${el.getAttribute("data-kb") ?? "?"}`;
  });
}

type Walk = { first: string | null; stops: string[]; distinct: number; parked: string | null };

/** Tab from the top of the document, recording where focus lands; a stop repeated three times running is a trap. */
async function tabWalk(page: Page, presses: number): Promise<Walk> {
  await tagElements(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const stops: string[] = [];
  let parked: string | null = null;
  let run = 0;
  for (let i = 0; i < presses; i += 1) {
    await page.keyboard.press("Tab");
    const at = await focused(page);
    if (at === null) {
      run = 0;
      continue;
    }
    run = stops[stops.length - 1] === at ? run + 1 : 0;
    if (run >= 2 && parked === null) parked = at;
    stops.push(at);
  }
  return { first: stops[0] ?? null, stops, distinct: new Set(stops).size, parked };
}

/** Every rendered, enabled control that a keyboard must be able to focus, and the ones that refuse focus. */
async function unfocusable(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type=hidden])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "summary",
      '[tabindex]:not([tabindex="-1"])',
    ].join(", ");
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      // Not drawn: a closed dialog, a hidden branch, a zero box. A keyboard cannot reach what is not rendered.
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (el.closest("[hidden]") !== null || el.closest('[aria-hidden="true"]') !== null) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      // Inside a closed native disclosure: Chrome makes the collapsed content unfocusable on purpose, and the
      // summary is the keyboard's way in. The summary itself is still required to take focus, so the disclosure
      // is operable; only what it is hiding is exempt.
      if (el.tagName !== "SUMMARY" && el.closest("details:not([open])") !== null) continue;
      el.focus();
      if (document.activeElement !== el) {
        bad.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${(el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}"`);
      }
    }
    return bad;
  });
}

test.describe("the keyboard-only walk of the fourteen surfaces of 6.2 (AC-UI-06)", () => {
  for (const { view, title } of VIEWS.filter((v) => !v.view.signedOut)) {
    test(title, async ({ page }) => {
      const opened = await view.open(page.request);
      await settled(page, opened.href, opened.designed);

      // WCAG 2.4.3: the tab order is the document order, so no element may claim a place in it.
      const positive = await page
        .locator("[tabindex]")
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("tabindex") ?? "").filter((v) => Number(v) > 0));
      expect(positive, `elements with a positive tabindex on ${opened.href}`).toEqual([]);

      // Operable by keyboard, not by pointer alone.
      expect(await unfocusable(page), `rendered controls that refuse focus on ${opened.href}`).toEqual([]);

      const walk = await tabWalk(page, 25);
      expect(walk.first, `Tab from the top of ${opened.href} reached no control`).not.toBeNull();
      expect(walk.parked, `Tab parked on one element on ${opened.href}: a keyboard trap`).toBeNull();
      expect(walk.distinct, `Tab reached too few distinct controls on ${opened.href}`).toBeGreaterThanOrEqual(3);
    });
  }
});

test.describe("the keyboard-only walk of the signed-out surface (AC-UI-06)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const { view, title } of VIEWS.filter((v) => v.view.signedOut)) {
    test(title, async ({ page }) => {
      const opened = await view.open(page.request);
      await settled(page, opened.href, opened.designed);
      expect(await unfocusable(page), `rendered controls that refuse focus on ${opened.href}`).toEqual([]);
      const walk = await tabWalk(page, 15);
      expect(walk.first, "Tab from the top of /login reached no control").not.toBeNull();
      expect(walk.parked, "Tab parked on one element on /login: a keyboard trap").toBeNull();
      // Username, password and submit at the very least: a credentials form no keyboard can fill is no form.
      expect(walk.distinct).toBeGreaterThanOrEqual(3);
    });
  }
});

test.describe("the guided route by keyboard (AC-UI-04, AC-UI-06)", () => {
  test("the tour carries ES1 to ES6 in order and hands over to the loop route, every step reachable", async ({ page }) => {
    await page.goto("/tour");
    const steps = page.locator('[data-component="tour-step"]');
    await expect(steps.first()).toBeVisible();
    // The six Expected Solution components, in the order 6.2 surface 12 states.
    expect(await steps.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-step")))).toEqual(["ES1", "ES2", "ES3", "ES4", "ES5", "ES6"]);
    // Each step's one link, and the handover: the walk ends on the loop route.
    for (const step of await steps.all()) {
      const link = step.getByRole("link").first();
      await expect(link).toBeVisible();
      await link.focus();
      await expect(link).toBeFocused();
    }
    const handover = page.getByRole("link", { name: /loop/i }).first();
    await expect(handover).toHaveAttribute("href", "/demo/loop");
    await handover.focus();
    await expect(handover).toBeFocused();
    expect(await unfocusable(page), "rendered controls that refuse focus on /tour").toEqual([]);
  });

  test("the loop route offers its controls to a keyboard", async ({ page }) => {
    await page.goto("/demo/loop");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await unfocusable(page), "rendered controls that refuse focus on /demo/loop").toEqual([]);
    const walk = await tabWalk(page, 25);
    expect(walk.parked, "Tab parked on one element on /demo/loop: a keyboard trap").toBeNull();
    expect(walk.first, "Tab from the top of /demo/loop reached no control").not.toBeNull();
  });
});

test.describe("the decision controls by keyboard (6.4 StateRail and DecisionButtons, AC-UI-06)", () => {
  // Drawn from props in the gallery: a draft costs two provider calls, and the control's keyboard behaviour does
  // not depend on the row behind it. What is asserted is what a keyboard needs: a native button, an accessible
  // name, and focus. With no positive tabindex anywhere on the page, a focusable native button is in the tab order.
  test("every decision control is a native button with a name, and takes focus", async ({ page }) => {
    await page.goto("/gallery");
    const buttons = page.locator('[data-component="decision-buttons"] button');
    const n = await buttons.count();
    expect(n, "the gallery drew no decision control").toBeGreaterThan(0);

    const positive = await page
      .locator("[tabindex]")
      .evaluateAll((nodes) => nodes.map((x) => x.getAttribute("tabindex") ?? "").filter((v) => Number(v) > 0));
    expect(positive, "elements with a positive tabindex on /gallery").toEqual([]);

    for (let i = 0; i < n; i += 1) {
      const button = buttons.nth(i);
      const name = ((await button.textContent()) ?? "").trim();
      expect(name.length, `decision control ${i} carries no accessible name`).toBeGreaterThan(0);
      await button.focus();
      await expect(button, `decision control "${name}" does not take focus`).toBeFocused();
    }

    // INV-3 as a keyboard meets it: the Engineer is offered no control at all rather than a dead one.
    const engineer = page.locator('[data-component="decision-buttons"][data-role="Engineer"]');
    await expect(engineer.getByRole("button")).toHaveCount(0);
  });
});

test.describe("the abstention and refusal states as a screen reader meets them (AC-UI-06)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("abstention, refusal and the partial-answer banner carry their roles and names", async ({ page }) => {
    // AbstentionCard and RefusalCard are articles with an accessible name, so a screen reader announces which
    // outcome it has landed in before reading the reason.
    await expect(page.getByRole("article", { name: "Abstention" }).first()).toBeVisible();
    const refusals = page.getByRole("article", { name: "Refusal" });
    expect(await refusals.count(), "the gallery drew no refusal card").toBeGreaterThan(0);
    // The two refusal classes the packet contract declares, drawn side by side.
    expect(
      await page.locator('[data-component="refusal-card"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-class")).sort()),
    ).toEqual(["defeat", "permanent_change"]);
    // The gaps of a partial answer are a live status, not a silent banner.
    await expect(page.locator('[data-component="partial-answer-banner"][role="status"]').first()).toBeVisible();
  });

  test("the designed states and the empty state announce themselves politely", async ({ page }) => {
    const designed = page.locator("[data-designed-state]").first();
    await expect(designed).toHaveAttribute("role", "status");
    await expect(designed).toHaveAttribute("aria-live", "polite");
    // 6.3's empty state for a filter that matches nothing is a status too.
    await expect(page.locator('.empty[role="status"]').first()).toBeVisible();
    // 6.4 StatusBadge: the five fixed wordings, each rendered from the one module that owns them.
    for (const wording of Object.values(STATUS_WORDING)) {
      await expect(page.getByText(wording, { exact: false }).first(), `the fixed wording "${wording}"`).toBeAttached();
    }
  });

  test("Ask streams its outcome into a polite live region, driven from the keyboard", async ({ page }) => {
    // Search mode is the retrieval-only entry point (D-22): GET /api/search, no provider call and nothing
    // composed, so the live region of the two-stage stream is exercised without touching the answer lane.
    await page.goto("/ask");
    await expect(page.getByRole("heading", { level: 1, name: "Ask" })).toBeVisible();

    const searchMode = page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Semantic search" });
    await searchMode.focus();
    await page.keyboard.press("Enter");
    await expect(searchMode).toHaveAttribute("aria-pressed", "true");

    await page.locator('[data-component="ask-form"] textarea').focus();
    await page.keyboard.type(`${TAG} datasheet`);
    await page.locator('[data-component="ask-submit"]').focus();
    await page.keyboard.press("Enter");

    // The region announces the stage it is in, politely, and the retrieval lands in it.
    const live = page.locator('[data-component="ask-status"]');
    await expect(live).toHaveAttribute("role", "status");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(page.locator('[data-component="search-result"]')).toBeVisible();
    await expect(live).not.toBeEmpty();
  });
});

test.describe("prefers-reduced-motion is the complete static experience (AC-UI-06)", () => {
  // The whole suite runs under reducedMotion "reduce" (playwright.config.ts), so this is the state every other
  // case above was measured in; what is asserted here is that the state is real and that it settles the page.
  for (const href of ["/", "/tour", "/coverage"]) {
    test(`${href} settles with no residual motion`, async ({ page }) => {
      await page.goto(href);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), "the browser is not in the reduced-motion state").toBe(true);

      const moving = await page.locator(".rise, .roll").evaluateAll((nodes) =>
        nodes
          .map((n) => {
            const s = getComputedStyle(n);
            return { cls: n.className.slice(0, 30), opacity: s.opacity, transform: s.transform, duration: s.animationDuration };
          })
          .filter((r) => r.opacity !== "1" || (r.transform !== "none" && r.transform !== "matrix(1, 0, 0, 1, 0, 0)") || r.duration !== "0s"),
      );
      expect(moving, `revealed elements still animating or offset on ${href}`).toEqual([]);
    });
  }
});
