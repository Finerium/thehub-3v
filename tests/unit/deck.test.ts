// The deck pipeline as tests (blueprint 9.12 and 11.9 AC-DEL-02, AC-DEL-05, AC-DEL-06; the PRD's 26.1 and 26.4).
//
// deck/build.ts is itself a gate: it refuses to leave a PDF behind that would fail AC-DEL-02. This file is the
// gate on the gate, in three layers, so that a green build is never taken on trust.
//
//   1. Source, hermetic and always run. Every `data-fx` key of deck/src/deck.html resolves against the fixture the
//      build reads, through the same selector syntax and the same formatter, and none of them renders a TBD_
//      placeholder or an empty string. Every figure is native SVG. The Chapter 23 value model is recomputed from
//      the fixture and compared, value by value in document order, with the `nonfx` numbers the Business Impact
//      slide types, and with the ASSUMPTION spans the same slide prints beside them.
//   2. Artefact, when deliverables/TheHub_deck.pdf exists. Seven pages before the first APPENDIX footer, the six
//      booklet headings in order by first occurrence, KQ1 to KQ3, the value-model figures present in the extracted
//      text, the supervisor line and the mandated table headings on page 7, the byte budgets of 9.12 and the
//      banned-string scans of AC-DEL-06 over the deliverables that are plain text.
//   3. The negative build, when chromium and poppler are present. deck/fixtures/plants.json names two plants: a
//      data-fx key the fixture does not carry, and a TBD_ placeholder in a rendered team field. The real build runs
//      against a throwaway copy carrying both and must exit non-zero naming each of them. A gate nobody has seen
//      fire is a gate nobody knows works. The clean run of the same sandbox is the source of the per-slide word
//      counts this file holds against the 120-word cap of the PRD's 26.1.
//
// Nothing here writes to deliverables/, to deck/ or to supplied/: the sandbox is a temporary tree, removed after
// each run, and supplied/team-facts.json is read once and copied into it.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const WORLD = path.resolve(REPO, "..");

const DECK_HTML = path.join(REPO, "deck", "src", "deck.html");
const BUILD = path.join(REPO, "deck", "build.ts");
const PLANTS_FILE = path.join(REPO, "deck", "fixtures", "plants.json");
const TEAM_FACTS = path.join(WORLD, "supplied", "team-facts.json");
const TSX = path.join(REPO, "node_modules", ".bin", "tsx");

const DELIVERABLES = path.join(REPO, "deliverables");
const PDF = path.join(DELIVERABLES, "TheHub_deck.pdf");
const EXPORT = path.join(DELIVERABLES, "TheHub_prototype.html");
const VIDEO = path.join(DELIVERABLES, "TheHub_demo.mp4");
const POINTER = path.join(DELIVERABLES, "TheHub_README.pdf");

/** Blueprint 9.12, byte budget. The four budgets and the buffer sum to the ceiling; the buffer is never spent. */
const BUDGET = { export: 2_000_000, deck: 2_000_000, video: 5_000_000, pointer: 150_000 };
const CEILING = 10_000_000;
const BUFFER = 850_000;

/** The PRD's 26.1: the deck's own pages, the six booklet headings and the slide-body word cap. */
const PAGES_BEFORE_APPENDIX = 7;
const WORD_CAP = 120;
const HEADINGS = ["Background", "Solution", "Business Impact", "Feasibility", "Conclusion", "Team Profile"];

/** Deviation D-08: the owner fixed the semester for all three members. deck/build.ts applies the same value. */
const D08_SEMESTER = "3";

type Json = Record<string, unknown>;
const readJson = (file: string): Json => JSON.parse(readFileSync(file, "utf8")) as Json;

/** The authored page, and the same page with every figure inlined, which is what deck/build.ts prints. */
const source = readFileSync(DECK_HTML, "utf8");
const includes = [...source.matchAll(/<!--include:([^>]+?)-->/g)].map((m) => m[1].trim());
const html = source.replace(/<!--include:([^>]+?)-->/g, (_m: string, rel: string) =>
  readFileSync(path.join(REPO, "deck", rel.trim()), "utf8").replace(/^\s*<!--[\s\S]*?-->\s*/, ""),
);
const fixtures = readJson(path.join(REPO, "bundle", "fixtures.json"));
const manifest = readJson(path.join(REPO, "bundle", "manifest.json"));
const plants = readJson(PLANTS_FILE) as {
  missing_key: { key: string; planted: string; expect: string };
  placeholder: { member_no: number; field: string; planted: string; expect: string };
};

