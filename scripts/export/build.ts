// The offline export (blueprint 9.12, ARCHITECTURE 11, AC-DEL-01): `deliverables/TheHub_prototype.html`, one file,
// at most 2,000,000 bytes, which opens from `file://` with the network off and reaches every read-only surface of
// blueprint 6.2.
//
// The method is the contract's, in order. A build-time demo Engineer session signs in against a local production
// server; the JSON snapshot { corpus_version, packets, drafts, traces, register, evaluation_run, assets, coverage,
// fixtures_subset } is pulled through the product's own API; the read-only surfaces are the product's own render,
// captured from that server so no second implementation of a surface can exist; the reviewer landing is rendered
// with `react-dom/server` over the same components (scripts/export/landing.tsx); the CSS, the three font families
// and the page derivatives the shown citations need are swallowed; and one small vanilla script carries the chips,
// the drawers, the tabs and the routing that React carried on the deployment.
//
// Two rules bind every line below. No number is composed here: every figure the file shows was rendered by the
// product from the seeded database, or is a fixture key the snapshot carries. And the file asks for nothing: every
// stylesheet, font and image is a `data:` URI, every internal link is a `#<slug>`, and the only absolute address in
// the file is the live deployment URL, as text a reviewer with a network can follow.
//
// Run: `pnpm export:demo` (the wrapper supplies DEMO_ENGINEER_PASSWORD from the local env file; this process reads
// it from the environment, never logs it and never writes it anywhere).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { captureSurfaces, SECTIONS_TOKEN, verifyOffline, type Captured, type Target } from "./capture";
import { collectCss, dropRemoteFontFaces, embedFontFiles, inlineImages, newImageBudget, subsetFontFaces } from "./inline";
import { renderLanding, type LandingFacts, type LayerFigure } from "./landing";
import { classify, FAMILY_ORDER, rewriteLinks, type Classified, type Family } from "./routes";
import { pullBase, pullTraces, signIn, type Snapshot } from "./snapshot";
import { EXPORT_LIVE_URL, EXPORT_REPLAY_LINE } from "@/lib/fixed-strings";

const BASE_URL = process.env.EXPORT_BASE_URL ?? "http://127.0.0.1:3210";
const OUT_PATH = path.resolve(process.cwd(), process.env.EXPORT_OUT ?? "deliverables/TheHub_prototype.html");
const BYTE_BUDGET = 2_000_000;

/**
 * What the page derivatives the shown citations need may cost, before base64 expansion. A derivative over the
 * ceiling keeps its `<img>` and its alt text and loses only its source, so the file never reaches for one.
 */
const IMAGE_BYTES = 340_000;

/**
 * How many detail surfaces of each family the walk carries. The export must reach every surface of 6.2, not every
 * row of the corpus: one of each detail surface is the criterion, and these leave room for the demo path (the
 * asset, the failure memory and the cluster the tour hands over) inside the byte budget.
 */
const CAP: Record<Family, number> = {
  home: 1,
  ask: 2,
  trace: 1,
  documents: 2,
  assets: 2,
  failures: 2,
  coverage: 1,
  clusters: 1,
  drafts: 3,
  integrity: 1,
  evaluation: 1,
  loop: 1,
  landing: 1,
};

/** The index surfaces, in 6.2 order. `/tour` is first: it is the export's own first screen and the demo path. */
const FIRST_WALK: Classified[] = [
  "/tour",
  "/",
  "/ask",
  "/assets",
  "/failures",
  "/coverage",
  "/drafts",
  "/integrity",
  "/evaluation",
  "/demo/loop",
].map((route) => {
  const it = classify(route);
  if (!it) throw new Error(`the route map does not carry ${route}`);
  return it;
});

/** The client half of Ask plays the stored packet on arrival; the capture waits for it rather than for a timer. */
const WAIT_FOR: Record<string, string> = { ask: '[data-component="ask-form"]' };
const WAIT_FOR_FAMILY: Partial<Record<Family, string>> = { ask: '[data-component="packet"], [data-component="ask-form"]' };

/** Every internal address a captured surface carries, in the order the surface carries it. */
const ADDRESS = /\s(?:href|data-x-href)="(\/[^"]*)"/g;

