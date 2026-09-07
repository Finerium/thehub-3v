// The JSON snapshot the export embeds (blueprint 9.12: { corpus_version, packets, drafts, traces, register,
// evaluation_run, assets, coverage, fixtures_subset }), pulled through the product's own API with a build-time
// session, plus the fixture slice read from the same file the application reads (src/lib/fixtures.ts, bundle/
// fixtures.json). Nothing here composes a figure: every value in the snapshot is a response body or a fixture key.
//
// No route exists for the sake of this file. The eight database-backed pieces are the answers of routes the product
// already serves under `ask_read` and `view_drafts`, so the export adds no bulk corpus route to the deployment
// (INV-7, blueprint 6.2 surface 4: "no bulk route"), and the packets are the `packet` field of the stored
// answer_trace rows that GET /api/trace/:id already returns.
//
// The password is read from the environment and handed straight to the request body. It is never logged, never put
// on a command line and never written to any file this build produces.
import { readFileSync } from "node:fs";
import path from "node:path";

/** The build-time demo account of scripts/db/seed-m0.ts; `ask_read` and `view_drafts`, nothing else. */
const USERNAME = "engineer_demo";
const PASSWORD_ENV = "DEMO_ENGINEER_PASSWORD";

/** The fixture the application binds its numbers to (src/lib/fixtures.ts resolves the same two paths). */
export const FIXTURES_PATH =
  process.env.FIXTURES_PATH ?? path.resolve(process.cwd(), "bundle/fixtures.json");

/**
 * The fixture keys the exported surfaces show a number from (blueprint 10.5). The whole file is 426 kB and most of
 * it is per-record scoring the export never renders; this list is the slice a reader can check a shown figure
 * against. Trimming it is the first byte-budget lever, and the build reports its size.
 */
export const FIXTURE_KEYS = [
  "meta",
  "inventory",
  "method",
  "coverage",
  "coverage_bands",
  "coverage_by_tag",
  "coverage_by_work_type",
  "populations",
  "population_ids",
  "integrity",
  "golden",
  "dates",
  "demo",
  "demo_wo",
  "debt",
] as const;

export type SessionCookies = {
  /** The Cookie header for the snapshot's own fetches. */
  header: string;
  /** The same cookies as Playwright takes them, for the capture's browser context. */
  browser: Array<{ name: string; value: string; url: string }>;
};

/** The snapshot of 9.12, in the order the contract names it. */
export type Snapshot = {
  corpus_version: unknown;
  packets: unknown[];
  drafts: unknown;
  traces: unknown[];
  register: unknown;
  evaluation_run: unknown;
  assets: unknown;
  coverage: unknown;
  fixtures_subset: Record<string, unknown>;
};

/** A route that answered something other than 200; kept in the snapshot instead of an invented body. */
type Unavailable = { unavailable: true; route: string; status: number };

function unavailable(route: string, status: number): Unavailable {
  return { unavailable: true, route, status };
}

/**
 * POST /api/auth/login as the demo Engineer and keep the session cookies the platform returns. A failure names the
 * status and the base URL and nothing else: the body of a failed login carries no credential and is not read.
 */
export async function signIn(baseUrl: string): Promise<{ alias: string; cookies: SessionCookies }> {
  const password = process.env[PASSWORD_ENV];
  if (!password) {
    throw new Error(`${PASSWORD_ENV} is not set in the environment (run the build through the dotenv wrapper)`);
  }
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password }),
  });
  if (!response.ok) throw new Error(`login as ${USERNAME} answered ${response.status} at ${baseUrl}`);
  const body = (await response.json()) as { alias?: unknown };
  const alias = typeof body.alias === "string" ? body.alias : "";
  if (!alias) throw new Error("login answered 200 without an alias");

  const pairs = response.headers
    .getSetCookie()
    .map((line) => line.split(";", 1)[0] ?? "")
    .filter((pair) => pair.includes("="));
  if (pairs.length === 0) throw new Error("login answered 200 without a session cookie");

  return {
    alias,
    cookies: {
      header: pairs.join("; "),
      browser: pairs.map((pair) => {
        const cut = pair.indexOf("=");
        return { name: pair.slice(0, cut).trim(), value: pair.slice(cut + 1), url: baseUrl };
      }),
    },
  };
}

/** GET a JSON route with the build session; a non-200 is recorded as unavailable rather than replaced. */
export async function getJson(baseUrl: string, route: string, cookies: SessionCookies): Promise<unknown> {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: { cookie: cookies.header, accept: "application/json" },
  });
  if (!response.ok) return unavailable(route, response.status);
  return (await response.json()) as unknown;
}

/** GET the bytes of a route with the build session (a page derivative), or null when it does not answer 200. */
export async function getBytes(
  baseUrl: string,
  route: string,
  cookies: SessionCookies,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const response = await fetch(`${baseUrl}${route}`, { headers: { cookie: cookies.header } });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
}

/** The fixture slice, read from the file the application reads. A missing file fails the build with the path named. */
export function fixturesSubset(): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(FIXTURES_PATH, "utf8");
  } catch {
    throw new Error(`fixtures.json is absent at ${FIXTURES_PATH}; the export cannot bind a number without it`);
  }
  const all = JSON.parse(raw) as Record<string, unknown>;
  const subset: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const key of FIXTURE_KEYS) {
    if (key in all) subset[key] = all[key];
    else missing.push(key);
  }
  if (missing.length > 0) throw new Error(`fixtures.json holds no ${missing.join(", ")}`);
  return subset;
}

/**
 * The seven database-backed pieces that need no id. `/api/health` carries the active corpus version; the other six
 * are the read routes of 9.9 the demo Engineer holds.
 */
export async function pullBase(
  baseUrl: string,
  cookies: SessionCookies,
): Promise<Omit<Snapshot, "packets" | "traces">> {
  const [corpus_version, coverage, assets, register, evaluation_run, drafts] = await Promise.all([
    getJson(baseUrl, "/api/health", cookies),
    getJson(baseUrl, "/api/coverage", cookies),
    getJson(baseUrl, "/api/assets", cookies),
    getJson(baseUrl, "/api/integrity", cookies),
    getJson(baseUrl, "/api/evaluation/latest", cookies),
    getJson(baseUrl, "/api/drafts", cookies),
  ]);
  return { corpus_version, coverage, assets, register, evaluation_run, drafts, fixtures_subset: fixturesSubset() };
}

/**
 * The traces the export shows, and the packets inside them. The ids are the ones the captured Ask surfaces link to,
 * so the snapshot can name no trace the file does not also render.
 */
export async function pullTraces(
  baseUrl: string,
  cookies: SessionCookies,
  ids: readonly string[],
): Promise<{ traces: unknown[]; packets: unknown[] }> {
  const traces: unknown[] = [];
  const packets: unknown[] = [];
  for (const id of ids) {
    const replay = await getJson(baseUrl, `/api/trace/${encodeURIComponent(id)}`, cookies);
    traces.push(replay);
    // GET /api/trace/:id answers the stored AnswerTrace itself (9.7), whose `packet` is the evidence packet 9.12
    // names beside it; a route that did not answer 200 is the `unavailable` marker and carries no packet.
    const packet = (replay as { packet?: unknown } | null)?.packet;
    if (packet !== undefined) packets.push(packet);
  }
  return { traces, packets };
}
