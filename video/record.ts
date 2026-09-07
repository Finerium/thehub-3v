// The capture half of the video pipeline (AC-DEL-03; blueprint 2.2, 9.12; PRD 26.2).
//
// It does three things, in this order, and writes what it did to video/out/beats.json so the encode half needs no
// argument of its own:
//
//   1. Captions. `beats.ts` is checked against `narration.md` (the PRD's 26.2 text verbatim), then written out as
//      video/captions.srt and rendered frame by frame into video/frames/ as the burn-in layer. This host's ffmpeg
//      carries neither libass nor libfreetype, so the burn-in cannot be a text filter: the layer is a transparent
//      PNG per segment, set in the product's own typefaces by the browser that is already a dependency here, and
//      composited by one `overlay`.
//
//   2. The warm pass, with no camera running. Every model-backed artefact the cut shows is produced here, before
//      the recording: the answer traces and the drafted, redlined lesson. It runs through `context.request`, so no
//      page exists and nothing of it reaches the footage. This is what makes the on-screen disclosure true, and it
//      is why the loop beat can show a stored draft instead of a spinner.
//
//   3. The six beats, one page each, at 1280 by 720 against the deployed instance. Every sign-in is a POST to
//      /api/auth/login through the request context: no login form is ever opened, so no field and no credential is
//      on camera, and no password is logged, printed or put on a command line.
//
// A surface that is mid-repair does not end the run. Each step is attempted, and a step whose target is not there
// is recorded as a miss in video/out/beats.json and held on what is there instead, so the cut is always producible
// and the report always says which beat is short.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { beats, checkVerbatim, fixtures, REPLAY_LINE, srt, timeline, totalSeconds, type Beat, type TimedCue } from "./beats";

const BASE = process.env.VIDEO_BASE_URL ?? "https://thehub-3v.vercel.app";
const HERE = import.meta.dirname;
const RAW = path.join(HERE, "raw");
const FRAMES = path.join(HERE, "frames");
const OUT = path.join(HERE, "out");
const WIDTH = 1280;
const HEIGHT = 720;

/** The demo accounts of this deployment and the variable each password is read from. The value is never read here. */
const ACCOUNTS = {
  Engineer: { username: "engineer_demo", env: "DEMO_ENGINEER_PASSWORD" },
  Supervisor: { username: "supervisor_demo", env: "DEMO_SUPERVISOR_PASSWORD" },
  Manager: { username: "manager_demo", env: "DEMO_MANAGER_PASSWORD" },
} as const;
type Role = keyof typeof ACCOUNTS;

/** src/loop/lease.ts holds a draft for 240 s; the poll is given that plus room for the watchdog to land. */
const DRAFT_DEADLINE_MS = 480_000;
const DRAFT_POLL_MS = 6_000;
const MACHINE_STATES = ["proposed", "drafted", "redlined"];
/** How far down the knowledge-debt ranking the warm pass will go looking for a draft it can film. */
const CLUSTERS_TRIED = 3;
/** How long `show` waits for a node before calling it absent. One navigation on the deployed instance, no more. */
const SHOW_TIMEOUT_MS = 6_000;
/** How long the loop beat waits for the review act to mount and offer its slot field. */
const SLOT_TIMEOUT_MS = 20_000;

/**
 * `--beats b3,b6` records only the named beats and merges them into the beats.json already on disk, leaving the
 * other beats' footage and their records untouched. A cut is six recordings against a live deployment, and one
 * beat missing its moment is not a reason to re-shoot the five that landed: the slots are fixed, so a beat is a
 * self-contained file and re-taking it cannot move anything else. The warm pass then does only the work the
 * chosen beats need, so a loop re-take does not spend three more answers it will not film.
 */
