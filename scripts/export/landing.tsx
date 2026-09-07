// The reviewer landing of the offline export (blueprint 2.1 minute 0 to 1, 9.12, AC-DEL-01), the one screen the
// export authors instead of capturing, because it exists nowhere in the product: the wordmark and tagline, the live
// deployment URL, the D-07 line that access credentials are issued by Team 3V to the Committee (there is no signed
// reviewer link), what the file is and what it cannot do, and the contents of the walk. The 90-second tour of the
// six Expected Solution components is not rebuilt here: the product's own surface 12 already is that tour, with
// every figure read from the seeded corpus at render time, and the export appends it under this block.
//
// Rendered with react-dom/server over the product's own components (GlassPanel, VersionBadge, MethodChip,
// StatusBadge) and its own fixed wordings, so this screen carries the same chrome as every surface behind it.
// Every figure is passed in from the snapshot the build pulled through the API; none is typed here.
import { renderToStaticMarkup } from "react-dom/server";
import { GlassPanel } from "@/components/GlassPanel";
import { MethodChip } from "@/components/MethodChip";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import { CREDENTIALS_LINE, TAGLINE, WORDMARK } from "@/auth/copy";
import { EXPORT_LIVE_URL, EXPORT_OFFLINE_LINE, EXPORT_READONLY_LINE, EXPORT_REPLAY_LINE } from "@/lib/fixed-strings";

const TITLE = "Offline prototype";
const LEAD =
  "The Hub answers a question about the plant with the documents that answer it, refuses to help defeat a protective function, and measures the failure knowledge nobody wrote down. This file is that product, captured whole, for a reviewer with no network.";
const LIVE_HEADING = "The live deployment";
const CONTENTS_HEADING = "What is in this file";
const GAP_HEADING = "The measured gap";
const HOW_HEADING = "How to read it";
const TOUR_HEADING = "The first ninety seconds";
const TOUR_LEAD =
  "The six Expected Solution components in order, as the deployment's own tour renders them, ending on the guided loop route. Each step opens the surface it names, inside this file.";

export type LayerFigure = { layer: string; uncovered: number; of: number };

export type LandingFacts = {
  /** The active corpus version of the instance the export was taken from. */
  version: { label: string; digest: string } | null;
  /** The coverage headline as the Console served it, both layers, with the frozen recipe behind it. */
  coverage: {
    layers: LayerFigure[];
    population: string;
    method: { threshold: number; windowMultiplier: number; recipeSha256: string; stopListSha256: string; extractor: string };
  } | null;
  /** Files in the corpus version, as the snapshot counted them. */
  files: number | null;
  /** The surfaces the export carries, in walk order. */
  contents: Array<{ slug: string; title: string; note: string }>;
  /** Replayed answers and opened citation drawers the file holds. */
  counts: { packets: number; drawers: number; traces: number };
  /** UTC minute the capture was taken. */
  capturedAt: string;
};

