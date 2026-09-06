"use client";

// Blueprint 6.4 BandBars: the three bands of the unplanned-failure population (no lesson, copied row only, taught)
// as three strips scaled to the population, counts in mono beside them. The bars move only on a recount: the
// transition is armed for a moment when `recountKey` changes (the corpus version id after a publication) and is
// off otherwise, so a first render and a layer switch paint statically. Transform only.
import { useEffect, useRef, useState } from "react";
import type { CoverageSummary } from "@/contracts/generated/coverage";
import { cx } from "./cx";
import "./system.css";

export type Bands = NonNullable<CoverageSummary["bands"]>;

export type BandBarsProps = {
  bands: Bands;
  populationCount: number;
  /** Changes on a recount; the bars animate to their new lengths while it settles. */
  recountKey: string;
  className?: string;
};

export const BAND_ORDER = ["no_lesson", "copied_row_only", "taught"] as const;
export const BAND_LABEL: Record<keyof Bands, string> = {
  no_lesson: "no lesson",
  copied_row_only: "copied row only",
  taught: "taught",
};
const OF = "of";
const RECORDS = "records";
const SETTLE_MS = 700;

export function BandBars({ bands, populationCount, recountKey, className }: BandBarsProps) {
  const [animating, setAnimating] = useState(false);
  const lastKey = useRef(recountKey);

  useEffect(() => {
    if (lastKey.current === recountKey) return;
    lastKey.current = recountKey;
    setAnimating(true);
    const t = window.setTimeout(() => setAnimating(false), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [recountKey]);

  return (
    <div className={cx("bands", className)} data-component="band-bars" data-animate={animating ? "" : undefined} role="group" aria-label="Coverage bands">
      {BAND_ORDER.map((band) => {
        const n = bands[band];
        const share = populationCount > 0 ? n / populationCount : 0;
        return (
          <div key={band} className="contents">
            <span className="bands-label">{BAND_LABEL[band]}</span>
            <span className="bands-track" aria-hidden>
              <span className="bands-bar" data-band={band} style={{ transform: `scaleX(${share})` }} />
            </span>
            <span className="bands-count" aria-label={`${BAND_LABEL[band]}: ${n} ${OF} ${populationCount}`}>
              {n}
            </span>
          </div>
        );
      })}
      <span className="bands-foot">
        {OF} <span className="mono">{populationCount}</span> {RECORDS}
      </span>
    </div>
  );
}
