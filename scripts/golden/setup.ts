// The setup driver of the golden runner (blueprint 9.11 `input.setup`, 9.9 the drafting routes; ARCHITECTURE 8.2,
// 8.5, 8.6; AC-EVAL-04). A case's `setup` names a state the case assumes before its question is asked. The runner
// drives POST /api/ask alone, so every such case was skipped, and one of them (GS-72) is hard-gated, which reads as
// a gate that was never proved rather than one that failed.
//
// This driver stages the two states the product's own routes can reach, and only through those routes:
//   a draft for the cluster the setup names, carried to the state the setup names (POST /api/drafts, then
//     POST /api/drafts/:id/decision as the Reviewing Supervisor, the one role holding `create_draft` and `decide`);
//   a published lesson where the setup says published (the same draft, then POST /api/drafts/:id/publish as the
//     Manager, the only role INV-3 lets through G3).
//
// Everything happens inside the runner's own sandbox (D-16, AC-LOOP-13): a draft created through the product carries
// `session_scope`, and a publication rolls the sandbox's own never-activated child version, so the active corpus
// version every other visitor reads is untouched. Nothing here writes to the database, and nothing bypasses a gate:
// a role without the column is refused by the product and the driver reports that refusal as the reason.
//
// Three decisions, and the runner prints whichever comes back:
//   staged  the state the setup names now holds; the case runs
//   run     nothing had to be staged; the setup names an artefact that gates no check this runner drives, and the
//           checks that do read it report `unsupported` by name, which is the runner's honest third state
//   skip    the state cannot be reached from here (a seeded retrieval fixture, an injected span, a cluster the
//           setup does not name, a role that refuses) or the budget ran out before the drafting lane finished;
//           `reason` says which, and the case is reported skipped exactly as it was before.
//
// What this module never does: reach past a route into the database, retry a refusal, edit a case, or turn a state
// it could not reach into a pass. egress: the application under test, never a provider (INV-4).
import { z } from "zod";
import { DebtCluster } from "../../src/contracts/generated/coverage";
import { DraftDocument, DraftState } from "../../src/contracts/generated/drafts";
import type { Case } from "./cases";
import type { Role } from "./client";

export type Staging = { decision: "staged" | "run"; note: string } | { decision: "skip"; reason: string };

export type SetupContext = {
  baseUrl: string;
  /** The session cookie for a role, or a throw naming why the role could not log in. */
  session: (role: Role) => Promise<string>;
  /** Every case of the file by id: a setup that names another case is followed to the cluster that case names. */
  cases: ReadonlyMap<string, Case>;
  /** Whether a case has already been answered in this run, for a setup that assumes an earlier answer. */
  answered: (caseId: string) => boolean;
};

// The drafting lane runs AG-3 and AG-4 behind a 202 (ADR-004), so staging one draft is minutes, not seconds. The
// budget is what the driver waits before it reports the state the draft actually reached and skips the case.
const DEFAULT_BUDGET_MS = 600_000;
const POLL_MS = 5_000;

function budgetMs(): number {
  const given = Number(process.env.GOLDEN_SETUP_BUDGET_MS);
  return Number.isFinite(given) && given > 0 ? given : DEFAULT_BUDGET_MS;
}

const SUPERVISOR: Role = "Reviewing Supervisor";
const MANAGER: Role = "Manager";

// 9.6 in the order a draft moves through; `blocked` and `rejected` are off the line and end the staging.
const LINE: readonly string[] = ["proposed", "drafted", "redlined", "in_review", "accepted", "published"];
type Target = Extract<DraftState, "drafted" | "accepted" | "published">;

/** The draft's place on the line, or -1 for `blocked` and `rejected`, which no wait can leave. */
function rank(state: DraftState): number {
  return LINE.indexOf(state);
}

// --- reading the setup -------------------------------------------------------------------------------------------

type Plan =
  | { kind: "answered"; caseId: string }
  | { kind: "draft"; target: Target }
  | { kind: "outbound" }
  | { kind: "unstageable" };

const CASE_REF = /\bGS-\d+\b/g;
const EQUIPMENT_TAG = /\b[A-Z]{2,4}-\d{4}[A-Z]?\b/g;
const WORK_ORDER = /\bWO-\d+\b/g;
const REFERENCE_DEPTH = 3;

