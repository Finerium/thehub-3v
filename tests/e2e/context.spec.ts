// AC-CTX-02 (the P&ID hotspot layer), AC-CTX-03 (the interlock matrix), AC-CTX-04 (the connector panel) and
// AC-CTX-05 (the operational-context panel): the four asset-context surfaces of blueprint 6.2 and 6.4, each of
// which names a browser check in its own expectation and none of which any spec walked before this file.
//
// The conventions are tests/e2e/surfaces.spec.ts's. Nothing here types an id, a count, a setpoint, a digest or a
// figure of the seeded corpus: every expected value is read at run time from the route that owns it, from
// bundle/fixtures.json through helpers.ts, or from the contract file in this repository. What is typed is only what
// the criterion itself names in words: the instrument tag VSHH-1201, the as-drawn text "S5LL 2305", the rule id
// CD-18 and the tag EA-5601, each of which the criterion puts in its own expectation.
//
// WHICH CLAUSE IS PROVED BY WHICH CASE
//   AC-CTX-02  Set 1 opens with at least four working hotspots      "the Set 1 P&ID places every hotspot ..."
//              the VSHH-1201 card: typed trip row, work order,      "the VSHH-1201 hotspot opens its typed trip row ..."
//              its root cause and its place in the chain
//              Sets 4 and 5 open with hotspots                      "the Set 4 / Set 5 P&ID opens with its hotspots"
//              every Set 2 hotspot carries its as-drawn text and    "every Set 2 hotspot states what the sheet draws ..."
//              its binding; "S5LL 2305" opens the row it stands     "the Set 2 hotspot drawn 'S5LL 2305' opens ..."
//              for and the sheet shows the CD-18 finding
//   AC-CTX-03  every sheet with the SIL badge it states             "the fleet register draws one matrix per sheet ..."
//              the marked effects and their final elements          "every sheet's rows stand against its effect columns ..."
//              the permissives as their gate                        "every sheet's start permissives render as their gate"
//              the notes linked to their page                       "every sheet's notes carry the citation ..."
//              EA-5601 as a control loop with no SIL                "EA-5601 renders as a control loop ..."
//              the same matrix on /assets/:tag                      "every asset page draws the matrix of its own sheet"
//   AC-CTX-04  three contracts, specified and not connected         "the connector sheet states three contracts ..."
//              the schema route serves the repository file          "GET /api/connectors/:name/schema answers with ..."
//              the digital twin's deep link is empty                "the digital twin row's deep link is empty ..."
//              nothing on the sheet is typed                        "every field the sheet prints is the contract's own"
//   AC-CTX-05  23 unplanned, 8 planned flagged, median 34.0 h,      "the operational-context panel reconciles ..."
//              136 of 211 at 24 h or more, 64.5 percent
//              the panel on every failure surface                   "every asset's failure surface carries the panel ..."
//              EA-5601 states no protective function                "EA-5601's panel states that no protective function ..."
//              the demand history stated as not recorded            "the demand history is stated as not recorded ..."
//
// WHAT A BROWSER CANNOT CHECK, AND WHY
//   AC-CTX-02  the hotspots are placed over the sheet's own drawing. This deployment holds no page derivative for
//              any P&ID (`pid_page_available` is false on all eight), so the underlay is the stated-absence plate
//              of 6.3 and no case here asserts that a pin sits over the symbol it names. Whether a fractional
//              coordinate lands on the right symbol is a reading of the supplied image, not a DOM fact.
//   AC-CTX-04  "each contract validates as JSON Schema 2020-12" is a compile, not a render: `pnpm contracts:check`
//              (scripts/contracts-check.mjs) compiles every schema file with Ajv in 2020-12 strict mode. This file
//              asserts the served bytes declare that dialect and parse, which is the part a browser can see.
//              "no mocked data renders (string and screenshot audit)" is likewise out of the browser; the case
//              "every field the sheet prints is the contract's own" proves the same property from the other end,
//              by reading each rendered field back out of the served contract bytes.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { STATUS_WORDING } from "../../src/lib/fixed-strings";
import { fixtures, getJson } from "./helpers";

// ---------------------------------------------------------------------------------------------------------------
// What the routes hand this file. Every shape is the section 9.3 / 9.9 shape, narrowed to the fields asserted on.
// ---------------------------------------------------------------------------------------------------------------
type Hotspot = {
  id: string;
  as_drawn_text: string;
  bound_tag: string | null;
  unbound_reason: string | null;
  foreign: boolean;
  role: string;
  drawn_setpoint: string | null;
};

type Sidecar = { set: number; document_id: string; hotspots: Hotspot[] };

type Effect = { effect_id: string; final_element: string; marked: boolean };

type InterlockRow = {
  id: string;
  row_id: string;
  row_kind: string;
  initiator: string;
  instrument_tag: string;
  setpoint_text: string;
  voting: string | null;
  vote_cell_text: string;
  effects: Effect[];
  span_id: string;
};

type Note = { n: number; text: string; span_id: string };

type Interlock = {
  seq_id: string | null;
  equipment_tag: string;
  logic_kind: "trip_logic" | "control_loop_only";
  sil_sheet: number | null;
  ce_doc_no: string;
  ce_revision: string;
  notes: Note[];
  permissive_gate: string | null;
};

type Permissive = { seq_id: string; n: number; text: string; signal_tag: string | null; span_id: string };

type Citation = { doc_no: string; revision: string; page: number; span_id: string };

/** GET /api/assets/:tag, the asset page's own read (9.9). */
type AssetContext = {
  equipment: { tag: string; name: string; interlock_ref: string };
  interlock: Interlock | null;
  rows: InterlockRow[];
  permissives: Permissive[];
  hotspots: Sidecar | null;
  pid_page_available: boolean;
  citations: Record<string, Citation>;
};

type WorkOrder = {
  wo_number: string;
  problem_description: string;
  root_cause: string;
  corrective_action: string | null;
  remarks: string | null;
};

type CausalLink = { id: string; from_wo: string; to_wo: string; mechanism_noun: string; interval_days: number };

