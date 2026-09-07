// The latency instrument's own check (blueprint 11.9 AC-NFR-03, AC-NFR-04, AC-NFR-05, AC-NFR-17). scripts/latency.ts
// is the only thing that turns those four criteria from claims into figures, so its arithmetic and its verdict rules
// are pinned here: the percentile rule the report states, the two-empty-baseline validation and its 375 ms bound,
// the derived server time, and above all the three ways a verdict is allowed to be green. A criterion whose subject
// does not exist on the deployment today (the golden set for AC-NFR-04, a 10x fixture for AC-NFR-17) must come back
// not_proven no matter how fast the measurement was, or the instrument would launder a missing measurement into a
// pass. Nothing here touches the network: every case drives the pure half of the probe.
import { describe, expect, it } from "vitest";
import {
  COLD_FIRST_BYTE_BOUND_MS,
  NOISE_BOUND_MS,
  P95_LOOKUP_BOUND_MS,
  REGISTER_BOUND_MS,
  percentile,
  serverMs,
  summarise,
  validateInstrument,
  verdicts,
  type AnswerLane,
  type ColdStart,
  type RouteReading,
  type Validation,
  type VerdictInput,
} from "../../scripts/latency";

const flat = (value: number, n = 50): number[] => Array.from({ length: n }, () => value);

const route = (over: Partial<RouteReading> & { criterion: string; ttfb_p95: number }): RouteReading => ({
  id: over.id ?? "r",
  criterion: over.criterion,
  surface: 1,
  kind: "api",
  method: "GET",
  path: over.path ?? "/api/assets",
  samples: 50,
  status_counts: over.status_counts ?? { "200": 50 },
  expected_status: 200,
  off_expectation: over.off_expectation ?? 0,
  ttfb_ms: summarise(flat(over.ttfb_p95)),
  total_ms: summarise(flat(over.ttfb_p95 + 10)),
  server_ms: summarise(flat(Math.max(0, over.ttfb_p95 - 100))),
  bytes_max: 1024,
  rows: over.rows ?? 8,
  skipped: over.skipped ?? null,
});

const goodValidation = (): Validation => validateInstrument("/robots.txt", flat(100), flat(120));

const seededLane = (): AnswerLane => ({
  route: "POST /api/ask",
  samples: 20,
  mode: "seeded",
  provider_calls: 0,
  evidence_line_ms: summarise(flat(300, 20)),
  complete_ms: summarise(flat(320, 20)),
  evidence_citations: 12,
  skipped: null,
});

const cold = (ttfb: number, n = 3): ColdStart => ({
  route: "/api/health",
  samples: Array.from({ length: n }, () => ({ idle_s: 420, ttfb_ms: ttfb, total_ms: ttfb + 5, status: 200 })),
  ttfb_ms: summarise(flat(ttfb, n)),
  bound_ms: COLD_FIRST_BYTE_BOUND_MS,
  note: "",
});

const input = (over: Partial<VerdictInput> = {}): VerdictInput => ({
  validation: over.validation ?? goodValidation(),
  routes: over.routes ?? [route({ criterion: "AC-NFR-03", ttfb_p95: 600 }), route({ criterion: "AC-NFR-17", ttfb_p95: 800, path: "/api/integrity?page_size=200" })],
  answer_lane: over.answer_lane ?? seededLane(),
  cold_start: over.cold_start ?? cold(900),
  health: over.health ?? { ok: true, corpus_version: "v1", commit: "abcdef1234567890" },
  fixture_10x: over.fixture_10x ?? false,
  base_url: over.base_url ?? "https://example.invalid",
});

const stateOf = (id: string, given: Partial<VerdictInput> = {}): string => {
  const found = verdicts(input(given)).find((verdict) => verdict.id === id);
  if (found === undefined) throw new Error(`no verdict for ${id}`);
  return found.state;
};

describe("percentile", () => {
  it("is nearest-rank, so p95 of 1..100 is the 95th value and p50 the 50th", () => {
    const values = Array.from({ length: 100 }, (_unused, index) => index + 1);
    expect(percentile(values, 0.95)).toBe(95);
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 1)).toBe(100);
  });

  it("takes the sample as unsorted and does not mutate it", () => {
    const values = [9, 1, 5];
    expect(percentile(values, 0.5)).toBe(5);
    expect(values).toEqual([9, 1, 5]);
  });

  it("refuses an empty sample and a p outside (0, 1]", () => {
    expect(() => percentile([], 0.95)).toThrow(/empty/);
    expect(() => percentile([1, 2], 0)).toThrow(/\(0, 1]/);
    expect(() => percentile([1, 2], 1.5)).toThrow(/\(0, 1]/);
  });
});

