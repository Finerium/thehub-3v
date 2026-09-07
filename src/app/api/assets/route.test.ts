// GET /api/assets and GET /api/assets/:tag (9.9, AC-CTX-01 to 03): the ask_read column every role holds, the 401
// without a session, the pagination window, the 400 on a malformed query and the designed 404 for an unknown tag.
// Hermetic: the session, the sandbox and the query module are mocks, so nothing here opens a connection or reads a
// corpus; what the route does with what they return is the subject.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/contracts/generated/serving";
import type { Fleet, FleetRow, AssetView } from "@/db/queries/assets";
import { setRequest } from "../../../../tests/helpers/next-headers";
import { GET as list } from "./route";
import { GET as byTag } from "./[tag]/route";

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
const box = vi.hoisted(() => ({ getSandbox: vi.fn(), visibleVersionIds: vi.fn() }));
const queries = vi.hoisted(() => ({ readFleet: vi.fn(), readAsset: vi.fn() }));

vi.mock("@/auth/session", () => ({ getSession: auth.getSession, LANDING_PATH: "/tour" }));
vi.mock("@/auth/sandbox", () => ({ getSandbox: box.getSandbox, visibleVersionIds: box.visibleVersionIds }));
vi.mock("@/db/queries/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/queries/assets")>()),
  readFleet: queries.readFleet,
  readAsset: queries.readAsset,
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(), activeCorpusVersion: vi.fn() }));

const user = (role: Role) => ({
  id: "u-1",
  username: "demo",
  alias: `${role} demo`,
  role,
  sessionId: "s-1",
  expiresAt: new Date(Date.now() + 3_600_000),
});

const equipmentOf = (tag: string) => ({ tag, name: `pump ${tag}`, criticality_workbook: "A" });

const fleetRow = (tag: string): FleetRow =>
  ({
    equipment: equipmentOf(tag),
    area_workbook_name: "Unit 1",
    interlock: null,
    work_orders: 3,
    unplanned_rows: 2,
    planned_flagged_rows: 1,
    unplanned_hours: 4.5,
    flagged_hours: 1.5,
    lessons: 1,
    open_findings: 0,
    workbook: null,
  }) as unknown as FleetRow;

const fleet = (tags: readonly string[]): Fleet =>
  ({
    rows: tags.map(fleetRow),
    fixture_available: false,
    totals: { assets: tags.length, areas: 1, work_orders: 3 * tags.length, unplanned_hours: 4.5, flagged_hours: 1.5, documents: 9 },
  }) as unknown as Fleet;

const request = (url: string) => new NextRequest(`http://localhost${url}`, { headers: { "x-request-id": "req-a" } });
const context = (tag: string) => ({ params: Promise.resolve({ tag }) });

beforeEach(() => {
  setRequest();
  auth.getSession.mockResolvedValue(user("Engineer"));
  box.getSandbox.mockResolvedValue(null);
  box.visibleVersionIds.mockResolvedValue(["cv-1"]);
  queries.readFleet.mockResolvedValue(fleet(["GA-1201A", "YD-2301"]));
  queries.readAsset.mockResolvedValue({ equipment: equipmentOf("GA-1201A"), documents: [], citations: {} } as unknown as AssetView);
});

describe("GET /api/assets", () => {
  it("answers the register under ask_read, private and never cached", async () => {
    const res = await list(request("/api/assets"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.assets).toHaveLength(2);
    expect(body.totals.assets).toBe(2);
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(50);
    // Every line carries its reconciliation verdict; without a fixture row it is stated as null, never as true.
    expect(body.assets[0].reconciled).toBeNull();
  });

  it("orders by tag and never ranks (Case 1)", async () => {
    const res = await list(request("/api/assets"), undefined);
    const body = await res.json();
    expect(body.assets.map((a: { equipment: { tag: string } }) => a.equipment.tag)).toEqual(["GA-1201A", "YD-2301"]);
    expect(Object.keys(body.assets[0])).not.toContain("rank");
    expect(Object.keys(body.assets[0])).not.toContain("score");
  });

  it("windows the register by page and page_size", async () => {
    queries.readFleet.mockResolvedValue(fleet(["A", "B", "C", "D"]));
    const res = await list(request("/api/assets?page=2&page_size=2"), undefined);
    const body = await res.json();
    expect(body.assets.map((a: { equipment: { tag: string } }) => a.equipment.tag)).toEqual(["C", "D"]);
    expect(body.page).toBe(2);
  });

  it("refuses a malformed query with 400 and no message", async () => {
    const res = await list(request("/api/assets?page_size=500"), undefined);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_query" });
  });

  it("answers 401 without a session and never reads the register", async () => {
    auth.getSession.mockResolvedValue(null);
    const res = await list(request("/api/assets"), undefined);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthenticated" });
    expect(queries.readFleet).not.toHaveBeenCalled();
  });

  it.each(["Engineer", "Reviewing Supervisor", "Manager", "Admin"] as const)("serves the %s role (ask_read, 9.9)", async (role) => {
    auth.getSession.mockResolvedValue(user(role));
    const res = await list(request("/api/assets"), undefined);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/assets/:tag", () => {
  it("reads the asset against the versions the visitor sees, sandbox first (D-16)", async () => {
    box.getSandbox.mockResolvedValue({ corpusVersionId: "cv-sandbox" });
    box.visibleVersionIds.mockResolvedValue(["cv-1", "cv-0", "cv-sandbox"]);
    const res = await byTag(request("/api/assets/GA-1201A"), context("GA-1201A"));
    expect(res.status).toBe(200);
    expect(queries.readAsset).toHaveBeenCalledWith("GA-1201A", ["cv-sandbox", "cv-1", "cv-0"]);
  });

  it("answers the designed 404 for a tag no visible version carries", async () => {
    queries.readAsset.mockResolvedValue(null);
    const res = await byTag(request("/api/assets/NOPE"), context("NOPE"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ entity: "equipment", id: "NOPE" });
  });

  it("refuses a malformed tag with 400", async () => {
    const res = await byTag(request("/api/assets/x"), context(""));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_params" });
  });

  it("answers 401 without a session and never reads the asset", async () => {
    auth.getSession.mockResolvedValue(null);
    const res = await byTag(request("/api/assets/GA-1201A"), context("GA-1201A"));
    expect(res.status).toBe(401);
    expect(queries.readAsset).not.toHaveBeenCalled();
  });
});
