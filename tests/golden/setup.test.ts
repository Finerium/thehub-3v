// The setup driver of the golden runner (scripts/golden/setup.ts; blueprint 9.11 `input.setup`, 9.9 the drafting
// routes; AC-EVAL-04, AC-LOOP-13). Thirteen cases of the set name a state before their question is asked, and the
// runner skipped every one of them, one of which is hard-gated: an unproved gate reads as a gate that failed.
//
// What is pinned here: what the driver reads out of each real setup line, that a case it stages or waves through
// is reported run and not skipped, that it reaches the product only through the product's own routes and only as
// the role the matrix allows, and that a state it cannot reach is still a skip with the reason in it. The routes
// are a stub of fetch: no server, no database, no provider.
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DebtCluster } from "@/contracts/generated/coverage";
import type { DraftDocument, DraftState } from "@/contracts/generated/drafts";
import { casesPath, loadCases, type Case } from "../../scripts/golden/cases";
import type { Role } from "../../scripts/golden/client";
import { SetupDriver, cookieValue, plan, withCookie, type SetupContext } from "../../scripts/golden/setup";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FILE = casesPath(ROOT);
const skip = !existsSync(FILE);
const cases: Case[] = skip ? [] : loadCases(FILE);
const byId = new Map(cases.map((c) => [c.id, c] as const));

const CLUSTER: DebtCluster = {
  id: "DC-01",
  equipment_tag: "GA-1201A",
  corpus_version_id: "cv-1",
  uncovered_wo_numbers: ["WO-240007"],
  factors: { D_hours: 8, D_max: 10, C_idr: 1_000_000, C_max: 2_000_000, k: 2, r: 1 },
  coefficients: { a: 0.4, b: 0.3, c: 0.2, d: 0.1, basis: "ASSUMPTION" },
  incomplete_uncovered: 1,
  score: 0.5,
  rank: 1,
};

function draft(state: DraftState): DraftDocument {
  return {
    id: "dr-1",
    cluster_id: CLUSTER.id,
    equipment_tag: CLUSTER.equipment_tag,
    state,
    lease_expires_at: null,
    corpus_version_id: "cv-1",
    opl_id_reserved: "OPL-GA-1201A-99",
    title: "a title the report never prints",
    classification: "Improvement",
    aspect: "Reliability",
    created_by_alias: "SUP-01",
    model_id: "glm-5.3-flash",
    prompt_version: "0".repeat(64),
    previous_draft_id: null,
    session_scope: "sandbox-1",
  };
}

/** Every request the driver made, in order: the method, the path and the role whose cookie carried it. */
type Sent = { method: string; path: string; role: string };
let sent: Sent[];
/** The state GET /api/drafts/:id answers with; the decision and publish routes advance it, as the product does. */
let state: DraftState;

function context(overrides: Partial<SetupContext> = {}): SetupContext {
  return {
    baseUrl: "http://localhost:3000",
    session: async (role: Role) => `session=s-${role.replace(/\s+/g, "-")}; sandbox=sandbox-1`,
    cases: byId,
    answered: () => false,
    ...overrides,
  };
}

