// The loop, walked once against a live deployment (blueprint 6.2 surface 11, 9.6, 9.9; ARCHITECTURE 8.2, 8.5, 8.6;
// AC-LOOP-08, AC-LOOP-09, AC-LOOP-12, AC-LOOP-13, AC-UI-01). One record that carries no lesson becomes a draft, a
// person decides on it and a Manager publishes it, and the numbers move in this browser's sandbox and nowhere else.
//
// Three things make this file different from the rest of the suite:
//
//   it costs. A draft is two provider calls per redline round, so the walk runs ONCE per run: one draft, one
//   acceptance, one publication. Where the drafting does not land inside its lease (the daily budget spent, the
//   provider unreachable, or a round that ran long), the draft comes back blocked with `deadline_exceeded` and the
//   publication half skips itself with that reason stated rather than requesting a second draft.
//
//   it writes. Everything it writes is what the product itself writes, inside the visitor's sandbox: a draft with
//   `session_scope` set, its notes, its transitions, and a child corpus version that is never activated. It
//   activates nothing and deletes nothing.
//
//   it changes role inside one browser (D-16). The sandbox is the browser, not the login, so the draft requested as
//   the Reviewing Supervisor is the draft published as the Manager. That is the guided route's own role switch, and
//   the reason the run's stored Engineer state is only the starting point here.
//
// No number below is typed: the cluster comes from GET /api/coverage, the ids from the routes that mint them, the
// recount from the publication's own answer, and the active version's label from GET /api/health.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { getJson } from "./helpers";
import { hasPassword, missingPassword, signIn } from "./roles";

/** 9.6: the states the machine lane holds a draft in. Anything else is waiting on a person or is terminal. */
const MACHINE_STATES = ["proposed", "drafted", "redlined"];
/** 9.6: the states a draft this browser already owns may still be walked from, so no second draft is requested. */
const RESUMABLE = ["proposed", "drafted", "redlined", "in_review", "accepted"];
/** src/loop/lease.ts LEASE_SECONDS is 240 s; the poll is given that plus room for the watchdog to land. */
const POLL_DEADLINE_MS = 420_000;
const POLL_EVERY_MS = 5_000;
/** One poll is bounded, so a stalled database read cannot spend the whole deadline in a single request. */
const POLL_REQUEST_MS = 60_000;
const WALK_TIMEOUT_MS = 600_000;
/** 9.6: the reason src/loop/lease.ts writes on the transition when the watchdog blocks a stranded draft. */
const DEADLINE_REASON = "deadline_exceeded";

type Draft = {
  id: string;
  cluster_id: string;
  equipment_tag: string;
  state: string;
  opl_id_reserved: string;
  session_scope: string | null;
};
type Field = { id: string; is_slot: boolean; section: number };
type Transition = { to_state: string; reason: string | null };
type Poll = { draft: Draft; fields: Field[]; transitions: Transition[] };
type Recount = {
  uncovered_before: number;
  uncovered_after: number;
  population_count: number;
  recipe_sha256: string;
  stop_list_sha256: string;
};
type Published = {
  document_revision_id: string;
  corpus_version: { id: string; label: string; is_active: boolean; parent_version_id: string | null };
  coverage_recount: Recount;
};
type Method = { recipe_sha256: string; stop_list_sha256: string };
type Summary = { layer: string; population: string; uncovered_count: number; population_count: number };

/** The version number inside a `v<n>` label, so an increment is compared as a number and never as a string. */
function versionNumber(label: string): number {
  const match = /^v(\d+)$/.exec(label);
  expect(match, `corpus version label ${label} is not of the v<n> shape`).not.toBeNull();
  return Number(match![1]);
}

async function pollDraft(api: APIRequestContext, id: string): Promise<Poll> {
  return (await getJson(api, `/api/drafts/${encodeURIComponent(id)}`)) as unknown as Poll;
}