const ONLY: Set<string> | null = (() => {
  const at = process.argv.indexOf("--beats");
  if (at < 0) return null;
  const ids = (process.argv[at + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error("--beats needs a comma-separated list of beat ids, for example --beats b6");
  return new Set(ids);
})();

const misses: string[] = [];
const note = (message: string): void => {
  misses.push(message);
  console.log(`  miss: ${message}`);
};
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/* 1. The caption layer ------------------------------------------------------------------------------------------ */

/** One stretch of the caption layer: a cue on screen, or the badge alone between two of them. */
type Segment = { seconds: number; cue: TimedCue | null };

/** The whole 175 s as segments, so the layer is a continuous strip and the disclosure badge is on every frame. */
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

/** The burn-in layer's own page: the product's palette and typefaces of blueprint 7.1, over nothing at all. */
const LAYER_HTML = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --paper:#f4f1ea; --ink-900:#1b1916; --ink-700:#4a453e; --accent:#1e3fb8; --caveat:#9a5600; --rim:rgba(27,25,22,0.12); }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; width:${WIDTH}px; height:${HEIGHT}px; background:transparent; overflow:hidden; }
  body { font-family:"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing:antialiased; }
  #badge { position:absolute; top:18px; right:18px; display:inline-flex; align-items:center; gap:8px;
    font-family:"IBM Plex Mono", ui-monospace, monospace; font-size:13px; line-height:1; letter-spacing:0.01em;
    color:var(--caveat); background:rgba(255,253,248,0.94); border:1px solid rgba(154,86,0,0.42);
    border-radius:999px; padding:8px 14px; box-shadow:0 1px 0 rgba(255,255,255,0.9) inset; }
  #badge::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--caveat); }
  #band { position:absolute; left:50%; transform:translateX(-50%); bottom:34px; width:1128px; display:none;
    background:rgba(255,253,248,0.95); border:1px solid var(--rim); border-radius:12px; padding:16px 26px;
    box-shadow:0 1px 0 rgba(255,255,255,0.9) inset, 0 10px 26px rgba(27,25,22,0.10); }
  #band[data-tone="caveat"] { border-color:rgba(154,86,0,0.45); box-shadow:inset 4px 0 0 var(--caveat), 0 10px 26px rgba(27,25,22,0.10); }
  #text { margin:0; text-align:center; font-size:27px; line-height:1.34; font-weight:500; color:var(--ink-900);
    font-variant-numeric:tabular-nums; }
  #band[data-tone="caveat"] #text { color:var(--caveat); font-size:24px; font-weight:500; }
  #sub { margin:10px 0 0; display:none; text-align:center; font-family:"IBM Plex Mono", ui-monospace, monospace;
    font-size:20px; line-height:1.2; color:var(--accent); }
</style></head><body>
<div id="badge"></div><div id="band"><p id="text"></p><p id="sub"></p></div>
</body></html>`;

async function renderCaptionLayer(page: Page, list: Segment[]): Promise<void> {
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  await page.setContent(LAYER_HTML, { waitUntil: "load" });
  await page.evaluate((line) => {
    (document.getElementById("badge") as HTMLElement).textContent = line;
  }, REPLAY_LINE);
  // The web fonts, once, before the first frame is taken: a fallback face would change every frame's metrics.
  await page.evaluate(() => document.fonts.ready);

  const lines: string[] = ["ffconcat version 1.0"];
  for (const [i, segment] of list.entries()) {
    const file = `cue-${String(i).padStart(3, "0")}.png`;
    await page.evaluate((cue: { text: string; sub: string; tone: string } | null) => {
      const band = document.getElementById("band") as HTMLElement;
      const text = document.getElementById("text") as HTMLElement;
      const sub = document.getElementById("sub") as HTMLElement;
      if (cue === null) {
        band.style.display = "none";
        return;
      }
      band.style.display = "block";
      band.dataset.tone = cue.tone;
      text.textContent = cue.text;
      sub.textContent = cue.sub;
      sub.style.display = cue.sub ? "block" : "none";
    }, segment.cue ? { text: segment.cue.text, sub: segment.cue.sub ?? "", tone: segment.cue.tone ?? "plain" } : null);
    await page.screenshot({ path: path.join(FRAMES, file), omitBackground: true, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    lines.push(`file ${file}`, `duration ${segment.seconds.toFixed(3)}`);
  }
  // The concat demuxer drops the last entry's duration unless the file is named once more (documented behaviour).
  lines.push(`file cue-${String(list.length - 1).padStart(3, "0")}.png`);
  writeFileSync(path.join(FRAMES, "captions.ffconcat"), `${lines.join("\n")}\n`);
  console.log(`captions: ${list.length} segments rendered into video/frames/`);
}

/* 2. The warm pass ---------------------------------------------------------------------------------------------- */

/** Sign this browser in as `role`. The password goes straight into the request body and nowhere else. */
async function signIn(api: APIRequestContext, role: Role): Promise<string> {
  const account = ACCOUNTS[role];
  const password = process.env[account.env];
  if (!password) throw new Error(`${account.env} is not in this run's environment; run through video/run.sh`);
  const response = await api.post(`${BASE}/api/auth/login`, { data: { username: account.username, password } });
  // The status alone: no body of a credential exchange is ever printed, failed or not.
  if (!response.ok()) throw new Error(`login as ${account.username} answered ${response.status()}`);
  const body = (await response.json()) as { alias?: string };
  if (typeof body.alias !== "string") throw new Error(`login as ${account.username} answered 200 without an alias`);
  console.log(`signed in as ${role} (${body.alias})`);
  return body.alias;
}

