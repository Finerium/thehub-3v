// The latency instrument (blueprint 11.9 AC-NFR-03, AC-NFR-04, AC-NFR-05, AC-NFR-17). Three of those criteria name
// a measurement (03, 05, 17) and none of them names a mechanism, so this file is the mechanism: one probe, one
// report, one definition of server time, and a validation the probe runs on itself before it reports a single
// figure. AC-NFR-04's composed-packet figure belongs to the golden runner, which calls the provider; only its
// answer-lane clause is measured here, on the path that calls none.
//
//   pnpm tsx scripts/latency.ts --base-url https://thehub-3v.vercel.app --out <file.json> \
//     [--samples 50] [--ask-samples 20] [--idle-minutes 7] [--cold-samples 3] [--user engineer_demo] \
//     [--question "<a seeded chip question>"] [--trace <id of a trace that exists>] [--gap-ms 40]
//
// The password never travels on a command line: it arrives on stdin through tools/secret-pipe.sh
// (`tools/secret-pipe.sh DEMO_ENGINEER_PASSWORD -- pnpm tsx scripts/latency.ts ...`), or from
// DEMO_ENGINEER_PASSWORD in the environment the way scripts/smoke.sh reads it. It is never printed, never written
// to the report and never interpolated into an error. Without it the probe still runs and marks every route that
// needs a session `skipped_unauthenticated`, so a report can never look green for want of a login.
//
// What it measures and what it refuses to claim:
//   - Instrument validation first (AC-NFR-03): two independent baselines over the one empty route, /robots.txt,
//     which runs no handler and touches no database. The instrument is validated when the two baselines' p95
//     differ by less than 375 ms. Nothing downstream is reported as green while that fails.
//   - Server time: no response carries a duration header (withRoute logs duration_ms server side and emits none),
//     so server time is derived, `ttfb_ms - the p50 of the empty baseline taken in the same run`, the baseline
//     being the transport and platform floor. Every criterion is judged on the raw ttfb, which is the derived
//     figure plus that floor and can therefore only be larger: a green verdict here is green under either reading.
//   - Percentiles are nearest-rank, ceil(p * n), stated in the report so a reader can recompute them.
//   - No provider call is made anywhere in this file. The answer lane is measured on the seeded path of
//     src/answer/seeded.ts, which rebuilds both stream lines from storage; the report says so in those words and
//     the AC-NFR-04 verdict is never green on a figure the golden set alone can take.
//
// Every fetch below targets --base-url and nothing else, which is what the provider-egress audit's marker declares.
// egress: none
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// ---------------------------------------------------------------------------------------------------------------
// Pure parts. tests/unit/latency.test.ts drives everything below this line with no network.
// ---------------------------------------------------------------------------------------------------------------

export const P95_LOOKUP_BOUND_MS = 1500; // AC-NFR-03
export const NOISE_BOUND_MS = 375; // AC-NFR-03, instrument validation
export const COLD_FIRST_BYTE_BOUND_MS = 3000; // AC-NFR-05
export const REGISTER_BOUND_MS = 5000; // AC-NFR-17
export const EVIDENCE_LINE_BOUND_MS = 2000; // AC-NFR-04, the first stream line

export type Stats = { n: number; min: number; p50: number; p95: number; max: number; mean: number };

export type Sample = { ttfb_ms: number; total_ms: number; status: number; bytes: number };

export type RouteReading = {
  id: string;
  criterion: string;
  surface: number | null;
  kind: "page" | "api" | "static";
  method: string;
  path: string;
  samples: number;
  status_counts: Record<string, number>;
  expected_status: number;
  off_expectation: number;
  ttfb_ms: Stats;
  total_ms: Stats;
  server_ms: Stats;
  bytes_max: number;
  rows: number | null;
  skipped: string | null;
};

export type Validation = {
  route: string;
  samples: number;
  baseline_a: Stats;
  baseline_b: Stats;
  noise_ms: number;
  bound_ms: number;
  floor_ms: number;
  pass: boolean;
  note: string;
};

export type AnswerLane = {
  route: string;
  samples: number;
  mode: string | null;
  provider_calls: number;
  evidence_line_ms: Stats;
  complete_ms: Stats;
  evidence_citations: number | null;
  skipped: string | null;
};

export type ColdReading = { idle_s: number; ttfb_ms: number; total_ms: number; status: number };

export type ColdStart = { route: string; samples: ColdReading[]; ttfb_ms: Stats | null; bound_ms: number; note: string };

export type Health = { ok: boolean; corpus_version: string | null; commit: string | null };

export type ClauseState = "green" | "not_proven" | "red";

/** One clause of a criterion and what this instrument found for it. A clause it cannot judge is named in the note. */
export type Clause = { clause: string; state: ClauseState; evidence: string };

export type Verdict = {
  id: string;
  state: ClauseState;
  bound: string;
  measured: string;
  check: string;
  note: string;
  clauses: Clause[];
};