const teamPresent = existsSync(TEAM_FACTS);
const team: Json = teamPresent ? readJson(TEAM_FACTS) : {};
if (teamPresent) for (const m of team.members as Json[]) m.semester = D08_SEMESTER;

const has = (tool: string) => spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).status === 0;
const pdfTools = has("pdfinfo") && has("pdftotext");

/** Playwright's browser registry, so a checkout without `playwright install chromium` skips instead of failing. */
function chromiumInstalled(): boolean {
  const base =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Caches", "ms-playwright")
      : path.join(os.homedir(), ".cache", "ms-playwright"));
  try {
    return readdirSync(base).some((entry) => entry.startsWith("chromium"));
  } catch {
    return false;
  }
}

const canBuild = teamPresent && pdfTools && chromiumInstalled() && existsSync(TSX) && existsSync(BUILD);

/* -- the fixture resolver, as deck/build.ts substitutes ---------------------------------------------------------
 * The same dotted path with fx.py's selector syntax, and the same formatter, so this file computes the string the
 * slide will carry rather than a near miss of it. A divergence between the two is caught by the sandbox build
 * below, which runs the real one. */

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
  if (/^-?\d+$/.test(sel)) return node[Number(sel)];
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

function resolveKey(key: string): unknown {
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
    if (node === null || node === undefined) return undefined;
    const [, name, sels] = m;
    if (name !== "") {
      node = Array.isArray(node) && /^\d+$/.test(name) ? node[Number(name)] : (node as Json)[name];
    }
    for (const s of sels.matchAll(/\[([^\]]+)\]/g)) {
      if (node === null || node === undefined) return undefined;
      node = pick(node, s[1]);
    }
  }
  return node;
}

/** Python's round(): half to even on the binary float, which is how the harness printed the fixture. */
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
const fixedTo = (x: number, d: number) => roundHalfEven(x, d).toFixed(d);
const comma = (n: number | string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function format(value: unknown, fmt: string | null): string {
  if (value === undefined || value === null) return "";
  if (fmt === "len") return String(Array.isArray(value) ? value.length : Object.keys(value as object).length);
  if (fmt === "sha8") return String(value).slice(0, 8);
  if (fmt === "sha16") return String(value).slice(0, 16);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  const n = value as number;
  if (fmt === "raw") return String(n);
  if (fmt === "int") return String(Math.round(n));
  if (fmt === "comma") return comma(Math.round(n));
  if (fmt === "d1") return fixedTo(n, 1);
  if (fmt === "d2") return fixedTo(n, 2);
  if (fmt === "M1") return fixedTo(n / 1e6, 1);
  if (fmt === "pct1") return fixedTo(n, 1);
  if (fmt === "share1") return fixedTo(n * 100, 1);
  if (!Number.isInteger(n)) return fixedTo(n, 1);
  return Math.abs(n) >= 10000 ? comma(n) : String(n);
}

/** Every substituted element of the source, in document order: its key, its format and what it will render. */
const bindings = [...html.matchAll(/data-fx="([^"]+)"(?:\s+data-fx-fmt="([^"]+)")?/g)].map((m) => ({
  key: m[1],
  fmt: m[2] ?? null,
  rendered: format(resolveKey(m[1]), m[2] ?? null),
}));

/* -- the deck's own text ---------------------------------------------------------------------------------------- */

const pdfPresent = existsSync(PDF);

/** One page of the artefact, extracted with the pinned extractor, exactly as tools/presubmit.sh reads it. */
function pdfPage(page: number): string {
  const r = spawnSync("pdftotext", ["-raw", "-f", String(page), "-l", String(page), PDF, "-"], { encoding: "utf8" });
  return r.stdout ?? "";
}

function pdfPages(): number {
  const r = spawnSync("pdfinfo", [PDF], { encoding: "utf8" });
  return Number(/^Pages:\s+(\d+)$/m.exec(r.stdout ?? "")?.[1] ?? "0");
}

