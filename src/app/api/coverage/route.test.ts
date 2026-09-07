// GET /api/coverage and GET /api/coverage/clusters/:id (9.9): the ask_read column, the 401 without a session, the
// 9.5 shape validated on the way out, the designed 404 when no visible version carries coverage rows, and the
// request id echoed on every answer. Hermetic: the session, the sandbox and the console read are mocks; the values
// are the team's own synthetic figures, so no published number is retyped here.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoverageMethod, CoverageSummary, DebtCluster } from "@/contracts/generated/coverage";
import type { Role } from "@/contracts/generated/serving";
import type { ClusterPage, CoverageConsole, VersionRef } from "@/db/queries/coverage";
import { setRequest } from "../../../../tests/helpers/next-headers";
import { GET as console } from "./route";
import { GET as cluster } from "./clusters/[id]/route";

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
const box = vi.hoisted(() => ({ getSandbox: vi.fn() }));
const queries = vi.hoisted(() => ({ readCoverageConsole: vi.fn(), readCluster: vi.fn() }));

vi.mock("@/auth/session", () => ({ getSession: auth.getSession, LANDING_PATH: "/tour" }));
vi.mock("@/auth/sandbox", () => ({ getSandbox: box.getSandbox }));
vi.mock("@/db/queries/coverage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/queries/coverage")>()),
  ...queries,
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(), activeCorpusVersion: vi.fn() }));

const user = (role: Role) => ({ id: "u-1", username: "demo", alias: "alias", role, sessionId: "s-1", expiresAt: new Date(Date.now() + 3_600_000) });

const VERSION: VersionRef = { id: "cv-1", label: "v1-synthetic", is_active: true, corpus_sha256: "b".repeat(64) };

const METHOD: CoverageMethod = {
  recipe_sha256: "c".repeat(64),
  stop_list_sha256: "d".repeat(64),
  threshold: 0.62,
  window_multiplier: 2,
  min_content_words: 3,
  comparison: "uncovered when score <= threshold",
  extractor: "pdftotext -raw",
  strict_sections: ["header", "1", "2", "3", "4", "6"],
  strict_cut_marker: "This is sample data provided for CALIBER purposes only",
  labels_status: "machine_drafted_pending_human",
  unscoreable_ids: [],
};

const summary = (layer: "generous" | "strict", uncovered: number): CoverageSummary => ({
  corpus_version_id: VERSION.id,
  population: "unplanned_failure",
  layer,
  threshold: 0.62,
  uncovered_count: uncovered,
  population_count: 9,
  uncovered_breakdowns: 1,
  uncovered_downtime_hours: 2.5,
  uncovered_cost_idr: 1_000,
  bands: { no_lesson: 1, copied_row_only: 1, taught: 7 },
  sensitivity: [{ t: 0.62, uncovered_count: uncovered }],
});

const CLUSTER: DebtCluster = {
  id: "debt-SY-0101A",
  equipment_tag: "SY-0101A",
  corpus_version_id: VERSION.id,
  uncovered_wo_numbers: ["WO-SYN-0001"],
  factors: { D_hours: 2.5, D_max: 4, C_idr: 1_000, C_max: 2_000, k: 1, r: 0.5 },
  coefficients: { a: 0.4, b: 0.3, c: 0.2, d: 0.1, basis: "ASSUMPTION" },
  incomplete_uncovered: 0,
  score: 0.5,
  rank: 1,
};

const CONSOLE: CoverageConsole = {
  version: VERSION,
  method: METHOD,
  unplanned: { generous: summary("generous", 2), strict: summary("strict", 5) },
  summaries: [summary("generous", 2), summary("strict", 5)],
  clusters: [CLUSTER],
  baseline: null,
  labels: null,
};

