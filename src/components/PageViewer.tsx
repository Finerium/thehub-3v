// Blueprint 6.4 PageViewer: one page derivative at a time with previous and next, the span highlight resolved from
// a prop (the surface reads `#page=n&span=<span_id>` with parseAnchor and passes what it resolved), the anchor
// form written by anchorFragment so it cannot drift from the chips. Previous and next are hash links, so the
// surface's hashchange listener turns the page without a reload. The image carries its provenance in the DOM
// (7.4): document id, page and, when passed, the SHA-256 of the source file.
import { anchorFragment } from "./anchor";
import { cx } from "./cx";
import "./system.css";

export type SpanHighlight = {
  id: string;
  /** The span's own text when the surface serves it (citation length, inside a packet or a document detail). */
  text?: string | null;
  /** A fractional box on the page when the surface resolved the span's geometry; without it the strip names the span. */
  box?: { x_frac: number; y_frac: number; w_frac: number; h_frac: number } | null;
};

export type PageViewerProps = {
  documentId: string;
  page: number;
  pageCount: number;
  /** The page derivative the surface serves under the role check. */
  src: string;
  alt?: string;
  sourceSha256?: string;
  span?: SpanHighlight | null;
  className?: string;
};

const PREVIOUS = "Previous";
const NEXT = "Next";
const PAGE = "page";
const OF = "of";
const SPAN = "span";
const TEXT = "text";
const ANCHOR = "anchor";

export function PageViewer({ documentId, page, pageCount, src, alt, sourceSha256, span, className }: PageViewerProps) {
  const atFirst = page <= 1;
  const atLast = page >= pageCount;
  const fragment = anchorFragment(page, span?.id ?? null);
  return (
    <figure className={cx("pager", className)} data-component="page-viewer" data-document={documentId} data-page={page}>
      <div className="pager-bar">
        <a className="neu" data-size="sm" href={`#${anchorFragment(Math.max(1, page - 1), null)}`} rel="prev" aria-disabled={atFirst ? "true" : undefined} tabIndex={atFirst ? -1 : undefined}>
          <span aria-hidden className="mono">
            &larr;
          </span>
          {PREVIOUS}
        </a>
        <span className="pager-count" aria-live="polite">
          {PAGE} {page} {OF} {pageCount}
        </span>
        <a className="neu" data-size="sm" href={`#${anchorFragment(Math.min(pageCount, page + 1), null)}`} rel="next" aria-disabled={atLast ? "true" : undefined} tabIndex={atLast ? -1 : undefined}>
          {NEXT}
          <span aria-hidden className="mono">
            &rarr;
          </span>
        </a>
      </div>
      {span ? (
        <div className="pager-strip" role="status" data-span={span.id}>
          <span className="eyebrow">{SPAN}</span>
          <span className="mono">{span.id}</span>
          {span.text ? (
            <>
              <span className="eyebrow">{TEXT}</span>
              <span className="verbatim">{span.text}</span>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="pager-stage">
        {/* eslint-disable-next-line @next/next/no-img-element -- a private derivative served one page at a time under the role check, never through a shared optimizer cache (INV-7) */}
        <img src={src} alt={alt ?? `${documentId}, ${PAGE} ${page} ${OF} ${pageCount}`} data-document={documentId} data-page={page} data-sha256={sourceSha256} />
        {span?.box ? (
          <span
            className="pager-span"
            aria-hidden
            style={{
              left: `${span.box.x_frac * 100}%`,
              top: `${span.box.y_frac * 100}%`,
              width: `${span.box.w_frac * 100}%`,
              height: `${span.box.h_frac * 100}%`,
            }}
          />
        ) : null}
      </div>
      <figcaption className="pager-foot">
        {ANCHOR} <code>#{fragment}</code>
      </figcaption>
    </figure>
  );
}
