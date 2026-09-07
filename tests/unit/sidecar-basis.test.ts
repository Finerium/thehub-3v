// AC-ING-12, the UI half: "the UI states the basis at every point of use". The sidecar half is proved in the
// harness (tests/test_sidecars.py, 8 of 8 valid and byte-identical on re-serialisation, and G1's closure checks);
// what had no check on this side was the wording a reader sees beside a transcribed sidecar.
//
// The Playwright leg the criterion names cannot run today and this file does not pretend otherwise: the harness
// renders page derivatives from PDFs only and all eight P&IDs are PNG, so pages/index.json carries 88 documents
// and none of them is a P&ID, and no sheet renders for a browser to assert on (open item 2 of .crown/notes.md).
// That gap is in the derivative lane, not in the wording. So this file proves the wording where it lives:
//
//   1. every point of use renders the basis, the alias, the date and the review status, and there are exactly
//      three such points, so a fourth surface that renders a sidecar without the line fails this test;
//   2. rendered over each of the eight bundle sidecars, the line reads "agent transcription ... review pending"
//      (D-12: they were transcribed by an agent, so "manual" would be the label ADR-007 forbids);
//   3. where the deployment holds no render for the sheet, the surface says so and keeps the index, which is the
//      state every P&ID is in today.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HotspotLayer } from "@/components/HotspotLayer";
import type { PidSidecar } from "@/contracts/generated/asset";

const REPO = process.cwd();
const SIDECARS = path.join(REPO, "bundle", "pid_sidecars");
const read = (file: string) => readFileSync(path.join(REPO, file), "utf8");

/**
 * Every surface that renders a sidecar: it draws the hotspot layer, or it reads the sidecar's provenance itself.
 * A file that only counts sidecars (the tour) shows none, so it is not a point of use. A new one is, and it must
 * state the basis too, either in its own words or by handing the sidecar to HotspotLayer.
 */
const POINTS_OF_USE = [
  "src/components/HotspotLayer.tsx",
  "src/components/PidSheet.tsx", // the drawing sheet of AC-CTX-02, with the hotspots placed on it
  "src/app/(hub)/assets/[tag]/page.tsx",
  "src/app/(hub)/documents/[id]/page.tsx", // the document viewer, where a P&ID opens its own sheet
  "src/app/(hub)/gallery/page.tsx",
];
const RENDERS_A_SIDECAR = /<HotspotLayer|sidecar\.provenance|sidecar\.hotspots|provenance: p \} = sidecar/;

/** The wordings of D-12 and ADR-007, as the components spell them. */
const BASIS_WORDS = ["manual transcription", "agent transcription"];
const REVIEW_WORDS = ["reviewed", "review pending"];

function sidecars(): { file: string; sidecar: PidSidecar }[] {
  return readdirSync(SIDECARS)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ file: f, sidecar: JSON.parse(readFileSync(path.join(SIDECARS, f), "utf8")) as PidSidecar }));
}

describe("AC-ING-12, the basis is stated at every point of use", () => {
  it("finds the sidecar rendered on exactly the surfaces that state its basis", () => {
    const renderers = ["src/components", "src/app"]
      .flatMap((dir) => walk(path.join(REPO, dir)))
      .filter((file) => /\.tsx$/.test(file))
      .filter((file) => RENDERS_A_SIDECAR.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(REPO, file));
    expect(renderers.sort(), "a surface renders a sidecar without being a known point of use").toEqual([...POINTS_OF_USE].sort());
  });

  // Two components carry the wording: HotspotLayer, which draws the hotspots over a page image, and PidSheet, which
  // draws the drawing itself. A surface either says the words or hands the WHOLE sidecar to one of them.
  const DELEGATES = [
    { tag: "<HotspotLayer", pattern: /<HotspotLayer[^>]*sidecar=\{/ },
    { tag: "<PidSheet", pattern: /<PidSheet[^>]*sidecar=\{/ },
  ];

  it.each(POINTS_OF_USE)("%s states the basis and the review status, in its own words or through a component that does", (file) => {
    const source = read(file);
    const delegate = DELEGATES.find((d) => source.includes(d.tag));
    if (!delegate) {
      for (const word of [...BASIS_WORDS, ...REVIEW_WORDS]) expect(source, `${file} does not say "${word}"`).toContain(word);
      return;
    }
    // A surface that draws through a component inherits its provenance line; what it must not do is draw the
    // hotspots without it, so what it passes is the whole sidecar and not a hotspot list.
    expect(source, `${file} passes something other than the whole sidecar to ${delegate.tag}`).toMatch(delegate.pattern);
  });

  it.each(sidecars())("states agent transcription and review pending over $file (D-12)", ({ sidecar }) => {
    const html = renderToStaticMarkup(
      createElement(HotspotLayer, { src: "/api/documents/x/pages/1", alt: "sheet", sidecar, hrefFor: () => undefined }),
    );
    expect(sidecar.provenance.basis).toBe("agent_transcription");
    expect(sidecar.provenance.review_status).toBe("pending");
    expect(sidecar.provenance.reviewed_by).toBeNull();
    expect(html).toContain("agent transcription");
    expect(html).toContain(sidecar.provenance.alias);
    expect(html).toContain(sidecar.provenance.date);
    expect(html).toContain("review pending");
    expect(html).toContain(`${sidecar.hotspots.length}</span> hotspots`);
    expect(html).toContain('data-pending=""');
  });

  it("says nothing about a basis it does not have: no sheet is claimed reviewed", () => {
    for (const { file, sidecar } of sidecars()) {
      const html = renderToStaticMarkup(createElement(HotspotLayer, { src: "/x", alt: "sheet", sidecar, hrefFor: () => undefined }));
      expect(html, `${file} rendered "manual transcription"`).not.toContain("manual transcription");
      expect(html.includes("review pending"), file).toBe(true);
    }
  });

  it("keeps the index and says so where the deployment holds no render for the sheet", () => {
    const page = read("src/app/(hub)/assets/[tag]/page.tsx");
    expect(page).toContain("No sidecar is transcribed for this sheet");
    expect(page).toContain("the designed state");
    // The underlay is served one page at a time by the route of invariant 7, never as a bulk asset.
    expect(page).toContain("/api/documents/${encodeURIComponent(sidecar.document_id)}/pages/1");
  });
});

/** Every file under a directory, so a new surface cannot hide from the point-of-use list above. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
