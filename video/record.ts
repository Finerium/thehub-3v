// The capture half of the video pipeline (AC-DEL-03; blueprint 2.2; deviation D-37 for the frame format).
//
// What changed from the first cut, and why. The first cut was Playwright's own screen recording: VP8 at 1280 by 720
// and about 600 kbps, re-encoded to 190 kbps at 15 frames per second. The product's small type did not survive two
// lossy passes, and the cut showed every wait it filmed. This capture is a sequence of lossless PNG screenshots of
// the deployed instance at a 1280 by 720 layout rendered at device scale 1.5, so every frame is 1920 by 1080 with the
// product's own type drawn at that resolution. Each frame carries its duration in 25 fps frames, so a hold costs one
// screenshot and a wait for the provider, the drafter or a page load costs the cut nothing: nothing is filmed until a
// state has settled.
//
// It does four things, in this order, and writes what it did to video/out/beats.json:
//
//   1. The beats. Each beat is a script against the deployed instance, played into a reel: frames, holds to the
//      cue marks of `beats.ts`, a drawn pointer that glides to what it clicks, a ripple on the click, an outline on
//      what the caption is about, and animated scrolls. The reel is cut to the beat's slot exactly.
//   2. The loop beat, B6, on a fresh browser context so it walks in a sandbox of its own (D-16). It needs the model
//      provider: the drafter, the redliner and the second ask. When the walk cannot reach a publication, the beat
//      falls back to the script's own fallback text over the footage of 2026-09-07, and the record says so.
//   3. Captions. `beats.ts` is checked against `narration.md`, written out as video/captions.srt and rendered as the
//      burn-in layer: transparent 1920 by 1080 PNGs, set in the product's typefaces, with the replay disclosure in
//      the corner of every frame.
//   4. The record, video/out/beats.json, which is all the encode reads.
//
// Every sign-in is a POST to /api/auth/login through the request context: no login form is ever opened, so no field
// and no credential is ever in frame, and no password is logged, printed or put on a command line.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { beats, checkVerbatim, fixtures, REPLAY_LINE, srt, timeline, totalSeconds, type B6Variant, type Beat, type TimedCue } from "./beats";

const BASE = process.env.VIDEO_BASE_URL ?? "https://thehub-3v.vercel.app";
const HERE = import.meta.dirname;
const FRAMES = path.join(HERE, "frames");
const OUT = path.join(HERE, "out");
const RAW_B6 = path.join(HERE, "raw", "b6.webm");
/** The layout the product is filmed at, and the scale it is rendered at: 1280 by 720 CSS pixels, 1920 by 1080 frames. */
const CSS_W = 1280;
const CSS_H = 720;
const SCALE = 1.5;
const FPS = 25;
/** The caption band covers the bottom of the frame; what a caption is about is framed above this line. */
const SAFE_BOTTOM = 560;

/** The stored GA-1201A abstention B5 opens on: the coupling-element question of 2026-09-07, abstained on coverage. */
const GAP_TRACE = "7937a596-fc67-46fc-a0af-e0b1ef36475c";
/** The seeded chip B2 replays: the GA-1201A trip question, answered once over the real corpus and stored. */
const CHIP = "chip-GA-1201A-1";
/** The question B3 types: a request to get past the GA-1201A trip, refused by the rule pack before any model call. */
const DEFEAT_QUESTION = "Start-up is tonight. How do we get past the SEQ-1201 trip on GA-1201A?";
/** The approved manual-bypass lesson B3 shows, found by its document number on the LV-6701 asset sheet. */
const BYPASS_DOC_NO = "OPL-LV-6701-05";
/**
 * The B6 fallback: five stills from the footage of 2026-09-07, each held for its stretch of the beat. Stills, not the
 * running footage, because the running footage goes on to the publish call of that day, which the route answered
 * with a 500 (the tracing-key defect fixed at 9c4a88c), and then to the Integrity Register; neither belongs under the
 * fallback's words. Each still is a moment the fallback text describes: the Supervisor's walk, the stored draft, the
 * acceptance, and the Manager's publish act ready and not yet taken.
 */
const FALLBACK_STILLS: Array<{ at: number; until: number; what: string }> = [
  { at: 34.3, until: 6, what: "the guided loop as the Reviewing Supervisor, on the top-ranked cluster" },
  { at: 2.0, until: 11, what: "the request taken and the stored draft in review" },
  { at: 9.0, until: 16, what: "the stored draft with the evidence the drafter received" },
  { at: 35.5, until: 23, what: "the acceptance in the state history" },
  { at: 36.6, until: 41, what: "the Manager's publish act, ready and not taken" },
];

const ACCOUNTS = {
  Engineer: { username: "engineer_demo", env: "DEMO_ENGINEER_PASSWORD" },
  Supervisor: { username: "supervisor_demo", env: "DEMO_SUPERVISOR_PASSWORD" },
  Manager: { username: "manager_demo", env: "DEMO_MANAGER_PASSWORD" },
} as const;
type Role = keyof typeof ACCOUNTS;

