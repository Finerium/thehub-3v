"use client";

// Blueprint 6.4 CitationChip: doc_no, revision, approval status text and page; the integrity dot when the document
// carries open findings; the superseded marker when the history toggle served it; a button (keyboard-operable)
// that opens a glass drawer at the span with the citation's own fields, whatever the surface renders at the span
// (`children`, typically a PageViewer on that page) and the link to `/documents/:id#page=n&span=<span_id>`.
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import type { Citation } from "@/contracts/generated/evidence_packet";
import { documentHref } from "./anchor";
import { cx } from "./cx";
import { GlassDrawer } from "./GlassDrawer";
import { IntegrityDot, integrityLabel } from "./IntegrityDot";
import "./system.css";

export type CitationChipProps = {
  citation: Citation;
  /** Rendered inside the drawer, at the span (the surface passes it; the chip holds no page of its own). */
  children?: ReactNode;
  /** Hides the approval status text on the chip face (it stays in the drawer). */
  compact?: boolean;
  /** Overrides the viewer link; the default is the 6.2 anchor form. */
  href?: string;
  /** Where the integrity dot links; the default is the register filtered by this document. */
  integrityHref?: string;
  className?: string;
};

const SUPERSEDED = "superseded";
const OPEN_IN_VIEWER = "Open in the document viewer";
const HASH_PREFIX = 12;

export function CitationChip({ citation, children, compact, href, integrityHref, className }: CitationChipProps) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const viewerHref = href ?? documentHref(citation);
  const registerHref = integrityHref ?? `/integrity?document=${encodeURIComponent(citation.document_id)}`;
  const hasFindings = citation.integrity_findings.length > 0;

  return (
    <>
      <button
        ref={opener}
        type="button"
        className={cx("chip cite", className)}
        data-component="citation-chip"
        data-span={citation.span_id}
        data-compact={compact ? "" : undefined}
        data-superseded={citation.superseded ? "" : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        title={`${citation.doc_no} revision ${citation.revision}, ${citation.approval_status_text}, page ${citation.page}`}
      >
        <span className="cite-doc">{citation.doc_no}</span>
        <span className="cite-rev">rev {citation.revision}</span>
        <span className="cite-status">{citation.approval_status_text}</span>
        <span className="cite-page">p. {citation.page}</span>
        {hasFindings ? <IntegrityDot findings={citation.integrity_findings} /> : null}
        {citation.superseded ? <span className="cite-superseded">{SUPERSEDED}</span> : null}
      </button>
      {open ? (
        <GlassDrawer
          open={open}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
          title={citation.doc_no}
          subtitle={`revision ${citation.revision} · page ${citation.page} · ${citation.span_id}`}
          width={children ? "lg" : "md"}
        >
          <dl className="fields">
            <dt>Document</dt>
            <dd className="mono">{citation.document_id}</dd>
            <dt>Revision</dt>
            <dd className="mono">{citation.revision}</dd>
            <dt>Approval status</dt>
            <dd>
              {citation.approval_status_text} <span className="tag">{citation.approval_status}</span>
            </dd>
            <dt>Page</dt>
            <dd className="mono">{citation.page}</dd>
            <dt>Span</dt>
            <dd className="mono">{citation.span_id}</dd>
            <dt>Quote hash</dt>
            <dd className="mono" title={citation.quote_hash}>
              {citation.quote_hash.slice(0, HASH_PREFIX)}
            </dd>
            {hasFindings ? (
              <>
                <dt>Integrity</dt>
                <dd className="text-defect">
                  <IntegrityDot findings={citation.integrity_findings} href={registerHref} />{" "}
                  <Link href={registerHref} className="draw">
                    {integrityLabel(citation.integrity_findings)}
                  </Link>
                </dd>
              </>
            ) : null}
            {citation.superseded ? (
              <>
                <dt>History</dt>
                <dd className="text-caveat">This revision is superseded; it was served by the history toggle.</dd>
              </>
            ) : null}
          </dl>
          {children ? <div className="mt-4">{children}</div> : null}
          <p className="mt-5">
            <Link href={viewerHref} className="neu" data-size="sm">
              {OPEN_IN_VIEWER}
              <span aria-hidden className="mono">
                &rarr;
              </span>
            </Link>
          </p>
        </GlassDrawer>
      ) : null}
    </>
  );
}
