// AC-UI-05: "Home's 24 seeded chips each return a full packet with the gateway unreachable; the packets are
// committed to the bundle and their hashes are a CI fixture. Expected: 24 of 24."
//
// What a browser can prove of that, and what it cannot. It cannot unplug the provider, so "with the gateway
// unreachable" is asserted as the property that makes an unreachable gateway survivable: the chip's answer is
// rebuilt from the stored packet and the trace it leaves records no gateway call at all (9.17, src/answer/seeded.ts).
// A chip that reached the provider would carry calls on its trace and fail here.
//
// The count is read, never typed: the fleet comes from GET /api/assets and the chips from Home itself, so this file
// states 24 only as the criterion's own figure and reports the measured number in the failure message.
//
// Nothing here types a question. The one chip that plays is played by opening its own link, which is the seeded
// lane and not the answer lane: zero provider calls by construction. The other chips are checked by a server render
// of their address, which runs no client script and so plays nothing.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { getJson } from "./helpers";

/** 6.2 surface 1 and 9.17: three per asset, over the eight assets of the fleet. */
const PER_ASSET = 3;
const EXPECTED = 24;

/** The marker the Ask surface renders when a `?chip=` link resolved to a seeded_chip row (AskClient). */
const SEEDED_LEAD = 'data-component="seeded-chip-lead"';
/** The designed state the Ask surface renders when it did not (6.3, never a fake answer). */
const NOT_SEEDED = "This chip is not seeded yet";

type ChipLink = { id: string; href: string; question: string; tag: string };

/** Every seeded chip Home renders, with the asset panel it sits in. */
async function chipsOnHome(api: APIRequestContext, page: import("@playwright/test").Page): Promise<ChipLink[]> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Seeded questions" })).toBeVisible();
  const panels = page.locator('section[aria-labelledby="chips-heading"] .glass');
  const found: ChipLink[] = [];
  for (const panel of await panels.all()) {
    const tag = ((await panel.locator("p.mono").first().textContent()) ?? "").trim();
    for (const link of await panel.locator('a[href^="/ask?chip="]').all()) {
      const href = (await link.getAttribute("href")) ?? "";
      found.push({
        id: new URL(href, "https://placeholder.invalid").searchParams.get("chip") ?? "",
        href,
        question: ((await link.textContent()) ?? "").trim(),
        tag,
      });
    }
  }
  // The fleet is read from the route that owns it; the assertion below compares the two, never a typed list.
  const fleet = (await getJson(api, "/api/assets")) as unknown as { assets: Array<{ tag: string }> };
  expect(fleet.assets.length, "GET /api/assets carried no fleet").toBeGreaterThan(0);
  return found;
}

test.describe("Home's seeded chips (AC-UI-05)", () => {
  test("Home carries 24 seeded chips, three per asset, each with its own chip id", async ({ page }) => {
    const chips = await chipsOnHome(page.request, page);
    const byTag = new Map<string, number>();
    for (const c of chips) byTag.set(c.tag, (byTag.get(c.tag) ?? 0) + 1);
    const fleet = (await getJson(page.request, "/api/assets")) as unknown as { assets: Array<{ tag: string }> };

    expect(
      chips.length,
      `AC-UI-05 expects ${EXPECTED} seeded chips on Home; the deployment renders ${chips.length}. ` +
        `Nothing writes a seeded_chip row (scripts/db/seed.ts), so Home draws the designed empty state instead of any chip.`,
    ).toBe(EXPECTED);
    // Three per asset, over every asset of the fleet: no asset silently carries none and no asset carries four.
    expect([...byTag.entries()].sort(), "seeded chips per asset").toEqual(fleet.assets.map((a) => [a.tag, PER_ASSET] as [string, number]).sort());
    expect(new Set(chips.map((c) => c.id)).size, "two chips share a chip id").toBe(chips.length);
    expect(chips.filter((c) => c.question.length === 0), "a chip with no question on its face").toEqual([]);
  });

  test("every chip link resolves to its stored row, none to the designed not-seeded state", async ({ page }) => {
    const chips = await chipsOnHome(page.request, page);
    test.skip(chips.length === 0, "Home renders no seeded chip, so there is no link to resolve (see the count case)");

    // A server render of each address: no client script runs, so nothing is asked and nothing is written.
    const missing: string[] = [];
    for (const chip of chips) {
      const response = await page.request.get(chip.href);
      expect(response.status(), `GET ${chip.href}`).toBe(200);
      const html = await response.text();
      if (!html.includes(SEEDED_LEAD) || html.includes(NOT_SEEDED)) missing.push(chip.id);
    }
    expect(missing, `chip ids whose ?chip= link resolved to no stored packet (${chips.length - missing.length} of ${chips.length} resolved)`).toEqual([]);
  });

  test("a chip plays from storage: the packet renders and its trace records no gateway call", async ({ page }) => {
    const chips = await chipsOnHome(page.request, page);
    test.skip(chips.length === 0, "Home renders no seeded chip, so none can be played (see the count case)");

    const chip = chips[0];
    await page.goto(chip.href);
    // The seeded lead states which chip is playing; the packet is the stored one, rebuilt through the real stream.
    await expect(page.locator('[data-component="seeded-chip-lead"]')).toBeVisible();
    await expect(page.locator('[data-component="packet"]')).toBeVisible();

    // The trace the play left, and the gateway calls inside its window: none, which is what survives an
    // unreachable gateway. The id is read from the surface, never typed.
    const traceLink = page.getByRole("link", { name: /trace/i }).first();
    const href = (await traceLink.getAttribute("href")) ?? "";
    const id = href.split("/").pop() ?? "";
    expect(id.length, "the played packet carried no trace link").toBeGreaterThan(0);
    const replay = (await getJson(page.request, `/api/trace/${encodeURIComponent(id)}`)) as unknown as {
      calls: unknown[];
      calls_expected: number | null;
    };
    expect(replay.calls, `the seeded chip ${chip.id} reached the gateway`).toEqual([]);
    expect(replay.calls_expected, `the trace of seeded chip ${chip.id} stamped a non-zero gateway-call count`).toBe(0);
  });
});
