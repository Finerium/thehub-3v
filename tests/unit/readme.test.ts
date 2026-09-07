// The README's figures are the fixture's, not a claim (blueprint section 1 invariant 6, 11.9 AC-DEL-08).
//
// scripts/readme-numbers.ts regenerates the table and reports drift, and scripts/audits/readme-numbers.sh runs it
// in Tier A. That script proves the README equals what the generator would print today. This file proves the
// second, stronger half, and it runs inside `pnpm gate:quick`, so the binding is checked on every change rather
// than only where the two artefact inputs of the audit happen to be on disk:
//
//   1. Binding, hermetic and always run. Every number the numbers table states is a value the fixture key named
//      in that row's own "Printed from" column carries, read out of bundle/fixtures.json by that key. The rows are
//      read from the README, not listed here, so a row added to the table is checked the moment it appears and a
//      row whose key stops resolving is a red test rather than a stale claim on the front page.
//   2. The negative control. A gate nobody has seen fire is a gate nobody knows works: one fixture value is moved
//      in a throwaway copy of the four files the generator reads, and the generator must exit non-zero naming both
//      the table it would rewrite and the prose sentence that no longer matches. That is the whole promise of
//      AC-DEL-08 in one run: a fixture that moves reddens the build.
//
// Nothing here writes to README.md, to bundle/ or to docs/: the sandbox of layer 2 is a temporary tree.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const README = path.join(REPO, "README.md");
const FIXTURES = path.join(REPO, "bundle", "fixtures.json");
const MANIFEST = path.join(REPO, "bundle", "manifest.json");
const LAST_RUN = path.join(REPO, "evaluation", "last-run.json");
const FIGURE = path.join(REPO, "docs", "architecture.svg");
const GENERATOR = path.join(REPO, "scripts", "readme-numbers.ts");
const AUDIT = path.join(REPO, "scripts", "audits", "readme-numbers.sh");
const TSX = path.join(REPO, "node_modules", ".bin", "tsx");

const START = "<!-- numbers:start -->";
const END = "<!-- numbers:end -->";

type Json = Record<string, unknown>;
const readJson = (file: string): Json => JSON.parse(readFileSync(file, "utf8")) as Json;

const readme = readFileSync(README, "utf8");
const fixtures = readJson(FIXTURES);

/** A dotted path into a JSON document; the same reader scripts/readme-numbers.ts uses to print the row. */
function at(doc: unknown, dotted: string): unknown {
  let node: unknown = doc;
  for (const step of dotted.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[step];
  }
  return node;
}

/**
 * The numbers a key legitimately lets a row state: the value itself when it is a number, and for a collection its
 * size and the numbers it holds directly. One level, never a deep walk, so a stale figure cannot be excused by
 * some unrelated number buried further down the fixture.
 */
function admissible(node: unknown): Set<number> {
  const out = new Set<number>();
  if (typeof node === "number") {
    out.add(node);
  } else if (Array.isArray(node)) {
    out.add(node.length);
    for (const value of node) if (typeof value === "number") out.add(value);
  } else if (node !== null && typeof node === "object") {
    out.add(Object.keys(node).length);
    for (const value of Object.values(node)) if (typeof value === "number") out.add(value);
  }
  return out;
}

type Row = { label: string; value: string; source: string };

/** The rows of the generated block, as the README carries them. */
function tableRows(): Row[] {
  const from = readme.indexOf(START);
  const to = readme.indexOf(END);
  expect(from, `README.md carries no ${START} marker`).toBeGreaterThanOrEqual(0);
  expect(to, `README.md carries no ${END} marker`).toBeGreaterThan(from);
  return readme
    .slice(from + START.length, to)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.startsWith("| ---") && !line.startsWith("| Figure"))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      return { label: cells[0] ?? "", value: cells[1] ?? "", source: cells[2] ?? "" };
    });
}

