// Blueprint 6.4 SearchResultRow: one hit of the semantic-search mode or of a document list: the title as the link,
// a kind tag, the mono metadata the surface passes (document number, revision, page), the snippet verbatim at
// citation length, the citation chip when the hit resolves to a span, and the score as the engine returned it.
// SearchResultList is the ordered list. No reveal animation: rows are content of a register (7.2).
import Link from "next/link";
import type { ReactNode } from "react";
import type { Citation } from "@/contracts/generated/evidence_packet";
import { CitationChip } from "./CitationChip";
import { cx } from "./cx";
import "./system.css";

export type SearchResultRowProps = {
  href: string;
  title: string;
  /** The document class, the unit kind, whatever names the hit's kind. */
  kind?: string;
  /** Mono metadata bits, in the surface's order. */
  meta?: string[];
  /** The hit's own text, verbatim, at citation length. */
  snippet?: string | null;
  score?: number | null;
  citation?: Citation;
  /** Rendered in the citation chip's drawer. */
  drawer?: ReactNode;
  className?: string;
};

const SCORE = "score";

export function SearchResultRow({ href, title, kind, meta, snippet, score, citation, drawer, className }: SearchResultRowProps) {
  return (
    <li className={cx("result", className)} data-component="search-result-row">
      <div className="result-head">
        <Link href={href} className="result-title draw">
          {title}
        </Link>
        {kind ? <span className="tag">{kind}</span> : null}
        {meta?.map((m) => (
          <span key={m} className="mono text-[12px] text-ink-700">
            {m}
          </span>
        ))}
      </div>
      {snippet ? (
        <p className="result-snippet">
          <span className="verbatim">{snippet}</span>
        </p>
      ) : null}
      {citation || score !== null ? (
        <div className="result-foot">
          {citation ? (
            <CitationChip citation={citation} compact>
              {drawer}
            </CitationChip>
          ) : null}
          {score !== null && score !== undefined ? (
            <span className="result-score">
              {SCORE} {score}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export type SearchResultListProps = {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

export function SearchResultList({ children, className, ...aria }: SearchResultListProps) {
  return (
    <ol className={cx("results", className)} data-component="search-result-list" {...aria}>
      {children}
    </ol>
  );
}
