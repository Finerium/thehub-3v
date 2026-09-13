// GET /api/integrity (9.9, 6.2 surface 9; AC-INT-01, AC-INT-02, AC-INT-04): the ask_read column, the 401 without a
// session, the JSON page with its totals, the CSV export whose header lines carry the corpus version, the rules in
// scope and the fixture totals, the escaping of a cell that carries a comma or a quote, and the 400 on a malformed
// filter. Hermetic: the session, the sandbox and the register reads are mocks; no connection, no corpus text.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/contracts/generated/serving";
import { integrityFixtures, type FindingRow, type RegisterTotals } from "@/db/queries/integrity";
import { setRequest } from "../../../../tests/helpers/next-headers";
import { GET } from "./route";

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
const box = vi.hoisted(() => ({ getSandbox: vi.fn(), visibleVersionIds: vi.fn() }));
const register = vi.hoisted(() => ({ registerVersion: vi.fn(), registerTotals: vi.fn(), listFindings: vi.fn(), allFindings: vi.fn() }));
const versions = vi.hoisted(() => ({ versionLabel: vi.fn() }));

vi.mock("@/auth/session", () => ({ getSession: auth.getSession, LANDING_PATH: "/tour" }));
vi.mock("@/auth/sandbox", () => ({ getSandbox: box.getSandbox, visibleVersionIds: box.visibleVersionIds }));
vi.mock("@/db/queries/integrity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/queries/integrity")>()),
  ...register,
}));
vi.mock("@/db/queries/failures", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/queries/failures")>()),
  versionLabel: versions.versionLabel,
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(), activeCorpusVersion: vi.fn() }));

const user = (role: Role) => ({ id: "u-1", username: "demo", alias: "alias", role, sessionId: "s-1", expiresAt: new Date(Date.now() + 3_600_000) });

const finding = (over: Partial<FindingRow> = {}): FindingRow =>
  ({
    id: "f-1",
    rule_id: "CD-1",
    rule: "Missing SIL",
    severity: "high",
    discipline: "instrument",
    unit: "sheet",
    basis: "the sheet states no SIL",
    document_id: "doc-1",
    span_id: "span-1",
    state: "open",
    safety_function: true,
    routing_recommendation: null,
    observation_only: false,
    item: { where: "row 4" },
    corpus_version_id: "cv-1",
    document: null,
    citation: null,
    ...over,
  }) as FindingRow;

const totals: RegisterTotals = {
  version_id: "cv-1",
  total: 18,
  open: 18,
  fixture_total: 18,
  rules: [{ rule_id: "CD-1", rule: "Missing SIL", severity: "high", unit: "sheet", basis: null, definition: null, observation_only: false, count: 1, open: 1, fixture: 1 }],
  observations: [{ rule_id: "CD-15", rule: "Observation", severity: "low", unit: "row", basis: null, definition: null, observation_only: true, count: 2, open: 2, fixture: 2 }],
  mismatches: [],
};

const request = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, { headers: { "x-request-id": "req-i", ...headers } });

beforeEach(() => {
  setRequest();
  auth.getSession.mockResolvedValue(user("Engineer"));
  box.getSandbox.mockResolvedValue(null);
  box.visibleVersionIds.mockResolvedValue(["cv-1"]);
  register.registerVersion.mockResolvedValue("cv-1");
  register.registerTotals.mockResolvedValue(totals);
  register.listFindings.mockResolvedValue({ rows: [finding()], total: 18 });
  register.allFindings.mockResolvedValue([finding()]);
  versions.versionLabel.mockResolvedValue({ id: "cv-1", label: "v1-corpus", corpus_sha256: "a".repeat(64), is_active: true });
});