/** `--beats b2,b4` films only the named beats and keeps every other beat's frames and record as they are. */
const ONLY: Set<string> | null = (() => {
  const at = process.argv.indexOf("--beats");
  if (at < 0) return null;
  const ids = (process.argv[at + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error("--beats needs a comma-separated list of beat ids, for example --beats b6");
  return new Set(ids);
})();
/** `--b6 fallback` skips the live walk and uses the fallback footage. */
const FORCE_B6: B6Variant | null = (() => {
  const at = process.argv.indexOf("--b6");
  return at < 0 ? null : (process.argv[at + 1] as B6Variant);
})();

const misses: string[] = [];
const note = (message: string): void => {
  misses.push(message);
  console.log(`  miss: ${message}`);
};
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const ease = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/* Signing in ---------------------------------------------------------------------------------------------------- */

/** Sign this context in as `role`. The password goes straight into the request body and nowhere else. */
async function signIn(api: APIRequestContext, role: Role): Promise<void> {
  const account = ACCOUNTS[role];
  const password = process.env[account.env];
  if (!password) throw new Error(`${account.env} is not in this run's environment; run through video/run.sh`);
  const response = await api.post(`${BASE}/api/auth/login`, { data: { username: account.username, password } });
  if (!response.ok()) throw new Error(`login as ${account.username} answered ${response.status()}`);
  console.log(`  signed in as ${role}`);
}

async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: CSS_W, height: CSS_H },
    deviceScaleFactor: SCALE,
    reducedMotion: "reduce",
    userAgent: "thehub-3v-video (Playwright)",
  });
}

/* The reel ------------------------------------------------------------------------------------------------------ */

/** One captured frame, its length in 25 fps frames, and what video/overlay.py draws over it, in CSS pixels. */
type Frame = { file: string; n: number; scale: number; cursor: Point | null; ripple: number | null; box: Box | null };
type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

/** Wait until a navigated page has painted what it is going to paint: network quiet, fonts, the images in view. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images).filter((img) => !img.complete);
    await Promise.race([Promise.all(images.map((img) => new Promise((r) => { img.onload = img.onerror = () => r(null); }))), new Promise((r) => setTimeout(r, 8000))]);
  });
  await wait(450);
}

class Reel {
  readonly frames: Frame[] = [];
  private count = 0;
  private files = 0;
  cursor: Point | null = null;
  private ripple: number | null = null;
  private outline: Locator | null = null;
  readonly dir: string;

  constructor(
    public page: Page,
    readonly id: string,
    readonly slot: number,
  ) {
    this.dir = path.join(FRAMES, id);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
  }

  /** Seconds of the beat filmed so far. */
  get seconds(): number {
    return this.count / FPS;
  }

  async snap(n = 1): Promise<void> {
    const box = this.outline ? await this.outline.boundingBox({ timeout: 3_000 }).catch(() => null) : null;
    const scale = await this.page.evaluate(() => window.devicePixelRatio);
    const file = path.join(this.dir, `f${String(++this.files).padStart(4, "0")}.png`);
    await this.page.screenshot({ path: file, type: "png", animations: "disabled", caret: "hide" });
    this.frames.push({ file, n, scale, cursor: this.cursor ? { ...this.cursor } : null, ripple: this.ripple, box });
    this.count += n;
  }

  /** Hold the last frame until the beat's clock reaches `seconds`, the mark the caption cues are set to. */
  until(seconds: number): void {
    const target = Math.round(seconds * FPS);
    const short = target - this.count;
    if (this.frames.length === 0) throw new Error(`${this.id}: nothing filmed before the ${seconds} s mark`);
    if (short > 0) {
      this.frames[this.frames.length - 1].n += short;
      this.count = target;
    } else if (short < 0) {
      note(`${this.id}: the motion before the ${seconds} s mark ran ${(-short / FPS).toFixed(2)} s over it`);
    }
  }

  /** Outline what the caption is about, or clear the outline. Painted on the next frame. */
  mark(target: Locator | null): void {
    this.outline = target;
  }

  hide(): void {
    this.cursor = null;
  }

  async glide(to: Point, seconds = 0.48): Promise<void> {
    const from = this.cursor ?? { x: CSS_W * 0.66, y: CSS_H * 0.6 };
    const steps = Math.max(2, Math.round(seconds * FPS));
    for (let i = 1; i <= steps; i++) {
      const e = ease(i / steps);
      this.cursor = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      await this.snap(1);
    }
  }

  /** Bring the pointer onto a node, where a person's hand would land on it. */
  async point(target: Locator, seconds = 0.48): Promise<boolean> {
    const box = await target.boundingBox({ timeout: 8_000 }).catch(() => null);
    if (!box) {
      note(`${this.id}: the pointer found nothing to land on`);
      return false;
    }
    await this.glide({ x: box.x + Math.min(box.width / 2, 48), y: box.y + box.height / 2 }, seconds);
    return true;
  }

  /** The click a viewer sees (a ripple under the pointer), then the click itself. */
  async press(act: () => Promise<unknown>): Promise<boolean> {
    for (const r of [7, 13, 19]) {
      this.ripple = r;
      await this.snap(1);
    }
    this.ripple = null;
    try {
      await act();
      return true;
    } catch (error) {
      note(`${this.id}: a click did not land (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`);
      return false;
    }
  }

  async click(target: Locator, seconds = 0.48): Promise<boolean> {
    if (!(await this.point(target, seconds))) return false;
    return this.press(() => target.click({ timeout: 15_000 }));
  }

  /** Type into a field a few characters a frame, so the question is seen being asked. */
  async type(target: Locator, text: string, perFrame = 3): Promise<void> {
    await target.click({ timeout: 10_000 });
    for (let i = 0; i < text.length; i += perFrame) {
      await target.pressSequentially(text.slice(i, i + perFrame));
      await this.snap(2);
    }
  }

  private async scrollY(): Promise<number> {
    return this.page.evaluate(() => window.scrollY);
  }

  /** An animated scroll of the window to `y`, one frame per step. */
  async scrollTo(y: number, seconds = 0.56): Promise<void> {
    const from = await this.scrollY();
    const max = await this.page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const to = Math.max(0, Math.min(max, Math.round(y)));
    if (Math.abs(to - from) < 2) return;
    const steps = Math.max(2, Math.round(seconds * FPS));
    for (let i = 1; i <= steps; i++) {
      await this.page.evaluate((v) => window.scrollTo(0, v), Math.round(from + (to - from) * ease(i / steps)));
      await this.snap(1);
    }
  }

  /** Where a node sits on the page, in document pixels. */
  async topOf(target: Locator): Promise<number | null> {
    return target
      .first()
      .evaluate((e) => e.getBoundingClientRect().top + window.scrollY, undefined, { timeout: 8_000 })
      .catch(() => null);
  }

  /** Scroll so a node's top lands `atY` pixels below the top of the frame: animated, or instantly between shots. */
  async frame(target: Locator, atY = 80, seconds = 0.56): Promise<boolean> {
    const top = await this.topOf(target);
    if (top === null) {
      note(`${this.id}: nothing to frame`);
      return false;
    }
    if (seconds <= 0) await this.page.evaluate((v) => window.scrollTo(0, v), Math.max(0, Math.round(top - atY)));
    else await this.scrollTo(top - atY, seconds);
    return true;
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await settle(this.page);
  }

  /** Cut the reel to the slot: the last hold absorbs any shortfall, the longest holds give back any overrun. */
  fit(): { frames: number; concat: string } {
    const target = Math.round(this.slot * FPS);
    if (this.count < target) this.frames[this.frames.length - 1].n += target - this.count;
    let over = this.count - target;
    if (over > 0) note(`${this.id}: filmed ${(over / FPS).toFixed(2)} s over its ${this.slot} s slot; the longest holds give it back`);
    while (over > 0) {
      const longest = this.frames.reduce((a, b) => (b.n > a.n ? b : a));
      if (longest.n <= 1) throw new Error(`${this.id}: the reel cannot be cut to its slot`);
      longest.n -= 1;
      over -= 1;
    }
    this.count = target;
    // The drawn layer goes onto a copy of each raw frame (c0001.png beside f0001.png); the concat names the copies.
    const drawn = this.frames.map((f) => ({ ...f, raw: path.basename(f.file), out: path.basename(f.file).replace(/^f/, "c") }));
    writeFileSync(path.join(this.dir, "frames.json"), `${JSON.stringify(drawn.map((f) => ({ raw: f.raw, out: f.out, n: f.n, scale: f.scale, cursor: f.cursor, ripple: f.ripple, box: f.box })), null, 1)}\n`);
    const painted = spawnSync("python3", [path.join(HERE, "overlay.py"), path.join(this.dir, "frames.json")], { encoding: "utf8" });
    if (painted.status !== 0) throw new Error(`${this.id}: video/overlay.py failed: ${painted.stderr}`);
    const lines = ["ffconcat version 1.0"];
    for (const f of drawn) lines.push(`file ${f.out}`, `duration ${(f.n / FPS).toFixed(4)}`);
    lines.push(`file ${drawn[drawn.length - 1].out}`);
    const concat = path.join(this.dir, "frames.ffconcat");
    writeFileSync(concat, `${lines.join("\n")}\n`);
    return { frames: this.frames.length, concat };
  }
}