function Landing({ facts }: { facts: LandingFacts }) {
  const { version, coverage, files, contents, counts, capturedAt } = facts;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{TITLE}</p>
          <h1 className="font-display text-[44px] leading-none font-semibold tracking-tight text-ink-900">{WORDMARK}</h1>
          <p className="mt-2 text-[16px] text-ink-700">{TAGLINE}</p>
        </div>
        {version ? <VersionBadge label={version.label} digestPrefix={version.digest} active /> : null}
      </header>

      <p className="max-w-[70ch] text-[14.5px] leading-relaxed text-ink-700">{LEAD}</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <GlassPanel className="p-6 lg:col-span-7" aria-labelledby="x-live">
          <h2 id="x-live" className="text-[20px]">
            {LIVE_HEADING}
          </h2>
          <p className="mt-3 text-[14px] text-ink-700">
            The product runs at{" "}
            <a className="draw mono" href={EXPORT_LIVE_URL} rel="noreferrer">
              {EXPORT_LIVE_URL}
            </a>
            .
          </p>
          <p className="mt-2 text-[13.5px] text-ink-700">{CREDENTIALS_LINE}</p>
          <p className="mt-4 border-t border-edge pt-4 text-[13.5px] text-ink-700">{EXPORT_OFFLINE_LINE}</p>
          <p className="mt-2 text-[13.5px] text-ink-700">{EXPORT_READONLY_LINE}</p>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-caveat">
            <StatusBadge kind="machine_drafted" />
            <span className="text-ink-700">{EXPORT_REPLAY_LINE}</span>
          </p>
        </GlassPanel>

        <GlassPanel className="p-6 lg:col-span-5" aria-labelledby="x-how">
          <h2 id="x-how" className="text-[20px]">
            {HOW_HEADING}
          </h2>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[13.5px] text-ink-700">
            <li>Walk the tour below; every step opens a surface inside this file.</li>
            <li>Open a citation chip: it holds the document, the revision, the approval status, the page and the span the claim stands on.</li>
            <li>Use the sheet index on the left of any surface, or the contents beside this note, to move between surfaces.</li>
          </ol>
          <dl className="fields mt-5">
            <dt>Surfaces</dt>
            <dd className="mono">{contents.length}</dd>
            <dt>Replayed answers</dt>
            <dd className="mono">{counts.packets}</dd>
            <dt>Traces</dt>
            <dd className="mono">{counts.traces}</dd>
            <dt>Citation drawers</dt>
            <dd className="mono">{counts.drawers}</dd>
            {files === null ? null : (
              <>
                <dt>Corpus files</dt>
                <dd className="mono">{files}</dd>
              </>
            )}
            <dt>Captured</dt>
            <dd className="mono">{capturedAt}</dd>
          </dl>
        </GlassPanel>
      </div>

      {coverage ? (
        <GlassPanel className="p-6" aria-labelledby="x-gap">
          <h2 id="x-gap" className="text-[20px]">
            {GAP_HEADING}
          </h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {coverage.layers.map((l) => (
              <div key={l.layer} data-layer={l.layer}>
                <p className="eyebrow">{l.layer} layer</p>
                <p className="mono mt-1 flex items-baseline gap-2">
                  <span className="text-[56px] leading-none font-medium text-ink-900">{l.uncovered}</span>
                  <span className="text-[16px] text-ink-500">of {l.of}</span>
                </p>
                <p className="mt-1 text-[13px] text-ink-700">{coverage.population}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <MethodChip
              threshold={coverage.method.threshold}
              layer="both"
              windowMultiplier={coverage.method.windowMultiplier}
              recipeSha256={coverage.method.recipeSha256}
              stopListSha256={coverage.method.stopListSha256}
              extractor={coverage.method.extractor}
            />
          </div>
        </GlassPanel>
      ) : null}

      <GlassPanel className="p-6" aria-labelledby="x-contents">
        <h2 id="x-contents" className="text-[20px]">
          {CONTENTS_HEADING}
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
          {contents.map((c, i) => (
            <li key={c.slug} className="flex items-baseline gap-3 border-b border-edge pb-2">
              <span className="mono text-[11px] text-ink-500">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0">
                <a className="draw text-[14px] font-medium" href={`#${c.slug}`}>
                  {c.title}
                </a>
                <span className="block text-[12.5px] text-ink-500">{c.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </GlassPanel>

      <section aria-labelledby="x-tour" className="border-t border-edge pt-8">
        <h2 id="x-tour" className="font-display text-[30px] leading-tight font-semibold tracking-tight text-ink-900">
          {TOUR_HEADING}
        </h2>
        <p className="mt-2 max-w-[70ch] text-[14px] text-ink-700">{TOUR_LEAD}</p>
      </section>
    </div>
  );
}

/** The landing markup, ready to be placed as the export's first section. */
export function renderLanding(facts: LandingFacts): string {
  return renderToStaticMarkup(<Landing facts={facts} />);
}
