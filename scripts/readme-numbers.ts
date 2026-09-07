// Every number the README states is printed from data, never typed (blueprint section 1 invariant 6, 11.9 AC-DEL-08).
//
//   pnpm readme:numbers          check: regenerate the table and the prose bindings, exit non-zero on any drift
//   pnpm readme:numbers --write  write the regenerated table back between the markers
//
// Two sources, both produced by code: `bundle/fixtures.json`, the harness fixture pulled with the bundle, and
// `evaluation/last-run.json`, the tallies of the last complete golden run as the runner reported them. The check runs
// in CI through scripts/audits/readme-numbers.sh, which `pnpm audit` (Tier A) executes, so a fixture that moves and a
// README that does not is a red build rather than a claim a judge has to take on trust.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const README = path.join(ROOT, "README.md");
const FIGURE = path.join(ROOT, "docs", "architecture.svg");
const START = "<!-- numbers:start -->";
const END = "<!-- numbers:end -->";

type Json = Record<string, unknown>;

function read(file: string): Json {
  const full = path.join(ROOT, file);
  try {
    return JSON.parse(readFileSync(full, "utf8")) as Json;
  } catch (cause) {
    throw new Error(`${file} is not readable as JSON at ${full} (pnpm bundle:pull writes the bundle)`, { cause });
  }
}

/** A path into a JSON document, so a table row names the key it came from and cannot drift from it silently. */
function at(doc: Json, dotted: string): unknown {
  let node: unknown = doc;
  for (const step of dotted.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[step];
  }
  return node;
}

function num(doc: Json, dotted: string): number {
  const value = at(doc, dotted);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`key ${dotted} is absent or not a number; the README cannot state a figure the data does not carry`);
  }
  return value;
}

function str(doc: Json, dotted: string): string {
  const value = at(doc, dotted);
  if (typeof value !== "string" || value.length === 0) throw new Error(`key ${dotted} is absent or not a string`);
  return value;
}

function count(doc: Json, dotted: string): number {
  const value = at(doc, dotted);
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === "object") return Object.keys(value as object).length;
  throw new Error(`key ${dotted} is neither an array nor an object, so it has no count`);
}

/** The coverage rung at the frozen threshold, from the layer's own sensitivity ladder. */
function rung(fx: Json, layer: "generous" | "strict", population: string, t: number): { n: number; uncovered: number; pct: number } {
  const rows = at(fx, `coverage.${layer}.${population}`);
  if (!Array.isArray(rows)) throw new Error(`coverage.${layer}.${population} is not an array of rungs`);
  const row = rows.find((r) => typeof r === "object" && r !== null && (r as { t?: number }).t === t) as
    | { n: number; uncovered: number; pct: number }
    | undefined;
  if (!row) throw new Error(`coverage.${layer}.${population} carries no rung at t = ${t}`);
  return row;
}

interface Row {
  label: string;
  value: string;
  source: string;
  method: string;
}

function rows(fx: Json, run: Json): Row[] {
  const t = num(fx, "method.t");
  const gen = rung(fx, "generous", "unplanned_failure", t);
  const strict = rung(fx, "strict", "unplanned_failure", t);
  const none = num(fx, "coverage_bands.unplanned_failure.none");
  const tableOnly = num(fx, "coverage_bands.unplanned_failure.table_only");
  const taught = num(fx, "coverage_bands.unplanned_failure.taught");
  const observations = at(fx, "integrity.observations") as Record<string, number>;
  const observed = Object.entries(observations)
    .map(([rule, n]) => `${rule} ${n}`)
    .join(", ");

  return [
    {
      label: "Controlled documents ingested",
      value: `${num(fx, "inventory.files")} files, ${count(fx, "inventory.by_class")} classes`,
      source: "`inventory.files`, `inventory.by_class`",
      method: `one extractor, ${str(fx, "inventory.extractor")}, over the corpus digest \`${str(fx, "inventory.corpus_sha256").slice(0, 8)}\``,
    },
    {
      label: "Equipment tags",
      value: `${count(fx, "equipment_master")}`,
      source: "`equipment_master`",
      method: "the equipment tag is the join key of every package",
    },
    {
      label: "Lessons (OPL) parsed",
      value: `${num(fx, "lessons.n")}`,
      source: "`lessons.n`",
      method: "parsed into the six sections plus the header block, not read as prose",
    },
    {
      label: "Maintenance records",
      value: `${num(fx, "populations.all")} rows, ${num(fx, "populations.unplanned_failure")} unplanned failures`,
      source: "`populations.all`, `populations.unplanned_failure`",
      method: "the workbook's own rows; the population of every coverage figure is named beside it",
    },
    {
      label: "Failure knowledge matched by no lesson at all",
      value: `${gen.uncovered} of ${gen.n} (${gen.pct}%)`,
      source: `\`coverage.generous.unplanned_failure\` at t = ${t}`,
      method: `generous layer, whole lesson text, window 2n, uncovered when the best score does not exceed t = ${t}`,
    },
    {
      label: "Failure knowledge with nothing beyond a copied row",
      value: `${strict.uncovered} of ${strict.n} (${strict.pct}%)`,
      source: `\`coverage.strict.unplanned_failure\` at t = ${t}`,
      method: "strict layer, the rebuilt header fields plus sections 1, 2, 3, 4 and 6, watermark excluded",
    },
    {
      label: "The three bands of that population",
      value: `${none} no lesson, ${tableOnly} copied row only, ${taught} taught`,
      source: "`coverage_bands.unplanned_failure`",
      method: "one record sits in exactly one band; the console recounts both layers after a publication",
    },
    {
      label: "Integrity findings",
      value: `${num(fx, "integrity.total")}`,
      source: "`integrity.total`",
      method: `deterministic rules over the parsed documents, no model; two observation rules are reported outside the total (${observed})`,
    },
    {
      label: "Causal links between failure records",
      value: `${num(fx, "chains.links")}`,
      source: "`chains.links`",
      method: `a shared degradation noun inside a ${num(fx, "chains.window_days")}-day window, never a claim of cause`,
    },
    {
      label: "Golden set",
      value: `${num(fx, "golden.size")} cases, ${num(fx, "golden.hard_gate_count")} hard-gated`,
      source: "`golden.size`, `golden.hard_gate_count`",
      method: "written from the case's own expectations before the lane was measured; no case is edited to move a number",
    },
    {
      label: "Golden set, last complete run",
      value: `${num(run, "pass")} of ${num(run, "cases")} pass, ${num(run, "hard_gates_pass")} of ${num(run, "hard_gates_present")} hard gates`,
      source: "`evaluation/last-run.json`",
      method: `tier A and tier B against ${str(run, "base_url")}, corpus version ${str(run, "corpus_version")}, recorded ${str(run, "recorded")}`,
    },
  ];
}