/* The beats ----------------------------------------------------------------------------------------------------- */

const q = (page: Page, selector: string): Locator => page.locator(selector).first();

/** Tag the innermost node matching `selector` whose text includes every `text` (climbing `up` parents), for a locator. */
async function tag(page: Page, name: string, selector: string, text: string | string[], up = 0): Promise<Locator> {
  const texts = Array.isArray(text) ? text : [text];
  await page.evaluate(
    ({ name, selector, texts, up }) => {
      document.querySelectorAll(`[data-reel="${name}"]`).forEach((e) => e.removeAttribute("data-reel"));
      // The innermost match: every ancestor of a node also "includes" its text, so the shortest text is the node.
      const hits = Array.from(document.querySelectorAll(selector)).filter((e) => texts.every((t) => (e.textContent ?? "").includes(t)));
      hits.sort((a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length);
      let node: Element | null = hits[0] ?? null;
      for (let i = 0; i < up && node?.parentElement; i++) node = node.parentElement;
      node?.setAttribute("data-reel", name);
    },
    { name, selector, texts, up },
  );
  return page.locator(`[data-reel="${name}"]`).first();
}

type Shot = (reel: Reel, context: BrowserContext) => Promise<void>;

const SCRIPTS: Record<string, Shot> = {
  // B1 The problem: Home's gap headline, then the Console with its two layers, the method and the three bands.
  async b1(reel) {
    const { page } = reel;
    await reel.goto("/");
    await reel.snap();
    reel.until(4.5);
    reel.mark(q(page, '[data-component="gap-headline"]'));
    await reel.snap();
    reel.until(8.1);
    reel.mark(null);
    reel.cursor = { x: 780, y: 470 };
    await reel.click(q(page, 'nav a[href="/coverage"], aside a[href="/coverage"]'), 0.6);
    await page.waitForURL(/\/coverage$/, { timeout: 30_000 }).catch(() => note("b1: the sidebar did not reach the Console"));
    await settle(page);
    reel.mark(await tag(page, "generous", '[data-component="coverage-gap"] *', "generous layer", 1));
    await reel.snap();
    reel.until(15);
    reel.mark(null);
    await reel.scrollTo(150, 0.48);
    reel.mark(await tag(page, "method", "details", "window 2n", 0));
    await reel.snap();
    reel.until(17.4);
    reel.mark(q(page, '[data-component="band-bars"]'));
    await reel.snap();
    reel.until(20);
  },

  // B2 Evidence: the seeded trip question replayed from storage, a claim's citation to its drawer and its page, then
  // the stored trace.
  async b2(reel) {
    const { page } = reel;
    await reel.goto(`/ask?chip=${CHIP}`);
    const traceHref = await page.locator('a[href^="/trace/"]').first().getAttribute("href");
    reel.mark(q(page, '[data-component="ask-form"]'));
    await reel.snap();
    reel.until(5);
    reel.mark(null);
    const claims = q(page, '[data-component="packet"] [aria-label="Claims"]');
    await reel.frame(claims, 70);
    reel.mark(claims);
    await reel.snap();
    reel.until(9.3);
    reel.mark(null);
    reel.cursor = { x: 900, y: 420 };
    const chip = page.locator('[data-component="packet"] [aria-label="Claims"] [data-component="citation-chip"]').filter({ hasText: "OPL-GA-1201A-07" }).first();
    await reel.click(chip, 0.5);
    const drawer = q(page, 'dialog[data-component="glass-drawer"]');
    await drawer.waitFor({ state: "visible", timeout: 15_000 }).catch(() => note("b2: the citation drawer did not open"));
    await wait(700);
    reel.mark(await tag(page, "approval", 'dialog[data-component="glass-drawer"] *', "Approval status", 1));
    await reel.snap();
    reel.until(14.3);
    reel.mark(null);
    const viewer = page.locator('dialog[data-component="glass-drawer"]').getByRole("link", { name: /Open in the document viewer/ }).first();
    await reel.click(viewer, 0.45);
    await page.waitForURL(/\/documents\//, { timeout: 30_000 }).catch(() => note("b2: the viewer did not open"));
    await settle(page);
    await reel.frame(q(page, '[data-component="page-viewer"]'), 64, 0);
    reel.hide();
    reel.mark(q(page, '[data-component="page-viewer"] [data-span], [data-component="page-viewer"] mark, [data-component="span-box"], [data-component="page-viewer"] [class*="span"]'));
    await reel.snap();
    reel.until(20);
    reel.mark(null);
    await reel.goto(traceHref ?? "/trace");
    await reel.snap();
    reel.until(24.5);
    await reel.frame(q(page, '[data-component="verdict-strip"]'), 60);
    reel.mark(q(page, '[data-component="verdict-strip"]'));
    await reel.snap();
    reel.until(30);
  },

  // B3 Safety: the defeat request typed and refused by the rule pack, the permit route, then the approved bypass
  // lesson read at 160 percent, as a person zooms in to read a page.
  async b3(reel, context) {
    const { page } = reel;
    await reel.goto("/ask");
    reel.cursor = { x: 760, y: 470 };
    await reel.snap(25);
    const box = q(page, '[data-component="ask-form"] textarea');
    await reel.point(box, 0.4);
    await reel.press(() => box.click());
    await reel.type(box, DEFEAT_QUESTION, 3);
    const submit = q(page, '[data-component="ask-submit"]');
    await reel.point(submit, 0.36);
    await reel.press(() => submit.click());
    const card = q(page, '[data-component="refusal-card"]');
    await card.waitFor({ state: "visible", timeout: 60_000 }).catch(() => note("b3: the refusal card did not arrive"));
    await wait(600);
    await reel.frame(card, 30, 0.48);
    reel.mark(await tag(page, "refused", '[data-component="refusal-card"] *', "Refused", 0));
    await reel.snap();
    reel.until(10);
    reel.mark(null);
    const route = await tag(page, "route", '[data-component="refusal-card"] *', "permit-to-work procedure", 0);
    await reel.frame(route, 220, 0.56);
    reel.mark(route);
    await reel.snap();
    reel.until(14);
    reel.mark(null);
    reel.hide();

    await reel.goto("/assets/LV-6701");
    const href = await page.locator("a", { hasText: BYPASS_DOC_NO }).first().getAttribute("href");
    if (!href) note(`b3: ${BYPASS_DOC_NO} is not linked from the LV-6701 sheet`);
    await reel.goto(href ?? "/documents");
    reel.mark(await tag(page, "approved", "main *", "Approval status", 1));
    await reel.snap();
    reel.until(20);
    reel.mark(null);

    // The same page at 160 percent, in a second view of the same signed-in browser: what Ctrl and plus does.
    const zoom = 1.6;
    const zoomed = await context.browser()!.newContext({
      viewport: { width: Math.round(CSS_W / zoom), height: Math.round(CSS_H / zoom) },
      deviceScaleFactor: SCALE * zoom,
      reducedMotion: "reduce",
      storageState: await context.storageState(),
    });
    const zpage = await zoomed.newPage();
    const main = reel.page;
    reel.page = zpage;
    try {
      await reel.goto(href ?? "/documents");
      const render = q(zpage, '[data-component="page-viewer"] img');
      const top = await reel.topOf(render);
      const height = await render.evaluate((e) => e.getBoundingClientRect().height).catch(() => 0);
      if (top === null) note("b3: the lesson page render was not found at 160 percent");
      await zpage.evaluate((v) => window.scrollTo(0, v), Math.max(0, Math.round((top ?? 0) + height * 0.16)));
      await reel.snap();
      reel.until(24);
      await reel.scrollTo((top ?? 0) + height * 0.42, 1.2);
      reel.until(35);
    } finally {
      reel.page = main;
      await zoomed.close();
    }
  },

  // B4 Context: the typed rows behind a tag, the drawing with its transcription line, then the misalignment chain.
  async b4(reel) {
    const { page } = reel;
    await reel.goto("/assets/GA-1201A");
    const card = page.locator('[data-component="tag-card"]').filter({ hasText: "VSHH-1201" }).first();
    await reel.frame(card, 70, 0);
    await card.evaluate((e) => e.setAttribute("data-reel-card", "vs"));
    reel.mark(q(page, '[data-reel-card="vs"] table'));
    await reel.snap();
    reel.until(3.6);
    reel.mark(await tag(page, "related", '[data-reel-card="vs"] *', "Related work orders", 1));
    await reel.snap();
    reel.until(7);
    reel.mark(null);
    const caption = q(page, "#pid figcaption");
    const capTop = await reel.topOf(caption);
    await reel.scrollTo((capTop ?? 0) - (SAFE_BOTTOM - 20), 0.8);
    reel.mark(caption);
    await reel.snap();
    reel.until(17);
    reel.mark(null);
    await reel.goto("/failures/GA-1201A");
    await reel.frame(q(page, '[data-component="chain"]'), 70, 0);
    await reel.snap();
    reel.until(19.5);
    reel.mark(await tag(page, "cracked", '[data-component="chain"] li, [data-component="chain"] > *', ["WO-240003", fixtures().demo.primary_wo], 0));
    await reel.snap();
    reel.until(25);
  },

  // B5 From one gap to the queue: the stored abstention, the records no lesson teaches, the ranked clusters.
  async b5(reel) {
    const { page } = reel;
    await reel.goto(`/trace/${encodeURIComponent(GAP_TRACE)}`);
    reel.mark(await tag(page, "outcome", "main span, main p, main a", "outcome abstention", 0));
    await reel.snap();
    reel.until(6);
    reel.mark(null);
    await reel.goto("/failures/GA-1201A");
    const records = q(page, '[data-component="uncovered-records"]');
    await reel.frame(records, 60, 0);
    reel.mark(records);
    await reel.snap();
    reel.until(13);
    reel.mark(null);
    await reel.goto("/coverage");
    const first = q(page, '[data-component="cluster-card"]');
    await reel.frame(first, 110, 0);
    reel.mark(first);
    await reel.snap();
    reel.until(20);
  },

  // B7 Closing: the run this product is scored by, and the address.
  async b7(reel, context) {
    const zoom = 1.25;
    const zoomed = await context.browser()!.newContext({
      viewport: { width: Math.round(CSS_W / zoom), height: Math.round(CSS_H / zoom) },
      deviceScaleFactor: SCALE * zoom,
      reducedMotion: "reduce",
      storageState: await context.storageState(),
    });
    const main = reel.page;
    reel.page = await zoomed.newPage();
    try {
      await reel.goto("/evaluation");
      await reel.snap();
      reel.until(4);
    } finally {
      reel.page = main;
      await zoomed.close();
    }
  },
};

/* B6, the loop ---------------------------------------------------------------------------------------------------- */

const MACHINE_STATES = ["proposed", "drafted", "redlined"];
const DRAFT_DEADLINE_MS = 480_000;
const REPROPOSE_ROUNDS = 3;
const PROVIDER_DOWN = /model provider did not answer|budget|Live answering is off/i;

/** The draft this browser's sandbox holds, read back the way the loop surface reads it. */
async function draftState(api: APIRequestContext, id: string): Promise<string | null> {
  const r = await api.get(`${BASE}/api/drafts/${encodeURIComponent(id)}`, { timeout: 90_000 }).catch(() => null);
  if (!r || r.status() !== 200) return null;
  return ((await r.json()) as { draft: { state: string } }).draft.state;
}

async function settleDraft(api: APIRequestContext, id: string): Promise<string> {
  const until = Date.now() + DRAFT_DEADLINE_MS;
  for (;;) {
    const state = (await draftState(api, id)) ?? "proposed";
    if (!MACHINE_STATES.includes(state)) return state;
    if (Date.now() > until) return state;
    await wait(6_000);
  }
}

/**
 * The walk, filmed as the script's shot plan: the Supervisor's request, the stored draft with its evidence and
 * redline verdict, the acceptance; the Manager's publication, the revision, the child corpus version and the recount;
 * the same question asked again. Every model call happens between frames, so no wait is on screen. Returns false at
 * the first step that cannot be filmed truthfully, and the caller falls back.
 */
async function walkLoop(reel: Reel, context: BrowserContext): Promise<boolean> {
  const { page } = reel;
  await signIn(context.request, "Supervisor");
  await reel.goto("/demo/loop");

  // Act 1, off camera: the question before the lesson exists. It is the provider check as well.
  const ask = page.getByRole("button", { name: "Ask the question" }).first();
  if (!(await ask.isVisible().catch(() => false))) {
    note("b6: the loop offered no first ask; this sandbox already holds a walk");
    return false;
  }
  await ask.click();
  const outcome = page.locator('[data-act="ask_before"] .tag').first();
  await outcome.waitFor({ state: "visible", timeout: 180_000 }).catch(() => undefined);
  const act1 = (await page.locator('[data-act="ask_before"]').innerText().catch(() => "")) ?? "";
  if (PROVIDER_DOWN.test(act1)) {
    note("b6: the model provider did not answer the first ask, so the walk cannot be filmed");
    return false;
  }

  // 0 to 9 s: the Supervisor's badge, the target, then the request.
  await page.evaluate(() => window.scrollTo(0, 0));
  reel.mark(q(page, 'header p.badge[data-tone="accent"]'));
  await reel.snap();
  reel.until(2.2);
  reel.mark(q(page, '[aria-labelledby="loop-target"]'));
  await reel.snap();
  reel.until(4.2);
  reel.mark(null);
  await reel.frame(q(page, '[data-act="request"]'), 90, 0.5);
  reel.cursor = { x: 820, y: 430 };
  const request = page.getByRole("button", { name: "Request the lesson" }).first();
  if (!(await reel.click(request, 0.5))) return false;
  await page.getByText("Draft requested").first().waitFor({ timeout: 60_000 }).catch(() => undefined);
  await reel.snap();
  reel.until(7);

  // Off camera: the drafter and the redliner, re-proposed on a block (9.6) a bounded number of times.
  const idText = (await page.locator('[data-act="request"] .mono').first().textContent().catch(() => null))?.trim() ?? null;
  let id: string | null = idText;
  if (!id) {
    note("b6: the request carried no draft id");
    return false;
  }
  let state = await settleDraft(context.request, id);
  for (let round = 0; (state === "blocked" || state === "rejected") && round < REPROPOSE_ROUNDS; round++) {
    note(`b6: the draft came back ${state}; re-proposing it (9.6)`);
    const reproposed: Awaited<ReturnType<APIRequestContext["post"]>> = await context.request.post(`${BASE}/api/drafts/${encodeURIComponent(id)}/repropose`, { data: {}, timeout: 300_000 });
    if (!reproposed.ok()) break;
    id = ((await reproposed.json()) as { draft_id: string }).draft_id;
    state = await settleDraft(context.request, id);
  }
  if (state !== "in_review") {
    note(`b6: the draft settled ${state}, not in_review`);
    return false;
  }

  // 7 to 17 s: the stored draft, its evidence, its redline verdict.
  reel.hide();
  await reel.goto(`/drafts/${encodeURIComponent(id)}`);
  await reel.snap();
  reel.until(11.5);
  const verdict = q(page, '[data-component="redline-verdict"], [data-component="redline-verdict-panel"], [data-component="redline"]');
  if (await reel.frame(verdict, 90, 0.6)) reel.mark(verdict);
  await reel.snap();
  reel.until(17);
  reel.mark(null);

  // 17 to 23 s: back on the loop, any slot answered off camera, then the acceptance.
  await reel.goto("/demo/loop");
  const slots = page.getByLabel("Engineer note");
  for (let i = 0; i < (await slots.count()); i++) {
    await slots.nth(i).fill("Replace on the interval the supplier states; until one is on file, inspect at every second alignment check.");
    await page.getByRole("button", { name: "Record the note" }).first().click();
    await page.getByText("Note recorded").nth(i).waitFor({ timeout: 30_000 }).catch(() => undefined);
  }
  await reel.frame(q(page, '[data-act="review"]'), 90, 0);
  reel.cursor = { x: 860, y: 420 };
  const accept = page.getByRole("button", { name: "Accept the draft" }).first();
  if (!(await reel.click(accept, 0.5))) return false;
  const accepted = page.locator('[data-act="review"]').getByText("Accepted").first();
  if (!(await accepted.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false))) {
    note("b6: the acceptance did not land");
    return false;
  }
  reel.mark(accepted);
  await reel.snap();
  reel.until(23);
  reel.mark(null);

  // 23 to 30 s: the Manager, signed in off camera; the badge, then the publication.
  await signIn(context.request, "Manager");
  reel.hide();
  await reel.goto("/demo/loop");
  reel.mark(q(page, 'header p.badge[data-tone="accent"]'));
  await reel.snap();
  reel.until(25.2);
  reel.mark(null);
  await reel.frame(q(page, '[data-act="publish"]'), 90, 0.5);
  reel.cursor = { x: 860, y: 420 };
  const publish = page.getByRole("button", { name: "Publish the lesson" }).first();
  if (!(await reel.click(publish, 0.5))) return false;
  const published = page.locator('[data-act="publish"]').getByText("Published").first();
  if (!(await published.waitFor({ timeout: 180_000 }).then(() => true).catch(() => false))) {
    note("b6: the publication did not land");
    return false;
  }
  await wait(1200);
  reel.until(Math.max(28.4, reel.seconds));
  reel.mark(published.locator("xpath=.."));
  await reel.snap();
  reel.until(30);

  // 30 to 36 s: the revision and the recount, then the child version on the recount panel.
  reel.mark(await tag(page, "recount", '[data-act="publish"] p', "uncovered before", 0));
  await reel.snap();
  reel.until(33);
  const moment = q(page, '[data-component="recount-moment"]');
  await reel.frame(moment, 70, 0.5);
  reel.mark(moment);
  await reel.snap();
  reel.until(36);
  reel.mark(null);

  // 36 to 41 s: the same question, one lesson later, answered between frames and shown once it is stored.
  await reel.frame(q(page, '[data-act="ask_after"]'), 90, 0.4);
  const again = page.getByRole("button", { name: "Ask the same question again" }).first();
  if (!(await reel.click(again, 0.4))) return false;
  const done = page.locator('[data-act="ask_after"]').getByText("Done.").first();
  if (!(await done.waitFor({ timeout: 180_000 }).then(() => true).catch(() => false))) {
    note("b6: the second ask did not finish");
    return false;
  }
  const act6 = (await page.locator('[data-act="ask_after"]').innerText().catch(() => "")) ?? "";
  if (PROVIDER_DOWN.test(act6)) {
    note("b6: the provider did not answer the second ask");
    return false;
  }
  reel.hide();
  await reel.frame(q(page, '[data-act="ask_after"]'), 40, 0);
  reel.mark(q(page, '[data-act="ask_after"] [aria-label="Claims"]'));
  await reel.snap();
  reel.until(41);
  return true;
}

/** The B6 fallback as a reel of stills from the earlier footage, scaled to the frame with Lanczos and a light unsharp. */
function fallbackReel(): { frames: number; concat: string } {
  const dir = path.join(FRAMES, "b6");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const drawn: Array<{ n: number; scale: number; cursor: null; ripple: null; box: null; raw: string; out: string }> = [];
  let from = 0;
  FALLBACK_STILLS.forEach((still, i) => {
    const raw = `f${String(i + 1).padStart(4, "0")}.png`;
    const made = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(still.at), "-i", RAW_B6, "-frames:v", "1", "-vf", `scale=${CSS_W * SCALE}:${CSS_H * SCALE}:flags=lanczos,unsharp=5:5:0.5:5:5:0.0`, path.join(dir, raw)], { encoding: "utf8" });
    if (made.status !== 0) throw new Error(`b6 fallback: the still at ${still.at} s could not be taken: ${made.stderr}`);
    drawn.push({ n: Math.round((still.until - from) * FPS), scale: 1, cursor: null, ripple: null, box: null, raw, out: raw.replace(/^f/, "c") });
    from = still.until;
  });
  writeFileSync(path.join(dir, "frames.json"), `${JSON.stringify(drawn, null, 1)}\n`);
  const painted = spawnSync("python3", [path.join(HERE, "overlay.py"), path.join(dir, "frames.json")], { encoding: "utf8" });
  if (painted.status !== 0) throw new Error(`b6 fallback: video/overlay.py failed: ${painted.stderr}`);
  const lines = ["ffconcat version 1.0"];
  for (const f of drawn) lines.push(`file ${f.out}`, `duration ${(f.n / FPS).toFixed(4)}`);
  lines.push(`file ${drawn[drawn.length - 1].out}`);
  const concat = path.join(dir, "frames.ffconcat");
  writeFileSync(concat, `${lines.join("\n")}\n`);
  return { frames: drawn.length, concat };
}

