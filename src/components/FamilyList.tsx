// Blueprint 6.4 FamilyList and PrecedentPanel: explicit membership with the recorded root cause per member, and
// the basis label with its review status (reviewed in the verified token, pending in the caveat token). Typed by
// FailureFamily (9.4). PrecedentPanel is one family read from a record's point of view: the record is marked and
// the other members are its precedents.
import Link from "next/link";
import type { FailureFamily } from "@/contracts/generated/operations";
import { cx } from "./cx";
import { GlassPanel } from "./GlassPanel";
import "./system.css";

const BASIS_LABEL: Record<FailureFamily["basis"], string> = {
  analyst_classification: "analyst classification",
  agent_classification: "agent classification",
};
const REVIEW_LABEL: Record<FailureFamily["review_status"], string> = {
  reviewed: "reviewed",
  pending: "review pending",
};
const MEMBERS = "members";
const BASIS = "basis";
const PRECEDENT = "Precedent";
const THIS_RECORD = "this record";

function BasisLine({ family }: { family: FailureFamily }) {
  return (
    <p className="family-basis">
      <span className="eyebrow">{BASIS}</span> {BASIS_LABEL[family.basis]}{" "}
      <span className="badge" data-tone={family.review_status === "reviewed" ? "verified" : "caveat"}>
        {REVIEW_LABEL[family.review_status]}
      </span>
    </p>
  );
}

function Members({ family, currentWo, hrefFor }: { family: FailureFamily; currentWo?: string; hrefFor?: (wo: string) => string }) {
  return (
    <ul className="family-members">
      {family.members.map((m) => {
        const href = hrefFor?.(m.wo_number);
        const current = m.wo_number === currentWo;
        return (
          <li key={m.wo_number} data-current={current ? "" : undefined}>
            <span className="mono">
              {href ? (
                <Link href={href} className="draw">
                  {m.wo_number}
                </Link>
              ) : (
                m.wo_number
              )}
              {current ? <span className="tag ml-2" data-tone="accent">{THIS_RECORD}</span> : null}
            </span>
            <span className="verbatim">{m.recorded_root_cause}</span>
          </li>
        );
      })}
    </ul>
  );
}

export type FamilyListProps = {
  families: FailureFamily[];
  hrefFor?: (wo: string) => string;
  className?: string;
};

export function FamilyList({ families, hrefFor, className }: FamilyListProps) {
  return (
    <div className={cx("gallery-stack", className)} data-component="family-list">
      {families.map((family) => (
        <section key={family.id} className="family" aria-label={family.label} data-family={family.id}>
          <div className="blockhead">
            <h4>{family.label}</h4>
            <span className="mono text-[12px] text-ink-500">
              {family.members.length} {MEMBERS}
            </span>
          </div>
          <Members family={family} hrefFor={hrefFor} />
          <BasisLine family={family} />
        </section>
      ))}
    </div>
  );
}

export type PrecedentPanelProps = {
  family: FailureFamily;
  /** The record the panel is read from; marked in the list. */
  currentWo?: string;
  hrefFor?: (wo: string) => string;
  className?: string;
};

export function PrecedentPanel({ family, currentWo, hrefFor, className }: PrecedentPanelProps) {
  return (
    <GlassPanel as="aside" className={cx("p-5 flex flex-col gap-3", className)} data-component="precedent-panel" data-family={family.id} aria-label={PRECEDENT}>
      <div className="blockhead">
        <h3>{PRECEDENT}</h3>
        <span className="text-[12.5px] text-ink-700">{family.label}</span>
      </div>
      <Members family={family} currentWo={currentWo} hrefFor={hrefFor} />
      <BasisLine family={family} />
    </GlassPanel>
  );
}
