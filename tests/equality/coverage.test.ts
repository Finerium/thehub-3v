// The equality gate of ADR-002 and AC-LOOP-01: the TypeScript port of src/coverage/ and the Python reference of
// thehub-harness must agree field by field, byte for byte in canonical JSON, on the seeded corpus. A divergence
// fails the build.
//
// What is compared, and against which reference line:
//
//   coverage_scores.json `assessments`   every one of the 211 work orders in both layers: best_ratio, matched_field,
//                                        matched_lesson and covered (harness/entities.py:1060 `coverage_assessments`,
//                                        over harness/coverage.py:81 `score`).
//   fixtures.json `coverage.<layer>.<population>`  every population at every rung of the ladder: n, uncovered, the
//                                        unplanned breakdown count, downtime hours, cost in rupiah and the sorted
//                                        uncovered ids (harness/coverage.py:98 `table`, spelled by
//                                        harness/entities.py:1081 `coverage_summaries`). The row's `pct` is left out
//                                        on purpose: it is round(100 * uncovered / n, 1), fully determined by two
//                                        values this gate already compares, and comparing it would only pin Python's
//                                        half-to-even rounding of a display number the contract does not carry.
//   fixtures.json `coverage.bands.unplanned_failure`  no_lesson, copied_row_only, taught
//                                        (harness/coverage.py:255-260, renamed at harness/analyze_corpus.py:246-253).
//   debt.json                            per asset: rank, uncovered work orders, D, C, k, r, incomplete_uncovered and
//                                        the score (harness/debt.py:19 `rank`, spelled by harness/entities.py:1110).
//   fixtures.json `method`               stop_list_sha256 over fixtures.method.stop_list (D-19: both lanes read the
//                                        fixture and no bundle/coverage/stop_list.txt exists).
//
// Inputs. The port is run over the same corpus the harness ran over, read from the bundle rather than from the
// corpus, which never enters this repository (invariant 7):
//
//   work_orders.json   the 211 typed rows.
//   opls.json          the 56 lessons: header fields, the six section bodies and their headings.
//   chunks.jsonl       the one chunk of unit_kind "note" per lesson, which is the lesson's extracted header block.
//                      The generous layer is the WHOLE lesson text and the header block is the part of it no parsed
//                      field reproduces; without it the published `all` figure at t = 0.62 reads 146 uncovered
//                      instead of 143. In the product this string is the same `note` chunk, read from the seeded
//                      `chunk` table, so the gate and the G3 recount compose the same text.
//   fixtures.json      the stop list and its digest (method), the equipment name and datasheet criticality
//                      (equipment_master) and the family membership per asset (families.r_detail).
//
// The bundle is read from HARNESS_BUNDLE, default ../thehub-harness/bundle. When it is absent the whole file skips
// with a message naming what to run; it never passes silently.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LessonText } from "@/coverage/layers";
import { rankDebt } from "@/coverage/debt";
import { scoreWorkOrder } from "@/coverage/score";
import { bandsOf, populationsOf, SENSITIVITY_LADDER, summarise } from "@/coverage/summary";
import { stopListSha256 } from "@/coverage/tokenise";
import type * as coverage from "@/contracts/generated/coverage";
import type * as operations from "@/contracts/generated/operations";

const BUNDLE = process.env.HARNESS_BUNDLE ?? path.join(import.meta.dirname, "../../../thehub-harness/bundle");
const REQUIRED = ["work_orders.json", "opls.json", "chunks.jsonl", "fixtures.json", "coverage_scores.json", "debt.json"];
const missing = REQUIRED.filter((f) => !existsSync(path.join(BUNDLE, f)));
const skip = missing.length > 0;
const reason =
  `harness bundle incomplete at ${BUNDLE} (missing ${missing.join(", ")}). ` +
  "Build it with `uv sync --frozen && make fixtures && make bundle` in thehub-harness, or point HARNESS_BUNDLE at one.";

