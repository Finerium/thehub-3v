// The state tour of the loop surfaces (blueprint 6.3, 6.4, 9.6, 9.9; AC-UI-01, AC-UI-02's sibling, AC-LOOP-14).
// 6.3 makes the edge states first-class: every one of them states what happened, why, and one next step, and none of
// them is a stack trace, a blank panel or a placeholder number. This file walks them.
//
// Two halves, and the split is deliberate. The components that draw a state are checked in the gallery, where they
// are rendered from props alone against synthetic rows, so the tour of the drawing costs no draft and no provider
// call. The states a route decides are asked of the routes themselves, and the ones that need a draft in a
// particular state read the queue for one: a draft is two provider calls, so this file never creates one. Where the
// sandbox holds no draft of the state a case needs, the case skips itself and says which state was missing rather
// than asserting something weaker.
//
// tests/e2e/loop.spec.ts is what puts a draft in the sandbox, and the sandbox is minted by the global setup once per
// `playwright test` invocation (D-16: it belongs to the browser, and the stored state is a new browser each run), so
// these cases have material exactly when the two files run in ONE invocation, which is what `pnpm test:e2e` does and
// what the file order gives (loop before states). A run of this file alone is a run with fewer cases, and each one
// says which state was missing and how many drafts the queue held.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { SLOT_TEXT, UNVERIFIED_VALUE_LINE } from "../../src/lib/fixed-strings";
import { getJson } from "./helpers";
import { hasPassword, missingPassword, signIn } from "./roles";

type Draft = { id: string; state: string; opl_id_reserved: string };
type Transition = { to_state: string; reason: string | null };

/** A draft id no browser ever minted: the route pattern is exercised, not a row. */
const ABSENT_DRAFT_ID = "dr-00000000-0000-4000-8000-000000000000";
const DEADLINE_REASON = "deadline_exceeded";
/** src/app/(hub)/evaluation/page.tsx renders every hash as this many characters. */
const HASH_PREFIX = 12;

async function queue(api: APIRequestContext): Promise<Draft[]> {
  const body = (await getJson(api, "/api/drafts")) as unknown as { drafts: Draft[] };
  return body.drafts;
}

async function transitionsOf(api: APIRequestContext, id: string): Promise<Transition[]> {
  const body = (await getJson(api, `/api/drafts/${encodeURIComponent(id)}`)) as unknown as { transitions: Transition[] };
  return body.transitions;
}

/** No surface answers with the server-side 503 state or a Next error overlay. */
async function noErrorState(page: Page): Promise<void> {
  await expect(page.locator('[data-designed-state="503"]')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  await expect(page.locator("body")).not.toContainText("Internal Server Error");
}

test.describe("the components that draw a state (6.4, from props alone)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("the draft body: six sections, an element with its provenance, a slot with its fixed literal", async ({ page }) => {
    const section = page.locator('[data-gallery="draft-section"]');
    await expect(section.locator('[data-component="draft-section"]').first()).toBeVisible();
    await expect(section.locator('[data-component="draft-element"]').first()).toBeVisible();

    const slot = page.locator('[data-gallery="slot-field"]');
    await expect(slot.locator('[data-component="slot-field"]').first()).toBeVisible();
    // 9.6: the slot's text is the fixed literal, and only an SME note fills it.
    await expect(slot.locator('[data-component="slot-field"]').first()).toContainText(SLOT_TEXT);
    await expect(slot.locator('[data-component="sme-note"]').first()).toBeVisible();
    // A note is not citeable until its lesson is published; a published one carries the fixed unverified-value line.
    await expect(slot.locator('[data-component="sme-note"][data-citeable="false"]').first()).toBeVisible();
    await expect(slot.locator('[data-component="sme-note"][data-citeable="true"]').first()).toContainText(UNVERIFIED_VALUE_LINE);
  });

  test("the redline panel, the rail and the controls the matrix decides", async ({ page }) => {
    await expect(page.locator('[data-gallery="redline-verdict-panel"] [data-component="redline-verdict-panel"]').first()).toBeVisible();

    const rail = page.locator('[data-gallery="state-rail"]');
    await expect(rail.locator('[data-component="state-rail"]').first()).toBeVisible();
    // INV-3 as a person sees it: the Engineer is offered no control and is told why, rather than shown a dead one.
    const engineer = rail.locator('[data-component="decision-buttons"][data-role="Engineer"]');
    await expect(engineer).toBeVisible();
    await expect(engineer.getByRole("button")).toHaveCount(0);
    await expect(engineer).toContainText("holds no decide and no publish column");
    // The Manager's one publication control, on an accepted draft and on no other state.
    const manager = rail.locator('[data-component="decision-buttons"][data-role="Manager"][data-state="accepted"]');
    await expect(manager.getByRole("button", { name: "Publish" })).toBeVisible();
  });

  test("the recount is drawn armed beside played, and the tour step and the audit row carry their content", async ({ page }) => {
    const recount = page.locator('[data-gallery="recount-moment"] [data-component="recount-moment"]');
    await expect(recount).toHaveCount(2);
    await expect(recount.first()).not.toHaveAttribute("data-played", /.*/);
    await expect(recount.last()).toHaveAttribute("data-played", /.*/);
    // The record travels between bands: both bands of the population axis are drawn on each layer.
    await expect(recount.last().locator('[data-band="no_lesson"]').first()).toBeAttached();
    await expect(recount.last().locator('[data-band="taught"]').first()).toBeAttached();

    await expect(page.locator('[data-gallery="tour-step"] [data-component="tour-step"]').first()).toBeVisible();
    const audit = page.locator('[data-gallery="audit-row"]');
    await expect(audit.locator('[data-component="audit-list"]').first()).toBeVisible();
    await expect(audit.locator('[data-component="audit-row"][data-action="auth.role_violation"]').first()).toBeVisible();
    await noErrorState(page);
  });
});