/** Every number a cell states. A thousands separator is removed first, so 93,721,000 is one figure and not three. */
function numbersIn(cell: string): number[] {
  const plain = cell.replace(/(\d),(?=\d{3}(\D|$))/g, "$1");
  return [...plain.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/** The backticked keys of a "Printed from" cell, and the sensitivity rung the cell pins, when it names one. */
function keysOf(source: string): { keys: string[]; files: string[]; t: number | null } {
  const ticked = [...source.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);
  const t = /at t = (\d+(?:\.\d+)?)/.exec(source);
  return {
    keys: ticked.filter((k) => !k.includes("/")),
    files: ticked.filter((k) => k.includes("/")),
    t: t ? Number(t[1]) : null,
  };
}

/** A coverage key names a ladder; the row states one rung of it, the one the cell pins with `at t = `. */
function rungOrNode(node: unknown, t: number | null): unknown {
  if (t === null || !Array.isArray(node)) return node;
  const rung = node.find((row) => row !== null && typeof row === "object" && (row as { t?: unknown }).t === t);
  expect(rung, `no rung at t = ${t} in the ladder the row names`).toBeDefined();
  return rung;
}

const rows = tableRows();

describe("README.md, the numbers table (AC-DEL-08)", () => {
  it("carries the generated block and at least one row per figure the front page states", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.label.length, `a row of the table has no label: ${JSON.stringify(row)}`).toBeGreaterThan(0);
      expect(row.source.length, `row "${row.label}" names no source`).toBeGreaterThan(0);
      expect(numbersIn(row.value).length, `row "${row.label}" states no figure`).toBeGreaterThan(0);
    }
  });

  describe.each(rows.map((row) => [row.label, row] as const))("%s", (_label, row) => {
    const { keys, files, t } = keysOf(row.source);
    const runPresent = existsSync(LAST_RUN);

    it("names a key the data carries", () => {
      expect(keys.length + files.length, `row "${row.label}" backticks no key or file`).toBeGreaterThan(0);
      for (const key of keys) {
        expect(at(fixtures, key), `bundle/fixtures.json carries no ${key}, so the row states a figure nothing prints`).toBeDefined();
      }
      for (const file of files) {
        // The one row printed from a run report rather than the fixture. The file is written by the golden runner.
        expect(["evaluation/last-run.json"], `row "${row.label}" names a file the generator does not read`).toContain(file);
      }
    });

    it.skipIf(files.length > 0 && !runPresent)("states only figures those keys carry", () => {
      const allowed = new Set<number>();
      for (const key of keys) for (const n of admissible(rungOrNode(at(fixtures, key), t))) allowed.add(n);
      for (const file of files) for (const n of admissible(readJson(path.join(REPO, file)))) allowed.add(n);
      if (t !== null) allowed.add(t);

      for (const stated of numbersIn(row.value)) {
        expect(
          allowed.has(stated),
          `README row "${row.label}" states ${stated}, which ${[...keys, ...files].join(", ")} does not carry ` +
            `(the data offers ${[...allowed].sort((a, b) => a - b).join(", ")}); run \`pnpm readme:numbers --write\``,
        ).toBe(true);
      }
    });
  });
});

