/* ================================================================================================================
 * deck/pointer.ts, the one way deliverables/TheHub_README.pdf is produced (blueprint 9.12, 11.9 AC-DEL-09).
 *
 *   bundle/fixtures.json + bundle/manifest.json + supplied/team-facts.json
 *        -> deck/dist/pointer.html (self-contained but for deck/src/deck.css, inspectable)
 *        -> deliverables/TheHub_README.pdf (Playwright Chromium, one sheet, fonts subset by the printer)
 *
 * What the sheet is for: a judge who was handed the deck and nothing else. It carries the live URL, the three
 * repositories, what the entry is in three sentences, the corpus version the deployment serves, and the one
 * sentence about credentials travelling out of band (deviation D-07).
 *
 * NUMBER RULE (blueprint invariant 6). No quantity is typed into this file. Every figure is `fx("<10.5 key>")`
 * over bundle/fixtures.json (default namespace), bundle/manifest.json (`manifest.` prefix) or the team record
 * (`team.` prefix), with the same dotted-path-and-selector syntax and the same formatter the deck uses. A key that
 * resolves to nothing, or to a TBD_ placeholder, throws before Chromium is launched: the build refuses rather than
 * printing a page with a missing key.
 *
 * The build is also the gate on its own artefact, the way deck/build.ts is: one page, the 150,000-byte budget of
 * 9.12, tools/banned-strings.sh over the extracted text (AC-DEL-06), no em or en dash, no raster, and every
 * single-token value the page substituted present in the extracted text, which is what catches a figure the fixed
 * sheet height clipped off the page.
 *
 * Run:  pnpm pointer:build
 * ============================================================================================================== */

import { chromium } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXPORT_LIVE_URL } from "@/lib/fixed-strings";
import { seededVersionFromBundle } from "@/lib/version-id";

const DECK = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(DECK, "..");
const WORLD = resolve(REPO, "..");

const DIST = join(DECK, "dist");
const OUT = join(REPO, "deliverables", "TheHub_README.pdf");
const BUNDLE = join(REPO, "bundle");

/** Blueprint 9.12: the pointer's share of the byte budget, and its one page. */
const BYTE_BUDGET = 150_000;
const PAGES = 1;

/* -- inputs ---------------------------------------------------------------------------------------------------- */

type Json = Record<string, unknown>;
const readJson = (file: string): Json => JSON.parse(readFileSync(file, "utf8")) as Json;

const fixtures = readJson(join(BUNDLE, "fixtures.json"));
const manifest = readJson(join(BUNDLE, "manifest.json"));
const team = readJson(join(WORLD, "supplied", "team-facts.json"));

/** ARCHITECTURE 2: the corpus version the seed inserts for this bundle, from the one rule in src/lib/version-id.ts.
 * Derived from the manifest bytes, so the sheet names the version the deployment serves without reading any
 * database and without a credential of any kind. */
const seeded = seededVersionFromBundle(BUNDLE);

/* -- the fixture resolver, the deck's own ------------------------------------------------------------------------
 * A dotted path with fx.py's selector syntax: [3] index, [t=0.62] / [rank=1] match. Dots inside a selector belong
 * to the selector, never to the path. Kept identical to the runtime deck/build.ts injects, so a key that reads one
 * way on a slide cannot read another way here. */

function segments(key: string): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  for (const c of key) {
    if (c === "[") depth++;
    if (c === "]") depth--;
    if (c === "." && depth === 0) {
      out.push(buf);
      buf = "";
    } else buf += c;
  }
  out.push(buf);
  return out;
}

function pick(node: unknown, sel: string): unknown {
  if (!Array.isArray(node)) return undefined;
  if (/^-?\d+$/.test(sel)) return node[Number(sel)] as unknown;
  const eq = sel.indexOf("=");
  const k = sel.slice(0, eq);
  const v = sel.slice(eq + 1);
  for (const item of node as Json[]) {
    if (item && Object.prototype.hasOwnProperty.call(item, k)) {
      const iv = item[k];
      if (String(iv) === v) return item;
      if (typeof iv === "number" && Math.abs(iv - Number(v)) < 1e-9) return item;
    }
  }
  return undefined;
}

