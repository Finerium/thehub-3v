// Blueprint 6.4 StateRail: the draft's state history as a rail, oldest step at the top, one node per
// `draft_transition` row (9.6). Each node carries the pair it moved, the actor that moved it (an alias and a role,
// or the literal `system` for a machine step, drawn as a square node rather than a round one so the machine steps
// read apart from the human ones), the server timestamp, the reason where one was recorded, and the recorded diff
// of an in-review edit verbatim, one line per element the Reviewing Supervisor rewrote.
//
// 7.2, tactile-transactional: the step just taken is the one that animates. The newest node carries `data-latest`
// and the roll of globals.css, which the reduced-motion rule turns into a static render; every other node is drawn
// settled. Nothing here writes: a rail is the history, and the one writer of a state is src/loop/state.ts.
import type { DraftState, DraftTransition } from "@/contracts/generated/drafts";
import { cx } from "./cx";
import "./drafts.css";

export type StateRailProps = {
  transitions: readonly DraftTransition[];
  /** The state the draft is in now, stated above the rail. */
  current?: DraftState;
  /** What stands in the rail's place before the first transition is written. */
  emptyText?: string;
  className?: string;
};

/** The server timestamp of 9.6 as it reads on the sheet: the UTC instant, seconds resolution. */
export function stampOf(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z`;
}

export function StateRail({ transitions, current, emptyText, className }: StateRailProps) {
  const latest = transitions.length - 1;
  return (
    <div className={cx(className)} data-component="state-rail" data-current={current}>
      {transitions.length === 0 ? (
        <p className="text-[12.5px] text-ink-500">{emptyText ?? "No transition has been written for this draft yet."}</p>
      ) : (
        <ol className="rail-states">
          {transitions.map((t, i) => (
            <li
              key={t.id}
              className="rstep"
              data-latest={i === latest ? "" : undefined}
              data-system={t.actor_role === "system" ? "" : undefined}
            >
              <span className="rstep-mark" aria-hidden />
              <div>
                <p className="rstep-pair">
                  <span className="from">{t.from_state}</span>
                  <span className="arrow" aria-hidden>
                    &rarr;
                  </span>
                  <span>{t.to_state}</span>
                </p>
                <p className="rstep-who">
                  <span className="mono">{t.actor_alias}</span>
                  {t.actor_role === "system" ? null : <> · {t.actor_role}</>} · <span className="mono">{stampOf(t.server_ts)}</span>
                </p>
                {t.reason === null ? null : <p className="rstep-reason">{t.reason}</p>}
                {t.edit_diff === null ? null : <pre className="rstep-diff">{t.edit_diff}</pre>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
