// Surface 8, one draft (blueprint 6.2 surface 8, 6.3, 7.2 tactile-transactional, 9.6, 9.9; ARCHITECTURE 8.2, 8.4,
// 8.5, 8.6; AC-LOOP-04, AC-LOOP-05, AC-LOOP-08, AC-LOOP-11). The static half of the review sheet: the header of the
// lesson the drafter reserved, and the evidence panel it was given, which is the same envelope AG-3 received
// (src/loop/evidence.ts) rather than a second reading of it: the cluster and its uncovered work orders with the
// three narrative fields the coverage recipe scores, and the typed sources by kind with the identifiers the
// redliner was shown.
//
// The live half is DraftClient: the body, the slots, the redline rounds, the rail and the decisions. The split is
// the one the loop makes: what the drafter was handed cannot change, and everything a person or the machine lane
// can move is polled.
//
// Two designed states are decided here, before anything is read: an Admin holds no `view_drafts` column (9.9) and
// gets the 403 with its audit event, and a draft outside this browser's sandbox (D-16) is not distinguishable from
// one that does not exist, which is the point, so both are the same designed 404.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { CSSProperties } from "react";
import { recordRoleViolation } from "@/auth/authorize";
import { can } from "@/auth/matrix";
import { getSandbox } from "@/auth/sandbox";
import { requireSession } from "@/auth/session";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { GlassPanel } from "@/components/GlassPanel";
import { stampOf } from "@/components/StateRail";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import { readDraftEvidence, readDraftView, STATE_MEANING } from "@/db/queries/drafts-view";
import { log } from "@/lib/log";
import { DraftClient } from "./DraftClient";
import "@/components/drafts.css";

export const dynamic = "force-dynamic";

