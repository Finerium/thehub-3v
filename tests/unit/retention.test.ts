// scripts/db/retention.ts (D-20, ARCHITECTURE 3.3 and 10, AC-NFR-07): the owner's nightly DELETE. General audit
// events older than 30 days go and the two safety actions never; rate-limit windows older than one hour and expired
// sessions go; nothing else is touched; only counts are printed; the script refuses to run as the application
// role. The script runs at import, so each case resets the module registry and imports it afresh; the driver and
// the Drizzle factory are mocks, and the factory hands back this file's own fake client, so the statements land in
// the recorder this file reads (a dynamic import inside the factory would mint a second recorder after the reset).
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { argOf, db as fakeDb, queueResult, resetFakeDb, statements } from "../helpers/fake-db-client";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
holder.db = fakeDb;

vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn(() => ({ driver: "mocked" })) }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: vi.fn(() => holder.db) }));

const OWNER_URL = "postgresql://owner_for_this_test:nothing@localhost:5432/none";
const APP_ROLE_URL = "postgresql://thehub_app:nothing@localhost:5432/none";
const SAFETY_ACTIONS = ["safety.request_refused", "safety.request_served"];

const compile = (fragment: unknown) => new PgDialect().sqlToQuery(fragment as SQL);
const tableOf = (statement: (typeof statements)[number] | undefined) =>
  statement?.[0]?.method === "delete" ? getTableName(statement[0].args[0] as Parameters<typeof getTableName>[0]) : undefined;

let logged: string[];
let errored: string[];
let exits: unknown[];

async function runScript(url: string) {
  process.env.DATABASE_URL_UNPOOLED = url;
  vi.resetModules();
  await import("../../scripts/db/retention");
  await vi.waitFor(() => expect(logged.length + errored.length).toBeGreaterThan(0));
}

function queueCounts(audit: number, windows: number, sessions: number) {
  queueResult({ rowCount: audit });
  queueResult({ rowCount: windows });
  queueResult({ rowCount: sessions });
}

beforeEach(() => {
  resetFakeDb();
  logged = [];
  errored = [];
  exits = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void errored.push(args.map(String).join(" ")));
  vi.spyOn(process, "exit").mockImplementation(((code?: unknown) => void exits.push(code)) as never);
});

afterEach(() => {
  delete process.env.DATABASE_URL_UNPOOLED;
});

describe("pnpm db:retention", () => {
  it("deletes general audit events older than 30 days and never the two safety actions", async () => {
    queueCounts(2, 5, 1);
    await runScript(OWNER_URL);

    const [audit] = statements;
    expect(tableOf(audit)).toBe("audit_log");
    const where = compile(argOf(audit!, "where"));
    expect(where.sql).toBe('("audit_log"."server_ts" < now() - make_interval(days => $1) and "audit_log"."action" not in ($2, $3))');
    expect(where.params).toEqual([30, ...SAFETY_ACTIONS]);
  });

  it("deletes rate-limit windows older than one hour and sessions past expires_at, and nothing else", async () => {
    queueCounts(0, 0, 0);
    await runScript(OWNER_URL);

    expect(statements.map(tableOf)).toEqual(["audit_log", "rate_limit_counter", "session"]);
    const windows = compile(argOf(statements[1]!, "where"));
    expect(windows.sql).toBe('"rate_limit_counter"."window_start" < now() - make_interval(hours => $1)');
    expect(windows.params).toEqual([1]);
    const sessions = compile(argOf(statements[2]!, "where"));
    expect(sessions.sql).toBe('"session"."expires_at" < now()');
    const methods = statements.flat().map((c) => c.method);
    expect(methods).not.toContain("update");
    expect(methods).not.toContain("insert");
  });

  it("prints counts only and exits clean", async () => {
    queueCounts(2, 5, 1);
    await runScript(OWNER_URL);

    expect(logged).toEqual(["audit_log deleted 2\nrate_limit_counter deleted 5\nsession deleted 1"]);
    expect(errored).toEqual([]);
    expect(exits).toEqual([]);
  });

  it("refuses to run as thehub_app before any statement", async () => {
    await runScript(APP_ROLE_URL);
    expect(errored).toEqual(["db:retention failed: refusing to run as thehub_app; retention runs as the owner"]);
    expect(exits).toEqual([1]);
    expect(statements).toHaveLength(0);
  });

  it("fails without DATABASE_URL_UNPOOLED, naming the variable and never a value", async () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    vi.resetModules();
    await import("../../scripts/db/retention");
    await vi.waitFor(() => expect(errored).toHaveLength(1));
    expect(errored).toEqual(["db:retention failed: DATABASE_URL_UNPOOLED is not set"]);
    expect(exits).toEqual([1]);
    expect(statements).toHaveLength(0);
  });
});
