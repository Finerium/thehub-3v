// Blueprint 6.4 RedlineVerdictPanel: the adversarial redline as the reviewer reads it. One block per round (9.6
// RedlineVerdict, at most two: a first block sends the draft back to the drafter once, a second blocks it), each
// carrying the verdict, the round, the model id and prompt version the redliner ran under, the server timestamp,
// and the reasons grouped by the four categories of 9.6 with the element each one points at.
//
// The redliner never edits (D-05, AC-LOOP-06): this panel has no edit path and renders no field the redliner could
// have written into the draft. A reason that names an element links to it by the anchor of DraftElement, so the
// reviewer walks from a reason to the sentence it is about; a reason with no element is a whole-draft finding and
// says so.
import type { RedlineVerdict } from "@/contracts/generated/drafts";
import { cx } from "./cx";
import "./drafts.css";
import { elementAnchor } from "./DraftElement";
import { stampOf } from "./StateRail";

/** 9.6: the four categories a redline reason may carry, in the words a reviewer reads. */
export const REASON_CATEGORY_LABEL: Readonly<Record<RedlineVerdict["reasons"][number]["category"], string>> = {
  technical_plausibility: "technical plausibility",
  safety_framing: "safety framing",
  template_conformance: "template conformance",
  outstanding_slot: "outstanding slot",
};

/** 9.13: `prompt_version` is the SHA-256 of the prompt file, so it renders as a digest the way every other pin does. */
const DIGEST_PREFIX = 12;

export type RedlineVerdictPanelProps = {
  verdicts: readonly RedlineVerdict[];
  /** What stands in the panel's place before the redliner has run. */
  pendingText?: string;
  className?: string;
};

export function RedlineVerdictPanel({ verdicts, pendingText, className }: RedlineVerdictPanelProps) {
  if (verdicts.length === 0) {
    return (
      <p className={cx("text-[12.5px] text-ink-500", className)} data-component="redline-verdict-panel" data-rounds="0">
        {pendingText ?? "The redliner has not run on this draft yet."}
      </p>
    );
  }
  return (
    <div className={cx("redline", className)} data-component="redline-verdict-panel" data-rounds={verdicts.length}>
      {verdicts.map((v) => (
        <section key={v.round} className="round" data-verdict={v.verdict} aria-label={`Redline round ${v.round}`}>
          <div className="round-head">
            <span className="n">round {v.round}</span>
            <span className="badge" data-tone={v.verdict === "pass" ? "verified" : "defect"}>
              {v.verdict}
            </span>
            <span className="n">
              {v.reasons.length} {v.reasons.length === 1 ? "reason" : "reasons"}
            </span>
          </div>
          <p className="round-meta">
            {v.model_id} · <span title={v.prompt_version}>prompt {v.prompt_version.slice(0, DIGEST_PREFIX)}</span> ·{" "}
            {stampOf(v.created_at)}
          </p>
          {v.reasons.length === 0 ? null : (
            <ul className="reasons">
              {v.reasons.map((reason, i) => (
                <li key={`${v.round}-${i}`} className="reason">
                  <p className="reason-cat">
                    <span>{REASON_CATEGORY_LABEL[reason.category]}</span>
                    {reason.field_id === null ? (
                      <span className="tag">whole draft</span>
                    ) : (
                      <a className="tag draw" href={`#${elementAnchor(reason.field_id)}`}>
                        {reason.field_id}
                      </a>
                    )}
                  </p>
                  <p>{reason.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