// --- the bundle, read once ------------------------------------------------------------------------------------
type Layer = "generous" | "strict";
type Assessment = {
  wo_number: string;
  layer: Layer;
  covered: boolean;
  best_ratio: number;
  matched_field: string | null;
  matched_lesson: string | null;
};
type TableRow = {
  t: number;
  n: number;
  uncovered: number;
  breakdowns: number;
  downtime_h: number;
  cost_idr: number;
  uncovered_ids: string[];
};
type Fixtures = {
  method: { stop_list: string[]; stop_list_sha256: string; threshold: number; thresholds: number[] };
  coverage: Record<Layer, Record<string, TableRow[]>> & {
    bands: { unplanned_failure: Array<{ t: number; no_lesson: number; copied_row_only: number; taught: number }> };
  };
  equipment_master: Array<{ tag: string; name: string; criticality_datasheet: string }>;
  families: { r_detail: Record<string, { member_wos: string[] }> };
};
type DebtRow = {
  equipment_tag: string;
  uncovered_wo_numbers: string[];
  factors: { D_hours: number; D_max: number; C_idr: number; C_max: number; k: number; r: number };
  incomplete_uncovered: number;
  score: number;
  rank: number;
};

const read = <T,>(name: string): T => JSON.parse(readFileSync(path.join(BUNDLE, name), "utf-8")) as T;

/**
 * Canonical JSON: object keys sorted at every depth, arrays left in order. The comparison of ADR-002 is byte for
 * byte in canonical JSON, so a port that emits the same values in a different key order passes and one that emits a
 * different value fails, whichever spelling of the fixture the harness happens to serialise.
 */
function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

// A chunk line carries a 1024-float embedding, so the note lines are picked by substring before any JSON is parsed.
function headerTextByRevision(): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readFileSync(path.join(BUNDLE, "chunks.jsonl"), "utf-8").split("\n")) {
    if (!line.includes('"unit_kind": "note"')) continue;
    const c = JSON.parse(line) as { document_revision_id: string; text: string };
    out.set(c.document_revision_id, c.text);
  }
  return out;
}

// --- the port, run over those inputs --------------------------------------------------------------------------
type Ported = {
  fixtures: Fixtures;
  scores: Record<Layer, Map<string, ReturnType<typeof scoreWorkOrder>>>;
  workOrders: operations.WorkOrder[];
  bundleAssessments: Assessment[];
  bundleDebt: DebtRow[];
};

function run(): Ported {
  const fixtures = read<Fixtures>("fixtures.json");
  const workOrders = read<operations.WorkOrder[]>("work_orders.json");
  const opls = read<{ lessons: coverage.Opl[] }>("opls.json").lessons;
  const header = headerTextByRevision();
  const nameByTag = new Map(fixtures.equipment_master.map((e) => [e.tag, e.name]));

  const lessons: LessonText[] = opls.map((opl) => {
    const header_text = header.get(opl.document_revision_id);
    const equipment_name = nameByTag.get(opl.equipment_tag);
    if (header_text === undefined) throw new Error(`no note chunk for ${opl.opl_id} (${opl.document_revision_id})`);
    if (equipment_name === undefined) throw new Error(`no equipment_master name for ${opl.equipment_tag}`);
    return { ...opl, header_text, equipment_name };
  });

  // harness/coverage.py:68 `lessons_by_tag`: the asset's lessons, visited in sorted lesson-id order.
  const byTag = new Map<string, LessonText[]>();
  for (const l of [...lessons].sort((a, b) => (a.opl_id < b.opl_id ? -1 : a.opl_id > b.opl_id ? 1 : 0))) {
    const list = byTag.get(l.equipment_tag) ?? [];
    list.push(l);
    byTag.set(l.equipment_tag, list);
  }

  // The stop list is passed explicitly, from the same fixtures.json this gate compares against. The port defaults it
  // to the list it loads per ARCHITECTURE 8.1, and a gate that relied on that default would be comparing the harness
  // against a stop list read from some other file.
  const stopList = fixtures.method.stop_list;
  const scores = { generous: new Map(), strict: new Map() } as Ported["scores"];
  for (const layer of ["generous", "strict"] as const) {
    for (const wo of workOrders) {
      scores[layer].set(wo.wo_number, scoreWorkOrder(wo, byTag.get(wo.equipment_tag) ?? [], layer, stopList));
    }
  }
  return {
    fixtures,
    scores,
    workOrders,
    bundleAssessments: read<{ assessments: Assessment[] }>("coverage_scores.json").assessments,
    bundleDebt: read<DebtRow[]>("debt.json"),
  };
}

const ported = skip ? null : run();
const got = (): Ported => {
  if (!ported) throw new Error(reason);
  return ported;
};