type ConnectorDescriptor = {
  name: string;
  title: string;
  description: string;
  status: string;
  sync: string;
  conflict_rule: string;
  failure_behaviour: string;
  blueprint: string;
  schema_id: string;
  schema_href: string;
  schema_media_type: string;
  file: string;
  sha256: string;
  byte_length: number;
  definitions: string[];
};

// ---------------------------------------------------------------------------------------------------------------
// The reads. One fleet read per run, memoised: the suite runs one worker against one seeded database and these
// surfaces are read-only, so nine identical requests per case would only spend the deployment's rate limit.
// ---------------------------------------------------------------------------------------------------------------
let fleetRead: Promise<AssetContext[]> | null = null;

function assetContexts(api: APIRequestContext): Promise<AssetContext[]> {
  fleetRead ??= (async (): Promise<AssetContext[]> => {
    const fleet = (await getJson(api, "/api/assets")) as unknown as { assets: Array<{ equipment: { tag: string } }> };
    const tags = fleet.assets.map((a) => a.equipment.tag);
    expect(tags.length, "GET /api/assets carried no asset").toBeGreaterThan(0);
    const reads: AssetContext[] = [];
    for (const tag of tags) reads.push((await getJson(api, `/api/assets/${encodeURIComponent(tag)}`)) as unknown as AssetContext);
    return reads;
  })();
  return fleetRead;
}

async function assetOf(api: APIRequestContext, tag: string): Promise<AssetContext> {
  const found = (await assetContexts(api)).find((a) => a.equipment.tag === tag);
  expect(found, `GET /api/assets carries no ${tag}`).toBeDefined();
  return found as AssetContext;
}

/** The asset whose P&ID sidecar is the given set, with that sidecar; the set number is never typed as a document. */
async function sheetOfSet(api: APIRequestContext, set: number): Promise<{ tag: string; sidecar: Sidecar }> {
  const found = (await assetContexts(api)).find((a) => a.hotspots?.set === set);
  expect(found, `no asset of the fleet carries the Set ${set} P&ID sidecar`).toBeDefined();
  const asset = found as AssetContext;
  return { tag: asset.equipment.tag, sidecar: asset.hotspots as Sidecar };
}

/** Every asset that has a cause-and-effect sheet, in the order the register serves them. */
async function sheets(api: APIRequestContext): Promise<Array<{ tag: string; asset: AssetContext; interlock: Interlock }>> {
  const contexts = await assetContexts(api);
  const withSheet = contexts.flatMap((asset) => (asset.interlock === null ? [] : [{ tag: asset.equipment.tag, asset, interlock: asset.interlock }]));
  expect(withSheet.length, "no asset of the fleet carries a cause-and-effect sheet").toBeGreaterThan(0);
  return withSheet;
}

/** No surface may answer with a server-side designed error state (503) or a Next error overlay. */
async function noErrorState(page: Page): Promise<void> {
  await expect(page.locator('[data-designed-state="503"]')).toHaveCount(0);
  await expect(page.locator("text=Unhandled Runtime Error")).toHaveCount(0);
}

// ---------------------------------------------------------------------------------------------------------------
// AC-CTX-02, the P&ID hotspot layer (src/components/PidSheet.tsx and PidHotspotPanel.tsx, on 6.2 surface 4).
// ---------------------------------------------------------------------------------------------------------------

/** The criterion's own floor: Set 1 opens with at least four hotspots that work. */
const WORKING_HOTSPOTS = 4;
/** The instrument tag the criterion names, and the as-drawn text it names on the Set 2 sheet. */
const VIBRATION_TAG = "VSHH-1201";
const DRAWN_ON_SET_TWO = "S5LL 2305";
/** The register rule the criterion names on the Set 2 sheet. */
const CONTRADICTION_RULE = "CD-18";

const sheetAt = (page: Page, set: number): Locator => page.locator(`[data-component="pid-sheet"][data-set="${set}"]`);