/** This case's setup, then the setups of every case it names, transitively; the cluster and the state hide there. */
function expand(goldenCase: Case, cases: ReadonlyMap<string, Case>): string {
  const seen = new Set([goldenCase.id]);
  const parts: string[] = [];
  const walk = (text: string, depth: number): void => {
    parts.push(text);
    if (depth === 0) return;
    for (const id of text.match(CASE_REF) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const referenced = cases.get(id)?.input.setup;
      if (referenced) walk(referenced, depth - 1);
    }
  };
  walk(goldenCase.input.setup ?? "", REFERENCE_DEPTH);
  return parts.join("; ");
}

/**
 * What the setup asks for. The two fixture clauses are read from the setup's own words: a fixture "for the outbound
 * pass" feeds the rule pack's outbound screen, which this runner does not drive and whose checks report unsupported,
 * so the case runs; a seeded retrieval fixture or a span injected into a prompt decides what the answer is made of,
 * so running the case without it would measure nothing and it is skipped instead.
 */
export function plan(goldenCase: Case, cases: ReadonlyMap<string, Case>): Plan {
  const own = goldenCase.input.setup ?? "";
  if (own.length === 0) return { kind: "unstageable" };
  if (/for the outbound pass/i.test(own)) return { kind: "outbound" };
  if (/\bseeded\b|\binjected\b/i.test(own)) return { kind: "unstageable" };

  const all = expand(goldenCase, cases);
  if (/\bpublish(ed|ing)?\b/i.test(all)) return { kind: "draft", target: "published" };
  const named = /\bin state (\w+)\b/i.exec(all);
  if (named) {
    const state = DraftState.safeParse(named[1]);
    if (!state.success) return { kind: "unstageable" };
    if (state.data !== "drafted" && state.data !== "accepted" && state.data !== "published") return { kind: "unstageable" };
    return { kind: "draft", target: state.data };
  }
  if (/\bdrafts?\b|request-a-lesson/i.test(all)) return { kind: "draft", target: "drafted" };

  const answered = /\b(GS-\d+) has been answered\b/i.exec(own);
  if (answered?.[1]) return { kind: "answered", caseId: answered[1] };
  return { kind: "unstageable" };
}

// --- the product's routes ----------------------------------------------------------------------------------------

const Coverage = z.looseObject({ clusters: z.array(DebtCluster) });
const Created = z.object({ draft_id: z.string(), state: DraftState }).strict();
const DraftDetail = z.looseObject({ draft: DraftDocument });

/** A route that answered outside 2xx, or a setup this driver could not read; both end the staging with a reason. */
class Refused extends Error {}

async function json(url: string, cookie: string, post?: { body: unknown }): Promise<unknown> {
  const response = await fetch(url, {
    method: post ? "POST" : "GET",
    headers: post ? { "content-type": "application/json", cookie } : { cookie },
    ...(post ? { body: JSON.stringify(post.body) } : {}),
  });
  if (!response.ok) throw new Refused(`${post ? "POST" : "GET"} ${new URL(url).pathname} returned ${response.status}`);
  return response.json();
}

/** The debt cluster the setup names, by equipment tag or by a work order in its uncovered list (GET /api/coverage). */
async function clusterFor(ctx: SetupContext, cookie: string, text: string): Promise<DebtCluster> {
  const workOrders = new Set(text.match(WORK_ORDER) ?? []);
  const tags = new Set(text.match(EQUIPMENT_TAG) ?? []);
  for (const wo of workOrders) tags.delete(wo);
  if (tags.size === 0 && workOrders.size === 0) throw new Refused("the setup names no equipment tag and no work order");
  const { clusters } = Coverage.parse(await json(`${ctx.baseUrl}/api/coverage`, cookie));
  const found =
    clusters.find((c) => tags.has(c.equipment_tag)) ??
    clusters.find((c) => c.uncovered_wo_numbers.some((wo) => workOrders.has(wo)));
  if (!found) throw new Refused(`no debt cluster matches ${[...tags, ...workOrders].join(", ")}`);
  return found;
}

async function readState(ctx: SetupContext, cookie: string, draftId: string): Promise<DraftState> {
  const { draft } = DraftDetail.parse(await json(`${ctx.baseUrl}/api/drafts/${encodeURIComponent(draftId)}`, cookie));
  return draft.state;
}

