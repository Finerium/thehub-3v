// Blueprint 6.4 DecisionButtons: accept, edit, reject, publish and re-propose as neumorphic controls whose
// availability follows the 9.9 matrix and the 9.6 transition table, asked here through the same two functions every
// route handler asks (src/auth/matrix.ts): `canDecide` for the decide column with the Manager's
// reject-from-accepted restriction inside it, and `can` for the publish and create_draft columns. A control this
// role may not use in this state is not rendered as a dead button and is not hidden either: the panel states the
// reason, because a reviewer who cannot see why a decision is unavailable learns nothing from its absence.
//
// INV-3 is visible here: the Admin holds no drafting, review or publication right at all, the Engineer holds none
// of the decide column, and publication belongs to the Manager alone. The buttons only call back; every check is
// made again by the route, by src/loop/state.ts and by G3.
import type { ReactNode } from "react";
import { can, canDecide } from "@/auth/matrix";
import type { DraftState } from "@/contracts/generated/drafts";
import type { Role } from "@/contracts/generated/serving";
import { cx } from "./cx";
import "./drafts.css";
import { NeumorphicChip } from "./NeumorphicChip";

/** 9.6: the two states a draft may be re-proposed from; every other state creates nothing. */
const REPROPOSABLE: readonly DraftState[] = ["blocked", "rejected"];

export type DecisionButtonsProps = {
  role: Role;
  state: DraftState;
  /** A request is in flight; every control is inert until it lands. */
  busy?: boolean;
  /** The tracked-changes editor is open (the edit control reads as pressed). */
  editing?: boolean;
  onAccept?: () => void;
  onEdit?: () => void;
  onReject?: () => void;
  onPublish?: () => void;
  onRepropose?: () => void;
  className?: string;
};

const ICON = (path: string): ReactNode => (
  <svg viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const TICK = ICON("M3 8.4 6.3 12 13 4.5");
const PEN = ICON("M2.5 13.5h11M3.5 10.6l6.4-6.4 2.1 2.1-6.4 6.4-2.8.7z");
const CROSS = ICON("M4 4l8 8M12 4l-8 8");
const STAMP = ICON("M8 2.5v4M4.5 6.5h7l-1 4h-5zM3.5 12.5h9");
const AGAIN = ICON("M13 8a5 5 0 1 1-1.6-3.7M13 2v3h-3");

/** Why this role has no control on this draft, in the words of the matrix it was refused by. */
function why(role: Role, state: DraftState): string {
  if (role === "Admin") {
    return "The Admin role holds no drafting, review or publication right (9.9); it activates corpus versions and nothing else on a draft.";
  }
  if (role === "Engineer") {
    return "The Engineer role holds no decide and no publish column (9.9). An engineer fills a slot with an SME note; the Reviewing Supervisor decides and the Manager publishes.";
  }
  if (state === "published") return "This draft is published. Published is terminal: no decision moves it again (9.6).";
  if (role === "Manager") {
    return state === "in_review"
      ? "The Manager decides only on a draft that is already accepted (9.9, reject-from-accepted only). The Reviewing Supervisor accepts, edits or rejects a draft in review."
      : "The Manager publishes an accepted draft and may reject it (9.9). This draft is not accepted.";
  }
  return state === "accepted"
    ? "The Reviewing Supervisor decides on a draft in review; publication and rejection from accepted are the Manager's (9.9, INV-3)."
    : "No decision is open on this state: the draft is still with the machine lane, and the review controls appear when the redliner returns it for review (9.6).";
}

export function DecisionButtons({
  role,
  state,
  busy,
  editing,
  onAccept,
  onEdit,
  onReject,
  onPublish,
  onRepropose,
  className,
}: DecisionButtonsProps) {
  const accept = canDecide(role, "accept", state);
  const edit = canDecide(role, "edit", state);
  const reject = canDecide(role, "reject", state);
  const publish = can(role, "publish") && state === "accepted";
  const repropose = can(role, "create_draft") && REPROPOSABLE.includes(state);
  const none = !accept && !edit && !reject && !publish && !repropose;

  return (
    <div className={cx("decisions", className)} data-component="decision-buttons" data-role={role} data-state={state}>
      {none ? null : (
        <div className="decisions-row">
          {accept ? (
            <NeumorphicChip icon={TICK} disabled={busy} onClick={onAccept} className="decision-primary">
              Accept
            </NeumorphicChip>
          ) : null}
          {publish ? (
            <NeumorphicChip icon={STAMP} disabled={busy} onClick={onPublish} className="decision-primary">
              Publish
            </NeumorphicChip>
          ) : null}
          {edit ? (
            <NeumorphicChip icon={PEN} active={editing} disabled={busy} onClick={onEdit}>
              Edit with reasons
            </NeumorphicChip>
          ) : null}
          {reject ? (
            <NeumorphicChip icon={CROSS} disabled={busy} onClick={onReject} className="decision-reject">
              Reject
            </NeumorphicChip>
          ) : null}
          {repropose ? (
            <NeumorphicChip icon={AGAIN} disabled={busy} onClick={onRepropose}>
              Re-propose
            </NeumorphicChip>
          ) : null}
        </div>
      )}
      <p className="decisions-why">{none ? why(role, state) : "Every decision is checked again by the route, the state machine and, for a publication, by G3."}</p>
    </div>
  );
}
