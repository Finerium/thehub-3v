// AC-UI-02, the one path a reader takes from a claim to the page it came from: a citation chip on the asset sheet
// opens the glass drawer at its span, the drawer's link resolves to /documents/:id#page=n&span=<span_id>, and the
// viewer there renders that page with that span marked. The chip's own citation is read from GET /api/assets/:tag,
// so the document id, the page and the span id are the seeded corpus's, never typed here.
//
// The journey is asserted in three steps (the chip, the hop, the viewer) so a failure names which of them broke
// rather than reporting one long timeout.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { TAG, readAsset, type Citation } from "./helpers";

/** The chip that carries `span_id`, with the citation the API resolved for it. */
async function chipOf(page: Page, citations: Record<string, Citation>): Promise<{ chip: Locator; citation: Citation }> {
  const chips = page.locator('[data-component="citation-chip"]');
  await expect(chips.first()).toBeVisible();
  const spans = await chips.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-span") ?? ""));
  const index = spans.findIndex((s) => s.length > 0 && citations[s] !== undefined);
  expect(index, `no chip on /assets/${TAG} carries a span the asset read resolved`).toBeGreaterThanOrEqual(0);
  return { chip: chips.nth(index), citation: citations[spans[index]] };
}

/** The 6.2 anchor itself: `#page=n&span=<span_id>`, written once here and compared byte for byte. */
const anchorFragment = (c: Citation) => `#page=${c.page}&span=${encodeURIComponent(c.span_id)}`;
/** The bare anchor address, as a reviewer would type or paste one: no query, the fragment alone. */
const anchorHref = (c: Citation) => `/documents/${encodeURIComponent(c.document_id)}${anchorFragment(c)}`;
/**
 * What a chip's link must be: the frozen anchor at the end, and the same page and span in the query, because a
 * fragment never reaches the server and the first render would otherwise show page one (AC-UI-02).
 */
const chipHref = (c: Citation) =>
  `/documents/${encodeURIComponent(c.document_id)}?page=${c.page}&span=${encodeURIComponent(c.span_id)}${anchorFragment(c)}`;

/** The viewer showing the page the address named, with the span marked on it. */
async function expectSpanInViewer(page: Page, citation: Citation): Promise<void> {
  const viewer = page.locator('[data-component="page-viewer"]');
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute("data-page", String(citation.page));
  await expect(viewer).toHaveAttribute("data-document", citation.document_id);
  await expect(viewer.locator(`.pager-strip[data-span="${citation.span_id}"]`)).toBeVisible();
  await expect(page.getByText("The address resolved span")).toContainText(citation.span_id);
}

test.describe("chip to span (AC-UI-02)", () => {
  test("a citation chip opens the drawer at its span, with the viewer link in the 6.2 anchor form", async ({ page }) => {
    const asset = await readAsset(page.request);
    await page.goto(`/assets/${TAG}`);
    const { chip, citation } = await chipOf(page, asset.citations);

    // The chip face states the document, the revision and the page it cites (6.4 CitationChip).
    await expect(chip).toContainText(citation.doc_no);
    await expect(chip).toContainText(`rev ${citation.revision}`);
    await expect(chip).toContainText(`p. ${citation.page}`);
    await expect(chip).toHaveAttribute("aria-expanded", "false");

    await chip.click();
    const drawer = page.locator('dialog[data-component="glass-drawer"]');
    await expect(drawer).toBeVisible();
    await expect(chip).toHaveAttribute("aria-expanded", "true");
    await expect(drawer).toContainText(citation.span_id);
    await expect(drawer).toContainText(citation.document_id);
    await expect(drawer).toContainText(citation.approval_status_text);

    const viewerLink = drawer.getByRole("link", { name: /Open in the document viewer/ });
    await expect(viewerLink).toHaveAttribute("href", chipHref(citation));
    // The frozen form of 6.2 is still the tail of the address, whatever the query carries.
    await expect(viewerLink).toHaveAttribute("href", new RegExp(`${anchorFragment(citation).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  });

  test("following the drawer's link resolves the span in the viewer", async ({ page }) => {
    const asset = await readAsset(page.request);
    await page.goto(`/assets/${TAG}`);
    const { chip, citation } = await chipOf(page, asset.citations);
    await chip.click();
    await page.locator('dialog[data-component="glass-drawer"]').getByRole("link", { name: /Open in the document viewer/ }).click();

    await page.waitForURL((url) => url.pathname === `/documents/${citation.document_id}`);
    // The viewer resolves the span from the query, so the fragment must reach it (the surface mirrors it).
    const url = new URL(page.url());
    expect(
      { page: url.searchParams.get("page"), span: url.searchParams.get("span") },
      `the anchor did not reach the viewer as a query; the browser is at ${page.url()}`,
    ).toEqual({ page: String(citation.page), span: citation.span_id });
    await expectSpanInViewer(page, citation);
  });

  test("the anchor opened on its own resolves the span in the viewer", async ({ page }) => {
    const asset = await readAsset(page.request);
    await page.goto(`/assets/${TAG}`);
    const { citation } = await chipOf(page, asset.citations);

    await page.goto(anchorHref(citation));
    await page.waitForURL((url) => url.searchParams.get("span") === citation.span_id);
    await expectSpanInViewer(page, citation);
  });

  test("Escape closes the drawer and returns focus to the chip that opened it", async ({ page }) => {
    const asset = await readAsset(page.request);
    await page.goto(`/assets/${TAG}`);
    const { chip } = await chipOf(page, asset.citations);
    await chip.click();
    await expect(page.locator('dialog[data-component="glass-drawer"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('dialog[data-component="glass-drawer"]')).toHaveCount(0);
    await expect(chip).toBeFocused();
  });
});

test.describe("keyboard (AC-UI-05)", () => {
  test("Tab reaches a citation chip and Enter opens its drawer", async ({ page }) => {
    await page.goto(`/assets/${TAG}`);
    await expect(page.locator('[data-component="citation-chip"]').first()).toBeVisible();

    // Walk the tab order from the top of the document until the focus lands on a chip; the walk is bounded, so a
    // chip that no keyboard can reach fails here rather than hanging.
    await page.locator("body").press("Tab");
    let reached = false;
    for (let i = 0; i < 400 && !reached; i += 1) {
      reached = await page.evaluate(() => document.activeElement?.getAttribute("data-component") === "citation-chip");
      if (!reached) await page.keyboard.press("Tab");
    }
    expect(reached, "no citation chip was reachable by Tab within 400 stops").toBe(true);

    const spanId = await page.evaluate(() => document.activeElement?.getAttribute("data-span") ?? "");
    expect(spanId.length).toBeGreaterThan(0);
    await page.keyboard.press("Enter");
    const drawer = page.locator('dialog[data-component="glass-drawer"]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText(spanId);
  });
});