const ROUTE = "/drafts/:id";
const DIGEST_PREFIX = 8;
/** 9.13: `prompt_version` is the SHA-256 of the prompt file; it renders as a digest, like every other pin. */
const PROMPT_PREFIX = 12;
const SCORE_DIGITS = 4;
/** How many evidence identifiers of one kind stand outside the disclosure before the rest are folded into it. */
const REFS_SHOWN = 6;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Draft ${id.slice(0, 8)}` };
}

export default async function DraftPage({ params }: Props) {
  const [user, { id }, jar] = await Promise.all([requireSession(), params, cookies()]);

  if (!can(user.role, "view_drafts")) {
    await recordRoleViolation(user, "view_drafts", ROUTE);
    return (
      <DesignedState
        code="403"
        tone="defect"
        title="The Admin role does not read drafts"
        explanation="The permission matrix gives the Admin account version activation and nothing on a draft: no view, no drafting, no review and no publication (INV-3). The refusal is recorded as an auth.role_violation event under this request id."
        reason="permission view_drafts, role Admin"
        next={{ href: "/admin", label: "Admin" }}
      />
    );
  }

  const box = await getSandbox(jar);
  let view;
  try {
    view = await readDraftView(id, box);
  } catch (error) {
    log.error({
      event: "drafts.detail_read_failed",
      route: ROUTE,
      message: error instanceof Error ? error.message : String(error),
    });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The review sheet reads the draft, its elements, its redline rounds, its history and its notes at request time. The read failed, so nothing is shown in their place."
        next={{ href: "/drafts", label: "Back to the queue" }}
      />
    );
  }

  if (!view) {
    return (
      <DesignedState
        code="404"
        tone="neutral"
        title="No draft at this address in this browser"
        explanation="Drafts are scoped to the browser that requested them: this sheet shows the seeded drafts every visitor sees and the drafts this browser created, and nothing else. An id from another browser reads the same as an id that was never written, which is what keeps one visitor's work out of another's."
        reason={`draft ${id}`}
        next={{ href: "/drafts", label: "Back to the queue" }}
      />
    );
  }

  const { draft, version } = view;
  const evidence = await readDraftEvidence(draft.cluster_id).catch((error: unknown) => {
    log.error({
      event: "drafts.evidence_read_failed",
      route: ROUTE,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  // 6.3: the machine-drafted label carries the alias of the human who approved the publication, which is the actor
  // of the accepted -> published transition and of no other row.
  const approver = view.transitions.find((t) => t.to_state === "published")?.actor_alias ?? undefined;

  return (
    <div className="flex flex-col gap-7">
      <header className="rise" style={stagger(0)}>
        <p className="text-[12.5px] text-ink-500">
          <Link href="/drafts" className="draw">
            Drafts
          </Link>
          <span aria-hidden> / </span>
          <span className="mono">{draft.opl_id_reserved}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <h1 className="max-w-[34ch] text-[30px]">{draft.title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge kind="machine_drafted" approverAlias={approver} />
            {version ? (
              <VersionBadge
                label={version.label}
                digestPrefix={version.corpus_sha256.slice(0, DIGEST_PREFIX)}
                active={version.is_active}
              />
            ) : null}
          </div>
        </div>
        <p className="mt-2 max-w-[78ch] text-[13px] text-ink-700">
          {STATE_MEANING[draft.state]}. The lesson id is reserved now and written into the corpus only when a Manager
          publishes; until then this draft is in the isolated draft schema, which no retrieval query reads.
        </p>

        <dl className="fields mt-4">
          <dt>Lesson id reserved</dt>
          <dd className="mono">{draft.opl_id_reserved}</dd>
          <dt>Asset</dt>
          <dd>
            <Link href={`/assets/${encodeURIComponent(draft.equipment_tag)}`} className="mono draw">
              {draft.equipment_tag}
            </Link>
          </dd>
          <dt>Cluster</dt>
          <dd>
            <Link href={`/coverage/clusters/${encodeURIComponent(draft.cluster_id)}`} className="mono draw">
              {draft.cluster_id}
            </Link>
          </dd>
          <dt>Classification</dt>
          <dd>{draft.classification}</dd>
          <dt>Aspect</dt>
          <dd>{draft.aspect}</dd>
          <dt>Requested by</dt>
          <dd className="mono">{draft.created_by_alias}</dd>
          <dt>Drafted by</dt>
          <dd className="mono">
            {draft.model_id} ·{" "}
            <span title={draft.prompt_version}>prompt {draft.prompt_version.slice(0, PROMPT_PREFIX)}</span>
          </dd>
          <dt>Lease</dt>
          <dd className="mono">
            {draft.lease_expires_at === null ? "no lease" : stampOf(draft.lease_expires_at)}
            {view.leaseRanOut ? (
              <span className="tag ml-2" data-tone="defect">
                ran out
              </span>
            ) : null}
          </dd>
          {draft.previous_draft_id === null ? null : (
            <>
              <dt>Re-proposed from</dt>
              <dd>
                <Link href={`/drafts/${encodeURIComponent(draft.previous_draft_id)}`} className="mono draw">
                  {draft.previous_draft_id}
                </Link>
              </dd>
            </>
          )}
          <dt>Scope</dt>
          <dd>{draft.session_scope === null ? "seeded; visible to every visitor" : "this browser's sandbox"}</dd>
        </dl>
      </header>

      <GlassPanel className="rise p-6" aria-labelledby="evidence-heading">
        <div style={stagger(1)}>
        <div className="blockhead">
          <h2 id="evidence-heading" className="text-[20px]">
            The evidence the drafter received
          </h2>
          {evidence ? (
            <span className="text-[12px] text-ink-500">
              rank {evidence.cluster.rank}, debt score {evidence.cluster.score.toFixed(SCORE_DIGITS)},{" "}
              {evidence.cluster.incomplete_uncovered} incomplete closeout
              {evidence.cluster.incomplete_uncovered === 1 ? "" : "s"} beside the score
            </span>
          ) : null}
        </div>

        {evidence === null ? (
          <EmptyState
            className="mt-4"
            title="The cluster behind this draft is not readable"
            explanation="The draft names a knowledge-debt cluster that the current read could not resolve, so the envelope it was given cannot be shown. The draft itself is unaffected."
            action={{ href: "/coverage", label: "Coverage Console" }}
          />
        ) : (
          <>
            <p className="mt-1 max-w-prose text-[12.5px] text-ink-500">
              This is the envelope AG-3 was handed for {evidence.cluster.equipment_tag}: the uncovered records of the
              cluster and the asset&apos;s typed sources.
              {evidence.lessonBodiesShed
                ? " The approved lessons travel as their headers and permit lines alone here: their section bodies are over the envelope's byte budget and are the one part of the evidence a drafter may not reproduce."
                : ""}
            </p>

            <h3 className="mt-5 text-[15px]">
              Uncovered work orders{" "}
              <span className="text-[12px] font-normal text-ink-500">
                {evidence.workOrders.length} of {evidence.cluster.uncovered_wo_numbers.length} carried in the envelope
              </span>
            </h3>
            {evidence.workOrders.length === 0 ? (
              <EmptyState
                className="mt-3"
                title="The cluster carries no uncovered record"
                explanation="Every record of this asset in the population is covered on this version; the cluster's score rests on the criticality and family-share factors alone."
                action={{ href: `/coverage/clusters/${encodeURIComponent(draft.cluster_id)}`, label: "The cluster" }}
              />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="reg">
                  <thead>
                    <tr>
                      <th scope="col">Work order</th>
                      <th scope="col">Reported</th>
                      <th scope="col">Type</th>
                      <th scope="col">Problem described</th>
                      <th scope="col">Root cause recorded</th>
                      <th scope="col">Corrective action recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.workOrders.map((wo) => (
                      <tr key={wo.wo_number}>
                        <td className="mono whitespace-nowrap text-ink-900">
                          <Link href={`/failures/${encodeURIComponent(wo.equipment_tag)}`} className="draw">
                            {wo.wo_number}
                          </Link>
                        </td>
                        <td className="mono whitespace-nowrap">{wo.report_date}</td>
                        <td className="whitespace-nowrap">
                          {wo.work_type}
                          {wo.breakdown_kind === "none" ? null : (
                            <>
                              {" "}
                              <span className="tag">{wo.breakdown_kind}</span>
                            </>
                          )}
                        </td>
                        <td className="max-w-[30ch]">{wo.problem_description}</td>
                        <td className="max-w-[30ch]">{wo.root_cause}</td>
                        <td className="max-w-[30ch]">{wo.corrective_action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="mt-6 text-[15px]">Typed sources</h3>
            <p className="mt-1 text-[12.5px] text-ink-500">
              The identifiers every element&apos;s provenance points at, and the only identifiers the redliner was
              shown of the evidence.
            </p>
            <div className="mt-3 flex flex-col gap-3">
              {evidence.groups.map((group) => (
                <div key={group.kind}>
                  <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                    <span className="mono text-ink-900">{group.kind}</span>
                    <span className="text-ink-500">
                      {group.refs.length} {group.refs.length === 1 ? "item" : "items"}
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {group.refs.slice(0, REFS_SHOWN).map((ref) => (
                      <span key={ref} className="tag">
                        {ref}
                      </span>
                    ))}
                  </p>
                  {group.refs.length > REFS_SHOWN ? (
                    <details className="disclose mt-1">
                      <summary>the remaining {group.refs.length - REFS_SHOWN}</summary>
                      <div className="disclose-body flex flex-wrap gap-1.5">
                        {group.refs.slice(REFS_SHOWN).map((ref) => (
                          <span key={ref} className="tag">
                            {ref}
                          </span>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
        </div>
      </GlassPanel>

      <div className="rise" style={stagger(2)}>
        <DraftClient
          role={user.role}
          initial={{
            draft,
            fields: view.fields,
            verdicts: view.verdicts,
            transitions: view.transitions,
          }}
          notes={view.notes}
          rows={view.rows.map((row) => ({
            n: row.n,
            problem: row.problem,
            cause: row.cause,
            action: row.action,
            quotedWoNumber: row.quotedWoNumber,
          }))}
          publishedDocumentId={view.publishedDocumentId}
        />
      </div>
    </div>
  );
}
