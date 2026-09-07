// One asset (blueprint 6.2 surface 5, /assets/:tag; AC-CTX-01, AC-CTX-02, AC-CTX-03; register dense-operational,
// 7.2). Identity and service, the area with its alias table, the typed document-graph edges as tabs, the P&ID as a
// navigable index with its hotspots and the transcription-basis provenance line (D-12), the tag card per
// instrument tag, the interlock summary with the permissives as their AND gate and the marked effects, the
// datasheet parameters with a citation chip each, the lessons, and the integrity findings open against the asset's
// own documents. Every figure and every sentence is read at request time from the seeded database
// (src/db/queries/assets.ts); the sheets' own words are rendered verbatim and nothing is paraphrased. A tag no
// equipment row carries renders the designed 404.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { getSandbox, visibleVersionIds } from "@/auth/sandbox";
import { requireSession } from "@/auth/session";
import { CaveatLine } from "@/components/CaveatLine";
import { CitationChip } from "@/components/CitationChip";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { GlassPanel } from "@/components/GlassPanel";
import { HotspotLayer } from "@/components/HotspotLayer";
import { ConnectorPanel } from "@/components/ConnectorPanel";
import { InterlockMatrix } from "@/components/InterlockMatrix";
import { OperationalContextPanel } from "@/components/OperationalContextPanel";
import { IntegrityDot } from "@/components/IntegrityDot";
import { NeumorphicChip } from "@/components/NeumorphicChip";
import { StatusBadge } from "@/components/StatusBadge";
import { ROLE_LABEL, TagCard } from "@/components/TagCard";
import type { InstrumentTag, PidSidecar } from "@/contracts/generated/asset";
import type { Citation } from "@/contracts/generated/evidence_packet";
import {
  DOCUMENT_TABS,
  EDGE_KIND_LABEL,
  RELATED_WORK_ORDER_BASIS,
  isDocumentTab,
  readAsset,
  type AssetView,
  type DocumentTab,
} from "@/db/queries/assets";
import { DOCUMENT_CLASS_LABEL, findingLocator } from "@/db/queries/documents-view";
import { TRIP_BOILERPLATE_RULE } from "@/db/queries/interlock";
import { preferenceOrder } from "@/db/queries/failures";
import { operationalContext } from "@/db/queries/operational-context";
import { activeVersion } from "@/db/versions";
import { connectorContracts, unreadableContracts } from "@/app/api/connectors/contracts";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const SHA_PREFIX = 12;
const HOTSPOT_COORDINATE_DIGITS = 3;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

