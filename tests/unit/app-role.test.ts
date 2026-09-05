// scripts/db/app-role.ts (D-20, ARCHITECTURE 3.3 and 10, AC-NFR-07): the owner creates or rotates the application
// role thehub_app, grants USAGE on public and draft, the four table privileges on every table of both and on future
// tables, USAGE on sequences, then revokes UPDATE and DELETE on public.audit_log only. The password travels as a
// bound parameter to Postgres, which quotes it (format('%L')); the raw value never appears in a statement text and
// nothing but the summary is printed. The script runs at import; the driver is a recorder that answers each query
// from its text.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recorder = vi.hoisted(() => {
  const state = { queries: [] as Array<{ text: string; params: unknown[] | undefined }>, roleExists: false };
  const query = async (text: string, params?: unknown[]) => {
    state.queries.push({ text, params });
    if (text.startsWith("select format('%L'")) return [{ lit: "'quoted-by-postgres'" }];
    if (text.startsWith("select exists(")) return [{ exists: state.roleExists }];
    if (text.startsWith("select count(*)")) return [{ n: 12 }];
    if (text.startsWith("select privilege_type")) return [{ privilege_type: "INSERT" }, { privilege_type: "SELECT" }];
    return [];
  };
  return { state, query };
});

vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn(() => ({ query: recorder.query })) }));

const OWNER_URL = "postgresql://owner_for_this_test:nothing@localhost:5432/none";
const RAW_PASSWORD = "raw-password-from-the-environment";
const ROLE = "thehub_app";

let logged: string[];
let errored: string[];
let exits: unknown[];

const texts = () => recorder.state.queries.map((q) => q.text);
const startingWith = (prefix: string) => texts().filter((t) => t.startsWith(prefix));

async function runScript() {
  vi.resetModules();
  await import("../../scripts/db/app-role");
  await vi.waitFor(() => expect(logged.length + errored.length).toBeGreaterThan(0));
}

beforeEach(() => {
  recorder.state.queries.length = 0;
  recorder.state.roleExists = false;
  process.env.DATABASE_URL_UNPOOLED = OWNER_URL;
  process.env.APP_ROLE_PASSWORD = RAW_PASSWORD;
  logged = [];
  errored = [];
  exits = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void errored.push(args.map(String).join(" ")));
  vi.spyOn(process, "exit").mockImplementation(((code?: unknown) => void exits.push(code)) as never);
});

afterEach(() => {
  delete process.env.DATABASE_URL_UNPOOLED;
  delete process.env.APP_ROLE_PASSWORD;
});

describe("pnpm db:app-role", () => {
  it("sends the password as a bound parameter for Postgres to quote; the raw value is in no statement text and no output", async () => {
    await runScript();

    const [format] = recorder.state.queries;
    expect(format?.text).toBe("select format('%L', $1::text) as lit");
    expect(format?.params).toEqual([RAW_PASSWORD]);
    for (const text of texts()) expect(text).not.toContain(RAW_PASSWORD);
    for (const line of [...logged, ...errored]) {
      expect(line).not.toContain(RAW_PASSWORD);
      expect(line).not.toContain("quoted-by-postgres");
    }
  });

  it("creates the role with LOGIN and the quoted literal, or rotates the password when the role exists", async () => {
    await runScript();
    expect(startingWith("create role")).toEqual([`create role ${ROLE} with login password 'quoted-by-postgres'`]);
    expect(startingWith("alter role")).toEqual([]);
    expect(logged[0]).toContain(`role ${ROLE} created`);

    recorder.state.roleExists = true;
    recorder.state.queries.length = 0;
    logged.length = 0;
    await runScript();
    expect(startingWith("alter role")).toEqual([`alter role ${ROLE} with login password 'quoted-by-postgres'`]);
    expect(startingWith("create role")).toEqual([]);
    expect(logged[0]).toContain(`role ${ROLE} password rotated`);
  });

  it("grants USAGE on public and draft, the four privileges on every present and future table, and USAGE on sequences", async () => {
    await runScript();
    expect(startingWith("grant")).toEqual([
      `grant usage on schema public, draft to ${ROLE}`,
      `grant select, insert, update, delete on all tables in schema public, draft to ${ROLE}`,
      `grant usage on all sequences in schema public, draft to ${ROLE}`,
    ]);
    expect(startingWith("alter default privileges")).toEqual([
      `alter default privileges in schema public grant select, insert, update, delete on tables to ${ROLE}`,
      `alter default privileges in schema draft grant select, insert, update, delete on tables to ${ROLE}`,
    ]);
  });

  it("revokes UPDATE and DELETE on public.audit_log only, after every grant, and names audit_log nowhere else in a write", async () => {
    await runScript();
    const writes = texts().filter((t) => !t.startsWith("select"));
    expect(startingWith("revoke")).toEqual([`revoke update, delete on public.audit_log from ${ROLE}`]);
    expect(writes.at(-1)).toBe(`revoke update, delete on public.audit_log from ${ROLE}`);
    expect(writes.filter((t) => t.includes("audit_log"))).toHaveLength(1);
    expect(writes.filter((t) => t.includes("revoke"))).toHaveLength(1);
  });

  it("prints the role name, the grant counts and the audit_log privileges only, and exits clean", async () => {
    await runScript();
    expect(logged).toEqual([`role ${ROLE} created\nschema usage grants 2\ntable privilege grants 12\naudit_log privileges insert, select`]);
    expect(errored).toEqual([]);
    expect(exits).toEqual([]);
  });

  it("fails before any statement without APP_ROLE_PASSWORD or DATABASE_URL_UNPOOLED, naming the variable only", async () => {
    delete process.env.APP_ROLE_PASSWORD;
    await runScript();
    expect(errored).toEqual(["db:app-role failed: APP_ROLE_PASSWORD is not set"]);
    expect(exits).toEqual([1]);
    expect(recorder.state.queries).toHaveLength(0);

    errored.length = 0;
    exits.length = 0;
    process.env.APP_ROLE_PASSWORD = RAW_PASSWORD;
    delete process.env.DATABASE_URL_UNPOOLED;
    await runScript();
    expect(errored).toEqual(["db:app-role failed: DATABASE_URL_UNPOOLED is not set"]);
    expect(recorder.state.queries).toHaveLength(0);
  });
});