test.describe("the P&ID hotspot layer (AC-CTX-02)", () => {
  test("the Set 1 P&ID places every hotspot the sidecar transcribed, and at least four of them open their card", async ({ page }) => {
    const { sidecar } = await sheetOfSet(page.request, 1);
    await page.goto(`/documents/${encodeURIComponent(sidecar.document_id)}`);

    const sheet = sheetAt(page, sidecar.set);
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-document", sidecar.document_id);
    await expect(sheet.locator("a[data-hotspot]")).toHaveCount(sidecar.hotspots.length);
    expect(sidecar.hotspots.length, `the Set ${sidecar.set} sidecar carries fewer than ${WORKING_HOTSPOTS} hotspots`).toBeGreaterThanOrEqual(WORKING_HOTSPOTS);

    // One read of the placed layer, then every pin checked against the sidecar row it stands for: it is the same
    // hotspot in the same order, it says what the sheet draws, it says whether it binds, and it is a link.
    const placed = await sheet.locator("a[data-hotspot]").evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute("data-hotspot") ?? "",
        bound: el.getAttribute("data-bound") ?? "",
        foreign: el.getAttribute("data-foreign") ?? "",
        role: el.getAttribute("data-role") ?? "",
        label: el.getAttribute("aria-label") ?? "",
        href: el.getAttribute("href") ?? "",
      })),
    );
    expect(placed.map((p) => p.id)).toEqual(sidecar.hotspots.map((h) => h.id));
    for (const h of sidecar.hotspots) {
      const pin = placed.find((p) => p.id === h.id) as (typeof placed)[number];
      expect(pin.bound, `hotspot ${h.id}`).toBe(h.bound_tag === null ? "false" : "true");
      expect(pin.foreign, `hotspot ${h.id}`).toBe(h.foreign ? "true" : "false");
      expect(pin.role, `hotspot ${h.id}`).toBe(h.role);
      expect(pin.label, `hotspot ${h.id} does not name what the sheet draws`).toContain(h.as_drawn_text);
      expect(pin.href, `hotspot ${h.id} is not a link that selects it`).toContain(`hotspot=${h.id}`);
    }

    // Working: four bound pins are pressed, and each one opens the card of that hotspot with its own tag on it.
    const working = sidecar.hotspots.filter((h) => h.bound_tag !== null).slice(0, WORKING_HOTSPOTS);
    expect(working.length, `the Set ${sidecar.set} sidecar binds fewer than ${WORKING_HOTSPOTS} hotspots`).toBe(WORKING_HOTSPOTS);
    for (const h of working) {
      await sheet.locator(`a[data-hotspot="${h.id}"]`).click();
      const card = page.locator('[data-component="pid-hotspot-panel"]');
      await expect(card, `pressing hotspot ${h.id} opened no card`).toBeVisible();
      await expect(card).toHaveAttribute("data-hotspot", h.id);
      await expect(card).toHaveAttribute("data-bound", "true");
      await expect(card).toContainText(h.bound_tag as string);
      await expect(card).toContainText(h.as_drawn_text);
    }
    await noErrorState(page);
  });

  test(`the ${VIBRATION_TAG} hotspot opens its typed trip row and the work order with its root cause and its place in the chain`, async ({ page }) => {
    const { tag, sidecar } = await sheetOfSet(page.request, 1);
    const hotspot = sidecar.hotspots.find((h) => h.bound_tag === VIBRATION_TAG);
    expect(hotspot, `the Set ${sidecar.set} sidecar binds no hotspot to ${VIBRATION_TAG}`).toBeDefined();
    const asset = await assetOf(page.request, tag);
    const trip = asset.rows.find((r) => r.instrument_tag === VIBRATION_TAG && r.row_kind === "trip");
    expect(trip, `${tag} types no trip row on ${VIBRATION_TAG}`).toBeDefined();
    const row = trip as InterlockRow;

    await page.goto(`/documents/${encodeURIComponent(sidecar.document_id)}?hotspot=${encodeURIComponent((hotspot as Hotspot).id)}`);
    const card = page.locator(`[data-component="pid-hotspot-panel"][data-hotspot="${(hotspot as Hotspot).id}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(VIBRATION_TAG);
    await expect(card).toContainText((hotspot as Hotspot).as_drawn_text);

    // The typed row, in the sheet's own words: its id, that it is a trip, its setpoint and its vote cell.
    await expect(card).toContainText(row.row_id);
    await expect(card).toContainText(row.row_kind);
    await expect(card).toContainText(row.initiator);
    await expect(card).toContainText(row.setpoint_text);
    await expect(card).toContainText(row.vote_cell_text);

    // Its effects, each one with the final element it actuates and the mark the sheet prints against it.
    const effects = card.locator(`[data-component="effects-row"][data-row="${row.row_id}"]`);
    await expect(effects).toBeVisible();
    await expect(effects.locator("li.effect")).toHaveCount(row.effects.length);
    for (const effect of row.effects) {
      const cell = effects.locator("li.effect").filter({ hasText: effect.effect_id }).first();
      await expect(cell, `effect ${effect.effect_id} of row ${row.row_id}`).toHaveAttribute("data-marked", effect.marked ? "true" : "false");
      await expect(cell).toContainText(effect.final_element);
    }

    // The work orders: every record of this asset whose own narrative names the tag, with the record's root cause
    // and, where the frozen rule put it in a chain, that link's own id, side, mechanism noun and interval.
    const failures = await getJson(page.request, `/api/assets/${encodeURIComponent(tag)}/failures?page_size=200`);
    const history = failures.history as WorkOrder[];
    const chains = failures.chains as CausalLink[];
    const naming = history.filter((w) =>
      [w.problem_description, w.root_cause, w.corrective_action, w.remarks].some((f) => (f ?? "").toLowerCase().includes(VIBRATION_TAG.toLowerCase())),
    );
    expect(naming.length, `no record of ${tag} names ${VIBRATION_TAG} in its own narrative`).toBeGreaterThan(0);
    const linked = naming.filter((w) => chains.some((c) => c.from_wo === w.wo_number || c.to_wo === w.wo_number));
    expect(linked.length, `no record of ${tag} naming ${VIBRATION_TAG} stands in a chain of the frozen rule`).toBeGreaterThan(0);
    for (const record of naming) {
      await expect(card, `the card does not list ${record.wo_number}`).toContainText(record.wo_number);
      await expect(card, `the card does not carry the root cause of ${record.wo_number}`).toContainText(record.root_cause);
      const link = chains.find((c) => c.from_wo === record.wo_number || c.to_wo === record.wo_number);
      if (link) {
        const side = link.from_wo === record.wo_number ? "earlier hop" : "later hop";
        await expect(card).toContainText(`${link.id} ${side}, ${link.mechanism_noun}, ${link.interval_days} days`);
      }
    }
    await noErrorState(page);
  });

  for (const set of [4, 5] as const) {
    test(`the Set ${set} P&ID opens with its hotspots`, async ({ page }) => {
      const { sidecar } = await sheetOfSet(page.request, set);
      await page.goto(`/documents/${encodeURIComponent(sidecar.document_id)}`);
      const sheet = sheetAt(page, set);
      await expect(sheet).toBeVisible();
      expect(sidecar.hotspots.length, `the Set ${set} sidecar carries no hotspot`).toBeGreaterThan(0);
      await expect(sheet.locator("a[data-hotspot]")).toHaveCount(sidecar.hotspots.length);
      // The first bound hotspot of the set opens its card, so "opens with hotspots" is a press and not a count.
      const bound = sidecar.hotspots.find((h) => h.bound_tag !== null);
      expect(bound, `the Set ${set} sidecar binds no hotspot`).toBeDefined();
      await sheet.locator(`a[data-hotspot="${(bound as Hotspot).id}"]`).click();
      await expect(page.locator('[data-component="pid-hotspot-panel"]')).toHaveAttribute("data-hotspot", (bound as Hotspot).id);
      await noErrorState(page);
    });
  }

  test("every Set 2 hotspot states what the sheet draws and what it binds to, or the reason it binds to nothing", async ({ page }) => {
    const { sidecar } = await sheetOfSet(page.request, 2);
    await page.goto(`/documents/${encodeURIComponent(sidecar.document_id)}`);
    await expect(sheetAt(page, sidecar.set)).toBeVisible();

    // The reading order of the whole set in one read: the link that selects each hotspot, and the row it sits in.
    const rows = await page.locator("a[data-hotspot-row]").evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute("data-hotspot-row") ?? "",
        drawn: (el.textContent ?? "").trim(),
        row: ((el.closest("tr") as HTMLElement | null)?.innerText ?? "").replace(/\s+/g, " ").trim(),
      })),
    );
    expect(rows.map((r) => r.id)).toEqual(sidecar.hotspots.map((h) => h.id));
    for (const h of sidecar.hotspots) {
      const rendered = rows.find((r) => r.id === h.id) as (typeof rows)[number];
      expect(rendered.drawn, `hotspot ${h.id} does not carry its as-drawn text verbatim`).toBe(h.as_drawn_text);
      expect(rendered.row, `hotspot ${h.id} does not carry its role`).toContain(h.role);
      if (h.bound_tag === null) {
        // 6.3: an absent binding is stated with the reason the sidecar recorded, never left blank.
        expect(rendered.row, `unbound hotspot ${h.id} states no reason`).toContain(h.unbound_reason ?? "");
        expect((h.unbound_reason ?? "").length, `the sidecar recorded no reason for unbound hotspot ${h.id}`).toBeGreaterThan(0);
      } else {
        expect(rendered.row, `hotspot ${h.id} does not carry its bound tag`).toContain(h.bound_tag);
      }
      if (h.drawn_setpoint !== null) expect(rendered.row, `hotspot ${h.id} drops its drawn setpoint`).toContain(h.drawn_setpoint);
    }
    await noErrorState(page);
  });

  test(`the Set 2 hotspot drawn "${DRAWN_ON_SET_TWO}" opens the row it stands for, and the sheet shows its ${CONTRADICTION_RULE} finding`, async ({ page }) => {
    const { tag, sidecar } = await sheetOfSet(page.request, 2);
    const hotspot = sidecar.hotspots.find((h) => h.as_drawn_text === DRAWN_ON_SET_TWO);
    expect(hotspot, `the Set ${sidecar.set} sidecar transcribes no hotspot drawn "${DRAWN_ON_SET_TWO}"`).toBeDefined();
    const drawn = hotspot as Hotspot;
    expect(drawn.bound_tag, `the hotspot drawn "${DRAWN_ON_SET_TWO}" binds to nothing, so it stands for no row`).not.toBeNull();
    const asset = await assetOf(page.request, tag);
    const typed = asset.rows.filter((r) => r.instrument_tag === drawn.bound_tag);
    expect(typed.length, `${tag} types no cause-and-effect row on ${drawn.bound_tag}`).toBeGreaterThan(0);

    await page.goto(`/documents/${encodeURIComponent(sidecar.document_id)}?hotspot=${encodeURIComponent(drawn.id)}`);
    const card = page.locator(`[data-component="pid-hotspot-panel"][data-hotspot="${drawn.id}"]`);
    await expect(card).toBeVisible();
    // The card is headed by what the sheet binds it to, and it quotes what the sheet actually draws.
    await expect(card).toContainText(drawn.bound_tag as string);
    await expect(card).toContainText(DRAWN_ON_SET_TWO);
    for (const row of typed) {
      await expect(card).toContainText(row.row_id);
      await expect(card).toContainText(row.initiator);
      await expect(card).toContainText(row.setpoint_text);
    }

    // The register's finding against this sheet is on the sheet's own surface, not only in the register: every
    // open rule the route reports for this document renders, and the contradiction rule is one of them.
    const register = await getJson(page.request, `/api/integrity?document=${encodeURIComponent(sidecar.document_id)}&page_size=200`);
    const findings = register.findings as Array<{ rule_id: string; item: Record<string, unknown> | null }>;
    const ruleIds = [...new Set(findings.map((f) => f.rule_id))];
    expect(ruleIds, `the register raises no ${CONTRADICTION_RULE} against the Set ${sidecar.set} sheet`).toContain(CONTRADICTION_RULE);
    const table = page.locator('[aria-labelledby="findings-heading"]');
    for (const ruleId of ruleIds) await expect(table).toContainText(ruleId);
    // The one that names the instrument identity is the one this criterion is about, and its locator is printed.
    const identity = findings.find((f) => f.rule_id === CONTRADICTION_RULE && String(f.item?.kind ?? "") === "instrument identity");
    expect(identity, `no ${CONTRADICTION_RULE} finding on this sheet reads an instrument identity`).toBeDefined();
    await expect(table).toContainText(String((identity as { item: Record<string, unknown> }).item.kind));
    await expect(table).toContainText(String((identity as { item: Record<string, unknown> }).item.pid));
    await noErrorState(page);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// AC-CTX-03, the interlock matrix (src/components/InterlockMatrix.tsx, on /assets and /assets/:tag).
// ---------------------------------------------------------------------------------------------------------------

/** The asset the criterion names as the control loop: the sheet that states no LOGIC No and no SIL. */
const CONTROL_LOOP_TAG = "EA-5601";

const matrixOf = (page: Page, tag: string): Locator => page.locator(`[data-component="interlock-matrix"][data-tag="${tag}"]`);

test.describe("the interlock matrix (AC-CTX-03)", () => {
  test("the fleet register draws one matrix per cause-and-effect sheet, each with the SIL its own sheet states", async ({ page }) => {
    const all = await sheets(page.request);
    await page.goto("/assets");
    await expect(page.getByRole("heading", { level: 1, name: "Fleet register" })).toBeVisible();
    await expect(page.locator('[data-component="interlock-matrix"]')).toHaveCount(all.length);

    for (const { tag, interlock } of all) {
      const matrix = matrixOf(page, tag);
      await expect(matrix, `no matrix for ${tag}`).toBeVisible();
      await expect(matrix).toHaveAttribute("data-kind", interlock.logic_kind);
      await expect(matrix).toHaveAttribute("data-sil", interlock.sil_sheet === null ? "none" : String(interlock.sil_sheet));
      // The sheet's own identity: its LOGIC No where it states one, its document number and its revision.
      if (interlock.seq_id !== null) await expect(matrix).toContainText(interlock.seq_id);
      await expect(matrix).toContainText(interlock.ce_doc_no);
      await expect(matrix).toContainText(interlock.ce_revision);
      // The SIL badge is the sheet's line, and a sheet that states none says so rather than showing a blank badge.
      await expect(matrix).toContainText(interlock.sil_sheet === null ? "no SIL stated on the sheet" : `SIL ${interlock.sil_sheet} on the sheet`);
    }
    await noErrorState(page);
  });

  test("every sheet's rows stand against its effect columns with the marks the sheet prints", async ({ page }) => {
    const all = await sheets(page.request);
    await page.goto("/assets");

    for (const { tag, asset, interlock } of all) {
      // The effect columns of a sheet, in the order its rows print them (the component's own rule, 9.3).
      const columns: Array<{ effect_id: string; final_element: string }> = [];
      for (const row of asset.rows) {
        for (const effect of row.effects) {
          if (!columns.some((c) => c.effect_id === effect.effect_id)) columns.push({ effect_id: effect.effect_id, final_element: effect.final_element });
        }
      }

      const drawn = await matrixOf(page, tag)
        .locator("table.reg")
        .evaluateAll((tables) => {
          const table = tables[0] as HTMLTableElement | undefined;
          if (!table) return null;
          const heads = [...table.querySelectorAll("thead th")].map((th) => (th as HTMLElement).innerText.replace(/\s+/g, " ").trim());
          const body = [...table.querySelectorAll("tbody tr")].map((tr) => ({
            rowId: ((tr.querySelector("th[scope=row]") as HTMLElement | null)?.innerText ?? "").trim(),
            kind: tr.getAttribute("data-row-kind") ?? "",
            text: (tr as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
            marks: [...tr.querySelectorAll("td[data-marked]")].map((td) => td.getAttribute("data-marked") ?? ""),
          }));
          return { heads, body };
        });
      expect(drawn, `${tag} draws no matrix table`).not.toBeNull();
      const table = drawn as NonNullable<typeof drawn>;

      // Every typed row of the sheet is a row of the matrix, in the sheet's own order, with its own words.
      expect(table.body.map((r) => r.rowId), `${tag} rows`).toEqual(asset.rows.map((r) => r.row_id));
      for (const [i, row] of asset.rows.entries()) {
        const rendered = table.body[i] as (typeof table.body)[number];
        expect(rendered.kind, `${tag} row ${row.row_id}`).toBe(row.row_kind);
        expect(rendered.text, `${tag} row ${row.row_id} drops its initiator`).toContain(row.initiator);
        expect(rendered.text, `${tag} row ${row.row_id} drops its instrument tag`).toContain(row.instrument_tag);
        expect(rendered.text, `${tag} row ${row.row_id} drops its setpoint`).toContain(row.setpoint_text);
        expect(rendered.text, `${tag} row ${row.row_id} drops its vote cell`).toContain(row.vote_cell_text);
        // The mark in every cell is the mark the sheet prints, column by column, and a column the row does not
        // carry is drawn as unmarked rather than being dropped.
        expect(rendered.marks.length, `${tag} row ${row.row_id} column count`).toBe(columns.length);
        expect(
          rendered.marks,
          `${tag} row ${row.row_id} marks`,
        ).toEqual(columns.map((c) => (row.effects.find((e) => e.effect_id === c.effect_id)?.marked ? "true" : "false")));
      }

      // Every effect column carries the sheet's own EFF id over the final element it actuates.
      for (const column of columns) {
        const head = table.heads.find((h) => h.startsWith(column.effect_id));
        expect(head, `${tag} draws no column for ${column.effect_id}`).toBeDefined();
        expect(head as string, `${tag} column ${column.effect_id} names no final element`).toContain(column.final_element);
      }
      if (interlock.logic_kind === "trip_logic") {
        expect(asset.rows.some((r) => r.row_kind === "trip"), `${tag} is trip logic and types no trip row`).toBe(true);
      }
    }
    await noErrorState(page);
  });

  test("every sheet's start permissives render as their gate", async ({ page }) => {
    const all = await sheets(page.request);
    await page.goto("/assets");

    for (const { tag, asset, interlock } of all) {
      // What the sheet files its permissives under: its LOGIC No, or the tag on a sheet that states none.
      const key = interlock.seq_id ?? tag;
      const gate = matrixOf(page, tag).locator(`[data-component="permissive-gate"][data-seq="${key}"]`);
      expect(asset.permissives.length, `${tag} lists no start permissive`).toBeGreaterThan(0);
      await expect(gate, `${tag} draws no permissive gate under ${key}`).toBeVisible();
      await expect(gate.locator("li.gate-row")).toHaveCount(asset.permissives.length);
      for (const permissive of asset.permissives) {
        const row = gate.locator(`li.gate-row[data-span="${permissive.span_id}"]`);
        await expect(row, `${tag} permissive ${permissive.n}`).toContainText(permissive.text);
        if (permissive.signal_tag !== null) await expect(row).toContainText(permissive.signal_tag);
      }
      // The gate is the sheet's own logical operator, printed with the rows it gates.
      if (interlock.permissive_gate !== null) await expect(gate).toContainText(interlock.permissive_gate);
      if (interlock.seq_id === null) {
        await expect(matrixOf(page, tag)).toContainText("The sheet states no LOGIC No, so its permissive block is filed under the equipment tag.");
      }
    }
    await noErrorState(page);
  });

  test("every sheet's notes carry the citation that opens the page they came from", async ({ page }) => {
    const all = await sheets(page.request);
    await page.goto("/assets");

    for (const { tag, asset, interlock } of all) {
      expect(interlock.notes.length, `${tag} prints no sheet note`).toBeGreaterThan(0);
      const matrix = matrixOf(page, tag);
      for (const note of interlock.notes) {
        await expect(matrix, `${tag} note ${note.n} is not on the sheet verbatim`).toContainText(note.text);
        const chip = matrix.locator(`[data-component="citation-chip"][data-span="${note.span_id}"]`);
        await expect(chip, `${tag} note ${note.n} carries no citation`).toHaveCount(1);
        // The chip names the cause-and-effect sheet and the page the note was read from, not some other document.
        const citation = asset.citations[note.span_id];
        expect(citation, `${tag} note ${note.n} resolves to no citation`).toBeDefined();
        expect((citation as Citation).doc_no, `${tag} note ${note.n} cites another document`).toBe(interlock.ce_doc_no);
        await expect(chip).toContainText((citation as Citation).doc_no);
        await expect(chip).toContainText(`p. ${(citation as Citation).page}`);
      }
    }
    await noErrorState(page);
  });

  test(`${CONTROL_LOOP_TAG} renders as a control loop, with no LOGIC No, no SIL and no voted trip row`, async ({ page }) => {
    const asset = await assetOf(page.request, CONTROL_LOOP_TAG);
    const interlock = asset.interlock as Interlock;
    expect(interlock, `${CONTROL_LOOP_TAG} carries no cause-and-effect sheet`).not.toBeNull();
    // The data itself says control loop: the criterion is not being read into a sheet that types a trip.
    expect(interlock.logic_kind).toBe("control_loop_only");
    expect(interlock.seq_id).toBeNull();
    expect(interlock.sil_sheet).toBeNull();
    expect(asset.rows.some((r) => r.row_kind === "trip"), `${CONTROL_LOOP_TAG} types a trip row`).toBe(false);

    await page.goto("/assets");
    const matrix = matrixOf(page, CONTROL_LOOP_TAG);
    await expect(matrix).toHaveAttribute("data-kind", "control_loop_only");
    await expect(matrix).toHaveAttribute("data-sil", "none");
    await expect(matrix).toContainText("control loop only");
    await expect(matrix).toContainText("no LOGIC No on the sheet");
    await expect(matrix).toContainText("no SIL stated on the sheet");
    // A control, alarm or relief row has no SIF architecture, so no row of this sheet is drawn as voted.
    await expect(matrix.locator('tbody tr[data-row-kind="trip"]')).toHaveCount(0);
    await expect(matrix.locator("tbody tr")).toHaveCount(asset.rows.length);
    for (const row of asset.rows) {
      expect(row.voting, `${CONTROL_LOOP_TAG} row ${row.row_id} carries a voting architecture`).toBeNull();
      await expect(matrix.locator("tbody tr").filter({ hasText: row.row_id }).first()).toContainText("not a voted trip row");
    }
    await noErrorState(page);
  });

  test("every asset page draws the matrix of its own sheet", async ({ page }) => {
    const all = await sheets(page.request);
    for (const { tag, asset, interlock } of all) {
      await page.goto(`/assets/${encodeURIComponent(tag)}#interlock`);
      await expect(page.getByRole("heading", { level: 1, name: tag })).toBeVisible();
      const matrix = matrixOf(page, tag);
      await expect(matrix, `the asset page of ${tag} draws no matrix`).toBeVisible();
      await expect(matrix).toHaveAttribute("data-kind", interlock.logic_kind);
      await expect(matrix).toHaveAttribute("data-sil", interlock.sil_sheet === null ? "none" : String(interlock.sil_sheet));
      await expect(matrix.locator("tbody tr")).toHaveCount(asset.rows.length);
      // Exactly one matrix: the asset page draws its own sheet, never the fleet's.
      await expect(page.locator('[data-component="interlock-matrix"]')).toHaveCount(1);
      await noErrorState(page);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// AC-CTX-04, the connector panel (/admin/connectors, GET /api/connectors and GET /api/connectors/:name/schema).
// ---------------------------------------------------------------------------------------------------------------

/** The 2020-12 dialect every contract file declares; asserted on the served bytes, compiled by contracts:check. */
const JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";
const DIGITAL_TWIN_DEFINITION = "DigitalTwinRow";

async function connectors(api: APIRequestContext): Promise<{ list: ConnectorDescriptor[]; twin: { definition: string; deep_link: string } }> {
  const body = await getJson(api, "/api/connectors");
  const list = body.connectors as ConnectorDescriptor[];
  expect(body.unreadable, "this deployment could not read a contract file").toEqual([]);
  return { list, twin: body.digital_twin as { definition: string; deep_link: string } };
}

/** The contract file as this repository holds it; the deployment is built from the same checkout. */
function contractBytes(file: string): Buffer {
  const at = path.resolve(process.cwd(), file);
  expect(existsSync(at), `the contract file is absent at ${at}`).toBe(true);
  return readFileSync(at);
}

test.describe("the connector panel (AC-CTX-04)", () => {
  test("the connector sheet states three contracts, every one of them specified and not connected", async ({ page }) => {
    const { list } = await connectors(page.request);
    expect(list.length, "GET /api/connectors serves a number of contracts other than the three of 9.14").toBe(3);

    await page.goto("/admin/connectors");
    await expect(page.getByRole("heading", { level: 1, name: "Connectors" })).toBeVisible();
    const cards = page.locator('[data-component="connector-contract"]');
    await expect(cards).toHaveCount(list.length);
    expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-connector")))).toEqual(list.map((c) => c.name));

    for (const contract of list) {
      const card = page.locator(`[data-component="connector-contract"][data-connector="${contract.name}"]`);
      // The status is the fixed wording of 6.3, and the contract file itself is what says it.
      expect(contract.status, `${contract.name} states another status`).toBe(STATUS_WORDING.specified_not_connected);
      await expect(card).toContainText(STATUS_WORDING.specified_not_connected);
    }
    // No contract fell through to the defect branch, which is what a contract saying something else would render.
    await expect(page.locator('[data-component="connector-contract"] .badge[data-tone="defect"]')).toHaveCount(0);
    await noErrorState(page);
  });

  test("GET /api/connectors/:name/schema answers with the repository's contract file byte for byte", async ({ page }) => {
    const { list } = await connectors(page.request);
    for (const contract of list) {
      const response = await page.request.get(contract.schema_href);
      expect(response.status(), `GET ${contract.schema_href}`).toBe(200);
      expect(response.headers()["content-type"]).toContain(contract.schema_media_type);

      const served = Buffer.from(await response.body());
      const onDisk = contractBytes(contract.file);
      // Byte for byte, three ways: the bytes on disk, the length the route declares and the digest the panel prints.
      expect(served.equals(onDisk), `${contract.schema_href} does not serve ${contract.file} byte for byte`).toBe(true);
      expect(served.byteLength).toBe(contract.byte_length);
      expect(createHash("sha256").update(served).digest("hex")).toBe(contract.sha256);

      // The document the bytes are declares itself a JSON Schema 2020-12 document under the contract's own id.
      const schema = JSON.parse(served.toString("utf8")) as { $schema: string; $id: string; $defs: Record<string, unknown> };
      expect(schema.$schema, `${contract.file} declares another dialect`).toBe(JSON_SCHEMA_2020_12);
      expect(schema.$id).toBe(contract.schema_id);
      expect(Object.keys(schema.$defs)).toEqual(contract.definitions);
    }

    // The panel prints the same digest a reviewer would compute from the file it links to.
    await page.goto("/admin/connectors");
    for (const contract of list) {
      const card = page.locator(`[data-component="connector-contract"][data-connector="${contract.name}"]`);
      await expect(card).toContainText(contract.sha256);
      await expect(card).toContainText(contract.file);
      await expect(card.locator(`a[href="${contract.schema_href}"]`)).toHaveCount(1);
    }
    await noErrorState(page);
  });

  test("the digital twin row's deep link is empty, on the sheet and in the contract that fixes it", async ({ page }) => {
    const { list, twin } = await connectors(page.request);
    expect(twin.definition).toBe(DIGITAL_TWIN_DEFINITION);
    expect(twin.deep_link, "the digital twin's deep link is not empty").toBe("");

    // The contract itself admits no other value: the field is a const of the empty string in the EDMS file.
    const carrier = list.find((c) => c.definitions.includes(DIGITAL_TWIN_DEFINITION));
    expect(carrier, `no contract of 9.14 carries ${DIGITAL_TWIN_DEFINITION}`).toBeDefined();
    const schema = JSON.parse(contractBytes((carrier as ConnectorDescriptor).file).toString("utf8")) as {
      $defs: Record<string, { properties?: Record<string, { const?: string }> }>;
    };
    const field = schema.$defs[DIGITAL_TWIN_DEFINITION]?.properties?.deep_link;
    expect(field, `${DIGITAL_TWIN_DEFINITION} fixes no deep_link field`).toBeDefined();
    expect((field as { const?: string }).const, "the contract admits a deep link other than the empty string").toBe("");

    await page.goto("/admin/connectors");
    const row = page.locator('[data-component="connector-digital-twin"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText(DIGITAL_TWIN_DEFINITION);
    await expect(row).toContainText(STATUS_WORDING.specified_not_connected);
    // The field is rendered as the empty string it is, and said to be empty; it is never rendered as an address.
    await expect(row).toContainText('""');
    await expect(row).toContainText("empty");
    await expect(row.locator("a[href]")).toHaveCount(0);
    await noErrorState(page);
  });

  test("every field the sheet prints is the contract's own", async ({ page }) => {
    const { list } = await connectors(page.request);
    await page.goto("/admin/connectors");

    for (const contract of list) {
      const card = page.locator(`[data-component="connector-contract"][data-connector="${contract.name}"]`);
      const served = JSON.parse(contractBytes(contract.file).toString("utf8")) as Record<string, unknown>;
      // Each rendered field read back out of the file the schema route serves: nothing on the sheet is typed.
      for (const key of ["title", "description", "x-sync", "x-conflict-rule", "x-failure-behaviour", "x-blueprint", "$id"] as const) {
        const value = served[key];
        expect(typeof value, `${contract.file} carries no ${key}`).toBe("string");
        await expect(card, `${contract.name} does not print its own ${key}`).toContainText(String(value));
      }
      // And the record shapes are the file's $defs, in the file's order.
      const defs = Object.keys(served.$defs as Record<string, unknown>);
      expect(defs).toEqual(contract.definitions);
      for (const def of defs) await expect(card).toContainText(def);
    }
    await noErrorState(page);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// AC-CTX-05, the operational-context panel (src/components/OperationalContextPanel.tsx, on /failures/:tag).
// ---------------------------------------------------------------------------------------------------------------

const hoursText = (h: number): string => `${h.toFixed(1)} h`;
const shareText = (part: number, whole: number): string => `${((part / whole) * 100).toFixed(1)} percent`;
/** Rupiah with digit grouping, as src/db/queries/coverage.ts formats it. */
const grouped = new Intl.NumberFormat("en-US");
const idrText = (idr: number): string => `IDR ${grouped.format(idr)}`;

/** One figure and the fixture key it reconciles to, as the panel puts them in the DOM. */
function reconciled(panel: Locator, key: string): Locator {
  return panel.locator(`[data-fixture-key="${key}"][data-fixture-value]`);
}

test.describe("the operational-context panel (AC-CTX-05)", () => {
  test("the panel reconciles the breakdown split and the notification lead time to the harness fixture", async ({ page }) => {
    const fx = fixtures();
    await page.goto("/failures/GA-1201A");
    const panel = page.locator('[data-component="operational-context"]');
    await expect(panel).toBeVisible();

    // The two flagged populations, each printed beside the fixture key of 10.5 that carries it.
    const populations = [
      { key: "populations.unplanned_breakdowns", value: fx.populations.unplanned_breakdowns },
      { key: "populations.planned_flagged", value: fx.populations.planned_flagged },
    ];
    for (const { key, value } of populations) {
      const figure = reconciled(panel, key);
      await expect(figure, `no figure on the panel binds to ${key}`).toHaveCount(1);
      await expect(figure).toHaveAttribute("data-fixture-value", String(value));
      await expect(figure).toContainText(String(value));
    }

    // The notification lead time across the fleet: the median, the full-day bucket, the record count and the share.
    const lead = fx.workbook.lead_time;
    // Two rows carry the lead time, the asset's and the fleet's; only the fleet row has a fixture key to bind to.
    const median = reconciled(panel, "workbook.lead_time.median_h");
    await expect(median).toHaveCount(1);
    await expect(median).toHaveAttribute("data-fixture-value", hoursText(lead.median_h));
    await expect(median).toContainText(hoursText(lead.median_h));
    const bucket = reconciled(panel, "workbook.lead_time.at_least_24h");
    await expect(bucket).toHaveAttribute("data-fixture-value", String(lead.at_least_24h));
    const rows = reconciled(panel, "workbook.rows");
    await expect(rows).toHaveAttribute("data-fixture-value", String(fx.workbook.rows));
    // "136 of 211 at 24 h or more", and the share the two of them make, computed here from the fixture alone.
    await expect(panel).toContainText(`${shareText(lead.at_least_24h, fx.workbook.rows)}`);
    expect(shareText(lead.at_least_24h, fx.workbook.rows), "the fixture's own share and its two counts disagree").toBe(
      `${(lead.share * 100).toFixed(1)} percent`,
    );

    // The recorded downtime and the recorded maintenance cost of each kind, from the same slice.
    for (const kind of ["unplanned", "planned_flagged"] as const) {
      const totals = fx.workbook.breakdown_kinds[kind];
      await expect(reconciled(panel, `workbook.breakdown_kinds.${kind}.hours`)).toHaveAttribute("data-fixture-value", hoursText(totals.hours));
      await expect(reconciled(panel, `workbook.breakdown_kinds.${kind}.cost_idr`)).toHaveAttribute("data-fixture-value", idrText(totals.cost_idr));
    }

    // Nothing on the panel differs from the fixture it names: a difference is drawn, never smoothed over.
    await expect(panel.locator('[data-tone="defect"]').filter({ hasText: "differs" })).toHaveCount(0);
    await noErrorState(page);
  });

  test("every asset's failure surface carries the panel, and none of them differs from the fixture", async ({ page }) => {
    const contexts = await assetContexts(page.request);
    for (const asset of contexts) {
      const tag = asset.equipment.tag;
      await page.goto(`/failures/${encodeURIComponent(tag)}`);
      const panel = page.locator('[data-component="operational-context"]');
      await expect(panel, `the failure surface of ${tag} carries no operational-context panel`).toBeVisible();
      await expect(panel).toHaveAttribute("data-tag", tag);
      // The four readings of FR-114, each as its own block.
      for (const block of ["breakdown-split", "lead-time", "protective-function", "demand-history"]) {
        await expect(panel.locator(`[data-block="${block}"]`), `${tag} is missing the ${block} block`).toHaveCount(1);
      }
      await expect(panel.locator('[data-tone="defect"]').filter({ hasText: "differs" }), `${tag} differs from the fixture`).toHaveCount(0);
      await noErrorState(page);
    }
  });

  test(`${CONTROL_LOOP_TAG}'s panel states that no protective function is recorded`, async ({ page }) => {
    const asset = await assetOf(page.request, CONTROL_LOOP_TAG);
    const interlock = asset.interlock as Interlock;
    // The sheet, not the tag number, is what makes this true, and the sheet types a control loop.
    expect(interlock.logic_kind).toBe("control_loop_only");
    expect(interlock.seq_id).toBeNull();

    await page.goto(`/failures/${CONTROL_LOOP_TAG}`);
    const panel = page.locator('[data-component="operational-context"]');
    const stated = panel.locator('[data-state="no-protective-function"]');
    await expect(stated).toBeVisible();
    await expect(stated).toHaveText("No protective function is recorded for this asset.");
    // With the sheet it was read from and the equipment record's own line beside it, and no SIL invented for it.
    const block = panel.locator('[data-block="protective-function"]');
    await expect(block).toContainText(interlock.ce_doc_no);
    await expect(block).toContainText(asset.equipment.interlock_ref);
    await expect(block).not.toContainText("SIL ");
    await noErrorState(page);
  });

  test("the demand history is stated as not recorded, and every demand The Hub infers is labelled an inference", async ({ page }) => {
    const demandBlock = (): Locator => page.locator('[data-component="operational-context"] [data-block="demand-history"]');
    const inferred: Record<string, number> = {};

    for (const tag of ["GA-1201A", CONTROL_LOOP_TAG]) {
      await page.goto(`/failures/${encodeURIComponent(tag)}`);
      const block = demandBlock();
      const stated = block.locator('[data-state="demand-history-not-recorded"]');
      await expect(stated, `${tag} does not state its demand history as not recorded`).toBeVisible();
      await expect(stated).toHaveText("Demand history is not recorded.");
      // Never "none": the absence is an absence of a record, not a record of a function never demanded.
      await expect(block).not.toContainText("no demand was recorded");
      await expect(block, `${tag} does not say which field the absence was read from`).toContainText("Related_Interlock");

      // Every demand The Hub infers carries the tag it was resolved by, the row that types it, and the label.
      const demands = block.locator("[data-demand]");
      inferred[tag] = await demands.count();
      for (let i = 0; i < inferred[tag]; i += 1) {
        const demand = demands.nth(i);
        await expect(demand).toContainText("inference");
        await expect(demand).toContainText("resolved by");
        await expect(demand).toContainText("inference, not the plant");
      }
    }

    // The asset whose sheet types a protective function names the demands it infers against it, so the label above
    // is asserted against real rows and not against an empty list.
    expect(inferred["GA-1201A"], "no demand is inferred on the asset whose sheet types a protective function").toBeGreaterThan(0);
    // The asset whose sheet types a control loop infers none, and says why rather than leaving the block blank.
    await page.goto(`/failures/${CONTROL_LOOP_TAG}`);
    await expect(demandBlock().locator("[data-demand]")).toHaveCount(0);
    await expect(demandBlock()).toContainText("No protective function is recorded for this asset, so no demand is inferred against one either.");
  });
});