export type VerdictInput = {
  validation: Validation;
  routes: RouteReading[];
  answer_lane: AnswerLane;
  cold_start: ColdStart;
  health: Health;
  fixture_10x: boolean;
  base_url: string;
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Nearest-rank percentile: the value at position ceil(p * n) of the sorted sample, p in (0, 1]. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("percentile of an empty sample");
  if (!(p > 0 && p <= 1)) throw new Error(`percentile p must be in (0, 1], received ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[rank - 1] as number;
}

export function summarise(values: readonly number[]): Stats {
  if (values.length === 0) return { n: 0, min: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    n: values.length,
    min: round1(Math.min(...values)),
    p50: round1(percentile(values, 0.5)),
    p95: round1(percentile(values, 0.95)),
    max: round1(Math.max(...values)),
    mean: round1(sum / values.length),
  };
}

/**
 * AC-NFR-03's "instrument validation first (two empty baselines; noise under 375 ms)": two independent runs over
 * the same empty route. The instrument is validated when their p95 agree inside the bound; the floor is the p50 of
 * the pair and is what server time is derived against.
 */
export function validateInstrument(route: string, a: readonly number[], b: readonly number[]): Validation {
  const baselineA = summarise(a);
  const baselineB = summarise(b);
  const noise = a.length === 0 || b.length === 0 ? Number.POSITIVE_INFINITY : round1(Math.abs(baselineA.p95 - baselineB.p95));
  return {
    route,
    samples: baselineA.n,
    baseline_a: baselineA,
    baseline_b: baselineB,
    noise_ms: Number.isFinite(noise) ? noise : -1,
    bound_ms: NOISE_BOUND_MS,
    floor_ms: round1(Math.min(baselineA.p50, baselineB.p50)),
    pass: Number.isFinite(noise) && noise < NOISE_BOUND_MS,
    note: "Two runs over the one route that runs no handler and touches no database; the noise is the difference of their p95.",
  };
}

/** Server time as this instrument defines it: first byte minus the measured transport and platform floor. */
export function serverMs(ttfb: readonly number[], floorMs: number): number[] {
  return ttfb.map((value) => round1(Math.max(0, value - floorMs)));
}

const worstOf = (routes: readonly RouteReading[]): RouteReading | null =>
  routes.reduce<RouteReading | null>((worst, route) => (worst === null || route.ttfb_ms.p95 > worst.ttfb_ms.p95 ? route : worst), null);
/**
 * One verdict per criterion, clause by clause. `green` is reachable only from a validated instrument and a complete
 * measurement; a clause whose subject does not exist on the deployment today is `not_proven` with the reason, never
 * green and never silent, and the criterion takes the weakest state of its clauses. A clause this instrument cannot
 * judge at all is not scored here: it is named in the note with the check that does judge it.
 */
const WORST: Record<ClauseState, number> = { green: 0, not_proven: 1, red: 2 };

const worstState = (clauses: readonly Clause[]): ClauseState =>
  clauses.reduce<ClauseState>((worst, clause) => (WORST[clause.state] > WORST[worst] ? clause.state : worst), "green");

export function verdicts(input: VerdictInput): Verdict[] {
  const { validation, routes, answer_lane, cold_start, health, fixture_10x, base_url } = input;
  const measured = routes.filter((route) => route.skipped === null);
  const lookups = measured.filter((route) => route.criterion === "AC-NFR-03");
  const registers = measured.filter((route) => route.criterion === "AC-NFR-17");
  const skipped = routes.filter((route) => route.skipped !== null);
  const probe = `pnpm tsx scripts/latency.ts --base-url ${base_url} --out <file>`;

  const validated: Clause = {
    clause: `instrument validation first: two empty baselines over ${validation.route}, noise under ${NOISE_BOUND_MS} ms`,
    state: validation.pass ? "green" : "not_proven",
    evidence: `noise ${validation.noise_ms} ms; baseline p95 ${validation.baseline_a.p95} ms and ${validation.baseline_b.p95} ms over ${validation.samples} samples each; transport floor ${validation.floor_ms} ms`,
  };

  // AC-NFR-03. Typed lookups and register views.
  const worstLookup = worstOf(lookups);
  const offExpectation = lookups.filter((route) => route.off_expectation > 0);
  const lookupClause: Clause = { clause: `p95 server time under ${P95_LOOKUP_BOUND_MS} ms over ${lookups[0]?.samples ?? 0} requests per route`, state: "not_proven", evidence: "" };
  if (!validation.pass) {
    lookupClause.evidence = "the instrument did not validate, so no figure this run took is reportable";
  } else if (lookups.length === 0 || worstLookup === null) {
    lookupClause.evidence = `no route measured; ${skipped.length} routes were skipped`;
  } else if (offExpectation.length > 0) {
    lookupClause.state = "red";
    lookupClause.evidence = offExpectation.map((route) => `${route.path} answered ${JSON.stringify(route.status_counts)} against an expected ${route.expected_status}`).join("; ");
  } else {
    lookupClause.state = worstLookup.ttfb_ms.p95 >= P95_LOOKUP_BOUND_MS ? "red" : "green";
    lookupClause.evidence = `${lookups.length} routes, ${worstLookup.samples} samples each; worst p95 first byte ${worstLookup.ttfb_ms.p95} ms on ${worstLookup.path}, server time ${worstLookup.server_ms.p95} ms there`;
  }
  const nfr03Clauses = [validated, lookupClause];
  const nfr03: Verdict = {
    id: "AC-NFR-03",
    state: worstState(nfr03Clauses),
    bound: `p95 under ${P95_LOOKUP_BOUND_MS} ms server time on the demo deployment over 50 requests per route; instrument validation first (two empty baselines, noise under ${NOISE_BOUND_MS} ms)`,
    measured: lookupClause.evidence,
    check: `${probe}, then read validation.pass and the routes whose criterion is AC-NFR-03`,
    note: "Judged on the raw first byte, which carries the transport floor that the derived server time removes, so the verdict holds under either reading.",
    clauses: nfr03Clauses,
  };

  // AC-NFR-04. Composed answers. The composed figure belongs to the golden set, which calls the provider.
  const laneMeasured = answer_lane.skipped === null && answer_lane.evidence_line_ms.n > 0;
  const evidenceClause: Clause = {
    clause: `the evidence list reaches the browser within ${EVIDENCE_LINE_BOUND_MS} ms of the request`,
    state: laneMeasured ? (answer_lane.evidence_line_ms.p95 < EVIDENCE_LINE_BOUND_MS ? "green" : "red") : "not_proven",
    evidence: laneMeasured
      ? `p50 ${answer_lane.evidence_line_ms.p50} ms, p95 ${answer_lane.evidence_line_ms.p95} ms over ${answer_lane.samples} samples on the lane that makes no provider call (packet mode "${answer_lane.mode}")`
      : `not measured: ${answer_lane.skipped ?? "no sample"}`,
  };
  const composedClause: Clause = {
    clause: "composed packets p95 under 20 s with no repair and under 45 s with one repair, measured on the golden set",
    state: "not_proven",
    evidence: "this probe makes no provider call, and the composed path is reached only through one; the golden runner is the instrument for this clause",
  };
  const nfr04Clauses = [evidenceClause, composedClause];
  const nfr04: Verdict = {
    id: "AC-NFR-04",
    state: worstState(nfr04Clauses),
    bound: `evidence list within ${EVIDENCE_LINE_BOUND_MS} ms; composed packets p95 under 20 s with no repair and under 45 s with one repair, on the golden set`,
    measured: laneMeasured
      ? `answer lane without a provider call (the seeded path of src/answer/seeded.ts, packet mode "${answer_lane.mode}", ${answer_lane.provider_calls} provider calls): evidence line p50 ${answer_lane.evidence_line_ms.p50} ms, p95 ${answer_lane.evidence_line_ms.p95} ms; stream complete p50 ${answer_lane.complete_ms.p50} ms, p95 ${answer_lane.complete_ms.p95} ms over ${answer_lane.samples} samples`
      : `answer lane not measured: ${answer_lane.skipped ?? "no sample"}`,
    check: "pnpm golden:a and pnpm golden:b print p50 and p95 for the no-repair and one-repair paths; this probe measures only the lane that makes no provider call",
    note: "A seeded reading is not a substitute for the composed figure: the seeded lane rebuilds a stored packet and runs neither retrieval nor the composer.",
    clauses: nfr04Clauses,
  };

  // AC-NFR-05. Availability.
  const coldStats = cold_start.ttfb_ms;
  const healthOk = health.ok && health.corpus_version !== null && health.commit !== null;
  const healthClause: Clause = {
    clause: "GET /api/health returns SELECT 1, the active corpus version and the commit",
    state: healthOk ? "green" : "red",
    evidence: healthOk ? `ok true, corpus version ${health.corpus_version}, commit ${health.commit?.slice(0, 12)}` : "the route did not answer with ok, a corpus version and a commit",
  };
  const coldClause: Clause = { clause: `p95 first byte after an idle period under ${COLD_FIRST_BYTE_BOUND_MS} ms, instrument validated`, state: "not_proven", evidence: "" };
  if (!validation.pass) {
    coldClause.evidence = "the instrument did not validate";
  } else if (coldStats === null || coldStats.n === 0) {
    coldClause.evidence = "no cold sample was taken in this run";
  } else {
    coldClause.state = coldStats.p95 >= COLD_FIRST_BYTE_BOUND_MS ? "red" : "green";
    coldClause.evidence = `p95 ${coldStats.p95} ms, max ${coldStats.max} ms over ${coldStats.n} samples, each after ${cold_start.samples[0]?.idle_s ?? 0} s in which this probe made no request`;
  }
  const seededClause: Clause = {
    clause: "the seeded path serves with every provider unreachable",
    state: answer_lane.mode === "seeded" && answer_lane.provider_calls === 0 ? "green" : "not_proven",
    evidence:
      answer_lane.mode === "seeded"
        ? `${answer_lane.samples} answers served from storage with ${answer_lane.provider_calls} provider calls`
        : `not exercised on the deployment: ${answer_lane.skipped ?? "the lane returned no seeded packet"}. The code path is proved hermetically by src/answer/seeded.test.ts.`,
  };
  const nfr05Clauses = [healthClause, coldClause, seededClause];
  const nfr05: Verdict = {
    id: "AC-NFR-05",
    state: worstState(nfr05Clauses),
    bound: `GET /api/health returns SELECT 1, the active corpus version and the commit; p95 first byte after an idle hour under ${COLD_FIRST_BYTE_BOUND_MS} ms; the seeded path serves with every provider unreachable`,
    measured: `${healthClause.evidence}; cold ${coldClause.evidence}`,
    check: `${probe} --idle-minutes <m> --cold-samples <k>, then read cold_start`,
    note: `${cold_start.note} The keep-alive clause is a property of .github/workflows/keep-alive.yml and its run list and is judged outside this probe.`,
    clauses: nfr05Clauses,
  };

  // AC-NFR-17. Bounded loads.
  const worstRegister = worstOf(registers);
  const registerClause: Clause = { clause: `the fleet table, the register and the failure history within ${REGISTER_BOUND_MS} ms server time, instrument validated`, state: "not_proven", evidence: "" };
  if (!validation.pass) {
    registerClause.evidence = "the instrument did not validate";
  } else if (worstRegister === null) {
    registerClause.evidence = "no register route measured";
  } else {
    registerClause.state = worstRegister.ttfb_ms.p95 >= REGISTER_BOUND_MS ? "red" : "green";
    registerClause.evidence = registers.map((route) => `${route.path} ${route.rows ?? "n/a"} rows p95 ${route.ttfb_ms.p95} ms (server ${route.server_ms.p95} ms)`).join("; ");
  }
  const fixtureClause: Clause = {
    clause: "under a fixture of 10x rows",
    state: fixture_10x ? "green" : "not_proven",
    evidence: fixture_10x
      ? "measured under the 10x fixture the criterion names"
      : "no 10x fixture is seeded and this probe seeds nothing; the readings above were taken at the page-size bound the pagination contract allows (200), so each row count is every row the route can return in one response",
  };
  const nfr17Clauses = [registerClause, fixtureClause];
  const nfr17: Verdict = {
    id: "AC-NFR-17",
    state: worstState(nfr17Clauses),
    bound: `the fleet table, the register and the failure history under a fixture of 10x rows within ${REGISTER_BOUND_MS} ms server time, instrument validated`,
    measured: registerClause.evidence,
    check: `${probe}, then read the routes whose criterion is AC-NFR-17 and their row counts`,
    note: "The pagination clause (default 50, maximum 200) and the whole-corpus-in-memory clause are code properties, judged by the route tests and a code audit rather than by a timing reading.",
    clauses: nfr17Clauses,
  };

  return [nfr03, nfr04, nfr05, nfr17];
}

// ---------------------------------------------------------------------------------------------------------------
// The probe.
// ---------------------------------------------------------------------------------------------------------------

type Target = {
  id: string;
  criterion: string;
  surface: number | null;
  kind: "page" | "api" | "static";
  path: string;
  expect: number;
  needs_session: boolean;
  /** Measured with no cookie: the two routes a cold visitor and the keep-alive workflow reach without a session. */
  no_cookie?: boolean;
  rows_key?: string;
};

/**
 * The read-only surfaces of blueprint 6.2 and the routes that answer them. Nothing here mutates anything, so a run
 * changes no seeded number. Two surfaces are deliberately absent: 13 Admin, which the probe's role cannot open and
 * which is neither a typed lookup nor a register view, and the page derivative of surface 4
 * (GET /api/documents/:id/pages/:n), which serves an image one page at a time under INV-7.
 */
const TARGETS: readonly Target[] = [
  { id: "home", criterion: "AC-NFR-03", surface: 1, kind: "page", path: "/", expect: 200, needs_session: true },
  { id: "ask", criterion: "AC-NFR-03", surface: 2, kind: "page", path: "/ask", expect: 200, needs_session: true },
  { id: "ask_chip", criterion: "AC-NFR-03", surface: 2, kind: "page", path: "/ask?chip={chip}", expect: 200, needs_session: true },
  { id: "trace", criterion: "AC-NFR-03", surface: 3, kind: "page", path: "/trace/{trace}", expect: 200, needs_session: true },
  { id: "document", criterion: "AC-NFR-03", surface: 4, kind: "page", path: "/documents/{doc}", expect: 200, needs_session: true },
  { id: "assets_fleet", criterion: "AC-NFR-17", surface: 5, kind: "page", path: "/assets", expect: 200, needs_session: true },
  { id: "asset", criterion: "AC-NFR-03", surface: 5, kind: "page", path: "/assets/{tag}", expect: 200, needs_session: true },
  { id: "failures", criterion: "AC-NFR-03", surface: 6, kind: "page", path: "/failures", expect: 200, needs_session: true },
  { id: "failure_history", criterion: "AC-NFR-17", surface: 6, kind: "page", path: "/failures/{tag}", expect: 200, needs_session: true },
  { id: "coverage", criterion: "AC-NFR-03", surface: 7, kind: "page", path: "/coverage", expect: 200, needs_session: true },
  { id: "cluster", criterion: "AC-NFR-03", surface: 7, kind: "page", path: "/coverage/clusters/{cluster}", expect: 200, needs_session: true },
  { id: "drafts", criterion: "AC-NFR-03", surface: 8, kind: "page", path: "/drafts", expect: 200, needs_session: true },
  { id: "integrity_register", criterion: "AC-NFR-17", surface: 9, kind: "page", path: "/integrity", expect: 200, needs_session: true },
  { id: "evaluation", criterion: "AC-NFR-03", surface: 10, kind: "page", path: "/evaluation", expect: 200, needs_session: true },
  { id: "loop", criterion: "AC-NFR-03", surface: 11, kind: "page", path: "/demo/loop", expect: 200, needs_session: true },
  { id: "tour", criterion: "AC-NFR-03", surface: 12, kind: "page", path: "/tour", expect: 200, needs_session: true },
  { id: "login", criterion: "AC-NFR-05", surface: 14, kind: "page", path: "/login", expect: 200, needs_session: false, no_cookie: true },
  { id: "api_health", criterion: "AC-NFR-05", surface: 14, kind: "api", path: "/api/health", expect: 200, needs_session: false, no_cookie: true },
  { id: "api_assets", criterion: "AC-NFR-03", surface: 5, kind: "api", path: "/api/assets", expect: 200, needs_session: true, rows_key: "assets" },
  { id: "api_assets_bound", criterion: "AC-NFR-17", surface: 5, kind: "api", path: "/api/assets?page_size=200", expect: 200, needs_session: true, rows_key: "assets" },
  { id: "api_asset", criterion: "AC-NFR-03", surface: 5, kind: "api", path: "/api/assets/{tag}", expect: 200, needs_session: true, rows_key: "documents" },
  { id: "api_asset_failures", criterion: "AC-NFR-17", surface: 6, kind: "api", path: "/api/assets/{tag}/failures?page_size=200", expect: 200, needs_session: true, rows_key: "history" },
  { id: "api_coverage", criterion: "AC-NFR-03", surface: 7, kind: "api", path: "/api/coverage", expect: 200, needs_session: true, rows_key: "clusters" },
  { id: "api_integrity_bound", criterion: "AC-NFR-17", surface: 9, kind: "api", path: "/api/integrity?page_size=200", expect: 200, needs_session: true, rows_key: "findings" },
  { id: "api_document", criterion: "AC-NFR-03", surface: 4, kind: "api", path: "/api/documents/{doc}", expect: 200, needs_session: true },
  { id: "api_trace", criterion: "AC-NFR-03", surface: 3, kind: "api", path: "/api/trace/{trace}", expect: 200, needs_session: true },
  { id: "api_drafts", criterion: "AC-NFR-03", surface: 8, kind: "api", path: "/api/drafts", expect: 200, needs_session: true, rows_key: "drafts" },
  { id: "api_evaluation", criterion: "AC-NFR-03", surface: 10, kind: "api", path: "/api/evaluation/latest", expect: 200, needs_session: true },
];

const BASELINE_PATH = "/robots.txt";

type Options = {
  baseUrl: string;
  out: string;
  samples: number;
  askSamples: number;
  idleMinutes: number;
  coldSamples: number;
  user: string;
  question: string | null;
  trace: string | null;
  gapMs: number;
};

function options(argv: readonly string[]): Options {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== undefined && flag.startsWith("--")) {
      const next = argv[index + 1];
      flags.set(flag.slice(2), next !== undefined && !next.startsWith("--") ? next : "true");
    }
  }
  const number = (key: string, fallback: number): number => {
    const raw = flags.get(key);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${key} must be a non-negative number`);
    return value;
  };
  const baseUrl = (flags.get("base-url") ?? "").replace(/\/$/, "");
  if (baseUrl === "") throw new Error("--base-url is required");
  const out = flags.get("out") ?? "";
  if (out === "") throw new Error("--out is required (the report is a file; stdout is not the artifact)");
  return {
    baseUrl,
    out,
    samples: number("samples", 50),
    askSamples: number("ask-samples", 20),
    idleMinutes: number("idle-minutes", 0),
    coldSamples: number("cold-samples", 0),
    user: flags.get("user") ?? "engineer_demo",
    question: flags.get("question") ?? null,
    trace: flags.get("trace") ?? null,
    gapMs: number("gap-ms", 40),
  };
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const stream: AsyncIterable<Uint8Array> = process.stdin;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function sample(url: string, init: RequestInit): Promise<Sample> {
  const started = performance.now();
  const response = await fetch(url, { ...init, redirect: "manual" });
  const ttfb = performance.now() - started;
  const body = await response.arrayBuffer();
  return {
    ttfb_ms: round1(ttfb),
    total_ms: round1(performance.now() - started),
    status: response.status,
    bytes: body.byteLength,
  };
}

