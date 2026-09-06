// Blueprint 6.4 ClusterCard: rank, asset, score, the four factors with their maxima, the coefficients labelled
// ASSUMPTION, the incomplete-closeout count beside the score and never inside it, the uncovered work orders with
// their matched unit, and the request action. Typed by DebtCluster (9.5); the score prints at the fixture's four
// decimals, the factors as the cluster carries them.
import Link from "next/link";
import type { ReactNode } from "react";
import type { DebtCluster } from "@/contracts/generated/coverage";
import { ASSUMPTION_LABEL } from "@/lib/fixed-strings";
import { cx } from "./cx";
import { GlassPanel } from "./GlassPanel";
import { RequestLessonAction } from "./RequestLessonAction";
import "./system.css";

export type UncoveredWorkOrder = {
  wo_number: string;
  /** The narrative field the best lesson window matched, or null when no lesson scored the record. */
  matched_field: string | null;
  matched_lesson: string | null;
  href?: string;
};

export type ClusterCardProps = {
  cluster: DebtCluster;
  workOrders: UncoveredWorkOrder[];
  assetHref?: string;
  requestHref?: string;
  requestAction?: ReactNode;
  className?: string;
};

const RANK = "rank";
const SCORE = "debt score";
const INCOMPLETE = "incomplete closeouts";
const FACTOR = "factor";
const VALUE = "value";
const MAX = "maximum";
const COEFFICIENT = "coefficient";
const UNCOVERED = "Uncovered work orders";
const MATCHED = "matched";
const NO_MATCH = "no lesson matched";
const SCORE_DIGITS = 4;
const HOURS = "h";
const IDR = "IDR";

export function ClusterCard({ cluster, workOrders, assetHref, requestHref, requestAction, className }: ClusterCardProps) {
  const { factors: f, coefficients: c } = cluster;
  const rows = [
    { key: "D", label: "downtime hours (D)", value: `${f.D_hours} ${HOURS}`, max: `${f.D_max} ${HOURS}`, coefficient: c.a },
    { key: "C", label: `recorded cost, ${IDR} (C)`, value: f.C_idr, max: f.C_max, coefficient: c.b },
    { key: "k", label: "criticality (k)", value: f.k, max: 1, coefficient: c.c },
    { key: "r", label: "family share (r)", value: f.r, max: 1, coefficient: c.d },
  ];
  return (
    <GlassPanel as="article" className={cx("cluster", className)} data-component="cluster-card" data-cluster={cluster.id} aria-label={`Cluster ${cluster.rank}, ${cluster.equipment_tag}`}>
      <p className="cluster-rank">
        <small>{RANK}</small>
        {cluster.rank}
      </p>
      <div className="cluster-head">
        {assetHref ? (
          <Link href={assetHref} className="cluster-asset draw">
            {cluster.equipment_tag}
          </Link>
        ) : (
          <span className="cluster-asset">{cluster.equipment_tag}</span>
        )}
        <span className="cluster-score">
          <span className="eyebrow">{SCORE}</span>
          <span className="val">{cluster.score.toFixed(SCORE_DIGITS)}</span>
          <span className="badge" data-tone={cluster.incomplete_uncovered > 0 ? "defect" : "neutral"}>
            {cluster.incomplete_uncovered} {INCOMPLETE}
          </span>
        </span>
      </div>
      <div className="cluster-body">
        <table className="factors">
          <thead>
            <tr>
              <th scope="col">{FACTOR}</th>
              <th scope="col" className="num">
                {VALUE}
              </th>
              <th scope="col" className="num">
                {MAX}
              </th>
              <th scope="col" className="num">
                {COEFFICIENT} <span className="tag" data-tone="caveat">{c.basis}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="num">{r.value}</td>
                <td className="num">{r.max}</td>
                <td className="num">{r.coefficient}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0 text-[12px] text-ink-500">
          {c.basis === ASSUMPTION_LABEL ? `The coefficients are an ${ASSUMPTION_LABEL.toLowerCase()}, not a measured weight.` : c.basis}
        </p>
        <div>
          <p className="eyebrow mb-1">{UNCOVERED}</p>
          <ul className="wolist">
            {workOrders.map((wo) => (
              <li key={wo.wo_number}>
                {wo.href ? (
                  <Link href={wo.href} className="mono draw">
                    {wo.wo_number}
                  </Link>
                ) : (
                  <span className="mono">{wo.wo_number}</span>
                )}
                {wo.matched_lesson ? (
                  <span className="text-ink-700">
                    {MATCHED} <span className="tag">{wo.matched_field}</span> <span className="mono">{wo.matched_lesson}</span>
                  </span>
                ) : (
                  <span className="text-ink-500">{NO_MATCH}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        {requestAction ?? (requestHref ? <div>{<RequestLessonAction href={requestHref} />}</div> : null)}
      </div>
    </GlassPanel>
  );
}