const pages: string[] = pdfPresent && pdfTools ? Array.from({ length: pdfPages() }, (_, i) => pdfPage(i + 1)) : [];
const deckText = pages.join("\n");

/* -- the Chapter 23 value model ---------------------------------------------------------------------------------
 * Recomputed here from the fixture, independently of deck/build.ts, and compared with what the slide types. The
 * three cost lines are the PRD's 23.3 (IDR 1,500,000 a month of hosting over the window, the NFR-17 daily cap at
 * IDR 50,000 and 312 coordination hours at the loaded rate); every other factor is read off the slide's own
 * ASSUMPTION spans below, so the arithmetic and the assumptions a judge reads cannot drift apart. */

const COST = { hosting: 27_000_000, inference: [0, 27_500_000], coordination: 78_000_000 };
const SHIFTS_PER_DAY = 3; // PRD 23.2: three shifts a day over the record's own window.

/** The Business Impact benefit table, as authored: its ASSUMPTION spans and its typed `nonfx` numbers, in order. */
function benefitTable(): { assumptions: string[]; typed: string[]; windowMonths: number } {
  const panel = html.slice(html.indexOf("Benefit model"));
  const label = panel.slice(0, panel.indexOf("<table"));
  const table = panel.slice(panel.indexOf("<table"), panel.indexOf("</table>"));
  const nonfx = (block: string) => [...block.matchAll(/<span class="nonfx">([^<]*)<\/span>/g)].map((m) => m[1]);
  return {
    assumptions: [...table.matchAll(/<span class="assumption">([^<]*)<\/span>/g)].map((m) => m[1]),
    typed: nonfx(table),
    windowMonths: Number(nonfx(label)[0]),
  };
}

function valueModel(months: number) {
  const t = fixtures.method as Json;
  const threshold = t.t as number;
  const coverage = fixtures.coverage as Record<string, Record<string, Json[]>>;
  const cov = (layer: string, field: string) => {
    const row = coverage[layer].unplanned_failure.find((r) => r.t === threshold);
    if (row === undefined) throw new Error(`fixtures.json carries no ${layer} row at t = ${threshold}`);
    return row[field] as number;
  };
  const rs = Object.values((fixtures.families as Json).r_by_tag as Record<string, number>);
  const exposure = cov("generous", "cost_idr");
  const shifts = SHIFTS_PER_DAY * (((fixtures.workbook as Json).window as Json).days as number);
  const M1 = (v: number) => (Math.round((v / 1e6) * 10) / 10).toFixed(1);

  const avoided = 0.3; // ASSUMPTION 30%
  const questions = [2, 6]; // ASSUMPTION 2 to 6
  const minutes = [6, 12]; // ASSUMPTION 6 to 12
  const rate = 250_000; // ASSUMPTION IDR 250,000/h
  const authoring = [6, 1]; // ASSUMPTION 6 less 1 h

  const b1 = [exposure * Math.min(...rs) * avoided, exposure * Math.max(...rs) * avoided];
  const b2h = [(questions[0] * minutes[0] * shifts) / 60, (questions[1] * minutes[1] * shifts) / 60];
  const b2 = b2h.map((h) => h * rate);
  const net = authoring[0] - authoring[1];
  const b3h = [net * cov("generous", "uncovered"), net * cov("strict", "uncovered")];
  const b3 = b3h.map((h) => h * rate);
  const benefit = [b1[0] + b2[0] + b3[0], b1[1] + b2[1] + b3[1]];
  const cost = [
    COST.hosting + COST.inference[0] + COST.coordination,
    COST.hosting + COST.inference[1] + COST.coordination,
  ];
  const payback = [(cost[0] / benefit[1]) * months, (cost[1] / benefit[0]) * months];

  return {
    shifts,
    /** The seventeen typed figures of the benefit table, in the order the slide prints them. */
    typed: [
      M1(b1[0]), M1(b1[1]),
      comma(shifts), String(Math.trunc(b2h[0])), comma(b2h[1]), M1(b2[0]), M1(b2[1]),
      String(b3h[0]), String(b3h[1]), M1(b3[0]), M1(b3[1]),
      M1(benefit[0]), M1(benefit[1]), M1(cost[0]), M1(cost[1]),
      payback[0].toFixed(1), payback[1].toFixed(1),
    ],
  };
}

