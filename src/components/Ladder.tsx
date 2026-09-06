// Blueprint 6.4 Ladder: the normal band, alarm, trip and relief layers of one instrument tag, each with its value in
// mono (comparator, value, unit as the fact carries them), a source-class tag and the source chip; the absence
// statement where a layer has no source, naming the classes read; the relief layer omitted at a non-pressure
// variable and said so; the trip row's vote cell verbatim; the qualifier (the sheet's own note) in the caveat
// token; the fixed as-built caveat closing the ladder. The layers draw in sequence on first render (system.css
// .rung: transform and opacity staggered by --i; static under prefers-reduced-motion through globals.css). Typed by
// TypedFact (9.8) per layer; nothing is computed or ordered here.
import type { CSSProperties, ReactNode } from "react";
import type { Citation, TypedFact } from "@/contracts/generated/evidence_packet";
import { ladderAbsence, reliefOmitted } from "@/lib/fixed-strings";
import { CaveatLine } from "./CaveatLine";
import { CitationChip } from "./CitationChip";
import { cx } from "./cx";
import "./system.css";

export const LADDER_LAYERS = ["normal", "alarm", "trip", "relief"] as const;
export type LadderLayer = (typeof LADDER_LAYERS)[number];

export type LadderProps = {
  instrumentTag: string;
  /** The process variable the tag reads, as the surface names it ("pressure", "vibration"). */
  variable: string;
  /** A relief layer exists only at a pressure variable; elsewhere the ladder states the omission. */
  pressure: boolean;
  /** One typed fact per layer, or null where no document states the layer. */
  layers: Record<LadderLayer, TypedFact | null>;
  /** The trip row's vote cell, verbatim (InterlockRow.vote_cell_text); null when no trip row exists. */
  voteCellText: string | null;
  /** The document classes read for this ladder, named in the absence statement. */
  classesRead: readonly string[];
  /** Rendered in a source chip's drawer, at the span. */
  drawerFor?: (citation: Citation) => ReactNode;
  className?: string;
};

export const LAYER_LABEL: Record<LadderLayer, string> = {
  normal: "normal band",
  alarm: "alarm",
  trip: "trip",
  relief: "relief",
};
const TITLE = "Setpoint ladder";
const VOTE = "vote";

export function Ladder({ instrumentTag, variable, pressure, layers, voteCellText, classesRead, drawerFor, className }: LadderProps) {
  const rungs = pressure ? LADDER_LAYERS : LADDER_LAYERS.filter((layer) => layer !== "relief");
  return (
    <section className={cx("ladder-wrap", className)} data-component="ladder" data-tag={instrumentTag} aria-label={`${TITLE} ${instrumentTag}`}>
      <div className="ladder-head">
        <span className="ladder-tag">{instrumentTag}</span>
        <span className="eyebrow">{TITLE}</span>
        <span className="tag">{variable}</span>
      </div>
      <ol className="ladder">
        {rungs.map((layer, i) => {
          const fact = layers[layer];
          return (
            <li key={layer} className="rung" data-layer={layer} data-absent={fact ? undefined : ""} style={{ "--i": i } as CSSProperties}>
              <span className="rung-label">{LAYER_LABEL[layer]}</span>
              <span className="rung-rail" aria-hidden />
              <div className="rung-body">
                {fact ? (
                  <>
                    <span className="rung-value" aria-label={`${LAYER_LABEL[layer]}: ${fact.comparator ?? ""} ${fact.value_text} ${fact.unit ?? ""}`.trim()}>
                      {fact.comparator ? <span className="text-ink-500">{fact.comparator} </span> : null}
                      {fact.value_text}
                      {fact.unit ? <span className="text-ink-700"> {fact.unit}</span> : null}
                    </span>
                    <span className="tag">{fact.source_class}</span>
                    <CitationChip citation={fact.source} compact>
                      {drawerFor?.(fact.source)}
                    </CitationChip>
                    {layer === "trip" && voteCellText ? (
                      <span className="rung-vote">
                        <span className="eyebrow">{VOTE}</span> <span className="verbatim mono">{voteCellText}</span>
                      </span>
                    ) : null}
                    {fact.qualifier ? (
                      <p className="rung-qualifier">
                        <span className="verbatim">{fact.qualifier}</span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <span className="rung-absent">{ladderAbsence(LAYER_LABEL[layer], classesRead)}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="ladder-foot">
        {pressure ? null : <p className="ladder-omitted">{reliefOmitted(variable)}</p>}
        <CaveatLine kind="as_built" />
      </div>
    </section>
  );
}
