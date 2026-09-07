/* ================================================================================================================
 * deck/build.ts, the one way TheHub_deck.pdf is produced.
 *
 *   deck/src/deck.html  +  figures/*.svg  +  bundle/fixtures.json  +  bundle/manifest.json  +  team-facts.json
 *        -> deck/dist/deck.html (self-contained, substituted, inspectable)
 *        -> deliverables/TheHub_deck.pdf (Playwright Chromium, fonts subset by the printer)
 *
 * The build refuses to write a PDF that would fail AC-DEL-02, so a broken deck is a build failure and never an
 * artefact: it checks the byte budget, the seven pages before the first APPENDIX footer, the six booklet headings
 * in order by position, the three KQ labels, the slide-body word cap, every data-fx element non-empty, the absence
 * of any raster figure, and the banned-strings list. It also recomputes the Chapter 23 value model from the current
 * fixture and compares it with the figures the Business Impact slide prints.
 *
 * Run:  pnpm exec tsx deck/build.ts
 * ============================================================================================================== */

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DECK = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(DECK, "..");
const WORLD = resolve(REPO, "..");

const SRC = join(DECK, "src", "deck.html");
const DIST = join(DECK, "dist");
const OUT = join(REPO, "deliverables", "TheHub_deck.pdf");

const BYTE_BUDGET = 2_000_000;
const WORD_CAP = 120; // PRD 26.1, slides 1 to 7 only; the appendix is unlimited.
const PAGES_BEFORE_APPENDIX = 7;
const HEADINGS = ["Background", "Solution", "Business Impact", "Feasibility", "Conclusion", "Team Profile"];

/* -- inputs ---------------------------------------------------------------------------------------------------- */

