// The silhouette test of blueprint 7.3 and the half of the banned-pattern catalogue that only a browser can see
// (AC-VIS-01, with the rendered legs of AC-VIS-02 and AC-VIS-04).
//
// scripts/audits/banned-patterns.sh reads the text: the authored stylesheets and the markup of the built export.
// It cannot see a shape or a resolved colour. This spec reads what the browser actually paints, which is where
// the rest of 7.3 lives: a row of exactly three feature cards, a centered hero with its button pair, a badge
// floating over the H1, an oversized round icon above a heading, containers nested three deep, glass stacked
// past the two layers 7.1 allows, a teal or violet accent that no stylesheet spells out because a utility class
// composed it, text that resolves to pure white or pure black, a hover state that does nothing, and the
// silhouette itself: "a screen reduced to a black-on-white wireframe that is indistinguishable from a template
// is structurally slop".
//
// The silhouette is read as the ordered list of the screen's own laid-out blocks (tag, width and height in
// eight-pixel steps). Two readings come out of it. Per screen: a screen whose blocks carry no structural device
// of section 6.4 and no data region is a wireframe of a template, whatever text sits in it. Across screens: a
// template stamps one silhouette on every page, so two surfaces that lay out identically are the failure this
// test is named after.
//
// Where it runs. The subject is the product's read-only surfaces, and there are two ways to reach them:
// deliverables/TheHub_prototype.html, the offline export, which is a rendered copy of all of them in one file
// and needs no server and no session; and the deployment the chromium project is pointed at. This spec takes
// the export when the checkout has one (every local run, and any job that builds it) and the deployment when it
// does not (the CI e2e job, which walks the routes below as the signed-in engineer). It never skips: a run that
// can reach neither is a failure, because a visual authority nobody checked is the state this spec exists to
// end.
//
// ponytail: the hover probe samples the first six enabled links and buttons of each screen rather than every
// interactive element; widen SAMPLE if a surface ever hides a dead control behind the sixth.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * The export, when this checkout has one. `pnpm export:demo` writes it; the deliverables job rebuilds it.
 * VISUAL_EXPORT_PATH points the walk at a copy, which is how a planted violation is proven to redden a check
 * without touching the deliverable.
 */
const EXPORT = process.env.VISUAL_EXPORT_PATH ?? path.join(process.cwd(), "deliverables", "TheHub_prototype.html");

/** The read-only index surfaces as the product serves them; the walk when there is no export to read. */
const LIVE_ROUTES = ["/tour", "/", "/ask", "/assets", "/failures", "/coverage", "/drafts", "/integrity", "/evaluation", "/demo/loop"] as const;

/** How many enabled links and buttons of a screen are hovered and focused. */
const SAMPLE = 6;

/** Every check this spec makes, with the sentence a red run prints. The name is the finding's key. */
const CHECKS = {
  "banned-hue": "7.3 bans the purple-violet wash and the default teal accent family; the accent is cobalt ink",
  "pure-text-colour": "7.1 and 7.3: text is never pure white and never pure black, it is the ink tokens",
  "three-feature-cards": "7.3 bans exactly three feature cards in a row",
  "numbered-rows": "7.3 bans numbered 1-2-3 rows where the content is not a sequence",
  "centered-hero-cta": "7.3 bans the centered hero with the Get Started and Learn More pair",
  "badge-above-h1": "7.3 bans a centered badge floating above the H1",
  "icon-above-heading": "7.3 bans oversized rounded icons centered above headings",
  "container-nesting": "7.3 bans containers nested three deep",
  "glass-stack": "7.1 caps stacked backdrop blurs at two layers; 7.3 bans glass stacked as decoration",
  "type-pairing": "7.3 bans one typeface doing every job; 7.1 gives each of the three families a job",
  "structural-device": "7.3, the silhouette test: a screen with no structural device and no data region is a template",
  "hover-does-something": "7.2 and 7.3: every interactive element visibly does something on hover",
  "focus-ring": "7.2: every hover pairs with a focus-visible equivalent",
  "silhouette-distinct": "7.3, the silhouette test: two surfaces that lay out identically are one template stamped twice",
} as const;