/* -- the sandbox build ------------------------------------------------------------------------------------------ */

type Run = { status: number | null; stdout: string; stderr: string };

/**
 * deck/build.ts against a throwaway copy of its inputs. `plant` applies deck/fixtures/plants.json to the copies:
 * a data-fx key the fixture does not carry, and a TBD_ placeholder in a rendered team field. The sandbox is
 * `<tmp>/repo`, so the build's own REPO and WORLD are the temporary tree and no deliverable of this repository is
 * touched; bundle/, src/ and node_modules/ are linked read-only.
 */
function sandboxBuild(plant: boolean): Run {
  const root = mkdtempSync(path.join(os.tmpdir(), "thehub-deck-"));
  try {
    const repo = path.join(root, "repo");
    const deck = path.join(repo, "deck");
    mkdirSync(path.join(deck, "src"), { recursive: true });
    mkdirSync(path.join(repo, "deliverables"), { recursive: true });
    mkdirSync(path.join(root, "supplied"), { recursive: true });
    symlinkSync(path.join(WORLD, "thehub-harness"), path.join(root, "thehub-harness"));
    for (const rel of ["bundle", "src", "tools", "node_modules"]) symlinkSync(path.join(REPO, rel), path.join(repo, rel));
    for (const rel of ["figures", "fonts"]) symlinkSync(path.join(REPO, "deck", rel), path.join(deck, rel));
    symlinkSync(path.join(REPO, "deck", "src", "deck.css"), path.join(deck, "src", "deck.css"));
    copyFileSync(BUILD, path.join(deck, "build.ts"));

    let page = source;
    const facts = readJson(TEAM_FACTS);
    if (plant) {
      page = page.replaceAll(`data-fx="${plants.missing_key.key}"`, `data-fx="${plants.missing_key.planted}"`);
      const member = (facts.members as Json[]).find((m) => m.no === plants.placeholder.member_no);
      if (member === undefined) throw new Error(`team-facts.json has no member ${plants.placeholder.member_no}`);
      member[plants.placeholder.field] = plants.placeholder.planted;
    }
    writeFileSync(path.join(deck, "src", "deck.html"), page);
    writeFileSync(path.join(root, "supplied", "team-facts.json"), JSON.stringify(facts, null, 2));

    const r = spawnSync(TSX, [path.join(deck, "build.ts")], { cwd: REPO, encoding: "utf8" });
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The per-slide word counts the build prints: `  p 2  115 / 187            Background & Problem Statement`. */
function slideCounts(stdout: string) {
  return [...stdout.matchAll(/^\s*p\s*(\d+)\s+(\d+)\s*\/\s*(\d+)\s+(APPENDIX)?\s*(.*)$/gm)].map((m) => ({
    page: Number(m[1]),
    prose: Number(m[2]),
    all: Number(m[3]),
    appendix: m[4] === "APPENDIX",
    heading: m[5].trim(),
  }));
}

/* ================================================================================================================
 * 1. Source
 * ============================================================================================================== */

describe("deck/src/deck.html binds every number to the fixture (9.12, AC-DEL-02)", () => {
  it("substitutes at least one hundred elements and pairs each format with its key", () => {
    expect(bindings.length).toBe((html.match(/data-fx="/g) ?? []).length);
    expect(bindings.length).toBeGreaterThanOrEqual(100);
    expect(bindings.filter((b) => b.fmt !== null).length).toBe((html.match(/data-fx-fmt="/g) ?? []).length);
  });

  it("resolves every fixture and manifest key to a non-empty rendered value", () => {
    const own = bindings.filter((b) => !b.key.startsWith("team."));
    const empty = own.filter((b) => b.rendered === "");
    expect(empty.map((b) => b.key)).toEqual([]);
    expect(own.length).toBeGreaterThan(0);
    // A key that resolves to an object or an array renders its own JSON without a format, which is never a number.
    const shapeless = own.filter((b) => b.fmt === null && typeof resolveKey(b.key) === "object");
    expect(shapeless.map((b) => b.key)).toEqual([]);
  });

  it.skipIf(!teamPresent)("resolves every team key and lets no TBD_ placeholder render (D-08, AC-DEL-07)", () => {
    const theirs = bindings.filter((b) => b.key.startsWith("team."));
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs.filter((b) => b.rendered === "").map((b) => b.key)).toEqual([]);
    expect(bindings.filter((b) => /TBD_/.test(b.rendered)).map((b) => b.key)).toEqual([]);
    // D-08 fills the semester for all three members; the build applies the same value and prints that it did.
    expect(bindings.filter((b) => b.key.endsWith(".semester")).map((b) => b.rendered)).toEqual(
      Array((team.members as Json[]).length).fill(D08_SEMESTER),
    );
  });

  it("computes every bar length from the fixture rather than authoring it", () => {
    const bars = [...html.matchAll(/data-fx-bar="([^"]+)"[^>]*?data-fx-max="([^"]+)"[^>]*?data-fx-span="([^"]+)"/g)];
    expect(bars.length).toBe((html.match(/data-fx-bar="/g) ?? []).length);
    expect(bars.length).toBeGreaterThan(0);
    for (const [, key, max, span] of bars) {
      expect(typeof resolveKey(key), key).toBe("number");
      const ceiling = /^[\d.]+$/.test(max) ? Number(max) : resolveKey(max);
      expect(typeof ceiling, `${key}: its maximum ${max}`).toBe("number");
      expect(Number(ceiling)).toBeGreaterThan(0);
      expect(Number(span)).toBeGreaterThan(0);
    }
  });

  it("names a key the fixture does not carry, so an empty render is a build failure and not a blank slide", () => {
    expect(resolveKey(plants.missing_key.key)).not.toBeUndefined();
    expect(resolveKey(plants.missing_key.planted)).toBeUndefined();
    expect(format(resolveKey(plants.missing_key.planted), null)).toBe("");
  });
});

describe("deck figures are native SVG (9.12: no raster figure)", () => {
  it("inlines every figure it names, and each is a drawing rather than an image", () => {
    expect(includes.length).toBeGreaterThanOrEqual(8);
    for (const rel of includes) {
      const file = path.join(REPO, "deck", rel);
      expect(existsSync(file), `${rel} is named by an include and is not on disk`).toBe(true);
      const svg = readFileSync(file, "utf8");
      expect(svg, rel).toContain("<svg");
      expect(svg, rel).not.toMatch(/<image[\s>]/);
      expect(svg, rel).not.toContain("data:image/");
      expect(svg, rel).not.toMatch(/url\(\s*['"]?(?!#)/);
    }
  });

  it("carries no img element and no external reference in the deck source", () => {
    expect(html).not.toMatch(/<img[\s>]/);
    expect(html).not.toContain("data:image/");
    expect(html).not.toMatch(/url\(\s*['"]?(?!#)/);
  });
});

describe("the Chapter 23 value model recomputes from the fixture (AC-DEL-02)", () => {
  const table = benefitTable();

  it("prints the assumptions the arithmetic uses", () => {
    expect(table.assumptions).toEqual([
      "ASSUMPTION 30%",
      "ASSUMPTION 2 to 6",
      "ASSUMPTION 6 to 12",
      "ASSUMPTION IDR 250,000/h",
      "ASSUMPTION 6 less 1 h",
    ]);
    expect(table.windowMonths).toBe(18);
  });

  it("matches every typed figure of the benefit table, in the order the slide prints them", () => {
    const model = valueModel(table.windowMonths);
    expect(table.typed).toEqual(model.typed);
    // The two figures the fixture alone decides: the shift count and the exposure the whole model starts from.
    expect(model.shifts).toBe(SHIFTS_PER_DAY * 550);
    expect(table.typed).toContain(comma(model.shifts));
  });
});

/* ================================================================================================================
 * 2. The artefact
 * ============================================================================================================== */

describe.skipIf(!pdfPresent || !pdfTools)("deliverables/TheHub_deck.pdf (AC-DEL-02)", () => {
  it("has seven pages before the first page whose footer reads APPENDIX", () => {
    const first = pages.findIndex((t) => /\bAPPENDIX\b/.test(t)) + 1;
    expect(first).toBe(PAGES_BEFORE_APPENDIX + 1);
    // The PRD's 26.1 fixes the appendix at A1 to A9, so the deck runs to sixteen pages and no further.
    expect(pages.length).toBe(PAGES_BEFORE_APPENDIX + 9);
    for (const label of ["A1", "A9"]) expect(deckText).toContain(label);
  });

  it("carries the six booklet headings in order by first occurrence, whole word", () => {
    const at = HEADINGS.map((h) => {
      const re = new RegExp(`(?<![A-Za-z])${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`);
      const found = deckText.search(re);
      expect(found, `heading not found in the deck text: ${h}`).toBeGreaterThanOrEqual(0);
      return found;
    });
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(new Set(at).size).toBe(HEADINGS.length);
  });

  it("labels the three key questions", () => {
    for (const label of ["KQ1", "KQ2", "KQ3"]) expect(deckText, label).toContain(label);
  });

  it("prints the recomputed value model and no other arithmetic", () => {
    const model = valueModel(benefitTable().windowMonths);
    for (const figure of model.typed) expect(deckText, `value-model figure absent: ${figure}`).toContain(figure);
  });

  it("carries the D-08 supervisor line and the mandated table headings, in order, on page 7", () => {
    const fixed = readFileSync(path.join(REPO, "src", "lib", "fixed-strings.ts"), "utf8");
    const line = /^export const SUPERVISOR_LINE = "(.*)";$/m.exec(fixed)?.[1];
    expect(line, "src/lib/fixed-strings.ts exports no SUPERVISOR_LINE").toBeTruthy();
    const page7 = pages[PAGES_BEFORE_APPENDIX - 1];
    expect(page7).toContain(line);
    const at = ["No.", "Name", "Major", "Semester", "Area of expertise", "Contribution"].map((h) => {
      const found = page7.indexOf(h);
      expect(found, `mandated table heading absent from page 7: ${h}`).toBeGreaterThanOrEqual(0);
      return found;
    });
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("uses no em dash and no en dash", () => {
    expect(deckText).not.toMatch(/[\u2014\u2013]/);
  });

  it("lets no TBD_ placeholder reach a page (AC-DEL-07)", () => {
    expect(deckText.match(/TBD_[A-Z_]+/g)).toBeNull();
  });
});

describe("the upload budget of 9.12 (AC-DEL-02, AC-DEL-05)", () => {
  const size = (file: string) => (existsSync(file) ? statSync(file).size : 0);

  it("keeps each artefact inside its own budget", () => {
    const built: Array<[string, string, number]> = [
      ["export", EXPORT, BUDGET.export],
      ["deck", PDF, BUDGET.deck],
      ["video", VIDEO, BUDGET.video],
      ["pointer", POINTER, BUDGET.pointer],
    ];
    for (const [name, file, budget] of built) {
      const bytes = size(file);
      expect(bytes, `${name}: ${bytes} bytes against a budget of ${budget}`).toBeLessThanOrEqual(budget);
    }
    // The budgets themselves are the contract: four artefacts plus the buffer are the ceiling exactly.
    expect(BUDGET.export + BUDGET.deck + BUDGET.video + BUDGET.pointer + BUFFER).toBe(CEILING);
  });

  // D-25: the artefacts are not tracked, so a fresh checkout carries none of them and this measures nothing. CI
  // builds the deck and the export before running this file; the video is built where the capture can run.
  it.skipIf(![EXPORT, PDF, VIDEO, POINTER].some((f) => existsSync(f)))(
    "sums the upload under the ceiling with the buffer unspent",
    () => {
    const total = [EXPORT, PDF, VIDEO, POINTER].reduce((sum, f) => sum + size(f), 0);
    expect(total).toBeGreaterThan(0);
    expect(total, `${total} bytes uploaded, ${CEILING - BUFFER} allowed with the buffer unspent`).toBeLessThanOrEqual(
      CEILING - BUFFER,
    );
    },
  );

  it("keeps nothing in deliverables/ that is neither a deliverable nor the checksum record", () => {
    const allowed = new Set([
      "TheHub_prototype.html",
      "TheHub_deck.pdf",
      "TheHub_demo.mp4",
      "TheHub_README.pdf",
      "SHA256SUMS.txt",
    ]);
    const stray = existsSync(DELIVERABLES) ? readdirSync(DELIVERABLES).filter((f) => !allowed.has(f)) : [];
    expect(stray).toEqual([]);
  });
});

describe("banned strings across the built deliverables (AC-DEL-06)", () => {
  /** The legacy product names, from their one home. They may appear in no deliverable, in any casing, in markup
   * or in data, and the list is not copied here so that a name added there is checked here too. */
  const LEGACY = readFileSync(path.join(process.cwd(), "tools", "legacy-names.txt"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  it.skipIf(![PDF, EXPORT, VIDEO, POINTER].some((f) => existsSync(f)))(
    "finds no legacy product name in any built deliverable",
    () => {
    const built = [PDF, EXPORT, VIDEO, POINTER].filter((f) => existsSync(f));
    expect(built.length).toBeGreaterThan(0);
    for (const file of built) {
      const bytes = readFileSync(file, "latin1");
      for (const name of LEGACY) {
        expect(new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`, "i").test(bytes), `${path.basename(file)}: ${name}`).toBe(
          false,
        );
      }
    }
    },
  );

  it.skipIf(!pdfPresent || !pdfTools)(
    "passes both scans of tools/banned-strings.sh over the deck text (presubmit checks 8 and 9)",
    () => {
      const tmp = mkdtempSync(path.join(os.tmpdir(), "thehub-deck-text-"));
      try {
        const text = path.join(tmp, "deck.txt");
        writeFileSync(text, deckText);
        for (const mode of ["--names", "--english"]) {
          const scan = spawnSync("bash", [path.join(REPO, "tools", "banned-strings.sh"), mode, text], {
            cwd: REPO,
            encoding: "utf8",
          });
          const report = (scan.stdout ?? "") + (scan.stderr ?? "");
          expect(scan.status, `${mode}: ${report.slice(0, 2000)}`).toBe(0);
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  );
});

/* ================================================================================================================
 * 3. The negative build
 * ============================================================================================================== */

describe.skipIf(!canBuild)("deck/build.ts is a gate, not a printer (AC-DEL-02, AC-DEL-07)", () => {
  it(
    "builds clean from the repository's own inputs, and holds every slide body under the word cap",
    { timeout: 180_000 },
    () => {
      const run = sandboxBuild(false);
      expect(run.status, run.stdout + run.stderr).toBe(0);
      expect(run.stdout).toContain("no TBD_ placeholder reached the page");
      expect(run.stdout).toContain("value model recomputes from the fixture and matches the slide");

      // The build measures the printed artefact for the page structure; this is where that measurement is held.
      expect(run.stdout).toContain(
        `${PAGES_BEFORE_APPENDIX} pages before the first APPENDIX footer (page ${PAGES_BEFORE_APPENDIX + 1})`,
      );

      const slides = slideCounts(run.stdout);
      expect(slides.length).toBe(PAGES_BEFORE_APPENDIX + 9);
      const body = slides.filter((s) => s.page <= PAGES_BEFORE_APPENDIX);
      expect(body.length).toBe(PAGES_BEFORE_APPENDIX);
      for (const slide of body) {
        expect(slide.prose, `page ${slide.page} body is ${slide.prose} words`).toBeLessThanOrEqual(WORD_CAP);
      }
      // Pages 2 to 7 are the six booklet sections after the cover, in the booklet's order.
      const headings = body.slice(1).map((s) => s.heading);
      expect(headings.length).toBe(HEADINGS.length);
      headings.forEach((heading, i) => expect(heading).toContain(HEADINGS[i]));
    },
  );

  it(
    "exits non-zero and names both plants when a data-fx key is missing and a TBD_ placeholder would render",
    { timeout: 180_000 },
    () => {
      const run = sandboxBuild(true);
      const output = run.stdout + run.stderr;
      expect(run.status, output).not.toBe(0);
      expect(output).toContain("checks failed:");
      expect(output).toContain(plants.missing_key.expect);
      expect(output).toContain(plants.placeholder.expect);
    },
  );
});
