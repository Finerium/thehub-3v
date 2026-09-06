// Blueprint 6.4 AbstentionCard: the reason, the escalation role, the three nearest documents as chips, the cluster
// link with the request-a-lesson action where a cluster exists, and the served-beside typed facts (the typed
// ladder beside a live-reading abstention). Typed by Abstention (9.8); the hrefs come from the surface.
import Link from "next/link";
import type { ReactNode } from "react";
import type { Abstention, Citation } from "@/contracts/generated/evidence_packet";
import { CitationChip } from "./CitationChip";
import { cx } from "./cx";
import { GlassPanel } from "./GlassPanel";
import { RequestLessonAction } from "./RequestLessonAction";
import { TypedFactGrid } from "./TypedFactCard";
import "./system.css";

export type AbstentionCardProps = {
  abstention: Abstention;
  /** The cluster page; rendered when the abstention names a cluster. */
  clusterHref?: string;
  /** The request-a-lesson link; rendered when the abstention names a cluster. */
  requestHref?: string;
  /** Replaces the request link (a form, for a surface that posts). */
  requestAction?: ReactNode;
  drawerFor?: (citation: Citation) => ReactNode;
  className?: string;
};

const TITLE = "The corpus cannot answer this";
const ESCALATE = "Escalate to";
const NEAREST = "Nearest documents";
const CLUSTER = "Knowledge-debt cluster";
const SERVED_BESIDE = "Served beside the abstention";

export function AbstentionCard({ abstention, clusterHref, requestHref, requestAction, drawerFor, className }: AbstentionCardProps) {
  const cluster = abstention.cluster;
  return (
    <GlassPanel as="article" className={cx("outcome", className)} data-component="abstention-card" aria-label="Abstention">
      <div className="outcome-head">
          <h3>{TITLE}</h3>
          <span className="tag" data-tone="accent">
            abstention
          </span>
        </div>
        <p className="outcome-reason">{abstention.reason}</p>
        <p className="outcome-row text-[13px]">
          <span className="eyebrow">{ESCALATE}</span>
          <span className="badge" data-tone="accent">
            {abstention.escalation_role}
          </span>
        </p>
        {abstention.nearest_documents.length > 0 ? (
          <div>
            <p className="eyebrow mb-2">{NEAREST}</p>
            <div className="outcome-chips">
              {abstention.nearest_documents.map((c) => (
                <CitationChip key={`${c.document_id}:${c.span_id}`} citation={c}>
                  {drawerFor?.(c)}
                </CitationChip>
              ))}
            </div>
          </div>
        ) : null}
        {cluster ? (
          <div className="outcome-row">
            <span className="eyebrow">{CLUSTER}</span>
            {clusterHref ? (
              <Link href={clusterHref} className="draw mono text-[12.5px]">
                {cluster.id}
              </Link>
            ) : (
              <span className="mono text-[12.5px]">{cluster.id}</span>
            )}
            {requestAction ?? (requestHref ? <RequestLessonAction href={requestHref} /> : null)}
          </div>
        ) : null}
        {abstention.served_beside.length > 0 ? (
          <div>
            <p className="eyebrow mb-2">{SERVED_BESIDE}</p>
            <TypedFactGrid facts={abstention.served_beside} drawerFor={drawerFor ? (f) => drawerFor(f.source) : undefined} />
          </div>
        ) : null}
    </GlassPanel>
  );
}