type Props = { params: Promise<{ tag: string }>; searchParams: Promise<{ doc?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  return { title: `Asset ${decodeURIComponent(tag)}` };
}

/** A field the sheet does not print is stated, never left as an empty cell or a dangling separator. */
function Stated({ value, absence }: { value: string | null; absence: string }) {
  return value ? <>{value}</> : <span className="text-ink-500">{absence}</span>;
}

// The sheet contents strip: a long dense surface names its own sections, the way a drawing names its views.
const SECTIONS = [
  { id: "identity", label: "Identity" },
  { id: "documents", label: "Document set" },
  { id: "pid", label: "P&ID index" },
  { id: "interlock", label: "Interlock" },
  { id: "parameters", label: "Datasheet" },
  { id: "tags", label: "Instrument tags" },
  { id: "lessons", label: "Lessons" },
  { id: "findings", label: "Integrity" },
] as const;

// Instrument tags are grouped by the role the sheets give them, never by any judgement of importance (Case 1).
const ROLE_ORDER: ReadonlyArray<InstrumentTag["role"]> = [
  "initiator",
  "final_element",
  "permissive",
  "control",
  "alarm",
  "relief",
  "monitor",
  "unknown",
];

function Section({ id, title, lead, children, index }: { id: string; title: string; lead?: ReactNode; children: ReactNode; index: number }) {
  return (
    <GlassPanel className="rise scroll-mt-6 p-6" id={id} aria-labelledby={`${id}-heading`}>
      <div style={stagger(index)}>
        <h2 id={`${id}-heading`} className="text-[20px]">
          {title}
        </h2>
        {lead ? <p className="mt-2 max-w-[86ch] text-[13px] leading-snug text-ink-700">{lead}</p> : null}
        {children}
      </div>
    </GlassPanel>
  );
}

function Chip({ citation }: { citation: Citation | undefined }) {
  if (!citation) return <span className="text-[11.5px] text-ink-500">no span resolved</span>;
  return <CitationChip citation={citation} compact />;
}

// ---------------------------------------------------------------------------------------------------------------
// The document set: the six classes as tabs, each listing the documents bound to the asset and the typed edges
// those documents carry. An edge is always a cross-reference a document made, with the span that proves it.
// ---------------------------------------------------------------------------------------------------------------
function DocumentSet({ asset, tab }: { asset: AssetView; tab: DocumentTab }) {
  const shown = asset.documents.filter((d) => d.document.class === tab);
  const shownIds = new Set(shown.map((d) => d.document.id));
  const outgoing = asset.edges.filter((e) => shownIds.has(e.from.id));
  const incoming = asset.edges.filter((e) => shownIds.has(e.to.id) && !shownIds.has(e.from.id));

  return (
    <>
      <form method="get" className="mt-4 flex flex-wrap items-center gap-2" aria-label="Document class">
        {DOCUMENT_TABS.map((t) => {
          const n = asset.documents.filter((d) => d.document.class === t.class).length;
          return (
            <NeumorphicChip key={t.class} type="submit" name="doc" value={t.class} size="sm" active={t.class === tab} aria-label={`${t.label}, ${n} documents`}>
              {t.label} <span className="mono text-ink-500">{n}</span>
            </NeumorphicChip>
          );
        })}
      </form>

      {shown.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="reg">
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Revision</th>
                <th scope="col">Approval status</th>
                <th scope="col" className="num">
                  Pages
                </th>
                <th scope="col">SHA-256</th>
                <th scope="col">Bound by</th>
                <th scope="col">Integrity</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.document.id}>
                  <td>
                    <Link href={`/documents/${encodeURIComponent(d.document.id)}`} className="mono draw font-medium text-ink-900">
                      {d.document.doc_no ?? d.document.id}
                    </Link>
                    <span className="mt-0.5 block text-[11.5px] text-ink-500">{DOCUMENT_CLASS_LABEL[d.document.class]}</span>
                  </td>
                  <td className="mono whitespace-nowrap">
                    {d.current ? d.current.revision : <span className="text-ink-500">not served here</span>}
                    {d.superseded > 0 ? <span className="mt-0.5 block text-[11px] text-caveat">{d.superseded} superseded</span> : null}
                  </td>
                  <td>
                    {d.current ? (
                      <>
                        {d.current.approval_status_text ? (
                          <span className="verbatim">{d.current.approval_status_text}</span>
                        ) : (
                          <span className="text-ink-500">no status printed on the sheet</span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-ink-500">
                          <span className="mono">{d.current.approval_status}</span> ·{" "}
                          <Stated value={d.current.revision_date} absence="no date printed" />
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-500">no revision of a visible corpus version</span>
                    )}
                  </td>
                  <td className="num">{d.document.page_count}</td>
                  <td className="mono text-[11.5px]" title={d.document.sha256}>
                    {d.document.sha256.slice(0, SHA_PREFIX)}
                  </td>
                  <td className="mono text-[11.5px] text-ink-500">{d.binding}</td>
                  <td>
                    {d.open_finding_rule_ids.length > 0 ? (
                      <IntegrityDot findings={d.open_finding_rule_ids} href={`/integrity?document=${encodeURIComponent(d.document.id)}`} />
                    ) : (
                      <span className="text-[11.5px] text-ink-500">none open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          className="mt-4"
          title={`No ${DOCUMENT_TABS.find((t) => t.class === tab)?.label} is bound to this asset`}
          explanation="The equipment row names no document of this class and no document carries the asset as its subject tag."
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="eyebrow mb-2">Cross-references this class makes</p>
          {outgoing.length > 0 ? (
            <ul className="idlist">
              {outgoing.map((e) => (
                <li key={`${e.edge.from_document_id}-${e.edge.to_document_id}-${e.edge.edge_kind}-${e.edge.source_span_id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="mono text-ink-900">{e.from.doc_no ?? e.from.id}</span>
                  <span aria-hidden className="mono text-accent">
                    &rarr;
                  </span>
                  <Link href={`/documents/${encodeURIComponent(e.to.id)}`} className="mono draw">
                    {e.to.doc_no ?? e.to.id}
                  </Link>
                  <span className="tag">{EDGE_KIND_LABEL[e.edge.edge_kind]}</span>
                  <Chip citation={e.citation ?? undefined} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[12.5px] text-ink-700">
              No extracted cross-reference leaves this class. A sheet supplied as an image carries no body text to
              extract a reference from.
            </p>
          )}
        </div>
        <div>
          <p className="eyebrow mb-2">Cross-references that point at it</p>
          {incoming.length > 0 ? (
            <ul className="idlist">
              {incoming.map((e) => (
                <li key={`${e.edge.from_document_id}-${e.edge.to_document_id}-${e.edge.edge_kind}-${e.edge.source_span_id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={`/documents/${encodeURIComponent(e.from.id)}`} className="mono draw">
                    {e.from.doc_no ?? e.from.id}
                  </Link>
                  <span aria-hidden className="mono text-accent">
                    &rarr;
                  </span>
                  <span className="mono text-ink-900">{e.to.doc_no ?? e.to.id}</span>
                  <span className="tag">{EDGE_KIND_LABEL[e.edge.edge_kind]}</span>
                  <Chip citation={e.citation ?? undefined} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[12.5px] text-ink-700">No document of this asset points at this class.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The P&ID as a navigable index. The underlay is the width-limited derivative served one page at a time by
// GET /api/documents/:id/pages/:n (INV-7); where the deployment holds no render for the sheet, the designed state
// says so and the index below stays the way in, so every hotspot still opens the tag it stands for.
// ---------------------------------------------------------------------------------------------------------------
const BASIS_WORDING = { manual: "manual transcription", agent_transcription: "agent transcription" } as const;
const REVIEW_WORDING = { reviewed: "reviewed", pending: "review pending" } as const;

function Provenance({ sidecar }: { sidecar: PidSidecar }) {
  const p = sidecar.provenance;
  return (
    <p className="mt-3 text-[12px] text-caveat" data-component="sidecar-provenance">
      {BASIS_WORDING[p.basis]} by <span className="mono">{p.alias}</span> on <span className="mono">{p.date}</span> ·{" "}
      {REVIEW_WORDING[p.review_status]}
      {p.reviewed_by ? (
        <>
          {" "}
          by <span className="mono">{p.reviewed_by}</span>
        </>
      ) : null}{" "}
      · <span className="mono">{sidecar.hotspots.length}</span> hotspots
    </p>
  );
}

function PidIndex({ asset }: { asset: AssetView }) {
  const sidecar = asset.sidecar;
  if (!sidecar) {
    return (
      <EmptyState
        className="mt-4"
        title="No sidecar is transcribed for this sheet"
        explanation="The P&ID index is built from a transcribed sidecar. This sheet carries none, so no hotspot is claimed for it."
      />
    );
  }
  const pidDocument = asset.documents.find((d) => d.document.id === sidecar.document_id);
  const src = `/api/documents/${encodeURIComponent(sidecar.document_id)}/pages/1`;
  const bound = sidecar.hotspots.filter((h) => h.bound_tag !== null).length;
  const foreign = sidecar.hotspots.filter((h) => h.foreign).length;
  const tagNames = new Set(asset.tags.map((t) => t.tag.tag));

  return (
    <>
      <dl className="fields mt-4 max-w-[92ch]">
        <dt>Sheet</dt>
        <dd>
          <Link href={`/documents/${encodeURIComponent(sidecar.document_id)}`} className="mono draw">
            {pidDocument?.document.doc_no ?? sidecar.document_id}
          </Link>{" "}
          <span className="text-ink-500">set {sidecar.set}</span>
        </dd>
        <dt>Title box</dt>
        <dd>{sidecar.title_box ? <span className="verbatim">{sidecar.title_box}</span> : <span className="text-ink-500">empty on the sheet</span>}</dd>
        <dt>Reference box</dt>
        <dd>{sidecar.reference_box ? <span className="verbatim">{sidecar.reference_box}</span> : <span className="text-ink-500">empty on the sheet</span>}</dd>
        <dt>Equipment shown</dt>
        <dd>
          {sidecar.equipment_shown.length > 0 ? (
            <ul className="idlist">
              {sidecar.equipment_shown.map((name, i) => (
                <li key={`${i}-${name.slice(0, 24)}`}>
                  <span className="verbatim">{name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-ink-500">none named on the sheet</span>
          )}
        </dd>
        <dt>Hotspots</dt>
        <dd className="mono">
          {sidecar.hotspots.length} transcribed, {bound} bound to a tag, {foreign} foreign
        </dd>
      </dl>

      {sidecar.notes.length > 0 ? (
        <div className="mt-4">
          <p className="eyebrow mb-1">Sheet notes</p>
          <ul className="idlist">
            {sidecar.notes.map((n, i) => (
              <li key={`${i}-${n.slice(0, 24)}`}>
                <span className="verbatim">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {asset.pid_page_available ? (
        <HotspotLayer
          className="mt-5"
          src={src}
          alt={`${pidDocument?.document.doc_no ?? sidecar.document_id}, page 1`}
          sidecar={sidecar}
          sourceSha256={pidDocument?.document.sha256}
          hrefFor={(h) => (h.bound_tag && tagNames.has(h.bound_tag) ? `#tag-${h.bound_tag}` : undefined)}
        />
      ) : (
        <>
          <DesignedState
            inline
            className="mt-5"
            code="404"
            tone="caveat"
            title="No page render of this sheet on this deployment"
            explanation="The underlay is a width-limited, metadata-free derivative served one page at a time under the role check. This deployment holds no render for the P&ID, so the index below is served without it rather than a broken frame."
            reason={`GET /api/documents/${sidecar.document_id}/pages/1: page_derivative absent`}
          />
          <Provenance sidecar={sidecar} />
          <div className="mt-3">
            <p className="eyebrow mb-1">Sidecar defects</p>
            {sidecar.defects.length > 0 ? (
              <ul className="hotspots-defects">
                {sidecar.defects.map((d, i) => (
                  <li key={`${d.rule}-${i}`}>
                    <span className="tag" data-tone="defect">
                      {d.rule}
                    </span>
                    <span>{d.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[12.5px] text-ink-700">No defect recorded in the sidecar.</p>
            )}
          </div>
        </>
      )}

      <div className="mt-6 overflow-x-auto">
        <p className="eyebrow mb-2">Hotspot index</p>
        <table className="reg">
          <thead>
            <tr>
              <th scope="col">As drawn</th>
              <th scope="col">Role</th>
              <th scope="col">Bound tag</th>
              <th scope="col">Drawn setpoint</th>
              <th scope="col" className="num">
                x
              </th>
              <th scope="col" className="num">
                y
              </th>
            </tr>
          </thead>
          <tbody>
            {sidecar.hotspots.map((h) => (
              <tr key={h.id} data-hotspot={h.id} data-foreign={h.foreign ? "true" : "false"}>
                <td>
                  <span className="verbatim">{h.as_drawn_text}</span>
                  {h.foreign ? (
                    <span className="ml-2 tag" data-tone="caveat">
                      foreign tag
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap">{h.role}</td>
                <td>
                  {h.bound_tag ? (
                    tagNames.has(h.bound_tag) ? (
                      <Link href={`#tag-${h.bound_tag}`} className="mono draw">
                        {h.bound_tag}
                      </Link>
                    ) : (
                      <span className="mono">{h.bound_tag}</span>
                    )
                  ) : (
                    <span className="text-[11.5px] text-caveat">unbound{h.unbound_reason ? `: ${h.unbound_reason}` : ""}</span>
                  )}
                </td>
                <td className="mono">{h.drawn_setpoint ? <span className="verbatim">{h.drawn_setpoint}</span> : <span className="text-ink-500">none drawn</span>}</td>
                <td className="num">{h.x_frac.toFixed(HOTSPOT_COORDINATE_DIGITS)}</td>
                <td className="num">{h.y_frac.toFixed(HOTSPOT_COORDINATE_DIGITS)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The interlock section: the cause-and-effect sheet drawn as the matrix it is (6.4 InterlockMatrix; AC-CTX-03).
// The sheet's LOGIC No with the SIL it states, its start permissives as their AND gate, its rows down the side
// against the effect columns across the top, and its notes with the citation that opens the page they came from.
// A sheet that types a control loop states no LOGIC No and no SIL and renders as one; its permissive block is
// filed under the equipment tag, and the register's trip-boilerplate finding is shown beside the note it reads.
function InterlockSummary({ asset }: { asset: AssetView }) {
  const lock = asset.interlock;
  if (!lock) {
    return (
      <EmptyState
        className="mt-4"
        title="No cause-and-effect sheet is bound to this asset"
        explanation="Nothing on this page states a protective function for the asset, because no sheet in the corpus types one."
      />
    );
  }
  const sheet = asset.documents.find((d) => d.document.doc_no === lock.ce_doc_no && d.document.class === "interlock");
  return (
    <>
      <InterlockMatrix
        className="mt-4"
        interlock={lock}
        rows={asset.rows}
        permissives={asset.permissives}
        permissiveKey={lock.seq_id ?? lock.equipment_tag}
        citations={asset.citations}
        ceDocumentId={sheet?.document.id ?? null}
        finding={asset.integrity_findings.find((f) => f.rule_id === TRIP_BOILERPLATE_RULE) ?? null}
      />
      <CaveatLine kind="as_built" className="mt-6" />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export default async function AssetPage({ params, searchParams }: Props) {
  const [, { tag: rawTag }, query, jar] = await Promise.all([requireSession(), params, searchParams, cookies()]);
  const tag = decodeURIComponent(rawTag);
  const requested = Array.isArray(query.doc) ? query.doc[0] : query.doc;
  const tab: DocumentTab = isDocumentTab(requested) ? requested : "datasheet";

  let asset: AssetView | null;
  let version: Awaited<ReturnType<typeof activeVersion>>;
  // Blueprint 6.2 surface 5 puts the operational-context panel and the connector panel on this page beside the
  // interlock matrix, so both are read here and the asset page carries the whole of what 6.2 lists for it.
  let context: Awaited<ReturnType<typeof operationalContext>>;
  try {
    const box = await getSandbox(jar);
    const versions = preferenceOrder(await visibleVersionIds(box), box?.corpusVersionId ?? null);
    [asset, version, context] = await Promise.all([readAsset(tag, versions), activeVersion(), operationalContext(tag, versions)]);
  } catch (error) {
    log.error({ event: "assets.asset_read_failed", route: "/assets/:tag", message: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The asset page reads the equipment row, its document set, the cause-and-effect sheet, the datasheet parameters and the lessons at request time. The read failed, so nothing is shown in their place."
        next={{ href: "/assets", label: "Fleet register" }}
      />
    );
  }
  if (!asset) notFound();

  const e = asset.equipment;
  const paramGroups = [...new Set(asset.params.map((p) => p.group))];
  const orderedTags = [...asset.tags].sort(
    (a, b) => ROLE_ORDER.indexOf(a.tag.role) - ROLE_ORDER.indexOf(b.tag.role) || a.tag.tag.localeCompare(b.tag.tag),
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="rise" id="identity" style={stagger(0)}>
        <p className="text-[12.5px] text-ink-500">
          <Link href="/assets" className="draw">
            Fleet register
          </Link>
          <span aria-hidden> / </span>
          <span className="mono">{e.tag}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mono text-[34px] leading-none font-medium">{e.tag}</h1>
            <p className="mt-2 text-[17px] text-ink-900">{e.name}</p>
            <p className="mt-1 max-w-[76ch] text-[13.5px] leading-snug text-ink-700">{e.service}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {version ? <span className="chip mono text-[12px]"><span className="text-ink-500">corpus</span> <span className="font-semibold text-ink-900">{version.label}</span></span> : null}
            <Link href={`/failures/${encodeURIComponent(e.tag)}`} className="neu" data-size="sm">
              Failure Memory
              <span aria-hidden className="mono">
                &rarr;
              </span>
            </Link>
          </div>
        </div>
        <nav aria-label="Sections of this sheet" className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-edge pt-3 text-[12.5px]">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="draw text-ink-700">
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <GlassPanel className="rise p-6" aria-labelledby="identity-heading">
        <div style={stagger(1)}>
          <h2 id="identity-heading" className="text-[20px]">
            Identity, service and area
          </h2>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <dl className="fields">
              <dt>Tag</dt>
              <dd className="mono">{e.tag}</dd>
              <dt>Functional location</dt>
              <dd className="mono">{e.functional_location}</dd>
              <dt>Service</dt>
              <dd>{e.service}</dd>
              <dt>Criticality, datasheet</dt>
              <dd className="font-medium">{e.criticality_datasheet}</dd>
              <dt>Criticality, workbook</dt>
              <dd className={e.criticality_datasheet === e.criticality_workbook ? undefined : "text-defect"}>
                {e.criticality_workbook}
                {e.criticality_datasheet === e.criticality_workbook ? null : " (differs from the datasheet)"}
              </dd>
              <dt>LOGIC No</dt>
              <dd className="mono verbatim">{e.interlock_ref}</dd>
            </dl>
            <div>
              <p className="eyebrow mb-2">
                Area <span className="mono">{asset.area.code}</span>, as four documents name it
              </p>
              <table className="reg">
                <thead>
                  <tr>
                    <th scope="col">Document</th>
                    <th scope="col">Name it carries</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Maintenance workbook</td>
                    <td>
                      <span className="verbatim">{asset.area.workbook_name}</span>
                    </td>
                  </tr>
                  <tr>
                    <td>Datasheet</td>
                    <td>
                      <span className="verbatim">{asset.area.datasheet_name}</span>
                    </td>
                  </tr>
                  <tr>
                    <td>Lesson header</td>
                    <td>
                      <span className="verbatim">{asset.area.opl_header_name}</span>
                    </td>
                  </tr>
                  <tr>
                    <td>Plot plan title</td>
                    <td>
                      <span className="verbatim">{asset.area.plot_plan_title_name}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 max-w-[52ch] text-[12px] leading-snug text-ink-500">
                One area, four spellings. The alias table is what lets a question naming any one of them reach this
                asset; no name is treated as the correct one.
              </p>
            </div>
          </div>
          {/* 6.3: the connector state, stated on the surface that shows the asset's values (INV-8). */}
          <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-2 border-t border-edge pt-3 text-[12.5px] leading-snug text-ink-700">
            <span className="eyebrow">Live process values</span>
            <StatusBadge kind="specified_not_connected" />
            <span className="max-w-[74ch]">
              Every figure on this sheet is read from a document revision or a maintenance record. The Hub holds no
              connection to the DCS, the historian or the safety instrumented system, and no write path toward one
              exists.
            </span>
          </p>
        </div>
      </GlassPanel>

      <Section
        id="documents"
        index={2}
        title="Document set"
        lead={
          <>
            The documents bound to this asset, by class. Each edge below is a reference a document itself makes, with
            the span it was read from; nothing here is inferred from a tag appearing in two files.
          </>
        }
      >
        <DocumentSet asset={asset} tab={tab} />
      </Section>

      <Section
        id="pid"
        index={3}
        title="P&ID index"
        lead="The transcribed sidecar of the asset's piping and instrumentation diagram: what the sheet draws, which tags it binds, and what the transcription itself is missing."
      >
        <PidIndex asset={asset} />
      </Section>

      <Section
        id="interlock"
        index={4}
        title="Interlock matrix"
        lead="The cause-and-effect sheet as it is written: the LOGIC No, the SIL the sheet states, the start permissives as their gate, the typed rows down the side, and the effect columns across the top with the mark the sheet prints in each cell."
      >
        <InterlockSummary asset={asset} />
      </Section>

      <Section
        id="parameters"
        index={5}
        title="Datasheet parameters"
        lead="Every parameter the datasheet types for this asset, grouped as the sheet groups them. Each value carries the citation chip that opens the page and the span it was read from."
      >
        {asset.params.length > 0 ? (
          <div className="mt-4 flex flex-col gap-5">
            {paramGroups.map((group) => (
              <div key={group}>
                <p className="eyebrow mb-2">{group}</p>
                <div className="overflow-x-auto">
                  <table className="reg">
                    <thead>
                      <tr>
                        <th scope="col">Field</th>
                        <th scope="col">Value</th>
                        <th scope="col">Unit</th>
                        <th scope="col">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asset.params
                        .filter((p) => p.group === group)
                        .map((p) => (
                          <tr key={p.id} data-span={p.span_id}>
                            <td className="whitespace-nowrap">{p.field}</td>
                            <td className="mono text-ink-900">
                              <span className="verbatim">{p.value_text}</span>
                            </td>
                            <td className="mono text-ink-500">{p.unit ?? "none typed"}</td>
                            <td>
                              <Chip citation={asset.citations[p.span_id]} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState className="mt-4" title="No datasheet parameter is typed for this asset" explanation="No datasheet of the corpus types a parameter against this tag." />
        )}
      </Section>

      <Section
        id="tags"
        index={6}
        title="Instrument tags"
        lead={
          <>
            One card per instrument tag the documents name, grouped by the role they give it. {RELATED_WORK_ORDER_BASIS}{" "}
            The limits are the datasheet values pinned for this asset.
          </>
        }
      >
        {orderedTags.length > 0 ? (
          <div className="mt-4 flex flex-col gap-6">
            {ROLE_ORDER.filter((role) => orderedTags.some((t) => t.tag.role === role)).map((role) => (
              <div key={role}>
                <p className="eyebrow mb-2 border-b border-edge pb-1">{ROLE_LABEL[role]}</p>
                <div className="flex flex-col gap-4">
                  {orderedTags
                    .filter((t) => t.tag.role === role)
                    .map((t) => (
                      <div key={t.tag.tag} id={`tag-${t.tag.tag}`} className="scroll-mt-6">
                        <TagCard
                          tag={t.tag}
                          rows={t.rows}
                          workOrders={t.work_orders.map((w) => ({
                            wo_number: w.wo_number,
                            chain_place: w.chain_place,
                            href: `/failures/${encodeURIComponent(e.tag)}#${w.wo_number}`,
                          }))}
                          limits={t.limits}
                          equipmentHref="#identity"
                          citationFor={(row) => asset.citations[row.span_id]}
                        />
                        {t.work_orders.length > 0 ? (
                          <dl className="fields mt-2 pl-1">
                            {t.work_orders.map((w) => (
                              <div key={w.wo_number} className="contents">
                                <dt className="mono">{w.wo_number}</dt>
                                <dd className="text-[12.5px]">
                                  <span className="text-ink-500">recorded root cause </span>
                                  <span className="verbatim">{w.root_cause}</span>
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState className="mt-4" title="No instrument tag is recorded for this asset" explanation="No document of the corpus names an instrument tag against this equipment." />
        )}
      </Section>

      <Section
        id="operational-context"
        index={7}
        title="Operational context"
        lead="What the workbook records around this asset: how its unplanned and flagged work compares with the fleet, the lead time of the records, the protective function if one is recorded, and the demand history."
      >
        {context ? (
          <OperationalContextPanel className="mt-4" context={context} hrefFor={(wo) => `/failures/${encodeURIComponent(tag)}#${wo}`} />
        ) : (
          <EmptyState
            className="mt-4"
            title="No operational context is recorded for this asset"
            explanation="The workbook carries no row joined to this tag, so there is nothing to reconcile and nothing is shown."
          />
        )}
      </Section>

      <Section
        id="connectors"
        index={8}
        title="Connectors"
        lead="The three integration contracts of blueprint 9.14, each specified and not connected. No write path toward any system exists anywhere in this product."
      >
        <ConnectorPanel className="mt-4" contracts={connectorContracts()} unreadable={unreadableContracts()} />
      </Section>

      <Section
        id="lessons"
        index={9}
        title="Lessons"
        lead="The One Point Lessons bound to this asset, newest identifier last. A lesson a model drafted carries its badge and the alias of the person who approved it."
      >
        {asset.lessons.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="reg">
              <thead>
                <tr>
                  <th scope="col">Lesson</th>
                  <th scope="col">Title</th>
                  <th scope="col">Classification</th>
                  <th scope="col">Discipline</th>
                  <th scope="col">Related interlock</th>
                  <th scope="col">Shared</th>
                  <th scope="col">Provenance</th>
                </tr>
              </thead>
              <tbody>
                {asset.lessons.map((l) => (
                  <tr key={l.opl_id}>
                    <td>
                      <Link href={`/documents/${encodeURIComponent(l.document_id)}`} className="mono draw font-medium whitespace-nowrap text-ink-900">
                        {l.opl_id}
                      </Link>
                    </td>
                    <td>
                      <span className="verbatim">{l.title}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="tag">{l.classification}</span>
                    </td>
                    <td className="whitespace-nowrap">{l.discipline}</td>
                    <td className="mono text-[11.5px]">
                      <span className="verbatim">{l.related_interlock_text}</span>
                    </td>
                    <td className="mono whitespace-nowrap">{l.date_of_sharing}</td>
                    <td>
                      {l.machine_drafted ? (
                        <StatusBadge kind="machine_drafted" approverAlias={l.approver_alias ?? undefined} />
                      ) : (
                        <span className="text-[11.5px] text-ink-500">written and approved by people</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            title="No lesson is bound to this asset"
            explanation="Nothing in the corpus teaches this asset yet. The Coverage Console ranks the knowledge debt that follows from it."
            action={{ href: "/coverage", label: "Coverage Console" }}
          />
        )}
      </Section>

      <Section
        id="findings"
        index={10}
        title="Open integrity findings"
        lead="Every finding open against a document of this asset, with the rule that raised it. A finding is a statement about the document, never a task and never an owner."
      >
        {asset.integrity_findings.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="reg">
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Discipline</th>
                  <th scope="col">Document</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Marks</th>
                </tr>
              </thead>
              <tbody>
                {asset.integrity_findings.map((f) => {
                  const document = asset.documents.find((d) => d.document.id === f.document_id);
                  const locator = findingLocator(f.item);
                  return (
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
                      <td>
                        {f.document_id ? (
                          <Link
                            href={f.span_id ? `/documents/${encodeURIComponent(f.document_id)}#page=1&span=${encodeURIComponent(f.span_id)}` : `/documents/${encodeURIComponent(f.document_id)}`}
                            className="mono draw"
                          >
                            {document?.document.doc_no ?? f.document_id}
                          </Link>
                        ) : (
                          <span className="text-ink-500">bound to no single document</span>
                        )}
                        {locator ? <span className="mono mt-0.5 block text-[11px] leading-snug text-ink-500">{locator}</span> : null}
                      </td>
                      <td className="mono text-[11.5px]">{f.unit ?? "none"}</td>
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
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-[12px] text-ink-500">
              <Link href={`/integrity?asset=${encodeURIComponent(e.tag)}`} className="draw">
                Open the Integrity Register filtered by this asset
              </Link>
            </p>
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            title="No finding is open against this asset's documents"
            explanation="Every rule of the register passed on the documents bound to this tag on the corpus version served here."
            action={{ href: "/integrity", label: "Integrity Register" }}
          />
        )}
      </Section>
    </div>
  );
}
