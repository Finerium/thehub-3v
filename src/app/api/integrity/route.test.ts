// GET /api/integrity (9.9, 6.2 surface 9; AC-INT-01, AC-INT-02, AC-INT-04): the ask_read column, the 401 without a
// session, the JSON page with its totals, the CSV export whose header lines carry the corpus version, the rules in
// scope and the fixture totals, the escaping of a cell that carries a comma or a quote, and the 400 on a malformed
// filter. Hermetic: the session, the sandbox and the register reads are mocks; no connection, no corpus text.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/contracts/generated/serving";
import type { FindingRow, RegisterTotals } from "@/db/queries/integrity";
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