describe("GET /api/integrity (JSON)", () => {
  it("answers the page with its totals under ask_read, private and never cached", async () => {
    const res = await GET(request("/api/integrity"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body).toMatchObject({ corpus_version: "v1-corpus", version_id: "cv-1", page: 1, page_size: 50, total: 18 });
    expect(body.totals.fixture_total).toBe(18);
    expect(body.findings).toHaveLength(1);
  });

  it("passes the filters through, with observations off unless asked", async () => {
    await GET(request("/api/integrity?rule=CD-4&severity=high&state=open&document=doc-1"), undefined);
    expect(register.listFindings).toHaveBeenCalledWith(
      { rule: "CD-4", severity: "high", discipline: undefined, state: "open", document: "doc-1", observations: false },
      "cv-1",
      1,
      50,
    );
    await GET(request("/api/integrity?observations=true"), undefined);
    expect(register.listFindings).toHaveBeenLastCalledWith(expect.objectContaining({ observations: true }), "cv-1", 1, 50);
  });

  it("reads the register of the visitor's own sandbox version first (D-16)", async () => {
    box.getSandbox.mockResolvedValue({ corpusVersionId: "cv-sandbox" });
    box.visibleVersionIds.mockResolvedValue(["cv-1", "cv-sandbox"]);
    await GET(request("/api/integrity"), undefined);
    expect(register.registerVersion).toHaveBeenCalledWith(["cv-sandbox", "cv-1"]);
  });

  it("refuses a rule id that is not CD-n with 400", async () => {
    const res = await GET(request("/api/integrity?rule=CD_4"), undefined);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_query" });
  });

  it("answers 503 when no visible version carries a register", async () => {
    register.registerVersion.mockResolvedValue(null);
    const res = await GET(request("/api/integrity"), undefined);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "no_register_version" });
  });

  it("answers 401 without a session and never reads the register", async () => {
    auth.getSession.mockResolvedValue(null);
    const res = await GET(request("/api/integrity"), undefined);
    expect(res.status).toBe(401);
    expect(register.listFindings).not.toHaveBeenCalled();
  });

  it.each(["Engineer", "Reviewing Supervisor", "Manager", "Admin"] as const)("serves the %s role (ask_read, 9.9)", async (role) => {
    auth.getSession.mockResolvedValue(user(role));
    expect((await GET(request("/api/integrity"), undefined)).status).toBe(200);
  });
});

