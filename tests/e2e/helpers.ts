// What the specs share: the API reads that hand a test its ids (never a typed id), and the harness fixture the
// coverage figures are checked against. Nothing here types a number or an identifier of the seeded corpus: every
// expected value is read at run time from bundle/fixtures.json or from the route under test.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext } from "@playwright/test";

/** The asset every M1 spec walks; the one tag the blueprint's own examples name. */
export const TAG = "GA-1201A";

type Json = Record<string, unknown>;

/** GET a route as the signed-in engineer and fail the test, with the status and the body, on anything but 200. */
export async function getJson(api: APIRequestContext, url: string): Promise<Json> {
  const response = await api.get(url);
  expect(response.status(), `GET ${url}: ${await response.text()}`).toBe(200);
  return (await response.json()) as Json;
}

export type Citation = {
  doc_no: string;
  document_id: string;
  revision: string;
  approval_status_text: string;
  page: number;
  span_id: string;
};

export type AssetRead = {
  documents: Array<{ document: { id: string; doc_no: string | null; class: string } }>;
  citations: Record<string, Citation>;
};

/** The asset read of GET /api/assets/:tag, with its document set and the citations its chips resolve to. */
export async function readAsset(api: APIRequestContext, tag: string = TAG): Promise<AssetRead> {
  return (await getJson(api, `/api/assets/${encodeURIComponent(tag)}`)) as unknown as AssetRead;
}

/** The id of the asset's datasheet, from the API's own document set (AC-CTX-01). */
export function datasheetId(asset: AssetRead): string {
  const found = asset.documents.find((d) => d.document.class === "datasheet");
  expect(found, `no datasheet in the document set of the asset read`).toBeDefined();
  return found!.document.id;
}

/** The first debt cluster GET /api/coverage carries, in the order the route serves it. */
export async function firstClusterId(api: APIRequestContext): Promise<string> {
  const coverage = await getJson(api, "/api/coverage");
  const clusters = coverage.clusters as Array<{ id: string }>;
  expect(clusters.length, "GET /api/coverage carried no debt cluster").toBeGreaterThan(0);
  return clusters[0].id;
}

/** A trace id from one retrieval-only search call (no provider call, no model, one immutable trace row). */
export async function traceIdFromSearch(api: APIRequestContext, question: string): Promise<string> {
  const search = await getJson(api, `/api/search?q=${encodeURIComponent(question)}`);
  const id = search.trace_id;
  expect(typeof id, "GET /api/search carried no trace_id").toBe("string");
  return String(id);
}

// ---------------------------------------------------------------------------------------------------------------
// The harness fixture: the one place the expected coverage figures come from (INV-6, blueprint 10.3).
// ---------------------------------------------------------------------------------------------------------------

type FixtureLayerRow = { t: number; n: number; uncovered: number };
/** One breakdown kind of the workbook slice, as blueprint 10.5 keys it (`workbook.breakdown_kinds.<kind>`). */
type FixtureKindTotals = { rows: number; hours: number; cost_idr: number };
type Fixtures = {
  method: { threshold: number };
  coverage: { generous: Record<string, FixtureLayerRow[]>; strict: Record<string, FixtureLayerRow[]> };
  /** 10.5 `populations`: the record counts the operational-context panel reconciles its fleet column against. */
  populations: { all: number; unplanned_breakdowns: number; planned_flagged: number };
  /** 10.5 `workbook`: the rows, the breakdown split and the notification lead time the same panel prints beside. */
  workbook: {
    rows: number;
    breakdown_kinds: { unplanned: FixtureKindTotals; planned_flagged: FixtureKindTotals };
    lead_time: { median_h: number; at_least_24h: number; share: number; min_h: number; max_h: number };
  };
};

const FIXTURES_PATH =
  process.env.FIXTURES_PATH ??
  (existsSync(path.resolve(process.cwd(), "bundle/fixtures.json"))
    ? path.resolve(process.cwd(), "bundle/fixtures.json")
    : path.resolve(process.cwd(), "../thehub-harness/packages/fixtures.json"));

export function fixtures(): Fixtures {
  expect(existsSync(FIXTURES_PATH), `fixtures.json is absent at ${FIXTURES_PATH}`).toBe(true);
  return JSON.parse(readFileSync(FIXTURES_PATH, "utf8")) as Fixtures;
}

/** The headline row of one layer at the frozen threshold: { uncovered, of } as the harness scored it. */
export function headline(layer: "generous" | "strict", population = "unplanned_failure"): { uncovered: number; of: number } {
  const fx = fixtures();
  const rows = fx.coverage[layer][population];
  expect(rows, `fixtures.json carries no ${layer}.${population} ladder`).toBeDefined();
  const row = rows.find((r) => r.t === fx.method.threshold);
  expect(row, `fixtures.json carries no ${layer}.${population} row at t = ${fx.method.threshold}`).toBeDefined();
  return { uncovered: row!.uncovered, of: row!.n };
}