export function resolveKey(key: string): unknown {
  let root: Json = fixtures;
  let rest = key;
  if (rest.startsWith("team.")) {
    root = team;
    rest = rest.slice(5);
  } else if (rest.startsWith("manifest.")) {
    root = manifest;
    rest = rest.slice(9);
  }
  let node: unknown = root;
  for (const seg of segments(rest)) {
    const m = /^([^[]*)((?:\[[^\]]*\])*)$/.exec(seg);
    if (!m) return undefined;
    const [, name, sels] = m;
    if (node === null || node === undefined) return undefined;
    if (name !== "") {
      node = Array.isArray(node) && /^\d+$/.test(name) ? (node[Number(name)] as unknown) : (node as Json)[name];
    }
    for (const s of sels.matchAll(/\[([^\]]+)\]/g)) {
      if (node === null || node === undefined) return undefined;
      node = pick(node, s[1]);
    }
  }
  return node;
}

/** The harness rounds with Python's round(): half to even on the binary float. Matching it is what keeps a printed
 * 0.12 from becoming 0.13 between the fixture and the sheet. */
function roundHalfEven(x: number, digits: number): number {
  const f = 10 ** digits;
  const y = x * f;
  let r = Math.round(y);
  if (Math.abs(y - Math.trunc(y)) === 0.5) {
    r = Math.trunc(y);
    if (r % 2 !== 0) r += y > 0 ? 1 : -1;
  }
  return r / f;
}

export type Fmt = "int" | "len" | "sha8" | "d1" | "d2";

function format(value: unknown, fmt?: Fmt): string {
  if (value === undefined || value === null) return "";
  if (fmt === "len") {
    if (Array.isArray(value)) return String(value.length);
    if (typeof value === "object") return String(Object.keys(value as object).length);
    return "";
  }
  if (typeof value === "string") return fmt === "sha8" ? value.slice(0, 8) : value;
  if (typeof value === "boolean") return String(value);
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (fmt === "int") return String(Math.round(value));
  if (fmt === "d1") return roundHalfEven(value, 1).toFixed(1);
  if (fmt === "d2") return roundHalfEven(value, 2).toFixed(2);
  return Number.isInteger(value) ? String(value) : roundHalfEven(value, 1).toFixed(1);
}

/** Every string the sheet substituted, in the order it was substituted, so the artefact can be held against it. */
export const PRINTED: Array<{ key: string; text: string }> = [];

