// Blueprint 6.4 StatusBadge: the fixed wordings, string-matched in CI. The wording constants are the contract and
// live in src/lib/fixed-strings.ts (re-exported here for the M0 importers); a surface never types them. Caveat
// amber carries the provenance caveats (7.1); the closeout defect carries red; Reviewer mode is interactive chrome
// and carries the accent.
import { STATUS_WORDING } from "@/lib/fixed-strings";
import { cx } from "./cx";

export { STATUS_WORDING };

export type StatusKind = keyof typeof STATUS_WORDING;

const TONE: Record<StatusKind, "caveat" | "defect" | "accent"> = {
  machine_drafted: "caveat",
  incomplete_closeout: "defect",
  simulated: "caveat",
  specified_not_connected: "caveat",
  reviewer_mode: "accent",
};

type Props = {
  kind: StatusKind;
  /** The approver alias rendered beside the machine-drafted wording (6.3). */
  approverAlias?: string;
  className?: string;
};

export function StatusBadge({ kind, approverAlias, className }: Props) {
  return (
    <span className={cx("badge", className)} data-tone={TONE[kind]} data-status={kind}>
      {STATUS_WORDING[kind]}
      {kind === "machine_drafted" && approverAlias ? (
        <span className="font-normal text-ink-700">approved by {approverAlias}</span>
      ) : null}
    </span>
  );
}