function countStatuses(samples: readonly Sample[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const one of samples) counts[String(one.status)] = (counts[String(one.status)] ?? 0) + 1;
  return counts;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** The first string at `key` in a depth-first walk, so a discovered id is read from the answer and never typed. */
function firstString(node: unknown, key: string): string | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = firstString(item, key);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isRecord(node)) return null;
  const direct = node[key];
  if (typeof direct === "string" && direct.length > 0) return direct;
  for (const value of Object.values(node)) {
    const found = firstString(value, key);
    if (found !== null) return found;
  }
  return null;
}

function rowCount(body: unknown, key: string | undefined): number | null {
  if (key === undefined || !isRecord(body)) return null;
  const value = body[key];
  return Array.isArray(value) ? value.length : null;
}

const decodeEntities = (text: string): string =>
  text
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The first seeded chip Home renders: its id and its question, read from the page the judge sees. */
function chipFromHome(html: string): { id: string; question: string } | null {
  const anchor = /href="\/ask\?chip=([^"&]+)"[^>]*>([^<]+)</.exec(html);
  if (anchor === null) return null;
  const id = decodeURIComponent(anchor[1] ?? "");
  const question = decodeEntities((anchor[2] ?? "").trim());
  return id === "" || question === "" ? null : { id, question };
}

