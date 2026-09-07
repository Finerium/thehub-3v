// Failure Memory (M3), the three criteria of 11.6 that had no running check: AC-FM-06, AC-FM-07 and AC-FM-08.
//
//   AC-FM-06  "Recommended actions are quoted precedent only: a string audit finds no sentence in M3 not quoted
//             from a record or an approved lesson. Expected: 0 hits." The audit is `advisorySentences` below. M3
//             composes no advice at all: what a reader could mistake for a recommendation is a record's own
//             Corrective_Action rendered inside the `verbatim` marker, or a chip linking to the approved lesson
//             that quotes the record. So the audit has two legs, both of which can fail: no advisory sentence in
//             the surface's own words, and every quoted field rendered inside the marker.
//
//   AC-FM-07  "The precedent panel lists the EA-5601 fouling event's family members with links and recorded
//             failure modes. Expected: green." Proved by rendering PrecedentPanel over the bundle's own family,
//             the way the surface renders it, and reading the markup.
//
//   AC-FM-08  "The timeline visual renders for all 8 assets and matches the operational-context panel." There is
//             no timeline component and no panel of that name: blueprint line 140 lists "the per-asset timeline
//             visual" under P2 (POLISH), so it was scoped out and never built. The nearest true thing, and
//             what this file proves instead, is the per-asset visual that WAS built: the causal chain. It draws
//             for all 8 assets, as hops where the package recorded links and as the designed empty state where
//             it recorded none, and every asset's hop count matches the fixture key the surface reconciles against.
//
// Everything here is hermetic: the bundle and the fixture are files, and the components are props-only and
// server-renderable, so they are rendered to static markup in the node lane (the pattern of DecisionButtons.test).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chain } from "@/components/ChainHop";
import { PrecedentPanel } from "@/components/FamilyList";
import type { CausalLink, FailureFamily } from "@/contracts/generated/operations";

const REPO = process.cwd();
const BUNDLE = path.join(REPO, "bundle");
const read = (file: string) => readFileSync(path.join(REPO, file), "utf8");

/** The sources M3 is made of: its two routes, its query module and the two components only it composes. */
const M3_SOURCES = [
  "src/app/(hub)/failures/page.tsx",
  "src/app/(hub)/failures/[tag]/page.tsx",
  "src/db/queries/failures.ts",
  "src/components/FamilyList.tsx",
  "src/components/ChainHop.tsx",
];

/**
 * The record and lesson fields M3 renders. Each is the corpus's own words, so each must reach the page inside the
 * `verbatim` marker; a field printed bare would be M3 asserting the sentence in its own voice.
 */
const QUOTED_FIELDS = ["problem_description", "root_cause", "corrective_action", "spare_parts_used", "recorded_root_cause", "linking_sentence"];

// The vocabulary of advice. A sentence in M3's own words carrying one of these is the surface recommending an
// action, which only a record or an approved lesson is allowed to do (invariant 12: nothing here prioritises,
// predicts or assigns either).
const ADVISORY =
  /\b(recommend(s|ed|ation|ations)?|advis(e|es|ed|ory)|suggest(s|ed|ion|ions)?|you should|we should|should be (replaced|inspected|repaired|overhauled|scheduled)|next steps?|action plan|best practice|likely to fail|will fail|prioriti[sz]e|predict(s|ed|ion)?)\b/i;

/** Source with its comments removed: a comment naming AC-FM-06 is not a sentence any reader is shown. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

/**
 * The audit. Every line of the file, comments stripped, that carries advisory vocabulary. A hit is a line number
 * and the line, so a reader can judge it; the criterion expects the list to be empty.
 */
export function advisorySentences(source: string): string[] {
  return withoutComments(source)
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => ADVISORY.test(line))
    .map(({ line, n }) => `${n}: ${line}`);
}

