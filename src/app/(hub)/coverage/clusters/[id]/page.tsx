// One cluster (blueprint 6.2 surface 7, /coverage/clusters/:id; AC-LOOP-03): the same card in full, then the
// uncovered work orders as rows with their record fields, both layers' readings and the adjudicated reading. Read
// from the debt_cluster row of the visible corpus version and the work_order and coverage_assessment rows behind
// it (src/db/queries/coverage.ts); an id no visible version carries is the designed 404.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { can } from "@/auth/matrix";
import { getSandbox } from "@/auth/sandbox";
import { requireSession } from "@/auth/session";
import { ClosedoutChip, emptyFieldsOf } from "@/components/ClosedoutChip";
import { ClusterCard, type UncoveredWorkOrder } from "@/components/ClusterCard";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { GlassPanel } from "@/components/GlassPanel";
import { NeumorphicChip } from "@/components/NeumorphicChip";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import type { DebtCluster } from "@/contracts/generated/coverage";
import type { Role } from "@/contracts/generated/serving";
import {
  DEBT_LAYER,
  FIELD_LABEL,
  LABELS_STATUS_TEXT,
  NO_UNCOVERED_STATEMENT,
  POPULATION_LABEL,
  hoursText,
  idrText,
  readCluster,
  reportedAt,
  type AssessmentRow,
  type ClusterPage as ClusterData,
  type LayerReading,
} from "@/db/queries/coverage";
import { REQUEST_LESSON_ACTION } from "@/lib/fixed-strings";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const DIGEST_PREFIX = 8;
const T = "t";
const RATIO_DIGITS = 4;
// The loop track flips this when POST /api/drafts and /drafts land (the same flag as the Console).
const DRAFT_ROUTE_LANDED = false;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Cluster ${id}` };
}

function RequestAction({ cluster, role }: { cluster: DebtCluster; role: Role }) {
  const allowed = can(role, "create_draft");
  const explanation = !allowed
    ? `The ${role} role holds no create_draft permission (9.9); the Reviewing Supervisor requests the lesson.`
    : DRAFT_ROUTE_LANDED
      ? `Opens the drafting queue for ${cluster.equipment_tag}.`
      : `Drafting has not landed on this deployment; when it does, this chip opens /drafts?cluster=${cluster.id}.`;
  return (
    <div className="flex flex-col gap-3">
      {cluster.uncovered_wo_numbers.length === 0 ? <p className="m-0 text-[12.5px] text-ink-500">{NO_UNCOVERED_STATEMENT}</p> : null}
    <form action="/drafts" method="get" className="flex flex-wrap items-center gap-3" data-component="request-lesson-form" data-cluster={cluster.id}>
      <input type="hidden" name="cluster" value={cluster.id} />
      <NeumorphicChip type="submit" size="sm" disabled={!allowed || !DRAFT_ROUTE_LANDED} icon={<span>&rarr;</span>} aria-label={`${REQUEST_LESSON_ACTION} for ${cluster.equipment_tag}`}>
        {REQUEST_LESSON_ACTION}
      </NeumorphicChip>
      <span className="max-w-[46ch] text-[12px] leading-snug text-ink-500">{explanation}</span>
    </form>
    </div>
  );
}

function Reading({ r }: { r: LayerReading | null }) {
  if (!r) return <span className="text-ink-500">no assessment on this version</span>;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="mono text-ink-900">{r.best_ratio.toFixed(RATIO_DIGITS)}</span>
      <span className="badge" data-tone={r.covered ? "verified" : "defect"}>
        {r.covered ? "covered" : "uncovered"}
      </span>
      {r.matched_field && r.matched_lesson ? (
        <>
          <span className="tag">{FIELD_LABEL[r.matched_field]}</span>
          <span className="mono">{r.matched_lesson}</span>
        </>
      ) : (
        <span className="text-ink-500">no scoreable field</span>
      )}
    </span>
  );
}

function Closeout({ row }: { row: AssessmentRow }) {
  if (row.closeout_complete) return <span className="text-ink-500">complete</span>;
  return <ClosedoutChip woNumber={row.wo_number} emptyFields={emptyFieldsOf(row.completeness_flags)} priority={row.priority} findingHref="/integrity?rule=CD-4" />;
}

export default async function ClusterPage({ params }: Props) {
  const [{ role }, { id }, jar] = await Promise.all([requireSession(), params, cookies()]);
  const box = await getSandbox(jar);

  let data: ClusterData | null;
  try {
    data = await readCluster(id, box);
  } catch (error) {
    log.error({ event: "coverage.cluster_read_failed", route: "/coverage/clusters/:id", message: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The cluster page reads the debt_cluster row of the visible corpus version and the work orders behind it at request time. The read failed, so nothing is shown in their place."
        next={{ href: "/coverage", label: "Coverage Console" }}
      />
    );
  }
  if (!data) notFound();

  const { version, cluster, clusterCount, rows, labels } = data;
  const threshold = rows.find((r) => r[DEBT_LAYER])?.[DEBT_LAYER]?.threshold ?? null;
  const workOrders: UncoveredWorkOrder[] = cluster.uncovered_wo_numbers.map((wo) => {
    const reading = rows.find((r) => r.wo_number === wo)?.[DEBT_LAYER] ?? null;
    return { wo_number: wo, matched_field: reading?.matched_field ? FIELD_LABEL[reading.matched_field] : null, matched_lesson: reading?.matched_lesson ?? null, href: `#${wo}` };
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <p className="text-[12.5px] text-ink-500">
            <Link href="/coverage" className="draw">
              Coverage Console
            </Link>
            <span aria-hidden> / </span>
            <span className="mono">{cluster.id}</span>
          </p>
          <h1 className="mt-1 text-[34px]">
            <span className="mono">{cluster.equipment_tag}</span>
          </h1>
          <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">
            Knowledge-debt cluster, rank <span className="mono">{cluster.rank}</span> of <span className="mono">{clusterCount}</span> on this version: the asset&apos;s{" "}
            {DEBT_LAYER}-uncovered {POPULATION_LABEL.unplanned_failure}
            {threshold !== null ? (
              <>
                {" "}
                at {T} = <span className="mono">{threshold}</span>
              </>
            ) : null}
            , and the factors behind its score.
          </p>
        </div>
        <VersionBadge label={version.label} digestPrefix={version.corpus_sha256.slice(0, DIGEST_PREFIX)} active={version.is_active} />
      </header>

      <div className="rise" style={stagger(1)}>
        <ClusterCard cluster={cluster} workOrders={workOrders} assetHref={`/assets/${cluster.equipment_tag}`} requestAction={<RequestAction cluster={cluster} role={role} />} />
        <p className="mt-2 text-[12px] text-ink-500">Matched units above follow the {DEBT_LAYER} layer, the layer the score is computed over; the rows below carry both layers.</p>
      </div>

      <GlassPanel className="rise p-6" aria-labelledby="rows-heading">
        <div style={stagger(2)}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="rows-heading" className="text-[20px]">
              Uncovered work orders
            </h2>
            <span className="text-[12px] text-ink-500">adjudicated reading:</span>
            <StatusBadge kind="machine_drafted" />
            <span className="text-[12px] text-ink-500">{labels ? LABELS_STATUS_TEXT[labels.status] : "not available on this deployment"}</span>
          </div>
          {rows.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="reg">
                <thead>
                  <tr>
                    <th scope="col">Work order</th>
                    <th scope="col">Reported</th>
                    <th scope="col">Work type</th>
                    <th scope="col" className="num">
                      Downtime
                    </th>
                    <th scope="col" className="num">
                      Recorded cost
                    </th>
                    <th scope="col">Closeout</th>
                    <th scope="col">Generous</th>
                    <th scope="col">Strict</th>
                    <th scope="col">Adjudicated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.wo_number} id={r.wo_number}>
                      <td className="mono whitespace-nowrap text-ink-900">{r.wo_number}</td>
                      <td className="mono whitespace-nowrap">
                        {reportedAt(r.report_date).date} <span className="text-ink-500">{reportedAt(r.report_date).time}</span>
                      </td>
                      <td className="whitespace-nowrap">
                        {r.work_type}{" "}
                        {r.breakdown_kind === "none" ? <span className="text-ink-500">no breakdown flag</span> : <span className="tag">{r.breakdown_kind}</span>}
                      </td>
                      <td className="num whitespace-nowrap">{r.downtime_hours === null ? <span className="text-ink-500">empty</span> : hoursText(r.downtime_hours)}</td>
                      <td className="num whitespace-nowrap">{r.total_cost_idr === null ? <span className="text-ink-500">empty</span> : idrText(r.total_cost_idr)}</td>
                      <td>
                        <Closeout row={r} />
                      </td>
                      <td>
                        <Reading r={r.generous} />
                      </td>
                      <td>
                        <Reading r={r.strict} />
                      </td>
                      <td>
                        {r.adjudicated === null ? (
                          <span className="text-ink-500">not available</span>
                        ) : (
                          <span className="badge" data-tone={r.adjudicated === "uncovered" ? "defect" : "verified"}>
                            {r.adjudicated}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              className="mt-3"
              title={`No uncovered ${POPULATION_LABEL.unplanned_failure} on ${cluster.equipment_tag}`}
              explanation={`Every record of this asset in the population is covered under the ${DEBT_LAYER} layer on this version; the score above carries the criticality and family-share factors alone.`}
              action={{ href: `/failures/${cluster.equipment_tag}`, label: "Failure Memory for this asset" }}
            />
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
