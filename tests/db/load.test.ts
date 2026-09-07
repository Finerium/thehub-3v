// AC-NFR-17, the tenfold clause (blueprint 11.9): "the fleet table, the register and the failure history render
// under a fixture of 10x rows without exceeding a 5 s server time (instrument-validated)". The other two clauses
// of the criterion (every list endpoint paginates, default 50 and maximum 200; no route loads the whole corpus
// into memory) are code properties the route tests and the code audit already judge. This file is the missing
// half: it builds the tenfold fixture (scripts/load-fixture.ts) in a disposable database, points a validated
// instrument at the three surfaces, and asserts the bound.
//
// How to run it. The `db` project of vitest.config.ts, against the pgvector + local Neon proxy pair the seed job
// of .github/workflows/ci.yml uses, migrated and seeded from a bundle:
//
//   NEON_LOCAL_PROXY=localhost:4444 NODE_OPTIONS="--import $PWD/tests/db/neon-local.mjs" \
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/thehub \
//   pnpm exec vitest run --project db tests/db/load.test.ts
//
// It skips itself when TEST_DATABASE_URL is absent or names anything but a disposable host, exactly as
// tests/db/seed.test.ts does, so the deployment's database can never be multiplied. Set LOAD_REPORT to a path to
// keep the reading as JSON.
//
// What "server time" means here, and which layer each surface was measured through.
//   All three surfaces are measured through their OWN QUERY LAYER: readFleet, listFindings and assetFailureMemory,
//   the reads the three server components await. That is the layer the row count acts on, it is the only layer a
//   disposable database can be pointed at from this lane, and it is the layer that would have to be named if the
//   bound were exceeded. The three routes that serve the same surfaces are ALSO measured, by invoking their
//   exported GET handler in process with a real signed session: that adds the authorisation read, the Zod
//   validation of 9.3 on every row and the JSON serialisation of the page, which is the rest of the server's
//   work. Neither leg is an HTTP request over a socket, and this file claims none: the transport leg of the same
//   three routes is scripts/latency.ts's job against the deployment, which reads the seeded database rather than
//   a fixture and therefore cannot answer the tenfold clause at all.
//
//   The instrument is the one scripts/latency.ts defines, imported rather than restated: two independent
//   baselines over the cheapest round trip this driver can make (`select 1`, which runs no plan of ours),
//   validateInstrument to check that their p95 agree inside NOISE_BOUND_MS, serverMs to subtract the measured
//   driver and transport floor from every reading, and the nearest-rank percentiles of summarise. Every clause is
//   also judged on the raw elapsed time, which is the derived figure plus that floor and can only be larger, so a
//   pass here passes under either reading.
import { writeFileSync } from "node:fs";
import { and, asc, count, desc, eq, notLike, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, signSessionId } from "@/auth/cookie";
import { getSandbox, visibleVersionIds } from "@/auth/sandbox";
import { db } from "@/db/client";
import { readFleet } from "@/db/queries/assets";
import { assetFailureMemory, preferenceOrder } from "@/db/queries/failures";
import { listFindings, registerVersion } from "@/db/queries/integrity";
import { appUser, integrityFinding, session, workOrder } from "@/db/schema";
import {
  NOISE_BOUND_MS,
  REGISTER_BOUND_MS,
  serverMs,
  summarise,
  validateInstrument,
  type Stats,
  type Validation,
} from "../../scripts/latency";
import { COPIES, MARKER, clear, counts, disposable, multiply, type TableCount } from "../../scripts/load-fixture";
import { setRequest } from "../helpers/next-headers";

const url = process.env.TEST_DATABASE_URL;
const runnable = disposable(url);
if (url && !runnable) {
  console.warn(
    "tests/db/load skipped: TEST_DATABASE_URL must name a disposable database (localhost, 127.0.0.1 or db.localtest.me); it does not",
  );
}

/** Enough readings for a nearest-rank p95 to mean the worst of the run rather than an average over a warm cache. */
const SAMPLES = 7;

/** The widest page the pagination contract of 9.9 allows, which is the widest page a surface can render. */
const MAX_PAGE_SIZE = 200;

type Reading = {
  id: string;
  layer: "query" | "route";
  what: string;
  /** The rows the reading returned, so no figure is reported without the load that produced it. */
  rows: number;
  elapsed_ms: Stats;
  server_ms: Stats;
  bound_ms: number;
  pass: boolean;
};

const readings: Reading[] = [];
let floorMs = 0;