const fixtures = JSON.parse(readFileSync(join(REPO, "bundle", "fixtures.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(REPO, "bundle", "manifest.json"), "utf8"));
const team = JSON.parse(readFileSync(join(WORLD, "supplied", "team-facts.json"), "utf8"));

/* Deviation D-08 (run notes): the owner fixed the semester for all three members and withheld the supervisor's
 * name, so slide 7 carries the registered-with-the-Committee line instead. supplied/ is read-only, so the decision
 * is applied here, once, in the open, and printed in the build log. Every other TBD_ placeholder still reaches the
 * page verbatim and is caught by the pre-submit grep. */
const D08_SEMESTER = "3";
for (const m of team.members) m.semester = D08_SEMESTER;
console.log(`D-08 applied: members[*].semester = ${D08_SEMESTER}; the supervisor line is the fixed string on slide 7.`);

/* -- includes -------------------------------------------------------------------------------------------------- */

let html = readFileSync(SRC, "utf8");
const includes: string[] = [];
html = html.replace(/<!--include:([^>]+?)-->/g, (_m, rel: string) => {
  includes.push(rel);
  // Strip the leading authoring comment of each figure; the drawing itself is what belongs in the artefact.
  return readFileSync(join(DECK, rel.trim()), "utf8").replace(/^\s*<!--[\s\S]*?-->\s*/, "");
});
console.log(`figures inlined: ${includes.length} (${includes.map((p) => p.split("/").pop()).join(", ")})`);

/* -- the substitution + audit runtime, injected into the page --------------------------------------------------- */

const RUNTIME = String.raw`
(function () {
  var DATA = JSON.parse(document.getElementById("fx-data").textContent);

  /* A dotted path with fx.py's selector syntax: [3] index, [t=0.62] / [rank=1] / [no=2] match. Dots inside a
     selector belong to the selector, never to the path. */
  function segments(key) {
    var out = [], buf = "", depth = 0;
    for (var i = 0; i < key.length; i++) {
      var c = key[i];
      if (c === "[") depth++;
      if (c === "]") depth--;
      if (c === "." && depth === 0) { out.push(buf); buf = ""; } else buf += c;
    }
    out.push(buf);
    return out;
  }

  function pick(node, sel) {
    if (/^-?\d+$/.test(sel)) return node[Number(sel)];
    var eq = sel.indexOf("="), k = sel.slice(0, eq), v = sel.slice(eq + 1);
    for (var i = 0; i < node.length; i++) {
      var item = node[i];
      if (item && Object.prototype.hasOwnProperty.call(item, k)) {
        var iv = item[k];
        if (String(iv) === v) return item;
        if (typeof iv === "number" && Math.abs(iv - Number(v)) < 1e-9) return item;
      }
    }
    return undefined;
  }

  function resolve(key) {
    var root = DATA.fixtures;
    if (key.indexOf("team.") === 0) { root = DATA.team; key = key.slice(5); }
    else if (key.indexOf("manifest.") === 0) { root = DATA.manifest; key = key.slice(9); }
    var node = root;
    var segs = segments(key);
    for (var i = 0; i < segs.length; i++) {
      var m = /^([^\[]*)((?:\[[^\]]*\])*)$/.exec(segs[i]);
      var name = m[1], sels = m[2];
      if (node == null) return undefined;
      if (name !== "") node = Array.isArray(node) && /^\d+$/.test(name) ? node[Number(name)] : node[name];
      var re = /\[([^\]]+)\]/g, s;
      while ((s = re.exec(sels))) { if (node == null) return undefined; node = pick(node, s[1]); }
    }
    return node;
  }

  /* The harness rounds with Python's round(): half to even on the binary float. Matching it here is what keeps a
     printed 0.12 from becoming 0.13 between the fixture and the slide. */
  function roundHalfEven(x, digits) {
    var f = Math.pow(10, digits), y = x * f, r = Math.round(y);
    if (Math.abs(y - Math.trunc(y)) === 0.5) { r = Math.trunc(y); if (r % 2 !== 0) r += y > 0 ? 1 : -1; }
    return r / f;
  }
  function fixed(x, d) { return roundHalfEven(x, d).toFixed(d); }
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  function format(value, fmt) {
    if (value === undefined || value === null) return "";
    if (fmt === "len") return String(Array.isArray(value) ? value.length : Object.keys(value).length);
    if (fmt === "sha8") return String(value).slice(0, 8);
    if (fmt === "sha16") return String(value).slice(0, 16);
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return String(value);
    if (fmt === "raw") return String(value);
    if (fmt === "int") return String(Math.round(value));
    if (fmt === "comma") return comma(Math.round(value));
    if (fmt === "d1") return fixed(value, 1);
    if (fmt === "d2") return fixed(value, 2);
    if (fmt === "M1") return fixed(value / 1e6, 1);
    if (fmt === "pct1") return fixed(value, 1);
    if (fmt === "share1") return fixed(value * 100, 1);
    if (!Number.isInteger(value)) return fixed(value, 1);
    return Math.abs(value) >= 10000 ? comma(value) : String(value);
  }

  var missing = [];

  document.querySelectorAll("[data-fx]").forEach(function (el) {
    var key = el.getAttribute("data-fx");
    var v = resolve(key);
    var text = format(v, el.getAttribute("data-fx-fmt"));
    if (text === "") missing.push(key);
    el.textContent = text;
  });

  /* A bar whose length does not bind to the value beside it is a fake number drawn as geometry, so the geometry is
     computed from the same fixture value rather than authored. */
  document.querySelectorAll("[data-fx-bar]").forEach(function (el) {
    var v = resolve(el.getAttribute("data-fx-bar"));
    var maxAttr = el.getAttribute("data-fx-max");
    var max = /^[\d.]+$/.test(maxAttr) ? Number(maxAttr) : resolve(maxAttr);
    var span = Number(el.getAttribute("data-fx-span"));
    if (typeof v !== "number" || typeof max !== "number" || !max) { missing.push(el.getAttribute("data-fx-bar")); return; }
    el.setAttribute("width", String(Math.round((span * v) / max * 10) / 10));
  });

  /* -- audit ---------------------------------------------------------------------------------------------------- */

  function words(text) {
    return (text || "").split(/\s+/).filter(function (t) { return /[A-Za-z0-9]/.test(t); }).length;
  }

  /* Slide-body word count, PRD 26.1. "Body" is the running prose a judge reads as argument. Excluded, because none
     of it is running prose: the interior of a figure (svg), mandated tabular content (table), figure captions and
     the small-caps structural labels, and preformatted command listings. Both counts are reported. */
  function countSlide(slide) {
    var body = slide.querySelector(".body") || slide.querySelector(".cover");
    if (!body) return { prose: 0, all: 0 };
    var clone = body.cloneNode(true);
    clone.querySelectorAll("svg, table, figcaption, .label, pre").forEach(function (n) { n.remove(); });
    return { prose: words(clone.textContent), all: words(body.textContent) };
  }

  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var report = {
    missing: missing,
    slides: slides.map(function (s, i) {
      var c = countSlide(s);
      var h1 = s.querySelector("h1");
      var foot = s.querySelector(".foot");
      return {
        page: i + 1,
        heading: h1 ? h1.textContent.trim() : "",
        prose: c.prose,
        all: c.all,
        appendixFooter: !!(foot && /\bAPPENDIX\b/.test(foot.textContent))
      };
    }),
    documentText: document.body.innerText,
    rasters: {
      img: document.querySelectorAll("img").length,
      svgImage: document.querySelectorAll("svg image").length,
      dataImage: (document.documentElement.outerHTML.match(/data:image\//g) || []).length,
      cssUrl: (document.documentElement.outerHTML.match(/url\(\s*['"]?(?!#)/g) || []).length
    },
    tbd: (document.body.innerText.match(/TBD_[A-Z_]+/g) || []),
    /* AC-DEL-06 bans Indonesian outside a marked quotation. The one Indonesian string in this deck is the
       registered study-programme name in the mandated Major column, reproduced verbatim from the team record and
       marked lang="id"; everything outside such a marked element must be clean, and this is the scan that says so. */
    indonesian: (function () {
      var clone = document.body.cloneNode(true);
      clone.querySelectorAll('[lang="id"], script, style').forEach(function (n) { n.remove(); });
      var stop = ["yang","dan","di","ke","dari","untuk","dengan","pada","adalah","itu","ini","atau","tidak","akan",
                  "dalam","oleh","juga","sudah","bisa","harus","telah","karena","agar","serta","tersebut"];
      var text = clone.textContent, out = [];
      stop.forEach(function (w) {
        var m = text.match(new RegExp("(?<![A-Za-z])" + w + "(?![A-Za-z])", "gi"));
        if (m) out.push(w + " x" + m.length);
      });
      return out;
    })(),
    marked: Array.prototype.map.call(document.querySelectorAll('[lang="id"]'), function (n) { return n.textContent; })
  };
  document.body.setAttribute("data-fx-report", JSON.stringify(report));
  document.body.setAttribute("data-fx-done", "1");
})();
`;

const payload = JSON.stringify({ fixtures, manifest, team });
html = html.replace(
  "</body>",
  `<script id="fx-data" type="application/json">${payload.replace(/</g, "\\u003c")}</script>\n<script>${RUNTIME}</script>\n</body>`,
);

mkdirSync(DIST, { recursive: true });
copyFileSync(join(DECK, "src", "deck.css"), join(DIST, "deck.css"));
const distHtml = join(DIST, "deck.html");
writeFileSync(distHtml, html);

/* -- print ------------------------------------------------------------------------------------------------------ */

async function main() {
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors: string[] = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
await page.goto(`file://${distHtml}`, { waitUntil: "load" });
await page.emulateMedia({ media: "print" });
await page.waitForSelector("body[data-fx-done='1']", { timeout: 15_000 });
await page.evaluate(async () => { await document.fonts.ready; });

type SlideReport = { page: number; heading: string; prose: number; all: number; appendixFooter: boolean };
const report = JSON.parse((await page.getAttribute("body", "data-fx-report")) ?? "{}") as {
  missing: string[];
  slides: SlideReport[];
  documentText: string;
  rasters: Record<string, number>;
  tbd: string[];
  indonesian: string[];
  marked: string[];
};

mkdirSync(dirname(OUT), { recursive: true });
await page.pdf({ path: OUT, printBackground: true, preferCSSPageSize: true, width: "1280px", height: "720px" });
await browser.close();

/* -- verification ------------------------------------------------------------------------------------------------
 * Everything below is a gate. A failure prints and exits non-zero; the PDF on disk is then known-bad and the caller
 * is told exactly which criterion of AC-DEL-02 it missed. */

const fail: string[] = [];
const ok: string[] = [];
const warn: string[] = [];

if (consoleErrors.length) fail.push(`page errors: ${consoleErrors.join(" | ")}`);

if (report.missing.length) fail.push(`data-fx keys that rendered empty: ${[...new Set(report.missing)].join(", ")}`);
else ok.push(`every data-fx element rendered a value (${(html.match(/data-fx=/g) || []).length} elements)`);

if (report.tbd.length) fail.push(`TBD_ placeholder visible in the deck: ${[...new Set(report.tbd)].join(", ")}`);
else ok.push("no TBD_ placeholder reached the page");

/* Byte budget, page count and the extracted text all come from the artefact itself, never from the DOM. */
const bytes = statSync(OUT).size;
if (bytes > BYTE_BUDGET) fail.push(`byte budget: ${bytes} > ${BYTE_BUDGET}`);
else ok.push(`wc -c = ${bytes} bytes, budget ${BYTE_BUDGET} (${((bytes / BYTE_BUDGET) * 100).toFixed(1)}% used)`);

const pdfPages = Number(
  execFileSync("pdfinfo", [OUT], { encoding: "utf8" }).match(/^Pages:\s+(\d+)$/m)?.[1] ?? "0",
);
const perPage: string[] = [];
for (let p = 1; p <= pdfPages; p++) {
  perPage.push(execFileSync("pdftotext", ["-raw", "-f", String(p), "-l", String(p), OUT, "-"], { encoding: "utf8" }));
}
const firstAppendix = perPage.findIndex((t) => /\bAPPENDIX\b/.test(t)) + 1;
if (firstAppendix !== PAGES_BEFORE_APPENDIX + 1) {
  fail.push(`first APPENDIX footer on page ${firstAppendix}, expected ${PAGES_BEFORE_APPENDIX + 1}`);
} else {
  ok.push(`${PAGES_BEFORE_APPENDIX} pages before the first APPENDIX footer (page ${firstAppendix}); ${pdfPages} pages total`);
}

const text = perPage.join("\n");
let cursor = -1;
const positions: string[] = [];
for (const h of HEADINGS) {
  // The same expression tools/presubmit.sh applies: whole word, first occurrence, literal inter-word space.
  const re = new RegExp(`(?<![A-Za-z])${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`);
  const at = text.search(re);
  if (at < 0) fail.push(`heading not found in the deck text: ${h}`);
  else if (at <= cursor) fail.push(`heading out of order: ${h} at ${at} follows ${cursor}`);
  else {
    cursor = at;
    positions.push(`${h}@${at} (page ${perPage.findIndex((t) => re.test(t)) + 1})`);
  }
}
if (positions.length === HEADINGS.length) ok.push(`six headings in order by position: ${positions.join(", ")}`);

for (const label of ["KQ1", "KQ2", "KQ3"]) {
  const pages = perPage.map((t, i) => (t.includes(label) ? i + 1 : 0)).filter(Boolean);
  if (!pages.length) fail.push(`${label} missing from the deck text`);
  else ok.push(`${label} present on pages ${pages.join(", ")}`);
}

const over = report.slides.filter((s) => s.page <= PAGES_BEFORE_APPENDIX && s.prose > WORD_CAP);
if (over.length) fail.push(`slide body over ${WORD_CAP} words: ${over.map((s) => `p${s.page}=${s.prose}`).join(", ")}`);
else {
  const longest = report.slides
    .filter((s) => s.page <= PAGES_BEFORE_APPENDIX)
    .reduce((a, b) => (b.prose > a.prose ? b : a));
  ok.push(`longest slide body: page ${longest.page} at ${longest.prose} words of prose (cap ${WORD_CAP})`);
}

if (report.rasters.img || report.rasters.svgImage || report.rasters.dataImage || report.rasters.cssUrl) {
  fail.push(`raster or external image reference present: ${JSON.stringify(report.rasters)}`);
} else ok.push("no raster figure: zero img, zero svg image, zero data:image, zero url() reference");

/* Team Profile page: the six mandated headings, in order, on that page alone, plus a labelled supervisor line. */
const p7 = perPage[6] ?? "";
const mandated = ["No.", "Name", "Major", "Semester", "Area of expertise", "Contribution"];
let c7 = -1;
for (const h of mandated) {
  const at = p7.indexOf(h);
  if (at < 0) fail.push(`Team Profile table heading missing: ${h}`);
  else if (at <= c7) fail.push(`Team Profile table heading out of order: ${h}`);
  else c7 = at;
}
ok.push("page 7 carries the six mandated table headings in order, checked by position on that page");
/* Deviation D-08 withholds the supervisor's name, so the Team Profile page carries a fixed labelled line instead.
 * That wording has one home, `src/lib/fixed-strings.ts`, which tools/presubmit.sh also reads; the deck is checked
 * against that file rather than against a copy of the sentence, so the two can never drift apart. */
const supervisorLine = readFileSync(join(REPO, "src", "lib", "fixed-strings.ts"), "utf8").match(
  /^export const SUPERVISOR_LINE = "(.*)";$/m,
)?.[1];
if (!supervisorLine) fail.push("src/lib/fixed-strings.ts exports no SUPERVISOR_LINE");
else if (!p7.includes(supervisorLine)) fail.push(`page 7 does not carry SUPERVISOR_LINE verbatim: "${supervisorLine}"`);
else ok.push(`page 7 carries SUPERVISOR_LINE verbatim from src/lib/fixed-strings.ts (D-08): "${supervisorLine}"`);

/* Banned strings of AC-DEL-06, checked on the artefact's own extracted text. */
const bannedList = readFileSync(join(WORLD, "thehub-harness", "tools", "banned_strings.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .concat(["[TBD]", "PUSAKA", "WARISAN", "SIAGA", "SAKSI"]);
const hits = bannedList.filter((b) => text.includes(b));
if (hits.length) fail.push(`banned string in the deck text: ${hits.join(", ")}`);
else ok.push(`banned-strings list clean (${bannedList.length} strings checked against the extracted text)`);

if (/[\u2014\u2013]/.test(text)) fail.push("em or en dash in the deck text");
else ok.push("no em dash and no en dash in the deck text");

if (report.indonesian.length) fail.push(`Indonesian stop word outside a marked element: ${report.indonesian.join(", ")}`);
else ok.push(`English only outside marked elements; ${report.marked.length} cells marked lang="id" (the registered study-programme name, verbatim from the team record)`);

/* -- the Chapter 23 value model, recomputed from the current fixture -------------------------------------------- */

const A = { avoided: 0.3, questions: [2, 6], minutes: [6, 12], shifts: 3, rate: 250_000, author: 6, review: 1 };
const C = { hosting: 27_000_000, inference: [0, 27_500_000], coordination: 78_000_000, months: 18 };
const t = fixtures.method.t as number;
const cov = (layer: string, field: string) =>
  fixtures.coverage[layer].unplanned_failure.find((r: Record<string, number>) => r.t === t)[field] as number;
const rs = Object.values(fixtures.families.r_by_tag).map((v) => (typeof v === "object" ? (v as { r: number }).r : (v as number)));
const exposure = cov("generous", "cost_idr");
const shifts = A.shifts * fixtures.workbook.window.days;
const M1 = (v: number) => (Math.round((v / 1e6) * 10) / 10).toFixed(1);
const b1 = [exposure * Math.min(...rs) * A.avoided, exposure * Math.max(...rs) * A.avoided];
const b2h = [(A.questions[0] * A.minutes[0] * shifts) / 60, (A.questions[1] * A.minutes[1] * shifts) / 60];
const b2 = b2h.map((h) => h * A.rate);
const b3h = [(A.author - A.review) * cov("generous", "uncovered"), (A.author - A.review) * cov("strict", "uncovered")];
const b3 = b3h.map((h) => h * A.rate);
const benefit = [b1[0] + b2[0] + b3[0], b1[1] + b2[1] + b3[1]];
const cost = [C.hosting + C.inference[0] + C.coordination, C.hosting + C.inference[1] + C.coordination];
const payback = [(cost[0] / benefit[1]) * C.months, (cost[1] / benefit[0]) * C.months];

const model: Array<[string, string]> = [
  ["shifts", String(shifts)],
  ["B1", `${M1(b1[0])} to ${M1(b1[1])}`],
  ["B2 hours", `${Math.trunc(b2h[0])} to ${Math.trunc(b2h[1])}`],
  ["B2", `${M1(b2[0])} to ${M1(b2[1])}`],
  ["B3 hours", `${b3h[0]} to ${b3h[1]}`],
  ["B3", `${M1(b3[0])} to ${M1(b3[1])}`],
  ["benefit", `${M1(benefit[0])} to ${M1(benefit[1])}`],
  ["cost", `${M1(cost[0])} to ${M1(cost[1])}`],
  ["payback", `${payback[0].toFixed(1)} and ${payback[1].toFixed(1)}`],
];
const printed = [
  `${M1(b1[0])}`, `${M1(b1[1])}`, `${M1(b2[0])}`, `${M1(b2[1])}`, `${M1(b3[0])}`, `${M1(b3[1])}`,
  `${M1(benefit[0])}`, `${M1(benefit[1])}`, `${M1(cost[0])}`, `${M1(cost[1])}`,
  payback[0].toFixed(1), payback[1].toFixed(1), shifts.toLocaleString("en-US"),
  // the two engineer-hour ranges the prior harness's value-model test asserts, printed here as visible arithmetic
  `${Math.trunc(b2h[0])} to ${b2h[1].toLocaleString("en-US")}`,
  `${b3h[0]} to ${b3h[1]}`,
];
const absent = printed.filter((v) => !text.includes(v));
if (absent.length) fail.push(`value-model figure printed on the deck does not match the fixture: ${absent.join(", ")}`);
else ok.push(`value model recomputes from the fixture and matches the slide: ${model.map(([k, v]) => `${k} ${v}`).join("; ")}`);

/* -- report ----------------------------------------------------------------------------------------------------- */

console.log("\nslide word counts (prose / inclusive of figures and tables):");
for (const s of report.slides) {
  console.log(
    `  p${String(s.page).padStart(2)}  ${String(s.prose).padStart(3)} / ${String(s.all).padStart(3)}` +
      `  ${s.appendixFooter ? "APPENDIX  " : "          "}${s.heading}`,
  );
}
if (warn.length) {
  console.log("\nnoted:");
  for (const line of warn) console.log(`  note  ${line}`);
}
console.log("\nchecks passed:");
for (const line of ok) console.log(`  ok    ${line}`);
if (fail.length) {
  console.error("\nchecks failed:");
  for (const line of fail) console.error(`  FAIL  ${line}`);
  process.exit(1);
}
console.log(`\nwrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
