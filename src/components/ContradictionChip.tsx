// Blueprint 6.4 ContradictionChip: the subject, both readings with their chips, and the governing document named.
// A native disclosure: the chip is the summary, the readings open beneath it, side by side, the governing one
// rimmed in the accent. Typed by EvidencePacket.contradictions[n].
import type { ReactNode } from "react";
import type { Citation, EvidencePacket } from "@/contracts/generated/evidence_packet";
import { CitationChip } from "./CitationChip";
import { cx } from "./cx";
import "./system.css";

export type Contradiction = EvidencePacket["contradictions"][number];

export type ContradictionChipProps = {
  contradiction: Contradiction;
  drawerFor?: (citation: Citation) => ReactNode;
  className?: string;
};

const LABEL = "Contradiction";
const GOVERNS = "governs";
const GOVERNING = "Governing document";

export function ContradictionChip({ contradiction, drawerFor, className }: ContradictionChipProps) {
  const governingKey = `${contradiction.governing_document.document_id}:${contradiction.governing_document.span_id}`;
  return (
    <details className={cx("disclose", className)} data-component="contradiction-chip">
      <summary className="chip">
        <span className="tag" data-tone="caveat">
          {LABEL}
        </span>
        <span>{contradiction.subject}</span>
        <span className="mono text-ink-500">{contradiction.readings.length} readings</span>
      </summary>
      <div className="disclose-body">
        <div className="contra-readings">
          {contradiction.readings.map((r, i) => {
            const key = `${r.citation.document_id}:${r.citation.span_id}`;
            const governs = key === governingKey;
            return (
              <div key={`${key}:${i}`} className="contra-reading" data-governs={governs ? "" : undefined}>
                <p>
                  <span className="verbatim">{r.text}</span>
                </p>
                <div className="outcome-row">
                  <CitationChip citation={r.citation} compact>
                    {drawerFor?.(r.citation)}
                  </CitationChip>
                  {governs ? (
                    <span className="tag" data-tone="accent">
                      {GOVERNS}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <p className="outcome-row mt-3 mb-0">
          <span className="eyebrow">{GOVERNING}</span>
          <CitationChip citation={contradiction.governing_document}>{drawerFor?.(contradiction.governing_document)}</CitationChip>
        </p>
      </div>
    </details>
  );
}