/** The one way a quantity reaches this page. Throws rather than rendering an empty span or a placeholder. */
export function fx(key: string, fmt?: Fmt): string {
  const text = format(resolveKey(key), fmt);
  if (text === "") {
    throw new Error(`pointer: key ${key} resolves to nothing in the bundle; the sheet is not printed without it`);
  }
  if (text.startsWith("TBD_")) {
    throw new Error(`pointer: key ${key} is still the placeholder ${text}; the sheet is not printed with it`);
  }
  PRINTED.push({ key, text });
  return text;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* -- the page ----------------------------------------------------------------------------------------------------
 * Visual authority is blueprint section 7, through deck/src/deck.css: the same Drafting-ink tokens, the same named
 * type pairing, the same sheet, head band, film panels, chips, labels and foot the deck prints. Only the few rules
 * this sheet needs and no slide has are added below. */

/** The three repositories a judge reaches the work through. The URLs are held against README.md by the test, so
 * this list and the README's repository table cannot drift apart. */
const REPOSITORIES: ReadonlyArray<{ url: string; what: string }> = [
  {
    url: "https://github.com/Finerium/thehub-3v",
    what: "The application behind the live URL: the surfaces, the gateway, the gates and this sheet.",
  },
  {
    url: "https://github.com/Finerium/thehub-harness",
    what: "The Python reference implementation, the frozen recipe, the golden set, the bundle and every contract.",
  },
  {
    url: "https://github.com/Finerium/thehub-corpus",
    what: "The organiser's corpus and its inventory, read by continuous integration through a deploy key. Private, and it stays private.",
  },
];

/** The 10.5 keys this sheet prints, each named once so the value and the key column cannot disagree. */
const T = format(resolveKey("method.t"), "d2");
const K = {
  files: "inventory.files_total",
  classes: "inventory.by_class",
  tags: "equipment_master",
  lessons: "lessons.n",
  records: "populations.all",
  unplanned: "populations.unplanned_failure",
  generous: `coverage.generous.unplanned_failure[t=${T}]`,
  strict: `coverage.strict.unplanned_failure[t=${T}]`,
  integrity: "integrity.total",
  golden: "golden.size",
  hardGate: "golden.hard_gate_count",
  window: "method.window_multiplier",
  bundle: "manifest.bundle_version",
  digest: "inventory.corpus_sha256",
  extractor: "inventory.extractor",
  teamName: "team.team_name_registered",
  university: "team.university",
  caseTitle: "team.case_title",
} as const;

const code = (key: string): string => `<code>${esc(key)}</code>`;

const row = (label: string, value: string, keys: string[]): string =>
  `<tr><td>${label}</td><td class="v">${value}</td><td class="k">${keys.map(code).join(", ")}</td></tr>`;

/** The sheet, and the rhythm of the drafting grid deck.css draws with a repeating gradient. */
const SHEET = { width: 1280, height: 720, step: 40 };

/* Chromium rasterises a printed CSS gradient into an image XObject: the grid of .slide costs this one sheet four
 * of them and about a twelfth of its 150,000 bytes, and puts a raster into an artefact whose house draws in native
 * SVG only (7.4). The same grid, at the same rhythm and in the same token, as vector lines. */
function grid(): string {
  const { width, height, step } = SHEET;
  const lines: string[] = [];
  for (let y = 0; y < height; y += step) lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}"/>`);
  for (let x = 0; x < width; x += step) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}"/>`);
  return `<svg class="grid" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><g stroke="var(--grid)" stroke-width="1">${lines.join("")}</g></svg>`;
}

