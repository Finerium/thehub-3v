// The capture half of the offline export (blueprint 9.12, ARCHITECTURE 11, AC-DEL-01).
//
// A headless Chromium signed in as the build-time demo Engineer walks the read-only surfaces of a local production
// server and hands back, per surface, the settled DOM the product itself rendered. Nothing in this file composes a
// surface: every one of them is drawn by the product's own server and client components (src/app/**, src/components/**)
// on a real request against the seeded database, so the export cannot drift from the deployment. The two things the
// capture adds are the citation drawers, which React mounts only while a chip is open (src/components/CitationChip.tsx
// renders GlassDrawer under `open`), and the seeded packet on Ask, which the client plays on arrival from the stored
// answer_trace with zero provider calls (9.17).
import { chromium, type BrowserContext, type Page } from "@playwright/test";

/** Exactly what `BrowserContext.addCookies` takes; the snapshot mints these from the login response. */
type AddCookie = Parameters<BrowserContext["addCookies"]>[0][number];

/** One surface of blueprint 6.2 as the export reaches it. */
export type Target = {
  /** The path on the running server, query included. */
  route: string;
  /** The path the export routes to; the surface's address inside the file (`#<route>`). */
  slug: string;
  /** The heading the landing lists this surface under. */
  title: string;
  /** What the export says this surface is for; the demo job of 6.2. */
  note: string;
  /** A selector that must be present before the DOM is read (the client half of Ask, the loop route). */
  waitFor?: string;
  /** Skip the citation-drawer walk on a surface whose chips repeat another surface's spans. */
  skipDrawers?: boolean;
};

export type Captured = Target & {
  /** The `<main>` content of the settled page: the surface itself, without the chrome the export draws once. */
  html: string;
  /** The chrome around it (rail, sheet, title block) with `<main>` emptied to SECTIONS_TOKEN. */
  shell: string;
  /** The stylesheet URLs the page loaded, in order. */
  stylesheets: string[];
  /** The class list on `<html>`: the three next/font variable classes of src/app/layout.tsx. */
  htmlClass: string;
  /** The class list on `<body>`; the paper of section 7. */
  bodyClass: string;
  /** The document title the product gave the surface. */
  documentTitle: string;
  /** Citation drawers opened on this surface, keyed by span id; the `<dialog>` markup the product rendered. */
  drawers: Record<string, string>;
  /** Chips whose drawer could not be opened, reported rather than hidden. */
  drawerFailures: string[];
};

/** Chips opened per surface, and in total: the drawers are the biggest optional block in the byte budget. */
const CHIPS_PER_SURFACE = 8;
const CHIPS_TOTAL = 40;
const NAV_TIMEOUT = 45_000;
/** The DOM is settled long before a page that holds a connection goes idle, so idleness is a short courtesy wait. */
const IDLE_TIMEOUT = 6_000;
const CHIP_TIMEOUT = 4_000;
const SETTLE_MS = 700;

/** The placeholder the shell carries where `<main>`'s content stood; the export drops its sections in there. */
export const SECTIONS_TOKEN = "<!--x-sections-->";

/**
 * The page reader, evaluated in the browser: the shell markup with everything a static file cannot use removed.
 * Next's own runtime (`<script>`, the route announcer, the dev overlay) never reaches the export; the stylesheet
 * links are recorded and dropped, because the export inlines the CSS once for the whole file.
 *
 * Two annotations are added here rather than by a regex in the build, because here a real DOM answers them. The
 * surface is split from its chrome (`<main>` against everything around it), so the export draws the rail, the sheet
 * and the title block once instead of once per surface. And every submit button of a GET form is given the URL that
 * form would ask for (`data-x-href`): the document-class tabs of surface 5 and the layer toggle of surface 7 are
 * forms, not links, so this is what lets the export route a tab to the section holding that variant.
 */