describe("summarise", () => {
  it("reports n, min, p50, p95, max and mean rounded to a tenth", () => {
    expect(summarise([100, 200, 300, 400])).toEqual({ n: 4, min: 100, p50: 200, p95: 400, max: 400, mean: 250 });
  });

  it("returns zeros for an empty sample rather than throwing, so a skipped route still serialises", () => {
    expect(summarise([]).n).toBe(0);
  });
});

describe("serverMs", () => {
  it("subtracts the measured floor and clamps at zero", () => {
    expect(serverMs([500, 120, 90], 100)).toEqual([400, 20, 0]);
  });
});

describe("validateInstrument", () => {
  it("passes when the two empty baselines agree inside the 375 ms bound", () => {
    const validation = validateInstrument("/robots.txt", flat(100), flat(120));
    expect(validation.pass).toBe(true);
    expect(validation.noise_ms).toBe(20);
    expect(validation.bound_ms).toBe(NOISE_BOUND_MS);
    expect(validation.floor_ms).toBe(100);
  });

  it("fails at the bound and above it", () => {
    expect(validateInstrument("/robots.txt", flat(100), flat(475)).pass).toBe(false);
    expect(validateInstrument("/robots.txt", flat(100), flat(600)).pass).toBe(false);
  });

  it("fails when a baseline took no sample, so an empty run cannot read as validated", () => {
    expect(validateInstrument("/robots.txt", flat(100), []).pass).toBe(false);
    expect(validateInstrument("/robots.txt", [], []).pass).toBe(false);
  });
});

describe("AC-NFR-03, typed lookups and register views", () => {
  it("is green only on a validated instrument", () => {
    expect(stateOf("AC-NFR-03")).toBe("green");
    expect(stateOf("AC-NFR-03", { validation: validateInstrument("/robots.txt", flat(100), flat(900)) })).toBe("not_proven");
  });

  it("is red when a route reaches the 1.5 s bound", () => {
    expect(stateOf("AC-NFR-03", { routes: [route({ criterion: "AC-NFR-03", ttfb_p95: P95_LOOKUP_BOUND_MS })] })).toBe("red");
    expect(stateOf("AC-NFR-03", { routes: [route({ criterion: "AC-NFR-03", ttfb_p95: P95_LOOKUP_BOUND_MS - 1 })] })).toBe("green");
  });

  it("is red when a route answered off its expected status, however fast it answered", () => {
    const off = route({ criterion: "AC-NFR-03", ttfb_p95: 80, off_expectation: 3, status_counts: { "200": 47, "500": 3 } });
    expect(stateOf("AC-NFR-03", { routes: [off] })).toBe("red");
  });

  it("is not proven when every route was skipped for want of a session", () => {
    const skipped = route({ criterion: "AC-NFR-03", ttfb_p95: 0, skipped: "skipped_unauthenticated" });
    expect(stateOf("AC-NFR-03", { routes: [skipped] })).toBe("not_proven");
  });
});

describe("AC-NFR-04, composed answers", () => {
  it("is never green from this probe: the composed-packet figure belongs to the golden set", () => {
    expect(stateOf("AC-NFR-04")).toBe("not_proven");
    const fast = seededLane();
    fast.evidence_line_ms = summarise(flat(5, 20));
    fast.complete_ms = summarise(flat(6, 20));
    expect(stateOf("AC-NFR-04", { answer_lane: fast })).toBe("not_proven");
  });

  it("names the lane it measured as the one that makes no provider call", () => {
    const verdict = verdicts(input()).find((one) => one.id === "AC-NFR-04");
    expect(verdict?.measured).toContain("without a provider call");
    expect(verdict?.measured).toContain("seeded");
  });
});

