// Blueprint 6.4 PermissiveGate: the start permissives of one LOGIC No as the rows of their AND gate, each row
// verbatim with its number and its signal tag, the standing bypass state in the caveat token where the sheet
// records one, and the gate symbol drawn beside the rows (system.css .gate-and; hidden at narrow widths, the
// wording stays). Typed by StartPermissive and Interlock.permissive_gate (9.3); nothing is inferred here.
import type { Interlock, StartPermissive } from "@/contracts/generated/asset";
import { cx } from "./cx";
import "./system.css";

export type PermissiveGateProps = {
  seqId: string;
  gate: Interlock["permissive_gate"];
  permissives: StartPermissive[];
  className?: string;
};

const ROWS = "rows";
const GATE = "gate";
const NO_GATE = "no gate stated on the sheet";
const STANDING_BYPASS = "standing bypass";
const START = "start";

export function PermissiveGate({ seqId, gate, permissives, className }: PermissiveGateProps) {
  return (
    <div className={cx("gate", className)} role="group" aria-label={`Start permissives of ${seqId}`} data-component="permissive-gate" data-seq={seqId}>
      <ol className="gate-rows">
        {permissives.map((p) => (
          <li key={p.n} className="gate-row" data-span={p.span_id}>
            <span className="n">{p.n}</span>
            <span className="verbatim">{p.text}</span>
            {p.signal_tag ? <span className="tag">{p.signal_tag}</span> : <span />}
            {p.standing_bypass_state ? (
              <span className="bypass">
                {STANDING_BYPASS} <span className="verbatim">{p.standing_bypass_state}</span>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {gate ? (
        <div className="gate-and" aria-hidden>
          <span />
          <span>{gate}</span>
          <span />
        </div>
      ) : (
        <span />
      )}
      <p className="gate-out">
        <span className="mono">{permissives.length}</span> {ROWS} · {GATE} <span className="mono">{gate ?? NO_GATE}</span> · {START}{" "}
        <span className="mono">{seqId}</span>
      </p>
    </div>
  );
}