export function page(): string {
  PRINTED.length = 0;
  const measured = [
    row("Controlled documents ingested", `<b class="num">${fx(K.files)}</b> files, <b class="num">${fx(K.classes, "len")}</b> classes`, [K.files, K.classes]),
    row("Equipment tags, the join key of every package", `<b class="num">${fx(K.tags, "len")}</b>`, [K.tags]),
    row("Lessons parsed into their six sections", `<b class="num">${fx(K.lessons)}</b>`, [K.lessons]),
    row("Maintenance records", `<b class="num">${fx(K.records)}</b> rows, <b class="num">${fx(K.unplanned)}</b> unplanned failures`, [K.records, K.unplanned]),
    row("Of those, matched by no lesson at all", `<b class="num">${fx(`${K.generous}.uncovered`)}</b> of <b class="num">${fx(`${K.generous}.n`)}</b> (<b class="num">${fx(`${K.generous}.pct`, "d1")}</b>%)`, [K.generous]),
    row("Of those, nothing beyond a copied row", `<b class="num">${fx(`${K.strict}.uncovered`)}</b> of <b class="num">${fx(`${K.strict}.n`)}</b> (<b class="num">${fx(`${K.strict}.pct`, "d1")}</b>%)`, [K.strict]),
    row("Integrity findings over the parsed documents", `<b class="num">${fx(K.integrity)}</b>`, [K.integrity]),
    row("Golden set", `<b class="num">${fx(K.golden)}</b> cases, <b class="num">${fx(K.hardGate)}</b> hard-gated`, [K.golden, K.hardGate]),
  ].join("\n        ");

  const repositories = REPOSITORIES.map(
    (r) => `<div class="repo"><span class="rurl">${esc(r.url)}</span><p class="fine">${esc(r.what)}</p></div>`,
  ).join("\n          ");

  return `<!doctype html>
<!-- Generated by deck/pointer.ts. Edit that file, never this one: every figure here was substituted from
     bundle/fixtures.json by its blueprint 10.5 key and nothing on this page was typed as a quantity. -->
<html lang="en">
<head>
<meta charset="utf-8">
<title>The Hub, pointer sheet, CALIBER 2026 Case 1, Team ${esc(fx(K.teamName))}</title>
<link rel="stylesheet" href="deck.css">
<style>
  /* The few rules this one sheet needs and no slide has. Everything else is deck.css, blueprint section 7. */
  code {
    font-family: var(--mono);
    font-size: 0.94em;
  }
  /* The strap shares the .lede instance of the variable display face on purpose: one more instance is one more
     Type 3 font in the printed sheet, and this page has 150,000 bytes to live in. */
  .head .strap {
    font-family: var(--display);
    word-spacing: var(--display-gap);
    font-variation-settings: "opsz" 24, "wght" 500;
    font-size: 15px;
    letter-spacing: -0.008em;
    color: var(--accent);
  }
  .slide { background: var(--paper); }
  .grid { position: absolute; inset: 0; width: 100%; height: 100%; }
  .head, .body { position: relative; }
  .body.split { grid-template-columns: 7fr 5fr; }
  .lede { font-size: 17px; }
  .stack-notes .label { margin-right: 5px; }
  .url {
    font-family: var(--mono);
    font-weight: 600;
    font-size: 17px;
    letter-spacing: -0.01em;
    color: var(--accent);
    white-space: nowrap;
    margin: 7px 0 9px;
  }
  table.measured td.v { white-space: nowrap; }
  table.measured td { padding-top: 4px; padding-bottom: 4px; }
  table.measured td.k {
    font-family: var(--mono);
    font-size: 8px;
    line-height: 1.5;
    color: var(--ink-500);
    text-align: right;
    white-space: nowrap;
  }
  .repo + .repo { margin-top: 9px; }
  .rurl {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    white-space: nowrap;
  }
  .repo .fine { margin-top: 2px; }
  .stack-notes .note + .note { margin-top: 7px; }
</style>
</head>
<body>

<section class="slide" data-slide="1">
  ${grid()}
  <div class="head">
    <h1>The Hub</h1>
    <span class="strap">The knowledge hub that knows what it is missing.</span>
    <span class="kicker">pointer sheet, one page</span>
  </div>

  <div class="body split">
    <div class="col">
      <p class="lede">The Hub answers an engineer's question from the plant's own controlled documents and cites every claim to an approved revision. It classifies safety intent in code before any model is called, so a request to defeat a protective function is refused with the governing sheet rather than answered. It measures which unplanned-failure records no lesson covers, drafts the missing lesson from evidence, and lets a human in the Manager role publish it, after which the same question is answered from a lesson that did not exist before.</p>

      <div class="chiprow">
        <span class="chip method"><span>t = <span class="num">${esc(fx("method.t", "d2"))}</span>, both layers, window <span class="num">${esc(fx(K.window))}</span>n</span></span>
        <span class="chip caveat">the supplied corpus is synthetic</span>
      </div>

      <div class="panel">
        <span class="label">What it was measured on</span>
        <table class="measured">
          ${measured}
        </table>
      </div>

      <p class="fine">Every figure above is substituted from <code>bundle/fixtures.json</code> by the key printed beside it. No number on this sheet was typed, and the build refuses to print a page whose key does not resolve.</p>

      <p class="fine">Case 1 only. The Hub reads documents and records and answers questions about them. It schedules no work, assigns nothing to anyone and aggregates nothing by person. The EDMS, AIMS and historian connectors are specified, not connected, and no write path toward any control system exists anywhere in the build.</p>
    </div>

    <div class="col">
      <div class="panel">
        <span class="label">Reach the work</span>
        <p class="url">${esc(EXPORT_LIVE_URL)}</p>
        <div class="stack-notes">
          <p class="note"><span class="label">Access</span>The deployment is behind login; there is no public route. Credentials are issued by Team ${esc(fx(K.teamName))} to the CALIBER 2026 Committee out of band, and they appear in no submitted file, no committed file and no commit message.</p>
          <p class="note"><span class="label">Offline</span><code>TheHub_prototype.html</code>, submitted beside the deck, opens from a local disk with the network switched off and needs no account.</p>
        </div>
      </div>

      <div class="panel">
        <span class="label">The three repositories</span>
        <div style="margin-top:7px">
          ${repositories}
        </div>
      </div>

      <div class="panel">
        <span class="label">What the deployment serves</span>
        <dl class="identifiers" style="margin-top:7px">
          <dt>Corpus version</dt><dd><span class="tag">${esc(seeded.id)}</span></dd>
          <dt>Bundle</dt><dd><span class="tag">${esc(fx(K.bundle))}</span></dd>
          <dt>Corpus digest</dt><dd><span class="tag">${esc(fx(K.digest, "sha8"))}</span></dd>
          <dt>Extractor</dt><dd><span class="tag">${esc(fx(K.extractor))}</span></dd>
        </dl>
      </div>
    </div>
  </div>

  <div class="foot">
    <span>The Hub, Team ${esc(fx(K.teamName))}, ${esc(fx(K.university))}</span>
    <span class="sep"></span>
    <span>${esc(fx(K.caseTitle))}</span>
  </div>
</section>

</body>
</html>
`;
}