describe("AC-NFR-05, availability", () => {
  it("is green with a validated instrument, a healthy route, a cold reading inside 3 s and a seeded answer", () => {
    expect(stateOf("AC-NFR-05")).toBe("green");
  });

  it("is red at or above the 3 s first-byte bound", () => {
    expect(stateOf("AC-NFR-05", { cold_start: cold(COLD_FIRST_BYTE_BOUND_MS) })).toBe("red");
    expect(stateOf("AC-NFR-05", { cold_start: cold(COLD_FIRST_BYTE_BOUND_MS - 1) })).toBe("green");
  });

  it("is red when health did not carry the corpus version and the commit", () => {
    expect(stateOf("AC-NFR-05", { health: { ok: true, corpus_version: null, commit: "abc" } })).toBe("red");
    expect(stateOf("AC-NFR-05", { health: { ok: false, corpus_version: "v1", commit: "abc" } })).toBe("red");
  });

  it("is not proven with no cold sample, and not proven while the seeded lane was not exercised", () => {
    const none: ColdStart = { route: "/api/health", samples: [], ttfb_ms: null, bound_ms: COLD_FIRST_BYTE_BOUND_MS, note: "" };
    expect(stateOf("AC-NFR-05", { cold_start: none })).toBe("not_proven");
    const live = seededLane();
    live.mode = "live";
    expect(stateOf("AC-NFR-05", { answer_lane: live })).toBe("not_proven");
    const unmeasured = seededLane();
    unmeasured.skipped = "skipped_unauthenticated";
    unmeasured.mode = null;
    expect(stateOf("AC-NFR-05", { answer_lane: unmeasured })).toBe("not_proven");
  });
});

describe("AC-NFR-17, bounded loads", () => {
  it("stays not proven while no 10x fixture is seeded, however far inside the bound the reading is", () => {
    const verdict = verdicts(input({ routes: [route({ criterion: "AC-NFR-17", ttfb_p95: 40 })] })).find((one) => one.id === "AC-NFR-17");
    expect(verdict?.state).toBe("not_proven");
    expect(verdict?.measured).toContain("rows");
    const clauses = verdict?.clauses ?? [];
    expect(clauses.find((one) => one.clause.includes("5000 ms server time"))?.state).toBe("green");
    const fixture = clauses.find((one) => one.clause.includes("10x rows"));
    expect(fixture?.state).toBe("not_proven");
    expect(fixture?.evidence).toContain("no 10x fixture is seeded");
  });

  it("is green only once the fixture the criterion names exists", () => {
    expect(stateOf("AC-NFR-17", { fixture_10x: true })).toBe("green");
  });

  it("is red at or above the 5 s bound whether or not the fixture exists", () => {
    const slow = [route({ criterion: "AC-NFR-17", ttfb_p95: REGISTER_BOUND_MS })];
    expect(stateOf("AC-NFR-17", { routes: slow, fixture_10x: true })).toBe("red");
    expect(stateOf("AC-NFR-17", { routes: slow, fixture_10x: false })).toBe("red");
  });
});

describe("the report shape", () => {
  it("carries one verdict per criterion, each with the check a reader can run", () => {
    const all = verdicts(input());
    expect(all.map((one) => one.id)).toEqual(["AC-NFR-03", "AC-NFR-04", "AC-NFR-05", "AC-NFR-17"]);
    for (const one of all) {
      expect(one.check.length).toBeGreaterThan(0);
      expect(one.bound.length).toBeGreaterThan(0);
      expect(one.measured.length).toBeGreaterThan(0);
      expect(one.clauses.length).toBeGreaterThan(0);
      for (const clause of one.clauses) expect(clause.evidence.length).toBeGreaterThan(0);
    }
  });

  it("takes the weakest clause as the state of the criterion", () => {
    const nfr05 = verdicts(input()).find((one) => one.id === "AC-NFR-05");
    expect(nfr05?.state).toBe("green");
    const live = seededLane();
    live.mode = "live";
    const weakened = verdicts(input({ answer_lane: live })).find((one) => one.id === "AC-NFR-05");
    expect(weakened?.clauses.map((one) => one.state)).toEqual(["green", "green", "not_proven"]);
    expect(weakened?.state).toBe("not_proven");
  });

  it("keeps the instrument validation as a clause of AC-NFR-03, so an unvalidated run reports no figure as green", () => {
    const noisy = verdicts(input({ validation: validateInstrument("/robots.txt", flat(100), flat(900)) })).find((one) => one.id === "AC-NFR-03");
    expect(noisy?.clauses[0]?.state).toBe("not_proven");
    expect(noisy?.clauses[1]?.evidence).toContain("did not validate");
    expect(noisy?.state).toBe("not_proven");
  });
});
