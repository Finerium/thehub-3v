// Blueprint 6.4 DraftSection: one of the six sections of the house template, numbered as a title-block cell with
// the plant's own heading beside it, its elements hanging from the margin rule. A section AG-3 left with no element
// says so rather than disappearing, because a missing section is a template-conformance fact the reviewer must see
// (9.16 template rules; the redliner reports it under `template_conformance`).
//
// The heading is a prop: `src/loop/template.ts` holds the six headings the drafter and the redliner are both given,
// and the surface passes the one for its section, so this component types no wording of its own.
import type { ReactNode } from "react";
import type { DraftField } from "@/contracts/generated/drafts";
import { cx } from "./cx";
import "./drafts.css";

export type DraftSectionProps = {
  n: DraftField["section"];
  heading: string;
  /** The element count rendered beside the heading; the surface counts what it passes. */
  count?: number;
  /** What stands in place of the elements when the section has none. */
  emptyText?: string;
  children?: ReactNode;
  className?: string;
};

export function sectionAnchor(n: DraftField["section"]): string {
  return `section-${n}`;
}

export function DraftSection({ n, heading, count, emptyText, children, className }: DraftSectionProps) {
  return (
    <section
      id={sectionAnchor(n)}
      className={cx("dsection", className)}
      data-component="draft-section"
      data-section={n}
      aria-labelledby={`${sectionAnchor(n)}-title`}
    >
      <div className="dsection-head">
        <span className="dsection-n" aria-hidden>
          {n}
        </span>
        <h3 id={`${sectionAnchor(n)}-title`}>{heading}</h3>
        {count === undefined ? null : (
          <span className="dsection-count">
            {count} {count === 1 ? "element" : "elements"}
          </span>
        )}
      </div>
      <div className="dsection-body">
        {children ?? <p className="dsection-empty">{emptyText ?? "The drafter wrote no element in this section."}</p>}
      </div>
    </section>
  );
}