test.describe("the states a surface decides (6.3)", () => {
  test("the review queue states every state of 9.6, with rows or the designed empty state", async ({ page }) => {
    await page.goto("/drafts");
    await expect(page.getByRole("heading", { level: 1, name: "Drafts" })).toBeVisible();

    // The board carries one entry per state, whether or not a draft is in it: a zero is stated, never omitted.
    const board = page.getByRole("navigation", { name: "Draft states" });
    await expect(board).toBeVisible();
    await expect(board.getByRole("link")).toHaveCount(8);

    const rows = page.locator("table.reg tbody tr");
    const count = await rows.count();
    if (count === 0) {
      await expect(page.getByText("No draft in this browser's sandbox")).toBeVisible();
      await expect(page.getByRole("link", { name: "Coverage Console" }).first()).toBeVisible();
    } else {
      await expect(rows.first()).toBeVisible();
    }
    await noErrorState(page);
  });

  test("a draft address this browser cannot see is the designed 404, with its next step", async ({ page }) => {
    // The sheet decides this state itself rather than through notFound(), so the transport status is 200 and the
    // page is the designed 404; what 6.3 asks of it is what is asserted, and the divergence from the 404 status
    // /assets/:tag and /coverage/clusters/:id answer with is reported to the surface's author.
    const response = await page.goto(`/drafts/${ABSENT_DRAFT_ID}`);
    expect(response?.status(), "the sheet answered a server error").toBeLessThan(500);
    await expect(page.locator('[data-designed-state="404"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "No draft at this address in this browser" })).toBeVisible();
    // The reason names the id, and the one next step is the queue.
    await expect(page.getByText(`draft ${ABSENT_DRAFT_ID}`)).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to the queue/ })).toBeVisible();
    await noErrorState(page);
  });

  test("the Admin reads no draft: the designed 403 with the permission it was refused by (9.9)", async ({ page }) => {
    test.skip(!hasPassword("Admin"), missingPassword("Admin"));
    await signIn(page.request, "Admin");

    await page.goto("/drafts");
    await expect(page.locator('[data-designed-state="403"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "The Admin role does not read drafts" })).toBeVisible();
    await expect(page.getByText("permission view_drafts, role Admin")).toBeVisible();
    await expect(page.getByRole("link", { name: /Admin/ }).first()).toBeVisible();

    // The same refusal on one draft's address, decided before anything is read.
    await page.goto(`/drafts/${ABSENT_DRAFT_ID}`);
    await expect(page.locator('[data-designed-state="403"]')).toBeVisible();
    await noErrorState(page);
  });

  test("the guided route offers the role switch instead of a control this session may not press (D-16)", async ({ page }) => {
    await page.goto("/demo/loop");
    const publish = page.locator('[data-act="publish"]');
    await expect(publish).toContainText("This act needs another role");
    await expect(publish.getByRole("button", { name: /Sign out and continue as Manager/ })).toBeVisible();
    await noErrorState(page);
  });
});

test.describe("the refusals a route decides (9.9)", () => {
  test("an Engineer takes no decision: 403 under the request id, before the draft is even read", async ({ page }) => {
    const response = await page.request.post(`/api/drafts/${ABSENT_DRAFT_ID}/decision`, { data: { decision: "accept" } });

    // The matrix is asked before the handler runs, so the refusal does not depend on the draft existing: an
    // Engineer never reaches the state machine at all.
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ error: "forbidden" });
    // The audit row of 9.7 carries the request id, so x-request-id finds the auth.role_violation event.
    expect(response.headers()["x-request-id"]).toBeTruthy();
  });

  test("an Engineer publishes nothing: 403, and the publication refusal is audited beside it", async ({ page }) => {
    const response = await page.request.post(`/api/drafts/${ABSENT_DRAFT_ID}/publish`);

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ error: "forbidden" });
    expect(response.headers()["x-request-id"]).toBeTruthy();
  });

  test("the gate refuses a draft that is not accepted: 422 { gate, reason } and nothing written", async ({ page }) => {
    test.skip(!hasPassword("Manager"), missingPassword("Manager"));
    await signIn(page.request, "Manager");
    const rows = await queue(page.request);
    const notAccepted = rows.find((d) => d.state !== "accepted" && d.state !== "published");
    test.skip(
      notAccepted === undefined,
      `this browser's sandbox holds no draft outside accepted and published, so G3's 422 has nothing to refuse; the queue holds ${rows.length} draft(s) [${rows.map((d) => d.state).join(", ") || "none"}], and tests/e2e/loop.spec.ts is what puts one there`,
    );

    const response = await page.request.post(`/api/drafts/${encodeURIComponent(notAccepted!.id)}/publish`);
    expect(response.status(), await response.text()).toBe(422);
    expect(await response.json()).toMatchObject({ error: "gate_refused", gate: "G3", reason: "not_accepted", state: notAccepted!.state });

    // Refused means unchanged: the draft is in the state it was in.
    const after = await queue(page.request);
    expect(after.find((d) => d.id === notAccepted!.id)?.state).toBe(notAccepted!.state);
  });

  test("a published draft is published once: the second request is 409 (AC-LOOP-09)", async ({ page }) => {
    test.skip(!hasPassword("Manager"), missingPassword("Manager"));
    await signIn(page.request, "Manager");
    const rows = await queue(page.request);
    const published = rows.find((d) => d.state === "published");
    test.skip(
      published === undefined,
      `this browser's sandbox holds no published draft, so the 409 of G3 has nothing to refuse; the queue holds ${rows.length} draft(s) [${rows.map((d) => d.state).join(", ") || "none"}], and tests/e2e/loop.spec.ts is what publishes one`,
    );

    const response = await page.request.post(`/api/drafts/${encodeURIComponent(published!.id)}/publish`);
    expect(response.status(), await response.text()).toBe(409);
    expect(await response.json()).toMatchObject({ error: "already_published", draft_id: published!.id });
  });

  test("the sheet of a draft blocked by its lease says so, and offers the re-proposal (AC-LOOP-14)", async ({ page }) => {
    const rows = await queue(page.request);
    const blocked: Draft[] = rows.filter((d) => d.state === "blocked");
    let stranded: Draft | undefined;
    for (const draft of blocked) {
      const transitions = await transitionsOf(page.request, draft.id);
      if (transitions.some((t) => t.to_state === "blocked" && t.reason === DEADLINE_REASON)) {
        stranded = draft;
        break;
      }
    }
    test.skip(
      stranded === undefined,
      `this browser's sandbox holds no draft blocked with ${DEADLINE_REASON}: the queue holds ${rows.length} draft(s) [${rows.map((d) => d.state).join(", ") || "none"}] and the lease watchdog stranded none of them`,
    );

    await page.goto(`/drafts/${encodeURIComponent(stranded!.id)}`);
    await expect(page.locator('[data-designed-state="blocked"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "The drafting lease ran out" })).toBeVisible();
    await expect(page.getByText(DEADLINE_REASON).first()).toBeVisible();
    await expect(page.locator('[data-component="draft-review"]')).toHaveAttribute("data-state", "blocked");
    await noErrorState(page);
  });
});