function readPage(token: string) {
  const sheets = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute("href") || "");
  const clone = document.body.cloneNode(true) as HTMLElement;
  const drop = clone.querySelectorAll(
    'script, link[rel="stylesheet"], link[rel="preload"], next-route-announcer, nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-toast], #__next-build-watcher',
  );
  for (const node of drop) node.remove();
  // A dialog left in the tree from an earlier chip would render as a second copy of the drawer.
  for (const node of clone.querySelectorAll("dialog")) node.remove();
  for (const form of clone.querySelectorAll("form")) {
    if ((form.getAttribute("method") || "get").toLowerCase() !== "get") continue;
    const action = form.getAttribute("action") || location.pathname + location.search;
    const named = [...form.querySelectorAll("input[name], select[name], textarea[name]")];
    for (const button of form.querySelectorAll("button[name], input[type=submit][name]")) {
      const url = new URL(action, location.href);
      for (const field of named) {
        const type = (field.getAttribute("type") || "").toLowerCase();
        if (type === "submit" || type === "button") continue;
        if ((type === "checkbox" || type === "radio") && !field.hasAttribute("checked")) continue;
        const name = field.getAttribute("name");
        if (!name) continue;
        const value =
          field.tagName === "SELECT"
            ? field.querySelector("option[selected]")?.getAttribute("value") || ""
            : field.getAttribute("value") || "";
        if (value) url.searchParams.set(name, value);
        else url.searchParams.delete(name);
      }
      url.searchParams.set(button.getAttribute("name") || "", button.getAttribute("value") || "");
      button.setAttribute("data-x-href", url.pathname + url.search + url.hash);
    }
  }
  const main = clone.querySelector("main");
  const mainHtml = main ? main.innerHTML : clone.innerHTML;
  if (main) main.innerHTML = token;
  return {
    html: mainHtml,
    shell: clone.innerHTML,
    sheets,
    title: document.title,
    htmlClass: document.documentElement.className,
    bodyClass: document.body.className,
  };
}

async function settle(page: Page, waitFor?: string): Promise<void> {
  if (waitFor) await page.waitForSelector(waitFor, { timeout: NAV_TIMEOUT });
  await page.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT }).catch(() => undefined);
  // The reveals of 7.2 run on load; reducedMotion is on, so this only waits out the last transition.
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Open each citation chip once per span and keep the `<dialog>` the product renders at that span. The export's
 * runtime script replays these: a chip carries `data-span`, the drawer is stored under the same key (AC-UI-02, the
 * chip-to-span path, is what this preserves offline).
 */
async function readDrawers(page: Page, seen: Set<string>, into: Record<string, string>, failures: string[]): Promise<void> {
  const chips = page.locator('[data-component="citation-chip"]');
  const count = await chips.count();
  let opened = 0;
  for (let i = 0; i < count && opened < CHIPS_PER_SURFACE && seen.size < CHIPS_TOTAL; i += 1) {
    const chip = chips.nth(i);
    const span = await chip.getAttribute("data-span");
    if (!span || seen.has(span)) continue;
    seen.add(span);
    opened += 1;
    try {
      await chip.click({ timeout: CHIP_TIMEOUT });
      const dialog = page.locator('dialog[data-component="glass-drawer"][open]').first();
      await dialog.waitFor({ state: "attached", timeout: CHIP_TIMEOUT });
      // The drawer's own page derivative, when the surface passed one, loads inside it.
      await page.waitForLoadState("networkidle", { timeout: CHIP_TIMEOUT }).catch(() => undefined);
      into[span] = await dialog.evaluate((node) => node.outerHTML);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached", timeout: CHIP_TIMEOUT }).catch(() => undefined);
    } catch (error) {
      failures.push(`${span}: ${error instanceof Error ? error.message : String(error)}`);
      await page.keyboard.press("Escape").catch(() => undefined);
    }
  }
}