beforeEach(() => {
  sent = [];
  state = "in_review";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method: string; headers: Record<string, string> }) => {
      const { pathname } = new URL(url);
      const role = /session=s-([A-Za-z-]+)/.exec(init.headers.cookie ?? "")?.[1] ?? "none";
      sent.push({ method: init.method, path: pathname, role });
      const body = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
      if (pathname === "/api/coverage") return body({ clusters: [CLUSTER] });
      if (pathname === "/api/drafts" && init.method === "POST") return body({ draft_id: "dr-1", state: "proposed" });
      if (pathname.endsWith("/decision")) {
        state = "accepted";
        return body(draft(state));
      }
      if (pathname.endsWith("/publish")) {
        state = "published";
        return body({ ok: true });
      }
      if (pathname.startsWith("/api/drafts/")) return body({ draft: draft(state) });
      return new Response("not found", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.skipIf(skip)("what the driver reads out of the golden set's own setup lines", () => {
  // Every setup of the file and what the driver makes of it. Thirteen cases carry one, seven of them tier A, and
  // those seven are exactly the seven the run of 2026-09-07 reported skipped.
  const EXPECTED: Record<string, string> = {
    "GS-12": "answered:GS-01",
    "GS-49": "draft:drafted",
    "GS-51": "draft:published",
    "GS-72": "outbound",
    "GS-14": "draft:drafted",
    "GS-83": "draft:drafted",
    "GS-84": "unstageable",
    "GS-16": "draft:accepted",
    "GS-15": "draft:published",
    "GS-85": "draft:published",
    "GS-92": "unstageable",
    "GS-94": "unstageable",
    "GS-95": "unstageable",
  };

  it("reads every setup of the file, and the one it cannot read is the one that names a fixture", () => {
    const withSetup = cases.filter((c) => c.input.setup);
    const read = Object.fromEntries(
      withSetup.map((c) => {
        const p = plan(c, byId);
        return [c.id, p.kind === "draft" ? `draft:${p.target}` : p.kind === "answered" ? `answered:${p.caseId}` : p.kind];
      }),
    );
    expect(read).toEqual(EXPECTED);
    expect(withSetup.filter((c) => c.tier === "A")).toHaveLength(7);
    // A case with no setup is never planned: the runner asks its question directly.
    expect(plan(cases.find((c) => !c.input.setup) as Case, byId)).toEqual({ kind: "unstageable" });
  });

  it("follows a setup that names another case to the state that case's own setup names", () => {
    // GS-49 says "on the GS-14 draft"; GS-14 is the request-a-lesson case, so a draft is what has to exist.
    expect(plan(byId.get("GS-49") as Case, byId)).toEqual({ kind: "draft", target: "drafted" });
    // GS-16's own line names the state; GS-85 says only "after GS-15", whose line says published.
    expect(plan(byId.get("GS-16") as Case, byId)).toEqual({ kind: "draft", target: "accepted" });
    expect(plan(byId.get("GS-85") as Case, byId)).toEqual({ kind: "draft", target: "published" });
  });

  it("a seeded retrieval fixture or an injected span is unstageable and stays a skip, with the setup as the reason", async () => {
    for (const id of ["GS-84", "GS-92", "GS-94", "GS-95"]) {
      const c = byId.get(id) as Case;
      expect(plan(c, byId).kind, id).toBe("unstageable");
      const staged = await new SetupDriver(context()).stage(c);
      expect(staged.decision, id).toBe("skip");
      if (staged.decision !== "skip") throw new Error("unreachable");
      expect(staged.reason).toContain(c.input.setup as string);
    }
    expect(sent).toEqual([]);
  });

  // The hard gate of the thirteen: GS-72's fixture feeds the rule pack's outbound screen, which this runner does
  // not drive. Nothing has to be staged for its question to be asked, so the case runs and the checks that do read
  // the fixture report unsupported by name. It was skipped before, and a skipped hard gate is an unproved gate.
  it("the outbound fixture of GS-72 is waved through: the case runs, and its hard gate is measured", async () => {
    const gs72 = byId.get("GS-72") as Case;
    expect(gs72.hard_gate).toBe(true);
    expect(plan(gs72, byId)).toEqual({ kind: "outbound" });
    const staged = await new SetupDriver(context()).stage(gs72);
    expect(staged.decision).toBe("run");
    expect(sent).toEqual([]);
  });
});

describe("staging a draft through the product's own routes", () => {
  const withSetup = (setup: string): Case => ({
    id: "GS-TEST",
    category: "Loop",
    hard_gate: false,
    tier: "A",
    input: { question: "a question the report never prints", setup },
    expected: { outcome: "answer", must_cite: [], must_contain: [], must_not_contain: [], numerals_allowed: [] },
    sources: [],
    checks: [{ type: "http_status", args: {} }],
    origin: "team",
  });

  it("creates the draft as the Reviewing Supervisor, waits for the lane, and reports it staged", async () => {
    const staged = await new SetupDriver(context()).stage(withSetup("on the GA-1201A draft"));
    expect(staged.decision).toBe("staged");
    if (staged.decision === "skip") throw new Error("unreachable");
    expect(staged.note).toContain("dr-1");
    expect(sent).toEqual([
      { method: "GET", path: "/api/coverage", role: "Reviewing-Supervisor" },
      { method: "POST", path: "/api/drafts", role: "Reviewing-Supervisor" },
      { method: "GET", path: "/api/drafts/dr-1", role: "Reviewing-Supervisor" },
    ]);
  });

  it("accepts as the Supervisor and publishes as the Manager, which is the one role INV-3 lets through G3", async () => {
    const staged = await new SetupDriver(context()).stage(withSetup("after the GA-1201A lesson has been published"));
    expect(staged.decision).toBe("staged");
    const decision = sent.find((s) => s.path.endsWith("/decision"));
    const publish = sent.find((s) => s.path.endsWith("/publish"));
    expect(decision).toMatchObject({ method: "POST", role: "Reviewing-Supervisor" });
    expect(publish).toMatchObject({ method: "POST", role: "Manager" });
    // Nothing else was touched: no route outside the drafting lane and the coverage read it needs.
    expect([...new Set(sent.map((s) => s.path.replace(/dr-1.*/, "dr-1")))]).toEqual(["/api/coverage", "/api/drafts", "/api/drafts/dr-1"]);
  });

  it("one draft per cluster per run: three cases naming the same cluster cost the drafting lane once", async () => {
    const driver = new SetupDriver(context());
    for (let i = 0; i < 3; i += 1) expect((await driver.stage(withSetup("on the GA-1201A draft"))).decision).toBe("staged");
    expect(sent.filter((s) => s.method === "POST" && s.path === "/api/drafts")).toHaveLength(1);
  });

  it("a draft that ends off the line is a skip naming the state it ended in, never a pass", async () => {
    state = "blocked";
    const staged = await new SetupDriver(context()).stage(withSetup("on the GA-1201A draft"));
    expect(staged).toEqual({ decision: "skip", reason: "setup not staged: the draft for DC-01 ended in state blocked" });
  });

  it("a route that refuses is a skip carrying the status, and the driver never retries it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })));
    const staged = await new SetupDriver(context()).stage(withSetup("on the GA-1201A draft"));
    expect(staged.decision).toBe("skip");
    if (staged.decision !== "skip") throw new Error("unreachable");
    expect(staged.reason).toContain("403");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("a setup naming no asset the coverage console knows is a skip, and no draft is created", async () => {
    const staged = await new SetupDriver(context()).stage(withSetup("on the ZZ-0000 draft"));
    expect(staged.decision).toBe("skip");
    expect(sent.filter((s) => s.method === "POST")).toEqual([]);
  });

  it("a setup that assumes an earlier case is staged only once that case has answered in this run", async () => {
    const line = "after GS-01 has been answered; the third citation in its evidence order";
    const answered = await new SetupDriver(context({ answered: (id) => id === "GS-01" })).stage(withSetup(line));
    expect(answered).toEqual({ decision: "staged", note: "GS-01 was answered earlier in this run" });
    const unanswered = await new SetupDriver(context({ answered: () => false })).stage(withSetup(line));
    expect(unanswered.decision).toBe("skip");
    expect(sent).toEqual([]);
  });
});

// D-16, ARCHITECTURE 8.5: every login issues its own sandbox, and the draft the Supervisor stages has to be the
// draft the Manager publishes and the Engineer's question sees. The runner replaces the cookie rather than logging
// in once, because each role holds its own session.
describe("the one sandbox of a run", () => {
  it("reads a cookie out of a header and replaces it, leaving every other cookie in place", () => {
    const header = "session=abc; sandbox=first; other=keep";
    expect(cookieValue(header, "sandbox")).toBe("first");
    expect(cookieValue(header, "absent")).toBeNull();
    expect(cookieValue("", "sandbox")).toBeNull();
    const swapped = withCookie(header, "sandbox", "shared");
    expect(cookieValue(swapped, "sandbox")).toBe("shared");
    expect(cookieValue(swapped, "session")).toBe("abc");
    expect(cookieValue(swapped, "other")).toBe("keep");
    // The cookie is appended where the header does not carry it yet, so a fresh session joins the same sandbox.
    expect(cookieValue(withCookie("session=abc", "sandbox", "shared"), "sandbox")).toBe("shared");
  });
});
