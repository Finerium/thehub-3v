// Surface 8, the review queue (blueprint 6.2 surface 8 "the review queue by state", 6.3, 7.2 tactile-transactional,
// 9.6, 9.9; ARCHITECTURE 8.5; AC-LOOP-08, AC-LOOP-13, AC-LOOP-15). Every draft this browser may see, in the state
// order of 9.6: what waits on a person above what the machine still holds, and the finished work last. A row carries
// the lesson id the draft reserved, its asset, its cluster, its state and the moment its lease runs out, which is
// the fact ADR-004 turns into a blocked draft.
//
// The scope is the visitor's browser sandbox (D-16): `session_scope IS NULL OR session_scope = this browser's
// sandbox`, applied once in src/db/queries/drafts-view.ts. A draft another visitor requested is not on this sheet
// and cannot be reached by typing its id, which is what keeps one demo out of another's numbers. The Admin holds no
// `view_drafts` column (9.9), so this surface answers an Admin with the designed 403 and the audit event that goes
// with it, never with a queue.
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
import { FilterBar } from "@/components/FilterBar";
import { GlassPanel } from "@/components/GlassPanel";
import { stampOf } from "@/components/StateRail";
import type { DraftState } from "@/contracts/generated/drafts";
import { QUEUE_STATES, STATE_MEANING, readQueue, type QueueRow } from "@/db/queries/drafts-view";
import { log } from "@/lib/log";
import "@/components/drafts.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Drafts" };

const ROUTE = "/drafts";

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