describe("the generator that prints the table", () => {
  it("is run in Tier A by an audit `pnpm audit` globs", () => {
    expect(existsSync(AUDIT), "scripts/audits/readme-numbers.sh is missing, so Tier A checks no README figure").toBe(true);
    const audit = readFileSync(AUDIT, "utf8");
    expect(audit).toContain("scripts/readme-numbers.ts");
    // The audit refuses to pass on a missing input; a check that quietly passes on one is worse than no check.
    expect(audit).toContain("bundle/fixtures.json evaluation/last-run.json README.md docs/architecture.svg");
  });

  // The negative control. Without it, a green run proves only that today's README and today's fixture agree; it
  // does not prove that tomorrow's fixture would be noticed.
  describe.skipIf(!existsSync(LAST_RUN) || !existsSync(FIGURE))("reddens when a fixture value moves", () => {
    it("exits non-zero naming the table and the prose sentence that no longer matches", () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), "thehub-readme-numbers-"));
      try {
        for (const sub of ["scripts", "bundle", "evaluation", "docs"]) mkdirSync(path.join(dir, sub));
        copyFileSync(GENERATOR, path.join(dir, "scripts", "readme-numbers.ts"));
        copyFileSync(MANIFEST, path.join(dir, "bundle", "manifest.json"));
        copyFileSync(LAST_RUN, path.join(dir, "evaluation", "last-run.json"));
        copyFileSync(FIGURE, path.join(dir, "docs", "architecture.svg"));
        copyFileSync(README, path.join(dir, "README.md"));

        const moved = readJson(FIXTURES);
        const inventory = moved.inventory as { files: number };
        const was = inventory.files;
        inventory.files = was + 1;
        writeFileSync(path.join(dir, "bundle", "fixtures.json"), JSON.stringify(moved));

        const result = spawnSync(TSX, [path.join(dir, "scripts", "readme-numbers.ts")], { cwd: dir, encoding: "utf8" });
        const output = `${result.stdout}${result.stderr}`;
        expect(result.status, `the generator passed on a fixture that moved:\n${output}`).not.toBe(0);
        expect(output).toContain("the numbers table differs from the data");
        expect(output).toContain(`the prose does not carry "${was + 1} controlled documents"`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// AC-DEL-08's other half: "the main repository README is pitch-grade ... and no corpus content". The numbers are
// bound above; what had no check was the shape of the page a reviewer actually lands on, and the one rule that
// would be a real breach if it broke. The screenshots leg of the criterion is deliberately unmet (invariant 7),
// and the refusal is asserted here so it stays a stated decision rather than becoming an oversight.
// ---------------------------------------------------------------------------------------------------------------
describe("README.md, the front page a reviewer lands on (AC-DEL-08)", () => {
  const readme = readFileSync(README, "utf8");
  const headings = readme
    .split("\n")
    .filter((line) => /^##\s/.test(line))
    .map((line) => line.replace(/^##\s+/, "").trim());

  it.each([
    ["what it does", /^## What it does, in five lines$/m, 5],
    ["the three Key Questions", /^## The three Key Questions$/m, 3],
    ["the numbers", /^## The numbers$/m, 1],
    ["the reproduction command", /^## Run it$/m, 1],
    ["the reviewer path", /^## See it live$/m, 1],
    ["the honest capability matrix", /^## Honest limits$/m, 1],
    ["the AI disclosure", /^## AI disclosure$/m, 1],
  ])("carries the %s section", (_what, pattern) => {
    expect(readme).toMatch(pattern);
  });

  it("states what it does in five lines and asks the three Key Questions", () => {
    const five = section(readme, "What it does, in five lines");
    expect(five.split("\n").filter((l) => /^\d+\.\s/.test(l.trim()))).toHaveLength(5);
    for (const kq of ["KQ1", "KQ2", "KQ3"]) expect(section(readme, "The three Key Questions")).toContain(kq);
  });

  it("carries the inter-repo diagram as a file in this repository, not a hotlink", () => {
    expect(readme).toContain("docs/architecture.svg");
    expect(existsSync(FIGURE)).toBe(true);
    expect(readFileSync(FIGURE, "utf8")).toContain("<svg");
  });

  it("gives a reproduction command block a reader can run", () => {
    const run = section(readme, "Run it");
    expect(run).toContain("pnpm install --frozen-lockfile");
    expect(run).toMatch(/```/);
  });

  it("lists at least eight honest limits, each one a stated decision", () => {
    const limits = section(readme, "Honest limits")
      .split("\n")
      .filter((l) => /^\d+\.\s\*\*/.test(l.trim()));
    expect(limits.length).toBeGreaterThanOrEqual(8);
  });

  it("records the screenshots leg as refused rather than missing (invariant 7)", () => {
    const limits = section(readme, "Honest limits");
    expect(limits).toContain("No screenshots are in this repository");
    expect(limits).toContain("invariant 7");
    // A README that grew a screenshot would break the refusal it states.
    expect(readme).not.toMatch(/!\[[^\]]*\]\([^)]*\.(png|jpg|jpeg|gif|webp)\)/i);
  });

  it("carries no corpus content: no anchor text of any bundle span appears on the front page", () => {
    const claims = JSON.parse(readFileSync(path.join(REPO, "bundle", "claims.json"), "utf8")) as { spans: { id: string; anchor_text: string }[] };
    // A short anchor may be an identifier the README is allowed to name (a document number, a tag); a sentence is
    // corpus content wherever it appears. 40 characters is the line, the same one the entailment set draws at.
    const quoted = claims.spans.filter((s) => s.anchor_text.trim().length >= 40).filter((s) => readme.includes(s.anchor_text.trim()));
    expect(
      quoted.map((s) => `${s.id}: ${s.anchor_text.slice(0, 60)}`),
      "the README quotes the organiser's corpus",
    ).toEqual([]);
    expect(claims.spans.length, "no span was long enough to check, so this proves nothing").toBeGreaterThan(100);
  });

  it("keeps every heading it promises in the reading order the reviewer path assumes", () => {
    expect(headings.indexOf("See it live")).toBeLessThan(headings.indexOf("The numbers"));
    expect(headings.indexOf("The numbers")).toBeLessThan(headings.indexOf("Honest limits"));
  });
});

/** One `##` section of the README, from its heading to the next one. */
function section(readme: string, heading: string): string {
  const start = readme.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`README carries no section "${heading}"`);
  const next = readme.indexOf("\n## ", start + 1);
  return readme.slice(start, next === -1 ? undefined : next);
}
