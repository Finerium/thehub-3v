// Blueprint 6.4 VerdictStrip: C1 to C6 with pass and fail marks (a glyph and the word, never colour alone), the
// repair-round count and the trace link. Typed by AnswerTrace.gate_results; each cell's title carries the gate's
// detail line.
import Link from "next/link";
import type { AnswerTrace } from "@/contracts/generated/serving";
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
const REPAIR_ROUNDS = "repair rounds";
const TRACE = "Trace";

export function VerdictStrip({ results, repairRounds, traceHref, className }: VerdictStripProps) {
  return (
    <div className={cx("verdicts", className)} role="group" aria-label="Gate results" data-component="verdict-strip">
      <span className="verdicts-gates">
        {GATES.map((gate) => {
          const r = results[gate];
          return (
            <span key={gate} className="vcell" data-gate={gate} data-pass={r.pass ? "true" : "false"} title={r.detail}>
              {gate}
              <b>
                <span aria-hidden>{r.pass ? "✓" : "✕"}</span> {r.pass ? PASS : FAIL}
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
