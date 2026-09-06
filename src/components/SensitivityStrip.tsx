// Blueprint 6.4 SensitivityStrip: the two layers side by side, each a ladder of thresholds with its uncovered
// count and a bar scaled to the population, the current threshold marked. Typed by CoverageSummary; the rows are
// the summary's own sensitivity entries in the order the harness wrote them.
import type { CoverageSummary } from "@/contracts/generated/coverage";
import { cx } from "./cx";
import "./system.css";

export type SensitivityLayer = Pick<CoverageSummary, "layer" | "threshold" | "population_count" | "sensitivity">;

export type SensitivityStripProps = { layers: SensitivityLayer[]; className?: string };

const CURRENT = "current";
const T = "t";
const UNCOVERED = "uncovered";

export function SensitivityStrip({ layers, className }: SensitivityStripProps) {
  return (
    <div className={cx("sens", className)} data-component="sensitivity-strip">
      {layers.map((layer) => (
        <section key={layer.layer} className="sens-col" aria-label={`${layer.layer} layer sensitivity`}>
          <h4>
            {layer.layer} <span className="mono font-normal text-ink-500">{T} = {layer.threshold}</span>
          </h4>
          <ol className="sens-ladder">
            {layer.sensitivity.map((row) => {
              const current = row.t === layer.threshold;
              const share = layer.population_count > 0 ? row.uncovered_count / layer.population_count : 0;
              return (
                <li key={row.t} className="sens-row" aria-current={current ? "true" : undefined}>
                  <span>{row.t}</span>
                  <span className="bar" aria-hidden>
                    <i style={{ transform: `scaleX(${share})` }} />
                  </span>
                  <span className="n" aria-label={`${T} ${row.t}: ${row.uncovered_count} ${UNCOVERED}`}>
                    {row.uncovered_count}
                    {current ? <span className="sens-current"> {CURRENT}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
