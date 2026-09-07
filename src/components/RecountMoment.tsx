"use client";

// Blueprint 6.4 RecountMoment, the signature moment of 7.2: on publication the corpus version increments with a
// choreographed roll, the moved record travels from the no-lesson band to the taught band in both layers, and the
// cluster's score recomputes visibly. Everything else in the product stays disciplined so this one moment lands.
//
// The figure is one axis per layer: the unplanned-failure population drawn left to right as its three bands (no
// lesson, copied row only, taught) with the record that moved riding along it. That is a different drawing from
// the Console's BandBars, which is the static reading of the same rows; this one exists to show a record change
// band, so the bands are segments of one strip rather than three separate bars.
//
// Nothing here is generated. `before` is what the visitor's corpus version reads now, `after` is what
// POST /api/drafts/:id/publish recounted and GET /api/coverage read back, and the records that moved are the
// difference of the two clusters' own uncovered lists. A layer whose count did not move says so rather than
// animating something that did not happen. Motion is transform and opacity only, driven by a state flip so that
// prefers-reduced-motion (which zeroes every duration globally) lands on exactly the same states with no motion.
import { useEffect, useState, type CSSProperties } from "react";
import { cx } from "./cx";
import { VersionBadge } from "./VersionBadge";

export type RecountBands = { no_lesson: number; copied_row_only: number; taught: number };

/** One layer's reading of the headline population, as coverage_summary stores it (9.5). */
export type RecountLayer = {
  layer: "generous" | "strict";
  threshold: number;
  uncovered_count: number;
  population_count: number;
  bands: RecountBands | null;
};

/** One side of the recount: a corpus version, both layers of the headline population, and the target cluster. */
export type RecountSide = {
  version: { label: string; digest_prefix: string };
  generous: RecountLayer;
  strict: RecountLayer;
  cluster: { rank: number; score: number; uncovered_wo_numbers: string[] } | null;
};

export type RecountMomentProps = {
  /** The reading before the publication. */
  before: RecountSide;
  /** The reading the recount produced; null until a publication has run, which is the armed state. */
  after: RecountSide | null;
  /** The two digests the recount ran under; AC-LOOP-12 requires them unchanged from the baseline. */
  method: { recipe_sha256: string; stop_list_sha256: string };
  /** The record the walk is about, so the tile that travels carries a work-order id and never a band name. */
  record?: string;
  className?: string;
};

const TITLE = "The recount";
const ARMED = "No publication has recounted this browser's corpus yet. The reading below is the version the visitor sees now; publishing a lesson recounts it under the same recipe and moves what it teaches.";
const POPULATION = "unplanned-failure records";
const UNCOVERED = "uncovered";
const BAND_LABEL: Record<keyof RecountBands, string> = {
  no_lesson: "no lesson",
  copied_row_only: "copied row only",
  taught: "taught",
};
const BAND_ORDER: ReadonlyArray<keyof RecountBands> = ["no_lesson", "copied_row_only", "taught"];
const BAND_INK: Record<keyof RecountBands, string> = {
  no_lesson: "bg-defect",
  copied_row_only: "bg-caveat",
  taught: "bg-verified",
};
const LAYER_LABEL: Record<RecountLayer["layer"], string> = { generous: "Generous layer", strict: "Strict layer" };
const THRESHOLD = "t";
const UNCHANGED = "This layer's uncovered count did not move.";
const NO_BANDS = "This version stores no band split for the population, so no record can be drawn travelling.";
const MOVED_LEAD = "Moved out of the cluster's uncovered set";
const NONE_MOVED = "No record left the cluster's uncovered set.";
const CLUSTER_SCORE = "Cluster score";
const CLUSTER_RANK = "rank";
const RECIPE = "recipe";
const STOP_LIST = "stop list";
const SAME_RECIPE = "The recount ran under the baseline's recipe and stop-list digests; a disagreement would have refused the recount before a row was written.";
const NOT_ACTIVE = "This version is the browser's own and was never activated: the numbers move here and nowhere else.";
const SAME_BANDS = "Both layers report the same band split of the population: what separates them is the uncovered count at the threshold, not the bands.";
const DIGEST_PREFIX = 12;

/** The share of the population each band holds, and the cumulative offset each segment starts at. */
type Segment = { band: keyof RecountBands; count: number; share: number; offset: number; centre: number };

function segmentsOf(reading: RecountLayer): Segment[] | null {
  const bands = reading.bands;
  const total = reading.population_count;
  if (bands === null || total <= 0) return null;
  let offset = 0;
  return BAND_ORDER.map((band) => {
    const count = bands[band];
    const share = count / total;
    const segment: Segment = { band, count, share, offset, centre: offset + share / 2 };
    offset += share;
    return segment;
  });
}

