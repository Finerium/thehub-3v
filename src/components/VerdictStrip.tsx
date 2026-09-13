// Blueprint 6.4 VerdictStrip: C1 to C6 with pass, fail and not-run marks (a glyph and the word, never colour
// alone), the repair-round count and the trace link. Typed by AnswerTrace.gate_results; each cell's title carries
// the gate's detail line. A gate that never ran (a refusal, search mode, a composer that never answered) carries
// the detail GATE_NOT_RUN and is drawn as "not run": a check nobody ran is never a tick.
import Link from "next/link";
import type { AnswerTrace } from "@/contracts/generated/serving";
import { GATE_NOT_RUN } from "@/lib/fixed-strings";
import { cx } from "./cx";
import "./system.css";

export const GATES = ["C1", "C2", "C3", "C4", "C5", "C6"] as const;
export type GateId = (typeof GATES)[number];

export type VerdictStripProps = {
  results: AnswerTrace["gate_results"];
  repairRounds: number;
  traceHref?: string;
  className?: string;
};

const PASS = "pass";
const FAIL = "fail";
const NOT_RUN = GATE_NOT_RUN;
const REPAIR_ROUNDS = "repair rounds";
const TRACE = "Trace";

export function VerdictStrip({ results, repairRounds, traceHref, className }: VerdictStripProps) {
  return (
    <div className={cx("verdicts", className)} role="group" aria-label="Gate results" data-component="verdict-strip">
      <span className="verdicts-gates">
        {GATES.map((gate) => {
          const r = results[gate];
          const ran = r.detail !== GATE_NOT_RUN;
          const state = !ran ? "not-run" : r.pass ? "true" : "false";
          return (
            <span key={gate} className="vcell" data-gate={gate} data-pass={state} title={r.detail}>
              {gate}
              <b>
                <span aria-hidden>{!ran ? "–" : r.pass ? "✓" : "✕"}</span> {!ran ? NOT_RUN : r.pass ? PASS : FAIL}
              </b>
            </span>
          );
        })}
      </span>
      <span className="verdicts-meta">
        <span>
          {REPAIR_ROUNDS} <span className="mono">{repairRounds}</span>
        </span>
        {traceHref ? (
          <Link href={traceHref} className="draw">
            {TRACE} <span aria-hidden>&rarr;</span>
          </Link>
        ) : null}
      </span>
    </div>
  );
}