/** 9.6: the tone each state carries; the word beside it is always the second cue (7.1). */
const STATE_TONE: Readonly<Record<DraftState, "neutral" | "accent" | "caveat" | "defect" | "verified">> = {
  proposed: "neutral",
  drafted: "neutral",
  redlined: "caveat",
  in_review: "accent",
  accepted: "accent",
  published: "verified",
  blocked: "defect",
  rejected: "defect",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function Row({ row }: { row: QueueRow }) {
  const { draft } = row;
  return (
    <tr>
      <td className="mono whitespace-nowrap text-ink-900">
        <Link href={`/drafts/${encodeURIComponent(draft.id)}`} className="draw">
          {draft.opl_id_reserved}
        </Link>
      </td>
      <td className="max-w-[34ch]">{draft.title}</td>
      <td className="mono whitespace-nowrap">
        <Link href={`/assets/${encodeURIComponent(draft.equipment_tag)}`} className="draw">
          {draft.equipment_tag}
        </Link>
      </td>
      <td className="mono whitespace-nowrap">
        <Link href={`/coverage/clusters/${encodeURIComponent(draft.cluster_id)}`} className="draw">
          {draft.cluster_id}
        </Link>
      </td>
      <td className="whitespace-nowrap">
        <span className="badge" data-tone={STATE_TONE[draft.state]}>
          {draft.state}
        </span>
      </td>
      <td className="mono whitespace-nowrap text-[12px]">
        {draft.lease_expires_at === null ? (
          <span className="text-ink-500">no lease</span>
        ) : (
          <>
            {stampOf(draft.lease_expires_at)}
            {row.leaseRanOut ? (
              <span className="tag ml-2" data-tone="defect">
                ran out
              </span>
            ) : null}
          </>
        )}
      </td>
      <td className="mono whitespace-nowrap">{draft.created_by_alias}</td>
      <td className="whitespace-nowrap text-[12px]">
        {row.own ? <span className="tag" data-tone="accent">this browser</span> : <span className="tag">seeded</span>}
      </td>
    </tr>
  );
}

export default async function DraftsPage({ searchParams }: Props) {
  const [user, params, jar] = await Promise.all([requireSession(), searchParams, cookies()]);

  // 9.9: the Admin holds no view_drafts column. The refusal is the designed 403 with its audit event, not a queue.
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
    view = await readQueue(box);
  } catch (error) {
    log.error({
      event: "drafts.queue_read_failed",
      route: ROUTE,
      message: error instanceof Error ? error.message : String(error),
    });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The queue reads the drafts of this browser's sandbox at request time. The read failed, so nothing is shown in their place."
        next={{ href: "/coverage", label: "Coverage Console" }}
      />
    );
  }

  const stateFilter = one(params.state);
  const clusterFilter = one(params.cluster);
  const rows = view.rows.filter(
    (r) =>
      (stateFilter === "" || r.draft.state === stateFilter) &&
      (clusterFilter === "" || r.draft.cluster_id === clusterFilter),
  );
  const filtered = stateFilter !== "" || clusterFilter !== "";

  return (
    <div className="flex flex-col gap-7">
      <header className="rise" style={stagger(0)}>
        <h1 className="text-[34px]">Drafts</h1>
        <p className="mt-1 max-w-[74ch] text-[13.5px] text-ink-700">
          The review queue of the self-healing loop. A lesson is drafted by the machine against one knowledge-debt
          cluster, redlined by an adversarial pass that never edits it, reviewed by the Reviewing Supervisor and
          published by the Manager alone. Every element on a draft carries the evidence item that states it, and the
          slot the drafter could not fill carries the fixed literal until an engineer records a note against it.
        </p>
        <p className="mt-2 max-w-[74ch] text-[12.5px] text-ink-500">
          Drafts live in this browser&apos;s sandbox: {view.ownCount} requested here, {view.seededCount} seeded and
          visible to everyone. A draft requested in another browser is not on this sheet and cannot be opened from it.
        </p>
      </header>

      <nav className="stateboard rise" style={stagger(1)} aria-label="Draft states">
        {QUEUE_STATES.map((state) => {
          const n = view.counts[state];
          const current = stateFilter === state;
          const href = current ? ROUTE : `${ROUTE}?state=${state}`;
          return (
            <Link key={state} href={href} aria-current={current ? "true" : undefined} data-zero={n === 0 ? "" : undefined} title={STATE_MEANING[state]}>
              <span className="n">{n}</span>
              <span>{state}</span>
            </Link>
          );
        })}
      </nav>

      <GlassPanel className="rise p-6" aria-labelledby="queue-heading">
        <div style={stagger(2)}>
          <div className="blockhead">
            <h2 id="queue-heading" className="text-[20px]">
              Queue
            </h2>
            <span className="text-[12px] text-ink-500">
              {rows.length} of {view.rows.length} {view.rows.length === 1 ? "draft" : "drafts"}
              {filtered ? ", filtered" : ", in the state order of 9.6"}
            </span>
          </div>

          <FilterBar
            className="mt-4"
            aria-label="Queue filters"
            action={ROUTE}
            resetHref={filtered ? ROUTE : undefined}
            fields={[
              {
                kind: "select",
                name: "state",
                label: "State",
                value: stateFilter,
                allLabel: "every state",
                options: QUEUE_STATES.map((s) => ({ value: s, label: s })),
              },
              { kind: "text", name: "cluster", label: "Cluster", value: clusterFilter, placeholder: "DEBT-" },
            ]}
          />

          {rows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="reg">
                <thead>
                  <tr>
                    <th scope="col">Lesson id reserved</th>
                    <th scope="col">Title</th>
                    <th scope="col">Asset</th>
                    <th scope="col">Cluster</th>
                    <th scope="col">State</th>
                    <th scope="col">Lease runs out</th>
                    <th scope="col">Requested by</th>
                    <th scope="col">Scope</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Row key={row.draft.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              title={filtered ? "No draft matches this filter" : "No draft in this browser's sandbox"}
              explanation={
                filtered
                  ? "The queue holds drafts in other states, or for other clusters. Clear the filter to see them."
                  : `A draft is requested from a knowledge-debt cluster on the Coverage Console, by a role holding the create_draft column of the matrix (the Reviewing Supervisor). ${can(user.role, "create_draft") ? "This role holds it." : `The ${user.role} role does not hold it.`}`
              }
              action={filtered ? { href: ROUTE, label: "Clear the filter" } : { href: "/coverage", label: "Coverage Console" }}
            />
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