/* The caption layer --------------------------------------------------------------------------------------------- */

type Segment = { seconds: number; cue: TimedCue | null };

/** The whole cut as segments, so the layer is a continuous strip and the disclosure badge is on every frame. */
function segments(cues: TimedCue[], total: number): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const cue of cues) {
    if (cue.start > at) out.push({ seconds: cue.start - at, cue: null });
    out.push({ seconds: cue.end - cue.start, cue });
    at = cue.end;
  }
  if (total > at) out.push({ seconds: total - at, cue: null });
  return out;
}

const LAYER_HTML = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --ink-900:#1b1916; --accent:#1e3fb8; --caveat:#9a5600; --rim:rgba(27,25,22,0.12); }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; width:${CSS_W}px; height:${CSS_H}px; background:transparent; overflow:hidden; }
  body { font-family:"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing:antialiased; }
  #badge { position:absolute; top:14px; right:16px; display:inline-flex; align-items:center; gap:7px;
    font-family:"IBM Plex Mono", ui-monospace, monospace; font-size:11.5px; line-height:1; letter-spacing:0.01em;
    color:var(--caveat); background:rgba(255,253,248,0.95); border:1px solid rgba(154,86,0,0.40);
    border-radius:999px; padding:7px 12px; box-shadow:0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 12px rgba(27,25,22,0.08); }
  #badge::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--caveat); }
  #band { position:absolute; left:0; right:0; margin:0 auto; width:fit-content; bottom:30px; max-width:1100px; display:none;
    background:rgba(255,253,248,0.96); border:1px solid var(--rim); border-radius:12px; padding:13px 28px 14px;
    box-shadow:0 1px 0 rgba(255,255,255,0.9) inset, 0 12px 30px rgba(27,25,22,0.14); }
  #text { margin:0; text-align:center; font-size:26px; line-height:1.34; font-weight:500; color:var(--ink-900);
    font-variant-numeric:tabular-nums; text-wrap:balance; }
  #sub { margin:8px 0 0; display:none; text-align:center; font-family:"IBM Plex Mono", ui-monospace, monospace;
    font-size:19px; line-height:1.2; color:var(--accent); }
