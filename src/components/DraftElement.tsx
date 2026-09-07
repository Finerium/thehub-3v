// Blueprint 6.4 DraftElement: one element of a draft in the provenance margin. The gutter carries the ordinal, the
// cell carries the sentence, and the foot carries the evidence item the element points at (9.6 DraftField
// `provenance`) plus one chip per numeral with the item that types it and that item's own unit (9.6
// `numeric_provenance`). A numeral no source types cannot reach this component: the drafting lane turns it into a
// slot, which is SlotField's job, so an element rendered here always has a source tag and section 1's guarantee
// ("provenance or nothing") is visible rather than claimed.
//
// Two second cues sit beside the left rule, never colour alone: an element the Reviewing Supervisor rewrote in
// review carries the accent rule with the word `edited in review` and the reason recorded on the transition, and a
// quarantined element carries the defect rule with the word `quarantined`. Props only: the surface decides which
// element is which and this component renders what it is handed.
import type { ReactNode } from "react";
import type { DraftField } from "@/contracts/generated/drafts";
import { cx } from "./cx";
import "./drafts.css";

export type DraftElementProps = {
  /** The stable element id (9.6 DraftField.id); becomes the anchor a redline reason links to. */
  id: string;
  ordinal: number;
  /** The element's sentence; a slot passes none and passes `slot` instead. */
  text?: string;
  /** What stands in the sentence's place on a slot: the SlotField with its literal and its note. */
  slot?: ReactNode;
  provenance: DraftField["provenance"];
  numericProvenance: DraftField["numeric_provenance"];
  quarantined?: boolean;
  /** Set when the element was rewritten in review; the reason is the one recorded on the transition. */
  edited?: { reason: string } | null;
  /** The in-review editor, or anything else the surface hangs under the element. */
  children?: ReactNode;
  className?: string;
};

/** The anchor a redline reason and the section index link to. */
export function elementAnchor(fieldId: string): string {
  return `el-${fieldId}`;
}

export function DraftElement({
  id,
  ordinal,
  text,
  slot,
  provenance,
  numericProvenance,
  quarantined,
  edited,
  children,
  className,
}: DraftElementProps) {
  return (
    <article
      id={elementAnchor(id)}
      className={cx("del", className)}
      data-component="draft-element"
      data-edited={edited ? "" : undefined}
      data-quarantined={quarantined ? "" : undefined}
    >
      <span className="del-n" aria-hidden>
        {ordinal}
      </span>
      {text === undefined ? (slot ?? <span aria-hidden />) : <p className="del-text">{text}</p>}
      <div className="del-foot">
        <span className="del-prov">
          <span className="kind">{provenance.type}</span>
          {provenance.ref === null ? (
            provenance.type === "slot" ? null : <span className="text-ink-500">no ref</span>
          ) : (
            <span className="ref">{provenance.ref}</span>
          )}
          {provenance.span_id === null ? null : <span className="text-ink-500">{provenance.span_id}</span>}
        </span>
        {numericProvenance.map((n) => (
          <span key={`${n.numeral}-${n.source_ref}`} className="del-num">
            <span>
              {n.numeral}
              {n.unit === "" ? null : ` ${n.unit}`}
            </span>
            <span className="from">from {n.source_ref}</span>
          </span>
        ))}
        {quarantined ? <span className="del-mark">quarantined</span> : null}
        {edited ? (
          <>
            <span className="del-mark">edited in review</span>
            <span className="del-reason">{edited.reason}</span>
          </>
        ) : null}
      </div>
      {children}
    </article>
  );
}