describe("GET /api/integrity (CSV, AC-INT-04)", () => {
  it("carries the fixture header lines, the column line and one line per finding", async () => {
    const res = await GET(request("/api/integrity?format=csv"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="integrity-register-v1-corpus.csv"');
    const lines = (await res.text()).split("\r\n");
    expect(lines[0]).toBe("# corpus_version: v1-corpus");
    expect(lines[1]).toBe("# corpus_version_id: cv-1");
    expect(lines[2]).toBe("# rules_in_scope: CD-1");
    expect(lines[3]).toBe("# fixture_total: 18");
    expect(lines[4]).toBe("# fixture_rules: CD-1=1");
    expect(lines[5]).toBe("# fixture_observations: CD-15=2");
    expect(lines[6]).toBe("# rows: 1");
    expect(lines[7].split(",")[0]).toBe("id");
    expect(lines[8].split(",")[0]).toBe("f-1");
    // The export is the whole filtered register, not one page.
    expect(register.allFindings).toHaveBeenCalledTimes(1);
    expect(register.listFindings).not.toHaveBeenCalled();
  });

  it("answers CSV to an Accept: text/csv request without the format parameter", async () => {
    const res = await GET(request("/api/integrity", { accept: "text/csv" }), undefined);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  });

  it("escapes a cell that carries a comma, a quote or a newline, and emits the item as JSON", async () => {
    register.allFindings.mockResolvedValue([finding({ basis: 'a "quoted", comma', item: { note: "x,y" } })]);
    const row = (await (await GET(request("/api/integrity?format=csv"), undefined)).text()).split("\r\n")[8];
    expect(row).toContain('"a ""quoted"", comma"');
    expect(row).toContain('"{""note"":""x,y""}"');
  });

  it("answers 401 without a session", async () => {
    auth.getSession.mockResolvedValue(null);
    expect((await GET(request("/api/integrity?format=csv"), undefined)).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// AC-INT-04, the two clauses the header check above does not reach: an unfiltered export totals the fixture's own
// register total, and an export reimports losslessly.
//
// The register the route is handed here is the fixture's own shape: one row per finding fixtures.json counts under
// `integrity.rules`, so the row total is read from the bundle by key and never typed. The two observation rules
// live under `integrity.observations`, outside that total, and the route is what keeps them out of an unfiltered
// listing (it asks the register with `observations: false`), which is asserted rather than assumed.
//
// WHAT THIS FILE CANNOT CHECK: that the seeded database itself holds exactly that many findings. This is the route
// under mocks; the database half is the register's own reconciliation (RegisterTotals.mismatches, surfaced on the
// register) and the harness gate over `counts.register`.
// ---------------------------------------------------------------------------------------------------------------

const fx = integrityFixtures();

/** RFC 4180 over the bytes the route wrote: quoted cells keep their commas, quotes and line breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] as string;
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** The value a cell stands for: the empty cell is the null the writer emitted, `item` is JSON, the two marks are booleans. */
function reimport(column: string, cell: string): unknown {
  if (cell === "") return null;
  if (column === "item") return JSON.parse(cell) as unknown;
  if (column === "safety_function" || column === "observation_only") return cell === "true";
  return cell;
}

/**
 * One finding per rule the fixture counts, in the fixture's own order. The fields vary by index so that the export
 * carries every shape a register row has: a null span, a null routing recommendation, both marks, a cell with a
 * comma and a quote in it, and one with a line break.
 */
function fixtureRegister(rules: Record<string, number>): FindingRow[] {
  return Object.entries(rules).flatMap(([ruleId, count]) =>
    Array.from({ length: count }, (_, i) =>
      finding({
        id: `${ruleId}-${String(i + 1).padStart(3, "0")}`,
        rule_id: ruleId,
        rule: `${ruleId} rule name`,
        severity: (["high", "medium", "low"] as const)[i % 3],
        discipline: i % 4 === 0 ? "instrument" : "mechanical",
        basis: i % 5 === 0 ? 'a "quoted", comma' : i % 7 === 0 ? "a line\r\nbreak" : "the sheet states it",
        document_id: `doc-${ruleId}-${i}`,
        span_id: i % 3 === 0 ? null : `span-${ruleId}-${i}`,
        safety_function: i % 2 === 0,
        routing_recommendation: i % 6 === 0 ? null : "MOC",
        item: { where: `row ${i}`, detail: "a, b" },
      }),
    ),
  );
}

function fixtureTotals(fixtures: NonNullable<typeof fx>): RegisterTotals {
  const row = (rule_id: string, count: number, observation_only: boolean) => ({
    rule_id,
    rule: `${rule_id} rule name`,
    severity: "medium",
    unit: "sheet",
    basis: null,
    definition: null,
    observation_only,
    count,
    open: count,
    fixture: count,
  });
  return {
    version_id: "cv-1",
    total: fixtures.integrity.total,
    open: fixtures.integrity.total,
    fixture_total: fixtures.integrity.total,
    rules: Object.entries(fixtures.integrity.rules).map(([id, n]) => row(id, n, false)),
    observations: Object.entries(fixtures.integrity.observations).map(([id, n]) => row(id, n, true)),
    mismatches: [],
  };
}

describe.skipIf(fx === null)("GET /api/integrity (CSV, AC-INT-04): the unfiltered total and the round trip", () => {
  const fixtures = fx as NonNullable<typeof fx>;
  const rows = fixtureRegister(fixtures.integrity.rules);

  beforeEach(() => {
    register.registerTotals.mockResolvedValue(fixtureTotals(fixtures));
    register.allFindings.mockResolvedValue(rows);
  });

  it("counts the fixture's register total by key: the per-rule counts sum to integrity.total, observations outside it", () => {
    const summed = Object.values(fixtures.integrity.rules).reduce((a, b) => a + b, 0);
    expect(summed, "fixtures.json integrity.rules does not sum to integrity.total").toBe(fixtures.integrity.total);
    expect(Object.keys(fixtures.integrity.observations).length, "fixtures.json counts no observation rule").toBeGreaterThan(0);
    for (const id of Object.keys(fixtures.integrity.observations)) {
      expect(Object.keys(fixtures.integrity.rules), `${id} is counted inside the register total`).not.toContain(id);
    }
  });

  it("writes one line per finding, so an unfiltered export totals the fixture and carries no observation rule", async () => {
    const res = await GET(request("/api/integrity?format=csv"), undefined);
    expect(res.status).toBe(200);
    const parsed = parseCsv(await res.text());
    const total = fixtures.integrity.total;
    // A comment line carries no quoted cell, so its cells rejoin to the line the route wrote.
    const headerLine = (n: number): string => parsed[n].join(",");

    // The seven header comment lines, the column line, then the register.
    expect(headerLine(3)).toBe(`# fixture_total: ${total}`);
    expect(headerLine(4)).toBe(`# fixture_rules: ${Object.entries(fixtures.integrity.rules).map(([id, n]) => `${id}=${n}`).join(",")}`);
    expect(headerLine(5)).toBe(`# fixture_observations: ${Object.entries(fixtures.integrity.observations).map(([id, n]) => `${id}=${n}`).join(",")}`);
    expect(headerLine(6)).toBe(`# rows: ${total}`);
    const columns = parsed[7];
    expect(columns[0]).toBe("id");
    const data = parsed.slice(8);
    expect(data.length, "the export does not carry one line per finding of the fixture's register").toBe(total);

    // Per rule, the fixture's own count; and the observation rules are in neither the scope line nor the rows.
    const byRule = new Map<string, number>();
    const ruleAt = columns.indexOf("rule_id");
    for (const line of data) byRule.set(line[ruleAt], (byRule.get(line[ruleAt]) ?? 0) + 1);
    expect(Object.fromEntries(byRule)).toEqual(fixtures.integrity.rules);
    const scope = headerLine(2).slice("# rules_in_scope: ".length).split(",");
    for (const id of Object.keys(fixtures.integrity.observations)) {
      expect(scope, `${id} entered the scope line of an unfiltered export`).not.toContain(id);
      expect(byRule.has(id), `${id} entered the rows of an unfiltered export`).toBe(false);
    }
    const observationAt = columns.indexOf("observation_only");
    expect(data.every((line) => line[observationAt] === "false")).toBe(true);

    // Unfiltered means unfiltered: no rule filter, the observation switch off, and the whole register in one read.
    expect(register.allFindings).toHaveBeenCalledTimes(1);
    expect(register.allFindings).toHaveBeenCalledWith(
      { rule: undefined, severity: undefined, discipline: undefined, state: undefined, document: undefined, observations: false },
      "cv-1",
    );
    expect(register.listFindings).not.toHaveBeenCalled();
  });

  it("reimports losslessly: every cell parses back to the field of the row it was written from", async () => {
    const res = await GET(request("/api/integrity?format=csv"), undefined);
    const parsed = parseCsv(await res.text());
    const columns = parsed[7];
    const data = parsed.slice(8);
    expect(data.length).toBe(rows.length);

    const reimported = data.map((line) => {
      expect(line.length, "a line carries a different number of cells than the column line").toBe(columns.length);
      return Object.fromEntries(columns.map((c, i): [string, unknown] => [c, reimport(c, line[i])]));
    });
    const written = rows.map((row) =>
      Object.fromEntries(columns.map((c): [string, unknown] => [c, row[c as keyof FindingRow] ?? null])),
    );
    expect(reimported).toEqual(written);

    // The round trip is what a reimport reads: the ids come back in the order they left, and the escaped cells
    // carry their comma, their quote and their line break, not an encoding of them.
    const idAt = columns.indexOf("id");
    expect(data.map((line) => line[idAt])).toEqual(rows.map((r) => r.id));
    const basisAt = columns.indexOf("basis");
    expect(data.map((line) => line[basisAt])).toContain('a "quoted", comma');
    expect(data.map((line) => line[basisAt])).toContain("a line\r\nbreak");
  });
});