/* -- print and gate ----------------------------------------------------------------------------------------------
 * Everything below is a gate. A failure prints and exits non-zero; the PDF on disk is then known-bad and the caller
 * is told which criterion of AC-DEL-09 or AC-DEL-06 it missed. */

async function main(): Promise<void> {
  const html = page();

  const rasters = {
    img: (html.match(/<img\b/gi) ?? []).length,
    dataImage: (html.match(/data:image\//g) ?? []).length,
    cssUrl: (html.match(/url\(\s*['"]?(?!#)/g) ?? []).length,
  };

  mkdirSync(DIST, { recursive: true });
  copyFileSync(join(DECK, "src", "deck.css"), join(DIST, "deck.css"));
  const distHtml = join(DIST, "pointer.html");
  writeFileSync(distHtml, html);

  const browser = await chromium.launch();
  const browserPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors: string[] = [];
  browserPage.on("pageerror", (e) => consoleErrors.push(String(e)));
  await browserPage.goto(`file://${distHtml}`, { waitUntil: "load" });
  await browserPage.emulateMedia({ media: "print" });
  await browserPage.evaluate(async () => {
    await document.fonts.ready;
  });
  /* The sheet is one fixed page: content that does not fit is silently clipped by .slide's overflow, and a judge
   * would never know a line was missing. Measured in the print medium, before the PDF is written. */
  const layout = await browserPage.evaluate(() => {
    const body = document.querySelector(".body");
    const foot = document.querySelector(".foot");
    if (!body || !foot) return { over: ["the sheet carries no .body or no .foot"], slack: 0 };
    const limit = foot.getBoundingClientRect().top;
    const over: string[] = [];
    let lowest = 0;
    for (const el of Array.from(body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      lowest = Math.max(lowest, r.bottom);
      if (r.bottom > limit + 0.5) over.push(`${el.tagName.toLowerCase()}.${el.className || "-"} ends ${Math.round(r.bottom - limit)}px below the foot`);
    }
    return { over: over.slice(0, 6), slack: Math.round(limit - lowest) };
  });

  mkdirSync(dirname(OUT), { recursive: true });
  await browserPage.pdf({ path: OUT, printBackground: true, preferCSSPageSize: true, width: "1280px", height: "720px" });
  await browser.close();

  const fail: string[] = [];
  const ok: string[] = [];

  if (consoleErrors.length) fail.push(`page errors: ${consoleErrors.join(" | ")}`);

  if (layout.over.length) fail.push(`content is clipped by the sheet: ${layout.over.join("; ")}`);
  else ok.push(`every element of the body sits above the foot, with ${layout.slack}px of slack left on the sheet`);
  ok.push(`${PRINTED.length} substitutions from ${new Set(PRINTED.map((p) => p.key)).size} distinct keys, none empty and none a TBD_ placeholder`);

  // 7.4: native SVG only. The source is checked for an image reference and the artefact for an embedded one, because
  // a printed CSS gradient becomes an image XObject that no scan of the DOM would ever see.
  const imageObjects = (readFileSync(OUT).toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
  if (rasters.img || rasters.dataImage || rasters.cssUrl || imageObjects) {
    fail.push(`raster or external image reference present: ${JSON.stringify({ ...rasters, imageObjects })}`);
  } else ok.push("no raster: zero img, zero data:image and zero url() in the source, zero image XObject in the PDF");

  const bytes = statSync(OUT).size;
  if (bytes > BYTE_BUDGET) fail.push(`byte budget: ${bytes} > ${BYTE_BUDGET}`);
  else ok.push(`wc -c = ${bytes} bytes, budget ${BYTE_BUDGET} (${((bytes / BYTE_BUDGET) * 100).toFixed(1)}% used)`);

  const pdfPages = Number(execFileSync("pdfinfo", [OUT], { encoding: "utf8" }).match(/^Pages:\s+(\d+)$/m)?.[1] ?? "0");
  if (pdfPages !== PAGES) fail.push(`${pdfPages} page(s); 9.12 asks for ${PAGES}`);
  else ok.push(`${PAGES} page, as 9.12 asks`);

  // The artefact's own extracted text, by the pinned extractor, is what every scan below reads: the bytes a reader
  // would see, never the DOM.
  const text = execFileSync("pdftotext", ["-raw", OUT, "-"], { encoding: "utf8" });
  const textFile = join(DIST, "pointer.txt");
  writeFileSync(textFile, text);

  const scan = spawnSync("bash", [join(REPO, "tools", "banned-strings.sh"), textFile], { encoding: "utf8" });
  if (scan.status !== 0) fail.push(`tools/banned-strings.sh: ${(scan.stdout + scan.stderr).trim()}`);
  else ok.push(`tools/banned-strings.sh clean over the extracted text (${scan.stdout.trim()})`);

  if (/[\u2014\u2013]/.test(text)) fail.push("em or en dash in the pointer text");
  else ok.push("no em dash and no en dash in the pointer text");

  const tbd = text.match(/TBD_[A-Z_]+/g) ?? [];
  if (tbd.length) fail.push(`TBD_ placeholder visible on the sheet: ${[...new Set(tbd)].join(", ")}`);
  else ok.push("no TBD_ placeholder reached the sheet");

  // A fixed-height sheet can print a value the page then clips. Every single-token substitution is held against the
  // extracted text; a multi-word one is skipped because the extractor wraps it.
  const single = PRINTED.filter((p) => !p.text.includes(" "));
  const absent = single.filter((p) => !text.includes(p.text));
  if (absent.length) fail.push(`substituted value absent from the printed sheet: ${absent.map((p) => `${p.key}=${p.text}`).join(", ")}`);
  else ok.push(`every one of the ${single.length} single-token substitutions is present in the extracted text`);

  for (const [what, value] of [["live URL", EXPORT_LIVE_URL], ["corpus version", seeded.id], ...REPOSITORIES.map((r) => ["repository", r.url] as [string, string])] as Array<[string, string]>) {
    if (!text.includes(value)) fail.push(`${what} absent from the printed sheet: ${value}`);
  }
  if (!fail.some((f) => f.includes("absent from the printed sheet"))) {
    ok.push(`the live URL, the corpus version ${seeded.id} and all ${REPOSITORIES.length} repository URLs are present in the extracted text`);
  }

  console.log("checks passed:");
  for (const line of ok) console.log(`  ok    ${line}`);
  if (fail.length) {
    console.error("\nchecks failed:");
    for (const line of fail) console.error(`  FAIL  ${line}`);
    process.exit(1);
  }
  console.log(`\nwrote ${OUT}`);
}

// Run only when this file is the entry point, so a test can import the resolver and the page without launching a
// browser or writing a deliverable.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