/** The stylesheet hrefs a route serves; the preflight reads them from the login sheet, which needs no session. */
async function stylesheetsOf(baseUrl: string, route: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}${route}`);
  if (!response.ok) throw new Error(`GET ${route} answered ${response.status}; is the production server running at ${baseUrl}?`);
  const html = await response.text();
  return [...new Set([...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1] as string))];
}

function targetOf(it: Classified): Target {
  return {
    route: it.route,
    slug: it.slug,
    title: it.title,
    note: it.note,
    waitFor: WAIT_FOR[it.slug] ?? WAIT_FOR_FAMILY[it.family],
    // The landing and the index surfaces carry the chips worth opening; a detail surface repeats their spans.
    skipDrawers: it.family === "documents",
  };
}

/**
 * The routes a set of captures links to, classified, de-duplicated, in the order they were linked, minus the ones
 * already walked and the ones whose family is full. Discovery is what keeps every id in this file the product's
 * own: no asset tag, trace id, document id, draft id, cluster id or seeded chip id is typed anywhere in this build.
 */
function discover(captured: readonly Captured[], taken: Set<string>, spent: Record<Family, number>): Classified[] {
  const found: Classified[] = [];
  for (const surface of captured) {
    for (const match of surface.html.matchAll(ADDRESS)) {
      const it = classify(match[1] as string);
      if (!it || taken.has(it.slug) || found.some((f) => f.slug === it.slug)) continue;
      if (spent[it.family] + found.filter((f) => f.family === it.family).length >= CAP[it.family]) continue;
      found.push(it);
    }
  }
  return found;
}

function count(record: Record<string, number>, family: Family): void {
  record[family] = (record[family] ?? 0) + 1;
}

/** The corpus version as the product's own VersionBadge rendered it (label and digest prefix), or null. */
function versionFromRender(html: string): { label: string; digest: string } | null {
  const badge = /aria-label="Corpus version ([^",]+), digest ([0-9a-f]+)/.exec(html);
  return badge ? { label: badge[1] as string, digest: badge[2] as string } : null;
}

/** The coverage headline the landing shows: the population both layers were computed over, from the API's rows. */
function coverageFacts(coverage: unknown): LandingFacts["coverage"] {
  const body = coverage as
    | {
        method?: Record<string, unknown>;
        summaries?: Array<{ population: string; layer: string; uncovered_count: number; population_count: number }>;
      }
    | undefined;
  const summaries = body?.summaries ?? [];
  const method = body?.method;
  if (!method || summaries.length === 0) return null;
  const preference = ["unplanned_failure", "unplanned_breakdowns", "failure", "planned_flagged", "all"];
  const population = preference.find((p) => summaries.some((s) => s.population === p && s.layer === "generous") && summaries.some((s) => s.population === p && s.layer === "strict"));
  if (!population) return null;
  const layers: LayerFigure[] = ["generous", "strict"].flatMap((layer) => {
    const row = summaries.find((s) => s.population === population && s.layer === layer);
    return row ? [{ layer, uncovered: row.uncovered_count, of: row.population_count }] : [];
  });
  const rows = summaries.filter((s) => s.population === population);
  return {
    layers,
    population: `${population.replace(/_/g, " ")} work orders, ${rows[0]?.population_count ?? 0} in the population`,
    method: {
      threshold: Number(method.threshold),
      windowMultiplier: Number(method.window_multiplier),
      recipeSha256: String(method.recipe_sha256),
      stopListSha256: String(method.stop_list_sha256),
      extractor: String(method.extractor),
    },
  };
}

/** The one script the file carries: the routing, the chips, the drawers and the tabs React used to carry. */
const RUNTIME = `(function () {
  var LANDING = "landing";
  var sections = {};
  var all = document.querySelectorAll("[data-x-route]");
  for (var i = 0; i < all.length; i++) sections[all[i].getAttribute("data-x-route")] = all[i];
  var rail = document.querySelectorAll(".rail .index a");
  var host = document.getElementById("x-drawer-host");

  function show(slug) {
    for (var key in sections) sections[key].hidden = key !== slug;
    for (var j = 0; j < rail.length; j++) {
      if (rail[j].getAttribute("href") === "#" + slug) rail[j].setAttribute("aria-current", "page");
      else rail[j].removeAttribute("aria-current");
    }
    window.scrollTo(0, 0);
  }

  function jump(fragment) {
    var visible = document.querySelector("[data-x-route]:not([hidden])");
    if (!visible) return;
    var marked = visible.querySelectorAll("[id]");
    for (var k = 0; k < marked.length; k++) {
      if (marked[k].id === fragment) { marked[k].scrollIntoView(); return; }
    }
  }

  function route() {
    var hash = location.hash.replace(/^#/, "");
    try { hash = decodeURIComponent(hash); } catch (error) { /* a fragment the product wrote, left as it is */ }
    if (!hash) return show(LANDING);
    if (sections[hash]) return show(hash);
    // Not a section: an in-page anchor the product wrote (#findings, #assessment, #page=3&span=...).
    jump(hash);
  }

  function drawer(span) {
    if (!host) return;
    var template = null;
    var templates = document.querySelectorAll("template[data-x-span]");
    for (var t = 0; t < templates.length; t++) {
      if (templates[t].getAttribute("data-x-span") === span) { template = templates[t]; break; }
    }
    if (!template) return;
    host.textContent = "";
    host.appendChild(template.content.cloneNode(true));
    var dialog = host.querySelector("dialog");
    if (!dialog) return;
    dialog.removeAttribute("open");
    dialog.setAttribute("data-x-drawer", "");
    dialog.addEventListener("click", function (event) {
      var node = event.target;
      if (node === dialog || (node.closest && node.closest(".drawer-close"))) dialog.close();
      else if (node.closest && node.closest('a[href^="#"]')) dialog.close();
    });
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  document.addEventListener("click", function (event) {
    var node = event.target;
    if (!node || !node.closest) return;
    var chip = node.closest('[data-component="citation-chip"][data-span]');
    if (chip) { event.preventDefault(); drawer(chip.getAttribute("data-span")); return; }
    var moved = node.closest("[data-x-href]");
    if (moved) { event.preventDefault(); location.hash = moved.getAttribute("data-x-href"); return; }
    var absent = node.closest("[data-x-absent]");
    if (absent) { event.preventDefault(); }
  });

  // Every form on a surface is a GET form the deployment answers; offline there is nothing to submit to.
  document.addEventListener("submit", function (event) { event.preventDefault(); });

  window.addEventListener("hashchange", route);
  route();
})();`;

/** What the export adds to the product's own stylesheet: the sections, and the two marks the runtime reads. */
const EXPORT_CSS = `[data-x-route][hidden]{display:none!important}
[data-x-absent]{cursor:default;opacity:.62}
a[data-x-absent],button[data-x-absent]{text-decoration:none}
[data-component="citation-chip"]{cursor:pointer}`;

/** JSON that is safe to sit inside a `<script>` element. */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

type Section = { slug: string; family: Family; title: string; note: string; html: string };

/**
 * The markers of a surface that shows something a model wrote: the evidence packet and the ask run, the trace
 * replay with its verdicts, and a draft's sections and elements. Section 2's Replay rule asks the export to say
 * where a model output is shown that it is played back from storage, so every section carrying one of these
 * carries the line, in the words src/lib/fixed-strings.ts holds for it.
 */
const MODEL_OUTPUT = /data-component="(packet|ask-run|trace-view|verdict-strip|draft-section|draft-element)"/;

/** The replay note, in the product's own chrome, above a surface that shows a model output. */
function replayNote(html: string): string {
  if (!MODEL_OUTPUT.test(html)) return "";
  return `<p class="glass mb-5 flex flex-wrap items-center gap-2 p-3 text-[13px] text-ink-700" data-x-replay><span class="badge" data-tone="caveat">replayed</span>${EXPORT_REPLAY_LINE}</p>`;
}

type Parts = {
  htmlClass: string;
  bodyClass: string;
  shell: string;
  css: string;
  sections: Section[];
  drawers: Array<{ span: string; html: string }>;
  snapshot: Snapshot;
};

type Levers = { fonts: boolean; drawers: number; fixtures: boolean; replays: number };

/** Drop the levers that were spent, then write the one file. Nothing in here fetches; every part is already bytes. */
function compose(parts: Parts, levers: Levers): string {
  const css = levers.fonts ? parts.css : dropRemoteFontFaces(parts.css).css;
  const fixtures = levers.fixtures
    ? parts.snapshot.fixtures_subset
    : {
        note: "trimmed to fit the 2,000,000-byte budget of blueprint 9.12; the whole file is bundle/fixtures.json",
        meta: parts.snapshot.fixtures_subset.meta,
        method: parts.snapshot.fixtures_subset.method,
      };
  const snapshot: Snapshot = {
    ...parts.snapshot,
    fixtures_subset: fixtures,
    packets: parts.snapshot.packets.slice(0, levers.replays),
    traces: parts.snapshot.traces.slice(0, levers.replays),
  };
  const drawers = parts.drawers.slice(0, levers.drawers);

  const body = parts.sections
    .map(
      (section, index) =>
        `<section data-x-route="${escapeAttribute(section.slug)}" aria-label="${escapeAttribute(section.title)}"${index === 0 ? "" : " hidden"}>${section.html}</section>`,
    )
    .join("\n");
  const templates = drawers.map((d) => `<template data-x-span="${escapeAttribute(d.span)}">${d.html}</template>`).join("");

  return `<!doctype html>
<html lang="en" class="${escapeAttribute(parts.htmlClass)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>The Hub, offline prototype</title>
<style>${css}</style>
<style>${EXPORT_CSS}</style>
</head>
<body class="${escapeAttribute(parts.bodyClass)}">
${parts.shell.replace(SECTIONS_TOKEN, () => body)}
<div id="x-drawer-host"></div>
<div id="x-drawers" hidden>${templates}</div>
<script type="application/json" id="x-snapshot">${embedJson(snapshot)}</script>
<script>${RUNTIME}</script>
</body>
</html>
`;
}

/**
 * The byte budget of 9.12, spent in the order that costs the reviewer least. Every step is recorded, because 9.12
 * asks for the font fallback to be recorded when it is taken, and a reader is owed the same about the rest.
 */
function fitBudget(parts: Parts, drawerCount: number, replayCount: number): { html: string; levers: Levers; spent: string[] } {
  const ladder: Array<{ name: string; apply: (l: Levers) => Levers }> = [
    { name: "fixtures_subset trimmed to meta and method", apply: (l) => ({ ...l, fixtures: false }) },
    { name: "font files dropped for the metric-matched local stack", apply: (l) => ({ ...l, fonts: false }) },
    { name: "snapshot reduced to the first replayed answer and its trace", apply: (l) => ({ ...l, replays: 1 }) },
    { name: "citation drawers dropped", apply: (l) => ({ ...l, drawers: 0 }) },
  ];
  let levers: Levers = { fonts: true, drawers: drawerCount, fixtures: true, replays: replayCount };
  const spent: string[] = [];
  let html = compose(parts, levers);
  for (const step of ladder) {
    if (Buffer.byteLength(html, "utf8") <= BYTE_BUDGET) break;
    levers = step.apply(levers);
    spent.push(step.name);
    html = compose(parts, levers);
  }
  return { html, levers, spent };
}

/** Every absolute address left in the written file. Only the live URL, and the XML namespaces, may be among them. */
const ALLOWED_ABSOLUTE = new Set([EXPORT_LIVE_URL, "http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink", "http://www.w3.org/1999/xhtml"]);

function scanAbsolute(html: string): { allowed: Record<string, number>; foreign: string[] } {
  const allowed: Record<string, number> = {};
  const foreign: string[] = [];
  for (const match of html.matchAll(/https?:\/\/[^\s"'()<>\\]+/g)) {
    const url = (match[0] as string).replace(/[.,;]+$/, "");
    const known = [...ALLOWED_ABSOLUTE].find((a) => url === a || url.startsWith(`${a}/`) || url.startsWith(`${a}?`));
    if (known) allowed[known] = (allowed[known] ?? 0) + 1;
    else foreign.push(url);
  }
  return { allowed, foreign: [...new Set(foreign)] };
}

async function main(): Promise<void> {
  const started = new Date();
  process.stdout.write(`export: ${BASE_URL} -> ${OUT_PATH}\n`);

  const { alias, cookies } = await signIn(BASE_URL);
  process.stdout.write(`signed in as ${alias}\n`);
  // A server whose build output no longer matches its manifest serves pages that link stylesheets it cannot
  // answer, and an unstyled export is a failed deliverable. One sheet is asked for before the walk begins, so a
  // stale server is named in a second rather than after every surface has been captured.
  await collectCss(BASE_URL, await stylesheetsOf(BASE_URL, "/login"), cookies);
  const base = await pullBase(BASE_URL, cookies);

  // 1. The index surfaces of 6.2, the tour first.
  const seen = new Set<string>();
  const first = await captureSurfaces(BASE_URL, cookies.browser, FIRST_WALK.map(targetOf), seen);

  // 2. What they link to: the detail surfaces, every id the product's own render carried.
  const taken = new Set(FIRST_WALK.map((t) => t.slug));
  const spentPerFamily = Object.fromEntries(FAMILY_ORDER.map((f) => [f, 0])) as Record<Family, number>;
  for (const it of FIRST_WALK) count(spentPerFamily, it.family);
  const round2 = discover(first, taken, spentPerFamily);
  for (const it of round2) {
    taken.add(it.slug);
    count(spentPerFamily, it.family);
  }
  const second = round2.length > 0 ? await captureSurfaces(BASE_URL, cookies.browser, round2.map(targetOf), seen) : [];

  // 3. And what those link to: the document a citation lands on, the trace behind a seeded answer.
  const round3 = discover(second, taken, spentPerFamily);
  for (const it of round3) {
    taken.add(it.slug);
    count(spentPerFamily, it.family);
  }
  const third = round3.length > 0 ? await captureSurfaces(BASE_URL, cookies.browser, round3.map(targetOf), seen) : [];

  const captured = [...first, ...second, ...third];
  const slugOf = new Map(captured.map((c) => [c.route, c.slug]));

  // The two families the product serves only with an id: their nav item leads to the member the export carries.
  const familyFallback = new Map<string, string>();
  for (const bare of ["/trace", "/documents"]) {
    const member = captured.find((c) => c.route.startsWith(`${bare}/`));
    if (member) familyFallback.set(bare, member.slug);
  }
  const resolve = (route: string): string | null => {
    const it = classify(route);
    if (it && slugOf.has(it.route)) return slugOf.get(it.route) as string;
    if (it && taken.has(it.slug)) return it.slug;
    const [pathname] = route.split(/[?#]/);
    return familyFallback.get(pathname ?? "") ?? null;
  };

  // 4. The traces the file shows, and the packets inside them: the ids the captured surfaces linked to.
  const traceIds = captured.filter((c) => c.route.startsWith("/trace/")).map((c) => decodeURIComponent(c.route.slice("/trace/".length)));
  const { traces, packets } = await pullTraces(BASE_URL, cookies, traceIds);
  const snapshot: Snapshot = {
    corpus_version: base.corpus_version,
    packets,
    drafts: base.drafts,
    traces,
    register: base.register,
    evaluation_run: base.evaluation_run,
    assets: base.assets,
    coverage: base.coverage,
    fixtures_subset: base.fixtures_subset,
  };

  // 5. The stylesheets the surfaces loaded, the fonts behind them and the derivatives the drawers show.
  const { css: rawCss, sheets } = await collectCss(BASE_URL, captured.flatMap((c) => c.stylesheets), cookies);
  const { css: latinCss, dropped: facesDropped } = subsetFontFaces(rawCss);
  const { css, files: fontFiles } = await embedFontFiles(latinCss, BASE_URL, cookies);
  const budget = newImageBudget(IMAGE_BYTES);

  const sections: Section[] = [];
  const drawers: Array<{ span: string; html: string }> = [];
  let tourHtml = "";
  const shellSource = captured.find((c) => c.shell.includes(SECTIONS_TOKEN)) ?? captured[0];
  if (!shellSource) throw new Error("no surface was captured; the export has nothing to carry");

  for (const surface of captured) {
    const html = rewriteLinks(await inlineImages(surface.html, BASE_URL, cookies, budget), resolve);
    for (const [span, markup] of Object.entries(surface.drawers)) {
      drawers.push({ span, html: rewriteLinks(await inlineImages(markup, BASE_URL, cookies, budget), resolve) });
    }
    // Surface 12 is not a section of its own: it is the tour the landing carries under the reviewer block.
    if (surface.slug === "landing") {
      tourHtml = html;
      continue;
    }
    const family = classify(surface.route)?.family ?? "home";
    sections.push({ slug: surface.slug, family, title: surface.title, note: surface.note, html: `${replayNote(html)}${html}` });
  }
  // 6.2 inventory order for the contents and the walk; the landing is composed separately and always sits first.
  sections.sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family));

  const version = versionFromRender(captured.map((c) => c.html).join("")) ?? null;
  const inventory = snapshot.fixtures_subset.inventory as { files?: number } | undefined;
  const facts: LandingFacts = {
    version,
    coverage: coverageFacts(snapshot.coverage),
    files: typeof inventory?.files === "number" ? inventory.files : null,
    contents: sections.map((s) => ({ slug: s.slug, title: s.title, note: s.note })),
    counts: { packets: packets.length, drawers: drawers.length, traces: traces.length },
    capturedAt: started.toISOString().slice(0, 16).replace("T", " ") + " UTC",
  };
  const landing = `${renderLanding(facts)}${tourHtml}`;

  const parts: Parts = {
    htmlClass: shellSource.htmlClass,
    bodyClass: shellSource.bodyClass,
    // The chrome is drawn once for the whole file, so the sheet index in the rail is rewritten here too: its
    // fourteen links are the export's own navigation once they point at sections instead of routes.
    shell: rewriteLinks(shellSource.shell, resolve),
    css,
    sections: [
      { slug: "landing", family: "landing", title: "Reviewer landing and tour", note: FIRST_WALK[0]?.note ?? "", html: landing },
      ...sections,
    ],
    drawers,
    snapshot,
  };

  const { html, levers, spent } = fitBudget(parts, drawers.length, Math.max(packets.length, traces.length));
  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, html, "utf8");
  const bytes = Buffer.byteLength(html, "utf8");

  // 6. The assertions of 9.12: the size, the offline walk with every request blocked, and the address scan.
  const slugs = parts.sections.map((s) => s.slug);
  const offline = await verifyOffline(pathToFileURL(OUT_PATH).href, slugs);
  const absolute = scanAbsolute(html);

  const report = {
    out: OUT_PATH,
    bytes,
    budget: BYTE_BUDGET,
    within_budget: bytes <= BYTE_BUDGET,
    sections: slugs,
    surfaces_reached: offline.reached,
    surfaces_missing: offline.missing,
    network_requests: offline.requests,
    console_errors: offline.consoleErrors,
    drawer_opened_offline: offline.drawerOpened,
    citation_drawers: levers.drawers,
    packets: packets.length,
    traces: traces.length,
    stylesheets: sheets,
    font_files: fontFiles,
    font_faces_dropped_as_non_latin: facesDropped,
    fonts_embedded: levers.fonts,
    fixtures_full: levers.fixtures,
    replays_kept: levers.replays,
    image_bytes: budget.bytes,
    images_failed: budget.failed,
    images_skipped: budget.skipped,
    drawer_failures: captured.flatMap((c) => c.drawerFailures),
    budget_levers_spent: spent,
    absolute_addresses: absolute.allowed,
    foreign_addresses: absolute.foreign,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  const blockers = [
    bytes > BYTE_BUDGET ? `the file is ${bytes} bytes, over the ${BYTE_BUDGET} of blueprint 9.12` : null,
    offline.missing.length > 0 ? `surfaces that did not render offline: ${offline.missing.join(", ")}` : null,
    offline.requests.length > 0 ? `the file asked for ${offline.requests.length} external resources` : null,
    absolute.foreign.length > 0 ? `absolute addresses other than the live URL: ${absolute.foreign.join(", ")}` : null,
    !offline.drawerOpened ? "no citation chip opened its drawer offline" : null,
  ].filter((line): line is string => line !== null);
  if (blockers.length > 0) {
    process.stderr.write(`${blockers.join("\n")}\n`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