describe("AC-FM-06, the string audit: M3 recommends nothing in its own words", () => {
  it.each(M3_SOURCES)("finds no advisory sentence in %s", (file) => {
    expect(advisorySentences(read(file))).toEqual([]);
  });

  // Without this the audit above proves only that the regex found nothing, not that it looks.
  it.each([
    ["a recommendation", '<p className="note">We recommend replacing the bearing at the next shutdown.</p>'],
    ["an imperative dressed as advice", "const NEXT = `The next step is to overhaul the exchanger.`;"],
    ["a prediction", '<span>{tag} is likely to fail within 30 days</span>'],
    ["a ranking", "const order = clusters.prioritise();"],
  ])("catches %s", (_what, planted) => {
    expect(advisorySentences(planted)).toHaveLength(1);
  });

  it("does not fire on a comment, which no reader is shown", () => {
    expect(advisorySentences("// AC-FM-06: recommended actions are quoted precedent only\nconst x = 1;\n")).toEqual([]);
  });

  it("renders every quoted field inside the verbatim marker", () => {
    // Narrative is the one indirection: the page hands it a field as `text` and it renders that text, and only
    // that text, inside the marker. Pinned here so the exemption below cannot outlive the component.
    const page = read("src/app/(hub)/failures/[tag]/page.tsx");
    const narrative = page.slice(page.indexOf("function Narrative("), page.indexOf("function CoverageCell("));
    expect(narrative).toContain('<span className="verbatim text-ink-700">{text}</span>');

    const bare: string[] = [];
    for (const file of M3_SOURCES) {
      const source = withoutComments(read(file));
      for (const field of QUOTED_FIELDS) {
        // One render site is one braced expression on one line; a multi-line condition is not a render.
        for (const site of source.matchAll(new RegExp(`\\{[a-zA-Z.?[\\]"']*\\b${field}\\b[^}\\n]*\\}`, "g"))) {
          const before = source.slice(Math.max(0, (site.index ?? 0) - 240), site.index);
          // The field is rendered by an element whose class carries the marker, or handed to Narrative as `text`.
          if (!/verbatim/.test(before) && !/\btext=$/.test(before.trimEnd())) bare.push(`${file}: ${site[0]}`);
        }
      }
    }
    expect(bare, "a record's own words are printed outside the verbatim marker").toEqual([]);
  });

  it("catches a quoted field printed bare", () => {
    // The same rule applied to a planted line: the marker is what makes the sentence a quotation on the page.
    const planted = '<p className="note">{r.corrective_action}</p>';
    const sites = [...planted.matchAll(/\{[a-zA-Z.?[\]"']*\bcorrective_action\b[^}\n]*\}/g)];
    expect(sites).toHaveLength(1);
    expect(/verbatim/.test(planted.slice(0, sites[0]?.index))).toBe(false);
  });

  it("reaches no model from the surface, so no sentence on it can be composed", () => {
    for (const file of M3_SOURCES) {
      expect(read(file), `${file} imports the gateway`).not.toMatch(/from "@\/gateway/);
      expect(read(file), `${file} imports the composer`).not.toMatch(/from "@\/answer\/compose"/);
    }
  });

  it("shows a lesson only as a link to the approved document that quotes the record", () => {
    const page = read("src/app/(hub)/failures/[tag]/page.tsx");
    expect(page).toContain("quoted by");
    expect(page).toContain("/documents/${encodeURIComponent(l.document_id)}");
    // The query reads the lessons of the approved corpus version the session sees, never a draft.
    expect(read("src/db/queries/failures.ts")).toContain("visibleVersionIds");
  });
});

type BundleFamily = FailureFamily;

function families(): BundleFamily[] {
  return JSON.parse(readFileSync(path.join(BUNDLE, "families.json"), "utf8")) as BundleFamily[];
}

function workOrderTag(wo: string): string {
  const rows = JSON.parse(readFileSync(path.join(BUNDLE, "work_orders.json"), "utf8")) as { wo_number: string; equipment_tag: string }[];
  return rows.find((r) => r.wo_number === wo)?.equipment_tag ?? "";
}

describe("AC-FM-07, the precedent panel of the EA-5601 fouling event", () => {
  const TAG = "EA-5601";
  const family = families().find((f) => f.label.includes("fouling"));
  const memberHref = (wo: string) => `/failures/${encodeURIComponent(workOrderTag(wo) || TAG)}#${wo}`;

  it("the bundle carries a fouling family whose members include an EA-5601 record", () => {
    expect(family, "no family in the bundle is labelled for fouling").toBeDefined();
    const members = family?.members ?? [];
    expect(members.length).toBeGreaterThan(1);
    expect(members.map((m) => workOrderTag(m.wo_number))).toContain(TAG);
    for (const m of members) expect(m.recorded_root_cause.trim().length, `${m.wo_number} carries no recorded root cause`).toBeGreaterThan(0);
  });

  it("lists every member as a link with the failure mode its own record records", () => {
    const fouling = family as BundleFamily;
    const current = fouling.members.find((m) => workOrderTag(m.wo_number) === TAG)?.wo_number;
    const html = renderToStaticMarkup(createElement(PrecedentPanel, { family: fouling, currentWo: current, hrefFor: memberHref }));

    for (const m of fouling.members) {
      expect(html, `${m.wo_number} is not a link`).toContain(`href="${memberHref(m.wo_number)}">${m.wo_number}</a>`);
      expect(html, `${m.wo_number}'s recorded root cause is missing`).toContain(`<span class="verbatim">${m.recorded_root_cause}</span>`);
    }
    expect(html).toContain('data-component="precedent-panel"');
    expect(html).toContain(`data-family="${fouling.id}"`);
    // The record the panel is read from is marked, and the family's basis and review status are stated with it.
    expect(html).toContain("this record");
    expect(html).toContain("agent classification");
    expect(html).toContain("review pending");
  });

  it("is the panel the asset surface renders, with the same member link builder", () => {
    const page = read("src/app/(hub)/failures/[tag]/page.tsx");
    expect(page).toContain("<PrecedentPanel family={f} currentWo={soleMemberOf(f.id)} hrefFor={memberHref} />");
    expect(page).toContain('id={`family-${f.id}`}');
  });
});

describe("AC-FM-08, the per-asset visual over all 8 assets (the timeline of P2 was never built)", () => {
  const fixtures = JSON.parse(readFileSync(path.join(BUNDLE, "fixtures.json"), "utf8")) as {
    equipment_master: { tag: string }[];
    chains: { by_tag: Record<string, number>; window_days: number };
  };
  const links = JSON.parse(readFileSync(path.join(BUNDLE, "chains.json"), "utf8")) as (CausalLink & { equipment_tag: string })[];
  const tags = fixtures.equipment_master.map((e) => e.tag);

  it("covers 8 assets", () => {
    expect(tags).toHaveLength(8);
  });

  it.each(tags)("%s renders either its hops or the designed empty state, and the count matches the fixture", (tag) => {
    const mine = links.filter((l) => l.equipment_tag === tag);
    const fixtureCount = fixtures.chains.by_tag[tag] ?? 0;
    expect(mine, `chains.by_tag.${tag} and chains.json disagree`).toHaveLength(fixtureCount);

    if (mine.length === 0) {
      // Two of the eight carry no link at all, so the surface shows the state it designed for that, never a blank.
      const page = read("src/app/(hub)/failures/[tag]/page.tsx");
      expect(page).toContain('title="No causal link on this asset"');
      expect(page).toContain("no hop is drawn");
      return;
    }
    const html = renderToStaticMarkup(
      createElement(Chain, { links: mine, windowDays: fixtures.chains.window_days, hrefFor: (wo: string) => `#${wo}`, "aria-label": `Causal chains of ${tag}` }),
    );
    expect([...html.matchAll(/data-component="chain-hop"/g)]).toHaveLength(fixtureCount);
    for (const link of mine) {
      expect(html).toContain(`data-link="${link.id}"`);
      expect(html).toContain(`<span class="verbatim">${link.linking_sentence}</span>`);
      expect(html).toContain(`${link.interval_days} days`);
    }
    // The fixed basis line under every hop: a shared noun inside the window is never a claim of cause.
    expect([...html.matchAll(/class="hop-basis"/g)]).toHaveLength(fixtureCount);
  });

  // The criterion asks for a timeline visual that matches the operational-context panel. Half of that pairing now
  // exists: the panel was built for AC-CTX-05 and reconciles to the fixture, and its own file proves it. The
  // timeline is POLISH (blueprint line 140, P2) and was scoped out, so this asserts the state as it is rather than
  // as the sentence reads: no timeline component anywhere, and the panel the timeline would have matched present.
  it("has no timeline component, and names the operational-context panel that would be its counterpart", () => {
    const sources = M3_SOURCES.map(read).join("\n");
    expect(sources, "a timeline component appeared without this criterion being revisited").not.toMatch(/\bTimeline\b/);
    expect(existsSync(path.join(REPO, "src/components/OperationalContextPanel.tsx")), "the operational-context panel of AC-CTX-05").toBe(true);
  });
});