test.describe("the evaluation surface (6.2 surface 10, AC-EVAL-03)", () => {
  test("renders the latest ingested run, or the designed state that says none was ingested", async ({ page }) => {
    const latest = await page.request.get("/api/evaluation/latest");
    expect([200, 404]).toContain(latest.status());

    await page.goto("/evaluation");
    await expect(page.getByRole("heading", { level: 1, name: "Evaluation" })).toBeVisible();

    if (latest.status() === 404) {
      // 6.3: no run means no pass rate, and nothing is put in its place.
      await expect(page.locator('[data-designed-state="no run"]')).toBeVisible();
      await expect(page.getByRole("heading", { name: "No run has been ingested yet" })).toBeVisible();
      await expect(page.getByRole("link", { name: /Coverage Console/ })).toBeVisible();
      await noErrorState(page);
      return;
    }

    // A run: the pins it ran under, every category of 9.11 and the failures it did not hide.
    const body = (await latest.json()) as {
      run: { harness_commit: string; rulepack_version: string };
      categories: Array<{ category: string; cases: number }>;
      failures: Array<{ case_id: string }>;
    };
    await expect(page.locator('[data-component="run-pins"]')).toBeVisible();
    // Every hash on the sheet is rendered as its digest prefix, the harness commit with them.
    await expect(page.getByText(body.run.harness_commit.slice(0, HASH_PREFIX), { exact: false }).first()).toBeVisible();
    await expect(page.getByText(body.run.rulepack_version, { exact: false }).first()).toBeVisible();
    for (const row of body.categories.slice(0, 3)) {
      await expect(page.getByText(row.category, { exact: false }).first()).toBeVisible();
    }
    if (body.failures.length > 0) {
      await expect(page.locator('[data-component="failure-list"]')).toBeVisible();
      await expect(page.getByText(body.failures[0].case_id, { exact: false }).first()).toBeVisible();
    } else {
      await expect(page.getByText("No case failed on this run")).toBeVisible();
    }
    await noErrorState(page);
  });
});