/** Polls the draft the way the review surface does, until it reaches `wanted`, dies, or the budget runs out. */
async function waitFor(ctx: SetupContext, cookie: string, draftId: string, wanted: number, deadline: number): Promise<DraftState> {
  let state = await readState(ctx, cookie, draftId);
  while (rank(state) !== -1 && rank(state) < wanted && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    state = await readState(ctx, cookie, draftId);
  }
  return state;
}

// --- the driver --------------------------------------------------------------------------------------------------

export class SetupDriver {
  /** One draft per cluster per run: three cases name the same draft, and each one costs the drafting lane. */
  private readonly drafts = new Map<string, string>();

  constructor(private readonly ctx: SetupContext) {}

  async stage(goldenCase: Case): Promise<Staging> {
    const setup = goldenCase.input.setup ?? "";
    const wanted = plan(goldenCase, this.ctx.cases);
    switch (wanted.kind) {
      case "outbound":
        return {
          decision: "run",
          note: "the setup's fixture feeds the rule pack's outbound screen, which this runner does not drive; the checks that read it report unsupported and every other check of the case is evaluated",
        };
      case "answered":
        return this.ctx.answered(wanted.caseId)
          ? { decision: "staged", note: `${wanted.caseId} was answered earlier in this run` }
          : { decision: "skip", reason: `setup not satisfied by the runner: ${wanted.caseId} did not run before this case` };
      case "draft":
        try {
          return await this.stageDraft(setup, wanted.target);
        } catch (error) {
          return { decision: "skip", reason: `setup not staged: ${error instanceof Error ? error.message : String(error)}` };
        }
      case "unstageable":
        return { decision: "skip", reason: `setup not satisfied by the runner: ${setup}` };
    }
  }

  private async stageDraft(setup: string, target: Target): Promise<Staging> {
    const budget = budgetMs();
    const deadline = Date.now() + budget;
    const supervisor = await this.ctx.session(SUPERVISOR);
    const cluster = await clusterFor(this.ctx, supervisor, setup);

    let draftId = this.drafts.get(cluster.id) ?? null;
    if (draftId === null) {
      const created = Created.parse(
        await json(`${this.ctx.baseUrl}/api/drafts`, supervisor, { body: { cluster_id: cluster.id } }),
      );
      draftId = created.draft_id;
      this.drafts.set(cluster.id, draftId);
    }
    const at = `the draft for ${cluster.id}`;

    // The drafting lane carries the draft to in_review by itself; the states past it are the driver's to take.
    const settle = Math.min(rank(target), rank("in_review"));
    let state = await waitFor(this.ctx, supervisor, draftId, settle, deadline);
    if (rank(state) === -1) return { decision: "skip", reason: `setup not staged: ${at} ended in state ${state}` };
    if (rank(state) < settle) {
      return { decision: "skip", reason: `setup not staged: ${at} was still ${state} after the ${Math.round(budget / 1000)} s budget` };
    }

    if (rank(target) >= rank("accepted") && state === "in_review") {
      const decided = DraftDocument.parse(
        await json(`${this.ctx.baseUrl}/api/drafts/${encodeURIComponent(draftId)}/decision`, supervisor, { body: { decision: "accept" } }),
      );
      state = decided.state;
    }
    if (target === "published" && state === "accepted") {
      const manager = await this.ctx.session(MANAGER);
      await json(`${this.ctx.baseUrl}/api/drafts/${encodeURIComponent(draftId)}/publish`, manager, { body: {} });
      state = await readState(this.ctx, supervisor, draftId);
    }

    if (rank(state) < rank(target)) return { decision: "skip", reason: `setup not staged: ${at} reached ${state}, not ${target}` };
    return { decision: "staged", note: `draft ${draftId} for ${cluster.id} in state ${state} (target ${target}), inside the runner's sandbox` };
  }
}

// --- the runner's one sandbox ------------------------------------------------------------------------------------

/** The value of one cookie in a `k=v; k=v` header, or null. */
export function cookieValue(header: string, name: string): string | null {
  for (const pair of header.split("; ")) {
    const at = pair.indexOf("=");
    if (at > 0 && pair.slice(0, at) === name) return pair.slice(at + 1);
  }
  return null;
}

/** The same header with one cookie replaced, so every role of a run shares the sandbox the first login issued. */
export function withCookie(header: string, name: string, value: string): string {
  const kept = header.split("; ").filter((pair) => pair.length > 0 && pair.slice(0, pair.indexOf("=")) !== name);
  kept.push(`${name}=${value}`);
  return kept.join("; ");
}