/**
 * Poll until the draft is out of the machine lane, exactly as the review sheet's own poll does (ADR-004).
 *
 * Each request is bounded, and a poll that does not answer 200 is counted and tried again rather than ending the
 * walk: the database read of this route is an HTTPS call with no timeout of its own, so a stalled one can hold the
 * whole invocation and answer 500 (reported to the route's author). The walk states how many polls that happened to
 * and asserts on the draft, which is what it is here to observe.
 */
async function pollToPersonOrTerminal(api: APIRequestContext, id: string): Promise<Poll> {
  const until = Date.now() + POLL_DEADLINE_MS;
  let last: Poll | null = null;
  let refused = 0;
  let lastRefusal = "";
  for (;;) {
    const response = await api.get(`/api/drafts/${encodeURIComponent(id)}`, { timeout: POLL_REQUEST_MS }).catch((error: unknown) => {
      lastRefusal = error instanceof Error ? error.message.split("\n")[0] : String(error);
      return null;
    });
    if (response === null) {
      refused += 1;
    } else if (response.status() === 200) {
      last = (await response.json()) as Poll;
      if (!MACHINE_STATES.includes(last.draft.state)) break;
    } else {
      refused += 1;
      lastRefusal = `status ${response.status()}: ${(await response.text()).slice(0, 160)}`;
    }
    if (Date.now() >= until) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS));
  }
  if (refused > 0) {
    test.info().annotations.push({ type: "poll refused", description: `${refused} poll(s) did not answer 200; last: ${lastRefusal}` });
  }
  if (last === null) throw new Error(`the poll of draft ${id} never answered 200 (${refused} refused; last: ${lastRefusal})`);
  return last;
}

// A retry would request a second live draft and spend the budget again, which is exactly what "run the walk once"
// forbids. The walk therefore never retries, whatever the project's retry policy is; the run reports what happened.
test.describe.configure({ retries: 0 });