async function capturePage(context: BrowserContext, baseUrl: string, target: Target, seen: Set<string>): Promise<Captured> {
  const page = await context.newPage();
  const drawers: Record<string, string> = {};
  const drawerFailures: string[] = [];
  try {
    const response = await page.goto(`${baseUrl}${target.route}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    const status = response?.status() ?? 0;
    if (status !== 200) throw new Error(`GET ${target.route} answered ${status}`);
    await settle(page, target.waitFor);
    const read = await page.evaluate(readPage, SECTIONS_TOKEN);
    if (!target.skipDrawers) await readDrawers(page, seen, drawers, drawerFailures);
    return {
      ...target,
      html: read.html,
      shell: read.shell,
      stylesheets: read.sheets,
      htmlClass: read.htmlClass,
      bodyClass: read.bodyClass,
      documentTitle: read.title,
      drawers,
      drawerFailures,
    };
  } finally {
    await page.close();
  }
}

/**
 * Walk every target in order with one signed-in browser context. The cookies are the session the build minted
 * against the local server; they never leave this process and are never written to the export. `seen` carries the
 * spans already drawn across earlier walks, so the chip budget is spent once over the whole export and no drawer is
 * stored twice.
 */
export async function captureSurfaces(
  baseUrl: string,
  cookies: AddCookie[],
  targets: readonly Target[],
  seen: Set<string> = new Set(),
): Promise<Captured[]> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      userAgent: "thehub-3v-export (Playwright)",
    });
    await context.addCookies(cookies);
    const out: Captured[] = [];
    for (const target of targets) {
      out.push(await capturePage(context, baseUrl, target, seen));
      process.stdout.write(`  captured ${target.route}\n`);
    }
    await context.close();
    return out;
  } finally {
    await browser.close();
  }
}

/**
 * The offline assertion of 9.12 and AC-DEL-01: open the written file from `file://` in a headless browser with every
 * network route aborted, walk every surface through the export's own runtime, and report what was reached and how
 * many requests were attempted. A request counter above zero is a failure of the deliverable, not of the check.
 */
export async function verifyOffline(
  fileUrl: string,
  slugs: readonly string[],
): Promise<{ reached: string[]; missing: string[]; requests: string[]; consoleErrors: string[]; drawerOpened: boolean }> {
  const browser = await chromium.launch();
  const requests: string[] = [];
  const consoleErrors: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, offline: true });
    // Every scheme but the file the page already is: nothing may be fetched, not even from the local disk.
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith("file://")) return route.continue();
      requests.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      if (!request.url().startsWith("file://")) requests.push(request.url());
    });
    await page.goto(fileUrl, { waitUntil: "load", timeout: NAV_TIMEOUT });

    const reached: string[] = [];
    const missing: string[] = [];
    for (const slug of slugs) {
      await page.evaluate((s) => {
        window.location.hash = `#${s}`;
      }, slug);
      await page.waitForTimeout(120);
      const visible = await page.evaluate((s) => {
        const section = document.querySelector(`[data-x-route="${s}"]`);
        if (!(section instanceof HTMLElement)) return false;
        return !section.hidden && section.textContent !== null && section.textContent.trim().length > 0;
      }, slug);
      (visible ? reached : missing).push(slug);
    }

    // One citation chip must open its drawer offline: the chip-to-span path is the export's ES4 moment.
    const drawerOpened = await page.evaluate(async () => {
      const chip = document.querySelector('[data-x-route]:not([hidden]) [data-component="citation-chip"][data-span]');
      if (!(chip instanceof HTMLElement)) {
        const anywhere = document.querySelector('[data-component="citation-chip"][data-span]');
        if (!(anywhere instanceof HTMLElement)) return false;
        const section = anywhere.closest("[data-x-route]");
        if (section instanceof HTMLElement) section.hidden = false;
        anywhere.click();
      } else {
        chip.click();
      }
      await new Promise((r) => setTimeout(r, 150));
      return document.querySelector("dialog[data-x-drawer][open]") !== null;
    });

    await context.close();
    return { reached, missing, requests, consoleErrors, drawerOpened };
  } finally {
    await browser.close();
  }
}