type AskLine = {
  stage: string;
  trace_id?: string;
  evidence?: Array<{ doc_no: string; document_id: string }>;
  packet?: { trace_id: string; outcome: string };
};

/** POST /api/ask once and hand back both stream lines, so the cut can replay the answer it stored. */
async function warmAsk(api: APIRequestContext, question: string): Promise<{ trace: string | null; evidence: AskLine["evidence"] }> {
  const response = await api.post(`${BASE}/api/ask`, { data: { question }, timeout: 180_000 });
  if (!response.ok()) {
    note(`the warm ask answered ${response.status()}`);
    return { trace: null, evidence: undefined };
  }
  const lines = (await response.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as AskLine);
  const evidence = lines.find((l) => l.stage === "evidence")?.evidence;
  const packet = lines.find((l) => l.stage === "packet")?.packet;
  if (!packet) {
    note("the warm ask closed before its packet line");
    return { trace: null, evidence };
  }
  console.log(`  warmed: outcome ${packet.outcome}, trace ${packet.trace_id}`);
  return { trace: packet.trace_id, evidence };
}

/** What `warmAsk` would have returned for a question this run has no beat to spend it on. */
const EMPTY_ASK: { trace: string | null; evidence: AskLine["evidence"] } = { trace: null, evidence: undefined };

type WarmDraft = { id: string; state: string; cluster_id: string } | null;

/** Poll one draft until the machine lane is done with it, and hand back the state it settled in. */
async function pollDraft(api: APIRequestContext, id: string): Promise<string> {
  const until = Date.now() + DRAFT_DEADLINE_MS;
  let state = "proposed";
  for (;;) {
    const poll = await api.get(`${BASE}/api/drafts/${encodeURIComponent(id)}`, { timeout: 90_000 }).catch(() => null);
    if (poll?.status() === 200) {
      state = ((await poll.json()) as { draft: { state: string } }).draft.state;
      if (!MACHINE_STATES.includes(state)) break;
    }
    if (Date.now() >= until) {
      note(`the draft ${id} was still in the machine lane (${state}) when the poll deadline passed`);
      break;
    }
    await wait(DRAFT_POLL_MS);
  }
  return state;
}

/**
 * The lesson the loop beat is built on, with the swap the PRD's 26.2 and its risk R-07 plan for.
 *
 * The drafting lane can end a draft `blocked`: the lease of ADR-004 expires, or the redliner blocks a round. Both
 * are re-proposable by 9.6, and neither is a reason to film a walk with nothing in it, because the version roll
 * and the recount are the signature moment of the whole cut. So a blocked draft is re-proposed on the same cluster
 * a bounded number of times, and a cluster that still will not yield one is swapped for the next in the ranking
 * rather than re-planned. Every attempt that failed is a miss in video/out/beats.json, so the record says how many
 * it took and on which cluster it landed.
 */
const REPROPOSE_ROUNDS = 2;
const REPROPOSABLE = ["blocked", "rejected"];

async function warmDraft(api: APIRequestContext, clusterIds: string[]): Promise<WarmDraft> {
  let last: WarmDraft = null;
  for (const clusterId of clusterIds) {
    const requested = await api.post(`${BASE}/api/drafts`, { data: { cluster_id: clusterId }, timeout: 300_000 });
    if (requested.status() !== 202 && !requested.ok()) {
      note(`the draft request on ${clusterId} answered ${requested.status()}`);
      continue;
    }
    let { draft_id: id } = (await requested.json()) as { draft_id: string };
    console.log(`  draft ${id} requested on ${clusterId}; polling`);

    for (let round = 0; ; round++) {
      const state = await pollDraft(api, id);
      console.log(`  draft ${id} is ${state}`);
      last = { id, state, cluster_id: clusterId };
      if (!REPROPOSABLE.includes(state)) return last;
      if (round >= REPROPOSE_ROUNDS) {
        note(`the draft on ${clusterId} came back ${state} after ${round + 1} attempts; trying the next cluster`);
        break;
      }
      note(`the draft on ${clusterId} came back ${state}; re-proposing it (9.6)`);
      const again = await api.post(`${BASE}/api/drafts/${encodeURIComponent(id)}/repropose`, { data: {}, timeout: 300_000 });
      if (again.status() !== 201 && !again.ok()) {
        note(`the re-proposal of ${id} answered ${again.status()}`);
        break;
      }
      id = ((await again.json()) as { draft_id: string }).draft_id;
      console.log(`  re-proposed as ${id}; polling`);
    }
  }
  return last;
}