test.describe.serial("the loop walk (AC-LOOP-13, AC-UI-01)", () => {
  /** What the walk produced, read by the steps after the one that produced it. */
  const walk: {
    draftId: string | null;
    state: string | null;
    blockedReason: string | null;
    baseline: { uncovered: number; population: number } | null;
  } = { draftId: null, state: null, blockedReason: null, baseline: null };

  test("the guided route names the role each act needs and offers the switch (D-16)", async ({ page }) => {
    await page.goto("/demo/loop");
    await expect(page.getByRole("heading", { level: 1, name: "The guided loop" })).toBeVisible();

    // Six acts, in the order of the loop, each with the role its route asks of the matrix.
    const acts = page.locator("[data-act]");
    await expect(acts).toHaveCount(6);
    await expect(page.locator('[data-act="request"]')).toContainText("Role: Reviewing Supervisor");
    await expect(page.locator('[data-act="draft"]')).toContainText("Role: system");
    await expect(page.locator('[data-act="review"]')).toContainText("Role: Reviewing Supervisor");
    await expect(page.locator('[data-act="publish"]')).toContainText("Role: Manager");

    // The stored session is the Engineer, who holds no publish column: the act states the role it needs and offers
    // the switch rather than a disabled control (D-16).
    const publish = page.locator('[data-act="publish"]');
    await expect(publish).toContainText("This act needs another role");
    await expect(publish.getByRole("button", { name: /Sign out and continue as Manager/ })).toBeVisible();

    // The signature moment is armed and has not played: no publication has recounted this browser's corpus.
    const recount = page.locator('[data-component="recount-moment"]');
    await expect(recount).toBeVisible();
    await expect(recount).not.toHaveAttribute("data-played", /.*/);
    await expect(page.locator("[data-version]").first()).toBeVisible();
    await expect(page.locator('[data-designed-state="503"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  });

  test("as the Reviewing Supervisor a lesson is requested, and no other browser sees it (AC-LOOP-13)", async ({ page, browser }) => {
    test.skip(!hasPassword("Reviewing Supervisor"), missingPassword("Reviewing Supervisor"));
    const identity = await signIn(page.request, "Reviewing Supervisor");
    expect(identity.role).toBe("Reviewing Supervisor");

    // The cluster the Console ranks first, which is the cluster the guided route walks. Never a typed id.
    const coverage = await getJson(page.request, "/api/coverage");
    const clusters = coverage.clusters as Array<{ id: string; equipment_tag: string }>;
    expect(clusters.length, "GET /api/coverage ranked no knowledge-debt cluster").toBeGreaterThan(0);
    const cluster = clusters[0];

    // One live draft per sandbox. A draft this browser already owns on that cluster and has not finished with is
    // resumed, exactly as the guided route resumes it (src/db/queries/loop-view.ts): re-requesting one would spend
    // the provider budget on work this browser already has in flight.
    const mine = (await getJson(page.request, "/api/drafts")) as unknown as { drafts: Draft[] };
    const resumable = mine.drafts.find((d) => d.cluster_id === cluster.id && d.session_scope !== null && RESUMABLE.includes(d.state));
    let draftId: string;
    if (resumable) {
      draftId = resumable.id;
      test.info().annotations.push({ type: "resumed", description: `draft ${draftId} in ${resumable.state}: no second draft was requested` });
    } else {
      const created = await page.request.post("/api/drafts", { data: { cluster_id: cluster.id } });
      expect(created.status(), await created.text()).toBe(202);
      const body = (await created.json()) as { draft_id: string; state: string };
      expect(body.state).toBe("proposed");
      draftId = body.draft_id;
    }
    walk.draftId = draftId;

    // The draft carries this browser's sandbox and the asset's next lesson id (9.6, D-16).
    const first = await pollDraft(page.request, draftId);
    expect(first.draft.cluster_id).toBe(cluster.id);
    expect(first.draft.equipment_tag).toBe(cluster.equipment_tag);
    expect(first.draft.session_scope).not.toBeNull();
    expect(first.draft.opl_id_reserved).toContain(cluster.equipment_tag);

    // A second browser: its own sandbox, the same account. It sees the seeded queue and not this draft, and the
    // draft's own address reads as absence rather than as a refusal.
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      await signIn(other.request, "Reviewing Supervisor");
      const queue = (await getJson(other.request, "/api/drafts")) as unknown as { drafts: Draft[] };
      expect(queue.drafts.map((d) => d.id)).not.toContain(draftId);
      expect(queue.drafts.every((d) => d.session_scope === null), "another browser was served a scoped draft").toBe(true);

      // The route answers absence, and the sheet renders the designed 404 of 6.3 (the sheet decides that state
      // itself, so its transport status is 200; the route's is the 404 below).
      const denied = await other.request.get(`/api/drafts/${encodeURIComponent(draftId)}`);
      expect(denied.status()).toBe(404);
      const page2 = await other.newPage();
      const opened = await page2.goto(`/drafts/${encodeURIComponent(draftId)}`);
      expect(opened?.status()).toBeLessThan(500);
      await expect(page2.locator('[data-designed-state="404"]')).toBeVisible();
      await expect(page2.getByRole("heading", { name: "No draft at this address in this browser" })).toBeVisible();
    } finally {
      await other.close();
    }

    // This browser does see it, in its queue and on its sheet.
    const queueNow = (await getJson(page.request, "/api/drafts")) as unknown as { drafts: Draft[] };
    expect(queueNow.drafts.map((d) => d.id)).toContain(draftId);
    await page.goto(`/drafts/${encodeURIComponent(draftId)}`);
    await expect(page.locator('[data-component="draft-review"]')).toBeVisible();
    await expect(page.locator('[data-component="state-rail"]')).toBeVisible();
  });

  test("the draft leaves the machine lane inside its lease, or comes back blocked", async ({ page }) => {
    test.setTimeout(WALK_TIMEOUT_MS);
    test.skip(walk.draftId === null, "no draft was requested in this run");
    await signIn(page.request, "Reviewing Supervisor");

    const last = await pollToPersonOrTerminal(page.request, walk.draftId!);
    walk.state = last.draft.state;
    walk.blockedReason = last.transitions.find((t) => t.to_state === "blocked")?.reason ?? null;

    // Whatever it reached, it is a state 9.6 names and the sheet renders without a stack trace.
    expect(["in_review", "blocked", "drafted", "redlined", "proposed"]).toContain(last.draft.state);
    await page.goto(`/drafts/${encodeURIComponent(walk.draftId!)}`);
    await expect(page.locator('[data-component="draft-review"]')).toHaveAttribute("data-state", last.draft.state);
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");

    if (last.draft.state === "in_review") {
      // The drafter wrote the six-section body the redliner passed.
      expect(last.fields.length).toBeGreaterThan(0);
      await expect(page.locator('[data-component="draft-section"]').first()).toBeVisible();
      await expect(page.locator('[data-component="redline-verdict-panel"]')).toBeVisible();
      return;
    }
    // The draft did not reach review. That is a designed outcome of 9.6, not a failure of the loop, and it comes in
    // two shapes: the redliner blocked the round, or the lease ran out and the poll blocked it (ADR-004). Both are
    // terminal, both state why, and both offer the one next step a person has: the re-proposal.
    expect(
      last.draft.state === "blocked",
      `the draft stayed in ${last.draft.state} past its lease; the poll should have blocked it (ADR-004)`,
    ).toBe(true);

    if (walk.blockedReason === DEADLINE_REASON) {
      await expect(page.locator('[data-designed-state="blocked"]')).toBeVisible();
      await expect(page.getByRole("heading", { name: "The drafting lease ran out" })).toBeVisible();
    } else {
      // The redliner's own round, with the reasons it blocked on; it never edited a word of the draft.
      const round = page.locator('[data-component="redline-verdict-panel"] [data-verdict="block"]');
      await expect(round.first()).toBeVisible();
      await expect(round.first().locator(".reason").first()).toBeVisible();
      expect(walk.blockedReason, "the blocked transition recorded no reason").not.toBeNull();
    }
    // 9.6: blocked is re-proposable, and the role that requested it is the role offered the re-proposal.
    await expect(page.getByRole("button", { name: "Re-propose" })).toBeVisible();
  });

  test("the Supervisor accepts and the Manager publishes into a version that is never activated", async ({ page }) => {
    test.setTimeout(WALK_TIMEOUT_MS);
    test.skip(walk.draftId === null, "no draft was requested in this run");
    test.skip(
      walk.state !== "in_review",
      `the drafting did not reach review in this run (state ${walk.state ?? "unknown"}${walk.blockedReason === null ? "" : `, reason ${walk.blockedReason}`}): the provider budget, the provider itself or the lease refused the round, and a second live draft is not requested to work around it`,
    );
    test.skip(!hasPassword("Manager"), missingPassword("Manager"));
    const id = walk.draftId!;

    // The baseline: the active version's label, and the method digests the recount must run under (AC-LOOP-12).
    const healthBefore = await getJson(page.request, "/api/health");
    const activeLabelBefore = String(healthBefore.corpus_version);
    const coverageBefore = await getJson(page.request, "/api/coverage");
    const method = coverageBefore.method as Method;
    const headlineBefore = (coverageBefore.summaries as Summary[]).find(
      (s) => s.layer === "generous" && s.population === "unplanned_failure",
    );
    expect(headlineBefore, "GET /api/coverage carried no generous unplanned_failure summary").toBeDefined();

    // 1. Every slot gets the engineer judgement G3 refuses to publish without (9.6).
    await signIn(page.request, "Reviewing Supervisor");
    const before = await pollDraft(page.request, id);
    for (const slot of before.fields.filter((f) => f.is_slot)) {
      const note = await page.request.post("/api/sme-notes", {
        data: {
          draft_id: id,
          field_id: slot.id,
          text: "Recorded by the browser suite as the engineer judgement this slot needs, so the publication gate has a note to read.",
        },
      });
      expect(note.status(), await note.text()).toBe(201);
    }

    // 2. The Reviewing Supervisor accepts: in_review -> accepted (AC-LOOP-08).
    const accepted = await page.request.post(`/api/drafts/${encodeURIComponent(id)}/decision`, { data: { decision: "accept" } });
    expect(accepted.status(), await accepted.text()).toBe(200);
    expect(((await accepted.json()) as Draft).state).toBe("accepted");

    // 3. The Manager, in the same browser and so in the same sandbox, publishes through G3 (INV-3, AC-LOOP-09).
    const manager = await signIn(page.request, "Manager");
    expect(manager.role).toBe("Manager");
    const response = await page.request.post(`/api/drafts/${encodeURIComponent(id)}/publish`);
    expect(response.status(), await response.text()).toBe(200);
    const published = (await response.json()) as Published;

    // The version increments and is never activated: it is this browser's, and the active version is untouched.
    expect(versionNumber(published.corpus_version.label)).toBeGreaterThan(versionNumber(activeLabelBefore));
    expect(published.corpus_version.is_active).toBe(false);
    expect(published.corpus_version.parent_version_id).not.toBeNull();
    const healthAfter = await getJson(page.request, "/api/health");
    expect(healthAfter.corpus_version).toBe(activeLabelBefore);

    // The recount moved the record out of the uncovered band, over the same population, under the same recipe.
    const recount = published.coverage_recount;
    expect(recount.uncovered_after).toBeLessThan(recount.uncovered_before);
    expect(recount.uncovered_before).toBe(headlineBefore!.uncovered_count);
    expect(recount.population_count).toBe(headlineBefore!.population_count);
    expect(recount.recipe_sha256).toBe(method.recipe_sha256);
    expect(recount.stop_list_sha256).toBe(method.stop_list_sha256);
    walk.baseline = { uncovered: recount.uncovered_before, population: recount.population_count };

    // The Console of this browser reads the child version back; the recount is not a number the response invented.
    const coverageAfter = await getJson(page.request, "/api/coverage");
    const headlineAfter = (coverageAfter.summaries as Summary[]).find(
      (s) => s.layer === "generous" && s.population === "unplanned_failure",
    );
    expect(headlineAfter?.uncovered_count).toBe(recount.uncovered_after);
    expect(headlineAfter?.population_count).toBe(recount.population_count);

    // The sheet: the draft is published, terminal, and the lesson it reserved is readable in the corpus.
    const after = await pollDraft(page.request, id);
    expect(after.draft.state).toBe("published");
    await page.goto(`/drafts/${encodeURIComponent(id)}`);
    await expect(page.locator('[data-component="draft-review"]')).toHaveAttribute("data-state", "published");
    await expect(page.getByRole("link", { name: `Read ${after.draft.opl_id_reserved}` })).toBeVisible();

    // The version badge of this browser's guided route now carries the child version, and no active mark with it.
    await page.goto("/demo/loop");
    const badge = page.locator("[data-version]").first();
    await expect(badge).toHaveAttribute("data-version", published.corpus_version.label);
    await expect(badge).not.toContainText("active");
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  });

  test("a second browser's numbers did not move (D-16)", async ({ browser }) => {
    test.skip(walk.baseline === null, "no publication ran in this walk, so there is nothing to be isolated from");
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      await signIn(other.request, "Engineer");
      const coverage = await getJson(other.request, "/api/coverage");
      const headline = (coverage.summaries as Summary[]).find(
        (s) => s.layer === "generous" && s.population === "unplanned_failure",
      );
      expect(headline, "the second browser was served no headline summary").toBeDefined();
      // The count the publishing browser recounted FROM, which is what a browser with no version of its own reads:
      // the child version is one sandbox's and reaches no other reader (INV-7, AC-LOOP-13).
      expect(headline!.uncovered_count).toBe(walk.baseline!.uncovered);
      expect(headline!.population_count).toBe(walk.baseline!.population);
    } finally {
      await other.close();
    }
  });
});
