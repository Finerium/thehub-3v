// Blueprint 6.4 TypedFactCard: label, the value in mono with its comparator and unit, the source chip, the
// qualifier line (the sheet's own note, verbatim, in the caveat token) and the source-class tag. Every figure is
// the fact's own value_text; nothing is computed here. TypedFactGrid lays several out.
import type { ReactNode } from "react";
import type { TypedFact } from "@/contracts/generated/evidence_packet";
import { CitationChip } from "./CitationChip";
import { cx } from "./cx";
import "./system.css";

export type TypedFactCardProps = {
  fact: TypedFact;
  /** Rendered in the source chip's drawer, at the span. */
  drawer?: ReactNode;
  className?: string;
};

export function TypedFactCard({ fact, drawer, className }: TypedFactCardProps) {
  return (
    <article className={cx("fact", className)} data-component="typed-fact-card" data-source-class={fact.source_class}>
      <p className="eyebrow">{fact.label}</p>
      <p className="fact-value" aria-label={`${fact.label}: ${fact.comparator ?? ""} ${fact.value_text} ${fact.unit ?? ""}`.trim()}>
        {fact.comparator ? <span className="cmp">{fact.comparator}</span> : null}
        <span className="val">{fact.value_text}</span>
        {fact.unit ? <span className="unit">{fact.unit}</span> : null}
      </p>
      {fact.qualifier ? (
        <p className="fact-qualifier">
          <span className="verbatim">{fact.qualifier}</span>
        </p>
      ) : null}
      <div className="fact-foot">
        <CitationChip citation={fact.source} compact>
          {drawer}
        </CitationChip>
        <span className="tag">{fact.source_class}</span>
      </div>
    </article>
  );
}

export type TypedFactGridProps = {
  facts: TypedFact[];
  drawerFor?: (fact: TypedFact) => ReactNode;
  className?: string;
};

export function TypedFactGrid({ facts, drawerFor, className }: TypedFactGridProps) {
  return (
    <div className={cx("factgrid", className)} data-component="typed-fact-grid">
      {facts.map((fact) => (
        <TypedFactCard key={`${fact.label}:${fact.source.span_id}`} fact={fact} drawer={drawerFor?.(fact)} />
      ))}
    </div>
  );
}
