// Blueprint 6.4 EvidenceLine: one claim per line with its citation chips and the entailment mark (the literal of
// Claim.entailment, in the verified token). EvidenceList is the ordered list the Ask surface renders the packet's
// claims into; `drawerFor` lets the surface put the span render into each chip's drawer.
import type { ReactNode } from "react";
import type { Citation, Claim } from "@/contracts/generated/evidence_packet";
import { ENTAILED } from "@/lib/fixed-strings";
import { CitationChip } from "./CitationChip";
import { cx } from "./cx";
import "./system.css";

export type EvidenceLineProps = {
  claim: Claim;
  drawerFor?: (citation: Citation) => ReactNode;
  className?: string;
};

function EntailedMark() {
  return (
    <span className="eline-mark" title={ENTAILED}>
      <svg viewBox="0 0 12 12" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 6.5 4.8 9.2 10 3.4" />
      </svg>
      {ENTAILED}
    </span>
  );
}

export function EvidenceLine({ claim, drawerFor, className }: EvidenceLineProps) {
  return (
    <li className={cx("eline", className)} data-component="evidence-line" data-claim={claim.id}>
      <EntailedMark />
      <p>{claim.text}</p>
      <span className="eline-cites">
        {claim.citations.map((c) => (
          <CitationChip key={`${c.document_id}:${c.span_id}`} citation={c} compact>
            {drawerFor?.(c)}
          </CitationChip>
        ))}
      </span>
    </li>
  );
}

export type EvidenceListProps = {
  claims: Claim[];
  drawerFor?: (citation: Citation) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

export function EvidenceList({ claims, drawerFor, className, ...aria }: EvidenceListProps) {
  return (
    <ol className={cx("elist", className)} data-component="evidence-list" {...aria}>
      {claims.map((claim) => (
        <EvidenceLine key={claim.id} claim={claim} drawerFor={drawerFor} />
      ))}
    </ol>
  );
}
