// Blueprint 6.4 PartialAnswerBanner: the gaps declared, one per line, above the entailed claims, in the caveat
// token. Typed by EvidencePacket.gaps_declared.
import { cx } from "./cx";
import "./system.css";

export type PartialAnswerBannerProps = { gaps: string[]; className?: string };

const TITLE = "Partial answer";
const SUBTITLE = "gaps declared";

export function PartialAnswerBanner({ gaps, className }: PartialAnswerBannerProps) {
  return (
    <aside className={cx("partial", className)} role="status" data-component="partial-answer-banner">
      <p className="partial-title">
        {TITLE}
        <br />
        <span className="font-normal">{SUBTITLE}</span>
      </p>
      <ul>
        {gaps.map((gap) => (
          <li key={gap}>{gap}</li>
        ))}
      </ul>
    </aside>
  );
}