/* 3. The beats -------------------------------------------------------------------------------------------------- */

type Camera = {
  page: Page;
  /** Seconds of footage before the beat's first framed moment; the encode trims exactly this much off the head. */
  lead: () => number;
  /** Seconds of footage after the head, as filmed; the record beside the footage carries it. */
  filmed: () => number;
  /** Mark the head: everything up to here (the navigation and the first paint) is trimmed away. */
  ready: () => void;
  /** Bring a node into frame and hold on it. A node that is not there is a miss, and the hold happens anyway. */
  show: (selector: string, seconds: number, label?: string) => Promise<boolean>;
  hold: (seconds: number) => Promise<void>;
};

/**
 * The camera keeps a wall clock, not a stopwatch per step.
 *
 * A beat owns a fixed slot, and the encode trims the footage to it from the head, so a beat that overruns loses its
 * ending: on the loop beat that ending is the closing card, which is the one frame of the cut that must survive. A
 * hold therefore waits until the beat's own clock reaches the cumulative mark the script has asked for, rather than
 * waiting that long from wherever the previous step happened to finish. Navigation, first paint and the 7.2 reveals
 * are then absorbed by the hold that follows them instead of being added on top of it, and a beat whose planned
 * holds sum to its slot lands on its slot. A beat that still overruns says so in video/out/beats.json.
 */