/** Where the travelling record rides on one layer's strip: the centre of the band it is in. */
function centreOf(segments: Segment[], band: keyof RecountBands): number {
  return segments.find((s) => s.band === band)?.centre ?? 0;
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}

/** One layer lane: the strip, the travelling record, the three counts, the layer's own uncovered headline. */
function Lane({
  before,
  after,
  record,
  played,
  index,
}: {
  before: RecountLayer;
  after: RecountLayer | null;
  /** The work-order id the tile carries; with none, no tile is drawn. */
  record: string | null;
  played: boolean;
  index: number;
}) {
  const shown = played && after ? after : before;
  const segments = segmentsOf(shown);
  const beforeSegments = segmentsOf(before);
  const changed = after !== null && after.uncovered_count !== before.uncovered_count;
  // The record rides at the no-lesson centre of the reading before the recount and lands at the taught centre of
  // the reading after it; with no recount, or none in this layer, it stays where it is.
  const from = beforeSegments === null ? null : centreOf(beforeSegments, "no_lesson");
  const to = segments === null ? null : changed ? centreOf(segments, "taught") : from;
  const ride = played ? to : from;

  return (
    <div className="rise" style={{ "--i": index + 2 } as CSSProperties} data-layer={shown.layer}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="text-[14px] font-semibold text-ink-900">{LAYER_LABEL[shown.layer]}</h4>
        <p className="text-[12.5px] text-ink-700">
          <span className="mono text-[13.5px] font-medium text-ink-900">{shown.uncovered_count}</span> {UNCOVERED}{" "}
          <span className="text-ink-500">of</span> <span className="mono">{shown.population_count}</span> {POPULATION}
          <span className="mono ml-2 text-ink-500">
            {THRESHOLD} = {shown.threshold}
          </span>
        </p>
      </div>

      {segments === null ? (
        <p className="text-[12.5px] text-ink-500">{NO_BANDS}</p>
      ) : (
        <>
          <div className="relative h-[18px] w-full overflow-hidden rounded-[3px] bg-[color-mix(in_srgb,var(--ink-500)_10%,transparent)]">
            {segments.map((s) => (
              <span
                key={s.band}
                aria-hidden
                data-band={s.band}
                className={cx("absolute inset-y-0 left-0 w-full origin-left transition-transform duration-700 ease-out", BAND_INK[s.band])}
                style={{ transform: `translateX(${percent(s.offset)}) scaleX(${s.share})` }}
              />
            ))}
          </div>

          {/* The record that moved, riding the same axis. The wrapper spans the strip, so a percentage translate on
              it is a percentage of the strip; the tile inside only centres itself on that point. */}
          <div className="relative h-6" aria-hidden>
            {ride === null || record === null ? null : (
              <span
                className="absolute top-0 left-0 block w-full transition-transform duration-700 ease-out"
                style={{ transform: `translateX(${percent(ride)})` }}
              >
                <span className="mono absolute top-0 left-0 -translate-x-1/2 rounded-[3px] bg-paper px-1.5 py-px text-[10.5px] whitespace-nowrap text-ink-700 shadow-[0_0_0_1px_var(--film-edge)]">
                  {record}
                </span>
              </span>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-x-4 text-[12.5px]">
            {segments.map((s) => {
              const was = beforeSegments?.find((b) => b.band === s.band)?.count ?? s.count;
              return (
                <div key={s.band} className="flex items-baseline gap-2">
                  <dt className="flex items-center gap-1.5 text-ink-700">
                    <span aria-hidden className={cx("inline-block h-[7px] w-[7px] rounded-[1px]", BAND_INK[s.band])} />
                    {BAND_LABEL[s.band]}
                  </dt>
                  <dd className="mono m-0 text-ink-900">
                    {was === s.count ? (
                      s.count
                    ) : (
                      <>
                        <span className="text-ink-500 line-through">{was}</span>{" "}
                        <span key={`${s.band}-${s.count}`} className="roll font-medium">
                          {s.count}
                        </span>
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          {after !== null && !changed ? <p className="mt-1 text-[12.5px] text-ink-500">{UNCHANGED}</p> : null}
        </>
      )}
    </div>
  );
}

export function RecountMoment({ before, after, method, record, className }: RecountMomentProps) {
  // The play flip: the browser paints the before geometry, then the after geometry transitions in. Reduced motion
  // zeroes every duration globally (globals.css), so the same two renders land with no travel.
  // `playedKey` lags the recount by two frames, so the before geometry is painted once and the after geometry
  // transitions in from it; the state is set from the frame callback and never synchronously inside the effect.
  const key = after?.version.label ?? null;
  const [playedKey, setPlayedKey] = useState<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPlayedKey(key));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [key]);
  const played = key !== null && playedKey === key;

  // The records the recount took out of the cluster's uncovered set, as the two clusters' own lists name them.
  const wasUncovered = before.cluster?.uncovered_wo_numbers ?? [];
  const nowUncovered = after?.cluster?.uncovered_wo_numbers ?? null;
  const moved = nowUncovered === null ? [] : wasUncovered.filter((wo) => !nowUncovered.includes(wo));
  const shownSide = played && after ? after : before;
  const shownCluster = shownSide.cluster;
  // The tile carries the record that actually moved once one has; before that, the record the walk is about.
  const travelling = moved[0] ?? record ?? null;
  // The two rows carry the band split of the same population; when they agree, say so rather than let a reader
  // read two identical strips as a rendering mistake.
  const sameBands =
    shownSide.generous.bands !== null &&
    shownSide.strict.bands !== null &&
    BAND_ORDER.every((band) => shownSide.generous.bands?.[band] === shownSide.strict.bands?.[band]);

  return (
    <section
      className={cx("recount", className)}
      data-component="recount-moment"
      data-played={played ? "" : undefined}
      aria-live="polite"
      aria-label={TITLE}
    >
      <header className="rise flex flex-wrap items-center justify-between gap-x-6 gap-y-3" style={{ "--i": 0 } as CSSProperties}>
        <h3 className="text-[20px]">{TITLE}</h3>
        <p className="flex flex-wrap items-center gap-2">
          <VersionBadge label={before.version.label} digestPrefix={before.version.digest_prefix} />
          {after ? (
            <>
              <span aria-hidden className="mono text-ink-500">
                &rarr;
              </span>
              <VersionBadge key={shownSide.version.label} label={shownSide.version.label} digestPrefix={shownSide.version.digest_prefix} />
            </>
          ) : null}
        </p>
      </header>

      {after === null ? (
        <p className="rise mt-2 max-w-prose text-[13px] text-ink-700" style={{ "--i": 1 } as CSSProperties}>
          {ARMED}
        </p>
      ) : (
        <p className="rise mt-2 max-w-prose text-[13px] text-ink-700" style={{ "--i": 1 } as CSSProperties}>
          {moved.length > 0 ? (
            <>
              <span className="text-ink-500">{MOVED_LEAD}:</span>{" "}
              {moved.map((wo) => (
                <span key={wo} className="mono mr-1.5 text-ink-900">
                  {wo}
                </span>
              ))}
            </>
          ) : (
            NONE_MOVED
          )}
          <span className="block text-ink-500">{NOT_ACTIVE}</span>
        </p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <Lane before={before.generous} after={after?.generous ?? null} record={travelling} played={played} index={0} />
        <Lane before={before.strict} after={after?.strict ?? null} record={travelling} played={played} index={1} />
      </div>

      {sameBands ? (
        <p className="rise mt-3 max-w-prose text-[12.5px] text-ink-500" style={{ "--i": 4 } as CSSProperties}>
          {SAME_BANDS}
        </p>
      ) : null}

      {shownCluster ? (
        <p className="rise mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-edge pt-4 text-[13px]" style={{ "--i": 4 } as CSSProperties}>
          <span className="eyebrow">{CLUSTER_SCORE}</span>
          {after?.cluster && after.cluster.score !== before.cluster?.score && before.cluster ? (
            <span className="mono">
              <span className="text-ink-500 line-through">{before.cluster.score.toFixed(4)}</span>{" "}
              <span key={shownCluster.score} className="roll font-medium text-ink-900">
                {shownCluster.score.toFixed(4)}
              </span>
            </span>
          ) : (
            <span className="mono text-ink-900">{shownCluster.score.toFixed(4)}</span>
          )}
          <span className="text-ink-500">
            {CLUSTER_RANK} <span className="mono text-ink-700">{shownCluster.rank}</span>
          </span>
        </p>
      ) : null}

      <p className="rise mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-ink-500" style={{ "--i": 5 } as CSSProperties}>
        <span className="mono">
          {RECIPE} {method.recipe_sha256.slice(0, DIGEST_PREFIX)}
        </span>
        <span className="mono">
          {STOP_LIST} {method.stop_list_sha256.slice(0, DIGEST_PREFIX)}
        </span>
        <span className="max-w-prose">{SAME_RECIPE}</span>
      </p>
    </section>
  );
}
