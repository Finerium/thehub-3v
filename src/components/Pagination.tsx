// Blueprint 6.4 Pagination: previous and next as links the surface addresses (hrefFor), the page of the count and
// the row total in mono; a bound link is aria-disabled and out of the tab order, never removed, so the bar keeps
// its shape.
import Link from "next/link";
import { cx } from "./cx";
import "./system.css";

export type PaginationProps = {
  page: number;
  pageCount: number;
  /** The total number of rows across the pages. */
  total: number;
  /** The noun of the total (default "rows"). */
  unit?: string;
  hrefFor: (page: number) => string;
  className?: string;
};

const PREVIOUS = "Previous";
const NEXT = "Next";
const PAGE = "page";
const OF = "of";
const ROWS = "rows";
const LABEL = "Pagination";

export function Pagination({ page, pageCount, total, unit = ROWS, hrefFor, className }: PaginationProps) {
  const atFirst = page <= 1;
  const atLast = page >= pageCount;
  return (
    <nav className={cx("pagination", className)} aria-label={LABEL} data-component="pagination">
      <Link href={hrefFor(Math.max(1, page - 1))} rel="prev" className="draw" aria-disabled={atFirst ? "true" : undefined} tabIndex={atFirst ? -1 : undefined}>
        <span aria-hidden>&larr; </span>
        {PREVIOUS}
      </Link>
      <span className="count" aria-current="page">
        {PAGE} {page} {OF} {pageCount}
      </span>
      <Link href={hrefFor(Math.min(pageCount, page + 1))} rel="next" className="draw" aria-disabled={atLast ? "true" : undefined} tabIndex={atLast ? -1 : undefined}>
        {NEXT}
        <span aria-hidden> &rarr;</span>
      </Link>
      <span className="count">
        {total} {unit}
      </span>
    </nav>
  );
}