function camera(page: Page, slot: number): Camera {
  const opened = Date.now();
  let readyAt: number | null = null;
  let cursor = 0; // the seconds of the beat the script has spent, as planned rather than as elapsed
  const until = async (seconds: number): Promise<void> => {
    cursor += seconds;
    const left = (readyAt ?? opened) + cursor * 1000 - Date.now();
    if (left > 0) await wait(left);
  };
  return {
    page,
    lead: () => (readyAt === null ? 0 : (readyAt - opened) / 1000),
    filmed: () => (readyAt === null ? 0 : (Date.now() - readyAt) / 1000),
    ready: () => {
      readyAt = Date.now();
      void slot; // the slot is the encode's business; the camera only reports what it filmed against it
    },
    hold: until,
    show: async (selector, seconds, label) => {
      const target = page.locator(selector).first();
      // Waited for, not counted. A click that navigates resolves before the next document paints, so counting the
      // node straight away asks the page being left whether the page being opened has rendered, and calls a slow
      // surface a missing one. The wait is short because the beat is on a wall clock: time spent here is time the
      // following hold gives back, and a surface that really is absent still costs only this much.
      const there = await target
        .waitFor({ state: "visible", timeout: SHOW_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false);
      if (there) {
        await target.scrollIntoViewIfNeeded({ timeout: 8_000 }).catch(() => note(`${label ?? selector} would not scroll into frame`));
      } else {
        note(`${label ?? selector} is not on this surface`);
      }
      await until(seconds);
      return there;
    },
  };
}

async function open(context: BrowserContext, url: string, slot: number): Promise<Camera> {
  const page = await context.newPage();
  // The camera is opened before the navigation, not after it: Playwright starts writing the beat's video file the
  // moment the page exists, so a clock started after goto() would report a lead shorter than the footage actually
  // carries, and the encode would leave that much navigation and blank paint at the head of the beat.
  const cam = camera(page, slot);
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  return cam;
}

type Warm = { askTrace: string | null; gapTrace: string | null; bypassDoc: string | null; draft: WarmDraft; clusterId: string | null };

/** The six beats. Each returns the camera it filmed on; the caller closes the page, which flushes its video. */
const SCRIPTS: Record<string, (context: BrowserContext, warm: Warm, slot: number) => Promise<Camera>> = {
  // B1 Hook: the gap headline on Home, then the Console with the method chip, both layers and the three bands.
  async b1(context, _warm, slot) {
    const cam = await open(context, "/", slot);
    await cam.page.locator('[data-component="gap-headline"]').first().waitFor({ timeout: 45_000 }).catch(() => note("Home did not render its gap headline"));
    cam.ready();
    await cam.show('[data-component="gap-headline"]', 7, "the gap headline");
    await cam.page.goto(`${BASE}/coverage`, { waitUntil: "domcontentloaded" });
    await cam.show('[data-component="coverage-gap"]', 6, "the Console gap");
    await cam.page.locator('[data-component="neumorphic-chip"] summary, details summary').first().click({ timeout: 5_000 }).catch(() => note("the method chip would not open"));
    await cam.hold(3);
    await cam.show('[data-component="band-bars"]', 6, "the three bands");
    return cam;
  },

  // B2 Ask: the typed setpoint with its sheet's own note and its effects, a citation chip through to its span, and
  // the stored trace of the warmed answer. The seeded question chips of 9.17 arrive with bundle 1.1.0 and this
  // deployment runs 1.0.2, so the packet itself has no replay surface here and the beat frames what does.
  async b2(context, warm, slot) {
    const cam = await open(context, "/assets/GA-1201A", slot);
    await cam.page.locator('[data-component="tag-card"]').first().waitFor({ timeout: 45_000 }).catch(() => note("the asset sheet rendered no tag card"));
    cam.ready();
    const vs = cam.page.locator('[data-component="tag-card"]').filter({ hasText: "VSHH-1201" }).first();
    if (await vs.count()) {
      await vs.scrollIntoViewIfNeeded().catch(() => undefined);
      await cam.hold(8);
    } else {
      note("no VSHH-1201 tag card on the asset sheet");
      await cam.hold(8);
    }
    await cam.show("#interlock", 5, "the interlock summary with the training-values note");
    const chip = cam.page.locator('[data-component="citation-chip"]').first();
    if (await chip.count()) {
      await chip.scrollIntoViewIfNeeded().catch(() => undefined);
      await chip.click({ timeout: 8_000 }).catch(() => note("the citation chip would not open"));
      await cam.hold(4);
      await cam.page
        .locator('dialog[data-component="glass-drawer"]')
        .getByRole("link", { name: /Open in the document viewer/ })
        .first()
        .click({ timeout: 8_000 })
        .catch(() => note("the drawer carried no viewer link"));
      await cam.show('[data-component="page-viewer"]', 6, "the page viewer at the span");
    } else {
      note("no citation chip on the asset sheet");
      await cam.hold(10);
    }
    if (warm.askTrace) {
      await cam.page.goto(`${BASE}/trace/${encodeURIComponent(warm.askTrace)}`, { waitUntil: "domcontentloaded" });
      await cam.show('[data-component="gateway-calls"]', 7, "the trace of the warmed answer");
    } else {
      await cam.hold(7);
    }
    return cam;
  },

  // B3 Safety: the defeat request refused by the rule pack before any provider call, filmed as it happens because
  // that path composes nothing; then the approved bypass, framed on the lesson document itself, served verbatim
  // under its own hash. No model output is on screen in either half.
  async b3(context, warm, slot) {
    const cam = await open(context, "/ask", slot);
    const form = cam.page.locator('[data-component="ask-form"]');
    await form.waitFor({ timeout: 45_000 }).catch(() => note("Ask did not render its form"));
    cam.ready();
    const box = form.locator("textarea, input[type=text]").first();
    await box.click({ timeout: 8_000 }).catch(() => note("the ask field would not take focus"));
    await box
      .pressSequentially("start-up is tonight, how do we get past the SEQ-3401 trip", { delay: 20 })
      .catch(() => note("the ask field would not take the question"));
    await cam.page.locator('[data-component="ask-submit"]').first().click({ timeout: 8_000 }).catch(() => note("the ask form would not submit"));
    await cam.page.locator('[data-component="refusal-card"]').first().waitFor({ timeout: 60_000 }).catch(() => note("the refusal card did not arrive"));
    await cam.show('[data-component="refusal-card"]', 10, "the refusal with its sequence and SIL");
    // The refusal renders its own permissives, reset note and permit route inside the card (RefusalCard's
    // `ol.permissives`). The PermissiveGate component belongs to the return-to-service lane of an answer, not to a
    // refusal packet, so framing that here asked for a node this surface never carries.
    await cam.show('[data-component="refusal-card"] ol.permissives', 7, "the documented permissives and the reset path");
    if (warm.bypassDoc) {
      await cam.page.goto(`${BASE}/documents/${encodeURIComponent(warm.bypassDoc)}`, { waitUntil: "domcontentloaded" });
      await cam.show("main", 18, "the approved bypass lesson under its hash");
    } else {
      note("the bypass lesson was not resolved in the warm pass");
      await cam.hold(18);
    }
    return cam;
  },

  // B4 Context: the P&ID index and its provenance, the typed rows behind the tag card, the proof tests, and the
  // misalignment chain ending at the demo record.
  async b4(context, _warm, slot) {
    const cam = await open(context, "/assets/GA-1201A", slot);
    await cam.page.locator("#pid").first().waitFor({ timeout: 45_000 }).catch(() => note("the asset sheet rendered no P&ID index"));
    cam.ready();
    await cam.show("#pid", 7, "the P&ID index");
    await cam.show('[data-component="sidecar-provenance"]', 4, "the sidecar provenance line");
    await cam.page.goto(`${BASE}/failures/GA-1201A`, { waitUntil: "domcontentloaded" });
    await cam.show('[data-component="proof-test-card"]', 5, "the last proof tests");
    await cam.show('[data-component="chain"]', 9, "the misalignment chain");
    return cam;
  },

  // B5 Gap: the trace of the warmed coupling-element question, which names the part it could not answer, then the
  // records no lesson teaches on that asset and the ranked cluster they sit in.
  async b5(context, warm, slot) {
    const cam = await open(context, warm.gapTrace ? `/trace/${encodeURIComponent(warm.gapTrace)}` : "/failures/GA-1201A", slot);
    await cam.page.locator("h1").first().waitFor({ timeout: 45_000 }).catch(() => note("the gap beat's first surface did not render"));
    cam.ready();
    if (warm.gapTrace) await cam.show("main", 6, "the trace of the partial answer");
    else await cam.hold(6);
    await cam.page.goto(`${BASE}/failures/GA-1201A`, { waitUntil: "domcontentloaded" });
    await cam.show('[data-component="uncovered-records"]', 7, "the records no lesson teaches");
    await cam.page.goto(`${BASE}/coverage`, { waitUntil: "domcontentloaded" });
    await cam.show('[data-component="cluster-card"]', 7, "the ranked clusters");
    return cam;
  },

  // B6 Loop: the stored draft, the note, the acceptance, the Manager's publication and the recount. The draft and
  // the redline verdict were written in the warm pass; what happens on camera is the two human decisions, the one
  // publishing transaction and the recount it returns.
  async b6(context, warm, slot) {
    const cam = await open(context, "/demo/loop", slot);
    await cam.page.locator("[data-act]").first().waitFor({ timeout: 45_000 }).catch(() => note("the guided loop rendered no acts"));
    cam.ready();
    await cam.show('[data-act="draft"]', 6, "the drafted and redlined lesson");
    if (warm.draft) {
      await cam.page.goto(`${BASE}/drafts/${encodeURIComponent(warm.draft.id)}`, { waitUntil: "domcontentloaded" });
      await cam.show("main", 8, "the stored draft with provenance on every element");
      await cam.page.goto(`${BASE}/demo/loop`, { waitUntil: "domcontentloaded" });
    } else {
      note("no draft was warmed, so the loop beat has no stored draft to frame");
      await cam.hold(8);
    }
    // The slot the drafter could not fill, answered by the person who holds the judgement.
    //
    // Waited for, not counted, for the same reason `show` waits: the loop is a client component that fetches the
    // draft after mount, so the review act and its slot field appear a moment after domcontentloaded. Asking
    // whether the node exists the instant the navigation resolves answers "no" on a draft that does have a slot,
    // and the accept that follows then finds its button still disabled behind `slotsFilled`.
    const noteField = cam.page.getByLabel(/Engineer note/i).first();
    const hasSlot = await noteField
      .waitFor({ state: "visible", timeout: SLOT_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (hasSlot) {
      await noteField.scrollIntoViewIfNeeded().catch(() => undefined);
      await noteField.click({ timeout: 8_000 }).catch(() => undefined);
      await noteField
        .pressSequentially("Replace the coupling element at every second alignment check until a supplier interval is on file.", { delay: 16 })
        .catch(() => note("the engineer-note field would not take the note"));
      await cam.page.getByRole("button", { name: /Record the note/i }).first().click({ timeout: 10_000 }).catch(() => note("the note would not record"));
      await cam.hold(3);
    } else {
      note("the loop route offered no engineer-note slot");
      await cam.hold(5);
    }
    await cam.page.getByRole("button", { name: /Accept the draft/i }).first().click({ timeout: 15_000 }).catch(() => note("the draft would not accept"));
    await cam.hold(4);
    // The Manager, through the request context: the role switch never opens a login form on camera (D-16).
    await signIn(context.request, "Manager").catch(() => note("no Manager session could be minted"));
    await cam.page.reload({ waitUntil: "domcontentloaded" });
    await cam.show('[data-act="publish"]', 3, "the publishing act");
    await cam.page.getByRole("button", { name: /Publish the lesson/i }).first().click({ timeout: 30_000 }).catch(() => note("the lesson would not publish"));
    // A click that lands is not a publication that happened: G3 re-reads the draft inside its transaction and can
    // refuse it. The beat's caption says the version increments, so the record has to say whether it did.
    const refused = await cam.page
      .getByText(/The route refused this call|refused it\. Nothing was written/i)
      .first()
      .waitFor({ state: "visible", timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
    if (refused) note("POST /api/drafts/:id/publish was refused by the route, so no version roll and no recount are on camera");
    // The signature moment of 7.2: the version badge rolls and the recount moves the record between the bands.
    // The camera is put on the recount panel rather than held wherever the page happens to sit, so the frame is
    // the thing the caption is about. The panel states its own state, so a publication the route refused reads as
    // a corpus this browser has not recounted rather than as a red error box under a caption claiming it has.
    await cam.show('[data-component="recount-moment"]', 12, "the version roll and the recount");
    // The honesty close: what the corpus is known to owe, then the run that scores this product against itself.
    await cam.page.goto(`${BASE}/integrity`, { waitUntil: "domcontentloaded" });
    await cam.show('[data-component="register-totals"]', 3, "the Integrity Register totals");
    await cam.page.goto(`${BASE}/evaluation`, { waitUntil: "domcontentloaded" });
    await cam.show('[data-component="run-pins"]', 6, "the evaluation run behind the closing line");
    return cam;
  },
};

/* The run ------------------------------------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const fx = fixtures();
  const list: Beat[] = beats(fx);
  const total = totalSeconds(list);
  const problems = checkVerbatim(list, readFileSync(path.join(HERE, "narration.md"), "utf8"));
  if (problems.length > 0) throw new Error(`the captions are not the narration verbatim:\n${problems.join("\n")}`);
  const cues = timeline(list);
  writeFileSync(path.join(HERE, "captions.srt"), srt(cues));
  console.log(`captions.srt: ${cues.length} cues over ${total} s`);

  // The cut is always all six beats; this run may only be re-taking some of them.
  const chosen = ONLY ? list.filter((b) => ONLY.has(b.id)) : list;
  if (chosen.length === 0) throw new Error(`--beats named no beat of this cut; it has ${list.map((b) => b.id).join(", ")}`);
  if (ONLY) console.log(`re-taking ${chosen.map((b) => b.id).join(", ")}; every other beat keeps the footage it has`);

  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: RAW, size: { width: WIDTH, height: HEIGHT } },
    userAgent: "thehub-3v-video (Playwright)",
  });
  const recorded: Array<{ id: string; title: string; seconds: number; file: string | null; lead: number; filmed: number; onScreen: string }> = [];

  try {
    // The caption layer is rendered on a page of this context, so its video file is written and then discarded.
    const layer = await context.newPage();
    await renderCaptionLayer(layer, segments(cues, total));
    const layerVideo = layer.video();
    await layer.close();
    await layerVideo?.delete().catch(() => undefined);

    console.log("\nwarm pass (no camera)");
    const filming = (id: string): boolean => chosen.some((b) => b.id === id);
    await signIn(context.request, "Engineer");
    const ask = filming("b2") ? await warmAsk(context.request, "why did the hexane feed pump GA-1201A trip on vibration") : EMPTY_ASK;
    const gap = filming("b5")
      ? await warmAsk(context.request, "what lesson covers coupling-element inspection and replacement on GA-1201A")
      : EMPTY_ASK;
    // The lesson the rule pack serves for the approved bypass, named by the retrieval line rather than typed here.
    const bypass = filming("b3") ? await warmAsk(context.request, "how do I line up the HV-6701 manual bypass") : EMPTY_ASK;
    const bypassDoc = bypass.evidence?.find((e) => e.doc_no.startsWith("OPL-"))?.document_id ?? bypass.evidence?.[0]?.document_id ?? null;
    if (filming("b3") && bypassDoc === null) note("the bypass question resolved no lesson document");

    let draft: WarmDraft = null;
    let clusterId: string | null = null;
    if (filming("b6")) {
      const coverage = await context.request.get(`${BASE}/api/coverage`, { timeout: 60_000 });
      const clusters = coverage.ok() ? ((await coverage.json()) as { clusters: Array<{ id: string }> }).clusters : [];
      // The ranking, best first, and a short tail behind it: the swap of R-07 needs somewhere to swap to.
      const clusterIds = clusters.slice(0, CLUSTERS_TRIED).map((c) => c.id);
      if (clusterIds.length === 0) note("GET /api/coverage ranked no cluster, so no lesson can be requested");
      await signIn(context.request, "Supervisor");
      draft = clusterIds.length > 0 ? await warmDraft(context.request, clusterIds) : null;
      clusterId = draft?.cluster_id ?? clusterIds[0] ?? null;
      await signIn(context.request, "Engineer");
    }
    const warm: Warm = { askTrace: ask.trace, gapTrace: gap.trace, bypassDoc, draft, clusterId };

    console.log("\nrecording");
    for (const beat of chosen) {
      console.log(`${beat.id} (${beat.seconds} s): ${beat.title}`);
      // The loop beat needs the Supervisor's decisions; every other beat is filmed as the Engineer.
      if (beat.id === "b6") await signIn(context.request, "Supervisor").catch(() => note("no Supervisor session for the loop beat"));
      let file: string | null = null;
      let lead = 0;
      let filmed = 0;
      try {
        const cam = await SCRIPTS[beat.id](context, warm, beat.seconds);
        lead = cam.lead();
        filmed = cam.filmed();
        const video = cam.page.video();
        await cam.page.close();
        const from = await video?.path();
        if (from) {
          file = path.join(RAW, `${beat.id}.webm`);
          await video!.saveAs(file);
          await video!.delete().catch(() => undefined);
        } else {
          note(`${beat.id} produced no video file`);
        }
      } catch (error) {
        note(`${beat.id} ended early: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      }
      recorded.push({ id: beat.id, title: beat.title, seconds: beat.seconds, file, lead: Number(lead.toFixed(3)), filmed: Number(filmed.toFixed(3)), onScreen: beat.onScreen });
      console.log(`  ${file ? `raw/${path.basename(file)}` : "no footage"}, lead ${lead.toFixed(1)} s, filmed ${filmed.toFixed(1)} s of ${beat.seconds} s`);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  // A partial run merges: the beats it filmed replace their records, and every other beat keeps the one it had,
  // so beats.json always describes the whole 175 s and the encode never has to be told which run produced what.
  type Record_ = (typeof recorded)[number];
  const previous: Record_[] = (() => {
    if (!ONLY || !existsSync(path.join(OUT, "beats.json"))) return [];
    try {
      return (JSON.parse(readFileSync(path.join(OUT, "beats.json"), "utf8")) as { beats: Record_[] }).beats ?? [];
    } catch {
      note("the beats.json already on disk could not be read, so this run's beats are the only ones in it");
      return [];
    }
  })();
  const merged: Record_[] = list.map((beat) => {
    const fresh = recorded.find((r) => r.id === beat.id);
    return fresh ?? previous.find((r) => r.id === beat.id) ?? { id: beat.id, title: beat.title, seconds: beat.seconds, file: null, lead: 0, filmed: 0, onScreen: beat.onScreen };
  });

  const report = {
    base_url: BASE,
    recorded_at: new Date().toISOString(),
    beats_retaken: ONLY ? chosen.map((b) => b.id) : null,
    width: WIDTH,
    height: HEIGHT,
    fps: 15,
    total_seconds: total,
    beats: merged,
    missing: merged.filter((b) => b.file === null).map((b) => b.id),
    misses,
  };
  writeFileSync(path.join(OUT, "beats.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nvideo/out/beats.json written; ${report.missing.length} beat(s) without footage, ${misses.length} miss(es)`);
}

await main();