/** Runs `work` SAMPLES times, records the reading beside its row count, and hands back the last result. */
async function measure<T>(
  id: string,
  layer: Reading["layer"],
  what: string,
  rowsOf: (value: T) => number,
  work: () => Promise<T>,
): Promise<{ value: T; reading: Reading }> {
  const elapsed: number[] = [];
  let last: T | undefined;
  for (let i = 0; i < SAMPLES; i += 1) {
    const started = performance.now();
    last = await work();
    elapsed.push(performance.now() - started);
  }
  const value = last as T;
  const stats = summarise(elapsed);
  const reading: Reading = {
    id,
    layer,
    what,
    rows: rowsOf(value),
    elapsed_ms: stats,
    server_ms: summarise(serverMs(elapsed, floorMs)),
    bound_ms: REGISTER_BOUND_MS,
    pass: stats.p95 < REGISTER_BOUND_MS,
  };
  readings.push(reading);
  return { value, reading };
}

/** The message a failed bound prints: the figure, the load that produced it, and the read that costs the time. */
const verdict = (reading: Reading): string =>
  `${reading.what}: p95 ${reading.elapsed_ms.p95} ms (server ${reading.server_ms.p95} ms) over ${reading.rows} rows, bound ${reading.bound_ms} ms`;

/** One `select 1` round trip: the empty baseline of this lane, the analogue of latency.ts's /robots.txt. */
async function baseline(n: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const started = performance.now();
    await db.execute(sql`select 1`);
    out.push(performance.now() - started);
  }
  return out;
}