/** The fragments that must appear verbatim in the README prose, so a figure outside the table cannot go stale. */
function bindings(fx: Json, run: Json): string[] {
  const t = num(fx, "method.t");
  const gen = rung(fx, "generous", "unplanned_failure", t);
  const strict = rung(fx, "strict", "unplanned_failure", t);
  return [
    `${num(fx, "inventory.files")} controlled documents`,
    `${gen.uncovered} of ${gen.n}`,
    `${strict.uncovered} of ${strict.n}`,
    `t = ${t}`,
    `${num(fx, "integrity.total")} integrity findings`,
    `${num(fx, "golden.size")} cases`,
    `${num(fx, "golden.hard_gate_count")} of them hard-gated`,
    `${num(run, "pass")} of ${num(run, "cases")} passed`,
  ];
}

/**
 * The figure the README embeds carries two data labels of its own. They are checked here rather than in a second
 * script, because a figure that disagrees with the table beneath it is the same defect as a table that disagrees
 * with the fixture. The figure is hand-drawn SVG and is edited by hand; this check names the label that drifted.
 */
function figureBindings(fx: Json): string[] {
  const t = num(fx, "method.t");
  const gen = rung(fx, "generous", "unplanned_failure", t);
  const strict = rung(fx, "strict", "unplanned_failure", t);
  return [
    `${num(fx, "inventory.files")} controlled documents, ${count(fx, "equipment_master")} equipment tags`,
    `${gen.uncovered} of ${gen.n} with no lesson, ${strict.uncovered} of ${strict.n} with a copied row at most`,
  ];
}

function table(fx: Json, run: Json): string {
  const head = ["| Figure | Value | Printed from | Method |", "| --- | --- | --- | --- |"];
  const body = rows(fx, run).map((r) => `| ${r.label} | **${r.value}** | ${r.source} | ${r.method} |`);
  const foot = [
    "",
    `Fixture: harness ${str(fx, "meta.harness_version")}, bundle \`${str(read("bundle/manifest.json"), "bundle_version")}\`, ` +
      `recipe \`${str(fx, "method.recipe_sha256").slice(0, 12)}\`. ` +
      "Regenerate with `pnpm readme:numbers --write`; `pnpm readme:numbers` fails the build when this table or a figure in the prose differs from the data.",
  ];
  return [...head, ...body, ...foot].join("\n");
}

function main(): void {
  const write = process.argv.includes("--write");
  const fx = read("bundle/fixtures.json");
  const run = read("evaluation/last-run.json");
  const generated = table(fx, run);

  const readme = readFileSync(README, "utf8");
  const from = readme.indexOf(START);
  const to = readme.indexOf(END);
  if (from < 0 || to < 0 || to < from) throw new Error(`README.md carries no ${START} / ${END} pair around the numbers table`);

  const current = readme.slice(from + START.length, to).trim();
  const problems: string[] = [];
  if (current !== generated) problems.push("the numbers table differs from the data");
  for (const fragment of bindings(fx, run)) {
    if (!readme.includes(fragment)) problems.push(`the prose does not carry "${fragment}"`);
  }
  const figure = readFileSync(FIGURE, "utf8");
  for (const fragment of figureBindings(fx)) {
    if (!figure.includes(fragment)) problems.push(`docs/architecture.svg does not carry "${fragment}"`);
  }

  if (write) {
    writeFileSync(README, `${readme.slice(0, from + START.length)}\n${generated}\n${readme.slice(to)}`);
    // Only the table is generated. The prose and the figure are written by hand, so a drift in either is reported
    // rather than rewritten: a script that edited a sentence would be editing an argument.
    const stale = problems.filter((p) => !p.startsWith("the numbers table"));
    if (stale.length > 0) {
      console.error(`readme-numbers: table written; the prose and the figure still need a hand:\n  ${stale.join("\n  ")}`);
      process.exit(1);
    }
    console.log("readme-numbers: table written from bundle/fixtures.json and evaluation/last-run.json");
    return;
  }

  if (problems.length > 0) {
    console.error(`readme-numbers: README.md is out of step with the data:\n  ${problems.join("\n  ")}`);
    console.error("run `pnpm readme:numbers --write` and correct the prose it names");
    process.exit(1);
  }
  console.log(
    `readme-numbers: ${rows(fx, run).length} figures, ${bindings(fx, run).length} prose bindings and ` +
      `${figureBindings(fx).length} figure labels match the data`,
  );
}

main();
