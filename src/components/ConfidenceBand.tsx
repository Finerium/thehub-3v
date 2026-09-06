// Blueprint 6.4 ConfidenceBand: high, medium or low as three notches with the word, and the three inputs of the
// deterministic band (question coverage, source count, approval share) on hover and on focus. Typed by
// AnswerTrace.confidence; the values are printed as the trace carries them.
import { useId } from "react";
import type { AnswerTrace } from "@/contracts/generated/serving";
import { cx } from "./cx";
import "./system.css";

export type ConfidenceBandProps = {
  band: AnswerTrace["confidence"]["band"];
  inputs: AnswerTrace["confidence"]["inputs"];
  className?: string;
};

const LABEL = "confidence";
const INPUT_LABELS: Record<keyof AnswerTrace["confidence"]["inputs"], string> = {
  question_coverage: "question coverage",
  source_count: "source count",
  approval_share: "approval share",
};

export function ConfidenceBand({ band, inputs, className }: ConfidenceBandProps) {
  const panelId = useId();
  const entries = (Object.keys(INPUT_LABELS) as Array<keyof typeof INPUT_LABELS>).map((k) => [INPUT_LABELS[k], inputs[k]] as const);
  return (
    <span
      className={cx("conf", className)}
      data-component="confidence-band"
      data-band={band}
      tabIndex={0}
      role="group"
      aria-label={`${LABEL} ${band}: ${entries.map(([k, v]) => `${k} ${v}`).join(", ")}`}
      aria-describedby={panelId}
    >
      <span className="conf-notches" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span>
        {LABEL} <b className="font-medium">{band}</b>
      </span>
      <dl id={panelId} className="conf-panel glass fields" aria-hidden>
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="mono">{v}</dd>
          </div>
        ))}
      </dl>
    </span>
  );
}
