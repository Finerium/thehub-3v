// Blueprint 6.4 VersionBadge: the corpus version label with its digest prefix. The label span is keyed by the
// label, so a version increment remounts it and the roll (transform and opacity) plays; the full RecountMoment
// choreography of 7.2 belongs to the loop track.
import { cx } from "./cx";

type Props = {
  label: string;
  digestPrefix: string;
  active?: boolean;
  className?: string;
};

export function VersionBadge({ label, digestPrefix, active, className }: Props) {
  return (
    <span
      className={cx("chip mono text-[12px]", className)}
      data-version={label}
      aria-label={`Corpus version ${label}, digest ${digestPrefix}${active ? ", active" : ""}`}
    >
      <span className="text-ink-500">corpus</span>
      <span key={label} className="roll font-semibold text-ink-900">
        {label}
      </span>
      <span className="text-ink-500">{digestPrefix}</span>
      {active ? (
        <span className="badge" data-tone="verified">
          active
        </span>
      ) : null}
    </span>
  );
}
