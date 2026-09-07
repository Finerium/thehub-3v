// The Document viewer (blueprint 6.2 surface 4; AC-CTX-09, AC-ANS-14; register dense-operational, 7.2). Class,
// revision, approval status text, SHA-256 of the supplied file, page count, the assets the document belongs to and
// the typed edges around it, the findings open against it, the labelled history toggle that is the only way a
// superseded revision is shown, and the page viewer whose `#page=n&span=<span_id>` anchor is what every citation
// chip resolves to. Read at request time from the seeded database (src/db/queries/documents-view.ts); the page
// itself is a width-limited, metadata-free derivative served one at a time by GET /api/documents/:id/pages/:n
// under the role check, and no bulk or archive route exists (INV-7). An unknown id renders the designed 404.
import type { Metadata } from "next";
import { AnchorSync } from "@/components/AnchorSync";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { getSandbox, visibleVersionIds } from "@/auth/sandbox";
import { requireSession } from "@/auth/session";
import { anchorFragment } from "@/components/anchor";
import { CitationChip } from "@/components/CitationChip";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { GlassPanel } from "@/components/GlassPanel";
import { IntegrityDot } from "@/components/IntegrityDot";
import { NeumorphicChip } from "@/components/NeumorphicChip";
import { PageViewer } from "@/components/PageViewer";
import { PidHotspotPanel } from "@/components/PidHotspotPanel";
import { PidSheet } from "@/components/PidSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { EDGE_KIND_LABEL } from "@/db/queries/assets";
import { DOCUMENT_CLASS_LABEL, findingLocator, getDocumentView, type DocumentView } from "@/db/queries/documents-view";
import { preferenceOrder } from "@/db/queries/failures";
import { readPidSheet, type Hotspot, type PidSheetView } from "@/db/queries/pid";
import { HISTORY_TOGGLE_BASIS } from "@/lib/fixed-strings";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const SHA_GROUP = 16;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string | string[];
    span?: string | string[];
    history?: string | string[];
    hotspot?: string | string[];
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Document ${decodeURIComponent(id)}` };
}

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** A field the supplied sheet does not print is stated in words, never rendered as an empty pair of quotes. */
function Stated({ value, absence }: { value: string | null; absence: string }) {
  return value ? <span className="verbatim">{value}</span> : <span className="text-ink-500">{absence}</span>;
}


function Header({ view }: { view: DocumentView }) {
  const d = view.document;
  return (
    <header className="rise" style={stagger(0)}>
      <p className="text-[12.5px] text-ink-500">
        <Link href="/assets" className="draw">
          Assets
        </Link>
        <span aria-hidden> / </span>
        <span>{DOCUMENT_CLASS_LABEL[d.class]}</span>
        <span aria-hidden> / </span>
        <span className="mono">{d.doc_no ?? d.id}</span>
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mono text-[30px] leading-tight font-medium">{d.doc_no ?? d.id}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
            <span className="tag" data-tone="accent">
              {DOCUMENT_CLASS_LABEL[d.class]}
            </span>
            <span className="mono text-ink-500">{d.class}</span>
            {view.current ? (
              <>
                <span className="mono text-ink-900">rev {view.current.revision}</span>
                <Stated value={view.current.approval_status_text} absence="no approval status printed on the sheet" />
              </>
            ) : (
              <span className="text-caveat">no revision of a visible corpus version</span>
            )}
            {view.lesson?.machine_drafted ? <StatusBadge kind="machine_drafted" approverAlias={view.lesson.approver_alias ?? undefined} /> : null}
            {view.integrity_findings.length > 0 ? (
              <IntegrityDot
                findings={[...new Set(view.integrity_findings.map((f) => f.rule_id))]}
                href={`/integrity?document=${encodeURIComponent(d.id)}`}
              />
            ) : null}
          </p>
        </div>
        {view.assets.length > 0 ? (
          <p className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-ink-500">belongs to</span>
            {view.assets.map((tag) => (
              <Link key={tag} href={`/assets/${encodeURIComponent(tag)}`} className="chip mono text-[12px]">
                {tag}
              </Link>
            ))}
          </p>
        ) : null}
      </div>
    </header>
  );
}

export default async function DocumentPage({ params, searchParams }: Props) {
  const [, { id: rawId }, query, jar] = await Promise.all([requireSession(), params, searchParams, cookies()]);
  const id = decodeURIComponent(rawId);
  const requestedPage = Number.parseInt(first(query.page) ?? "1", 10);
  const spanId = first(query.span);
  const historyOpen = first(query.history) === "on";

  let view: DocumentView | null;
  try {
    const box = await getSandbox(jar);
    const versions = preferenceOrder(await visibleVersionIds(box), box?.corpusVersionId ?? null);
    view = await getDocumentView(id, {
      visibleVersionIds: versions,
      includeSuperseded: historyOpen,
      page: Number.isInteger(requestedPage) ? requestedPage : 1,
      spanId,
    });
  } catch (error) {
    log.error({ event: "documents.view_read_failed", route: "/documents/:id", message: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The viewer reads the document, its revisions, the spans it carries and the findings open against it at request time. The read failed, so no page is shown in its place."
        next={{ href: "/assets", label: "Fleet register" }}
      />
    );
  }
  if (!view) notFound();

  const d = view.document;
  const anchor = anchorFragment(view.page, view.span?.id ?? null);

  // A P&ID is an image: it carries no span and no chunk, so the drawing page serves the adopted sidecar's hotspot
  // layer in place of the span viewer (AC-CTX-02). A read that fails leaves the sheet unrendered and the rest of
  // the viewer intact, which is what the class-less branch below already draws.
  let sheet: PidSheetView | null = null;
  if (d.class === "pid") {
    try {
      sheet = await readPidSheet(d.id, first(query.hotspot));
    } catch (error) {
      log.error({
        event: "documents.sidecar_read_failed",
        route: "/documents/:id",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const hotspotHref = (h: Hotspot): string => {
    const params = new URLSearchParams({ hotspot: h.id });
    if (historyOpen) params.set("history", "on");
    return `/documents/${encodeURIComponent(d.id)}?${params.toString()}#hotspot-panel`;
  };

  return (
    <div className="flex flex-col gap-8">
      <Header view={view} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <GlassPanel className="rise p-6" aria-labelledby="page-heading">
          <div style={stagger(1)}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 id="page-heading" className="text-[20px]">
                Page {view.page} of {d.page_count}
              </h2>
              {view.page_available ? null : (
                <p className="mono text-[12px] text-ink-500">
                  anchor <code>#{anchor}</code>
                </p>
              )}
            </div>

            {view.span_missing ? (
              <DesignedState
                inline
                className="mt-4"
                code="404"
                tone="caveat"
                title="That span is not on this document"
                explanation="The address named a span id this document does not carry on any revision a visible corpus version serves. The page below is the one the address asked for; the span is not marked."
                reason={`span ${view.span_missing}`}
              />
            ) : null}

            {sheet !== null ? (
              <div className="mt-4 flex flex-col gap-6">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-700">
                  <span>
                    P&amp;ID Set <span className="mono text-ink-900">{sheet.sidecar.set}</span>
                  </span>
                  {sheet.equipment_tag === null ? null : (
                    <Link href={`/assets/${encodeURIComponent(sheet.equipment_tag)}`} className="mono draw">
                      {sheet.equipment_tag}
                    </Link>
                  )}
                  <span className="verbatim">{sheet.sidecar.reference_box}</span>
                </p>
                <PidSheet
                  sidecar={sheet.sidecar}
                  underlay={
                    sheet.page_available
                      ? {
                          src: `/api/documents/${encodeURIComponent(d.id)}/pages/1`,
                          alt: `${d.doc_no ?? d.id}, P&ID sheet ${sheet.sidecar.set}`,
                          sourceSha256: d.sha256,
                        }
                      : null
                  }
                  typedTags={sheet.typed_tags}
                  selectedId={sheet.selected?.hotspot.id ?? null}
                  hrefFor={hotspotHref}
                />
                <div id="hotspot-panel">
                  {sheet.selected === null ? (
                    <EmptyState
                      title="No hotspot is selected"
                      explanation="Every hotspot of the sheet opens here: a bound one with the typed rows the seeded corpus carries under its tag, an unbound one with the reason the sidecar recorded for the absent binding."
                    />
                  ) : (
                    <PidHotspotPanel
                      selection={sheet.selected}
                      provenance={sheet.sidecar.provenance}
                      citations={sheet.citations}
                    />
                  )}
                </div>
              </div>
            ) : view.page_available ? (
              <PageViewer
                className="mt-4"
                documentId={d.id}
                page={view.page}
                pageCount={d.page_count}
                src={`/api/documents/${encodeURIComponent(d.id)}/pages/${view.page}`}
                alt={`${d.doc_no ?? d.id}, page ${view.page} of ${d.page_count}`}
                sourceSha256={d.sha256}
                span={view.span ? { id: view.span.id, text: view.span.anchor_text } : null}
              />
            ) : (
              <>
                <DesignedState
                  inline
                  className="mt-4"
                  code="404"
                  tone="caveat"
                  title="No page render of this document on this deployment"
                  explanation="Pages are width-limited, metadata-free derivatives served one at a time under the role check. This deployment holds no render for this page, so the viewer states the absence rather than showing a broken frame."
                  reason={`GET /api/documents/${d.id}/pages/${view.page}: page_derivative absent`}
                />
                <p className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
                  <a className="neu" data-size="sm" href={`#${anchorFragment(Math.max(1, view.page - 1), null)}`} rel="prev" aria-disabled={view.page <= 1 ? "true" : undefined}>
                    <span aria-hidden className="mono">
                      &larr;
                    </span>
                    Previous
                  </a>
                  <span className="mono text-ink-500">
                    page {view.page} of {d.page_count}
                  </span>
                  <a className="neu" data-size="sm" href={`#${anchorFragment(Math.min(d.page_count, view.page + 1), null)}`} rel="next" aria-disabled={view.page >= d.page_count ? "true" : undefined}>
                    Next
                    <span aria-hidden className="mono">
                      &rarr;
                    </span>
                  </a>
                </p>
              </>
            )}

            {view.span ? (
              <p className="mt-3 text-[12.5px] text-ink-700">
                The address resolved span <span className="mono">{view.span.id}</span> on revision{" "}
                <span className="mono">{view.span.revision}</span>
                {view.span.superseded ? <span className="text-caveat"> (superseded; served because the history toggle is open)</span> : null}.
              </p>
            ) : null}
          </div>
        </GlassPanel>

        <div className="flex flex-col gap-8">
          <GlassPanel className="rise p-6" aria-labelledby="identity-heading">
            <div style={stagger(2)}>
              <h2 id="identity-heading" className="text-[20px]">
                Document
              </h2>
              <dl className="fields mt-3">
                <dt>Class</dt>
                <dd>
                  {DOCUMENT_CLASS_LABEL[d.class]} <span className="mono text-ink-500">{d.class}</span>
                </dd>
                <dt>Document number</dt>
                <dd className="mono">{d.doc_no ?? "none printed on the sheet"}</dd>
                <dt>Subject tag</dt>
                <dd className="mono">{d.subject_tag ?? "no single asset"}</dd>
                <dt>Pages</dt>
                <dd className="mono">{d.page_count}</dd>
                <dt>SHA-256</dt>
                <dd className="mono text-[11.5px] leading-relaxed">
                  {d.sha256.slice(0, SHA_GROUP)}
                  <br />
                  {d.sha256.slice(SHA_GROUP, SHA_GROUP * 2)}
                  <br />
                  {d.sha256.slice(SHA_GROUP * 2, SHA_GROUP * 3)}
                  <br />
                  {d.sha256.slice(SHA_GROUP * 3)}
                </dd>
                {d.file_marker ? (
                  <>
                    <dt>File marker</dt>
                    <dd>
                      <span className="verbatim text-caveat">{d.file_marker}</span>
                    </dd>
                  </>
                ) : null}
                {view.current ? (
                  <>
                    <dt>Revision</dt>
                    <dd className="mono">{view.current.revision}</dd>
                    <dt>Approval status</dt>
                    <dd>
                      <Stated value={view.current.approval_status_text} absence="none printed on the sheet" />
                      <span className="tag mt-1 inline-block max-w-full break-all">{view.current.approval_status}</span>
                    </dd>
                    <dt>Revision date</dt>
                    <dd>
                      {view.current.revision_date ? (
                        <span className="mono">{view.current.revision_date}</span>
                      ) : (
                        <span className="text-ink-500">none printed on the sheet</span>
                      )}
                    </dd>
                    <dt>Prepared, reviewed, approved</dt>
                    <dd className="mono text-[12px]">
                      {view.current.prepared_by_alias ?? "not stated"} · {view.current.reviewed_by_alias ?? "not stated"} ·{" "}
                      {view.current.approved_by_alias ?? "not stated"}
                    </dd>
                  </>
                ) : null}
                {view.lesson ? (
                  <>
                    <dt>Lesson</dt>
                    <dd className="mono">{view.lesson.opl_id}</dd>
                    <dt>Classification</dt>
                    <dd>
                      {view.lesson.classification} · {view.lesson.discipline}
                    </dd>
                    <dt>Shared</dt>
                    <dd className="mono">{view.lesson.date_of_sharing}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          </GlassPanel>

          <GlassPanel className="rise p-6" aria-labelledby="history-heading">
            <div style={stagger(3)}>
              <h2 id="history-heading" className="text-[20px]">
                Revision history
              </h2>
              <p className="mt-2 text-[12.5px] leading-snug text-ink-700">
                The lineage holds <span className="mono">{view.history_available}</span> superseded{" "}
                {view.history_available === 1 ? "revision" : "revisions"} of this document. A superseded revision is
                shown only through this toggle, and every one shown is labelled.
              </p>
              <form method="get" className="mt-3 flex flex-wrap items-center gap-3">
                <input type="hidden" name="page" value={view.page} />
                {view.span ? <input type="hidden" name="span" value={view.span.id} /> : null}
                <NeumorphicChip
                  type="submit"
                  name="history"
                  value={historyOpen ? "off" : "on"}
                  size="sm"
                  active={historyOpen}
                  disabled={view.history_available === 0 && !historyOpen}
                  aria-label={historyOpen ? "Hide superseded revisions" : "Show superseded revisions"}
                >
                  {historyOpen ? "Hide superseded revisions" : "Show superseded revisions"}
                </NeumorphicChip>
                {historyOpen ? <span className="badge" data-tone="caveat">{HISTORY_TOGGLE_BASIS}</span> : null}
              </form>

              {historyOpen ? (
                view.superseded.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="reg">
                      <caption className="sr-only">Superseded revisions of this document, served by the labelled history toggle.</caption>
                      <thead>
                        <tr>
                          <th scope="col">Revision</th>
                          <th scope="col">Approval status</th>
                          <th scope="col" className="whitespace-nowrap">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.superseded.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <span className="mono font-medium text-ink-900">{r.revision}</span>
                              <span className="mt-1 block">
                                <span className="badge" data-tone="caveat">
                                  superseded
                                </span>
                              </span>
                            </td>
                            <td>
                              <Stated value={r.approval_status_text} absence="none printed" />
                              <span className="mt-0.5 block text-[11px] text-ink-500">
                                <span className="mono">{r.approval_status}</span>
                              </span>
                            </td>
                            <td>
                              {r.revision_date ? (
                                <span className="mono whitespace-nowrap">{r.revision_date}</span>
                              ) : (
                                <span className="text-ink-500">none printed</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState className="mt-4" title="No superseded revision in this lineage" explanation="Every revision of this document that a visible corpus version carries is the current one." />
                )
              ) : null}
            </div>
          </GlassPanel>
        </div>
      </div>

      <GlassPanel className="rise p-6" aria-labelledby="graph-heading">
        <div style={stagger(4)}>
          <h2 id="graph-heading" className="text-[20px]">
            Document graph
          </h2>
          <p className="mt-2 max-w-[86ch] text-[13px] leading-snug text-ink-700">
            Every edge below is a reference this document makes, or one another document makes to it, with the span it
            was read from. A chip opens the page and the span behind the reference.
          </p>
          {view.edges.length > 0 ? (
            <ul className="idlist mt-3">
              {view.edges.map((e) => (
                <li key={`${e.direction}-${e.edge.from_document_id}-${e.edge.to_document_id}-${e.edge.edge_kind}-${e.edge.source_span_id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="tag" data-tone={e.direction === "out" ? "accent" : undefined}>
                    {e.direction === "out" ? "refers to" : "referred to by"}
                  </span>
                  <Link href={`/documents/${encodeURIComponent(e.other.id)}`} className="mono draw">
                    {e.other.doc_no ?? e.other.id}
                  </Link>
                  <span className="text-[11.5px] text-ink-500">{DOCUMENT_CLASS_LABEL[e.other.class]}</span>
                  <span className="tag">{EDGE_KIND_LABEL[e.edge.edge_kind]}</span>
                  {e.citation ? <CitationChip citation={e.citation} compact /> : <span className="text-[11.5px] text-ink-500">no span resolved</span>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              className="mt-3"
              title="No edge touches this document"
              explanation="No document of the corpus references it and it references none. A sheet supplied as an image carries no body text a reference can be extracted from."
            />
          )}
        </div>
      </GlassPanel>

      <GlassPanel className="rise p-6" aria-labelledby="findings-heading">
        <div style={stagger(5)}>
          <h2 id="findings-heading" className="text-[20px]">
            Open integrity findings
          </h2>
          {view.integrity_findings.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="reg">
                <thead>
                  <tr>
                    <th scope="col">Rule</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Discipline</th>
                    <th scope="col">Unit</th>
                    <th scope="col">Where</th>
                    <th scope="col">Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {view.integrity_findings.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span className="mono block whitespace-nowrap font-medium text-ink-900">{f.rule_id}</span>
                        <span className="mt-0.5 block max-w-[28ch] text-[11.5px] leading-snug text-ink-700">
                          {f.rule ?? "rule name not recorded"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="tag" data-tone={f.severity === "high" ? "defect" : f.severity === "medium" ? "caveat" : undefined}>
                          {f.severity}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">{f.discipline ?? <span className="text-ink-500">none stated</span>}</td>
                      <td className="mono text-[11.5px]">{f.unit ?? "none"}</td>
                      <td>
                        {f.span_id ? (
                          <a href={`#${anchorFragment(view.page, f.span_id)}`} className="mono draw text-[11.5px]">
                            {f.span_id}
                          </a>
                        ) : (
                          <span className="text-[11.5px] text-ink-500">the document as a whole</span>
                        )}
                        {findingLocator(f.item) ? (
                          <span className="mono mt-0.5 block text-[11px] leading-snug text-ink-500">{findingLocator(f.item)}</span>
                        ) : null}
                      </td>
                      <td>
                        {f.safety_function || f.observation_only || f.routing_recommendation ? (
                          <span className="flex flex-wrap gap-1">
                            {f.safety_function ? (
                              <span className="badge" data-tone="defect">
                                safety function
                              </span>
                            ) : null}
                            {f.observation_only ? <span className="tag">observation only</span> : null}
                            {f.routing_recommendation ? (
                              <span className="tag" data-tone="accent">
                                {f.routing_recommendation}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-ink-500">none</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[12px] text-ink-500">
                <Link href={`/integrity?document=${encodeURIComponent(d.id)}`} className="draw">
                  Open the Integrity Register filtered by this document
                </Link>
              </p>
            </div>
          ) : (
            <EmptyState
              className="mt-3"
              title="No finding is open against this document"
              explanation="Every rule of the register passed on this document on the corpus version served here."
              action={{ href: "/integrity", label: "Integrity Register" }}
            />
          )}
        </div>
      </GlassPanel>

      {/* The six lines that mirror the 6.2 fragment into the query: no data, no corpus text, no user input. */}
      <AnchorSync />
    </div>
  );
}