const PAGE: ClusterPage = {
  version: VERSION,
  cluster: CLUSTER,
  clusterCount: 1,
  rows: [
    {
      wo_number: "WO-SYN-0001",
      equipment_tag: "SY-0101A",
      report_date: "2026-01-05",
      work_type: "Corrective",
      breakdown_kind: "unplanned",
      priority: "Medium",
      downtime_hours: 2.5,
      total_cost_idr: 1_000,
      closeout_complete: true,
      completeness_flags: {},
      generous: { covered: false, best_ratio: 0.1, threshold: 0.62, matched_field: null, matched_lesson: null },
      strict: { covered: false, best_ratio: 0.05, threshold: 0.62, matched_field: null, matched_lesson: null },
      adjudicated: null,
    },
  ] as ClusterPage["rows"],
  labels: null,
};

const request = (url: string) => new NextRequest(`http://localhost${url}`, { headers: { "x-request-id": "req-c" } });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  setRequest();
  auth.getSession.mockResolvedValue(user("Engineer"));
  box.getSandbox.mockResolvedValue(null);
  queries.readCoverageConsole.mockResolvedValue(CONSOLE);
  queries.readCluster.mockResolvedValue(PAGE);
});

describe("GET /api/coverage", () => {
  it("answers { method, summaries, clusters } and nothing else, private and never cached", async () => {
    const res = await console(request("/api/coverage"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-request-id")).toBe("req-c");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["clusters", "method", "summaries"]);
    expect(body.method.threshold).toBe(0.62);
    expect(body.summaries).toHaveLength(2);
    expect(body.clusters[0].coefficients.basis).toBe("ASSUMPTION");
  });

  it("serves the console of the visitor's own sandbox when the cookie names one (D-16)", async () => {
    box.getSandbox.mockResolvedValue({ corpusVersionId: "cv-sandbox" });
    await console(request("/api/coverage"), undefined);
    expect(queries.readCoverageConsole).toHaveBeenCalledWith({ corpusVersionId: "cv-sandbox" });
  });

  it("answers the designed 404 when no visible version carries coverage rows", async () => {
    queries.readCoverageConsole.mockResolvedValue(null);
    const res = await console(request("/api/coverage"), undefined);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found", entity: "coverage_summary" });
  });

  it("answers 401 without a session and never reads the console", async () => {
    auth.getSession.mockResolvedValue(null);
    const res = await console(request("/api/coverage"), undefined);
    expect(res.status).toBe(401);
    expect(queries.readCoverageConsole).not.toHaveBeenCalled();
  });

  it.each(["Engineer", "Reviewing Supervisor", "Manager", "Admin"] as const)("serves the %s role (ask_read, 9.9)", async (role) => {
    auth.getSession.mockResolvedValue(user(role));
    expect((await console(request("/api/coverage"), undefined)).status).toBe(200);
  });
});

describe("GET /api/coverage/clusters/:id", () => {
  it("answers the cluster with its assessments, both layers per work order", async () => {
    const res = await cluster(request("/api/coverage/clusters/debt-SY-0101A"), context("debt-SY-0101A"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(CLUSTER.id);
    expect(body.assessments.map((a: { layer: string }) => a.layer)).toEqual(["generous", "strict"]);
    expect(body.work_orders).toEqual([{ wo_number: "WO-SYN-0001", equipment_tag: "SY-0101A", generous: { matched_field: null, matched_lesson: null }, strict: { matched_field: null, matched_lesson: null } }]);
  });

  it("answers the designed 404 for an id no visible version carries", async () => {
    queries.readCluster.mockResolvedValue(null);
    const res = await cluster(request("/api/coverage/clusters/nope"), context("nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found", entity: "debt_cluster", id: "nope" });
  });

  it("refuses a malformed id with 400", async () => {
    const res = await cluster(request("/api/coverage/clusters/x"), context(""));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_params" });
  });

  it("answers 401 without a session and never reads the cluster", async () => {
    auth.getSession.mockResolvedValue(null);
    const res = await cluster(request("/api/coverage/clusters/debt-SY-0101A"), context("debt-SY-0101A"));
    expect(res.status).toBe(401);
    expect(queries.readCluster).not.toHaveBeenCalled();
  });
});