type AskSample = { evidence_ms: number; complete_ms: number; status: number; mode: string | null; citations: number | null; trace_id: string | null };

/** One seeded ask, timed at the first stream line (the evidence list) and at the close of the packet line. */
async function askSample(url: string, headers: Record<string, string>, question: string): Promise<AskSample> {
  const started = performance.now();
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ question }), redirect: "manual" });
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return { evidence_ms: -1, complete_ms: round1(performance.now() - started), status: response.status, mode: null, citations: null, trace_id: null };
  }
  const decoder = new TextDecoder();
  let text = "";
  let evidenceMs = -1;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
    if (evidenceMs < 0 && text.includes("\n")) evidenceMs = round1(performance.now() - started);
  }
  const completeMs = round1(performance.now() - started);
  let mode: string | null = null;
  let citations: number | null = null;
  let traceId: string | null = null;
  for (const line of text.split("\n").filter((one) => one.trim() !== "")) {
    const parsed: unknown = JSON.parse(line);
    if (!isRecord(parsed)) continue;
    if (parsed.stage === "evidence") {
      if (Array.isArray(parsed.evidence)) citations = parsed.evidence.length;
      if (typeof parsed.trace_id === "string") traceId = parsed.trace_id;
    }
    if (parsed.stage === "packet" && isRecord(parsed.packet) && typeof parsed.packet.mode === "string") mode = parsed.packet.mode;
  }
  return { evidence_ms: evidenceMs, complete_ms: completeMs, status: response.status, mode, citations, trace_id: traceId };
}