type CheckName = keyof typeof CHECKS;
/**
 * AC-VIS-01 gates on "zero blockers", so a finding carries the severity the fleet contract uses. Every item of
 * the catalogue is a blocker with one stated exception: a control that is already in its selected state
 * (aria-pressed, aria-current, aria-selected) and does not lift under the pointer is rendering its state rather
 * than hiding an unstated action, so it is recorded as minor and named in the evidence instead of blocking.
 */
type Finding = { check: CheckName; severity: "blocker" | "minor"; what: string };
type Screen = { artifact: string; signature: string; findings: Finding[] };

/** What one screen's measurement returns from the browser. */
type Measurement = { signature: string; findings: Array<{ check: string; what: string }> };

/**
 * Everything measurable from the rendered tree of one screen. It runs inside the page, so it carries its own
 * helpers and reads only what getComputedStyle and the layout boxes say, never a class name as evidence.
 */
function measure(selector: string): Measurement {
  const root = document.querySelector(selector);
  const findings: Array<{ check: string; what: string }> = [];
  const add = (check: string, what: string): void => {
    if (findings.length < 40 && !findings.some((f) => f.check === check && f.what === what)) findings.push({ check, what });
  };
  if (!root) {
    add("structural-device", `${selector} is not on the page`);
    return { signature: "", findings };
  }

  const boxes = new Map<Element, DOMRect>();
  const rect = (el: Element): DOMRect => {
    const known = boxes.get(el);
    if (known) return known;
    const fresh = el.getBoundingClientRect();
    boxes.set(el, fresh);
    return fresh;
  };
  const visible = (el: Element): boolean => rect(el).width > 0 && rect(el).height > 0;
  const name = (el: Element): string => {
    const classes = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return el.tagName.toLowerCase() + (classes ? `.${classes}` : "");
  };
  const all = Array.from(root.querySelectorAll("*"));

  // -- colour, as the browser resolved it -----------------------------------------------------------------
  const hueOf = (r: number, g: number, b: number): { hue: number; saturation: number; lightness: number } => {
    const [rd, gd, bd] = [r / 255, g / 255, b / 255];
    const high = Math.max(rd, gd, bd);
    const low = Math.min(rd, gd, bd);
    const lightness = (high + low) / 2;
    if (high === low) return { hue: 0, saturation: 0, lightness };
    const span = high - low;
    const saturation = lightness > 0.5 ? span / (2 - high - low) : span / (high + low);
    let hue = 0;
    if (high === rd) hue = ((gd - bd) / span) % 6;
    else if (high === gd) hue = (bd - rd) / span + 2;
    else hue = (rd - gd) / span + 4;
    return { hue: (hue * 60 + 360) % 360, saturation, lightness };
  };

  for (const el of all) {
    if (!visible(el)) continue;
    const style = getComputedStyle(el);
    for (const value of [style.backgroundImage, style.backgroundColor, style.boxShadow, style.color, style.borderColor]) {
      for (const match of String(value).matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g)) {
        if (match[4] !== undefined && Number(match[4]) < 0.2) continue;
        const { hue, saturation, lightness } = hueOf(Number(match[1]), Number(match[2]), Number(match[3]));
        if (saturation < 0.25 || lightness < 0.15 || lightness > 0.92) continue;
        if (hue >= 160 && hue <= 210) add("banned-hue", `${name(el)} paints teal or cyan (hue ${Math.round(hue)}, ${match[0]})`);
        else if (hue >= 250 && hue <= 335) add("banned-hue", `${name(el)} paints violet or purple (hue ${Math.round(hue)}, ${match[0]})`);
      }
    }
  }

  // -- text ------------------------------------------------------------------------------------------------
  const families = new Set<string>();
  for (const el of all) {
    if (!visible(el)) continue;
    const owns = Array.from(el.childNodes).some((node) => node.nodeType === 3 && (node.textContent ?? "").trim() !== "");
    if (!owns) continue;
    const style = getComputedStyle(el);
    families.add(style.fontFamily.split(",")[0].replace(/["']/g, "").trim());
    if (style.color === "rgb(0, 0, 0)" || style.color === "rgb(255, 255, 255)") {
      add("pure-text-colour", `${name(el)} sets text to ${style.color}`);
    }
  }
  if (families.size < 2) {
    add("type-pairing", `the screen renders text in ${families.size === 0 ? "no family" : `one family (${[...families][0]})`}`);
  }

  // -- stacking: glass layers and width-constraining containers ---------------------------------------------
  const depthOf = (el: Element, counts: (style: CSSStyleDeclaration) => boolean): number => {
    let depth = 0;
    let cursor: Element | null = el;
    while (cursor && cursor !== document.body) {
      if (counts(getComputedStyle(cursor))) depth += 1;
      cursor = cursor.parentElement;
    }
    return depth;
  };
  for (const el of all) {
    if (!visible(el)) continue;
    const blurs = depthOf(el, (s) => s.backdropFilter !== "none" && s.backdropFilter.includes("blur"));
    if (blurs > 2) add("glass-stack", `${name(el)} sits under ${blurs} stacked backdrop blurs`);
    const constrained = depthOf(el, (s) => s.maxWidth !== "none" && Number.parseFloat(s.maxWidth) > 0);
    if (constrained >= 3) add("container-nesting", `${name(el)} sits inside ${constrained} width-constraining containers`);
  }

  // -- the template shapes ----------------------------------------------------------------------------------
  /** A card that carries no data and no component: the decorative kind 7.3 counts in threes. */
  const decorative = (el: Element): boolean => {
    if (el.querySelector("[data-component], table, img, svg")) return false;
    if (!el.querySelector("h1, h2, h3, h4, h5, h6")) return false;
    return !/\d/.test((el.textContent ?? "").replace(/^\s*\d+[.)]?\s*/, ""));
  };
  for (const el of all) {
    const kids = Array.from(el.children).filter(visible);
    if (kids.length !== 3) continue;
    const rects = kids.map(rect);
    const row = rects.every((r) => Math.abs(r.top - rects[0].top) < 4 && Math.abs(r.width - rects[0].width) < 4);
    if (row && rects[0].width > 180 && rects[0].height > 80 && kids.every(decorative)) {
      add("three-feature-cards", `${name(el)} is a row of three equal feature cards`);
    }
    const marks = kids.map((kid) => (kid.textContent ?? "").trim().slice(0, 2));
    const numbered = /^1[.)\s]?/.test(marks[0]) && /^2[.)\s]?/.test(marks[1]) && /^3[.)\s]?/.test(marks[2]);
    if (numbered && el.tagName !== "OL" && kids.every(decorative)) {
      add("numbered-rows", `${name(el)} numbers three items that are not a sequence`);
    }
  }

  const heading = root.querySelector("h1");
  if (heading) {
    const above = heading.previousElementSibling;
    if (above && visible(above)) {
      const badge = rect(above);
      const title = rect(heading);
      const centred = Math.abs((badge.left + badge.right) / 2 - (title.left + title.right) / 2) < 8;
      if (centred && badge.width < title.width * 0.6 && badge.bottom <= title.top + 2) {
        add("badge-above-h1", `${name(above)} floats centered above the H1`);
      }
    }
    if (getComputedStyle(heading).textAlign === "center") {
      const after = heading.parentElement;
      const calls = after ? Array.from(after.querySelectorAll("a[href], button")).filter(visible) : [];
      if (calls.length === 2) add("centered-hero-cta", "a centered H1 over a pair of calls to action");
    }
  }
  for (const el of all) {
    const box = rect(el);
    if (box.width < 48 || box.height < 48 || Math.abs(box.width - box.height) > 8) continue;
    if (Number.parseFloat(getComputedStyle(el).borderRadius) < box.width * 0.25) continue;
    const next = el.nextElementSibling;
    if (next && /^H[1-6]$/.test(next.tagName)) add("icon-above-heading", `${name(el)} is an oversized round icon above ${next.tagName}`);
  }

  // -- the silhouette --------------------------------------------------------------------------------------
  const blocks = all.filter((el) => rect(el).width >= 200 && rect(el).height >= 40);
  const signature = blocks
    .map((el) => `${el.tagName}:${Math.round(rect(el).width / 8)}:${Math.round(rect(el).height / 8)}`)
    .join(",");
  const devices = root.querySelectorAll("[data-component]").length;
  const dataRegions = root.querySelectorAll("table tr, dl, ol li, ul li").length;
  if (devices === 0 && dataRegions < 3) {
    add("structural-device", `the screen carries ${devices} components of 6.4 and ${dataRegions} data rows, so its wireframe is a template`);
  }

  return { signature, findings };
}

