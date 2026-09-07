// Surface 13, Admin (blueprint 6.2 surface 13, 6.3, 9.7, 9.9; INV-3). One column of the matrix opens this sheet and
// three roles do not hold it, so the sheet's first job is to refuse them by design and to write that refusal down.
// Its second is to show what one account may change or read: the corpus versions and the activation, the accounts
// beside the matrix, what the gateway is pinned to, and what the log recorded.
//
// This file never fires the activation. Activating a version changes what every reader of the deployment resolves
// against, which is a human act behind a two-press control and not a thing a test does; the control is asserted
// present, and the active version is read from GET /api/health at the start and at the end to show it did not move.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { getJson } from "./helpers";
import { hasPassword, missingPassword, signIn, type DemoRole } from "./roles";

type Version = { id: string; label: string; is_active: boolean };

/** The ledger as its own route serves it, at the page size the sheet reads (src/app/(hub)/admin/page.tsx). */
async function versionsOf(api: APIRequestContext): Promise<Version[]> {
  const response = await api.get("/api/admin/corpus/versions?page_size=200");
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Version[];
}

/** The order the sheet draws the matrix columns in (src/db/queries/admin-view.ts ROLE_ORDER). */
const ROLE_COLUMNS: readonly DemoRole[] = ["Engineer", "Reviewing Supervisor", "Manager", "Admin"];
/** 9.7: the two events whose payload carries a request text; they are out of the recent-rows panel entirely. */
const SAFETY_ACTIONS = ["safety.request_refused", "safety.request_served"];

async function noErrorState(page: Page): Promise<void> {
  await expect(page.locator('[data-designed-state="503"]')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
}

test.describe("the roles Admin is closed to (6.3, 9.9)", () => {
  // The Engineer is the run's stored session and needs no login of its own; the other two mint theirs.
  for (const role of ["Engineer", "Reviewing Supervisor", "Manager"] as const) {
    test(`the ${role} gets the designed 403, naming the column it was refused by`, async ({ page }) => {
      if (role !== "Engineer") {
        test.skip(!hasPassword(role), missingPassword(role));
        await signIn(page.request, role);
      }

      await page.goto("/admin");
      await expect(page.locator('[data-designed-state="403"]')).toBeVisible();
      await expect(page.getByRole("heading", { name: "Admin is closed to this role" })).toBeVisible();
      // The reason is machine-readable and names the role, the permission and the route, as the audit row does.
      await expect(page.getByText(`role=${role} permission=activate_version route=/admin`)).toBeVisible();
      await expect(page.getByRole("link", { name: /Back to Home/ })).toBeVisible();
      // No ledger, no activation control and no log reaches a role without the column.
      await expect(page.locator('[data-component="version-ledger"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Activate corpus version/ })).toHaveCount(0);
      await expect(page.locator('[data-component="audit-list"]')).toHaveCount(0);
      await noErrorState(page);
    });
  }

  test("every refusal is in the log, under the route it was refused on (9.7)", async ({ page }) => {
    test.skip(!hasPassword("Admin"), missingPassword("Admin"));

    // Refuse this browser once, deliberately, so the row this case looks for is this run's own.
    await page.goto("/admin");
    await expect(page.locator('[data-designed-state="403"]')).toBeVisible();

    await signIn(page.request, "Admin");
    await page.goto("/admin");
    const violations = page.locator('[data-component="audit-row"][data-action="auth.role_violation"]');
    await expect(violations.first()).toBeVisible();
    // The row names the permission the refusal was about and the route it happened on.
    await expect(violations.filter({ hasText: "activate_version" }).first()).toBeVisible();
    await expect(violations.filter({ hasText: "/admin" }).first()).toBeVisible();
    await noErrorState(page);
  });
});

test.describe("the sheet Admin does hold (6.2 surface 13)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasPassword("Admin"), missingPassword("Admin"));
    await signIn(page.request, "Admin");
  });

  test("the version ledger carries every version, exactly one of them active", async ({ page }) => {
    const health = await getJson(page.request, "/api/health");
    const versions = await versionsOf(page.request);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
    const ledger = page.locator('[data-component="version-ledger"]');
    await expect(ledger).toBeVisible();
    // One row per version the route serves: nothing is hidden and nothing is invented.
    await expect(ledger.locator("li[data-version]")).toHaveCount(versions.length);
    await expect(ledger.locator("li[data-active]")).toHaveCount(1);
    // The active row is the version /api/health reports, which is the label every unsandboxed read resolves against.
    await expect(ledger.locator("li[data-active]")).toContainText(String(health.corpus_version));
    await noErrorState(page);
  });

  test("the activation is offered on every version that is not active, and this test does not press it", async ({ page }) => {
    const before = await getJson(page.request, "/api/health");
    const inactive = (await versionsOf(page.request)).filter((v) => !v.is_active).length;

    await page.goto("/admin");
    const activate = page.getByRole("button", { name: /^Activate corpus version/ });
    await expect(activate).toHaveCount(inactive);
    if (inactive > 0) {
      // Present, armed by a first press and committed by a second; this test does neither.
      await expect(activate.first()).toBeVisible();
      await expect(activate.first()).toBeEnabled();
    }

    // Nothing was activated: the active version is the one it was before this sheet was opened.
    const after = await getJson(page.request, "/api/health");
    expect(after.corpus_version).toBe(before.corpus_version);
  });

  test("the pins, the accounts and the matrix that keeps Admin out of the loop (INV-3)", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator('[data-component="gateway-role-table"]')).toBeVisible();
    await expect(page.locator('[data-component="gateway-role-table"] tbody tr').first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accounts and roles" })).toBeVisible();

    // The matrix as the routes read it. The Admin column holds nothing of the loop.
    const matrix = page.locator('[data-component="permission-matrix"]');
    await expect(matrix).toBeVisible();
    const admin = ROLE_COLUMNS.indexOf("Admin");
    for (const permission of ["view_drafts", "create_draft", "decide", "publish"]) {
      const row = matrix.locator("tbody tr").filter({ has: page.getByRole("rowheader", { name: permission, exact: true }) });
      await expect(row.locator("td").nth(admin), `${permission} for Admin`).toHaveText("no");
    }
    // And it holds the one column that opens this sheet.
    const activation = matrix.locator("tbody tr").filter({ has: page.getByRole("rowheader", { name: "activate_version", exact: true }) });
    await expect(activation.locator("td").nth(admin)).toContainText("yes");
    for (const role of ["Engineer", "Reviewing Supervisor", "Manager"] as const) {
      await expect(activation.locator("td").nth(ROLE_COLUMNS.indexOf(role)), `activate_version for ${role}`).toHaveText("no");
    }
    await noErrorState(page);
  });

  test("the log is on the sheet, and the two safety events are not on the recent panel (9.7)", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator('[data-component="audit-list"]').first()).toBeVisible();
    await expect(page.locator('[data-component="audit-row"]').first()).toBeVisible();

    // The recent-rows panel cannot show a request text, because the two actions that carry one are not in its scope.
    for (const action of SAFETY_ACTIONS) {
      await expect(page.locator(`[data-component="audit-row"][data-action="${action}"]`)).toHaveCount(0);
    }
    // The safety view is a deliberate, separately audited read; it is offered, and this test does not open it.
    await expect(page.getByRole("link", { name: /Open the safety events/ })).toBeVisible();
    await noErrorState(page);
  });
});