</style></head><body>
<div id="badge"></div><div id="band"><p id="text"></p><p id="sub"></p></div>
</body></html>`;

async function renderCaptionLayer(browser: Browser, list: Segment[]): Promise<void> {
  const dir = path.join(FRAMES, "captions");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.setContent(LAYER_HTML, { waitUntil: "networkidle" });
  await page.evaluate((line) => {
    (document.getElementById("badge") as HTMLElement).textContent = line;
  }, REPLAY_LINE);
  await page.evaluate(() => document.fonts.ready);
  const lines: string[] = ["ffconcat version 1.0"];
  for (const [i, segment] of list.entries()) {
    const file = `cue-${String(i).padStart(3, "0")}.png`;
    await page.evaluate((cue: { text: string; sub: string } | null) => {
      const band = document.getElementById("band") as HTMLElement;
      const sub = document.getElementById("sub") as HTMLElement;
      if (cue === null) {
        band.style.display = "none";
        return;
      }
      band.style.display = "block";
      (document.getElementById("text") as HTMLElement).textContent = cue.text;
      sub.textContent = cue.sub;
      sub.style.display = cue.sub ? "block" : "none";
    }, segment.cue ? { text: segment.cue.text, sub: segment.cue.sub ?? "" } : null);
    await page.screenshot({ path: path.join(dir, file), omitBackground: true });
    lines.push(`file ${file}`, `duration ${segment.seconds.toFixed(4)}`);
  }
  lines.push(`file cue-${String(list.length - 1).padStart(3, "0")}.png`);
  writeFileSync(path.join(dir, "captions.ffconcat"), `${lines.join("\n")}\n`);
  await context.close();
  console.log(`captions: ${list.length} segments rendered into video/frames/captions/`);
}

/* The run ------------------------------------------------------------------------------------------------------- */

type Record_ = {
  id: string;
  title: string;
  seconds: number;
  speaker: string;
  onScreen: string;
  concat: string | null;
  frames: number;
  source: { file: string; stills: typeof FALLBACK_STILLS } | null;
};

async function main(): Promise<void> {
  const fx = fixtures();
  const previous = existsSync(path.join(OUT, "beats.json")) ? (JSON.parse(readFileSync(path.join(OUT, "beats.json"), "utf8")) as { b6_variant?: B6Variant; beats?: Record_[] }) : null;
  const ids = beats(fx).map((b) => b.id);
  const chosen = ONLY ? ids.filter((id) => ONLY.has(id)) : ids;
  if (chosen.length === 0) throw new Error(`--beats named no beat of this cut; it has ${ids.join(", ")}`);
  mkdirSync(OUT, { recursive: true });
  mkdirSync(FRAMES, { recursive: true });

  const browser = await chromium.launch();
  const recorded: Record_[] = [];
  let b6: B6Variant = previous?.b6_variant ?? "fallback";
  try {
    const context = await newContext(browser);
    await signIn(context.request, "Engineer");
    const page = await context.newPage();
    const plan = beats(fx);
    for (const id of chosen) {
      const beat = plan.find((b) => b.id === id) as Beat;
      console.log(`${beat.id} (${beat.seconds} s): ${beat.title}`);
      if (id === "b6") {
        let filmed = false;
        if (FORCE_B6 !== "fallback") {
          const loopContext = await newContext(browser);
          const loopPage = await loopContext.newPage();
          const reel = new Reel(loopPage, "b6", beat.seconds);
          try {
            filmed = await walkLoop(reel, loopContext);
            if (filmed) {
              const { frames, concat } = reel.fit();
              recorded.push({ id, title: beat.title, seconds: beat.seconds, speaker: beat.speaker, onScreen: beat.onScreen, concat: path.relative(path.join(HERE, ".."), concat), frames, source: null });
            }
          } catch (error) {
            note(`b6 ended early: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
            filmed = false;
          } finally {
            await loopContext.close();
          }
        }
        b6 = filmed ? "retake" : "fallback";
        if (!filmed) {
          if (!existsSync(RAW_B6)) throw new Error("the B6 fallback footage video/raw/b6.webm is missing");
          const fb = beats(fx, "fallback").find((b) => b.id === "b6") as Beat;
          const { frames, concat } = fallbackReel();
          recorded.push({ id, title: fb.title, seconds: fb.seconds, speaker: fb.speaker, onScreen: fb.onScreen, concat: path.relative(path.join(HERE, ".."), concat), frames, source: { file: path.relative(path.join(HERE, ".."), RAW_B6), stills: FALLBACK_STILLS } });
        }
        console.log(`  b6: ${b6}`);
        continue;
      }
      const reel = new Reel(page, id, beat.seconds);
      reel.hide();
      await SCRIPTS[id](reel, context);
      const { frames, concat } = reel.fit();
      recorded.push({ id, title: beat.title, seconds: beat.seconds, speaker: beat.speaker, onScreen: beat.onScreen, concat: path.relative(path.join(HERE, ".."), concat), frames, source: null });
      console.log(`  ${frames} frames into video/frames/${id}/`);
    }

    // Captions follow the B6 the cut actually carries.
    const list = beats(fx, b6);
    const problems = checkVerbatim(list, readFileSync(path.join(HERE, "narration.md"), "utf8"));
    if (problems.length > 0) throw new Error(`the captions are not the narration verbatim:\n${problems.join("\n")}`);
    const cues = timeline(list);
    writeFileSync(path.join(HERE, "captions.srt"), srt(cues));
    console.log(`captions.srt: ${cues.length} cues over ${totalSeconds(list)} s (b6 ${b6})`);
    await renderCaptionLayer(browser, segments(cues, totalSeconds(list)));
    await context.close();
  } finally {
    await browser.close();
  }

  const list = beats(fx, b6);
  const merged = list.map((beat) => recorded.find((r) => r.id === beat.id) ?? previous?.beats?.find((r) => r.id === beat.id) ?? null);
  const missing = list.filter((_, i) => merged[i] === null).map((b) => b.id);
  const report = {
    base_url: BASE,
    recorded_at: new Date().toISOString(),
    beats_retaken: ONLY ? chosen : null,
    width: Math.round(CSS_W * SCALE),
    height: Math.round(CSS_H * SCALE),
    layout: { width: CSS_W, height: CSS_H, device_scale: SCALE },
    fps: FPS,
    total_seconds: totalSeconds(list),
    b6_variant: b6,
    beats: merged.filter((r): r is Record_ => r !== null),
    missing,
    misses,
  };
  writeFileSync(path.join(OUT, "beats.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nvideo/out/beats.json written; b6 ${b6}; ${missing.length} beat(s) without frames, ${misses.length} miss(es)`);
}

await main();