/** The hover and focus probe, which needs a real pointer and a real keyboard. */
async function probeInteraction(
  page: Page,
  scope: string,
  add: (check: CheckName, severity: Finding["severity"], what: string) => void,
): Promise<void> {
  const style = (locator: Locator): Promise<string> =>
    locator.evaluate((el) => {
      const parts: string[] = [];
      for (const pseudo of [null, "::before", "::after"]) {
        const s = getComputedStyle(el, pseudo);
        parts.push(
          [s.backgroundColor, s.color, s.boxShadow, s.transform, s.textDecorationLine, s.borderColor, s.opacity, s.outlineWidth, s.width, s.filter, s.backgroundImage.slice(0, 60)].join("~"),
        );
      }
      return parts.join("||");
    });

  // A focus left on the previous screen keeps its :focus-visible styling, and an element that is already lit
  // cannot light up again under the pointer. The probe starts from nothing focused and nothing hovered.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(0, 0);

  const candidates = await page.locator(`${scope} a[href]:visible, ${scope} button:not([disabled]):visible`).all();
  let probed = 0;
  for (const candidate of candidates) {
    if (probed >= SAMPLE) break;
    const disabled = await candidate.getAttribute("aria-disabled");
    if (disabled === "true") continue;
    probed += 1;
    const before = await style(candidate);
    await candidate.hover({ trial: false });
    const hovered = await style(candidate);
    if (hovered === before) {
      const control = await candidate.evaluate((el) => ({
        label: el.tagName.toLowerCase() + " " + (el.textContent ?? "").trim().slice(0, 30),
        selected: el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-selected") === "true" || el.hasAttribute("aria-current"),
      }));
      add(
        "hover-does-something",
        control.selected ? "minor" : "blocker",
        control.selected
          ? `${control.label} is the selected control and its selected state overrides the hover lift`
          : `${control.label} does not react to the pointer`,
      );
    }
    await page.mouse.move(0, 0);
  }

  // The keyboard equivalent: the first tab stop of the screen has to show a ring. Focus is moved to the screen
  // itself rather than clicked into, so no probe can follow a link.
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) return;
    el.setAttribute("tabindex", "-1");
    el.focus();
    el.removeAttribute("tabindex");
  }, scope);
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      visible: el.matches(":focus-visible"),
      outline: Number.parseFloat(s.outlineWidth),
      shadow: s.boxShadow,
      style: s.outlineStyle,
    };
  });
  if (ring === null) add("focus-ring", "blocker", "the screen has no keyboard tab stop");
  else if (!(ring.visible && ((ring.outline > 0 && ring.style !== "none") || ring.shadow !== "none"))) {
    add("focus-ring", "blocker", `the first tab stop (${ring.tag}) shows no ring: outline ${ring.outline}px ${ring.style}, box-shadow ${ring.shadow}`);
  }
}