describe.skipIf(skip)(`the coverage port equals the harness bundle at ${BUNDLE}`, () => {
  it("runs over the same corpus the harness ran over: 211 work orders and 56 lessons", () => {
    expect(got().workOrders).toHaveLength(211);
    expect(got().bundleAssessments).toHaveLength(422);
  });

  it("digests the shipped stop list to fixtures.method.stop_list_sha256 (D-19, harness/coverage.py:307)", () => {
    const { method } = got().fixtures;
    expect(method.stop_list).toHaveLength(65);
    expect(stopListSha256(method.stop_list)).toBe(method.stop_list_sha256);
  });

  it("walks the same sensitivity ladder as fixtures.method.thresholds (harness/coverage.py:27)", () => {
    expect([...SENSITIVITY_LADDER]).toEqual(got().fixtures.method.thresholds);
  });

  // AC-LOOP-01: every assessment of coverage_scores.json, both layers, field by field.
  it("reproduces every entry of coverage_scores.json (harness/entities.py:1060, harness/coverage.py:81)", () => {
    const { bundleAssessments, scores } = got();
    const mine = bundleAssessments.map((a) => {
      const s = scores[a.layer].get(a.wo_number);
      return {
        wo_number: a.wo_number,
        layer: a.layer,
        best_ratio: s?.best_ratio,
        matched_field: s?.matched_field ?? null,
        matched_lesson: s?.matched_lesson ?? null,
        covered: s?.covered,
      };
    });
    const theirs = bundleAssessments.map((a) => ({
      wo_number: a.wo_number,
      layer: a.layer,
      best_ratio: a.best_ratio,
      matched_field: a.matched_field,
      matched_lesson: a.matched_lesson,
      covered: a.covered,
    }));
    expect(canonicalJson(mine)).toBe(canonicalJson(theirs));
  });

  // AC-LOOP-01: the two published headline figures, named so a failure reads as the acceptance criterion it breaks.
  it("reproduces the AC-LOOP-01 headlines: generous all 143 of 211 and unplanned_failure 14 of 57", () => {
    const { fixtures } = got();
    const t = fixtures.method.threshold;
    const at = (pop: string) => fixtures.coverage.generous[pop]?.find((r) => r.t === t);
    expect([at("all")?.uncovered, at("all")?.n]).toEqual([143, 211]);
    expect([at("unplanned_failure")?.uncovered, at("unplanned_failure")?.n]).toEqual([14, 57]);

    const pops = populationsOf(got().workOrders);
    const uncovered = (rows: operations.WorkOrder[]) =>
      rows.filter((w) => (got().scores.generous.get(w.wo_number)?.best_ratio ?? 0) <= t).length;
    expect([uncovered(pops.all), pops.all.length]).toEqual([143, 211]);
    expect([uncovered(pops.unplanned_failure), pops.unplanned_failure.length]).toEqual([14, 57]);
  });

  it("reproduces the five population counts of fixtures.populations (harness/workbook.py:59-67)", () => {
    const pops = populationsOf(got().workOrders);
    const counts = Object.fromEntries(Object.entries(pops).map(([k, v]) => [k, v.length]));
    expect(counts).toEqual({
      all: 211,
      failure: 66,
      planned_flagged: 8,
      unplanned_breakdowns: 23,
      unplanned_failure: 57,
    });
  });

  // The summaries: both layers, every population, every rung of the ladder (harness/coverage.py:98 `table`).
  it("reproduces fixtures.coverage.<layer>.<population> at every t of the ladder", () => {
    const { fixtures, scores, workOrders } = got();
    const pops = populationsOf(workOrders);
    const mine: Record<string, unknown> = {};
    const theirs: Record<string, unknown> = {};
    for (const layer of ["generous", "strict"] as const) {
      for (const pop of Object.keys(pops).sort()) {
        const rows = pops[pop as keyof typeof pops];
        for (const t of fixtures.method.thresholds) {
          const unc = rows.filter((w) => (scores[layer].get(w.wo_number)?.best_ratio ?? 0) <= t);
          const ub = unc.filter((w) => w.breakdown_kind === "unplanned");
          const key = `${layer}.${pop}.${t}`;
          mine[key] = {
            n: rows.length,
            uncovered: unc.length,
            breakdowns: ub.length,
            downtime_h: ub.reduce((a, w) => a + (w.downtime_hours ?? 0), 0),
            cost_idr: ub.reduce((a, w) => a + (w.total_cost_idr ?? 0), 0),
            uncovered_ids: unc.map((w) => w.wo_number).sort(),
          };
          const r = fixtures.coverage[layer][pop]?.find((x) => x.t === t);
          theirs[key] = {
            n: r?.n,
            uncovered: r?.uncovered,
            breakdowns: r?.breakdowns,
            downtime_h: r?.downtime_h,
            cost_idr: r?.cost_idr,
            uncovered_ids: r?.uncovered_ids,
          };
        }
      }
    }
    expect(canonicalJson(mine)).toBe(canonicalJson(theirs));
  });

  // The same figures through the port's own summary surface, so the shape the product renders is the compared one.
  it("reproduces the summaries through summarise(), bands and sensitivity included", () => {
    const { fixtures, scores, workOrders } = got();
    const t = fixtures.method.threshold;
    const rows = summarise(workOrders, scores);
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      const ref = fixtures.coverage[row.layer][row.population]?.find((x) => x.t === t);
      expect({ population: row.population, layer: row.layer, ...pickSummary(row) }).toEqual({
        population: row.population,
        layer: row.layer,
        uncovered_count: ref?.uncovered,
        population_count: ref?.n,
        uncovered_breakdowns: ref?.breakdowns,
        uncovered_downtime_hours: ref?.downtime_h,
        uncovered_cost_idr: ref?.cost_idr,
      });
      expect(row.sensitivity).toEqual(
        fixtures.method.thresholds.map((x) => ({
          t: x,
          uncovered_count: fixtures.coverage[row.layer][row.population]?.find((r) => r.t === x)?.uncovered,
        })),
      );
    }
  });

  it("reproduces the bands 14, 27, 16 of fixtures.coverage.bands (harness/coverage.py:255-260)", () => {
    const { fixtures, scores, workOrders } = got();
    const t = fixtures.method.threshold;
    const ref = fixtures.coverage.bands.unplanned_failure.find((b) => b.t === t);
    const bands = bandsOf(populationsOf(workOrders).unplanned_failure, scores.generous, scores.strict, t);
    expect(bands).toEqual({
      no_lesson: ref?.no_lesson,
      copied_row_only: ref?.copied_row_only,
      taught: ref?.taught,
    });
    // AC-LOOP-02 renders these three; naming them makes a drift read as the criterion it breaks.
    expect(bands).toEqual({ no_lesson: 14, copied_row_only: 27, taught: 16 });
  });

  // AC-LOOP-03: the ranking recomputes from D, C, k and r alone and reproduces the published order.
  it("reproduces debt.json per asset: rank, ids, D, C, k, r, incomplete_uncovered and score", () => {
    const { fixtures, scores, workOrders, bundleDebt } = got();
    const t = fixtures.method.threshold;
    const unplannedFailure = populationsOf(workOrders).unplanned_failure;
    const uncoveredWoNumbers = unplannedFailure
      .filter((w) => (scores.generous.get(w.wo_number)?.best_ratio ?? 0) <= t)
      .map((w) => w.wo_number);
    const criticalityByTag = Object.fromEntries(
      fixtures.equipment_master.map((e) => [e.tag, e.criticality_datasheet]),
    );
    const familyMembers = new Set(Object.values(fixtures.families.r_detail).flatMap((d) => d.member_wos));

    const mine = rankDebt({ workOrders, uncoveredWoNumbers, criticalityByTag, familyMembers }).map((row) => ({
      equipment_tag: row.equipment_tag,
      rank: row.rank,
      uncovered_wo_numbers: row.uncovered_wo_numbers,
      factors: row.factors,
      incomplete_uncovered: row.incomplete_uncovered,
      score: row.score,
    }));
    const theirs = [...bundleDebt]
      .sort((a, b) => a.rank - b.rank)
      .map((row) => ({
        equipment_tag: row.equipment_tag,
        rank: row.rank,
        uncovered_wo_numbers: row.uncovered_wo_numbers,
        factors: row.factors,
        incomplete_uncovered: row.incomplete_uncovered,
        score: row.score,
      }));
    expect(canonicalJson(mine)).toBe(canonicalJson(theirs));
  });
});

function pickSummary(row: ReturnType<typeof summarise>[number]) {
  return {
    uncovered_count: row.uncovered_count,
    population_count: row.population_count,
    uncovered_breakdowns: row.uncovered_breakdowns,
    uncovered_downtime_hours: row.uncovered_downtime_hours,
    uncovered_cost_idr: row.uncovered_cost_idr,
  };
}

describe.skipIf(!skip)("the coverage equality gate is skipped", () => {
  it("says why, so a green run without the bundle is never read as agreement", () => {
    expect(reason).toContain("harness bundle incomplete");
    console.warn(`SKIPPED tests/equality/coverage.test.ts: ${reason}`);
  });
});