describe.skipIf(!runnable)("AC-NFR-17: the three surfaces under a tenfold fixture", () => {
  const userId = "load-fixture-engineer";
  const sessionId = "load-fixture-session";
  let rowCounts: TableCount[] = [];
  let versionIds: string[] = [];
  let registerVersionId: string | null = null;
  let heaviestTag = "";
  let heaviestRecords = 0;
  /** Findings the register lists before the fixture: one version, observation rules excluded (they sit outside the total). */
  let seededRegisterFindings = 0;
  let validation: Validation | null = null;

  const totalOf = (table: string): number => rowCounts.find((row) => row.table === table)?.total ?? -1;

  beforeAll(async () => {
    rowCounts = await multiply(COPIES);

    // A real session for the route leg: the shape tests/db/seed.test.ts uses to reach a route handler.
    await db
      .insert(appUser)
      .values({ id: userId, alias: "LOAD-ENGINEER", role: "Engineer", username: userId, passwordHash: "no-login", isDemo: false, lastLogin: null })
      .onConflictDoNothing();
    await db
      .insert(session)
      .values({ id: sessionId, userId, createdAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000), reviewerLinkId: null })
      .onConflictDoNothing();
    setRequest({ cookies: { [SESSION_COOKIE]: signSessionId(sessionId) }, headers: { "x-request-id": "req-load-fixture" } });

    versionIds = preferenceOrder(await visibleVersionIds(await getSandbox(await cookies())), null);
    registerVersionId = await registerVersion(versionIds);

    // The failure history is a per-asset surface, so it is read on the asset carrying the most records: the worst
    // line of the fixture, never an average one.
    const [heaviest] = await db
      .select({ tag: workOrder.equipmentTag, n: count() })
      .from(workOrder)
      .groupBy(workOrder.equipmentTag)
      .orderBy(desc(count()), asc(workOrder.equipmentTag))
      .limit(1);
    heaviestTag = heaviest?.tag ?? "";
    heaviestRecords = heaviest?.n ?? 0;

    // The register's own listing excludes the two observation rules, so its total is not the finding table's; the
    // seeded half is counted here by the absence of the fixture marker, and the listing must be ten times it.
    const [seededRegister] = await db
      .select({ n: count() })
      .from(integrityFinding)
      .where(
        and(
          eq(integrityFinding.corpusVersionId, registerVersionId ?? ""),
          eq(integrityFinding.observationOnly, false),
          notLike(integrityFinding.id, `%${MARKER}%`),
        ),
      );
    seededRegisterFindings = seededRegister?.n ?? 0;

    // Instrument validation first: nothing below is judged while the two baselines disagree.
    validation = validateInstrument("select 1", await baseline(SAMPLES), await baseline(SAMPLES));
    floorMs = validation.floor_ms;
  }, 600_000);

  afterAll(async () => {
    const report = {
      criterion: "AC-NFR-17",
      copies: COPIES,
      samples: SAMPLES,
      page_size: MAX_PAGE_SIZE,
      bound_ms: REGISTER_BOUND_MS,
      heaviest_asset: { tag: heaviestTag, records: heaviestRecords },
      register_findings_listed: seededRegisterFindings * (COPIES + 1),
      validation,
      row_counts: rowCounts,
      readings,
    };
    console.log(`AC-NFR-17 load reading\n${JSON.stringify(report, null, 2)}`);
    const out = process.env.LOAD_REPORT;
    if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

    await db.delete(session).where(eq(session.id, sessionId));
    await db.delete(appUser).where(eq(appUser.id, userId));
    await clear();
  }, 600_000);

  it("the fixture holds ten times the seeded rows of every table the three surfaces list", () => {
    expect(rowCounts.length).toBeGreaterThan(0);
    for (const row of rowCounts) {
      expect(row.cloned, `${row.table} clones`).toBe(row.seeded * COPIES);
      expect(row.total, `${row.table} total`).toBe(row.seeded * (COPIES + 1));
    }
  });

  it("the instrument validates before any reading is judged", () => {
    expect(validation).not.toBeNull();
    const v = validation as Validation;
    expect(v.pass, `two empty baselines over ${v.route} disagree by ${v.noise_ms} ms, bound ${NOISE_BOUND_MS} ms`).toBe(true);
  });

  it("the fleet table reads every register line within the bound", async () => {
    const { value: fleet, reading } = await measure("fleet_table", "query", "src/db/queries/assets.ts readFleet", (f) => f.rows.length, () =>
      readFleet(),
    );
    // The register is one line per asset and the fixture multiplied the assets, so the read itself is the load.
    expect(fleet.rows.length).toBe(totalOf("equipment"));
    expect(fleet.totals.work_orders).toBe(totalOf("work_order"));
    expect(reading.pass, verdict(reading)).toBe(true);
  });

  it("the Integrity Register reads its widest page within the bound", async () => {
    expect(registerVersionId).not.toBeNull();
    const versionId = registerVersionId as string;
    const { value: page, reading } = await measure(
      "integrity_register",
      "query",
      "src/db/queries/integrity.ts listFindings",
      (p) => p.rows.length,
      () => listFindings({}, versionId, 1, MAX_PAGE_SIZE),
    );
    // The pagination clause under the tenfold fixture: the window bounds the rows read, the total does not.
    expect(page.rows.length).toBe(MAX_PAGE_SIZE);
    expect(page.total).toBe(seededRegisterFindings * (COPIES + 1));
    expect(reading.pass, verdict(reading)).toBe(true);
  });

  it("the failure history of the heaviest asset reads its widest page within the bound", async () => {
    expect(heaviestTag).not.toBe("");
    const { value: memory, reading } = await measure(
      "failure_history",
      "query",
      "src/db/queries/failures.ts assetFailureMemory",
      (m) => m?.history.length ?? 0,
      () => assetFailureMemory(heaviestTag, {}, versionIds, 1, MAX_PAGE_SIZE),
    );
    expect(memory).not.toBeNull();
    expect(memory?.history_total).toBe(heaviestRecords);
    expect(memory?.history.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    expect(reading.pass, verdict(reading)).toBe(true);
  });

  it("the three routes that serve those surfaces answer within the bound", async () => {
    const { GET: assets } = await import("@/app/api/assets/route");
    const { GET: integrity } = await import("@/app/api/integrity/route");
    const { GET: failures } = await import("@/app/api/assets/[tag]/failures/route");
    const at = (route: string): NextRequest => new NextRequest(new URL(route, "https://load.test"));

    const fleet = await measure<{ assets: unknown[]; totals: { assets: number } }>(
      "api_assets",
      "route",
      "GET /api/assets?page_size=200",
      (body) => body.assets.length,
      async () => {
        const response = await assets(at(`/api/assets?page_size=${MAX_PAGE_SIZE}`), undefined);
        expect(response.status).toBe(200);
        return (await response.json()) as { assets: unknown[]; totals: { assets: number } };
      },
    );
    // This route pages in memory: readFleet returns every line and the handler slices it. The window still bounds
    // what leaves, and the read it bounds is one row per asset, never the corpus.
    expect(fleet.value.assets.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    expect(fleet.value.totals.assets).toBe(totalOf("equipment"));

    const register = await measure<{ findings: unknown[]; total: number }>(
      "api_integrity",
      "route",
      "GET /api/integrity?page_size=200",
      (body) => body.findings.length,
      async () => {
        const response = await integrity(at(`/api/integrity?page_size=${MAX_PAGE_SIZE}`), undefined);
        expect(response.status).toBe(200);
        return (await response.json()) as { findings: unknown[]; total: number };
      },
    );
    expect(register.value.findings.length).toBe(MAX_PAGE_SIZE);
    expect(register.value.total).toBe(seededRegisterFindings * (COPIES + 1));

    const history = await measure<{ history: unknown[] }>(
      "api_asset_failures",
      "route",
      "GET /api/assets/:tag/failures?page_size=200",
      (body) => body.history.length,
      async () => {
        const response = await failures(at(`/api/assets/${heaviestTag}/failures?page_size=${MAX_PAGE_SIZE}`), {
          params: Promise.resolve({ tag: heaviestTag }),
        });
        expect(response.status).toBe(200);
        return (await response.json()) as { history: unknown[] };
      },
    );
    expect(history.value.history.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);

    for (const reading of [fleet.reading, register.reading, history.reading]) {
      expect(reading.pass, verdict(reading)).toBe(true);
    }
  });

  it("clearing the fixture leaves no marked row behind", async () => {
    expect((await counts()).some((row) => row.cloned > 0)).toBe(true);
    for (const row of await clear()) expect(row.cloned, `${row.table} clones after clear`).toBe(0);
  }, 600_000);
});