// Not serial: the checks are assertions over one walk that has already happened, so a red run names every rule
// the screens break at once, which is what a review is for.
test.describe("the silhouette test and the rendered banned-pattern catalogue (blueprint 7.3, AC-VIS-01)", () => {
  const screens: Screen[] = [];
  let context: BrowserContext | undefined;
  let source = "";

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const options = test.info().project.use;
    const viewport = { width: 1440, height: 900 };

    if (existsSync(EXPORT)) {
      source = `the built export at ${EXPORT}`;
      context = await browser.newContext({ offline: true, viewport, reducedMotion: "reduce", storageState: { cookies: [], origins: [] } });
      // Nothing outside the file is allowed to answer, so a measurement can only be of what the file carries.
      await context.route("**/*", (route) => (/^(file|data|blob|about):/.test(route.request().url()) ? route.continue() : route.abort()));
      const page = await context.newPage();
      await page.goto(pathToFileURL(EXPORT).href, { waitUntil: "load" });
      const slugs = await page.$$eval("[data-x-route]", (nodes) => nodes.map((node) => node.getAttribute("data-x-route") ?? ""));
      expect(slugs.length, "the export carries no surface to review").toBeGreaterThan(0);
      for (const slug of slugs) {
        const scope = `[data-x-route="${slug}"]`;
        await page.evaluate((s) => {
          window.location.hash = `#${s}`;
        }, slug);
        await page.locator(scope).waitFor({ state: "visible" });
        const measurement = await page.evaluate(measure, scope);
        const findings: Finding[] = measurement.findings.map((f) => ({ check: f.check as CheckName, severity: "blocker", what: f.what }));
        await probeInteraction(page, scope, (check, severity, what) => findings.push({ check, severity, what }));
        screens.push({ artifact: `${EXPORT}#${slug}`, signature: measurement.signature, findings });
      }
      return;
    }

    const baseURL = options.baseURL;
    expect(baseURL, `neither ${EXPORT} nor a deployment is available, so no surface could be reviewed`).toBeTruthy();
    source = `the deployment at ${baseURL}`;
    context = await browser.newContext({ baseURL, viewport, reducedMotion: "reduce", storageState: options.storageState });
    const page = await context.newPage();
    for (const route of LIVE_ROUTES) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.ok(), `${route} answered ${response?.status()}`).toBe(true);
      // A session that expired lands every route on the login screen, and the login screen reviewed once per
      // route is a green run that reviewed nothing.
      expect(page.url(), `${route} redirected to the login screen, so no surface was reviewed`).not.toContain("/login");
      await page.locator("main").first().waitFor({ state: "visible" });
      const measurement = await page.evaluate(measure, "main");
      const findings: Finding[] = measurement.findings.map((f) => ({ check: f.check as CheckName, severity: "blocker", what: f.what }));
      await probeInteraction(page, "main", (check, severity, what) => findings.push({ check, severity, what }));
      screens.push({ artifact: `${baseURL}${route}`, signature: measurement.signature, findings });
    }
  });

  test.afterAll(async () => {
    // The per-screen record AC-VIS-01 asks for, in the fleet's own shape, on stdout for whoever files evidence.
    for (const screen of screens) {
      const findings = screen.findings.map((f) => ({ severity: f.severity, what: `${f.check}: ${f.what} (${CHECKS[f.check]})` }));
      const blockers = findings.filter((f) => f.severity === "blocker").length;
      console.log(JSON.stringify({ artifact: screen.artifact, pass: blockers === 0, findings }));
    }
    await context?.close();
  });

  test("every read-only surface was reached and measured", () => {
    expect(screens.length, `no surface was measured from ${source}`).toBeGreaterThan(0);
    const empty = screens.filter((screen) => screen.signature === "");
    expect(empty.map((screen) => screen.artifact), "these surfaces laid out nothing at all").toEqual([]);
  });

  for (const [check, why] of Object.entries(CHECKS) as Array<[CheckName, string]>) {
    if (check === "silhouette-distinct") continue;
    test(`${check}: ${why}`, () => {
      const failures = screens.flatMap((screen) =>
        screen.findings
          .filter((finding) => finding.check === check && finding.severity === "blocker")
          .map((finding) => `${screen.artifact}: ${finding.what}`),
      );
      expect(failures, why).toEqual([]);
    });
  }

  test(`silhouette-distinct: ${CHECKS["silhouette-distinct"]}`, () => {
    const seen = new Map<string, string>();
    const twins: string[] = [];
    for (const screen of screens) {
      const first = seen.get(screen.signature);
      if (first === undefined) seen.set(screen.signature, screen.artifact);
      else twins.push(`${first} and ${screen.artifact} lay out identically`);
    }
    expect(twins, CHECKS["silhouette-distinct"]).toEqual([]);
    expect(seen.size, "the surfaces collapsed to fewer silhouettes than there are screens").toBe(screens.length);
  });
});