type Report = {
  instrument: string;
  base_url: string;
  generated_at: string;
  corpus_version: string | null;
  commit: string | null;
  method: Record<string, unknown>;
  validation: Validation | null;
  routes: RouteReading[];
  answer_lane: AnswerLane | null;
  cold_start: ColdStart | null;
  criteria: Verdict[];
  error: string | null;
};

function write(file: string, report: Report): void {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeFileSync(path.resolve(file), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const opts = options(process.argv.slice(2));
  const password = (await readStdin()) || (process.env.DEMO_ENGINEER_PASSWORD ?? "");
  const report: Report = {
    instrument: "scripts/latency.ts",
    base_url: opts.baseUrl,
    generated_at: new Date().toISOString(),
    corpus_version: null,
    commit: null,
    method: {
      samples_per_route: opts.samples,
      ask_samples: opts.askSamples,
      percentile_rule: "nearest-rank, ceil(p * n)",
      server_time: `ttfb_ms minus the p50 of the empty baseline (${BASELINE_PATH}) taken in the same run; every verdict is judged on the raw ttfb, which is larger`,
      duration_header: "none: withRoute logs duration_ms server side and no response carries it, so server time is derived",
      provider_calls: 0,
      answer_lane: "the seeded path of src/answer/seeded.ts, which rebuilds both stream lines from storage and calls no provider",
      gap_ms: opts.gapMs,
      rate_limits: "9.9 limits only the ask, search, login and draft-creation routes; the read-only registers and the pages are not limited, so the samples run back to back with gap_ms between them, while the ask lane paces itself under the 30-per-minute account limit",
      surfaces_not_probed: "13 Admin (the probe's role cannot open it, and it is neither a typed lookup nor a register view) and the page derivative of surface 4, GET /api/documents/:id/pages/:n, which serves one image page at a time under INV-7",
      idle_minutes: opts.idleMinutes,
      cold_samples: opts.coldSamples,
      session: password === "" ? "none: every route needing a session is skipped" : `cookie session as ${opts.user}`,
    },
    validation: null,
    routes: [],
    answer_lane: null,
    cold_start: null,
    criteria: [],
    error: null,
  };
  write(opts.out, report);

  try {
    // Health first: the report binds to the deployment it measured.
    const healthResponse = await fetch(`${opts.baseUrl}/api/health`, { redirect: "manual" });
    const healthBody: unknown = await healthResponse.json().catch(() => null);
    const health: Health = {
      ok: isRecord(healthBody) && healthBody.ok === true,
      corpus_version: isRecord(healthBody) && typeof healthBody.corpus_version === "string" ? healthBody.corpus_version : null,
      commit: isRecord(healthBody) && typeof healthBody.commit === "string" ? healthBody.commit : null,
    };
    report.corpus_version = health.corpus_version;
    report.commit = health.commit;

    // 1. Instrument validation before any figure (AC-NFR-03).
    const baselineRun = async (): Promise<number[]> => {
      const values: number[] = [];
      for (let index = 0; index < opts.samples; index += 1) {
        const one = await sample(`${opts.baseUrl}${BASELINE_PATH}`, {});
        values.push(one.ttfb_ms);
        await delay(opts.gapMs);
      }
      return values;
    };
    await sample(`${opts.baseUrl}${BASELINE_PATH}`, {}); // one warm-up, so the connection setup is not the floor
    const validation = validateInstrument(BASELINE_PATH, await baselineRun(), await baselineRun());
    report.validation = validation;
    write(opts.out, report);

    // 2. The session and the ids every dynamic surface needs, read from the answers rather than typed.
    let cookie = "";
    if (password !== "") {
      const login = await fetch(`${opts.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: opts.user, password }),
        redirect: "manual",
      });
      if (login.status !== 200) throw new Error(`login answered ${login.status}; the probe cannot measure a session surface`);
      cookie = login.headers
        .getSetCookie()
        .map((one) => one.split(";")[0] ?? "")
        .filter((one) => one !== "")
        .join("; ");
    }
    const headers: Record<string, string> = cookie === "" ? {} : { cookie };
    const json = async (routePath: string): Promise<unknown> => {
      const response = await fetch(`${opts.baseUrl}${routePath}`, { headers, redirect: "manual" });
      return response.status === 200 ? ((await response.json().catch(() => null)) as unknown) : null;
    };

    const ids = new Map<string, string>();
    // Surface 3 needs a trace that exists. The seeded lane names its own; otherwise one is given on the command
    // line (the M1 ask probe recorded one) and nothing is invented to fill the slot.
    if (opts.trace !== null) ids.set("trace", opts.trace);
    let chipQuestion = opts.question;
    if (cookie !== "") {
      const assets = await json("/api/assets");
      const tag = firstString(assets, "tag");
      if (tag !== null) ids.set("tag", tag);
      if (tag !== null) {
        const asset = await json(`/api/assets/${encodeURIComponent(tag)}`);
        const doc = firstString(asset, "id");
        if (doc !== null) ids.set("doc", doc);
      }
      const coverage = await json("/api/coverage");
      const cluster = isRecord(coverage) && Array.isArray(coverage.clusters) ? firstString(coverage.clusters[0], "id") : null;
      if (cluster !== null) ids.set("cluster", cluster);
      const home = await fetch(`${opts.baseUrl}/`, { headers, redirect: "manual" });
      const chip = home.status === 200 ? chipFromHome(await home.text()) : null;
      if (chip !== null) {
        ids.set("chip", chip.id);
        chipQuestion = chipQuestion ?? chip.question;
      }
    }

    // 3. The answer lane, on the path that calls no provider. It also yields the trace id for surface 3.
    const answerLane: AnswerLane = {
      route: "POST /api/ask",
      samples: 0,
      mode: null,
      provider_calls: 0,
      evidence_line_ms: summarise([]),
      complete_ms: summarise([]),
      evidence_citations: null,
      skipped: null,
    };
    if (cookie === "") {
      answerLane.skipped = "skipped_unauthenticated";
    } else if (chipQuestion === null) {
      answerLane.skipped =
        "no seeded chip is stored on this deployment (Home renders the designed empty state), and a live ask would call the provider, which this probe never does";
    } else {
      const evidence: number[] = [];
      const complete: number[] = [];
      for (let index = 0; index < opts.askSamples; index += 1) {
        const one = await askSample(`${opts.baseUrl}/api/ask`, { ...headers, "content-type": "application/json" }, chipQuestion);
        if (one.status !== 200) {
          answerLane.skipped = `POST /api/ask answered ${one.status} on sample ${index + 1}`;
          break;
        }
        evidence.push(one.evidence_ms);
        complete.push(one.complete_ms);
        answerLane.mode = one.mode;
        answerLane.evidence_citations = one.citations;
        // The evidence line names the trace row this answer wrote, which is what surface 3 renders.
        if (one.trace_id !== null) ids.set("trace", one.trace_id);
        // 9.9 allows 30 asks a minute per account; the lane paces itself so a 429 never enters a percentile.
        await delay(2200);
      }
      answerLane.samples = evidence.length;
      answerLane.evidence_line_ms = summarise(evidence);
      answerLane.complete_ms = summarise(complete);
    }
    report.answer_lane = answerLane;
    write(opts.out, report);

    // 4. Every surface, in order, at the stated sample count.
    for (const target of TARGETS) {
      const missing = [...target.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").filter((key) => !ids.has(key));
      const routePath = target.path.replace(/\{(\w+)\}/g, (_all, key: string) => encodeURIComponent(ids.get(key) ?? ""));
      const reading: RouteReading = {
        id: target.id,
        criterion: target.criterion,
        surface: target.surface,
        kind: target.kind,
        method: "GET",
        path: routePath,
        samples: 0,
        status_counts: {},
        expected_status: target.expect,
        off_expectation: 0,
        ttfb_ms: summarise([]),
        total_ms: summarise([]),
        server_ms: summarise([]),
        bytes_max: 0,
        rows: null,
        skipped: null,
      };
      if (target.needs_session && cookie === "") reading.skipped = "skipped_unauthenticated";
      else if (missing.length > 0) reading.skipped = `id not discovered: ${missing.join(", ")}`;
      if (reading.skipped !== null) reading.path = target.path; // the template, never a path with an empty segment
      if (reading.skipped === null) {
        const samples: Sample[] = [];
        const sent = target.no_cookie === true ? {} : headers;
        for (let index = 0; index < opts.samples; index += 1) {
          samples.push(await sample(`${opts.baseUrl}${routePath}`, { headers: sent }));
          await delay(opts.gapMs);
        }
        reading.samples = samples.length;
        reading.status_counts = countStatuses(samples);
        reading.off_expectation = samples.filter((one) => one.status !== target.expect).length;
        reading.ttfb_ms = summarise(samples.map((one) => one.ttfb_ms));
        reading.total_ms = summarise(samples.map((one) => one.total_ms));
        reading.server_ms = summarise(serverMs(samples.map((one) => one.ttfb_ms), validation.floor_ms));
        reading.bytes_max = Math.max(...samples.map((one) => one.bytes));
        if (target.rows_key !== undefined) reading.rows = rowCount(await json(routePath), target.rows_key);
      }
      report.routes.push(reading);
      write(opts.out, report);
    }

    // 5. The cold reading (AC-NFR-05). One request per idle window, on the route that wakes the database.
    const cold: ColdStart = {
      route: "/api/health",
      samples: [],
      ttfb_ms: null,
      bound_ms: COLD_FIRST_BYTE_BOUND_MS,
      note:
        opts.coldSamples === 0
          ? "No cold sample was asked for (--cold-samples 0)."
          : `Each sample follows ${opts.idleMinutes} minutes in which this probe made no request. The criterion says an idle hour: the keep-alive workflow is scheduled to call /login every 10 minutes and /api/health every 30 minutes (D-15), so a run cannot arrange an idle hour on demand, and this reading catches the state an idle hour would reach anyway. Neon scales the compute to zero after 5 minutes with no query (D-15, verified on neon.com/docs) and the function instance is recycled on its own schedule, so a longer gap adds no further cold. What each sample cannot rule out is a keep-alive run landing inside its own window and warming the compute first, which is why every sample is listed rather than only their percentile.`,
    };
    for (let index = 0; index < opts.coldSamples; index += 1) {
      const idleMs = opts.idleMinutes * 60_000;
      await delay(idleMs);
      const one = await sample(`${opts.baseUrl}/api/health`, {});
      cold.samples.push({ idle_s: Math.round(idleMs / 1000), ttfb_ms: one.ttfb_ms, total_ms: one.total_ms, status: one.status });
      cold.ttfb_ms = summarise(cold.samples.map((reading) => reading.ttfb_ms));
      report.cold_start = cold;
      write(opts.out, report);
    }
    report.cold_start = cold;

    report.criteria = verdicts({
      validation,
      routes: report.routes,
      answer_lane: answerLane,
      cold_start: cold,
      health,
      fixture_10x: false,
      base_url: opts.baseUrl,
    });
    write(opts.out, report);
    console.log(`latency report written to ${opts.out}`);
  } catch (error) {
    // The message only: the probe never puts a value it was given into a file or a line.
    report.error = error instanceof Error ? error.message : "unknown failure";
    report.criteria = [];
    write(opts.out, report);
    process.exitCode = 1;
  }
}

// Run only when this file is the entry point: the unit test imports the pure half above and must start no probe.
const entry = process.argv[1];
if (entry !== undefined && path.resolve(entry) === path.resolve(import.meta.filename)) void main();
