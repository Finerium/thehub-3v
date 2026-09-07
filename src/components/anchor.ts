// The document-viewer anchor of blueprint 6.2 surface 4: `#page=n&span=<span_id>` is what a citation chip resolves
// to and what PageViewer reads back. One writer, one reader, so the form cannot drift between them.
import type { Citation } from "@/contracts/generated/evidence_packet";

export type DocumentAnchor = { page: number; span: string | null };

/** The hash fragment (without the leading `#`) for a page and an optional span. */
export function anchorFragment(page: number, span: string | null): string {
  const params = new URLSearchParams({ page: String(page) });
  if (span) params.set("span", span);
  return params.toString();
}

/**
 * The full viewer path for a citation. The fragment is the anchor form 6.2 freezes and what PageViewer reads back;
 * the same pair rides in the query because a fragment never reaches the server, so the request that renders the
 * viewer already knows which page and which span to resolve from the database. Without the query the first render
 * shows page one and only a second, client-driven navigation corrects it (AC-UI-02).
 */
export function documentHref(citation: Pick<Citation, "document_id" | "page" | "span_id">): string {
  const anchor = anchorFragment(citation.page, citation.span_id);
  return `/documents/${encodeURIComponent(citation.document_id)}?${anchor}#${anchor}`;
}

/** Reads `#page=n&span=<span_id>` (with or without the leading `#`); null when no positive page is carried. */
export function parseAnchor(hash: string): DocumentAnchor | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const page = Number.parseInt(params.get("page") ?? "", 10);
  if (!Number.isInteger(page) || page < 1) return null;
  return { page, span: params.get("span") || null };
}
